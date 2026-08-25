import { Link, Stack } from 'expo-router';
import { StyleSheet } from 'react-native';

import { EmptyState, Screen, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';

/** Rendered for any URL that does not match a route — a bad deep link, a stale share URL. */
export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Screen centered edges={['top', 'left', 'right']} testID="not-found-screen">
        <EmptyState
          icon="warning"
          title="This screen does not exist"
          description="The link you followed may be broken or the page may have moved."
        />
        <Link href="/" style={styles.link}>
          <Text color="tint" weight="semibold">
            Go to home screen
          </Text>
        </Link>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  link: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
});
