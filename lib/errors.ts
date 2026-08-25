/**
 * The application's error taxonomy.
 *
 * Every error that crosses a module boundary should be an `AppError`. Callers can then branch on
 * `error.code` instead of parsing messages, and the UI layer can map a small, closed set of codes
 * to user-facing copy without knowing where the failure came from.
 */

export type ErrorCode =
  /** The app is misconfigured — a missing env var, an invalid app config value. Not recoverable. */
  | 'configuration'
  /** The device could not reach the server: offline, DNS failure, timeout. Retryable. */
  | 'network'
  /** The server was reached and refused the request: 4xx/5xx. Retryable only for 5xx. */
  | 'server'
  /** Input failed validation, either from a user or from a payload we did not expect. */
  | 'validation'
  /** The requested resource does not exist. */
  | 'not_found'
  /** The caller is not authenticated, or is authenticated but not permitted. */
  | 'unauthorized'
  /** Reading or writing local persistence failed. */
  | 'storage'
  /** Anything we failed to classify. Treat as a bug worth investigating. */
  | 'unexpected';

export type ErrorContext = Record<string, unknown>;

export class AppError extends Error {
  readonly code: ErrorCode;
  /** Extra structured detail for logs. Must never contain secrets or personal data. */
  readonly context: ErrorContext;
  /** Whether retrying the same operation could plausibly succeed. */
  readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options: { cause?: unknown; context?: ErrorContext; retryable?: boolean } = {}
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.context = options.context ?? {};
    this.retryable = options.retryable ?? RETRYABLE_BY_DEFAULT.has(code);
  }
}

const RETRYABLE_BY_DEFAULT = new Set<ErrorCode>(['network', 'server']);

export class ConfigurationError extends AppError {
  constructor(message: string, options: { cause?: unknown; context?: ErrorContext } = {}) {
    super('configuration', message, { ...options, retryable: false });
    this.name = 'ConfigurationError';
  }
}

export class NetworkError extends AppError {
  constructor(message: string, options: { cause?: unknown; context?: ErrorContext } = {}) {
    super('network', message, options);
    this.name = 'NetworkError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, options: { cause?: unknown; context?: ErrorContext } = {}) {
    super('validation', message, { ...options, retryable: false });
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, options: { cause?: unknown; context?: ErrorContext } = {}) {
    super('not_found', message, { ...options, retryable: false });
    this.name = 'NotFoundError';
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Normalises anything thrown — including non-`Error` values, which JavaScript permits — into an
 * `AppError`, so error handling code never has to defend against `throw 'oops'`.
 */
export function toAppError(value: unknown, fallbackMessage = 'Something went wrong.'): AppError {
  if (isAppError(value)) {
    return value;
  }
  if (value instanceof Error) {
    return new AppError('unexpected', value.message || fallbackMessage, { cause: value });
  }
  return new AppError('unexpected', fallbackMessage, {
    cause: value,
    context: { thrown: typeof value },
  });
}

/** User-facing copy for a failure. Deliberately vague: details belong in logs, not on screen. */
export function userMessageFor(error: AppError): string {
  switch (error.code) {
    case 'network':
      return 'You appear to be offline. Check your connection and try again.';
    case 'server':
      return 'Our end had a problem. Please try again in a moment.';
    case 'not_found':
      return "We couldn't find what you were looking for.";
    case 'unauthorized':
      return 'You need to sign in to do that.';
    case 'validation':
      return error.message;
    case 'configuration':
    case 'storage':
    case 'unexpected':
    default:
      return 'Something went wrong. Please try again.';
  }
}
