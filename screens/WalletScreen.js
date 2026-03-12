// screens/WalletScreen.js
// N.U.K.A. — Wallet tab: balance, identity, send/receive, transactions

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, StyleSheet,
} from 'react-native';
import TierName from '../components/TierName';
import { getBalances, listTransactions, getWalletAddresses } from '../services/rpc';
import Colors from '../theme/colors';
import Typography from '../theme/typography';

// ── Main wallet address — replace with real address from RPC ─
const MY_ADDRESS = 'CfXe83a1tgteutMFvF2Z5EEmgeoHJdgnwf';

export default function WalletScreen({ nodeConfig }) {
  const [balance, setBalance]   = useState(null);
  const [txs, setTxs]           = useState([]);
  const [myAddress, setMyAddress] = useState(MY_ADDRESS);
  const [refreshing, setRefresh] = useState(false);

const load = useCallback(async () => {
    try {
      const bal = await getBalances(nodeConfig);
      setBalance(bal?.mine?.trusted ?? 0);
      const transactions = await listTransactions(nodeConfig, 20);
      setTxs(transactions || []);
      const addresses = await getWalletAddresses(nodeConfig);
      console.log('ADDRESSES:', JSON.stringify(addresses));
      if (addresses && addresses.length > 0) {
        setMyAddress(addresses[0].address);
      }
    } catch (e) {
      console.warn('WalletScreen load error:', e);
    }
  }, [nodeConfig]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefresh(true);
    await load();
    setRefresh(false);
  };

  const formatTime = (timestamp) => {
    const diff = Math.floor(Date.now() / 1000 - timestamp);
    if (diff < 60)   return `${diff}S AGO`;
    if (diff < 3600) return `${Math.floor(diff/60)}M AGO`;
    if (diff < 86400)return `${Math.floor(diff/3600)}H AGO`;
    return `${Math.floor(diff/86400)}D AGO`;
  };

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.green} />
      }
    >
      {/* Balance */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>WASTELAND ERA BALANCE</Text>
        <Text style={styles.balanceAmount}>
          {balance !== null ? balance.toFixed(7) : '-.-------'} CAPS
        </Text>

        {/* Wallet identity */}
        <View style={styles.identityRow}>
          <Text style={styles.verifiedIcon}>☢ ☢ </Text>
          <TierName
            address={myAddress}
            size="large"
            showVerified={false}
          />
        </View>

       <Text style={[styles.labelMedium, { marginTop: 18 }]}>~ pre "great war" value unknown </Text>

        {/* Actions */}
        <View style={[styles.actionRow, { marginTop: 18 }]}>
          <TouchableOpacity style={[styles.actionBtn, styles.primaryBtn]}>
            <Text style={[styles.actionBtnText, { color: Colors.green}]}>▲ SEND</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <Text style={styles.actionBtnText}>▼ RECEIVE</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <Text style={styles.actionBtnText}>⊡ SCAN</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Transactions */}
      <Text style={styles.sectionHeader}>▸ RECENT TRANSACTIONS</Text>
      {txs.length === 0 && (
        <Text style={styles.emptyText}>NO TRANSACTIONS FOUND</Text>
      )}
      {txs.map((tx, i) => {
        const isReceived = tx.category === 'immature' || tx.category === 'receive';
        const isBlock    = tx.category === 'immature';
        return (
          <View key={tx.txid + i} style={[styles.txItem, isReceived ? styles.txReceived : styles.txSent]}>
            <View>
              <Text style={styles.txType}>
                {isReceived ? '▼ ' : '▲ '}
                {isBlock ? 'SCAVENGED' : isReceived ? 'RECEIVED' : 'SENT'}
              </Text>
              <Text style={styles.txTime}>
                {formatTime(tx.time)} · CONF: {tx.confirmations}
              </Text>
            </View>
            <Text style={[styles.txAmount, { color: isReceived ? Colors.greenGlow : Colors.redDim }]}>
              {isReceived ? '+' : ''}{tx.amount.toFixed(4)}
            </Text>
          </View>
        );
      })}

      <View style={styles.bottomPad} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black, padding: 14 },
  balanceCard: {
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderDim,
    paddingBottom: 14,
    marginBottom: 14,
  },
  balanceLabel: { ...Typography.labelLarge, color: Colors.greenDim, marginBottom: 6 },
  balanceAmount: {
    ...Typography.huge,
    color: Colors.green,
    textShadowColor: Colors.green,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  cursor: { color: Colors.green, fontSize: 12, textTransform: 'uppercase' },
  identityRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  verifiedIcon: { color: Colors.greenDim, fontSize: 10 },
  usdLabel: { ...Typography.tiny, color: Colors.greenDim, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1, padding: 8,
    borderWidth: 1, borderColor: Colors.borderDim,
    alignItems: 'center',
  },
  primaryBtn: { borderColor: Colors.green },
  actionBtnText: { ...Typography.small, color: Colors.green, letterSpacing: 2 },
  sectionHeader: {
    ...Typography.labelMedium,
    color: Colors.greenDim,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  emptyText: { ...Typography.small, color: Colors.greenDim, textAlign: 'center', marginTop: 20 },
  txItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 9, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface, borderLeftWidth: 3,
    marginBottom: 5,
  },
  txReceived: { borderLeftColor: Colors.green },
  txSent:     { borderLeftColor: Colors.red },
  txType:  { ...Typography.small, color: Colors.green, letterSpacing: 1 },
  txTime:  { ...Typography.micro, color: Colors.greenDim, marginTop: 1 },
  txAmount:{ ...Typography.heading, lineHeight: 22 },
  bottomPad: { height: 20 },
});
