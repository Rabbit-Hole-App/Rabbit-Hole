import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryWebStorage } from 'oidc-client-ts';
import { authClient, oidcSettings, returnPath } from '../src/private-auth.js';

const config = { issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TestPool',
  clientId: 'client123', cognitoDomain: 'https://private-test.auth.us-east-1.amazoncognito.com' };
const origin = 'https://customer.example';

function browser(path) {
  const calls = [];
  const location = Object.assign(new URL(path, origin), { assign: (url) => calls.push(['assign', url]) });
  return { calls, location, sessionStorage: new InMemoryWebStorage(),
    history: { replaceState: (_state, _unused, url) => calls.push(['replace', url]) } };
}

test('return paths preserve Small deep links and reject external or auth redirects', () => {
  for (const path of ['/apps', '/apps/test-job?tab=logs', '/apps/test-job/runs/r_123', '/members', '/chat?app=test-job']) {
    assert.equal(returnPath(path), path);
  }
  for (const path of ['https://evil.example', '//evil.example/apps', '/\\evil.example', '/logout', '/auth/callback?code=private', undefined]) {
    assert.equal(returnPath(path), '/apps');
  }
});

test('OIDC settings use code flow and never persist tokens in browser storage', async () => {
  const state = new InMemoryWebStorage();
  const settings = oidcSettings(config, origin, state);
  assert.equal(settings.response_type, 'code');
  assert.equal(settings.disablePKCE, undefined); // library default is PKCE enabled
  assert.equal(settings.redirect_uri, origin + '/auth/callback');
  await settings.userStore.set('user', 'private-access-token');
  assert.equal(state.length, 0);
  await settings.stateStore.set('transaction', 'pkce-verifier');
  assert.equal(state.length, 1);
  for (const change of [{ issuer: 'https://other.example' }, { cognitoDomain: 'https://other.example' }, { clientId: '../bad' }]) {
    assert.throws(() => oidcSettings({ ...config, ...change }, origin, state));
  }
  assert.throws(() => oidcSettings(config, 'http://public.example', state));
});

test('callback consumes the untouched code then restores the app route without the code', async () => {
  const view = browser('/auth/callback?code=one-use-code&state=correlation');
  let callback;
  const client = authClient({ signinRedirectCallback: async (url) => { callback = url; return { state: { next: '/apps/test-job?tab=logs' } }; } }, config, view);
  assert.equal(await client.start(), true);
  assert.match(callback, /code=one-use-code/);
  assert.deepEqual(view.calls, [['replace', '/apps/test-job?tab=logs']]);
});

test('rejected callback clears URL credentials and never enters the dashboard', async () => {
  const view = browser('/auth/callback?code=bad&state=replayed');
  const client = authClient({ signinRedirectCallback: async () => { throw new Error('No matching state'); } }, config, view);
  await assert.rejects(client.start(), /matching state/);
  assert.deepEqual(view.calls, [['replace', '/login']]);
});

test('logout clears the local user and uses the Cognito managed-login domain', async () => {
  const view = browser('/logout');
  let removed = false;
  const client = authClient({ getUser: async () => null, removeUser: async () => { removed = true; } }, config, view);
  assert.equal(await client.start(), false);
  assert.equal(removed, true);
  const url = new URL(view.calls[0][1]);
  assert.equal(url.origin, config.cognitoDomain);
  assert.equal(url.pathname, '/logout');
  assert.equal(url.searchParams.get('logout_uri'), origin + '/login');
  assert.equal(url.searchParams.has('id_token_hint'), false);
});

test('signed-out page stays signed out until the user chooses sign-in', async () => {
  const view = browser('/login?next=%2Fapps%2Ftest-job');
  let signIn;
  const client = authClient({ signinRedirect: async (data) => { signIn = data; } }, config, view);
  assert.equal(await client.start(), false);
  assert.equal(signIn, undefined);
  await client.signIn();
  assert.deepEqual(signIn, { state: { next: '/apps/test-job' } });
});

test('private bearer credentials never go to other origins and expiry fails closed', async () => {
  const view = browser('/apps');
  let user = { access_token: 'test-token', expired: false };
  const client = authClient({ getUser: async () => user }, config, view);
  assert.deepEqual(await client.headers('/api/apps'), { Authorization: 'Bearer test-token' });
  for (const path of ['https://small-cp.zeroshothq.workers.dev/api/apps', '//other.example/api/apps', '/api/\\other.example']) {
    await assert.rejects(client.headers(path), /only be sent/);
  }
  user = { ...user, expired: true };
  await assert.rejects(client.headers('/api/apps'), { status: 401 });
});

test('concurrent API calls share one token refresh', async () => {
  const view = browser('/apps');
  let refreshes = 0;
  const client = authClient({ getUser: async () => ({ expired: true, refresh_token: 'refresh-fixture' }),
    signinSilent: async () => { refreshes++; await new Promise((resolve) => setTimeout(resolve, 5)); return { access_token: 'renewed' }; } }, config, view);
  const results = await Promise.all([client.headers('/api/apps'), client.headers('/api/workspaces')]);
  assert.equal(refreshes, 1);
  assert.deepEqual(results, [{ Authorization: 'Bearer renewed' }, { Authorization: 'Bearer renewed' }]);
});
