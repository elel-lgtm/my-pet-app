/**
 * A single position fix for a pet.
 *
 * Location rows are append-only: a fix records where a pet was at a moment and is never edited.
 * That makes the table the app's highest-volume by a wide margin, which is why DATABASE.md treats
 * its indexes and retention policy as a first-order concern rather than an afterthought.
 */

import { readCoordinates, type Coordinates } from '@/lib/domain/geo';
import { type IsoDateTime, type PetId, type PetLocationId, type TrackerId } from '@/lib/domain/ids';
import { Validation } from '@/lib/domain/validation';
import { type ValidationError } from '@/lib/errors';
import { type Result } from '@/lib/result';

export const LOCATION_SOURCES = ['gps', 'network', 'manual'] as const;
export type LocationSource = (typeof LOCATION_SOURCES)[number];

export type PetLocation = {
  readonly id: PetLocationId;
  readonly petId: PetId;
  /** `null` for a position entered by a person rather than reported by a device. */
  readonly trackerId: TrackerId | null;
  readonly coordinates: Coordinates;
  /** Horizontal accuracy in metres; larger is worse. `null` when the device does not report it. */
  readonly accuracyMeters: number | null;
  readonly speedMetersPerSecond: number | null;
  readonly source: LocationSource;
  /**
   * When the fix was taken on the device. Distinct from `createdAt` because a tracker that loses
   * connectivity buffers fixes and uploads them later — ordering history by arrival time would
   * scramble the route.
   */
  readonly recordedAt: IsoDateTime;
  readonly createdAt: IsoDateTime;
};

/** A fix less precise than this is too vague to draw on a map or test against a safe zone. */
export const MAX_USABLE_ACCURACY_METERS = 500;

export type RecordLocationInput = {
  readonly petId: PetId;
  readonly trackerId: TrackerId | null;
  readonly coordinates: Coordinates;
  readonly accuracyMeters: number | null;
  readonly speedMetersPerSecond: number | null;
  readonly source: LocationSource;
  readonly recordedAt: IsoDateTime;
};

export function parseRecordLocationInput(
  input: unknown
): Result<RecordLocationInput, ValidationError> {
  const v = new Validation();
  const raw = (input ?? {}) as Record<string, unknown>;

  const petId = v.id<PetId>('petId', raw.petId);
  const trackerId = v.optionalId<TrackerId>('trackerId', raw.trackerId);
  const coordinates = readCoordinates(v, 'coordinates', raw.coordinates);
  const accuracyMeters = v.optionalNumber('accuracyMeters', raw.accuracyMeters, { min: 0 });
  const speedMetersPerSecond = v.optionalNumber('speedMetersPerSecond', raw.speedMetersPerSecond, {
    min: 0,
  });
  const source = v.enum('source', raw.source, LOCATION_SOURCES);
  const recordedAt = v.isoDateTime('recordedAt', raw.recordedAt);

  // A device-reported fix must say which device reported it, or history cannot be attributed.
  if (source !== 'manual' && trackerId === null) {
    v.reject('trackerId', 'is required for a device-reported location');
  }

  return v.result(() => ({
    petId,
    trackerId,
    coordinates,
    accuracyMeters,
    speedMetersPerSecond,
    source,
    recordedAt,
  }));
}

/** Whether a fix is precise enough to act on. */
export function isUsableFix(location: PetLocation): boolean {
  return location.accuracyMeters === null || location.accuracyMeters <= MAX_USABLE_ACCURACY_METERS;
}
