'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { settings, discover, verifyToken, login, accessToken } = require('../lib/cognito');

const origin = 'https://customer.example';
const cfg = { issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Test', clientId: 'client123',
  cognitoDomain: 'https://test.auth.us-east-1.amazoncognito.com', cliRedirectUri: 'http://127.0.0.1:8766/auth/callback' };
const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwks = { keys: [{ ...keys.publicKey.export({ format: 'jwk' }), kid: 'fixture', alg: 'RS256', use: 'sig' }] };
const claims = (use = 'id') => ({ iss: cfg.issuer, ...(use === 'id' ? { aud: cfg.clientId } : { client_id: cfg.clientId, scope: 'openid email' }),
  sub: 'subject', email: 'owner@example.test', token_use: use, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
function jwt(body) {
  const data = [Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'fixture' })).toString('base64url'), Buffer.from(JSON.stringify(body)).toString('base64url')].join('.');
  return data + '.' + crypto.sign('RSA-SHA256', Buffer.from(data), keys.privateKey).toString('base64url');
}

test('private login accepts only an HTTPS origin, Cognito settings and loopback callback', () => {
  assert.equal(settings(origin, cfg).origin, origin);
  for (const base of ['http://customer.example', origin + '/other', 'https://user:password@customer.example', origin + '?token=x']) assert.throws(() => settings(base, cfg));
  for (const change of [{ issuer: 'https://other.example' }, { cognitoDomain: 'https://other.example' }, { cliRedirectUri: 'http://0.0.0.0:8766/auth/callback' }]) assert.throws(() => settings(origin, { ...cfg, ...change }));
});

test('Cognito JWT validation checks signature, issuer, audience, use, expiry, nonce and subject', () => {
  const body = { ...claims(), nonce: 'expected' };
  assert.equal(verifyToken(jwt(body), cfg, jwks, { use: 'id', nonce: 'expected' }).sub, 'subject');
  for (const change of [{ iss: 'wrong' }, { aud: 'wrong' }, { token_use: 'access' }, { exp: 1 }, { nonce: 'wrong' }, { sub: '' }]) {
    assert.throws(() => verifyToken(jwt({ ...body, ...change }), cfg, jwks, { use: 'id', nonce: 'expected' }));
  }
  const altered = jwt(body).split('.');
  altered[1] = Buffer.from(JSON.stringify({ ...body, sub: 'attacker' })).toString('base64url');
  assert.throws(() => verifyToken(altered.join('.'), cfg, jwks, { use: 'id', nonce: 'expected' }));
  assert.throws(() => verifyToken(jwt(claims('access')), cfg, jwks, { use: 'id' }));
});

test('loopback login rejects foreign state, exchanges the code with PKCE, and checks workspace membership before saving', async () => {
  let authorize, saved, requestCount = 0;
  const fetcher = async (url, options) => {
    requestCount++;
    if (url.endsWith('/.well-known/jwks.json')) return Response.json(jwks);
    if (url.endsWith('/oauth2/token')) {
      assert.equal(options.redirect, 'error');
      const body = new URLSearchParams(options.body);
      assert.equal(body.get('code'), 'fixture-code');
      assert.equal(crypto.createHash('sha256').update(body.get('code_verifier')).digest('base64url'), authorize.searchParams.get('code_challenge'));
      return Response.json({ access_token: jwt(claims('access')), id_token: jwt({ ...claims(), nonce: authorize.searchParams.get('nonce') }), refresh_token: 'fixture-refresh', expires_in: 3600, token_type: 'Bearer' });
    }
    assert.equal(url, origin + '/api/workspaces');
    assert.match(options.headers.Authorization, /^Bearer /);
    return Response.json({ email: 'owner@example.test', active: 'w-private', workspaces: [{ slug: 'w-private' }] });
  };
  const result = await login(origin, cfg, { fetcher, save: (value) => { saved = value; }, log: () => {}, timeoutMs: 5000,
    onAuthorize: async (url) => {
      authorize = new URL(url);
      assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
      const callback = new URL(cfg.cliRedirectUri);
      callback.searchParams.set('code', 'fixture-code');
      callback.searchParams.set('state', 'foreign-state');
      assert.equal((await fetch(callback)).status, 400);
      assert.equal(requestCount, 0);
      callback.searchParams.set('state', authorize.searchParams.get('state'));
      assert.equal((await fetch(callback)).status, 200);
    } });
  assert.equal(result.email, 'owner@example.test');
  assert.equal(saved.cognito.origin, origin);
  assert.equal(saved.authType, 'cognito');
  assert.equal(saved.cognito.refresh_token, 'fixture-refresh');
});

test('private credentials are bound to their endpoint', async () => {
  const session = { origin, access_token: 'fixture', expires_at: Date.now() + 60000 };
  assert.equal(await accessToken(origin, session), 'fixture');
  await assert.rejects(accessToken('https://other.example', session), /Sign in/);
  await assert.rejects(accessToken(origin, null), /Sign in/);
});

test('login discovery preserves the existing hosted login and rejects other failures', async (t) => {
  let response;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, origin + '/api/auth/config');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers, undefined);
    return response;
  });
  response = Response.json({ error: 'run small login first' }, { status: 401 });
  assert.equal(await discover(origin), null);
  response = Response.json(cfg);
  assert.equal((await discover(origin)).origin, origin);
  response = Response.json({ error: 'Unauthorized' }, { status: 401 });
  await assert.rejects(discover(origin), /Could not read/);
});

test('failed refresh reports reauthentication without exposing or reusing credentials', async () => {
  const session = { ...cfg, origin, access_token: 'old', refresh_token: 'private-refresh', expires_at: 1 };
  await assert.rejects(accessToken(origin, session, { fetcher: async () => Response.json({ error: 'invalid_grant', error_description: 'private-refresh' }, { status: 400 }) }), (error) => {
    assert.match(error.message, /Sign in/);
    assert.doesNotMatch(error.message, /private-refresh|old/);
    return true;
  });
});
