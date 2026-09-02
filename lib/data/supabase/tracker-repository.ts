/**
 * The Supabase implementation of `TrackerRepository`.
 *
 * Translation only: snake_case rows in, domain entities out. No authorization decisions are made
 * here — `trackers_select` scopes reads to the owner and to caregivers of the pet wearing the
 * device, and the write policies restrict every change to the owner.
 *
 * **The cross-owner assignment invariant is not enforced in this file, deliberately.** It is
 * structural: `trackers` carries a composite foreign key `(pet_id, owner_id) → pets (id, owner_id)`,
 * so pointing a device at another account's pet is unrepresentable regardless of what this adapter
 * sends. A defensive check here would be a second, weaker copy of that rule.
 */

import {
  notFoundError,
  toDatabaseError,
  type ProviderDatabaseError,
} from '@/lib/data/supabase/postgrest-errors';
import { type Query, type TrackerRepository } from '@/lib/data/ports';
import { type IsoDateTime, type PetId, type ProfileId, type TrackerId } from '@/lib/domain/ids';
import { type RegisterTrackerInput, type Tracker, type TrackerStatus } from '@/lib/domain/tracker';
import { type AppSupabaseClient } from '@/lib/supabase';
import { type Database } from '@/lib/supabase/database.types';
import { type AppError } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';
import {
  toIsoDateTime,
  toOptionalIsoDateTime,
  unsafeIdOrNull,
} from '@/lib/data/supabase/row-mapping';
import { unsafeId } from '@/lib/domain/ids';

type TrackerRow = Database['public']['Tables']['trackers']['Row'];

const TRACKER_COLUMNS =
  'id, owner_id, pet_id, serial_number, label, status, battery_percent, firmware_version, last_seen_at, created_at, updated_at';

/** Row → domain. The one place a tracker column name meets a domain field name. */
export function toTracker(row: TrackerRow): Tracker {
  return {
    id: unsafeId<TrackerId>(row.id),
    ownerId: unsafeId<ProfileId>(row.owner_id),
    petId: unsafeIdOrNull<PetId>(row.pet_id),
    serialNumber: row.serial_number,
    label: row.label,
    status: row.status as TrackerStatus,
    batteryPercent: row.battery_percent,
    firmwareVersion: row.firmware_version,
    lastSeenAt: toOptionalIsoDateTime(row.last_seen_at),
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  };
}

function failure<T>(error: ProviderDatabaseError, operation: string): Result<T, AppError> {
  return err(toDatabaseError(error, operation));
}

export function createSupabaseTrackerRepository(client: AppSupabaseClient): TrackerRepository {
  return {
    async listForOwner(ownerId: ProfileId): Query<readonly Tracker[]> {
      const { data, error } = await client
        .from('trackers')
        .select(TRACKER_COLUMNS)
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false });

      if (error) {
        return failure(error, 'listForOwner');
      }
      return ok((data ?? []).map(toTracker));
    },

    async findById(id: TrackerId): Query<Tracker | null> {
      const { data, error } = await client
        .from('trackers')
        .select(TRACKER_COLUMNS)
        .eq('id', id)
        .maybeSingle();

      if (error) {
        return failure(error, 'findById');
      }
      return ok(data === null ? null : toTracker(data));
    },

    /**
     * The device on a pet. Returns null when the pet has none, or when the caller may not see it —
     * `trackers_select` decides which, and both look the same from here on purpose.
     */
    async findForPet(petId: PetId): Query<Tracker | null> {
      const { data, error } = await client
        .from('trackers')
        .select(TRACKER_COLUMNS)
        .eq('pet_id', petId)
        .maybeSingle();

      if (error) {
        return failure(error, 'findForPet');
      }
      return ok(data === null ? null : toTracker(data));
    },

    async register(ownerId: ProfileId, input: RegisterTrackerInput): Query<Tracker> {
      const { data, error } = await client
        .from('trackers')
        .insert({
          owner_id: ownerId,
          serial_number: input.serialNumber,
          label: input.label,
          pet_id: input.petId,
        })
        .select(TRACKER_COLUMNS)
        .single();

      if (error) {
        return failure(error, 'register');
      }
      return ok(toTracker(data));
    },

    /**
     * Assign or unassign. `null` detaches the device without retiring it, which is the ordinary
     * case when a collar moves between pets.
     */
    async assignToPet(id: TrackerId, petId: PetId | null): Query<Tracker> {
      const { data, error } = await client
        .from('trackers')
        .update({ pet_id: petId })
        .eq('id', id)
        .select(TRACKER_COLUMNS)
        .maybeSingle();

      if (error) {
        return failure(error, 'assignToPet');
      }
      return data === null ? err(notFoundError('tracker', 'assignToPet')) : ok(toTracker(data));
    },

    /**
     * Records a check-in.
     *
     * In production this is a **server-side** call: a device reports to an ingestion endpoint that
     * writes with elevated rights. The method exists on the port because the in-memory source and
     * that future server both implement it. From the mobile client the write is restricted by
     * `trackers_update` to the device's own owner, which is correct but is not how real hardware
     * will report.
     */
    async recordHeartbeat(
      id: TrackerId,
      heartbeat: {
        readonly batteryPercent: number | null;
        readonly firmwareVersion: string | null;
        readonly seenAt: IsoDateTime;
      }
    ): Query<Tracker> {
      const { data, error } = await client
        .from('trackers')
        .update({
          battery_percent: heartbeat.batteryPercent,
          firmware_version: heartbeat.firmwareVersion,
          last_seen_at: heartbeat.seenAt,
        })
        .eq('id', id)
        .select(TRACKER_COLUMNS)
        .maybeSingle();

      if (error) {
        return failure(error, 'recordHeartbeat');
      }
      return data === null ? err(notFoundError('tracker', 'recordHeartbeat')) : ok(toTracker(data));
    },
  };
}
