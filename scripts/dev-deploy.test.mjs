// scripts/dev-deploy.mjs decisions: only a passed gate for the exact tree deploys, and an older run never
// overwrites a newer deployment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateVerdict, deployedSha, decide } from './dev-deploy.mjs';

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
