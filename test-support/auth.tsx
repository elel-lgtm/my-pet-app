/**
 * Test doubles for authentication.
 *
 * Lives outside `features/` on purpose: ESLint forbids reaching into a feature's internals, and a
 * test double is not part of the feature's public contract either. Nothing in `app/` imports this,
 * so it never reaches a bundle.
 *
 * The fake implements the real `AuthRepository` port, so a test exercises the same interface
 * production does. No network, no Supabase, no timers.
 */

import { type ReactElement, type ReactNode } from 'react';
import { render } from '@testing-library/react-native';

import { AuthProvider } from '@/features/auth';
import { type AuthEvent, type AuthRepository, type SignUpOutcome } from '@/lib/data';
import { unsafeId, unsafeIsoDateTime, type ProfileId } from '@/lib/domain/ids';
import { type AuthSession } from '@/lib/domain/auth';
import { AppError } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';

export const TEST_USER_ID = unsafeId<ProfileId>('11111111-1111-4111-8111-111111111111');

export const TEST_SESSION: AuthSession = {
  user: { id: TEST_USER_ID, email: 'owner@example.com', emailConfirmed: true },
  expiresAt: unsafeIsoDateTime('2026-08-26T12:00:00.000Z'),
};

type Listener = (event: AuthEvent, session: AuthSession | null) => void;

export type FakeAuthRepository = AuthRepository & {
  /** Pushes a provider event to every subscriber, as supabase-js would. */
  emit(event: AuthEvent, session: AuthSession | null): void;
  readonly calls: {
    signIn: number;
    signUp: number;
    signOut: number;
    requestPasswordReset: number;
    startAutoRefresh: number;
    stopAutoRefresh: number;
  };
  readonly listenerCount: () => number;
};

export type FakeAuthOptions = {
  /** What `getSession` resolves with at start-up. */
  readonly initialSession?: AuthSession | null | undefined;
  /** Makes `getSession` fail, driving the provider into its `error` state. */
  readonly restoreError?: AppError | undefined;
  readonly signInResult?: Result<AuthSession, AppError> | undefined;
  readonly signUpResult?: Result<SignUpOutcome, AppError> | undefined;
  readonly signOutResult?: Result<void, AppError> | undefined;
  readonly passwordResetResult?: Result<void, AppError> | undefined;
};

export function createFakeAuthRepository(options: FakeAuthOptions = {}): FakeAuthRepository {
  const listeners = new Set<Listener>();
  const calls = {
    signIn: 0,
    signUp: 0,
    signOut: 0,
    requestPasswordReset: 0,
    startAutoRefresh: 0,
    stopAutoRefresh: 0,
  };

  const initialSession = options.initialSession ?? null;

  const repository: FakeAuthRepository = {
    async getSession() {
      if (options.restoreError !== undefined) {
        return err(options.restoreError);
      }
      return ok(initialSession);
    },

    async signIn(credentials) {
      calls.signIn += 1;
      const result = options.signInResult ?? ok(TEST_SESSION);
      if (result.ok) {
        // Mirrors the real provider: a successful sign-in is announced through the subscription,
        // which is what actually moves the app into its signed-in state.
        repository.emit('signed-in', result.value);
      }
      void credentials;
      return result;
    },

    async signUp(credentials) {
      calls.signUp += 1;
      void credentials;
      return options.signUpResult ?? ok({ session: null, needsEmailConfirmation: true });
    },

    async signOut() {
      calls.signOut += 1;
      const result = options.signOutResult ?? ok(undefined);
      if (result.ok) {
        repository.emit('signed-out', null);
      }
      return result;
    },

    async requestPasswordReset(email) {
      calls.requestPasswordReset += 1;
      void email;
      return options.passwordResetResult ?? ok(undefined);
    },

    onAuthStateChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    startAutoRefresh() {
      calls.startAutoRefresh += 1;
    },

    stopAutoRefresh() {
      calls.stopAutoRefresh += 1;
    },

    emit(event, session) {
      for (const listener of [...listeners]) {
        listener(event, session);
      }
    },

    calls,
    listenerCount: () => listeners.size,
  };

  return repository;
}

export function AuthTestProvider({
  children,
  repository,
}: {
  children: ReactNode;
  repository: AuthRepository;
}) {
  return <AuthProvider repository={repository}>{children}</AuthProvider>;
}

/**
 * Renders inside a real `AuthProvider` backed by the fake.
 *
 * `render` is awaited because React Native Testing Library v14's is async, and the provider
 * resolves its session in an effect — without the await the tree is still initializing.
 */
export async function renderWithAuth(
  ui: ReactElement,
  options: FakeAuthOptions & { repository?: FakeAuthRepository | undefined } = {}
): Promise<{ repository: FakeAuthRepository }> {
  const repository = options.repository ?? createFakeAuthRepository(options);
  await render(<AuthTestProvider repository={repository}>{ui}</AuthTestProvider>);
  return { repository };
}
