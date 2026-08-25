/**
 * Composition point for authentication.
 *
 * The auth feature needs an `AuthRepository` but must not import `@/lib/supabase` — ESLint blocks
 * `features/**` from doing so, because only adapters may hold a client. This module is where the
 * two are joined, and it lives in `lib/data` precisely because that is the boundary features are
 * allowed to depend on.
 */

import { createSupabaseAuthRepository } from '@/lib/data/supabase/auth-repository';
import { type AuthRepository } from '@/lib/data/ports';
import { getSupabaseClient } from '@/lib/supabase';

let cached: AuthRepository | null = null;

export type CreateAuthRepositoryOptions = {
  readonly passwordResetRedirectTo?: string | undefined;
};

/**
 * The shared authentication repository.
 *
 * Lazily created so that importing this module does not require Supabase to be configured — a
 * screen-level import should not crash a development build with no project set up.
 */
export function getAuthRepository(options: CreateAuthRepositoryOptions = {}): AuthRepository {
  if (cached === null) {
    cached = createSupabaseAuthRepository(getSupabaseClient(), options);
  }
  return cached;
}

/** Drops the cached repository. For tests. */
export function resetAuthRepository(): void {
  cached = null;
}
