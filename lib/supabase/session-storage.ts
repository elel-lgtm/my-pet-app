import * as SecureStore from 'expo-secure-store';

/**
 * Session storage for native platforms, backed by the device keystore.
 *
 * Supabase persists the session as one JSON blob containing the access token, the refresh token,
 * and the user object. The refresh token is the sensitive part: it is long-lived and exchangeable
 * for new access tokens, so anyone who reads it holds the account until it is revoked. That rules
 * out AsyncStorage, which is a plaintext file readable from any backup or rooted device, and
 * points at `expo-secure-store` — Keychain on iOS, Keystore-encrypted preferences on Android.
 *
 * SecureStore has a practical size limit: historically iOS has rejected values much above 2 KB,
 * and a Supabase session routinely exceeds that once the user object is included. The values are
 * therefore split into fixed-size chunks across several keys, with a small index key recording how
 * many chunks a value occupies. Chunking keeps everything in the keystore and avoids the
 * alternative — encrypting the blob ourselves with `aes-js` and storing the key in SecureStore —
 * which would add three dependencies and a hand-rolled crypto path to review.
 *
 * The web implementation lives in `session-storage.web.ts`; SecureStore does not support web.
 */

/** Comfortably under the smallest limit any platform has been observed to enforce. */
const CHUNK_SIZE = 1800;

/** Bounds the work done on a corrupt index, and is far above any realistic session size. */
const MAX_CHUNKS = 20;

function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

/**
 * SecureStore rejects keys containing characters outside this set. Supabase's default storage key
 * (`sb-<project-ref>-auth-token`) is already safe, but a project ref is not ours to guarantee.
 */
function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

async function readChunkCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(safeKey(key));
  if (raw === null) {
    return 0;
  }
  const count = Number.parseInt(raw, 10);
  if (!Number.isInteger(count) || count < 1 || count > MAX_CHUNKS) {
    return 0;
  }
  return count;
}

async function clearChunks(key: string, count: number): Promise<void> {
  const deletions: Promise<void>[] = [];
  for (let index = 0; index < count; index += 1) {
    deletions.push(SecureStore.deleteItemAsync(safeKey(chunkKey(key, index))));
  }
  await Promise.all(deletions);
}

export const sessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await readChunkCount(key);
    if (count === 0) {
      return null;
    }

    const chunks = await Promise.all(
      Array.from({ length: count }, (_unused, index) =>
        SecureStore.getItemAsync(safeKey(chunkKey(key, index)))
      )
    );

    // A missing chunk means the value was written partially or cleared halfway. Half a session is
    // not a session: report absence and let Supabase treat the user as signed out.
    if (chunks.some((chunk) => chunk === null)) {
      await this.removeItem(key);
      return null;
    }

    return chunks.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    // Remove first so a shorter value cannot leave a longer one's tail behind, which would
    // deserialise into a corrupt session on the next read.
    await this.removeItem(key);

    const chunks: string[] = [];
    for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
      chunks.push(value.slice(offset, offset + CHUNK_SIZE));
    }

    await Promise.all(
      chunks.map((chunk, index) => SecureStore.setItemAsync(safeKey(chunkKey(key, index)), chunk))
    );
    await SecureStore.setItemAsync(safeKey(key), String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    const count = await readChunkCount(key);
    // Sweep beyond the recorded count so a stale index cannot strand chunks in the keystore.
    await clearChunks(key, Math.max(count, MAX_CHUNKS));
    await SecureStore.deleteItemAsync(safeKey(key));
  },
};
