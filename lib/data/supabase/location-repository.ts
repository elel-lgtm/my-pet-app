/**
 * The Supabase implementation of `LocationRepository`.
 *
 * Reads only, in practice. `pet_locations` has a SELECT policy and **no INSERT policy**, so the
 * database refuses every write that arrives with an end user's JWT. That is deliberate and is the
 * single most important security property of the tracking feature:
 *
 *   A client that can write its own pet's location can forge a safe-zone breach, and every alert
 *   downstream inherits the lie.
 *
 * `record` is still implemented rather than stubbed or removed, for two reasons. The port is shared
 * with the in-memory source, which genuinely records. And when a client does attempt a write, the
 * refusal should travel back through the same error mapping as anything else — a reviewed
 * "you do not have permission" — instead of a thrown `NotImplemented` that no screen knows how to
 * render.
 *
 * Production ingestion is a **server-side boundary that does not exist yet**; see ARCHITECTURE.md.
 * It will hold the privileged key, which must never reach this process.
 */

import { toDatabaseError, type ProviderDatabaseError } from '@/lib/data/supabase/postgrest-errors';
import { toIsoDateTime, unsafeIdOrNull } from '@/lib/data/supabase/row-mapping';
import { type LocationHistoryQuery, type LocationRepository, type Query } from '@/lib/data/ports';
import { unsafeId, type PetId, type PetLocationId, type TrackerId } from '@/lib/domain/ids';
import {
  type LocationSource,
  type PetLocation,
  type RecordLocationInput,
} from '@/lib/domain/location';
import { type AppSupabaseClient } from '@/lib/supabase';
import { type Database } from '@/lib/supabase/database.types';
import { type AppError } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';

type LocationRow = Database['public']['Tables']['pet_locations']['Row'];

const LOCATION_COLUMNS =
  'id, pet_id, tracker_id, latitude, longitude, accuracy_meters, speed_mps, source, recorded_at, created_at';

/**
 * Row → domain.
 *
 * The two flat coordinate columns become the nested `Coordinates` the domain uses. That shape
 * difference is the reason this translation exists in one place rather than at every call site.
 */
export function toPetLocation(row: LocationRow): PetLocation {
  return {
    id: unsafeId<PetLocationId>(row.id),
    petId: unsafeId<PetId>(row.pet_id),
    trackerId: unsafeIdOrNull<TrackerId>(row.tracker_id),
    coordinates: { latitude: row.latitude, longitude: row.longitude },
    accuracyMeters: row.accuracy_meters,
    speedMetersPerSecond: row.speed_mps,
    source: row.source as LocationSource,
    recordedAt: toIsoDateTime(row.recorded_at),
    createdAt: toIsoDateTime(row.created_at),
  };
}

function failure<T>(error: ProviderDatabaseError, operation: string): Result<T, AppError> {
  return err(toDatabaseError(error, operation));
}

/** Guards against pulling an unbounded history into memory to draw one route. */
const DEFAULT_HISTORY_LIMIT = 500;

export function createSupabaseLocationRepository(client: AppSupabaseClient): LocationRepository {
  return {
    /**
     * The newest fix by `recordedAt`.
     *
     * Ordered by the time the position was *taken*, not the time it arrived: a tracker that loses
     * connectivity buffers fixes and uploads them late, so `created_at` order would hand back a
     * position the pet had already left. Served by `pet_locations_pet_recorded_idx`.
     */
    async latestForPet(petId: PetId): Query<PetLocation | null> {
      const { data, error } = await client
        .from('pet_locations')
        .select(LOCATION_COLUMNS)
        .eq('pet_id', petId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        return failure(error, 'latestForPet');
      }
      return ok(data === null ? null : toPetLocation(data));
    },

    /** Oldest to newest, so the result draws as a path without re-sorting. */
    async historyForPet(petId: PetId, range: LocationHistoryQuery): Query<readonly PetLocation[]> {
      const { data, error } = await client
        .from('pet_locations')
        .select(LOCATION_COLUMNS)
        .eq('pet_id', petId)
        .gte('recorded_at', range.from)
        .lte('recorded_at', range.to)
        .order('recorded_at', { ascending: true })
        .limit(range.limit ?? DEFAULT_HISTORY_LIMIT);

      if (error) {
        return failure(error, 'historyForPet');
      }
      return ok((data ?? []).map(toPetLocation));
    },

    /**
     * Refused by the database for any end-user session, by design. See the module note.
     */
    async record(input: RecordLocationInput): Query<PetLocation> {
      const { data, error } = await client
        .from('pet_locations')
        .insert({
          pet_id: input.petId,
          tracker_id: input.trackerId,
          latitude: input.coordinates.latitude,
          longitude: input.coordinates.longitude,
          accuracy_meters: input.accuracyMeters,
          speed_mps: input.speedMetersPerSecond,
          source: input.source,
          recorded_at: input.recordedAt,
        })
        .select(LOCATION_COLUMNS)
        .single();

      if (error) {
        return failure(error, 'record');
      }
      return ok(toPetLocation(data));
    },
  };
}
