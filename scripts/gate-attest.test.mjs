// Item 1 (CI and release speed): the gate runs nothing the exact-SHA fast-e2e run already ran green. A stage counts as
// attested only when fast-e2e's own result line for that check passed N/N; the record says which path each stage took.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gateVerdict, rerunVerdict, GATE_STAGES, gatePaths } from './dev-deploy.mjs';
import { greenDevDeploy, checkPrepare } from './prod-release.mjs';
import { ATTESTABLE, TAG, attestedStages, attestedRunBlockers } from './gate-attest.mjs';

const TREE = '14e9b00578059a8ed8f9b261dbe93db10fb61df4';
const R33 = () => false;
const SHA = '42f5a4f065d4a1df1b47e2f150893b83d7befe3b', OTHER = 'b0ee85f3' + '0'.repeat(32), RUN = '40123456789';
const INT33 = readFileSync(new URL('./fixtures/int33-gate.txt', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const PASSED = INT33
  .replace('bundle(dist) exit 0', 'bundle(dist) exit 0  6 checks passed')
  .replace('bundle(dist-dev) exit 0', 'bundle(dist-dev) exit 0  6 checks passed')
  .replace(/^(dive exit 0  all flows ok)/m, '$1; 5 checks passed')
  .replace(/^slash-sheet exit 0$/m, 'slash-sheet exit 0  11/11 checks passed')
  .replace(/^filedrop exit 0$/m, 'filedrop exit 0  9/9 checks passed')
  .replace(/^(tutor-slice exit 0 .*)$/m, '$1; 20 checks passed')
  .replace(/^rh-local exit 0/m, 'rh-local provider-tripwire hits: 0\nrh-local exit 0');
const tag = (run = RUN, sha = SHA) => `${TAG} run=${run} sha=${sha}`;
// The record the sharded gate writes for an attested stage: its exit line keeps fast-e2e's own count and gains the tag.
const attest = (text, stage, suffix = tag()) => text.replace(new RegExp(`^(${stage.replace(/[()]/g, '\\$&')} exit 0 .*)$`, 'm'), `$1  ${suffix}`);
const attestAll = (text, stages = Object.keys(ATTESTABLE).filter(s => new RegExp(`^${s} exit 0 `, 'm').test(text)), suffix) => stages.reduce((t, s) => attest(t, s, suffix), text);
const RECORD = attestAll(PASSED);

test('both paths pass: every stage run, and the stages fast-e2e ran green attested with their run and sha', () => {
  assert.equal(gateVerdict(PASSED, TREE, R33, SHA), null, 'the all-ran path is unchanged');
  assert.ok(attestedStages(RECORD).length >= 15, 'the fixture attests many stages');
  assert.equal(gateVerdict(RECORD, TREE, R33, SHA), null, 'the attested path');
  const paths = gatePaths(RECORD);
  assert.ok(paths.attested.length >= 15 && paths.run === RUN);
  assert.ok(paths.ran.includes('make test-unit') && paths.ran.includes('bundle(dist)') && paths.ran.includes('bundle(dist-dev)'));
  assert.deepEqual(gatePaths(PASSED).attested, []);
});

test('refusal on a different SHA: an attested line names another commit, or the gate was not told its commit', () => {
  assert.match(gateVerdict(attestAll(PASSED, undefined, tag(RUN, OTHER)), TREE, R33, SHA), /attested for .* not the gated commit/);
  assert.match(gateVerdict(RECORD, TREE, R33), /needs the gated commit/, 'no sha to compare against is a refusal, not a pass');
  assert.match(gateVerdict(RECORD, TREE, R33, OTHER), /not the gated commit/);
});

test('refusal when the stage result is absent or not N/N: a bare attestation is nothing', () => {
  const bare = attest(PASSED.replace('sketch exit 0  15/15 checks passed', 'sketch exit 0'), 'sketch');
  assert.match(gateVerdict(bare, TREE, R33, SHA), /sketch: no positive check count/);
  const partial = attest(PASSED.replace('sketch exit 0  15/15 checks passed', 'sketch exit 0  14/15 checks passed'), 'sketch');
  assert.match(gateVerdict(partial, TREE, R33, SHA), /sketch: no positive check count/);
  const zero = attest(PASSED.replace('sketch exit 0  15/15 checks passed', 'sketch exit 0  0/0 checks passed'), 'sketch');
  assert.match(gateVerdict(zero, TREE, R33, SHA), /sketch: no positive check count/);
  const failed = attest(PASSED.replace('sketch exit 0  15/15 checks passed', 'sketch exit 1  15/15 checks passed'), 'sketch').replace('sketch exit 1', 'sketch exit 1');
  assert.match(gateVerdict(failed, TREE, R33, SHA) ?? '', /failed stages: sketch/);
});

test('an attested line must be well formed: a numeric run and a full sha', () => {
  for (const bad of [`${TAG}`, `${TAG} run=abc sha=${SHA}`, `${TAG} run=${RUN}`, `${TAG} run=${RUN} sha=${SHA.slice(0, 8)}`]) {
    assert.match(gateVerdict(attest(PASSED, 'sketch', bad), TREE, R33, SHA), /sketch: malformed attestation/, bad);
  }
});

test('the attested stage keeps its tripwire line: attestation never removes a provider-tripwire requirement', () => {
  assert.match(gateVerdict(RECORD.replaceAll('sketch provider-tripwire hits: 0\n', ''), TREE, R33, SHA), /sketch: no "sketch provider-tripwire hits: 0" line/);
  assert.match(gateVerdict(RECORD.replace('sketch provider-tripwire hits: 0', 'sketch provider-tripwire hits: 2'), TREE, R33, SHA), /tripwire or model key count not 0/);
});

test('tripwire: no money, sign-in, secret, migration or production-bundle stage can be skipped by attestation', () => {
  const attestable = Object.keys(ATTESTABLE);
  // Every other stage of the gate, named: attesting any one is refused. This includes the unit run (paidRefusal, escrow and auth
  // tests), the fixture regression, both production-bundle checks and every stack-app / journey / tutor stage.
  const never = GATE_STAGES.map(s => s.stage).filter(s => !attestable.includes(s));
  for (const must of ['make test-unit', 'fixture regression', 'bundle(dist)', 'bundle(dist-dev)', 'rh-app', 'journey J1-J8', 'tutor-slice', 'share-revocation', 'library-folders']) assert.ok(never.includes(must), `${must} is never attested`);
  for (const stage of never) {
    const line = new RegExp(`^${stage.replace(/[()]/g, '\\$&')} exit 0 `, 'm');
    if (!line.test(PASSED)) continue;
    assert.match(gateVerdict(attest(PASSED, stage), TREE, R33, SHA), new RegExp(`${stage.replace(/[()]/g, '\\$&')}: cannot be attested by fast-e2e`), stage);
  }
  // Every attestable stage is a gate stage with a tripwire (so its tripwire line is still required), and none is a money,
  // sign-in, secret, migration or bundle check by name.
  for (const [stage, check] of Object.entries(ATTESTABLE)) {
    const g = GATE_STAGES.find(s => s.stage === stage);
    assert.ok(g?.tripwire, `${stage} is a gate stage with a tripwire`);
    assert.doesNotMatch(`${stage} ${check}`, /paid|escrow|auth|sign-?in|secret|migrat|bundle|credit|billing|spend|usage|revocation|unit/i, `${stage} reads as a guarded area`);
  }
  // The rest of the release path is untouched: prod-release prepare still runs the production-bundle check, release still
  // runs the secret and schema preflights, and the dev deploy still smokes sign-in.
  const prod = readFileSync(new URL('./prod-release.mjs', import.meta.url), 'utf8');
  assert.match(prod, /e2e\/production-bundle-check\.mjs/);
  assert.match(prod, /secretBlockers\(worker, names\)/);
  assert.match(prod, /schemaBlockers\(\{/);
  assert.match(readFileSync(new URL('./dev-deploy.mjs', import.meta.url), 'utf8'), /async function smoke\(entry\)/);
});

test('rerun verdict: a rerun record may not carry attested stages (no commit to attest against)', () => {
  const g = PASSED, r = 'tree HEAD abcdef0 MERGE_HEAD  index ' + 'a'.repeat(40) + '\nsketch provider-tripwire hits: 0\nsketch exit 0  15/15 checks passed  ' + tag() + '\nINT35-DONE\n';
  assert.match(rerunVerdict(g, TREE, r, 'a'.repeat(40), { gSha: SHA }) ?? '', /sketch: an attested stage needs the gated commit/);
});

test('the attested run must be a completed success of fast-e2e at that exact commit', () => {
  const FAST = '.github/workflows/fast-e2e.yml';
  const run = o => ({ id: Number(RUN), path: FAST, head_sha: SHA, event: 'push', status: 'completed', conclusion: 'success', ...o });
  const stages = attestedStages(RECORD);
  assert.deepEqual(attestedRunBlockers(stages, [run()], SHA), []);
  assert.match(attestedRunBlockers(stages, [run({ conclusion: 'failure' })], SHA)[0], /not a completed success/, 'a red run');
  assert.match(attestedRunBlockers(stages, [run({ status: 'in_progress', conclusion: null })], SHA)[0], /not a completed success/);
  assert.match(attestedRunBlockers(stages, [run({ head_sha: OTHER })], SHA)[0], /no fast-e2e run/, 'a different sha');
  assert.match(attestedRunBlockers(stages, [run({ id: 1 })], SHA)[0], /no fast-e2e run/, 'a run id fast-e2e never had');
  assert.match(attestedRunBlockers(stages, [run({ event: 'pull_request' })], SHA)[0], /no fast-e2e run/);
  assert.match(attestedRunBlockers(stages, undefined, SHA)[0], /no fast-e2e run/);
  assert.deepEqual(attestedRunBlockers([], [], SHA), [], 'a record that attests nothing needs nothing');
});

// prod-release prepare accepts both paths.
const TREES = { [SHA]: 'e'.repeat(40), [OTHER]: 'f'.repeat(40) };
const treeOf = s => TREES[s] ?? null;
const row = o => ({ sha: SHA, tree: treeOf(SHA), gates: 'pass', smoke: 'pass', gate_digest: '0123456789abcdef', build: 'b1', bundle: 'w1', run: '37971669845.1', version: 'c9c9cf3d', worker: 'w', ...o });
const FASTP = '.github/workflows/fast-e2e.yml', VERIFYP = '.github/workflows/verify.yml';
const ciRun = (path, o = {}) => ({ id: Number(RUN), run_attempt: 1, path, head_sha: SHA, event: 'push', status: 'completed', conclusion: 'success', html_url: 'https://github.com/x', run_started_at: '2026-11-05T03:57:33Z', ...o });
const RUNS = { sha: SHA, runs: { [FASTP]: [ciRun(FASTP)], [VERIFYP]: [ciRun(VERIFYP, { id: 7 })] } };
const ok = (r, runs = RUNS) => ({ sha: SHA, onMain: true, devRecord: `${JSON.stringify(r)}\n`, runs, head: SHA, clean: true, treeOf });

test('prepare accepts the all-ran row and the attested row, and refuses a malformed or unbacked attestation', () => {
  assert.equal(checkPrepare(ok(row())), null, 'all ran');
  const attestedRow = row({ attested: { run: RUN, sha: SHA, stages: ['sketch', 'dive', 'cross-device'] } });
  assert.equal(greenDevDeploy(SHA, JSON.stringify(attestedRow), { treeOf }).sha, SHA);
  assert.equal(checkPrepare(ok(attestedRow)), null, 'attested');
  const refused = {
    'a stage no attestation may cover': { stages: ['sketch', 'bundle(dist)'] },
    'the unit run': { stages: ['make test-unit'] },
    'an unknown stage': { stages: ['nope'] },
    'no stages': { stages: [] },
    'another commit': { sha: OTHER },
    'no run id': { run: undefined },
    'a run id that is not a number': { run: 'x' },
  };
  for (const [why, patch] of Object.entries(refused)) assert.equal(greenDevDeploy(SHA, JSON.stringify(row({ attested: { run: RUN, sha: SHA, stages: ['sketch'], ...patch } })), { treeOf }), null, why);
  assert.match(checkPrepare(ok(attestedRow, { sha: SHA, runs: { [FASTP]: [ciRun(FASTP, { id: 99 })], [VERIFYP]: [ciRun(VERIFYP, { id: 7 })] } })), /took stages from a fast-e2e run that does not stand: attested run \d+: no fast-e2e run/, 'the attested run is not among the runs read');
  const older = ciRun(FASTP, { run_started_at: '2026-11-05T01:00:00Z', conclusion: 'failure' }), newest = ciRun(FASTP, { id: 99, run_started_at: '2026-11-05T05:00:00Z' });
  assert.match(checkPrepare(ok(attestedRow, { sha: SHA, runs: { [FASTP]: [older, newest], [VERIFYP]: [ciRun(VERIFYP, { id: 7 })] } })), /does not stand: attested run \d+ is completed\/failure, not a completed success/, 'a red attested run behind a green newest one');
  assert.match(checkPrepare(ok(attestedRow, { sha: SHA, runs: { [FASTP]: [ciRun(FASTP, { conclusion: 'failure' })], [VERIFYP]: [ciRun(VERIFYP, { id: 7 })] } })), /needs a successful fast-e2e/, 'a red newest run refuses first');
});

test('dev-deploy-gate: a full record is checked against the runs read; a reuse has nothing to check', async () => {
  const { attestedBlockers } = await import('./dev-deploy-gate.mjs');
  const runs = { sha: SHA, runs: { [FASTP]: [ciRun(FASTP)] } }, red = { sha: SHA, runs: { [FASTP]: [ciRun(FASTP, { conclusion: 'failure' })] } };
  assert.deepEqual(attestedBlockers({ full: true }, RECORD, runs, SHA), []);
  assert.deepEqual(attestedBlockers({ full: true }, PASSED, red, SHA), [], 'a record that attests nothing needs no attested run');
  assert.match(attestedBlockers({ full: true }, RECORD, red, SHA)[0], /not a completed success/, 'a red run');
  assert.match(attestedBlockers({ full: true }, RECORD, runs, OTHER)[0], /no fast-e2e run/, 'a different sha');
  assert.match(attestedBlockers({ full: true }, RECORD, null, SHA)[0], /no fast-e2e run/);
  assert.deepEqual(attestedBlockers({ reuse: SHA }, RECORD, red, SHA), []);
});

test('the attestable list equals the committed fixture, which the harness copies byte for byte (drift guard, docs/features/prod-release.md)', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/gate-attestable.json', import.meta.url), 'utf8'));
  const own = Object.fromEntries(Object.entries(ATTESTABLE).map(([stage, file]) => [stage, file.replace(/-check\.mjs$/, '')]));
  assert.deepEqual(own, fixture, 'scripts/fixtures/gate-attestable.json must list exactly gate-attest.mjs ATTESTABLE (stage -> fast-e2e check name); copy it to the harness scripts/r36-gate/gate-attestable.json');
});

test('run-part.sh reads the stack\'s provider tripwire into tripwire.log while the stack is still up (run 42109586563 wrote "unreadable" in all six parts: the EXIT trap had already stopped it)', () => {
  const sh = readFileSync(new URL('./ci/run-part.sh', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const block = sh.slice(sh.indexOf('if [ ${#FORK[@]} != 0 ]; then\n  bash "$W/scripts/ci/stack.sh" start'));
  const read = block.indexOf('__provider-tripwire');
  assert.ok(read > 0, 'it reads the tripwire');
  assert.ok(read < block.indexOf('\nfi\n'), 'inside the fork block, after the checks and before the EXIT trap stops the stack');
  assert.match(block.slice(read - 200, block.indexOf('\nfi\n')), /provider-tripwire hits: \$\{n:-unreadable\}" > "\$OUT\/tripwire\.log"/);
  assert.doesNotMatch(readFileSync(new URL('../.github/workflows/fast-e2e.yml', import.meta.url), 'utf8'), /Provider tripwire hits of this part/, 'a workflow step runs after the trap, too late');
});
