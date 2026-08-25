import { DarkTheme, DefaultTheme, type Theme as NavigationTheme } from '@react-navigation/native';

import { useTheme } from '@/hooks/use-theme';

/**
 * Projects the app's design tokens onto React Navigation's theme.
 *
 * Navigation chrome — headers, tab bars, the screen background behind a transition — is painted by
 * React Navigation, not by our components. Without this the chrome would keep its own default
 * palette and drift away from everything drawn inside a `Screen`.
 */
export function useNavigationTheme(): NavigationTheme {
  const { scheme, colors } = useTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;

  return {
    ...base,
    dark: scheme === 'dark',
    colors: {
      ...base.colors,
      primary: colors.tint,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.danger,
    },
  };
}
