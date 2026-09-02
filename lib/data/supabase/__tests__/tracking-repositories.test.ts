/**
 * The Supabase tracker and location adapters, against a hand-built fake client.
 *
 * What matters is the translation and the error mapping. No network is involved — the fake returns
 * the shapes PostgREST would, including the refusal the database gives a client that tries to write
 * a location.
 */

import {
  createSupabaseLocationRepository,
  toPetLocation,
} from '@/lib/data/supabase/location-repository';
import { createSupabaseTrackerRepository, toTracker } from '@/lib/data/supabase/tracker-repository';
import { type AppSupabaseClient } from '@/lib/supabase';
import { type Database } from '@/lib/supabase/database.types';
import { unsafeId, unsafeIsoDateTime, type PetId, type TrackerId } from '@/lib/domain/ids';
import { setLogLevel } from '@/lib/logger';

beforeAll(() => setLogLevel('silent'));

type TrackerRow = Database['public']['Tables']['trackers']['Row'];
type LocationRow = Database['public']['Tables']['pet_locations']['Row'];

const PET_ID = unsafeId<PetId>('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const TRACKER_ID = unsafeId<TrackerId>('cccccccc-cccc-4ccc-8ccc-cccccccccccc');

const TRACKER_ROW: TrackerRow = {
  id: TRACKER_ID,
  owner_id: '11111111-1111-4111-8111-111111111111',
  pet_id: PET_ID,
  serial_number: 'DEV-0001',
  label: 'Collar',
  status: 'active',
  battery_percent: 82,
  firmware_version: '1.4.0',
  last_seen_at: '2026-09-02T11:58:00.123456+00:00',
  created_at: '2026-08-01T09:00:00.000000+00:00',
  updated_at: '2026-09-02T11:58:00.123456+00:00',
};

const LOCATION_ROW: LocationRow = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  pet_id: PET_ID,
  tracker_id: TRACKER_ID,
  latitude: 51.5007,
  longitude: -0.1246,
  accuracy_meters: 12,
  speed_mps: 1.4,
  source: 'gps',
  recorded_at: '2026-09-02T11:59:00.654321+00:00',
  created_at: '2026-09-02T11:59:30.000000+00:00',
};

/** Chainable stub of the PostgREST builder; terminals resolve with whatever the test supplied. */
function clientReturning(
  result: { data: unknown; error: unknown },
  capture?: (op: string, payload: unknown) => void
) {
  const builder: Record<string, unknown> = {};

  for (const method of ['select', 'eq', 'is', 'gte', 'lte', 'order', 'limit']) {
    builder[method] = (...args: unknown[]) => {
      capture?.(method, args);
      return builder;
    };
  }
  builder.insert = (payload: unknown) => {
    capture?.('insert', payload);
    return builder;
  };
  builder.update = (payload: unknown) => {
    capture?.('update', payload);
    return builder;
  };
  builder.single = async () => result;
  builder.maybeSingle = async () => result;
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);

  return { from: () => builder } as unknown as AppSupabaseClient;
}

describe('tracker row to domain', () => {
  it('maps every field to its domain name', () => {
    const tracker = toTracker(TRACKER_ROW);

    expect(tracker.id).toBe(TRACKER_ID);
    expect(tracker.petId).toBe(PET_ID);
    expect(tracker.serialNumber).toBe('DEV-0001');
    expect(tracker.status).toBe('active');
    expect(tracker.batteryPercent).toBe(82);
  });

  it('normalises microsecond timestamps to the millisecond Z form the domain promises', () => {
    expect(toTracker(TRACKER_ROW).lastSeenAt).toBe('2026-09-02T11:58:00.123Z');
  });

  it('keeps an unassigned device unassigned rather than inventing a pet', () => {
    expect(toTracker({ ...TRACKER_ROW, pet_id: null }).petId).toBeNull();
  });

  it('preserves a device that has never reported', () => {
    const tracker = toTracker({ ...TRACKER_ROW, last_seen_at: null, battery_percent: null });

    expect(tracker.lastSeenAt).toBeNull();
    expect(tracker.batteryPercent).toBeNull();
  });
});

describe('tracker reads', () => {
  it('finds the device on a pet', async () => {
    const repository = createSupabaseTrackerRepository(
      clientReturning({ data: TRACKER_ROW, error: null })
    );

    const result = await repository.findForPet(PET_ID);

    expect(result.ok && result.value?.serialNumber).toBe('DEV-0001');
  });

  /**
   * A pet with no device and a device the caller may not see look identical from here, on purpose:
   * `trackers_select` decides which, and reporting "forbidden" would confirm one exists.
   */
  it('reports an absent or hidden device as null', async () => {
    const repository = createSupabaseTrackerRepository(
      clientReturning({ data: null, error: null })
    );

    expect(await repository.findForPet(PET_ID)).toEqual({ ok: true, value: null });
  });

  it('maps a refused read to a permission error without naming the policy', async () => {
    const repository = createSupabaseTrackerRepository(
      clientReturning({
        data: null,
        error: { code: '42501', message: 'permission denied for table trackers' },
      })
    );

    const result = await repository.findForPet(PET_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unauthorized');
      expect(result.error.message).not.toMatch(/trackers|policy/i);
    }
  });
});

describe('tracker writes', () => {
  it('assigns a device to a pet', async () => {
    const captured: { op: string; payload: unknown }[] = [];
    const repository = createSupabaseTrackerRepository(
      clientReturning({ data: TRACKER_ROW, error: null }, (op, payload) =>
        captured.push({ op, payload })
      )
    );

    await repository.assignToPet(TRACKER_ID, PET_ID);

    expect(captured.find((c) => c.op === 'update')?.payload).toEqual({ pet_id: PET_ID });
  });

  it('unassigns without retiring, which is what happens when a collar moves pets', async () => {
    const captured: { op: string; payload: unknown }[] = [];
    const repository = createSupabaseTrackerRepository(
      clientReturning({ data: { ...TRACKER_ROW, pet_id: null }, error: null }, (op, payload) =>
        captured.push({ op, payload })
      )
    );

    await repository.assignToPet(TRACKER_ID, null);

    const payload = captured.find((c) => c.op === 'update')?.payload as Record<string, unknown>;
    expect(payload).toEqual({ pet_id: null });
    expect(payload).not.toHaveProperty('status');
  });

  /**
   * The composite foreign key refuses a cross-owner assignment at the database. The adapter's job
   * is to report that refusal in the app's vocabulary, not to pre-empt it.
   */
  it('maps a cross-owner assignment refusal to a validation error', async () => {
    const repository = createSupabaseTrackerRepository(
      clientReturning({
        data: null,
        error: {
          code: '23503',
          message: 'violates foreign key constraint trackers_pet_same_owner',
        },
      })
    );

    const result = await repository.assignToPet(TRACKER_ID, PET_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
      expect(result.error.message).not.toMatch(/constraint|trackers_pet_same_owner/i);
    }
  });

  it('reports assigning an unknown device as not found', async () => {
    const repository = createSupabaseTrackerRepository(
      clientReturning({ data: null, error: null })
    );

    const result = await repository.assignToPet(TRACKER_ID, PET_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not_found');
    }
  });

  it('records a heartbeat without touching assignment', async () => {
    const captured: { op: string; payload: unknown }[] = [];
    const repository = createSupabaseTrackerRepository(
      clientReturning({ data: TRACKER_ROW, error: null }, (op, payload) =>
        captured.push({ op, payload })
      )
    );

    await repository.recordHeartbeat(TRACKER_ID, {
      batteryPercent: 55,
      firmwareVersion: '1.5.0',
      seenAt: unsafeIsoDateTime('2026-09-02T12:00:00.000Z'),
    });

    const payload = captured.find((c) => c.op === 'update')?.payload as Record<string, unknown>;
    expect(payload).toMatchObject({ battery_percent: 55, last_seen_at: expect.any(String) });
    expect(payload).not.toHaveProperty('pet_id');
  });
});

describe('location row to domain', () => {
  /** Two flat columns become the nested shape the domain uses. */
  it('nests the coordinate columns', () => {
    expect(toPetLocation(LOCATION_ROW).coordinates).toEqual({
      latitude: 51.5007,
      longitude: -0.1246,
    });
  });

  it('normalises both timestamps', () => {
    const location = toPetLocation(LOCATION_ROW);

    expect(location.recordedAt).toBe('2026-09-02T11:59:00.654Z');
    expect(location.createdAt).toBe('2026-09-02T11:59:30.000Z');
  });

  it('keeps a manual fix without a tracker', () => {
    const manual = toPetLocation({ ...LOCATION_ROW, tracker_id: null, source: 'manual' });

    expect(manual.trackerId).toBeNull();
    expect(manual.source).toBe('manual');
  });
});

describe('location reads', () => {
  /**
   * Ordered by when the fix was taken, never by when it arrived. A buffered upload would otherwise
   * return a position the pet had already left.
   */
  it('asks for the newest fix by recorded time', async () => {
    const captured: { op: string; payload: unknown }[] = [];
    const repository = createSupabaseLocationRepository(
      clientReturning({ data: LOCATION_ROW, error: null }, (op, payload) =>
        captured.push({ op, payload })
      )
    );

    await repository.latestForPet(PET_ID);

    const order = captured.find((c) => c.op === 'order')?.payload as unknown[];
    expect(order[0]).toBe('recorded_at');
    expect(order[1]).toMatchObject({ ascending: false });
  });

  it('reports a pet with no history as null rather than an error', async () => {
    const repository = createSupabaseLocationRepository(
      clientReturning({ data: null, error: null })
    );

    expect(await repository.latestForPet(PET_ID)).toEqual({ ok: true, value: null });
  });

  it('bounds history by the requested range and a limit', async () => {
    const captured: { op: string; payload: unknown }[] = [];
    const repository = createSupabaseLocationRepository(
      clientReturning({ data: [LOCATION_ROW], error: null }, (op, payload) =>
        captured.push({ op, payload })
      )
    );

    await repository.historyForPet(PET_ID, {
      from: unsafeIsoDateTime('2026-09-01T00:00:00.000Z'),
      to: unsafeIsoDateTime('2026-09-02T00:00:00.000Z'),
      limit: 50,
    });

    expect(captured.some((c) => c.op === 'gte')).toBe(true);
    expect(captured.some((c) => c.op === 'lte')).toBe(true);
    expect((captured.find((c) => c.op === 'limit')?.payload as unknown[])[0]).toBe(50);
  });

  it('applies a default limit so an unbounded range cannot pull a month into memory', async () => {
    const captured: { op: string; payload: unknown }[] = [];
    const repository = createSupabaseLocationRepository(
      clientReturning({ data: [], error: null }, (op, payload) => captured.push({ op, payload }))
    );

    await repository.historyForPet(PET_ID, {
      from: unsafeIsoDateTime('2020-01-01T00:00:00.000Z'),
      to: unsafeIsoDateTime('2030-01-01T00:00:00.000Z'),
    });

    expect((captured.find((c) => c.op === 'limit')?.payload as unknown[])[0]).toBe(500);
  });

  it('returns history oldest first, so it draws as a path without re-sorting', async () => {
    const captured: { op: string; payload: unknown }[] = [];
    const repository = createSupabaseLocationRepository(
      clientReturning({ data: [LOCATION_ROW], error: null }, (op, payload) =>
        captured.push({ op, payload })
      )
    );

    await repository.historyForPet(PET_ID, {
      from: unsafeIsoDateTime('2026-09-01T00:00:00.000Z'),
      to: unsafeIsoDateTime('2026-09-02T00:00:00.000Z'),
    });

    expect((captured.find((c) => c.op === 'order')?.payload as unknown[])[1]).toMatchObject({
      ascending: true,
    });
  });
});

describe('client location writes', () => {
  /**
   * The security property of the whole tracking feature. `pet_locations` has no INSERT policy, so
   * the database refuses an end-user write. The adapter must surface that as reviewed copy rather
   * than a raw policy message — and must not silently swallow it either.
   */
  it('maps the database refusal to a permission error without leaking the policy', async () => {
    const repository = createSupabaseLocationRepository(
      clientReturning({
        data: null,
        error: {
          code: '42501',
          message: 'new row violates row-level security policy for table "pet_locations"',
        },
      })
    );

    const result = await repository.record({
      petId: PET_ID,
      trackerId: TRACKER_ID,
      coordinates: { latitude: 51.5, longitude: -0.12 },
      accuracyMeters: 10,
      speedMetersPerSecond: null,
      source: 'gps',
      recordedAt: unsafeIsoDateTime('2026-09-02T12:00:00.000Z'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unauthorized');
      expect(result.error.message).not.toMatch(/row-level|pet_locations/i);
    }
  });
});
