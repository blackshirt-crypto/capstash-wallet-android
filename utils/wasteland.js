// utils/wasteland.js
// N.U.K.A — Deterministic wasteland identity system
//
// Every wallet address maps to a unique wasteland name derived
// from its hash. The same address ALWAYS produces the same name
// on every device, forever, with no server required.
//
// Tier probabilities:
//   MYTHIC     ~1 in 100,000  ☆  Animated gradient shimmer
//   LEGENDARY  ~1 in 10,000   ★★★  Gold — galaxy-touched wanderers
//   RARE       ~1 in 1,000    ★★  Yellow-green electric pulse
//   UNCOMMON   ~1 in 100      ★   Aqua mint
//   COMMON     everyone else      Standard phosphor green

// ── Name Pools ─────────────────────────────────────────────

const COMMON_ADJ = [
  'RUSTY','IRON','DEAD','NUKA','TOXIC','CHROME','GRIM','WILD',
  'ATOMIC','VAULT','RADIATED','SCORCHED','HOLLOW','CURSED','BURNED',
  'STEEL','BROKEN','DARK','LOST','SILENT','ROGUE','BITTER','PALE',
  'FERAL','ASHEN','CRACKED','FROZEN','BLAZING','ROTTING','STATIC',
  'SHATTERED','BLEAK','JAGGED','RUINED','SMOKED','WIRED','TORN',
];

const COMMON_NOUN = [
  'MOLERAT','GECKO','BRAHMIN','RAIDER','GHOUL','DEATHCLAW',
  'MUTANT','VAULTBOY','WANDERER','OVERSEER','SETTLER','RANGER',
  'SCAVVER','DRIFTER','OUTCAST','WASTER','STALKER','HUNTER',
  'COURIER','PILGRIM','SCOUNDREL','DRIFTER','WRAITH','NOMAD',
  'VAGRANT','MARAUDER','EXILE','SCOUT','RENEGADE','SHADOW',
];

const UNCOMMON_TITLES = [
  'VAULT OVERSEER','WASTELAND MARSHAL','STEEL RANGER COMMANDER',
  'BROTHERHOOD SENTINEL','SHADOW OF THE INSTITUTE',
  'COURIER OF THE DEAD LANDS','RAIDER KING','GHOUL LORD',
  'KEEPER OF VAULT 13','WARDEN OF THE WASTELAND',
  'PROTECTOR OF THE COMMONWEALTH','LAST MINUTEMAN',
  'ENFORCER OF THE DIVIDE','GHOST OF THE CAPITAL',
];

const RARE_NAMES = [
  'SENTINEL OF THE WASTE','IRON PROPHET OF THE RUINS',
  'LAST GUARDIAN OF VAULT ZERO','WARLORD OF THE DEAD ZONE',
  'PHANTOM OF THE FALLOUT','CHAMPION OF THE SCORCHED EARTH',
  'KEEPER OF THE BROKEN ATOM','SHADOW OF THE FINAL WAR',
  'HERALD OF THE NUCLEAR AGE','SOVEREIGN OF THE ASH LANDS',
  'ORACLE OF THE GLOWING SEA','WARDEN OF THE FORBIDDEN ZONE',
];

// Star Wars-inspired but copyright-safe — galaxy-touched wanderers
// who found their way into the wasteland
const LEGENDARY_NAMES = [
  'SCOUNDREL OF KESSEL',
  'BOUNTY HUNTER SUPREME',
  'LAST OF THE JEDI ORDER',
  'LORD OF THE DARK SIDE',
  'ANCIENT GALAXY WANDERER',
  'PILOT OF THE GOLDEN FALCON',
  'KEEPER OF THE ANCIENT POWER',
  'MASTER OF THE PLASMA BLADE',
  'SHADOW OF THE FALLEN EMPIRE',
  'GUARDIAN OF THE OLD REPUBLIC',
  'CHOSEN ONE OF THE PROPHECY',
  'KNIGHT OF THE FORGOTTEN ORDER',
  'EXILE OF THE GALACTIC SENATE',
  'HARBINGER OF THE FORCE',
];

// Ultra-rare mythic names — one of a kind energy
const MYTHIC_NAMES = [
  'ANCIENT GREEN MASTER',
  'THE ONE WHO WALKS BETWEEN STARS',
  'KEEPER OF THE WASTELAND FORCE',
  'SOVEREIGN OF THE NUCLEAR AGE',
  'THE LAST VAULT PROPHET',
  'HERALD OF THE ATOMIC DAWN',
  'GHOST OF THE FIRST WORLD',
  'VOICE OF THE DEAD GODS',
  'WATCHER AT THE END OF TIME',
  'THE UNNAMED ONE',
];

// ── Hash Function ───────────────────────────────────────────
// Simple deterministic hash — same input always same output
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return Math.abs(h >>> 0);
}

// ── Tier Detection ──────────────────────────────────────────
export function getTier(address) {
  if (!address || address.length < 4) return 'common';
  const roll = djb2(address + 'nuka_tier') % 100000;
  if (roll < 1)    return 'mythic';
  if (roll < 10)   return 'legendary';
  if (roll < 100)  return 'rare';
  if (roll < 1000) return 'uncommon';
  return 'common';
}

// ── Name Generation ─────────────────────────────────────────
export function generateWastelandName(address) {
  if (!address || address.length < 4) {
    return {
      name: 'UNKNOWN WANDERER #0000',
      fullName: 'UNKNOWN WANDERER #0000',
      tier: 'common',
      verified: false,
    };
  }

  const tier = getTier(address);
  const h1 = djb2(address);
  const h2 = djb2(address + 'nuka_b');
  const h3 = djb2(address + 'nuka_c');

  let name;
  switch (tier) {
    case 'mythic':
      name = MYTHIC_NAMES[h1 % MYTHIC_NAMES.length];
      break;
    case 'legendary':
      name = LEGENDARY_NAMES[h1 % LEGENDARY_NAMES.length];
      break;
    case 'rare':
      name = RARE_NAMES[h1 % RARE_NAMES.length];
      break;
    case 'uncommon':
      name = UNCOMMON_TITLES[h1 % UNCOMMON_TITLES.length] +
             ' #' + String(h3 % 9999).padStart(4, '0');
      break;
    default: // common
      name = COMMON_ADJ[h1 % COMMON_ADJ.length] + ' ' +
             COMMON_NOUN[h2 % COMMON_NOUN.length] + ' ' +
             '#' + String(h3 % 9999).padStart(4, '0');
  }

  const stars = { mythic:'☆ ', legendary:'★★★ ', rare:'★★ ', uncommon:'★ ', common:'' }[tier];

  return {
    name,                         // base name without stars
    fullName: stars + name,       // display name with tier prefix
    tier,
    stars: stars.trim(),
    verified: true,               // ⬡ cryptographically derived
  };
}

// ── Alias Validation ────────────────────────────────────────
// Custom aliases are secondary to the cryptographic identity.
// Hard limits to keep the identity system sacred.

const RESERVED_WORDS = [
  'NAKAMOTO','SATOSHI','ADMIN','OWNER','NUKA','CAPSTASH',
  'VAULT-TEC','OVERSEER','GOD','CREATOR','DEV','OFFICIAL',
];

const PROFANITY_LIST = [
  // add as needed — keeping this clean for launch
];

export function validateAlias(alias) {
  if (!alias) return { valid: true, error: null };

  const clean = alias.trim().toUpperCase();

  if (clean.length > 20) {
    return { valid: false, error: 'MAX 20 CHARACTERS' };
  }

  if (!/^[A-Z0-9\s\-_.]+$/.test(clean)) {
    return { valid: false, error: 'LETTERS, NUMBERS, SPACES, - _ . ONLY' };
  }

  if (RESERVED_WORDS.some(w => clean.includes(w))) {
    return { valid: false, error: 'RESERVED WORD DETECTED' };
  }

  if (PROFANITY_LIST.some(w => clean.includes(w))) {
    return { valid: false, error: 'INVALID ALIAS' };
  }

  return { valid: true, error: null };
}

// ── Tier Color Helper ───────────────────────────────────────
// Returns styling info for a given tier
export function getTierStyle(tier) {
  const styles = {
    common:    { color: '#39ff14', glow: 'rgba(57,255,20,0.3)',    shimmer: false },
    uncommon:  { color: '#00ffcc', glow: 'rgba(0,255,204,0.3)',    shimmer: false },
    rare:      { color: '#aaff00', glow: 'rgba(170,255,0,0.35)',   shimmer: false, pulse: true },
    legendary: { color: '#ffd700', glow: 'rgba(255,215,0,0.4)',    shimmer: false, pulse: true },
    mythic:    { color: '#ff69b4', glow: 'rgba(180,79,255,0.4)',   shimmer: true },
  };
  return styles[tier] || styles.common;
}

// ── Address Type Detection ──────────────────────────────────
export function getAddressType(address) {
  if (!address) return 'UNKNOWN';
  if (address.startsWith('cap1')) return 'BECH32';
  if (address.startsWith('C'))    return 'LEGACY';
  return 'UNKNOWN';
}

export default {
  generateWastelandName,
  getTier,
  getTierStyle,
  validateAlias,
  getAddressType,
};
