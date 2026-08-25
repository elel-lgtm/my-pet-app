/**
 * The authentication state machine.
 *
 * Kept as a pure reducer, separate from the provider that drives it, so every transition can be
 * tested without React, a renderer, or a mocked network.
 *
 * ## What is and is not "auth state"
 *
 * This models the **session**: whether someone is signed in, and whether we have finished finding
 * out. It does not model form failures. A rejected password is an ordinary result returned to the
 * screen that asked, held there next to the field it concerns — routing it through global state
 * would tear the whole app down to an error screen because someone mistyped.
 *
 * The `error` status is reserved for the session layer itself failing: session restoration threw,
 * or the provider could not be reached at start-up. The router treats it as "not authenticated"
 * and offers a retry.
 */

import { type AuthSession } from '@/lib/domain/auth';
import { type AppError } from '@/lib/errors';

export type AuthState =
  /** Looking for a stored session. Nothing private may render in this state. */
  | { readonly status: 'initializing' }
  | { readonly status: 'signed-out' }
  | { readonly status: 'signed-in'; readonly session: AuthSession }
  /** Sign-out is in flight. The session is retained so the UI can stay stable during the wait. */
  | { readonly status: 'signing-out'; readonly session: AuthSession }
  /** The session layer failed. Not the same as a rejected password. */
  | { readonly status: 'error'; readonly error: AppError };

export type AuthStatus = AuthState['status'];

export type AuthAction =
  /** Start-up finished: either a session was restored or there was none. */
  | { readonly type: 'restored'; readonly session: AuthSession | null }
  | { readonly type: 'restore-failed'; readonly error: AppError }
  /** The provider reported a change — sign-in, sign-out elsewhere, token refresh. */
  | { readonly type: 'session-changed'; readonly session: AuthSession | null }
  | { readonly type: 'sign-out-started' }
  | { readonly type: 'retrying' };

export const initialAuthState: AuthState = { status: 'initializing' };

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'restored':
      return action.session === null
        ? { status: 'signed-out' }
        : { status: 'signed-in', session: action.session };

    case 'restore-failed':
      return { status: 'error', error: action.error };

    /**
     * The provider is authoritative, whatever we thought a moment ago. A refresh that fails, a
     * session revoked on another device, or a token that expired all arrive here, and each must be
     * able to move the app out of `signed-in` — including out of `signing-out`, which is how a
     * successful sign-out completes.
     */
    case 'session-changed':
      return action.session === null
        ? { status: 'signed-out' }
        : { status: 'signed-in', session: action.session };

    case 'sign-out-started':
      // Only meaningful from a signed-in state; anything else is already on its way out.
      return state.status === 'signed-in'
        ? { status: 'signing-out', session: state.session }
        : state;

    case 'retrying':
      return state.status === 'error' ? { status: 'initializing' } : state;
  }
}

/**
 * Whether the app may show authenticated content.
 *
 * `signing-out` counts as signed in: the session is still valid until the provider says otherwise,
 * and flipping the router mid-sign-out would unmount the screen that is awaiting the call.
 */
export function isAuthenticated(state: AuthState): boolean {
  return state.status === 'signed-in' || state.status === 'signing-out';
}

/**
 * Whether the app is still deciding.
 *
 * Route guards must hold everything back while this is true. Rendering a protected screen against
 * an unrestored session shows private chrome to someone who may turn out to be signed out, and
 * fires queries that the database will refuse.
 */
export function isResolvingSession(state: AuthState): boolean {
  return state.status === 'initializing';
}

export function sessionOf(state: AuthState): AuthSession | null {
  return state.status === 'signed-in' || state.status === 'signing-out' ? state.session : null;
}
