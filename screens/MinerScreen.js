// screens/MinerScreen.js
// P.B.G. — Pip Boy Grinder
// Phone miner (C++ NDK) + multi-rig monitor

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, KeyboardAvoidingView,
  Modal, Platform, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import Colors      from '../theme/colors';
import { Typography, Fonts } from '../theme/typography';
import { startMining, stopMining } from '../services/miner';
import {
  loadRigs, addRig, updateRig, deleteRig, pollRig,
} from '../services/rigStorage';

const ADDRESS_KEY = '@capstash_mining_address';
const THREADS_KEY = '@capstash_mining_threads';
const RIG_POLL_MS = 30000;

const THREAD_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

export default function MinerScreen({ nodeConfig, isOnline }) {

  // ── Address state ──────────────────────────────────────────────────────
  const [miningAddress, setMiningAddress]   = useState(null);
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressInput,  setAddressInput]    = useState('');
  const [addressError,  setAddressError]    = useState('');

  // ── Thread state ───────────────────────────────────────────────────────
  const [threads, setThreads] = useState(4);

  // ── Phone miner state ──────────────────────────────────────────────────
  const [isMining,    setIsMining]    = useState(false);
  const [hashrate,    setHashrate]    = useState(0);
  const [blocksFound, setBlocksFound] = useState(0);
  const [lastBlock,   setLastBlock]   = useState(null);
  const [minerError,  setMinerError]  = useState(null);

  // ── Rig monitor state ──────────────────────────────────────────────────
  const [rigs,       setRigs]       = useState([]);
  const [rigStats,   setRigStats]   = useState({});
  const [showAddRig, setShowAddRig] = useState(false);
  const [editingRig, setEditingRig] = useState(null);
  const pollTimer = useRef(null);

  // ── QR scanner state ──────────────────────────────────────────────────
  const [scannerOpen, setScannerOpen] = useState(false);
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
      setAddressInput(clean);
      setAddressError('');
      setScannerOpen(false);
    },
  });

  const openScanner = async () => {
    const status = await Camera.requestCameraPermission();
    if (status === 'granted') {
      scanned.current = false;
      setScannerOpen(true);
    } else {
      setAddressError('CAMERA PERMISSION DENIED');
    }
  };

  // ── Load persisted state on mount ──────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(ADDRESS_KEY).then(v => { if (v) setMiningAddress(v); });
    AsyncStorage.getItem(THREADS_KEY).then(v => { if (v) setThreads(parseInt(v, 10)); });
    loadRigs().then(setRigs);
  }, []);

  // ── Poll rigs ──────────────────────────────────────────────────────────
  const pollAllRigs = useCallback(async () => {
    const current = await loadRigs();
    setRigs(current);
    const results = {};
    await Promise.all(current.map(async (rig) => {
      results[rig.id] = await pollRig(rig);
    }));
    setRigStats(results);
  }, []);

  useEffect(() => {
    if (rigs.length > 0) pollAllRigs();
    pollTimer.current = setInterval(pollAllRigs, RIG_POLL_MS);
    return () => clearInterval(pollTimer.current);
  }, [rigs.length]);

  // ── Stop mining if node goes offline ───────────────────────────────────
  useEffect(() => {
    if (!isOnline && isMining) {
      stopMining();
      setIsMining(false);
      setHashrate(0);
    }
  }, [isOnline]);

  // ── Address handlers ───────────────────────────────────────────────────
  const validateAddress = (addr) => {
    const t = addr.trim();
    if (!t) return 'ADDRESS CANNOT BE EMPTY';
    const lower = t.toLowerCase();
    if (!lower.startsWith('cap1') && !t.startsWith('C') && !t.startsWith('8')) {
      return 'MUST START WITH cap1, C, OR 8';
    }
    if (t.length < 25) return 'ADDRESS TOO SHORT';
    return null;
  };

  const handleSaveAddress = async () => {
    const trimmed = addressInput.trim();
    const err = validateAddress(trimmed);
    if (err) { setAddressError(err); return; }
    await AsyncStorage.setItem(ADDRESS_KEY, trimmed);
    setMiningAddress(trimmed);
    setEditingAddress(false);
    setAddressError('');
  };

  const handleEditAddress = () => {
    if (isMining) { stopMining(); setIsMining(false); setHashrate(0); }
    setAddressInput(miningAddress || '');
    setAddressError('');
    setEditingAddress(true);
  };

  // ── Thread handler ─────────────────────────────────────────────────────
  const handleSetThreads = async (n) => {
    setThreads(n);
    await AsyncStorage.setItem(THREADS_KEY, String(n));
    if (isMining && miningAddress) {
      stopMining();
      setTimeout(() => {
        startMining({
          nodeConfig, miningAddress, threads: n,
          onHash:  (hr) => setHashrate(hr),
          onBlock: ({ height, hash }) => {
            setBlocksFound(p => p + 1);
            setLastBlock({ height, hash });
          },
          onError: (msg) => { setMinerError(msg); setIsMining(false); setHashrate(0); },
        });
      }, 500);
    }
  };

  // ── Mining toggle ──────────────────────────────────────────────────────
  const handleToggleMining = async () => {
    if (!isOnline || !nodeConfig || !miningAddress) return;
    setMinerError(null);
    if (isMining) {
      await stopMining();
      setIsMining(false);
      setHashrate(0);
    } else {
      setIsMining(true);
      const started = await startMining({
        nodeConfig,
        miningAddress,
        threads,
        onHash:  (hr) => setHashrate(hr),
        onBlock: ({ height, hash }) => {
          setBlocksFound(p => p + 1);
          setLastBlock({ height, hash });
        },
        onError: (msg) => {
          setMinerError(msg);
          setIsMining(false);
          setHashrate(0);
        },
      });
      if (!started) { setIsMining(false); setHashrate(0); }
    }
  };

  // ── Formatters ─────────────────────────────────────────────────────────
  const formatHashrate = (hr) => {
    if (!hr) return '———';
    if (hr < 1e3) return `${hr.toFixed(2)} H/s`;
    if (hr < 1e6) return `${(hr / 1e3).toFixed(2)} KH/s`;
    return `${(hr / 1e6).toFixed(2)} MH/s`;
  };

  const shortAddr = (a) => a ? `${a.slice(0, 10)}...${a.slice(-8)}` : '';

  // ── Rig handlers ───────────────────────────────────────────────────────
  const handleAddRig = async (rigData) => {
    const saved = await addRig(rigData);
    setRigs(prev => [...prev, saved]);
    setShowAddRig(false);
    const stats = await pollRig(saved);
    setRigStats(prev => ({ ...prev, [saved.id]: stats }));
  };

  const handleUpdateRig = async (id, rigData) => {
    await updateRig(id, rigData);
    const updated = await loadRigs();
    setRigs(updated);
    setEditingRig(null);
  };

  const handleDeleteRig = async (id) => {
    await deleteRig(id);
    setRigs(prev => prev.filter(r => r.id !== id));
    setRigStats(prev => { const s = { ...prev }; delete s[id]; return s; });
  };

  // ── Render: address setup ──────────────────────────────────────────────
  if (!miningAddress || editingAddress) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: Colors.black }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.setupContainer}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[Typography.labelSmall, styles.sectionLabel]}>⚒ PIP BOY GRINDER</Text>
          <Text style={[Typography.micro, styles.setupPrompt]}>
            {editingAddress ? 'EDIT REWARD ADDRESS' : 'SET REWARD ADDRESS TO BEGIN'}
          </Text>
          <Text style={[Typography.tiny, styles.setupHint]}>
            ACCEPTS: cap1... (SEGWIT) · C... (LEGACY) · 8... (P2SH)
          </Text>

          <View style={styles.inputRow}>
            <TextInput
              style={[styles.addressInput, styles.addressInputFlex,
                addressError ? styles.addressInputError : null]}
              value={addressInput}
              onChangeText={t => { setAddressInput(t); setAddressError(''); }}
              placeholder="cap1... or C... or 8..."
              placeholderTextColor={Colors.greenDim}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
            <TouchableOpacity style={styles.qrButton} onPress={openScanner}>
              <Text style={styles.qrButtonText}>⬡ QR</Text>
            </TouchableOpacity>
          </View>

          {addressError ? (
            <Text style={[Typography.tiny, styles.errorText]}>{addressError}</Text>
          ) : null}

          <View style={styles.addressButtonRow}>
            {editingAddress && (
              <TouchableOpacity
                style={[styles.addrButton, styles.addrButtonSecondary]}
                onPress={() => { setEditingAddress(false); setAddressError(''); }}
              >
                <Text style={[Typography.micro, styles.addrButtonTextSecondary]}>CANCEL</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.addrButton, styles.addrButtonPrimary]}
              onPress={handleSaveAddress}
            >
              <Text style={[Typography.micro, styles.addrButtonTextPrimary]}>SAVE ADDRESS</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        {renderScannerModal()}
      </KeyboardAvoidingView>
    );
  }

  // ── Render: main P.B.G. ────────────────────────────────────────────────
  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[Typography.labelSmall, styles.sectionLabel]}>⚒ PIP BOY GRINDER</Text>
            <TouchableOpacity onPress={handleEditAddress} hitSlop={{top:8,bottom:8,left:8,right:8}}>
              <Text style={[Typography.micro, styles.editBtn]}>✎ ADDR</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.addressDisplay}>
            <Text style={[Typography.micro, styles.dimLabel]}>REWARD ADDRESS</Text>
            <Text style={[Typography.tiny, styles.addressValue]}>{shortAddr(miningAddress)}</Text>
          </View>

          <View style={styles.threadSection}>
            <Text style={[Typography.micro, styles.dimLabel]}>THREADS</Text>
            <View style={styles.threadRow}>
              {THREAD_OPTIONS.map(n => (
                <TouchableOpacity
                  key={n}
                  style={[styles.threadBtn, threads === n && styles.threadBtnActive]}
                  onPress={() => handleSetThreads(n)}
                >
                  <Text style={[
                    Typography.tiny, styles.threadBtnText,
                    threads === n && styles.threadBtnTextActive,
                  ]}>
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.hashrateBox}>
            <Text style={[Typography.micro, styles.dimLabel]}>PHONE HASHRATE</Text>
            <Text style={[Typography.gigantic, styles.hashrateValue]}>
              {isMining ? formatHashrate(hashrate) : '———'}
            </Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCell}>
              <Text style={[Typography.micro, styles.dimLabel]}>BLOCKS FOUND</Text>
              <Text style={[Typography.huge, styles.statValue]}>{blocksFound}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={[Typography.micro, styles.dimLabel]}>LAST BLOCK FOUND</Text>
              <Text style={[Typography.huge, styles.statValue]}>
                {lastBlock ? `#${lastBlock.height}` : '—'}
              </Text>
            </View>
          </View>

          {lastBlock && (
            <View style={styles.lastBlockBox}>
              <Text style={[Typography.micro, styles.dimLabel]}>LAST BLOCK FOUND</Text>
              <Text style={[Typography.labelSmall, styles.statValue]}>#{lastBlock.height}</Text>
              <Text style={[Typography.tiny, styles.hashText]} numberOfLines={1}>
                {lastBlock.hash}
              </Text>
            </View>
          )}

          {minerError && (
            <Text style={[Typography.tiny, styles.errorText, { marginBottom: 8 }]}>
              ⚠ {minerError}
            </Text>
          )}

          <TouchableOpacity
            style={[
              styles.mineButton,
              isMining && styles.mineButtonActive,
              (!isOnline || !nodeConfig) && styles.mineButtonDisabled,
            ]}
            onPress={handleToggleMining}
            disabled={!isOnline || !nodeConfig}
            activeOpacity={0.8}
          >
            <Text style={[
              Typography.labelSmall, styles.mineButtonText,
              isMining && styles.mineButtonTextActive,
            ]}>
              {isMining ? '[ STOP MINING ]' : '[ START MINING ]'}
            </Text>
          </TouchableOpacity>

          {!isOnline && (
            <Text style={[Typography.micro, styles.offlineNote]}>
              NODE OFFLINE — CANNOT MINE
            </Text>
          )}
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[Typography.labelSmall, styles.sectionLabel]}>⬡ RIG MONITOR</Text>
            <TouchableOpacity
              style={styles.addRigBtn}
              onPress={() => { setEditingRig(null); setShowAddRig(true); }}
            >
              <Text style={[Typography.micro, styles.addRigBtnText]}>+ ADD RIG</Text>
            </TouchableOpacity>
          </View>

          {rigs.length === 0 ? (
            <Text style={[Typography.micro, styles.dimLabel, { marginTop: 4 }]}>
              NO RIGS CONFIGURED — TAP + ADD RIG
            </Text>
          ) : (
            rigs.map(rig => (
              <RigCard
                key={rig.id}
                rig={rig}
                stats={rigStats[rig.id]}
                onEdit={() => { setEditingRig(rig); setShowAddRig(true); }}
                onDelete={() => handleDeleteRig(rig.id)}
                formatHashrate={formatHashrate}
              />
            ))
          )}
        </View>
      </ScrollView>

      {renderScannerModal()}

      <RigFormModal
        visible={showAddRig}
        rig={editingRig}
        onSave={editingRig
          ? (data) => handleUpdateRig(editingRig.id, data)
          : handleAddRig}
        onClose={() => { setShowAddRig(false); setEditingRig(null); }}
        onDelete={editingRig ? () => { handleDeleteRig(editingRig.id); setShowAddRig(false); } : null}
      />
    </>
  );

  function renderScannerModal() {
    return (
      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <View style={styles.scannerContainer}>
          <Text style={[Typography.labelSmall, styles.scannerTitle]}>SCAN WALLET ADDRESS</Text>
          <Text style={[Typography.micro, styles.scannerHint]}>POINT CAMERA AT QR CODE</Text>
          {device ? (
            <Camera
              style={styles.camera}
              device={device}
              isActive={scannerOpen}
              codeScanner={codeScanner}
            />
          ) : (
            <View style={styles.cameraPlaceholder}>
              <Text style={[Typography.micro, styles.dimLabel]}>CAMERA UNAVAILABLE</Text>
            </View>
          )}
          <View style={styles.reticleOverlay} pointerEvents="none">
            <View style={styles.reticle} />
          </View>
          <TouchableOpacity style={styles.cancelScanButton} onPress={() => setScannerOpen(false)}>
            <Text style={[Typography.labelSmall, styles.cancelScanText]}>[ CANCEL ]</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }
}

// ── Rig card component ─────────────────────────────────────────────────────
function RigCard({ rig, stats, onEdit, onDelete, formatHashrate }) {
  const [expanded, setExpanded] = useState(false);
  const online = stats?.online ?? null;

  const dotColor = online === null
    ? Colors.greenDim
    : online ? Colors.green : Colors.red;

  const statusLabel = online === null
    ? 'POLLING...'
    : online ? 'ONLINE' : 'OFFLINE';

  return (
    <TouchableOpacity
      style={styles.rigCard}
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.8}
    >
      <View style={styles.rigCardHeader}>
        <View style={styles.rigNameRow}>
          <View style={[styles.rigDot, { backgroundColor: dotColor }]} />
          <Text style={[Typography.labelSmall, styles.rigName]}>{rig.name}</Text>
        </View>
        <View style={styles.rigQuickStats}>
          {online && (
            <>
              <Text style={[Typography.tiny, styles.rigStat]}>
                {formatHashrate(stats.hashrate)}
              </Text>
              <Text style={[Typography.tiny, styles.rigStatDim]}>
                {stats.blocksFound} BLK
              </Text>
            </>
          )}
          {!online && online !== null && (
            <Text style={[Typography.tiny, { color: Colors.red }]}>{statusLabel}</Text>
          )}
          {online === null && (
            <ActivityIndicator size="small" color={Colors.greenDim} />
          )}
          <Text style={[Typography.micro, styles.rigExpandArrow]}>
            {expanded ? '▲' : '▼'}
          </Text>
        </View>
      </View>

      {expanded && (
        <View style={styles.rigExpandedBody}>
          <View style={styles.rigDetailRow}>
            <Text style={[Typography.micro, styles.dimLabel]}>LOCAL IP</Text>
            <Text style={[Typography.tiny, styles.rigDetailValue]}>{rig.localIp || '—'}</Text>
          </View>
          <View style={styles.rigDetailRow}>
            <Text style={[Typography.micro, styles.dimLabel]}>TAILSCALE IP</Text>
            <Text style={[Typography.tiny, styles.rigDetailValue]}>{rig.tailscaleIp || '—'}</Text>
          </View>
          {online && stats && (
            <>
              <View style={styles.rigDetailRow}>
                <Text style={[Typography.micro, styles.dimLabel]}>DIFFICULTY</Text>
                <Text style={[Typography.tiny, styles.rigDetailValue]}>
                  {stats.difficulty?.toFixed(4) || '—'}
                </Text>
              </View>
              <View style={styles.rigDetailRow}>
                <Text style={[Typography.micro, styles.dimLabel]}>REACHED VIA</Text>
                <Text style={[Typography.tiny, styles.rigDetailValue]}>
                  {stats.reachableIp || '—'}
                </Text>
              </View>
            </>
          )}
          <View style={styles.rigActions}>
            <TouchableOpacity style={styles.rigActionBtn} onPress={onEdit}>
              <Text style={[Typography.micro, styles.rigActionEdit]}>✎ EDIT</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.rigActionBtn} onPress={onDelete}>
              <Text style={[Typography.micro, styles.rigActionDelete]}>✕ REMOVE</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Add / Edit Rig Modal ───────────────────────────────────────────────────
function RigFormModal({ visible, rig, onSave, onClose, onDelete }) {
  const [name,        setName]        = useState('');
  const [localIp,     setLocalIp]     = useState('');
  const [tailscaleIp, setTailscaleIp] = useState('');
  const [port,        setPort]        = useState('8332');
  const [user,        setUser]        = useState('');
  const [pass,        setPass]        = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [error,       setError]       = useState('');
  const [testing,     setTesting]     = useState(false);
  const [testResult,  setTestResult]  = useState(null);

  useEffect(() => {
    if (visible && rig) {
      setName(rig.name        || '');
      setLocalIp(rig.localIp  || '');
      setTailscaleIp(rig.tailscaleIp || '');
      setPort(rig.port        || '8332');
      setUser(rig.user        || '');
      setPass(rig.pass        || '');
    } else if (visible && !rig) {
      setName(''); setLocalIp(''); setTailscaleIp('');
      setPort('8332'); setUser(''); setPass('');
    }
    setError(''); setTestResult(null);
  }, [visible, rig]);

  const validate = () => {
    if (!name.trim())                           return 'RIG NAME IS REQUIRED';
    if (!localIp.trim() && !tailscaleIp.trim()) return 'ENTER AT LEAST ONE IP ADDRESS';
    if (!user.trim() || !pass.trim())           return 'RPC CREDENTIALS ARE REQUIRED';
    return null;
  };

  const handleTest = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setTesting(true);
    setTestResult(null);
    const testRig = { localIp, tailscaleIp, port, user, pass };
    const result  = await pollRig(testRig);
    setTesting(false);
    setTestResult(result.online ? 'ok' : 'fail');
  };

  const handleSave = () => {
    const err = validate();
    if (err) { setError(err); return; }
    onSave({ name: name.trim(), localIp: localIp.trim(), tailscaleIp: tailscaleIp.trim(), port, user, pass });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: Colors.black }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.rigFormContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.rigFormHeader}>
            <Text style={[Typography.labelSmall, styles.sectionLabel]}>
              {rig ? 'EDIT RIG' : 'ADD RIG'}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={[Typography.micro, styles.editBtn]}>✕ CANCEL</Text>
            </TouchableOpacity>
          </View>

          <Text style={[Typography.micro, styles.dimLabel, { marginBottom: 4 }]}>RIG NAME</Text>
          <TextInput
            style={styles.rigInput}
            value={name}
            onChangeText={t => { setName(t); setError(''); }}
            placeholder="e.g. LENOVO TOWER"
            placeholderTextColor={Colors.greenDim}
            autoCapitalize="characters"
          />

          <Text style={[Typography.micro, styles.dimLabel, { marginTop: 14, marginBottom: 4 }]}>
            LOCAL IP  <Text style={styles.optionalTag}>(OPTIONAL)</Text>
          </Text>
          <TextInput
            style={styles.rigInput}
            value={localIp}
            onChangeText={t => { setLocalIp(t); setError(''); }}
            placeholder="192.168.x.x"
            placeholderTextColor={Colors.greenDim}
            autoCapitalize="none"
            keyboardType="decimal-pad"
          />

          <Text style={[Typography.micro, styles.dimLabel, { marginTop: 14, marginBottom: 4 }]}>
            TAILSCALE IP  <Text style={styles.optionalTag}>(OPTIONAL)</Text>
          </Text>
          <TextInput
            style={styles.rigInput}
            value={tailscaleIp}
            onChangeText={t => { setTailscaleIp(t); setError(''); }}
            placeholder="100.x.x.x"
            placeholderTextColor={Colors.greenDim}
            autoCapitalize="none"
            keyboardType="decimal-pad"
          />

          <Text style={[Typography.micro, styles.dimLabel, { marginTop: 14, marginBottom: 4 }]}>PORT</Text>
          <TextInput
            style={styles.rigInput}
            value={port}
            onChangeText={t => { setPort(t); setError(''); }}
            placeholder="8332"
            placeholderTextColor={Colors.greenDim}
            keyboardType="number-pad"
          />

          <Text style={[Typography.micro, styles.dimLabel, { marginTop: 14, marginBottom: 4 }]}>RPC USERNAME</Text>
          <TextInput
            style={styles.rigInput}
            value={user}
            onChangeText={t => { setUser(t); setError(''); }}
            placeholder="rpcuser"
            placeholderTextColor={Colors.greenDim}
            autoCapitalize="none"
          />

          <Text style={[Typography.micro, styles.dimLabel, { marginTop: 14, marginBottom: 4 }]}>RPC PASSWORD</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.rigInput, { flex: 1, marginBottom: 0 }]}
              value={pass}
              onChangeText={t => { setPass(t); setError(''); }}
              placeholder="rpcpassword"
              placeholderTextColor={Colors.greenDim}
              autoCapitalize="none"
              secureTextEntry={!showPass}
            />
            <TouchableOpacity
              style={styles.showPassBtn}
              onPress={() => setShowPass(p => !p)}
            >
              <Text style={[Typography.micro, styles.dimLabel]}>
                {showPass ? 'HIDE' : 'SHOW'}
              </Text>
            </TouchableOpacity>
          </View>

          {error ? (
            <Text style={[Typography.tiny, styles.errorText, { marginTop: 8 }]}>{error}</Text>
          ) : null}

          <TouchableOpacity
            style={[
              styles.testRigBtn,
              testResult === 'ok'   && styles.testRigBtnOk,
              testResult === 'fail' && styles.testRigBtnFail,
            ]}
            onPress={handleTest}
            disabled={testing}
          >
            {testing
              ? <ActivityIndicator size="small" color={Colors.amber} />
              : <Text style={[Typography.micro, styles.testRigBtnText,
                  testResult === 'ok'   && { color: Colors.green },
                  testResult === 'fail' && { color: Colors.red },
                ]}>
                  {testResult === 'ok'   ? '✓ CONNECTION OK' :
                   testResult === 'fail' ? '✕ UNREACHABLE'   :
                   '⚡ TEST CONNECTION'}
                </Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.saveRigBtn} onPress={handleSave}>
            <Text style={[Typography.labelSmall, styles.saveRigBtnText]}>
              {rig ? 'SAVE CHANGES' : 'ADD RIG'}
            </Text>
          </TouchableOpacity>

          {onDelete && (
            <TouchableOpacity style={styles.deleteRigBtn} onPress={onDelete}>
              <Text style={[Typography.micro, styles.deleteRigBtnText]}>
                ✕ REMOVE THIS RIG
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: Colors.black },
  content:         { paddingBottom: 32 },
  section:         { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  sectionLabel:    { color: Colors.green, letterSpacing: 2, marginBottom: 12 },
  sectionHeaderRow:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  divider:         { height: 1, backgroundColor: Colors.green, opacity: 0.25, marginHorizontal: 16, marginVertical: 8 },
  dimLabel:        { color: Colors.greenDim, letterSpacing: 1.5, marginBottom: 4 },
  errorText:       { color: Colors.red, letterSpacing: 1 },
  editBtn:         { color: Colors.green, opacity: 0.5, letterSpacing: 1 },
  optionalTag:     { color: Colors.greenDim, fontSize: 11 },

  setupContainer:  { padding: 16, paddingTop: 24 },
  setupPrompt:     { color: Colors.amber, letterSpacing: 2, marginBottom: 8 },
  setupHint:       { color: Colors.greenDim, letterSpacing: 1, lineHeight: 20, marginBottom: 16 },
  inputRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  addressInput:    { borderWidth: 1, borderColor: Colors.green, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 10, color: Colors.green, fontFamily: Fonts.mono, fontSize: 15, marginBottom: 8 },
  addressInputFlex:{ flex: 1, marginBottom: 0 },
  addressInputError:{ borderColor: Colors.red },
  qrButton:        { borderWidth: 1, borderColor: Colors.green, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 11, justifyContent: 'center', alignItems: 'center' },
  qrButtonText:    { color: Colors.green, fontFamily: Fonts.mono, fontSize: 15, letterSpacing: 1 },
  addressButtonRow:{ flexDirection: 'row', gap: 10, marginTop: 4 },
  addrButton:      { flex: 1, borderRadius: 4, paddingVertical: 12, alignItems: 'center', borderWidth: 1 },
  addrButtonPrimary:  { borderColor: Colors.green, backgroundColor: Colors.green },
  addrButtonSecondary:{ borderColor: Colors.green },
  addrButtonTextPrimary:  { color: Colors.black, letterSpacing: 1.5 },
  addrButtonTextSecondary:{ color: Colors.green, letterSpacing: 1.5 },

  addressDisplay:  { marginBottom: 14 },
  addressValue:    { color: Colors.greenDim, fontFamily: Fonts.mono },
  threadSection:   { marginBottom: 16 },
  threadRow:       { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  threadBtn:       { width: 36, height: 36, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  threadBtnActive: { borderColor: Colors.green, backgroundColor: Colors.green },
  threadBtnText:   { color: Colors.greenDim, fontFamily: Fonts.mono },
  threadBtnTextActive:{ color: Colors.black },
  hashrateBox:     { alignItems: 'center', marginBottom: 20 },
  hashrateValue:   { color: Colors.green, textAlign: 'center' },
  statsRow:        { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 },
  statCell:        { flex: 1, alignItems: 'center' },
  statDivider:     { width: 1, backgroundColor: Colors.green, opacity: 0.3 },
  statValue:       { color: Colors.green },
  lastBlockBox:    { borderWidth: 1, borderColor: Colors.green, borderRadius: 4, padding: 10, marginBottom: 16, opacity: 0.8 },
  hashText:        { color: Colors.greenDim, fontFamily: Fonts.mono, marginTop: 2 },
  mineButton:      { borderWidth: 1, borderColor: Colors.green, borderRadius: 4, paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  mineButtonActive:{ backgroundColor: Colors.green },
  mineButtonDisabled:{ opacity: 0.3 },
  mineButtonText:  { color: Colors.green, letterSpacing: 2 },
  mineButtonTextActive:{ color: Colors.black },
  offlineNote:     { color: Colors.red, textAlign: 'center', letterSpacing: 1, marginTop: 4 },

  addRigBtn:       { borderWidth: 1, borderColor: Colors.green, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5 },
  addRigBtnText:   { color: Colors.green, letterSpacing: 1 },
  rigCard:         { borderWidth: 1, borderColor: Colors.border, borderRadius: 4, marginBottom: 8, backgroundColor: Colors.surface },
  rigCardHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  rigNameRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  rigDot:          { width: 10, height: 10, borderRadius: 5 },
  rigName:         { color: Colors.green, letterSpacing: 1 },
  rigQuickStats:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rigStat:         { color: Colors.green, fontFamily: Fonts.mono },
  rigStatDim:      { color: Colors.greenDim, fontFamily: Fonts.mono },
  rigExpandArrow:  { color: Colors.greenDim, marginLeft: 4 },
  rigExpandedBody: { borderTopWidth: 1, borderTopColor: Colors.border, padding: 12 },
  rigDetailRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  rigDetailValue:  { color: Colors.green, fontFamily: Fonts.mono },
  rigActions:      { flexDirection: 'row', gap: 16, marginTop: 10 },
  rigActionBtn:    { paddingVertical: 4 },
  rigActionEdit:   { color: Colors.green, letterSpacing: 1 },
  rigActionDelete: { color: Colors.red, letterSpacing: 1 },

  rigFormContainer:{ padding: 16, paddingTop: 52, paddingBottom: 32 },
  rigFormHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  rigInput:        { borderWidth: 1, borderColor: Colors.border, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 10, color: Colors.green, fontFamily: Fonts.mono, fontSize: 15, marginBottom: 4, backgroundColor: Colors.black },
  showPassBtn:     { borderWidth: 1, borderColor: Colors.border, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 10, marginLeft: 8, justifyContent: 'center' },
  testRigBtn:      { marginTop: 16, borderWidth: 1, borderColor: Colors.amberDim, borderRadius: 4, padding: 11, alignItems: 'center', minHeight: 40, justifyContent: 'center' },
  testRigBtnOk:    { borderColor: Colors.green },
  testRigBtnFail:  { borderColor: Colors.red },
  testRigBtnText:  { color: Colors.amber, letterSpacing: 2 },
  saveRigBtn:      { marginTop: 10, borderWidth: 1, borderColor: Colors.green, borderRadius: 4, paddingVertical: 14, alignItems: 'center', backgroundColor: Colors.green },
  saveRigBtnText:  { color: Colors.black, letterSpacing: 2 },
  deleteRigBtn:    { marginTop: 8, paddingVertical: 12, alignItems: 'center' },
  deleteRigBtnText:{ color: Colors.red, letterSpacing: 1 },

  scannerContainer:{ flex: 1, backgroundColor: Colors.black, alignItems: 'center', paddingTop: 60 },
  scannerTitle:    { color: Colors.green, letterSpacing: 2, marginBottom: 6 },
  scannerHint:     { color: Colors.greenDim, letterSpacing: 1.5, marginBottom: 24 },
  camera:          { width: '100%', flex: 1 },
  cameraPlaceholder:{ width: '100%', flex: 1, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.green, opacity: 0.4 },
  reticleOverlay:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 80, justifyContent: 'center', alignItems: 'center' },
  reticle:         { width: 220, height: 220, borderWidth: 2, borderColor: Colors.green, borderRadius: 8, opacity: 0.8 },
  cancelScanButton:{ paddingVertical: 20, paddingHorizontal: 40 },
  cancelScanText:  { color: Colors.green, letterSpacing: 2 },
});
