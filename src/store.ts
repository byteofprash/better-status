import { decrypt, encrypt } from './crypto.ts';
import type { UserRecord, UserState } from './types.ts';

/** Where encrypted per-user blobs live. Production: Cloudflare D1. Tests: in-memory. */
export interface Store {
  get(id: string): Promise<string | null>;
  put(id: string, blob: string): Promise<void>;
  del(id: string): Promise<void>;
  ids(): Promise<string[]>;
}

/** The slice of the D1 API we use (avoids needing Workers type packages). */
export interface D1Like {
  prepare(sql: string): {
    bind(...v: unknown[]): {
      first<T>(): Promise<T | null>;
      run(): Promise<unknown>;
      all<T>(): Promise<{ results: T[] }>;
    };
  };
}

export const d1Store = (db: D1Like): Store => ({
  get: async (id) => (await db.prepare('SELECT blob FROM users WHERE id = ?1').bind(id).first<{ blob: string }>())?.blob ?? null,
  put: async (id, blob) =>
    void (await db
      .prepare(
        'INSERT INTO users (id, blob, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET blob = excluded.blob, updated_at = excluded.updated_at',
      )
      .bind(id, blob, new Date().toISOString())
      .run()),
  del: async (id) => void (await db.prepare('DELETE FROM users WHERE id = ?1').bind(id).run()),
  ids: async () => (await db.prepare('SELECT id FROM users').bind().all<{ id: string }>()).results.map((r) => r.id),
});

let impl: Store | undefined;
const store = () => {
  if (!impl) throw new Error('Store not initialised');
  return impl;
};
export const useStore = (s: Store) => void (impl = s);

export async function loadUser(id: string): Promise<UserRecord | null> {
  const blob = await store().get(id);
  return blob ? (JSON.parse(await decrypt(blob)) as UserRecord) : null;
}

export async function saveUser(u: UserRecord): Promise<void> {
  await store().put(u.id, await encrypt(JSON.stringify(u)));
}

/**
 * Persist only the sync state. Re-reads the record first so a background sync never
 * overwrites settings the user changed while it was running.
 */
export async function saveUserState(id: string, state: UserState): Promise<void> {
  const fresh = await loadUser(id);
  if (!fresh) return; // disconnected meanwhile
  fresh.state = state;
  await saveUser(fresh);
}

export const deleteUser = (id: string) => store().del(id);
export const listUserIds = () => store().ids();
