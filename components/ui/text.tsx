import { StyleSheet, Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { Typography, type ColorName } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextVariant = keyof typeof Typography;
export type TextWeight = keyof typeof WEIGHTS;

export type TextProps = RNTextProps & {
  variant?: TextVariant | undefined;
  /** A colour token name. Defaults to the primary body colour for the active scheme. */
  color?: ColorName | undefined;
  weight?: TextWeight | undefined;
  align?: 'auto' | 'left' | 'right' | 'center' | undefined;
};

const WEIGHTS = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/**
 * The only text primitive in the app.
 *
 * Size and line height always travel together via `Typography`, so vertical rhythm cannot drift
 * one component at a time, and colour comes from a token rather than a literal.
 */
export function Text({
  variant = 'body',
  color = 'text',
  weight = 'regular',
  align,
  style,
  ...rest
}: TextProps) {
  const { colors } = useTheme();

  return (
    <RNText
      style={[
        Typography[variant],
        { color: colors[color], fontWeight: WEIGHTS[weight] },
        align ? { textAlign: align } : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

/** Kept separate from `Text` so screens do not restate the same style block. */
export const textStyles = StyleSheet.create({
  centered: { textAlign: 'center' },
});
