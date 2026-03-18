// screens/WalletScreen.js
// W.O.W. — Wallet tab: balance, identity, send/receive, transactions

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, StyleSheet, Modal, Clipboard,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
// TODO: uncomment after: npm install react-native-qrcode-svg
// import QRCode from 'react-native-qrcode-svg';
import TierName  from '../components/TierName';
import { getBalances, listTransactions, getWalletAddresses } from '../services/rpc';
import Colors    from '../theme/colors';
import { Typography } from '../theme/typography';

const TX_INITIAL = 5;   // transactions shown by default
const TX_FULL    = 20;  // transactions shown when expanded

export default function WalletScreen({ nodeConfig }) {
  const [balance,    setBalance]    = useState(null);
  const [txs,        setTxs]        = useState([]);
  const [myAddress,  setMyAddress]  = useState(null);
  const [allAddresses, setAllAddresses] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllTx,  setShowAllTx]  = useState(false);
  const [balanceHidden, setBalanceHidden] = useState(false);

  // ── Receive modal ──────────────────────────────────────────
  const [showReceive, setShowReceive] = useState(false);
  const [copied,      setCopied]      = useState(false);

  // ── Scan modal ─────────────────────────────────────────────
  const [showScan,   setShowScan]   = useState(false);
  const [scannedAddr, setScannedAddr] = useState('');
  const scanned = useRef(false);
  const device  = useCameraDevice('back');

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      if (scanned.current || !codes.length) return;
      const raw = codes[0].value || '';
      if (!raw) return;
      scanned.current = true;
      const clean = raw.replace(/^[a-zA-Z]+:/i, '').split('?')[0].trim();
      setScannedAddr(clean);
      setShowScan(false);
    },
  });

  // ── Load ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const bal = await getBalances(nodeConfig);
      setBalance(bal?.mine?.trusted ?? 0);

      const transactions = await listTransactions(nodeConfig, TX_FULL);
      setTxs(transactions || []);

      const addresses = await getWalletAddresses(nodeConfig);
      console.log('ADDRESSES:', JSON.stringify(addresses));
      if (addresses && addresses.length > 0) {
        setMyAddress(addresses[0].address);
        setAllAddresses(addresses);
      }
    } catch (e) {
      console.warn('WalletScreen load error:', e);
    }
  }, [nodeConfig]);

  useEffect(() => { load(); }, [load]);

  // Clear scanned address when scan modal opens
  useEffect(() => {
    if (showScan) {
      scanned.current = false;
      setScannedAddr('');
    }
  }, [showScan]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleCopy = () => {
    if (!myAddress) return;
    Clipboard.setString(myAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Formatters ─────────────────────────────────────────────
  const formatTime = (timestamp) => {
    const diff = Math.floor(Date.now() / 1000 - timestamp);
    if (diff < 60)    return `${diff}S AGO`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}M AGO`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}H AGO`;
    return `${Math.floor(diff / 86400)}D AGO`;
  };

  const displayedTxs = showAllTx ? txs : txs.slice(0, TX_INITIAL);

  return (
    <>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.green} />
        }
      >
        {/* ── Balance card ── */}
        <View style={styles.balanceCard}>

          <View style={styles.balanceLabelRow}>
            <Text style={styles.balanceLabel}>WASTELAND ERA BALANCE</Text>
            <TouchableOpacity onPress={() => setBalanceHidden(h => !h)}>
              <Text style={styles.hideBtn}>{balanceHidden ? 'SHOW' : 'HIDE'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.balanceAmount}>
            {balanceHidden
              ? '●●●.●●●●●●●'
              : (balance !== null ? balance.toFixed(7) : '-.-------')}
          </Text>
          <Text style={styles.balanceCurrency}>CAPS</Text>

          {/* Identity — centered with nuclear icons each side */}
          {myAddress ? (
            <View style={styles.identityRow}>
              <Text style={styles.verifiedIcon}>☢ </Text>
              <TierName address={myAddress} size="large" showVerified={false} />
              <Text style={styles.verifiedIcon}> ☢</Text>
            </View>
          ) : (
            <View style={styles.identityRow}>
              <Text style={styles.verifiedIcon}>☢ </Text>
              <Text style={styles.addressLoading}>RESOLVING IDENTITY...</Text>
              <Text style={styles.verifiedIcon}> ☢</Text>
            </View>
          )}

          {/* Pre great war */}
          <Text style={styles.preWarText}>
            ~ pre "great war" value unknown
          </Text>

          {/* Actions */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, styles.primaryBtn]}>
              <Text style={styles.actionBtnTextPrimary}>▲ SEND</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => setShowReceive(true)}
            >
              <Text style={styles.actionBtnText}>▼ RECEIVE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => setShowScan(true)}
            >
              <Text style={styles.actionBtnText}>⊡ SCAN</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Scanned address result ── */}
        {scannedAddr ? (
          <View style={styles.scannedCard}>
            <Text style={styles.scannedLabel}>SCANNED ADDRESS</Text>
            <Text style={styles.scannedAddr} numberOfLines={2}>{scannedAddr}</Text>
            <TouchableOpacity
              style={styles.scannedClearBtn}
              onPress={() => setScannedAddr('')}
            >
              <Text style={styles.scannedClearText}>✕ CLEAR</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Transactions ── */}
        <Text style={styles.sectionHeader}>▸ RECENT TRANSACTIONS</Text>

        {txs.length === 0 && (
          <Text style={styles.emptyText}>NO TRANSACTIONS FOUND</Text>
        )}

        {displayedTxs.map((tx, i) => {
          const isReceived = tx.category === 'immature' || tx.category === 'receive';
          const isBlock    = tx.category === 'immature';
          return (
            <View
              key={tx.txid + i}
              style={[styles.txItem, isReceived ? styles.txReceived : styles.txSent]}
            >
              <View style={styles.txLeft}>
                <Text style={styles.txType}>
                  {isReceived ? '▼ ' : '▲ '}
                  {isBlock ? 'SCAVENGED' : isReceived ? 'RECEIVED' : 'SENT'}
                </Text>
                <Text style={styles.txTime}>
                  {formatTime(tx.time)} · CONF: {tx.confirmations}
                </Text>
                <Text style={styles.txId} numberOfLines={1}>
                  {tx.address
                    ? `${tx.address.slice(0, 6)}...${tx.address.slice(-6)}`
                    : `${tx.txid?.slice(0, 6)}...${tx.txid?.slice(-6)}`}
                </Text>
              </View>
              <Text style={[
                styles.txAmount,
                { color: isReceived ? Colors.green : Colors.red },
              ]}>
                {isReceived ? '+' : ''}{tx.amount?.toFixed(4)}
              </Text>
            </View>
          );
        })}

        {/* Show more / less toggle */}
        {txs.length > TX_INITIAL && (
          <TouchableOpacity
            style={styles.showMoreBtn}
            onPress={() => setShowAllTx(p => !p)}
          >
            <Text style={styles.showMoreText}>
              {showAllTx
                ? '▲ SHOW LESS'
                : `▼ SHOW MORE (${txs.length - TX_INITIAL} MORE)`}
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── Receive Modal ── */}
      <Modal
        visible={showReceive}
        animationType="slide"
        onRequestClose={() => setShowReceive(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>▼ RECEIVE CAPS</Text>
            <TouchableOpacity onPress={() => setShowReceive(false)}>
              <Text style={styles.modalClose}>✕ CLOSE</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.receiveHint}>
              SHARE THIS ADDRESS TO RECEIVE CAPS
            </Text>

            {/* QR Code placeholder */}
            <View style={styles.qrPlaceholder}>
              {/* TODO: replace View with QRCode after npm install react-native-qrcode-svg
              <QRCode
                value={myAddress || 'cap1'}
                size={220}
                color={Colors.green}
                backgroundColor={Colors.black}
              />
              */}
              <Text style={styles.qrComingSoon}>⬡</Text>
              <Text style={styles.qrComingSoonText}>QR CODE</Text>
              <Text style={styles.qrComingSoonSub}>
                npm install react-native-qrcode-svg
              </Text>
            </View>

            {/* Address display */}
            <View style={styles.addressBox}>
              <Text style={styles.addressBoxText} selectable>
                {myAddress || '—'}
              </Text>
            </View>

            {/* Copy button */}
            <TouchableOpacity
              style={[styles.copyBtn, copied && styles.copyBtnDone]}
              onPress={handleCopy}
            >
              <Text style={[styles.copyBtnText, copied && styles.copyBtnTextDone]}>
                {copied ? '✓ COPIED TO CLIPBOARD' : '⎘ COPY ADDRESS'}
              </Text>
            </TouchableOpacity>

            {/* All addresses */}
            {allAddresses.length > 1 && (
              <>
                <Text style={styles.allAddrHeader}>ALL ADDRESSES</Text>
                {allAddresses.map((a, i) => (
                  <TouchableOpacity
                    key={a.address}
                    style={styles.addrRow}
                    onPress={() => {
                      Clipboard.setString(a.address);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    <Text style={styles.addrRowLabel}>
                      {a.label || `ADDRESS ${i + 1}`}
                    </Text>
                    <Text style={styles.addrRowAddr} numberOfLines={1}>
                      {a.address?.slice(0, 18)}...
                    </Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Scan Modal ── */}
      <Modal
        visible={showScan}
        animationType="slide"
        onRequestClose={() => setShowScan(false)}
      >
        <View style={styles.scannerContainer}>
          <Text style={styles.scannerTitle}>⊡ SCAN ADDRESS</Text>
          <Text style={styles.scannerHint}>POINT CAMERA AT WALLET QR CODE</Text>

          {device ? (
            <Camera
              style={styles.camera}
              device={device}
              isActive={showScan}
              codeScanner={codeScanner}
            />
          ) : (
            <View style={styles.cameraPlaceholder}>
              <Text style={styles.cameraUnavail}>CAMERA UNAVAILABLE</Text>
            </View>
          )}

          <View style={styles.reticleOverlay} pointerEvents="none">
            <View style={styles.reticle} />
          </View>

          <TouchableOpacity
            style={styles.cancelScanBtn}
            onPress={() => setShowScan(false)}
          >
            <Text style={styles.cancelScanText}>[ CANCEL ]</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
    padding: 14,
  },

  // ── Balance card ──
  balanceCard: {
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDim,
    paddingBottom: 18,
    marginBottom: 16,
  },
  balanceLabelRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   4,
  },
  balanceLabel: {
    ...Typography.heading,
    color:         Colors.greenDim,
    letterSpacing: 2,
  },
  hideBtn: {
    ...Typography.micro,
    color:         Colors.greenDim,
    letterSpacing: 2,
    opacity:       0.6,
  },
  balanceAmount: {
    ...Typography.gigantic,
    color:            Colors.green,
    textShadowColor:  Colors.green,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
    lineHeight:       72,
  },
  balanceCurrency: {
    ...Typography.large,
    color:         Colors.green,
    letterSpacing: 6,
    marginBottom:  8,
    opacity:       0.9,
    fontSize:      28,
  },
  identityRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    marginTop:      6,
    marginBottom:   4,
  },
  verifiedIcon: {
    color:    Colors.greenDim,
    fontSize: 14,
  },
  addressLoading: {
    ...Typography.small,
    color:         Colors.greenDim,
    letterSpacing: 1,
  },
  preWarText: {
    ...Typography.small,
    color:         '#ffffff',
    letterSpacing: 1,
    marginTop:     12,
    fontStyle:     'italic',
    opacity:       0.6,
    textAlign:     'center',
  },

  // ── Actions ──
  actionRow: {
    flexDirection: 'row',
    gap:           8,
    marginTop:     16,
  },
  actionBtn: {
    flex:          1,
    paddingVertical: 12,
    borderWidth:   1,
    borderColor:   Colors.borderDim,
    alignItems:    'center',
    borderRadius:  2,
  },
  primaryBtn: {
    borderColor: Colors.green,
  },
  actionBtnText: {
    ...Typography.labelSmall,
    color:         Colors.green,
    letterSpacing: 2,
  },
  actionBtnTextPrimary: {
    ...Typography.labelSmall,
    color:         Colors.green,
    letterSpacing: 2,
  },

  // ── Scanned result ──
  scannedCard: {
    borderWidth:     1,
    borderColor:     Colors.amber,
    backgroundColor: Colors.surface,
    padding:         12,
    marginBottom:    14,
    borderRadius:    2,
  },
  scannedLabel: {
    ...Typography.micro,
    color:         Colors.amber,
    letterSpacing: 2,
    marginBottom:  6,
  },
  scannedAddr: {
    ...Typography.small,
    color:        Colors.green,
    fontFamily:   'ShareTechMono',
    lineHeight:   20,
  },
  scannedClearBtn: {
    marginTop:  8,
    alignSelf:  'flex-end',
  },
  scannedClearText: {
    ...Typography.micro,
    color:         Colors.red,
    letterSpacing: 1,
  },

  // ── Section header ──
  sectionHeader: {
    ...Typography.labelMedium,
    color:             Colors.greenDim,
    marginBottom:      10,
    paddingBottom:     5,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    letterSpacing:     2,
  },
  emptyText: {
    ...Typography.body,
    color:      Colors.greenDim,
    textAlign:  'center',
    marginTop:  24,
    letterSpacing: 1,
  },

  // ── Transactions ──
  txItem: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    padding:        12,
    borderWidth:    1,
    borderColor:    Colors.border,
    backgroundColor: Colors.surface,
    borderLeftWidth: 3,
    marginBottom:   6,
  },
  txReceived: { borderLeftColor: Colors.green },
  txSent:     { borderLeftColor: Colors.red },
  txLeft: {
    flex: 1,
    marginRight: 12,
  },
  txType: {
    ...Typography.small,
    color:         Colors.green,
    letterSpacing: 1,
    marginBottom:  3,
  },
  txTime: {
    ...Typography.tiny,
    color:         Colors.greenDim,
    marginBottom:  2,
  },
  txId: {
    ...Typography.micro,
    color:      Colors.greenDim,
    fontFamily: 'ShareTechMono',
    opacity:    0.7,
    letterSpacing: 0.5,
  },
  txAmount: {
    ...Typography.body,
    fontFamily: 'ShareTechMono',
  },

  // ── Show more ──
  showMoreBtn: {
    borderWidth:  1,
    borderColor:  Colors.border,
    paddingVertical: 12,
    alignItems:   'center',
    marginBottom: 8,
  },
  showMoreText: {
    ...Typography.labelSmall,
    color:         Colors.greenDim,
    letterSpacing: 2,
  },

  // ── Receive modal ──
  modalContainer: {
    flex:            1,
    backgroundColor: Colors.black,
  },
  modalHeader: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    padding:           16,
    paddingTop:        52,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDim,
    backgroundColor:   Colors.surfaceLight,
  },
  modalTitle: {
    ...Typography.heading,
    color:         Colors.green,
    letterSpacing: 3,
  },
  modalClose: {
    ...Typography.small,
    color:         Colors.greenDim,
    letterSpacing: 1,
  },
  modalContent: {
    padding:    20,
    alignItems: 'center',
  },
  receiveHint: {
    ...Typography.labelSmall,
    color:         Colors.greenDim,
    letterSpacing: 2,
    marginBottom:  24,
    textAlign:     'center',
  },
  qrPlaceholder: {
    width:           240,
    height:          240,
    borderWidth:     1,
    borderColor:     Colors.green,
    justifyContent:  'center',
    alignItems:      'center',
    marginBottom:    24,
    backgroundColor: Colors.surface,
  },
  qrComingSoon: {
    fontSize: 64,
    color:    Colors.green,
    opacity:  0.3,
  },
  qrComingSoonText: {
    ...Typography.labelSmall,
    color:         Colors.greenDim,
    letterSpacing: 3,
    marginTop:     8,
  },
  qrComingSoonSub: {
    ...Typography.micro,
    color:      Colors.greenDim,
    opacity:    0.5,
    marginTop:  4,
    fontFamily: 'ShareTechMono',
  },
  addressBox: {
    borderWidth:     1,
    borderColor:     Colors.green,
    backgroundColor: Colors.surface,
    padding:         14,
    marginBottom:    16,
    width:           '100%',
  },
  addressBoxText: {
    ...Typography.body,
    color:      Colors.green,
    fontFamily: 'ShareTechMono',
    textAlign:  'center',
    lineHeight: 22,
  },
  copyBtn: {
    borderWidth:     1,
    borderColor:     Colors.green,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginBottom:    24,
    width:           '100%',
    alignItems:      'center',
  },
  copyBtnDone: {
    backgroundColor: Colors.green,
  },
  copyBtnText: {
    ...Typography.labelSmall,
    color:         Colors.green,
    letterSpacing: 2,
  },
  copyBtnTextDone: {
    color: Colors.black,
  },
  allAddrHeader: {
    ...Typography.labelSmall,
    color:         Colors.greenDim,
    letterSpacing: 2,
    marginBottom:  8,
    alignSelf:     'flex-start',
  },
  addrRow: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     Colors.border,
    backgroundColor: Colors.surface,
    padding:         10,
    marginBottom:    4,
    width:           '100%',
  },
  addrRowLabel: {
    ...Typography.small,
    color:         Colors.greenDim,
    letterSpacing: 1,
  },
  addrRowAddr: {
    ...Typography.small,
    color:      Colors.green,
    fontFamily: 'ShareTechMono',
    flex:       1,
    textAlign:  'right',
    marginLeft: 8,
  },

  // ── Scan modal ──
  scannerContainer: {
    flex:            1,
    backgroundColor: Colors.black,
    alignItems:      'center',
    paddingTop:      60,
  },
  scannerTitle: {
    ...Typography.heading,
    color:         Colors.green,
    letterSpacing: 3,
    marginBottom:  6,
  },
  scannerHint: {
    ...Typography.labelSmall,
    color:         Colors.greenDim,
    letterSpacing: 1.5,
    marginBottom:  24,
  },
  camera: {
    width: '100%',
    flex:  1,
  },
  cameraPlaceholder: {
    width:           '100%',
    flex:            1,
    justifyContent:  'center',
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     Colors.green,
    opacity:         0.4,
  },
  cameraUnavail: {
    ...Typography.labelSmall,
    color:         Colors.greenDim,
    letterSpacing: 2,
  },
  reticleOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 80,
    justifyContent: 'center',
    alignItems:     'center',
  },
  reticle: {
    width:        220,
    height:       220,
    borderWidth:  2,
    borderColor:  Colors.green,
    borderRadius: 8,
    opacity:      0.8,
  },
  cancelScanBtn: {
    paddingVertical:   20,
    paddingHorizontal: 40,
  },
  cancelScanText: {
    ...Typography.labelSmall,
    color:         Colors.green,
    letterSpacing: 2,
  },
});