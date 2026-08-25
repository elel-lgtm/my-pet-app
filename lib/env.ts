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

/**
 * Connection details for the Supabase project.
 *
 * Both values are public: they ship in the bundle and are visible to anyone who installs the app.
 * That is by design — the publishable key identifies the project and grants nothing on its own.
 * Every actual permission comes from row-level security evaluated against the caller's session.
 *
 * A privileged key (`sb_secret_…`, or a legacy `service_role` JWT) must never appear here. It
 * bypasses row-level security entirely, and shipping one in a mobile bundle hands every installed
 * copy of the app unrestricted access to every user's data. `parseEnv` rejects one outright.
 */
export type SupabaseConfig = {
  /** Project URL, without a trailing slash. */
  readonly url: string;
  /** The publishable (formerly "anon") client key. Public, not privileged. */
  readonly publishableKey: string;
};

export type Env = {
  /** Which deployment this bundle is built for. Drives logging verbosity and config strictness. */
  readonly appEnvironment: AppEnvironment;
  /** Base URL of the backend API, without a trailing slash. */
  readonly apiUrl: string;
  /** Minimum level the logger will emit. */
  readonly logLevel: LogLevel;
  /**
   * `null` when the project is not configured, which is permitted only in development so the app
   * still runs for someone who has not set a project up. Anything that needs it should go through
   * `getSupabaseClient()`, which fails with a clear message rather than a null dereference.
   */
  readonly supabase: SupabaseConfig | null;
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
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
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

/**
 * Decodes a JWT payload without verifying it.
 *
 * Verification is irrelevant here: the question is only "what does this token claim to be", asked
 * so a privileged key can be recognised and refused before it is compiled into a bundle. An
 * attacker forging a token to look *less* privileged than it is gains nothing.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  const payload = parts[1];
  if (parts.length !== 3 || payload === undefined) {
    return null;
  }

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    if (typeof atob !== 'function') {
      return null;
    }
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Whether a key grants privileged, row-level-security-bypassing access.
 *
 * Covers both key generations: the current `sb_secret_…` format and the legacy `service_role`
 * JWT. Pasting either into a public variable is the single most damaging configuration mistake
 * available in this project, so it is checked rather than trusted to a code review.
 */
export function looksPrivileged(key: string): boolean {
  if (key.startsWith('sb_secret_')) {
    return true;
  }
  const payload = decodeJwtPayload(key);
  return payload?.role === 'service_role';
}

/**
 * Reads the Supabase pair.
 *
 * Note that no problem message ever includes the key itself. The publishable key is not a secret,
 * but a privileged key pasted into the wrong slot very much is, and the failure path for that
 * mistake must not be "print it to the console".
 */
function readSupabase(
  rawUrl: string | undefined,
  rawKey: string | undefined,
  problems: string[],
  required: boolean
): SupabaseConfig | null {
  const url = rawUrl === undefined || rawUrl === '' ? null : rawUrl;
  const key = rawKey === undefined || rawKey === '' ? null : rawKey;

  if (url === null && key === null) {
    if (required) {
      problems.push(
        'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required outside development.'
      );
    }
    return null;
  }

  // Half a configuration is always a mistake, and a confusing one to debug at runtime.
  if (url === null || key === null) {
    problems.push(
      'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set together.'
    );
    return null;
  }

  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(url);
  } catch {
    problems.push(`EXPO_PUBLIC_SUPABASE_URL must be an absolute URL — received "${url}".`);
  }

  if (parsedUrl !== null) {
    const isLocal = parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1';
    // A plaintext connection to a remote project would expose every request in transit.
    if (parsedUrl.protocol !== 'https:' && !isLocal) {
      problems.push(
        `EXPO_PUBLIC_SUPABASE_URL must use https for a remote project — received "${parsedUrl.protocol}//".`
      );
    }
  }

  if (looksPrivileged(key)) {
    problems.push(
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY looks like a privileged key (service_role or sb_secret_). ' +
        'A privileged key bypasses row-level security and must never ship in the app bundle. ' +
        'Use the publishable key from the Supabase dashboard instead.'
    );
  }

  if (problems.length > 0) {
    return null;
  }

  return {
    url: parsedUrl === null ? url : parsedUrl.toString().replace(/\/$/, ''),
    publishableKey: key,
  };
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

  const supabase = readSupabase(
    raw.supabaseUrl,
    raw.supabasePublishableKey,
    problems,
    // Optional locally so the app still runs without a project; mandatory in anything shipped.
    !isDevelopment
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
    supabase,
    isDevelopment,
    isProduction: appEnvironment === 'production',
  };
}

export const env: Env = parseEnv(RAW);
