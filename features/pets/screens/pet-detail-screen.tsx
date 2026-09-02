import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Divider,
  EmptyState,
  ListItem,
  Screen,
  Section,
  Spinner,
  Surface,
  Text,
} from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { ConfirmAction } from '@/features/pets/components/confirm-action';
import { PetAvatar } from '@/features/pets/components/pet-avatar';
import {
  describePet,
  formatMissingSince,
  speciesLabel,
  statusLabel,
  statusTone,
} from '@/features/pets/pet-presentation';
import { usePets } from '@/features/pets/pets-provider';
import { canTransitionPetStatus } from '@/lib/domain/pet';
import { type PetId } from '@/lib/domain/ids';
import { userMessageFor } from '@/lib/errors';

/**
 * One pet's profile.
 *
 * Laid out as stacked sections so the features that will hang off a pet — tracker, live location,
 * safe zones, alerts — each drop in as another `Section` without rearranging what is already here.
 * The placeholders below are deliberate: they show where those things will live and say plainly
 * that they do not exist yet, rather than pretending the screen is finished.
 */
export function PetDetailScreen({ petId }: { petId: PetId | null }) {
  const router = useRouter();
  const { state, getById, changeStatus, remove } = usePets();

  const [pendingAction, setPendingAction] = useState<'archive' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (petId === null) {
    return (
      <Screen centered testID="pet-detail-invalid">
        <EmptyState
          icon="warning"
          title="Pet not found"
          description="That link does not point at a pet we can show you."
        />
      </Screen>
    );
  }

  if (state.status === 'loading') {
    return (
      <Screen centered testID="pet-detail-loading">
        <Spinner label="Loading" />
      </Screen>
    );
  }

  const pet = getById(petId);
  if (pet === null) {
    // Either it never existed, or a policy hides it. Both look the same from here, deliberately:
    // saying "you are not allowed" would confirm the pet exists.
    return (
      <Screen centered testID="pet-detail-missing">
        <EmptyState
          icon="warning"
          title="Pet not found"
          description="This pet may have been removed, or it belongs to someone else."
        />
      </Screen>
    );
  }

  const missingSince = formatMissingSince(pet);
  const canArchive = canTransitionPetStatus(pet.status, 'archived');
  const canRestore = canTransitionPetStatus(pet.status, 'active');

  async function runStatusChange(next: 'archived' | 'active'): Promise<void> {
    setBusy(true);
    setActionError(null);
    const result = await changeStatus(petId as PetId, next);
    setBusy(false);
    setPendingAction(null);
    if (!result.ok) {
      setActionError(userMessageFor(result.error));
    }
  }

  async function runDelete(): Promise<void> {
    setBusy(true);
    setActionError(null);
    const result = await remove(petId as PetId);
    setBusy(false);
    setPendingAction(null);
    if (result.ok) {
      router.back();
    } else {
      setActionError(userMessageFor(result.error));
    }
  }

  return (
    <Screen scrollable={false} padded={false} testID="pet-detail">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <PetAvatar pet={pet} size={112} testID="pet-detail-avatar" />
          <Text variant="title" weight="bold" align="center" accessibilityRole="header">
            {pet.name}
          </Text>
          <Text color="textMuted" align="center">
            {describePet(pet)}
          </Text>
          <Badge label={statusLabel(pet.status)} tone={statusTone(pet.status)} />
          {missingSince ? (
            <Text variant="caption" color="danger" align="center">
              {missingSince}
            </Text>
          ) : null}
        </View>

        {actionError ? (
          <Text color="danger" accessibilityRole="alert" accessible style={styles.actionError}>
            {actionError}
          </Text>
        ) : null}

        <Section title="Details">
          <Surface padded={false}>
            <ListItem
              title="Species"
              showChevron={false}
              accessory={<Detail value={speciesLabel(pet.species)} />}
            />
            <Divider />
            <ListItem
              title="Breed"
              showChevron={false}
              accessory={<Detail value={pet.breed ?? 'Not recorded'} />}
            />
            <Divider />
            <ListItem
              title="Date of birth"
              showChevron={false}
              accessory={<Detail value={pet.dateOfBirth ?? 'Not recorded'} />}
            />
          </Surface>
        </Section>

        {pet.notes ? (
          <Section title="Notes">
            <Surface>
              <Text>{pet.notes}</Text>
            </Surface>
          </Section>
        ) : null}

        {/* Where the rest of the product will attach. Stated as absent rather than mocked up. */}
        <Section title="Tracking" description="Coming in a later update.">
          <Surface padded={false}>
            <ListItem title="Tracker" subtitle="No device linked yet" showChevron={false} />
            <Divider />
            <ListItem title="Safe zones" subtitle="Not set up yet" showChevron={false} />
            <Divider />
            <ListItem title="Alerts" subtitle="Nothing to show" showChevron={false} />
          </Surface>
        </Section>

        <Section title="Manage">
          <View style={styles.actions}>
            <Button
              label="Edit details"
              onPress={() => router.push(`/pets/${pet.id}/edit`)}
              variant="secondary"
              fullWidth
              testID="pet-edit"
            />

            {canArchive ? (
              <Button
                label="Archive"
                onPress={() => setPendingAction('archive')}
                variant="secondary"
                fullWidth
                testID="pet-archive"
              />
            ) : null}

            {canRestore && pet.status === 'archived' ? (
              <Button
                label="Restore"
                onPress={() => void runStatusChange('active')}
                variant="secondary"
                loading={busy}
                fullWidth
                testID="pet-restore"
              />
            ) : null}

            <Button
              label="Delete"
              onPress={() => setPendingAction('delete')}
              variant="danger"
              fullWidth
              testID="pet-delete"
            />
          </View>
        </Section>
      </ScrollView>

      <ConfirmAction
        visible={pendingAction === 'archive'}
        title={`Archive ${pet.name}?`}
        message="They stay in your records and stop appearing in your active list. You can restore them at any time."
        confirmLabel="Archive"
        busy={busy}
        onConfirm={() => void runStatusChange('archived')}
        onCancel={() => setPendingAction(null)}
      />

      <ConfirmAction
        visible={pendingAction === 'delete'}
        title={`Delete ${pet.name}?`}
        message="This removes them from your account and cannot be undone from the app. Archive instead if you only want to hide them."
        confirmLabel="Delete"
        destructive
        busy={busy}
        onConfirm={() => void runDelete()}
        onCancel={() => setPendingAction(null)}
      />
    </Screen>
  );
}

function Detail({ value }: { value: string }) {
  return (
    <Text variant="caption" color="textMuted">
      {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.md, gap: Spacing.lg, paddingBottom: Spacing.xxl },
  header: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  actions: { gap: Spacing.sm },
  actionError: { paddingHorizontal: Spacing.xs },
});
