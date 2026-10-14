// collect.mjs end to end with no network: gh is a copy of node.exe named gh on a PATH of its own, and a --require preload
// (active only when the running binary is called gh) answers `gh api .../runs/9/jobs?filter=all&per_page=100&page=N` (the only
// jobs call it serves: pages of FAKE_GH_PAGE jobs, total_count FAKE_GH_TOTAL or all) and `gh run list` from the test. The artifact
// directories are fixtures named as upload-artifact names them. The shard logs are junk, so a part that reads cleanly still
// ends in one `merge:` failure; every other failure is the judging this task changed.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SHARDS } from './shards.mjs';

const collect = join(dirname(fileURLToPath(import.meta.url)), 'collect.mjs');
const sha = 'a'.repeat(40), tree = 'b'.repeat(40), harness = 'c'.repeat(40), RUN = '9';
const PARTS = ['units', 'checkpoints', ...SHARDS.map((_, k) => `shard-${k + 1}`)];
let root, bin, preload;
before(() => {
  root = mkdtempSync(join(tmpdir(), 'r36-collect-test-'));
  bin = join(root, 'bin'); mkdirSync(bin);
  copyFileSync(process.execPath, join(bin, process.platform === 'win32' ? 'gh.exe' : 'gh'));
  preload = join(root, 'fake-gh.cjs');
  writeFileSync(preload, String.raw`
const { basename } = require('node:path'), { writeSync } = require('node:fs');
if (basename(process.execPath).toLowerCase().startsWith('gh')) {
  const [, script, ...args] = process.argv, cmd = basename(script);
  const want = /^repos\/o\/r\/actions\/runs\/9\/jobs\?filter=all&per_page=100&page=(\d+)$/.exec(args[0] || '');
  if (cmd === 'api' && want && process.env.FAKE_GH_JOBS !== undefined) {
    const all = JSON.parse(process.env.FAKE_GH_JOBS), size = +(process.env.FAKE_GH_PAGE || 100), page = +want[1];
    writeSync(1, JSON.stringify({ total_count: +(process.env.FAKE_GH_TOTAL ?? all.length), jobs: all.slice((page - 1) * size, page * size) }));
  }
  else if (cmd === 'run') writeSync(1, JSON.stringify([{ databaseId: 5, status: 'completed', conclusion: 'success', headSha: args[args.indexOf('--commit') + 1] }]));
  else { writeSync(2, 'fake gh refuses: ' + cmd); process.exit(2); }
  process.exit(0);
}`);
});
after(() => rmSync(root, { recursive: true, force: true }));

// One part's artifact as the run job of that attempt uploaded it (the checkpoints job uploads the Dive receipt as 'dive').
const put = (input, part, attempt, extra = {}, log = 'junk\n') => {
  const ident = { applicationSha: sha, applicationTree: tree, harnessSha: harness, grant: `r36-windows-${RUN}-${attempt}` };
  const dive = part === 'checkpoints';
  const d = join(input, `r36-windows-${dive ? 'dive' : part}-${sha}-${attempt}`, 'r36', 'artifacts');
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, dive ? 'dive-receipt.json' : `${part}-receipt.json`), JSON.stringify({ ...ident, phase: dive ? 'dive' : undefined, pass: true, ended: 't', ...extra }));
  if (!dive) writeFileSync(join(d, 'gate-shard.log'), log);
};
// A job as GitHub lists it: a rerun lists every part again under the new run_attempt, and a part it did not rerun keeps the
// runner and start of the run it copies (ran: the attempt that run happened in; run 38616535709).
const job = (part, runAttempt, conclusion = 'success', ran = runAttempt) => ({ name: `run (${part})`, run_attempt: runAttempt, conclusion,
  runner_id: 1000 + 20 * ran + PARTS.indexOf(part), started_at: `2026-10-14T18:0${ran}:00Z` });
// The listing of attempts 1..current where each part ran in the attempts ranIn lists (default [1]) and failed in the ones
// failed lists (default: all but its last); every attempt lists every part and its own collect.
const listing = (current, ranIn = {}, failed = {}) => Array.from({ length: current }, (_, i) => i + 1).flatMap(a => [
  ...PARTS.map(p => { const runs = ranIn[p] ?? [1], ran = runs.filter(r => r <= a).at(-1); return job(p, a, (failed[p] ?? runs.slice(0, -1)).includes(ran) ? 'failure' : 'success', ran); }),
  { name: 'collect', run_attempt: a, conclusion: a === current ? null : 'failure' }]);

function collectRun(name, current, jobs, fake = {}) {
  const input = join(root, name, 'in'), out = join(root, name, 'out');
  mkdirSync(input, { recursive: true });
  return { input, out, go() {
    const env = { ...(process.env.SystemRoot && { SystemRoot: process.env.SystemRoot }), PATH: bin, NODE_OPTIONS: `--require ${preload.replaceAll('\\', '/')}`,
      APP_ROOT: root, TESTED_SHA: sha, TESTED_TREE: tree, HARNESS_SHA: harness, GATE_GRANT_ID: `r36-windows-${RUN}-${current}`, ARTIFACT_ROOT: out,
      GITHUB_RUN_ID: RUN, GITHUB_RUN_ATTEMPT: String(current), GITHUB_REPOSITORY: 'o/r', ...(jobs && { FAKE_GH_JOBS: JSON.stringify(jobs) }), ...fake };
    const r = spawnSync(process.execPath, [collect, input], { env, encoding: 'utf8', timeout: 60000 });
    const summary = JSON.parse(r.stdout.trim().split('\n').at(-1));
    return { status: r.status, failures: summary.failures, verdict: JSON.parse(readFileSync(join(out, 'gate-verdict.json'), 'utf8')), receipt: JSON.parse(readFileSync(join(out, 'receipt.json'), 'utf8')) };
  } };
}

test('failed-only reruns read each part from the attempt it ran in, with that attempt grant, and record the attempts', () => {
  // checkpoints failed at 1 and passed at 2; shard-2 failed at 1 and 2 and passed at 3; attempt 3 lists all nine parts.
  const ranIn = { checkpoints: [1, 2], 'shard-2': [1, 2, 3] }, c = collectRun('rerun', 3, listing(3, ranIn), { FAKE_GH_PAGE: '4' }); // eight pages
  // The older failures stay in the run and must not be read.
  for (const p of PARTS) for (const a of ranIn[p] ?? [1]) put(c.input, p, a, a === (ranIn[p] ?? [1]).at(-1) ? {} : { pass: false, failure: 'stale' });
  const r = c.go();
  assert.equal(r.failures.length, 1, r.failures.join('\n'));
  assert.match(r.failures[0], /^merge: /);
  const attempts = Object.fromEntries(PARTS.map(p => [p, (ranIn[p] ?? [1]).at(-1)]));
  assert.deepEqual(r.verdict.attempts, attempts);
  assert.deepEqual(r.receipt.attempts, attempts);
  assert.ok(r.receipt.prerequisite?.sha256, 'the Dive receipt of its attempt 2 was read');
  assert.deepEqual(r.receipt.verify.map(v => v.databaseId), [5, 5]);
  assert.equal(r.receipt.units.pass && r.receipt.shards.every(s => s.pass), true);
});

test('a newer failed attempt is judged, never the older pass beside it', () => {
  const c = collectRun('newer-failure', 2, listing(2, { 'shard-2': [1, 2] }, { 'shard-2': [2] })); // a passed shard-2 rerun alone, failing
  for (const p of PARTS) put(c.input, p, 1);
  put(c.input, 'shard-2', 2, { pass: false, failure: 'boom' });
  const r = c.go();
  assert.ok(r.failures.includes('shard-2: newest attempt 2 failure'), r.failures.join('\n'));
  assert.ok(r.failures.includes('shard-2 (attempt 2): boom'), r.failures.join('\n'));
  assert.equal(r.receipt.shards[1].pass, false);
  assert.equal(r.receipt.pass, false);
});

test('a jobs query that fails fails the gate and records no attempts', () => {
  const c = collectRun('gh-down', 1, undefined);
  for (const p of PARTS) put(c.input, p, 1);
  const r = c.go();
  assert.ok(r.failures.some(f => /^attempts: gh jobs query failed/.test(f)), r.failures.join('\n'));
  assert.deepEqual(r.verdict.attempts, {});
  assert.equal(r.status, 1);
});

test('a matrix job missing from the required parts still fails the gate when its newest attempt did not succeed', () => {
  const c = collectRun('matrix-drift', 1, [...listing(1), job('shard-8', 1, 'failure')]);
  for (const p of PARTS) put(c.input, p, 1);
  const r = c.go();
  assert.ok(r.failures.includes('shard-8: newest attempt 1 failure'), r.failures.join('\n'));
  assert.equal(r.receipt.pass, false);
  assert.equal(r.status, 1);
});

test('a green newest attempt whose artifact is missing fails; the older attempt artifact is never used', () => {
  const c = collectRun('missing-newest', 2, listing(2, { 'shard-2': [1, 2] }, { 'shard-2': [] }));
  for (const p of PARTS) put(c.input, p, 1); // shard-2 passed at attempt 1 and its attempt 2 job is green, but attempt 2 uploaded nothing
  const r = c.go();
  const mine = r.failures.filter(f => f.startsWith('shard-2 '));
  assert.deepEqual(mine, [`shard-2 (attempt 2): receipt missing from r36-windows-shard-2-${sha}-2`, 'shard-2 (attempt 2): gate-shard.log missing']);
  assert.equal(r.receipt.shards[1].pass, false);
  assert.equal(r.receipt.shards[1].receiptSha256, null);
  assert.equal(r.receipt.attempts['shard-2'], 2);
});

// The real job listings (rerun-listings.json). In 38616535709 shards 5-7 failed at 1 and were rerun at 2; its collect read
// all nine parts at attempt 2 before this fix.
const listings = JSON.parse(readFileSync(new URL('./rerun-listings.json', import.meta.url), 'utf8'));
const ran38616535709 = p => (['shard-5', 'shard-6', 'shard-7'].includes(p) ? 2 : 1);
test('run 38616535709 attempt 2: every part is read from the attempt it ran in, with that attempt grant', () => {
  const c = collectRun('real-38616535709', 2, listings['38616535709']);
  for (const p of PARTS) put(c.input, p, ran38616535709(p));
  for (const p of ['shard-5', 'shard-6', 'shard-7']) put(c.input, p, 1, { pass: false, failure: 'stale' });
  const r = c.go();
  assert.equal(r.failures.length, 1, r.failures.join('\n'));
  assert.match(r.failures[0], /^merge: /);
  assert.deepEqual(r.verdict.attempts, Object.fromEntries(PARTS.map(p => [p, ran38616535709(p)])));
});

test('drill 2: a part a rerun did not rerun, with no artifact from the attempt it ran in, fails naming the part and that attempt', () => {
  const c = collectRun('missing-carried', 2, listings['38616535709']);
  for (const p of PARTS) if (p !== 'units' && p !== 'checkpoints') put(c.input, p, ran38616535709(p));
  const r = c.go();
  assert.ok(r.failures.includes(`units (attempt 1): receipt missing from r36-windows-units-${sha}-1`), r.failures.join('\n'));
  assert.ok(r.failures.includes('units (attempt 1): gate-shard.log missing'), r.failures.join('\n'));
  assert.ok(r.failures.includes(`checkpoint (attempt 1): Required dive receipt missing from r36-windows-dive-${sha}-1`), r.failures.join('\n'));
  assert.deepEqual(r.verdict.attempts, Object.fromEntries(PARTS.map(p => [p, ran38616535709(p)])));
  assert.equal(r.verdict.gateVerdict, 'not computed: shard records incomplete');
  assert.equal(r.status, 1);
});

test('a record from another run, another commit or tree, or another attempt of this run fails, naming the part and its attempt', () => {
  const c = collectRun('unrelated', 2, listings['38616535709']);
  for (const p of PARTS) put(c.input, p, ran38616535709(p));
  put(c.input, 'shard-1', 1, { grant: 'r36-windows-8-1' }); // another run
  put(c.input, 'shard-2', 1, { applicationSha: 'd'.repeat(40) }); // another commit
  put(c.input, 'shard-3', 1, { applicationTree: 'e'.repeat(40) }); // another tree
  put(c.input, 'shard-5', 2, { grant: `r36-windows-${RUN}-1` }); // shard-5 ran in attempt 2; a receipt granted to attempt 1 is stale
  put(c.input, 'checkpoints', 1, { grant: `r36-windows-${RUN}-2` });
  const r = c.go();
  for (const f of ['shard-1 (attempt 1): identity mismatch: grant', 'shard-2 (attempt 1): identity mismatch: applicationSha',
    'shard-3 (attempt 1): identity mismatch: applicationTree', 'shard-5 (attempt 2): identity mismatch: grant',
    'checkpoint (attempt 1): Prerequisite identity mismatch: grant']) assert.ok(r.failures.includes(f), `${f}\n${r.failures.join('\n')}`);
  assert.equal(r.status, 1);
});

test('run 38619263836 (drill 5): a cancelled run fails closed, naming each cancelled part and its attempt', () => {
  const c = collectRun('cancelled', 1, listings['38619263836']);
  for (const p of PARTS) put(c.input, p, 1); // even passing receipts never stand in for a cancelled job
  const r = c.go();
  for (const p of PARTS.filter(p => p !== 'units')) assert.ok(r.failures.includes(`${p}: newest attempt 1 cancelled`), r.failures.join('\n'));
  assert.equal(r.verdict.pass, false);
  assert.equal(r.status, 1);
});

test('a jobs listing shorter than its total_count fails closed', () => {
  const jobs = listing(1), c = collectRun('short-listing', 1, jobs, { FAKE_GH_TOTAL: String(jobs.length + 1) });
  for (const p of PARTS) put(c.input, p, 1);
  const r = c.go();
  assert.ok(r.failures.some(f => /^attempts: gh jobs query failed: .*saw \d+ of \d+/.test(f)), r.failures.join('\n'));
  assert.deepEqual(r.verdict.attempts, {});
});

// The gate keeps at most 2 qualified retries in all (transients.json maxRetriesPerGate); each part's own cap is 2 as well, so
// the gate cap is what bounds a gate where several parts each retried.
const retriedLine = (stage, id = 'proxy-keepalive') => `${stage}: retried (${id}) - first attempt diagnostics in attempt-1/${stage}\n`;
test('more than 2 qualified retries across the gate fail it as instability, however the shards share them', () => {
  const c = collectRun('instability', 1, listing(1));
  for (const p of PARTS) put(c.input, p, 1);
  put(c.input, 'shard-1', 1, {}, `junk\n${retriedLine('journey J1-J8')}${retriedLine('tutor-slice')}`);
  put(c.input, 'shard-2', 1, {}, `junk\n${retriedLine('rh-app')}`);
  const r = c.go();
  const mine = r.failures.filter(f => f.startsWith('instability'));
  assert.equal(mine.length, 1, r.failures.join('\n'));
  assert.match(mine[0], /^instability: 3 qualified retries across the gate \(more than 2\): journey J1-J8 \(proxy-keepalive\), tutor-slice \(proxy-keepalive\), rh-app \(proxy-keepalive\)$/);
  assert.equal(r.verdict.pass, false);
  assert.equal(r.receipt.pass, false);
  assert.equal(r.status, 1);
});
test('two qualified retries across two shards are within the gate cap, and both verdict files list them', () => {
  const c = collectRun('within-cap', 1, listing(1));
  for (const p of PARTS) put(c.input, p, 1);
  put(c.input, 'shard-1', 1, {}, `junk\n${retriedLine('journey J1-J8')}`);
  put(c.input, 'shard-2', 1, {}, `junk\n${retriedLine('rh-app')}`);
  const r = c.go();
  assert.deepEqual(r.failures.filter(f => f.startsWith('instability')), []);
  const retried = [{ stage: 'journey J1-J8', reason: 'proxy-keepalive' }, { stage: 'rh-app', reason: 'proxy-keepalive' }];
  assert.deepEqual(r.verdict.retried, retried);
  assert.deepEqual(r.receipt.retried, retried);
});
test('a gate with no retry records an empty retried list', () => {
  const c = collectRun('no-retry', 1, listing(1));
  for (const p of PARTS) put(c.input, p, 1);
  const r = c.go();
  assert.deepEqual(r.verdict.retried, []);
  assert.deepEqual(r.receipt.retried, []);
});
