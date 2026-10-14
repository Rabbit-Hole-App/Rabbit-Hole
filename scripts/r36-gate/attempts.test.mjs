import test from 'node:test';
import assert from 'node:assert/strict';
import { pickAttempts, jobsOf, runJobs } from './attempts.mjs';
const parts = ['units', 'shard-1', 'shard-2'];
test('a part not rerun keeps its attempt; a rerun part uses its newest attempt', () => {
  const r = pickAttempts([{ part: 'units', runAttempt: 1, conclusion: 'success' }, { part: 'shard-1', runAttempt: 1, conclusion: 'success' }, { part: 'shard-2', runAttempt: 2, conclusion: 'success' }], parts);
  assert.deepEqual(r, { attempts: { units: 1, 'shard-1': 1, 'shard-2': 2 }, errors: [] });
});
test('a newer cancelled or failed attempt is never replaced by an older pass', () => {
  const r = pickAttempts([{ part: 'units', runAttempt: 1, conclusion: 'success' }, { part: 'shard-1', runAttempt: 1, conclusion: 'success' },
    { part: 'shard-2', runAttempt: 1, conclusion: 'success' }, { part: 'shard-2', runAttempt: 2, conclusion: 'cancelled' }], parts);
  assert.deepEqual(r.errors, ['shard-2: newest attempt 2 cancelled']);
});
test('a part with no job fails', () => {
  assert.deepEqual(pickAttempts([{ part: 'units', runAttempt: 1, conclusion: 'success' }], parts).errors, ['shard-1: no job', 'shard-2: no job']);
});
test('a newest attempt that is still running or skipped is not a pass', () => {
  const r = pickAttempts([{ part: 'units', runAttempt: 1, conclusion: 'success' }, { part: 'shard-1', runAttempt: 2, conclusion: null }, { part: 'shard-2', runAttempt: 1, conclusion: 'skipped' }], parts);
  assert.deepEqual(r.errors, ['shard-1: newest attempt 2 null', 'shard-2: newest attempt 1 skipped']);
});

test('a matrix job outside the required parts must still have a successful newest attempt', () => {
  const ok = parts.map(part => ({ part, runAttempt: 1, conclusion: 'success' }));
  assert.deepEqual(pickAttempts([...ok, { part: 'shard-8', runAttempt: 1, conclusion: 'failure' }], parts).errors, ['shard-8: newest attempt 1 failure']);
  assert.deepEqual(pickAttempts([...ok, { part: 'shard-8', runAttempt: 1, conclusion: 'failure' }, { part: 'shard-8', runAttempt: 2, conclusion: 'success' }], parts), { attempts: { units: 1, 'shard-1': 1, 'shard-2': 1 }, errors: [] });
});

// The all-attempts listing of a run: a carried-over job keeps its own run_attempt; non-matrix jobs (collect) are not parts.
const raw = [
  { name: 'run (units)', run_attempt: 1, conclusion: 'success' },
  { name: 'run (shard-2)', run_attempt: 2, conclusion: 'success' },
  { name: 'collect', run_attempt: 2, conclusion: null },
];
const env = { GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '77' };
// A fake gh over the raw jobs: pages of pageSize, honouring &page=N, reporting total_count.
const fakeGh = (jobs, pageSize, total = jobs.length) => {
  const calls = [];
  const exec = (file, args, opts) => { calls.push({ file, args, opts }); const page = +args[1].match(/&page=(\d+)$/)[1]; return JSON.stringify({ total_count: total, jobs: jobs.slice((page - 1) * pageSize, page * pageSize) }); };
  return { calls, exec };
};
test('jobsOf maps run (<part>) jobs and drops the rest', () => {
  assert.deepEqual(jobsOf(raw), [{ part: 'units', runAttempt: 1, conclusion: 'success' }, { part: 'shard-2', runAttempt: 2, conclusion: 'success' }]);
});
test('runJobs lists every attempt of this run, page by page, each call with a timeout', () => {
  const g = fakeGh(raw, 2);
  assert.equal(runJobs(g.exec, env).length, 2);
  assert.deepEqual(g.calls.map(c => c.args), [1, 2].map(p => ['api', `repos/o/r/actions/runs/77/jobs?filter=all&per_page=100&page=${p}`]));
  assert.ok(g.calls.every(c => c.file === 'gh' && c.opts.timeout === 60000 && c.opts.encoding === 'utf8'));
});
test('runJobs throws when fewer jobs come back than total_count', () => {
  assert.throws(() => runJobs(fakeGh(raw, 2, 4).exec, env), /saw 3 of 4/);
  assert.throws(() => runJobs(fakeGh(raw, 100, 4).exec, env), /saw 3 of 4/);
});
