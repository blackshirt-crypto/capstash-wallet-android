// services/rpc.js
// N.U.K.A — CapStash RPC Service with Encrypted Config & Dual-Mode Support
//
// ══════════════════════════════════════════════════════════
// PHASE 3: Encrypted credentials, connection health, dual-mode
//
// Modes:
//   MODE_CONNECTED  — Full node sync via Tailscale/LAN
//   MODE_STANDALONE — Local mining, on-demand chain tip updates
// ══════════════════════════════════════════════════════════

import { Buffer } from 'buffer';
import EncryptedStorage from 'react-native-encrypted-storage';

// ── Constants ──────────────────────────────────────────────
const USE_MOCK        = false;
const RPC_TIMEOUT     = 10000;
const CONFIG_KEY      = 'capstash_node_config';
const MODE_KEY        = 'capstash_app_mode';

export const MODE_CONNECTED  = 'connected';
export const MODE_STANDALONE = 'standalone';

// ── In-memory cache ───────────────────────────────────────
let _cachedConfig = null;
let _cachedMode   = MODE_CONNECTED;

// ── Connection health state ───────────────────────────────
let _lastSuccessTime  = null;
let _lastBlockHeight  = null;
let _consecutiveFails = 0;

const STALE_THRESHOLD_MS = 120000; // 2 min without successful poll = stale

// ── Timeout-aware fetch ───────────────────────────────────
function fetchWithTimeout(url, options) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('RPC_TIMEOUT')), RPC_TIMEOUT)
    ),
  ]);
}

// ══════════════════════════════════════════════════════════
// CONFIG MANAGEMENT — Encrypted Storage
// ══════════════════════════════════════════════════════════

/**
 * Save node config to encrypted storage and update cache.
 * @param {{ ip: string, port: string, rpcuser: string, rpcpassword: string }} config
 */
export async function saveNodeConfig(config) {
  const merged = { port: '8332', ...config };
  await EncryptedStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
  _cachedConfig = merged;
  _consecutiveFails = 0;
  _lastSuccessTime  = null;
  _lastBlockHeight  = null;
  return merged;
}

/**
 * Load node config from encrypted storage (or cache).
 * Returns null if nothing saved yet — triggers first-run setup.
 */
export async function loadNodeConfig() {
  if (_cachedConfig) return _cachedConfig;
  try {
    const raw = await EncryptedStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // trim all string fields to strip any accidental spaces
      _cachedConfig = {
        ...parsed,
        ip:          parsed.ip?.trim(),
        port:        parsed.port?.trim(),
        rpcuser:     parsed.rpcuser?.trim(),
        rpcpassword: parsed.rpcpassword?.trim(),
      };
      // re-save the cleaned config
      await EncryptedStorage.setItem(CONFIG_KEY, JSON.stringify(_cachedConfig));
      return _cachedConfig;
    }
  } catch (e) {
    console.warn('[RPC] Failed to load encrypted config:', e.message);
  }
  return null;
}

/**
 * Clear stored config (for logout / reset).
 */
export async function clearNodeConfig() {
  await EncryptedStorage.removeItem(CONFIG_KEY);
  _cachedConfig     = null;
  _consecutiveFails = 0;
  _lastSuccessTime  = null;
  _lastBlockHeight  = null;
}

/**
 * Check if a config has been saved (quick check for first-run gate).
 */
export async function hasNodeConfig() {
  if (_cachedConfig) return true;
  const raw = await EncryptedStorage.getItem(CONFIG_KEY);
  return raw !== null;
}

// ══════════════════════════════════════════════════════════
// MODE MANAGEMENT
// ══════════════════════════════════════════════════════════

export async function saveAppMode(mode) {
  await EncryptedStorage.setItem(MODE_KEY, mode);
  _cachedMode = mode;
}

export async function loadAppMode() {
  if (_cachedMode) return _cachedMode;
  try {
    const raw = await EncryptedStorage.getItem(MODE_KEY);
    if (raw && (raw === MODE_CONNECTED || raw === MODE_STANDALONE)) {
      _cachedMode = raw;
      return _cachedMode;
    }
  } catch (e) {
    console.warn('[RPC] Failed to load app mode:', e.message);
  }
  return MODE_CONNECTED;
}

export function getCurrentMode() {
  return _cachedMode;
}

// ══════════════════════════════════════════════════════════
// CONNECTION HEALTH
// ══════════════════════════════════════════════════════════

export function getConnectionHealth() {
  const now            = Date.now();
  const msSinceSuccess = _lastSuccessTime ? now - _lastSuccessTime : null;
  const isStale        = msSinceSuccess !== null && msSinceSuccess > STALE_THRESHOLD_MS;
  return {
    lastSuccessTime:  _lastSuccessTime,
    lastBlockHeight:  _lastBlockHeight,
    consecutiveFails: _consecutiveFails,
    isStale,
    isConnected: _consecutiveFails === 0 && _lastSuccessTime !== null,
    msSinceSuccess,
  };
}

function _recordSuccess(blockHeight) {
  _lastSuccessTime  = Date.now();
  _consecutiveFails = 0;
  if (blockHeight !== undefined) _lastBlockHeight = blockHeight;
}

function _recordFailure() {
  _consecutiveFails += 1;
}

// ══════════════════════════════════════════════════════════
// CORE RPC CALL
// ══════════════════════════════════════════════════════════

/**
 * Core RPC call. Uses provided config OR falls back to cached config.
 * @param {object|null} nodeConfig — pass null to use stored/cached config
 * @param {string} method
 * @param {array}  params
 */
async function rpcCall(nodeConfig, method, params = []) {
  if (USE_MOCK) return getMockResponse(method, params);

  const cfg = nodeConfig || _cachedConfig;
  if (!cfg) throw new Error('NO_CONFIG');

  // ip and port are stored separately — build URL cleanly
  const { ip, port = '8332', rpcuser, rpcpassword } = cfg;
  const url = `http://${ip}:${port}`;

  const body = JSON.stringify({
    jsonrpc: '1.0',
    id:      method,
    method,
    params,
  });

  const auth = Buffer.from(`${rpcuser}:${rpcpassword}`).toString('base64');

  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Basic ${auth}`,
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`RPC_AUTH_FAIL: ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || 'RPC_ERROR');
    _recordSuccess();
    return json.result;
  } catch (err) {
    _recordFailure();
    throw err;
  }
}

// ══════════════════════════════════════════════════════════
// CONNECTION TEST
// ══════════════════════════════════════════════════════════

/**
 * Test a config without saving it.
 * Returns { success, blockHeight, error }.
 */
export async function testConnection(config) {
  try {
    const result = await rpcCall(config, 'getblockcount');
    return { success: true, blockHeight: result, error: null };
  } catch (err) {
    return { success: false, blockHeight: null, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════
// PUBLIC RPC METHODS
// ══════════════════════════════════════════════════════════

export async function getBlockCount(nodeConfig = null) {
  const height = await rpcCall(nodeConfig, 'getblockcount');
  _recordSuccess(height);
  return height;
}

export async function getMiningInfo(nodeConfig = null) {
  return rpcCall(nodeConfig, 'getmininginfo');
}

export async function getBalance(nodeConfig = null) {
  return rpcCall(nodeConfig, 'getbalance');
}

export async function getBalances(nodeConfig = null) {
  return rpcCall(nodeConfig, 'getbalances');
}

// ← fixed: consistent lowercase 's' to match all screen imports
export async function getNetworkHashPs(nodeConfig = null) {
  return rpcCall(nodeConfig, 'getnetworkhashps');
}

export async function getBlockHash(nodeConfig = null, height) {
  return rpcCall(nodeConfig, 'getblockhash', [height]);
}

export async function getBlock(nodeConfig = null, hash, verbosity = 1) {
  return rpcCall(nodeConfig, 'getblock', [hash, verbosity]);
}

export async function getBlockTemplate(nodeConfig = null) {
  return rpcCall(nodeConfig, 'getblocktemplate', [{ rules: ['segwit'] }]);
}

export async function submitBlock(nodeConfig = null, hexdata) {
  return rpcCall(nodeConfig, 'submitblock', [hexdata]);
}

export async function listTransactions(nodeConfig = null, count = 20) {
  return rpcCall(nodeConfig, 'listtransactions', ['*', count]);
}

export async function getNewAddress(nodeConfig = null) {
  return rpcCall(nodeConfig, 'getnewaddress');
}

export async function getWalletAddresses(nodeConfig = null) {
  return rpcCall(nodeConfig, 'listreceivedbyaddress', [0, true]);
}

export async function listReceivedByAddress(nodeConfig = null, minConf = 0, includeEmpty = true) {
  return rpcCall(nodeConfig, 'listreceivedbyaddress', [minConf, includeEmpty]);
}

export async function getBlockchainInfo(nodeConfig = null) {
  return rpcCall(nodeConfig, 'getblockchaininfo');
}

export async function getNetworkInfo(nodeConfig = null) {
  return rpcCall(nodeConfig, 'getnetworkinfo');
}

export async function getPeerInfo(nodeConfig = null) {
  return rpcCall(nodeConfig, 'getpeerinfo');
}

export async function getRawMempool(nodeConfig = null) {
  return rpcCall(nodeConfig, 'getrawmempool');
}
export async function getMempoolInfo(nodeConfig = null) {
  return rpcCall(nodeConfig, 'getmempoolinfo');
}

export async function getDifficulty(nodeConfig = null) {
  return rpcCall(nodeConfig, 'getdifficulty');
}

export async function sendToAddress(nodeConfig = null, address, amount) {
  return rpcCall(nodeConfig, 'sendtoaddress', [address, amount]);
}

// ══════════════════════════════════════════════════════════
// MOCK DATA (dev/offline use — USE_MOCK = true to enable)
// ══════════════════════════════════════════════════════════

function getMockResponse(method) {
  const mocks = {
    getblockcount:    2855,
    getblockhash:     '0000abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
    getnetworkhashps: 175500000,
    getmininginfo: {
      blocks:        2855,
      difficulty:    3.128,
      networkhashps: 175500000,
    },
    getbalance:  42.5,
    getbalances: {
      mine: { trusted: 42.5, untrusted_pending: 0, immature: 1.0 },
    },
    getblockchaininfo: {
      chain:         'main',
      blocks:        2855,
      bestblockhash: '0000abcdef...',
      difficulty:    3.128,
      mediantime:    Math.floor(Date.now() / 1000) - 30,
    },
    getnetworkinfo: {
      version:         250000,
      subversion:      '/CapStash:25.0.0/',
      connections:     4,
      connections_in:  1,
      connections_out: 3,
    },
    getpeerinfo:    [],
    getrawmempool:  [],
    getdifficulty:  3.128,
    listtransactions: [
      {
        address:       'cap1qexampleaddr',
        category:      'receive',
        amount:        1.0,
        confirmations: 12,
        time:          Math.floor(Date.now() / 1000) - 3600,
        txid:          'mocktx001',
      },
    ],
    listreceivedbyaddress: [
      { address: 'cap1qexampleaddr', amount: 42.5, confirmations: 100 },
    ],
    getnewaddress:   'cap1qnewmockaddress',
    getblocktemplate: {
      version:           536870912,
      previousblockhash: '0000abcdef...',
      transactions:      [],
      coinbasevalue:     100000000,
      target:            '00000ffff0000000000000000000000000000000000000000000000000000000',
      bits:              '1d00ffff',
      height:            2856,
      curtime:           Math.floor(Date.now() / 1000),
    },
  };
  return Promise.resolve(mocks[method] ?? null);
}