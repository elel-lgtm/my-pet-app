import { parseEnv } from '@/lib/env';
import { ConfigurationError } from '@/lib/errors';

const RAW_EMPTY = { appEnvironment: undefined, apiUrl: undefined, logLevel: undefined };

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
    expect(() => parseEnv({ ...RAW_EMPTY, appEnvironment: 'production' })).toThrow(
      ConfigurationError
    );
  });

  it('defaults production logging to info rather than debug', () => {
    const env = parseEnv({
      appEnvironment: 'production',
      apiUrl: 'https://api.example.com',
      logLevel: undefined,
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
      parseEnv({ appEnvironment: 'staging', apiUrl: undefined, logLevel: 'loud' });
      throw new Error('expected parseEnv to throw');
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(ConfigurationError);
      const problems = (thrown as ConfigurationError).context.problems as string[];
      expect(problems).toHaveLength(2);
    }
  });

  it('treats an empty string as unset', () => {
    expect(parseEnv({ appEnvironment: '', apiUrl: '', logLevel: '' }).appEnvironment).toBe(
      'development'
    );
  });
});
