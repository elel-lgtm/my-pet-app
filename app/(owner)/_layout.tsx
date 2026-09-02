import { Stack } from 'expo-router';

import { PetsProvider } from '@/features/pets';

/**
 * The owner area.
 *
 * A Stack wrapping the tab navigator, so detail and form routes push above the tabs and get a
 * header for free.
 *
 * `PetsProvider` is mounted here rather than at the root because it is only meaningful for a
 * signed-in owner, and because this subtree is unmounted entirely on sign-out — which is what
 * guarantees one account's pets cannot survive into another's session.
 */
export default function OwnerLayout() {
  return (
    <PetsProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="pets/new" options={{ title: 'Add a pet', presentation: 'modal' }} />
        <Stack.Screen name="pets/[id]/index" options={{ title: 'Pet' }} />
        <Stack.Screen name="pets/[id]/edit" options={{ title: 'Edit pet' }} />
      </Stack>
    </PetsProvider>
  );
}
