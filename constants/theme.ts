/**
 * Design tokens for the app.
 *
 * Everything visual — colour, spacing, radius, type scale, motion — is named here and referenced
 * by name from components. Nothing in `app/`, `components/`, or `features/` should contain a raw
 * hex value or a magic pixel number, so that a restyle is a change to this file rather than a
 * search-and-replace across the codebase.
 *
 * Colours are declared per scheme and read through `useThemeColor`, which resolves the active
 * scheme. Adding a colour means adding it to *both* `light` and `dark`.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    /** De-emphasised body copy: captions, metadata, placeholder text. */
    textMuted: '#687076',
    background: '#fff',
    /** Raised surfaces sitting on the background: cards, sheets, list rows. */
    surface: '#F6F8F9',
    border: '#DCE1E4',
    tint: tintColorLight,
    /** Content drawn on top of `tint`. Flips with the scheme, since `tint` itself does. */
    onTint: '#FFFFFF',
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    /** Destructive actions and error states. */
    danger: '#B3261E',
    onDanger: '#FFFFFF',
    success: '#1B7F4B',
  },
  dark: {
    text: '#ECEDEE',
    textMuted: '#9BA1A6',
    background: '#151718',
    surface: '#1F2223',
    border: '#2E3235',
    tint: tintColorDark,
    onTint: '#151718',
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    danger: '#F2B8B5',
    onDanger: '#151718',
    success: '#6FD79B',
  },
};

export type ColorName = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

/** A 4pt spacing scale. Use these for padding, margin, and flex `gap`. */
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 6,
  md: 12,
  lg: 20,
  /** Large enough to render as a capsule on any control we ship. */
  pill: 999,
} as const;

/** Font size paired with the line height it should always be rendered at. */
export const Typography = {
  caption: { fontSize: 13, lineHeight: 18 },
  body: { fontSize: 16, lineHeight: 24 },
  subtitle: { fontSize: 20, lineHeight: 28 },
  title: { fontSize: 32, lineHeight: 36 },
} as const;

/** Animation durations in milliseconds. */
export const Duration = {
  fast: 120,
  normal: 220,
  slow: 400,
} as const;

/** The minimum touch target both platforms' accessibility guidelines ask for. */
export const MIN_TOUCH_TARGET = 44;

/**
 * Shadow presets. React Native takes different properties on each platform — `shadow*` on iOS,
 * `elevation` on Android — so both are set together and referenced as one token.
 */
export const Elevation = {
  none: {},
  low: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
} as const;
