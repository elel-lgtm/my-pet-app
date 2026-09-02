/**
 * Turning a `Pet` into the words shown on screen.
 *
 * Pure functions, kept out of the components so the wording can be tested directly and stays
 * identical wherever a pet appears. A list row and a detail header describing the same pet
 * differently is the sort of thing nobody notices in review and everybody notices in use.
 */

import { type BadgeTone } from '@/components/ui';
import { type IsoDate } from '@/lib/domain/ids';
import { type Pet, type PetSpecies, type PetStatus } from '@/lib/domain/pet';

const SPECIES_LABEL: Record<PetSpecies, string> = {
  dog: 'Dog',
  cat: 'Cat',
  rabbit: 'Rabbit',
  bird: 'Bird',
  other: 'Other',
};

const STATUS_LABEL: Record<PetStatus, string> = {
  active: 'Active',
  lost: 'Lost',
  deceased: 'Deceased',
  archived: 'Archived',
};

export function speciesLabel(species: PetSpecies): string {
  return SPECIES_LABEL[species];
}

export function statusLabel(status: PetStatus): string {
  return STATUS_LABEL[status];
}

/**
 * Only `lost` is an alarm. Archived and deceased are quiet facts, and colouring them red would
 * make a settled record look like a problem every time the list is opened.
 */
export function statusTone(status: PetStatus): BadgeTone {
  switch (status) {
    case 'lost':
      return 'danger';
    case 'active':
      return 'success';
    case 'deceased':
    case 'archived':
      return 'neutral';
  }
}

/**
 * Age in whole years, or months while under one year.
 *
 * "8 months" is what an owner would say about a puppy; "0 years" is what a naive calculation
 * says. Returns null for an unknown or future date rather than guessing.
 */
export function formatAge(dateOfBirth: IsoDate | null, now: Date = new Date()): string | null {
  if (dateOfBirth === null) {
    return null;
  }

  const born = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(born.getTime()) || born.getTime() > now.getTime()) {
    return null;
  }

  const months =
    (now.getUTCFullYear() - born.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - born.getUTCMonth()) -
    (now.getUTCDate() < born.getUTCDate() ? 1 : 0);

  if (months < 1) {
    return 'Under a month old';
  }
  if (months < 12) {
    return `${months} month${months === 1 ? '' : 's'} old`;
  }

  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} old`;
}

/**
 * The one-line summary under a pet's name: breed and age when known, species otherwise.
 *
 * Species is dropped once a breed is present — "Dog · Beagle" says the same thing twice.
 */
export function describePet(pet: Pick<Pet, 'species' | 'breed' | 'dateOfBirth'>): string {
  const parts = [
    pet.breed !== null && pet.breed !== '' ? pet.breed : speciesLabel(pet.species),
    formatAge(pet.dateOfBirth),
  ].filter((part): part is string => part !== null);

  return parts.join(' · ');
}

/** "Missing since 3 March" for a lost pet, so the header states the thing that matters. */
export function formatMissingSince(pet: Pick<Pet, 'status' | 'lostAt'>): string | null {
  if (pet.status !== 'lost' || pet.lostAt === null) {
    return null;
  }
  const date = new Date(pet.lostAt);
  return `Missing since ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`;
}
