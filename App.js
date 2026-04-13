// App.js v2.5
// CapStash Wallet — Wallet of the Wasteland
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Animated,
  StatusBar, StyleSheet, Easing,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import WalletScreen     from './screens/WalletScreen';
import MinerScreen      from './screens/MinerScreen';
import ExplorerScreen   from './screens/ExplorerScreen';
import NetworkScreen    from './screens/NetworkScreen';
import SoloScreen       from './screens/SoloScreen';
import ModeSelectScreen    from './screens/ModeSelectScreen';
import SeedGenerateScreen  from './screens/SeedGenerateScreen';
import SeedVerifyScreen    from './screens/SeedVerifyScreen';
import SeedRestoreScreen   from './screens/SeedRestoreScreen';
import FieldManual      from './components/FieldManual';
import SetupMenu        from './components/Setupmenu';
import { getBlockCount, getMiningInfo, getBlockchainInfo, loadNodeConfig } from './services/rpc';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  setAppMode as persistMode, clearAppMode, loadAppMode,
  MODE_WANDERER, MODE_DRIFTER, WANDERER_NODE_CONFIG,
} from './services/appMode';
import { ensureWandererWallet } from './services/walletManager';
import { startNode } from './services/nodeService';
import Colors from './theme/colors';

const Tab = createBottomTabNavigator();

const DEFAULT_NODE = {
  ip:          '100.x.x.x',
  port:        '8332',
  rpcuser:     'capstashuser',
  rpcpassword: 'wasteland',
};

// ── Node sync status for header indicator ─────────────────
// RED   = node not running / no connection
// AMBER = connected but still syncing (verificationprogress < 0.95)
// GREEN = fully synced (verificationprogress >= 0.95)
const NODE_STATUS = {
  RED:   'red',
  AMBER: 'amber',
  GREEN: 'green',
};

export default function App() {
  const [blockHeight, setBlockHeight] = useState(0);
  const [networkHash, setNetworkHash] = useState(0);
  const [difficulty,  setDifficulty]  = useState(0);
  const [isOnline,    setIsOnline]    = useState(true);
  const [showManual,  setShowManual]  = useState(false);
  const [showSetup,   setShowSetup]   = useState(false);
  const [nodeConfig,  setNodeConfig]  = useState(DEFAULT_NODE);
  const [appMode,     setAppMode]     = useState(null);
  const [configReady, setConfigReady] = useState(false);
  const [seedPhase,   setSeedPhase]   = useState(null);
  const [pendingSeed, setPendingSeed] = useState(null);

  // ── Wanderer wallet state ──────────────────────────────
  const [walletAddress, setWalletAddress] = useState(null);
  const [walletReady,   setWalletReady]   = useState(false);

  // ── Node sync status — drives ☢ icon color ────────────
  const [nodeStatus, setNodeStatus] = useState(NODE_STATUS.RED);

  const tickerAnim = useRef(new Animated.Value(0)).current;

  // ── Load persisted app mode on boot ───────────────────
  useEffect(() => {
    loadAppMode().then(m => {
      console.log('[App] loadAppMode returned:', JSON.stringify(m));
      if (!m) { setAppMode(null); return; }
      if (m === 'connected' || m === 'standalone') {
        clearAppMode().then(() => setAppMode(null));
        return;
      }
      if (m === MODE_DRIFTER)  { setAppMode(MODE_DRIFTER);  return; }
      if (m === MODE_WANDERER) { setAppMode(MODE_WANDERER); return; }
      setAppMode(null);
    });
  }, []);

  // ── Load persisted node config on boot ────────────────
  useEffect(() => {
    loadNodeConfig().then(cfg => {
      if (cfg && typeof cfg === 'object') setNodeConfig(cfg);
      else setNodeConfig(DEFAULT_NODE);
      setConfigReady(true);
    });
  }, []);

  // ── Wanderer mode — override nodeConfig to localhost ──
  useEffect(() => {
    if (!appMode) return;
    if (appMode === MODE_WANDERER) {
      setNodeConfig({
        ip:           WANDERER_NODE_CONFIG.host,
        port:         String(WANDERER_NODE_CONFIG.port),
        rpcuser:      WANDERER_NODE_CONFIG.user,
        rpcpassword:  WANDERER_NODE_CONFIG.pass,
        wandererMode: true,
      });
    }
  }, [appMode]);

  // ── Wanderer boot — start node then init wallet ────────
  // Does NOT block the UI. Wallet screen loads immediately.
  // ensureWandererWallet runs after a 5s delay to give capstashd time to start.
  useEffect(() => {
    if (appMode !== MODE_WANDERER || !configReady || seedPhase !== null) return;

    const wandererCfg = {
      ip:           WANDERER_NODE_CONFIG.host,
      port:         String(WANDERER_NODE_CONFIG.port),
      rpcuser:      WANDERER_NODE_CONFIG.user,
      rpcpassword:  WANDERER_NODE_CONFIG.pass,
      wandererMode: true,
    };

    console.log('[App] Wanderer boot — starting node...');

    // Start capstashd, wait 5s, then attempt wallet init
    startNode()
      .catch(e => console.warn('[App] startNode error:', e.message))
      .then(() => new Promise(resolve => setTimeout(resolve, 5000)))
      .then(() => ensureWandererWallet(wandererCfg, pendingSeed))
      .then(result => {
        console.log('[App] ensureWandererWallet result:', JSON.stringify(result));
        if (result.ready) {
          setWalletAddress(result.address);
          setWalletReady(true);
        } else {
          // Wallet init failed — not fatal, user can still see the screen.
          // Node status indicator will show RED until node comes up.
          console.warn('[App] Wallet init failed:', result.error);
        }
      })
      .catch(e => console.error('[App] Wanderer boot error:', e.message));

  }, [appMode, configReady, seedPhase, pendingSeed]);

  // ── Handle mode selection ──────────────────────────────
  const handleModeSelected = async (mode) => {
    if (mode === MODE_WANDERER) {
      // Check if wanderer wallet was already created before
      const alreadyInit = await AsyncStorage.getItem('@capstash_wanderer_wallet_init');
      if (alreadyInit === 'true') {
        // Wallet exists — skip seed flow, go straight to main app
        await persistMode(MODE_WANDERER);
        setAppMode(MODE_WANDERER);
        return;
      }
      // First time Wanderer — go through seed phrase flow before booting
      setSeedPhase('generate');
      setAppMode(MODE_WANDERER);
      return;
    }
    await persistMode(mode);
    if (mode === MODE_DRIFTER) {
      setWalletAddress(null);
      setWalletReady(false);
      setNodeStatus(NODE_STATUS.RED);
      const cfg = await loadNodeConfig();
      if (cfg && !cfg.wandererMode) setNodeConfig(cfg);
      else setNodeConfig(DEFAULT_NODE);
    }
    setAppMode(mode);
  };

  // ── Poll node stats ────────────────────────────────────
  useEffect(() => {
    if (!configReady || !nodeConfig || !appMode) return;

    const poll = async () => {
      try {
        const [h, mining] = await Promise.all([
          getBlockCount(nodeConfig),
          getMiningInfo(nodeConfig),
        ]);
        setBlockHeight(h);
        setDifficulty(mining?.difficulty     || 0);
        setNetworkHash(mining?.networkhashps || 0);
        setIsOnline(true);

        // ── Wanderer: also check sync progress for status dot ──
        if (appMode === MODE_WANDERER) {
          try {
            const chainInfo = await getBlockchainInfo(nodeConfig);
            const progress = chainInfo?.verificationprogress || 0;
            if (progress >= 0.95) {
              setNodeStatus(NODE_STATUS.GREEN);
            } else {
              setNodeStatus(NODE_STATUS.AMBER);
            }
          } catch {
            // getblockchaininfo failed — node up but chain info unavailable
            setNodeStatus(NODE_STATUS.AMBER);
          }
        } else {
          // Drifter — online = green
          setNodeStatus(NODE_STATUS.GREEN);
        }

      } catch {
        setIsOnline(false);
        setNodeStatus(NODE_STATUS.RED);
      }
    };

    poll();
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, [nodeConfig, configReady, appMode]);

  // ── Formatters ─────────────────────────────────────────
  const formatHash = (hs) => {
    if (!hs || hs === 0) return '-- H/s';
    if (hs >= 1e9) return `${(hs / 1e9).toFixed(2)} GH/s`;
    if (hs >= 1e6) return `${(hs / 1e6).toFixed(2)} MH/s`;
    if (hs >= 1e3) return `${(hs / 1e3).toFixed(0)} KH/s`;
    return `${hs.toFixed(0)} H/s`;
  };

  const formatDiff = (d) => {
    if (!d || d === 0) return '--';
    if (d >= 1e9) return `${(d / 1e9).toFixed(3)}B`;
    if (d >= 1e6) return `${(d / 1e6).toFixed(3)}M`;
    if (d >= 1e3) return `${(d / 1e3).toFixed(3)}K`;
    return d.toFixed(3);
  };

  // ── Node status dot color ──────────────────────────────
  const statusColor =
    nodeStatus === NODE_STATUS.GREEN ? Colors.green :
    nodeStatus === NODE_STATUS.AMBER ? Colors.amber :
    Colors.red;

  const tickerSegment = `◈ NET ${formatHash(networkHash)}--DIFF ${formatDiff(difficulty)}--BLK #${blockHeight}---STAY VIGILANT · STAY SAFE · STACK CAPS---`;
  const TICKER_SCROLL = tickerSegment.length * 10.0;

  useEffect(() => {
    tickerAnim.setValue(0);
    Animated.timing(tickerAnim, {
      toValue:         1,
      duration:        60000,
      easing:          Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [networkHash, difficulty, blockHeight]);

  // ── Mode not yet chosen ────────────────────────────────
  if (configReady && appMode === null) {
    return (
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar barStyle="dark-content" backgroundColor={Colors.black} />
          <ModeSelectScreen onModeSelected={handleModeSelected} />
        </NavigationContainer>
      </SafeAreaProvider>
    );
  }

  if (seedPhase === 'generate') {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.black} />
        <SeedGenerateScreen
          onSeedConfirmed={(mnemonic) => {
            setPendingSeed(mnemonic);
            setSeedPhase('verify');
          }}
          onRestoreInstead={() => setSeedPhase('restore')}
        />
      </SafeAreaProvider>
    );
  }

  if (seedPhase === 'verify') {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.black} />
        <SeedVerifyScreen
          mnemonic={pendingSeed}
          onBack={() => setSeedPhase('generate')}
          onVerified={async () => {
            await persistMode(MODE_WANDERER);
            setSeedPhase(null);
          }}
        />
      </SafeAreaProvider>
    );
  }

  if (seedPhase === 'restore') {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.black} />
        <SeedRestoreScreen
          onBack={() => setSeedPhase('generate')}
          onSeedRestored={async (mnemonic) => {
            setPendingSeed(mnemonic);
            await persistMode(MODE_WANDERER);
            setSeedPhase(null);
          }}
        />
      </SafeAreaProvider>
    );
  }

  // ── Main app — loads immediately regardless of mode ────
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.black} />
        <SafeAreaView style={styles.container} edges={['top']}>

          {/* ── App Header ── */}
          <View style={styles.header}>
            <View style={styles.logoBlock}>
              <Text style={styles.logo}>CapStash</Text>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={styles.statusRow}
                onPress={() => setShowSetup(true)}
              >
                {/* ☢ icon color = RED/AMBER/GREEN based on node sync status */}
                <Text style={[styles.statusIcon, { color: statusColor }]}>☢</Text>
                <Text style={[
                  styles.modeText,
                  { color: statusColor, textShadowColor: statusColor },
                ]}>
                  {appMode || 'DRIFTER'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.manualBtn} onPress={() => setShowManual(true)}>
                <Text style={styles.manualBtnText}>B.S.G.</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Ticker ── */}
          <View style={styles.ticker}>
            <Animated.Text
              style={[
                styles.tickerText,
                {
                  transform: [{
                    translateX: tickerAnim.interpolate({
                      inputRange:  [0, 1],
                      outputRange: [400, -(TICKER_SCROLL + 400)],
                    }),
                  }],
                },
              ]}
            >
              {tickerSegment}
            </Animated.Text>
          </View>

          {/* ── Tab Navigation ── */}
          {!configReady ? (
            <View style={styles.initContainer}>
              <Text style={styles.initText}>INITIALIZING...</Text>
            </View>
          ) : (
            <Tab.Navigator
              screenOptions={({ route }) => ({
                headerShown:             false,
                tabBarStyle:             styles.tabBar,
                tabBarActiveTintColor:   Colors.green,
                tabBarInactiveTintColor: Colors.greenDim,
                tabBarLabelStyle:        styles.tabLabel,
                tabBarIcon: ({ focused }) => {
                  const icons = {
                    VAULT:    '⬡',
                    'P.B.G.': '⚒',
                    'B.D.T.': '⛓',
                    SIGNAL:   '∿',
                    SURVIVOR: '↯',
                  };
                  return (
                    <Text style={{
                      fontSize: focused ? 32 : 22,
                      color:    focused ? Colors.green : Colors.greenDim,
                      opacity:  focused ? 1 : 0.6,
                    }}>
                      {icons[route.name]}
                    </Text>
                  );
                },
              })}
            >
              <Tab.Screen name="VAULT">
                {() => (
                  <WalletScreen
                    nodeConfig={nodeConfig}
                    isOnline={isOnline}
                    appMode={appMode}
                    walletReady={walletReady || appMode === MODE_DRIFTER}
                    wandererAddress={walletAddress}
                  />
                )}
              </Tab.Screen>
              <Tab.Screen name="P.B.G.">
                {() => (
                  <MinerScreen
                    nodeConfig={nodeConfig}
                    isOnline={isOnline}
                    appMode={appMode}
                  />
                )}
              </Tab.Screen>
              <Tab.Screen name="B.D.T.">
                {() => <ExplorerScreen nodeConfig={nodeConfig} />}
              </Tab.Screen>
              <Tab.Screen name="SIGNAL">
                {() => (
                  <NetworkScreen
                    nodeConfig={nodeConfig}
                    appMode={appMode}
                  />
                )}
              </Tab.Screen>
              <Tab.Screen name="SURVIVOR">
                {() => <SoloScreen nodeConfig={nodeConfig} />}
              </Tab.Screen>
            </Tab.Navigator>
          )}

        </SafeAreaView>

        {/* ── Setup Menu ── */}
        <SetupMenu
          visible={showSetup}
          onClose={() => setShowSetup(false)}
          isOnline={isOnline}
          nodeConfig={nodeConfig}
          appMode={appMode}
          onNodeConfigChange={setNodeConfig}
          onModeChange={handleModeSelected}
        />

        <FieldManual visible={showManual} onClose={() => setShowManual(false)} />

      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: Colors.black },
  initContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.black },
  initText:      { fontFamily: 'ShareTechMono', fontSize: 14, color: Colors.green, letterSpacing: 3 },

  // ── Header ──
  header: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingTop:        10,
    paddingBottom:     10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDim,
    backgroundColor:   Colors.surfaceLight,
  },
  logoBlock:   { flexDirection: 'column' },
  logo: {
    fontFamily:       'ShareTechMono',
    fontSize:         38,
    color:            Colors.green,
    textShadowColor:  Colors.green,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
    letterSpacing:    4,
    lineHeight:       44,
  },
  headerRight: { alignItems: 'flex-end', gap: 8 },
  statusRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusIcon:  { fontSize: 20 },
  modeText: {
    fontFamily:       'ShareTechMono',
    fontSize:         22,
    letterSpacing:    3,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  manualBtn: {
    borderWidth:       1,
    borderColor:       Colors.borderDim,
    paddingHorizontal: 10,
    paddingVertical:   5,
  },
  manualBtnText: {
    fontFamily:    'ShareTechMono',
    fontSize:      13,
    color:         Colors.greenDim,
    letterSpacing: 2,
  },

  // ── Ticker ──
  ticker: {
    backgroundColor:   '#1a0500',
    borderTopWidth:    1,
    borderTopColor:    '#3a0a00',
    borderBottomWidth: 1,
    borderBottomColor: '#3a0a00',
    height:            26,
    overflow:          'hidden',
  },
  tickerText: {
    fontFamily:    'ShareTechMono',
    fontSize:      12,
    color:         Colors.amber,
    letterSpacing: 1,
    lineHeight:    26,
    position:      'absolute',
    top:           0,
    width:         2000,
  },

  // ── Tab bar ──
  tabBar: {
    backgroundColor: Colors.surfaceLight,
    borderTopWidth:  1,
    borderTopColor:  Colors.borderDim,
    paddingTop:      4,
    height:          64,
  },
  tabLabel: {
    fontFamily:    'ShareTechMono',
    fontSize:      10,
    letterSpacing: 1,
    marginBottom:  2,
  },
});