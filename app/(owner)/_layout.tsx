import { Stack } from 'expo-router';

/**
 * The owner area.
 *
 * A Stack wrapping the tab navigator, so detail and modal routes added later — `pets/[id]`, an
 * "add pet" sheet — push above the tabs and get a header for free. See app/README.md for how the
 * caregiver and admin areas will sit beside this one.
 */
export default function OwnerLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
