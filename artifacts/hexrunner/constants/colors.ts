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
  // Legacy aliases
  text: '#FFFFFF',
  tint: '#00FF00',

  // Core surfaces
  background: '#0B0D12',
  foreground: '#FFFFFF',

  // Cards / elevated surfaces (Darker grey/black for popovers)
  card: '#161920',
  cardForeground: '#FFFFFF',

  // Bright surfaces (like the white bottom sheets in the references)
  sheet: '#FFFFFF',
  sheetForeground: '#000000',

  // Primary action color — Fluorescent Lime Green
  primary: '#00FF00',
  primaryForeground: '#000000',

  // Secondary / less-emphasis interactive surfaces
  secondary: '#232730',
  secondaryForeground: '#FFFFFF',

  // Muted / subdued elements
  muted: '#2A2E39',
  mutedForeground: '#90949F',

  // Accent highlights (e.g. for user location, specific badges)
  accent: '#007AFF',
  accentForeground: '#FFFFFF',

  // First-launch cinematic treatment
  cinematicAccent: '#00FF00',
  cinematicAccentForeground: '#000000',

  // Destructive actions (contested territory, errors)
  destructive: '#FF3B30',
  destructiveForeground: '#FFFFFF',

  // Borders
  border: '#2A2E39',
  input: '#2A2E39',
};

const colors = {
  light: palette,
  dark: palette,

  // Border radius (in px) for cards, buttons, inputs, and modals.
  radius: 14,
};

export default colors;
