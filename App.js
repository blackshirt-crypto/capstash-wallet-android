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
import { getBlockCount, getMiningInfo, getNetworkHashPs, loadAppMode } from './services/rpc';
import Colors    from './theme/colors';
import Typography from './theme/typography';

const Tab = createBottomTabNavigator();

// ── App mode ─────────────────────────────────────────────────
// 'DRIFTER'  = companion wallet via Tailscale node
// 'WANDERER' = self-contained node (future)

// ── Default node config ──────────────────────────────────────
const DEFAULT_NODE = {
  ip:          '100.x.x.x',    // ← your Tailscale IP here (no port)
  port:        '8332',         // ← port as its own field
  rpcuser:     'capstashuser', // ← your rpcuser
  rpcpassword: 'wasteland',    // ← your rpcpassword
};

export default function App() {
  const [blockHeight, setBlockHeight] = useState(0);
  const [networkHash, setNetworkHash] = useState(0);
  const [difficulty,  setDifficulty]  = useState(0);
  const [isOnline,    setIsOnline]    = useState(true);
  const [showManual,  setShowManual]  = useState(false);
  const [showSetup,   setShowSetup]   = useState(false);
  const [nodeConfig,  setNodeConfig]  = useState(DEFAULT_NODE);
  const [appMode,     setAppMode]     = useState('DRIFTER');

  const tickerAnim = useRef(new Animated.Value(0)).current;
  const blinkAnim  = useRef(new Animated.Value(1)).current;

  // ── Load persisted app mode on boot ─────────────────────
  useEffect(() => {
    loadAppMode().then(m => { if (m) setAppMode(m); });
  }, []);

  // ── Ticker — seamless looping ────────────────────────────
  useEffect(() => {
    Animated.loop(
      Animated.timing(tickerAnim, {
        toValue:         1,
        duration:        30000,
        easing:          Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  // ── Cursor blink ─────────────────────────────────────────
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ── Poll node stats ──────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const [h, mining, hashps] = await Promise.all([
          getBlockCount(nodeConfig),
          getMiningInfo(nodeConfig),
          getNetworkHashPs(nodeConfig),
        ]);
        setBlockHeight(h);
        setDifficulty(mining?.difficulty || 0);
        setNetworkHash(hashps || 0);
        setIsOnline(true);
      } catch {
        setIsOnline(false);
      }
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, [nodeConfig]);

  // ── Formatters ───────────────────────────────────────────
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

  const statusColor = isOnline ? Colors.green : Colors.red;

  // Duplicate the segment so the loop seam is invisible
  const tickerSegment = `  ⚠  BLK #${blockHeight}   NET ${formatHash(networkHash)}   DIFF ${formatDiff(difficulty)}   STAY VIGILANT ${appMode}   `;
  const tickerText    = tickerSegment + tickerSegment;
  const tickerWidth   = tickerText.length * 7.2;

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.black} />
        <SafeAreaView style={styles.container} edges={['top']}>

          {/* ── App Header ── */}
          <View style={styles.header}>
            {/* Left — logo */}
            <View>
              <Text style={styles.logo}>CapStash</Text>
              <Text style={styles.logoSub}>WALLET OF THE WASTELAND</Text>
            </View>
            {/* Right — mode indicator + B.S.G. */}
            <View style={styles.headerRight}>
              {/* Mode/status — tap opens setup menu */}
              <TouchableOpacity
                style={styles.statusRow}
                onPress={() => setShowSetup(true)}
              >
                <Text style={[styles.modeText, { color: statusColor, textShadowColor: statusColor }]}>
                  {appMode}
                </Text>
              </TouchableOpacity>
              {/* Banjo's Survival Guide */}
              <TouchableOpacity style={styles.manualBtn} onPress={() => setShowManual(true)}>
                <Text style={styles.manualBtnText}>B.S.G.</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Ticker — seamless continuous scroll ── */}
          <View style={styles.ticker}>
            <Animated.Text
              numberOfLines={1}
              style={[
                styles.tickerText,
                {
                  transform: [{
                    translateX: tickerAnim.interpolate({
                      inputRange:  [0, 1],
                      outputRange: [0, -(tickerWidth / 2)],
                    }),
                  }],
                },
              ]}
            >
              {tickerText}
            </Animated.Text>
          </View>

          {/* ── Tab Navigation ── */}
          <Tab.Navigator
            screenOptions={({ route }) => ({
              headerShown:             false,
              tabBarStyle:             styles.tabBar,
              tabBarActiveTintColor:   Colors.green,
              tabBarInactiveTintColor: Colors.greenDim,
              tabBarLabelStyle:        styles.tabLabel,
              tabBarIcon: ({ focused }) => {
                const icons = {
                  VAULT:        '⬡',
                  'P.B.G.':     '⚒',
                  'B.D.T.':     '⛓',
                  SIGNAL:       '∿',
                  'SURVIVOR %': '↯',
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
            <Tab.Screen name="SURVIVOR%">
              {() => <SoloScreen nodeConfig={nodeConfig} />}
            </Tab.Screen>
          </Tab.Navigator>

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
    flex: 1,
    backgroundColor: Colors.black,
  },

  // ── Header ──
  header: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'flex-start',
    paddingHorizontal: 16,
    paddingTop:        10,
    paddingBottom:     8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDim,
    backgroundColor:   Colors.surfaceLight,
  },
  logo: {
    ...Typography.large,
    color:            Colors.green,
    textShadowColor:  Colors.green,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
    letterSpacing:    4,
  },
  logoSub: {
    ...Typography.micro,
    color:         Colors.greenDim,
    marginTop:     2,
    letterSpacing: 1.5,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap:        6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  modeText: {
    ...Typography.heading,
    fontSize:         22,
    letterSpacing:    3,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  manualBtn: {
    borderWidth:       1,
    borderColor:       Colors.borderDim,
    paddingHorizontal: 6,
    paddingVertical:   2,
  },
  manualBtnText: {
    ...Typography.micro,
    color:         Colors.greenDim,
    letterSpacing: 1,
  },

  // ── Ticker ──
  ticker: {
    backgroundColor:   '#1a0500',
    borderTopWidth:    1,
    borderTopColor:    '#3a0a00',
    borderBottomWidth: 1,
    borderBottomColor: '#3a0a00',
    paddingVertical:   4,
    overflow:          'hidden',
    height:            22,
  },
  tickerText: {
    ...Typography.tiny,
    color:         Colors.amber,
    letterSpacing: 1,
    position:      'absolute',
  },

  // ── Tabs ──
  tabBar: {
    backgroundColor: Colors.surfaceLight,
    borderTopWidth:  1,
    borderTopColor:  Colors.borderDim,
    paddingTop:      4,
    height:          64,
  },
  tabLabel: {
    ...Typography.micro,
    letterSpacing: 1,
    marginBottom:  2,
  },
});