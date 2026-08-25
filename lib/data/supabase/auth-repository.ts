/**
 * The Supabase implementation of `AuthRepository`.
 *
 * This is the only module in the app that calls `supabase.auth`. Everything above it — the auth
 * feature, the screens, the router — works against the port, so the provider stays replaceable and
 * no screen ever holds a client.
 *
 * Every method returns a `Result`; nothing here throws for an expected failure. Provider errors are
 * translated by `auth-errors.ts` into `AppError`s carrying reviewed, user-safe copy.
 */

import { type Session, type User } from '@supabase/supabase-js';

import { toAuthError, type ProviderAuthError } from '@/lib/data/supabase/auth-errors';
import {
  type AuthEvent,
  type AuthRepository,
  type Query,
  type SignUpOutcome,
} from '@/lib/data/ports';
import {
  type AuthSession,
  type AuthenticatedUser,
  type SignInCredentials,
  type SignUpCredentials,
} from '@/lib/domain/auth';
import { unsafeId, unsafeIsoDateTime, type ProfileId } from '@/lib/domain/ids';
import { type AppSupabaseClient } from '@/lib/supabase';
import { ok, type Result } from '@/lib/result';
import { type AppError } from '@/lib/errors';

function toAuthenticatedUser(user: User): AuthenticatedUser {
  return {
    id: unsafeId<ProfileId>(user.id),
    email: user.email ?? '',
    // Either field being set means the address has been verified at some point.
    emailConfirmed: Boolean(user.email_confirmed_at ?? user.confirmed_at),
  };
}

function toAuthSession(session: Session): AuthSession {
  return {
    user: toAuthenticatedUser(session.user),
    expiresAt:
      session.expires_at === undefined
        ? null
        : unsafeIsoDateTime(new Date(session.expires_at * 1000).toISOString()),
  };
}

/** Normalises the provider's event vocabulary to the port's. */
function toAuthEvent(event: string): AuthEvent | null {
  switch (event) {
    case 'INITIAL_SESSION':
      return 'initial';
    case 'SIGNED_IN':
      return 'signed-in';
    case 'SIGNED_OUT':
      return 'signed-out';
    case 'TOKEN_REFRESHED':
      return 'token-refreshed';
    case 'USER_UPDATED':
      return 'user-updated';
    case 'PASSWORD_RECOVERY':
      return 'password-recovery';
    default:
      // MFA events and anything added by a future provider version. Ignored rather than guessed at.
      return null;
  }
}

export type SupabaseAuthOptions = {
  /**
   * Where the password-reset email should send the user. Supplied by the caller because it is a
   * navigation concern, and the data layer has no business knowing the app's URL scheme.
   */
  readonly passwordResetRedirectTo?: string | undefined;
};

export function createSupabaseAuthRepository(
  client: AppSupabaseClient,
  options: SupabaseAuthOptions = {}
): AuthRepository {
  return {
    async getSession(): Query<AuthSession | null> {
      const { data, error } = await client.auth.getSession();
      if (error) {
        return failure(error, 'getSession');
      }
      return ok(data.session === null ? null : toAuthSession(data.session));
    },

    async signIn(credentials: SignInCredentials): Query<AuthSession> {
      const { data, error } = await client.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });
      if (error) {
        return failure(error, 'signIn');
      }
      if (data.session === null) {
        // Defensive: a success with no session would leave the caller believing it is signed in.
        return failure({ code: 'session_not_found' }, 'signIn');
      }
      return ok(toAuthSession(data.session));
    },

    async signUp(credentials: SignUpCredentials): Query<SignUpOutcome> {
      const { data, error } = await client.auth.signUp({
        email: credentials.email,
        password: credentials.password,
        options: {
          // Read by the database trigger that creates the profile row. It is used *only* for the
          // display name — the trigger hard-codes the role, so nothing a client puts here can
          // influence privileges. See the handle_new_user migration.
          data: { display_name: credentials.displayName },
        },
      });
      if (error) {
        return failure(error, 'signUp');
      }

      return ok({
        session: data.session === null ? null : toAuthSession(data.session),
        // No session means the project is configured to require confirmation first.
        needsEmailConfirmation: data.session === null,
      });
    },

    async signOut(): Query<void> {
      const { error } = await client.auth.signOut();
      if (error) {
        return failure(error, 'signOut');
      }
      return ok(undefined);
    },

    async requestPasswordReset(email: string): Query<void> {
      const { error } = await client.auth.resetPasswordForEmail(
        email,
        options.passwordResetRedirectTo === undefined
          ? {}
          : { redirectTo: options.passwordResetRedirectTo }
      );
      if (error) {
        return failure(error, 'requestPasswordReset');
      }
      return ok(undefined);
    },

    onAuthStateChange(listener): () => void {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        const mapped = toAuthEvent(event);
        if (mapped === null) {
          return;
        }
        listener(mapped, session === null ? null : toAuthSession(session));
      });

      return () => data.subscription.unsubscribe();
    },

    startAutoRefresh(): void {
      void client.auth.startAutoRefresh();
    },

    stopAutoRefresh(): void {
      void client.auth.stopAutoRefresh();
    },
  };
}

/** Wraps the error mapping so every call site reads the same way. */
function failure<T>(error: ProviderAuthError, operation: string): Result<T, AppError> {
  return { ok: false, error: toAuthError(error, operation) };
}
