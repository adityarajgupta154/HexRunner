/**
 * HexRunner design tokens — dark, high-contrast, game-forward.
 *
 * HexRunner is a territory-capture running game: the map is the hero, so the
 * whole app runs on a deep charcoal-navy surface with an electric teal accent
 * (the color of claimed hexes). The same palette is used for both light and
 * dark schemes — the app is intentionally dark-only, like most map-first
 * fitness/game apps.
 */

const palette = {
  // Legacy aliases (kept for backward compatibility)
  text: '#F4FAF8',
  tint: '#2DE0B0',

  // Core surfaces
  background: '#0A0F14',
  foreground: '#F4FAF8',

  // Cards / elevated surfaces
  card: '#131C24',
  cardForeground: '#F4FAF8',

  // Primary action color (buttons, links, active states) — claimed-hex teal
  primary: '#2DE0B0',
  primaryForeground: '#05201A',

  // Secondary / less-emphasis interactive surfaces
  secondary: '#1C2833',
  secondaryForeground: '#E6EEF2',

  // Muted / subdued elements (dividers, timestamps, placeholders)
  // Kept deliberately bright enough to stay readable on dark surfaces.
  muted: '#1A242E',
  mutedForeground: '#9FB4C0',

  // Accent highlights (badges, selected items, focus rings)
  accent: '#123B33',
  accentForeground: '#5FF2C8',

  // Destructive actions (delete, error states, "hex under attack")
  destructive: '#FF5D5D',
  destructiveForeground: '#FFFFFF',

  // Borders and input outlines
  border: '#243240',
  input: '#243240',
};

const colors = {
  light: palette,
  dark: palette,

  // Border radius (in px) for cards, buttons, inputs, and modals.
  radius: 14,
};

export default colors;
