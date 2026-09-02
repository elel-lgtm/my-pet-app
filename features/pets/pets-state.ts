/**
 * The pet-list state machine.
 *
 * A pure reducer, separate from the provider that drives it, so every transition can be tested
 * without React, a renderer, or a network. Mirrors `features/auth/auth-state.ts`.
 *
 * ## Why the list is edited in place
 *
 * After a create, edit, or archive the reducer updates the list it already holds instead of
 * refetching. A round trip after every mutation makes the screen flicker and makes an offline edit
 * look like it failed. The server remains authoritative — `refresh` reconciles — but the common
 * case does not wait for it.
 */

import { type Pet } from '@/lib/domain/pet';
import { type PetId } from '@/lib/domain/ids';
import { type AppError } from '@/lib/errors';

export type PetsState =
  /** First load. Nothing to show yet, not even an empty state — we do not know if it is empty. */
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly pets: readonly Pet[];
      /** A refresh over an already-populated list. The list stays visible underneath. */
      readonly refreshing: boolean;
    }
  | { readonly status: 'error'; readonly error: AppError };

export type PetsAction =
  | { readonly type: 'load-started' }
  | { readonly type: 'refresh-started' }
  | { readonly type: 'loaded'; readonly pets: readonly Pet[] }
  | { readonly type: 'failed'; readonly error: AppError }
  | { readonly type: 'pet-added'; readonly pet: Pet }
  | { readonly type: 'pet-updated'; readonly pet: Pet }
  | { readonly type: 'pet-removed'; readonly petId: PetId };

export const initialPetsState: PetsState = { status: 'loading' };

/** Newest first, matching the order the server returns. */
function byNewestFirst(a: Pet, b: Pet): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

export function petsReducer(state: PetsState, action: PetsAction): PetsState {
  switch (action.type) {
    case 'load-started':
      return { status: 'loading' };

    /**
     * A refresh keeps the current list on screen. Dropping back to `loading` would replace a
     * perfectly good list with a spinner every time someone pulled down.
     */
    case 'refresh-started':
      return state.status === 'ready' ? { ...state, refreshing: true } : { status: 'loading' };

    case 'loaded':
      return { status: 'ready', pets: action.pets, refreshing: false };

    /**
     * A failed *refresh* does not discard the list. Losing everything on screen because a pull-to
     * -refresh timed out is worse than showing slightly stale data, and the user can try again.
     */
    case 'failed':
      return state.status === 'ready' && state.refreshing
        ? { ...state, refreshing: false }
        : { status: 'error', error: action.error };

    case 'pet-added':
      return state.status === 'ready'
        ? { ...state, pets: [action.pet, ...state.pets].sort(byNewestFirst) }
        : state;

    case 'pet-updated':
      return state.status === 'ready'
        ? {
            ...state,
            pets: state.pets.map((pet) => (pet.id === action.pet.id ? action.pet : pet)),
          }
        : state;

    case 'pet-removed':
      return state.status === 'ready'
        ? { ...state, pets: state.pets.filter((pet) => pet.id !== action.petId) }
        : state;
  }
}

/** Pets that are part of everyday life: shown first and by default. */
export function activePets(pets: readonly Pet[]): readonly Pet[] {
  return pets.filter((pet) => pet.status === 'active' || pet.status === 'lost');
}

/** Pets kept for the record — archived, or no longer with us. */
export function inactivePets(pets: readonly Pet[]): readonly Pet[] {
  return pets.filter((pet) => pet.status === 'archived' || pet.status === 'deceased');
}

export function findPet(state: PetsState, petId: PetId): Pet | null {
  if (state.status !== 'ready') {
    return null;
  }
  return state.pets.find((pet) => pet.id === petId) ?? null;
}
