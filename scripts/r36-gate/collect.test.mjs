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
const put = (input, part, attempt, extra = {}) => {
  const ident = { applicationSha: sha, applicationTree: tree, harnessSha: harness, grant: `r36-windows-${RUN}-${attempt}` };
  const dive = part === 'checkpoints';
  const d = join(input, `r36-windows-${dive ? 'dive' : part}-${sha}-${attempt}`, 'r36', 'artifacts');
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, dive ? 'dive-receipt.json' : `${part}-receipt.json`), JSON.stringify({ ...ident, phase: dive ? 'dive' : undefined, pass: true, ended: 't', ...extra }));
  if (!dive) writeFileSync(join(d, 'gate-shard.log'), 'junk\n');
};
const job = (part, runAttempt, conclusion = 'success') => ({ name: `run (${part})`, run_attempt: runAttempt, conclusion });
// Every part at attempt 1 except the overrides, as the jobs of a failed-only rerun list them.
const jobsAt = (current, over = {}) => PARTS.map(p => job(p, over[p] ?? 1)).concat({ name: 'collect', run_attempt: current, conclusion: null });

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

test('a failed-only rerun reads each part from its own attempt, with that attempt grant, and records the attempts', () => {
  const rerun = { checkpoints: 2, 'shard-2': 3 }, c = collectRun('rerun', 3, [...jobsAt(3, rerun), job('checkpoints', 1, 'failure'), job('shard-2', 1, 'failure')], { FAKE_GH_PAGE: '4' }); // three pages
  for (const p of PARTS) put(c.input, p, rerun[p] ?? 1);
  put(c.input, 'checkpoints', 1, { pass: false, failure: 'stale dive' }); // the older failures stay in the run and must not be read
  put(c.input, 'shard-2', 1, { pass: false, failure: 'stale shard' });
  const r = c.go();
  assert.equal(r.failures.length, 1, r.failures.join('\n'));
  assert.match(r.failures[0], /^merge: /);
  const attempts = Object.fromEntries(PARTS.map(p => [p, rerun[p] ?? 1]));
  assert.deepEqual(r.verdict.attempts, attempts);
  assert.deepEqual(r.receipt.attempts, attempts);
  assert.ok(r.receipt.prerequisite?.sha256, 'the Dive receipt of its attempt 2 was read');
  assert.deepEqual(r.receipt.verify.map(v => v.databaseId), [5, 5]);
  assert.equal(r.receipt.units.pass && r.receipt.shards.every(s => s.pass), true);
});

test('a newer failed attempt is judged, never the older pass beside it', () => {
  const c = collectRun('newer-failure', 2, [...jobsAt(2, { 'shard-2': 2 }).filter(j => j.name !== 'run (shard-2)'), job('shard-2', 1), job('shard-2', 2, 'failure')]);
  for (const p of PARTS) put(c.input, p, 1);
  put(c.input, 'shard-2', 2, { pass: false, failure: 'boom' });
  const r = c.go();
  assert.ok(r.failures.includes('shard-2: newest attempt 2 failure'), r.failures.join('\n'));
  assert.ok(r.failures.includes('shard-2: boom'), r.failures.join('\n'));
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
  const c = collectRun('matrix-drift', 1, [...jobsAt(1), job('shard-8', 1, 'failure')]);
  for (const p of PARTS) put(c.input, p, 1);
  const r = c.go();
  assert.ok(r.failures.includes('shard-8: newest attempt 1 failure'), r.failures.join('\n'));
  assert.equal(r.receipt.pass, false);
  assert.equal(r.status, 1);
});

test('a green newest attempt whose artifact is missing fails; the older attempt artifact is never used', () => {
  const c = collectRun('missing-newest', 2, [...jobsAt(2, { 'shard-2': 2 }), job('shard-2', 1)]);
  for (const p of PARTS) put(c.input, p, 1); // shard-2 passed at attempt 1 and its attempt 2 job is green, but attempt 2 uploaded nothing
  const r = c.go();
  const mine = r.failures.filter(f => f.startsWith('shard-2:'));
  assert.deepEqual(mine, ['shard-2: receipt missing or not passed', 'shard-2: gate-shard.log missing']);
  assert.equal(r.receipt.shards[1].pass, false);
  assert.equal(r.receipt.shards[1].receiptSha256, null);
  assert.equal(r.receipt.attempts['shard-2'], 2);
});

test('a jobs listing shorter than its total_count fails closed', () => {
  const jobs = jobsAt(1), c = collectRun('short-listing', 1, jobs, { FAKE_GH_TOTAL: String(jobs.length + 1) });
  for (const p of PARTS) put(c.input, p, 1);
  const r = c.go();
  assert.ok(r.failures.some(f => /^attempts: gh jobs query failed: .*saw \d+ of \d+/.test(f)), r.failures.join('\n'));
  assert.deepEqual(r.verdict.attempts, {});
});
