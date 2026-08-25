/**
 * The Supabase adapter, against a hand-built fake client.
 *
 * What matters here is the translation: provider shapes in, domain types out, and provider errors
 * turned into reviewed `AppError`s. No network is involved — the fake returns the shapes
 * supabase-js would.
 */

import { createSupabaseAuthRepository } from '@/lib/data/supabase/auth-repository';
import { type AppSupabaseClient } from '@/lib/supabase';
import { setLogLevel } from '@/lib/logger';

beforeAll(() => setLogLevel('silent'));

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'owner@example.com',
  email_confirmed_at: '2026-08-25T10:00:00.000Z',
};

const SESSION = {
  access_token: 'access',
  refresh_token: 'refresh',
  expires_at: 1_800_000_000,
  user: USER,
};

type AuthStub = Partial<Record<string, unknown>>;

/** Builds just enough of the client surface for the adapter to run against. */
function clientWith(auth: AuthStub): AppSupabaseClient {
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: async () => ({ data: { session: null, user: null }, error: null }),
      signUp: async () => ({ data: { session: null, user: null }, error: null }),
      signOut: async () => ({ error: null }),
      resetPasswordForEmail: async () => ({ data: null, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      startAutoRefresh: async () => {},
      stopAutoRefresh: async () => {},
      ...auth,
    },
  } as unknown as AppSupabaseClient;
}

describe('getSession', () => {
  it('maps a stored session to the domain shape', async () => {
    const repository = createSupabaseAuthRepository(
      clientWith({ getSession: async () => ({ data: { session: SESSION }, error: null }) })
    );

    const result = await repository.getSession();

    expect(result.ok).toBe(true);
    if (result.ok && result.value !== null) {
      expect(result.value.user.id).toBe(USER.id);
      expect(result.value.user.email).toBe(USER.email);
      expect(result.value.user.emailConfirmed).toBe(true);
      // Seconds since the epoch on the wire; a normalised ISO string in the domain.
      expect(result.value.expiresAt).toBe(new Date(1_800_000_000 * 1000).toISOString());
    }
  });

  it('reports no session as success with null, not as a failure', async () => {
    const repository = createSupabaseAuthRepository(clientWith({}));

    const result = await repository.getSession();

    // "Not signed in" is an answer, not a fault. Treating it as an error would push the app into
    // its error state on every cold start for a signed-out user.
    expect(result).toEqual({ ok: true, value: null });
  });

  it('marks an unconfirmed address as unconfirmed', async () => {
    const repository = createSupabaseAuthRepository(
      clientWith({
        getSession: async () => ({
          data: { session: { ...SESSION, user: { ...USER, email_confirmed_at: null } } },
          error: null,
        }),
      })
    );

    const result = await repository.getSession();

    expect(result.ok && result.value?.user.emailConfirmed).toBe(false);
  });
});

describe('signIn', () => {
  it('returns the session on success', async () => {
    const repository = createSupabaseAuthRepository(
      clientWith({
        signInWithPassword: async () => ({ data: { session: SESSION, user: USER }, error: null }),
      })
    );

    const result = await repository.signIn({ email: USER.email, password: 'pw' });

    expect(result.ok && result.value.user.email).toBe(USER.email);
  });

  it('maps a rejected credential to reviewed copy', async () => {
    const repository = createSupabaseAuthRepository(
      clientWith({
        signInWithPassword: async () => ({
          data: { session: null, user: null },
          error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' },
        }),
      })
    );

    const result = await repository.signIn({ email: USER.email, password: 'pw' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unauthorized');
      expect(result.error.message).toBe('Email or password is incorrect.');
    }
  });

  /** A "success" with no session would leave the caller believing it is signed in. */
  it('treats a success with no session as a failure', async () => {
    const repository = createSupabaseAuthRepository(clientWith({}));

    const result = await repository.signIn({ email: USER.email, password: 'pw' });

    expect(result.ok).toBe(false);
  });
});

describe('signUp', () => {
  it('reports that confirmation is needed when no session is issued', async () => {
    const repository = createSupabaseAuthRepository(
      clientWith({ signUp: async () => ({ data: { session: null, user: USER }, error: null }) })
    );

    const result = await repository.signUp({
      email: USER.email,
      password: 'pw',
      displayName: 'Sam',
    });

    expect(result.ok && result.value.needsEmailConfirmation).toBe(true);
    expect(result.ok && result.value.session).toBeNull();
  });

  it('returns the session when one is issued immediately', async () => {
    const repository = createSupabaseAuthRepository(
      clientWith({ signUp: async () => ({ data: { session: SESSION, user: USER }, error: null }) })
    );

    const result = await repository.signUp({
      email: USER.email,
      password: 'pw',
      displayName: 'Sam',
    });

    expect(result.ok && result.value.needsEmailConfirmation).toBe(false);
  });

  /**
   * The display name reaches the database trigger through this metadata. The role does not, and
   * cannot: the trigger hard-codes it. This asserts we send only what we mean to.
   */
  it('sends the display name as metadata and nothing resembling a role', async () => {
    let captured: Record<string, unknown> = {};
    const repository = createSupabaseAuthRepository(
      clientWith({
        signUp: async (args: { options?: { data?: Record<string, unknown> } }) => {
          captured = args.options?.data ?? {};
          return { data: { session: null, user: USER }, error: null };
        },
      })
    );

    await repository.signUp({ email: USER.email, password: 'pw', displayName: 'Sam Owner' });

    expect(captured).toEqual({ display_name: 'Sam Owner' });
    expect(Object.keys(captured)).not.toContain('role');
  });
});

describe('signOut and password reset', () => {
  it('signs out', async () => {
    let called = false;
    const repository = createSupabaseAuthRepository(
      clientWith({
        signOut: async () => {
          called = true;
          return { error: null };
        },
      })
    );

    expect((await repository.signOut()).ok).toBe(true);
    expect(called).toBe(true);
  });

  it('maps a sign-out failure rather than throwing', async () => {
    const repository = createSupabaseAuthRepository(
      clientWith({ signOut: async () => ({ error: { message: 'Network request failed' } }) })
    );

    const result = await repository.signOut();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('network');
    }
  });

  it('passes the configured redirect to the reset email', async () => {
    let captured: unknown = null;
    const repository = createSupabaseAuthRepository(
      clientWith({
        resetPasswordForEmail: async (_email: string, options: unknown) => {
          captured = options;
          return { data: null, error: null };
        },
      }),
      { passwordResetRedirectTo: 'mypetapp://reset' }
    );

    await repository.requestPasswordReset(USER.email);

    expect(captured).toEqual({ redirectTo: 'mypetapp://reset' });
  });
});

describe('auth state changes', () => {
  function listeningClient() {
    let handler: ((event: string, session: unknown) => void) | null = null;
    let unsubscribed = false;
    const client = clientWith({
      onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
        handler = callback;
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                unsubscribed = true;
              },
            },
          },
        };
      },
    });
    return {
      client,
      emit: (event: string, session: unknown) => handler?.(event, session),
      wasUnsubscribed: () => unsubscribed,
    };
  }

  it.each([
    ['INITIAL_SESSION', 'initial'],
    ['SIGNED_IN', 'signed-in'],
    ['SIGNED_OUT', 'signed-out'],
    ['TOKEN_REFRESHED', 'token-refreshed'],
    ['USER_UPDATED', 'user-updated'],
    ['PASSWORD_RECOVERY', 'password-recovery'],
  ])('normalises %s to %s', (providerEvent, expected) => {
    const { client, emit } = listeningClient();
    const seen: string[] = [];
    createSupabaseAuthRepository(client).onAuthStateChange((event) => seen.push(event));

    emit(providerEvent, SESSION);

    expect(seen).toEqual([expected]);
  });

  /** MFA events and anything a future provider version adds are ignored, not guessed at. */
  it('ignores an event it does not recognise', () => {
    const { client, emit } = listeningClient();
    const seen: string[] = [];
    createSupabaseAuthRepository(client).onAuthStateChange((event) => seen.push(event));

    emit('MFA_CHALLENGE_VERIFIED', SESSION);

    expect(seen).toEqual([]);
  });

  it('maps the session on the way through', () => {
    const { client, emit } = listeningClient();
    let received: unknown = undefined;
    createSupabaseAuthRepository(client).onAuthStateChange((_event, session) => {
      received = session;
    });

    emit('SIGNED_IN', SESSION);

    expect(received).toMatchObject({ user: { id: USER.id, email: USER.email } });
  });

  it('unsubscribes through the returned function', () => {
    const { client, wasUnsubscribed } = listeningClient();
    const unsubscribe = createSupabaseAuthRepository(client).onAuthStateChange(() => {});

    unsubscribe();

    expect(wasUnsubscribed()).toBe(true);
  });
});
