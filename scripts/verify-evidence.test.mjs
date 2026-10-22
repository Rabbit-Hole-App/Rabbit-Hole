// Verify evidence (r34 audit): the dev deploy trusts only a passing, keyless verify run of the exact commit, tree and
// locked dependencies. No network.
//   node --test scripts/verify-evidence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkEvidence, lockDigest, LOCKS, runBlockers, latestRun } from './verify-evidence.mjs';

const SHA = 'a'.repeat(40), TREE = 'b'.repeat(40);
const locks = { 'package-lock.json': '0123456789abcdef', 'uv.lock': 'fedcba9876543210' };
const good = { sha: SHA, tree: TREE, locks, unit: 'pass', build: 'pass', run: '37990000000.1' };

test('a passing run of the exact commit, tree and lockfiles is accepted; anything else names why', () => {
  assert.equal(checkEvidence(good, { sha: SHA, tree: TREE, locks }), null);
  assert.match(checkEvidence(null, { sha: SHA, tree: TREE, locks }), /no verify evidence/);
  assert.match(checkEvidence({ ...good, sha: 'c'.repeat(40) }, { sha: SHA, tree: TREE, locks }), /is for cccccccc, not aaaaaaaa/);
  assert.match(checkEvidence({ ...good, tree: 'c'.repeat(40) }, { sha: SHA, tree: TREE, locks }), /names tree cccccccc/);
  assert.match(checkEvidence({ ...good, locks: { ...locks, 'uv.lock': 'x' } }, { sha: SHA, tree: TREE, locks }), /another uv\.lock/);
  assert.match(checkEvidence({ ...good, unit: 'exit 1' }, { sha: SHA, tree: TREE, locks }), /did not pass \(unit exit 1/);
  assert.match(checkEvidence({ ...good, build: 'exit 2' }, { sha: SHA, tree: TREE, locks }), /build exit 2/);
  assert.match(checkEvidence({ ...good, run: 'local' }, { sha: SHA, tree: TREE, locks }), /names no run/);
});

test('the lockfile digest is the same from a Windows and a Linux checkout, and covers both lockfiles', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const d = lockDigest(root);
  assert.deepEqual(Object.keys(d).sort(), [...LOCKS].sort());
  for (const f of LOCKS) assert.match(d[f], /^[0-9a-f]{16}$/, f);
  assert.equal(d['package-lock.json'], lockDigest(root)['package-lock.json']);
});

test('the verify workflow is unprivileged and keyless: read-only, no secrets, main excluded, note written by a separate job', () => {
  const wf = readFileSync(new URL('../.github/workflows/verify.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.doesNotMatch(wf, /secrets\./, 'no secret anywhere');
  assert.match(wf, /^permissions:\n  contents: read\n/m);
  assert.match(wf, /branches-ignore: \[main\]/, 'main is the production trigger, verified before it was main');
  assert.doesNotMatch(wf, /wrangler deploy|CLOUDFLARE_API_TOKEN|ANTHROPIC/, 'nothing deploys and no provider key');
  assert.match(wf, /env -i PATH="\$PATH" HOME="\$HOME" CI=true bash run\.sh test:unit/, 'the suites run in an empty environment');
  assert.match(wf, /uv sync --locked/);
  assert.match(wf, /lock-natives\.mjs --check[\s\S]*npm ci --no-audit --no-fund/, 'the lock is checked before install');
  const [verify, record] = wf.split('\n  record:');
  assert.doesNotMatch(verify, /contents: write/, 'the verify job holds no write');
  assert.match(record, /permissions:\n      contents: write[\s\S]*notes --ref=verify add -f/, 'only the record job writes, only the note');
  for (const uses of wf.match(/uses: \S+/g)) assert.match(uses, /@[0-9a-f]{40}$/, `${uses} is pinned`);
});

// OPS-04 (owner, 2026-10-21): UI-17 14310051 shipped with its own fast-e2e run 39719683140 failed. Every deploy needs
// the newest fast-e2e and verify runs of exactly the candidate sha completed successfully.
const FAST = '.github/workflows/fast-e2e.yml', VERIFY = '.github/workflows/verify.yml';
const run = (path, o = {}) => ({ id: 39719683140, run_attempt: 1, path, head_sha: SHA, head_branch: 'fix/x', event: 'push', status: 'completed', conclusion: 'success',
  html_url: 'https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/39719683140', created_at: '2026-10-22T03:57:33Z', run_started_at: '2026-10-22T03:57:33Z', ...o });
const ev = (fast, verify = [run(VERIFY, { id: 39719683146 })]) => ({ sha: SHA, runs: { [FAST]: fast, [VERIFY]: verify } });

test('runBlockers: a completed success of fast-e2e and verify at exactly this sha passes', () => {
  assert.deepEqual(runBlockers(ev([run(FAST)]), SHA), []);
});

test('runBlockers: a failed, running, queued, cancelled, missing or other-sha fast-e2e run blocks, each with its reason', () => {
  const cases = [
    [[run(FAST, { conclusion: 'failure' })], /^fast-e2e run 39719683140\.1 of aaaaaaaa is completed\/failure, not a completed success: https:/],
    [[run(FAST, { status: 'in_progress', conclusion: null })], /is in_progress\/null, not a completed success/],
    [[run(FAST, { status: 'queued', conclusion: null })], /is queued\/null/],
    [[run(FAST, { conclusion: 'cancelled' })], /is completed\/cancelled/],
    [[run(FAST, { conclusion: 'skipped' })], /is completed\/skipped/],
    [[], /^no fast-e2e run of aaaaaaaa; push the commit to a branch other than main or dev/],
    [[run(FAST, { head_sha: 'c'.repeat(40) })], /^no fast-e2e run of aaaaaaaa \(the runs read are of cccccccc\)/],
    [[run(VERIFY)], /^no fast-e2e run of aaaaaaaa/], // another workflow's run never counts
  ];
  for (const [fast, why] of cases) { const b = runBlockers(ev(fast), SHA); assert.equal(b.length, 1, String(why)); assert.match(b[0], why); }
});

test('runBlockers: verify is required the same way, and missing or foreign evidence blocks', () => {
  assert.match(runBlockers(ev([run(FAST)], [run(VERIFY, { conclusion: 'failure' })]), SHA)[0], /^verify run .* completed\/failure/);
  assert.match(runBlockers(ev([run(FAST)], []), SHA)[0], /^no verify run of aaaaaaaa/);
  assert.match(runBlockers(ev([run(FAST)], [run(VERIFY, { event: 'pull_request' })]), SHA)[0], /^no verify run/, 'a pull_request run tests a merge tree');
  assert.deepEqual(runBlockers(ev([run(FAST, { conclusion: 'failure' })], []), SHA).length, 2, 'every gap is named');
  assert.match(runBlockers(null, SHA)[0], /no CI run evidence/);
  assert.match(runBlockers({ sha: SHA }, SHA)[0], /no CI run evidence/);
  assert.match(runBlockers({ ...ev([run(FAST)]), sha: 'c'.repeat(40) }, SHA)[0], /evidence is for cccccccc, not aaaaaaaa/);
});

test('runBlockers: the newest attempt wins, a rerun included', () => {
  const failed = run(FAST, { id: 1, conclusion: 'failure', run_started_at: '2026-10-22T03:00:00Z' });
  const rerunPassed = run(FAST, { id: 1, run_attempt: 2, run_started_at: '2026-10-22T05:00:00Z' }); // the API lists a run at its newest attempt
  const otherBranchPassed = run(FAST, { id: 2, run_started_at: '2026-10-22T04:00:00Z' });
  assert.deepEqual(runBlockers(ev([failed, otherBranchPassed]), SHA), [], 'a later passing run of the same sha');
  assert.deepEqual(runBlockers(ev([rerunPassed, otherBranchPassed]), SHA), [], 'a rerun attempt that passed');
  assert.match(runBlockers(ev([otherBranchPassed, run(FAST, { id: 1, run_attempt: 2, conclusion: 'failure', run_started_at: '2026-10-22T05:00:00Z' })]), SHA)[0], /run 1\.2 .* completed\/failure/, 'an earlier success never outvotes a newer failure');
  assert.match(runBlockers(ev([otherBranchPassed, run(FAST, { id: 3, status: 'in_progress', conclusion: null, run_started_at: '2026-10-22T06:00:00Z' })]), SHA)[0], /run 3\.1 .* in_progress/, 'nor a newer run still going');
  assert.equal(latestRun([run(FAST, { id: 5 }), run(FAST, { id: 6 })], { sha: SHA, path: FAST }).id, 6, 'same start: the higher run id');
});

test('the deploy workflows read the runs with actions: read before any install, and pass them to the deciding script', () => {
  for (const [f, decide] of [['deploy-prod.yml', /prod-release\.mjs prepare [^\n]*--runs "\$RUNNER_TEMP\/ci-runs\.json"/], ['deploy-dev.yml', /dev-deploy-gate\.mjs [^\n]*--runs "\$RUNNER_TEMP\/ci-runs\.json"/]]) {
    const wf = readFileSync(new URL(`../.github/workflows/${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    assert.match(wf, /^permissions:\n(  .*\n)*  actions: read/m, f);
    assert.match(wf, decide, f);
    const read = wf.indexOf('verify-evidence.mjs runs --sha "$GITHUB_SHA" --out "$RUNNER_TEMP/ci-runs.json"');
    assert.ok(read > 0 && (wf.indexOf('npm ci') < 0 || read < wf.indexOf('npm ci')), `${f}: the token is used before any npm script runs`);
    assert.ok(read < wf.search(decide), `${f}: read before the decision`);
  }
});
