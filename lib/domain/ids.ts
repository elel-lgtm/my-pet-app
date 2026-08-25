/**
 * Branded identifier and timestamp primitives.
 *
 * Every entity key is a distinct type rather than a bare `string`, so passing a `TrackerId` where
 * a `PetId` belongs is a compile error instead of a query that quietly returns nothing. The brand
 * exists only in the type system: at runtime these are ordinary strings, which keeps them free to
 * cross a JSON boundary unchanged.
 */

declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type ProfileId = Brand<string, 'ProfileId'>;
export type PetId = Brand<string, 'PetId'>;
export type TrackerId = Brand<string, 'TrackerId'>;
export type PetLocationId = Brand<string, 'PetLocationId'>;
export type SafeZoneId = Brand<string, 'SafeZoneId'>;
export type AlertId = Brand<string, 'AlertId'>;
export type PetShareId = Brand<string, 'PetShareId'>;

/** Any branded entity identifier. */
export type EntityId = Brand<string, string>;

/** An RFC 3339 timestamp in UTC, e.g. `2026-08-25T14:03:00.000Z`. */
export type IsoDateTime = Brand<string, 'IsoDateTime'>;

/** A calendar date with no time component, e.g. `2019-04-02`. Maps to PostgreSQL `date`. */
export type IsoDate = Brand<string, 'IsoDate'>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isIsoDateTime(value: unknown): value is IsoDateTime {
  if (typeof value !== 'string') {
    return false;
  }
  const parsed = Date.parse(value);
  // `Date.parse` accepts a lot of loose input, so round-tripping is what actually pins the format.
  return !Number.isNaN(parsed) && new Date(parsed).toISOString() === value;
}

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().startsWith(value);
}

/**
 * Tags an existing string as an identifier without validating it.
 *
 * Reserved for values already known to be well-formed — a literal in a test, or a row read back
 * from a database that generated it. Anything crossing a trust boundary goes through the
 * validators in `@/lib/domain/validation` instead.
 */
export function unsafeId<Id extends EntityId>(value: string): Id {
  return value as Id;
}

export function unsafeIsoDateTime(value: string): IsoDateTime {
  return value as IsoDateTime;
}

export function unsafeIsoDate(value: string): IsoDate {
  return value as IsoDate;
}

/** The current instant, normalised to the one timestamp format the domain uses. */
export function nowIso(): IsoDateTime {
  return new Date().toISOString() as IsoDateTime;
}

/**
 * Produces the timestamp for a domain operation.
 *
 * Injected rather than read from the global clock so that tests can make time deterministic and
 * so a future server-authoritative clock can replace it in one place.
 */
export type Clock = () => IsoDateTime;

export const systemClock: Clock = nowIso;
