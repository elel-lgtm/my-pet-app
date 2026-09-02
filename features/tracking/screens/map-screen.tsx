import { StyleSheet, View } from 'react-native';

import { EmptyState, Screen, Section, Surface, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';

/**
 * The Map tab.
 *
 * **This is deliberately not a map.** Rendering tiles and a marker would imply the product tracks
 * pets in real time, and it does not: no GPS hardware provider has been chosen, nothing reports
 * positions, and there is no ingestion service. A convincing-looking map over an empty database is
 * the most misleading thing this screen could be.
 *
 * A real map also means a native dependency (`react-native-maps` or an equivalent) and, for most
 * providers, an API key and a billing account. Those are provider and cost decisions, not
 * implementation details, so they wait for a decision rather than being made here by default.
 *
 * What this screen does instead is say plainly what exists and what is missing, and name what has
 * to be decided before it can become real.
 */
export function MapScreen() {
  return (
    <Screen scrollable testID="map-screen">
      <View style={styles.content}>
        <EmptyState
          icon="map"
          title="Map is not available yet"
          description="Live tracking needs GPS hardware reporting into the app. Nothing is connected yet, so there is no position to draw."
        />

        <Section
          title="What is already in place"
          description="The parts that do not depend on a hardware choice.">
          <Surface>
            <View style={styles.list}>
              <Bullet text="Trackers can be registered and linked to a pet." />
              <Bullet text="Position history is stored, ordered by when each fix was taken." />
              <Bullet text="Owners and their caregivers can read a pet's position; nobody else can." />
              <Bullet text="A pet's last known position and tracker battery appear on its profile." />
            </View>
          </Surface>
        </Section>

        <Section title="What is still needed" description="Each one is a decision, not a task.">
          <Surface>
            <View style={styles.list}>
              <Bullet text="A GPS hardware or provider choice, which determines how devices report." />
              <Bullet text="A server-side ingestion endpoint. Devices must never write through the app." />
              <Bullet text="A map provider, which usually brings an API key and billing." />
              <Bullet text="How fresh a position must be to count as live." />
            </View>
          </Surface>
        </Section>
      </View>
    </Screen>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bullet}>
      <Text color="textMuted">{'\u2022'}</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg },
  list: { gap: Spacing.sm },
  bullet: { flexDirection: 'row', gap: Spacing.sm },
  bulletText: { flex: 1 },
});
