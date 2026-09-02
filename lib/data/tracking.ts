/**
 * Composition point for tracking data.
 *
 * The tracking feature needs the tracker and location ports but must not import `@/lib/supabase` —
 * ESLint blocks `features/**` from doing so. This joins the ports to their Supabase adapters in the
 * one layer features may depend on. Mirrors `lib/data/auth.ts` and `lib/data/pets.ts`.
 */

import { createSupabaseLocationRepository } from '@/lib/data/supabase/location-repository';
import { createSupabaseTrackerRepository } from '@/lib/data/supabase/tracker-repository';
import { type LocationRepository, type TrackerRepository } from '@/lib/data/ports';
import { getSupabaseClient } from '@/lib/supabase';

let cachedTrackers: TrackerRepository | null = null;
let cachedLocations: LocationRepository | null = null;

/** Lazily created, so importing this module does not require Supabase to be configured. */
export function getTrackerRepository(): TrackerRepository {
  cachedTrackers ??= createSupabaseTrackerRepository(getSupabaseClient());
  return cachedTrackers;
}

export function getLocationRepository(): LocationRepository {
  cachedLocations ??= createSupabaseLocationRepository(getSupabaseClient());
  return cachedLocations;
}

/** Drops both cached repositories. For tests, and for a sign-out that must not reuse a client. */
export function resetTrackingRepositories(): void {
  cachedTrackers = null;
  cachedLocations = null;
}
