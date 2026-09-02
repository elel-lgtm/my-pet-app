/**
 * Composition point for pet data.
 *
 * The pets feature needs a `PetRepository` but must not import `@/lib/supabase` — ESLint blocks
 * `features/**` from doing so. This is where the port and its Supabase adapter are joined, in the
 * one layer features are allowed to depend on. Mirrors `lib/data/auth.ts`.
 */

import { createSupabasePetRepository } from '@/lib/data/supabase/pet-repository';
import { type PetRepository } from '@/lib/data/ports';
import { getSupabaseClient } from '@/lib/supabase';

let cached: PetRepository | null = null;

/**
 * The shared pet repository.
 *
 * Lazily created so importing this module does not require Supabase to be configured — a screen
 * import should not crash a development build that has no project set up.
 */
export function getPetRepository(): PetRepository {
  cached ??= createSupabasePetRepository(getSupabaseClient());
  return cached;
}

/** Drops the cached repository. For tests, and for a sign-out that must not reuse a client. */
export function resetPetRepository(): void {
  cached = null;
}
