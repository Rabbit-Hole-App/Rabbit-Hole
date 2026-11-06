// A dark deploy: the Worker with no TELEMETRY_DB, no TELEMETRY_ARCHIVE and no TELEMETRY_ENVIRONMENT (the state before the owner
// provisions anything). Every telemetry entry point must run, refuse or degrade with a defined answer; none may throw or change
// what a user gets. Fixture evidence: it calls each handler with an env that lacks the bindings, not a deployed Worker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { clientTelemetryRoute, CLIENT_PATH } from '../src/telemetry-client-route.js';
import { tutorTelemetryRoute, TUTOR_PATH } from '../src/telemetry-tutor-route.js';
import { ownerTelemetryRoute, OWNER_ROUTES } from '../src/owner-telemetry-routes.js';
import { emitTelemetry } from '../src/telemetry-delivery.js';
import { loggedModel } from '../src/learn-models.js';
import { makeEvent } from '../src/telemetry-contract.js';

const OWNER = 'owner@example.com';
const CONTROL_PLANE = { fetch: async req => {
  const session = /rh_session=([\w-]+)/.exec(req.headers.get('cookie') || '')?.[1];
  const people = { owner: { email: OWNER, org: 'o', user_id: 'user-owner' }, other: { email: 'other@example.com', org: 'o', user_id: 'user-2' } };
  return new URL(req.url).pathname === '/api/me' && people[session] ? Response.json(people[session]) : Response.json({ error: 'Sign in' }, { status: 401 });
} };
const dark = { CONTROL_PLANE, SUBSCRIPTION_OWNER_EMAIL: OWNER };
const as = who => ({ identity: async () => who ?? new Response('no', { status: 401 }) });
const learner = { userId: 'user-9', email: 'learner@example.com', org: 'o' };

test('browser and Tutor ingestion answer 204 to a signed-in caller and keep nothing', async () => {
  const client = new Request(`https://rabbit.test${CLIENT_PATH}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"events":[]}' });
  assert.equal((await clientTelemetryRoute(CLIENT_PATH, client, dark, as(learner))).status, 204);
  const tutor = () => new Request(`https://rabbit.test${TUTOR_PATH}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"events":[]}' });
  assert.equal((await tutorTelemetryRoute(TUTOR_PATH, tutor(), dark, as(learner))).status, 204);
  assert.equal((await tutorTelemetryRoute(TUTOR_PATH, tutor(), dark, as(null))).status, 401, 'the sign-in rule does not depend on storage');
});

test('server events are a no-op and the model call is returned unchanged', async t => {
  assert.equal(await emitTelemetry(dark, makeEvent('client.error', { payload: { kind: 'save_failed', fingerprint: 'ab12cd34ef56ab78', route: '/apps/:id', source: 'fetch' } }, { environment: 'dev', service: 'app_worker' })), false);
  t.mock.method(console, 'log', () => {});
  const answer = new Response('model reply', { status: 200 });
  const reply = await loggedModel('chat', async () => answer)({ ...dark, SMALL_ENV: 'test' }, { stream: false, messages: [] }, 'claude-opus-5-5', null);
  assert.equal(reply, answer, 'the same response object, untouched');
  assert.equal(await reply.text(), 'model reply');
});

test('the owner API: ordinary users still get 404; the owner gets "not configured" from every storage route, never an error', async () => {
  const call = (name, { session, method = 'GET' } = {}) => ownerTelemetryRoute(`/api/owner/telemetry/${name}`, new Request(`https://rabbit.test/api/owner/telemetry/${name}`,
    { method, headers: session ? { cookie: `rh_session=${session}` } : {} }), dark);
  for (const [name, method] of Object.entries(OWNER_ROUTES)) {
    assert.equal((await call(name, { method })).status, 404, `signed out ${name}`);
    assert.equal((await call(name, { method, session: 'other' })).status, 404, `ordinary user ${name}`);
  }
  assert.deepEqual(await (await call('access', { session: 'owner' })).json(), { owner: true, configured: false, environment: null });
  for (const name of ['overview', 'health', 'client-errors', 'learning']) {
    const answered = await call(name, { session: 'owner' });
    assert.equal(answered.status, 200, name);
    assert.equal((await answered.json()).configured, false, name);
  }
  const projected = await call('project', { session: 'owner', method: 'POST' });
  assert.equal(projected.status, 200);
  assert.equal((await projected.json()).configured, false);
});

test('no source reads TELEMETRY_ARCHIVE: the private bucket is not a runtime dependency yet', () => {
  const src = new URL('../src/', import.meta.url);
  const readers = readdirSync(src, { recursive: true }).filter(f => f.endsWith('.js') && /env\??\.TELEMETRY_ARCHIVE\b/.test(readFileSync(new URL(f, src), 'utf8')));
  assert.deepEqual(readers, []);
});
