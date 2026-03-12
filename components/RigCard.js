// components/RigCard.js
// N.U.K.A — Individual mining rig card component

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import TierName from './TierName';
import { getConnectionIcon, getHardwareBadges, BADGES } from '../utils/badges';
import Colors from '../theme/colors';
import Typography from '../theme/typography';

export default function RigCard({ rig, onPress, isTop = false, maxBlocks = 1 }) {
  const isAsic    = rig.badges?.includes('asic');
  const isActive  = rig.active;
  const barPct    = Math.min((rig.blocks / Math.max(maxBlocks, 1)) * 100, 100);
  const connIcon  = getConnectionIcon(rig.badges);
  const hwBadges  = getHardwareBadges(rig.badges);

  const hashDisplay = isAsic
    ? '892 MH/s'
    : isActive && rig.hashrate > 0
      ? rig.hashrate > 1e6
        ? `${(rig.hashrate / 1e6).toFixed(1)} MH/s`
        : `${(rig.hashrate / 1e3).toFixed(0)} KH/s`
      : '0 H/s';

  const borderColor = isAsic  ? Colors.red      : isActive ? Colors.green    : Colors.border;
  const leftColor   = isAsic  ? Colors.red      : isActive ? Colors.green    : Colors.borderDim;
  const barColor    = isAsic  ? Colors.red      : isActive ? Colors.green    : Colors.greenDim;
  const statusColor = isAsic  ? Colors.red      : isActive ? Colors.green    : Colors.greenDim;
  const statusLabel = isAsic  ? '☢️'             : isActive  ? 'ON'            : 'OFF';

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          borderColor,
          borderLeftColor: leftColor,
          shadowColor: borderColor,
          shadowOpacity: isActive || isAsic ? 0.15 : 0,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* ASIC radiation warning */}
      {isAsic && (
        <Text style={styles.asicWarning}>⚠ RADIATION DETECTED</Text>
      )}

      {/* Top rig trophy */}
      {isTop && !isAsic && (
        <Text style={styles.trophy}>🏆</Text>
      )}

      {/* Name + blocks */}
      <View style={styles.topRow}>
        <View style={styles.nameArea}>
          <TierName
            address={rig.address}
            size="amount"
            style={isAsic ? { color: Colors.red } : undefined}
          />
          <Text style={[styles.label, { color: rig.label ? Colors.amber : Colors.greenDim }]}>
            {rig.label || 'UNTITLED RIG'}
          </Text>
        </View>
        <View style={styles.blocksArea}>
          <Text style={[Typography.heading, { color: isAsic ? Colors.red : Colors.green }]}>
            {isAsic ? 892 : rig.blocks}
          </Text>
          <Text style={styles.blocksLabel}>BLOCKS</Text>
        </View>
      </View>

      {/* Badge row — icons only */}
      <View style={styles.badgeRow}>
        <Text style={styles.badgeIcons}>{connIcon}  {hwBadges}</Text>
        <Text style={styles.ipText}>{rig.ip}</Text>
      </View>

      {/* Hash bar + hashrate + status */}
      <View style={styles.hashRow}>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${isAsic ? 100 : barPct}%`, backgroundColor: barColor }]} />
        </View>
        <Text style={[styles.hashDisplay, { color: statusColor }]}>{hashDisplay}</Text>
        <View style={[styles.statusBadge, { borderColor: statusColor }]}>
          <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 10,
    marginBottom: 6,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    elevation: 2,
  },
  asicWarning: {
    position: 'absolute',
    top: 4,
    right: 8,
    fontSize: 7,
    color: Colors.red,
    letterSpacing: 1,
    fontFamily: 'ShareTechMono-Regular',
  },
  trophy: {
    position: 'absolute',
    top: 4,
    right: 8,
    fontSize: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  nameArea: {
    flex: 1,
    marginRight: 8,
  },
  label: {
    fontSize: 8,
    fontFamily: 'ShareTechMono-Regular',
    letterSpacing: 1,
    marginTop: 1,
  },
  blocksArea: {
    alignItems: 'flex-end',
  },
  blocksLabel: {
    fontSize: 6,
    color: Colors.greenDim,
    fontFamily: 'ShareTechMono-Regular',
    letterSpacing: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  badgeIcons: {
    fontSize: 13,
    letterSpacing: 2,
    flex: 1,
  },
  ipText: {
    fontSize: 7,
    color: Colors.greenDim,
    fontFamily: 'ShareTechMono-Regular',
    letterSpacing: 0.5,
  },
  hashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  barTrack: {
    flex: 1,
    height: 3,
    backgroundColor: Colors.border,
  },
  barFill: {
    height: '100%',
  },
  hashDisplay: {
    fontSize: 8,
    fontFamily: 'ShareTechMono-Regular',
    letterSpacing: 1,
    minWidth: 56,
    textAlign: 'right',
  },
  statusBadge: {
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  statusLabel: {
    fontSize: 8,
    fontFamily: 'ShareTechMono-Regular',
    letterSpacing: 1,
  },
});
