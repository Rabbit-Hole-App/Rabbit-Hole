// Provider spend beside the learner-side figure (docs/features/telemetry.md "Provider cost"). The fixtures are the production case:
// failed Motion operation motion-ce19016b-... settled usage_operations.cost_usd 1.540278 with 5 calls and usage_attempts cost 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { projectAccounting } from '../src/telemetry-projection.js';
import { providerSpend } from '../src/telemetry-provider-spend.js';
import { ownerTelemetryRoute } from '../src/owner-telemetry-routes.js';
import { d1, migration, telemetryDb } from './telemetry-fixture.js';

const NOW = Math.floor(Date.now() / 1000), HOLD = 8_960_000;

function ledger(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(migration('learn-migrations/0016-usage-operations.sql'));
  sqlite.exec(migration('learn-migrations/0022-usage-accounting.sql'));
  t.after(() => sqlite.close());
  // One ledger-routed operation: its platform row and its learner-side attempt share the id.
  const operation = (id, { status = 'failed', costUsd, calls = 1, error = null, attempt = { micros: 0, state: 'settled' }, reserved = HOLD, at = NOW } = {}) => {
    sqlite.prepare(`INSERT INTO usage_operations (op_id, user_id, org, category, status, admitted_at, deadline_at, settled_at, calls, cost_usd, provider, error)
      VALUES (?, 'u-1', 'org-1', 'motion', ?, ?, ?, ?, ?, ?, 'anthropic', ?)`).run(id, status, at, at + 7200, status === 'admitted' ? null : at + 60, calls, costUsd, error);
    if (!attempt) return;
    sqlite.prepare(`INSERT OR IGNORE INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, started_at)
      VALUES ('act-' || ?1, 'u-1', 'user', 'signed_in', 'video', 'would_charge', '2026-10', 'failed', ?2)`).run(id, at);
    sqlite.prepare(`INSERT INTO usage_attempts (attempt_id, action_id, kind, provider, reserved_micros, cost_micros, cost_state, status, started_at, settled_at)
      VALUES (?1, 'act-' || ?1, 'generation', 'anthropic', ?2, ?3, ?4, ?5, ?6, ?6)`).run(id, reserved, attempt.micros, attempt.state, status === 'admitted' ? 'running' : 'failed', at);
  };
  return { sqlite, db: d1(sqlite), operation };
}
const byState = rows => Object.fromEntries(rows.map(r => [`${r.state}/${r.status}`, { ...r }]));

test('a failed Motion operation: the learner-side attempt is 0, the platform spent US$1.540278, and each is its own figure', async t => {
  const learn = ledger(t), telemetry = telemetryDb(t);
  learn.operation('motion-ce19016b', { costUsd: 1.540278, calls: 5 });
  await projectAccounting(learn.db, telemetry.db, { now: 1 });
  // What the old dashboard could show: the attempt, settled at 0, and nothing about the 1.540278.
  assert.deepEqual({ ...telemetry.sqlite.prepare('SELECT cost_micros, cost_state FROM accounting_attempts').get() }, { cost_micros: 0, cost_state: 'settled' });
  const rows = await providerSpend(learn.db, NOW - 3600);
  assert.deepEqual(rows.map(r => ({ ...r })), [{ state: 'settled', status: 'failed', operations: 1, provider_cost_micros: 1_540_278, bound_micros: null, attempt_micros: 0 }]);
});

test('unknown provider cost stays unknown: its bound is not a cost, the reservation is not a cost, and nothing is 0', async t => {
  const learn = ledger(t);
  learn.operation('motion-unknown', { costUsd: 8.96 }); // settleSpend kept the reservation: the provider reported no cost
  learn.operation('motion-inflight', { status: 'admitted', costUsd: 8.96, calls: 0, attempt: { micros: null, state: 'reserved' } });
  learn.operation('motion-timeout', { status: 'timed_out', costUsd: 3, reserved: 5_000_000 });
  learn.operation('motion-no-attempt', { costUsd: 1.5, attempt: null });
  const got = byState(await providerSpend(learn.db, NOW - 3600));
  assert.deepEqual(Object.keys(got).sort(), ['reserved/admitted', 'unknown/failed', 'unknown/timed_out']);
  for (const [key, row] of Object.entries(got)) assert.equal(row.provider_cost_micros, null, `${key}: no cost is claimed`);
  assert.equal(got['unknown/failed'].bound_micros, 8_960_000 + 1_500_000, 'the bounds of the two unknowns, as bounds');
  assert.equal(got['unknown/failed'].operations, 2);
  assert.equal(got['reserved/admitted'].bound_micros, 8_960_000);
});

test('measured, estimated and an overrun are separate states; a cancelled operation made no call and is left out', async t => {
  const learn = ledger(t);
  learn.operation('op-measured', { status: 'settled', costUsd: 0.25, attempt: { micros: 250_000, state: 'settled' }, reserved: 500_000 });
  learn.operation('op-estimated', { status: 'settled', costUsd: 0.4, error: 'cost_estimated_upper_bound', attempt: { micros: 400_000, state: 'settled' }, reserved: 400_000 });
  learn.operation('op-overrun', { status: 'settled', costUsd: 0.9, error: 'spend_bound_exceeded', attempt: { micros: 900_000, state: 'settled' }, reserved: 500_000 });
  learn.operation('op-cancelled', { status: 'cancelled', costUsd: 0.5, calls: 0, reserved: 500_000 });
  learn.operation('op-old', { status: 'settled', costUsd: 0.7, attempt: { micros: 700_000, state: 'settled' }, reserved: 900_000, at: NOW - 40 * 86400 });
  const got = byState(await providerSpend(learn.db, NOW - 3600));
  assert.deepEqual(Object.entries(got).map(([k, r]) => [k, r.provider_cost_micros, r.bound_micros]).sort(),
    [['estimated/settled', 400_000, null], ['settled/settled', 1_150_000, null]]);
});

test('provider spend is counted once: it is read from the operation only, repeats and projections change neither database', async t => {
  const learn = ledger(t), telemetry = telemetryDb(t);
  learn.operation('op-1', { costUsd: 1.540278, calls: 5 });
  learn.operation('op-2', { status: 'settled', costUsd: 0.25, attempt: { micros: 250_000, state: 'settled' }, reserved: 500_000 });
  const before = JSON.stringify(learn.sqlite.prepare('SELECT * FROM usage_operations').all());
  const first = await providerSpend(learn.db, NOW - 3600);
  await projectAccounting(learn.db, telemetry.db, { now: 1 });
  await projectAccounting(learn.db, telemetry.db, { now: 2, from: 0 });
  assert.deepEqual(await providerSpend(learn.db, NOW - 3600), first);
  assert.equal(first.reduce((n, r) => n + r.provider_cost_micros, 0), 1_540_278 + 250_000, 'the two operations, once each (the attempts carry 0 and 250000, which are not added)');
  assert.equal(JSON.stringify(learn.sqlite.prepare('SELECT * FROM usage_operations').all()), before, 'the ledger is only read');
  assert.equal(telemetry.sqlite.prepare('SELECT COUNT(*) AS n FROM accounting_attempts').get().n, 2);
});

test('a LEARN_DB without the ledger table, or none, says so with null instead of an empty list', async t => {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  assert.equal(await providerSpend(d1(sqlite), 0), null);
  assert.equal(await providerSpend(undefined, 0), null);
});

test('the owner overview carries providerSpend beside the attempts, each with its own states', async t => {
  const learn = ledger(t), telemetry = telemetryDb(t);
  learn.operation('motion-ce19016b', { costUsd: 1.540278, calls: 5 });
  learn.operation('motion-unknown', { costUsd: 8.96 });
  await projectAccounting(learn.db, telemetry.db, { now: 1 });
  const env = { CONTROL_PLANE: { fetch: async () => Response.json({ email: 'owner@example.com', org: 'org-1', user_id: 'user-owner' }) },
    SUBSCRIPTION_OWNER_EMAIL: 'owner@example.com', TELEMETRY_DB: telemetry.db, TELEMETRY_ENVIRONMENT: 'dev', LEARN_DB: learn.db };
  const req = new Request('https://rabbit.test/api/owner/telemetry/overview?days=1', { headers: { cookie: 'rh_session=owner' } });
  const body = await (await ownerTelemetryRoute('/api/owner/telemetry/overview', req, env)).json();
  assert.deepEqual(body.attempts.map(a => [a.cost_state, a.cost_micros]), [['settled', 0]], 'the learner-side figure is 0 for both');
  assert.deepEqual(body.providerSpend.map(r => [r.state, r.provider_cost_micros, r.bound_micros]), [['settled', 1_540_278, null], ['unknown', null, 8_960_000]]);
});
