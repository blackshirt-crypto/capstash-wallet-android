// theme/typography.js
// N.U.K.A font system
// Primary: Share Tech Mono (monospace terminal)
// Display: VT323 (retro CRT display font)

export const Fonts = {
  mono:    'ShareTechMono-Regular',
  display: 'VT323-Regular',
};

export const Typography = {
  // Display sizes (VT323) — unchanged
  gigantic:   { fontFamily: Fonts.display, fontSize: 64, letterSpacing: 2 },
  huge:       { fontFamily: Fonts.display, fontSize: 48, letterSpacing: 2 },
  large:      { fontFamily: Fonts.display, fontSize: 36, letterSpacing: 2 },
  title:      { fontFamily: Fonts.display, fontSize: 26, letterSpacing: 3 },
  heading:    { fontFamily: Fonts.display, fontSize: 24, letterSpacing: 2 },
  subheading: { fontFamily: Fonts.display, fontSize: 20, letterSpacing: 1 },
  amount:     { fontFamily: Fonts.display, fontSize: 18, letterSpacing: 1 },

  // Mono sizes (Share Tech Mono) — all +4px
  body:       { fontFamily: Fonts.mono, fontSize: 18, letterSpacing: 0.5 },
  small:      { fontFamily: Fonts.mono, fontSize: 16, letterSpacing: 1 },
  tiny:       { fontFamily: Fonts.mono, fontSize: 15, letterSpacing: 1.5 },
  micro:      { fontFamily: Fonts.mono, fontSize: 14, letterSpacing: 2 },

  // Labels (uppercase mono) — all +4px
  label:       { fontFamily: Fonts.mono, fontSize: 16, letterSpacing: 2, textTransform: 'uppercase' },
  labelLarge:  { fontFamily: Fonts.mono, fontSize: 22, letterSpacing: 2, textTransform: 'uppercase' },
  labelMedium: { fontFamily: Fonts.mono, fontSize: 18, letterSpacing: 2, textTransform: 'uppercase' },
  labelSmall:  { fontFamily: Fonts.mono, fontSize: 16, letterSpacing: 2, textTransform: 'uppercase' },
};

export default Typography;
