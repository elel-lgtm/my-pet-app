/**
 * Geographic primitives shared by locations, safe zones, and alerts.
 *
 * Coordinates are WGS 84 decimal degrees — the frame every consumer GPS device and mapping SDK
 * reports in — and are stored as two plain numbers rather than a PostGIS geometry. See DATABASE.md
 * for why, and for what would have to change if proximity queries ever outgrow that.
 */

import { type Validation } from '@/lib/domain/validation';

export type Coordinates = {
  /** Degrees north of the equator, -90 to 90. */
  readonly latitude: number;
  /** Degrees east of the prime meridian, -180 to 180. */
  readonly longitude: number;
};

export const LATITUDE_MIN = -90;
export const LATITUDE_MAX = 90;
export const LONGITUDE_MIN = -180;
export const LONGITUDE_MAX = 180;

export function isCoordinates(value: unknown): value is Coordinates {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { latitude?: unknown; longitude?: unknown };
  return (
    typeof candidate.latitude === 'number' &&
    Number.isFinite(candidate.latitude) &&
    candidate.latitude >= LATITUDE_MIN &&
    candidate.latitude <= LATITUDE_MAX &&
    typeof candidate.longitude === 'number' &&
    Number.isFinite(candidate.longitude) &&
    candidate.longitude >= LONGITUDE_MIN &&
    candidate.longitude <= LONGITUDE_MAX
  );
}

/** Reads a coordinate pair, recording a field-level problem for each axis that is out of range. */
export function readCoordinates(v: Validation, field: string, value: unknown): Coordinates {
  if (typeof value !== 'object' || value === null) {
    v.reject(field, 'must be a latitude and longitude pair');
    return { latitude: 0, longitude: 0 };
  }

  const candidate = value as { latitude?: unknown; longitude?: unknown };
  return {
    latitude: v.number(`${field}.latitude`, candidate.latitude, {
      min: LATITUDE_MIN,
      max: LATITUDE_MAX,
    }),
    longitude: v.number(`${field}.longitude`, candidate.longitude, {
      min: LONGITUDE_MIN,
      max: LONGITUDE_MAX,
    }),
  };
}
