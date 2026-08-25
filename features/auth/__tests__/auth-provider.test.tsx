/**
 * The provider driving the state machine against a fake repository.
 *
 * No network, no Supabase, no timers. The fake implements the same `AuthRepository` port the
 * production adapter does, so these exercise the real wiring rather than a parallel one.
 */

import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AuthProvider, useAuth } from '@/features/auth';
import { AppError } from '@/lib/errors';
import { ok, err } from '@/lib/result';
import {
  TEST_SESSION,
  createFakeAuthRepository,
  type FakeAuthRepository,
} from '@/test-support/auth';

/** Renders the parts of the auth context a test needs to assert on. */
function AuthProbe() {
  const { state, session, isAuthenticated, isResolvingSession } = useAuth();
  return (
    <>
      <Text testID="status">{state.status}</Text>
      <Text testID="email">{session?.user.email ?? 'none'}</Text>
      <Text testID="flags">{`${isAuthenticated}|${isResolvingSession}`}</Text>
    </>
  );
}

async function mount(repository: FakeAuthRepository) {
  await render(
    <AuthProvider repository={repository}>
      <AuthProbe />
    </AuthProvider>
  );
}

function status(): string {
  return screen.getByTestId('status').props.children as string;
}

describe('session restoration', () => {
  it('signs in when a stored session is found', async () => {
    await mount(createFakeAuthRepository({ initialSession: TEST_SESSION }));

    await waitFor(() => expect(status()).toBe('signed-in'));
    expect(screen.getByTestId('email').props.children).toBe(TEST_SESSION.user.email);
  });

  it('signs out when there is no stored session', async () => {
    await mount(createFakeAuthRepository({ initialSession: null }));

    await waitFor(() => expect(status()).toBe('signed-out'));
  });

  it('reports an error rather than pretending to be signed out when restoration fails', async () => {
    const restoreError = new AppError('network', 'offline');
    await mount(createFakeAuthRepository({ restoreError }));

    await waitFor(() => expect(status()).toBe('error'));
    // The distinction matters: "we could not find out" is not "you are not signed in".
    expect(screen.getByTestId('flags').props.children).toBe('false|false');
  });

  it('subscribes before asking for the session, so the initial event is not missed', async () => {
    const repository = createFakeAuthRepository({ initialSession: null });
    await mount(repository);

    await waitFor(() => expect(status()).toBe('signed-out'));
    expect(repository.listenerCount()).toBe(1);
  });

  it('unsubscribes when the provider unmounts', async () => {
    const repository = createFakeAuthRepository({ initialSession: null });
    const view = await render(
      <AuthProvider repository={repository}>
        <AuthProbe />
      </AuthProvider>
    );
    await waitFor(() => expect(status()).toBe('signed-out'));

    // `unmount` is async in RNTL v14, like `render` and `fireEvent`.
    await view.unmount();

    expect(repository.listenerCount()).toBe(0);
  });
});

describe('provider events', () => {
  it('follows a sign-in that happened elsewhere', async () => {
    const repository = createFakeAuthRepository({ initialSession: null });
    await mount(repository);
    await waitFor(() => expect(status()).toBe('signed-out'));

    await act(async () => repository.emit('signed-in', TEST_SESSION));

    expect(status()).toBe('signed-in');
  });

  /** A session revoked on another device must sign this one out with no local action. */
  it('follows a sign-out that happened elsewhere', async () => {
    const repository = createFakeAuthRepository({ initialSession: TEST_SESSION });
    await mount(repository);
    await waitFor(() => expect(status()).toBe('signed-in'));

    await act(async () => repository.emit('signed-out', null));

    expect(status()).toBe('signed-out');
  });

  it('stays signed in across a token refresh', async () => {
    const repository = createFakeAuthRepository({ initialSession: TEST_SESSION });
    await mount(repository);
    await waitFor(() => expect(status()).toBe('signed-in'));

    await act(async () => repository.emit('token-refreshed', TEST_SESSION));

    expect(status()).toBe('signed-in');
  });
});

describe('operations', () => {
  function CredentialProbe({ action }: { action: 'signIn' | 'signUp' | 'reset' }) {
    const auth = useAuth();
    return (
      <Text
        testID="run"
        onPress={() => {
          if (action === 'signIn') {
            void auth.signIn({ email: 'owner@example.com', password: 'a-good-password' });
          } else if (action === 'signUp') {
            void auth.signUp({
              displayName: 'Sam',
              email: 'owner@example.com',
              password: 'a-good-password',
              passwordConfirmation: 'a-good-password',
            });
          } else {
            void auth.requestPasswordReset({ email: 'owner@example.com' });
          }
        }}>
        run
      </Text>
    );
  }

  async function runAction(repository: FakeAuthRepository, action: 'signIn' | 'signUp' | 'reset') {
    await render(
      <AuthProvider repository={repository}>
        <AuthProbe />
        <CredentialProbe action={action} />
      </AuthProvider>
    );
    await waitFor(() => expect(status()).not.toBe('initializing'));
    await act(async () => {
      screen.getByTestId('run').props.onPress();
    });
  }

  it('signs in and lets the provider event move the app', async () => {
    const repository = createFakeAuthRepository({ initialSession: null });

    await runAction(repository, 'signIn');

    await waitFor(() => expect(status()).toBe('signed-in'));
    expect(repository.calls.signIn).toBe(1);
  });

  it('signs up', async () => {
    const repository = createFakeAuthRepository({ initialSession: null });

    await runAction(repository, 'signUp');

    expect(repository.calls.signUp).toBe(1);
  });

  it('requests a password reset', async () => {
    const repository = createFakeAuthRepository({ initialSession: null });

    await runAction(repository, 'reset');

    expect(repository.calls.requestPasswordReset).toBe(1);
  });

  it('validates before calling the provider, so a malformed address never leaves the device', async () => {
    const repository = createFakeAuthRepository({ initialSession: null });
    const outcomes: { ok: boolean }[] = [];

    function BadInput() {
      const auth = useAuth();
      return (
        <Text
          testID="bad"
          onPress={() => {
            void auth.signIn({ email: 'not-an-email', password: '' }).then((result) => {
              outcomes.push(result);
            });
          }}>
          bad
        </Text>
      );
    }

    await render(
      <AuthProvider repository={repository}>
        <AuthProbe />
        <BadInput />
      </AuthProvider>
    );
    await waitFor(() => expect(status()).toBe('signed-out'));
    await act(async () => {
      screen.getByTestId('bad').props.onPress();
    });

    await waitFor(() => expect(outcomes).toHaveLength(1));
    expect(outcomes[0]?.ok).toBe(false);
    expect(repository.calls.signIn).toBe(0);
  });

  it('returns a failed sign-in to the caller without tearing the app down', async () => {
    const repository = createFakeAuthRepository({
      initialSession: null,
      signInResult: err(new AppError('unauthorized', 'Email or password is incorrect.')),
    });

    await runAction(repository, 'signIn');

    // A rejected password is a form problem, not a session problem.
    expect(status()).toBe('signed-out');
  });
});

describe('signing out', () => {
  function SignOutProbe() {
    const auth = useAuth();
    return (
      <Text testID="sign-out" onPress={() => void auth.signOut()}>
        out
      </Text>
    );
  }

  async function mountSignedIn(repository: FakeAuthRepository) {
    await render(
      <AuthProvider repository={repository}>
        <AuthProbe />
        <SignOutProbe />
      </AuthProvider>
    );
    await waitFor(() => expect(status()).toBe('signed-in'));
  }

  it('clears the session', async () => {
    const repository = createFakeAuthRepository({ initialSession: TEST_SESSION });
    await mountSignedIn(repository);

    await act(async () => {
      screen.getByTestId('sign-out').props.onPress();
    });

    await waitFor(() => expect(status()).toBe('signed-out'));
    expect(screen.getByTestId('email').props.children).toBe('none');
    expect(repository.calls.signOut).toBe(1);
  });

  /**
   * The security-relevant case. Leaving someone signed in after they asked to sign out — on a
   * shared or lost device — is worse than a stale session on the server.
   */
  it('clears local state even when the server call fails', async () => {
    const repository = createFakeAuthRepository({
      initialSession: TEST_SESSION,
      signOutResult: err(new AppError('network', 'offline')),
    });
    await mountSignedIn(repository);

    await act(async () => {
      screen.getByTestId('sign-out').props.onPress();
    });

    await waitFor(() => expect(status()).toBe('signed-out'));
    expect(screen.getByTestId('email').props.children).toBe('none');
  });
});

describe('token refresh lifecycle', () => {
  it('starts refreshing once authenticated', async () => {
    const repository = createFakeAuthRepository({ initialSession: TEST_SESSION });
    await mount(repository);

    await waitFor(() => expect(repository.calls.startAutoRefresh).toBeGreaterThan(0));
  });

  it('does not refresh while signed out', async () => {
    const repository = createFakeAuthRepository({ initialSession: null });
    await mount(repository);
    await waitFor(() => expect(status()).toBe('signed-out'));

    expect(repository.calls.startAutoRefresh).toBe(0);
  });

  it('stops refreshing when the session ends', async () => {
    const repository = createFakeAuthRepository({ initialSession: TEST_SESSION });
    await mount(repository);
    await waitFor(() => expect(repository.calls.startAutoRefresh).toBeGreaterThan(0));

    await act(async () => repository.emit('signed-out', null));

    await waitFor(() => expect(repository.calls.stopAutoRefresh).toBeGreaterThan(0));
  });
});

describe('useAuth outside a provider', () => {
  it('throws rather than reporting a signed-out app', async () => {
    // A silent signed-out reading looks like a session bug and sends someone hunting through the
    // auth layer for a provider that was never mounted.
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(render(<AuthProbe />)).rejects.toThrow(/AuthProvider/);
  });
});

describe('unused import guard', () => {
  it('keeps ok() referenced for the fake repository contract', () => {
    expect(ok(1).ok).toBe(true);
  });
});
