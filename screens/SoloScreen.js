// screens/SoloScreen.js
// N.U.K.A — SURVIVOR: Solo block probability calculator
// CapStash block time: 60 seconds (1440 blocks/day)

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput,
  RefreshControl, StyleSheet,
} from 'react-native';
import { getMiningInfo } from '../services/rpc';
import Colors from '../theme/colors';
import { Typography, Fonts } from '../theme/typography';

// ── Constants ───────────────────────────────────────────────
const BLOCK_TIME_SECONDS = 60;
const BLOCK_REWARD       = 1.0;

// ── Luck Tiers ───────────────────────────────────────────────
const LUCK_TIERS = [
  {
    key:       'radroach',
    label:     "RADROACH ODDS",
    subLabel:  "YOU AND THE COCKROACHES. GOOD LUCK.",
    range:     '< 1% DAILY CHANCE',
    threshold: 0.01,
    color:     Colors.red,
    glow:      Colors.redGlow,
  },
  {
    key:       'longshot',
    label:     'LONG SHOT',
    subLabel:  "POSSIBLE. DON'T HOLD YOUR BREATH.",
    range:     '1% – 10% DAILY CHANCE',
    threshold: 0.10,
    color:     Colors.amber,
    glow:      'rgba(255,176,0,0.4)',
  },
  {
    key:       'fighting',
    label:     'FIGHTING CHANCE',
    subLabel:  "WASTELAND ODDS. RESPECTABLE.",
    range:     '10% – 50% DAILY CHANCE',
    threshold: 0.50,
    color:     Colors.tiers.uncommon.color,
    glow:      Colors.tiers.uncommon.glow,
  },
  {
    key:       'dominating',
    label:     'DOMINATING',
    subLabel:  "YOU OWN THE NETWORK, WANDERER.",
    range:     '> 50% DAILY CHANCE',
    threshold: Infinity,
    color:     Colors.green,
    glow:      Colors.greenGlow,
  },
];

function getTier(prob24h) {
  return LUCK_TIERS.find(t => prob24h < t.threshold) || LUCK_TIERS[LUCK_TIERS.length - 1];
}

export default function SoloScreen({ nodeConfig }) {
  const [networkHash, setNetworkHash] = useState(0);
  const [localHash,   setLocalHash]   = useState(0);
  const [difficulty,  setDifficulty]  = useState(0);
  const [customLocal, setCustomLocal] = useState('');
  const [refreshing,  setRefreshing]  = useState(false);

  const load = useCallback(async () => {
    try {
      const mining = await getMiningInfo(nodeConfig);
      setNetworkHash(mining?.networkhashps || 0);
      setDifficulty(mining?.difficulty || 0);
      if (mining?.localhashrate > 0) {
        setLocalHash(mining.localhashrate);
      }
    } catch (e) {
      // silently handle — connection may not be ready yet
    }
  }, [nodeConfig]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // ── Calculations ─────────────────────────────────────────
  const effectiveLocalHash = customLocal
    ? parseFloat(customLocal) * 1e6
    : localHash;

  const blocksPerDay   = 86400 / BLOCK_TIME_SECONDS;
  const networkShare   = networkHash > 0 ? effectiveLocalHash / networkHash : 0;
  const prob24h        = networkHash > 0
    ? 1 - Math.pow(1 - networkShare, blocksPerDay)
    : 0;
  const expectedHours  = effectiveLocalHash > 0 && networkHash > 0
    ? (networkHash / effectiveLocalHash) * (BLOCK_TIME_SECONDS / 3600)
    : Infinity;
  const expectedCap24h = prob24h * BLOCK_REWARD;
  const probPercent    = (prob24h * 100).toFixed(2);

  const tier = getTier(prob24h);

  // ── Helpers ───────────────────────────────────────────────
  const formatHash = (hs) => {
    if (!hs || isNaN(hs) || hs === 0) return '— H/s';
    if (hs >= 1e9)  return `${(hs / 1e9).toFixed(2)} GH/s`;
    if (hs >= 1e6)  return `${(hs / 1e6).toFixed(2)} MH/s`;
    if (hs >= 1e3)  return `${(hs / 1e3).toFixed(0)} KH/s`;
    return `${hs.toFixed(0)} H/s`;
  };

  const formatTime = (hours) => {
    if (!isFinite(hours)) return '∞';
    if (hours < 1/60)  return `${(hours * 3600).toFixed(0)} SECS`;
    if (hours < 1)     return `${(hours * 60).toFixed(0)} MINS`;
    if (hours < 24)    return `${hours.toFixed(1)} HRS`;
    if (hours < 168)   return `${(hours / 24).toFixed(1)} DAYS`;
    if (hours < 720)   return `${(hours / 168).toFixed(1)} WEEKS`;
    return `${(hours / 720).toFixed(1)} MONTHS`;
  };

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Colors.green}
        />
      }
    >
      {/* ── Big probability display ── */}
      <View style={[styles.probCard, { borderColor: tier.color }]}>
        <Text style={styles.probLabel}>
          ▸ SURVIVOR% — SOLO BLOCK PROBABILITY (24H)
        </Text>
        <Text style={[styles.probValue, {
          color:            tier.color,
          textShadowColor:  tier.glow,
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 24,
        }]}>
          {probPercent}%
        </Text>
        <View style={[styles.tierBadge, { borderColor: tier.color }]}>
          <Text style={[styles.tierBadgeLabel, { color: tier.color }]}>
            {tier.label}
          </Text>
        </View>
        <Text style={[styles.tierSubLabel, { color: tier.color }]}>
          {tier.subLabel}
        </Text>
        <Text style={styles.probSub}>
          {formatHash(effectiveLocalHash)} LOCAL  ·  {formatHash(networkHash)} NETWORK
        </Text>
      </View>

      {/* ── Custom hashrate input ── */}
      <View style={styles.inputCard}>
        <Text style={styles.inputLabel}>▸ SIMULATE HASHRATE (MH/s)</Text>
        <TextInput
          style={styles.input}
          value={customLocal}
          onChangeText={setCustomLocal}
          placeholder={localHash > 0 ? `${(localHash / 1e6).toFixed(2)} (LIVE)` : 'ENTER MH/s'}
          placeholderTextColor={Colors.greenDim}
          keyboardType="numeric"
        />
        <Text style={styles.inputHint}>
          BLANK = USE LIVE MINER HASHRATE. ENTER VALUE TO SIMULATE.
        </Text>
      </View>

      {/* ── Probability breakdown ── */}
      <Text style={styles.sectionHeader}>▸ PROBABILITY BREAKDOWN</Text>

      <StatRow label="YOUR HASHRATE"    value={formatHash(effectiveLocalHash)} />
      <StatRow label="NETWORK HASHRATE" value={formatHash(networkHash)} />
      <StatRow label="NETWORK SHARE"    value={`${(networkShare * 100).toFixed(4)}%`} />
      <StatRow label="BLOCKS PER DAY"   value={blocksPerDay.toFixed(0)} />
      <StatRow label="BLOCK TIME"       value={`${BLOCK_TIME_SECONDS}S (1 MIN)`} />
      <StatRow label="EXPECTED TIME"    value={formatTime(expectedHours)} />
      <StatRow label="DIFFICULTY"       value={difficulty > 0 ? difficulty.toFixed(6) : '—'} />
      <StatRow label="BLOCK REWARD"     value={`${BLOCK_REWARD.toFixed(2)} CAP`} />
      <StatRow label="24H EXPECTED"     value={`${expectedCap24h.toFixed(4)} CAP`} />
      <StatRow label="7D EXPECTED"      value={`${(expectedCap24h * 7).toFixed(3)} CAP`} />
      <StatRow label="30D EXPECTED"     value={`${(expectedCap24h * 30).toFixed(2)} CAP`} />

      {/* ── Formula ── */}
      <View style={styles.formulaCard}>
        <Text style={styles.formulaText}>
          ▸ FORMULA{'\n'}
          {'  '}P(24h) = 1 - (1 - localHash/netHash)^1440{'\n\n'}
          ▸ 1440 BLOCKS/DAY AT 60 SECOND BLOCK TIMES{'\n'}
          ▸ KEEP GRINDING. KEEP STACKING CAPS.
        </Text>
      </View>

      {/* ── Luck tier reference ── */}
      <Text style={[styles.sectionHeader, { marginTop: 12 }]}>▸ SURVIVAL ODDS REFERENCE</Text>

      {LUCK_TIERS.map((t) => (
        <LuckRow
          key={t.key}
          label={t.label}
          range={t.range}
          subLabel={t.subLabel}
          color={t.color}
          active={tier.key === t.key}
        />
      ))}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

function StatRow({ label, value }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function LuckRow({ label, range, subLabel, color, active }) {
  return (
    <View style={[
      styles.luckRow,
      active && { borderColor: color, backgroundColor: `${color}18` },
    ]}>
      <View style={styles.luckLeft}>
        <Text style={[styles.luckLabel, { color }]}>
          {active ? '▶ ' : '  '}{label}
        </Text>
        <Text style={[styles.luckSubLabel, { color: active ? color : Colors.greenDim }]}>
          {subLabel}
        </Text>
      </View>
      <Text style={[styles.luckRange, { color: active ? color : Colors.greenDim }]}>
        {range}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black, padding: 14 },

  probCard: {
    borderWidth: 1, backgroundColor: Colors.surface,
    padding: 20, alignItems: 'center', marginBottom: 12,
  },
  probLabel: {
    ...Typography.labelSmall,
    color: Colors.greenDim, marginBottom: 10, textAlign: 'center',
  },
  probValue: { ...Typography.gigantic, fontSize: 80 },
  tierBadge: {
    borderWidth: 1, paddingHorizontal: 14, paddingVertical: 4,
    marginTop: 10, marginBottom: 4,
  },
  tierBadgeLabel: { ...Typography.heading, fontSize: 20, letterSpacing: 3 },
  tierSubLabel:   { ...Typography.tiny, letterSpacing: 2, marginBottom: 10, textAlign: 'center' },
  probSub:        { ...Typography.tiny, color: Colors.greenDim, marginTop: 4, letterSpacing: 1, textAlign: 'center' },

  inputCard: {
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface, padding: 10, marginBottom: 12,
  },
  inputLabel: { ...Typography.labelSmall, color: Colors.greenDim, marginBottom: 6 },
  input: {
    backgroundColor: Colors.black, borderWidth: 1, borderColor: Colors.borderDim,
    color: Colors.green, fontFamily: Fonts.mono, fontSize: 15,
    padding: 8, letterSpacing: 1,
  },
  inputHint: { ...Typography.micro, color: Colors.greenDim, marginTop: 5, letterSpacing: 0.5 },

  sectionHeader: {
    ...Typography.labelSmall, color: Colors.greenDim,
    marginBottom: 6, paddingBottom: 3,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },

  statRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    padding: 8, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface, marginBottom: 3,
  },
  statLabel: { ...Typography.tiny, color: Colors.greenDim, letterSpacing: 1 },
  statValue: { ...Typography.subheading, color: Colors.green },

  formulaCard: {
    marginTop: 10, padding: 10,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  formulaText: { ...Typography.micro, color: Colors.greenDim, lineHeight: 18, letterSpacing: 0.5 },

  luckRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 10, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface, marginBottom: 4,
  },
  luckLeft:     { flex: 1, marginRight: 8 },
  luckLabel:    { ...Typography.small, letterSpacing: 2, marginBottom: 2 },
  luckSubLabel: { ...Typography.micro, letterSpacing: 1 },
  luckRange:    { ...Typography.tiny, textAlign: 'right', letterSpacing: 0.5 },
});
