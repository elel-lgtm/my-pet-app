import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import {
  Button,
  Divider,
  EmptyState,
  Screen,
  Section,
  Spinner,
  Surface,
  Text,
} from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { PetRow } from '@/features/pets/components/pet-row';
import { usePets } from '@/features/pets/pets-provider';
import { activePets, inactivePets } from '@/features/pets/pets-state';
import { useTheme } from '@/hooks/use-theme';
import { userMessageFor } from '@/lib/errors';
import { type Pet } from '@/lib/domain/pet';

/**
 * The Pets tab.
 *
 * Five states, each distinct: first load, populated, empty, error, and refreshing over a populated
 * list. The last is why refresh does not fall back to the spinner — replacing a good list with a
 * loading state on every pull is disorienting.
 *
 * Archived and deceased pets are kept out of the main list and shown in a second section. They are
 * still the owner's pets and deleting them is not the answer, but they should not compete with the
 * animals whose location matters today.
 */
export function PetListScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, refresh } = usePets();

  function openPet(pet: Pet): void {
    router.push(`/pets/${pet.id}`);
  }

  if (state.status === 'loading') {
    return (
      <Screen centered testID="pets-loading">
        <Spinner label="Loading your pets" />
      </Screen>
    );
  }

  if (state.status === 'error') {
    return (
      <Screen centered testID="pets-error">
        <View style={styles.errorContent}>
          <EmptyState
            icon="warning"
            title="Could not load your pets"
            description={userMessageFor(state.error)}
          />
          <Button label="Try again" onPress={() => void refresh()} testID="pets-retry" />
        </View>
      </Screen>
    );
  }

  const active = activePets(state.pets);
  const inactive = inactivePets(state.pets);

  if (state.pets.length === 0) {
    return (
      <Screen centered testID="pets-empty">
        <EmptyState
          icon="pets"
          title="No pets yet"
          description="Add your first pet to start keeping track of them."
          action={{ label: 'Add a pet', onPress: () => router.push('/pets/new') }}
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false} testID="pets-list">
      <FlatList
        data={active}
        keyExtractor={(pet) => pet.id}
        renderItem={({ item, index }) => (
          <>
            {index > 0 ? <Divider inset /> : null}
            <PetRow pet={item} onPress={() => openPet(item)} />
          </>
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={state.refreshing}
            onRefresh={() => void refresh()}
            tintColor={colors.tint}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Button
              label="Add a pet"
              icon="add"
              onPress={() => router.push('/pets/new')}
              fullWidth
              testID="pets-add"
            />
          </View>
        }
        ListEmptyComponent={
          // Reached when every pet is archived: the list is not empty, but this section is.
          <View style={styles.header}>
            <Text color="textMuted">No active pets right now.</Text>
          </View>
        }
        ListFooterComponent={
          inactive.length === 0 ? null : (
            <View style={styles.footer}>
              <Section title="No longer tracked">
                <Surface padded={false}>
                  {inactive.map((pet, index) => (
                    <View key={pet.id}>
                      {index > 0 ? <Divider inset /> : null}
                      <PetRow pet={pet} onPress={() => openPet(pet)} />
                    </View>
                  ))}
                </Surface>
              </Section>
            </View>
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: Spacing.xxl },
  header: { padding: Spacing.md },
  footer: { padding: Spacing.md, gap: Spacing.sm },
  errorContent: { alignItems: 'center', gap: Spacing.md },
});
