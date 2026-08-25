/**
 * Keeps the domain model and the database schema in agreement.
 *
 * The domain declares each closed union as a TypeScript tuple; the database declares the same set
 * as a Postgres enum. Nothing forces those two to stay aligned — someone adds `pet_status = 'lost'`
 * to one and forgets the other, and the mismatch surfaces as a runtime insert failure much later,
 * against real user data.
 *
 * The assertions below are type-level, so a drift fails `npm run typecheck` (and therefore CI)
 * rather than production. They need no network and no database: `Database` is a generated type,
 * and types have no runtime cost.
 *
 * When a mismatch is reported here, fix whichever side is wrong — usually by writing a migration.
 * Never "fix" it by loosening the assertion.
 */

import { ALERT_KINDS, ALERT_SEVERITIES, ALERT_STATUSES } from '@/lib/domain/alert';
import { LOCATION_SOURCES } from '@/lib/domain/location';
import { PET_SPECIES, PET_STATUSES } from '@/lib/domain/pet';
import { CAREGIVER_PERMISSIONS, PET_SHARE_STATUSES } from '@/lib/domain/pet-share';
import { ACCOUNT_ROLES } from '@/lib/domain/profile';
import { TRACKER_STATUSES } from '@/lib/domain/tracker';
import { type Database } from '@/lib/supabase/database.types';

/** True only when A and B are the same type, invariantly — not merely mutually assignable. */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Fails to compile unless the type argument is exactly `true`. */
const expectType = <T extends true>(value: T): T => value;

type Enums = Database['public']['Enums'];
type Tables = Database['public']['Tables'];

describe('domain unions match database enums', () => {
  it('account_role', () => {
    expect(expectType<Equal<(typeof ACCOUNT_ROLES)[number], Enums['account_role']>>(true)).toBe(
      true
    );
  });

  it('pet_species', () => {
    expect(expectType<Equal<(typeof PET_SPECIES)[number], Enums['pet_species']>>(true)).toBe(true);
  });

  it('pet_status', () => {
    expect(expectType<Equal<(typeof PET_STATUSES)[number], Enums['pet_status']>>(true)).toBe(true);
  });

  it('tracker_status', () => {
    expect(
      expectType<Equal<(typeof TRACKER_STATUSES)[number], Enums['tracker_status']>>(true)
    ).toBe(true);
  });

  it('location_source', () => {
    expect(
      expectType<Equal<(typeof LOCATION_SOURCES)[number], Enums['location_source']>>(true)
    ).toBe(true);
  });

  it('alert_kind', () => {
    expect(expectType<Equal<(typeof ALERT_KINDS)[number], Enums['alert_kind']>>(true)).toBe(true);
  });

  it('alert_severity', () => {
    expect(
      expectType<Equal<(typeof ALERT_SEVERITIES)[number], Enums['alert_severity']>>(true)
    ).toBe(true);
  });

  it('alert_status', () => {
    expect(expectType<Equal<(typeof ALERT_STATUSES)[number], Enums['alert_status']>>(true)).toBe(
      true
    );
  });

  it('pet_share_status', () => {
    expect(
      expectType<Equal<(typeof PET_SHARE_STATUSES)[number], Enums['pet_share_status']>>(true)
    ).toBe(true);
  });

  it('caregiver_permission', () => {
    expect(
      expectType<Equal<(typeof CAREGIVER_PERMISSIONS)[number], Enums['caregiver_permission']>>(true)
    ).toBe(true);
  });
});

describe('adapter translation assumptions', () => {
  /**
   * The domain nests latitude and longitude in a `Coordinates` object; the database keeps them as
   * two flat columns. That difference is the adapter's job, and this pins the database half of it.
   */
  it('stores coordinates as two plain numeric columns', () => {
    expect(expectType<Equal<Tables['pet_locations']['Row']['latitude'], number>>(true)).toBe(true);
    expect(expectType<Equal<Tables['pet_locations']['Row']['longitude'], number>>(true)).toBe(true);
    expect(expectType<Equal<Tables['safe_zones']['Row']['center_latitude'], number>>(true)).toBe(
      true
    );
  });

  /** Timestamps arrive as strings, which is why the domain's `IsoDateTime` is a branded string. */
  it('returns timestamps as strings, not Date instances', () => {
    expect(expectType<Equal<Tables['pet_locations']['Row']['recorded_at'], string>>(true)).toBe(
      true
    );
    expect(expectType<Equal<Tables['pets']['Row']['created_at'], string>>(true)).toBe(true);
  });

  /** Nullability must survive the crossing, or the adapter invents data that is not there. */
  it('preserves nullability of optional columns', () => {
    expect(expectType<Equal<Tables['pets']['Row']['deleted_at'], string | null>>(true)).toBe(true);
    expect(expectType<Equal<Tables['pets']['Row']['lost_at'], string | null>>(true)).toBe(true);
    expect(expectType<Equal<Tables['trackers']['Row']['pet_id'], string | null>>(true)).toBe(true);
    expect(
      expectType<Equal<Tables['pet_shares']['Row']['caregiver_id'], string | null>>(true)
    ).toBe(true);
  });

  /**
   * Soft deletion is a pets-only decision. The `@ts-expect-error` lines are the assertion: each
   * one fails to compile if that table ever grows a `deleted_at` column, which would mean the
   * decision spread without anyone arguing for it.
   */
  it('confines soft deletion to pets', () => {
    expect(expectType<Equal<Tables['pets']['Row']['deleted_at'], string | null>>(true)).toBe(true);

    // @ts-expect-error alerts must not have a deleted_at column
    type _AlertsHaveNoSoftDelete = Tables['alerts']['Row']['deleted_at'];
    // @ts-expect-error pet_locations is append-only and must not have a deleted_at column
    type _LocationsHaveNoSoftDelete = Tables['pet_locations']['Row']['deleted_at'];
  });
});

describe('schema coverage', () => {
  it('exposes exactly the seven approved tables', () => {
    // Runtime list mirrored from the generated type, so an added table forces a decision here.
    const approved = [
      'alerts',
      'pet_locations',
      'pet_shares',
      'pets',
      'profiles',
      'safe_zones',
      'trackers',
    ] as const;

    expect(expectType<Equal<(typeof approved)[number], keyof Tables>>(true)).toBe(true);
  });
});
