import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';

import { Badge, Divider, ListItem, Screen, Section, Surface } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { env } from '@/lib/env';

/**
 * Settings. The rows describing the build are real; anything requiring a stored preference waits
 * for a persistence layer to be chosen.
 */
export default function SettingsScreen() {
  const version = Constants.expoConfig?.version ?? 'unknown';

  return (
    <Screen scrollable testID="settings-screen">
      <View style={styles.content}>
        <Section title="Appearance">
          <Surface padded={false}>
            <ListItem
              title="Theme"
              subtitle="Follows your device setting"
              icon="settings"
              showChevron={false}
            />
          </Surface>
        </Section>

        <Section title="About">
          <Surface padded={false}>
            <ListItem title="Version" showChevron={false} accessory={<Badge label={version} />} />
            <Divider />
            <ListItem
              title="Environment"
              showChevron={false}
              accessory={
                <Badge label={env.appEnvironment} tone={env.isProduction ? 'success' : 'info'} />
              }
            />
          </Surface>
        </Section>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.lg,
  },
});
