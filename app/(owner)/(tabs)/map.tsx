import { EmptyState, Screen } from '@/components/ui';

/** Map. Placeholder for pet locations. No mapping library has been chosen yet. */
export default function MapScreen() {
  return (
    <Screen centered testID="map-screen">
      <EmptyState
        icon="map"
        title="Map coming soon"
        description="Pet locations and nearby places will appear here once a mapping provider is chosen."
      />
    </Screen>
  );
}
