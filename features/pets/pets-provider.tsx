/**
 * The single source of truth for the signed-in owner's pets.
 *
 * Mounted once inside the authenticated area, so list, detail, and form screens all read the same
 * data and a change made on one is visible on the others without a refetch.
 *
 * Mutations return a `Result` to the caller rather than pushing failures into shared state. A
 * rejected create belongs on the form that submitted it, next to the field at fault — routing it
 * through the provider would blank the whole list because someone mistyped a date.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';

import { useAuth } from '@/features/auth';
import { findPet, initialPetsState, petsReducer, type PetsState } from '@/features/pets/pets-state';
import { getPetRepository, type PetRepository } from '@/lib/data';
import { type PetId, type ProfileId } from '@/lib/domain/ids';
import {
  parseCreatePetInput,
  type CreatePetInput,
  type Pet,
  type PetStatus,
  type UpdatePetInput,
} from '@/lib/domain/pet';
import { toAppError, type AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { err, type Result } from '@/lib/result';

const log = logger.child('pets');

export type PetsContextValue = {
  readonly state: PetsState;
  /** The signed-in owner, or null while the session is still resolving. */
  readonly ownerId: ProfileId | null;
  refresh(): Promise<void>;
  /** Validates through the domain before touching the network. */
  create(input: unknown): Promise<Result<Pet, AppError>>;
  update(petId: PetId, input: UpdatePetInput): Promise<Result<Pet, AppError>>;
  changeStatus(petId: PetId, status: PetStatus): Promise<Result<Pet, AppError>>;
  /** Soft delete. Not reversible through the API — see the repository for why. */
  remove(petId: PetId): Promise<Result<void, AppError>>;
  getById(petId: PetId): Pet | null;
};

const PetsContext = createContext<PetsContextValue | null>(null);

export type PetsProviderProps = {
  readonly children: ReactNode;
  /** Injected in tests. Production resolves the Supabase-backed repository lazily. */
  readonly repository?: PetRepository | undefined;
};

export function PetsProvider({ children, repository }: PetsProviderProps) {
  const [state, dispatch] = useReducer(petsReducer, initialPetsState);
  const { session } = useAuth();
  const ownerId = session?.user.id ?? null;

  const repositoryRef = useRef<PetRepository | null>(repository ?? null);
  const resolveRepository = useCallback((): PetRepository => {
    repositoryRef.current ??= getPetRepository();
    return repositoryRef.current;
  }, []);

  const load = useCallback(
    async (viewerId: ProfileId, refreshing: boolean): Promise<void> => {
      dispatch({ type: refreshing ? 'refresh-started' : 'load-started' });

      let result;
      try {
        result = await resolveRepository().listAccessibleBy(viewerId);
      } catch (thrown) {
        // Supabase unconfigured, or an adapter bug. A legible error beats a blank screen.
        dispatch({ type: 'failed', error: toAppError(thrown) });
        return;
      }

      if (result.ok) {
        dispatch({ type: 'loaded', pets: result.value });
      } else {
        dispatch({ type: 'failed', error: result.error });
      }
    },
    [resolveRepository]
  );

  /**
   * Loads once the session is known, and reloads if the account changes.
   *
   * Keyed on `ownerId` rather than run on mount, because the provider renders before the session
   * resolves — loading then would fetch as nobody and get an empty list back.
   */
  useEffect(() => {
    if (ownerId === null) {
      return;
    }
    void load(ownerId, false);
  }, [ownerId, load]);

  const refresh = useCallback(async (): Promise<void> => {
    if (ownerId === null) {
      return;
    }
    await load(ownerId, true);
  }, [ownerId, load]);

  const create = useCallback(
    async (input: unknown): Promise<Result<Pet, AppError>> => {
      if (ownerId === null) {
        return err(toAppError(new Error('Not signed in.')));
      }

      const parsed = parseCreatePetInput(input);
      if (!parsed.ok) {
        return parsed;
      }

      const created = await resolveRepository().create(ownerId, parsed.value as CreatePetInput);
      if (created.ok) {
        log.info('Pet created', { petId: created.value.id });
        dispatch({ type: 'pet-added', pet: created.value });
      }
      return created;
    },
    [ownerId, resolveRepository]
  );

  const update = useCallback(
    async (petId: PetId, input: UpdatePetInput): Promise<Result<Pet, AppError>> => {
      const updated = await resolveRepository().update(petId, input);
      if (updated.ok) {
        dispatch({ type: 'pet-updated', pet: updated.value });
      }
      return updated;
    },
    [resolveRepository]
  );

  const changeStatus = useCallback(
    async (petId: PetId, status: PetStatus): Promise<Result<Pet, AppError>> => {
      const updated = await resolveRepository().changeStatus(petId, status);
      if (updated.ok) {
        dispatch({ type: 'pet-updated', pet: updated.value });
      }
      return updated;
    },
    [resolveRepository]
  );

  const remove = useCallback(
    async (petId: PetId): Promise<Result<void, AppError>> => {
      const removed = await resolveRepository().softDelete(petId);
      if (removed.ok) {
        log.info('Pet removed', { petId });
        dispatch({ type: 'pet-removed', petId });
      }
      return removed;
    },
    [resolveRepository]
  );

  const getById = useCallback((petId: PetId): Pet | null => findPet(state, petId), [state]);

  const value = useMemo<PetsContextValue>(
    () => ({ state, ownerId, refresh, create, update, changeStatus, remove, getById }),
    [state, ownerId, refresh, create, update, changeStatus, remove, getById]
  );

  return <PetsContext.Provider value={value}>{children}</PetsContext.Provider>;
}

export function usePets(): PetsContextValue {
  const value = useContext(PetsContext);
  if (value === null) {
    throw new Error('usePets must be used inside a <PetsProvider>.');
  }
  return value;
}

/** Convenience for a detail or edit screen: the pet, or null while loading or if unknown. */
export function usePet(petId: PetId | null): Pet | null {
  const { getById } = usePets();
  return petId === null ? null : getById(petId);
}
