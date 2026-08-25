import Constants from 'expo-constants';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Divider, ListItem, Screen, Section, Surface } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth';
import { env } from '@/lib/env';

/**
 * Settings. The rows describing the build are real; anything requiring a stored preference waits
 * for a persistence layer to be chosen.
 */
export default function SettingsScreen() {
  const version = Constants.expoConfig?.version ?? 'unknown';
  const { session, signOut, state } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function onSignOut(): Promise<void> {
    setSigningOut(true);
    // The result is intentionally not surfaced: sign-out clears the local session either way, so
    // there is nothing actionable to tell the user, and the router unmounts this screen.
    await signOut();
    setSigningOut(false);
  }

  return (
    <Screen scrollable testID="settings-screen">
      <View style={styles.content}>
        <Section title="Account">
          <Surface padded={false}>
            <ListItem
              title="Signed in as"
              subtitle={session?.user.email ?? 'Unknown'}
              icon="settings"
              showChevron={false}
            />
          </Surface>
          <Button
            label="Sign out"
            onPress={onSignOut}
            variant="secondary"
            loading={signingOut || state.status === 'signing-out'}
            fullWidth
            testID="sign-out-button"
          />
        </Section>

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
