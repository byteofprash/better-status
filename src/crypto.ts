import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env.ts';

async function aesKey(usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  const raw = Buffer.from(env('ENCRYPTION_KEY') ?? '', 'base64');
  if (raw.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32)');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [usage]);
}

/** AES-256-GCM via WebCrypto. Output: base64(iv | ciphertext+tag). */
export async function encrypt(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey('encrypt'), new TextEncoder().encode(plain));
  return Buffer.concat([iv, new Uint8Array(ct)]).toString('base64');
}

export async function decrypt(blob: string): Promise<string> {
  const b = Buffer.from(blob, 'base64');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12) }, await aesKey('decrypt'), b.subarray(12));
  return new TextDecoder().decode(pt);
}

const secret = () => {
  const s = env('SESSION_SECRET');
  if (!s || s.length < 16) throw new Error('SESSION_SECRET must be set (openssl rand -base64 32)');
  return s;
};

/** Signed, tamper-evident token: base64url(json).hmac */
export function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${createHmac('sha256', secret()).update(body).digest('base64url')}`;
}

export function verify<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const want = createHmac('sha256', secret()).update(body).digest();
  const got = Buffer.from(mac, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}
