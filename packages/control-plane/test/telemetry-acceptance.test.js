// Telemetry acceptance over deterministic fixtures, at the route level (owner request 2026-10-25): the real route handlers over
// node:sqlite stand-ins for TELEMETRY_DB (every telemetry migration) and LEARN_DB (usage-accounting), no network, no model, no
// browser. It proves: owner access (200, configured), the other address and a signed-out caller refused (404), ingestion (202 and a
// stored row), the dashboard queries over seeded rows, telemetry health (projection cursors, delivery counts, dead letters), and
// that measured, estimated, unknown-with-reservation and outstanding-reservation costs stay separate rows and are never summed.
// NOT proven here: the page in a browser (owner-telemetry-check.mjs covers the unprovisioned page; owner-telemetry-view.test.mjs
// renders the page over the same shapes), a bound Cloudflare D1, or anything deployed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { clientTelemetryRoute, CLIENT_PATH } from '../src/telemetry-client-route.js';
import { ownerTelemetryRoute, OWNER_ROUTES } from '../src/owner-telemetry-routes.js';
import { makeEvent } from '../src/telemetry-contract.js';
import { d1, migration, telemetryDb } from './telemetry-fixture.js';

const OWNER = 'Yudhisteer.chin@gmail.com'; // as the secret is typed; the guard compares through loginEmail
const people = { owner: { email: 'yudhisteer.chin@gmail.com', org: 'o', user_id: 'user-owner' }, other: { email: 'yudhisteer.chin01@gmail.com', org: 'o', user_id: 'user-chin01' } };
const CONTROL_PLANE = { fetch: async req => {
  const session = /rh_session=([\w-]+)/.exec(req.headers.get('cookie') || '')?.[1];
  return new URL(req.url).pathname === '/api/me' && people[session] ? Response.json(people[session]) : Response.json({ error: 'Sign in' }, { status: 401 });
} };
const NOW = Math.floor(Date.now() / 1000);

function world(t) {
  const telemetry = telemetryDb(t);
  const learn = new DatabaseSync(':memory:');
  t.after(() => learn.close());
  learn.exec(migration('learn-migrations/0022-usage-accounting.sql'));
  const action = learn.prepare(`INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, started_at) VALUES (?, 'user-9', 'user', 'signed_in', 'ask', ?, '2026-10', ?, ?)`);
  const attempt = learn.prepare(`INSERT INTO usage_attempts (attempt_id, action_id, kind, provider, model, reserved_micros, cost_micros, cost_state, status, started_at) VALUES (?, ?, 'generation', 'anthropic', 'claude-opus-5-5', ?, ?, ?, ?, ?)`);
  // One attempt per cost state, each on its own action: measured 1234, estimated 700, unknown (no cost, its reservation held), outstanding reservation.
  action.run('act-measured', 'would_charge', 'completed', NOW); attempt.run('att-measured', 'act-measured', 50000, 1234, 'settled', 'settled', NOW);
  action.run('act-estimated', 'would_charge', 'completed', NOW); attempt.run('att-estimated', 'act-estimated', 50000, 700, 'estimated', 'settled', NOW);
  action.run('act-unknown', 'free', 'completed', NOW); attempt.run('att-unknown', 'act-unknown', 20000, null, 'unknown', 'settled', NOW);
  action.run('act-running', 'would_charge', 'running', NOW); attempt.run('att-running', 'act-running', 30000, null, 'reserved', 'running', NOW);
  const env = { CONTROL_PLANE, SUBSCRIPTION_OWNER_EMAIL: OWNER, TELEMETRY_DB: telemetry.db, TELEMETRY_ENVIRONMENT: 'dev', LEARN_DB: d1(learn) };
  return { env, ...telemetry };
}
const owner = (env, path, { session = 'owner', method = 'GET' } = {}) => ownerTelemetryRoute(`/api/owner/telemetry${path.split('?')[0]}`,
  new Request(`https://rabbit.test/api/owner/telemetry${path}`, { method, headers: session ? { cookie: `rh_session=${session}` } : {} }), env);
const failure = () => makeEvent('client.error', { payload: { kind: 'save_failed', fingerprint: 'ab12cd34ef56ab78', route: '/apps/:id', source: 'fetch', status_code: 503, browser: 'chrome', device: 'desktop' } }, { environment: 'production', service: 'web' });
const ingest = (env, events) => clientTelemetryRoute(CLIENT_PATH, new Request(`https://rabbit.test${CLIENT_PATH}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events }) }),
  env, { identity: async () => ({ userId: 'user-9', email: 'learner@example.com', org: 'o' }) });

test('owner access: the owner (secret typed in any case) is let in with configured:true; yudhisteer.chin01 and a signed-out caller get 404 on every route', async t => {
  const { env } = world(t);
  const access = await owner(env, '/access');
  assert.equal(access.status, 200);
  assert.deepEqual(await access.json(), { owner: true, configured: true, environment: 'dev' });
  for (const [name, method] of Object.entries(OWNER_ROUTES)) {
    for (const session of ['other', null]) {
      const refused = await owner(env, `/${name === 'actions' || name === 'support' ? `${name}/x` : name}`, { session, method });
      assert.equal(refused.status, 404, `${session ?? 'signed out'} ${name}`);
      assert.equal(await refused.text(), 'Not found', `${session ?? 'signed out'} ${name}`);
    }
  }
});

test('ingestion: a signed-in POST answers 202 and the event is stored once under the server identity; a replay is deduped', async t => {
  const { env, sqlite } = world(t);
  const event = failure();
  const first = await ingest(env, [event]);
  assert.equal(first.status, 202);
  assert.deepEqual(await first.json(), { accepted: 1, rejected: 0, deduped: 0 });
  const rows = sqlite.prepare('SELECT event_name, environment, user_ref, service FROM telemetry_events').all().map(r => ({ ...r }));
  assert.deepEqual(rows, [{ event_name: 'client.error', environment: 'dev', user_ref: 'user-9', service: 'web' }]);
  assert.deepEqual(await (await ingest(env, [event])).json(), { accepted: 0, rejected: 0, deduped: 1 });
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM telemetry_events').get().n, 1);
});

test('dashboard queries over seeded rows: the ingested error appears in events and in the browser-error groups; the owner views answer 200 with their definitions', async t => {
  const { env } = world(t);
  await ingest(env, [failure()]);
  const overview = await (await owner(env, '/overview?days=7')).json();
  assert.equal(overview.configured, true);
  assert.deepEqual(overview.events.map(e => [e.event_name, e.outcome, e.n]), [['client.error', null, 1]]);
  const errors = await (await owner(env, '/client-errors?days=7')).json();
  assert.deepEqual(errors.groups.map(g => [g.kind, g.fingerprint, g.route, g.occurrences]), [['save_failed', 'ab12cd34ef56ab78', '/apps/:id', 1]]);
  const learning = await owner(env, '/learning?days=7');
  assert.equal(learning.status, 200);
  assert.ok((await learning.json()).hookFunnel, 'the learning view carries its funnel');
});

test('costs: measured, estimated, unknown (reservation held) and outstanding reservation are four separate rows; no field sums them', async t => {
  const { env } = world(t);
  assert.equal((await (await owner(env, '/project', { method: 'POST' })).json()).copied.usage_attempts, 4);
  const overview = await (await owner(env, '/overview?days=7')).json();
  const by = Object.fromEntries(overview.attempts.map(r => [r.cost_state, r]));
  assert.deepEqual(Object.keys(by).sort(), ['estimated', 'reserved', 'settled', 'unknown'], 'one row per cost state');
  assert.equal(overview.attempts.length, 4, 'nothing merged (a state split by charge class would show more rows)');
  assert.deepEqual([by.settled.cost_micros, by.estimated.cost_micros], [1234, 700], 'measured and estimated each keep their own amount');
  assert.equal(by.unknown.cost_micros, null, 'an unknown cost stays unknown, never 0');
  assert.equal(by.unknown.reserved_micros, 20000, 'its held reservation is reported as a reservation');
  assert.equal(by.reserved.cost_micros, null, 'an in-flight reservation is not spend');
  assert.equal(by.reserved.reserved_micros, 30000);
  // No total anywhere in the owner payloads: the only amounts are per-row, each tied to its own cost_state.
  for (const payload of [overview, await (await owner(env, '/health')).json(), await (await owner(env, '/learning?days=7')).json()]) {
    assert.equal(/total|sum_|grand/i.test(Object.keys(payload).join(',')), false, `top-level keys: ${Object.keys(payload)}`);
  }
  const explored = await (await owner(env, '/actions/act-unknown')).json();
  assert.deepEqual(explored.attempts.map(a => [a.attempt_id, a.cost_state, a.cost_micros]), [['att-unknown', 'unknown', null]]);
});

test('health: a projection pass records its cursors and a delivery-health row; pending and dead letters are reported as written', async t => {
  const { env, sqlite } = world(t);
  sqlite.prepare('INSERT INTO telemetry_delivery_health (source, observed_at, pending, dead, oldest_age_ms, delivered, failed, rejected, dropped) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('explain_jobs', Date.now() - 1000, 1, 2, 90000, 40, 3, 0, 0);
  await owner(env, '/project', { method: 'POST' });
  const health = await (await owner(env, '/health')).json();
  assert.equal(health.configured, true);
  const sources = Object.fromEntries(health.delivery.map(r => [r.source, r]));
  assert.deepEqual([sources.explain_jobs.pending, sources.explain_jobs.dead, sources.explain_jobs.oldest_age_ms], [1, 2, 90000], 'a dead letter is visible, not hidden');
  assert.equal(sources.projection.delivered, 4 + 4, 'four actions and four attempts copied');
  assert.equal(sources.projection.failed, 0);
  assert.deepEqual(health.cursors.map(c => c.source).sort(), ['usage_actions', 'usage_attempts']);
  assert.ok(health.cursors.every(c => Number(c.cursor) >= NOW - 5), 'each cursor advanced to the seeded rows');
  assert.ok(health.lastIngestedAt === null || Number.isFinite(health.lastIngestedAt));
});
