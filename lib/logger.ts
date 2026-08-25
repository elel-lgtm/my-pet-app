/**
 * The application logger.
 *
 * Application code calls this instead of `console` (enforced by an ESLint rule) so that log level
 * is configurable per build, every record carries a scope, and there is exactly one seam to attach
 * a crash reporter to later — see `setLogSink`. No reporting SDK is wired up yet; that decision is
 * deferred until there is a product to report on.
 */

import { env, type LogLevel } from '@/lib/env';
import { isAppError, toAppError } from '@/lib/errors';

export type LogRecord = {
  readonly level: Exclude<LogLevel, 'silent'>;
  readonly scope: string;
  readonly message: string;
  readonly data?: Record<string, unknown>;
  readonly error?: Error;
  readonly timestamp: string;
};

export type LogSink = (record: LogRecord) => void;

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

/**
 * Keys whose values are replaced before a record leaves the process.
 *
 * Covers credentials and authentication material of every generation: passwords, bearer tokens,
 * JWTs, cookies, API keys, and both Supabase key formats. `publishable` is included even though a
 * publishable key is not secret — redacting it costs nothing and keeps project identity out of
 * whatever third-party sink a log record eventually reaches.
 */
const REDACTED_KEY_PATTERN =
  /(password|token|secret|authorization|api[-_]?key|cookie|jwt|bearer|credential|publishable|anon[-_]?key|service[-_]?role)/i;

function redact(data: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (REDACTED_KEY_PATTERN.test(key)) {
      output[key] = '[redacted]';
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = redact(value as Record<string, unknown>);
    } else {
      output[key] = value;
    }
  }
  return output;
}

const consoleSink: LogSink = (record) => {
  const prefix = `[${record.level}] ${record.scope}:`;
  const details = record.data ? [record.data] : [];
  const error = record.error ? [record.error] : [];

  switch (record.level) {
    case 'error':
      console.error(prefix, record.message, ...details, ...error);
      break;
    case 'warn':
      console.warn(prefix, record.message, ...details, ...error);
      break;
    default:
      console.log(prefix, record.message, ...details, ...error);
  }
};

let sinks: LogSink[] = [consoleSink];
let minimumLevel: LogLevel = env.logLevel;

/**
 * Registers an additional destination for log records — a crash reporter, an analytics pipeline,
 * or an in-memory buffer in tests. Returns a function that removes it again.
 */
export function setLogSink(sink: LogSink): () => void {
  sinks = [...sinks, sink];
  return () => {
    sinks = sinks.filter((candidate) => candidate !== sink);
  };
}

/** Overrides the configured level at runtime. Intended for tests and debug menus. */
export function setLogLevel(level: LogLevel): void {
  minimumLevel = level;
}

function emit(
  level: Exclude<LogLevel, 'silent'>,
  scope: string,
  message: string,
  data?: Record<string, unknown>,
  error?: Error
): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[minimumLevel]) {
    return;
  }
  const record: LogRecord = {
    level,
    scope,
    message,
    // Spread conditionally rather than assigning `undefined`: `exactOptionalPropertyTypes` draws
    // a distinction between "absent" and "present but undefined", and absent is what we mean.
    ...(data ? { data: redact(data) } : {}),
    ...(error ? { error } : {}),
    timestamp: new Date().toISOString(),
  };
  for (const sink of sinks) {
    sink(record);
  }
}

export type Logger = {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  /** Accepts the thrown value directly; it is normalised to an `AppError` before logging. */
  error(message: string, thrown?: unknown, data?: Record<string, unknown>): void;
  /** Derives a nested logger, e.g. `logger.child('api').child('pets')` → scope `app:api:pets`. */
  child(scope: string): Logger;
};

export function createLogger(scope: string): Logger {
  return {
    debug: (message, data) => emit('debug', scope, message, data),
    info: (message, data) => emit('info', scope, message, data),
    warn: (message, data) => emit('warn', scope, message, data),
    error: (message, thrown, data) => {
      const appError = thrown === undefined ? undefined : toAppError(thrown);
      emit(
        'error',
        scope,
        message,
        {
          ...data,
          ...(appError && isAppError(appError) ? { code: appError.code, ...appError.context } : {}),
        },
        appError
      );
    },
    child: (childScope) => createLogger(`${scope}:${childScope}`),
  };
}

/** The root logger. Prefer `logger.child('<area>')` over logging directly to the root scope. */
export const logger = createLogger('app');
