import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A centred loading state. The label is not decoration — without it a screen reader announces
 * nothing while the user waits.
 */
export function Spinner({ label = 'Loading' }: { label?: string | undefined }) {
  const { colors } = useTheme();

  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.tint} />
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
});
