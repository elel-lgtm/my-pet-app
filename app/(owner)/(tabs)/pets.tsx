import { EmptyState, Screen } from '@/components/ui';

/** Pets. Placeholder for the pet roster. */
export default function PetsScreen() {
  return (
    <Screen centered testID="pets-screen">
      <EmptyState
        icon="pets"
        title="No pets yet"
        description="Pets you add will be listed here, with their profile, records, and care history."
      />
    </Screen>
  );
}
