// The historical CAD reconciliation, tested entirely in-process against an in-memory SQLite built from every learn migration (the
// repository's isolation rule for owner scripts): the module is imported, never run as a CLI; its runner is an injected function over
// node:sqlite, so there is no wrangler, no credential and no route to Cloudflare in this process.
//   node --test scripts/cad-historical-reconcile.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { refundAttempt, FAILED_ROUTE_REFUND } from '../packages/control-plane/src/learn-usage.js';
import { encodeBoard } from '../packages/control-plane/src/cad-contract.js';
import { d1Over, readOnly } from './motion-refund-failed-job.mjs';
import { classify, parseArgs, readEvidence, reconcile, repairPlan, totals, SOURCE_WINDOW_MS } from './cad-historical-reconcile.mjs';

const MIGRATIONS = new URL('../packages/control-plane/learn-migrations/', import.meta.url);
const T0 = 1_792_300_000; // seconds
const hex = n => n.toString(16).padStart(32, '0');
const jobKey = (board, n) => `cj${encodeBoard(board).replace(/\W/g, '')}${hex(n)}`;

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  const statements = [];
  const run = text => {
    statements.push(text);
    if (/^\s*SELECT\b/i.test(text)) return { results: sqlite.prepare(text).all().map(r => ({ ...r })), meta: {} };
    return { results: [], meta: { changes: sqlite.prepare(text).run().changes } };
  };
  // One CAD model call as runCadModel records it: action (client key cad-<job>-<n>), one attempt, its platform operation.
  const call = ({ board = 'brd-1', job = 1, n = 1, at, cost = 20_000, status = 'running', result = null, kind = 'generation', charge = 'would_charge', refunded = 0, user = 'u-1' }) => {
    const key = `cad-${jobKey(board, job)}-${n}`, action = `act-${key}`, attempt = `att-${key}`;
    sqlite.prepare("INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, result, started_at, client_key) VALUES (?, ?, 'user', 'signed_in', 'artifact', ?, '2026-10', ?, ?, ?, ?)").run(action, user, charge, status, result, at, key);
    sqlite.prepare("INSERT INTO usage_attempts (attempt_id, action_id, kind, provider, reserved_micros, cost_micros, cost_state, status, output_tokens, started_at, settled_at) VALUES (?, ?, ?, 'anthropic', 90000, ?, 'settled', 'settled', 900, ?, ?)").run(attempt, action, kind, cost, at, at + 20);
    sqlite.prepare("INSERT INTO usage_operations (op_id, user_id, org, category, status, admitted_at, deadline_at, settled_at, calls, cost_usd, provider) VALUES (?, ?, 'org', 'cad', 'settled', ?, ?, ?, 1, ?, 'anthropic')").run(attempt, user, at, at + 600, at + 20, cost / 1e6);
    if (refunded) sqlite.prepare("INSERT INTO usage_attempt_detail (attempt_id, refunded_micros, refunded_at, refund_reason) VALUES (?, ?, ?, 'earlier')").run(attempt, refunded, at + 30);
    return { key, action, attempt, settledMs: (at + 20) * 1000 };
  };
  // saveCadSource's row (created_at in milliseconds) and publishCadArtifacts' derivatives.
  const source = ({ board = 'brd-1', atMs, sha = 'a'.repeat(64), id = `fs_${atMs}`, built = [] }) => {
    sqlite.prepare("INSERT INTO file_sources (id, org, owner_email, app, board_id, family, name, media_type, bytes, sha256, r2_key, status, created_at, stored_at) VALUES (?, 'org', 'o@x', 'app', ?, 'cad', 'model.py', 'text/plain', 10, ?, 'k', 'stored', ?, ?)").run(id, board, sha, atMs, atMs);
    for (const kind of built) sqlite.prepare("INSERT INTO file_derivatives (id, source_id, source_sha256, kind, name, converter, converter_version, options_hash, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'cad-execute', '0.7.21', 'cr_x', 'ready', ?, ?)").run(`fd_${id}_${kind}`, id, sha, kind, kind, atMs, atMs);
    return id;
  };
  const state = () => JSON.stringify(['usage_actions', 'usage_attempts', 'usage_attempt_detail', 'usage_adjustments', 'usage_operations'].map(t => sqlite.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()));
  return { sqlite, run, statements, call, source, state };
}
const byKey = records => Object.fromEntries(records.map(r => [r.client_key, r]));

test('arguments: reconcile, or repair --dry-run; repair without --dry-run refuses, and nothing is read from the environment', () => {
  assert.deepEqual(parseArgs(['prod', 'reconcile']), { which: 'prod', mode: 'reconcile' });
  assert.deepEqual(parseArgs(['dev', 'repair', '--dry-run']), { which: 'dev', mode: 'repair' });
  for (const bad of [['prod', 'repair'], ['prod', 'repair', '--apply'], ['prod', 'repair', '--dry-run', '--apply'], ['prod', 'repair', '--dry-run', '--dry-run']]) {
    const parsed = parseArgs(bad);
    assert.equal(parsed.exit, 2, JSON.stringify(bad));
    assert.match(parsed.error, /refused: repair runs only as --dry-run\. Applying historical CAD changes needs the owner's approval and a separate, reviewed apply mode/);
  }
  for (const bad of [[], ['staging', 'reconcile'], ['prod'], ['prod', 'apply'], ['prod', 'reconcile', '--dry-run']]) assert.ok(parseArgs(bad).error, JSON.stringify(bad));
  process.env.CAD_RECONCILE_APPLY = '1'; // a variable confirms nothing
  assert.equal(parseArgs(['prod', 'repair']).exit, 2);
  delete process.env.CAD_RECONCILE_APPLY;
});

test('each outcome class, decided from D1 evidence only; running alone is never evidence', () => {
  const db = database();
  // Job 1: call 1 saved a validated source that built -> delivered; call 2 (the review) left nothing in D1 -> UNKNOWN.
  const a1 = db.call({ job: 1, n: 1, at: T0, cost: 26_500 });
  db.source({ atMs: a1.settledMs + 4000, sha: '1'.repeat(64), built: ['step', 'glb', 'thumbnail'] });
  const a2 = db.call({ job: 1, n: 2, at: T0 + 200, cost: 13_698 });
  // Job 2 (another board): call 1 left no source, call 2 is a repair -> call 1 delivered (policy-charged); call 2 UNKNOWN.
  const b1 = db.call({ board: 'brd-2', job: 2, n: 1, at: T0 + 1000 });
  const b2 = db.call({ board: 'brd-2', job: 2, n: 2, at: T0 + 1100, kind: 'repair' });
  // Job 3 (after the lifecycle fix): a failed call with a settled, unrefunded charge -> ELIGIBLE; a completed call -> delivered.
  const c1 = db.call({ board: 'brd-3', job: 3, n: 1, at: T0 + 2000, status: 'failed', result: 'none', cost: 20_674 });
  const c2 = db.call({ board: 'brd-3', job: 3, n: 2, at: T0 + 2100, status: 'completed', result: 'full' });
  // Job 4: already refunded; a free call; a source with no build (policy question); a parameter rebuild's repeated source (not evidence).
  const d1 = db.call({ board: 'brd-4', job: 4, n: 1, at: T0 + 3000, status: 'failed', result: 'none', refunded: 20_000 });
  const e1 = db.call({ board: 'brd-5', job: 5, n: 1, at: T0 + 4000, charge: 'free' });
  const f1 = db.call({ board: 'brd-6', job: 6, n: 1, at: T0 + 5000 });
  db.source({ board: 'brd-6', atMs: f1.settledMs + 2000, sha: '6'.repeat(64) });
  db.source({ board: 'brd-7', atMs: (T0 + 5900) * 1000, sha: '7'.repeat(64) });
  const g1 = db.call({ board: 'brd-7', job: 7, n: 1, at: T0 + 6000 });
  db.source({ board: 'brd-7', atMs: g1.settledMs + 2000, sha: '7'.repeat(64) }); // same text as the earlier source: a rebuild, not this call's reply
  // Job 8 and 9 overlap on one board: a source in the window cannot be attributed.
  const h1 = db.call({ board: 'brd-8', job: 8, n: 1, at: T0 + 7000 });
  db.call({ board: 'brd-8', job: 9, n: 1, at: T0 + 6995 }); // started first, still within its own window
  db.source({ board: 'brd-8', atMs: h1.settledMs + 1000, sha: '8'.repeat(64) });
  // A source outside the window proves nothing.
  const i1 = db.call({ board: 'brd-9', job: 10, n: 1, at: T0 + 9000 });
  db.source({ board: 'brd-9', atMs: i1.settledMs + SOURCE_WINDOW_MS + 1000, sha: '9'.repeat(64) });

  const r = byKey(classify(readEvidence(db.run)));
  const pick = ({ key }) => [r[key].eligibility, r[key].outcome];
  assert.deepEqual(pick(a1), ['NOT ELIGIBLE', 'delivered']);
  assert.match(r[a1.key].evidence, /validated source fs_\d+ saved 4 s after settlement on the job's board; build published \(glb, step, thumbnail\); next call 180 s after settlement/);
  assert.equal(r[a1.key].policy, null);
  assert.deepEqual(pick(a2), ['UNKNOWN', 'unknown']);
  assert.match(r[a2.key].missing, /the CadJobs record of job cj\w+: state, attempt, error/);
  assert.deepEqual([pick(b1), r[b1.key].policy !== null, pick(b2)], [['NOT ELIGIBLE', 'delivered'], true, ['UNKNOWN', 'unknown']]);
  assert.match(r[b1.key].evidence, /call 2 is a repair/);
  assert.deepEqual([pick(c1), r[c1.key].learner_micros, pick(c2)], [['ELIGIBLE', 'unusable'], 20_674, ['NOT ELIGIBLE', 'delivered']]);
  assert.deepEqual([pick(d1), r[d1.key].learner_micros], [['NOT ELIGIBLE', 'refunded'], 0]);
  assert.deepEqual([pick(e1), r[e1.key].learner_micros], [['NOT ELIGIBLE', 'not_charged'], 0]);
  assert.deepEqual(pick(f1), ['NOT ELIGIBLE', 'delivered']);
  assert.match(r[f1.key].policy, /valid design, no published build afterwards: charged under the existing policy/);
  assert.deepEqual(pick(g1), ['UNKNOWN', 'unknown']);
  assert.deepEqual(pick(h1), ['UNKNOWN', 'unknown']);
  assert.match(r[h1.key].evidence, /another CAD job on the board overlaps the window/);
  assert.deepEqual(pick(i1), ['UNKNOWN', 'unknown']);
  assert.equal(r[a1.key].provider_cost_usd, 0.0265);
});

test('the dry run separates (A) cosmetic status repairs from (B) refunds, puts only ELIGIBLE in (B), totals in micros and credits, and writes nothing', () => {
  const db = database();
  const a1 = db.call({ job: 1, n: 1, at: T0, cost: 26_500 });
  db.source({ atMs: a1.settledMs + 3000, built: ['step'] });
  const u = db.call({ job: 1, n: 2, at: T0 + 300, cost: 900_000 }); // a large UNKNOWN: never refunded
  const c1 = db.call({ board: 'brd-3', job: 3, n: 1, at: T0 + 2000, status: 'failed', result: 'none', cost: 20_674 });
  const c2 = db.call({ board: 'brd-3', job: 3, n: 2, at: T0 + 2100, status: 'failed', result: 'none', cost: 13_698 });
  const before = db.state();
  const { exit, lines } = reconcile({ run: db.run, mode: 'repair' });
  const text = lines.join('\n');
  assert.equal(exit, 0);
  assert.deepEqual(db.state(), before);
  assert.ok(db.statements.every(s => /^\s*SELECT\b/i.test(s)), 'only SELECTs reached the database');
  assert.match(text, /\(A\) action status repairs, cosmetic, no money: 1 rows\n {4}act-[^ ]+ \(cj\w+ call 1\): running -> completed\/full, ended_at 1792300020\n {6}UPDATE usage_actions SET status = 'completed', result = 'full', ended_at = 1792300020 WHERE action_id = '[^']+' AND status = 'running'/);
  assert.match(text, /\(B\) refunds, reason route_failed_no_result, ELIGIBLE only: 2 rows, 34372 micros \(3\.4372 credits\)/);
  assert.match(text, /INSERT INTO usage_adjustments \(adjustment_id, action_id, user_id, micros, reason, created_at\) VALUES \(<new adj id>, '[^']+', 'u-1', -20674, 'route_failed_no_result', <apply time>\)/);
  assert.match(text, /total UNKNOWN: 1 attempts, learner charge 900000 micros \(90 credits\)/);
  assert.match(text, /total ELIGIBLE: 2 attempts, learner charge 34372 micros \(3\.4372 credits\), provider cost 0\.034372 USD/);
  assert.match(lines.at(-1), /DRY RUN: nothing was written\. There is no apply mode/);
  const plan = repairPlan(classify(readEvidence(db.run)));
  assert.deepEqual(plan.refunds.map(b => b.attempt_id).sort(), [c1.attempt, c2.attempt].sort());
  assert.ok(!plan.refunds.some(b => b.attempt_id === u.attempt) && !plan.actions.some(a => a.attempt_id === u.attempt));
  assert.ok(!plan.actions.some(a => a.eligibility === 'ELIGIBLE'), '(A) never carries money');
  // reconcile prints the table and totals but no plan.
  assert.doesNotMatch(reconcile({ run: db.run, mode: 'reconcile' }).lines.join('\n'), /\(A\)|\(B\)/);
});

test('idempotent: after a hypothetical apply of exactly the planned rows, the dry run plans zero rows', async () => {
  const db = database();
  const a1 = db.call({ job: 1, n: 1, at: T0 });
  db.source({ atMs: a1.settledMs + 1000, built: ['step'] });
  db.call({ job: 1, n: 2, at: T0 + 300 });
  const c1 = db.call({ board: 'brd-3', job: 3, n: 1, at: T0 + 2000, status: 'failed', result: 'none', cost: 20_674 });
  const plan = repairPlan(classify(readEvidence(db.run)));
  assert.deepEqual([plan.actions.length, plan.refunds.length], [1, 1]);
  // The hypothetical apply: (A) its printed UPDATE, (B) through refundAttempt, the existing refund path.
  for (const a of plan.actions) db.run(a.sql);
  for (const b of plan.refunds) assert.equal(await refundAttempt(d1Over(db.run), b.attempt_id, { reason: FAILED_ROUTE_REFUND, now: T0 + 9999 }), 20_674);
  assert.deepEqual({ ...db.sqlite.prepare('SELECT micros, reason FROM usage_adjustments').get() }, { micros: -20_674, reason: FAILED_ROUTE_REFUND });
  const after = repairPlan(classify(readEvidence(db.run)));
  assert.deepEqual([after.actions.length, after.refunds.length, after.refundMicros], [0, 0, 0]);
  const r = byKey(classify(readEvidence(db.run)));
  assert.deepEqual([r[c1.key].outcome, r[a1.key].outcome, r[a1.key].action_status], ['refunded', 'delivered', 'completed']);
  assert.match(reconcile({ run: db.run, mode: 'repair' }).lines.join('\n'), /\(A\)[^\n]*: 0 rows\n\(B\)[^\n]*: 0 rows, 0 micros \(0 credits\)/);
});

test('the reads are SELECT-only: a runner that would write is never handed a write, and a write is refused', () => {
  const db = database();
  db.call({ job: 1, n: 1, at: T0, status: 'failed', result: 'none' });
  const seen = [];
  reconcile({ run: text => { seen.push(text); return db.run(text); }, mode: 'repair' });
  assert.equal(seen.length, 3);
  assert.ok(seen.every(s => /^\s*SELECT\b/i.test(s) && !/;\s*\S/.test(s)));
  // The guard reconcile wraps its runner in (readOnly, shared with the Motion refund script) refuses every write before it reaches the database.
  const before = db.state(), guarded = readOnly(db.run), count = db.statements.length;
  for (const text of ["UPDATE usage_actions SET status = 'completed'", 'INSERT INTO usage_adjustments VALUES (1)', 'DELETE FROM usage_attempt_detail', 'SELECT 1; DELETE FROM usage_actions', "WITH x AS (SELECT 1) UPDATE usage_actions SET status = 'failed'"]) assert.throws(() => guarded(text), /read-only runner refused/, text);
  assert.deepEqual([db.state(), db.statements.length], [before, count]);
});

test('the production shape (4 pairs and one triple, all running, nothing else in D1): all UNKNOWN, nothing planned, totals add up', () => {
  const db = database();
  const costs = [[11_000, 12_000], [13_000, 14_000], [15_000, 16_000], [17_000, 18_000], [26_500, 20_674, 13_698]];
  costs.forEach((calls, j) => calls.forEach((cost, i) => db.call({ board: `brd-p${j}`, job: 100 + j, n: i + 1, at: T0 + j * 86_400 + i * 60, cost })));
  const records = classify(readEvidence(db.run));
  assert.equal(records.length, 11);
  assert.ok(records.every(r => r.eligibility === 'UNKNOWN'));
  const plan = repairPlan(records);
  assert.deepEqual([plan.actions.length, plan.refunds.length], [0, 0]);
  const sum = costs.flat().reduce((n, c) => n + c, 0);
  assert.deepEqual(totals(records).UNKNOWN.learner_micros, sum);
  assert.match(reconcile({ run: db.run, mode: 'reconcile' }).lines.join('\n'), new RegExp(`total UNKNOWN: 11 attempts, learner charge ${sum} micros`));
});
