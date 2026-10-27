// CAD review-first acceptance helper, tested in-process: usage rows live in an in-memory SQLite built from the repository's own migrations,
// the executor health, `fly machine status`, the budget and the files are injected. Nothing here reaches production.
//   node --test scripts/cad-acceptance.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { ATTEMPT, buildReport, classifyAttempts, collectUsage, machineRuns, measure, post, pre } from './cad-acceptance.mjs';
import { readOnly } from './motion-refund-failed-job.mjs';

const migration = name => readFileSync(new URL(`../packages/control-plane/learn-migrations/${name}`, import.meta.url), 'utf8');
const AT = 1793062130757; // the baseline of the 2026-10-26 acceptance run (5:48:50 PM PT)
const NOW = AT + 6.5 * 60 * 1000;
const OWNER = 'dda2350771a4066e3080c605ba092e0a';
// The owner's three model calls of that run: brief, source, review.
const CALLS = [['cad-3090af82-769e-4aaa-ac66-91c0476a951c', 1793062203, 26500], ['cad-003f872b-77ac-45d5-bb8d-116e51f1695c', 1793062239, 20674], ['cad-3f4bffed-5591-4f85-a005-c3269dcd31a6', 1793062326, 13698]];

function database({ calls = CALLS, user = OWNER, running = true, unsettled = false } = {}) {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0016-usage-operations.sql', '0022-usage-accounting.sql', '0023-file-imports.sql', '0027-usage-grants.sql']) db.exec(migration(file));
  calls.forEach(([id, at, micros], i) => {
    const open = unsettled && i === calls.length - 1;
    db.prepare("INSERT INTO usage_operations (op_id, user_id, org, category, status, admitted_at, deadline_at, settled_at, calls, cost_usd, provider, model) VALUES (?, ?, 'org', 'cad', ?, ?, ?, ?, 1, ?, 'anthropic', 'claude-sonnet-5-5')")
      .run(id, user, open ? 'admitted' : 'settled', at, at + 120, open ? null : at + 15, open ? 0.1 : micros / 1e6);
    db.prepare("INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, started_at) VALUES (?, ?, 'user', 'signed_in', 'artifact', 'would_charge', '2026-10', ?, ?)").run(`act-${i}`, user, running ? 'running' : 'completed', at);
    db.prepare("INSERT INTO usage_attempts (attempt_id, action_id, kind, provider, model, reserved_micros, cost_micros, cost_state, status, started_at, settled_at) VALUES (?, ?, 'generation', 'anthropic', 'claude-sonnet-5-5', 100000, ?, ?, ?, ?, ?)")
      .run(id, `act-${i}`, open ? null : micros, open ? 'reserved' : 'settled', open ? 'running' : 'settled', at, open ? null : at + 15);
  });
  const derive = (revision, kinds, at, bytes) => kinds.forEach(kind => db.prepare("INSERT INTO file_derivatives(id, source_id, source_sha256, kind, name, converter, converter_version, options_hash, status, bytes, created_at, updated_at) VALUES (?, 's1', 'h', ?, ?, 'cad-execute', '0.7.21', ?, 'ready', ?, ?, ?)").run(`${revision}-${kind}`, kind, kind, revision, bytes, at, at));
  const run = sql => ({ results: db.prepare(sql).all().map(r => ({ ...r })), meta: {} });
  return { db, run: readOnly(run), derive };
}
const STATUS = `Event Logs
 STATE    │ EVENT │ SOURCE │ TIMESTAMP                     │ INFO
 stopped  │ exit  │ flyd   │ 2026-10-26T17:59:20.666-07:00 │ exit_code=0,oom_killed=false,requested_stop=false
 started  │ start │ flyd   │ 2026-10-26T17:48:48.308-07:00 │
 starting │ start │ proxy  │ 2026-10-26T17:48:46.903-07:00 │
 stopped  │ exit  │ flyd   │ 2026-10-26T16:49:45.989-07:00 │ exit_code=0,oom_killed=false,requested_stop=false
 started  │ start │ flyd   │ 2026-10-26T16:44:43.409-07:00 │
`;
const health = (reserved, reservations) => ({ ok: true, admission: true, busy: false, image: '3134c69ad', capabilities: ['parameters'], budget: { month: '2026-10', reservedBytes: reserved, reservations, maximumBytes: 2147483648 } });
const BASE = { at: AT, atPT: 'baseline', health: health(2068720256, 6) };
const report = ({ d = database(), user, observed = ['invalid-edit'] } = {}) =>
  buildReport({ base: BASE, now: NOW, h: health(2068720256 + 3 * ATTEMPT, 9), usage: collectUsage(d.run, { fromMs: AT, toMs: NOW, user }), runs: machineRuns(STATUS, AT, NOW), observed: new Set(observed) });

test('the owner run: measured cost and credits come from the usage rows, the machine and transfer are labelled estimates', () => {
  const d = database(); d.derive('cr_a', ['step', 'glb', 'thumbnail'], AT + 100_000, 40_000); d.derive('cr_b', ['step', 'glb', 'thumbnail'], AT + 230_000, 40_000);
  const r = report({ d }), text = r.lines.join('\n');
  assert.ok(Math.abs(r.micros / 1e6 - 0.060872) < 1e-9);
  assert.match(text, /Platform provider cost.*US\$0\.060872/);
  assert.match(text, /Learner credits charged.*: 6\.09/);
  assert.match(text, /## 1\. MEASURED[\s\S]*## 2\. ESTIMATED[\s\S]*## 3\. UNKNOWN[\s\S]*## 4\. RESERVED/);
  assert.match(text, /632 s at US\$0\.0353\/h = US\$0\.006201 ESTIMATE/);
  assert.match(text, /tokens in not recorded \/ out not recorded, price version not recorded/);
  assert.match(text, /3 usage action row\(s\) are still 'running'/);
  assert.match(text, /CAD_DIAGNOSTIC_READ_TOKEN/);
  assert.ok(Math.abs(r.settle - (0.060872 + 632.358 / 3600 * 0.0353 + 240000 / 1e9 * 0.02)) < 1e-6);
  assert.equal(r.verdict.verdict, 'CONSISTENT'); // 3 attempts, 2 published builds, the out-of-range edit observed
});

test('missing usage is never zero and never settled: an unsettled operation keeps the reservation at its maximum', () => {
  const r = report({ d: database({ unsettled: true }) });
  assert.equal(r.settle, null);
  assert.match(r.lines.join('\n'), /NOT MEASURED \(cost not recorded; reservation 100000 micro-USD stays held\)/);
  assert.match(r.lines.join('\n'), /RESERVED[\s\S]*UNRESOLVED, stays at the maximum/);
  assert.equal(report({ d: database({ calls: [] }) }).settle, null); // no rows at all is unresolved, not zero cost
});

test('identification: by the window and one principal; two users in the window need --user, and other users are never counted', () => {
  const d = database();
  d.db.prepare("INSERT INTO usage_operations (op_id, user_id, org, category, status, admitted_at, deadline_at, settled_at, calls, cost_usd) VALUES ('cad-other', 'someone-else', 'org', 'cad', 'settled', ?, ?, ?, 1, 0.5)").run(1793062250, 1793062370, 1793062260);
  const open = report({ d });
  assert.equal(open.settle, null);
  assert.match(open.lines.join('\n'), /2 users had CAD operations in the window; pass --user/);
  const named = report({ d, user: OWNER });
  assert.ok(Math.abs(named.micros / 1e6 - 0.060872) < 1e-9);
  assert.match(named.lines.join('\n'), /1 CAD operation\(s\) of OTHER users in the window, not counted/);
  const outside = database(); // an operation before the baseline is outside the window
  outside.db.prepare("INSERT INTO usage_operations (op_id, user_id, org, category, status, admitted_at, deadline_at, calls, cost_usd) VALUES ('cad-old', ?, 'org', 'cad', 'settled', ?, ?, 1, 9)").run(OWNER, 1793062000, 1793062120);
  assert.equal(collectUsage(outside.run, { fromMs: AT, toMs: NOW }).mine.length, 3);
});

test('the collector can only read: every statement is a single SELECT', () => {
  const seen = [];
  collectUsage(sql => { seen.push(sql); return { results: [] }; }, { fromMs: AT, toMs: NOW });
  assert.equal(seen.length, 2);
  for (const sql of seen) assert.match(sql, /^\s*SELECT\b/);
  assert.throws(() => readOnly(() => ({}))('DELETE FROM usage_operations'), /not a single SELECT/);
});

test('measure: tokens and price come from the rows when they hold them, otherwise they are named as not recorded', () => {
  const m = measure({ status: 'settled', cost_usd: 0.0265, cost_micros: 26500, cost_state: 'settled', quantities: '{"input":1200,"output":900}', price_version: '2026-10-23.1', model: 'claude-sonnet-5-5' });
  assert.deepEqual([m.measured, m.input, m.output, m.price, m.credits], [true, 1200, 900, '2026-10-23.1', 2.65]);
  assert.equal(measure({ status: 'admitted', cost_usd: 0.1, cost_micros: null, cost_state: 'reserved' }).measured, false);
  assert.equal(measure({ status: 'settled', cost_usd: null, cost_micros: 5, cost_state: 'settled' }).measured, false);
});

test('machine runs: the run that overlaps the window, in full; a run still going is counted to now and said so', () => {
  const runs = machineRuns(STATUS, AT, NOW);
  assert.equal(runs.length, 1);
  assert.equal((runs[0].end - runs[0].start) / 1000, 632.358);
  const going = machineRuns(`${STATUS}\n started  │ start │ flyd   │ 2026-10-26T18:00:00.000-07:00 │`, Date.parse('2026-10-26T18:01:00-07:00'), Date.parse('2026-10-26T18:02:00-07:00'));
  assert.equal(going[0].stillRunning, true);
  assert.equal(machineRuns(null, AT, NOW), null);
});

test('attempt expectation: 2 is the build and the accepted rebuild; a third is explained only by a published-build count of 2 and an observed refused edit', () => {
  const c = (dRes, observed = [], published = 2, extra = {}) => classifyAttempts({ dRes, dBytes: dRes * ATTEMPT, sameMonth: true, observed: new Set(observed), published, ...extra }).verdict;
  assert.equal(c(2), 'CONSISTENT');
  assert.equal(c(3, ['invalid-edit'], 2), 'CONSISTENT');
  assert.equal(c(3, [], 2), 'UNEXPLAINED'); // the refused edit was not reported
  assert.equal(c(3, ['invalid-edit'], 3), 'UNEXPLAINED'); // three builds published: an extra successful rebuild or export, not a refusal
  assert.equal(c(3, ['invalid-edit'], null), 'UNEXPLAINED'); // published builds unknown
  assert.equal(c(4, ['invalid-edit'], 2), 'UNEXPLAINED');
  assert.equal(c(1), 'MISSING');
  assert.equal(c(0), 'NOT SHOWN');
  assert.equal(classifyAttempts({ dRes: 2, dBytes: 5, sameMonth: true, observed: new Set(), published: 2 }).verdict, 'UNEXPECTED');
  assert.equal(c(2, [], 2, { sameMonth: false }), 'INCONCLUSIVE');
});

const quiet = () => { const out = []; return { out, log: line => out.push(String(line)) }; };
test('post: a dry run writes and settles nothing; --go writes the receipt and settles measured + estimate; unresolved leaves the reservation', async () => {
  const io = (d, extra = {}) => { const q = quiet(), writes = [], budgets = []; return { q, writes, budgets, io: { log: q.log, read: () => JSON.stringify(BASE), exists: () => true, health: async () => health(2068720256 + 3 * ATTEMPT, 9), run: () => d.run, fly: () => STATUS, now: NOW, write: (f, t) => writes.push([f, t]), budget: (...a) => { budgets.push(a); return { code: 0, out: '{"ok":true}' }; }, ...extra } }; };
  const d = database(); d.derive('cr_a', ['step'], AT + 100_000, 1000); d.derive('cr_b', ['step'], AT + 230_000, 1000);
  const dry = io(d); await post(['--observed', 'invalid-edit'], dry.io);
  assert.equal(dry.writes.length + dry.budgets.length, 0);
  assert.match(dry.q.out.join('\n'), /DRY RUN: would write .* and settle cad-review-first-acceptance-1 at US\$0\.06/);
  const go = io(d); await post(['--go', 'RUN CAD ACCEPTANCE', '--observed', 'invalid-edit'], go.io);
  assert.equal(go.writes.length, 1);
  assert.deepEqual(go.budgets[0].slice(0, 2), ['settle', 'cad-review-first-acceptance-1']);
  assert.ok(Number(go.budgets[0][2]) > 0.060872 && Number(go.budgets[0][2]) < 0.0675);
  const open = io(database({ unsettled: true })); await post(['--go', 'RUN CAD ACCEPTANCE'], open.io);
  assert.equal(open.budgets.length, 0);
  assert.match(open.q.out.join('\n'), /left reserved at US\$0\.50/);
  const broken = io(d, { run: () => { throw new Error('wrangler failed'); } }); await post(['--go', 'RUN CAD ACCEPTANCE'], broken.io);
  assert.equal(broken.budgets.length, 0);
  assert.match(broken.q.out.join('\n'), /usage could not be read: wrangler failed/);
});

test('post: --actual-usd is retired; a manual figure needs --override-usd with an evidence file and a reason, and both are written to the receipt and the budget ledger note', async () => {
  const base = { log: () => {}, read: () => JSON.stringify(BASE), health: async () => health(2068720256 + 2 * ATTEMPT, 8), run: () => database().run, fly: () => STATUS, now: NOW };
  await assert.rejects(post(['--actual-usd', '0.05'], { ...base, exists: () => true }), /--actual-usd is retired/);
  await assert.rejects(post(['--override-usd', '0.07'], { ...base, exists: () => true }), /--override-usd needs/);
  await assert.rejects(post(['--override-usd', '0.07', '--evidence', 'missing.txt', '--reason', 'why'], { ...base, exists: f => f !== 'missing.txt' }), /--override-usd needs/);
  const writes = [], budgets = [], notes = [];
  await post(['--go', 'RUN CAD ACCEPTANCE', '--override-usd', '0.07', '--evidence', 'bill.txt', '--reason', 'provider console total'], { ...base, exists: () => true, write: (f, t) => writes.push(t), budget: (...a) => { budgets.push(a); return { code: 0, out: '{}' }; }, append: (f, t) => notes.push(t) });
  assert.match(writes[0], /Manual override \(audited\)[\s\S]*bill\.txt[\s\S]*provider console total/);
  assert.deepEqual(budgets[0], ['settle', 'cad-review-first-acceptance-1', '0.07']);
  assert.match(notes[0], /MANUAL OVERRIDE at US\$0\.07; evidence bill\.txt; reason: provider console total/);
});

test('pre: refuses below 2 attempts of room, passes at exactly 2, a dry run writes nothing, --go writes the baseline and reserves', async () => {
  const run = async (reserved, args = [], extra = {}) => { const q = quiet(), writes = [], budgets = []; try { await pre(args, { log: q.log, health: async () => health(reserved, 6), write: (f, t) => writes.push(f), budget: (...a) => { budgets.push(a); return { code: 0, out: '{}' }; }, ...extra }); } catch (e) { return { error: e.message, writes, budgets, q }; } return { writes, budgets, q }; };
  assert.match((await run(2147483648 - ATTEMPT)).error, /REFUSED.*Do not click Generate/);
  const two = await run(2147483648 - 2 * ATTEMPT); assert.equal(two.error, undefined); assert.match(two.q.out.join('\n'), /WARNING: 2 attempts left/);
  assert.equal(two.writes.length + two.budgets.length, 0);
  const go = await run(2068720256, ['--go', 'RUN CAD ACCEPTANCE']);
  assert.equal(go.writes.length, 1); assert.deepEqual(go.budgets[0], ['reserve', 'cad-review-first-acceptance-1', 'cad-review-first', '0.5']);
  assert.match(go.q.out.join('\n'), /internal 2 GiB transfer policy, not provider funds/);
});
