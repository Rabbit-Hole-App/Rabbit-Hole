import { test } from 'node:test';
import assert from 'node:assert/strict';

// The personal subscription bridge's owner gate (subscription-transport.js), shared by every model route that can reach the
// bridge: the Learn ask, Tutor, journey, grading, artifacts, voice, repository asks, the shared ask and the shared hooks.
// A missing owner identity must never authorize anyone, and an anonymous viewer is never the owner. With the mode off, the
// gate refuses nothing: public links and normal workers keep working. Run with FIXTURE=<path> to test another copy.
const { subscriptionOwnerRefusal } = await import(process.env.FIXTURE || '../src/subscription-transport.js');
const ON = { SUBSCRIPTION_ONLY: 'true' };
const refused = (env, access) => subscriptionOwnerRefusal(env, access)?.status ?? null;

test('mode off: nothing is refused, signed in or anonymous (public access unchanged)', () => {
  for (const env of [{}, { SUBSCRIPTION_ONLY: 'false' }, { SUBSCRIPTION_OWNER_EMAIL: 'owner@test' }]) {
    for (const access of [{ email: 'ben@test' }, { email: null }, {}, undefined]) assert.equal(refused(env, access), null, JSON.stringify([env, access]));
  }
});

test('mode on with an owner: only the owner is served; another account and an anonymous viewer get 403', () => {
  const env = { ...ON, SUBSCRIPTION_OWNER_EMAIL: 'owner@test' };
  assert.equal(refused(env, { email: 'owner@test' }), null);
  for (const access of [{ email: 'ben@test' }, { email: 'OWNER@test' }, { email: null }, { email: undefined }, {}, undefined]) assert.equal(refused(env, access), 403, JSON.stringify(access));
});

test('mode on with no owner configured: nobody is authorized, an anonymous viewer least of all (the undefined === undefined hole)', () => {
  for (const owner of [undefined, '', null]) {
    const env = { ...ON, SUBSCRIPTION_OWNER_EMAIL: owner };
    for (const access of [{ email: undefined }, {}, { email: null }, { email: '' }, { email: 'ben@test' }, undefined]) assert.equal(refused(env, access), 403, JSON.stringify([owner, access]));
  }
});

// Through the routes the app worker serves (shared-canvas-fixture.js): a SUBSCRIPTION_ONLY worker with no owner configured.
test('routes, mode on with no owner: a public link still opens for anyone; the shared ask, the shared hooks and the owner\'s own Learn ask are refused, with no bridge call', async t => {
  t.mock.method(console, 'log', () => {});
  const { setup } = await import('./shared-canvas-fixture.js');
  const f = setup(t, { vars: { SMALL_ENV: 'test', JOURNEY_MODEL_STUB: 'fixtures', SUBSCRIPTION_ONLY: 'true', SUBSCRIPTION_BRIDGE_URL: 'https://bridge.test', SUBSCRIPTION_BRIDGE_TOKEN: 'bridge-token' } });
  const original = globalThis.fetch, bridge = [];
  globalThis.fetch = async (url, init) => { if (String(url).startsWith('https://bridge.test')) { bridge.push(String(url)); return Response.json({ error: 'not reachable in a test' }, { status: 500 }); } return original(url, init); };
  t.after(() => { globalThis.fetch = original; });
  const { canvas, token } = await f.shareProject({});
  for (const as of [null, 'ben']) assert.equal((await f.call('GET', `/api/learn/boards/shared/${token}`, { as })).status, 200, `${as ?? 'anonymous'}: the public link opens`);
  assert.equal((await f.call('POST', `/api/learn/boards/shared/${token}/ask`, { as: 'ben', body: { message: 'Why?' } })).status, 403, 'the shared ask');
  assert.equal((await f.call('POST', `/api/learn/boards/shared/${token}/next-steps`, { as: null, body: { origin: null } })).status, 403, 'the shared hooks, anonymous');
  assert.equal((await f.call('POST', `/api/learn/boards/shared/${token}/next-steps`, { as: 'ben', body: { origin: null } })).status, 403, 'the shared hooks, signed in');
  assert.ok(canvas?.name, 'the owner canvas exists');
  assert.deepEqual(bridge, [], 'nothing reached the bridge');
});
