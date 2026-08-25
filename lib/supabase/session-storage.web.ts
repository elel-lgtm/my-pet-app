/**
 * Session storage for web.
 *
 * `expo-secure-store` has no web implementation, and the browser offers no keystore equivalent, so
 * this falls back to `localStorage` — which is what supabase-js would use on web by default. The
 * chunking the native implementation needs is pointless here: `localStorage` has no per-value size
 * limit worth working around.
 *
 * Every access is guarded. `localStorage` throws rather than returning null in a handful of real
 * situations: Safari private browsing, storage disabled by policy, and any context where the page
 * is treated as third-party. A thrown storage error must not take the whole app down, so a failure
 * degrades to "no session" and the user signs in again.
 */

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const sessionStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return storage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      storage()?.setItem(key, value);
    } catch {
      // Nothing useful to do: the session simply will not survive a reload.
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      storage()?.removeItem(key);
    } catch {
      // As above.
    }
  },
};
