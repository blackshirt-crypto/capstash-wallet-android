// screens/MinerScreen.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Animated,
  Vibration,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EncryptedStorage from 'react-native-encrypted-storage';
import { getMiningInfo } from '../services/rpc';
import Colors from '../theme/colors';
import Typography from '../theme/typography';
import Spacing from '../theme/spacing';

console.log('=== MINER DIAG ===');
console.log('Colors:', typeof Colors, Colors);
console.log('Colors.green:', Colors?.green);
console.log('Typography:', typeof Typography, Typography);

// ── Storage Helpers ─────────────────────────────────────────
const RIGS_KEY = 'capstash_rigs';

async function loadRigs() {
  try {
    const json = await AsyncStorage.getItem(RIGS_KEY);
    if (!json) return [];
    return JSON.parse(json);
  } catch (e) {
    console.warn('loadRigs error:', e);
    return [];
  }
}

async function saveRigs(rigs) {
  try {
    await AsyncStorage.setItem(RIGS_KEY, JSON.stringify(rigs));
  } catch (e) {
    console.warn('saveRigs error:', e);
  }
}

async function loadCredentials() {
  try {
    const user = await EncryptedStorage.getItem('rpc_user');
    const pass = await EncryptedStorage.getItem('rpc_pass');
    if (user && pass) return { user, pass };
    return null;
  } catch (e) {
    console.warn('loadCredentials error:', e);
    return null;
  }
}

async function saveCredentials(user, pass) {
  try {
    await EncryptedStorage.setItem('rpc_user', user);
    await EncryptedStorage.setItem('rpc_pass', pass);
  } catch (e) {
    console.warn('saveCredentials error:', e);
  }
}

// ── Formatting Helpers ──────────────────────────────────────
function formatHashrate(hps) {
  if (!hps || hps === 0) return '0 H/s';
  if (hps >= 1e12) return (hps / 1e12).toFixed(2) + ' TH/s';
  if (hps >= 1e9)  return (hps / 1e9).toFixed(2)  + ' GH/s';
  if (hps >= 1e6)  return (hps / 1e6).toFixed(2)  + ' MH/s';
  if (hps >= 1e3)  return (hps / 1e3).toFixed(2)  + ' KH/s';
  return hps.toFixed(2) + ' H/s';
}

// ── Rig Card Component ─────────────────────────────────────
function RigCard({ rig, onToggle, onLongPress }) {
  const borderColor = rig.enabled
    ? (rig.online ? Colors.green : Colors.amber)
    : Colors.greenDim;

  return (
    <TouchableOpacity
      style={[styles.rigCard, { borderLeftColor: borderColor }]}
      onPress={() => onToggle(rig)}
      onLongPress={() => onLongPress(rig)}
      activeOpacity={0.7}
    >
      <View style={styles.rigHeader}>
        <Text style={styles.rigName}>{rig.name}</Text>
        <View style={[styles.statusDot, { backgroundColor: borderColor }]} />
      </View>

      <Text style={styles.rigIp}>{rig.ip}:{rig.port || '8332'}</Text>

      {rig.enabled && rig.online && (
        <View style={styles.rigStats}>
          <View style={styles.rigStatItem}>
            <Text style={styles.rigStatLabel}>BLOCKS</Text>
            <Text style={styles.rigStatValue}>{rig.blocks || '—'}</Text>
          </View>
          <View style={styles.rigStatItem}>
            <Text style={styles.rigStatLabel}>HASHRATE</Text>
            <Text style={styles.rigStatValue}>{formatHashrate(rig.hashrate)}</Text>
          </View>
          <View style={styles.rigStatItem}>
            <Text style={styles.rigStatLabel}>DIFF</Text>
            <Text style={styles.rigStatValue}>
              {rig.difficulty ? rig.difficulty.toFixed(3) : '—'}
            </Text>
          </View>
        </View>
      )}

      {rig.enabled && !rig.online && (
        <Text style={styles.rigOffline}>OFFLINE — tap to retry</Text>
      )}

      {!rig.enabled && (
        <Text style={styles.rigDisabled}>DISABLED — tap to enable</Text>
      )}
    </TouchableOpacity>
  );
}

// ── Main Screen ─────────────────────────────────────────────
export default function MinerScreen() {
  const [rigs, setRigs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCredModal, setShowCredModal] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Add rig inputs
  const [newRigName, setNewRigName] = useState('');
  const [newRigIp, setNewRigIp] = useState('');
  const [newRigPort, setNewRigPort] = useState('8332');

  // Credential inputs
  const [credUser, setCredUser] = useState('');
  const [credPass, setCredPass] = useState('');

  // Polling ref
  const pollRef = useRef(null);

  // ── Load rigs on mount ──────────────────────────────────
  useEffect(() => {
    (async () => {
      const saved = await loadRigs();
      setRigs(saved);
    })();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Start polling when rigs change ──────────────────────
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);

    const enabledRigs = rigs.filter(r => r.enabled);
    if (enabledRigs.length === 0) return;

    const poll = async () => {
      const creds = await loadCredentials();
      if (!creds) return;

      let updated = false;
      const newRigs = await Promise.all(
        rigs.map(async (rig) => {
          if (!rig.enabled) return rig;
          try {
            const nodeConfig = {
              ip:          rig.ip,
              port:        rig.port || '8332',
              rpcuser:     creds.user,
              rpcpassword: creds.pass,
            };
            const info = await getMiningInfo(nodeConfig);
            updated = true;
            return {
              ...rig,
              online:     true,
              blocks:     info.blocks     || 0,
              hashrate:   info.networkhashps || 0,
              difficulty: info.difficulty || 0,
            };
          } catch (e) {
            return { ...rig, online: false };
          }
        })
      );

      if (updated) {
        setRigs(newRigs);
        await saveRigs(newRigs);
      }
    };

    poll(); // immediate first poll
    pollRef.current = setInterval(poll, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [rigs.length, rigs.filter(r => r.enabled).length]);

  // ── Pull to refresh ─────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const saved = await loadRigs();
    setRigs(saved);
    setRefreshing(false);
  }, []);

  // ── Toggle rig enabled/disabled ─────────────────────────
  const toggleRig = useCallback(async (rig) => {
    const updated = rigs.map(r =>
      r.id === rig.id ? { ...r, enabled: !r.enabled } : r
    );
    setRigs(updated);
    await saveRigs(updated);
  }, [rigs]);

  // ── Long press to delete rig ────────────────────────────
  const deleteRig = useCallback((rig) => {
    Vibration.vibrate(50);
    Alert.alert(
      'Remove Rig',
      `Delete "${rig.name}" (${rig.ip}:${rig.port || '8332'})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updated = rigs.filter(r => r.id !== rig.id);
            setRigs(updated);
            await saveRigs(updated);
          },
        },
      ]
    );
  }, [rigs]);

  // ── Confirm add rig ─────────────────────────────────────
  const confirmAddRig = async () => {
    if (!newRigIp.trim()) {
      Alert.alert('Error', 'IP address is required');
      return;
    }

    setConnecting(true);

    try {
      const creds = await loadCredentials();
      if (!creds) {
        Alert.alert('No Credentials', 'Set your RPC credentials first.');
        setConnecting(false);
        setShowAddModal(false);
        setShowCredModal(true);
        return;
      }

      const nodeConfig = {
        ip:          newRigIp.trim(),
        port:        newRigPort.trim() || '8332',
        rpcuser:     creds.user,
        rpcpassword: creds.pass,
      };

      // Validate connection
      const info = await getMiningInfo(nodeConfig);

      const newRig = {
        id:         Date.now().toString(),
        name:       newRigName.trim() || `Rig ${rigs.length + 1}`,
        ip:         newRigIp.trim(),
        port:       newRigPort.trim() || '8332',
        enabled:    true,
        online:     true,
        blocks:     info.blocks       || 0,
        hashrate:   info.networkhashps || 0,
        difficulty: info.difficulty   || 0,
      };

      const updated = [...rigs, newRig];
      setRigs(updated);
      await saveRigs(updated);

      // Reset inputs
      setNewRigName('');
      setNewRigIp('');
      setNewRigPort('8332');
      setShowAddModal(false);

      Alert.alert('Connected', `${newRig.name} added successfully`);
    } catch (e) {
      Alert.alert(
        'Connection Failed',
        `Could not reach node at ${newRigIp.trim()}:${newRigPort.trim() || '8332'}\n\n${e.message}`
      );
    } finally {
      setConnecting(false);
    }
  };

  // ── Save credentials ───────────────────────────────────
  const confirmSaveCreds = async () => {
    if (!credUser.trim() || !credPass.trim()) {
      Alert.alert('Error', 'Both username and password are required');
      return;
    }
    await saveCredentials(credUser.trim(), credPass.trim());
    setCredUser('');
    setCredPass('');
    setShowCredModal(false);
    Alert.alert('Saved', 'RPC credentials stored securely');
  };

  // ── Render ──────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.green}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>PIP BOY GRINDERS</Text>
          <Text style={styles.subtitle}>
            {rigs.filter(r => r.enabled && r.online).length} / {rigs.length} ONLINE
          </Text>
        </View>

        {/* Rig List */}
        {rigs.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>NO RIGS CONFIGURED</Text>
            <Text style={styles.emptySubtext}>
              Set credentials, then add your first rig
            </Text>
          </View>
        ) : (
          rigs.map((rig) => (
            <RigCard
              key={rig.id}
              rig={rig}
              onToggle={toggleRig}
              onLongPress={deleteRig}
            />
          ))
        )}
      </ScrollView>

      {/* Bottom Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={styles.credButton}
          onPress={() => setShowCredModal(true)}
        >
          <Text style={styles.credButtonText}>🔑 CREDENTIALS</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
        >
          <Text style={styles.addButtonText}>+ ADD RIG</Text>
        </TouchableOpacity>
      </View>

      {/* ── Add Rig Modal ──────────────────────────────── */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>ADD NEW RIG</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Rig Name (optional)"
              placeholderTextColor="#666"
              value={newRigName}
              onChangeText={setNewRigName}
            />

            <TextInput
              style={styles.modalInput}
              placeholder="IP Address (e.g. 100.x.x.x)"
              placeholderTextColor="#666"
              value={newRigIp}
              onChangeText={setNewRigIp}
              keyboardType="default"
              autoCapitalize="none"
            />

            <TextInput
              style={styles.modalInput}
              placeholder="Port (default: 8332)"
              placeholderTextColor="#666"
              value={newRigPort}
              onChangeText={setNewRigPort}
              keyboardType="numeric"
              maxLength={5}
            />

            {connecting ? (
              <View style={styles.connectingRow}>
                <ActivityIndicator color={Colors.green} />
                <Text style={styles.connectingText}>CONNECTING...</Text>
              </View>
            ) : (
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancel}
                  onPress={() => {
                    setShowAddModal(false);
                    setNewRigName('');
                    setNewRigIp('');
                    setNewRigPort('8332');
                  }}
                >
                  <Text style={styles.modalCancelText}>CANCEL</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalConfirm}
                  onPress={confirmAddRig}
                >
                  <Text style={styles.modalConfirmText}>CONNECT</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Credentials Modal ──────────────────────────── */}
      <Modal
        visible={showCredModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCredModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>RPC CREDENTIALS</Text>
            <Text style={styles.modalSubtitle}>
              These are stored securely on-device
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="RPC Username"
              placeholderTextColor="#666"
              value={credUser}
              onChangeText={setCredUser}
              autoCapitalize="none"
            />

            <TextInput
              style={styles.modalInput}
              placeholder="RPC Password"
              placeholderTextColor="#666"
              value={credPass}
              onChangeText={setCredPass}
              secureTextEntry
              autoCapitalize="none"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setShowCredModal(false);
                  setCredUser('');
                  setCredPass('');
                }}
              >
                <Text style={styles.modalCancelText}>CANCEL</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirm}
                onPress={confirmSaveCreds}
              >
                <Text style={styles.modalConfirmText}>SAVE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.blackLight,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: 100,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.display,
    color: Colors.green,
    fontSize: 22,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.greenDark,
    marginTop: 4,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xl * 2,
  },
  emptyText: {
    ...Typography.heading,
    color: Colors.green,
    fontSize: 16,
  },
  emptySubtext: {
    ...Typography.caption,
    color: Colors.greenDark,
    marginTop: 8,
  },
  // Rig card
  rigCard: {
    backgroundColor: Colors.blackMid,
    borderLeftWidth: 3,
    borderRadius: 6,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  rigHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rigName: {
    ...Typography.heading,
    color: Colors.green,
    fontSize: 15,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  rigIp: {
    ...Typography.caption,
    color: Colors.greenDark,
    marginTop: 2,
    fontSize: 11,
  },
  rigStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.greenDark,
  },
  rigStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  rigStatLabel: {
    ...Typography.caption,
    color: Colors.greenDark,
    fontSize: 9,
    letterSpacing: 1,
  },
  rigStatValue: {
    ...Typography.mono,
    color: Colors.green,
    fontSize: 13,
    marginTop: 2,
  },
  rigOffline: {
    ...Typography.caption,
    color: Colors.amber,
    marginTop: Spacing.sm,
    fontSize: 11,
  },
  rigDisabled: {
    ...Typography.caption,
    color: Colors.greenDim,
    marginTop: Spacing.sm,
    fontSize: 11,
  },
  // Bottom buttons
  buttonRow: {
    flexDirection: 'row',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    backgroundColor: Colors.blackLight,
    borderTopWidth: 1,
    borderTopColor: Colors.greenDark,
    gap: Spacing.sm,
  },
  credButton: {
    flex: 1,
    backgroundColor: Colors.blackMid,
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.greenDark,
  },
  credButtonText: {
    ...Typography.heading,
    color: Colors.amber,
    fontSize: 13,
  },
  addButton: {
    flex: 1,
    backgroundColor: Colors.green,
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
  },
  addButtonText: {
    ...Typography.heading,
    color: Colors.black,
    fontSize: 13,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Colors.blackMid,
    borderRadius: 8,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.greenDark,
  },
  modalTitle: {
    ...Typography.display,
    color: Colors.green,
    fontSize: 18,
    marginBottom: Spacing.sm,
  },
  modalSubtitle: {
    ...Typography.caption,
    color: Colors.greenDark,
    marginBottom: Spacing.md,
    fontSize: 11,
  },
  modalInput: {
    backgroundColor: Colors.blackLight,
    color: Colors.green,
    fontFamily: 'SpaceMono-Regular',
    fontSize: 14,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.greenDark,
    marginBottom: Spacing.sm,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.greenDark,
  },
  modalCancelText: {
    ...Typography.heading,
    color: Colors.greenDark,
    fontSize: 13,
  },
  modalConfirm: {
    flex: 1,
    backgroundColor: Colors.green,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  modalConfirmText: {
    ...Typography.heading,
    color: Colors.black,
    fontSize: 13,
  },
  connectingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 10,
  },
  connectingText: {
    ...Typography.heading,
    color: Colors.green,
    fontSize: 13,
  },
});