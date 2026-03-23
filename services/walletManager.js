// services/walletManager.js
// CapStash — Wanderer Wallet Initializer
//
// Handles one-time creation of the "wanderer" named wallet on the local node.
// Once created, a flag is persisted so we never call createwallet again.
//
// Flow:
//   ensureWandererWallet(nodeConfig)
//     1. Check AsyncStorage flag — if set, wallet already exists, just load address
//     2. Call listwallets — if "wanderer" already in list, set flag + load address
//     3. Call createwallet("wanderer") — set flag + get fresh address
//     4. Return { ready: true, address } or { ready: false, error }

import AsyncStorage from '@react-native-async-storage/async-storage';
import { listWallets, createWallet, getNewAddress, getWalletAddresses } from './rpc';
import { WANDERER_NODE_CONFIG } from './appMode';

const WANDERER_WALLET_INIT_KEY    = '@capstash_wanderer_wallet_init';
const WANDERER_WALLET_ADDRESS_KEY = '@capstash_wanderer_wallet_address';

/**
 * Ensure the "wanderer" named wallet exists on the local node.
 * Safe to call every time the app enters Wanderer mode — idempotent.
 *
 * @param {object} nodeConfig — should be WANDERER_NODE_CONFIG (127.0.0.1)
 * @returns {{ ready: boolean, address: string|null, error: string|null }}
 */
export async function ensureWandererWallet(nodeConfig) {
  const cfg = nodeConfig || WANDERER_NODE_CONFIG;

  try {
    // ── Step 1: Check persisted flag ────────────────────────
    const initFlag = await AsyncStorage.getItem(WANDERER_WALLET_INIT_KEY);
    if (initFlag === 'true') {
      // Wallet was created before — just load/refresh the address
      const address = await _loadOrFetchAddress(cfg);
      return { ready: true, address, error: null };
    }

    // ── Step 2: Check if wallet already exists on node ──────
    let wallets = [];
    try {
      wallets = await listWallets(cfg);
    } catch (e) {
      // Node not responding yet — capstashd not running
      console.warn('[walletManager] listwallets failed — node not up yet:', e.message);
      return {
        ready: false,
        address: null,
        error: 'LOCAL NODE NOT RESPONDING — START CAPSTASHD FIRST',
      };
    }

    if (Array.isArray(wallets) && wallets.includes('wanderer')) {
      // Already exists — mark flag and load address
      await AsyncStorage.setItem(WANDERER_WALLET_INIT_KEY, 'true');
      const address = await _loadOrFetchAddress(cfg);
      return { ready: true, address, error: null };
    }

    // ── Step 3: Create the wallet ────────────────────────────
    console.log('[walletManager] Creating wanderer wallet...');
    const created = await createWallet(cfg, 'wanderer');
    if (!created) {
      return {
        ready: false,
        address: null,
        error: 'WALLET CREATION FAILED — CHECK NODE LOGS',
      };
    }

    // ── Step 4: Get initial address ──────────────────────────
    const wandererConfig = { ...cfg, wandererMode: true };
    let address = null;
    try {
      address = await getNewAddress(wandererConfig);
      if (address) {
        await AsyncStorage.setItem(WANDERER_WALLET_ADDRESS_KEY, address);
      }
    } catch (e) {
      console.warn('[walletManager] getNewAddress after createWallet failed:', e.message);
    }

    await AsyncStorage.setItem(WANDERER_WALLET_INIT_KEY, 'true');
    console.log('[walletManager] Wanderer wallet ready, address:', address);
    return { ready: true, address, error: null };

  } catch (e) {
    console.error('[walletManager] ensureWandererWallet error:', e.message);
    return {
      ready: false,
      address: null,
      error: e.message || 'UNKNOWN ERROR',
    };
  }
}

/**
 * Clear the wallet init flag — forces re-check on next Wanderer entry.
 * Use this if the user resets the app or the node is wiped.
 */
export async function clearWandererWalletFlag() {
  await AsyncStorage.multiRemove([
    WANDERER_WALLET_INIT_KEY,
    WANDERER_WALLET_ADDRESS_KEY,
  ]);
}

/**
 * Get the cached Wanderer wallet address without hitting the node.
 * Returns null if not yet initialized.
 */
export async function getCachedWandererAddress() {
  return AsyncStorage.getItem(WANDERER_WALLET_ADDRESS_KEY);
}

// ── Internal ───────────────────────────────────────────────

async function _loadOrFetchAddress(nodeConfig) {
  // Try cached address first
  const cached = await AsyncStorage.getItem(WANDERER_WALLET_ADDRESS_KEY);
  if (cached) return cached;

  // Fetch from node
  try {
    const wandererConfig = { ...nodeConfig, wandererMode: true };
    // Try listreceivedbyaddress first to get existing address
    const received = await getWalletAddresses(wandererConfig);
    if (Array.isArray(received) && received.length > 0) {
      const addr = received[0].address;
      await AsyncStorage.setItem(WANDERER_WALLET_ADDRESS_KEY, addr);
      return addr;
    }
    // No existing address — generate one
    const fresh = await getNewAddress(wandererConfig);
    if (fresh) {
      await AsyncStorage.setItem(WANDERER_WALLET_ADDRESS_KEY, fresh);
    }
    return fresh;
  } catch (e) {
    console.warn('[walletManager] _loadOrFetchAddress failed:', e.message);
    return null;
  }
}
