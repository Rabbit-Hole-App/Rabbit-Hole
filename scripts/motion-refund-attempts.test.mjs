// The PROPOSED Motion refund command (motion-refund-attempts.mjs), tested ENTIRELY in-process against in-memory SQLite built from the real
// learn migrations: the module is imported, never run as a CLI (its main() reads the owner credentials file and calls wrangler); its runner is an
// injected function over node:sqlite, so this process has no wrangler, no credential and no route to Cloudflare.
//   node --test scripts/motion-refund-attempts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { refundAttempt } from '../packages/control-plane/src/learn-usage.js';
import { CANDIDATES, CONFIRMED, parseArgs, readPlan, reconcile } from './motion-refund-attempts.mjs';

const JOB1 = 'act-8f6d6c98-b6cd-49c2-afde-714d076bce4c', JOB2 = 'act-9a25fc26-9abd-4a04-a6d3-588a360997ac';
const OWNER = 'dda2350771a4066e3080c605ba092e0a';
const sql = name => readFileSync(new URL(`../packages/control-plane/learn-migrations/${name}`, import.meta.url), 'utf8');

// The two production charges as the integrator read them: one would_charge video action each, one failed attempt settled at its measured cost.
function database({ job2Cost = 1_018_218, extraAttempt = false } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0016-usage-operations.sql', '0022-usage-accounting.sql', '0027-usage-grants.sql']) sqlite.exec(sql(file));
  for (const [action, status, cost, n] of [[JOB1, 'failed', 1_397_401, 1], [JOB2, 'cancelled', job2Cost, 2]]) {
    sqlite.prepare("INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, result, started_at, ended_at) VALUES (?, ?, 'user', 'signed_in', 'video', 'would_charge', '2026-10', ?, 'none', 1793143750, 1793144361)").run(action, OWNER, status);
    sqlite.prepare("INSERT INTO usage_attempts (attempt_id, action_id, kind, provider, reserved_micros, cost_micros, cost_state, status, started_at, settled_at) VALUES (?, ?, 'generation', 'anthropic', 8960000, ?, 'settled', 'failed', 1793143750, 1793144361)").run(`motion-${n}`, action, cost);
  }
  if (extraAttempt) sqlite.prepare("INSERT INTO usage_attempts (attempt_id, action_id, kind, provider, reserved_micros, cost_micros, cost_state, status, started_at, settled_at) VALUES ('motion-9', ?, 'generation', 'anthropic', 1, 1, 'settled', 'failed', 1, 1)").run(JOB1);
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

test('as committed, nothing is eligible: both charges are candidates, the confirmed list is empty and frozen', () => {
  assert.deepEqual(Object.keys(CANDIDATES), [JOB1, JOB2]);
  assert.deepEqual([Object.keys(CONFIRMED), Object.isFrozen(CONFIRMED)], [[], true]);
  assert.deepEqual(Object.values(CANDIDATES).map(c => [c.job, c.micros, c.billingClass]), [['e3a2f10ec8cc5519cb28520c41427e41', 1_397_401, 1], ['9b739bc92b2431442273e58435969d54', 1_018_218, 4]]);
});

test('arguments: an environment, one action id and one of --dry-run/--apply; no flag or variable confirms anything', () => {
  assert.deepEqual(parseArgs(['prod', JOB1]), { which: 'prod', action: JOB1, apply: false });
  assert.deepEqual(parseArgs(['prod', JOB2, '--apply']), { which: 'prod', action: JOB2, apply: true });
  for (const bad of [[], ['staging', JOB1], ['prod'], ['prod', 'act-1'], ['prod', JOB1, '--apply', '--dry-run'], ['prod', JOB1, '--confirm'], ['prod', JOB1, '--apply', '--yes'], ['prod', `${JOB1}'; DELETE FROM usage_actions; --`]]) assert.ok(parseArgs(bad).error, JSON.stringify(bad));
  process.env.MOTION_REFUND_CONFIRM = 'yes'; process.env.CONFIRMED = JOB1;
  assert.deepEqual(Object.keys(CONFIRMED), []);
  delete process.env.MOTION_REFUND_CONFIRM; delete process.env.CONFIRMED;
});

test('the dry run lists job 1 and job 2 as CANDIDATE, NOT CONFIRMED, shows the plan and writes nothing', async () => {
  const db = database(), before = db.state();
  for (const [action, job, charged] of [[JOB1, 'e3a2f10ec8cc5519cb28520c41427e41', '139.7401 credits'], [JOB2, '9b739bc92b2431442273e58435969d54', '101.8218 credits']]) {
    const { exit, lines } = await reconcile({ run: db.run, action, apply: false, refund: refundAttempt });
    assert.equal(exit, 0, lines.join('\n'));
    const text = lines.join('\n');
    assert.match(text, new RegExp(`dry run: action ${action} \\(job ${job},`));
    assert.match(text, /\nCANDIDATE, NOT CONFIRMED: /);
    assert.match(text, new RegExp(`charged ${charged.replace('.', '\\.')} `));
    assert.match(text, /if confirmed, would refund/);
    if (action === JOB1) assert.match(text, /\nevidence \(recovered artifact, sha256 b4480103[0-9a-f]+\): composition limits: the composition is standard, which is not covered for these settings \(covered: simple\); findings 0, blocking 0; key learn-video-dev\//);
    else assert.doesNotMatch(text, /evidence \(recovered artifact/, 'job 2 stays unresolved: no evidence is claimed for it');
    assert.match(lines.at(-1), /DRY RUN: nothing was written\. --apply is refused until this action is confirmed/);
  }
  assert.deepEqual([db.writes, db.state()], [[], before]);
  // Even handed a writing refund function, a dry run never calls it.
  let called = false;
  await reconcile({ run: db.run, action: JOB1, apply: false, refund: async () => { called = true; } });
  assert.equal(called, false);
});

test('--apply refuses an unconfirmed candidate before reading or writing anything', async () => {
  for (const action of [JOB1, JOB2]) {
    let touched = 0;
    const { exit, lines } = await reconcile({ run: () => { touched++; return { results: [] }; }, action, apply: true, refund: async () => { touched++; } });
    assert.deepEqual([exit, touched], [1, 0]);
    assert.match(lines[0], /^REFUSED: .* is a CANDIDATE, NOT CONFIRMED eligible: .*Nothing was read or written\.$/);
  }
  const { exit, lines } = await reconcile({ run: () => assert.fail('read'), action: 'act-00000000-0000-0000-0000-000000000000', apply: true, refund: null });
  assert.equal(exit, 1);
  assert.match(lines[0], /is not a refund candidate/);
});

test('once confirmed (simulated in this process only), apply refunds exactly once: refunded_micros, one audit row, the provider cost kept', async () => {
  const db = database(), confirmedList = { [JOB2]: 'test: stop origin traced to the system' };
  assert.equal(db.used(), 1_397_401 + 1_018_218);
  const { exit, lines } = await reconcile({ run: db.run, action: JOB2, apply: true, refund: refundAttempt, now: 1793200000, confirmedList });
  assert.equal(exit, 0, lines.join('\n'));
  assert.match(lines.join('\n'), /CONFIRMED eligible: test: stop origin traced to the system[\s\S]*refunded 101\.8218 credits \(1018218 micro-USD\)\nverified/);
  assert.deepEqual(db.sqlite.prepare('SELECT attempt_id, refunded_micros, refund_reason FROM usage_attempt_detail').all().map(r => ({ ...r })), [{ attempt_id: 'motion-2', refunded_micros: 1_018_218, refund_reason: CANDIDATES[JOB2].reason }]);
  assert.deepEqual(db.sqlite.prepare('SELECT action_id, user_id, micros, reason FROM usage_adjustments').all().map(r => ({ ...r })), [{ action_id: JOB2, user_id: OWNER, micros: -1_018_218, reason: CANDIDATES[JOB2].reason }]);
  assert.deepEqual(db.sqlite.prepare('SELECT attempt_id, cost_micros, cost_state FROM usage_attempts ORDER BY rowid').all().map(r => ({ ...r })),
    [{ attempt_id: 'motion-1', cost_micros: 1_397_401, cost_state: 'settled' }, { attempt_id: 'motion-2', cost_micros: 1_018_218, cost_state: 'settled' }], 'the recorded cost is never zeroed');
  assert.equal(db.used(), 1_397_401, 'only the confirmed charge is given back; job 1 is untouched');
  // Exactly once: repeat applies and a dry run change nothing.
  const after = db.state(), writes = db.writes.length;
  for (const apply of [true, false, true]) {
    const again = await reconcile({ run: db.run, action: JOB2, apply, refund: refundAttempt, confirmedList });
    assert.deepEqual([again.exit, again.lines.at(-1)], [0, 'nothing to do: this charge is already refunded in full']);
  }
  assert.deepEqual([db.state(), db.writes.length], [after, writes]);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM usage_adjustments').get().n, 1);
});

test('rows that are not what the diagnosis recorded are refused, dry run or confirmed apply', async () => {
  const other = database({ job2Cost: 1_000_000 });
  const plan = readPlan(other.run, JOB2, CANDIDATES[JOB2]);
  assert.deepEqual([plan.ok, plan.reason], [false, 'refused: the rows are not the charge the diagnosis recorded (cost_micros is 1000000, expected 1018218)']);
  const two = database({ extraAttempt: true });
  const { exit, lines } = await reconcile({ run: two.run, action: JOB1, apply: true, refund: refundAttempt, confirmedList: { [JOB1]: 'test' } });
  assert.deepEqual([exit, two.writes.length], [1, 0]);
  assert.match(lines[0], /expected exactly one attempt for .*, found 2/);
});
