/**
 * The native session storage adapter, exercised against a fake keystore.
 *
 * `expo-secure-store` is mocked with an in-memory map that also enforces the real constraint the
 * adapter exists to work around: a size limit per value. Without chunking, a Supabase session
 * exceeds it and the write fails — which would look like "signed out again after every restart".
 */

const mockStore = new Map<string, string>();

// Named with a `mock` prefix: jest forbids a mock factory from touching anything else.
/** Below the smallest limit any platform has been observed to enforce. */
const mockLimit = 2048;

jest.mock('expo-secure-store', () => ({
  async setItemAsync(key: string, value: string) {
    if (value.length > mockLimit) {
      throw new Error(`value too large for key ${key}`);
    }
    mockStore.set(key, value);
  },
  async getItemAsync(key: string) {
    return mockStore.get(key) ?? null;
  },
  async deleteItemAsync(key: string) {
    mockStore.delete(key);
  },
}));

import { sessionStorage } from '@/lib/supabase/session-storage';

const KEY = 'sb-testproject-auth-token';

beforeEach(() => mockStore.clear());

describe('session storage', () => {
  it('returns null for a key that was never written', async () => {
    expect(await sessionStorage.getItem(KEY)).toBeNull();
  });

  it('round-trips a small value', async () => {
    await sessionStorage.setItem(KEY, 'small');

    expect(await sessionStorage.getItem(KEY)).toBe('small');
  });

  it('round-trips a session larger than the platform limit', async () => {
    // A real session with tokens and a user object comfortably exceeds 2 KB.
    const session = JSON.stringify({ access_token: 'a'.repeat(4000), user: { id: 'x' } });

    await sessionStorage.setItem(KEY, session);

    expect(await sessionStorage.getItem(KEY)).toBe(session);
  });

  it('keeps every chunk under the platform limit', async () => {
    await sessionStorage.setItem(KEY, 'x'.repeat(9000));

    for (const value of mockStore.values()) {
      expect(value.length).toBeLessThanOrEqual(mockLimit);
    }
  });

  it('removes every trace of a value', async () => {
    await sessionStorage.setItem(KEY, 'y'.repeat(5000));

    await sessionStorage.removeItem(KEY);

    expect(await sessionStorage.getItem(KEY)).toBeNull();
    expect(mockStore.size).toBe(0);
  });

  /** Overwriting a long session with a short one must not leave the old tail readable. */
  it('does not leave the tail of a longer previous value behind', async () => {
    await sessionStorage.setItem(KEY, 'old'.repeat(3000));

    await sessionStorage.setItem(KEY, 'new');

    expect(await sessionStorage.getItem(KEY)).toBe('new');
  });

  /** Half a session is not a session: a torn write must read as "signed out", not as garbage. */
  it('reports absence when a chunk has gone missing', async () => {
    await sessionStorage.setItem(KEY, 'z'.repeat(5000));
    const chunkKeys = [...mockStore.keys()].filter((key) => key !== KEY);
    mockStore.delete(chunkKeys[0] as string);

    expect(await sessionStorage.getItem(KEY)).toBeNull();
  });

  it('cleans up after a torn write, so the next read is not confused too', async () => {
    await sessionStorage.setItem(KEY, 'z'.repeat(5000));
    mockStore.delete([...mockStore.keys()].filter((key) => key !== KEY)[0] as string);

    await sessionStorage.getItem(KEY);

    expect(mockStore.size).toBe(0);
  });

  it('ignores a corrupt chunk count rather than reading arbitrary keys', async () => {
    mockStore.set(KEY, 'not-a-number');

    expect(await sessionStorage.getItem(KEY)).toBeNull();
  });

  it('sanitises characters the keystore will not accept in a key', async () => {
    await sessionStorage.setItem('sb-project:auth/token', 'value');

    expect(mockStore.size).toBeGreaterThan(0);
    for (const key of mockStore.keys()) {
      expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
    }
  });
});
