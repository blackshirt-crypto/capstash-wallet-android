// screens/ExplorerScreen.js
// N.U.K.A — B.D.T. (Brotherhood Data Terminal) Block Explorer

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  RefreshControl, TextInput, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import TierName from '../components/TierName';
import { getBlockCount, getBlockHash, getBlock } from '../services/rpc';
import Colors from '../theme/colors';
import { Fonts } from '../theme/typography';
import { getAddressType } from '../utils/wasteland';

const PAGE_SIZE = 10;

export default function ExplorerScreen({ nodeConfig }) {
  const [blocks,       setBlocks]       = useState([]);
  const [refreshing,   setRefreshing]   = useState(false);
  const [search,       setSearch]       = useState('');
  const [expanded,     setExpanded]     = useState(null);
  const [tipHeight,    setTipHeight]    = useState(null);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [searching,    setSearching]    = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [searchError,  setSearchError]  = useState(null);
  const [hasMore,      setHasMore]      = useState(true);

  const nextHeightRef  = useRef(null);
  const loadingMoreRef = useRef(false);

  // ── Fetch a page of blocks descending from fromHeight ──
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

  // ── Initial / refresh load ──
  const loadBlocks = useCallback(async () => {
    try {
      const tip    = await getBlockCount(nodeConfig);
      const loaded = await fetchBlocks(tip);
      setTipHeight(tip);
      setBlocks(loaded);
      nextHeightRef.current = tip - PAGE_SIZE;
      setHasMore(tip - PAGE_SIZE > 0);
      setSearchResult(null);
      setSearchError(null);
      setExpanded(null);
    } catch (e) {
      // silently handle — connection may not be ready yet
    }
  }, [nodeConfig, fetchBlocks]);

  useEffect(() => { loadBlocks(); }, [loadBlocks]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBlocks();
    setRefreshing(false);
  };

  // ── Infinite scroll ──
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore || searchResult) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const from   = nextHeightRef.current;
      const loaded = await fetchBlocks(from);
      setBlocks(prev => [...prev, ...loaded]);
      const newNext = from - PAGE_SIZE;
      nextHeightRef.current = newNext;
      setHasMore(newNext > 0);
    } catch (e) {
      // silently handle
    }
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [hasMore, searchResult, fetchBlocks]);

  // ── Search ──
  const handleSearch = async () => {
    if (!search.trim()) { clearSearch(); return; }
    setSearching(true);
    setSearchError(null);
    setSearchResult(null);
    try {
      let hash;
      if (/^\d+$/.test(search.trim())) {
        const height = parseInt(search.trim(), 10);
        if (height > tipHeight) {
          setSearchError(`BLOCK #${height} DOES NOT EXIST YET`);
          setSearching(false);
          return;
        }
        hash = await getBlockHash(nodeConfig, height);
      } else {
        hash = search.trim();
      }
      const block      = await getBlock(nodeConfig, hash, 2);
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
    } catch {
      setSearchError('BLOCK NOT FOUND — CHECK HEIGHT OR HASH');
    }
    setSearching(false);
  };

  const clearSearch = () => {
    setSearch('');
    setSearchResult(null);
    setSearchError(null);
  };

  // ── Helpers ──
  const formatTime = (ts) => {
    const diff = Math.floor(Date.now() / 1000 - ts);
    if (diff < 60)    return `${diff}S AGO`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}M AGO`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}H AGO`;
    return `${Math.floor(diff / 86400)}D AGO`;
  };

  const truncate = (str, len = 32) =>
    str && str.length > len ? str.slice(0, len) + '...' : str;

  // ── Block card renderer ──
  const renderBlock = ({ item: block }) => {
    const isExpanded = expanded === block.hash;
    return (
      <TouchableOpacity
        style={[styles.blockCard, isExpanded && styles.blockCardExpanded]}
        onPress={() => setExpanded(isExpanded ? null : block.hash)}
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
              : styles.legacyBadge,
          ]}>
            {getAddressType(block.miner)}
          </Text>
        </View>
        <Text style={styles.minerAddress}>{truncate(block.miner)}</Text>
        {isExpanded && (
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
  };

  // ── List header ──
  const ListHeader = (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>B.D.T.</Text>
        <Text style={styles.headerSub}>BROTHERHOOD DATA TERMINAL</Text>
        {tipHeight !== null && (
          <Text style={styles.headerHeight}>TIP #{tipHeight}</Text>
        )}
      </View>

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

      {searchError && (
        <Text style={styles.searchError}>{searchError}</Text>
      )}

      {searchResult && (
        <>
          <Text style={styles.sectionHeader}>▸ SEARCH RESULT</Text>
          {renderBlock({ item: searchResult })}
          <TouchableOpacity style={styles.clearSearchBtn} onPress={clearSearch}>
            <Text style={styles.clearSearchBtnText}>✕ CLEAR SEARCH</Text>
          </TouchableOpacity>
        </>
      )}

      <Text style={styles.sectionHeader}>
        ▸ CODEX{blocks.length > 0
          ? ` (#${blocks[blocks.length - 1]?.height} — #${blocks[0]?.height})`
          : ''}
      </Text>
    </View>
  );

  // ── List footer ──
  const ListFooter = (
    <View>
      {hasMore && loadingMore && (
        <View style={styles.footerLoader}>
          <ActivityIndicator color={Colors.green} size="small" />
          <Text style={styles.footerLoaderText}>RETRIEVING DATA...</Text>
        </View>
      )}
      {!hasMore && blocks.length > 0 && (
        <Text style={styles.genesisText}>▸ GENESIS BLOCK REACHED</Text>
      )}
      {blocks.length === 0 && !searchResult && (
        <Text style={styles.emptyText}>NO BLOCKS LOADED</Text>
      )}
      <View style={{ height: 30 }} />
    </View>
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      data={searchResult ? [] : blocks}
      keyExtractor={(item) => item.hash}
      renderItem={renderBlock}
      ListHeaderComponent={ListHeader}
      ListFooterComponent={ListFooter}
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Colors.green}
        />
      }
    />
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
  container:        { flex: 1, backgroundColor: Colors.black },
  contentContainer: { padding: 14 },

  headerRow: {
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 12, marginBottom: 14, alignItems: 'center',
  },
  headerTitle: {
    fontFamily: Fonts.display, fontSize: 38,
    color: Colors.green, letterSpacing: 6,
    textShadowColor: Colors.green,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  headerSub: {
    fontFamily: Fonts.mono, fontSize: 12,
    color: Colors.greenDim, letterSpacing: 3, marginTop: 2,
  },
  headerHeight: {
    fontFamily: Fonts.mono, fontSize: 14,
    color: Colors.green, letterSpacing: 2, marginTop: 6,
  },

  searchRow: { flexDirection: 'row', marginBottom: 12, gap: 8 },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.borderDim,
    backgroundColor: Colors.surface, paddingHorizontal: 10,
  },
  searchIcon:  { fontSize: 16, marginRight: 6 },
  searchInput: {
    flex: 1, color: Colors.green,
    fontFamily: Fonts.mono, fontSize: 14,
    padding: 10, letterSpacing: 1,
  },
  clearBtn:    { fontSize: 14, color: Colors.greenDim, padding: 4 },
  searchBtn: {
    borderWidth: 1, borderColor: Colors.green,
    backgroundColor: 'rgba(118,255,122,0.05)',
    paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center',
  },
  searchBtnText: {
    fontFamily: Fonts.mono, fontSize: 14,
    color: Colors.green, letterSpacing: 1,
  },
  searchError: {
    fontFamily: Fonts.mono, fontSize: 13,
    color: Colors.red, textAlign: 'center',
    marginBottom: 8, letterSpacing: 1,
  },
  clearSearchBtn: {
    borderWidth: 1, borderColor: Colors.borderDim,
    padding: 8, alignItems: 'center', marginBottom: 10,
  },
  clearSearchBtnText: {
    fontFamily: Fonts.mono, fontSize: 13,
    color: Colors.greenDim, letterSpacing: 1,
  },
  sectionHeader: {
    fontFamily: Fonts.mono, fontSize: 13,
    color: Colors.greenDim, letterSpacing: 2,
    marginBottom: 8, paddingBottom: 4,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },

  blockCard: {
    backgroundColor: Colors.surface, borderWidth: 1,
    borderColor: Colors.border, borderLeftWidth: 3,
    borderLeftColor: Colors.borderDim, padding: 12, marginBottom: 6,
  },
  blockCardExpanded: {
    borderLeftColor: Colors.green,
    backgroundColor: Colors.surfaceLight,
  },
  blockTop:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  blockHeight: {
    fontFamily: Fonts.display, fontSize: 26, color: Colors.green,
    textShadowColor: Colors.green,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  blockTime:    { fontFamily: Fonts.mono, fontSize: 12, color: Colors.greenDim, alignSelf: 'flex-end' },
  minerRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 4 },
  minerIcon:    { fontSize: 13, color: Colors.greenDim },
  minerAddress: {
    fontFamily: Fonts.mono, fontSize: 12,
    color: Colors.greenDim, marginBottom: 2, letterSpacing: 0.5,
  },
  metaRow:  { flexDirection: 'row', gap: 12 },
  metaItem: { flexDirection: 'row' },
  metaLabel: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.greenDim },
  metaValue: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.green },
  expandedSection: {
    marginTop: 8, paddingTop: 6,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  expandedLabel: {
    fontFamily: Fonts.mono, fontSize: 12,
    color: Colors.greenDim, marginBottom: 3,
  },
  expandedHash: {
    fontFamily: Fonts.mono, fontSize: 12,
    color: Colors.green, letterSpacing: 0.5, lineHeight: 18,
  },
  addressBadge: {
    fontFamily: Fonts.mono, fontSize: 12,
    paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1,
  },
  bech32Badge: { color: Colors.green,  borderColor: Colors.green },
  legacyBadge: { color: Colors.amber, borderColor: Colors.amber },

  footerLoader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingVertical: 14, gap: 8,
  },
  footerLoaderText: {
    fontFamily: Fonts.mono, fontSize: 13,
    color: Colors.greenDim, letterSpacing: 2,
  },
  genesisText: {
    fontFamily: Fonts.mono, fontSize: 13,
    color: Colors.greenDim, textAlign: 'center',
    marginVertical: 12, letterSpacing: 2,
  },
  emptyText: {
    fontFamily: Fonts.mono, fontSize: 14,
    color: Colors.greenDim, textAlign: 'center', marginTop: 20,
  },
});
