// components/SetupMenu.js
// CapStash — Node Configuration Modal
//
// User enters: IP Address, Port, Username, Password (separately)
// On save: stored in encrypted storage via rpc.saveNodeConfig()
// Format saved: { ip: '100.x.x.x', port: '8332', rpcuser, rpcpassword }
// buildRpcUrl() in rpc.js combines them at call time → http://ip:port/
//
// Props:
//   visible            {bool}
//   onClose            {fn}
//   isOnline           {bool}
//   nodeConfig         {object}  — current config from App.js state
//   appMode            {string}  — 'DRIFTER' | 'WANDERER' from App.js state
//   onNodeConfigChange {fn}      — App.js setNodeConfig
import React, { useState, useEffect } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, ActivityIndicator,
} from 'react-native';
import {
  saveNodeConfig,
  loadNodeConfig,
  testConnection,
} from '../services/rpc';
import Colors    from '../theme/colors';
import Typography from '../theme/typography';

const APP_VERSION = '1.0.0-DRIFTER';

export default function SetupMenu({
  visible,
  onClose,
  isOnline,
  nodeConfig,
  appMode,
  onNodeConfigChange,
}) {
  const [activeSection, setActiveSection] = useState('node');

  // ── Four clean fields ──────────────────────────────────
  const [ip,       setIp]      = useState('');
  const [port,     setPort]    = useState('8332');
  const [username, setUsername]= useState('');
  const [password, setPassword]= useState('');
  const [showIp,   setShowIp]  = useState(false);
  const [showPort, setShowPort]= useState(false);
  const [showPass, setShowPass]= useState(false);

  // ── Status ─────────────────────────────────────────────
  const [testStatus,  setTestStatus]  = useState(null);
  const [testMessage, setTestMessage] = useState('');
  const [saveStatus,  setSaveStatus]  = useState(null);

  // ── Load existing config when menu opens ───────────────
  useEffect(() => {
    if (!visible) return;
    loadNodeConfig().then(stored => {
      const cfg = stored || nodeConfig;
      if (cfg) {
        if (cfg.ip?.includes(':')) {
          const [rawIp, rawPort] = cfg.ip.split(':');
          setIp(rawIp    || '');
          setPort(rawPort || '8332');
        } else {
          setIp(cfg.ip    || '');
          setPort(cfg.port || '8332');
        }
        setUsername(cfg.rpcuser     || '');
        setPassword(cfg.rpcpassword || '');
      }
    });
    setTestStatus(null);
    setTestMessage('');
    setSaveStatus(null);
  }, [visible]);

  const statusColor = isOnline ? Colors.green : Colors.red;
  const currentMode = appMode || 'DRIFTER';

  // ── Build config object from current fields ────────────
  const buildConfig = () => ({
    ip:          ip.trim(),
    port:        port.trim() || '8332',
    rpcuser:     username.trim(),
    rpcpassword: password.trim(),
  });

  const fieldsComplete = ip.trim() && port.trim() && username.trim() && password.trim();

  // ── Test (does NOT save) ───────────────────────────────
  const handleTest = async () => {
    if (!fieldsComplete) {
      setTestStatus('fail');
      setTestMessage('ALL FOUR FIELDS ARE REQUIRED');
      return;
    }
    setTestStatus('testing');
    setTestMessage('');
    const result = await testConnection(buildConfig());
    if (result.success) {
      setTestStatus('ok');
      setTestMessage(`NODE REACHED  ·  BLK #${result.blockHeight}`);
    } else {
      setTestStatus('fail');
      if (result.error?.includes('TIMEOUT') || result.error?.includes('ERR_06')) {
        setTestMessage('TIMEOUT — IS TAILSCALE ACTIVE ON BOTH DEVICES?');
      } else if (result.error?.includes('AUTH') || result.error?.includes('401') || result.error?.includes('ERR_05')) {
        setTestMessage('AUTH FAILED — CHECK USERNAME / PASSWORD');
      } else if (result.error?.includes('NO_CONFIG')) {
        setTestMessage('CONFIG INCOMPLETE — FILL ALL FIELDS');
      } else {
        setTestMessage(result.error?.replace('ERR_NODE: ', '') || 'CONNECTION FAILED');
      }
    }
  };

  // ── Save to encrypted storage + update App.js state ───
  const handleSave = async () => {
    if (!fieldsComplete) {
      setSaveStatus('error');
      return;
    }
    setSaveStatus('saving');
    try {
      const saved = await saveNodeConfig(buildConfig());
      setSaveStatus('saved');
      onNodeConfigChange?.(saved);
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (e) {
      console.warn('[SetupMenu] Save error:', e.message);
      setSaveStatus('error');
    }
  };

  const resetTestState = () => {
    setTestStatus(null);
    setTestMessage('');
    setSaveStatus(null);
  };

  const toggleSection = (key) =>
    setActiveSection(prev => prev === key ? null : key);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.root}>

        {/* ── Header ─────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>SETUP</Text>
            <Text style={styles.headerSub}>CONFIGURATION TERMINAL</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>✕ CLOSE</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Mode Banner ────────────────────────────── */}
          <View style={[styles.modeBanner, { borderColor: statusColor }]}>
            <View>
              <Text style={styles.modeTag}>ACTIVE MODE</Text>
              <Text style={[styles.modeName, { color: statusColor, textShadowColor: statusColor }]}>
                {currentMode}
              </Text>
              <Text style={styles.modeDesc}>COMPANION WALLET · SYNCS VIA TAILSCALE</Text>
            </View>
            <View style={styles.modeStatus}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusLabel, { color: statusColor }]}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </View>
          </View>

          {/* Wanderer teaser */}
          <View style={styles.wandererCard}>
            <Text style={styles.wandererTitle}>◈ WANDERER MODE — COMING SOON</Text>
            <Text style={styles.wandererDesc}>
              SELF-CONTAINED NODE · FULL CHAIN ON PHONE · ZERO LATENCY MINING
            </Text>
          </View>

          <View style={styles.divider} />

          {/* ════════════════════════════════════════════
              SECTION: NODE CONNECTION
          ════════════════════════════════════════════ */}
          <SectionHeader
            label="▸ NODE CONNECTION"
            open={activeSection === 'node'}
            onPress={() => toggleSection('node')}
          />
          {activeSection === 'node' && (
            <View style={styles.sectionBody}>

              {/* Tailscale how-to */}
              <View style={styles.howToBox}>
                <Text style={styles.howToTitle}>▸ TAILSCALE QUICK SETUP</Text>
                <Text style={styles.howToText}>
                  {'1. '}INSTALL TAILSCALE ON YOUR PHONE + NODE PC{'\n'}
                  {'2. '}SIGN IN TO BOTH WITH THE SAME ACCOUNT{'\n'}
                  {'3. '}ON THE NODE PC, RUN:{'\n'}
                  {'     '}tailscale ip -4{'\n'}
                  {'     '}→ YOU'LL GET A 100.x.x.x ADDRESS{'\n'}
                  {'4. '}ADD TO YOUR CapStash.conf:{'\n'}
                  {'     '}server=1{'\n'}
                  {'     '}rpcbind=0.0.0.0{'\n'}
                  {'     '}rpcallowip=100.64.0.0/10{'\n'}
                  {'     '}rpcport=8332{'\n'}
                  {'5. '}RESTART YOUR QT NODE{'\n'}
                  {'6. '}ENTER THE 100.x.x.x ADDRESS BELOW + 8332 AS PORT{'\n'}
                </Text>
              </View>

              {/* ── IP Address ── */}
              <Text style={styles.fieldLabel}>IP ADDRESS</Text>
              <Text style={styles.fieldHint}>Your node's Tailscale IP — e.g. 100.64.0.1</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={ip}
                  onChangeText={t => { setIp(t); resetTestState(); }}
                  placeholder="100.x.x.x"
                  placeholderTextColor={Colors.greenDim}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="decimal-pad"
                  secureTextEntry={!showIp}
                />
                <TouchableOpacity
                  style={styles.togglePassBtn}
                  onPress={() => setShowIp(p => !p)}
                >
                  <Text style={styles.togglePassText}>{showIp ? 'HIDE' : 'SHOW'}</Text>
                </TouchableOpacity>
              </View>

              {/* ── Port ── */}
              <Text style={[styles.fieldLabel, styles.fieldSpacing]}>PORT</Text>
              <Text style={styles.fieldHint}>Default is 8332 — only change if you customised rpcport</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={port}
                  onChangeText={t => { setPort(t); resetTestState(); }}
                  placeholder="8332"
                  placeholderTextColor={Colors.greenDim}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="number-pad"
                  secureTextEntry={!showPort}
                />
                <TouchableOpacity
                  style={styles.togglePassBtn}
                  onPress={() => setShowPort(p => !p)}
                >
                  <Text style={styles.togglePassText}>{showPort ? 'HIDE' : 'SHOW'}</Text>
                </TouchableOpacity>
              </View>

              {/* ── Username ── */}
              <Text style={[styles.fieldLabel, styles.fieldSpacing]}>USERNAME</Text>
              <Text style={styles.fieldHint}>Matches rpcuser in your CapStash.conf</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={t => { setUsername(t); resetTestState(); }}
                placeholder="rpcuser"
                placeholderTextColor={Colors.greenDim}
                autoCapitalize="none"
                autoCorrect={false}
              />

              {/* ── Password ── */}
              <Text style={[styles.fieldLabel, styles.fieldSpacing]}>PASSWORD</Text>
              <Text style={styles.fieldHint}>Matches rpcpassword in your CapStash.conf</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={password}
                  onChangeText={t => { setPassword(t); resetTestState(); }}
                  placeholder="rpcpassword"
                  placeholderTextColor={Colors.greenDim}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!showPass}
                />
                <TouchableOpacity
                  style={styles.togglePassBtn}
                  onPress={() => setShowPass(p => !p)}
                >
                  <Text style={styles.togglePassText}>{showPass ? 'HIDE' : 'SHOW'}</Text>
                </TouchableOpacity>
              </View>

              {/* ── Test button ── */}
              <TouchableOpacity
                style={[
                  styles.testBtn,
                  testStatus === 'ok'   && styles.testBtnOk,
                  testStatus === 'fail' && styles.testBtnFail,
                ]}
                onPress={handleTest}
                disabled={testStatus === 'testing'}
              >
                {testStatus === 'testing'
                  ? <ActivityIndicator size="small" color={Colors.amber} />
                  : <Text style={[
                      styles.testBtnText,
                      testStatus === 'ok'   && { color: Colors.green },
                      testStatus === 'fail' && { color: Colors.red },
                    ]}>
                      {testStatus === 'ok'   ? '✓  CONNECTION OK' :
                       testStatus === 'fail' ? '✕  TEST FAILED'   :
                       '⚡  TEST CONNECTION'}
                    </Text>
                }
              </TouchableOpacity>

              {testMessage ? (
                <Text style={[
                  styles.testMessage,
                  { color: testStatus === 'ok' ? Colors.green : Colors.red },
                ]}>
                  {testMessage}
                </Text>
              ) : null}

              {/* ── Save button ── */}
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  saveStatus === 'saved' && styles.saveBtnOk,
                  saveStatus === 'error' && styles.saveBtnFail,
                ]}
                onPress={handleSave}
                disabled={saveStatus === 'saving'}
              >
                {saveStatus === 'saving'
                  ? <ActivityIndicator size="small" color={Colors.green} />
                  : <Text style={[
                      styles.saveBtnText,
                      saveStatus === 'saved' && { color: Colors.green },
                      saveStatus === 'error' && { color: Colors.red },
                    ]}>
                      {saveStatus === 'saved' ? '✓  CONFIG SAVED' :
                       saveStatus === 'error' ? '✕  CHECK ALL FIELDS' :
                       'SAVE CONFIG'}
                    </Text>
                }
              </TouchableOpacity>

              <Text style={styles.saveNote}>
                ▸ CREDENTIALS ARE ENCRYPTED ON YOUR DEVICE{'\n'}
                ▸ TEST THE CONNECTION FIRST, THEN SAVE{'\n'}
                ▸ SAVE UPDATES ALL SCREENS IMMEDIATELY
              </Text>
            </View>
          )}

          <View style={styles.divider} />

          {/* ════════════════════════════════════════════
              SECTION: WALLET SECURITY
          ════════════════════════════════════════════ */}
          <SectionHeader
            label="▸ WALLET SECURITY"
            open={activeSection === 'security'}
            onPress={() => toggleSection('security')}
          />
          {activeSection === 'security' && (
            <View style={styles.sectionBody}>
              <View style={styles.comingSoonCard}>
                <Text style={styles.comingSoonTitle}>⚠  COMING IN NEXT BUILD</Text>
                {[
                  'BIP39 SEED PHRASE GENERATION',
                  'SEED PHRASE IMPORT',
                  'PIN / BIOMETRIC LOCK',
                  'ENCRYPTED KEY STORAGE',
                  'BACKUP & RESTORE',
                ].map(item => (
                  <Text key={item} style={styles.comingSoonItem}>▸  {item}</Text>
                ))}
              </View>
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  ▸ CURRENTLY USING KEYS FROM YOUR QT NODE{'\n'}
                  ▸ DO NOT SHARE YOUR RPC PASSWORD{'\n'}
                  ▸ TAILSCALE ENCRYPTS ALL RPC TRAFFIC IN TRANSIT
                </Text>
              </View>
            </View>
          )}

          <View style={styles.divider} />

          {/* ════════════════════════════════════════════
              SECTION: ERROR REFERENCE
          ════════════════════════════════════════════ */}
          <SectionHeader
            label="▸ ERROR REFERENCE"
            open={activeSection === 'errors'}
            onPress={() => toggleSection('errors')}
          />
          {activeSection === 'errors' && (
            <View style={styles.sectionBody}>
              {[
                { code: 'ERR_01', title: 'NO NODE CONNECTION',  fix: 'Check Tailscale is active on both devices and the Qt node is running' },
                { code: 'ERR_02', title: 'NODE NOT SYNCED',     fix: 'Wait for chain sync to complete before mining or exploring' },
                { code: 'ERR_03', title: 'NO BLOCK TEMPLATE',   fix: 'Node must be fully synced to serve block templates for mining' },
                { code: 'ERR_04', title: 'CONFIG INCOMPLETE',   fix: 'Open Setup Menu and fill in all four node config fields' },
                { code: 'ERR_05', title: 'RPC AUTH FAILED',     fix: 'Username or password does not match your CapStash.conf — check both' },
                { code: 'ERR_06', title: 'RPC TIMEOUT',         fix: 'Tailscale not active, node offline, or wrong IP/port' },
              ].map(e => (
                <View key={e.code} style={styles.errorRow}>
                  <View style={styles.errorTop}>
                    <Text style={styles.errorCode}>{e.code}</Text>
                    <Text style={styles.errorTitle}>{e.title}</Text>
                  </View>
                  <Text style={styles.errorFix}>▸  {e.fix}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.divider} />

          {/* ════════════════════════════════════════════
              SECTION: APP INFO
          ════════════════════════════════════════════ */}
          <SectionHeader
            label="▸ APP INFO"
            open={activeSection === 'info'}
            onPress={() => toggleSection('info')}
          />
          {activeSection === 'info' && (
            <View style={styles.sectionBody}>
              {[
                ['APP',     'CAPSTASH WALLET'],
                ['VERSION', APP_VERSION],
                ['MODE',    currentMode],
                ['NETWORK', 'CAPSTASH MAINNET'],
                ['POW',     'WHIRLPOOL-512 XOR/256'],
                ['REWARD',  '1 CAP / BLOCK'],
                ['BLOCKS',  '60 SECOND TARGET'],
                ['SUPPLY',  '~90 BILLION CAP'],
              ].map(([label, value]) => (
                <View key={label} style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{label}</Text>
                  <Text style={styles.infoValue}>{value}</Text>
                </View>
              ))}
              <Text style={[styles.infoText, { marginTop: 10, textAlign: 'center' }]}>
                WALLET OF THE WASTELAND · STACK CAPS. SURVIVE.
              </Text>
            </View>
          )}

          <View style={{ height: 48 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Section Header ────────────────────────────────────────
function SectionHeader({ label, open, onPress }) {
  return (
    <TouchableOpacity style={styles.sectionHeaderRow} onPress={onPress}>
      <Text style={[styles.sectionHeaderText, open && { color: Colors.green }]}>{label}</Text>
      <Text style={[styles.sectionArrow, open && { color: Colors.green }]}>{open ? '▲' : '▼'}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  header: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'flex-start',
    paddingHorizontal: 16,
    paddingTop:        52,
    paddingBottom:     12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.green,
    backgroundColor:   Colors.surfaceLight,
  },
  headerTitle: {
    ...Typography.large,
    color:            Colors.green,
    textShadowColor:  Colors.green,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
    letterSpacing:    4,
  },
  headerSub: {
    ...Typography.micro,
    color:         Colors.greenDim,
    letterSpacing: 2,
    marginTop:     2,
  },
  closeBtn: {
    borderWidth:       1,
    borderColor:       Colors.borderDim,
    paddingHorizontal: 10,
    paddingVertical:   6,
  },
  closeBtnText: {
    ...Typography.small,
    color:         Colors.greenDim,
    letterSpacing: 1,
  },
  scroll: {
    flex:    1,
    padding: 14,
  },
  modeBanner: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    borderWidth:     1,
    backgroundColor: Colors.surface,
    padding:         14,
    marginBottom:    8,
  },
  modeTag: {
    ...Typography.micro,
    color:         Colors.greenDim,
    letterSpacing: 2,
    marginBottom:  2,
  },
  modeName: {
    ...Typography.huge,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  modeDesc: {
    ...Typography.tiny,
    color:         Colors.greenDim,
    letterSpacing: 1,
    marginTop:     2,
  },
  modeStatus: {
    alignItems: 'center',
    gap:        4,
  },
  statusDot: {
    width:        12,
    height:       12,
    borderRadius: 6,
  },
  statusLabel: {
    ...Typography.micro,
    letterSpacing: 1,
  },
  wandererCard: {
    borderWidth:     1,
    borderColor:     Colors.amberDim,
    borderStyle:     'dashed',
    backgroundColor: Colors.surface,
    padding:         10,
    marginBottom:    10,
  },
  wandererTitle: {
    ...Typography.labelSmall,
    color:         Colors.amberDim,
    letterSpacing: 1,
    marginBottom:  4,
  },
  wandererDesc: {
    ...Typography.micro,
    color:      Colors.amberDim,
    lineHeight: 15,
  },
  divider: {
    height:          1,
    backgroundColor: Colors.border,
    marginVertical:  2,
  },
  sectionHeaderRow: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingVertical:   12,
    paddingHorizontal: 2,
  },
  sectionHeaderText: {
    ...Typography.labelSmall,
    color:         Colors.greenDim,
    letterSpacing: 2,
  },
  sectionArrow: {
    ...Typography.small,
    color: Colors.greenDim,
  },
  sectionBody: {
    paddingBottom: 12,
  },
  howToBox: {
    borderWidth:     1,
    borderColor:     Colors.border,
    backgroundColor: Colors.surface,
    padding:         12,
    marginBottom:    14,
  },
  howToTitle: {
    ...Typography.labelSmall,
    color:         Colors.amber,
    letterSpacing: 2,
    marginBottom:  6,
  },
  howToText: {
    ...Typography.micro,
    color:      Colors.greenDim,
    lineHeight: 17,
  },
  fieldLabel: {
    ...Typography.micro,
    color:         Colors.green,
    letterSpacing: 2,
    marginBottom:  3,
  },
  fieldHint: {
    ...Typography.micro,
    color:         Colors.greenDim,
    letterSpacing: 0.5,
    marginBottom:  5,
    fontSize:      9,
  },
  fieldSpacing: {
    marginTop: 14,
  },
  input: {
    backgroundColor: Colors.black,
    borderWidth:     1,
    borderColor:     Colors.borderDim,
    color:           Colors.green,
    fontFamily:      'ShareTechMono-Regular',
    fontSize:        14,
    padding:         10,
    letterSpacing:   1,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems:    'stretch',
    gap:           6,
  },
  passwordInput: {
    flex: 1,
  },
  togglePassBtn: {
    borderWidth:       1,
    borderColor:       Colors.borderDim,
    paddingHorizontal: 10,
    justifyContent:    'center',
  },
  togglePassText: {
    ...Typography.micro,
    color:         Colors.greenDim,
    letterSpacing: 1,
  },
  testBtn: {
    marginTop:      14,
    borderWidth:    1,
    borderColor:    Colors.amberDim,
    padding:        11,
    alignItems:     'center',
    minHeight:      40,
    justifyContent: 'center',
  },
  testBtnOk:   { borderColor: Colors.green },
  testBtnFail: { borderColor: Colors.red   },
  testBtnText: {
    ...Typography.labelSmall,
    color:         Colors.amber,
    letterSpacing: 2,
  },
  testMessage: {
    ...Typography.micro,
    marginTop:     6,
    letterSpacing: 1,
    textAlign:     'center',
    lineHeight:    14,
  },
  saveBtn: {
    marginTop:      8,
    borderWidth:    1,
    borderColor:    Colors.green,
    padding:        11,
    alignItems:     'center',
    minHeight:      40,
    justifyContent: 'center',
  },
  saveBtnOk:   { backgroundColor: Colors.greenDark, borderColor: Colors.green },
  saveBtnFail: { borderColor: Colors.red },
  saveBtnText: {
    ...Typography.labelSmall,
    color:         Colors.green,
    letterSpacing: 2,
  },
  saveNote: {
    ...Typography.micro,
    color:         Colors.greenDim,
    marginTop:     8,
    lineHeight:    16,
    letterSpacing: 0.5,
  },
  infoBox: {
    borderWidth:     1,
    borderColor:     Colors.border,
    backgroundColor: Colors.surface,
    padding:         10,
    marginTop:       8,
  },
  infoText: {
    ...Typography.micro,
    color:      Colors.greenDim,
    lineHeight: 16,
  },
  comingSoonCard: {
    borderWidth:     1,
    borderColor:     Colors.amberDim,
    backgroundColor: Colors.surface,
    padding:         12,
  },
  comingSoonTitle: {
    ...Typography.labelSmall,
    color:         Colors.amber,
    letterSpacing: 2,
    marginBottom:  8,
  },
  comingSoonItem: {
    ...Typography.tiny,
    color:         Colors.amberDim,
    letterSpacing: 1,
    marginBottom:  5,
  },
  errorRow: {
    borderWidth:     1,
    borderColor:     Colors.border,
    backgroundColor: Colors.surface,
    padding:         10,
    marginBottom:    4,
  },
  errorTop: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
    marginBottom:  4,
  },
  errorCode: {
    ...Typography.labelSmall,
    color:         Colors.amber,
    letterSpacing: 2,
  },
  errorTitle: {
    ...Typography.small,
    color:         Colors.green,
    letterSpacing: 1,
  },
  errorFix: {
    ...Typography.micro,
    color:      Colors.greenDim,
    lineHeight: 14,
  },
  infoRow: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    padding:         8,
    borderWidth:     1,
    borderColor:     Colors.border,
    backgroundColor: Colors.surface,
    marginBottom:    3,
  },
  infoLabel: {
    ...Typography.tiny,
    color:         Colors.greenDim,
    letterSpacing: 1,
  },
  infoValue: {
    ...Typography.small,
    color:         Colors.green,
    letterSpacing: 1,
  },
});