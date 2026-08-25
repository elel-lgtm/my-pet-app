import { env } from '@/lib/env';
import { ConfigurationError } from '@/lib/errors';
import {
  createSupabaseClient,
  getSupabaseClient,
  isSupabaseConfigured,
  requireSupabaseConfig,
  resetSupabaseClient,
} from '@/lib/supabase';

// jest.setup.ts supplies obviously fake credentials. No test here reaches the network: creating a
// Supabase client opens no connection, and no query is ever issued.
const CONFIG = { url: 'https://test-project.supabase.co', publishableKey: 'sb_publishable_test' };

describe('createSupabaseClient', () => {
  beforeEach(() => {
    resetSupabaseClient();
  });

  it('builds a usable client from explicit configuration', () => {
    const client = createSupabaseClient(CONFIG);

    expect(typeof client.from).toBe('function');
    expect(client.auth).toBeDefined();
  });

  it('disables session persistence, because authentication is not implemented yet', () => {
    const client = createSupabaseClient(CONFIG);

    // Reaching into internals is unpleasant, but this is the assertion that matters: with
    // persistence on and no storage adapter, supabase-js reaches for `localStorage`, which does
    // not exist in React Native.
    const auth = client.auth as unknown as {
      persistSession?: boolean;
      autoRefreshToken?: boolean;
    };
    expect(auth.persistSession).toBe(false);
    expect(auth.autoRefreshToken).toBe(false);
  });
});

describe('requireSupabaseConfig', () => {
  it('returns configuration that is present', () => {
    expect(requireSupabaseConfig(CONFIG)).toBe(CONFIG);
  });

  it('throws a configuration error that names the variables to set', () => {
    expect(() => requireSupabaseConfig(null)).toThrow(ConfigurationError);
    expect(() => requireSupabaseConfig(null)).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
    expect(() => requireSupabaseConfig(null)).toThrow(/EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it('does not leak a key value in the failure message', () => {
    try {
      requireSupabaseConfig(null);
      throw new Error('expected a throw');
    } catch (thrown) {
      expect((thrown as Error).message).not.toContain('sb_publishable');
      expect((thrown as Error).message).not.toContain('sb_secret');
    }
  });
});

describe('getSupabaseClient', () => {
  beforeEach(() => {
    resetSupabaseClient();
  });

  it('reuses one client rather than opening a connection per call', () => {
    expect(getSupabaseClient()).toBe(getSupabaseClient());
  });

  it('builds a fresh client after a reset', () => {
    const first = getSupabaseClient();
    resetSupabaseClient();

    expect(getSupabaseClient()).not.toBe(first);
  });

  it('reports configuration from the environment abstraction, not from process.env', () => {
    expect(isSupabaseConfigured()).toBe(true);
    expect(env.supabase?.url).toBe('https://test-project.supabase.co');
  });
});
