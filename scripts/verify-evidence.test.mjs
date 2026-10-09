// Verify evidence (r34 audit): the dev deploy trusts only a passing, keyless verify run of the exact commit, tree and
// locked dependencies. No network.
//   node --test scripts/verify-evidence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkEvidence, lockDigest, LOCKS } from './verify-evidence.mjs';

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
