// POST /api/telemetry/client: the browser is untrusted. Fixture tests of the trust boundary, dedup and bounds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clientTelemetryRoute, CLIENT_PATH } from '../src/telemetry-client-route.js';
import { makeEvent } from '../src/telemetry-contract.js';
import { telemetryDb } from './telemetry-fixture.js';

let seq = 0;
const failure = (payload = {}, fields = {}) => makeEvent('client.error', { payload: { kind: 'save_failed', fingerprint: 'ab12cd34ef56ab78', route: '/apps/:id', source: 'fetch', status_code: 503, browser: 'chrome', device: 'desktop', ...payload }, ...fields }, { environment: 'production', service: 'web' });
const post = (events, { headers = {}, raw } = {}) => new Request(`https://rabbit.test${CLIENT_PATH}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: raw ?? JSON.stringify({ events }) });
const as = userId => ({ identity: async () => (userId ? { userId, email: 'x@example.com', org: 'o' } : new Response('no', { status: 401 })) });
const setup = (t, extra = {}) => { const telemetry = telemetryDb(t); return { ...telemetry, env: { TELEMETRY_DB: telemetry.db, TELEMETRY_ENVIRONMENT: 'dev', ...extra } }; };
const call = (env, request, deps) => clientTelemetryRoute(new URL(request.url).pathname, request, env, deps);
const rows = sqlite => sqlite.prepare('SELECT event_id, event_name, environment, service, user_ref, trace_id, release_sha, feature, occurred_at, body FROM telemetry_events').all().map(row => ({ ...row, body: JSON.parse(row.body) }));
const user = () => `user-${++seq}`;

test('a valid batch is stored under the server identity; every identity field the browser sent is replaced', async t => {
  const { env, sqlite } = setup(t, { RELEASE_SHA: 'abcdef1234567' });
  const id = user();
  const forged = failure({}, { trace_id: '0f3a9c21d4e5b678', user_ref: 'someone-else', action_id: 'act-forged', attempt_id: 'att-forged', environment: 'production', service: 'job', occurred_at: 1, release_sha: '1111111' });
  const response = await call(env, post([forged]), { ...as(id), now: () => 1_760_000_000_000 });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { accepted: 1, rejected: 0, deduped: 0 });
  const [row] = rows(sqlite);
  assert.deepEqual([row.environment, row.service, row.user_ref, row.trace_id, row.release_sha, row.feature, row.occurred_at], ['dev', 'web', id, '0f3a9c21d4e5b678', 'abcdef1234567', 'client', 1_760_000_000_000]);
  assert.match(row.event_id, /^ce-/);
  assert.equal(row.body.action_id, undefined, 'no action id from the browser');
  assert.equal(row.body.attempt_id, undefined);
});

test('only the client namespace is accepted from a browser: a forged model call or delivery report is refused', async t => {
  const { env, sqlite } = setup(t);
  const model = makeEvent('model_call.finished', { payload: { task: 'chat', provider: 'anthropic' } }, { environment: 'dev', service: 'web' });
  const delivery = makeEvent('telemetry.delivery', { payload: { source: 'app_worker', dropped: 0 } }, { environment: 'dev', service: 'web' });
  const response = await call(env, post([model, delivery, failure()]), as(user()));
  assert.deepEqual(await response.json(), { accepted: 1, rejected: 2, deduped: 0 });
  assert.deepEqual(rows(sqlite).map(row => row.event_name), ['client.error']);
});

test('message text, stacks and URLs cannot ride along: an event with an unknown payload field or a raw URL is refused whole', async t => {
  const { env, sqlite } = setup(t);
  const leaky = [failure({ message: 'Cannot read properties of undefined' }), failure({ stack: 'at x (https://rabbit.test/b/secrettoken)' }), failure({ route: '/b/AbCdEfGhIjKlMnOpQrStUv?x=1' })];
  const response = await call(env, post(leaky), as(user()));
  assert.deepEqual(await response.json(), { accepted: 0, rejected: 3, deduped: 0 });
  assert.equal(rows(sqlite).length, 0);
});

test('dedup: the same failure from the same account in the same bucket is one row, however often it is sent', async t => {
  const { env, sqlite } = setup(t);
  const id = user(), at = 1_760_000_000_000;
  const send = (events, now) => call(env, post(events), { ...as(id), now: () => now }).then(r => r.json());
  assert.deepEqual(await send([failure({ count: 1 })], at), { accepted: 1, rejected: 0, deduped: 0 });
  assert.deepEqual(await send([failure({ count: 7, dropped: 2, duration_ms: 90 })], at + 5000), { accepted: 0, rejected: 0, deduped: 1 }, 'counters do not make a new row');
  assert.deepEqual(await send([failure({ fingerprint: '0000000000000001' })], at + 5000), { accepted: 1, rejected: 0, deduped: 0 }, 'another failure is another row');
  assert.deepEqual(await send([failure()], at + 11 * 60_000), { accepted: 1, rejected: 0, deduped: 0 }, 'a later bucket records it again');
  assert.deepEqual(await call(env, post([failure()]), { ...as(user()), now: () => at }).then(r => r.json()), { accepted: 1, rejected: 0, deduped: 0 }, 'another account is its own row');
  assert.equal(rows(sqlite).length, 4);
});

test('an anonymous page (a shared canvas) is accepted and stored without an account or an address', async t => {
  const { env, sqlite } = setup(t);
  const response = await call(env, post([failure()], { headers: { 'cf-connecting-ip': '203.0.113.9' } }), as(null));
  assert.equal(response.status, 202);
  assert.equal(rows(sqlite)[0].user_ref, null);
  assert.equal(JSON.stringify(rows(sqlite)).includes('203.0.113.9'), false);
});

test('cross-site posts, oversized bodies, bad JSON and the wrong method are refused', async t => {
  const { env, sqlite } = setup(t);
  const deps = as(user());
  assert.equal((await call(env, post([failure()], { headers: { 'sec-fetch-site': 'cross-site' } }), deps)).status, 403);
  assert.equal((await call(env, post([failure()], { headers: { origin: 'https://evil.example' } }), deps)).status, 403);
  assert.equal((await call(env, post([failure()], { headers: { origin: 'https://rabbit.test', 'sec-fetch-site': 'same-origin' } }), deps)).status, 202);
  assert.equal((await call(env, post(null, { raw: 'x'.repeat(70_000) }), deps)).status, 413);
  assert.equal((await call(env, post(null, { raw: '{not json' }), deps)).status, 400);
  assert.equal((await call(env, post(null, { raw: JSON.stringify({ events: 'nope' }) }), deps)).status, 400);
  assert.equal((await call(env, post(Array.from({ length: 51 }, () => failure())), deps)).status, 400, 'more than 50 events is refused whole');
  assert.equal((await call(env, new Request(`https://rabbit.test${CLIENT_PATH}`), deps)).status, 405);
  assert.equal(rows(sqlite).length, 1);
  assert.equal(await clientTelemetryRoute('/api/telemetry/other', post([]), env), null);
});

test('one account cannot flood: a burst beyond its bucket gets 429 with Retry-After, and others are unaffected', async t => {
  const { env } = setup(t);
  const id = user();
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await call(env, post(Array.from({ length: 20 }, (_, n) => failure({ fingerprint: `${i}${n}`.padStart(16, '0') }))), as(id))).status);
  assert.deepEqual(statuses, [202, 202, 202, 429]);
  const limited = await call(env, post([failure()]), as(id));
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  assert.equal((await call(env, post([failure()]), as(user()))).status, 202);
});

test('not provisioned, switched off, or the database down: nothing breaks the page', async t => {
  const { env } = setup(t);
  assert.equal((await call({ TELEMETRY_ENVIRONMENT: 'dev' }, post([failure()]), as(user()))).status, 204, 'no TELEMETRY_DB');
  assert.equal((await call({ TELEMETRY_DB: env.TELEMETRY_DB }, post([failure()]), as(user()))).status, 204, 'no TELEMETRY_ENVIRONMENT');
  assert.equal((await call({ ...env, TELEMETRY_CLIENT_DISABLED: 'true' }, post([failure()]), as(user()))).status, 204, 'kill switch');
  const down = telemetryDb(t, { fail: () => true });
  assert.equal((await call({ ...env, TELEMETRY_DB: down.db }, post([failure()]), as(user()))).status, 503);
  const throwing = { identity: async () => { throw new Error('control plane down'); } };
  assert.equal((await call(env, post([failure({ fingerprint: '00000000000000ff' })]), throwing)).status, 202, 'a failed session read is an anonymous caller');
});
