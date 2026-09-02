import { useLocalSearchParams } from 'expo-router';

import { isUuid, unsafeId, type PetId } from '@/lib/domain/ids';

/**
 * Reads and validates the `id` route parameter.
 *
 * A route parameter is untrusted input: it arrives from a deep link, a pasted URL, or a stale
 * notification, and nothing guarantees it is a uuid. Passing an arbitrary string straight into a
 * query produces a `22P02` from PostgreSQL — an error about invalid text syntax, which is a
 * confusing thing to show someone who followed a broken link.
 *
 * Returns `null` for anything malformed so screens can render "not found" instead.
 */
export function usePetIdParam(): PetId | null {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();

  // Expo Router hands back an array when a segment repeats. Neither half is a valid pet id.
  const raw = Array.isArray(id) ? undefined : id;
  if (raw === undefined || !isUuid(raw)) {
    return null;
  }
  return unsafeId<PetId>(raw.toLowerCase());
}
