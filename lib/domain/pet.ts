/**
 * A pet: the entity everything else in the product hangs off.
 *
 * Ownership is a single `ownerId`. Access by anyone else is granted explicitly through a
 * `PetShare` and never inferred — see `@/lib/domain/access` and the RLS section of DATABASE.md.
 */

import { type IsoDate, type IsoDateTime, type PetId, type ProfileId } from '@/lib/domain/ids';
import { Validation } from '@/lib/domain/validation';
import { ValidationError } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';

export const PET_SPECIES = ['dog', 'cat', 'rabbit', 'bird', 'other'] as const;
export type PetSpecies = (typeof PET_SPECIES)[number];

/**
 * Where a pet is in its lifecycle.
 *
 * `lost` is a first-class status rather than a separate report entity: it is what the map, the
 * alert rules, and the pet list all branch on, and duplicating it in two places invites the two
 * to disagree.
 */
export const PET_STATUSES = ['active', 'lost', 'deceased', 'archived'] as const;
export type PetStatus = (typeof PET_STATUSES)[number];

export type Pet = {
  readonly id: PetId;
  readonly ownerId: ProfileId;
  readonly name: string;
  readonly species: PetSpecies;
  readonly breed: string | null;
  readonly dateOfBirth: IsoDate | null;
  readonly photoUrl: string | null;
  readonly notes: string | null;
  readonly status: PetStatus;
  /** Set when the pet is marked lost, cleared when found. Drives "missing since" copy. */
  readonly lostAt: IsoDateTime | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  /** Soft deletion: location history and alerts stay referentially intact. See DATABASE.md. */
  readonly deletedAt: IsoDateTime | null;
};

export const PET_NAME_MAX = 60;
export const PET_BREED_MAX = 80;
export const PET_NOTES_MAX = 2000;

export type CreatePetInput = {
  readonly name: string;
  readonly species: PetSpecies;
  readonly breed: string | null;
  readonly dateOfBirth: IsoDate | null;
  readonly photoUrl: string | null;
  readonly notes: string | null;
};

export type UpdatePetInput = Partial<CreatePetInput>;

export function parseCreatePetInput(input: unknown): Result<CreatePetInput, ValidationError> {
  const v = new Validation();
  const raw = (input ?? {}) as Record<string, unknown>;

  const name = v.text('name', raw.name, { min: 1, max: PET_NAME_MAX });
  const species = v.enum('species', raw.species, PET_SPECIES);
  const breed = v.optionalText('breed', raw.breed, { max: PET_BREED_MAX });
  const dateOfBirth = v.optionalIsoDate('dateOfBirth', raw.dateOfBirth);
  const photoUrl = v.optionalText('photoUrl', raw.photoUrl, { max: 2048 });
  const notes = v.optionalText('notes', raw.notes, { max: PET_NOTES_MAX });

  if (dateOfBirth !== null && dateOfBirth > new Date().toISOString().slice(0, 10)) {
    v.reject('dateOfBirth', 'cannot be in the future');
  }

  return v.result(() => ({ name, species, breed, dateOfBirth, photoUrl, notes }));
}

/**
 * Which status changes are legal.
 *
 * The one-way edge worth noting: nothing leaves `deceased` except archival. Reviving a deceased
 * pet is far more likely to be a mistaken tap than a real intention, and the recovery — recreate
 * the pet — is cheap.
 */
const ALLOWED_PET_TRANSITIONS: Record<PetStatus, readonly PetStatus[]> = {
  active: ['lost', 'deceased', 'archived'],
  lost: ['active', 'deceased', 'archived'],
  deceased: ['archived'],
  archived: ['active'],
};

export function canTransitionPetStatus(from: PetStatus, to: PetStatus): boolean {
  return ALLOWED_PET_TRANSITIONS[from].includes(to);
}

/** Applies a status change, keeping `lostAt` consistent with the status it describes. */
export function transitionPetStatus(
  pet: Pet,
  to: PetStatus,
  at: IsoDateTime
): Result<Pet, ValidationError> {
  if (pet.status === to) {
    return ok(pet);
  }
  if (!canTransitionPetStatus(pet.status, to)) {
    return err(
      new ValidationError(`A pet cannot go from ${pet.status} to ${to}.`, {
        context: { from: pet.status, to },
      })
    );
  }

  return ok({
    ...pet,
    status: to,
    lostAt: to === 'lost' ? at : null,
    updatedAt: at,
  });
}

/** A pet is only tracked while it is active or lost; archived and deceased pets are history. */
export function isTrackable(pet: Pet): boolean {
  return pet.deletedAt === null && (pet.status === 'active' || pet.status === 'lost');
}
