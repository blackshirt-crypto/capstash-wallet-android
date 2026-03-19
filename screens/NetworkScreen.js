// screens/NetworkScreen.js
// N.U.K.A — Network tab: hashrate graph, difficulty, peers, chain stats

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, RefreshControl, StyleSheet, Dimensions,
} from 'react-native';
import Svg, { Path, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import {
  getBlockchainInfo, getNetworkInfo, getMiningInfo, getMempoolInfo,
} from '../services/rpc';
import Colors from '../theme/colors';
import { Typography, Fonts } from '../theme/typography';

const GRAPH_HISTORY = 24;

export default function NetworkScreen({ nodeConfig }) {
  const [chainInfo,   setChainInfo]   = useState(null);
  const [netInfo,     setNetInfo]     = useState(null);
  const [miningInfo,  setMiningInfo]  = useState(null);
  const [mempoolInfo, setMempoolInfo] = useState(null);
  const [hashHistory, setHashHistory] = useState([]);
  const [refreshing,  setRefreshing]  = useState(false);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [chain, net, mining, mempool] = await Promise.all([
        getBlockchainInfo(nodeConfig),
        getNetworkInfo(nodeConfig),
        getMiningInfo(nodeConfig),
        getMempoolInfo(nodeConfig),
      ]);
      setChainInfo(chain);
      setNetInfo(net);
      setMiningInfo(mining);
      setMempoolInfo(mempool);
      setHashHistory(prev => {
        const updated = [...prev, (mining?.networkhashps || 0) / 1e6];
        return updated.slice(-GRAPH_HISTORY);
      });
    } catch (e) {
      // silently handle — connection may not be ready yet
    }
  }, [nodeConfig]);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 30000);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Accepts value already in MH/s
  const formatHash = (mhs) => {
    if (!mhs) return '0 H/s';
    if (mhs >= 1000) return `${(mhs / 1000).toFixed(2)} GH/s`;
    if (mhs >= 1)    return `${mhs.toFixed(1)} MH/s`;
    return `${(mhs * 1000).toFixed(0)} KH/s`;
  };

  const formatSize = (bytes) => {
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  // Divide by 1e6 once here for consistency
  const networkHashMhs = miningInfo?.networkhashps
    ? miningInfo.networkhashps / 1e6
    : null;

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.green} />
      }
    >
      <View style={styles.graphCard}>
        <Text style={styles.graphTitle}>▸ UPLINK — NETWORK HASHRATE LIVE</Text>
        <HashGraph data={hashHistory} />
        <Text style={styles.graphFooter}>
          CURRENT: {formatHash(hashHistory[hashHistory.length - 1])}
        </Text>
      </View>

      <Text style={styles.sectionHeader}>▸ CHAIN STATUS</Text>
      <NetRow label="NETWORK HASHRATE"  value={networkHashMhs ? formatHash(networkHashMhs) : '—'} />
      <NetRow label="DIFFICULTY"        value={miningInfo?.difficulty?.toFixed(3) || '—'} />
      <NetRow label="BLOCK HEIGHT"      value={chainInfo ? `#${chainInfo.blocks}` : '—'} />
      <NetRow label="BEST BLOCK HASH"   value={chainInfo?.bestblockhash ? chainInfo.bestblockhash.slice(0,16) + '...' : '—'} small />
      <NetRow label="CHAIN SIZE"        value={chainInfo ? formatSize(chainInfo.size_on_disk) : '—'} />
      <NetRow label="SYNC PROGRESS"     value={chainInfo ? (chainInfo.verificationprogress > 0.98 ? '100%' : `${(chainInfo.verificationprogress * 100).toFixed(1)}%`) : '—'} />

      <Text style={[styles.sectionHeader, { marginTop: 12 }]}>▸ NETWORK</Text>
      <NetRow label="CONNECTIONS"  value={netInfo ? `${netInfo.connections} PEERS` : '—'} />
      <NetRow label="INBOUND"      value={netInfo ? `${netInfo.connections_in}` : '—'} />
      <NetRow label="OUTBOUND"     value={netInfo ? `${netInfo.connections_out}` : '—'} />
      <NetRow label="PROTOCOL"     value={netInfo ? `v${netInfo.protocolversion}` : '—'} />
      <NetRow label="RELAY FEE"    value={netInfo ? `${netInfo.relayfee} CAPS/KB` : '—'} />

      <Text style={[styles.sectionHeader, { marginTop: 12 }]}>▸ MEMPOOL</Text>
      <NetRow label="PENDING TXS"  value={mempoolInfo ? `${mempoolInfo.size} TX` : '—'} />
      <NetRow label="MEMPOOL SIZE" value={mempoolInfo ? formatSize(mempoolInfo.bytes) : '—'} />

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

function HashGraph({ data }) {
  const width  = Dimensions.get('window').width - 56;
  const height = 80;
  const pad    = 4;

  if (!data || data.length < 2) {
    return (
      <View style={{ height, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: Colors.greenDim, fontFamily: Fonts.mono, fontSize: 11 }}>
          COLLECTING DATA...
        </Text>
      </View>
    );
  }

  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v / max) * (height - pad * 2));
    return `${x},${y}`;
  });

  const linePath = `M ${pts.join(' L ')}`;
  const areaPath = `M ${pts[0]} L ${pts.join(' L ')} L ${pts[pts.length-1].split(',')[0]},${height} L ${pad},${height} Z`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={Colors.green} stopOpacity="0.35" />
          <Stop offset="100%" stopColor={Colors.green} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      {[0.25, 0.5, 0.75].map(t => (
        <Line key={t} x1={pad} y1={height * t} x2={width - pad} y2={height * t}
          stroke={Colors.border} strokeWidth="1" />
      ))}
      <Path d={areaPath} fill="url(#grad)" />
      <Path d={linePath} stroke={Colors.green} strokeWidth="1.5" fill="none" opacity="0.9" />
    </Svg>
  );
}

function NetRow({ label, value, small = false }) {
  return (
    <View style={styles.netRow}>
      <Text style={styles.netLabel}>{label}</Text>
      <Text style={[styles.netValue, small && styles.netValueSmall]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.black, padding: 14 },
  graphCard:   {
    borderWidth: 1, borderColor: Colors.borderDim,
    backgroundColor: Colors.surface, padding: 10, marginBottom: 12,
  },
  graphTitle:  { ...Typography.labelSmall, color: Colors.greenDim, marginBottom: 8 },
  graphFooter: { ...Typography.micro, color: Colors.green, marginTop: 4, letterSpacing: 1 },
  sectionHeader: {
    ...Typography.labelSmall, color: Colors.greenDim,
    marginBottom: 6, paddingBottom: 3,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  netRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 9, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface, marginBottom: 4,
  },
  netLabel:      { ...Typography.tiny, color: Colors.greenDim, letterSpacing: 2 },
  netValue:      { ...Typography.heading, color: Colors.green, textShadowColor: Colors.green, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 4 },
  netValueSmall: { ...Typography.small, color: Colors.green },
});
