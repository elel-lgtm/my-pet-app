/**
 * How a pet's tracker and its most recent fix combine into something a screen can state plainly.
 *
 * Two independent facts are involved and they are easy to conflate:
 *
 *   * **The device** may be silent — `lastSeenAt` has aged past the approved offline window, or the
 *     device is inactive. That is `Tracker.isOffline`, and it exists already.
 *   * **The position** may be old — the newest fix was taken a while ago. A device can check in
 *     without producing a new fix, so an online tracker can still have a stale location.
 *
 * Nothing here re-derives either fact; this module only joins them so the UI has one value to
 * render rather than four booleans to reason about.
 *
 * ## The freshness threshold is not invented here
 *
 * `staleAfterMinutes` is a **required argument**. There is deliberately no default, because "how
 * old is too old for a position to be called current" is a product decision that has not been made:
 * a live-tracking view might want thirty seconds, a daily-summary view an hour. Baking a number in
 * here would settle that question silently.
 *
 * The application currently passes `TRACKER_OFFLINE_AFTER_MINUTES`, which is already approved and
 * means "the device has gone quiet". A fix older than the window in which we would have declared
 * the device silent cannot honestly be presented as current, so it is a defensible floor — not a
 * new product rule. A separate, shorter live-tracking threshold remains deferred; see
 * ARCHITECTURE.md.
 */

import { type IsoDateTime } from '@/lib/domain/ids';
import { isUsableFix, type PetLocation } from '@/lib/domain/location';
import { hasLowBattery, isOffline, type Tracker } from '@/lib/domain/tracker';

export type LocationFreshness =
  /** No tracker, or a tracker that has never produced a fix. Nothing to place on a map. */
  | 'unavailable'
  /** Recorded within the threshold. */
  | 'fresh'
  /** Real, but old enough that presenting it as the pet's position would mislead. */
  | 'stale';

export type TrackingSummary = {
  readonly tracker: Tracker | null;
  /** The most recent fix by `recordedAt`, or null when there is none. */
  readonly latest: PetLocation | null;
  readonly freshness: LocationFreshness;
  /** Age of `latest` in whole minutes, or null when there is no fix. */
  readonly locationAgeMinutes: number | null;
  /** The device has gone quiet. Independent of whether the last fix is fresh. */
  readonly trackerOffline: boolean;
  readonly lowBattery: boolean;
  /**
   * Whether the fix is precise enough to act on. A 2 km-accurate fix is a real reading and is not
   * hidden, but it should not be drawn as a point or tested against a safe zone.
   */
  readonly locationUsable: boolean;
};

export type ResolveTrackingOptions = {
  /** No default, on purpose. See the note above. */
  readonly staleAfterMinutes: number;
};

/**
 * Picks the most recent fix by `recordedAt`.
 *
 * Explicitly not by `createdAt`: a tracker that loses connectivity buffers fixes and uploads them
 * later, so the newest arrival is not the newest position. Callers that already receive an ordered
 * list may skip this, but nothing should assume the ordering.
 */
export function latestLocation(locations: readonly PetLocation[]): PetLocation | null {
  let newest: PetLocation | null = null;
  for (const location of locations) {
    if (newest === null || Date.parse(location.recordedAt) > Date.parse(newest.recordedAt)) {
      newest = location;
    }
  }
  return newest;
}

/** Whole minutes between a fix and `now`. Negative ages are clamped to zero. */
export function locationAgeMinutes(location: PetLocation, now: IsoDateTime): number {
  const elapsed = (Date.parse(now) - Date.parse(location.recordedAt)) / 60_000;
  return Number.isFinite(elapsed) ? Math.max(0, Math.floor(elapsed)) : 0;
}

export function resolveTracking(
  tracker: Tracker | null,
  latest: PetLocation | null,
  now: IsoDateTime,
  options: ResolveTrackingOptions
): TrackingSummary {
  const trackerOffline = tracker !== null && isOffline(tracker, now);
  const lowBattery = tracker !== null && hasLowBattery(tracker);

  if (latest === null) {
    return {
      tracker,
      latest: null,
      freshness: 'unavailable',
      locationAgeMinutes: null,
      trackerOffline,
      lowBattery,
      locationUsable: false,
    };
  }

  const age = locationAgeMinutes(latest, now);

  return {
    tracker,
    latest,
    freshness: age > options.staleAfterMinutes ? 'stale' : 'fresh',
    locationAgeMinutes: age,
    trackerOffline,
    lowBattery,
    locationUsable: isUsableFix(latest),
  };
}
