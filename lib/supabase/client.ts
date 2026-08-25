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
 * ## What a connected client does and does not give you
 *
 * The publishable key grants nothing on its own; it identifies the project. Every permission comes
 * from row-level security evaluated against the caller's session. Authentication establishes
 * *identity*; authorization remains the database's job. See ARCHITECTURE.md and DATABASE.md.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env, type SupabaseConfig } from '@/lib/env';
import { type Database } from '@/lib/supabase/database.types';
import { sessionStorage } from '@/lib/supabase/session-storage';
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
      // Sessions are held in the device keystore on native and localStorage on web. See
      // session-storage.ts for why the native path chunks values rather than using AsyncStorage.
      storage: sessionStorage,
      persistSession: true,

      // Refresh is on, but the timer is driven by app lifecycle rather than left running: the
      // auth feature calls startAutoRefresh/stopAutoRefresh from an AppState listener, because a
      // backgrounded React Native app has its timers throttled and a refresh that fires late is
      // worse than one scheduled on foreground. See features/auth.
      autoRefreshToken: true,

      // Browser-only: it parses tokens out of a redirect URL fragment. React Native has no such
      // URL, and leaving it on makes supabase-js touch `window.location`.
      detectSessionInUrl: false,

      // PKCE over the implicit flow. It is the correct choice for a public client: the token is
      // exchanged with a proof the initiating app holds, so an intercepted redirect is not enough
      // to complete a sign-in.
      flowType: 'pkce',
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
