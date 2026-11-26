import { randomBytes } from 'node:crypto';
import { env } from './env.ts';
import { sign, verify } from './crypto.ts';
import { loadUser } from './store.ts';
import type { UserRecord } from './types.ts';

export const appUrl = () => {
  const u = env('APP_URL');
  if (!u) throw new Error('APP_URL must be set (e.g. https://better-status.vercel.app)');
  return u.replace(/\/$/, '');
};

const SESSION = 'bs_session';
const STATE = 'bs_state';

export function cookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export const cookie = (name: string, value: string, maxAge: number) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

export function page(body: string, status = 200, extra: string[] = []): Response {
  const h = new Headers({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  for (const c of extra) h.append('Set-Cookie', c);
  return new Response(body, { status, headers: h });
}

export function redirect(to: string, extra: string[] = []): Response {
  const h = new Headers({ Location: to });
  for (const c of extra) h.append('Set-Cookie', c);
  return new Response(null, { status: 303, headers: h });
}

export const startSession = (userId: string) =>
  cookie(SESSION, sign({ uid: userId, exp: Date.now() + 30 * 864e5 }), 30 * 86400);
export const endSession = () => cookie(SESSION, '', 0);

export async function currentUser(req: Request): Promise<UserRecord | null> {
  const s = verify<{ uid: string; exp: number }>(cookies(req)[SESSION]);
  if (!s || s.exp < Date.now()) return null;
  return loadUser(s.uid);
}

/** OAuth `state`: random value kept in a short-lived cookie and echoed back by the provider. */
export function newState(): { state: string; setCookie: string } {
  const state = randomBytes(16).toString('hex');
  return { state, setCookie: cookie(STATE, sign({ s: state, exp: Date.now() + 600_000 }), 600) };
}
export function checkState(req: Request, returned: string | null): boolean {
  const c = verify<{ s: string; exp: number }>(cookies(req)[STATE]);
  return Boolean(c && returned && c.exp > Date.now() && c.s === returned);
}
export const clearState = () => cookie(STATE, '', 0);

/** Reject cross-site form posts (defence in depth on top of SameSite=Lax). */
export function sameOrigin(req: Request): boolean {
  const o = req.headers.get('origin');
  return o === null || o === new URL(appUrl()).origin;
}
