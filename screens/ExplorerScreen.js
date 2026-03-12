// screens/ExplorerScreen.js
// N.U.K.A — Block explorer with wasteland identity names

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, TextInput, StyleSheet,
  Alert, ActivityIndicator,
} from 'react-native';
import TierName from '../components/TierName';
import { getBlockCount, getBlockHash, getBlock } from '../services/rpc';
import Colors from '../theme/colors';
import Typography from '../theme/typography';
import { getAddressType } from '../utils/wasteland';

const PAGE_SIZE = 10;

export default function ExplorerScreen({ nodeConfig, onResetConfig }) {
  const [blocks,       setBlocks]       = useState([]);
  const [refreshing,   setRefreshing]   = useState(false);
  const [search,       setSearch]       = useState('');
  const [expanded,     setExpanded]     = useState(null);
  const [tipHeight,    setTipHeight]    = useState(null);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [searching,    setSearching]    = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [searchError,  setSearchError]  = useState(null);
  const [nextHeight,   setNextHeight]   = useState(null);
  const [hasMore,      setHasMore]      = useState(true);

  // ── Fetch a range of blocks ──
  const fetchBlocks = useCallback(async (fromHeight, count = PAGE_SIZE) => {
    const loaded = [];
    for (let h = fromHeight; h > Math.max(fromHeight - count, 0); h--) {
      const hash  = await getBlockHash(nodeConfig, h);
      const block = await getBlock(nodeConfig, hash, 2);
      const coinbaseTx = block.tx?.[0];
      const minerAddr  = coinbaseTx?.vout?.[0]?.scriptPubKey?.address || 'UNKNOWN';
      loaded.push({
        height:  block.height,
        hash:    block.hash,
        time:    block.time,
        txCount: block.nTx || block.tx?.length || 0,
        size:    block.size,
        weight:  block.weight,
        diff:    block.difficulty?.toFixed(3) || '?',
        miner:   minerAddr,
      });
    }
    return loaded;
  }, [nodeConfig]);

  // ── Initial load ──
  const loadBlocks = useCallback(async () => {
    try {
      const tip = await getBlockCount(nodeConfig);
      setTipHeight(tip);
      const loaded = await fetchBlocks(tip);
      setBlocks(loaded);
      setNextHeight(tip - PAGE_SIZE);
      setHasMore(tip - PAGE_SIZE > 0);
      setSearchResult(null);
      setSearchError(null);
    } catch (e) {
      console.warn('ExplorerScreen loadBlocks error:', e);
    }
  }, [nodeConfig, fetchBlocks]);

  useEffect(() => { loadBlocks(); }, [loadBlocks]);

  // ── Pull to refresh ──
  const onRefresh = async () => {
    setRefreshing(true);
    await loadBlocks();
    setRefreshing(false);
  };

  // ── Load more (endless scroll button) ──
  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const loaded = await fetchBlocks(nextHeight);
      setBlocks(prev => [...prev, ...loaded]);
      const newNext = nextHeight - PAGE_SIZE;
      setNextHeight(newNext);
      setHasMore(newNext > 0);
    } catch (e) {
      console.warn('Load more error:', e);
    }
    setLoadingMore(false);
  };

  // ── Search node directly ──
  const handleSearch = async () => {
    if (!search.trim()) {
      setSearchResult(null);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    setSearchResult(null);
    try {
      let hash;
      // If numeric — treat as block height
      if (/^\d+$/.test(search.trim())) {
        const height = parseInt(search.trim());
        if (height > tipHeight) {
          setSearchError(`BLOCK #${height} DOES NOT EXIST YET`);
          setSearching(false);
          return;
        }
        hash = await getBlockHash(nodeConfig, height);
      } else {
        // treat as hash directly
        hash = search.trim();
      }
      const block = await getBlock(nodeConfig, hash, 2);
      const coinbaseTx = block.tx?.[0];
      const minerAddr  = coinbaseTx?.vout?.[0]?.scriptPubKey?.address || 'UNKNOWN';
      setSearchResult({
        height:  block.height,
        hash:    block.hash,
        time:    block.time,
        txCount: block.nTx || block.tx?.length || 0,
        size:    block.size,
        weight:  block.weight,
        diff:    block.difficulty?.toFixed(3) || '?',
        miner:   minerAddr,
      });
    } catch (e) {
      setSearchError('BLOCK NOT FOUND — CHECK HEIGHT OR HASH');
    }
    setSearching(false);
  };

  const clearSearch = () => {
    setSearch('');
    setSearchResult(null);
    setSearchError(null);
  };

  const formatTime = (ts) => {
    const diff = Math.floor(Date.now() / 1000 - ts);
    if (diff < 60)    return `${diff}S AGO`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}M AGO`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}H AGO`;
    return `${Math.floor(diff / 86400)}D AGO`;
  };

  const truncate = (str, len = 24) =>
    str && str.length > len ? str.slice(0, len) + '...' : str;

  const handleResetConfig = () => {
    Alert.alert(
      '⚠ RECONFIGURE NODE',
      'This will clear your saved RPC settings and return you to the setup screen. Continue?',
      [
        { text: 'CANCEL', style: 'cancel' },
        {
          text: 'RESET & RECONFIGURE',
          style: 'destructive',
          onPress: () => { if (onResetConfig) onResetConfig(); },
        },
      ]
    );
  };

  const renderBlock = (block, i, isSearchResult = false) => (
    <TouchableOpacity
      key={block.hash}
      style={[
        styles.blockCard,
        expanded === (isSearchResult ? 'search' : i) && styles.blockCardExpanded,
        isSearchResult && styles.searchResultCard,
      ]}
      onPress={() => setExpanded(
        expanded === (isSearchResult ? 'search' : i) ? null : (isSearchResult ? 'search' : i)
      )}
      activeOpacity={0.8}
    >
      <View style={styles.blockTop}>
        <Text style={styles.blockHeight}>#{block.height}</Text>
        <Text style={styles.blockTime}>{formatTime(block.time)}</Text>
      </View>

      <View style={styles.minerRow}>
        <Text style={styles.minerIcon}>⚒ </Text>
        <TierName address={block.miner} size="small" />
        <Text style={[
          styles.addressBadge,
          getAddressType(block.miner) === 'BECH32'
            ? styles.bech32Badge
            : styles.legacyBadge
        ]}>
          {getAddressType(block.miner)}
        </Text>
      </View>

      <Text style={styles.minerAddress}>{truncate(block.miner, 32)}</Text>

      {expanded === (isSearchResult ? 'search' : i) && (
        <View style={styles.expandedSection}>
          <Text style={styles.expandedLabel}>BLOCK HASH</Text>
          <Text style={styles.expandedHash}>{block.hash}</Text>
          <View style={[styles.metaRow, { marginTop: 8 }]}>
            <MetaItem label="TXS"    value={block.txCount} />
            <MetaItem label="SIZE"   value={`${block.size}B`} />
            <MetaItem label="DIFF"   value={block.diff} />
            <MetaItem label="WEIGHT" value={block.weight} />
          </View>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.green} />
      }
    >
      {/* ── Search ── */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={handleSearch}
            placeholder="BLOCK HEIGHT OR HASH..."
            placeholderTextColor={Colors.greenDim}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={clearSearch}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          {searching
            ? <ActivityIndicator color={Colors.green} size="small" />
            : <Text style={styles.searchBtnText}>GO</Text>
          }
        </TouchableOpacity>
      </View>

      {/* ── Search result ── */}
      {searchError && (
        <Text style={styles.searchError}>{searchError}</Text>
      )}
      {searchResult && (
        <>
          <Text style={styles.sectionHeader}>▸ SEARCH RESULT</Text>
          {renderBlock(searchResult, 0, true)}
          <TouchableOpacity style={styles.clearSearchBtn} onPress={clearSearch}>
            <Text style={styles.clearSearchBtnText}>✕ CLEAR SEARCH</Text>
          </TouchableOpacity>
        </>
      )}

      {/* ── Recent blocks ── */}
      <Text style={styles.sectionHeader}>
        ▸ CODEX — BLOCKS {blocks.length > 0 ? `(#${blocks[blocks.length-1]?.height} — #${blocks[0]?.height})` : ''}
      </Text>

      {blocks.map((block, i) => renderBlock(block, i))}

      {blocks.length === 0 && !searchResult && (
        <Text style={styles.emptyText}>NO BLOCKS LOADED</Text>
      )}

      {/* ── Load more ── */}
      {hasMore && !searchResult && (
        <TouchableOpacity
          style={[styles.loadMoreBtn, loadingMore && { opacity: 0.5 }]}
          onPress={loadMore}
          disabled={loadingMore}
        >
          {loadingMore
            ? <ActivityIndicator color={Colors.green} size="small" />
            : <Text style={styles.loadMoreText}>⟳ LOAD MORE BLOCKS</Text>
          }
        </TouchableOpacity>
      )}

      {!hasMore && blocks.length > 0 && (
        <Text style={styles.genesisText}>▸ GENESIS BLOCK REACHED</Text>
      )}

      {/* ── Node Configuration Panel ── */}
      <Text style={[styles.sectionHeader, { marginTop: 14 }]}>▸ NODE CONNECTION</Text>
      <View style={styles.configCard}>
        <View style={styles.configStatusRow}>
          <Text style={{
            fontSize: 16, marginRight: 8,
            color: nodeConfig?.ip ? Colors.green : Colors.red,
          }}>
            {nodeConfig?.ip ? '●' : '○'}
          </Text>
          <Text style={[
            styles.configStatusText,
            { color: nodeConfig?.ip ? Colors.green : Colors.red },
          ]}>
            {nodeConfig?.ip ? 'CONFIGURED' : 'NOT CONFIGURED'}
          </Text>
        </View>

        <View style={styles.configRow}>
          <Text style={styles.configLabel}>NODE IP</Text>
          <Text style={styles.configValue}>{nodeConfig?.ip || 'NOT SET'}</Text>
        </View>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>PORT</Text>
          <Text style={styles.configValue}>{nodeConfig?.port || '—'}</Text>
        </View>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>MODE</Text>
          <Text style={[styles.configValue, { color: nodeConfig?.mode === 2 ? Colors.amber : Colors.green }]}>
            {nodeConfig?.mode === 1 ? 'LOCAL' : nodeConfig?.mode === 2 ? 'TAILSCALE' : '—'}
          </Text>
        </View>

        <TouchableOpacity style={styles.resetButton} onPress={handleResetConfig}>
          <Text style={styles.resetButtonText}>⟳ RECONFIGURE NODE</Text>
        </TouchableOpacity>

        <Text style={styles.configHint}>
          Clears RPC config and returns to mode selection.
        </Text>
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

function MetaItem({ label, value }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}: </Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black, padding: 14 },

  // ── Search ──
  searchRow: { flexDirection: 'row', marginBottom: 12, gap: 8 },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.borderDim,
    backgroundColor: Colors.surface, paddingHorizontal: 10,
  },
  searchIcon:  { fontSize: 16, marginRight: 6 },
  searchInput: {
    flex: 1, color: Colors.green,
    fontFamily: 'ShareTechMono-Regular', fontSize: 12,
    padding: 10, letterSpacing: 1,
  },
  clearBtn: { fontSize: 14, color: Colors.greenDim, padding: 4 },
  searchBtn: {
    borderWidth: 1, borderColor: Colors.green,
    backgroundColor: 'rgba(0,255,70,0.05)',
    paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center',
  },
  searchBtnText: {
    fontFamily: 'ShareTechMono-Regular', fontSize: 12,
    color: Colors.green, letterSpacing: 1,
  },
  searchError: {
    fontFamily: 'ShareTechMono-Regular', fontSize: 11,
    color: Colors.red, textAlign: 'center',
    marginBottom: 8, letterSpacing: 1,
  },
  clearSearchBtn: {
    borderWidth: 1, borderColor: Colors.borderDim,
    padding: 8, alignItems: 'center', marginBottom: 10,
  },
  clearSearchBtnText: {
    fontFamily: 'ShareTechMono-Regular', fontSize: 11,
    color: Colors.greenDim, letterSpacing: 1,
  },
  searchResultCard: {
    borderLeftColor: Colors.amber,
    borderLeftWidth: 3,
  },

  sectionHeader: {
    fontFamily: 'ShareTechMono-Regular', fontSize: 11,
    color: Colors.greenDim, letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8, paddingBottom: 4,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },

  // ── Block cards ──
  blockCard: {
    backgroundColor: Colors.surface, borderWidth: 1,
    borderColor: Colors.border, borderLeftWidth: 3,
    borderLeftColor: Colors.borderDim, padding: 12,
    marginBottom: 6,
  },
  blockCardExpanded: {
    borderLeftColor: Colors.green,
    backgroundColor: Colors.surfaceLight,
  },
  blockTop:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  blockHeight: {
    fontFamily: 'VT323-Regular', fontSize: 26,
    color: Colors.green,
    textShadowColor: Colors.green,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  blockTime:    { fontFamily: 'ShareTechMono-Regular', fontSize: 10, color: Colors.greenDim, alignSelf: 'flex-end' },
  minerRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 4 },
  minerIcon:    { fontSize: 13, color: Colors.greenDim },
  minerAddress: {
    fontFamily: 'ShareTechMono-Regular', fontSize: 10,
    color: Colors.greenDim, marginBottom: 2, letterSpacing: 0.5,
  },
  metaRow:   { flexDirection: 'row', gap: 12 },
  metaItem:  { flexDirection: 'row' },
  metaLabel: { fontFamily: 'ShareTechMono-Regular', fontSize: 10, color: Colors.greenDim },
  metaValue: { fontFamily: 'ShareTechMono-Regular', fontSize: 10, color: Colors.green },

  expandedSection: { marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: Colors.border },
  expandedLabel:   { fontFamily: 'ShareTechMono-Regular', fontSize: 10, color: Colors.greenDim, marginBottom: 3 },
  expandedHash:    { fontFamily: 'ShareTechMono-Regular', fontSize: 10, color: Colors.green, letterSpacing: 0.5, lineHeight: 16 },

  emptyText:   { fontFamily: 'ShareTechMono-Regular', fontSize: 12, color: Colors.greenDim, textAlign: 'center', marginTop: 20 },
  genesisText: { fontFamily: 'ShareTechMono-Regular', fontSize: 11, color: Colors.greenDim, textAlign: 'center', marginVertical: 12, letterSpacing: 2 },

  addressBadge: { fontFamily: 'ShareTechMono-Regular', fontSize: 10, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1 },
  bech32Badge:  { color: Colors.green, borderColor: Colors.green },
  legacyBadge:  { color: Colors.amber, borderColor: Colors.amber },

  // ── Load more ──
  loadMoreBtn: {
    borderWidth: 1, borderColor: Colors.borderDim,
    backgroundColor: Colors.surface,
    padding: 14, alignItems: 'center', marginVertical: 8,
  },
  loadMoreText: {
    fontFamily: 'ShareTechMono-Regular', fontSize: 12,
    color: Colors.green, letterSpacing: 2,
  },

  // ── Node config ──
  configCard: {
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface, padding: 12, marginBottom: 4,
  },
  configStatusRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  configStatusText: { fontFamily: 'ShareTechMono-Regular', fontSize: 12, letterSpacing: 1 },
  configRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.borderDim,
  },
  configLabel: { fontFamily: 'ShareTechMono-Regular', fontSize: 11, color: Colors.greenDim, letterSpacing: 1 },
  configValue: { fontFamily: 'ShareTechMono-Regular', fontSize: 11, color: Colors.green, letterSpacing: 0.5 },
  resetButton: {
    marginTop: 12, paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: Colors.amber,
    backgroundColor: 'rgba(255, 170, 0, 0.08)', alignItems: 'center',
  },
  resetButtonText: { fontFamily: 'ShareTechMono-Regular', fontSize: 12, color: Colors.amber, letterSpacing: 1.5 },
  configHint: {
    fontFamily: 'ShareTechMono-Regular', fontSize: 10,
    color: Colors.greenDim, marginTop: 8,
    letterSpacing: 0.3, lineHeight: 16, textAlign: 'center',
  },
});