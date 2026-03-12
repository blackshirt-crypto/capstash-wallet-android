// services/blockHeader.js
// 80-byte block header builder + target calculation for CapStash mining

/**
 * Build an 80-byte block header buffer (little-endian)
 * @param {object} params
 * @param {number} params.version
 * @param {string} params.prevHash - 64-char hex (big-endian from RPC)
 * @param {string} params.merkleRoot - 64-char hex (big-endian from RPC)
 * @param {number} params.time - Unix timestamp
 * @param {string} params.bits - 8-char hex string (e.g. "1d00ffff")
 * @param {number} params.nonce
 * @returns {Buffer} 80-byte header
 */
export function buildBlockHeader({ version, prevHash, merkleRoot, time, bits, nonce }) {
  const header = Buffer.alloc(80);
  let offset = 0;

  // nVersion — 4 bytes LE
  header.writeUInt32LE(version, offset);
  offset += 4;

  // hashPrevBlock — 32 bytes (reverse from RPC big-endian hex)
  Buffer.from(prevHash, 'hex').reverse().copy(header, offset);
  offset += 32;

  // hashMerkleRoot — 32 bytes (reverse from RPC big-endian hex)
  Buffer.from(merkleRoot, 'hex').reverse().copy(header, offset);
  offset += 32;

  // nTime — 4 bytes LE
  header.writeUInt32LE(time, offset);
  offset += 4;

  // nBits — 4 bytes LE
  header.writeUInt32LE(parseInt(bits, 16), offset);
  offset += 4;

  // nNonce — 4 bytes LE
  header.writeUInt32LE(nonce, offset);

  return header;
}

/**
 * Calculate the 256-bit target from compact nBits representation
 * @param {string} bitsHex - 8-char hex string (e.g. "1d00ffff")
 * @returns {Buffer} 32-byte target (little-endian for comparison)
 */
export function targetFromBits(bitsHex) {
  const bits = parseInt(bitsHex, 16);
  const exponent = (bits >> 24) & 0xff;
  const mantissa = bits & 0x007fffff;

  const target = Buffer.alloc(32, 0);

  // mantissa is 3 bytes, placed at byte position (exponent - 3)
  const start = exponent - 3;
  if (start >= 0 && start < 30) {
    target[start + 2] = (mantissa >> 0) & 0xff;
    target[start + 1] = (mantissa >> 8) & 0xff;
    target[start + 0] = (mantissa >> 16) & 0xff;
  }

  // Reverse to little-endian for hash comparison
  return Buffer.from(target.reverse());
}