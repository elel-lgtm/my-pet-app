/**
 * Test doubles for pet data.
 *
 * The fake implements the real `PetRepository` port, so tests exercise the production wiring
 * rather than a parallel one. Lives outside `features/` for the same reason as the auth fake:
 * ESLint forbids reaching into a feature's internals, and a double is not part of its contract.
 */

import { type ReactElement, type ReactNode } from 'react';
import { render } from '@testing-library/react-native';

import { AuthProvider } from '@/features/auth';
import { PetsProvider } from '@/features/pets';
import { type PetRepository } from '@/lib/data';
import {
  unsafeId,
  unsafeIsoDate,
  unsafeIsoDateTime,
  type IsoDate,
  type PetId,
  type ProfileId,
} from '@/lib/domain/ids';
import {
  transitionPetStatus,
  type CreatePetInput,
  type Pet,
  type PetStatus,
} from '@/lib/domain/pet';
import { AppError } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';
import { TEST_SESSION, TEST_USER_ID, createFakeAuthRepository } from '@/test-support/auth';

export const OTHER_OWNER_ID = unsafeId<ProfileId>('99999999-9999-4999-8999-999999999999');

let idCounter = 0;

/** Deterministic, uuid-shaped, and readable in a failure message. */
export function nextPetId(): PetId {
  idCounter += 1;
  return unsafeId<PetId>(`00000000-0000-4000-8000-${idCounter.toString().padStart(12, '0')}`);
}

export function makeTestPet(overrides: Partial<Pet> = {}): Pet {
  const at = unsafeIsoDateTime('2026-08-20T09:00:00.000Z');
  return {
    id: nextPetId(),
    ownerId: TEST_USER_ID,
    name: 'Biscuit',
    species: 'dog',
    breed: 'Beagle',
    dateOfBirth: unsafeIsoDate('2019-04-02') as IsoDate,
    photoUrl: null,
    notes: null,
    status: 'active',
    lostAt: null,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    ...overrides,
  };
}

export type FakePetRepository = PetRepository & {
  readonly calls: {
    list: number;
    create: number;
    update: number;
    changeStatus: number;
    softDelete: number;
  };
  /** The rows the fake currently holds, for assertions. */
  snapshot(): readonly Pet[];
};

export type FakePetOptions = {
  readonly initialPets?: readonly Pet[] | undefined;
  readonly listError?: AppError | undefined;
  readonly createError?: AppError | undefined;
  readonly updateError?: AppError | undefined;
  readonly removeError?: AppError | undefined;
};

export function createFakePetRepository(options: FakePetOptions = {}): FakePetRepository {
  let pets: Pet[] = [...(options.initialPets ?? [])];
  const calls = { list: 0, create: 0, update: 0, changeStatus: 0, softDelete: 0 };

  function find(petId: PetId): Pet | undefined {
    return pets.find((pet) => pet.id === petId && pet.deletedAt === null);
  }

  return {
    async listAccessibleBy(viewerId: ProfileId): Promise<Result<readonly Pet[], AppError>> {
      calls.list += 1;
      if (options.listError !== undefined) {
        return err(options.listError);
      }
      // Mirrors the RLS predicate closely enough to be useful: owned, and not soft-deleted.
      return ok(pets.filter((pet) => pet.deletedAt === null && pet.ownerId === viewerId));
    },

    async findById(petId: PetId): Promise<Result<Pet | null, AppError>> {
      return ok(find(petId) ?? null);
    },

    async create(ownerId: ProfileId, input: CreatePetInput): Promise<Result<Pet, AppError>> {
      calls.create += 1;
      if (options.createError !== undefined) {
        return err(options.createError);
      }
      const created = makeTestPet({ ...input, ownerId, id: nextPetId() });
      pets = [created, ...pets];
      return ok(created);
    },

    async update(petId: PetId, input: Partial<CreatePetInput>): Promise<Result<Pet, AppError>> {
      calls.update += 1;
      if (options.updateError !== undefined) {
        return err(options.updateError);
      }
      const existing = find(petId);
      if (existing === undefined) {
        return err(new AppError('not_found', "We couldn't find what you were looking for."));
      }
      const updated: Pet = { ...existing, ...input };
      pets = pets.map((pet) => (pet.id === petId ? updated : pet));
      return ok(updated);
    },

    async changeStatus(petId: PetId, status: PetStatus): Promise<Result<Pet, AppError>> {
      calls.changeStatus += 1;
      const existing = find(petId);
      if (existing === undefined) {
        return err(new AppError('not_found', "We couldn't find what you were looking for."));
      }
      // Uses the real domain transition, so an illegal change fails here as it would in production.
      const transitioned = transitionPetStatus(
        existing,
        status,
        unsafeIsoDateTime('2026-08-26T12:00:00.000Z')
      );
      if (!transitioned.ok) {
        return transitioned;
      }
      pets = pets.map((pet) => (pet.id === petId ? transitioned.value : pet));
      return ok(transitioned.value);
    },

    async softDelete(petId: PetId): Promise<Result<void, AppError>> {
      calls.softDelete += 1;
      if (options.removeError !== undefined) {
        return err(options.removeError);
      }
      const existing = find(petId);
      if (existing === undefined) {
        return err(new AppError('not_found', "We couldn't find what you were looking for."));
      }
      pets = pets.map((pet) =>
        pet.id === petId
          ? { ...pet, deletedAt: unsafeIsoDateTime('2026-08-26T12:00:00.000Z') }
          : pet
      );
      return ok(undefined);
    },

    calls,
    snapshot: () => pets,
  };
}

export function PetsTestProvider({
  children,
  repository,
}: {
  children: ReactNode;
  repository: PetRepository;
}) {
  return (
    <AuthProvider repository={createFakeAuthRepository({ initialSession: TEST_SESSION })}>
      <PetsProvider repository={repository}>{children}</PetsProvider>
    </AuthProvider>
  );
}

/** Renders inside a real provider stack backed by fakes. */
export async function renderWithPets(
  ui: ReactElement,
  options: FakePetOptions & { repository?: FakePetRepository | undefined } = {}
): Promise<{ repository: FakePetRepository }> {
  const repository = options.repository ?? createFakePetRepository(options);
  await render(<PetsTestProvider repository={repository}>{ui}</PetsTestProvider>);
  return { repository };
}
