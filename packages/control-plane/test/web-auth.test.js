import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { sign, verify } from '../src/token.js';

// Same loader stub as auth-fail-closed.test.js: the SPA shell .html import becomes an empty string.
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(s, c, n) { return s.endsWith('.html') ? { url: 'stub:html', shortCircuit: true } : n(s, c); }
  export async function load(u, c, n) { return u === 'stub:html' ? { format: 'module', source: 'export default ""', shortCircuit: true } : n(u, c); }
`));
const worker = (await import('../src/index.js')).default;
const { safeNext, sessionOf } = await import('../src/auth.js');

const ORIGIN = 'https://cp.example.test';
const KEY = 'master-key-for-tests';
const SECRET = 'bypass-secret-for-tests';
const GOOGLE = { GOOGLE_CLIENT_ID: 'gid.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'g-secret-value' };
const GITHUB = { GITHUB_CLIENT_ID: 'gh-client-id', GITHUB_CLIENT_SECRET: 'gh-secret-value' };
const PROD = { MASTER_KEY: KEY, SMALL_ENV: 'production', ...GOOGLE, ...GITHUB };
const MIGRATION = ['0025-cli-login-challenges.sql', '0026-users.sql']
  .map((f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8')).join('\n');
const now = () => Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const payloadOf = (token) => JSON.parse(Buffer.from(token.split('.')[0], 'base64url'));

function withDb(t, env) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(MIGRATION);
  const DB = { prepare: (sql) => ({ bind: (...params) => ({
    first: async () => db.prepare(sql).get(...params) || null,
    all: async () => ({ results: db.prepare(sql).all(...params) }),
    run: async () => { const r = db.prepare(sql).run(...params); return { meta: { changes: Number(r.changes) } }; },
  }) }) };
  const q = (sql, ...a) => db.prepare(sql).all(...a);
  return { ...env, DB, q };
}

// Fake Google, GitHub and Resend. Any other URL fails the test; every call is recorded.
function network(t, routes = {}) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const u = String(url).split('?')[0];
    const body = init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : init.body ? JSON.parse(init.body) : null;
    calls.push({ url: u, body, headers: init.headers });
    const route = routes[u];
    assert.ok(route, `unexpected network call: ${u}`);
    const [status, data] = route(body, init);
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  });
  return calls;
}
const RESEND = { 'https://api.resend.com/emails': () => [200, {}] };
// Google's signing keys, served from a fake JWKS endpoint. auth.js caches fetched keys per isolate,
// so every test signs with GOOGLE_KEY (kid k1) except the rotation test, which runs last.
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const rsaKey = async (kid) => {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  return { kid, privateKey, jwk: { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' } };
};
const GOOGLE_KEY = await rsaKey('k1');
let jwks = { keys: [GOOGLE_KEY.jwk] };
const idToken = (claims, key = GOOGLE_KEY, header = {}) =>
  new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: key.kid, typ: 'JWT', ...header }).sign(key.privateKey);
const googleClaims = (over = {}) => ({ iss: 'https://accounts.google.com', aud: GOOGLE.GOOGLE_CLIENT_ID, iat: now(), exp: now() + 300, sub: '1098765432', email: 'a@corp.test', email_verified: true, ...over });
const googleRoutes = (token) => ({
  'https://oauth2.googleapis.com/token': () => [200, { access_token: 'ya29.google-access', id_token: token }],
  [JWKS_URL]: () => [200, jwks],
});
const googleOk = async (claims = googleClaims(), key = GOOGLE_KEY) => googleRoutes(await idToken(claims, key));
const githubOk = (user = { id: 4242, login: 'octo', email: null }) => ({
  'https://github.com/login/oauth/access_token': () => [200, { access_token: 'gho_github-access', token_type: 'bearer' }],
  'https://api.github.com/user': () => [200, user],
});

const call = async (env, path, { method = 'GET', headers = {}, form, body, origin = ORIGIN } = {}) => {
  const init = { method, headers: { ...headers } };
  if (form) init.body = new URLSearchParams(form);
  if (body) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
  const res = await worker.fetch(new Request(`${origin}${path}`, init), env, { waitUntil() {} });
  const cookies = res.headers.getSetCookie();
  return { res, status: res.status, location: res.headers.get('Location'), cookies, text: await res.text(), cookie: (name) => cookies.find((c) => c.startsWith(`${name}=`)) };
};
const cookieValue = (setCookie) => setCookie.split(';')[0].split('=').slice(1).join('=');

// Start + callback, the way a browser does it: the flow cookie from start comes back on callback.
async function oauthSignIn(env, provider, { next = '/apps/x', state, callbackQuery, origin = ORIGIN } = {}) {
  const start = await call(env, `/auth/${provider}/start?next=${encodeURIComponent(next)}`, { origin });
  assert.equal(start.status, 302, start.text);
  const flow = start.cookie('rh_oauth');
  const url = new URL(start.location);
  const q = callbackQuery ?? `code=provider-code&state=${state ?? url.searchParams.get('state')}`;
  const cb = await call(env, `/auth/${provider}/callback?${q}`, { origin, headers: flow ? { Cookie: `rh_oauth=${cookieValue(flow)}` } : {} });
  return { start, url, flow, cb, session: cb.cookie('small_session') && cookieValue(cb.cookie('small_session')) };
}
const authed = (env, session, headers = {}) => call(env, '/api/no-such-endpoint', { headers: { Cookie: `small_session=${session}`, ...headers } });

// ---------- safe next ----------

test('safe next: only same-site paths survive; everything else becomes /', () => {
  for (const ok of ['/', '/apps', '/apps/x?tab=runs#top', '/a/corp-test/app/', '/apps/%2F%2Fevil.test', '/apps/%E2%82%AC', '/authors', '/sign-in']) assert.equal(safeNext(ok), ok);
  for (const bad of ['/apps/€', '/é', '/logout', '/login?next=%2Fapps', '/auth', '/auth/google/start?next=%2Fapps', '/test/session','//evil.test', '//evil.test/apps', '/\\evil.test', '\\\\evil.test', 'https://evil.test', 'http:/evil.test',
    'javascript:alert(1)', '/\t/evil.test', '/\n/evil.test', '/ /x', 'evil.test', '', null, undefined, `/${'a'.repeat(1100)}`]) {
    assert.equal(safeNext(bad), '/', `accepted ${JSON.stringify(bad)}`);
  }
});

// ---------- Google ----------

test('Google start: redirects to Google with state, PKCE S256 and our callback; the flow cookie is HttpOnly on /auth/', async (t) => {
  const env = withDb(t, PROD);
  const r = await call(env, '/auth/google/start?next=%2Fapps%2Fx');
  assert.equal(r.status, 302);
  const url = new URL(r.location);
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  const q = Object.fromEntries(url.searchParams);
  assert.equal(q.client_id, GOOGLE.GOOGLE_CLIENT_ID);
  assert.equal(q.redirect_uri, `${ORIGIN}/auth/google/callback`);
  assert.equal(q.response_type, 'code');
  assert.equal(q.code_challenge_method, 'S256');
  assert.match(q.state, /^[0-9a-f]{32}$/);
  assert.ok(!r.location.includes(GOOGLE.GOOGLE_CLIENT_SECRET));
  const flow = r.cookie('rh_oauth');
  assert.match(flow, /; Path=\/auth\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
  const p = await verify(cookieValue(flow), KEY);
  assert.equal(p.state, q.state);
  assert.equal(p.next, '/apps/x');
  assert.equal(createHash('sha256').update(p.v).digest('base64url'), q.code_challenge);
});

test('Google callback: creates a user keyed by the immutable sub, signs in, returns to next', async (t) => {
  const env = withDb(t, PROD);
  const calls = network(t, await googleOk());
  const { url, cb, session, flow } = await oauthSignIn(env, 'google');
  assert.equal(cb.status, 302);
  assert.equal(cb.location, '/apps/x');
  assert.match(cb.cookie('rh_oauth'), /Max-Age=0$/); // the flow cookie is spent
  assert.match(cb.cookie('small_session'), /; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800$/);
  // the code exchange carries our secret, the PKCE verifier and the same redirect_uri
  const tokenCall = calls.find((c) => c.url === 'https://oauth2.googleapis.com/token');
  assert.equal(tokenCall.body.client_secret, GOOGLE.GOOGLE_CLIENT_SECRET);
  assert.equal(tokenCall.body.redirect_uri, `${ORIGIN}/auth/google/callback`);
  assert.equal(createHash('sha256').update(tokenCall.body.code_verifier).digest('base64url'), url.searchParams.get('code_challenge'));
  assert.ok(flow);

  const [identity] = env.q('SELECT * FROM user_identities');
  assert.deepEqual([identity.provider, identity.provider_user_id, identity.provider_email], ['google', '1098765432', 'a@corp.test']);
  const [user] = env.q('SELECT * FROM users');
  assert.equal(identity.user_id, user.id);
  assert.equal(user.email, `user@${user.id}.rabbithole.invalid`); // the Google email is not the principal
  const p = payloadOf(session);
  assert.deepEqual([p.t, p.uid, p.email, p.ep], ['sess', user.id, user.email, 0]);
  assert.equal((await authed(env, session)).status, 404); // signed in: past the 401 wall
  assert.equal((await call(env, '/api/no-such-endpoint')).status, 401);
});

test('Google: the same sub signs into the same user even when its email changed; a new sub is a new user', async (t) => {
  const env = withDb(t, PROD);
  network(t, await googleOk());
  const first = payloadOf((await oauthSignIn(env, 'google')).session);
  t.mock.restoreAll();
  network(t, await googleOk(googleClaims({ email: 'renamed@other.test' })));
  const again = payloadOf((await oauthSignIn(env, 'google')).session);
  assert.equal(again.uid, first.uid);
  t.mock.restoreAll();
  network(t, await googleOk(googleClaims({ sub: '222', email: 'a@corp.test' })));
  const other = payloadOf((await oauthSignIn(env, 'google')).session);
  assert.notEqual(other.uid, first.uid);
  assert.equal(env.q('SELECT COUNT(*) AS n FROM users')[0].n, 2);
});

test('Google: an unverified email is not even stored as information', async (t) => {
  const env = withDb(t, PROD);
  network(t, await googleOk(googleClaims({ email_verified: false })));
  await oauthSignIn(env, 'google');
  assert.equal(env.q('SELECT provider_email FROM user_identities')[0].provider_email, null);
});

// ---------- GitHub ----------

test('GitHub: user keyed by the numeric id; a private (null) email is fine; a renamed login is the same user', async (t) => {
  const env = withDb(t, PROD);
  const calls = network(t, githubOk());
  const { cb, session, url } = await oauthSignIn(env, 'github', { next: '/apps' });
  assert.equal(url.origin + url.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(url.searchParams.get('redirect_uri'), `${ORIGIN}/auth/github/callback`);
  assert.equal(cb.status, 302);
  assert.equal(cb.location, '/apps');
  const tokenCall = calls.find((c) => c.url === 'https://github.com/login/oauth/access_token');
  assert.equal(tokenCall.body.client_secret, GITHUB.GITHUB_CLIENT_SECRET);
  assert.equal(createHash('sha256').update(tokenCall.body.code_verifier).digest('base64url'), url.searchParams.get('code_challenge'));
  assert.equal(calls.find((c) => c.url === 'https://api.github.com/user').headers.Authorization, 'Bearer gho_github-access');
  const [identity] = env.q('SELECT * FROM user_identities');
  assert.deepEqual([identity.provider, identity.provider_user_id, identity.provider_email], ['github', '4242', null]);
  const first = payloadOf(session);
  assert.match(first.email, /^user@[0-9a-f]{32}\.rabbithole\.invalid$/);

  t.mock.restoreAll();
  network(t, githubOk({ id: 4242, login: 'renamed', email: 'public@corp.test' }));
  assert.equal(payloadOf((await oauthSignIn(env, 'github')).session).uid, first.uid);
});

// ---------- No silent merge ----------

test('no email-only merge: Google and GitHub reporting the email of an email user each get their own user', async (t) => {
  const env = withDb(t, { ...PROD, RESEND_API_KEY: 're_fake' });
  const sent = [];
  network(t, {
    'https://api.resend.com/emails': (b) => { sent.push(b); return [200, {}]; },
    ...(await googleOk(googleClaims({ email: 'a@corp.test', email_verified: true }))),
    ...githubOk({ id: 7, login: 'a', email: 'a@corp.test' }),
  });
  const viaEmail = payloadOf(await emailSignIn(env, 'a@corp.test', sent));
  const viaGoogle = payloadOf((await oauthSignIn(env, 'google')).session);
  const viaGithub = payloadOf((await oauthSignIn(env, 'github')).session);
  assert.equal(viaEmail.email, 'a@corp.test');
  assert.equal(new Set([viaEmail.uid, viaGoogle.uid, viaGithub.uid]).size, 3);
  for (const p of [viaGoogle, viaGithub]) assert.notEqual(p.email, 'a@corp.test');
  assert.deepEqual(env.q('SELECT provider FROM user_identities ORDER BY provider').map((r) => r.provider), ['email', 'github', 'google']);
});

// ---------- State / CSRF ----------

test('OAuth state: a callback this browser did not start is refused before any provider call', async (t) => {
  const env = withDb(t, PROD);
  const calls = network(t, await googleOk());
  const start = await call(env, '/auth/google/start');
  const flow = cookieValue(start.cookie('rh_oauth'));
  const state = new URL(start.location).searchParams.get('state');
  const expiredFlow = await sign({ ...(await verify(flow, KEY)), exp: now() - 1 }, KEY);
  const cases = {
    'no flow cookie': [`code=c&state=${state}`, null],
    'state mismatch': ['code=c&state=0000', flow],
    'no state': ['code=c', flow],
    // the signature's first character carries 6 full bits (its last one has unused bits, so editing it can be a no-op)
    'tampered cookie': [`code=c&state=${state}`, flow.replace(/\.(.)/, (m, c) => `.${c === 'A' ? 'B' : 'A'}`)],
    'expired cookie': [`code=c&state=${state}`, expiredFlow],
  };
  for (const [name, [q, cookie]] of Object.entries(cases)) {
    const r = await call(env, `/auth/google/callback?${q}`, { headers: cookie ? { Cookie: `rh_oauth=${cookie}` } : {} });
    assert.equal(r.status, 302, name);
    assert.equal(r.location, '/login?error=expired', name);
    assert.equal(r.cookie('small_session'), undefined, name);
  }
  // a GitHub flow cookie does not open the Google callback
  const gh = await call(env, '/auth/github/start');
  const ghState = new URL(gh.location).searchParams.get('state');
  const cross = await call(env, `/auth/google/callback?code=c&state=${ghState}`, { headers: { Cookie: `rh_oauth=${cookieValue(gh.cookie('rh_oauth'))}` } });
  assert.equal(cross.location, '/login?error=expired');
  assert.equal(calls.length, 0);
  assert.equal(env.q('SELECT COUNT(*) AS n FROM users')[0].n, 0);
});

test('safe next through OAuth: an off-site next is dropped at start and lands on /', async (t) => {
  const env = withDb(t, PROD);
  network(t, await googleOk());
  for (const next of ['//evil.test/x', 'https://evil.test', '/\\evil.test']) {
    const { cb } = await oauthSignIn(env, 'google', { next });
    assert.equal(cb.location, '/', next);
  }
});

// ---------- Provider failure and missing config ----------

test('provider failure: token or profile errors send you back to /login with no session and no token in logs', async (t) => {
  const logs = [];
  t.mock.method(console, 'error', (...a) => logs.push(a.join(' ')));
  const failures = {
    'Google token 500': ['google', { 'https://oauth2.googleapis.com/token': () => [500, { error: 'server_error' }] }],
    'Google wrong audience': ['google', await googleOk(googleClaims({ aud: 'someone-else' }))],
    'Google wrong issuer': ['google', await googleOk(googleClaims({ iss: 'https://evil.test' }))],
    'Google expired id_token': ['google', await googleOk(googleClaims({ exp: now() - 1 }))],
    'Google no sub': ['google', await googleOk(googleClaims({ sub: undefined }))],
    'GitHub bad code': ['github', { 'https://github.com/login/oauth/access_token': () => [200, { error: 'bad_verification_code' }] }],
    'GitHub user 401': ['github', { ...githubOk(), 'https://api.github.com/user': () => [401, { message: 'Bad credentials' }] }],
    'GitHub no id': ['github', githubOk({ login: 'x', email: 'a@corp.test' })],
  };
  for (const [name, [provider, routes]] of Object.entries(failures)) {
    const env = withDb(t, PROD);
    t.mock.restoreAll();
    t.mock.method(console, 'error', (...a) => logs.push(a.join(' ')));
    network(t, routes);
    const { cb } = await oauthSignIn(env, provider, { next: '/apps/x' });
    assert.equal(cb.status, 302, name);
    assert.equal(cb.location, '/login?error=provider&next=%2Fapps%2Fx', name);
    assert.equal(cb.cookie('small_session'), undefined, name);
    assert.equal(env.q('SELECT COUNT(*) AS n FROM users')[0].n, 0, name);
  }
  assert.ok(logs.length >= 8);
  for (const line of logs) {
    for (const secret of ['ya29', 'gho_', GOOGLE.GOOGLE_CLIENT_SECRET, GITHUB.GITHUB_CLIENT_SECRET, 'provider-code']) assert.ok(!line.includes(secret), line);
  }
});

test('Google ID token: signature, algorithm, iss, aud, exp and iat are all verified against Google keys', async (t) => {
  const claims = googleClaims();
  const attacker = await rsaKey('k1'); // same kid as Google's key, different private key
  const { exp, ...noExp } = claims;
  const { iat, ...noIat } = claims;
  const cases = {
    'bad signature (right kid, wrong key)': await idToken(claims, attacker),
    'tampered payload': (await idToken(claims)).replace(/\.[^.]+\./, `.${b64({ ...claims, sub: 'victim' })}.`),
    'alg none': `${b64({ alg: 'none', kid: 'k1' })}.${b64(claims)}.`,
    'HS256 keyed with the public JWK': await new SignJWT(claims).setProtectedHeader({ alg: 'HS256', kid: 'k1' })
      .sign(new TextEncoder().encode(JSON.stringify(GOOGLE_KEY.jwk))),
    'wrong aud': await idToken(googleClaims({ aud: 'another-client.apps.googleusercontent.com' })),
    'wrong iss': await idToken(googleClaims({ iss: 'https://accounts.evil.test' })),
    'expired': await idToken(googleClaims({ iat: now() - 7200, exp: now() - 3600 })),
    'no exp': await idToken(noExp),
    'no iat': await idToken(noIat),
    'not a JWT': 'not-a-jwt',
  };
  const logs = [];
  for (const [name, token] of Object.entries(cases)) {
    t.mock.restoreAll();
    t.mock.method(console, 'error', (...a) => logs.push(a.join(' ')));
    network(t, googleRoutes(token));
    const env = withDb(t, PROD);
    const { cb } = await oauthSignIn(env, 'google', { next: '/apps' });
    assert.equal(cb.location, '/login?error=provider&next=%2Fapps', name);
    assert.equal(cb.cookie('small_session'), undefined, name);
    assert.equal(env.q('SELECT COUNT(*) AS n FROM users')[0].n, 0, name);
  }
  assert.equal(logs.length, Object.keys(cases).length);
  for (const line of logs) assert.match(line, /^google sign-in failed: id_token rejected: /);
});

test('provider denied: ?error=access_denied is a cancelled sign-in, no provider call', async (t) => {
  const env = withDb(t, PROD);
  const calls = network(t, {});
  const start = await call(env, '/auth/google/start');
  const state = new URL(start.location).searchParams.get('state');
  const r = await call(env, `/auth/google/callback?error=access_denied&state=${state}`, { headers: { Cookie: `rh_oauth=${cookieValue(start.cookie('rh_oauth'))}` } });
  assert.equal(r.location, '/login?error=cancelled');
  assert.equal(calls.length, 0);
});

test('missing provider config: start goes to /login?error=unavailable, no flow cookie, and /login hides that button', async (t) => {
  network(t, {});
  const partial = { MASTER_KEY: KEY, SMALL_ENV: 'production', GOOGLE_CLIENT_ID: 'only-the-id', GITHUB_CLIENT_SECRET: 'only-the-secret' };
  for (const provider of ['google', 'github']) {
    for (const env of [{ MASTER_KEY: KEY }, partial]) {
      const r = await call(withDb(t, env), `/auth/${provider}/start?next=%2Fapps`);
      assert.equal(r.status, 302);
      assert.equal(r.location, '/login?error=unavailable&next=%2Fapps');
      assert.equal(r.cookie('rh_oauth'), undefined);
    }
  }
  const bare = await call(withDb(t, { MASTER_KEY: KEY }), '/login?error=unavailable');
  assert.ok(!bare.text.includes('/auth/google/start') && !bare.text.includes('/auth/github/start'));
  assert.ok(bare.text.includes('Continue with email'));
  assert.ok(bare.text.includes("That sign-in option isn't available right now."));
  const full = await call(withDb(t, PROD), '/login?next=%2Fapps');
  assert.ok(full.text.includes('Continue with Google') && full.text.includes('/auth/google/start?next=%2Fapps'));
  assert.ok(full.text.includes('Continue with GitHub') && full.text.includes('/auth/github/start?next=%2Fapps'));
  assert.ok(!/password/i.test(full.text.replace('No password.', '')), 'no password field or copy');
});

// ---------- Production and the public dev control plane never run the mock provider or echo links ----------

// Every test using these adds TEST_BYPASS_SECRET: only SMALL_ENV=test may echo or mock.
// SMALL_ENV=dev is rabbit-hole-cp-dev, public, so it must behave like production here.
const PROD_VARIANTS = {
  'no SMALL_ENV': { MASTER_KEY: KEY },
  'SMALL_ENV=production': { MASTER_KEY: KEY, SMALL_ENV: 'production' },
  'SMALL_ENV=staging': { MASTER_KEY: KEY, SMALL_ENV: 'staging' },
  'SMALL_ENV=dev (public dev control plane)': { MASTER_KEY: KEY, SMALL_ENV: 'dev' },
};
for (const [name, base] of Object.entries(PROD_VARIANTS)) {
  test(`${name} + OAUTH_MOCK + bypass secret: no mock provider, no mock codes`, async (t) => {
    const env = withDb(t, { ...base, OAUTH_MOCK: 'true', TEST_BYPASS_SECRET: SECRET });
    network(t, { 'https://oauth2.googleapis.com/token': () => [400, { error: 'invalid_grant' }] });
    assert.equal((await call(env, '/test/oauth/authorize?provider=google&state=s&sub=victim')).status, 404);
    // unconfigured: unavailable, not the mock
    assert.equal((await call(env, '/auth/google/start')).location, '/login?error=unavailable');
    // configured: the real Google, and a forged mock code is just a bad code there
    const cfg = withDb(t, { ...base, ...GOOGLE, OAUTH_MOCK: 'true', TEST_BYPASS_SECRET: SECRET });
    const mockCode = await sign({ t: 'mockcode', p: 'google', sub: 'victim', exp: now() + 300 }, KEY);
    const { url, cb } = await oauthSignIn(cfg, 'google', { next: '/' });
    assert.equal(url.origin, 'https://accounts.google.com');
    assert.equal(cb.cookie('small_session'), undefined);
    const start = await call(cfg, '/auth/google/start');
    const forged = await call(cfg, `/auth/google/callback?code=${encodeURIComponent(mockCode)}&state=${new URL(start.location).searchParams.get('state')}`, {
      headers: { Cookie: `rh_oauth=${cookieValue(start.cookie('rh_oauth'))}` },
    });
    assert.equal(forged.location, '/login?error=provider');
    assert.equal(cfg.q('SELECT COUNT(*) AS n FROM users')[0].n, 0);
  });
}

test('SMALL_ENV=test + secret + OAUTH_MOCK=true: the mock provider walks the whole flow locally, no credentials', async (t) => {
  const env = withDb(t, { MASTER_KEY: KEY, SMALL_ENV: 'test', TEST_BYPASS_SECRET: SECRET, OAUTH_MOCK: 'true' });
  network(t, {});
  const start = await call(env, '/auth/github/start?next=%2Fapps');
  const authorize = new URL(start.location);
  assert.equal(authorize.origin + authorize.pathname, `${ORIGIN}/test/oauth/authorize`);
  const form = await call(env, `${authorize.pathname}${authorize.search}`);
  assert.ok(form.text.includes('Mock github sign-in'));
  const approve = await call(env, `${authorize.pathname}${authorize.search}&sub=99&email=dev%40example.test`);
  const back = new URL(approve.location);
  assert.equal(back.pathname, '/auth/github/callback');
  const cb = await call(env, `${back.pathname}${back.search}`, { headers: { Cookie: `rh_oauth=${cookieValue(start.cookie('rh_oauth'))}` } });
  assert.equal(cb.location, '/apps');
  assert.ok(cb.cookie('small_session'));
  assert.deepEqual({ ...env.q('SELECT provider, provider_user_id FROM user_identities')[0] }, { provider: 'github', provider_user_id: '99' });
});

// ---------- Passwordless email ----------

// POST /auth/email/start, read the link out of the email, open it (GET), then Continue (POST).
async function emailSignIn(env, email, sent, next, origin = ORIGIN) {
  const start = await call(env, '/auth/email/start', { method: 'POST', body: { email, next }, headers: { Origin: origin }, origin });
  assert.equal(start.status, 200, start.text);
  assert.deepEqual(JSON.parse(start.text), { ok: true });
  const link = new URL(sent.at(-1).text.match(/https?:\/\/\S+/)[0]);
  const token = link.searchParams.get('token');
  const page = await call(env, `${link.pathname}${link.search}`, { origin });
  assert.equal(page.status, 200);
  assert.ok(page.text.includes(`Continue as <b>${email}</b>`));
  const done = await call(env, '/auth', { method: 'POST', form: { token }, headers: { Origin: origin }, origin });
  assert.equal(done.status, 302, done.text);
  env.lastLocation = done.location;
  env.lastToken = token;
  env.lastLink = link.href;
  return cookieValue(done.cookie('small_session'));
}

test('email: the link is single use, opening it does not spend it, and it lands on a safe next', async (t) => {
  const env = withDb(t, { ...PROD, RESEND_API_KEY: 're_fake' });
  const sent = [];
  network(t, { 'https://api.resend.com/emails': (b) => { sent.push(b); return [200, {}]; } });
  const session = await emailSignIn(env, 'a@corp.test', sent, '/apps/x');
  assert.equal(env.lastLocation, '/apps/x');
  assert.equal(payloadOf(session).email, 'a@corp.test');
  assert.equal((await authed(env, session)).status, 404);
  assert.ok(sent[0].subject.includes('Rabbit Hole'));
  const replay = await call(env, '/auth', { method: 'POST', form: { token: env.lastToken } });
  assert.equal(replay.status, 401);
  assert.equal(replay.cookie('small_session'), undefined);
  assert.equal((await call(env, `/auth?token=${encodeURIComponent(env.lastToken)}`)).status, 401);
  // same address again: the same user
  assert.equal(payloadOf(await emailSignIn(env, 'a@corp.test', sent, '//evil.test')).uid, payloadOf(session).uid);
  assert.equal(env.lastLocation, '/');
  assert.equal(env.q('SELECT COUNT(*) AS n FROM users')[0].n, 1);
});

test('email: an expired link, an old-format link and a garbage token are 401 with no session', async (t) => {
  const env = withDb(t, { ...PROD, RESEND_API_KEY: 're_fake' });
  const sent = [];
  network(t, { 'https://api.resend.com/emails': (b) => { sent.push(b); return [200, {}]; } });
  await call(env, '/auth/email/start', { method: 'POST', body: { email: 'a@corp.test' } });
  const token = new URL(sent[0].text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
  env.q('UPDATE login_links SET expires_at = ? RETURNING id', now() - 1);
  const old = await sign({ t: 'magic', email: 'a@corp.test', next: '/', exp: now() + 900 }, KEY); // pre-0026 link shape
  for (const tk of [token, old, 'garbage']) {
    const r = await call(env, '/auth', { method: 'POST', form: { token: tk } });
    assert.equal(r.status, 401);
    assert.equal(r.cookie('small_session'), undefined);
  }
});

test('email JSON start fails closed in production and on the public dev control plane: generic 503, no link, no devLink, no row', async (t) => {
  for (const [name, base] of Object.entries(PROD_VARIANTS)) {
    for (const mode of ['no key', 500, 'throws']) {
      t.mock.restoreAll();
      const sent = [];
      t.mock.method(globalThis, 'fetch', async (url, init) => {
        sent.push(JSON.parse(init.body));
        if (mode === 'throws') throw new TypeError('fetch failed');
        return new Response('{}', { status: mode });
      });
      const env = withDb(t, { ...base, TEST_BYPASS_SECRET: SECRET, ...(mode === 'no key' ? {} : { RESEND_API_KEY: 're_fake' }) });
      const r = await call(env, '/auth/email/start', { method: 'POST', body: { email: 'a@corp.test' } });
      assert.equal(r.status, 503, `${name} ${mode}`);
      assert.deepEqual(JSON.parse(r.text), { error: "We couldn't send a sign-in email right now. Try again in a few minutes." });
      const link = sent[0]?.text.match(/https?:\/\/\S+/)?.[0];
      for (const needle of ['token', 'devLink', '/auth?', ...(link ? [link] : [])]) assert.ok(!r.text.includes(needle));
      assert.deepEqual(env.q('SELECT * FROM login_links'), []);
    }
  }
});

test('email JSON start: invalid address is 400, 4th link in 15 minutes is 429, test instances echo devLink', async (t) => {
  const sent = [];
  network(t, { 'https://api.resend.com/emails': (b) => { sent.push(b); return [200, {}]; } });
  const env = withDb(t, { ...PROD, RESEND_API_KEY: 're_fake' });
  for (const email of ['Victim <v@corp.test>', 'x@user-1.rabbithole.invalid', '']) {
    assert.equal((await call(env, '/auth/email/start', { method: 'POST', body: { email } })).status, 400, email);
  }
  for (const raw of ['null', 'not json', '[]']) {
    const r = await worker.fetch(new Request(`${ORIGIN}/auth/email/start`, { method: 'POST', body: raw }), env, { waitUntil() {} });
    assert.equal(r.status, 400, raw);
  }
  for (let i = 0; i < 3; i++) assert.equal((await call(env, '/auth/email/start', { method: 'POST', body: { email: 'a@corp.test' } })).status, 200);
  const fourth = await call(env, '/auth/email/start', { method: 'POST', body: { email: 'a@corp.test' } });
  assert.equal(fourth.status, 429);
  assert.equal(sent.length, 3);
  const dev = withDb(t, { MASTER_KEY: KEY, SMALL_ENV: 'test', TEST_BYPASS_SECRET: SECRET });
  const r = JSON.parse((await call(dev, '/auth/email/start', { method: 'POST', body: { email: 'a@corp.test' } })).text);
  assert.match(r.devLink, /^https:\/\/cp\.example\.test\/auth\?token=/);
});

test('cross-site POSTs to the sign-in routes are refused (login CSRF)', async (t) => {
  network(t, RESEND);
  const env = withDb(t, { ...PROD, RESEND_API_KEY: 're_fake' });
  const evil = { Origin: 'https://evil.test' };
  assert.equal((await call(env, '/auth/email/start', { method: 'POST', body: { email: 'a@corp.test' }, headers: evil })).status, 403);
  assert.equal((await call(env, '/login', { method: 'POST', form: { email: 'a@corp.test' }, headers: evil })).status, 403);
  assert.equal((await call(env, '/auth', { method: 'POST', form: { token: 'x' }, headers: evil })).status, 403);
  assert.equal((await call(env, '/logout', { method: 'POST', headers: evil })).status, 403);
  assert.deepEqual(env.q('SELECT * FROM login_links'), []);
});

// ---------- Sessions and logout ----------

test('logout revokes every session of the user; a cross-site logout does nothing; sign-in works again', async (t) => {
  const env = withDb(t, PROD);
  network(t, await googleOk());
  const a = (await oauthSignIn(env, 'google')).session;
  const b = (await oauthSignIn(env, 'google')).session; // a second browser
  assert.equal((await authed(env, a)).status, 404);

  const cross = await call(env, '/logout', { headers: { Cookie: `small_session=${a}`, 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(cross.location, '/login');
  assert.equal(cross.cookie('small_session'), undefined);
  assert.equal((await authed(env, a)).status, 404);

  const out = await call(env, '/logout', { headers: { Cookie: `small_session=${a}`, 'Sec-Fetch-Site': 'same-origin' } });
  assert.equal(out.location, '/login');
  assert.match(out.cookie('small_session'), /^small_session=; .*Max-Age=0$/);
  assert.equal((await authed(env, a)).status, 401);
  assert.equal((await authed(env, b)).status, 401);
  assert.equal((await authed(env, a, { 'X-Small-Session': a })).status, 401);

  const fresh = (await oauthSignIn(env, 'google')).session;
  assert.equal(payloadOf(fresh).ep, 1);
  assert.equal((await authed(env, fresh)).status, 404);
});

test('sessions: pre-users sessions (no uid), unknown users, forged epochs and D1 errors are all signed out', async (t) => {
  const env = withDb(t, PROD);
  const legacy = await sign({ t: 'sess', email: 'a@corp.test', exp: now() + 3600 }, KEY);
  const ghost = await sign({ t: 'sess', uid: 'nobody', email: 'a@corp.test', ep: 0, exp: now() + 3600 }, KEY);
  env.q("INSERT INTO users (id, email, session_epoch, created_at) VALUES ('u1', 'a@corp.test', 3, 0) RETURNING id");
  const stale = await sign({ t: 'sess', uid: 'u1', email: 'a@corp.test', ep: 2, exp: now() + 3600 }, KEY);
  const good = await sign({ t: 'sess', uid: 'u1', email: 'a@corp.test', ep: 3, exp: now() + 3600 }, KEY);
  const req = (s) => new Request(`${ORIGIN}/`, { headers: { Cookie: `other=1; small_session=${s}` } });
  for (const s of [legacy, ghost, stale]) assert.equal(await sessionOf(req(s), env), null);
  assert.equal((await sessionOf(req(good), env)).uid, 'u1');
  const broken = { ...env, DB: { prepare() { throw new Error('D1_ERROR'); } } };
  assert.equal(await sessionOf(req(good), broken), null);
  // a cookie whose name merely ends in small_session is not the session
  assert.equal(await sessionOf(new Request(`${ORIGIN}/`, { headers: { Cookie: `xsmall_session=${good}` } }), env), null);
});

test('/test/session still works on test instances and makes a revocable user session', async (t) => {
  const env = withDb(t, { MASTER_KEY: KEY, SMALL_ENV: 'test', TEST_BYPASS_SECRET: SECRET });
  const r = await call(env, '/test/session', { method: 'POST', body: { email: 'A@Corp.test', secret: SECRET } });
  const { session } = JSON.parse(r.text);
  assert.equal(payloadOf(session).email, 'a@corp.test');
  assert.equal((await authed(env, session)).status, 404);
  await call(env, '/logout', { headers: { Cookie: `small_session=${session}` } });
  assert.equal((await authed(env, session)).status, 401);
});

// ---------- Production origin: PUBLIC_ORIGIN=https://tryrabbithole.dev ----------

const SITE = 'https://tryrabbithole.dev';
const SITE_ENV = { ...PROD, PUBLIC_ORIGIN: SITE, RESEND_API_KEY: 're_fake', EMAIL_FROM: 'Rabbit Hole <signin@tryrabbithole.dev>' };
const OTHER_HOSTS = ['https://small-cp.example.workers.dev', 'http://tryrabbithole.dev', 'https://www.tryrabbithole.dev'];

test('production origin: Google and GitHub send tryrabbithole.dev callbacks, the code exchange repeats them, the session lands there host-only', async (t) => {
  for (const [provider, routes, exchange] of [['google', await googleOk(), 'https://oauth2.googleapis.com/token'], ['github', githubOk(), 'https://github.com/login/oauth/access_token']]) {
    t.mock.restoreAll();
    const calls = network(t, routes);
    const env = withDb(t, SITE_ENV);
    const { url, flow, cb } = await oauthSignIn(env, provider, { origin: SITE, next: '/apps/x' });
    assert.equal(url.searchParams.get('redirect_uri'), `${SITE}/auth/${provider}/callback`);
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(calls.find((c) => c.url === exchange).body.redirect_uri, `${SITE}/auth/${provider}/callback`);
    // anchored: no Domain attribute, so the cookies belong to tryrabbithole.dev alone
    assert.match(flow, /^rh_oauth=[^;]+; Path=\/auth\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
    assert.match(cb.cookie('small_session'), /^small_session=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800$/);
    assert.equal(cb.location, '/apps/x');
  }
});

test('production origin: sign-in routes on any other host go to tryrabbithole.dev first; POSTs there are refused; other paths are untouched', async (t) => {
  network(t, {}); // no provider or email call may happen
  for (const configured of [SITE, `${SITE}/`]) {
    const env = withDb(t, { ...SITE_ENV, PUBLIC_ORIGIN: configured });
    for (const origin of OTHER_HOSTS) {
      for (const path of ['/auth/google/start?next=%2Fapps', '/auth/github/callback?code=c&state=s', '/auth?token=x', '/auth/session', '/login?next=%2Fapps', '/logout']) {
        const r = await call(env, path, { origin });
        assert.equal(r.status, 302, `${origin}${path}`);
        assert.equal(r.location, `${SITE}${path}`);
        assert.deepEqual(r.cookies, [], `${origin}${path} set a cookie`);
      }
      const post = await call(env, '/auth/email/start', { method: 'POST', body: { email: 'a@corp.test' }, headers: { Origin: origin }, origin });
      assert.equal(post.status, 403);
      assert.equal((await call(env, '/api/no-such-endpoint', { origin })).status, 401);
    }
    assert.deepEqual(env.q('SELECT * FROM login_links'), []);
    // the canonical host itself is not redirected
    assert.equal(new URL((await call(env, '/auth/google/start', { origin: SITE })).location).origin, 'https://accounts.google.com');
  }
});

test('production origin: /login is Landing /sign-in with the same next and error; without PUBLIC_ORIGIN it stays the transitional page', async (t) => {
  const env = withDb(t, SITE_ENV);
  const r = await call(env, '/login?next=%2Fapps%2Fx&error=expired', { origin: SITE });
  assert.equal(r.status, 302);
  assert.equal(r.location, '/sign-in?next=%2Fapps%2Fx&error=expired');
  assert.equal((await call(env, '/login', { origin: SITE })).location, '/sign-in');
  const cb = await call(env, '/auth/google/callback?code=c&state=s', { origin: SITE }); // no flow cookie
  assert.equal(cb.location, '/login?error=expired');
  assert.equal((await call(env, cb.location, { origin: SITE })).location, '/sign-in?error=expired');
  const plain = await call(withDb(t, PROD), '/login');
  assert.equal(plain.status, 200);
  assert.ok(plain.text.includes('Continue with Google'));
});

test('production origin: the emailed link is https://tryrabbithole.dev/auth?token=..., sent from EMAIL_FROM, and nothing is echoed', async (t) => {
  const sent = [];
  network(t, { 'https://api.resend.com/emails': (b) => { sent.push(b); return [200, {}]; } });
  const env = withDb(t, SITE_ENV);
  const session = await emailSignIn(env, 'a@corp.test', sent, '/apps', SITE);
  assert.match(env.lastLink, /^https:\/\/tryrabbithole\.dev\/auth\?token=[^&\s]+$/);
  assert.equal(sent[0].from, SITE_ENV.EMAIL_FROM);
  assert.deepEqual(sent[0].to, ['a@corp.test']);
  assert.equal(env.lastLocation, '/apps');
  assert.equal((await authed(env, session)).status, 404);
});

test('production origin: a non-ASCII next no longer breaks the redirect after sign-in; it lands on /', async (t) => {
  const sent = [];
  network(t, { ...(await googleOk()), 'https://api.resend.com/emails': (b) => { sent.push(b); return [200, {}]; } });
  const env = withDb(t, SITE_ENV);
  const { cb, session } = await oauthSignIn(env, 'google', { origin: SITE, next: '/apps/€' });
  assert.equal(cb.location, '/');
  assert.ok(session);
  await emailSignIn(env, 'a@corp.test', sent, '/apps/é', SITE);
  assert.equal(env.lastLocation, '/');
});

test('production origin: same-origin sign-in POSTs pass; any other origin, sibling subdomains and http included, is refused', async (t) => {
  const sent = [];
  network(t, { ...(await googleOk()), 'https://api.resend.com/emails': (b) => { sent.push(b); return [200, {}]; } });
  const env = withDb(t, SITE_ENV);
  for (const origin of ['https://evil.test', 'null', 'http://tryrabbithole.dev', 'https://www.tryrabbithole.dev', 'https://app.tryrabbithole.dev', 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev']) {
    const h = { Origin: origin };
    assert.equal((await call(env, '/auth/email/start', { method: 'POST', body: { email: 'a@corp.test' }, headers: h, origin: SITE })).status, 403, origin);
    assert.equal((await call(env, '/login', { method: 'POST', form: { email: 'a@corp.test' }, headers: h, origin: SITE })).status, 403, origin);
    assert.equal((await call(env, '/auth', { method: 'POST', form: { token: 'x' }, headers: h, origin: SITE })).status, 403, origin);
    assert.equal((await call(env, '/logout', { method: 'POST', headers: h, origin: SITE })).status, 403, origin);
  }
  assert.equal(sent.length, 0);
  assert.deepEqual(env.q('SELECT * FROM login_links'), []);
  const same = { Origin: SITE };
  assert.equal((await call(env, '/auth/email/start', { method: 'POST', body: { email: 'a@corp.test' }, headers: same, origin: SITE })).status, 200);
  assert.equal((await call(env, '/login', { method: 'POST', form: { email: 'b@corp.test' }, headers: same, origin: SITE })).status, 200);
  assert.equal(sent.length, 2);
  const { session } = await oauthSignIn(env, 'google', { origin: SITE });
  const out = await call(env, '/logout', { method: 'POST', headers: { ...same, Cookie: `small_session=${session}` }, origin: SITE });
  assert.equal(out.status, 302);
  assert.equal((await authed(env, session)).status, 401);
});

test('production origin: logout from this origin or a typed URL revokes; a sibling subdomain or another site does not; /auth/session is never cached', async (t) => {
  network(t, await googleOk());
  const env = withDb(t, SITE_ENV);
  const who = (session) => call(env, '/auth/session', { origin: SITE, headers: session ? { Cookie: `small_session=${session}` } : {} });
  for (const site of ['same-origin', 'none']) {
    const { session } = await oauthSignIn(env, 'google', { origin: SITE });
    const signedIn = await who(session);
    assert.equal(signedIn.status, 200);
    assert.equal(signedIn.res.headers.get('Cache-Control'), 'no-store');
    for (const foreign of ['same-site', 'cross-site']) {
      const r = await call(env, '/logout', { origin: SITE, headers: { Cookie: `small_session=${session}`, 'Sec-Fetch-Site': foreign } });
      assert.deepEqual(r.cookies, [], foreign);
      assert.equal((await who(session)).status, 200, foreign);
    }
    const out = await call(env, '/logout', { origin: SITE, headers: { Cookie: `small_session=${session}`, 'Sec-Fetch-Site': site } });
    assert.equal(out.location, '/login');
    assert.equal(out.cookie('small_session'), 'small_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    const after = await who(session);
    assert.equal(after.status, 401, site);
    assert.equal(after.text, '{"signedIn":false}');
    assert.equal(after.res.headers.get('Cache-Control'), 'no-store');
  }
});

test('production origin: no mock provider, no /test/session and no echoed link on tryrabbithole.dev, even with test secrets present', async (t) => {
  network(t, { 'https://api.resend.com/emails': () => [500, {}] });
  const env = withDb(t, { ...SITE_ENV, OAUTH_MOCK: 'true', TEST_BYPASS_SECRET: SECRET });
  assert.equal((await call(env, '/test/oauth/authorize?provider=google&state=s&sub=victim', { origin: SITE })).status, 404);
  assert.equal((await call(env, '/test/session', { method: 'POST', body: { email: 'a@corp.test', secret: SECRET }, origin: SITE })).status, 404);
  assert.equal(new URL((await call(env, '/auth/github/start', { origin: SITE })).location).origin, 'https://github.com');
  const r = await call(env, '/auth/email/start', { method: 'POST', body: { email: 'a@corp.test' }, headers: { Origin: SITE }, origin: SITE });
  assert.equal(r.status, 503);
  for (const needle of ['devLink', 'token', '/auth?']) assert.ok(!r.text.includes(needle), needle);
  assert.equal(env.q('SELECT COUNT(*) AS n FROM users')[0].n, 0);
});

// ---------- Display identity: what the frontend may show, never the internal principal ----------

const display = async (env, session) => {
  const r = await call(env, '/auth/session', { headers: session ? { Cookie: `small_session=${session}` } : {} });
  return { status: r.status, body: JSON.parse(r.text), text: r.text };
};

test('GET /auth/session: provider email/name as display metadata, a neutral label otherwise, never the .invalid principal', async (t) => {
  const env = withDb(t, { ...PROD, RESEND_API_KEY: 're_fake' });
  assert.deepEqual((await display(env)).body, { signedIn: false });
  assert.equal((await display(env)).status, 401);

  const cases = [
    ['google', await googleOk(), { name: null, email: 'a@corp.test', label: 'a@corp.test' }],
    ['google', await googleOk(googleClaims({ sub: 'g2', email_verified: false })), { name: null, email: null, label: 'Google user' }],
    ['github', githubOk({ id: 1, login: 'octo', name: 'Octo Cat', email: null }), { name: 'Octo Cat', email: null, label: 'Octo Cat' }],
    ['github', githubOk({ id: 2, login: 'octo2', name: null, email: 'pub@corp.test' }), { name: 'octo2', email: 'pub@corp.test', label: 'octo2' }],
    ['github', githubOk({ id: 3, login: '', name: '  ', email: null }), { name: null, email: null, label: 'GitHub user' }],
  ];
  for (const [provider, routes, want] of cases) {
    t.mock.restoreAll();
    network(t, routes);
    const { session } = await oauthSignIn(env, provider);
    const d = await display(env, session);
    assert.equal(d.status, 200);
    assert.deepEqual(d.body, { signedIn: true, provider, display: want });
    assert.ok(!d.text.includes('.invalid') && !d.text.includes(payloadOf(session).email), d.text);
  }

  // a changed GitHub name shows on the next sign-in; the identity (id 1) stays the same user
  t.mock.restoreAll();
  network(t, githubOk({ id: 1, login: 'octo', name: 'Renamed', email: null }));
  const renamed = await oauthSignIn(env, 'github');
  assert.equal((await display(env, renamed.session)).body.display.label, 'Renamed');

  // even if a principal ever lands in the metadata, it is not shown
  env.q("UPDATE user_identities SET provider_email = (SELECT email FROM users WHERE users.id = user_id), provider_name = NULL WHERE provider = 'github' RETURNING 1");
  assert.deepEqual((await display(env, renamed.session)).body.display, { name: null, email: null, label: 'GitHub user' });

  // email users see their own address
  t.mock.restoreAll();
  const sent = [];
  network(t, { 'https://api.resend.com/emails': (b) => { sent.push(b); return [200, {}]; } });
  const viaEmail = await emailSignIn(env, 'e@corp.test', sent);
  assert.deepEqual((await display(env, viaEmail)).body, { signedIn: true, provider: 'email', display: { name: null, email: 'e@corp.test', label: 'e@corp.test' } });
});

// Last on purpose: it leaves auth.js's per-isolate JWKS cache holding only the rotated key.
test('Google key rotation: a token signed with a new kid refetches the JWKS; a dropped key stops working', async (t) => {
  const env = withDb(t, PROD);
  network(t, await googleOk());
  assert.ok((await oauthSignIn(env, 'google')).session); // k1 known (cached or fetched)

  t.mock.restoreAll();
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 120_000 }); // past jose's 30s refetch cooldown
  const rotated = await rsaKey('k2');
  jwks = { keys: [rotated.jwk] }; // Google publishes k2 and drops k1
  const calls = network(t, await googleOk(googleClaims(), rotated));
  const r = await oauthSignIn(env, 'google');
  assert.ok(r.session, r.cb.location);
  assert.ok(calls.some((c) => c.url === JWKS_URL), 'the unknown kid triggered a JWKS refetch');

  t.mock.restoreAll();
  t.mock.method(console, 'error', () => {});
  network(t, await googleOk(googleClaims(), GOOGLE_KEY));
  assert.equal((await oauthSignIn(env, 'google', { next: '/apps' })).cb.location, '/login?error=provider&next=%2Fapps');
});
