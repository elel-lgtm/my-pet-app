/**
 * A GPS tracker device.
 *
 * Modelled separately from the pet wearing it because the two have independent lifecycles: a
 * tracker is bought before it is assigned, moves between pets, is replaced when the battery dies,
 * and reports its own health regardless of which collar it is on. Folding these fields into `Pet`
 * would leave no way to represent an unassigned device or a pet with no tracker at all.
 */

import { type IsoDateTime, type PetId, type ProfileId, type TrackerId } from '@/lib/domain/ids';
import { Validation } from '@/lib/domain/validation';
import { type ValidationError } from '@/lib/errors';
import { type Result } from '@/lib/result';

export const TRACKER_STATUSES = ['active', 'inactive', 'retired'] as const;
export type TrackerStatus = (typeof TRACKER_STATUSES)[number];

export type Tracker = {
  readonly id: TrackerId;
  readonly ownerId: ProfileId;
  /** `null` while the device is unassigned — bought, replaced, or between pets. */
  readonly petId: PetId | null;
  /** The manufacturer's device identifier. Unique across the system. */
  readonly serialNumber: string;
  readonly label: string | null;
  readonly status: TrackerStatus;
  /** 0-100, or `null` before the device has ever reported in. */
  readonly batteryPercent: number | null;
  readonly firmwareVersion: string | null;
  /** Last contact of any kind. Staleness here is what raises an offline alert. */
  readonly lastSeenAt: IsoDateTime | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
};

export const SERIAL_NUMBER_MAX = 64;
export const TRACKER_LABEL_MAX = 60;

/** Below this the owner should be told to charge the device. */
export const LOW_BATTERY_THRESHOLD_PERCENT = 20;

/** Silence longer than this means the device is presumed offline. */
export const TRACKER_OFFLINE_AFTER_MINUTES = 60;

export type RegisterTrackerInput = {
  readonly serialNumber: string;
  readonly label: string | null;
  readonly petId: PetId | null;
};

export function parseRegisterTrackerInput(
  input: unknown
): Result<RegisterTrackerInput, ValidationError> {
  const v = new Validation();
  const raw = (input ?? {}) as Record<string, unknown>;

  const serialNumber = v.text('serialNumber', raw.serialNumber, { min: 4, max: SERIAL_NUMBER_MAX });
  const label = v.optionalText('label', raw.label, { max: TRACKER_LABEL_MAX });
  const petId = v.optionalId<PetId>('petId', raw.petId);

  return v.result(() => ({ serialNumber: serialNumber.toUpperCase(), label, petId }));
}

export function hasLowBattery(tracker: Tracker): boolean {
  return tracker.batteryPercent !== null && tracker.batteryPercent <= LOW_BATTERY_THRESHOLD_PERCENT;
}

/** Whether the device has gone quiet for long enough to be treated as offline at time `now`. */
export function isOffline(tracker: Tracker, now: IsoDateTime): boolean {
  if (tracker.status !== 'active') {
    return false;
  }
  if (tracker.lastSeenAt === null) {
    return true;
  }
  const elapsedMinutes = (Date.parse(now) - Date.parse(tracker.lastSeenAt)) / 60_000;
  return elapsedMinutes > TRACKER_OFFLINE_AFTER_MINUTES;
}
