/**
 * Typed, validated access to build-time configuration.
 *
 * This is the only module permitted to read `process.env` (enforced by an ESLint rule), for two
 * reasons. First, Metro only inlines environment variables on static `process.env.EXPO_PUBLIC_X`
 * dot access — bracket notation and destructuring silently produce `undefined` in a release
 * bundle, so the access pattern has to be reviewed in one place. Second, validating once at
 * startup turns a misconfigured build into an immediate, legible crash instead of an
 * `undefined` that surfaces three screens later.
 *
 * Everything here ships inside the JavaScript bundle and is readable by anyone with the app
 * installed. Never put a secret behind an `EXPO_PUBLIC_` variable.
 *
 * @see https://docs.expo.dev/guides/environment-variables/
 */

import { ConfigurationError } from '@/lib/errors';

export const APP_ENVIRONMENTS = ['development', 'staging', 'production'] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type Env = {
  /** Which deployment this bundle is built for. Drives logging verbosity and config strictness. */
  readonly appEnvironment: AppEnvironment;
  /** Base URL of the backend API, without a trailing slash. */
  readonly apiUrl: string;
  /** Minimum level the logger will emit. */
  readonly logLevel: LogLevel;
  readonly isDevelopment: boolean;
  readonly isProduction: boolean;
};

/**
 * Raw values, read exactly once and only via static dot access.
 * Adding a new variable means adding a line here *and* to `.env.example`.
 */
const RAW = {
  appEnvironment: process.env.EXPO_PUBLIC_APP_ENV,
  apiUrl: process.env.EXPO_PUBLIC_API_URL,
  logLevel: process.env.EXPO_PUBLIC_LOG_LEVEL,
} as const;

const DEVELOPMENT_API_URL = 'http://localhost:3000';

function oneOf<T extends string>(
  allowed: readonly T[],
  value: string | undefined,
  fallback: T,
  name: string,
  problems: string[]
): T {
  if (value === undefined || value === '') {
    return fallback;
  }
  if ((allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  problems.push(`${name} must be one of ${allowed.join(', ')} — received "${value}".`);
  return fallback;
}

function readUrl(
  value: string | undefined,
  name: string,
  problems: string[],
  fallback: string | null
): string {
  if (value === undefined || value === '') {
    if (fallback === null) {
      problems.push(`${name} is required but was not set.`);
      return '';
    }
    return fallback;
  }
  try {
    // `new URL` throws on anything that is not an absolute URL, which is what we want here.
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    problems.push(`${name} must be an absolute URL — received "${value}".`);
    return '';
  }
}

export function parseEnv(raw: typeof RAW): Env {
  const problems: string[] = [];

  const appEnvironment = oneOf(
    APP_ENVIRONMENTS,
    raw.appEnvironment,
    'development',
    'EXPO_PUBLIC_APP_ENV',
    problems
  );
  const isDevelopment = appEnvironment === 'development';

  const apiUrl = readUrl(
    raw.apiUrl,
    'EXPO_PUBLIC_API_URL',
    problems,
    // Local development gets a sane default; anything shipped to a device must be explicit.
    isDevelopment ? DEVELOPMENT_API_URL : null
  );

  const logLevel = oneOf(
    LOG_LEVELS,
    raw.logLevel,
    isDevelopment ? 'debug' : 'info',
    'EXPO_PUBLIC_LOG_LEVEL',
    problems
  );

  if (problems.length > 0) {
    throw new ConfigurationError(
      `Invalid environment configuration:\n  - ${problems.join('\n  - ')}\n` +
        'Copy .env.example to .env.local and fill in the missing values.',
      { context: { problems } }
    );
  }

  return {
    appEnvironment,
    apiUrl,
    logLevel,
    isDevelopment,
    isProduction: appEnvironment === 'production',
  };
}

export const env: Env = parseEnv(RAW);
