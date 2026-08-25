import { StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A whole-form error message.
 *
 * `role="alert"` and `aria-live` make a screen reader announce the failure when it appears. Without
 * them the message is silent, and someone who cannot see the form is told nothing about why
 * submitting did nothing.
 *
 * `accessible` is required, not decorative: a React Native `View` is not an accessibility element
 * by default, so without it the role is never exposed and the announcement never happens.
 */
export function FormSummary({ message }: { message: string }) {
  const { colors } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="alert"
      aria-live="assertive"
      style={[styles.container, { borderColor: colors.danger }]}
      testID="form-summary">
      <Icon name="warning" size={18} color={colors.danger} />
      <Text color="danger" style={styles.message}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
  },
  message: { flex: 1 },
});
