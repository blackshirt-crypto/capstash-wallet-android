// utils/badges.js
// N.U.K.A — Rig badge system
// Badges are user-assigned tags that describe each mining rig.
// Stored locally per rig. Icon-only display with Survival Guidelegend.

export const BADGES = {
  // ── Connection ──────────────────────────────────────────
  local: {
    icon:  '🏠',
    label: 'LOCAL',
    desc:  'Same WiFi subnet (192.168.x.x). Fast, no VPN needed.',
    group: 'conn',
    color: '#ffb000',
  },
  tailscale: {
    icon:  '📡',
    label: 'TAILSCALE',
    desc:  'Tailscale mesh VPN (100.64.x.x). Access from anywhere in the wasteland.',
    group: 'conn',
    color: '#39ff14',
  },
  remote: {
    icon:  '🌐',
    label: 'REMOTE',
    desc:  'Direct WAN / internet IP. Use with caution.',
    group: 'conn',
    color: '#aaaaaa',
  },

  // ── Operating System ────────────────────────────────────
  windows: {
    icon:  '🪟',
    label: 'WINDOWS',
    desc:  'Microsoft Windows node.',
    group: 'os',
    color: '#00aaff',
  },
  linux: {
    icon:  '🐧',
    label: 'LINUX',
    desc:  'Linux node. The wasteland runs on Linux.',
    group: 'os',
    color: '#ffb000',
  },
  macos: {
    icon:  '🍎',
    label: 'MACOS',
    desc:  'Apple macOS node.',
    group: 'os',
    color: '#aaaaaa',
  },
  android: {
    icon:  '📱',
    label: 'ANDROID',
    desc:  'Android mobile node.',
    group: 'os',
    color: '#39ff14',
  },

  // ── CPU ─────────────────────────────────────────────────
  amd: {
    icon:  '🔴',
    label: 'AMD CPU',
    desc:  'AMD processor. Red team represents.',
    group: 'hw',
    color: '#ff4444',
  },
  intel: {
    icon:  '🔵',
    label: 'INTEL CPU',
    desc:  'Intel processor. Blue team.',
    group: 'hw',
    color: '#4488ff',
  },
  arm: {
    icon:  '🟢',
    label: 'ARM',
    desc:  'ARM chip. Raspberry Pi, mobile, embedded.',
    group: 'hw',
    color: '#44ff88',
  },

  // ── GPU ─────────────────────────────────────────────────
  nvidia: {
    icon:  '🟩',
    label: 'NVIDIA GPU',
    desc:  'NVIDIA graphics card mining.',
    group: 'gpu',
    color: '#76b900',
  },
  amdgpu: {
    icon:  '🟥',
    label: 'AMD GPU',
    desc:  'AMD graphics card mining.',
    group: 'gpu',
    color: '#ff4444',
  },
  arc: {
    icon:  '🔷',
    label: 'INTEL ARC',
    desc:  'Intel Arc graphics card.',
    group: 'gpu',
    color: '#4488ff',
  },

  // ── Special ─────────────────────────────────────────────
  asic: {
    icon:  '☢️',
    label: 'ASIC',
    desc:  'ASIC miner detected. CapStash is ASIC-resistant — but if one shows up, the wasteland trembles.',
    group: 'special',
    color: '#ff0000',
    danger: true,
  },
  pi: {
    icon:  '🍓',
    label: 'RASPBERRY PI',
    desc:  'Mining on a Raspberry Pi. Respect.',
    group: 'special',
    color: '#ff69b4',
  },
  overclocked: {
    icon:  '⚡',
    label: "OVERCLOCKED",
    desc:  "Pushed past factory limits. Brave wanderer.",
    group: 'special',
    color: '#ffff00',
  },
  solar: {
    icon:  '☀️',
    label: 'SOLAR POWERED',
    desc:  'Solar powered. The wasteland sun works for you.',
    group: 'special',
    color: '#ffcc00',
  },
  liquid: {
    icon:  '💧',
    label: 'LIQUID COOLED',
    desc:  'Water cooling. Running hot and wet. (DANK)',
    group: 'special',
    color: '#00ccff',
  },
  ups: {
    icon:  '🔋',
    label: 'UPS BACKUP',
    desc:  'Uninterruptible power supply. Never goes dark.',
    group: 'special',
    color: '#44ff88',
  },
  top: {
    icon:  '🏆',
    label: 'TOP RIG',
    desc:  'Most blocks found this session. The wasteland champion.',
    group: 'status',
    color: '#ffb000',
    auto: true, // assigned automatically, not user-selectable
  },
};

// Badge groups for the picker UI and Survival Guide legend
export const BADGE_GROUPS = [
  {
    key:    'conn',
    label:  'CONNECTION',
    single: true, // only one connection badge at a time
    badges: ['local', 'tailscale', 'remote'],
  },
  {
    key:    'os',
    label:  'OPERATING SYSTEM',
    single: true,
    badges: ['windows', 'linux', 'macos', 'android'],
  },
  {
    key:    'hw',
    label:  'CPU',
    single: true,
    badges: ['amd', 'intel', 'arm'],
  },
  {
    key:    'gpu',
    label:  'GPU',
    single: true,
    badges: ['nvidia', 'amdgpu', 'arc'],
  },
  {
    key:    'special',
    label:  'SPECIAL',
    single: false, // multiple special badges allowed
    badges: ['asic', 'pi', 'overclocked', 'solar', 'liquid', 'ups'],
  },
];

// Auto-detect connection type from IP address
export function detectConnectionType(ip) {
  if (!ip) return 'local';
  if (ip.startsWith('100.') || ip.startsWith('fd7a:')) return 'tailscale';
  if (
    ip.startsWith('192.168.') ||
    ip.startsWith('10.')      ||
    ip.match(/^172\.(1[6-9]|2[0-9]|3[01])\./)
  ) return 'local';
  return 'remote';
}

// Get connection icon for a rig's badge array
export function getConnectionIcon(badges = []) {
  if (badges.includes('tailscale')) return BADGES.tailscale.icon;
  if (badges.includes('remote'))    return BADGES.remote.icon;
  return BADGES.local.icon;
}

// Get non-connection badges for icon strip display
export function getHardwareBadges(badges = []) {
  const connBadges = ['local', 'tailscale', 'remote', 'top'];
  return badges
    .filter(b => !connBadges.includes(b) && BADGES[b])
    .map(b => BADGES[b].icon)
    .join('');
}

export default {
  BADGES,
  BADGE_GROUPS,
  detectConnectionType,
  getConnectionIcon,
  getHardwareBadges,
};
