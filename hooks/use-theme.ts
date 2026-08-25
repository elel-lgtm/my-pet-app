import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type ColorScheme = keyof typeof Colors;
export type ThemeColors = (typeof Colors)[ColorScheme];

export type Theme = {
  scheme: ColorScheme;
  colors: ThemeColors;
};

/**
 * Resolves the active colour scheme to a concrete palette.
 *
 * Components read colours from here rather than reaching into `Colors` directly, so light and dark
 * are handled in one place and a component never has to know which scheme is active.
 */
export function useTheme(): Theme {
  const scheme = useColorScheme() ?? 'light';
  return { scheme, colors: Colors[scheme] };
}
