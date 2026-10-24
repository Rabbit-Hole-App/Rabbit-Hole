import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { projectAccounting } from '../src/telemetry-projection.js';
import { d1, migration, telemetryDb } from './telemetry-fixture.js';

function learnDb(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(migration('learn-migrations/0022-usage-accounting.sql'));
  t.after(() => sqlite.close());
  const action = (id, at, status = 'running') => sqlite.prepare(`INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, started_at)
    VALUES (?, 'user-1', 'user', 'signed_in', 'ask', 'would_charge', '2026-10', ?, ?)`).run(id, status, at);
  const attempt = (id, actionId, at, fields = {}) => sqlite.prepare(`INSERT INTO usage_attempts (attempt_id, action_id, kind, provider, model, reserved_micros, cost_micros, cost_state, status, started_at, settled_at)
    VALUES (?, ?, 'generation', 'anthropic', 'claude-opus-5', 50000, ?, ?, ?, ?, ?)`).run(id, actionId, fields.cost ?? null, fields.state ?? 'reserved', fields.status ?? 'running', at, fields.settled ?? null);
  return { sqlite, db: d1(sqlite), action, attempt };
}
const snapshot = sqlite => JSON.stringify([sqlite.prepare('SELECT * FROM usage_actions ORDER BY action_id').all(), sqlite.prepare('SELECT * FROM usage_attempts ORDER BY attempt_id').all()]);
const projected = sqlite => sqlite.prepare('SELECT attempt_id, cost_micros, cost_state, status FROM accounting_attempts ORDER BY attempt_id').all().map(row => ({ ...row }));

test('a settlement after the first pass is picked up, each attempt is one row, and unknown cost stays NULL', async t => {
  const learn = learnDb(t), telemetry = telemetryDb(t);
  learn.action('act-1', 100);
  learn.attempt('att-1', 'act-1', 100);
  learn.attempt('att-2', 'act-1', 101, { state: 'unknown', status: 'failed', settled: 101 });
  assert.deepEqual(await projectAccounting(learn.db, telemetry.db, { now: 1 }), { copied: { usage_actions: 1, usage_attempts: 2, usage_grants: null }, done: true });
  learn.sqlite.prepare("UPDATE usage_attempts SET cost_micros = 1234, cost_state = 'settled', status = 'settled', settled_at = 200 WHERE attempt_id = 'att-1'").run();
  await projectAccounting(learn.db, telemetry.db, { now: 2 });
  assert.deepEqual(projected(telemetry.sqlite), [
    { attempt_id: 'att-1', cost_micros: 1234, cost_state: 'settled', status: 'settled' },
    { attempt_id: 'att-2', cost_micros: null, cost_state: 'unknown', status: 'failed' },
  ]);
});

test('replay from cursor 0 and repeated passes change nothing in either database', async t => {
  const learn = learnDb(t), telemetry = telemetryDb(t);
  learn.action('act-1', 100);
  learn.attempt('att-1', 'act-1', 100, { cost: 900, state: 'settled', status: 'settled', settled: 105 });
  const before = snapshot(learn.sqlite);
  await projectAccounting(learn.db, telemetry.db, { now: 1 });
  const once = projected(telemetry.sqlite);
  await projectAccounting(learn.db, telemetry.db, { now: 2 });
  await projectAccounting(learn.db, telemetry.db, { now: 3, from: 0 });
  assert.deepEqual(projected(telemetry.sqlite), once);
  assert.equal(snapshot(learn.sqlite), before, 'LEARN_DB is only read');
  assert.equal(telemetry.sqlite.prepare('SELECT SUM(cost_micros) AS total FROM accounting_attempts').get().total, 900, 'counted once');
});

test('a telemetry outage leaves the cursor where it was, so the next pass copies what it missed', async t => {
  const learn = learnDb(t), telemetry = telemetryDb(t);
  let down = true;
  const flaky = d1(telemetry.sqlite, { fail: sql => down && /^\s*INSERT/i.test(sql) });
  learn.action('act-1', 100);
  learn.attempt('att-1', 'act-1', 100);
  await assert.rejects(projectAccounting(learn.db, flaky, { now: 1 }));
  assert.equal(telemetry.sqlite.prepare('SELECT COUNT(*) AS n FROM projection_cursors').get().n, 0);
  down = false;
  assert.deepEqual((await projectAccounting(learn.db, flaky, { now: 2 })).copied, { usage_actions: 1, usage_attempts: 1, usage_grants: null });
});

test('a bounded pass says when more remain', async t => {
  const learn = learnDb(t), telemetry = telemetryDb(t);
  for (let i = 0; i < 3; i++) learn.action(`act-${i}`, 100 + i);
  assert.equal((await projectAccounting(learn.db, telemetry.db, { limit: 2 })).done, false);
  let passes = 1;
  while (!(await projectAccounting(learn.db, telemetry.db, { limit: 2 })).done) assert.ok(++passes < 5, 'the cursor advances');
  assert.equal(telemetry.sqlite.prepare('SELECT COUNT(*) AS n FROM accounting_actions').get().n, 3);
});

// Credits' committed 0027 (rabbit-hole/release/credits 962e571b, learn-migrations/0027-usage-grants.sql), the tables only: the
// interface docs/features/credits-2500.md names for observers. Fixture until Credits lands on main.
const CREDITS_0027 = `CREATE TABLE usage_grants (user_id TEXT NOT NULL, period TEXT NOT NULL, allowance_micros INTEGER NOT NULL CHECK (allowance_micros > 0),
  source TEXT NOT NULL CHECK (source IN ('default', 'legacy_transition')), granted_at INTEGER NOT NULL, PRIMARY KEY (user_id, period));
CREATE TABLE usage_attempt_detail (attempt_id TEXT PRIMARY KEY, price_version TEXT, tier TEXT, quantities TEXT, unverified TEXT,
  refunded_micros INTEGER NOT NULL DEFAULT 0 CHECK (refunded_micros >= 0), refunded_at INTEGER, refund_reason TEXT);`;

test('with Credits 0027: price detail and grants are projected, and a later refund is picked up by the cursor', async t => {
  const learn = learnDb(t), telemetry = telemetryDb(t);
  learn.sqlite.exec(CREDITS_0027);
  learn.action('act-1', 100);
  learn.attempt('att-1', 'act-1', 100, { cost: 2500, state: 'settled', status: 'settled', settled: 101 });
  learn.sqlite.prepare("INSERT INTO usage_attempt_detail (attempt_id, price_version, tier, quantities) VALUES ('att-1', '2026-10-23.1', 'standard', '{\"input\":120,\"output\":40,\"cache_read\":2048}')").run();
  learn.sqlite.prepare("INSERT INTO usage_grants (user_id, period, allowance_micros, source, granted_at) VALUES ('user-1', '2026-10', 25000000, 'default', 99)").run();
  assert.deepEqual((await projectAccounting(learn.db, telemetry.db, { now: 1 })).copied, { usage_actions: 1, usage_attempts: 1, usage_grants: 1 });
  learn.sqlite.prepare("UPDATE usage_attempt_detail SET refunded_micros = 2500, refunded_at = 500, refund_reason = 'platform_failure' WHERE attempt_id = 'att-1'").run();
  await projectAccounting(learn.db, telemetry.db, { now: 2 });
  const row = { ...telemetry.sqlite.prepare('SELECT cost_micros, cost_state, price_version, tier, quantities, refunded_micros, refunded_at FROM accounting_attempts').get() };
  assert.deepEqual(row, { cost_micros: 2500, cost_state: 'settled', price_version: '2026-10-23.1', tier: 'standard', quantities: '{"input":120,"output":40,"cache_read":2048}', refunded_micros: 2500, refunded_at: 500 },
    'the original cost stays beside what was refunded; neither is netted here');
  assert.deepEqual({ ...telemetry.sqlite.prepare('SELECT user_ref, period, allowance_micros, source FROM accounting_grants').get() }, { user_ref: 'user-1', period: '2026-10', allowance_micros: 25000000, source: 'default' });
});
