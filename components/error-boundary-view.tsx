import { type ErrorBoundaryProps } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, Screen, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { env } from '@/lib/env';
import { toAppError, userMessageFor } from '@/lib/errors';
import { logger } from '@/lib/logger';

const log = logger.child('error-boundary');

/**
 * The last line of defence for a render-time crash. Expo Router renders this in place of the
 * failed subtree and calls `retry` to attempt a remount.
 *
 * It shows the generic user-facing copy for the error's code, and reveals the raw message only
 * outside production, where it is a debugging aid rather than a leak.
 */
export function ErrorBoundaryView({ error, retry }: ErrorBoundaryProps) {
  const { colors } = useTheme();
  const appError = toAppError(error);
  log.error('Render failed', appError);

  return (
    <Screen centered edges={['top', 'bottom', 'left', 'right']} testID="error-boundary">
      <View style={styles.content}>
        <Icon name="warning" size={40} color={colors.danger} />
        <Text variant="title" weight="bold" align="center">
          Something broke
        </Text>
        <Text align="center">{userMessageFor(appError)}</Text>

        {!env.isProduction && (
          <Text variant="caption" color="textMuted" align="center">
            {appError.code}: {appError.message}
          </Text>
        )}

        <Button label="Try again" onPress={retry} style={styles.action} />
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
  action: {
    marginTop: Spacing.md,
  },
});
