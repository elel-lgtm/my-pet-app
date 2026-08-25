import { StyleSheet, View } from 'react-native';

import { EmptyState, Screen, Section, Surface, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';

/** Home. A placeholder until the first feature lands — see features/README.md. */
export default function HomeScreen() {
  return (
    <Screen scrollable testID="home-screen">
      <View style={styles.content}>
        <Section title="Today" description="A summary of what needs attention.">
          <Surface>
            <EmptyState
              icon="home"
              title="Nothing to show yet"
              description="Once you add a pet, their reminders and activity will appear here."
            />
          </Surface>
        </Section>

        <Text variant="caption" color="textMuted">
          This is the application shell. No features are implemented yet.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.lg,
  },
});
