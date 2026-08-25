import { StyleSheet, View } from 'react-native';

import { Button, Screen, Spinner, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';

/**
 * Shown while the stored session is being restored.
 *
 * This screen is the reason no protected content flashes at start-up: the router renders it
 * *instead of* the navigator, so no authenticated route is mounted until the answer is known.
 */
export function AuthLoadingScreen() {
  return (
    <Screen centered edges={['top', 'bottom', 'left', 'right']} testID="auth-loading">
      <Spinner label="Restoring your session" />
    </Screen>
  );
}

/**
 * Shown when the session layer itself failed — the provider was unreachable at start-up, or
 * configuration is missing. Distinct from a rejected password, which belongs on the sign-in form.
 */
export function AuthErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Screen centered edges={['top', 'bottom', 'left', 'right']} testID="auth-error">
      <View style={styles.content}>
        <Text variant="subtitle" weight="semibold" align="center" accessibilityRole="header">
          Could not start the app
        </Text>
        <Text color="textMuted" align="center">
          {message}
        </Text>
        <Button label="Try again" onPress={onRetry} style={styles.action} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.xl,
  },
  action: { marginTop: Spacing.md },
});
