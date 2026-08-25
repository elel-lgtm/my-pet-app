import {
  authReducer,
  initialAuthState,
  isAuthenticated,
  isResolvingSession,
  sessionOf,
  type AuthState,
} from '@/features/auth';
import { TEST_SESSION } from '@/test-support/auth';
import { AppError } from '@/lib/errors';

const SIGNED_IN: AuthState = { status: 'signed-in', session: TEST_SESSION };
const FAILURE = new AppError('network', 'offline');

describe('initial state', () => {
  it('starts by resolving, never by assuming signed out', () => {
    // Starting at `signed-out` would bounce a returning user to the sign-in screen for a frame
    // before their stored session was found.
    expect(initialAuthState.status).toBe('initializing');
    expect(isResolvingSession(initialAuthState)).toBe(true);
    expect(isAuthenticated(initialAuthState)).toBe(false);
  });
});

describe('restoration', () => {
  it('signs in when a session was found', () => {
    const next = authReducer(initialAuthState, { type: 'restored', session: TEST_SESSION });

    expect(next).toEqual(SIGNED_IN);
  });

  it('signs out when there was none', () => {
    const next = authReducer(initialAuthState, { type: 'restored', session: null });

    expect(next.status).toBe('signed-out');
  });

  it('enters the error state when restoration fails', () => {
    const next = authReducer(initialAuthState, { type: 'restore-failed', error: FAILURE });

    expect(next).toEqual({ status: 'error', error: FAILURE });
    // An error is not authentication, and must not be mistaken for it.
    expect(isAuthenticated(next)).toBe(false);
  });

  it('returns to resolving when a failure is retried', () => {
    const failed = authReducer(initialAuthState, { type: 'restore-failed', error: FAILURE });

    expect(authReducer(failed, { type: 'retrying' }).status).toBe('initializing');
  });

  it('ignores a retry from any state that is not an error', () => {
    expect(authReducer(SIGNED_IN, { type: 'retrying' })).toBe(SIGNED_IN);
  });
});

describe('provider events', () => {
  it('signs in when a session arrives', () => {
    const next = authReducer(
      { status: 'signed-out' },
      { type: 'session-changed', session: TEST_SESSION }
    );

    expect(next).toEqual(SIGNED_IN);
  });

  /**
   * The provider is authoritative. A session revoked on another device, or a refresh that failed,
   * has to be able to move the app out of `signed-in` without any local action.
   */
  it('signs out when the session disappears', () => {
    const next = authReducer(SIGNED_IN, { type: 'session-changed', session: null });

    expect(next.status).toBe('signed-out');
  });

  it('recovers from the error state when a session turns up', () => {
    const failed: AuthState = { status: 'error', error: FAILURE };

    expect(authReducer(failed, { type: 'session-changed', session: TEST_SESSION })).toEqual(
      SIGNED_IN
    );
  });
});

describe('signing out', () => {
  it('moves to signing-out and keeps the session for the duration', () => {
    const next = authReducer(SIGNED_IN, { type: 'sign-out-started' });

    expect(next).toEqual({ status: 'signing-out', session: TEST_SESSION });
  });

  /**
   * `signing-out` still counts as authenticated: flipping the router mid-call would unmount the
   * screen that is awaiting the result.
   */
  it('is still treated as authenticated while the call is in flight', () => {
    const signingOut = authReducer(SIGNED_IN, { type: 'sign-out-started' });

    expect(isAuthenticated(signingOut)).toBe(true);
    expect(sessionOf(signingOut)).toBe(TEST_SESSION);
  });

  it('completes when the session is reported gone', () => {
    const signingOut = authReducer(SIGNED_IN, { type: 'sign-out-started' });
    const next = authReducer(signingOut, { type: 'session-changed', session: null });

    expect(next.status).toBe('signed-out');
    expect(isAuthenticated(next)).toBe(false);
    expect(sessionOf(next)).toBeNull();
  });

  it('ignores a sign-out started from a state that has no session', () => {
    const signedOut: AuthState = { status: 'signed-out' };

    expect(authReducer(signedOut, { type: 'sign-out-started' })).toBe(signedOut);
  });
});

describe('selectors', () => {
  it.each([
    ['initializing', false],
    ['signed-out', false],
    ['error', false],
  ] as const)('does not treat %s as authenticated', (status, expected) => {
    const state =
      status === 'error' ? ({ status, error: FAILURE } as AuthState) : ({ status } as AuthState);

    expect(isAuthenticated(state)).toBe(expected);
  });

  it('only reports resolving while initializing', () => {
    expect(isResolvingSession(initialAuthState)).toBe(true);
    expect(isResolvingSession(SIGNED_IN)).toBe(false);
    expect(isResolvingSession({ status: 'error', error: FAILURE })).toBe(false);
  });

  it('exposes no session unless there is one', () => {
    expect(sessionOf({ status: 'signed-out' })).toBeNull();
    expect(sessionOf(initialAuthState)).toBeNull();
    expect(sessionOf(SIGNED_IN)).toBe(TEST_SESSION);
  });
});
