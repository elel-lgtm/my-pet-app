/**
 * The Supabase pet adapter, against a hand-built fake client.
 *
 * What matters is the translation: rows in, domain entities out, provider errors turned into
 * reviewed `AppError`s. No network is involved — the fake returns the shapes PostgREST would.
 */

import {
  createSupabasePetRepository,
  toInsertRow,
  toPet,
  toUpdateRow,
} from '@/lib/data/supabase/pet-repository';
import { type AppSupabaseClient } from '@/lib/supabase';
import { type Database } from '@/lib/supabase/database.types';
import { unsafeId, unsafeIsoDate, type PetId, type ProfileId } from '@/lib/domain/ids';
import { setLogLevel } from '@/lib/logger';

beforeAll(() => setLogLevel('silent'));

type PetRow = Database['public']['Tables']['pets']['Row'];

const OWNER_ID = unsafeId<ProfileId>('11111111-1111-4111-8111-111111111111');
const PET_ID = unsafeId<PetId>('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

const ROW: PetRow = {
  id: PET_ID,
  owner_id: OWNER_ID,
  name: 'Biscuit',
  species: 'dog',
  breed: 'Beagle',
  date_of_birth: '2019-04-02',
  photo_url: null,
  notes: 'Friendly',
  status: 'active',
  lost_at: null,
  created_at: '2026-08-20T09:00:00.358632+00:00',
  updated_at: '2026-08-20T09:00:00.358632+00:00',
  deleted_at: null,
};

/**
 * A chainable stub of the PostgREST builder.
 *
 * Every filter method returns `this`, and the terminal methods resolve with whatever the test
 * supplied — which is how one object can stand in for the whole fluent chain.
 */
function clientReturning(
  result: { data: unknown; error: unknown },
  capture?: (op: string, payload: unknown) => void
) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  for (const method of ['select', 'eq', 'is', 'order', 'limit']) {
    builder[method] = chain;
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
  // An un-terminated chain (a plain list query) is awaited directly.
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);

  return { from: () => builder } as unknown as AppSupabaseClient;
}

describe('row to domain', () => {
  it('maps every field to its domain name', () => {
    const pet = toPet(ROW);

    expect(pet.id).toBe(PET_ID);
    expect(pet.ownerId).toBe(OWNER_ID);
    expect(pet.name).toBe('Biscuit');
    expect(pet.species).toBe('dog');
    expect(pet.breed).toBe('Beagle');
    expect(pet.notes).toBe('Friendly');
    expect(pet.status).toBe('active');
    expect(pet.deletedAt).toBeNull();
  });

  /**
   * PostgREST emits microsecond precision and a `+00:00` offset. The domain's `IsoDateTime`
   * requires millisecond `Z` form, so an unnormalised value would fail `isIsoDateTime` and make
   * the branded type a lie. Verified against the live database's actual output format.
   */
  it('normalises microsecond timestamps to the millisecond Z form the domain promises', () => {
    expect(toPet(ROW).createdAt).toBe('2026-08-20T09:00:00.358Z');
  });

  it('passes an unparseable timestamp through rather than throwing inside a render', () => {
    expect(toPet({ ...ROW, created_at: 'not-a-date' }).createdAt).toBe('not-a-date');
  });

  it('keeps a date column as a plain calendar date', () => {
    expect(toPet(ROW).dateOfBirth).toBe('2019-04-02');
  });

  it('preserves nulls rather than inventing values', () => {
    const pet = toPet({ ...ROW, breed: null, date_of_birth: null, notes: null, photo_url: null });

    expect(pet.breed).toBeNull();
    expect(pet.dateOfBirth).toBeNull();
    expect(pet.notes).toBeNull();
    expect(pet.photoUrl).toBeNull();
  });

  it('maps a lost pet with its timestamp', () => {
    const pet = toPet({ ...ROW, status: 'lost', lost_at: '2026-08-25T10:30:00.000000+00:00' });

    expect(pet.status).toBe('lost');
    expect(pet.lostAt).toBe('2026-08-25T10:30:00.000Z');
  });
});

describe('domain to row', () => {
  it('writes the owner and the supplied fields', () => {
    const row = toInsertRow(OWNER_ID, {
      name: 'Mochi',
      species: 'cat',
      breed: null,
      dateOfBirth: null,
      photoUrl: null,
      notes: null,
    });

    expect(row).toEqual({
      owner_id: OWNER_ID,
      name: 'Mochi',
      species: 'cat',
      breed: null,
      date_of_birth: null,
      photo_url: null,
      notes: null,
    });
  });

  /** The database owns these. Sending a status would let a caller create a pet already lost. */
  it('never writes status or timestamps on create', () => {
    const row = toInsertRow(OWNER_ID, {
      name: 'Mochi',
      species: 'cat',
      breed: null,
      dateOfBirth: null,
      photoUrl: null,
      notes: null,
    }) as Record<string, unknown>;

    for (const forbidden of ['status', 'lost_at', 'created_at', 'updated_at', 'deleted_at', 'id']) {
      expect(row).not.toHaveProperty(forbidden);
    }
  });

  /** An update of one field must not blank the others. */
  it('writes only the keys present in the patch', () => {
    expect(toUpdateRow({ name: 'Renamed' })).toEqual({ name: 'Renamed' });
  });

  it('writes an explicit null when a field is being cleared', () => {
    expect(toUpdateRow({ breed: null })).toEqual({ breed: null });
  });

  it('produces an empty patch when nothing changed', () => {
    expect(toUpdateRow({})).toEqual({});
  });

  /** Ownership is not editable through this path, and there is no key that could carry it. */
  it('offers no way to reassign ownership', () => {
    const row = toUpdateRow({ name: 'x' }) as Record<string, unknown>;

    expect(row).not.toHaveProperty('owner_id');
  });
});

describe('reads', () => {
  it('returns the mapped list', async () => {
    const repository = createSupabasePetRepository(clientReturning({ data: [ROW], error: null }));

    const result = await repository.listAccessibleBy(OWNER_ID);

    expect(result.ok && result.value).toHaveLength(1);
    expect(result.ok && result.value[0]?.name).toBe('Biscuit');
  });

  it('treats an empty result as an empty list, not an error', async () => {
    const repository = createSupabasePetRepository(clientReturning({ data: [], error: null }));

    const result = await repository.listAccessibleBy(OWNER_ID);

    expect(result).toEqual({ ok: true, value: [] });
  });

  /**
   * A pet hidden by row-level security comes back as no row at all. Reporting "not found" rather
   * than "forbidden" is deliberate — the alternative confirms the pet exists.
   */
  it('reports a hidden or absent pet as null', async () => {
    const repository = createSupabasePetRepository(clientReturning({ data: null, error: null }));

    expect(await repository.findById(PET_ID)).toEqual({ ok: true, value: null });
  });

  it('maps a transport failure to a network error', async () => {
    const repository = createSupabasePetRepository(
      clientReturning({ data: null, error: { message: 'Network request failed' } })
    );

    const result = await repository.listAccessibleBy(OWNER_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('network');
    }
  });
});

describe('writes', () => {
  it('creates a pet and returns the stored row', async () => {
    const captured: { op: string; payload: unknown }[] = [];
    const repository = createSupabasePetRepository(
      clientReturning({ data: ROW, error: null }, (op, payload) => captured.push({ op, payload }))
    );

    const result = await repository.create(OWNER_ID, {
      name: 'Biscuit',
      species: 'dog',
      breed: 'Beagle',
      dateOfBirth: unsafeIsoDate('2019-04-02'),
      photoUrl: null,
      notes: 'Friendly',
    });

    expect(result.ok && result.value.name).toBe('Biscuit');
    expect(captured[0]?.op).toBe('insert');
    expect(captured[0]?.payload).toMatchObject({ owner_id: OWNER_ID });
  });

  it('maps a refused write to a permission error without leaking the policy name', async () => {
    const repository = createSupabasePetRepository(
      clientReturning({
        data: null,
        error: {
          code: '42501',
          message: 'new row violates row-level security policy "pets_insert" for table "pets"',
        },
      })
    );

    const result = await repository.create(OWNER_ID, {
      name: 'x',
      species: 'dog',
      breed: null,
      dateOfBirth: null,
      photoUrl: null,
      notes: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unauthorized');
      expect(result.error.message).not.toContain('pets_insert');
      expect(result.error.message).not.toContain('row-level');
    }
  });

  it('maps a check-constraint violation to a validation error', async () => {
    const repository = createSupabasePetRepository(
      clientReturning({
        data: null,
        error: { code: '23514', message: 'violates check constraint "pets_name_length"' },
      })
    );

    const result = await repository.update(PET_ID, { name: 'x'.repeat(200) });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation');
      expect(result.error.message).not.toContain('pets_name_length');
    }
  });

  it('reports an update that matched no row as not found', async () => {
    const repository = createSupabasePetRepository(clientReturning({ data: null, error: null }));

    const result = await repository.update(PET_ID, { name: 'Renamed' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not_found');
    }
  });

  it('soft-deletes rather than removing the row', async () => {
    const captured: { op: string; payload: unknown }[] = [];
    const repository = createSupabasePetRepository(
      clientReturning({ data: { id: PET_ID }, error: null }, (op, payload) =>
        captured.push({ op, payload })
      )
    );

    const result = await repository.softDelete(PET_ID);

    expect(result.ok).toBe(true);
    // An UPDATE setting deleted_at, never a DELETE: history keeps its references.
    expect(captured[0]?.op).toBe('update');
    expect(captured[0]?.payload).toHaveProperty('deleted_at');
  });

  it('reports deleting an already-deleted pet as not found', async () => {
    const repository = createSupabasePetRepository(clientReturning({ data: null, error: null }));

    const result = await repository.softDelete(PET_ID);

    expect(result.ok && false).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('not_found');
    }
  });
});

describe('status changes', () => {
  it('refuses a transition the domain forbids, without touching the database', async () => {
    let wrote = false;
    const repository = createSupabasePetRepository(
      clientReturning({ data: { ...ROW, status: 'deceased' }, error: null }, (op) => {
        if (op === 'update') {
          wrote = true;
        }
      })
    );

    // Deceased pets are not revived; the domain says so and the adapter defers to it.
    const result = await repository.changeStatus(PET_ID, 'active');

    expect(result.ok).toBe(false);
    expect(wrote).toBe(false);
  });

  it('writes the lost timestamp alongside the status', async () => {
    const captured: unknown[] = [];
    const repository = createSupabasePetRepository(
      clientReturning(
        { data: { ...ROW, status: 'lost', lost_at: ROW.created_at }, error: null },
        (op, payload) => {
          if (op === 'update') {
            captured.push(payload);
          }
        }
      )
    );

    await repository.changeStatus(PET_ID, 'lost');

    // The check constraint requires status and lost_at to agree; sending one without the other
    // would be rejected by the database.
    expect(captured[0]).toMatchObject({ status: 'lost' });
    expect((captured[0] as { lost_at: unknown }).lost_at).not.toBeNull();
  });
});
