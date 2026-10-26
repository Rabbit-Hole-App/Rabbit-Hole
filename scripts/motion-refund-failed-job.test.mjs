// The owner refund script for the failed Motion job 61f70171, tested ENTIRELY in-process against an in-memory SQLite copy of the usage tables
// (the repository's isolation rule for scripts that can write to production): the module is imported, never run as a CLI; its runner is an
// injected function over node:sqlite, so there is no wrangler, no credential and no route to Cloudflare in this process.
//   node --test scripts/motion-refund-failed-job.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { refundAttempt } from '../packages/control-plane/src/learn-usage.js';
import { ALLOWED, REASON, d1Over, parseArgs, readOnly, readPlan, reconcile } from './motion-refund-failed-job.mjs';

const ACTION = 'act-c0f759ed-5ce7-4b65-bce0-028745e2c5c1';
const sql = name => readFileSync(new URL(`../packages/control-plane/learn-migrations/${name}`, import.meta.url), 'utf8');

// The failed job as the diagnosis recorded it: one would_charge video action, one failed settled attempt of 1,278,157 micro-USD.
function database({ cost = 1_278_157, attempts = 1, feature = 'video', refunded = 0 } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0016-usage-operations.sql', '0022-usage-accounting.sql', '0027-usage-grants.sql']) sqlite.exec(sql(file));
  sqlite.prepare("INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, result, started_at, ended_at) VALUES (?, 'u-owner', 'user', 'signed_in', ?, 'would_charge', '2026-10', 'failed', 'none', 1792900484, 1792901134)").run(ACTION, feature);
  for (let i = 0; i < attempts; i++) sqlite.prepare("INSERT INTO usage_attempts (attempt_id, action_id, kind, provider, reserved_micros, cost_micros, cost_state, status, started_at, settled_at) VALUES (?, ?, 'generation', 'anthropic', 8958600, ?, 'settled', 'failed', 1792900484, 1792901134)").run(`motion-${i}`, ACTION, cost);
  if (refunded) sqlite.prepare("INSERT INTO usage_attempt_detail (attempt_id, refunded_micros, refunded_at, refund_reason) VALUES ('motion-0', ?, 1792999999, 'earlier')").run(refunded);
  const writes = [];
  const run = text => {
    if (/^\s*SELECT\b/i.test(text)) return { results: sqlite.prepare(text).all().map(r => ({ ...r })), meta: {} };
    writes.push(text.replace(/\s+/g, ' ').slice(0, 80));
    return { results: [], meta: { changes: sqlite.prepare(text).run().changes } };
  };
  const state = () => JSON.stringify(['usage_actions', 'usage_attempts', 'usage_attempt_detail', 'usage_adjustments'].map(t => sqlite.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()));
  const used = () => Number(sqlite.prepare("SELECT COALESCE(SUM(t.cost_micros - COALESCE(d.refunded_micros, 0)), 0) AS used FROM usage_attempts t LEFT JOIN usage_attempt_detail d ON d.attempt_id = t.attempt_id WHERE t.cost_state = 'settled'").get().used);
  return { sqlite, run, writes, state, used };
}

test('arguments: an environment, the action id and one of --dry-run/--apply (or neither, a dry run); nothing is read from the environment', () => {
  assert.deepEqual(parseArgs(['prod', ACTION]), { which: 'prod', action: ACTION, apply: false });
  assert.deepEqual(parseArgs(['prod', ACTION, '--dry-run']), { which: 'prod', action: ACTION, apply: false });
  assert.deepEqual(parseArgs(['dev', ACTION, '--apply']), { which: 'dev', action: ACTION, apply: true });
  for (const bad of [[], ['staging', ACTION], ['prod'], ['prod', 'act-1'], ['prod', ACTION, '--apply', '--dry-run'], ['prod', ACTION, '--yes'], ['prod', ACTION, '--apply', '--apply'], ['prod', `${ACTION}'; DROP TABLE usage_actions; --`]]) assert.ok(parseArgs(bad).error, JSON.stringify(bad));
  process.env.MOTION_REFUND_CONFIRM = '1'; // a variable confirms nothing
  assert.equal(parseArgs(['prod', ACTION]).apply, false);
  delete process.env.MOTION_REFUND_CONFIRM;
});

test('the dry run reads and reports, and cannot write: its runner refuses anything that is not a single SELECT, and the tables are unchanged', async () => {
  const db = database();
  const before = db.state();
  const { exit, lines } = await reconcile({ run: db.run, action: ACTION, apply: false, refund: refundAttempt });
  assert.equal(exit, 0);
  assert.match(lines.join('\n'), /dry run: action act-c0f759ed-.* \(job 61f701710ba30bfa591a992844509c0d\), period 2026-10\nthe attempt was charged 127\.8157 credits \(1278157 micro-USD\); already refunded 0 credits\nwould refund 127\.8157 credits/);
  assert.match(lines.at(-1), /DRY RUN: nothing was written/);
  assert.deepEqual([db.writes, db.state()], [[], before]);
  const guarded = readOnly(db.run);
  for (const text of ["UPDATE usage_attempts SET cost_micros = 0", "INSERT INTO usage_adjustments VALUES (1)", "DELETE FROM usage_actions", "SELECT 1; DELETE FROM usage_actions", "  update usage_attempts set status = 'x'", "WITH x AS (SELECT 1) DELETE FROM usage_actions"]) assert.throws(() => guarded(text), /read-only runner refused/, text);
  assert.deepEqual(guarded('SELECT COUNT(*) AS n FROM usage_actions').results, [{ n: 1 }]);
  // Even handed a refund function that would write, a dry run never calls it.
  let called = false;
  await reconcile({ run: db.run, action: ACTION, apply: false, refund: async () => { called = true; } });
  assert.equal(called, false);
});

test('apply refunds the whole charge through refundAttempt: refunded_micros, one audit row, the settled cost kept, the balance back to zero', async () => {
  const db = database();
  assert.equal(db.used(), 1_278_157);
  const { exit, lines } = await reconcile({ run: db.run, action: ACTION, apply: true, refund: refundAttempt, now: 1793000000 });
  assert.equal(exit, 0, lines.join('\n'));
  assert.match(lines.join('\n'), /refunded 127\.8157 credits \(1278157 micro-USD\)\nverified: refunded_micros now equals the charge/);
  assert.deepEqual(db.sqlite.prepare('SELECT refunded_micros, refunded_at, refund_reason FROM usage_attempt_detail').all().map(r => ({ ...r })), [{ refunded_micros: 1_278_157, refunded_at: 1793000000, refund_reason: REASON }]);
  assert.deepEqual(db.sqlite.prepare('SELECT action_id, user_id, micros, reason, created_at FROM usage_adjustments').all().map(r => ({ ...r })), [{ action_id: ACTION, user_id: 'u-owner', micros: -1_278_157, reason: REASON, created_at: 1793000000 }]);
  const attempt = db.sqlite.prepare('SELECT cost_micros, cost_state, status FROM usage_attempts').get();
  assert.deepEqual({ ...attempt }, { cost_micros: 1_278_157, cost_state: 'settled', status: 'failed' }, 'the provider expense is preserved as recorded');
  assert.equal(db.used(), 0);
  assert.doesNotMatch(REASON, /\$|@/);
});

test('idempotent: a second apply, a dry run after it and a concurrent-looking repeat change nothing and say so', async () => {
  const db = database();
  await reconcile({ run: db.run, action: ACTION, apply: true, refund: refundAttempt });
  const after = db.state(), writes = db.writes.length;
  for (const apply of [true, false, true]) {
    const { exit, lines } = await reconcile({ run: db.run, action: ACTION, apply, refund: refundAttempt });
    assert.equal(exit, 0);
    assert.match(lines.at(-1), /nothing to do: this charge is already refunded in full/);
  }
  assert.deepEqual([db.state(), db.writes.length], [after, writes]);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM usage_adjustments').get().n, 1);
  // refundAttempt itself guards the second refund too (the UPDATE only matches refunded_micros = 0).
  assert.equal(await refundAttempt(d1Over(db.run), 'motion-0', { reason: 'direct repeat' }), 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM usage_adjustments').get().n, 1);
});

test('it refuses every action but the one it is for, and the one it is for unless the rows are exactly what the diagnosis recorded', async () => {
  const db = database();
  for (const other of ['act-00000000-0000-0000-0000-000000000000', 'act-c0f759ed-5ce7-4b65-bce0-028745e2c5c2']) {
    const { exit, lines } = await reconcile({ run: db.run, action: other, apply: true, refund: refundAttempt });
    assert.deepEqual([exit, db.writes.length], [1, 0]);
    assert.match(lines[0], /is not the action this script is for/);
  }
  for (const [name, options, want] of [
    ['another cost', { cost: 1_000_000 }, /cost_micros is 1000000, expected 1278157/],
    ['two attempts', { attempts: 2 }, /expected exactly one attempt for .*, found 2/],
    ['another feature', { feature: 'ask' }, /feature is ask, expected video/],
  ]) {
    const other = database(options);
    const { exit, lines } = await reconcile({ run: other.run, action: ACTION, apply: true, refund: refundAttempt });
    assert.deepEqual([exit, other.writes.length], [1, 0], name);
    assert.match(lines[0], want, name);
  }
  const partial = database({ refunded: 500_000 });
  const part = readPlan(partial.run, ACTION);
  assert.deepEqual([part.ok, partial.writes.length], [false, 0]);
  assert.match(part.reason, /500000 of 1278157 micro-USD were already refunded; refundAttempt refunds once/);
  assert.deepEqual(Object.keys(ALLOWED), [ACTION]);
});

test('the SQL adapter writes values as literals and refuses a placeholder mismatch', async () => {
  const seen = [];
  const d1 = d1Over(sqlText => { seen.push(sqlText); return { results: [{ ok: 1 }], meta: { changes: 1 } }; });
  const [first, ran] = await Promise.all([d1.prepare('SELECT ? AS a, ? AS b, ? AS c').bind("it's", 5, null).first(), d1.prepare('UPDATE t SET x = ?').bind(7).run()]);
  assert.deepEqual([first, ran.meta.changes], [{ ok: 1 }, 1]);
  assert.deepEqual(seen, ["SELECT 'it''s' AS a, 5 AS b, NULL AS c", 'UPDATE t SET x = 7']);
  await assert.rejects(d1.prepare('SELECT ?').bind(1, 2).first(), /more bound values/);
  await assert.rejects(d1.prepare('SELECT ? , ?').bind(1).first(), /missing bound value/);
  await assert.rejects(d1.prepare('SELECT ?').bind({}).first(), /cannot write object/);
});
