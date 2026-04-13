// services/seedDerivation.js
// CapStash — BIP32 HD Key Derivation
// Uses @scure/bip32 and @scure/bip39 — browser/React Native compatible
//
// Flow:
//   mnemonic (12 words)
//     -> BIP39 seed buffer
//     -> BIP32 HD root key
//     -> derive m/44'/0'/0'/0/0
//     -> WIF private key
//     -> importprivkey into capstashd

import { mnemonicToSeedSync, validateMnemonic as scureValidate } from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { Buffer } from 'buffer';
import bs58check from 'bs58check';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';

// CapStash derivation path — m/44'/0'/0'/0/0
const DERIVATION_PATH = "m/44'/0'/0'/0/0";

// WIF version byte — 0x80 = mainnet
const WIF_VERSION = 0x9C; // CapStash mainnet WIF prefix (not Bitcoin's 0x80)

/**
 * Derive a WIF private key from a BIP39 mnemonic.
 * @param {string} mnemonic — 12 word BIP39 phrase
 * @returns {string} WIF encoded private key
 */
export function deriveWIFFromMnemonic(mnemonic) {
  const cleaned = mnemonic.trim().toLowerCase();

  // Validate mnemonic
  if (!scureValidate(cleaned, englishWordlist)) {
    throw new Error('INVALID MNEMONIC — CHECK YOUR SEED PHRASE');
  }

  // BIP39: mnemonic -> 64 byte seed buffer
  const seedBytes = mnemonicToSeedSync(cleaned);

  // BIP32: seed -> HD root key
  const root = HDKey.fromMasterSeed(seedBytes);

  // Derive child key at standard path
  const child = root.derive(DERIVATION_PATH);

  if (!child.privateKey) {
    throw new Error('KEY DERIVATION FAILED — NO PRIVATE KEY');
  }

  // Encode as WIF
  const wif = privateKeyToWIF(Buffer.from(child.privateKey));
  return wif;
}

/**
 * Derive the legacy P2PKH address from a BIP39 mnemonic
 * This is the address that corresponds to the imported private key
 * @param {string} mnemonic
 * @returns {string} legacy address (starts with C or N for CapStash mainnet)
 */
export function deriveLegacyAddressFromMnemonic(mnemonic) {
  const cleaned = mnemonic.trim().toLowerCase();

  if (!scureValidate(cleaned, englishWordlist)) {
    throw new Error('INVALID MNEMONIC — CHECK YOUR SEED PHRASE');
  }

  const seedBytes = mnemonicToSeedSync(cleaned);
  const root = HDKey.fromMasterSeed(seedBytes);
  const child = root.derive(DERIVATION_PATH);

  if (!child.publicKey) {
    throw new Error('KEY DERIVATION FAILED — NO PUBLIC KEY');
  }

  // Hash public key: HASH160 = RIPEMD160(SHA256(pubkey))
  const pubkey = Buffer.from(child.publicKey);

  // SHA256 then RIPEMD160 using @noble/hashes
  const sha256Hash = sha256(pubkey);
  const ripemd160Hash = ripemd160(sha256Hash);

  // Add version byte 0x1C (CapStash mainnet P2PKH)
  const versioned = Buffer.concat([Buffer.from([0x1C]), Buffer.from(ripemd160Hash)]);

  // Base58Check encode
  return bs58check.encode(versioned);
}

/**
 * Validate a BIP39 mnemonic
 * @param {string} mnemonic
 * @returns {boolean}
 */
export function validateMnemonic(mnemonic) {
  try {
    return scureValidate(mnemonic.trim().toLowerCase(), englishWordlist);
  } catch {
    return false;
  }
}

/**
 * Encode a raw private key buffer as WIF using bs58check
 * @param {Buffer} privateKey — 32 byte private key
 * @returns {string} WIF string
 */
function privateKeyToWIF(privateKey) {
  // WIF: version byte + private key + compressed flag
  const payload = Buffer.alloc(34);
  payload[0] = WIF_VERSION;           // 0x80 mainnet
  privateKey.copy(payload, 1);        // 32 byte key
  payload[33] = 0x01;                 // compressed pubkey flag

  // bs58check handles double SHA256 checksum automatically
  return bs58check.encode(payload);
}
