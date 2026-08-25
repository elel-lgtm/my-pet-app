/**
 * Authentication as the domain sees it.
 *
 * Deliberately thin. Authentication establishes *identity* — who is making a request. What that
 * identity may do is authorization, which is decided by row-level security in the database and
 * modelled separately in `@/lib/domain/access`. Nothing here grants anything.
 *
 * Note what is absent: no role, no permissions, no pet access. A signed-in user is a
 * `ProfileId` and an email address. The `AccountRole` lives on `Profile`, is written only by
 * trusted database logic, and is never derived from anything the client says.
 */

import { type IsoDateTime, type ProfileId } from '@/lib/domain/ids';
import { Validation } from '@/lib/domain/validation';
import { type ValidationError } from '@/lib/errors';
import { type Result } from '@/lib/result';

export type AuthenticatedUser = {
  /** Identical to `profiles.id`, because `profiles.id` is `auth.users.id`. One identity, one row. */
  readonly id: ProfileId;
  readonly email: string;
  /**
   * Whether the address has been confirmed. Sign-up may succeed while this is false, depending on
   * project configuration, so a screen must not treat "signed up" as "confirmed".
   */
  readonly emailConfirmed: boolean;
};

export type AuthSession = {
  readonly user: AuthenticatedUser;
  /** When the access token expires. Refresh is handled by the client, not by callers. */
  readonly expiresAt: IsoDateTime | null;
};

/**
 * Minimum password length.
 *
 * Ten characters, matching the minimum configured on the Supabase project. Client and server must
 * agree: a client rule looser than the server's produces a confusing rejection after submitting,
 * and one stricter than the server's rejects passwords the account could legitimately hold —
 * including ones set through a path that does not go through this app.
 *
 * Ten sits above the NIST SP 800-63B floor of eight. No composition rules — no required digit,
 * symbol, or mixed case: they measurably push people towards `Password1!`, and the same guidance
 * advises against them. Length is the property that matters.
 *
 * Changing this means changing the Supabase project's Auth setting too, and
 * `supabase/config.toml` for the local stack. The server keeps the final say through its own
 * weak-password check.
 */
export const PASSWORD_MIN_LENGTH = 10;

/**
 * Upper bound, so an enormous input cannot be used to make the server do expensive hashing work.
 * bcrypt truncates beyond 72 bytes in any case.
 */
export const PASSWORD_MAX_LENGTH = 72;

export type SignInCredentials = {
  readonly email: string;
  readonly password: string;
};

export type SignUpCredentials = SignInCredentials & {
  readonly displayName: string;
};

export function parseSignInCredentials(input: unknown): Result<SignInCredentials, ValidationError> {
  const v = new Validation();
  const raw = (input ?? {}) as Record<string, unknown>;

  const email = v.email('email', raw.email);
  // Length is not checked on sign-in. The stored password may predate any rule we impose now, and
  // rejecting it locally would lock someone out of their own account with a confusing message.
  const password = typeof raw.password === 'string' ? raw.password : '';
  if (password.length === 0) {
    v.reject('password', 'is required');
  }

  return v.result(() => ({ email, password }));
}

export function parseSignUpCredentials(input: unknown): Result<SignUpCredentials, ValidationError> {
  const v = new Validation();
  const raw = (input ?? {}) as Record<string, unknown>;

  const email = v.email('email', raw.email);
  const displayName = v.text('displayName', raw.displayName, { min: 1, max: 80 });
  const password = v.text('password', raw.password, {
    min: PASSWORD_MIN_LENGTH,
    max: PASSWORD_MAX_LENGTH,
  });

  // Compared here rather than in a screen, so every entry point gets the same rule.
  const confirmation = typeof raw.passwordConfirmation === 'string' ? raw.passwordConfirmation : '';
  if (confirmation !== password) {
    v.reject('passwordConfirmation', 'does not match the password');
  }

  return v.result(() => ({ email, displayName, password }));
}

export function parsePasswordResetRequest(
  input: unknown
): Result<{ readonly email: string }, ValidationError> {
  const v = new Validation();
  const raw = (input ?? {}) as Record<string, unknown>;
  const email = v.email('email', raw.email);

  return v.result(() => ({ email }));
}
