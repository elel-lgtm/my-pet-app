import {
  activePets,
  findPet,
  inactivePets,
  initialPetsState,
  petsReducer,
  type PetsState,
} from '@/features/pets';
import { AppError } from '@/lib/errors';
import { makeTestPet, nextPetId } from '@/test-support/pets';

const PET = makeTestPet({ name: 'Biscuit' });
const OTHER = makeTestPet({ name: 'Mochi' });
const FAILURE = new AppError('network', 'offline');

const READY: PetsState = { status: 'ready', pets: [PET], refreshing: false };

describe('initial state', () => {
  it('starts loading rather than claiming to be empty', () => {
    // An empty-state flash on every open is what starting at `ready` with no pets would produce.
    expect(initialPetsState.status).toBe('loading');
  });
});

describe('loading', () => {
  it('becomes ready with the pets it was given', () => {
    const next = petsReducer(initialPetsState, { type: 'loaded', pets: [PET, OTHER] });

    expect(next).toEqual({ status: 'ready', pets: [PET, OTHER], refreshing: false });
  });

  it('becomes an error state when the first load fails', () => {
    const next = petsReducer(initialPetsState, { type: 'failed', error: FAILURE });

    expect(next).toEqual({ status: 'error', error: FAILURE });
  });
});

describe('refreshing', () => {
  it('keeps the list visible while refreshing', () => {
    const next = petsReducer(READY, { type: 'refresh-started' });

    expect(next).toEqual({ status: 'ready', pets: [PET], refreshing: true });
  });

  /** Losing the whole list because a pull-to-refresh timed out is worse than stale data. */
  it('keeps the existing list when a refresh fails', () => {
    const refreshing = petsReducer(READY, { type: 'refresh-started' });

    const next = petsReducer(refreshing, { type: 'failed', error: FAILURE });

    expect(next).toEqual({ status: 'ready', pets: [PET], refreshing: false });
  });

  it('falls back to loading if a refresh is asked for before the first load finished', () => {
    expect(petsReducer(initialPetsState, { type: 'refresh-started' }).status).toBe('loading');
  });
});

describe('local mutations', () => {
  it('adds a new pet to the front', () => {
    const added = makeTestPet({ name: 'New', createdAt: PET.createdAt });

    const next = petsReducer(READY, { type: 'pet-added', pet: added });

    expect(next.status === 'ready' && next.pets).toHaveLength(2);
  });

  it('replaces an updated pet in place', () => {
    const renamed = { ...PET, name: 'Renamed' };

    const next = petsReducer(READY, { type: 'pet-updated', pet: renamed });

    expect(next.status === 'ready' && next.pets[0]?.name).toBe('Renamed');
  });

  it('leaves other pets untouched when one is updated', () => {
    const state: PetsState = { status: 'ready', pets: [PET, OTHER], refreshing: false };

    const next = petsReducer(state, { type: 'pet-updated', pet: { ...PET, name: 'Renamed' } });

    expect(next.status === 'ready' && next.pets[1]).toBe(OTHER);
  });

  it('drops a removed pet', () => {
    const next = petsReducer(READY, { type: 'pet-removed', petId: PET.id });

    expect(next.status === 'ready' && next.pets).toEqual([]);
  });

  it('ignores mutations while still loading, rather than inventing a list', () => {
    expect(petsReducer(initialPetsState, { type: 'pet-added', pet: PET })).toBe(initialPetsState);
  });
});

describe('grouping', () => {
  const pets = [
    makeTestPet({ name: 'Active', status: 'active' }),
    makeTestPet({ name: 'Lost', status: 'lost', lostAt: PET.createdAt }),
    makeTestPet({ name: 'Archived', status: 'archived' }),
    makeTestPet({ name: 'Deceased', status: 'deceased' }),
  ];

  it('treats active and lost pets as current', () => {
    // A lost pet is the one you most need to see, so it belongs at the top, not in an archive.
    expect(activePets(pets).map((pet) => pet.name)).toEqual(['Active', 'Lost']);
  });

  it('treats archived and deceased pets as records', () => {
    expect(inactivePets(pets).map((pet) => pet.name)).toEqual(['Archived', 'Deceased']);
  });
});

describe('findPet', () => {
  it('finds a pet in a ready list', () => {
    expect(findPet(READY, PET.id)).toBe(PET);
  });

  it('returns null for an unknown id', () => {
    expect(findPet(READY, nextPetId())).toBeNull();
  });

  it('returns null while loading', () => {
    expect(findPet(initialPetsState, PET.id)).toBeNull();
  });
});
