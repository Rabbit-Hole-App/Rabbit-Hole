// Verify reuse: a branch push of an already verified commit reuses that run only when the evidence and the run both check
// out; every other case verifies normally. No network.
//   node --test scripts/verify-reuse.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reuseDecision, VERIFY_PATH } from './verify-reuse.mjs';

const SHA = 'a'.repeat(40), TREE = 'b'.repeat(40), REPO = 'Rabbit-Hole-App/Rabbit-Hole';
const locks = { 'package-lock.json': '0123456789abcdef', 'uv.lock': 'fedcba9876543210' };
const evidence = { sha: SHA, tree: TREE, locks, unit: 'pass', build: 'pass', run: '38647920262.1' };
const runInfo = { id: 38647920262, run_attempt: 1, path: VERIFY_PATH, head_sha: SHA, status: 'completed', conclusion: 'success',
  html_url: 'https://github.com/Rabbit-Hole-App/Rabbit-Hole/actions/runs/38647920262', repository: { full_name: REPO } };
const decide = (over = {}) => reuseDecision({ note: JSON.stringify(evidence), sha: SHA, tree: TREE, locks, repo: REPO, runInfo, ...over });

test('matching evidence and a confirmed successful verify run of this sha: reuse, with the original run link', () => {
  assert.deepEqual(decide(), { reuse: true, run: '38647920262.1', url: runInfo.html_url });
});

test('missing or invalid evidence: verify runs', () => {
  assert.match(decide({ note: '' }).why, /no verify note/);
  assert.match(decide({ note: 'not json' }).why, /not valid evidence/);
  assert.match(decide({ note: JSON.stringify({ ...evidence, tree: 'c'.repeat(40) }) }).why, /names tree cccccccc/);
  assert.match(decide({ note: JSON.stringify({ ...evidence, locks: { ...locks, 'package-lock.json': 'x' } }) }).why, /another package-lock\.json/);
  assert.match(decide({ note: JSON.stringify({ ...evidence, unit: 'exit 1' }) }).why, /did not pass/);
  assert.match(decide({ note: JSON.stringify({ ...evidence, sha: 'c'.repeat(40) }) }).why, /is for cccccccc/);
  for (const d of [decide({ note: '' }), decide({ note: 'not json' })]) assert.equal(d.reuse, false);
});

test('a run that cannot be confirmed, or fails, or does not match: verify runs', () => {
  const cases = [
    [{ runInfo: null }, /could not be confirmed/],
    [{ runInfo: { ...runInfo, repository: { full_name: 'someone/fork' } } }, /is not in Rabbit-Hole-App\/Rabbit-Hole/],
    [{ runInfo: { ...runInfo, path: '.github/workflows/fast-e2e.yml' } }, /is \.github\/workflows\/fast-e2e\.yml, not/],
    [{ runInfo: { ...runInfo, head_sha: 'd'.repeat(40) } }, /verified dddddddd, not aaaaaaaa/],
    [{ runInfo: { ...runInfo, conclusion: 'failure' } }, /completed\/failure, not a completed success/],
    [{ runInfo: { ...runInfo, status: 'in_progress', conclusion: null } }, /in_progress\/null/],
    [{ runInfo: { ...runInfo, run_attempt: 2 } }, /another run or attempt/],
    [{ runInfo: { ...runInfo, id: 1 } }, /another run or attempt/],
  ];
  for (const [over, why] of cases) { const d = decide(over); assert.equal(d.reuse, false, String(why)); assert.match(d.why, why); }
});

test('verify.yml decides before any install or build, skips them only on a reuse, and writes no new note on a reuse', () => {
  const y = readFileSync(new URL('../.github/workflows/verify.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const at = s => y.indexOf(s);
  assert.ok(at('node scripts/verify-reuse.mjs') > 0, 'the reuse decision step exists');
  for (const heavy of ['npm ci', 'uv sync --locked', 'Unit suites', 'Page builds', 'scripts/verify-evidence.mjs write'])
    assert.ok(at(heavy) > at('node scripts/verify-reuse.mjs'), `${heavy} comes after the reuse decision`);
  const guarded = y.split('\n      - ').filter(s => /npm ci|uv sync|setup-uv|lock-natives|ensure-natives|Unit suites|Page builds|Evidence/.test(s));
  for (const s of guarded) assert.match(s, /if: steps\.reuse\.outputs\.reuse != 'true'/, s.split('\n')[0]);
  assert.match(y, /actions: read/, 'the run lookup needs actions: read');
  assert.match(y, /needs\.verify\.outputs\.evidence != ''/, 'the record job writes a note only from new evidence');
});
