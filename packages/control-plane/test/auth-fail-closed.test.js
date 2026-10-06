import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { sign, verify } from '../src/token.js';

// Load the real worker router. The SPA shell import (web/dist/index.html) is a
// wrangler Text rule, so stub any .html import as an empty string.
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(s, c, n) { return s.endsWith('.html') ? { url: 'stub:html', shortCircuit: true } : n(s, c); }
  export async function load(u, c, n) { return u === 'stub:html' ? { format: 'module', source: 'export default ""', shortCircuit: true } : n(u, c); }
`));
const worker = (await import('../src/index.js')).default;

const EMAIL = 'a@example.test';
const CODE = '00123456'; // the Uint32 random is pinned to 123456 below, so this is the 8-digit login code
const b64 = (s) => Buffer.from(s).toString('base64url');
const MAGIC = b64('{"t":"magic"'); // prefix of every magic sign-in token
const SESS = b64('{"t":"sess",'); // prefix of every session token
const CHALLENGE = b64('{"t":"challenge'); // prefix of every CLI challenge
const SECRET = 'bypass-secret-for-tests';
const BASE = { MASTER_KEY: 'master-key-for-tests' };
const MSG_WEB = "We couldn't send a sign-in email right now. Try again in a few minutes.";
const MSG_CLI = 'Could not send the login email right now. Try again in a few minutes.';
const MSG_VERIFY_DOWN = 'Could not complete the login right now. Try again in a few minutes.';
const MSG_429 = 'Too many login codes requested. Try again later.';
const realRandom = crypto.getRandomValues.bind(crypto);
const MIGRATION = ['0025-cli-login-challenges.sql', '0026-users.sql']
  .map((f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8')).join('\n');

// env.DB as D1 over in-memory SQLite with the 0025 and 0026 migrations applied (same adapter
// shape as learn-chat.test.js). migrate: false = the table is missing, as before the migration.
function withDb(t, env, { migrate = true } = {}) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  if (migrate) db.exec(MIGRATION);
  const DB = { prepare: (sql) => ({ bind: (...params) => ({
    first: async () => db.prepare(sql).get(...params) || null,
    all: async () => ({ results: db.prepare(sql).all(...params) }),
    run: async () => { const r = db.prepare(sql).run(...params); return { meta: { changes: Number(r.changes) } }; },
  }) }) };
  const rows = () => (migrate ? db.prepare('SELECT * FROM cli_login_challenges ORDER BY rowid').all() : []);
  const links = () => (migrate ? db.prepare('SELECT * FROM login_links ORDER BY rowid').all() : []);
  const sql = (q, ...a) => db.prepare(q).run(...a);
  return { ...env, DB, rows, links, sql };
}

// Fake Resend: records every email body; never touches the network.
function provider(t, mode) {
  const sent = [];
  t.mock.method(crypto, 'getRandomValues', (a) => (a instanceof Uint32Array ? a.fill(123456) : realRandom(a)));
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(String(url), 'https://api.resend.com/emails', `unexpected network call: ${url}`);
    sent.push(JSON.parse(init.body));
    if (mode === 'throws') throw new TypeError('fetch failed');
    return new Response('{}', { status: mode === 'fails' ? 500 : 200 });
  });
  return sent;
}

const post = (path, body, type = 'json') => new Request(`https://cp.example.test${path}`, {
  method: 'POST',
  ...(type === 'json'
    ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { body: new URLSearchParams(body) }),
});
const call = async (req, env) => {
  const res = await worker.fetch(req, env, { waitUntil() {} });
  return { res, text: await res.text(), headers: JSON.stringify([...res.headers]) };
};
const webLogin = (env) => call(post('/login', { email: EMAIL }, 'form'), env);
const cliLogin = (env) => call(post('/api/cli/login', { email: EMAIL }), env);

// Nothing that signs someone in may leave the worker in a production response.
function assertNoAuthMaterial({ text, headers }, sent = []) {
  const links = sent.map((e) => e.text.match(/https?:\/\/\S+/)?.[0]).filter(Boolean);
  for (const needle of [CODE, '123456', MAGIC, SESS, CHALLENGE, '/auth?token', 'token=', 'devCode', 'session', 'challenge', ...links]) {
    assert.ok(!text.includes(needle), `response body leaks ${needle}: ${text}`);
    assert.ok(!headers.includes(needle), `response headers leak ${needle}: ${headers}`);
  }
}

// Production = SMALL_ENV missing or anything but test/dev, with or without the bypass secret.
const PROD = {
  'no SMALL_ENV': { ...BASE },
  'SMALL_ENV=production': { ...BASE, SMALL_ENV: 'production' },
  'no SMALL_ENV + bypass secrets (live today)': { ...BASE, TEST_BYPASS_SECRET: SECRET, SMALL_TEST_BYPASS: SECRET },
  'SMALL_ENV=production + bypass secrets': { ...BASE, SMALL_ENV: 'production', TEST_BYPASS_SECRET: SECRET, SMALL_TEST_BYPASS: SECRET },
  'SMALL_ENV=staging + bypass secrets': { ...BASE, SMALL_ENV: 'staging', TEST_BYPASS_SECRET: SECRET, SMALL_TEST_BYPASS: SECRET },
};
const FAILURES = {
  'no RESEND_API_KEY': { env: {}, mode: 'ok' },
  'Resend returns 500': { env: { RESEND_API_KEY: 're_fake' }, mode: 'fails' },
  'Resend fetch throws': { env: { RESEND_API_KEY: 're_fake' }, mode: 'throws' },
};

for (const [prodName, prodEnv] of Object.entries(PROD)) {
  for (const [failName, failure] of Object.entries(FAILURES)) {
    test(`production (${prodName}), ${failName}: web login is a generic 503 with no link`, async (t) => {
      const sent = provider(t, failure.mode);
      const env = withDb(t, { ...prodEnv, ...failure.env });
      const r = await webLogin(env);
      assert.equal(r.res.status, 503);
      assert.ok(r.text.includes(MSG_WEB), r.text);
      assertNoAuthMaterial(r, sent);
      assert.deepEqual(env.links(), []); // the undelivered link leaves no row behind
    });

    test(`production (${prodName}), ${failName}: CLI login is a 503 with no code, devCode or challenge`, async (t) => {
      const sent = provider(t, failure.mode);
      const env = withDb(t, { ...prodEnv, ...failure.env });
      const r = await cliLogin(env);
      assert.equal(r.res.status, 503);
      assert.deepEqual(JSON.parse(r.text), { error: MSG_CLI });
      assertNoAuthMaterial(r, sent);
      assert.deepEqual(env.rows(), []); // the undelivered code leaves no row behind
    });
  }

  test(`production (${prodName}): /test/session and /test/watch are 404 even with the right secret`, async (t) => {
    provider(t, 'ok');
    const s = await call(post('/test/session', { email: EMAIL, secret: SECRET }), prodEnv);
    assert.equal(s.res.status, 404);
    assert.deepEqual(JSON.parse(s.text), { error: 'not enabled' });
    assertNoAuthMaterial(s);
    const w = await call(post('/test/watch', { secret: SECRET }), prodEnv);
    assert.equal(w.res.status, 404);
    assert.deepEqual(JSON.parse(w.text), { error: 'not enabled' });
    const m = await call(post('/test/openai/chat/completions', { model: 'x', messages: [{ role: 'user', content: 'hi' }] }), prodEnv);
    assert.equal(m.res.status, 404);
  });
}

test('production with a working provider: web says Check your email, CLI returns only a challenge, the email carries the code and link', async (t) => {
  const env = withDb(t, { ...BASE, SMALL_ENV: 'production', TEST_BYPASS_SECRET: SECRET, RESEND_API_KEY: 're_fake' });
  const sent = provider(t, 'ok');
  const web = await webLogin(env);
  assert.equal(web.res.status, 200);
  assert.ok(web.text.includes('Check your email'));
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /\/auth\?token=/);
  assertNoAuthMaterial(web, sent);

  const cli = await cliLogin(env);
  assert.equal(cli.res.status, 200);
  const body = JSON.parse(cli.text);
  assert.deepEqual(Object.keys(body), ['challenge']);
  assert.ok(sent[1].text.includes(CODE));
  assert.ok(!cli.text.includes(CODE) && !cli.text.includes('devCode') && !cli.text.includes('/auth?token'));
});

for (const mode of ['test', 'dev']) {
  const env = { ...BASE, SMALL_ENV: mode, TEST_BYPASS_SECRET: SECRET, SMALL_TEST_BYPASS: SECRET };

  // The login echo (devCode, dev link) is SMALL_ENV=test only: a public dev control plane
  // (rabbit-hole-cp-dev) must not hand any caller a sign-in for any email. Dev mints sessions
  // only through the secret-gated /test/session.
  const echoes = mode === 'test';
  test(`SMALL_ENV=${mode} + secret keeps /test/session, /test/watch and the mock; ${echoes ? 'echoes devCode and the dev link' : 'login still fails closed without email'}`, async (t) => {
    const sent = provider(t, 'ok');
    const cli = await cliLogin(withDb(t, env));
    if (echoes) {
      assert.equal(JSON.parse(cli.text).devCode, CODE);
      assert.ok(JSON.parse(cli.text).challenge);
    } else {
      assert.equal(cli.res.status, 503);
      assert.ok(!cli.text.includes(CODE) && !cli.text.includes('devCode') && !cli.text.includes('challenge'), cli.text);
    }

    const db = withDb(t, env);
    const web = await webLogin(db);
    if (echoes) {
      assert.equal(web.res.status, 200);
      assert.ok(web.text.includes('/auth?token='), web.text);
    } else {
      assert.equal(web.res.status, 503);
      assertNoAuthMaterial(web, sent);
      assert.deepEqual(db.links(), []);
    }

    const s = await call(post('/test/session', { email: EMAIL, secret: SECRET }), db);
    assert.equal(s.res.status, 200);
    assert.equal((await verify(JSON.parse(s.text).session, BASE.MASTER_KEY)).email, EMAIL);
    assert.equal((await call(post('/test/session', { email: EMAIL, secret: 'wrong' }), env)).res.status, 401);
    assert.equal((await call(post('/test/watch', { secret: 'wrong' }), env)).res.status, 401); // reachable, secret still checked

    const m = await call(post('/test/openai/chat/completions', { model: 'x', messages: [{ role: 'user', content: 'hi' }] }), env);
    assert.equal(m.res.status, 200);
    assert.match(JSON.parse(m.text).choices[0].message.content, /^mock\(x\): hi$/);
  });

  test(`SMALL_ENV=${mode} without the secret: no bypass`, async (t) => {
    const sent = provider(t, 'ok');
    const bare = withDb(t, { ...BASE, SMALL_ENV: mode });
    assert.equal((await cliLogin(bare)).res.status, 503);
    const web = await webLogin(bare);
    assert.equal(web.res.status, 503);
    assertNoAuthMaterial(web, sent);
    assert.equal((await call(post('/test/session', { email: EMAIL, secret: undefined }), bare)).res.status, 404);
  });
}

// ---------- CLI challenge store: keyed MAC in D1, attempt limit, single use, issuance cap ----------
const PROD_OK = { ...BASE, SMALL_ENV: 'production', TEST_BYPASS_SECRET: SECRET, RESEND_API_KEY: 're_fake' };
const payloadOf = (c) => JSON.parse(Buffer.from(c.split('.')[0], 'base64url'));
const challengeFor = async (env, email = EMAIL) => JSON.parse((await call(post('/api/cli/login', { email }), env)).text).challenge;
const verifyCli = (env, challenge, code) => call(post('/api/cli/verify', { challenge, code }), env);

test('the challenge carries no code-derived material: a signed random id only; the keyed MAC stays in D1', async (t) => {
  provider(t, 'ok');
  const env = withDb(t, PROD_OK);
  const challenge = await challengeFor(env);
  const [row] = env.rows();
  const payload = JSON.stringify(payloadOf(challenge));
  assert.deepEqual(Object.keys(payloadOf(challenge)).sort(), ['exp', 'id', 't']);
  const plain = createHash('sha256').update(CODE).digest();
  for (const needle of [CODE, '123456', row.code_mac, plain.toString('hex'), plain.toString('base64url'), EMAIL]) {
    assert.ok(!challenge.includes(needle) && !payload.includes(needle), `challenge holds ${needle}: ${payload}`);
  }
  assert.equal(row.email, EMAIL);
  assert.match(row.code_mac, /^[0-9a-f]{64}$/);
  assert.equal(row.expires_at - row.created_at, 600);
  // same code, other email: a different MAC, so the MAC is bound to the email
  await challengeFor(env, 'b@example.test');
  assert.notEqual(env.rows()[1].code_mac, row.code_mac);
});

test('right code issues a token once; replaying the same challenge and code is 401', async (t) => {
  provider(t, 'ok');
  const env = withDb(t, PROD_OK);
  const challenge = await challengeFor(env);
  const ok = await verifyCli(env, challenge, CODE);
  assert.equal(ok.res.status, 200);
  const { token, email } = JSON.parse(ok.text);
  assert.equal(email, EMAIL);
  assert.equal((await verify(token, BASE.MASTER_KEY)).email, EMAIL);
  const replay = await verifyCli(env, challenge, CODE);
  assert.equal(replay.res.status, 401);
  assert.deepEqual(JSON.parse(replay.text), { error: 'bad or expired code' });
});

test('5 wrong codes burn the challenge: the right code afterwards is 401', async (t) => {
  provider(t, 'ok');
  const env = withDb(t, PROD_OK);
  const challenge = await challengeFor(env);
  for (let i = 0; i < 5; i++) {
    const wrong = await verifyCli(env, challenge, `9999999${i}`);
    assert.equal(wrong.res.status, 401);
    assert.deepEqual(JSON.parse(wrong.text), { error: 'bad or expired code' });
  }
  const late = await verifyCli(env, challenge, CODE);
  assert.equal(late.res.status, 401);
  assert.deepEqual(JSON.parse(late.text), { error: 'bad or expired code' });
  assert.equal(env.rows()[0].attempts, 5);
});

test('an expired challenge is 401 even with the right code', async (t) => {
  provider(t, 'ok');
  const env = withDb(t, PROD_OK);
  const challenge = await challengeFor(env);
  env.sql('UPDATE cli_login_challenges SET expires_at = ?', Math.floor(Date.now() / 1000) - 1);
  assert.equal((await verifyCli(env, challenge, CODE)).res.status, 401);
});

test('issuance cap: the 4th code in 15 minutes is a generic 429 and the inbox gets no 4th email; 10 per day', async (t) => {
  const sent = provider(t, 'ok');
  const env = withDb(t, PROD_OK);
  for (let i = 0; i < 3; i++) assert.equal((await cliLogin(env)).res.status, 200);
  const fourth = await cliLogin(env);
  assert.equal(fourth.res.status, 429);
  assert.deepEqual(JSON.parse(fourth.text), { error: MSG_429 });
  assertNoAuthMaterial(fourth, sent);
  assert.equal(sent.length, 3);
  assert.equal(env.rows().length, 3);
  // the cap is per address: b is unaffected by a's
  assert.equal((await call(post('/api/cli/login', { email: 'b@example.test' }), env)).res.status, 200);

  const day = withDb(t, PROD_OK);
  const old = Math.floor(Date.now() / 1000) - 3600;
  for (let i = 0; i < 10; i++) seed(day, `old${i}`, EMAIL, old);
  assert.equal((await cliLogin(day)).res.status, 429);
});

// Past challenges, as if issued at `at` (unix seconds). Domain = text after the single @.
function seed(env, id, email, at) {
  env.sql('INSERT INTO cli_login_challenges (id, email, domain, code_mac, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)', id, email, email.split('@')[1], 'x', at, at + 600);
}

test('per-domain cap: many addresses at one company cannot share guesses - 31st code in an hour or 101st in a day is 429', async (t) => {
  const sent = provider(t, 'ok');
  const nowS = Math.floor(Date.now() / 1000);
  const login = (env, email) => call(post('/api/cli/login', { email }), env);

  const day = withDb(t, PROD_OK);
  for (let i = 0; i < 100; i++) seed(day, `d${i}`, `x+${i}@corp.test`, nowS - 7200); // 2h ago: under the hourly cap
  const r = await login(day, 'fresh@corp.test');
  assert.equal(r.res.status, 429);
  assert.deepEqual(JSON.parse(r.text), { error: MSG_429 });
  assertNoAuthMaterial(r, sent);
  assert.equal(sent.length, 0);
  assert.equal((await login(day, 'fresh@other.test')).res.status, 200); // another domain is unaffected
  assert.equal(sent.length, 1);

  const hour = withDb(t, PROD_OK);
  for (let i = 0; i < 29; i++) seed(hour, `h${i}`, `x+${i}@corp.test`, nowS - 600);
  assert.equal((await login(hour, 'thirtieth@corp.test')).res.status, 200);
  assert.equal((await login(hour, 'thirty-first@corp.test')).res.status, 429);
  assert.equal(sent.length, 2);
});

test('D1 failure fails closed: login and verify are a generic 503 with no code, challenge or token', async (t) => {
  const sent = provider(t, 'ok');
  const missing = withDb(t, PROD_OK, { migrate: false }); // deployed before the migration ran
  const login = await cliLogin(missing);
  assert.equal(login.res.status, 503);
  assert.deepEqual(JSON.parse(login.text), { error: MSG_CLI });
  assertNoAuthMaterial(login, sent);
  assert.equal(sent.length, 0); // no code mailed that could never be verified

  const challenge = await sign({ t: 'challenge', id: 'abc', exp: Math.floor(Date.now() / 1000) + 600 }, BASE.MASTER_KEY);
  const broken = { ...PROD_OK, DB: { prepare() { throw new Error('D1_ERROR: no such table'); } } };
  for (const env of [broken, missing]) {
    const v = await verifyCli(env, challenge, CODE);
    assert.equal(v.res.status, 503);
    assert.deepEqual(JSON.parse(v.text), { error: MSG_VERIFY_DOWN });
    assertNoAuthMaterial(v);
  }
});

test('SMALL_ENV=test devCode still logs in through the challenge store', async (t) => {
  provider(t, 'ok');
  const env = withDb(t, { ...BASE, SMALL_ENV: 'test', TEST_BYPASS_SECRET: SECRET });
  const { challenge, devCode } = JSON.parse((await cliLogin(env)).text);
  assert.equal(devCode, CODE);
  const ok = await verifyCli(env, challenge, devCode);
  assert.equal(ok.res.status, 200);
  assert.equal(JSON.parse(ok.text).email, EMAIL);
});

// orgOf() takes the text after the first @, so anything looser than a plain
// address could land a session in someone else's org.
const BAD_EMAILS = [
  '"x@corp.com@"@attacker.test', 'Victim <v@corp.com>', '"Victim" <v@corp.com>', 'v@corp.com, a@attacker.test',
  'a b@corp.com', 'a@b', '@corp.com', 'a@', 'a@@corp.com', 'a@corp..com', 'a@.corp.com', 'a@corp.com.',
  'a@-corp.com', 'a@corp-.com', "a'@corp.com", `${'a'.repeat(250)}@corp.com`, '',
];

test('strict email: CLI and web login reject quoted, display-name, list and malformed addresses', async (t) => {
  const sent = provider(t, 'ok');
  const env = { ...BASE, SMALL_ENV: 'production', RESEND_API_KEY: 're_fake' };
  for (const email of BAD_EMAILS) {
    const cli = await call(post('/api/cli/login', { email }), env);
    assert.equal(cli.res.status, 400, `CLI accepted ${email}`);
    assert.deepEqual(JSON.parse(cli.text), { error: 'valid email required' });
    const web = await call(post('/login', { email }, 'form'), env);
    assert.equal(web.res.status, 400, `web accepted ${email}`);
    assert.ok(web.text.includes('Enter a valid email address.'));
  }
  assert.equal(sent.length, 0);
});

test('strict email: a plain address is trimmed and lowercased before it reaches the email and the login', async (t) => {
  const sent = provider(t, 'ok');
  const env = withDb(t, { ...BASE, SMALL_ENV: 'test', TEST_BYPASS_SECRET: SECRET, RESEND_API_KEY: 're_fake' });
  const web = await call(post('/login', { email: '  A.B+tag@Corp.Example.test ' }, 'form'), env);
  assert.equal(web.res.status, 200);
  assert.deepEqual(sent[0].to, ['a.b+tag@corp.example.test']);
});

// Public handles (docs/features/user-handles.md): a test session lands past "Choose your handle" with a random test
// handle, or the one it names; handle: null keeps none, to test that step itself. Test mode only, like the route.
test('/test/session gives a test person a handle (random, named, or none with null); production still 404s', async (t) => {
  const learn = new DatabaseSync(':memory:');
  t.after(() => learn.close());
  learn.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  const LEARN_DB = { prepare: (sql) => ({ bind: (...params) => ({
    first: async () => learn.prepare(sql).get(...params) || null,
    run: async () => { const r = learn.prepare(sql).run(...params); return { meta: { changes: Number(r.changes) } }; },
  }) }) };
  const env = withDb(t, { ...BASE, SMALL_ENV: 'test', TEST_BYPASS_SECRET: SECRET, LEARN_DB });
  const handleOf = (email) => learn.prepare('SELECT handle FROM user_handles WHERE email = ?').get(email)?.handle ?? null;
  assert.equal((await call(post('/test/session', { email: 'one@example.test', secret: SECRET }), env)).res.status, 200);
  assert.match(handleOf('one@example.test'), /^t_[0-9a-f]{12}$/);
  const kept = handleOf('one@example.test');
  await call(post('/test/session', { email: 'one@example.test', secret: SECRET }), env);
  assert.equal(handleOf('one@example.test'), kept, 'a second session keeps the handle');
  await call(post('/test/session', { email: 'two@example.test', secret: SECRET, handle: '@Ada_L' }), env);
  assert.equal(handleOf('two@example.test'), 'ada_l');
  assert.equal((await call(post('/test/session', { email: 'three@example.test', secret: SECRET, handle: null }), env)).res.status, 200);
  assert.equal(handleOf('three@example.test'), null, 'null: no handle, for the setup step');
  // A taken name still mints the session, just without that handle.
  assert.equal((await call(post('/test/session', { email: 'four@example.test', secret: SECRET, handle: 'ada_l' }), env)).res.status, 200);
  assert.equal(handleOf('four@example.test'), null);
  const prod = withDb(t, { ...BASE, SMALL_ENV: 'production', TEST_BYPASS_SECRET: SECRET, LEARN_DB });
  assert.equal((await call(post('/test/session', { email: 'five@example.test', secret: SECRET }), prod)).res.status, 404);
  assert.equal(handleOf('five@example.test'), null);
});
