import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme, type ThemeColors } from '@/hooks/use-theme';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'danger';

const TONE_COLOR: Record<BadgeTone, keyof ThemeColors> = {
  neutral: 'textMuted',
  info: 'tint',
  success: 'success',
  danger: 'danger',
};

/** A small status pill. `label` is read verbatim by assistive tech, so keep it meaningful. */
export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: BadgeTone | undefined;
}) {
  const { colors } = useTheme();
  const color = colors[TONE_COLOR[tone]];

  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text variant="caption" weight="semibold" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
});
