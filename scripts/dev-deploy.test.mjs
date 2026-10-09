// scripts/dev-deploy.mjs decisions: only a passed gate for the exact tree deploys, and an older run never
// overwrites a newer deployment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gateVerdict, rerunVerdict, stageCount, GATE_STAGES, digest, deployedSha, decide, learnTables, servedSha, notReusable, entryScript, parseUpload, TEST_ONLY, UNIT_TEST, buildRecipe, CONFIRMATIONS, BRANCHES, HOST, URL_BASE, OLD_URL, WORKER } from './dev-deploy.mjs';

// The real integration gate record of r33 (INT33, main 7198b971, refs/notes/gates), untouched.
const TREE = '14e9b00578059a8ed8f9b261dbe93db10fb61df4';
const R33 = () => false; // 7198b971 carries no beta-stage check file
const INT33 = readFileSync(new URL('./fixtures/int33-gate.txt', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
// INT33 with the seven output changes the stricter attestation asks of the gate (r34 audit): a check count on every
// stage, rh-local's own tripwire line.
const PASSED = INT33
  .replace('bundle(dist) exit 0', 'bundle(dist) exit 0  6 checks passed')
  .replace('bundle(dist-dev) exit 0', 'bundle(dist-dev) exit 0  6 checks passed')
  .replace(/^(dive exit 0  all flows ok)/m, '$1; 5 checks passed')
  .replace(/^slash-sheet exit 0$/m, 'slash-sheet exit 0  11/11 checks passed')
  .replace(/^filedrop exit 0$/m, 'filedrop exit 0  9/9 checks passed')
  .replace(/^(tutor-slice exit 0 .*)$/m, '$1; 20 checks passed')
  .replace(/^rh-local exit 0/m, 'rh-local provider-tripwire hits: 0\nrh-local exit 0');

test('a finished gate with every stage at exit 0 and no provider traffic passes for its own tree', () => {
  assert.equal(gateVerdict(PASSED, TREE, R33), null);
  assert.equal(gateVerdict(PASSED.replace(/\n/g, '\r\n'), TREE, R33), null, 'CRLF records too');
  assert.equal(gateVerdict(`fatal: Needed a single revision\n${PASSED}`, TREE, R33), null, 'stderr before the tree line');
});

test('r34 audit: the real INT33 record is refused on exactly its attestation gaps, a bare tree/unit/DONE record on every stage', () => {
  const gaps = gateVerdict(INT33, TREE, R33);
  assert.match(gaps, /^the gate record does not attest: /);
  assert.deepEqual(gaps.replace(/^[^:]+: /, '').split('; ').map(g => g.split(':')[0]).sort(),
    ['bundle(dist)', 'bundle(dist-dev)', 'dive', 'filedrop', 'rh-local', 'slash-sheet', 'tutor-slice']);
  const bare = `tree HEAD x index ${TREE}\nmake test-unit exit 0  ℹ tests 9 ℹ fail 0\nmodel key bindings in app log: 0\nX-DONE\n`;
  assert.equal(gateVerdict(bare, TREE, R33).split('; ').filter(g => /not in the record/.test(g)).length, GATE_STAGES.filter(s => !s.check).length - 1);
});

test('every required stage needs a positive count and, for a browser stage, its own zero tripwire line', () => {
  for (const { stage, tripwire } of GATE_STAGES.filter(s => !s.check)) {
    const line = PASSED.split('\n').findLast(l => l.startsWith(`${stage} exit 0`));
    assert.ok(line, stage);
    assert.match(gateVerdict(PASSED.replace(line, `${stage} exit 0`), TREE, R33), new RegExp(`${stage.replace(/[()]/g, '\\$&')}: no positive check count`), `${stage} without a count`);
    if (tripwire) assert.match(gateVerdict(PASSED.replaceAll(`${tripwire} provider-tripwire hits: 0\n`, ''), TREE, R33), new RegExp(`no "${tripwire} provider-tripwire hits: 0" line`), `${stage} without its tripwire`);
  }
  assert.match(gateVerdict(PASSED.replace('model key bindings in app log: 0\n', ''), TREE, R33), /no "model key bindings in app log: 0" line/);
  assert.match(gateVerdict(PASSED.replace('rh-app exit 0  18/18 checks passed', 'rh-app exit 0  0/0 checks passed'), TREE, R33), /rh-app: no positive check count/, 'zero checks is no check');
});

test('a beta stage is required from the release whose tree carries its check, and never before', () => {
  const beta = GATE_STAGES.filter(s => s.check);
  assert.ok(beta.some(s => s.stage === 'library-folders'));
  const withFolders = p => p === 'packages/web/e2e/library-folders-check.mjs';
  assert.match(gateVerdict(PASSED, TREE, withFolders), /library-folders: not in the record/);
  const folders = PASSED.replace(/INT33-DONE$/m, 'library-folders provider-tripwire hits: 0\nlibrary-folders exit 0  12/12 checks passed\nINT33-DONE');
  assert.equal(gateVerdict(folders, TREE, withFolders), null);
  assert.match(gateVerdict(PASSED, TREE), /library-folders: not in the record/, 'without the tree to ask, every stage is required');
});

test('check counts: passed totals only; any failure, a partial ratio or no number is 0', () => {
  assert.equal(stageCount('  ℹ tests 2220 ℹ fail 0 ℹ tests 1322 ℹ fail 0'), 3542);
  assert.equal(stageCount('  # pass 5 # fail 0'), 5);
  assert.equal(stageCount('  PASS 14/14 checks passed'), 14);
  assert.equal(stageCount('  comments-check: 22 checks passed'), 22);
  assert.equal(stageCount('  ok 18 FAIL 0  all checks passed'), 18);
  assert.equal(stageCount('  J1 PASS J2 PASS J3 PASS'), 3);
  for (const t of ['  17/18 checks passed', '  ℹ tests 3 ℹ fail 1', '  J1 PASS J2 FAIL', '  all flows ok', '', '  ok 4 FAIL 2']) assert.equal(stageCount(t), 0, t);
});

test('a gate record for another tree, unfinished, failed or with provider traffic never deploys', () => {
  assert.match(gateVerdict(PASSED, 'f'.repeat(40)), /not for tree/);
  assert.match(gateVerdict(PASSED.replace('INT33-DONE', ''), TREE, R33), /no -DONE/);
  assert.match(gateVerdict(PASSED.replace('rh-app exit 0', 'rh-app exit 1'), TREE, R33), /failed stages: rh-app/);
  assert.match(gateVerdict(PASSED.replace('card-context-menu exit 0', 'card-context-menu exit 2'), TREE, R33), /card-context-menu/, 'the rerun counts, and it failed');
  assert.match(gateVerdict(PASSED.replace('make test-unit exit 0', 'make test-unit exit 2'), TREE, R33), /make test-unit/);
  assert.match(gateVerdict(PASSED.replace(/make test-unit exit 0[^\n]*\n/, ''), TREE, R33), /make test-unit/, 'no unit run, no deploy');
  assert.match(gateVerdict(PASSED.replace('slice provider-tripwire hits: 0', 'slice provider-tripwire hits: 3'), TREE, R33), /tripwire/);
  assert.match(gateVerdict(PASSED.replace('model key bindings in app log: 0', 'model key bindings in app log: 1'), TREE, R33), /tripwire or model key/);
  assert.match(gateVerdict('', TREE, R33), /not for tree/);
});

test('the deployment message names the sha it serves, including after a rollback', () => {
  assert.equal(deployedSha('main 42f5a4f0 (gated tree 192b10f3)'), '42f5a4f0');
  assert.equal(deployedSha(`main ${'a'.repeat(40)} build 0123456789ab`), 'a'.repeat(40));
  assert.equal(deployedSha('rollback to main 42f5a4f0: smoke failed for 5973e3c0'), '42f5a4f0');
  assert.equal(deployedSha('manual hotfix'), null);
  assert.equal(deployedSha(undefined), null);
});

test('deploy only forward: same sha is a no-op, an older or diverged candidate is refused', () => {
  const sha = 'b'.repeat(40);
  assert.equal(decide({ candidate: sha, deployed: null, deployedIsAncestor: true }).action, 'deploy');
  assert.equal(decide({ candidate: sha, deployed: 'a'.repeat(40), deployedIsAncestor: true }).action, 'deploy');
  assert.equal(decide({ candidate: sha, deployed: sha, deployedIsAncestor: true }).action, 'noop');
  const older = decide({ candidate: sha, deployed: 'c'.repeat(40), deployedIsAncestor: false });
  assert.equal(older.action, 'refuse'); assert.match(older.why, /never overwrites a newer deployment/);
});

test('the Learn tables the smoke expects are exactly what the learn migrations create, prose comments ignored', () => {
  const repo = fileURLToPath(new URL('..', import.meta.url));
  const wanted = learnTables(repo);
  assert.ok(!wanted.includes('adds'), 'a comment in 0006 is not a table');
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../packages/control-plane/learn-migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const made = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
  assert.deepEqual(wanted.filter(t => !made.has(t)), [], 'every expected table exists once the migrations ran');
  assert.ok(['user_handles', 'canvas_publications', 'library_trash'].every(t => wanted.includes(t)));
});

test('the served sha comes from the version chain: secret versions inherit, rollbacks serve their version again', () => {
  // The real clone history to 2026-10-08, newest first, with each version's own annotations.
  const versions = {
    c5b0a07d: { trigger: 'upload', message: 'main 42f5a4f0 (gated tree 192b10f3)' },
    '0d4b3a6c': { trigger: 'secret' },
    b48e07aa: { trigger: 'version_upload', message: `main ${'e'.repeat(40)} build 5acc0f6ba69c` },
  };
  const d = id => ({ versions: [id] });
  const history = [d('c5b0a07d')];
  assert.equal(servedSha(history, versions), '42f5a4f0', 'the gated upload');
  history.unshift(d('0d4b3a6c'));
  assert.equal(servedSha(history, versions), '42f5a4f0', 'the Access secrets kept 42f5a4f0 code');
  history.unshift(d('b48e07aa'));
  assert.equal(servedSha(history, versions), 'e'.repeat(40), 'the e03a7a53 deploy');
  history.unshift(d('0d4b3a6c'));
  assert.equal(servedSha(history, versions), '42f5a4f0', 'the rollback to the secret version serves 42f5a4f0 again, whatever its message said');
  versions.f1 = { trigger: 'secret' };
  assert.equal(servedSha([d('f1'), ...history], versions), '42f5a4f0', 'a secret change after the rollback inherits the rollback');
  versions.h1 = { trigger: 'upload' };
  assert.equal(servedSha([d('h1'), ...history], versions), null, 'a hand upload without the message is unknown');
  assert.equal(servedSha([{ versions: ['b48e07aa', 'c5b0a07d'] }, ...history], versions), null, 'a split rollout is unknown');
  assert.equal(servedSha([], versions), null);
});

test('an unknown served commit refuses: forward-only cannot be checked against it', () => {
  const r = decide({ candidate: 'b'.repeat(40), deployed: null, deployedIsAncestor: true, hasDeployments: true });
  assert.equal(r.action, 'refuse'); assert.match(r.why, /unknown/);
  assert.equal(decide({ candidate: 'b'.repeat(40), deployed: null, deployedIsAncestor: true, hasDeployments: false }).action, 'deploy', 'a first deploy');
});

test('policy A: only docs and the deploy and release scripts reuse a gate; app, deps, config, schema and lesson Markdown do not', () => {
  assert.deepEqual(notReusable(['docs/features/dev-auto-deploy.md', 'CLAUDE.md', 'scripts/dev-deploy.mjs', 'scripts/dev-deploy.test.mjs', 'scripts/prod-release.mjs', 'scripts/prod-release.test.mjs',
    'scripts/dev-deploy-gate.mjs', 'scripts/ensure-natives.mjs', '.github/workflows/deploy-dev.yml', '.github/workflows/deploy-prod.yml']), [], 'release scripts and workflows (owner, 2026-10-09)');
  const app = ['packages/web/src/App.jsx', 'packages/web/package-lock.json', 'packages/web/wrangler.dev.jsonc', 'packages/control-plane/learn-migrations/0011-x.sql',
    'packages/web/dev-access-worker.js', 'packages/web/src/lessons/nanogpt.md', 'run.sh', 'scripts/rabbit-hole-dev-verify.mjs', 'packages/web/vite.config.js'];
  assert.deepEqual(notReusable(app), app);
});

test('the smoke waits for the built entry script, in the form the dev build emits it', () => {
  // dist-dev/index.html of main e03a7a53 (2026-10-08): the first automated run looked for /assets/ and smoked "undefined".
  assert.equal(entryScript('<head><script type="module" crossorigin src="/static/app-BHJe2RiW.js"></script>'), '/static/app-BHJe2RiW.js');
  assert.equal(entryScript('<script src="/static/legacy.js"></script>'), null, 'only the module entry');
  assert.equal(entryScript('<html></html>'), null);
});

test('the deploy uses only this commit: lockfile install, both page builds, pinned tools, no shell', () => {
  // A deploy from a fresh checkout (2026-10-08) failed to bundle: no dist/index.html, no jose, and npx fetched an unpinned wrangler.
  const src = readFileSync(new URL('./dev-deploy.mjs', import.meta.url), 'utf8');
  assert.match(src, /execSync\('npm ci --no-audit --no-fund', \{ cwd: root/);
  assert.match(src, /for \(const outDir of \['dist', 'dist-dev'\]\)/);
  assert.ok(!/execFileSync\('npx'/.test(src) && !/shell: true/.test(src), 'no npx, no shell');
  assert.ok(!/`"(main|rollback)/.test(src), 'messages are plain arguments, not shell-quoted');
  assert.match(src, /readFileSync\(join\(web, 'dist\/index\.html'\)\)\.equals\(readFileSync\(join\(web, 'dist-dev\/index\.html'\)\)\)/, 'both page builds share one index.html');
  assert.match(src, /git\('diff', '--name-only', 'HEAD'\)/, 'clean means clean content: npm ci line-ending rewrites do not block the next run');
});

test('pages and the packaged Worker have separate identities, both recorded and both compared on reuse', () => {
  // The page hash covers no Worker code (owner, 2026-10-08): the Worker bundle gets its own hash.
  const src = readFileSync(new URL('./dev-deploy.mjs', import.meta.url), 'utf8');
  assert.match(src, /'--dry-run', '--outdir', out\]/, 'the bundle hash is of wrangler\'s own bundle');
  assert.match(src, /`main \$\{sha\} build \$\{build\} bundle \$\{bundle\}`/, 'the upload message names both');
  assert.match(src, /\{ sha, tree: git\('rev-parse', `\$\{sha\}\^\{tree\}`\), \.\.\.gates, gate_digest: digest\(gateText\), build, bundle, smoke: smokeVerdict, worker: WORKER, version, run,/, 'the dev record names both, with its provenance');
  assert.equal(digest('a\r\nb\n'), digest('a\nb\n'), 'a gate note digests the same from a CRLF checkout');
  assert.match(src, /gatedId\?\.bundle && bundle !== gatedId\.bundle/, 'reuse refuses a different Worker bundle');
  const sha = 'a'.repeat(40);
  assert.deepEqual(parseUpload(`main ${sha} build 5acc0f6ba69c bundle 8c409f557e70`), { sha, build: '5acc0f6ba69c', bundle: '8c409f557e70' });
  assert.deepEqual(parseUpload(`main ${sha} build 5acc0f6ba69c`), { sha, build: '5acc0f6ba69c', bundle: null }, 'deploys before 2026-10-08 recorded pages only');
  assert.equal(parseUpload('main 42f5a4f0 (gated tree 192b10f3)'), null);
  assert.equal(deployedSha(`main ${sha} build 5acc0f6ba69c bundle 8c409f557e70`), sha, 'forward-only still reads the sha');
});

test('a full gate plus a rerun of what changed after it: every failed stage must pass again, nothing else may fail', () => {
  // int24 on af22a1f8 failed only cross-device (a check bug); int24b reran cross-device alone on b7e17af8 (2026-10-08).
  const RTREE = '4499528a' + '0'.repeat(32);
  const gate = PASSED.replace('cross-device exit 0  13/13 checks passed', 'cross-device exit 1  check bug');
  const rerun = `tree HEAD b7e17af8 MERGE_HEAD  index ${RTREE}\ncross-device provider-tripwire hits: 0\ncross-device exit 0  9/9 checks passed\nINT24B-DONE\n`;
  assert.equal(rerunVerdict(gate, TREE, rerun, RTREE, { inTree: R33 }), null);
  assert.match(rerunVerdict(gate, TREE, rerun.replace('cross-device exit 0  9/9 checks passed', 'cross-device exit 0'), RTREE, { inTree: R33 }), /do not attest: cross-device: no positive check count/, 'the rerun attests what it reran');
  assert.match(rerunVerdict(gate.replace(/^dive exit 0.*$/m, 'dive exit 0'), TREE, rerun, RTREE, { inTree: R33 }), /dive: no positive check count/, 'the gate still attests the rest');
  assert.match(rerunVerdict(gate.replace('rh-app exit 0', 'rh-app exit 1'), TREE, rerun, RTREE, { inTree: R33 }), /rh-app and the rerun did not pass it/, 'a failure the rerun did not cover');
  assert.match(rerunVerdict(gate, TREE, rerun.replace('cross-device exit 0', 'cross-device exit 2'), RTREE, { inTree: R33 }), /rerun: failed stages: cross-device/);
  assert.match(rerunVerdict(gate, TREE, rerun.replace('INT24B-DONE\n', ''), RTREE, { inTree: R33 }), /rerun: .*no -DONE/);
  assert.match(rerunVerdict(gate, TREE, rerun, 'f'.repeat(40)), /rerun: the gate record is not for tree/);
  assert.match(rerunVerdict(gate, TREE, rerun.replace('hits: 0', 'hits: 2'), RTREE, { inTree: R33 }), /rerun: provider tripwire/);
  assert.match(rerunVerdict(gate, TREE, 'tree HEAD x MERGE_HEAD  index ' + RTREE + '\nX-DONE\n', RTREE, { inTree: R33 }), /ran no stage/);
  assert.match(rerunVerdict(gate, TREE, rerun, RTREE, { unitChanged: true, inTree: R33 }), /must run make test-unit/, 'changed unit tests need the unit run again');
  assert.equal(gateVerdict(gate, TREE, R33) !== null, true, 'the gate alone still refuses');
});

test('rerun paths: only tests may change between the gate and the rerun; only docs and deploy scripts after it', () => {
  const test = p => TEST_ONLY.some(r => r.test(p));
  for (const p of ['packages/web/e2e/cross-device-check.mjs', 'tests/evals/tutor-session/a.test.mjs', 'packages/control-plane/test/x.test.js', 'packages/web/src/foo.test.mjs']) assert.ok(test(p), p);
  for (const p of ['packages/web/src/App.jsx', 'packages/web/e2e-helpers.js', 'packages/control-plane/src/test-utils.js', 'run.sh']) assert.ok(!test(p), p);
  assert.ok(UNIT_TEST.test('packages/control-plane/test/x.test.js') && !UNIT_TEST.test('packages/web/e2e/cross-device-check.mjs'));
});

test('the build recipe is the install, the build env, both builds and the entry; comments and its own definition do not count', () => {
  const src = readFileSync(new URL('./dev-deploy.mjs', import.meta.url), 'utf8');
  const recipe = buildRecipe(src).split('\n');
  assert.equal(recipe.length, 5);
  assert.ok(recipe.some(l => l.includes("npm ci")) && recipe.some(l => l.includes('VITE_COACHING_DEV')) && recipe.some(l => l.includes("['dist', 'dist-dev']")));
  assert.notEqual(buildRecipe(src.replace("VITE_BYOC_DEV: 'true'", "VITE_BYOC_DEV: 'false'")), buildRecipe(src), 'a build env change is a recipe change');
  assert.equal(buildRecipe(src + '\n// npm ci comment\n'), buildRecipe(src));
});

test('a failed stage\'s unreadable tripwire count in the gate is replaced only by a readable 0 for that stage in the rerun', () => {
  // int24 (2026-10-08): cross-device crashed its stack, so its count read "unreadable"; int24b reran it with 0 hits.
  const RTREE = '4499528a' + '0'.repeat(32);
  const gate = PASSED.replace('cross-device provider-tripwire hits: 0\ncross-device exit 0  13/13 checks passed', 'cross-device provider-tripwire hits: unreadable\ncross-device exit 1');
  const rerun = `tree HEAD b7e17af8 MERGE_HEAD  index ${RTREE}\ncross-device provider-tripwire hits: 0\ncross-device exit 0  13/13 checks passed\nINT24B-DONE\n`;
  assert.equal(rerunVerdict(gate, TREE, rerun, RTREE, { inTree: R33 }), null);
  assert.match(gateVerdict(gate, TREE, R33), /not 0: cross-device:unreadable/, 'never enough on its own');
  assert.match(rerunVerdict(gate, TREE, rerun.replace('cross-device provider-tripwire hits: 0\n', ''), RTREE, { inTree: R33 }), /gate: provider tripwire .*cross-device:unreadable/, 'the rerun must measure that stage again');
  assert.match(rerunVerdict(gate.replace('journey provider-tripwire hits: 0', 'journey provider-tripwire hits: unreadable'), TREE, rerun, RTREE, { inTree: R33 }), /gate: .*journey:unreadable/, 'a stage that passed keeps its own count');
  assert.match(rerunVerdict(gate.replace('model key bindings in app log: 0', 'model key bindings in app log: 1'), TREE, rerun, RTREE, { inTree: R33 }), /gate: .*app:1/, 'app-wide counts are never replaced');
  assert.match(rerunVerdict(gate, TREE, rerun.replace('hits: 0', 'hits: 1'), RTREE, { inTree: R33 }), /rerun: provider tripwire .*cross-device:1/);
});

test('the smoke waits for several consecutive serves of the new build, not one', () => {
  // 2026-10-08: twice, one /library hit showed the new entry while / still came from the old version.
  const src = readFileSync(new URL('./dev-deploy.mjs', import.meta.url), 'utf8');
  assert.ok(CONFIRMATIONS >= 3);
  assert.match(src, /served = streak >= CONFIRMATIONS/);
  assert.match(src, /\? streak \+ 1 : 0/, 'a miss resets the streak');
});

test('the dev workflow: a push to dev only, its gate note required, secrets only in the dev-preview environment, pinned actions', () => {
  assert.deepEqual(BRANCHES, ['origin/main', 'rabbit-hole/dev']);
  const wf = readFileSync(new URL('../.github/workflows/deploy-dev.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n'); // CRLF checkouts
  assert.match(wf, /on:\n  push:\n    branches: \[dev\]\n/, 'push to dev is the only trigger');
  assert.doesNotMatch(wf, /pull_request|workflow_run|issue_comment/, 'nothing a fork can start');
  assert.match(wf, /environment: dev-preview\n/);
  assert.match(wf, /if: github\.repository == 'Rabbit-Hole-App\/Rabbit-Hole'/);
  assert.match(wf, /notes --ref=gates show "\$GITHUB_SHA"/);
  assert.match(wf, /test -s "\$RUNNER_TEMP\/gate\.log" \|\| \{[^}]*exit 1; \}/, 'no gate note, no deploy');
  assert.match(wf, /dev-deploy-gate\.mjs --sha "\$GITHUB_SHA" --gate "\$RUNNER_TEMP\/gate\.log" --dev-deploys dev-deploys --verify "\$RUNNER_TEMP\/verify\.json"\n/, 'the gates note decides full or reuse, never the workflow; the verify note is required');
  assert.match(wf, /test -s "\$RUNNER_TEMP\/verify\.json" \|\| \{[^}]*exit 1; \}/, 'no verify evidence, no deploy (r34 audit)');
  assert.match(wf, /seq 1 60\)[\s\S]*notes --ref=verify show "\$GITHUB_SHA"/, 'it waits for the verify run started by the same push');
  assert.doesNotMatch(wf, /--reuse|prod-release|wrangler deploy/, 'dev only, through dev-deploy');
  const gate = readFileSync(new URL('./dev-deploy-gate.mjs', import.meta.url), 'utf8');
  assert.match(gate, /'--branch', 'rabbit-hole\/dev'\]/);
  for (const uses of wf.match(/uses: \S+/g)) assert.match(uses, /@[0-9a-f]{40}$/, `${uses} is pinned to a commit`);
});

test('the preview lives on its own host, every deploy keeps that custom domain, and the smoke checks the old host serves nothing', () => {
  // Owner, 2026-10-08: share links must not carry the worker name; the old host is removed, not redirected.
  assert.equal(HOST, 'preview.digrabbithole.com');
  assert.equal(URL_BASE, `https://${HOST}`);
  assert.equal(OLD_URL, `https://${WORKER}.tryrabbithole.workers.dev`);
  const src = readFileSync(new URL('./dev-deploy.mjs', import.meta.url), 'utf8');
  assert.match(src, /'deploy', 'dev-access-worker\.js', '--config', 'wrangler\.dev\.jsonc', '--name', WORKER, '--domain', HOST, '--message'/);
  assert.match(src, /fetch\(`\$\{OLD_URL\}\/library`, \{ redirect: 'manual', headers: \{ \.\.\.UA, \.\.\.token \} \}\)/, 'probed with the smoke credentials');
  assert.match(src, /old\.status === 403 \? 'pass' : 'fail'/);
});

test('natives: on the Linux runner the glibc x64 builds the Windows lockfile left out are found per parent, nothing else', async () => {
  // Run 37880756033 (2026-10-08): npm ci on ubuntu had only @rolldown/binding-win32-x64-msvc, and vite could not load rolldown.
  const { missingNatives, forThisMachine } = await import('./ensure-natives.mjs');
  const linux = { platform: 'linux', arch: 'x64', musl: false };
  const packages = {
    'node_modules/rolldown': { version: '1.2.7', optionalDependencies: { '@rolldown/binding-linux-x64-gnu': '1.2.7', '@rolldown/binding-linux-x64-musl': '1.2.7', '@rolldown/binding-linux-arm64-gnu': '1.2.7', '@rolldown/binding-win32-x64-msvc': '1.2.7', '@rolldown/binding-darwin-x64': '1.2.7', '@rolldown/binding-wasm32-wasi': '1.2.7' } },
    'node_modules/lightningcss': { version: '1.32.0', optionalDependencies: { 'lightningcss-linux-x64-gnu': '1.32.0' } },
    'node_modules/vite/node_modules/lightningcss': { version: '1.33.0', optionalDependencies: { 'lightningcss-linux-x64-gnu': '1.33.0' } },
    'node_modules/miniflare/node_modules/workerd': { version: '1.2', optionalDependencies: { '@cloudflare/workerd-linux-64': '1.2', '@cloudflare/workerd-linux-arm64': '1.2' } },
    'node_modules/esbuild': { version: '0.25.0', optionalDependencies: { '@esbuild/linux-x64': '0.25.0' } },
  };
  const installed = new Set(['node_modules/esbuild:@esbuild/linux-x64']);
  const found = missingNatives(packages, (dir, name) => installed.has(`${dir}:${name}`), linux);
  assert.deepEqual(found.map(m => `${m.dir} ${m.name}@${m.version}`), [
    'node_modules/rolldown @rolldown/binding-linux-x64-gnu@1.2.7',
    'node_modules/lightningcss lightningcss-linux-x64-gnu@1.32.0',
    'node_modules/vite/node_modules/lightningcss lightningcss-linux-x64-gnu@1.33.0',
    'node_modules/miniflare/node_modules/workerd @cloudflare/workerd-linux-64@1.2',
  ], 'each parent gets its own pinned build; musl, arm64, wasm, other OSes and installed ones are left alone');
  assert.ok(forThisMachine('@rolldown/binding-win32-x64-msvc', { platform: 'win32', arch: 'x64', musl: false }), 'on Windows the Windows build is the one it would want');
  assert.ok(forThisMachine('@rolldown/binding-linux-x64-musl', { platform: 'linux', arch: 'x64', musl: true }));
});

test('gates note: a full record deploys as before; "reuse <G>" needs G\'s own gates note and a green dev deploy of G', async () => {
  // Owner, 2026-10-09: reuse a gate for script-only changes on the Actions path too.
  const { parseGatesNote, gatePlan, greenDev } = await import('./dev-deploy-gate.mjs');
  const G = 'a'.repeat(40), OTHER = 'b'.repeat(40);
  assert.deepEqual(parseGatesNote('tree HEAD x index y\nINT9-DONE\n'), { full: 'tree HEAD x index y\nINT9-DONE\n' });
  assert.deepEqual(parseGatesNote(`reuse ${G}\n`), { reuse: G, rerun: null });
  assert.deepEqual(parseGatesNote(`reuse ${G}\r\ntree HEAD c index t\nR-DONE\n`), { reuse: G, rerun: 'tree HEAD c index t\nR-DONE\n' });
  assert.deepEqual(parseGatesNote(`reuse ${G.slice(0, 8)}\n`).full, `reuse ${G.slice(0, 8)}\n`, 'a short sha is not a reuse line: dev-deploy then rejects it as a gate record');
  const green = `${JSON.stringify({ sha: G, gates: 'pass', smoke: 'pass', build: 'b1', version: 'v1' })}\n`;
  assert.deepEqual(gatePlan({ note: 'full record' }), { full: true });
  assert.match(gatePlan({ note: `reuse ${G}\n`, gNote: '', gDev: green }).refuse, /no gates note of its own/, 'missing G note: refused');
  assert.match(gatePlan({ note: `reuse ${G}\n`, gNote: 'G record', gDev: '' }).refuse, /no green dev deploy/, 'G never deployed: refused');
  for (const bad of [{ gates: 'reused', smoke: 'pass' }, { gates: 'pass', smoke: 'fail' }, { gates: 'pass', smoke: 'blocked' }])
    assert.match(gatePlan({ note: `reuse ${G}\n`, gNote: 'G record', gDev: `${JSON.stringify({ sha: G, ...bad })}\n` }).refuse, /no green dev deploy/, JSON.stringify(bad));
  assert.match(gatePlan({ note: `reuse ${G}\n`, gNote: 'G record', gDev: `${JSON.stringify({ sha: OTHER, gates: 'pass', smoke: 'pass' })}\n` }).refuse, /no green dev deploy/, 'another commit\'s deploy is not G\'s');
  const ok = gatePlan({ note: `reuse ${G}\ntree HEAD c index t\nR-DONE\n`, gNote: 'G record', gDev: green });
  assert.equal(ok.reuse, G); assert.equal(ok.rerun, 'tree HEAD c index t\nR-DONE\n'); assert.equal(ok.seed.build, 'b1');
  assert.equal(greenDev(green, G).version, 'v1');
  // The rest is dev-deploy.mjs's, unchanged: G must be an ancestor and every change reusable (or tested, with a rerun).
  const src = readFileSync(new URL('./dev-deploy.mjs', import.meta.url), 'utf8');
  assert.match(src, /if \(!isAncestor\(reuse, sha\)\) stop\(`the gated \$\{reuse\.slice\(0, 8\)\} is not an ancestor/);
  assert.match(src, /const outside = notReusable\(changed\);\s+if \(outside\.length\) stop\(/);
});
