import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Divider, ListItem, Spinner, Surface, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  describeLocation,
  formatAccuracy,
  formatBattery,
  formatCoordinates,
  locationBadgeLabel,
  locationTone,
  trackerStatusLabel,
} from '@/features/tracking/tracking-presentation';
import { usePetTracking, type PetTrackingRepositories } from '@/features/tracking/use-pet-tracking';
import { type PetId } from '@/lib/domain/ids';
import { userMessageFor } from '@/lib/errors';

/**
 * Tracker and last-known position for one pet, on the pet detail screen.
 *
 * Deliberately not a map. Drawing a marker here would imply live GPS tracking exists, and it does
 * not: no hardware provider has been chosen and no device reports to this system yet. Stating the
 * position in text is honest at this stage and needs no native map dependency to be justified.
 */
export type TrackingCardProps = {
  readonly petId: PetId;
  /** Injected in tests. Production resolves the Supabase-backed repositories lazily. */
  readonly repositories?: PetTrackingRepositories | undefined;
};

export function TrackingCard({ petId, repositories }: TrackingCardProps) {
  const router = useRouter();
  const { state, refresh } = usePetTracking(petId, repositories);

  if (state.status === 'loading') {
    return (
      <Surface testID="tracking-loading">
        <Spinner label="Checking tracker" />
      </Surface>
    );
  }

  if (state.status === 'error') {
    return (
      <Surface testID="tracking-error">
        <View style={styles.stack}>
          <Text color="danger" accessibilityRole="alert" accessible>
            {userMessageFor(state.error)}
          </Text>
          <Button
            label="Try again"
            onPress={() => void refresh()}
            variant="secondary"
            testID="tracking-retry"
          />
        </View>
      </Surface>
    );
  }

  const { summary } = state;
  const { tracker, latest } = summary;

  if (tracker === null) {
    return (
      <Surface testID="tracking-no-tracker">
        <View style={styles.stack}>
          <Text weight="semibold">No tracker linked</Text>
          <Text variant="caption" color="textMuted">
            Once a GPS tracker is linked to this pet, its position and battery will appear here.
          </Text>
        </View>
      </Surface>
    );
  }

  return (
    <Surface padded={false} testID="tracking-card">
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text weight="semibold">{tracker.label ?? tracker.serialNumber}</Text>
          <Text variant="caption" color="textMuted">
            {describeLocation(summary)}
          </Text>
        </View>
        <Badge label={locationBadgeLabel(summary)} tone={locationTone(summary)} />
      </View>

      <Divider />

      <ListItem
        title="Device status"
        showChevron={false}
        accessory={<Muted value={trackerStatusLabel(tracker.status)} />}
      />
      <Divider />
      <ListItem
        title="Battery"
        showChevron={false}
        accessory={
          <Muted value={formatBattery(tracker.batteryPercent)} danger={summary.lowBattery} />
        }
      />

      {latest === null ? null : (
        <>
          <Divider />
          <ListItem
            title="Last position"
            subtitle={
              // A vague fix is shown, not hidden — but it is labelled, so nobody plans a search
              // around a reading that could be a kilometre out.
              summary.locationUsable ? undefined : 'Accuracy too low to map reliably'
            }
            showChevron={false}
            accessory={<Muted value={formatCoordinates(latest.coordinates)} />}
          />
          {formatAccuracy(latest.accuracyMeters) === null ? null : (
            <>
              <Divider />
              <ListItem
                title="Accuracy"
                showChevron={false}
                accessory={<Muted value={formatAccuracy(latest.accuracyMeters) ?? ''} />}
              />
            </>
          )}
        </>
      )}

      <Divider />
      <View style={styles.footer}>
        <Button
          label="Open map"
          onPress={() => router.push('/map')}
          variant="secondary"
          fullWidth
          testID="tracking-open-map"
        />
      </View>
    </Surface>
  );
}

function Muted({ value, danger = false }: { value: string; danger?: boolean }) {
  return (
    <Text variant="caption" color={danger ? 'danger' : 'textMuted'}>
      {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.sm, alignItems: 'flex-start' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  headerText: { flex: 1, gap: 2 },
  footer: { padding: Spacing.md },
});
