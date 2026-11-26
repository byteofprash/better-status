import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';

process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.SESSION_SECRET = 'test-session-secret-123456';
process.env.APP_URL = 'https://bs.example.com';

const { decrypt, encrypt, sign, verify } = await import('../src/crypto.ts');
const { talonHost } = await import('../src/talonUrl.ts');
const { useStore, loadUser, saveUser, saveUserState, listUserIds } = await import('../src/store.ts');
const { startSession } = await import('../src/web.ts');
const { settings } = await import('../src/routes/settings.ts');
const { syncUsers, chunk } = await import('../src/runSync.ts');
const worker = (await import('../src/worker.ts')).default;

const mem = new Map<string, string>();
useStore({
  get: async (id) => mem.get(id) ?? null,
  put: async (id, b) => void mem.set(id, b),
  del: async (id) => void mem.delete(id),
  ids: async () => [...mem.keys()],
});

test('encryption round-trips and is randomised', async () => {
  const a = await encrypt('secret');
  assert.equal(await decrypt(a), 'secret');
  assert.notEqual(a, await encrypt('secret'));
  await assert.rejects(decrypt(a.slice(0, -4) + 'AAAA'));
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

const post = (action: string, extra: Record<string, string> = {}, o: { cookie?: string; origin?: string } = {}) =>
  settings(new Request('https://bs.example.com/api/settings', {
    method: 'POST',
    headers: { ...(o.cookie ? { cookie: o.cookie } : {}), ...(o.origin ? { origin: o.origin } : {}) },
    body: new URLSearchParams({ action, ...extra }),
  }));

test('settings: needs session, same origin, valid URL; key stored encrypted and never echoed', async () => {
  await saveUser({ id: 'T1-U1', slackToken: 'xoxp-secret', state: {} });
  const cookie = startSession('T1-U1').split(';')[0];

  assert.equal((await post('save')).status, 303); // no session -> back to landing
  assert.equal((await post('save', {}, { cookie, origin: 'https://evil.com' })).status, 403);

  const bad = await (await post('save', { talonUrl: 'https://169.254.169.254' }, { cookie })).text();
  assert.match(bad, /must be a Talon\.One host/);

  const ok = await (await post('save', { talonUrl: 'https://acme.talon.one', talonKey: 'ABCDEFGH1234' }, { cookie, origin: 'https://bs.example.com' })).text();
  assert.match(ok, /Saved/);
  assert.doesNotMatch(ok, /ABCDEFGH1234/);
  assert.match(ok, /…1234/);

  const u = await loadUser('T1-U1');
  assert.equal(u?.talonUrl, 'acme.talon.one');
  assert.equal(u?.talonKey, 'ABCDEFGH1234');
  assert.doesNotMatch(mem.get('T1-U1')!, /ABCDEFGH|xoxp/); // ciphertext at rest

  await post('save', { talonUrl: 'acme.talon.one', talonKey: '' }, { cookie }); // blank keeps old key
  assert.equal((await loadUser('T1-U1'))?.talonKey, 'ABCDEFGH1234');
});

test('background state save never clobbers settings changed meanwhile', async () => {
  const stale = (await loadUser('T1-U1'))!;
  const cookie = startSession('T1-U1').split(';')[0];
  await post('save', { talonUrl: 'new.talon.one' }, { cookie }); // user edits during a sync...
  stale.state.lastError = 'boom';
  await saveUserState('T1-U1', stale.state); // ...then the sync writes its state back
  const u = await loadUser('T1-U1');
  assert.equal(u?.talonUrl, 'new.talon.one');
  assert.equal(u?.state.lastError, 'boom');
});

test('syncUsers skips incomplete users without touching the network', async () => {
  const res = await syncUsers(['T1-U1', 'missing'], { googleClientId: 'x', googleClientSecret: 'y' });
  assert.deepEqual(res, { synced: 0, failed: 0 }); // no Google token yet
});

test('disconnect deletes the user', async () => {
  const cookie = startSession('T1-U1').split(';')[0];
  const res = await post('disconnect', {}, { cookie });
  assert.equal(res.status, 303);
  assert.equal(await loadUser('T1-U1'), null);
  assert.deepEqual(await listUserIds(), []);
});

test('chunking', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 10), []);
});

test('worker: routes, 404, and cron fan-out into queue messages of 10 users', async () => {
  for (let i = 0; i < 25; i++) mem.set(`u${i}`, 'x');
  const sent: { body: { ids: string[] } }[][] = [];
  const e = {
    DB: { // fake D1: only `SELECT id FROM users` is needed by the cron
      prepare: (sql: string) => ({ bind: () => ({
        all: async () => { assert.match(sql, /SELECT id FROM users/); return { results: [...mem.keys()].map((id) => ({ id })) }; },
        first: async () => null, run: async () => ({}),
      }) }),
    },
    SYNC_QUEUE: { sendBatch: async (m: { body: { ids: string[] } }[]) => void sent.push(m) },
    ...process.env,
  } as never;
  assert.equal((await worker.fetch(new Request('https://bs.example.com/nope'), e)).status, 404);

  await worker.scheduled({}, e);
  const msgs = sent.flat();
  assert.equal(msgs.length, 3);
  assert.deepEqual(msgs.map((m) => m.body.ids.length), [10, 10, 5]);
});
