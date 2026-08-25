import { Stack } from 'expo-router';

/**
 * The unauthenticated area.
 *
 * Reached only when there is no session: the root layout removes this group from the navigator
 * entirely once someone is signed in, so these routes are not merely hidden — they do not exist.
 */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
