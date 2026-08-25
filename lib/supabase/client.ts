/**
 * The Supabase client.
 *
 * One client for the whole app, created lazily and reused. Scattering `createClient` calls through
 * the codebase would mean several connections, several realtime sockets, and several places to fix
 * when configuration changes.
 *
 * **Nothing in `app/` or `components/` may import this.** Screens talk to feature logic, feature
 * logic talks to the ports in `@/lib/data`, and only a Supabase adapter behind those ports talks
 * to this client. That is what keeps queries out of render functions and the backend replaceable.
 *
 * ## What this is not
 *
 * Connecting a client secures nothing. At the time of writing:
 *
 * - **Authentication is not implemented.** Every request is unauthenticated, so `auth.uid()` is
 *   null and any policy depending on it denies.
 * - **Row-level security is not implemented**, because the schema does not exist yet.
 * - **The production schema does not exist.** There are no tables to query.
 *
 * The publishable key grants nothing on its own; it identifies the project. Authorization comes
 * from row-level security evaluated against the caller's session, and that work is still ahead.
 * See ARCHITECTURE.md and DATABASE.md.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env, type SupabaseConfig } from '@/lib/env';
import { type Database } from '@/lib/supabase/database.types';
import { ConfigurationError } from '@/lib/errors';
import { logger } from '@/lib/logger';

const log = logger.child('supabase');

/**
 * The client type used across the app.
 *
 * Parameterised by the generated `Database` type, so every query is checked against the real
 * schema: a misspelt column or a wrong enum value is a compile error rather than a runtime one.
 *
 * `Database` describes *rows*, not the domain. It stays inside this module and the data adapters;
 * nothing in `features/`, `components/`, or `app/` should ever name a generated row type. The
 * adapter owns the translation between the two vocabularies — see lib/data/README.md.
 */
export type AppSupabaseClient = SupabaseClient<Database>;

/**
 * Builds a client from explicit configuration.
 *
 * Exported separately from `getSupabaseClient` so it can be exercised without touching global
 * state or the ambient environment.
 */
export function createSupabaseClient(config: SupabaseConfig): AppSupabaseClient {
  return createClient<Database>(config.url, config.publishableKey, {
    auth: {
      // All three are off because authentication is not implemented yet. There is no session to
      // persist, nothing to refresh, and no browser redirect to inspect. Turning persistence on
      // without supplying a storage adapter would make supabase-js reach for `localStorage`,
      // which does not exist in React Native.
      //
      // When authentication lands, these become `true` alongside a storage adapter backed by
      // expo-secure-store, so tokens are held in the platform keystore rather than in plain
      // AsyncStorage. `detectSessionInUrl` stays false: it is a browser-only concern.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

let cachedClient: AppSupabaseClient | null = null;

/** Whether the app has Supabase configuration at all. */
export function isSupabaseConfigured(): boolean {
  return env.supabase !== null;
}

/**
 * Narrows optional configuration to present configuration.
 *
 * Throws rather than returning null so a caller cannot accidentally proceed against a client that
 * does not exist. Configuration is optional only in development; `parseEnv` already refuses to
 * build anything else without it.
 */
export function requireSupabaseConfig(config: SupabaseConfig | null): SupabaseConfig {
  if (config === null) {
    throw new ConfigurationError(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local — see .env.example.'
    );
  }
  return config;
}

/** The shared client, created on first use and reused thereafter. */
export function getSupabaseClient(): AppSupabaseClient {
  if (cachedClient !== null) {
    return cachedClient;
  }

  const config = requireSupabaseConfig(env.supabase);

  // The URL identifies the project and is public; the key is never logged, at any level.
  log.debug('Creating Supabase client', { url: config.url });

  cachedClient = createSupabaseClient(config);
  return cachedClient;
}

/** Drops the cached client. For tests and for a future sign-out that must not reuse a session. */
export function resetSupabaseClient(): void {
  cachedClient = null;
}
