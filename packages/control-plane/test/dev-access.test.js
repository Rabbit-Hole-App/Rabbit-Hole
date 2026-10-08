// Dev preview sign-in through Cloudflare Access (src/dev-access.js): only a verified Access assertion for an allowed
// identity gets a session, minted on the dev control plane for exactly that email; nothing changes without ACCESS_AUD.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { accessSession, withAccess, SESSION_COOKIE, SMOKE_EMAIL } from '../src/dev-access.js';
import { SESSION_COOKIE as AUTH_COOKIE } from '../src/auth.js';

const TEAM = 'rabbit-hole.cloudflareaccess.com', AUD = 'aud-tag-1';
const { publicKey, privateKey } = await generateKeyPair('RS256');
const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }] });
const { privateKey: stranger } = await generateKeyPair('RS256');
const assertion = (claims, { key = privateKey, iss = `https://${TEAM}`, aud = AUD, exp = '5m' } = {}) =>
  new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime(exp).sign(key);
const session = (email, exp = Date.now() / 1000 + 3600) => `${btoa(JSON.stringify({ t: 'sess', email, exp })).replace(/=+$/, '')}.sig`;
const env = (over = {}) => {
  const minted = [];
  return {
    minted, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ACCESS_ALLOWED_EMAILS: 'Owner@Example.com', DEV_TEST_BYPASS: 'bypass', ACCESS_SMOKE_CLIENT_ID: 'smoke.access', ACCESS_HOST: 'rabbit-hole-web-dev-x.tryrabbithole.workers.dev',
    CONTROL_PLANE: { fetch: async (req) => { minted.push({ path: new URL(req.url).pathname, method: req.method, body: await req.json() }); return Response.json({ session: session(minted.at(-1).body.email) }); } },
    ...over,
  };
};
const request = (headers = {}, host = 'rabbit-hole-web-dev-x.tryrabbithole.workers.dev') => new Request(`https://${host}/api/apps`, { headers });

test('the dev session cookie name is the control plane\'s', () => assert.equal(SESSION_COOKIE, AUTH_COOKIE));

test('without ACCESS_AUD the request passes unchanged and nothing is minted', async () => {
  const e = env({ ACCESS_AUD: undefined }), req = request();
  const out = await accessSession(req, e, keys);
  assert.equal(out.req, req); assert.equal(out.setCookie, undefined); assert.equal(e.minted.length, 0);
});

test('a missing, forged, wrong-audience, wrong-issuer or expired assertion is refused before any session', async () => {
  const cases = [
    {},
    { 'Cf-Access-Jwt-Assertion': 'not-a-jwt' },
    { 'Cf-Access-Jwt-Assertion': await assertion({ email: 'owner@example.com' }, { key: stranger }) },
    { 'Cf-Access-Jwt-Assertion': await assertion({ email: 'owner@example.com' }, { aud: 'another-app' }) },
    { 'Cf-Access-Jwt-Assertion': await assertion({ email: 'owner@example.com' }, { iss: 'https://evil.cloudflareaccess.com' }) },
    { 'Cf-Access-Jwt-Assertion': await assertion({ email: 'owner@example.com' }, { exp: Math.floor(Date.now() / 1000) - 60 }) },
  ];
  for (const headers of cases) {
    const e = env(), out = await accessSession(request(headers), e, keys);
    assert.equal(out.refuse?.status, 403, JSON.stringify(Object.keys(headers)));
    assert.equal(e.minted.length, 0);
  }
});

test('a verified identity that is not on the allowed list is refused', async () => {
  const e = env(), out = await accessSession(request({ 'Cf-Access-Jwt-Assertion': await assertion({ email: 'someone@example.com' }) }), e, keys);
  assert.equal(out.refuse.status, 403); assert.equal(e.minted.length, 0);
});

test('the allowed person gets a dev session for exactly their email, own handle kept, other cookies kept', async () => {
  const e = env();
  const out = await accessSession(request({ 'Cf-Access-Jwt-Assertion': await assertion({ email: 'Owner@Example.com' }), Cookie: 'theme=dark; small_session=old' }), e, keys);
  assert.deepEqual(e.minted, [{ path: '/test/session', method: 'POST', body: { email: 'owner@example.com', secret: 'bypass', handle: null } }]);
  const cookie = out.req.headers.get('Cookie');
  assert.match(cookie, /^theme=dark; small_session=[^;]+$/);
  assert.equal(JSON.parse(atob(cookie.split('small_session=')[1].split('.')[0])).email, 'owner@example.com');
  assert.match(out.setCookie, /^small_session=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800$/);
});

test('a current session for the same person is reused; one for someone else is replaced', async () => {
  const header = { 'Cf-Access-Jwt-Assertion': await assertion({ email: 'owner@example.com' }) };
  let e = env(), out = await accessSession(request({ ...header, Cookie: `small_session=${session('owner@example.com')}` }), e, keys);
  assert.equal(e.minted.length, 0); assert.equal(out.setCookie, undefined);
  e = env(); out = await accessSession(request({ ...header, Cookie: `small_session=${session('other@example.com')}` }), e, keys);
  assert.equal(e.minted.length, 1); assert.equal(e.minted[0].body.email, 'owner@example.com');
  e = env(); out = await accessSession(request({ ...header, Cookie: `small_session=${session('owner@example.com', 1)}` }), e, keys);
  assert.equal(e.minted.length, 1, 'an expired session is replaced');
});

test('only the configured Access service token maps to the synthetic smoke user', async () => {
  let e = env(), out = await accessSession(request({ 'Cf-Access-Jwt-Assertion': await assertion({ common_name: 'smoke.access' }) }), e, keys);
  assert.equal(e.minted[0].body.email, SMOKE_EMAIL); assert.ok(out.setCookie);
  e = env(); out = await accessSession(request({ 'Cf-Access-Jwt-Assertion': await assertion({ common_name: 'other.access' }) }), e, keys);
  assert.equal(out.refuse.status, 403); assert.equal(e.minted.length, 0);
});

test('a dev control plane that issues no session leaves the request refused', async () => {
  const e = env({ CONTROL_PLANE: { fetch: async () => Response.json({ error: 'bad secret' }, { status: 401 }) } });
  const out = await accessSession(request({ 'Cf-Access-Jwt-Assertion': await assertion({ email: 'owner@example.com' }) }), e, keys);
  assert.equal(out.refuse.status, 502);
});

test('half a configuration answers 503 and never mints', async () => {
  const header = { 'Cf-Access-Jwt-Assertion': await assertion({ email: 'owner@example.com' }) };
  for (const missing of ['ACCESS_TEAM_DOMAIN', 'ACCESS_ALLOWED_EMAILS', 'DEV_TEST_BYPASS', 'ACCESS_HOST']) {
    const e = env({ [missing]: undefined }), out = await accessSession(request(header), e, keys);
    assert.equal(out.refuse?.status, 503, missing); assert.equal(e.minted.length, 0, missing);
  }
});

test('a valid assertion replayed to another host (a version preview URL) is refused', async () => {
  const e = env(), header = { 'Cf-Access-Jwt-Assertion': await assertion({ email: 'owner@example.com' }) };
  const out = await accessSession(request(header, 'c5b0a07d-rabbit-hole-web-dev-x.tryrabbithole.workers.dev'), e, keys);
  assert.equal(out.refuse.status, 403); assert.equal(e.minted.length, 0);
});

test('an email claim naming the smoke user is not the smoke identity', async () => {
  const e = env({ ACCESS_ALLOWED_EMAILS: 'owner@example.com' }), out = await accessSession(request({ 'Cf-Access-Jwt-Assertion': await assertion({ email: SMOKE_EMAIL }) }), e, keys);
  assert.equal(out.refuse.status, 403); assert.equal(e.minted.length, 0);
});

test('a verified identity is sent from the app sign-in to the Library; everything else reaches the worker', async () => {
  // The owner's first visit (2026-10-08) landed on / and pressed the app's Google sign-in, which the barrier refuses.
  const served = [];
  const app = async (req) => { served.push(`${req.method} ${new URL(req.url).pathname}`); return new Response('app', { status: req.method === 'POST' ? 403 : 200 }); };
  const at = async (path, method = 'GET') => new Request(`https://rabbit-hole-web-dev-x.tryrabbithole.workers.dev${path}`, { method, headers: { 'Cf-Access-Jwt-Assertion': await assertion({ email: 'owner@example.com' }) } });
  for (const [path, method] of [['/'], ['/sign-in'], ['/sign-up'], ['/login'], ['/auth'], ['/auth/google/start'], ['/', 'HEAD']]) {
    const r = await withAccess(app, keys)(await at(path, method), env());
    assert.equal(r.status, 302, `${method ?? 'GET'} ${path}`); assert.equal(r.headers.get('Location'), '/library');
    assert.equal(r.headers.get('Cache-Control'), 'no-store');
    assert.match(r.headers.get('Set-Cookie'), /^small_session=/, 'the minted session rides along');
  }
  assert.deepEqual(served, [], 'none of them reached the app');
  for (const [path, method] of [['/library'], ['/api/apps'], ['/login', 'POST'], ['/logout', 'POST'], ['/signin-elsewhere']]) await withAccess(app, keys)(await at(path, method), env());
  assert.deepEqual(served, ['GET /library', 'GET /api/apps', 'POST /login', 'POST /logout', 'GET /signin-elsewhere'], 'writes still reach the barrier');
});

test('without ACCESS_AUD, or without a verified identity, sign-in pages are not redirected', async () => {
  const app = async () => new Response('landing', { status: 200 });
  const plain = await withAccess(app, keys)(new Request('https://small-cp-dev.tryrabbithole.workers.dev/'), env({ ACCESS_AUD: undefined }));
  assert.equal(plain.status, 200); assert.equal(await plain.text(), 'landing');
  const anon = await withAccess(app, keys)(new Request('https://rabbit-hole-web-dev-x.tryrabbithole.workers.dev/sign-in'), env());
  assert.equal(anon.status, 403, 'no assertion: refused, never redirected');
});

test('only the stable URL entrypoint imports the bridge: never dev-worker.js, never production app-worker.js', () => {
  const web = name => readFileSync(new URL(`../../web/${name}`, import.meta.url), 'utf8');
  for (const name of ['dev-worker.js', 'app-worker.js']) assert.doesNotMatch(web(name), /dev-access/, `${name} imports the Access bridge`);
  assert.match(web('dev-access-worker.js'), /import worker from '\.\/dev-worker\.js';[\s\S]*fetch: withAccess\(/);
  assert.match(readFileSync(new URL('../../../scripts/dev-deploy.mjs', import.meta.url), 'utf8'), /'deploy', 'dev-access-worker\.js'/, 'the stable URL deploys the Access entrypoint');
});

test('the earlier preview host only redirects to the same path on ACCESS_HOST: nothing served, nothing minted', async () => {
  // Owner, 2026-10-08: share links must not carry the worker name; old /b/ and /e/ links keep resolving.
  const served = [], app = async () => { served.push(1); return new Response('app'); };
  const e = env({ ACCESS_HOST: 'preview.example.com', ACCESS_REDIRECT_FROM: 'rabbit-hole-web-dev-x.tryrabbithole.workers.dev' });
  for (const method of ['GET', 'HEAD', 'POST']) {
    const r = await withAccess(app, keys)(new Request('https://rabbit-hole-web-dev-x.tryrabbithole.workers.dev/b/k1_abc?x=1', { method }), e);
    assert.equal(r.status, 301, method); assert.equal(r.headers.get('Location'), 'https://preview.example.com/b/k1_abc?x=1');
    assert.equal(r.headers.get('Set-Cookie'), null);
  }
  assert.deepEqual(served, []); assert.equal(e.minted.length, 0);
  const version = await accessSession(request({}, 'c5b0a07d-rabbit-hole-web-dev-x.tryrabbithole.workers.dev'), e, keys);
  assert.equal(version.refuse.status, 403, 'version preview hosts are still refused');
  const unset = await accessSession(request({}), env({ ACCESS_HOST: 'preview.example.com' }), keys);
  assert.equal(unset.refuse.status, 403, 'without ACCESS_REDIRECT_FROM another host is refused, never served');
});
