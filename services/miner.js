// services/miner.js
// CapStash miner — JS wrapper around C++ NDK miner (NativeModules.CapStashMiner)
//
// All hashing, template fetching, and block submission is done in C++.
// This file only handles:
//   - Starting/stopping the native miner
//   - Registering event listeners for hashrate/block/error callbacks
//   - Exposing a clean API to MinerScreen

import { NativeModules, NativeEventEmitter } from 'react-native';

const { CapStashMiner } = NativeModules;

if (!CapStashMiner) {
  console.error('[miner] CapStashMiner native module not found — rebuild required');
}

// ── Event emitter ──────────────────────────────────────────────────────────
const MinerEmitter = CapStashMiner
  ? new NativeEventEmitter(CapStashMiner)
  : null;

let _hashrateSub = null;
let _blockSub    = null;
let _errorSub    = null;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * startMining — start the C++ miner
 *
 * @param nodeConfig    { host, port, user, pass }
 * @param miningAddress cap1... or C... reward address
 * @param onHash        (hashrate: number) => void   — called every ~5s
 * @param onBlock       ({ height, hash }) => void   — called on block found
 * @param onError       (message: string) => void    — called on RPC errors
 * @param threads       number of mining threads (default 4)
 */
export async function startMining({
  nodeConfig,
  miningAddress,
  onHash,
  onBlock,
  onError,
  threads = 4,
}) {
  if (!CapStashMiner) {
    console.error('[miner] native module unavailable');
    return false;
  }
  if (!miningAddress) {
    console.warn('[miner] no miningAddress provided');
    return false;
  }

  // Register event listeners
  _removeListeners();

  if (onHash && MinerEmitter) {
    _hashrateSub = MinerEmitter.addListener('MinerHashrate', (e) => {
      onHash(e.hashrate);
    });
  }

  if (onBlock && MinerEmitter) {
    _blockSub = MinerEmitter.addListener('MinerBlockFound', (e) => {
      onBlock({ height: e.height, hash: e.hash });
    });
  }

  if (onError && MinerEmitter) {
    _errorSub = MinerEmitter.addListener('MinerError', (e) => {
      onError(e.message);
    });
  }

  // Build config for native module
  const config = {
    host:    nodeConfig.ip          || nodeConfig.host    || nodeConfig.rpcHost || '',
    port:    parseInt(nodeConfig.port || nodeConfig.rpcPort || 8332, 10),
    user:    nodeConfig.rpcuser     || nodeConfig.user    || nodeConfig.rpcUser || '',
    pass:    nodeConfig.rpcpassword || nodeConfig.pass    || nodeConfig.rpcPass || '',
    address: miningAddress.startsWith('cap1') || miningAddress.startsWith('CAP1') 
  ? miningAddress.toLowerCase() 
  : miningAddress,
    threads,
  };

  console.log('[miner] config:', JSON.stringify({...config, pass: '***'}));

  try {
    const result = await CapStashMiner.start(config);
    console.log('[miner] C++ miner started:', result);
    return true;
  } catch (e) {
    console.error('[miner] start failed:', e.message);
    _removeListeners();
    return false;
  }
}

/**
 * stopMining — stop all C++ mining threads
 */
export async function stopMining() {
  _removeListeners();
  if (!CapStashMiner) return;
  try {
    await CapStashMiner.stop();
    console.log('[miner] C++ miner stopped');
  } catch (e) {
    console.error('[miner] stop failed:', e.message);
  }
}

/**
 * getMinerStats — get current stats from C++ miner
 * Returns parsed stats object or null
 */
export async function getMinerStats() {
  if (!CapStashMiner) return null;
  try {
    const json = await CapStashMiner.getStats();
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

/**
 * isMinerRunning — returns true if C++ miner threads are active
 */
export async function isMinerRunning() {
  if (!CapStashMiner) return false;
  try {
    return await CapStashMiner.isRunning();
  } catch (e) {
    return false;
  }
}

// ── Internal ───────────────────────────────────────────────────────────────

function _removeListeners() {
  if (_hashrateSub) { _hashrateSub.remove(); _hashrateSub = null; }
  if (_blockSub)    { _blockSub.remove();    _blockSub    = null; }
  if (_errorSub)    { _errorSub.remove();    _errorSub    = null; }
}