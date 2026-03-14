/**
 * MinerScreen.js — P.B.G. (Pip Boy Grinder)
 * v2.0 — C++ NDK miner + Grinder network monitor
 *
 * Sections:
 *   1. Mining Address (QR scan + display)
 *   2. Hashrate dashboard (big numbers)
 *   3. Stats row (blocks, uptime, threads)
 *   4. Thread config + Start/Stop
 *   5. Grinders (remote miner monitoring)
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, TextInput, Alert, NativeModules,
  NativeEventEmitter, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadNodeConfig } from '../services/rpc';
import QRScannerModal from '../components/QRScannerModal';

const { CapStashMiner } = NativeModules;
const MinerEmitter = CapStashMiner ? new NativeEventEmitter(CapStashMiner) : null;

// ── Storage keys ──────────────────────────────────────────────────────────────
const KEY_MINING_ADDR = 'mining_address';
const KEY_THREADS     = 'miner_threads';
const KEY_GRINDERS    = 'miner_grinders';

// ── Theme ─────────────────────────────────────────────────────────────────────
const C = {
  bg:       '#0a0f0a',
  surface:  '#0d1a0d',
  border:   '#1a3a1a',
  green:    '#00ff41',
  greenDim: '#00aa2a',
  amber:    '#ffb000',
  muted:    '#4a7a4a',
  danger:   '#ff4444',
  white:    '#c8ffc8',
};

const F = {
  heading: { fontFamily: 'VT323-Regular' },
  mono:    { fontFamily: 'ShareTechMono-Regular' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const truncAddr = (a) => a ? `${a.slice(0,10)}...${a.slice(-8)}` : '—';
const fmtHashrate = (hr) => {
  if (!hr || hr === 0) return ['—', ''];
  if (hr >= 1_000_000_000) return [(hr / 1_000_000_000).toFixed(3), 'GH/s'];
  if (hr >= 1_000_000)     return [(hr / 1_000_000).toFixed(2),     'MH/s'];
  if (hr >= 1_000)         return [(hr / 1_000).toFixed(2),         'KH/s'];
  return [hr.toFixed(0), 'H/s'];
};
const fmtUptime = (secs) => {
  if (!secs) return '00:00:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function MinerScreen() {
  // Mining state
  const [isMining,      setIsMining]      = useState(false);
  const [hashrate,      setHashrate]      = useState(0);
  const [blocksFound,   setBlocksFound]   = useState(0);
  const [uptime,        setUptime]        = useState(0);
  const [threads,       setThreads]       = useState('4');
  const [miningAddress, setMiningAddress] = useState(null);
  const [nodeConfig,    setNodeConfig]    = useState(null);
  const [scannerOpen,   setScannerOpen]   = useState(false);

  // Grinders state
  const [grinders,      setGrinders]      = useState([]);
  const [grinderModal,  setGrinderModal]  = useState(false);
  const [newGrinder,    setNewGrinder]    = useState({ name:'', host:'', port:'8332' });

  const uptimeRef   = useRef(null);
  const grinderPoll = useRef(null);

  // ── Mount ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadAll();
    subscribeEvents();
    return () => {
      unsubscribeEvents();
      clearInterval(uptimeRef.current);
      clearInterval(grinderPoll.current);
    };
  }, []);

  const loadAll = async () => {
    try {
      const addr = await AsyncStorage.getItem(KEY_MINING_ADDR);
      if (addr) setMiningAddress(addr);
      const t = await AsyncStorage.getItem(KEY_THREADS);
      if (t) setThreads(t);
      const g = await AsyncStorage.getItem(KEY_GRINDERS);
      if (g) setGrinders(JSON.parse(g));
    } catch (e) {}
    loadNodeConfig().then(cfg => { if (cfg) setNodeConfig(cfg); });
  };

  // ── Event subscriptions ───────────────────────────────────────────────────
  // TODO: fill in subscribeEvents and unsubscribeEvents
  const subsRef = useRef([]);
  const subscribeEvents = () => {
    if (!MinerEmitter) return;
    subsRef.current = [
      MinerEmitter.addListener('MinerHashrate',  (e) => setHashrate(e.hashrate)),
      MinerEmitter.addListener('MinerBlockFound', (e) => {
        setBlocksFound(b => b + 1);
        Alert.alert('★ BLOCK FOUND', `Height: ${e.height}\n${e.hash.slice(0,32)}...`);
      }),
      MinerEmitter.addListener('MinerError', (e) => {
        console.warn('[MINER ERROR]', e.message);
      }),
    ];
  };
  const unsubscribeEvents = () => {
    subsRef.current.forEach(s => s?.remove());
    subsRef.current = [];
  };

  // ── QR scan ───────────────────────────────────────────────────────────────
  const handleScan = async (address) => {
    setScannerOpen(false);
    await AsyncStorage.setItem(KEY_MINING_ADDR, address);
    setMiningAddress(address);
  };

  // ── Start mining ──────────────────────────────────────────────────────────
  const handleStart = async () => {
    if (!miningAddress) {
      Alert.alert('NO ADDRESS', 'Scan a mining address from your Qt wallet first.');
      return;
    }
    if (!nodeConfig) {
      Alert.alert('NO NODE CONFIG', 'Configure node connection in the Setup tab.');
      return;
    }
    const t = Math.max(1, Math.min(8, parseInt(threads, 10) || 4));
    await AsyncStorage.setItem(KEY_THREADS, String(t));
    setThreads(String(t));

    const cfg = {
      host:    nodeConfig.ip,
      port:    parseInt(nodeConfig.port, 10),
      user:    nodeConfig.rpcuser,
      pass:    nodeConfig.rpcpassword,
      address: miningAddress,
      threads: t,
    };

    try {
      await CapStashMiner.start(cfg);
      setIsMining(true);
      setBlocksFound(0);
      setUptime(0);
      uptimeRef.current = setInterval(() => setUptime(u => u + 1), 1000);
    } catch (e) {
      Alert.alert('START FAILED', e.message);
    }
  };

  // ── Stop mining ───────────────────────────────────────────────────────────
  const handleStop = async () => {
    try { await CapStashMiner.stop(); } catch (e) {}
    setIsMining(false);
    setHashrate(0);
    clearInterval(uptimeRef.current);
  };

  // ── Grinders ──────────────────────────────────────────────────────────────
  // TODO: fill in grinder functions
  const saveGrinders = async (list) => {
    setGrinders(list);
    await AsyncStorage.setItem(KEY_GRINDERS, JSON.stringify(list));
  };

  const addGrinder = async () => {
    if (!newGrinder.name || !newGrinder.host) {
      Alert.alert('MISSING FIELDS', 'Name and host are required.');
      return;
    }
    const g = { ...newGrinder, id: Date.now().toString(), status: 'unknown', hashrate: 0 };
    await saveGrinders([...grinders, g]);
    setNewGrinder({ name: '', host: '', port: '8332' });
    setGrinderModal(false);
  };

  const removeGrinder = (id) => {
    Alert.alert('REMOVE GRINDER', 'Remove this rig from the monitor?', [
      { text: 'CANCEL', style: 'cancel' },
      { text: 'REMOVE', style: 'destructive',
        onPress: () => saveGrinders(grinders.filter(g => g.id !== id)) },
    ]);
  };

  const [hrValue, hrUnit] = fmtHashrate(hashrate);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <QRScannerModal
        visible={scannerOpen}
        onScan={handleScan}
        onClose={() => setScannerOpen(false)}
        title="SCAN MINING ADDRESS"
        hint="Point at Qt wallet receive address QR"
      />
      <GrinderAddModal
        visible={grinderModal}
        value={newGrinder}
        onChange={setNewGrinder}
        onAdd={addGrinder}
        onClose={() => setGrinderModal(false)}
      />

      {/* ── Header ── */}
      <View style={s.header}>
        <Text style={s.headerTitle}>P.B.G.</Text>
        <Text style={s.headerSub}>PIP BOY GRINDER  //  WHIRLPOOL-512</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>

        {/* ── Mining Address ── */}
        <Panel label="MINING ADDRESS">
          {miningAddress ? (
            <View>
              <Text style={s.addrText}>{miningAddress}</Text>
              <View style={s.row}>
                <PbgButton label="⊡ RESCAN" onPress={() => setScannerOpen(true)} flex />
                <PbgButton label="✕ CLEAR" danger
                  onPress={() => {
                    Alert.alert('CLEAR ADDRESS', 'Remove stored mining address?', [
                      { text: 'CANCEL', style: 'cancel' },
                      { text: 'CLEAR', style: 'destructive', onPress: async () => {
                        await AsyncStorage.removeItem(KEY_MINING_ADDR);
                        setMiningAddress(null);
                        if (isMining) handleStop();
                      }},
                    ]);
                  }} flex />
              </View>
            </View>
          ) : (
            <View>
              <Text style={s.noAddrText}>NO ADDRESS CONFIGURED</Text>
              <PbgButton label="⊡ SCAN QR FROM QT WALLET" onPress={() => setScannerOpen(true)} full />
            </View>
          )}
        </Panel>

        {/* ── Hashrate Dashboard ── */}
        <Panel label="HASHRATE">
          <View style={s.hashrateBox}>
            <Text style={s.hashrateValue}>{isMining ? hrValue : '—'}</Text>
            <Text style={s.hashrateUnit}>{isMining ? hrUnit : ''}</Text>
          </View>
          <View style={s.statsRow}>
            <StatBox label="BLOCKS" value={blocksFound} />
            <StatBox label="UPTIME" value={fmtUptime(uptime)} small />
            <StatBox label="THREADS" value={isMining ? threads : '—'} />
          </View>
        </Panel>

        {/* ── Engine Controls ── */}
        <Panel label="ENGINE CONTROLS">
          <View style={s.row}>
            <Text style={s.threadLabel}>THREADS:</Text>
            <TextInput
              style={s.threadInput}
              value={threads}
              onChangeText={setThreads}
              keyboardType="numeric"
              maxLength={1}
              editable={!isMining}
              placeholderTextColor={C.muted}
            />
            <Text style={s.threadHint}>(1-8)</Text>
          </View>
          {!isMining ? (
            <PbgButton
              label="► START MINING"
              onPress={handleStart}
              full primary
              disabled={!miningAddress}
            />
          ) : (
            <PbgButton label="■ STOP MINING" onPress={handleStop} full stop />
          )}
        </Panel>

        {/* ── Grinders ── */}
        <Panel label="GRINDER NETWORK">
          {grinders.length === 0 ? (
            <Text style={s.noAddrText}>NO GRINDERS REGISTERED</Text>
          ) : (
            grinders.map(g => (
              <GrinderRow key={g.id} grinder={g} nodeConfig={nodeConfig}
                onRemove={() => removeGrinder(g.id)} />
            ))
          )}
          <PbgButton label="+ ADD GRINDER" onPress={() => setGrinderModal(true)} full />
        </Panel>

      </ScrollView>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Panel({ label, children }) {
  return (
    <View style={s.panel}>
      <Text style={s.panelLabel}>▸ {label}</Text>
      {children}
    </View>
  );
}

function StatBox({ label, value, small }) {
  return (
    <View style={s.statBox}>
      <Text style={[s.statValue, small && s.statValueSmall]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function PbgButton({ label, onPress, full, primary, stop, danger, disabled, flex }) {
  return (
    <TouchableOpacity
      style={[
        s.btn,
        full  && s.btnFull,
        flex  && s.btnFlex,
        primary && s.btnPrimary,
        stop    && s.btnStop,
        danger  && s.btnDanger,
        disabled && s.btnDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[s.btnText, danger && s.btnTextDanger]}>{label}</Text>
    </TouchableOpacity>
  );
}

function GrinderRow({ grinder, nodeConfig, onRemove }) {
  const [hr,     setHr]     = useState(0);
  const [status, setStatus] = useState('CONNECTING...');
  const pollRef = useRef(null);

  useEffect(() => {
    pollGrinder();
    pollRef.current = setInterval(pollGrinder, 10000);
    return () => clearInterval(pollRef.current);
  }, []);

  const pollGrinder = async () => {
    // Matches Qt wallet getnetworkhashps default (120 block window)
    try {
      const user = nodeConfig?.rpcuser || '';
      const pass = nodeConfig?.rpcpassword || '';
      const auth = btoa(`${user}:${pass}`);
      const res  = await fetch(
        `http://${grinder.host}:${grinder.port}/`,
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Basic ${auth}`,
          },
          body: JSON.stringify({
            jsonrpc: '1.0', id: 'monitor',
            method: 'getnetworkhashps',
            params: [],   // default = last 120 blocks, matches Qt wallet
          }),
        }
      );
      const json = await res.json();
      if (json?.result !== undefined && json.result !== null) {
        setHr(json.result);   // returns number directly e.g. 1028841743.325364
        setStatus('ONLINE');
      }
    } catch (e) {
      setStatus('OFFLINE');
      setHr(0);
    }
  };

  const [hrVal, hrUnit] = fmtHashrate(hr);

  return (
    <View style={s.grinderRow}>
      <View style={s.grinderInfo}>
        <Text style={s.grinderName}>{grinder.name}</Text>
        <Text style={s.grinderHost}>{grinder.host}:{grinder.port}</Text>
      </View>
      <View style={s.grinderStats}>
        <Text style={[s.grinderStatus,
          status === 'ONLINE' ? s.statusOnline : s.statusOffline]}>
          {status}
        </Text>
        {status === 'ONLINE' && (
          <Text style={s.grinderHr}>{hrVal} {hrUnit}</Text>
        )}
      </View>
      <TouchableOpacity onPress={onRemove} style={s.grinderRemove}>
        <Text style={s.grinderRemoveText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

function GrinderAddModal({ visible, value, onChange, onAdd, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={s.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.modalBox}>
          <Text style={s.modalTitle}>ADD GRINDER</Text>

          <Text style={s.inputLabel}>RIG NAME</Text>
          <TextInput
            style={s.input}
            value={value.name}
            onChangeText={t => onChange({ ...value, name: t })}
            placeholder="e.g. GARAGE-RIG-1"
            placeholderTextColor={C.muted}
          />

          <Text style={s.inputLabel}>HOST / IP</Text>
          <TextInput
            style={s.input}
            value={value.host}
            onChangeText={t => onChange({ ...value, host: t })}
            placeholder="100.x.x.x or 192.168.x.x"
            placeholderTextColor={C.muted}
            autoCapitalize="none"
            keyboardType="default"
          />

          <Text style={s.inputLabel}>RPC PORT</Text>
          <TextInput
            style={s.input}
            value={value.port}
            onChangeText={t => onChange({ ...value, port: t })}
            placeholder="8332"
            placeholderTextColor={C.muted}
            keyboardType="numeric"
          />

          <View style={[s.row, { marginTop: 16 }]}>
            <PbgButton label="CANCEL" onPress={onClose} flex />
            <PbgButton label="ADD GRINDER" onPress={onAdd} flex primary />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  scroll:  { flex: 1 },
  scrollContent: { padding: 12, paddingBottom: 32 },

  // Header
  header:     { borderBottomWidth: 1, borderBottomColor: C.border,
                backgroundColor: C.surface, paddingHorizontal: 16, paddingVertical: 10 },
  headerTitle:{ ...F.heading, color: C.green, fontSize: 28, letterSpacing: 4 },
  headerSub:  { ...F.mono, color: C.muted, fontSize: 10, letterSpacing: 2, marginTop: 2 },

  // Panel
  panel:      { borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
                padding: 12, marginBottom: 10 },
  panelLabel: { ...F.mono, color: C.muted, fontSize: 11, letterSpacing: 2, marginBottom: 10 },

  // Address
  addrText:   { ...F.mono, color: C.green, fontSize: 11, marginBottom: 10 },
  noAddrText: { ...F.mono, color: C.amber, fontSize: 12, textAlign: 'center',
                letterSpacing: 1, marginBottom: 12 },

  // Hashrate
  hashrateBox:  { alignItems: 'center', paddingVertical: 16 },
  hashrateValue:{ ...F.heading, color: C.green, fontSize: 72, lineHeight: 76 },
  hashrateUnit: { ...F.mono, color: C.greenDim, fontSize: 18, letterSpacing: 3, marginTop: 4 },

  // Stats row
  statsRow: { flexDirection: 'row', justifyContent: 'space-around',
              borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12, marginTop: 8 },
  statBox:  { alignItems: 'center', flex: 1 },
  statValue:{ ...F.heading, color: C.white, fontSize: 22 },
  statValueSmall: { fontSize: 16 },
  statLabel:{ ...F.mono, color: C.muted, fontSize: 9, letterSpacing: 1, marginTop: 2 },

  // Thread controls
  row:         { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  threadLabel: { ...F.mono, color: C.muted, fontSize: 12, letterSpacing: 1 },
  threadInput: { ...F.mono, color: C.green, fontSize: 18, borderWidth: 1,
                 borderColor: C.border, backgroundColor: C.bg,
                 paddingHorizontal: 12, paddingVertical: 6,
                 width: 56, textAlign: 'center' },
  threadHint:  { ...F.mono, color: C.muted, fontSize: 10 },

  // Buttons
  btn:         { borderWidth: 1, borderColor: C.muted, paddingVertical: 10,
                 paddingHorizontal: 14, alignItems: 'center', marginBottom: 6 },
  btnFull:     { width: '100%' },
  btnFlex:     { flex: 1 },
  btnPrimary:  { borderColor: C.green },
  btnStop:     { borderColor: C.amber },
  btnDanger:   { borderColor: C.danger },
  btnDisabled: { opacity: 0.35 },
  btnText:     { ...F.mono, color: C.green, fontSize: 13, letterSpacing: 2 },
  btnTextDanger:{ ...F.mono, color: C.danger, fontSize: 13, letterSpacing: 2 },

  // Grinders
  grinderRow:   { flexDirection: 'row', alignItems: 'center', borderWidth: 1,
                  borderColor: C.border, padding: 10, marginBottom: 8 },
  grinderInfo:  { flex: 1 },
  grinderName:  { ...F.heading, color: C.green, fontSize: 18, letterSpacing: 1 },
  grinderHost:  { ...F.mono, color: C.muted, fontSize: 10 },
  grinderStats: { alignItems: 'flex-end', marginRight: 10 },
  grinderStatus:{ ...F.mono, fontSize: 10, letterSpacing: 1 },
  statusOnline: { color: C.green },
  statusOffline:{ color: C.danger },
  grinderHr:    { ...F.mono, color: C.white, fontSize: 12, marginTop: 2 },
  grinderRemove:{ padding: 6 },
  grinderRemoveText: { ...F.mono, color: C.danger, fontSize: 14 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
                  justifyContent: 'center', padding: 20 },
  modalBox:     { backgroundColor: C.surface, borderWidth: 1,
                  borderColor: C.border, padding: 20 },
  modalTitle:   { ...F.heading, color: C.green, fontSize: 22,
                  letterSpacing: 3, marginBottom: 16 },
  inputLabel:   { ...F.mono, color: C.muted, fontSize: 10,
                  letterSpacing: 1, marginBottom: 4 },
  input:        { ...F.mono, color: C.white, fontSize: 13, borderWidth: 1,
                  borderColor: C.border, backgroundColor: C.bg,
                  paddingHorizontal: 10, paddingVertical: 8, marginBottom: 12 },
});