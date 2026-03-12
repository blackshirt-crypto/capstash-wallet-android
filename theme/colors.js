// theme/colors.js
// N.U.K.A — Nakamoto's Unified Kurrency of the Apocalypse
// CRT phosphor green terminal color system

export const Colors = {
  // ── Core Palette ─────────────────────────────────────────
  black:        '#020c01',
  blackLight:   '#030f02',
  blackMid:     '#061502',
  green:        '#14ff47',
  greenDim:     '#1a7a06',
  greenDark:    '#0a2008',
  greenGlow:    'rgba(57,255,20,0.4)',
  greenGlowSoft:'rgba(57,255,20,0.15)',
  amber:        '#ffb000',
  amberDim:     '#7a5500',
  red:          '#ff3a3a',
  redDim:       '#7a1a1a',
  redGlow:      'rgba(255,58,58,0.4)',
  purple:      '#b44fff',
  purpledim:   '#7a2a7a',
  purpleGlow: 'rgba(180,79,255,0.4)',
  

  // ── Wasteland Identity Tiers ──────────────────────────────
  // Each tier has a primary color, glow color, and label
  tiers: {
    common: {
      color:  '#14ff47',
      glow:   'rgba(57,255,20,0.3)',
      label:  'COMMON',
      stars:  '',
    },
    uncommon: {
      color:  '#00ffcc',
      glow:   'rgba(0,255,204,0.3)',
      label:  'UNCOMMON',
      stars:  '★',
    },
    rare: {
      color:  '#aaff00',
      glow:   'rgba(170,255,0,0.35)',
      label:  'RARE',
      stars:  '★★',
    },
    legendary: {
      color:  '#ffd700',
      glow:   'rgba(255,215,0,0.4)',
      label:  'LEGENDARY',
      stars:  '★★★',
    },
    mythic: {
      // Mythic uses animated gradient — handled in component
      colorA: '#ff69b4',
      colorB: '#b44fff',
      glow:   'rgba(180,79,255,0.4)',
      label:  'MYTHIC',
      stars:  '☆',
      shimmer: true,
    },
  },

  // ── UI Surfaces ───────────────────────────────────────────
  surface:      '#030f02',
  surfaceLight: '#061502',
  border:       '#0a2008',
  borderActive: '#39ff14',
  borderDim:    '#1a7a06',

  // ── Status ────────────────────────────────────────────────
  online:   '#39ff14',
  offline:  '#ff3a3a',
  warning:  '#ffb000',
  inactive: '#1a7a06',

  // ── Connection badge colors ───────────────────────────────
  local:     '#ffb000',
  tailscale: '#39ff14',
  remote:    '#aaaaaa',

  // ── Scanline overlay ──────────────────────────────────────
  scanline: 'rgba(0,0,0,0.15)',
};

export default Colors;
