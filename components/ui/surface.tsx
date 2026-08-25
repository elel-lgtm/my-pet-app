import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Elevation, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SurfaceProps = {
  children: ReactNode;
  /** `low` and `medium` add a platform-appropriate shadow; `none` keeps the card flat. */
  elevation?: keyof typeof Elevation | undefined;
  bordered?: boolean | undefined;
  padded?: boolean | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  testID?: string | undefined;
};

/** A raised container: cards, sheets, grouped rows. */
export function Surface({
  children,
  elevation = 'none',
  bordered = true,
  padded = true,
  style,
  testID,
}: SurfaceProps) {
  const { colors } = useTheme();

  return (
    <View
      testID={testID}
      style={[
        styles.surface,
        { backgroundColor: colors.surface },
        bordered && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        padded && styles.padded,
        Elevation[elevation],
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  padded: {
    padding: Spacing.md,
  },
});
