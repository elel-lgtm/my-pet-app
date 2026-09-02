/**
 * Loads the tracker and latest fix for one pet.
 *
 * A hook rather than a provider, unlike `PetsProvider`. Tracking data is scoped to whichever pet is
 * on screen, is read in two places (detail and map), and has no cross-screen mutations to keep in
 * sync — so a shared store would be machinery without a job. If a live-updating map later needs one
 * subscription for several pets, that is the point to revisit this, not before.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getLocationRepository,
  getTrackerRepository,
  type LocationRepository,
  type TrackerRepository,
} from '@/lib/data';
import { type PetId } from '@/lib/domain/ids';
import { unsafeIsoDateTime } from '@/lib/domain/ids';
import { TRACKER_OFFLINE_AFTER_MINUTES } from '@/lib/domain/tracker';
import { resolveTracking, type TrackingSummary } from '@/lib/domain/tracking';
import { toAppError, type AppError } from '@/lib/errors';

export type PetTrackingState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly summary: TrackingSummary }
  | { readonly status: 'error'; readonly error: AppError };

export type UsePetTrackingResult = {
  readonly state: PetTrackingState;
  refresh(): Promise<void>;
};

export type PetTrackingRepositories = {
  readonly trackers: TrackerRepository;
  readonly locations: LocationRepository;
};

/**
 * The threshold used to call a position stale.
 *
 * Reuses the already-approved device-silence window rather than inventing a second number: a fix
 * older than the period after which we would declare the device offline cannot honestly be shown
 * as current. A shorter live-tracking threshold is a product decision that has not been made — see
 * `lib/domain/tracking.ts`.
 */
export const LOCATION_STALE_AFTER_MINUTES = TRACKER_OFFLINE_AFTER_MINUTES;

export function usePetTracking(
  petId: PetId | null,
  /** Injected in tests. Production resolves the Supabase-backed repositories lazily. */
  repositories?: PetTrackingRepositories
): UsePetTrackingResult {
  const [state, setState] = useState<PetTrackingState>({ status: 'loading' });

  const repositoriesRef = useRef<PetTrackingRepositories | null>(repositories ?? null);
  const resolve = useCallback((): PetTrackingRepositories => {
    repositoriesRef.current ??= {
      trackers: getTrackerRepository(),
      locations: getLocationRepository(),
    };
    return repositoriesRef.current;
  }, []);

  const load = useCallback(async (): Promise<void> => {
    if (petId === null) {
      setState({ status: 'error', error: toAppError(new Error('No pet selected.')) });
      return;
    }

    let repos: PetTrackingRepositories;
    try {
      repos = resolve();
    } catch (thrown) {
      // Supabase not configured. A legible error beats a blank panel.
      setState({ status: 'error', error: toAppError(thrown) });
      return;
    }

    // Both reads are independent and the screen needs both, so they go out together rather than
    // one after the other.
    const [tracker, latest] = await Promise.all([
      repos.trackers.findForPet(petId),
      repos.locations.latestForPet(petId),
    ]);

    if (!tracker.ok) {
      setState({ status: 'error', error: tracker.error });
      return;
    }
    if (!latest.ok) {
      setState({ status: 'error', error: latest.error });
      return;
    }

    setState({
      status: 'ready',
      summary: resolveTracking(
        tracker.value,
        latest.value,
        unsafeIsoDateTime(new Date().toISOString()),
        { staleAfterMinutes: LOCATION_STALE_AFTER_MINUTES }
      ),
    });
  }, [petId, resolve]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, refresh: load };
}
