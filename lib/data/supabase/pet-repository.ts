/**
 * The Supabase implementation of `PetRepository`.
 *
 * Translation lives here and nowhere else: snake_case rows in, domain entities out. Nothing above
 * this module names a database column, which is what lets the schema and the domain evolve
 * separately.
 *
 * **This module enforces no authorization.** Every query is scoped by row-level security evaluated
 * against the caller's session: a pet belonging to someone else does not come back, and a write to
 * one is refused by the database. There is deliberately no `where owner_id = …` filter added for
 * safety — an adapter that filtered defensively would hide a missing policy rather than expose it.
 */

import {
  notFoundError,
  toDatabaseError,
  type ProviderDatabaseError,
} from '@/lib/data/supabase/postgrest-errors';
import { type PetRepository, type Query } from '@/lib/data/ports';
import {
  transitionPetStatus,
  type CreatePetInput,
  type Pet,
  type PetSpecies,
  type PetStatus,
  type UpdatePetInput,
} from '@/lib/domain/pet';
import {
  unsafeId,
  unsafeIsoDate,
  unsafeIsoDateTime,
  type IsoDate,
  type IsoDateTime,
  type PetId,
  type ProfileId,
} from '@/lib/domain/ids';
import { type AppSupabaseClient } from '@/lib/supabase';
import { type Database } from '@/lib/supabase/database.types';
import { type AppError } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';
import { logger } from '@/lib/logger';

const log = logger.child('data:pets');

type PetRow = Database['public']['Tables']['pets']['Row'];
type PetInsert = Database['public']['Tables']['pets']['Insert'];
type PetUpdate = Database['public']['Tables']['pets']['Update'];

/** Every column the domain needs. Named explicitly so a schema addition cannot silently widen it. */
const PET_COLUMNS =
  'id, owner_id, name, species, breed, date_of_birth, photo_url, notes, status, lost_at, created_at, updated_at, deleted_at';

/**
 * Normalises a PostgreSQL timestamp to the exact ISO form `IsoDateTime` promises.
 *
 * PostgREST emits RFC 3339 with **microsecond** precision and a full offset, e.g.
 * `2026-08-25T21:30:27.358632+00:00`. That is close to the domain's format but not equal to it:
 * `isIsoDateTime` requires a millisecond `Z` form, so passing the raw value through would make the
 * branded type a lie the moment anything checked it.
 *
 * An unparseable value is returned as-is rather than thrown on. This mapper runs inside render
 * paths, and a `RangeError` from a date would take a screen down over a field nothing was about to
 * display.
 */
function toIsoDateTime(value: string): IsoDateTime {
  const parsed = new Date(value);
  return unsafeIsoDateTime(Number.isNaN(parsed.getTime()) ? value : parsed.toISOString());
}

function toOptionalIsoDateTime(value: string | null): IsoDateTime | null {
  return value === null ? null : toIsoDateTime(value);
}

/** `date` columns come back as `YYYY-MM-DD`, which is already the shape `IsoDate` wants. */
function toOptionalIsoDate(value: string | null): IsoDate | null {
  return value === null ? null : unsafeIsoDate(value.slice(0, 10));
}

/** Row → domain. The one place a column name meets a domain field name. */
export function toPet(row: PetRow): Pet {
  return {
    id: unsafeId<PetId>(row.id),
    ownerId: unsafeId<ProfileId>(row.owner_id),
    name: row.name,
    species: row.species as PetSpecies,
    breed: row.breed,
    dateOfBirth: toOptionalIsoDate(row.date_of_birth),
    photoUrl: row.photo_url,
    notes: row.notes,
    status: row.status as PetStatus,
    lostAt: toOptionalIsoDateTime(row.lost_at),
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
    deletedAt: toOptionalIsoDateTime(row.deleted_at),
  };
}

/**
 * Domain → row, for a new pet.
 *
 * `status`, `created_at`, `updated_at`, and `deleted_at` are deliberately omitted: the database
 * owns them. Sending `status` would let a caller create a pet already marked lost, with no
 * `lost_at` to match, which the check constraint would reject anyway.
 */
export function toInsertRow(ownerId: ProfileId, input: CreatePetInput): PetInsert {
  return {
    owner_id: ownerId,
    name: input.name,
    species: input.species,
    breed: input.breed,
    date_of_birth: input.dateOfBirth,
    photo_url: input.photoUrl,
    notes: input.notes,
  };
}

/**
 * Domain → row, for an edit.
 *
 * Only keys actually present in the patch are written, so an update of one field cannot blank the
 * others. `owner_id` is absent by construction: ownership is not editable through this path, and
 * the update policy's `with check` would refuse it in any case.
 */
export function toUpdateRow(input: UpdatePetInput): PetUpdate {
  const row: PetUpdate = {};
  if (input.name !== undefined) {
    row.name = input.name;
  }
  if (input.species !== undefined) {
    row.species = input.species;
  }
  if (input.breed !== undefined) {
    row.breed = input.breed;
  }
  if (input.dateOfBirth !== undefined) {
    row.date_of_birth = input.dateOfBirth;
  }
  if (input.photoUrl !== undefined) {
    row.photo_url = input.photoUrl;
  }
  if (input.notes !== undefined) {
    row.notes = input.notes;
  }
  return row;
}

function failure<T>(error: ProviderDatabaseError, operation: string): Result<T, AppError> {
  return err(toDatabaseError(error, operation));
}

export function createSupabasePetRepository(client: AppSupabaseClient): PetRepository {
  return {
    /**
     * Pets the caller may see.
     *
     * No owner filter is applied. `pets_select` already resolves ownership *and* effective shares
     * through `can_read_pet`, and duplicating that here would produce a second, divergent copy of
     * the access rule — the one that gets forgotten when sharing changes.
     */
    async listAccessibleBy(viewerId: ProfileId): Query<readonly Pet[]> {
      log.debug('Listing pets', { viewerId });

      const { data, error } = await client
        .from('pets')
        .select(PET_COLUMNS)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        return failure(error, 'listAccessibleBy');
      }
      return ok((data ?? []).map(toPet));
    },

    async findById(id: PetId): Query<Pet | null> {
      const { data, error } = await client
        .from('pets')
        .select(PET_COLUMNS)
        .eq('id', id)
        .is('deleted_at', null)
        // `maybeSingle` rather than `single`: a row hidden by policy is absent, not an error.
        .maybeSingle();

      if (error) {
        return failure(error, 'findById');
      }
      return ok(data === null ? null : toPet(data));
    },

    async create(ownerId: ProfileId, input: CreatePetInput): Query<Pet> {
      const { data, error } = await client
        .from('pets')
        .insert(toInsertRow(ownerId, input))
        .select(PET_COLUMNS)
        .single();

      if (error) {
        return failure(error, 'create');
      }
      return ok(toPet(data));
    },

    async update(id: PetId, input: UpdatePetInput): Query<Pet> {
      const patch = toUpdateRow(input);

      // An empty patch would produce an UPDATE with no SET clause, which PostgREST rejects with a
      // message about syntax. Returning the pet unchanged is both cheaper and more truthful.
      if (Object.keys(patch).length === 0) {
        return this.findById(id).then((result) =>
          result.ok && result.value === null
            ? err(notFoundError('pet', 'update'))
            : (result as Result<Pet, AppError>)
        );
      }

      const { data, error } = await client
        .from('pets')
        .update(patch)
        .eq('id', id)
        .is('deleted_at', null)
        .select(PET_COLUMNS)
        .maybeSingle();

      if (error) {
        return failure(error, 'update');
      }
      // No row came back: it does not exist, or the policy hid it. Both are "not found" here.
      return data === null ? err(notFoundError('pet', 'update')) : ok(toPet(data));
    },

    /**
     * Applies a status change through the domain, so the transition rules and the `lost_at`
     * invariant are enforced in one place rather than restated in SQL.
     *
     * The read-then-write is not a transaction. That is acceptable because the only writer is the
     * owner, and the database's own check constraint is the backstop if two changes race: a status
     * of `lost` without a matching `lost_at` cannot be stored whatever order the writes arrive in.
     */
    async changeStatus(id: PetId, status: PetStatus): Query<Pet> {
      const current = await this.findById(id);
      if (!current.ok) {
        return current;
      }
      if (current.value === null) {
        return err(notFoundError('pet', 'changeStatus'));
      }

      const transitioned = transitionPetStatus(
        current.value,
        status,
        toIsoDateTime(new Date().toISOString())
      );
      if (!transitioned.ok) {
        return transitioned;
      }

      const { data, error } = await client
        .from('pets')
        .update({ status, lost_at: transitioned.value.lostAt })
        .eq('id', id)
        .is('deleted_at', null)
        .select(PET_COLUMNS)
        .maybeSingle();

      if (error) {
        return failure(error, 'changeStatus');
      }
      return data === null ? err(notFoundError('pet', 'changeStatus')) : ok(toPet(data));
    },

    /**
     * Soft delete.
     *
     * The row stays, so location history and alerts keep their references, but `pets_select` and
     * `pets_update` both require `deleted_at is null` — which means this is not reversible through
     * the API. It is a safeguard against losing history, not a user-facing wastebasket. Reversible
     * removal is `changeStatus(id, 'archived')`.
     */
    async softDelete(id: PetId): Query<void> {
      const { data, error } = await client
        .from('pets')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .is('deleted_at', null)
        .select('id')
        .maybeSingle();

      if (error) {
        return failure(error, 'softDelete');
      }
      return data === null ? err(notFoundError('pet', 'softDelete')) : ok(undefined);
    },
  };
}
