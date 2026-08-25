/**
 * Translates Supabase authentication failures into the app's `AppError` vocabulary.
 *
 * Two things happen here, and both matter.
 *
 * **The provider's message is discarded.** Auth error text is written for developers and leaks
 * detail that should not reach a screen: whether an address is registered, why a token was
 * rejected, internal identifiers. Every `AppError` produced here carries copy written for the
 * person reading it, and the original message goes to the logger instead.
 *
 * **Sign-in failures are deliberately vague.** "Email or password is incorrect" is returned
 * whether the address is unknown or the password is wrong. Distinguishing them turns the sign-in
 * form into an account-existence oracle, which is how credential-stuffing lists get validated.
 */

import { AppError, type ErrorCode } from '@/lib/errors';
import { logger } from '@/lib/logger';

const log = logger.child('auth');

/** The shape supabase-js returns. Structural, so its error class need not be imported. */
export type ProviderAuthError = {
  readonly message?: string | undefined;
  readonly code?: string | undefined;
  readonly status?: number | undefined;
};

type Mapping = { readonly code: ErrorCode; readonly message: string };

const GENERIC_CREDENTIALS: Mapping = {
  code: 'unauthorized',
  message: 'Email or password is incorrect.',
};

const SESSION_EXPIRED: Mapping = {
  code: 'unauthorized',
  message: 'Your session has expired. Please sign in again.',
};

const ACCOUNT_EXISTS: Mapping = {
  code: 'validation',
  message: 'An account with that email already exists. Try signing in instead.',
};

/**
 * Provider error code → what the user is told.
 *
 * A code absent from this table falls through to a generic message rather than surfacing text
 * nobody has reviewed.
 */
const BY_CODE: Record<string, Mapping> = {
  invalid_credentials: GENERIC_CREDENTIALS,
  // Deliberately identical to the above: a distinct "no such account" reply confirms the address.
  user_not_found: GENERIC_CREDENTIALS,

  email_not_confirmed: {
    code: 'unauthorized',
    message: 'Check your email and confirm your address before signing in.',
  },
  email_exists: ACCOUNT_EXISTS,
  user_already_exists: ACCOUNT_EXISTS,
  weak_password: {
    code: 'validation',
    message: 'That password is too easy to guess. Try a longer one.',
  },
  same_password: {
    code: 'validation',
    message: 'That is already your current password.',
  },
  over_request_rate_limit: {
    code: 'server',
    message: 'Too many attempts. Wait a minute and try again.',
  },
  over_email_send_rate_limit: {
    code: 'server',
    message: 'Too many emails sent. Wait a few minutes and try again.',
  },
  user_banned: {
    code: 'unauthorized',
    message: 'This account has been suspended. Contact support.',
  },
  signup_disabled: {
    code: 'server',
    message: 'New accounts are not being accepted right now.',
  },
  session_expired: SESSION_EXPIRED,
  session_not_found: SESSION_EXPIRED,
  refresh_token_not_found: SESSION_EXPIRED,
  refresh_token_already_used: SESSION_EXPIRED,
  validation_failed: {
    code: 'validation',
    message: 'Check the details you entered and try again.',
  },
};

const NETWORK: Mapping = {
  code: 'network',
  message: 'You appear to be offline. Check your connection and try again.',
};

const SERVER: Mapping = {
  code: 'server',
  message: 'Our end had a problem. Please try again in a moment.',
};

const UNEXPECTED: Mapping = {
  code: 'unexpected',
  message: 'Something went wrong. Please try again.',
};

function looksLikeNetworkFailure(error: ProviderAuthError): boolean {
  // A transport failure reaches us with no HTTP status and a fetch-shaped message.
  if (error.status !== undefined) {
    return false;
  }
  const message = error.message?.toLowerCase() ?? '';
  return message.includes('fetch') || message.includes('network');
}

function mappingFor(error: ProviderAuthError): Mapping {
  const known = error.code === undefined ? undefined : BY_CODE[error.code];
  if (known !== undefined) {
    return known;
  }
  if (looksLikeNetworkFailure(error)) {
    return NETWORK;
  }
  if (error.status !== undefined && error.status >= 500) {
    return SERVER;
  }
  return UNEXPECTED;
}

/**
 * Maps a provider error to an `AppError` carrying user-safe copy.
 *
 * `operation` names the call that failed and is used only in the log line — which is the single
 * place the provider's own text is retained.
 */
export function toAuthError(error: ProviderAuthError, operation: string): AppError {
  const mapping = mappingFor(error);

  // The provider's message is recorded here and nowhere else. It is not a credential, but it is
  // unreviewed text, so it stops at the log sink rather than travelling to a screen.
  log.warn('Authentication failed', {
    operation,
    providerCode: error.code ?? 'unknown',
    status: error.status ?? 0,
    providerMessage: error.message ?? '',
  });

  return new AppError(mapping.code, mapping.message, {
    context: { operation, providerCode: error.code ?? 'unknown' },
  });
}
