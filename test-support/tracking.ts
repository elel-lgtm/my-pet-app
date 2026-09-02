/**
 * Test doubles for tracking.
 *
 * Includes a small deterministic fix generator. This is the "development/simulation path" the
 * tracking foundation needs: it produces valid `RecordLocationInput`s without a hardware provider,
 * a network, or a clock, so tests of staleness and history are repeatable. It is test support, not
 * a product feature — nothing in `app/` imports it, and it never writes to a real database.
 */

import { type LocationRepository, type TrackerRepository } from '@/lib/data';
import {
  unsafeId,
  unsafeIsoDateTime,
  type IsoDateTime,
  type PetId,
  type PetLocationId,
  type ProfileId,
  type TrackerId,
} from '@/lib/domain/ids';
import { type LocationSource, type PetLocation } from '@/lib/domain/location';
import { type Tracker } from '@/lib/domain/tracker';
import { AppError } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';
import { TEST_USER_ID } from '@/test-support/auth';

export const TEST_PET_ID = unsafeId<PetId>('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
export const TEST_TRACKER_ID = unsafeId<TrackerId>('cccccccc-cccc-4ccc-8ccc-cccccccccccc');

/** A fixed instant, so "minutes ago" arithmetic in tests is exact rather than nearly right. */
export const NOW = unsafeIsoDateTime('2026-09-02T12:00:00.000Z');

export function minutesBefore(instant: IsoDateTime, minutes: number): IsoDateTime {
  return unsafeIsoDateTime(new Date(Date.parse(instant) - minutes * 60_000).toISOString());
}

export function makeTracker(overrides: Partial<Tracker> = {}): Tracker {
  return {
    id: TEST_TRACKER_ID,
    ownerId: TEST_USER_ID as ProfileId,
    petId: TEST_PET_ID,
    serialNumber: 'DEV-0001',
    label: 'Collar',
    status: 'active',
    batteryPercent: 82,
    firmwareVersion: '1.4.0',
    lastSeenAt: minutesBefore(NOW, 2),
    createdAt: minutesBefore(NOW, 10_000),
    updatedAt: minutesBefore(NOW, 2),
    ...overrides,
  };
}

let fixCounter = 0;

export function makeLocation(overrides: Partial<PetLocation> = {}): PetLocation {
  fixCounter += 1;
  const recordedAt = overrides.recordedAt ?? minutesBefore(NOW, 1);
  return {
    id: unsafeId<PetLocationId>(
      `dddddddd-dddd-4ddd-8ddd-${fixCounter.toString().padStart(12, '0')}`
    ),
    petId: TEST_PET_ID,
    trackerId: TEST_TRACKER_ID,
    coordinates: { latitude: 51.5007, longitude: -0.1246 },
    accuracyMeters: 12,
    speedMetersPerSecond: 0,
    source: 'gps' as LocationSource,
    recordedAt,
    createdAt: recordedAt,
    ...overrides,
  };
}

/**
 * A short deterministic track, oldest first.
 *
 * Each fix steps a fixed distance so a route has shape without pretending to model real movement.
 */
export function makeTrack(count: number, endingAt: IsoDateTime = NOW): readonly PetLocation[] {
  return Array.from({ length: count }, (_unused, index) => {
    const minutesAgo = (count - 1 - index) * 5;
    return makeLocation({
      recordedAt: minutesBefore(endingAt, minutesAgo),
      coordinates: { latitude: 51.5007 + index * 0.0005, longitude: -0.1246 + index * 0.0005 },
    });
  });
}

export type FakeTrackingRepositories = {
  readonly trackers: TrackerRepository;
  readonly locations: LocationRepository;
};

export type FakeTrackingOptions = {
  readonly tracker?: Tracker | null | undefined;
  readonly latest?: PetLocation | null | undefined;
  readonly trackerError?: AppError | undefined;
  readonly locationError?: AppError | undefined;
};

/** Only the reads the tracking UI performs. Writes throw, because the UI must never attempt one. */
export function createFakeTrackingRepositories(
  options: FakeTrackingOptions = {}
): FakeTrackingRepositories {
  const unsupported = (name: string) => (): never => {
    throw new Error(`${name} is not part of the tracking read path`);
  };

  return {
    trackers: {
      async findForPet(): Promise<Result<Tracker | null, AppError>> {
        return options.trackerError === undefined
          ? ok(options.tracker ?? null)
          : err(options.trackerError);
      },
      listForOwner: unsupported('listForOwner'),
      findById: unsupported('findById'),
      register: unsupported('register'),
      assignToPet: unsupported('assignToPet'),
      recordHeartbeat: unsupported('recordHeartbeat'),
    } as unknown as TrackerRepository,

    locations: {
      async latestForPet(): Promise<Result<PetLocation | null, AppError>> {
        return options.locationError === undefined
          ? ok(options.latest ?? null)
          : err(options.locationError);
      },
      historyForPet: unsupported('historyForPet'),
      record: unsupported('record'),
    } as unknown as LocationRepository,
  };
}
