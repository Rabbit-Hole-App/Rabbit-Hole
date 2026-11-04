// The MVP fast path (owner policy 2026-11-03, docs/features/mvp-fast-path.md): the record, what makes production accept
// it, the affected-test selection and the preview launcher's order. No network, no build, no deploy.
//   node --test scripts/mvp-fast-path.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNT } from './prod-release.mjs';
import { MVP_BANNER, REQUIRED, SUITES, affectedTests, checkRecovery, makeRecord, mvpSummary, mvpVerdict, previewArgs, recordDigest, runPreview, verifyArgs } from './mvp-fast-path.mjs';

const SHA = '42f5a4f065d4a1df1b47e2f150893b83d7befe3b', OTHER = 'b0ee85f3' + '0'.repeat(32), TREE = 'e'.repeat(40);
const treeOf = s => (s === SHA ? TREE : null);
const pass = name => ({ name, cmd: `run ${name}`, exit: 0, result: 'pass' });
const parts = (over = {}) => ({ sha: SHA, tree: TREE, base: 'a'.repeat(40), build: 'b1b1b1b1b1b1', targets: { worker: 'rabbit-hole-web-dev-mvp-fast-path', url: 'https://x', account: ACCOUNT, env: 'dev' },
  checks: REQUIRED.map(pass), recovery: { branch: 'recovery/x', tip: 'd'.repeat(40) }, version: 'c9c9cf3d', run: 'local', at: '2026-11-03T10:00:00.000Z', ...over });
const line = r => `${JSON.stringify(r)}\n`;
const GOOD = makeRecord(parts());

test('the record says broad CI and the release gate were bypassed, never passed, and names the commit, tree, build and checks', () => {
  assert.equal(MVP_BANNER, 'MVP MODE: broad CI and release gate BYPASSED by owner policy');
  assert.equal(GOOD.mvp, true);
  assert.deepEqual([GOOD.gates, GOOD.broad_ci, GOOD.release_gate], ['bypassed', 'bypassed', 'bypassed']);
  assert.deepEqual([GOOD.sha, GOOD.tree, GOOD.build], [SHA, TREE, 'b1b1b1b1b1b1']);
  assert.deepEqual(GOOD.checks.map(c => [c.name, c.exit]), REQUIRED.map(n => [n, 0]));
  assert.equal(GOOD.digest, recordDigest(GOOD));
  assert.equal(recordDigest({ ...GOOD, digest: 'x' }), GOOD.digest, 'the digest never covers itself');
  assert.deepEqual(mvpSummary(GOOD), { digest: GOOD.digest, worker: 'rabbit-hole-web-dev-mvp-fast-path', checks: REQUIRED.map(n => `${n}:pass`), recovery: { branch: 'recovery/x', tip: 'd'.repeat(40) }, broad_ci: 'bypassed', release_gate: 'bypassed' });
});

test('production accepts an MVP record only when every required check passed on this commit, tree and a dev clone', () => {
  assert.equal(mvpVerdict(line(GOOD), SHA, treeOf).record.digest, GOOD.digest);
  assert.equal(mvpVerdict(`not json\n${line(GOOD)}\n`, SHA, treeOf).record.sha, SHA, 'noise lines are skipped');
});

test('a failed or missing required check is rejected, whatever else passed', () => {
  for (const name of REQUIRED) {
    const failed = makeRecord(parts({ checks: REQUIRED.map(n => (n === name ? { ...pass(n), exit: 1, result: 'fail' } : pass(n))) }));
    assert.match(mvpVerdict(line(failed), SHA, treeOf).error, new RegExp(`required check ${name} did not pass \\(exit 1\\)`));
    const missing = makeRecord(parts({ checks: REQUIRED.filter(n => n !== name).map(pass) }));
    assert.match(mvpVerdict(line(missing), SHA, treeOf).error, new RegExp(`required check ${name} is missing`));
    const lying = makeRecord(parts({ checks: REQUIRED.map(n => (n === name ? { ...pass(n), exit: 1 } : pass(n))) }));
    assert.match(mvpVerdict(line(lying), SHA, treeOf).error, /did not pass/, 'a pass label over a non-zero exit');
  }
});

test('a record of another commit or tree, with missing fields, or edited after it was written, is rejected', () => {
  assert.match(mvpVerdict(line(makeRecord(parts({ sha: OTHER }))), SHA, treeOf).error, /no MVP preview record is recorded for/);
  assert.match(mvpVerdict(line(GOOD), OTHER, () => TREE).error, /no MVP preview record is recorded for/);
  assert.match(mvpVerdict(line(makeRecord(parts({ tree: 'f'.repeat(40) }))), SHA, treeOf).error, /another tree/);
  assert.match(mvpVerdict('', SHA, treeOf).error, /no MVP preview record/);
  const { digest: _d, ...undigested } = GOOD;
  assert.equal(mvpVerdict(line(undigested), SHA, treeOf).error, 'the record has no digest');
  for (const k of ['tree', 'build', 'version', 'run', 'at']) { // self-consistent, but a field short
    const { [k]: _, digest: __, ...partial } = GOOD; partial.digest = recordDigest(partial);
    assert.equal(mvpVerdict(line(partial), SHA, treeOf).error, `the record has no ${k}`, `without ${k}`);
  }
  const noBuild = makeRecord(parts({ build: undefined, checks: REQUIRED.map(n => (n === 'build' ? { ...pass(n), exit: 1, result: 'fail' } : pass(n))) }));
  assert.match(mvpVerdict(line(noBuild), SHA, treeOf).error, /required check build did not pass/, 'a failed build has no hash, and the record says why');
  const edited = { ...GOOD, checks: GOOD.checks.map(c => (c.name === 'smoke' ? { ...c, exit: 0, result: 'pass', cmd: 'true' } : c)) };
  assert.match(mvpVerdict(line(edited), SHA, treeOf).error, /does not match its digest/, 'a check edited after the fact');
  assert.match(mvpVerdict(line({ ...GOOD, build: 'c2c2c2c2c2c2' }), SHA, treeOf).error, /digest/, 'a swapped build');
  assert.match(mvpVerdict(line({ ...GOOD, sha: SHA, digest: 'tampered' }), SHA, treeOf).error, /digest/);
});

test('broad CI or the gate recorded as passed, or a production target, is rejected even with a valid digest', () => {
  for (const k of ['broad_ci', 'release_gate', 'gates']) {
    const { digest: _, ...r } = GOOD;
    const claimed = { ...r, [k]: 'passed' }; claimed.digest = recordDigest(claimed);
    assert.match(mvpVerdict(line(claimed), SHA, treeOf).error, /bypassed, never passed/, k);
  }
  for (const worker of ['rabbit-hole-app', 'rabbit-hole-cp', 'small-cp', 'rabbit-hole-web-dev-', 'Rabbit-Hole-Web-Dev-x']) {
    assert.match(mvpVerdict(line(makeRecord(parts({ targets: { ...GOOD.targets, worker } }))), SHA, treeOf).error, /not a rabbit-hole-web-dev-\* clone/, worker);
  }
  assert.match(mvpVerdict(line(makeRecord(parts({ targets: { ...GOOD.targets, env: 'production' } }))), SHA, treeOf).error, /not a rabbit-hole-web-dev-\* clone/);
});

test('the newest MVP record of a commit decides: a later failed attempt outvotes an earlier pass', () => {
  const failed = makeRecord(parts({ at: '2026-11-03T11:00:00.000Z', checks: REQUIRED.map(n => (n === 'smoke' ? { ...pass(n), exit: 1, result: 'fail' } : pass(n))) }));
  assert.match(mvpVerdict(line(GOOD) + line(failed), SHA, treeOf).error, /smoke did not pass/);
  assert.equal(mvpVerdict(line(failed) + line(GOOD), SHA, treeOf).record.digest, GOOD.digest);
});

// ---- the recovery branch (owner's MVP minimum, 2026-11-03) ----
const REC = 'recovery/forward', TIP = 'e'.repeat(40);
const refs = (map, ancestors = [[SHA, TIP]]) => ({ rev: ref => map[ref] ?? null, isAncestor: (a, b) => ancestors.some(([x, y]) => x === a && y === b) });

test('recovery: the branch must exist on rabbit-hole and its tip must be a strict descendant of the release commit', () => {
  assert.deepEqual(checkRecovery(SHA, REC, refs({ [`refs/remotes/rabbit-hole/${REC}`]: TIP })), { tip: TIP });
  assert.deepEqual(checkRecovery(SHA, REC, refs({ [`refs/remotes/origin/${REC}`]: TIP })), { tip: TIP }, 'in the workflow checkout the remote is origin');
  assert.match(checkRecovery(SHA, REC, refs({})).error, /branch recovery\/forward is not on rabbit-hole \(push it, then git fetch rabbit-hole recovery\/forward\)/, 'missing branch');
  assert.match(checkRecovery(SHA, REC, refs({ [`refs/remotes/rabbit-hole/${REC}`]: TIP }, [])).error, /does not contain 42f5a4f0 as an ancestor/, 'a branch that does not contain the sha');
  assert.match(checkRecovery(SHA, REC, refs({ [`refs/remotes/rabbit-hole/${REC}`]: SHA }, [[SHA, SHA]])).error, /at the release commit itself/, 'a branch at the sha carries no recovery');
  for (const name of ['main', 'dev', '', undefined, 'a..b', 'x/', '-x', 'a b', 'x.lock']) assert.ok(checkRecovery(SHA, name, refs({ 'refs/remotes/rabbit-hole/main': TIP, 'refs/remotes/rabbit-hole/dev': TIP })).error, String(name));
});

test('recovery: a record without a recovery branch is refused, and so is one whose branch is no longer a descendant', () => {
  const good = tip => name => checkRecovery(SHA, name, refs({ [`refs/remotes/rabbit-hole/${REC}`]: tip }));
  const rec = makeRecord(parts({ recovery: { branch: REC, tip: TIP } }));
  assert.ok(mvpVerdict(line(rec), SHA, treeOf, good(TIP)).record, 'valid');
  assert.ok(mvpVerdict(line(rec), SHA, treeOf).record, 'without a live look only the record\'s claim is checked');
  assert.equal(mvpVerdict(line(rec), SHA, treeOf, good(TIP)).record.recovery.branch, REC);
  const { recovery: _, ...bare } = parts();
  for (const [why, r] of [['no field', makeRecord(bare)], ['no branch', makeRecord(parts({ recovery: { tip: TIP } }))], ['no tip', makeRecord(parts({ recovery: { branch: REC } }))],
    ['bad tip', makeRecord(parts({ recovery: { branch: REC, tip: 'abc' } }))], ['not an object', makeRecord(parts({ recovery: 'recovery/x' }))]]) {
    assert.match(mvpVerdict(line(r), SHA, treeOf, good(TIP)).error, /the record names no recovery branch \(the owner's MVP minimum: preview --mvp ... --recovery <branch>\)/, why);
  }
  assert.match(mvpVerdict(line(rec), SHA, treeOf, name => checkRecovery(SHA, name, refs({}))).error, /is not on rabbit-hole/, 'the branch was deleted since');
  assert.match(mvpVerdict(line(rec), SHA, treeOf, name => checkRecovery(SHA, name, refs({ [`refs/remotes/rabbit-hole/${REC}`]: TIP }, []))).error, /does not contain/, 'the branch was rewritten since');
  assert.match(mvpVerdict(line({ ...rec, recovery: { branch: 'other', tip: TIP } }), SHA, treeOf).error, /digest/, 'an edited recovery field');
});

test('the account constant matches the release job, so a record never names another account', () => {
  assert.equal(GOOD.targets.account, ACCOUNT);
});

// ---- the affected tests ----
const T = (...p) => new Map(p.map(([path, text]) => [path, text]));
const web = SUITES[0];

test('affected tests: a changed test runs itself, a changed module runs the tests that import it', () => {
  const tests = T(['packages/web/src/a/card.test.mjs', "import { x } from './card.js';"], ['packages/web/src/b/other.test.mjs', "import y from '../a/card.js'; import z from './unrelated.js'"],
    ['packages/web/src/c/none.test.mjs', "import q from './cardinal.js'"]);
  const [w] = affectedTests(['packages/web/src/a/card.js'], tests);
  assert.deepEqual(w.ran, ['packages/web/src/a/card.test.mjs', 'packages/web/src/b/other.test.mjs'], 'a name that merely starts alike is not an import');
  assert.deepEqual(w.args, ['--test', 'src/a/card.test.mjs', 'src/b/other.test.mjs']);
  assert.equal(w.cwd, 'packages/web');
  assert.deepEqual(affectedTests(['packages/web/src/c/none.test.mjs'], tests)[0].ran, ['packages/web/src/c/none.test.mjs']);
});

test('affected tests: a code change that no test imports runs the whole suite, never zero tests, and says what was uncovered', () => {
  const [w] = affectedTests(['packages/web/src/lonely/view.jsx'], T(['packages/web/src/a.test.mjs', "import './b.js'"]));
  assert.deepEqual(w.args, web.all);
  assert.deepEqual(w.ran, ['all packages/web']);
  assert.deepEqual(w.uncovered, ['packages/web/src/lonely/view.jsx']);
  const [mixed] = affectedTests(['packages/web/src/a.js', 'packages/web/src/lonely/view.jsx'], T(['packages/web/src/a.test.mjs', "import './a.js'"]));
  assert.deepEqual(mixed.ran, ['packages/web/src/a.test.mjs'], 'some coverage: those tests run');
  assert.deepEqual(mixed.uncovered, ['packages/web/src/lonely/view.jsx'], 'and the gap is on the record');
});

test('affected tests: control-plane and script changes find their suites, docs and browser checks select none', () => {
  const tests = T(['packages/control-plane/test/ask.test.js', "import { ask } from '../src/ask.js'"], ['scripts/prod-release.test.mjs', "import { checkPrepare } from './prod-release.mjs'"]);
  const out = affectedTests(['packages/control-plane/src/ask.js', 'scripts/prod-release.mjs', 'docs/features/x.md', 'packages/web/e2e/card-check.mjs', 'CLAUDE.md'], tests);
  assert.deepEqual(out.map(s => [s.cwd, s.ran]), [['packages/control-plane', ['packages/control-plane/test/ask.test.js']], ['.', ['scripts/prod-release.test.mjs']]]);
  assert.deepEqual(out[0].args, ['--test', 'test/ask.test.js']);
  assert.deepEqual(affectedTests(['docs/features/x.md', 'packages/web/e2e/card-check.mjs', 'packages/web/public/a.png'], tests), []);
});

// ---- the preview launcher ----
const fake = (exits = {}, calls = []) => ({
  calls,
  build: async () => { calls.push('build'); return { exit: exits.build ?? 0, cmd: 'vite build', build: 'b1b1b1b1b1b1' }; },
  tests: async () => { calls.push('tests'); return { exit: exits.tests ?? 0, cmd: 'node --test', ran: ['a.test.mjs'] }; },
  smoke: async () => { calls.push('smoke'); return { exit: exits.smoke ?? 0, cmd: 'node smoke.mjs' }; },
  deploy: async () => { calls.push('deploy'); if (exits.deploy === 'throw') throw new Error('wrangler failed'); return { exit: exits.deploy ?? 0, cmd: 'wrangler deploy', version: 'v1' }; },
});
const flow = (io, over = {}) => runPreview({ sha: SHA, tree: TREE, base: 'a'.repeat(40), worker: 'rabbit-hole-web-dev-x', recovery: { branch: 'recovery/x', tip: 'd'.repeat(40) }, now: () => new Date('2026-11-03T10:00:00Z'), ...over }, io);

test('preview: build, affected tests and smoke run in order, then the clone deploys, and the record is what production accepts', async () => {
  const io = fake();
  const rec = await flow(io);
  assert.deepEqual(io.calls, ['build', 'tests', 'smoke', 'deploy']);
  assert.deepEqual(rec.checks.map(c => c.name), REQUIRED);
  assert.deepEqual([rec.version, rec.build, rec.targets.url], ['v1', 'b1b1b1b1b1b1', 'https://rabbit-hole-web-dev-x.tryrabbithole.workers.dev']);
  assert.deepEqual(rec.checks[1].ran, ['a.test.mjs'], 'the tests actually run are on the record');
  assert.ok(mvpVerdict(line(rec), SHA, treeOf).record);
});

test('preview: a failed build, test or smoke stops the run, deploys nothing and leaves a record production rejects', async () => {
  for (const [failing, check, expectCalls] of [['build', 'build', ['build']], ['tests', 'affected-tests', ['build', 'tests']], ['smoke', 'smoke', ['build', 'tests', 'smoke']]]) {
    const io = fake({ [failing]: 1 });
    const rec = await flow(io);
    assert.deepEqual(io.calls, expectCalls, `${failing}: nothing after it runs, and no deploy`);
    assert.equal(rec.checks.at(-1).result, 'fail');
    assert.match(mvpVerdict(line(rec), SHA, treeOf).error, new RegExp(`required check ${check} did not pass \\(exit 1\\)`), failing);
    assert.equal(rec.broad_ci, 'bypassed');
  }
});

test('preview: a deploy that throws or does not serve the new build is a failed required check; --no-deploy is never acceptable', async () => {
  for (const deploy of ['throw', 1]) {
    const rec = await flow(fake({ deploy }));
    assert.equal(rec.checks.at(-1).name, 'preview');
    assert.match(mvpVerdict(line(rec), SHA, treeOf).error, /required check preview did not pass/);
  }
  const io = fake();
  const dry = await flow(io, { deploy: false });
  assert.deepEqual(io.calls, ['build', 'tests', 'smoke']);
  assert.match(mvpVerdict(line(dry), SHA, treeOf).error, /required check preview is missing/);
});

test('preview arguments: --mvp is required, the target is your own clone, never the stable preview or production', () => {
  const ok = ['--mvp', '--sha', SHA, '--smoke', 'node smoke.mjs', '--recovery', 'recovery/x'];
  assert.deepEqual(previewArgs(ok, 'mvp-fast-path'), { mvp: true, sha: SHA, smoke: ['node smoke.mjs'], recovery: 'recovery/x', deploy: true, worker: 'rabbit-hole-web-dev-mvp-fast-path' });
  assert.throws(() => previewArgs(ok.slice(0, -2), 'd'), /--recovery <branch> is required/);
  assert.deepEqual(previewArgs([...ok, '--smoke', 'curl x', '--no-deploy', '--worker', 'rabbit-hole-web-dev-y', '--base', 'main'], 'd'), { mvp: true, sha: SHA, smoke: ['node smoke.mjs', 'curl x'], recovery: 'recovery/x', deploy: false, worker: 'rabbit-hole-web-dev-y', base: 'main' });
  assert.throws(() => previewArgs(ok.slice(1), 'd'), /--mvp is required/);
  assert.throws(() => previewArgs(['--mvp', '--smoke', 'x'], 'd'), /full 40-character/);
  assert.throws(() => previewArgs(['--mvp', '--sha', SHA, '--recovery', 'r/x'], 'd'), /--smoke/);
  assert.throws(() => previewArgs([...ok, '--worker', 'rabbit-hole-web-dev-small-parallel'], 'd'), /never an MVP target/);
  for (const w of ['rabbit-hole-app', 'rabbit-hole-cp-dev', 'small-cp-dev', 'rabbit-hole-cp']) assert.throws(() => previewArgs([...ok, '--worker', w], 'd'), /never an MVP target/, w);
  assert.throws(() => previewArgs([...ok, '--frobnicate'], 'd'), /unknown argument/);
});

test('the launcher without --mvp refuses before touching git, the network or a build', () => {
  const script = fileURLToPath(new URL('./mvp-fast-path.mjs', import.meta.url));
  const r = (() => { try { execFileSync(process.execPath, [script, 'preview', '--sha', SHA, '--smoke', 'true'], { env: {}, encoding: 'utf8', stdio: 'pipe' }); return { status: 0 }; } catch (e) { return e; } })();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--mvp is required/);
});

// ---- verify: the check the owner's release launcher uses ----
test('verify: the arguments, and exit 0 only for a record production would accept, its recovery branch included (this checkout\'s own HEAD)', () => {
  assert.deepEqual(verifyArgs(['--sha', SHA, '--json', '--fetch', '--record', 'x.jsonl']), { sha: SHA, json: true, fetch: true, record: 'x.jsonl' });
  assert.throws(() => verifyArgs(['--json']), /full 40-character/);
  assert.throws(() => verifyArgs(['--sha', SHA, '--nope']), /unknown argument/);
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.test', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.test' };
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8', cwd, env }).trim();
  const head = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}');
  // A real recovery branch for the live look: a child of HEAD under a throwaway remote-tracking name, removed in the finally.
  const branch = `recovery/verify-test-${process.pid}`, ref = `refs/remotes/rabbit-hole/${branch}`;
  const dir = mkdtempSync(join(tmpdir(), 'mvp-verify-'));
  const script = fileURLToPath(new URL('./mvp-fast-path.mjs', import.meta.url));
  const verify = (record, ...more) => {
    const file = join(dir, 'record.jsonl'); writeFileSync(file, record);
    try { return { status: 0, stdout: execFileSync(process.execPath, [script, 'verify', '--sha', head, '--record', file, ...more], { encoding: 'utf8', stdio: 'pipe' }) }; } catch (e) { return e; }
  };
  const child = git('commit-tree', tree, '-p', head, '-m', 'recovery');
  git('update-ref', ref, child);
  try {
    const good = makeRecord(parts({ sha: head, tree, recovery: { branch, tip: child } }));
    const ok = verify(line(good));
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, new RegExp(`^✓ MVP record [0-9a-f]{16} for [0-9a-f]{8}: build pass, affected-tests pass, smoke pass, preview pass; rabbit-hole-web-dev-mvp-fast-path; recovery ${branch}; broad CI and the release gate bypassed`));
    assert.equal(JSON.parse(verify(line(good), '--json').stdout).digest, good.digest, '--json prints the record line');
    const failed = verify(line(makeRecord(parts({ sha: head, tree, recovery: good.recovery, checks: REQUIRED.map(n => (n === 'smoke' ? { ...pass(n), exit: 1, result: 'fail' } : pass(n))) }))));
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /required check smoke did not pass \(exit 1\)/);
    assert.equal(verify(line(makeRecord(parts({ sha: head, tree: 'f'.repeat(40), recovery: good.recovery })))).status, 1, 'another tree');
    assert.equal(verify(line({ ...good, build: 'c2c2c2c2c2c2' })).status, 1, 'edited');
    assert.equal(verify('').status, 1, 'no record');
    // the recovery branch: missing from the record, absent from rabbit-hole, or not containing the commit
    const { recovery: _, ...noRecovery } = parts({ sha: head, tree });
    assert.match(verify(line(makeRecord(noRecovery))).stderr, /names no recovery branch/);
    assert.match(verify(line(makeRecord(parts({ sha: head, tree, recovery: { branch: `${branch}-gone`, tip: child } })))).stderr, /is not on rabbit-hole/);
    git('update-ref', ref, git('commit-tree', tree, '-m', 'unrelated root'));
    assert.match(verify(line(good)).stderr, /does not contain [0-9a-f]{8} as an ancestor/, 'a branch that no longer contains the release commit');
  } finally { git('update-ref', '-d', ref); }
});
