/**
 * HexRunner design tokens — asphalt, bone paper and signal-red paint.
 *
 * HexRunner is a territory-capture running game: the map is the hero, so the
 * whole app runs on a deep charcoal-navy surface with an electric teal accent
 * (the color of claimed hexes). The same palette is used for both light and
 * dark schemes — the app is intentionally dark-only, like most map-first
 * fitness/game apps.
 */

const palette = {
  // Legacy aliases (kept for backward compatibility)
  text: '#F2E8D5',
  tint: '#F04B23',

  // Core surfaces
  background: '#151414',
  foreground: '#F2E8D5',

  // Cards / elevated surfaces
  card: '#242120',
  cardForeground: '#F2E8D5',

  // Primary action color (buttons, links, active states) — claimed-hex teal
  primary: '#F04B23',
  primaryForeground: '#1C1411',

  // Secondary / less-emphasis interactive surfaces
  secondary: '#342D29',
  secondaryForeground: '#F2E8D5',

  // Muted / subdued elements (dividers, timestamps, placeholders)
  // Kept deliberately bright enough to stay readable on dark surfaces.
  muted: '#302B28',
  mutedForeground: '#B8ACA0',

  // Accent highlights (badges, selected items, focus rings)
  accent: '#4A2119',
  accentForeground: '#FF9B72',

  // Destructive actions (delete, error states, "hex under attack")
  destructive: '#C93425',
  destructiveForeground: '#F9EEDC',

  // Borders and input outlines
  border: '#554944',
  input: '#554944',
};

const colors = {
  light: palette,
  dark: palette,

  // Border radius (in px) for cards, buttons, inputs, and modals.
  radius: 14,
};

export default colors;
