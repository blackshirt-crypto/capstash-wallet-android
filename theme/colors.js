// theme/colors.js
// N.U.K.A — Nakamoto's Unified Kurrency of the Apocalypse
// CRT phosphor green terminal color system — Pip-Boy Warm palette

export const Colors = {
  // ── Core Palette ─────────────────────────────────────────
  black:         '#020c01',
  blackLight:    '#030f02',
  blackMid:      '#061502',
  green:         '#76ff7a',
  greenDim:      '#388e3c',
  greenDark:     '#1b5e20',
  greenGlow:     'rgba(118,255,122,0.4)',
  greenGlowSoft: 'rgba(118,255,122,0.15)',
  amber:         '#ffb000',
  amberDim:      '#7a5500',
  red:           '#ff3a3a',
  redDim:        '#7a1a1a',
  redGlow:       'rgba(255,58,58,0.4)',
  purple:        '#b44fff',
  purpleDim:     '#7a2a7a',
  purpleGlow:    'rgba(180,79,255,0.4)',

  // ── Wasteland Identity Tiers ──────────────────────────────
  tiers: {
    common: {
      color:  '#76ff7a',
      glow:   'rgba(118,255,122,0.3)',
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
  borderActive: '#76ff7a',
  borderDim:    '#388e3c',

  // ── Status ────────────────────────────────────────────────
  online:   '#76ff7a',
  offline:  '#ff3a3a',
  warning:  '#ffb000',
  inactive: '#388e3c',

  // ── Connection badge colors ───────────────────────────────
  local:     '#ffb000',
  tailscale: '#76ff7a',
  remote:    '#aaaaaa',

  // ── Scanline overlay ──────────────────────────────────────
  scanline: 'rgba(0,0,0,0.15)',
};

export default Colors;
