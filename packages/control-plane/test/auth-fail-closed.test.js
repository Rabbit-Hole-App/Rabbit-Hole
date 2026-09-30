import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { verify } from '../src/token.js';

// Load the real worker router. The SPA shell import (web/dist/index.html) is a
// wrangler Text rule, so stub any .html import as an empty string.
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(s, c, n) { return s.endsWith('.html') ? { url: 'stub:html', shortCircuit: true } : n(s, c); }
  export async function load(u, c, n) { return u === 'stub:html' ? { format: 'module', source: 'export default ""', shortCircuit: true } : n(u, c); }
`));
const worker = (await import('../src/index.js')).default;

const EMAIL = 'a@example.test';
const CODE = '123456'; // crypto.getRandomValues is pinned below, so this is the login code
const b64 = (s) => Buffer.from(s).toString('base64url');
const MAGIC = b64('{"t":"magic"'); // prefix of every magic sign-in token
const SESS = b64('{"t":"sess",'); // prefix of every session token
const CHALLENGE = b64('{"t":"challenge'); // prefix of every CLI challenge
const SECRET = 'bypass-secret-for-tests';
const BASE = { MASTER_KEY: 'master-key-for-tests' };
const MSG_WEB = "We couldn't send a sign-in email right now. Try again in a few minutes.";
const MSG_CLI = 'Could not send the login email right now. Try again in a few minutes.';

// Fake Resend: records every email body; never touches the network.
function provider(t, mode) {
  const sent = [];
  t.mock.method(crypto, 'getRandomValues', (a) => a.fill(123456));
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
  for (const needle of [CODE, MAGIC, SESS, CHALLENGE, '/auth?token', 'token=', 'devCode', 'session', 'challenge', ...links]) {
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
    const env = { ...prodEnv, ...failure.env };

    test(`production (${prodName}), ${failName}: web login is a generic 503 with no link`, async (t) => {
      const sent = provider(t, failure.mode);
      const r = await webLogin(env);
      assert.equal(r.res.status, 503);
      assert.ok(r.text.includes(MSG_WEB), r.text);
      assertNoAuthMaterial(r, sent);
    });

    test(`production (${prodName}), ${failName}: CLI login is a 503 with no code, devCode or challenge`, async (t) => {
      const sent = provider(t, failure.mode);
      const r = await cliLogin(env);
      assert.equal(r.res.status, 503);
      assert.deepEqual(JSON.parse(r.text), { error: MSG_CLI });
      assertNoAuthMaterial(r, sent);
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

test('production with a working provider: web says Check your inbox, CLI returns only a challenge, the email carries the code and link', async (t) => {
  const env = { ...BASE, SMALL_ENV: 'production', TEST_BYPASS_SECRET: SECRET, RESEND_API_KEY: 're_fake' };
  const sent = provider(t, 'ok');
  const web = await webLogin(env);
  assert.equal(web.res.status, 200);
  assert.ok(web.text.includes('Check your inbox'));
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

  test(`SMALL_ENV=${mode} + secret keeps the bypasses: devCode, dev link, /test/session, /test/watch, mock`, async (t) => {
    provider(t, 'ok');
    const cli = JSON.parse((await cliLogin(env)).text);
    assert.equal(cli.devCode, CODE);
    assert.ok(cli.challenge);

    const web = await webLogin(env);
    assert.equal(web.res.status, 200);
    assert.ok(web.text.includes('/auth?token='), web.text);

    const s = await call(post('/test/session', { email: EMAIL, secret: SECRET }), env);
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
    const bare = { ...BASE, SMALL_ENV: mode };
    assert.equal((await cliLogin(bare)).res.status, 503);
    const web = await webLogin(bare);
    assert.equal(web.res.status, 503);
    assertNoAuthMaterial(web, sent);
    assert.equal((await call(post('/test/session', { email: EMAIL, secret: undefined }), bare)).res.status, 404);
  });
}
