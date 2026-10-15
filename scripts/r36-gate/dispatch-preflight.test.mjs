import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { missing } from './dispatch-preflight.mjs';

const repo = 'o/r', sha = 'a'.repeat(40), tree = 'b'.repeat(40);
const run = (event, more = {}) => ({ head_sha: sha, status: 'completed', conclusion: 'success', event, ...more });
// A fake GitHub API: the commit and each workflow's successful runs for the sha; any other path fails the test.
const api = ({ commit = { sha, tree: { sha: tree } }, verify = [run('push')], fast = [run('push')] } = {}) => path => {
  if (path === `repos/${repo}/git/commits/${sha}`) return commit;
  const runs = { 'verify.yml': verify, 'fast-e2e.yml': fast }[/actions\/workflows\/([\w.-]+)\/runs\?head_sha=([0-9a-f]+)&status=success/.exec(path)?.[1]];
  if (runs && path.includes(`head_sha=${sha}&`)) return { total_count: runs.length, workflow_runs: runs };
  throw new Error(`unexpected API path ${path}`);
};
const check = answers => missing({ repo, sha, tree, api: api(answers) });

test('passes when the commit has the dispatched tree and verify (push) and fast-e2e (push or dispatch) passed on it', () => {
  assert.deepEqual(check(), []);
  assert.deepEqual(check({ fast: [run('workflow_dispatch')] }), []);
});
test('a missing verify run is named', () => {
  assert.deepEqual(check({ verify: [] }), [`no successful verify.yml push run for ${sha}`]);
});
test('a failed fast-e2e run is not a pass, even if the API filter let it through', () => {
  assert.deepEqual(check({ fast: [run('push', { conclusion: 'failure' })] }), [`no successful fast-e2e.yml push or workflow_dispatch run for ${sha}`]);
  assert.deepEqual(check({ fast: [run('push', { status: 'in_progress', conclusion: null })] }), [`no successful fast-e2e.yml push or workflow_dispatch run for ${sha}`]);
});
test('a tree mismatch or an unknown commit is refused', () => {
  assert.deepEqual(check({ commit: { sha, tree: { sha: 'c'.repeat(40) } } }), [`commit ${sha} has tree ${'c'.repeat(40)}, not app_tree ${tree}`]);
  assert.deepEqual(check({ commit: null }), [`commit ${sha} is not in ${repo}`]);
});
test('a pull_request-only verify does not count (it tested a merge tree), nor does a run of another commit', () => {
  assert.deepEqual(check({ verify: [run('pull_request')] }), [`no successful verify.yml push run for ${sha}`]);
  assert.deepEqual(check({ verify: [run('push', { head_sha: 'd'.repeat(40) })] }), [`no successful verify.yml push run for ${sha}`]);
});
test('everything missing is named at once', () => {
  assert.equal(check({ commit: null, verify: [], fast: [] }).length, 3);
});
test('a short, uppercase or empty sha or tree is refused before any API call', () => {
  const never = () => { throw new Error('no API call expected'); };
  for (const [s, t] of [[sha.slice(0, 8), tree], [sha.toUpperCase(), tree], [sha, ''], [undefined, tree], [`${sha}/../x`, tree]])
    assert.match(missing({ repo, sha: s, tree: t, api: never })[0], /must be full lowercase 40-hex ids/);
});
test('the CLI fails closed with exit 1 and one annotation line', () => {
  const cli = fileURLToPath(new URL('./dispatch-preflight.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [cli], { env: { ...process.env, GITHUB_REPOSITORY: repo, APP_SHA: 'abc', APP_TREE: tree }, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^::error title=Gate preflight::refused: app_sha and app_tree must be full lowercase 40-hex ids [^\n]*\n$/);
});
