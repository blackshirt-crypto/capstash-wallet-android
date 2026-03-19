// App.js
// CapStash Wallet — Wallet of the Wasteland
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Animated,
  StatusBar, StyleSheet, Easing,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import WalletScreen   from './screens/WalletScreen';
import MinerScreen    from './screens/MinerScreen';
import ExplorerScreen from './screens/ExplorerScreen';
import NetworkScreen  from './screens/NetworkScreen';
import SoloScreen     from './screens/SoloScreen';
import FieldManual    from './components/FieldManual';
import SetupMenu      from './components/Setupmenu';
import { getBlockCount, getMiningInfo, loadAppMode, loadNodeConfig } from './services/rpc';
import Colors    from './theme/colors';
import Typography from './theme/typography';

const Tab = createBottomTabNavigator();

const DEFAULT_NODE = {
  ip:          '100.x.x.x',
  port:        '8332',
  rpcuser:     'capstashuser',
  rpcpassword: 'wasteland',
};

export default function App() {
  const [blockHeight, setBlockHeight] = useState(0);
  const [networkHash, setNetworkHash] = useState(0);
  const [difficulty,  setDifficulty]  = useState(0);
  const [isOnline,    setIsOnline]    = useState(true);
  const [showManual,  setShowManual]  = useState(false);
  const [showSetup,   setShowSetup]   = useState(false);
  const [nodeConfig,  setNodeConfig]  = useState(null);
  const [appMode,     setAppMode]     = useState('DRIFTER');
  const [configReady, setConfigReady] = useState(false);

  const tickerAnim = useRef(new Animated.Value(0)).current;

  // ── Load persisted app mode on boot ───────────────────────
  useEffect(() => {
    loadAppMode().then(m => {
      if (!m) return;
      if (m === 'connected'  || m === 'DRIFTER')  { setAppMode('DRIFTER');  return; }
      if (m === 'standalone' || m === 'WANDERER') { setAppMode('WANDERER'); return; }
      setAppMode('DRIFTER');
    });
  }, []);

  // ── Load persisted node config on boot ────────────────────
  useEffect(() => {
    loadNodeConfig().then(cfg => {
      if (cfg) setNodeConfig(cfg);
      else setNodeConfig(DEFAULT_NODE);
      setConfigReady(true);
    });
  }, []);

  // ── Poll node stats ────────────────────────────────────────
  useEffect(() => {
    if (!configReady || !nodeConfig) return;
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
      } catch {
        setIsOnline(false);
      }
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, [nodeConfig, configReady]);

  // ── Formatters ─────────────────────────────────────────────
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

  const statusColor = isOnline ? Colors.green : Colors.amber;

  // Ticker — scrolls from right edge across screen, resets on data refresh
  const tickerSegment = `◈ NET ${formatHash(networkHash)}--DIFF ${formatDiff(difficulty)}--BLK #${blockHeight}---STAY VIGILANT · STAY SAFE · STACK CAPS---`;
  const TICKER_SCROLL = tickerSegment.length * 10.0;

  // Reset and restart ticker on every data update
  useEffect(() => {
    tickerAnim.setValue(0);
    Animated.timing(tickerAnim, {
      toValue:         1,
      duration:        60000,
      easing:          Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [networkHash, difficulty, blockHeight]);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.black} />
        <SafeAreaView style={styles.container} edges={['top']}>

          {/* ── App Header ── */}
          <View style={styles.header}>

            {/* Left — logo */}
            <View style={styles.logoBlock}>
              <Text style={styles.logo}>CapStash</Text>
            </View>

            {/* Right — mode indicator + B.S.G. */}
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={styles.statusRow}
                onPress={() => setShowSetup(true)}
              >
                <Text style={[styles.statusIcon, { color: statusColor }]}>☢</Text>
                <Text style={[
                  styles.modeText,
                  { color: statusColor, textShadowColor: statusColor },
                ]}>
                  {appMode}
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
                {() => <WalletScreen nodeConfig={nodeConfig} isOnline={isOnline} />}
              </Tab.Screen>
              <Tab.Screen name="P.B.G.">
                {() => <MinerScreen nodeConfig={nodeConfig} isOnline={isOnline} />}
              </Tab.Screen>
              <Tab.Screen name="B.D.T.">
                {() => <ExplorerScreen nodeConfig={nodeConfig} />}
              </Tab.Screen>
              <Tab.Screen name="SIGNAL">
                {() => <NetworkScreen nodeConfig={nodeConfig} />}
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
        />

        {/* ── Banjo's Survival Guide ── */}
        <FieldManual visible={showManual} onClose={() => setShowManual(false)} />

      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: Colors.black,
  },

  // ── Init screen ─────────────────────────────────────────────
  initContainer: {
    flex:            1,
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: Colors.black,
  },
  initText: {
    fontFamily:    'ShareTechMono',
    fontSize:      14,
    color:         Colors.green,
    letterSpacing: 3,
  },

  // ── Header ──────────────────────────────────────────────────
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
  logoBlock: {
    flexDirection: 'column',
  },
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
  logoSub: {
    fontFamily:    'ShareTechMono',
    fontSize:      13,
    letterSpacing: 2,
    marginTop:     1,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap:        8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },
  statusIcon: {
    fontSize: 20,
  },
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

  // ── Ticker ──────────────────────────────────────────────────
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

  // ── Tabs ────────────────────────────────────────────────────
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