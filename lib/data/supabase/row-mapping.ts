/**
 * Shared row → domain conversions for the Supabase adapters.
 *
 * Extracted from the pet adapter once a second adapter needed the same rules. Two copies of
 * timestamp normalisation is exactly the kind of duplication that drifts: one gets a fix and the
 * other keeps producing values that fail `isIsoDateTime`.
 */

import {
  unsafeId,
  unsafeIsoDate,
  unsafeIsoDateTime,
  type EntityId,
  type IsoDate,
  type IsoDateTime,
} from '@/lib/domain/ids';

/**
 * Normalises a PostgreSQL timestamp to the exact ISO form `IsoDateTime` promises.
 *
 * PostgREST emits RFC 3339 with **microsecond** precision and a full offset, e.g.
 * `2026-08-25T21:30:27.358632+00:00`. The domain requires a millisecond `Z` form, so the raw value
 * would fail `isIsoDateTime` and make the branded type a lie.
 *
 * An unparseable value is returned as-is rather than thrown on: these mappers run inside render
 * paths, and a `RangeError` from one date would take down a whole screen.
 */
export function toIsoDateTime(value: string): IsoDateTime {
  const parsed = new Date(value);
  return unsafeIsoDateTime(Number.isNaN(parsed.getTime()) ? value : parsed.toISOString());
}

export function toOptionalIsoDateTime(value: string | null): IsoDateTime | null {
  return value === null ? null : toIsoDateTime(value);
}

/** `date` columns arrive as `YYYY-MM-DD`, already the shape `IsoDate` wants. */
export function toOptionalIsoDate(value: string | null): IsoDate | null {
  return value === null ? null : unsafeIsoDate(value.slice(0, 10));
}

/** Brands a nullable id column without forcing every call site to repeat the null check. */
export function unsafeIdOrNull<Id extends EntityId>(value: string | null): Id | null {
  return value === null ? null : unsafeId<Id>(value);
}
