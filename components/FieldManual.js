// components/FieldManual.js
// W.O.W. — Banjo's Survival Guide overlay
// Full badge legend + tier system explanation + lore

import React from 'react';
import {
  Modal, View, Text, ScrollView,
  TouchableOpacity, StyleSheet,
} from 'react-native';
import { BADGES, BADGE_GROUPS } from '../utils/badges';
import Colors from '../theme/colors';
import { Typography, Fonts } from '../theme/typography';

export default function FieldManual({ visible, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Banjo's Survival Guide</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>✗ CLOSE</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Badge Groups */}
          {BADGE_GROUPS.map(group => (
            <View key={group.key} style={styles.section}>
              <Text style={styles.sectionTitle}>▸ {group.label}</Text>
              {group.badges.map(key => {
                const b = BADGES[key];
                if (!b) return null;
                return (
                  <View key={key} style={styles.manualRow}>
                    <Text style={styles.manualIcon}>{b.icon}</Text>
                    <View style={styles.manualText}>
                      <Text style={[styles.manualName, { color: b.color || Colors.green }]}>
                        {b.label}
                      </Text>
                      <Text style={styles.manualDesc}>{b.desc}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}

          {/* Tier System */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>▸ WASTELAND IDENTITY TIERS</Text>
            <Text style={styles.tierIntro}>
              Every wallet address generates a unique wasteland identity derived from its
              cryptographic hash. The same address always produces the same name — on every
              device, forever, with no server required. ☢ marks a verified cryptographic identity.
            </Text>
            <TierRow
              name="RUSTY MOLERAT #4821"
              tier="COMMON"
              color={Colors.tiers.common.color}
              odds="~99% of addresses"
              desc="Standard wasteland wanderer"
            />
            <TierRow
              name="★ VAULT OVERSEER #0042"
              tier="UNCOMMON"
              color={Colors.tiers.uncommon.color}
              odds="~1 in 100"
              desc="Fallout lore title holder"
            />
            <TierRow
              name="★★ SENTINEL OF THE WASTE"
              tier="RARE"
              color={Colors.tiers.rare.color}
              odds="~1 in 1,000"
              desc="Legendary wasteland hero"
            />
            <TierRow
              name="★★★ SCOUNDREL OF KESSEL"
              tier="LEGENDARY"
              color={Colors.tiers.legendary.color}
              odds="~1 in 10,000"
              desc="Galaxy-touched wanderer"
            />
            <View style={[styles.tierRow, { borderColor: '#2a0030' }]}>
              <Text style={styles.tierOdds}>~1 in 50,000</Text>
              <Text style={[styles.tierName, { color: Colors.tiers.mythic.colorA }]}>
                ☆ ANCIENT GREEN MASTER
              </Text>
              <Text style={[styles.tierLabel, { color: Colors.tiers.mythic.colorB }]}>MYTHIC</Text>
              <Text style={styles.tierDesc}>One of a kind. The wasteland whispers your name.</Text>
            </View>
            <View style={styles.aliasNote}>
              <Text style={styles.aliasNoteText}>
                ▸ CUSTOM ALIAS: You may set a personal alias (max 20 chars). Your
                cryptographic identity remains permanent and is always shown first.{'\n'}
                ▸ VERIFIED: The ☢ symbol confirms a name derived from your address
                hash — it cannot be faked or transferred.
              </Text>
            </View>
          </View>

          {/* About CapStash */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>▸ ABOUT CAPSTASH WALLET</Text>
            <Text style={styles.tierIntro}>
              CapStash Wallet is the official mobile companion for the CapStash (CAP) network.
              Monitor your balance, grind/monitor mining rigs from anywhere via Tailscale,
              explore the chain, and calculate your survival odds — all from one terminal.
            </Text>
            <Text style={[styles.tierIntro, { color: Colors.green, marginTop: 6 }]}>
              Stack caps, wanderer. The wasteland respects no other currency.
            </Text>
          </View>

          {/* ── CLASSIFIED EASTER EGG ── */}
          <View style={styles.section}>
            <View style={styles.classifiedBox}>
              <Text style={styles.classifiedTitle}>☢  CLASSIFIED — EYES ONLY  ☢</Text>
              <Text style={styles.classifiedBody}>
                You found it, wanderer.{'\n\n'}
              </Text>
              <Text style={styles.capTitle}>C.A.P.</Text>
              <Text style={styles.classifiedBody}>
                {'\n'}CAP.....{'\n\n'}
              </Text>
              <Text style={styles.classifiedLore}>
                When the bombs fell on April 20, 2069, {'\n'}
                every bank, every government, every fiat {'\n'}
                currency burned with the cities{'\n'}
                {'\n'}
                -- ONE code survived, undiscovered for decades --{'\n'}
                {'\n'}
                Born again in Vault 1337, as before focused on{'\n'}
                decentralization, trustless, unstoppable but with a{'\n'}
                new capability! Nakamoto understood the original need.{'\n\n'}
                A mysterious stranger found the answer for the Wasteland{'\n'}
                ----CapStash his solution-----{'\n\n'}
              </Text>
              <Text style={styles.classifiedBody}>
                The wasteland has a name{'\n'}
                for what you're building.{'\n'}
                Now you know it too.{'\n\n'}
              </Text>
              <Text style={styles.classifiedFooter}>
                — STAY SAFE, STACK CAPS, SURVIVE —
              </Text>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

function TierRow({ name, tier, color, odds, desc }) {
  return (
    <View style={styles.tierRow}>
      <Text style={styles.tierOdds}>{odds}</Text>
      <Text style={[styles.tierName, { color }]}>{name}</Text>
      <Text style={[styles.tierLabel, { color }]}>{tier}</Text>
      <Text style={styles.tierDesc}>{desc}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black },
  header: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    padding:           16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDim,
    backgroundColor:   Colors.surfaceLight,
  },
  title: {
    ...Typography.title,
    color:            Colors.green,
    textShadowColor:  Colors.green,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  closeBtn: {
    borderWidth:       1,
    borderColor:       Colors.borderDim,
    paddingHorizontal: 10,
    paddingVertical:   4,
  },
  closeBtnText: {
    ...Typography.small,
    color:         Colors.greenDim,
    letterSpacing: 2,
  },
  scroll: { flex: 1, padding: 16 },
  section: { marginBottom: 20 },
  sectionTitle: {
    ...Typography.labelSmall,
    color:             Colors.greenDim,
    marginBottom:      10,
    paddingBottom:     4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  manualRow: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    paddingVertical:   8,
    borderBottomWidth: 1,
    borderBottomColor: '#050f04',
    gap:               10,
  },
  manualIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  manualText: { flex: 1 },
  manualName: { ...Typography.small, letterSpacing: 1, marginBottom: 2 },
  manualDesc: { ...Typography.micro, color: Colors.greenDim, lineHeight: 16 },

  tierIntro: {
    ...Typography.tiny,
    color:         Colors.greenDim,
    lineHeight:    18,
    marginBottom:  10,
    letterSpacing: 0.5,
  },
  tierRow: {
    backgroundColor: Colors.surface,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         10,
    marginBottom:    5,
  },
  tierName:  { ...Typography.subheading, letterSpacing: 1, marginBottom: 2 },
  tierLabel: { ...Typography.labelSmall, marginBottom: 2 },
  tierOdds:  { ...Typography.micro, color: Colors.greenDim, marginBottom: 4 },
  tierDesc:  { ...Typography.micro, color: Colors.greenDim },

  aliasNote: {
    marginTop:       8,
    padding:         10,
    borderWidth:     1,
    borderColor:     Colors.border,
    backgroundColor: Colors.surface,
  },
  aliasNoteText: { ...Typography.micro, color: Colors.greenDim, lineHeight: 18 },

  classifiedBox: {
    borderWidth:     1,
    borderColor:     '#3a0a00',
    backgroundColor: '#1a0500',
    padding:         14,
    alignItems:      'center',
  },
  classifiedTitle: {
    ...Typography.small,
    color:            Colors.amber,
    letterSpacing:    3,
    textAlign:        'center',
    marginBottom:     8,
    textShadowColor:  Colors.amber,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  capTitle: {
    fontFamily:       Fonts.display,
    fontSize:         36,
    color:            Colors.green,
    letterSpacing:    8,
    textAlign:        'center',
    textShadowColor:  Colors.green,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  classifiedBody: {
    ...Typography.small,
    color:         Colors.amber,
    textAlign:     'center',
    lineHeight:    20,
    letterSpacing: 1,
  },
  classifiedLore: {
    ...Typography.tiny,
    color:         Colors.greenDim,
    textAlign:     'center',
    lineHeight:    20,
    letterSpacing: 0.5,
  },
  classifiedFooter: {
    ...Typography.micro,
    color:         Colors.greenDim,
    letterSpacing: 2,
    textAlign:     'center',
    marginTop:     4,
  },
});
