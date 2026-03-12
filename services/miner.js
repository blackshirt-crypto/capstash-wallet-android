// services/miner.js
import { getBlockTemplate, submitBlock } from './getBlockTemplate';
import { buildHeader, targetFromBits } from './blockHeader';
import { getPoWHash, toHex } from './whirlpool';

let mining = false;
let onHashUpdate = null;   // callback for UI hashrate display
let onBlockFound = null;   // callback when block solved

const NONCE_BATCH = 4096;  // check tip every 4096 nonces

export function startMining({ rigIp, rpcUser, rpcPass, onHash, onBlock }) {
  mining = true;
  onHashUpdate = onHash || (() => {});
  onBlockFound = onBlock || (() => {});
  mineLoop(rigIp, rpcUser, rpcPass);
}

export function stopMining() {
  mining = false;
  onHashUpdate = null;
  onBlockFound = null;
}

async function mineLoop(ip, user, pass) {
  while (mining) {
    try {
      // 1. Fetch template from node
      const template = await getBlockTemplate(ip, user, pass);
      const { bits, prevHash, merkleRoot, height, coinbaseTxn, transactions } = template;

      const target = targetFromBits(bits);
      let nonce = 0;
      let nTime = Math.floor(Date.now() / 1000);
      let hashCount = 0;
      let startTime = Date.now();

      // 2. Nonce loop
      while (mining && nonce <= 0xFFFFFFFF) {
        // Build 80-byte header
        const header = buildHeader({
          version: template.version,
          prevHash,
          merkleRoot,
          nTime,
          nBits: bits,
          nonce,
        });

        // 3. Hash: Whirlpool-512 → XOR fold → 32 bytes
        const hash = getPoWHash(header);
        hashCount++;

        // 4. Compare hash vs target (both as Uint8Array, big-endian)
        if (compareBE(hash, target) <= 0) {
          // BLOCK FOUND!
          const blockHex = serializeBlock(header, coinbaseTxn, transactions);
          const result = await submitBlock(ip, user, pass, blockHex);
          onBlockFound({ height, hash: toHex(hash), result });
        }

        nonce++;

        // 5. Every NONCE_BATCH: update hashrate, refresh nTime, check tip
        if (nonce % NONCE_BATCH === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          const hashrate = hashCount / elapsed;
          onHashUpdate(hashrate);

          // Update nTime
          nTime = Math.floor(Date.now() / 1000);

          // Check if chain tip changed (new block from network)
          try {
            const freshTemplate = await getBlockTemplate(ip, user, pass);
            if (freshTemplate.prevHash !== prevHash) {
              break; // New block on network — restart with new template
            }
          } catch (e) { /* continue mining on current template */ }
        }
      }
    } catch (err) {
      console.warn('[MINER] Template fetch error:', err.message);
      // Wait 5s before retrying
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// Compare two Uint8Arrays as big-endian 256-bit numbers
function compareBE(a, b) {
  for (let i = 0; i < 32; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

// Serialize full block for submitblock RPC
function serializeBlock(header, coinbaseTxn, transactions) {
  // header (80 bytes hex) + varint(txCount) + coinbase + txs
  const headerHex = toHex(header);
  const txCount = 1 + transactions.length;
  const varint = txCount < 0xfd
    ? txCount.toString(16).padStart(2, '0')
    : 'fd' + txCount.toString(16).padStart(4, '0');
  const txHexes = [coinbaseTxn, ...transactions.map(t => t.data)].join('');
  return headerHex + varint + txHexes;
}