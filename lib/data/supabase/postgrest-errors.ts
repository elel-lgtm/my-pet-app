/**
 * Translates PostgREST and PostgreSQL failures into the app's `AppError` vocabulary.
 *
 * The same two rules as the auth mapper apply, for the same reasons.
 *
 * **The provider's message is discarded.** A database error names tables, columns, constraints, and
 * sometimes the offending value. None of that belongs on a screen: it is written for whoever wrote
 * the schema, and it tells an attacker about the shape of the data. The original goes to the
 * logger; the `AppError` carries copy written for the reader.
 *
 * **A row hidden by row-level security is reported as absent, not as forbidden.** RLS filters
 * rather than refuses, so a `SELECT` for someone else's pet returns nothing and arrives here as a
 * missing row. That is the right answer to surface too: replying "forbidden" would confirm the row
 * exists, which is precisely what the policy is hiding.
 */

import { AppError, type ErrorCode } from '@/lib/errors';
import { logger } from '@/lib/logger';

const log = logger.child('data');

/** The shape PostgREST returns. Structural, so no supabase-js type needs importing. */
export type ProviderDatabaseError = {
  readonly message?: string | undefined;
  readonly code?: string | undefined;
  readonly details?: string | undefined;
  readonly hint?: string | undefined;
};

type Mapping = { readonly code: ErrorCode; readonly message: string };

/**
 * SQLSTATE (and PostgREST) code → what the user is told.
 *
 * Constraint violations become `validation`, because in practice they mean the input was wrong in
 * a way the client's own validation should have caught — and saying so points the user at the
 * form rather than at us.
 */
const BY_CODE: Record<string, Mapping> = {
  // Insufficient privilege: a write the policy refused, or a table with no policy for this action.
  '42501': {
    code: 'unauthorized',
    message: 'You do not have permission to do that.',
  },
  // PostgREST: `.single()` matched no rows.
  PGRST116: {
    code: 'not_found',
    message: "We couldn't find what you were looking for.",
  },
  // Unique violation.
  '23505': {
    code: 'validation',
    message: 'That already exists.',
  },
  // Foreign key violation — a referenced row is missing or not visible.
  '23503': {
    code: 'validation',
    message: 'Something this refers to no longer exists.',
  },
  // Not-null violation.
  '23502': {
    code: 'validation',
    message: 'Something required was missing.',
  },
  // Check constraint violation. The database caught what validation should have.
  '23514': {
    code: 'validation',
    message: 'Some of those details are not valid.',
  },
  // Invalid text representation, e.g. a malformed uuid in a route parameter.
  '22P02': {
    code: 'validation',
    message: 'That request was not valid.',
  },
  // JWT missing or expired.
  PGRST301: {
    code: 'unauthorized',
    message: 'Your session has expired. Please sign in again.',
  },
};

const NETWORK: Mapping = {
  code: 'network',
  message: 'You appear to be offline. Check your connection and try again.',
};

const UNEXPECTED: Mapping = {
  code: 'unexpected',
  message: 'Something went wrong. Please try again.',
};

function looksLikeNetworkFailure(error: ProviderDatabaseError): boolean {
  const message = error.message?.toLowerCase() ?? '';
  return message.includes('fetch') || message.includes('network');
}

/**
 * Maps a provider error to an `AppError` carrying user-safe copy.
 *
 * `operation` names the call that failed and appears only in the log line — the single place the
 * provider's own text is retained.
 */
export function toDatabaseError(error: ProviderDatabaseError, operation: string): AppError {
  const known = error.code === undefined ? undefined : BY_CODE[error.code];
  const mapping = known ?? (looksLikeNetworkFailure(error) ? NETWORK : UNEXPECTED);

  log.warn('Database request failed', {
    operation,
    providerCode: error.code ?? 'unknown',
    providerMessage: error.message ?? '',
    providerDetails: error.details ?? '',
  });

  return new AppError(mapping.code, mapping.message, {
    context: { operation, providerCode: error.code ?? 'unknown' },
  });
}

/** The error used when a row is genuinely absent, or hidden from the caller by a policy. */
export function notFoundError(entity: string, operation: string): AppError {
  return new AppError('not_found', "We couldn't find what you were looking for.", {
    context: { entity, operation },
  });
}
