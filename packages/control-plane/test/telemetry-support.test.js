// Support correlation end to end, on fixtures (telemetry brief Task 11): a browser failure is posted, the server records its own
// events under the same request trace, the user files a report and gets a reference, and the owner follows the reference to the
// failure, the server events and the action, then reconciles the action with the accounting rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { feedbackFetch, supportRef, validateFeedback } from '../src/learn-feedback.js';
import { clientTelemetryRoute } from '../src/telemetry-client-route.js';
import { ownerTelemetryRoute } from '../src/owner-telemetry-routes.js';
import { emitTelemetry, withTrace } from '../src/telemetry-delivery.js';
import { makeEvent } from '../src/telemetry-contract.js';
import { d1, migration, telemetryDb } from './telemetry-fixture.js';

const OWNER = 'owner@example.com', LEARNER = 'user-learner';
const TRACE = '0f3a9c21d4e5b678', FINGERPRINT = 'ab12cd34ef56ab78';

test('support references are Crockford base 32 and not guessable from each other', () => {
  const refs = new Set(Array.from({ length: 200 }, () => supportRef()));
  assert.equal(refs.size, 200);
  for (const ref of refs) assert.match(ref, /^RH-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
});

test('feedback diagnostics keep only hex ids, at most five each, and never text', () => {
  const report = validateFeedback({ kind: 'bug', text: 'broke', diagnostics: { fingerprints: [FINGERPRINT, 'not hex at all', '0'.repeat(16), 'a'.repeat(16), 'b'.repeat(16), 'c'.repeat(16), 'd'.repeat(16)], traces: [TRACE, 'secret token value'], message: 'private words' } });
  assert.equal(report.diagnostics.fingerprints.length, 5);
  assert.deepEqual(report.diagnostics.traces, [TRACE]);
  assert.equal(JSON.stringify(report).includes('private words'), false);
  assert.equal('diagnostics' in validateFeedback({ kind: 'bug', text: 'broke', diagnostics: { fingerprints: ['nope'] } }), false);
});

test('a reference leads from a user report to the browser failure, the server events of the request, and the accounting action', async t => {
  const { sqlite, db } = telemetryDb(t);
  const learn = new DatabaseSync(':memory:');
  t.after(() => learn.close());
  learn.exec(migration('learn-migrations/0022-usage-accounting.sql'));
  const now = Math.floor(Date.now() / 1000);
  learn.prepare("INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, started_at) VALUES ('act-1', ?, 'user', 'signed_in', 'ask', 'would_charge', '2026-10', 'completed', ?)").run(LEARNER, now);
  learn.prepare("INSERT INTO usage_attempts (attempt_id, action_id, kind, provider, model, reserved_micros, cost_micros, cost_state, status, started_at) VALUES ('att-1', 'act-1', 'generation', 'anthropic', 'claude-opus-5', 50000, 1234, 'settled', 'settled', ?)").run(now);

  // 1. The server handles a request that carried the browser's trace id and records its model call under it, joined to the action.
  const traced = withTrace(new Request('https://rabbit.test/api/learn/ask', { method: 'POST', headers: { 'x-rh-trace': TRACE } }), { TELEMETRY_DB: db, TELEMETRY_ENVIRONMENT: 'dev' });
  assert.equal(traced.TELEMETRY_TRACE, TRACE);
  assert.equal(withTrace(new Request('https://rabbit.test/x', { headers: { 'x-rh-trace': 'not-a-trace' } }), {}).TELEMETRY_TRACE, undefined);
  await emitTelemetry(traced, makeEvent('model_call.finished', { feature: 'ask', action_id: 'act-1', user_ref: LEARNER, trace_id: traced.TELEMETRY_TRACE, outcome: 'failed', error_code: 'http_error',
    payload: { task: 'chat', provider: 'anthropic', status_code: 529 } }, { service: 'app_worker' }));

  // 2. The page reports the failed request, keyed to the same trace.
  const batch = { events: [makeEvent('client.error', { trace_id: TRACE, payload: { kind: 'network', fingerprint: FINGERPRINT, route: '/apps/:id', source: 'fetch', status_code: 529 } }, { environment: 'production', service: 'web' })] };
  const posted = await clientTelemetryRoute('/api/telemetry/client', new Request('https://rabbit.test/api/telemetry/client', { method: 'POST', body: JSON.stringify(batch) }),
    { TELEMETRY_DB: db, TELEMETRY_ENVIRONMENT: 'dev' }, { identity: async () => ({ userId: LEARNER }) });
  assert.equal(posted.status, 202);

  // 3. The person files a bug and is given a reference.
  const stored = new Map();
  const feedbackEnv = { TELEMETRY_DB: db, TELEMETRY_ENVIRONMENT: 'dev', LEARN_MEDIA: { put: async (key, value) => stored.set(key, JSON.parse(value)) },
    CONTROL_PLANE: { fetch: async () => Response.json({ name: 'demo', org: 'o', email: 'learner@example.com', user_id: LEARNER }) } };
  const sent = await feedbackFetch(new Request('https://rabbit.test/api/learn/feedback', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ app: 'demo', kind: 'bug', text: 'My answer vanished and I saw an error', context: { path: '/apps/canvas-1a2b3c4d?ws=x' }, diagnostics: { fingerprints: [FINGERPRINT], traces: [TRACE] } }) }), feedbackEnv);
  assert.equal(sent.status, 201);
  const { ref } = await sent.json();
  assert.match(ref, /^RH-/);
  assert.equal([...stored.values()][0].ref, ref, 'the stored report carries the reference');
  const event = sqlite.prepare("SELECT user_ref, body FROM telemetry_events WHERE event_name = 'support.report'").get();
  assert.equal(event.user_ref, LEARNER);
  assert.deepEqual(JSON.parse(event.body).payload, { ref, kind: 'bug', route: '/apps/:id', fingerprints: [FINGERPRINT], traces: [TRACE] });
  assert.equal(event.body.includes('vanished'), false, 'the report text never reaches telemetry');

  // 4. The owner follows the reference.
  const ownerEnv = { SUBSCRIPTION_OWNER_EMAIL: OWNER, TELEMETRY_DB: db, TELEMETRY_ENVIRONMENT: 'dev', LEARN_DB: d1(learn),
    CONTROL_PLANE: { fetch: async () => Response.json({ email: OWNER, org: 'o', user_id: 'user-owner' }) } };
  const get = async path => { const req = new Request(`https://rabbit.test${path}`, { headers: { cookie: 'rh_session=owner' } }); return ownerTelemetryRoute(new URL(req.url).pathname, req, ownerEnv); };
  const found = await (await get(`/api/owner/telemetry/support/${ref}`)).json();
  assert.deepEqual([found.report.ref, found.report.kind, found.report.account], [ref, 'bug', LEARNER]);
  assert.deepEqual(found.clientErrors.map(e => [e.payload.kind, e.payload.status_code, e.trace_id]), [['network', 529, TRACE]]);
  assert.deepEqual(found.serverEvents.map(e => [e.event_name, e.action_id, e.error_code]), [['model_call.finished', 'act-1', 'http_error']]);
  assert.deepEqual(found.actionIds, ['act-1']);
  assert.equal((await get('/api/owner/telemetry/support/RH-0000-0000')).status, 404);
  assert.equal((await get('/api/owner/telemetry/support/nonsense')).status, 400);

  // 5. The action explorer shows the browser failure in the action's timeline, beside its accounting rows.
  const action = await (await get('/api/owner/telemetry/actions/act-1')).json();
  assert.deepEqual(action.events.map(e => e.event_name).sort(), ['client.error', 'model_call.finished']);
  assert.ok(action.events.some(e => e.event_name === 'client.error' && e.payload.fingerprint === FINGERPRINT), 'linked through the trace id');
  assert.deepEqual(action.attempts.map(a => [a.attempt_id, a.cost_micros, a.cost_state]), [['att-1', 1234, 'settled']]);

  // 6. Grouped client errors, for the Reliability view.
  const groups = (await (await get('/api/owner/telemetry/client-errors?days=7')).json()).groups;
  assert.deepEqual(groups.map(g => [g.fingerprint, g.kind, g.route, g.occurrences, g.accounts]), [[FINGERPRINT, 'network', '/apps/:id', 1, 1]]);
});

test('a stranger cannot read a support reference or client errors', async t => {
  const { db } = telemetryDb(t);
  const env = { SUBSCRIPTION_OWNER_EMAIL: OWNER, TELEMETRY_DB: db, TELEMETRY_ENVIRONMENT: 'dev', CONTROL_PLANE: { fetch: async () => Response.json({ email: 'learner@example.com', org: 'o', user_id: LEARNER }) } };
  for (const path of ['/api/owner/telemetry/support/RH-7QK2-M9XD', '/api/owner/telemetry/client-errors']) {
    const req = new Request(`https://rabbit.test${path}`, { headers: { cookie: 'rh_session=learner' } });
    assert.equal((await ownerTelemetryRoute(new URL(req.url).pathname, req, env)).status, 404, path);
  }
});
