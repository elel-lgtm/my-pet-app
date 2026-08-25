/**
 * The single source of truth for who is signed in.
 *
 * One provider, mounted once at the root. Screens read it through `useAuth`; nothing else keeps a
 * copy. Duplicated auth state is how an app ends up showing a signed-out header above signed-in
 * content.
 *
 * The provider owns three things: the state machine, the subscription to provider events, and the
 * token-refresh lifecycle. It does not own form state — sign-in and sign-up return their failures
 * to the caller so the screen can show them next to the field concerned.
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
import { AppState, type AppStateStatus } from 'react-native';

import {
  authReducer,
  initialAuthState,
  isAuthenticated,
  isResolvingSession,
  sessionOf,
  type AuthState,
} from '@/features/auth/auth-state';
import { getAuthRepository, type AuthRepository, type SignUpOutcome } from '@/lib/data';
import {
  parsePasswordResetRequest,
  parseSignInCredentials,
  parseSignUpCredentials,
  type AuthSession,
} from '@/lib/domain/auth';
import { toAppError, type AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { err, ok, type Result } from '@/lib/result';

const log = logger.child('auth');

export type AuthContextValue = {
  readonly state: AuthState;
  readonly session: AuthSession | null;
  readonly isAuthenticated: boolean;
  readonly isResolvingSession: boolean;
  signIn(input: unknown): Promise<Result<AuthSession, AppError>>;
  signUp(input: unknown): Promise<Result<SignUpOutcome, AppError>>;
  signOut(): Promise<Result<void, AppError>>;
  requestPasswordReset(input: unknown): Promise<Result<void, AppError>>;
  /** Re-runs session restoration after an `error` state. */
  retry(): void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export type AuthProviderProps = {
  readonly children: ReactNode;
  /** Injected in tests. Production resolves the Supabase-backed repository lazily. */
  readonly repository?: AuthRepository | undefined;
};

export function AuthProvider({ children, repository }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);

  // Resolved once and held, so a re-render cannot swap the repository mid-flight.
  const repositoryRef = useRef<AuthRepository | null>(repository ?? null);
  const resolveRepository = useCallback((): AuthRepository => {
    repositoryRef.current ??= getAuthRepository();
    return repositoryRef.current;
  }, []);

  const isRestoring = state.status === 'initializing';

  /**
   * The subscription to provider events, established once and held for the provider's lifetime.
   *
   * Deliberately *not* tied to the restoring flag. Tying the two together tears the subscription
   * down the moment start-up finishes, and the app then stops hearing about a session revoked on
   * another device, a failed refresh, or a sign-out — it would look signed in until the next cold
   * start. The subscription is also set up before any `getSession` call, because supabase-js emits
   * `INITIAL_SESSION` during its own start-up and a later subscriber misses it.
   */
  useEffect(() => {
    let active = true;
    let auth: AuthRepository;

    try {
      auth = resolveRepository();
    } catch (thrown) {
      // Supabase not configured. A legible error beats a blank screen.
      dispatch({ type: 'restore-failed', error: toAppError(thrown) });
      return;
    }

    const unsubscribe = auth.onAuthStateChange((event, session) => {
      if (!active) {
        return;
      }
      // The session object is never logged: it carries the access and refresh tokens.
      log.debug('Auth state changed', { event, hasSession: session !== null });
      dispatch({ type: 'session-changed', session });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [resolveRepository]);

  /** Restoration. Runs at start-up, and again whenever a failed attempt is retried. */
  useEffect(() => {
    if (!isRestoring) {
      return;
    }

    let active = true;
    let auth: AuthRepository;

    try {
      auth = resolveRepository();
    } catch (thrown) {
      dispatch({ type: 'restore-failed', error: toAppError(thrown) });
      return;
    }

    void (async () => {
      const result = await auth.getSession();
      if (!active) {
        return;
      }
      if (result.ok) {
        dispatch({ type: 'restored', session: result.value });
      } else {
        dispatch({ type: 'restore-failed', error: result.error });
      }
    })();

    return () => {
      active = false;
    };
  }, [isRestoring, resolveRepository]);

  /**
   * Token refresh follows the app's lifecycle rather than running on a free-standing timer.
   *
   * A backgrounded React Native app has its timers throttled or suspended, so a refresh scheduled
   * while backgrounded may fire long after the token expired — or not at all. Starting on
   * foreground and stopping on background means the refresh happens when there is a live app to
   * use the result.
   */
  const authenticated = isAuthenticated(state);
  useEffect(() => {
    if (!authenticated) {
      return;
    }
    const auth = repositoryRef.current;
    if (auth === null) {
      return;
    }

    // Anything that is not explicitly backgrounded counts as foreground. `currentState` can be
    // null or 'unknown' early in a cold start, and treating that as "do not refresh" would leave
    // the token unrefreshed for the whole first foreground session.
    if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') {
      auth.startAutoRefresh();
    }

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        auth.startAutoRefresh();
      } else {
        auth.stopAutoRefresh();
      }
    });

    return () => {
      subscription.remove();
      auth.stopAutoRefresh();
    };
  }, [authenticated]);

  const signIn = useCallback(
    async (input: unknown): Promise<Result<AuthSession, AppError>> => {
      const parsed = parseSignInCredentials(input);
      if (!parsed.ok) {
        return parsed;
      }
      // The resulting session arrives through the event subscription, which is the only writer of
      // signed-in state. Dispatching here as well would set it twice from two sources.
      return resolveRepository().signIn(parsed.value);
    },
    [resolveRepository]
  );

  const signUp = useCallback(
    async (input: unknown): Promise<Result<SignUpOutcome, AppError>> => {
      const parsed = parseSignUpCredentials(input);
      if (!parsed.ok) {
        return parsed;
      }
      return resolveRepository().signUp(parsed.value);
    },
    [resolveRepository]
  );

  const signOut = useCallback(async (): Promise<Result<void, AppError>> => {
    dispatch({ type: 'sign-out-started' });
    const result = await resolveRepository().signOut();

    if (!result.ok) {
      // The local session is cleared regardless. Leaving someone signed in after they asked to
      // sign out — on a shared or lost device — is a worse outcome than a stale server session,
      // and the stored tokens are dropped either way.
      log.warn('Sign-out failed on the server; clearing local session anyway', {
        code: result.error.code,
      });
      dispatch({ type: 'session-changed', session: null });
      return result;
    }

    // A successful sign-out emits SIGNED_OUT, but dispatching here too makes the transition
    // immediate and independent of provider timing.
    dispatch({ type: 'session-changed', session: null });
    return ok(undefined);
  }, [resolveRepository]);

  const requestPasswordReset = useCallback(
    async (input: unknown): Promise<Result<void, AppError>> => {
      const parsed = parsePasswordResetRequest(input);
      if (!parsed.ok) {
        return err(parsed.error);
      }
      return resolveRepository().requestPasswordReset(parsed.value.email);
    },
    [resolveRepository]
  );

  const retry = useCallback(() => dispatch({ type: 'retrying' }), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      session: sessionOf(state),
      isAuthenticated: isAuthenticated(state),
      isResolvingSession: isResolvingSession(state),
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      retry,
    }),
    [state, signIn, signUp, signOut, requestPasswordReset, retry]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    // A thrown error beats a silently signed-out app: the latter looks like a session bug and
    // sends someone hunting through the auth layer for a missing provider.
    throw new Error('useAuth must be used inside an <AuthProvider>.');
  }
  return value;
}
