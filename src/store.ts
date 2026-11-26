import { decrypt, encrypt } from './crypto.ts';
import type { UserRecord } from './types.ts';

/** Minimal key/set store. Production: Upstash Redis (Vercel Marketplace). Tests: in-memory. */
export interface Store {
  get(k: string): Promise<string | null>;
  set(k: string, v: string): Promise<void>;
  del(k: string): Promise<void>;
  sadd(set: string, m: string): Promise<void>;
  srem(set: string, m: string): Promise<void>;
  smembers(set: string): Promise<string[]>;
}

function upstash(): Store {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Redis not configured (KV_REST_API_URL / KV_REST_API_TOKEN)');
  const cmd = async (...args: string[]) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(args),
    });
    const body = (await res.json()) as { result?: unknown; error?: string };
    if (!res.ok || body.error) throw new Error(`Redis error: ${body.error ?? res.status}`);
    return body.result;
  };
  return {
    get: async (k) => ((await cmd('GET', k)) as string | null) ?? null,
    set: async (k, v) => void (await cmd('SET', k, v)),
    del: async (k) => void (await cmd('DEL', k)),
    sadd: async (s, m) => void (await cmd('SADD', s, m)),
    srem: async (s, m) => void (await cmd('SREM', s, m)),
    smembers: async (s) => (await cmd('SMEMBERS', s)) as string[],
  };
}

let impl: Store | undefined;
const store = () => (impl ??= upstash());
export const useStore = (s: Store) => void (impl = s);

const USERS = 'bs:users';
const k = (id: string) => `bs:user:${id}`;

export async function loadUser(id: string): Promise<UserRecord | null> {
  const blob = await store().get(k(id));
  return blob ? (JSON.parse(decrypt(blob)) as UserRecord) : null;
}

export async function saveUser(u: UserRecord): Promise<void> {
  await store().set(k(u.id), encrypt(JSON.stringify(u)));
  await store().sadd(USERS, u.id);
}

export async function deleteUser(id: string): Promise<void> {
  await store().del(k(id));
  await store().srem(USERS, id);
}

export const listUserIds = () => store().smembers(USERS);
