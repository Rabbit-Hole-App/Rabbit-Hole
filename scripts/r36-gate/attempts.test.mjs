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

// The jobs endpoint of one attempt lists a carried-over job under its own run_attempt; non-matrix jobs (collect) are not parts.
const api = { jobs: [
  { name: 'run (units)', run_attempt: 1, conclusion: 'success' },
  { name: 'run (shard-2)', run_attempt: 2, conclusion: 'success' },
  { name: 'collect', run_attempt: 2, conclusion: null },
] };
test('jobsOf maps run (<part>) jobs and drops the rest', () => {
  assert.deepEqual(jobsOf(api), [{ part: 'units', runAttempt: 1, conclusion: 'success' }, { part: 'shard-2', runAttempt: 2, conclusion: 'success' }]);
});
test('runJobs asks gh for the current attempt of this run, with a timeout', () => {
  const calls = [];
  const exec = (file, args, opts) => { calls.push({ file, args, opts }); return JSON.stringify(api); };
  const jobs = runJobs(exec, { GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '77', GITHUB_RUN_ATTEMPT: '3' });
  assert.equal(jobs.length, 2);
  assert.deepEqual(calls, [{ file: 'gh', args: ['api', 'repos/o/r/actions/runs/77/attempts/3/jobs?per_page=100'], opts: { encoding: 'utf8', timeout: 60000 } }]);
});
