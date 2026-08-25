/**
 * A circular geofence around a place a pet is allowed to be.
 *
 * Circles rather than polygons: every consumer tracker expresses geofences as a centre and a
 * radius, containment is a single distance comparison that needs no geometry library on device or
 * in the database, and a circle is far easier to draw and drag on a map. Polygons are noted as a
 * deferred decision in ARCHITECTURE.md.
 */

import { readCoordinates, type Coordinates } from '@/lib/domain/geo';
import { type IsoDateTime, type PetId, type SafeZoneId } from '@/lib/domain/ids';
import { Validation } from '@/lib/domain/validation';
import { type ValidationError } from '@/lib/errors';
import { type Result } from '@/lib/result';

/**
 * Radius bounds.
 *
 * The floor is set by GPS itself: a consumer fix is routinely 10-20 m out, so a smaller circle
 * would flap between inside and outside while the pet sat still. The ceiling keeps a "safe zone"
 * meaningfully local.
 */
export const SAFE_ZONE_MIN_RADIUS_METERS = 25;
export const SAFE_ZONE_MAX_RADIUS_METERS = 50_000;
export const SAFE_ZONE_NAME_MAX = 60;

/** How many active zones one pet may have, so the geofence check stays cheap per fix. */
export const MAX_SAFE_ZONES_PER_PET = 20;

export type SafeZone = {
  readonly id: SafeZoneId;
  /** Ownership is inherited from the pet; a zone has no owner of its own. */
  readonly petId: PetId;
  readonly name: string;
  readonly center: Coordinates;
  readonly radiusMeters: number;
  /** An inactive zone is retained but not evaluated. */
  readonly isActive: boolean;
  readonly notifyOnExit: boolean;
  readonly notifyOnEntry: boolean;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
};

export type CreateSafeZoneInput = {
  readonly petId: PetId;
  readonly name: string;
  readonly center: Coordinates;
  readonly radiusMeters: number;
  readonly notifyOnExit: boolean;
  readonly notifyOnEntry: boolean;
};

export function parseCreateSafeZoneInput(
  input: unknown
): Result<CreateSafeZoneInput, ValidationError> {
  const v = new Validation();
  const raw = (input ?? {}) as Record<string, unknown>;

  const petId = v.id<PetId>('petId', raw.petId);
  const name = v.text('name', raw.name, { min: 1, max: SAFE_ZONE_NAME_MAX });
  const center = readCoordinates(v, 'center', raw.center);
  const radiusMeters = v.number('radiusMeters', raw.radiusMeters, {
    min: SAFE_ZONE_MIN_RADIUS_METERS,
    max: SAFE_ZONE_MAX_RADIUS_METERS,
  });
  const notifyOnExit = raw.notifyOnExit !== false;
  const notifyOnEntry = raw.notifyOnEntry === true;

  // A zone that reports nothing is silently useless, which is worse than being rejected.
  if (!notifyOnExit && !notifyOnEntry) {
    v.reject('notifyOnExit', 'a safe zone must notify on entry, exit, or both');
  }

  return v.result(() => ({ petId, name, center, radiusMeters, notifyOnExit, notifyOnEntry }));
}

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two points, in metres.
 *
 * The haversine formula treats the earth as a sphere. At safe-zone scale the error against a true
 * ellipsoidal calculation is well under a metre — far below GPS noise — so it is not worth a
 * geospatial dependency.
 */
export function distanceMeters(from: Coordinates, to: Coordinates): number {
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Whether a position falls inside the zone. The boundary itself counts as inside. */
export function containsPoint(zone: SafeZone, point: Coordinates): boolean {
  return distanceMeters(zone.center, point) <= zone.radiusMeters;
}
