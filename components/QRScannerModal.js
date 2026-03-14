/**
 * QRScannerModal.js
 * Reusable QR scanner modal — react-native-vision-camera v4
 *
 * Used by:
 *   MinerScreen  — import mining address from Qt wallet QR
 *   WalletScreen — scan recipient address when sending CAPS
 *
 * Props:
 *   visible  {bool}     show/hide the modal
 *   onScan   {fn}       called with the parsed address string
 *   onClose  {fn}       called when user dismisses
 *   title    {string}   header text
 *   hint     {string}   footer instruction text
 */

import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PermissionsAndroid,
  Platform,
  Alert,
} from 'react-native';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';

// ── Theme ─────────────────────────────────────────────────────────────────────
const C = {
  bg:        '#0a0f0a',
  panel:     '#0d1a0d',
  border:    '#1a3a1a',
  green:     '#00ff41',
  greenDim:  '#00aa2a',
  amber:     '#ffb000',
  textMuted: '#4a7a4a',
  danger:    '#ff4444',
  overlay:   'rgba(0,0,0,0.92)',
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function QRScannerModal({ visible, onScan, onClose, title, hint }) {
  const [hasPermission, setHasPermission] = useState(false);
  const [scanned, setScanned] = useState(false);

  // v4 API — single device hook
  const device = useCameraDevice('back');

  // v4 built-in code scanner — no plugin, no frame processors, no worklets
  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      if (scanned || !codes || codes.length === 0) return;
      const raw = codes[0]?.value;
      if (!raw) return;
      setScanned(true);
      const address = parseAddress(raw);
      if (address) {
        onScan(address);
      } else {
        Alert.alert(
          'INVALID QR CODE',
          'Scanned value did not match a CapStash address format:\n\n' + raw,
          [{ text: 'RETRY', onPress: () => setScanned(false) }]
        );
      }
    },
  });

  // ── Permission + reset on open ────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      setScanned(false);
      requestCameraPermission();
    }
  }, [visible]);

  const requestCameraPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'N.U.K.A Camera Access',
            message: 'CapStash Wallet needs camera access to scan QR codes.',
            buttonPositive: 'ALLOW',
            buttonNegative: 'DENY',
          }
        );
        const ok = granted === PermissionsAndroid.RESULTS.GRANTED;
        setHasPermission(ok);
        if (!ok) {
          Alert.alert(
            'PERMISSION DENIED',
            'Camera access is required. Enable it in:\nAndroid Settings > Apps > CapStash > Permissions',
            [{ text: 'OK', onPress: onClose }]
          );
        }
      } catch (err) {
        console.warn('[QRScanner] Permission error:', err);
        setHasPermission(false);
      }
    } else {
      const status = await Camera.requestCameraPermission();
      setHasPermission(status === 'granted');
    }
  };

  // ── Address parser — strips URI schemes + worker suffixes ────────────────
  // Handles all these Qt wallet QR formats:
  //   cap1qxxx...                            plain address
  //   cap:cap1qxxx...                        URI scheme
  //   cap:cap1qxxx...?amount=0&label=foo     URI with params
  //   cap1qxxx....worker1                    mining worker suffix
  //   cap:cap1qxxx....worker1?amount=0       URI + worker + params
  const parseAddress = (raw) => {
    if (!raw) return null;
    let value = raw.trim();

    // Log raw scan value for debugging — remove once confirmed working
    console.log('[QRScanner] Raw scan value:', value);

    // Strip URI scheme — handles: CapStash:  cap:  bitcoin:  crypto:
    const uriMatch = value.match(/^(?:CapStash|cap|bitcoin|crypto):([^?&#]+)/i);
    if (uriMatch) value = uriMatch[1];

    // Strip query params that survived (e.g. if no URI scheme but has ?)
    const paramIdx = value.indexOf('?');
    if (paramIdx !== -1) value = value.slice(0, paramIdx);

    // Strip worker suffix:  address.workername  →  address
    const workerIdx = value.indexOf('.');
    if (workerIdx !== -1) value = value.slice(0, workerIdx);

    // Normalize to lowercase — Qt wallet encodes bech32 in uppercase
    value = value.trim().toLowerCase();
    console.log('[QRScanner] Parsed address:', value);

    const isLegacy = /^c[a-km-za-hj-np-z1-9]{25,34}$/.test(value);
    const isBech32 = /^cap1[a-z0-9]{6,90}$/.test(value);

    if (!isLegacy && !isBech32) {
      console.warn('[QRScanner] Address failed validation:', value);
    }

    return isLegacy || isBech32 ? value : null;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.titleText}>{title || 'SCAN QR CODE'}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕ CLOSE</Text>
          </TouchableOpacity>
        </View>

        {/* Camera viewport */}
        <View style={styles.cameraWrapper}>
          {!hasPermission ? (
            <View style={styles.centeredBox}>
              <Text style={styles.warnText}>⚠ CAMERA ACCESS DENIED</Text>
              <Text style={styles.subText}>
                Enable camera permission in Android Settings.
              </Text>
              <TouchableOpacity style={styles.retryBtn} onPress={requestCameraPermission}>
                <Text style={styles.retryBtnText}>REQUEST AGAIN</Text>
              </TouchableOpacity>
            </View>
          ) : !device ? (
            <View style={styles.centeredBox}>
              <Text style={styles.warnText}>INITIALIZING SCANNER...</Text>
            </View>
          ) : (
            <Camera
              style={styles.camera}
              device={device}
              isActive={visible && !scanned}
              codeScanner={codeScanner}
            />
          )}

          {/* Wasteland viewfinder overlay */}
          {hasPermission && device && (
            <View style={styles.bracketOverlay} pointerEvents="none">
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              <View style={styles.crosshairH} />
              <View style={styles.crosshairV} />
            </View>
          )}
        </View>

        {/* Footer hint */}
        <View style={styles.footer}>
          <Text style={styles.hintText}>
            {scanned
              ? '✓ ADDRESS ACQUIRED — PROCESSING...'
              : (hint || 'ALIGN QR CODE WITHIN THE BRACKETS')}
          </Text>
        </View>

      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: C.overlay,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.panel,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  titleText: {
    color: C.green,
    fontFamily: 'VT323-Regular',
    fontSize: 20,
    letterSpacing: 2,
  },
  closeBtn: { padding: 4 },
  closeBtnText: {
    color: C.danger,
    fontFamily: 'ShareTechMono-Regular',
    fontSize: 12,
  },
  cameraWrapper: {
    width: '100%',
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  camera: { flex: 1 },
  centeredBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  warnText: {
    color: C.amber,
    fontFamily: 'VT323-Regular',
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 8,
  },
  subText: {
    color: C.textMuted,
    fontFamily: 'ShareTechMono-Regular',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    borderWidth: 1,
    borderColor: C.green,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryBtnText: {
    color: C.green,
    fontFamily: 'ShareTechMono-Regular',
    fontSize: 12,
  },
  // Viewfinder
  bracketOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: C.green,
    opacity: 0.8,
  },
  cornerTL: { top: '20%', left: '15%', borderTopWidth: 2, borderLeftWidth: 2 },
  cornerTR: { top: '20%', right: '15%', borderTopWidth: 2, borderRightWidth: 2 },
  cornerBL: { bottom: '20%', left: '15%', borderBottomWidth: 2, borderLeftWidth: 2 },
  cornerBR: { bottom: '20%', right: '15%', borderBottomWidth: 2, borderRightWidth: 2 },
  crosshairH: {
    position: 'absolute',
    width: '50%',
    height: 1,
    backgroundColor: C.greenDim,
    opacity: 0.3,
  },
  crosshairV: {
    position: 'absolute',
    height: '50%',
    width: 1,
    backgroundColor: C.greenDim,
    opacity: 0.3,
  },
  footer: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.panel,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 8,
    alignItems: 'center',
  },
  hintText: {
    color: C.textMuted,
    fontFamily: 'ShareTechMono-Regular',
    fontSize: 11,
    textAlign: 'center',
    letterSpacing: 1,
  },
});