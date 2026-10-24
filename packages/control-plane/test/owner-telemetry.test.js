// The owner guard and the owner telemetry API (telemetry owner decision 4.6): signed out, ordinary user, owner, missing config,
// forged identity input, and SUBSCRIPTION_ONLY on and off. The session is read through the real devIdentity, against a fake
// control plane whose /api/me answers by cookie, as the real one does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ownerTelemetryRoute } from '../src/owner-telemetry-routes.js';
import { subscriptionOwnerRefusal } from '../src/subscription-transport.js';
import { d1, migration, telemetryDb } from './telemetry-fixture.js';

const OWNER = 'owner@example.com';
const sessions = { 'owner-session': { email: OWNER, org: 'org-1', user_id: 'user-owner' }, 'user-session': { email: 'learner@example.com', org: 'org-2', user_id: 'user-2' } };
const CONTROL_PLANE = { fetch: async req => {
  const session = /rh_session=([\w-]+)/.exec(req.headers.get('cookie') || '')?.[1];
  if (new URL(req.url).pathname !== '/api/me' || !sessions[session]) return Response.json({ error: 'Sign in' }, { status: 401 });
  return Response.json(sessions[session]);
} };
function setup(t, extra = {}) {
  const telemetry = telemetryDb(t);
  const learn = new DatabaseSync(':memory:');
  t.after(() => learn.close());
  learn.exec(migration('learn-migrations/0022-usage-accounting.sql'));
  learn.prepare(`INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, started_at) VALUES ('act-1', 'user-2', 'user', 'signed_in', 'ask', 'would_charge', '2026-10', 'completed', ?)`).run(Math.floor(Date.now() / 1000));
  learn.prepare(`INSERT INTO usage_attempts (attempt_id, action_id, kind, provider, model, reserved_micros, cost_micros, cost_state, status, started_at) VALUES ('att-1', 'act-1', 'generation', 'anthropic', 'claude-opus-5', 50000, 1234, 'settled', 'settled', ?)`).run(Math.floor(Date.now() / 1000));
  const env = { CONTROL_PLANE, SUBSCRIPTION_OWNER_EMAIL: OWNER, TELEMETRY_DB: telemetry.db, TELEMETRY_ENVIRONMENT: 'dev', LEARN_DB: d1(learn), ...extra };
  return { env, telemetry };
}
const request = (path, { session, method = 'GET', headers = {}, body } = {}) => new Request(`https://rabbit.test${path}`, { method,
  headers: { ...(session ? { cookie: `rh_session=${session}` } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
const call = (env, path, options) => { const req = request(path, options); return ownerTelemetryRoute(new URL(req.url).pathname, req, env); };
const PATHS = ['/api/owner/telemetry/access', '/api/owner/telemetry/overview', '/api/owner/telemetry/actions/act-1', '/api/owner/telemetry/health', '/api/owner/telemetry/nothing', '/api/owner/telemetry'];

async function assertHidden(response, label) {
  assert.equal(response.status, 404, label);
  const text = await response.text();
  assert.equal(text, 'Not found', label);
  assert.equal(response.headers.get('cache-control'), 'no-store', label);
}

for (const subscriptionOnly of ['true', undefined]) {
  test(`SUBSCRIPTION_ONLY ${subscriptionOnly ?? 'unset'}: signed out and ordinary users get the same 404 on every path; the owner gets data`, async t => {
    const { env } = setup(t, subscriptionOnly ? { SUBSCRIPTION_ONLY: subscriptionOnly } : {});
    for (const path of PATHS) {
      await assertHidden(await call(env, path), `signed out ${path}`);
      await assertHidden(await call(env, path, { session: 'user-session' }), `ordinary user ${path}`);
      await assertHidden(await call(env, path, { session: 'user-session', method: 'POST' }), `ordinary user POST ${path}`);
    }
    await assertHidden(await call(env, '/api/owner/telemetry/project', { method: 'POST', session: 'user-session' }), 'projection');
    const access = await call(env, '/api/owner/telemetry/access', { session: 'owner-session' });
    assert.equal(access.status, 200);
    assert.deepEqual(await access.json(), { owner: true, configured: true, environment: 'dev' });
    const explored = await (await call(env, '/api/owner/telemetry/actions/act-1', { session: 'owner-session' })).json();
    assert.deepEqual(explored.attempts.map(a => [a.attempt_id, a.cost_micros, a.cost_state]), [['att-1', 1234, 'settled']], 'the owner sees the authoritative record');
  });
}

test('forged identity input never makes a caller the owner', async t => {
  const { env } = setup(t);
  const forged = [
    { path: `/api/owner/telemetry/access?email=${encodeURIComponent(OWNER)}` },
    { path: '/api/owner/telemetry/access', headers: { 'x-small-email': OWNER, 'x-rh-usage-payer': JSON.stringify({ email: OWNER }), 'x-forwarded-email': OWNER } },
    { path: '/api/owner/telemetry/project', method: 'POST', body: { email: OWNER, owner: true } },
    { path: '/api/owner/telemetry/access', headers: { cookie: `rh_session=user-session; email=${OWNER}` } },
  ];
  for (const { path, ...options } of forged) {
    await assertHidden(await call(env, path, options), `anonymous ${path}`);
    await assertHidden(await call(env, path, { ...options, session: options.headers?.cookie ? undefined : 'user-session' }), `signed in ${path}`);
  }
});

test('missing or empty owner configuration denies everyone, the owner included, without reading the session', async t => {
  for (const owner of [undefined, '', null]) {
    let read = 0;
    const { env } = setup(t, { SUBSCRIPTION_OWNER_EMAIL: owner, CONTROL_PLANE: { fetch: async (...args) => { read++; return CONTROL_PLANE.fetch(...args); } } });
    await assertHidden(await call(env, '/api/owner/telemetry/access', { session: 'owner-session' }), `owner ${owner}`);
    assert.equal(read, 0, 'no session read without an owner configured');
  }
  // A session whose /api/me has no email (an anonymous viewer) never equals the owner either.
  const { env } = setup(t, { CONTROL_PLANE: { fetch: async () => Response.json({ email: null, org: 'org-1' }) } });
  await assertHidden(await call(env, '/api/owner/telemetry/access', { session: 'owner-session' }), 'no email');
  const failing = setup(t, { CONTROL_PLANE: { fetch: async () => { throw new Error('control plane down'); } } });
  await assertHidden(await call(failing.env, '/api/owner/telemetry/access', { session: 'owner-session' }), 'session read failed');
});

test('the owner: overview keeps cost states apart, projection is POST only, each read is audited, no telemetry storage says so', async t => {
  const { env, telemetry } = setup(t);
  assert.equal((await call(env, '/api/owner/telemetry/project', { session: 'owner-session' })).status, 405);
  const projected = await (await call(env, '/api/owner/telemetry/project', { session: 'owner-session', method: 'POST' })).json();
  assert.deepEqual(projected.copied, { usage_actions: 1, usage_attempts: 1, usage_grants: null }, 'main has no usage_grants yet');
  const overview = await (await call(env, '/api/owner/telemetry/overview?days=7', { session: 'owner-session' })).json();
  assert.deepEqual(overview.attempts, [{ cost_state: 'settled', charge_class: 'would_charge', attempts: 1, cost_micros: 1234, reserved_micros: 50000 }]);
  assert.equal(overview.days, 7);
  assert.deepEqual(telemetry.sqlite.prepare('SELECT route, method, user_ref FROM owner_access_log ORDER BY id').all().map(r => ({ ...r })),
    [{ route: 'project', method: 'POST', user_ref: 'user-owner' }, { route: 'overview', method: 'GET', user_ref: 'user-owner' }]);
  const bare = setup(t, { TELEMETRY_DB: undefined });
  assert.equal((await (await call(bare.env, '/api/owner/telemetry/overview', { session: 'owner-session' })).json()).configured, false);
});

test('subscription transport behavior is unchanged by the shared comparison', () => {
  const env = { SUBSCRIPTION_ONLY: 'true', SUBSCRIPTION_OWNER_EMAIL: OWNER };
  assert.equal(subscriptionOwnerRefusal(env, { email: OWNER }), null);
  assert.equal(subscriptionOwnerRefusal(env, { email: 'learner@example.com' }).status, 403);
  assert.equal(subscriptionOwnerRefusal({ SUBSCRIPTION_ONLY: 'true' }, { email: undefined }).status, 403);
  assert.equal(subscriptionOwnerRefusal({ SUBSCRIPTION_OWNER_EMAIL: OWNER }, { email: 'learner@example.com' }), null, 'mode off: nothing refused here');
});
