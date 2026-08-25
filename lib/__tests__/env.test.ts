import { looksPrivileged, parseEnv } from '@/lib/env';
import { ConfigurationError } from '@/lib/errors';

const RAW_EMPTY = {
  appEnvironment: undefined,
  apiUrl: undefined,
  logLevel: undefined,
  supabaseUrl: undefined,
  supabasePublishableKey: undefined,
};

const SUPABASE_URL = 'https://abcdefghijklmnop.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_ABCdef123456';

/** Builds a JWT-shaped string with the given `role` claim. The signature is not checked. */
function jwtWithRole(role: string): string {
  const encode = (value: object): string =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ iss: 'supabase', ref: 'abcdefghijklmnop', role });
  return `${header}.${payload}.not-a-real-signature`;
}

const CONFIGURED = {
  ...RAW_EMPTY,
  supabaseUrl: SUPABASE_URL,
  supabasePublishableKey: PUBLISHABLE_KEY,
};

describe('parseEnv', () => {
  it('defaults to a usable development configuration when nothing is set', () => {
    const env = parseEnv(RAW_EMPTY);

    expect(env.appEnvironment).toBe('development');
    expect(env.apiUrl).toBe('http://localhost:3000');
    expect(env.logLevel).toBe('debug');
    expect(env.isDevelopment).toBe(true);
    expect(env.isProduction).toBe(false);
  });

  it('requires an explicit API url outside development', () => {
    expect(() => parseEnv({ ...CONFIGURED, appEnvironment: 'production' })).toThrow(
      ConfigurationError
    );
  });

  it('defaults production logging to info rather than debug', () => {
    const env = parseEnv({
      ...CONFIGURED,
      appEnvironment: 'production',
      apiUrl: 'https://api.example.com',
    });

    expect(env.logLevel).toBe('info');
    expect(env.isProduction).toBe(true);
  });

  it('strips a trailing slash so callers can concatenate paths safely', () => {
    const env = parseEnv({ ...RAW_EMPTY, apiUrl: 'https://api.example.com/' });
    expect(env.apiUrl).toBe('https://api.example.com');
  });

  it('rejects a relative API url', () => {
    expect(() => parseEnv({ ...RAW_EMPTY, apiUrl: '/api' })).toThrow(/absolute URL/);
  });

  it('rejects an unknown environment name', () => {
    expect(() => parseEnv({ ...RAW_EMPTY, appEnvironment: 'prod' })).toThrow(/must be one of/);
  });

  it('reports every problem at once rather than failing on the first', () => {
    try {
      parseEnv({ ...CONFIGURED, appEnvironment: 'staging', logLevel: 'loud' });
      throw new Error('expected parseEnv to throw');
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(ConfigurationError);
      const problems = (thrown as ConfigurationError).context.problems as string[];
      expect(problems).toHaveLength(2);
    }
  });

  it('treats an empty string as unset', () => {
    expect(
      parseEnv({ ...RAW_EMPTY, appEnvironment: '', apiUrl: '', logLevel: '' }).appEnvironment
    ).toBe('development');
  });
});

describe('Supabase configuration', () => {
  it('is optional in development, so the app runs without a project', () => {
    expect(parseEnv(RAW_EMPTY).supabase).toBeNull();
  });

  it('is read when both values are present', () => {
    const env = parseEnv(CONFIGURED);

    expect(env.supabase).toEqual({ url: SUPABASE_URL, publishableKey: PUBLISHABLE_KEY });
  });

  it('strips a trailing slash from the project url', () => {
    const env = parseEnv({ ...CONFIGURED, supabaseUrl: `${SUPABASE_URL}/` });

    expect(env.supabase?.url).toBe(SUPABASE_URL);
  });

  it('is required outside development', () => {
    expect(() =>
      parseEnv({ ...RAW_EMPTY, appEnvironment: 'production', apiUrl: 'https://api.example.com' })
    ).toThrow(/required outside development/);
  });

  it('rejects half a configuration, whichever half is missing', () => {
    expect(() => parseEnv({ ...RAW_EMPTY, supabaseUrl: SUPABASE_URL })).toThrow(/set together/);
    expect(() => parseEnv({ ...RAW_EMPTY, supabasePublishableKey: PUBLISHABLE_KEY })).toThrow(
      /set together/
    );
  });

  it('rejects a malformed project url', () => {
    expect(() => parseEnv({ ...CONFIGURED, supabaseUrl: 'not-a-url' })).toThrow(/absolute URL/);
  });

  it('rejects a plaintext connection to a remote project', () => {
    expect(() =>
      parseEnv({ ...CONFIGURED, supabaseUrl: 'http://abcdefghijklmnop.supabase.co' })
    ).toThrow(/https/);
  });

  it.each([['http://localhost:54321'], ['http://127.0.0.1:54321']])(
    'allows plaintext for a local stack at %s',
    (url) => {
      expect(parseEnv({ ...CONFIGURED, supabaseUrl: url }).supabase?.url).toBe(url);
    }
  );

  it('accepts a legacy anon JWT, since existing projects still issue them', () => {
    const anonKey = jwtWithRole('anon');

    expect(
      parseEnv({ ...CONFIGURED, supabasePublishableKey: anonKey }).supabase?.publishableKey
    ).toBe(anonKey);
  });
});

describe('privileged key protection', () => {
  it.each([
    ['a current secret key', 'sb_secret_ABCdef123456'],
    ['a legacy service_role JWT', jwtWithRole('service_role')],
  ])('refuses %s in the public variable', (_label, key) => {
    expect(() => parseEnv({ ...CONFIGURED, supabasePublishableKey: key })).toThrow(/privileged/);
  });

  /**
   * The point of the check is to stop a privileged key reaching the bundle. Printing it in the
   * error would move it straight into terminal scrollback and CI logs instead.
   */
  it('never echoes the offending key in the error', () => {
    const secret = 'sb_secret_SUPERSECRETVALUE';

    try {
      parseEnv({ ...CONFIGURED, supabasePublishableKey: secret });
      throw new Error('expected parseEnv to throw');
    } catch (thrown) {
      const error = thrown as ConfigurationError;
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error.message).not.toContain('SUPERSECRETVALUE');
      expect(JSON.stringify(error.context)).not.toContain('SUPERSECRETVALUE');
    }
  });

  it.each([
    ['sb_secret_abc', true],
    [jwtWithRole('service_role'), true],
    ['sb_publishable_abc', false],
    [jwtWithRole('anon'), false],
    ['', false],
    ['not-a-jwt-at-all', false],
  ])('classifies %s', (key, expected) => {
    expect(looksPrivileged(key)).toBe(expected);
  });
});
