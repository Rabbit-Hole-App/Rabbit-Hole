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
  assert.deepEqual(await projectAccounting(learn.db, telemetry.db, { now: 1 }), { copied: { usage_actions: 1, usage_attempts: 2 }, done: true });
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
  assert.deepEqual((await projectAccounting(learn.db, flaky, { now: 2 })).copied, { usage_actions: 1, usage_attempts: 1 });
});

test('a bounded pass says when more remain', async t => {
  const learn = learnDb(t), telemetry = telemetryDb(t);
  for (let i = 0; i < 3; i++) learn.action(`act-${i}`, 100 + i);
  assert.equal((await projectAccounting(learn.db, telemetry.db, { limit: 2 })).done, false);
  let passes = 1;
  while (!(await projectAccounting(learn.db, telemetry.db, { limit: 2 })).done) assert.ok(++passes < 5, 'the cursor advances');
  assert.equal(telemetry.sqlite.prepare('SELECT COUNT(*) AS n FROM accounting_actions').get().n, 3);
});
