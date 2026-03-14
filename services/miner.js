// services/miner.js
// CapStash phone miner — Whirlpool-512 PoW
//
// Performance design:
//   - Tight synchronous nonce burst (BURST_SIZE hashes, zero awaits inside)
//   - Template refresh on 30-second timer, NOT every burst
//   - UI hashrate update on 1-second timer, NOT tied to nonce count
//   - One await per burst (setTimeout 0) to yield to RN scheduler

import {
  capstashPoWHash,
  buildHeader,
  setNonce,
  setTime,
  hashMeetsTarget,
  bytesToHex,
  hexToBytes,
} from './whirlpool';

import { getBlockTemplate, submitBlock } from './getBlockTemplate';

let mining = false;
let onHashUpdate = null;
let onBlockFound = null;

// Hashes per synchronous burst before yielding to RN scheduler.
// 50000 is a good balance on modern Android — tune up if hashrate allows.
const BURST_SIZE = 50000;

// How often to poll node for new template (ms)
const TEMPLATE_REFRESH_MS = 30000;

// ── Public API ─────────────────────────────────────────────────────────────

export function startMining({ nodeConfig, miningAddress, onHash, onBlock }) {
  if (mining) return;
  if (!miningAddress) { console.warn('[MINER] no miningAddress set'); return; }
  mining = true;
  onHashUpdate = onHash || (() => {});
  onBlockFound = onBlock || (() => {});
  mineLoop(nodeConfig, miningAddress);
}

export function stopMining() {
  mining = false;
}

// ── Mining loop ────────────────────────────────────────────────────────────

async function mineLoop(nodeConfig, miningAddress) {
  while (mining) {
    try {
      const template = await getBlockTemplate(nodeConfig);
      await mineTemplate(nodeConfig, template, miningAddress);
    } catch (err) {
      console.warn('[MINER] loop error:', err.message);
      await sleep(5000);
    }
  }
}

async function mineTemplate(nodeConfig, template, miningAddress) {
  const {
    version,
    previousblockhash,
    transactions,
    coinbasevalue,
    bits,
    height,
    curtime,
    target: targetHex,
  } = template;

  // Build coinbase + merkle root ONCE per template (not per hash)
  const coinbaseTxHex = buildCoinbaseTx(coinbasevalue, height, miningAddress);
  const coinbaseTxId  = doubleSha256Hex(coinbaseTxHex);
  const txids         = [coinbaseTxId, ...transactions.map(t => t.txid || t.hash)];
  const merkleRoot    = buildMerkleRoot(txids);
  const target        = hexToBytes(targetHex);

  // Build header once — mutate nonce + time in place during mining
  const header = buildHeader(
    version,
    previousblockhash,
    merkleRoot,
    curtime,
    parseInt(bits, 16),
    0,
  );

  let nonce             = 0;
  let totalHashes       = 0;
  let lastHashrateTime  = Date.now();
  let lastHashrateCount = 0;
  let lastTemplateTime  = Date.now();

  while (mining && nonce <= 0xFFFFFFFF) {

    // ── Tight synchronous burst — ZERO awaits inside ──────────────────────
    const burstEnd = Math.min(nonce + BURST_SIZE, 0x100000000);
    while (nonce < burstEnd) {
      setNonce(header, nonce);
      const hash = capstashPoWHash(header);
      if (hashMeetsTarget(hash, target)) {
        // capstashPoWHash returns a reused buffer — copy before any await
        const hashCopy = new Uint8Array(hash);
        const blockHex = serializeBlock(header, coinbaseTxHex, transactions);
        try {
          const result = await submitBlock(nodeConfig, blockHex);
          if (onBlockFound) onBlockFound({ height, hash: bytesToHex(hashCopy), nonce, result });
        } catch (e) {
          console.warn('[MINER] submitBlock failed:', e.message);
        }
        return; // get fresh template
      }
      nonce++;
    }
    totalHashes += (burstEnd - (nonce - (burstEnd - (nonce - BURST_SIZE < 0 ? nonce : BURST_SIZE))));
    // simpler: just track directly
    totalHashes = nonce; // nonce == hashes computed since template start

    // ── Single yield to RN scheduler (keeps UI alive) ────────────────────
    await yieldToScheduler();

    const now = Date.now();

    // Hashrate display: update every ~1 second
    if (now - lastHashrateTime >= 1000) {
      const elapsed = (now - lastHashrateTime) / 1000;
      const hashes  = totalHashes - lastHashrateCount;
      if (onHashUpdate) onHashUpdate(hashes / elapsed);
      lastHashrateTime  = now;
      lastHashrateCount = totalHashes;
    }

    // Update timestamp in header (every burst is fine — cheap)
    setTime(header, Math.floor(now / 1000));

    // Template refresh: check for new block every 30 seconds
    if (now - lastTemplateTime >= TEMPLATE_REFRESH_MS) {
      try {
        const fresh = await getBlockTemplate(nodeConfig);
        if (fresh.previousblockhash !== previousblockhash) {
          return; // new block found by someone — restart
        }
      } catch (_) {
        // network hiccup — keep mining on current template
      }
      lastTemplateTime = now;
    }
  }

  // nonce space exhausted (won't happen at current difficulty)
  console.log('[MINER] nonce exhausted at height', height);
}

function yieldToScheduler() {
  return new Promise(r => setTimeout(r, 0));
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Coinbase transaction builder ───────────────────────────────────────────

function buildCoinbaseTx(coinbaseValue, blockHeight, rewardAddress) {
  const version    = '01000000';
  const inputCount = '01';
  const prevHash   = '0'.repeat(64);
  const prevIndex  = 'ffffffff';

  const heightHex   = encodeScriptNum(blockHeight);
  const extraData   = '434150535441534800'; // "CAPSTASH\0"
  const cbScript    = heightHex + extraData;
  const cbScriptLen = encodeVarint(cbScript.length / 2);
  const sequence    = 'ffffffff';
  const input       = prevHash + prevIndex + cbScriptLen + cbScript + sequence;

  const outputCount = '01';
  const valueLe     = toUInt64LE(coinbaseValue);

  // Build output script from address
  let outScript;
  if (rewardAddress && rewardAddress.startsWith('cap1')) {
    // P2WPKH: OP_0 <20-byte-pubkey-hash>
    // Decode bech32 to get the witness program (20 bytes)
    const witProg = bech32Decode(rewardAddress);
    if (witProg) {
      // scriptPubKey: OP_0 (0x00) + PUSH20 (0x14) + 20 bytes
      outScript = '0014' + witProg;
    } else {
      outScript = '6a'; // fallback OP_RETURN if decode fails
    }
  } else if (rewardAddress && rewardAddress.startsWith('C')) {
    // P2PKH: OP_DUP OP_HASH160 <20-byte-hash> OP_EQUALVERIFY OP_CHECKSIG
    const hash160 = base58CheckDecode(rewardAddress);
    if (hash160) {
      outScript = '76a914' + hash160 + '88ac';
    } else {
      outScript = '6a'; // fallback OP_RETURN if decode fails
    }
  } else {
    outScript = '6a'; // OP_RETURN fallback
  }

  const outScriptLen = encodeVarint(outScript.length / 2);
  const output       = valueLe + outScriptLen + outScript;

  const locktime = '00000000';
  return version + inputCount + input + outputCount + output + locktime;
}

// ── Merkle root ────────────────────────────────────────────────────────────

function buildMerkleRoot(txids) {
  if (txids.length === 0) return '00'.repeat(32);
  let layer = txids.map(reverseHex);
  while (layer.length > 1) {
    if (layer.length % 2 !== 0) layer.push(layer[layer.length - 1]);
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      next.push(doubleSha256Hex(layer[i] + layer[i + 1]));
    }
    layer = next;
  }
  return reverseHex(layer[0]);
}

// ── Block serialization ────────────────────────────────────────────────────

function serializeBlock(header, coinbaseTxHex, transactions) {
  const headerHex = bytesToHex(header);
  const txCount   = 1 + transactions.length;
  const varint    = encodeVarint(txCount);
  const txHexes   = [coinbaseTxHex, ...transactions.map(t => t.data)].join('');
  return headerHex + varint + txHexes;
}

// ── SHA-256 (used only for coinbase txid — once per template, not per hash) ─

const _SHA256_K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,
  0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,
  0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,
  0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,
  0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,
  0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,
  0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,
  0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,
  0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]);
const _sha256W = new Uint32Array(64);

function sha256Bytes(data) {
  const bitLen = data.length * 8;
  let padLen   = data.length + 1;
  while ((padLen % 64) !== 56) padLen++;
  const full   = new Uint8Array(padLen + 8);
  full.set(data);
  full[data.length] = 0x80;
  const dv = new DataView(full.buffer);
  dv.setUint32(padLen,     Math.floor(bitLen / 0x100000000) >>> 0, false);
  dv.setUint32(padLen + 4, bitLen >>> 0,                           false);

  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a;
  let h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;

  for (let i = 0; i < full.length; i += 64) {
    const fv = new DataView(full.buffer, i, 64);
    for (let j = 0;  j < 16; j++) _sha256W[j] = fv.getUint32(j * 4, false);
    for (let j = 16; j < 64; j++) {
      const s0 = rotr32(_sha256W[j-15],7)^rotr32(_sha256W[j-15],18)^(_sha256W[j-15]>>>3);
      const s1 = rotr32(_sha256W[j-2],17)^rotr32(_sha256W[j-2],19)^(_sha256W[j-2]>>>10);
      _sha256W[j] = (_sha256W[j-16]+s0+_sha256W[j-7]+s1) >>> 0;
    }
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for (let j = 0; j < 64; j++) {
      const S1    = rotr32(e,6)^rotr32(e,11)^rotr32(e,25);
      const ch    = (e&f)^(~e&g);
      const temp1 = (h+S1+ch+_SHA256_K[j]+_sha256W[j]) >>> 0;
      const S0    = rotr32(a,2)^rotr32(a,13)^rotr32(a,22);
      const maj   = (a&b)^(a&c)^(b&c);
      const temp2 = (S0+maj) >>> 0;
      h=g; g=f; f=e; e=(d+temp1)>>>0;
      d=c; c=b; b=a; a=(temp1+temp2)>>>0;
    }
    h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0;
    h4=(h4+e)>>>0; h5=(h5+f)>>>0; h6=(h6+g)>>>0; h7=(h7+h)>>>0;
  }

  const out = new Uint8Array(32);
  const ov  = new DataView(out.buffer);
  ov.setUint32(0,h0>>>0,false); ov.setUint32(4,h1>>>0,false);
  ov.setUint32(8,h2>>>0,false); ov.setUint32(12,h3>>>0,false);
  ov.setUint32(16,h4>>>0,false); ov.setUint32(20,h5>>>0,false);
  ov.setUint32(24,h6>>>0,false); ov.setUint32(28,h7>>>0,false);
  return out;
}

function rotr32(x, n) { return (x >>> n) | (x << (32 - n)); }

function doubleSha256Hex(hex) {
  const b = hexToBytes(hex);
  return bytesToHex(sha256Bytes(sha256Bytes(b)));
}

// ── Encoding helpers ───────────────────────────────────────────────────────

function encodeVarint(n) {
  if (n < 0xfd) return n.toString(16).padStart(2, '0');
  if (n <= 0xffff) return 'fd' + n.toString(16).padStart(4, '0');
  return 'fe' + n.toString(16).padStart(8, '0');
}

function toUInt64LE(value) {
  const lo = value >>> 0;
  const hi = Math.floor(value / 0x100000000) >>> 0;
  return [lo&0xff,(lo>>8)&0xff,(lo>>16)&0xff,(lo>>24)&0xff,
          hi&0xff,(hi>>8)&0xff,(hi>>16)&0xff,(hi>>24)&0xff]
    .map(b => b.toString(16).padStart(2,'0')).join('');
}

function encodeScriptNum(n) {
  if (n === 0) return '00';
  const bytes = [];
  let num = n;
  while (num > 0) { bytes.push(num & 0xff); num >>= 8; }
  if (bytes[bytes.length-1] & 0x80) bytes.push(0x00);
  return bytes.length.toString(16).padStart(2,'0') +
    bytes.map(b => b.toString(16).padStart(2,'0')).join('');
}

function reverseHex(hex) {
  return hex.match(/.{2}/g).reverse().join('');
}

// ── Address decode helpers ─────────────────────────────────────────────────

// Bech32 decode — returns 20-byte witness program as hex, or null on failure
// Handles HRP "cap" (CapStash SegWit addresses starting with cap1)
function bech32Decode(addr) {
  try {
    const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
    const lower = addr.toLowerCase();
    const sepIdx = lower.lastIndexOf('1');
    if (sepIdx < 1) return null;
    const data = [];
    for (let i = sepIdx + 1; i < lower.length - 6; i++) {
      const v = CHARSET.indexOf(lower[i]);
      if (v < 0) return null;
      data.push(v);
    }
    // data[0] is witness version (should be 0 for P2WPKH)
    if (data[0] !== 0) return null;
    // Convert 5-bit groups to 8-bit bytes (skip version byte)
    const words = data.slice(1);
    const bytes = [];
    let acc = 0, bits = 0;
    for (const w of words) {
      acc = (acc << 5) | w;
      bits += 5;
      if (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 0xff); }
    }
    if (bytes.length !== 20) return null;
    return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (_) { return null; }
}

// Base58Check decode — returns 20-byte hash160 as hex, or null on failure
// For CapStash legacy addresses (version byte 0x1C = 28 for 'C' prefix)
function base58CheckDecode(addr) {
  try {
    const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = BigInt(0);
    for (const c of addr) {
      const idx = ALPHA.indexOf(c);
      if (idx < 0) return null;
      num = num * BigInt(58) + BigInt(idx);
    }
    // Convert to 25 bytes
    const bytes = [];
    for (let i = 0; i < 25; i++) {
      bytes.unshift(Number(num & BigInt(0xff)));
      num >>= BigInt(8);
    }
    // bytes[0] = version, bytes[1..20] = hash160, bytes[21..24] = checksum
    return bytes.slice(1, 21).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (_) { return null; }
}