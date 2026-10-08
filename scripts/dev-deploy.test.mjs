// scripts/dev-deploy.mjs decisions: only a passed gate for the exact tree deploys, and an older run never
// overwrites a newer deployment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gateVerdict, deployedSha, decide, learnTables, servedSha, notReusable, entryScript } from './dev-deploy.mjs';

const TREE = '192b10f38626e3db2abe1528f68719154b6e802a';
// Shape of a real integration gate record (int16r, main 42f5a4f0), trimmed.
const PASSED = `tree HEAD a05e927c MERGE_HEAD b0ee85f3 index ${TREE}
mem before unit: 10299 MB free
make test-unit exit 0  ℹ tests 1812 ℹ fail 0
fixture regression exit 0  # pass 5 # fail 0
rh-app exit 0  16/16 checks passed
card-context-menu: exit 1 (stack alive: no) - rerun once
card-context-menu exit 0  12/12 checks passed
bundle(dist-dev) exit 0
model key bindings in app log: 0
journey provider-tripwire hits: 0
journey J1-J8 exit 0  J1 PASS J2 PASS
slice provider-tripwire hits: 0
tutor-slice exit 0  tutor-slice-check ok
INT16R-DONE
`;

test('a finished gate with every stage at exit 0 and no provider traffic passes for its own tree', () => {
  assert.equal(gateVerdict(PASSED, TREE), null);
  assert.equal(gateVerdict(PASSED.replace(/\n/g, '\r\n'), TREE), null, 'CRLF records too');
  assert.equal(gateVerdict(`fatal: Needed a single revision\n${PASSED}`, TREE), null, 'stderr before the tree line');
});

test('a gate record for another tree, unfinished, failed or with provider traffic never deploys', () => {
  assert.match(gateVerdict(PASSED, 'f'.repeat(40)), /not for tree/);
  assert.match(gateVerdict(PASSED.replace('INT16R-DONE\n', ''), TREE), /no -DONE/);
  assert.match(gateVerdict(PASSED.replace('rh-app exit 0', 'rh-app exit 1'), TREE), /failed stages: rh-app/);
  assert.match(gateVerdict(PASSED.replace('card-context-menu exit 0', 'card-context-menu exit 2'), TREE), /card-context-menu/, 'the rerun counts, and it failed');
  assert.match(gateVerdict(PASSED.replace('make test-unit exit 0', 'make test-unit exit 2'), TREE), /make test-unit/);
  assert.match(gateVerdict(PASSED.replace(/make test-unit exit 0[^\n]*\n/, ''), TREE), /make test-unit/, 'no unit run, no deploy');
  assert.match(gateVerdict(PASSED.replace('slice provider-tripwire hits: 0', 'slice provider-tripwire hits: 3'), TREE), /tripwire/);
  assert.match(gateVerdict(PASSED.replace('model key bindings in app log: 0', 'model key bindings in app log: 1'), TREE), /tripwire or model key/);
  assert.match(gateVerdict('', TREE), /not for tree/);
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
  assert.deepEqual(notReusable(['docs/features/dev-auto-deploy.md', 'CLAUDE.md', 'scripts/dev-deploy.mjs', 'scripts/dev-deploy.test.mjs', 'scripts/prod-release.mjs', 'scripts/prod-release.test.mjs']), []);
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
