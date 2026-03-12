// services/miner.js
// CapStash phone miner — Whirlpool-512 PoW
// Imports from whirlpool.js (verified against blocks 1 and 4454)

import {
  capstashPoWHash,
  buildHeader,
  setNonce,
  setTime,
  bitsToTarget,
  hashMeetsTarget,
  bytesToHex,
} from './whirlpool';

import { getBlockTemplate, submitBlock } from './getBlockTemplate';

let mining = false;
let onHashUpdate = null;   // callback(hashrate: number)
let onBlockFound = null;   // callback({ height, hash, result })

const NONCE_BATCH = 4096;  // nonces per tip-check / hashrate update

// ── Public API ─────────────────────────────────────────────────────────────

export function startMining({ nodeConfig, onHash, onBlock }) {
  if (mining) return;
  mining = true;
  onHashUpdate = onHash || (() => {});
  onBlockFound = onBlock || (() => {});
  mineLoop(nodeConfig);
}

export function stopMining() {
  mining = false;
  onHashUpdate = null;
  onBlockFound = null;
}

// ── Mining loop ────────────────────────────────────────────────────────────

async function mineLoop(nodeConfig) {
  while (mining) {
    try {
      // 1. Fetch block template
      const template = await getBlockTemplate(nodeConfig);
      const {
        version,
        previousblockhash,
        transactions,
        coinbaseaux,
        bits,
        height,
        curtime,
      } = template;

      // Coinbase transaction is first in template.transactions
      // or provided separately depending on node version
      const coinbaseTxn = template.coinbasetxn?.data || transactions[0]?.data || '';
      const txList = template.transactions || [];

      const target = bitsToTarget(parseInt(bits, 16));

      // 2. Build initial header (reused across nonce loop with setNonce/setTime)
      const header = buildHeader(
        version,
        previousblockhash,
        template.merkleroot,
        curtime,
        parseInt(bits, 16),
        0,
      );

      let nonce = 0;
      let nTime = curtime;
      let hashCount = 0;
      let startTime = Date.now();
      let prevHash = previousblockhash;

      // 3. Nonce loop
      while (mining && nonce <= 0xFFFFFFFF) {
        setNonce(header, nonce);

        const hash = capstashPoWHash(header);
        hashCount++;

        if (hashMeetsTarget(hash, target)) {
          // BLOCK FOUND
          const blockHex = serializeBlock(header, coinbaseTxn, txList);
          const result = await submitBlock(nodeConfig, blockHex);
          onBlockFound({ height, hash: bytesToHex(hash), result });
          break; // restart with new template
        }

        nonce++;

        if (nonce % NONCE_BATCH === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          onHashUpdate(elapsed > 0 ? hashCount / elapsed : 0);

          // Refresh nTime
          nTime = Math.floor(Date.now() / 1000);
          setTime(header, nTime);

          // Check if chain tip changed
          try {
            const fresh = await getBlockTemplate(nodeConfig);
            if (fresh.previousblockhash !== prevHash) {
              break; // new block on network — get fresh template
            }
          } catch (_) {
            // network hiccup — keep mining on current template
          }
        }
      }

      // Nonce exhausted (extremely unlikely at current difficulty) — restart
    } catch (err) {
      console.warn('[MINER] Error:', err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// ── Block serialization ────────────────────────────────────────────────────

function serializeBlock(header, coinbaseTxn, transactions) {
  const headerHex = bytesToHex(header);
  const txCount = 1 + transactions.length;
  const varint = encodeVarint(txCount);
  const txHexes = [coinbaseTxn, ...transactions.map(t => t.data)].join('');
  return headerHex + varint + txHexes;
}

function encodeVarint(n) {
  if (n < 0xfd) return n.toString(16).padStart(2, '0');
  if (n <= 0xffff) return 'fd' + n.toString(16).padStart(4, '0');
  return 'fe' + n.toString(16).padStart(8, '0');
}