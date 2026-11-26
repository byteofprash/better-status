import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';

process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.SESSION_SECRET = 'test-session-secret-123456';
process.env.APP_URL = 'https://bs.example.com';
process.env.CRON_SECRET = 'cron-secret';

const { decrypt, encrypt, sign, verify } = await import('../src/crypto.ts');
const { talonHost } = await import('../src/talonUrl.ts');
const { useStore, loadUser, saveUser, listUserIds } = await import('../src/store.ts');
const { startSession } = await import('../src/web.ts');
const settings = await import('../api/settings.ts');
const cron = await import('../api/cron/sync.ts');

const mem = new Map<string, string>();
const sets = new Map<string, Set<string>>();
useStore({
  get: async (k) => mem.get(k) ?? null,
  set: async (k, v) => void mem.set(k, v),
  del: async (k) => void mem.delete(k),
  sadd: async (s, m) => void (sets.get(s) ?? sets.set(s, new Set()).get(s)!).add(m),
  srem: async (s, m) => void sets.get(s)?.delete(m),
  smembers: async (s) => [...(sets.get(s) ?? [])],
});

test('encryption round-trips and is randomised', () => {
  const a = encrypt('secret');
  assert.equal(decrypt(a), 'secret');
  assert.notEqual(a, encrypt('secret'));
  assert.throws(() => decrypt(a.slice(0, -4) + 'AAAA'));
});

test('signed tokens reject tampering', () => {
  const t = sign({ uid: 'u1' });
  assert.deepEqual(verify(t), { uid: 'u1' });
  assert.equal(verify(t.replace(/^./, (c) => (c === 'a' ? 'b' : 'a'))), null);
  assert.equal(verify(undefined), null);
});

test('talon URL allowlist blocks SSRF attempts', () => {
  assert.equal(talonHost('https://acme.europe-west1.talon.one/'), 'acme.europe-west1.talon.one');
  assert.equal(talonHost('acme.talon.one'), 'acme.talon.one');
  for (const bad of ['http://acme.talon.one', 'https://localhost', 'https://169.254.169.254', 'https://evil.com/.talon.one',
    'https://talon.one.evil.com', 'https://acme.talon.one:8443', 'https://a@acme.talon.one', 'https://talon.one', 'not a url'])
    assert.throws(() => talonHost(bad), undefined, bad);
});

const post = async (action: string, extra: Record<string, string> = {}, o: { cookie?: string; origin?: string } = {}) =>
  settings.POST(new Request('https://bs.example.com/api/settings', {
    method: 'POST',
    headers: { ...(o.cookie ? { cookie: o.cookie } : {}), ...(o.origin ? { origin: o.origin } : {}) },
    body: new URLSearchParams({ action, ...extra }),
  }));

test('settings: needs session, same origin, valid URL; key is stored encrypted and never echoed', async () => {
  await saveUser({ id: 'T1-U1', slackToken: 'xoxp-secret', state: {} });
  const cookie = startSession('T1-U1').split(';')[0];

  assert.equal((await post('save', {}, {})).status, 303); // no session -> redirect to landing
  assert.equal((await post('save', {}, { cookie, origin: 'https://evil.com' })).status, 403);

  const bad = await (await post('save', { talonUrl: 'https://169.254.169.254' }, { cookie })).text();
  assert.match(bad, /must be a Talon\.One host/);

  const ok = await (await post('save', { talonUrl: 'https://acme.talon.one', talonKey: 'ABCDEFGH1234' }, { cookie, origin: 'https://bs.example.com' })).text();
  assert.match(ok, /Saved/);
  assert.doesNotMatch(ok, /ABCDEFGH1234/); // key never rendered back
  assert.match(ok, /…1234/);

  const u = await loadUser('T1-U1');
  assert.equal(u?.talonUrl, 'acme.talon.one');
  assert.equal(u?.talonKey, 'ABCDEFGH1234');
  assert.doesNotMatch(mem.get('bs:user:T1-U1')!, /ABCDEFGH|xoxp/); // ciphertext at rest

  await post('save', { talonUrl: 'acme.talon.one', talonKey: '' }, { cookie }); // blank keeps old key
  assert.equal((await loadUser('T1-U1'))?.talonKey, 'ABCDEFGH1234');
});

test('disconnect deletes the user', async () => {
  const cookie = startSession('T1-U1').split(';')[0];
  const res = await post('disconnect', {}, { cookie });
  assert.equal(res.status, 303);
  assert.equal(await loadUser('T1-U1'), null);
  assert.deepEqual(await listUserIds(), []);
});

test('cron requires the secret', async () => {
  assert.equal((await cron.GET(new Request('https://bs.example.com/api/cron/sync'))).status, 401);
  const ok = await cron.GET(new Request('https://bs.example.com/api/cron/sync', { headers: { authorization: 'Bearer cron-secret' } }));
  assert.equal(ok.status, 200);
});
