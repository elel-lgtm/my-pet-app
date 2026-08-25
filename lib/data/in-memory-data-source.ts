/**
 * An in-memory implementation of every data port.
 *
 * It exists for two reasons: it proves the ports in `ports.ts` are actually implementable, and it
 * lets feature logic and screens be built and tested before the backend exists. The constraints it
 * enforces — unique tracker serials, the safe-zone cap, one live share per pet and email — mirror
 * the database constraints described in DATABASE.md, so code written against this adapter meets the
 * same rules it will meet in production.
 *
 * **Development and test only.** It holds everything in a Map, forgets it on reload, and applies no
 * authorization. `accessiblePetIds` reproduces the *shape* of the intended RLS predicate so callers
 * see realistic results; it is a simulation of the boundary, not the boundary.
 */

import {
  DEFAULT_ALERT_SEVERITY,
  isOutstanding,
  transitionAlertStatus,
  type Alert,
  type AlertStatus,
  type RaiseAlertInput,
} from '@/lib/domain/alert';
import {
  systemClock,
  type AlertId,
  type Clock,
  type EntityId,
  type IsoDateTime,
  type PetId,
  type PetLocationId,
  type PetShareId,
  type ProfileId,
  type SafeZoneId,
  type TrackerId,
} from '@/lib/domain/ids';
import {
  parseRecordLocationInput,
  type PetLocation,
  type RecordLocationInput,
} from '@/lib/domain/location';
import {
  transitionPetStatus,
  type CreatePetInput,
  type Pet,
  type PetStatus,
  type UpdatePetInput,
} from '@/lib/domain/pet';
import {
  isShareEffective,
  transitionPetShareStatus,
  type InvitePetShareInput,
  type PetShare,
} from '@/lib/domain/pet-share';
import { type Profile, type UpdateProfileInput } from '@/lib/domain/profile';
import {
  MAX_SAFE_ZONES_PER_PET,
  type CreateSafeZoneInput,
  type SafeZone,
} from '@/lib/domain/safe-zone';
import { type RegisterTrackerInput, type Tracker } from '@/lib/domain/tracker';
import {
  type AlertQuery,
  type AppDataSource,
  type LocationHistoryQuery,
  type Query,
} from '@/lib/data/ports';
import { NotFoundError, ValidationError, type AppError } from '@/lib/errors';
import { err, ok } from '@/lib/result';

/**
 * Deterministic, UUID-shaped identifiers.
 *
 * Real UUIDs would make test failures unreadable. These satisfy the same format validation while
 * staying stable across runs: `00000000-0000-4000-8000-000000000001`.
 */
export function createIdFactory(): <Id extends EntityId>() => Id {
  let counter = 0;
  return <Id extends EntityId>(): Id => {
    counter += 1;
    return `00000000-0000-4000-8000-${counter.toString().padStart(12, '0')}` as Id;
  };
}

export type InMemorySeed = {
  readonly profiles?: readonly Profile[] | undefined;
  readonly pets?: readonly Pet[] | undefined;
  readonly trackers?: readonly Tracker[] | undefined;
  readonly locations?: readonly PetLocation[] | undefined;
  readonly safeZones?: readonly SafeZone[] | undefined;
  readonly alerts?: readonly Alert[] | undefined;
  readonly petShares?: readonly PetShare[] | undefined;
};

export type InMemoryOptions = {
  readonly clock?: Clock | undefined;
  readonly seed?: InMemorySeed | undefined;
};

function notFound(entity: string, id: string): AppError {
  return new NotFoundError(`No ${entity} with id ${id}.`, { context: { entity, id } });
}

function indexBy<T extends { readonly id: string }>(
  rows: readonly T[] | undefined
): Map<string, T> {
  return new Map((rows ?? []).map((row) => [row.id, row]));
}

export function createInMemoryDataSource(options: InMemoryOptions = {}): AppDataSource {
  const clock = options.clock ?? systemClock;
  const nextId = createIdFactory();

  const profiles = indexBy(options.seed?.profiles);
  const pets = indexBy(options.seed?.pets);
  const trackers = indexBy(options.seed?.trackers);
  const safeZones = indexBy(options.seed?.safeZones);
  const alerts = indexBy(options.seed?.alerts);
  const petShares = indexBy(options.seed?.petShares);
  const locations: PetLocation[] = [...(options.seed?.locations ?? [])];

  /** Mirrors the intended RLS predicate: own it, or hold an effective share for it. */
  function accessiblePetIds(viewerId: ProfileId, now: IsoDateTime): Set<string> {
    const owned = [...pets.values()]
      .filter((pet) => pet.ownerId === viewerId && pet.deletedAt === null)
      .map((pet) => pet.id as string);

    const shared = [...petShares.values()]
      .filter((share) => share.caregiverId === viewerId && isShareEffective(share, now))
      .map((share) => share.petId as string)
      .filter((petId) => pets.get(petId)?.deletedAt === null);

    return new Set([...owned, ...shared]);
  }

  return {
    profiles: {
      async findById(id: ProfileId): Query<Profile | null> {
        return ok(profiles.get(id) ?? null);
      },

      async findByEmail(email: string): Query<Profile | null> {
        const normalised = email.trim().toLowerCase();
        return ok([...profiles.values()].find((profile) => profile.email === normalised) ?? null);
      },

      async update(id: ProfileId, input: UpdateProfileInput): Query<Profile> {
        const existing = profiles.get(id);
        if (!existing) {
          return err(notFound('profile', id));
        }
        const updated: Profile = {
          ...existing,
          displayName: input.displayName,
          avatarUrl: input.avatarUrl ?? existing.avatarUrl,
          updatedAt: clock(),
        };
        profiles.set(id, updated);
        return ok(updated);
      },
    },

    pets: {
      async listAccessibleBy(viewerId: ProfileId): Query<readonly Pet[]> {
        const allowed = accessiblePetIds(viewerId, clock());
        return ok([...pets.values()].filter((pet) => allowed.has(pet.id)));
      },

      async findById(id: PetId): Query<Pet | null> {
        const pet = pets.get(id);
        return ok(pet && pet.deletedAt === null ? pet : null);
      },

      async create(ownerId: ProfileId, input: CreatePetInput): Query<Pet> {
        const at = clock();
        const pet: Pet = {
          id: nextId<PetId>(),
          ownerId,
          name: input.name,
          species: input.species,
          breed: input.breed,
          dateOfBirth: input.dateOfBirth,
          photoUrl: input.photoUrl,
          notes: input.notes,
          status: 'active',
          lostAt: null,
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
        };
        pets.set(pet.id, pet);
        return ok(pet);
      },

      async update(id: PetId, input: UpdatePetInput): Query<Pet> {
        const existing = pets.get(id);
        if (!existing || existing.deletedAt !== null) {
          return err(notFound('pet', id));
        }
        const updated: Pet = { ...existing, ...input, updatedAt: clock() };
        pets.set(id, updated);
        return ok(updated);
      },

      async changeStatus(id: PetId, status: PetStatus): Query<Pet> {
        const existing = pets.get(id);
        if (!existing || existing.deletedAt !== null) {
          return err(notFound('pet', id));
        }
        const transitioned = transitionPetStatus(existing, status, clock());
        if (!transitioned.ok) {
          return transitioned;
        }
        pets.set(id, transitioned.value);
        return ok(transitioned.value);
      },

      async softDelete(id: PetId): Query<void> {
        const existing = pets.get(id);
        if (!existing || existing.deletedAt !== null) {
          return err(notFound('pet', id));
        }
        const at = clock();
        pets.set(id, { ...existing, deletedAt: at, updatedAt: at });
        return ok(undefined);
      },
    },

    trackers: {
      async listForOwner(ownerId: ProfileId): Query<readonly Tracker[]> {
        return ok([...trackers.values()].filter((tracker) => tracker.ownerId === ownerId));
      },

      async findById(id: TrackerId): Query<Tracker | null> {
        return ok(trackers.get(id) ?? null);
      },

      async register(ownerId: ProfileId, input: RegisterTrackerInput): Query<Tracker> {
        const duplicate = [...trackers.values()].some(
          (tracker) => tracker.serialNumber === input.serialNumber
        );
        if (duplicate) {
          return err(
            new ValidationError('That tracker is already registered.', {
              context: { serialNumber: input.serialNumber },
            })
          );
        }
        const at = clock();
        const tracker: Tracker = {
          id: nextId<TrackerId>(),
          ownerId,
          petId: input.petId,
          serialNumber: input.serialNumber,
          label: input.label,
          status: 'active',
          batteryPercent: null,
          firmwareVersion: null,
          lastSeenAt: null,
          createdAt: at,
          updatedAt: at,
        };
        trackers.set(tracker.id, tracker);
        return ok(tracker);
      },

      async assignToPet(id: TrackerId, petId: PetId | null): Query<Tracker> {
        const existing = trackers.get(id);
        if (!existing) {
          return err(notFound('tracker', id));
        }
        if (petId !== null && !pets.has(petId)) {
          return err(notFound('pet', petId));
        }
        const updated: Tracker = { ...existing, petId, updatedAt: clock() };
        trackers.set(id, updated);
        return ok(updated);
      },

      async recordHeartbeat(id, heartbeat): Query<Tracker> {
        const existing = trackers.get(id);
        if (!existing) {
          return err(notFound('tracker', id));
        }
        const updated: Tracker = {
          ...existing,
          batteryPercent: heartbeat.batteryPercent,
          firmwareVersion: heartbeat.firmwareVersion,
          lastSeenAt: heartbeat.seenAt,
          updatedAt: clock(),
        };
        trackers.set(id, updated);
        return ok(updated);
      },
    },

    locations: {
      async latestForPet(petId: PetId): Query<PetLocation | null> {
        const forPet = locations
          .filter((location) => location.petId === petId)
          .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
        return ok(forPet[0] ?? null);
      },

      async historyForPet(
        petId: PetId,
        range: LocationHistoryQuery
      ): Query<readonly PetLocation[]> {
        const from = Date.parse(range.from);
        const to = Date.parse(range.to);
        if (from > to) {
          return err(new ValidationError('History range starts after it ends.'));
        }

        const window = locations
          .filter((location) => {
            if (location.petId !== petId) {
              return false;
            }
            const at = Date.parse(location.recordedAt);
            return at >= from && at <= to;
          })
          .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));

        return ok(range.limit === undefined ? window : window.slice(0, range.limit));
      },

      async record(input: RecordLocationInput): Query<PetLocation> {
        // Re-validated here: a fix may arrive from a device, not only from our own UI.
        const parsed = parseRecordLocationInput(input);
        if (!parsed.ok) {
          return parsed;
        }
        if (!pets.has(parsed.value.petId)) {
          return err(notFound('pet', parsed.value.petId));
        }
        const location: PetLocation = {
          id: nextId<PetLocationId>(),
          ...parsed.value,
          createdAt: clock(),
        };
        locations.push(location);
        return ok(location);
      },
    },

    safeZones: {
      async listForPet(petId: PetId): Query<readonly SafeZone[]> {
        return ok([...safeZones.values()].filter((zone) => zone.petId === petId));
      },

      async findById(id: SafeZoneId): Query<SafeZone | null> {
        return ok(safeZones.get(id) ?? null);
      },

      async create(input: CreateSafeZoneInput): Query<SafeZone> {
        if (!pets.has(input.petId)) {
          return err(notFound('pet', input.petId));
        }
        const active = [...safeZones.values()].filter(
          (zone) => zone.petId === input.petId && zone.isActive
        );
        if (active.length >= MAX_SAFE_ZONES_PER_PET) {
          return err(
            new ValidationError(
              `A pet can have at most ${MAX_SAFE_ZONES_PER_PET} active safe zones.`,
              { context: { petId: input.petId } }
            )
          );
        }
        const at = clock();
        const zone: SafeZone = {
          id: nextId<SafeZoneId>(),
          petId: input.petId,
          name: input.name,
          center: input.center,
          radiusMeters: input.radiusMeters,
          isActive: true,
          notifyOnExit: input.notifyOnExit,
          notifyOnEntry: input.notifyOnEntry,
          createdAt: at,
          updatedAt: at,
        };
        safeZones.set(zone.id, zone);
        return ok(zone);
      },

      async setActive(id: SafeZoneId, isActive: boolean): Query<SafeZone> {
        const existing = safeZones.get(id);
        if (!existing) {
          return err(notFound('safe zone', id));
        }
        const updated: SafeZone = { ...existing, isActive, updatedAt: clock() };
        safeZones.set(id, updated);
        return ok(updated);
      },

      async remove(id: SafeZoneId): Query<void> {
        if (!safeZones.delete(id)) {
          return err(notFound('safe zone', id));
        }
        return ok(undefined);
      },
    },

    alerts: {
      async listForPet(petId: PetId, query?: AlertQuery): Query<readonly Alert[]> {
        const matching = [...alerts.values()]
          .filter((alert) => alert.petId === petId)
          .filter((alert) => query?.status === undefined || alert.status === query.status)
          .sort((a, b) => Date.parse(b.raisedAt) - Date.parse(a.raisedAt));

        return ok(query?.limit === undefined ? matching : matching.slice(0, query.limit));
      },

      async listOutstandingFor(viewerId: ProfileId): Query<readonly Alert[]> {
        const allowed = accessiblePetIds(viewerId, clock());
        return ok(
          [...alerts.values()]
            .filter((alert) => allowed.has(alert.petId) && isOutstanding(alert))
            .sort((a, b) => Date.parse(b.raisedAt) - Date.parse(a.raisedAt))
        );
      },

      async findById(id: AlertId): Query<Alert | null> {
        return ok(alerts.get(id) ?? null);
      },

      async raise(input: RaiseAlertInput): Query<Alert> {
        if (!pets.has(input.petId)) {
          return err(notFound('pet', input.petId));
        }
        const at = clock();
        const alert: Alert = {
          id: nextId<AlertId>(),
          petId: input.petId,
          trackerId: input.trackerId,
          safeZoneId: input.safeZoneId,
          kind: input.kind,
          severity: DEFAULT_ALERT_SEVERITY[input.kind],
          status: 'open',
          coordinates: input.coordinates,
          message: input.message,
          raisedAt: input.raisedAt,
          acknowledgedAt: null,
          acknowledgedBy: null,
          resolvedAt: null,
          createdAt: at,
          updatedAt: at,
        };
        alerts.set(alert.id, alert);
        return ok(alert);
      },

      async changeStatus(id: AlertId, status: AlertStatus, by: ProfileId): Query<Alert> {
        const existing = alerts.get(id);
        if (!existing) {
          return err(notFound('alert', id));
        }
        const transitioned = transitionAlertStatus(existing, status, by, clock());
        if (!transitioned.ok) {
          return transitioned;
        }
        alerts.set(id, transitioned.value);
        return ok(transitioned.value);
      },
    },

    petShares: {
      async listForPet(petId: PetId): Query<readonly PetShare[]> {
        return ok([...petShares.values()].filter((share) => share.petId === petId));
      },

      async listForCaregiver(caregiverId: ProfileId): Query<readonly PetShare[]> {
        return ok([...petShares.values()].filter((share) => share.caregiverId === caregiverId));
      },

      async invite(grantedBy: ProfileId, input: InvitePetShareInput): Query<PetShare> {
        const pet = pets.get(input.petId);
        if (!pet || pet.deletedAt !== null) {
          return err(notFound('pet', input.petId));
        }
        const alreadyLive = [...petShares.values()].some(
          (share) =>
            share.petId === input.petId &&
            share.invitedEmail === input.invitedEmail &&
            (share.status === 'pending' || share.status === 'accepted')
        );
        if (alreadyLive) {
          return err(
            new ValidationError('That person already has access to this pet.', {
              context: { petId: input.petId },
            })
          );
        }
        const at = clock();
        const share: PetShare = {
          id: nextId<PetShareId>(),
          petId: input.petId,
          grantedBy,
          caregiverId: null,
          invitedEmail: input.invitedEmail,
          permissions: input.permissions,
          status: 'pending',
          expiresAt: input.expiresAt,
          invitedAt: at,
          respondedAt: null,
          revokedAt: null,
          createdAt: at,
          updatedAt: at,
        };
        petShares.set(share.id, share);
        return ok(share);
      },

      async accept(id: PetShareId, caregiverId: ProfileId): Query<PetShare> {
        const existing = petShares.get(id);
        if (!existing) {
          return err(notFound('pet share', id));
        }
        const transitioned = transitionPetShareStatus(existing, 'accepted', clock(), caregiverId);
        if (!transitioned.ok) {
          return transitioned;
        }
        petShares.set(id, transitioned.value);
        return ok(transitioned.value);
      },

      async revoke(id: PetShareId): Query<PetShare> {
        const existing = petShares.get(id);
        if (!existing) {
          return err(notFound('pet share', id));
        }
        const transitioned = transitionPetShareStatus(existing, 'revoked', clock());
        if (!transitioned.ok) {
          return transitioned;
        }
        petShares.set(id, transitioned.value);
        return ok(transitioned.value);
      },
    },
  };
}
