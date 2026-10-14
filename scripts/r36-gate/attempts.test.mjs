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

// Run 38616535709 as GitHub lists it (filter=all) after `gh run rerun --failed`: attempt 2 lists every part again, the six
// it did not rerun with run_attempt 2 but the runner and start of their attempt 1 run. Before this fix collect read all nine
// parts at attempt 2 and found no units, checkpoint or shard-1..4 artifact there.
const rerun38616535709 = [
  ['run (shard-2)', 1, 'success', 1000000626, '18:36:12'], ['run (shard-4)', 1, 'success', 1000000625, '18:36:12'],
  ['run (shard-3)', 1, 'success', 1000000631, '18:36:13'], ['run (units)', 1, 'success', 1000000624, '18:36:12'],
  ['run (shard-7)', 1, 'failure', 1000000628, '18:36:12'], ['run (shard-5)', 1, 'failure', 1000000627, '18:36:15'],
  ['run (shard-6)', 1, 'failure', 1000000630, '18:36:13'], ['run (shard-1)', 1, 'success', 1000000632, '18:36:13'],
  ['run (checkpoints)', 1, 'success', 1000000629, '18:36:13'], ['collect', 1, 'failure', 1000000635, '18:48:23'],
  ['run (shard-5)', 2, 'success', 1000000636, '18:49:38'], ['run (shard-7)', 2, 'success', 1000000638, '18:49:38'],
  ['run (shard-6)', 2, 'success', 1000000637, '18:49:38'], ['run (shard-2)', 2, 'success', 1000000626, '18:36:12'],
  ['run (checkpoints)', 2, 'success', 1000000629, '18:36:13'], ['run (shard-1)', 2, 'success', 1000000632, '18:36:13'],
  ['run (shard-3)', 2, 'success', 1000000631, '18:36:13'], ['run (shard-4)', 2, 'success', 1000000625, '18:36:12'],
  ['run (units)', 2, 'success', 1000000624, '18:36:12'], ['collect', 2, 'failure', 1000000651, '19:00:22'],
].map(([name, run_attempt, conclusion, runner_id, t]) => ({ name, run_attempt, conclusion, runner_id, started_at: `2026-10-14T${t}Z` }));
test('a failed-only rerun reads a part it did not rerun from the attempt that part ran in (run 38616535709)', () => {
  const all = ['units', 'checkpoints', ...[1, 2, 3, 4, 5, 6, 7].map(k => `shard-${k}`)];
  assert.deepEqual(pickAttempts(jobsOf(rerun38616535709), all), {
    attempts: { units: 1, checkpoints: 1, 'shard-1': 1, 'shard-2': 1, 'shard-3': 1, 'shard-4': 1, 'shard-5': 2, 'shard-6': 2, 'shard-7': 2 }, errors: [] });
});
test('a part rerun twice is read from its newest run, and jobs that never started are never taken for one run', () => {
  const ran = (part, run_attempt, conclusion, runner_id, started_at) => ({ name: `run (${part})`, run_attempt, conclusion, runner_id, started_at });
  const jobs = jobsOf([ran('units', 1, 'failure', 1, 't1'), ran('units', 2, 'success', 2, 't2'), ran('units', 3, 'success', 2, 't2'),
    ran('shard-1', 1, 'cancelled', null, null), ran('shard-1', 2, 'cancelled', null, null),
    ran('shard-2', 1, 'success', 3, 't1'), ran('shard-2', 2, 'success', 3, 't1'), ran('shard-2', 3, 'success', 3, 't1')]);
  assert.deepEqual(pickAttempts(jobs, parts), { attempts: { units: 2, 'shard-1': 2, 'shard-2': 1 }, errors: ['shard-1: newest attempt 2 cancelled'] });
});

// The all-attempts listing of a run; non-matrix jobs (collect) are not parts.
const raw = [
  { name: 'run (units)', run_attempt: 1, conclusion: 'success', runner_id: 7, started_at: 't1' },
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
  assert.deepEqual(jobsOf(raw), [{ part: 'units', runAttempt: 1, conclusion: 'success', ran: '7@t1' }, { part: 'shard-2', runAttempt: 2, conclusion: 'success', ran: null }]);
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
test('runJobs throws when the listing has no usable total_count, never reading a short listing as complete', () => {
  // The first page carries the jobs and later pages are empty, as GitHub's would be.
  const listing = body => (file, args) => JSON.stringify(args[1].endsWith('&page=1') ? body : { ...body, jobs: [] });
  for (const body of [{ jobs: raw }, { total_count: null, jobs: raw }, { total_count: '3', jobs: raw }]) {
    assert.throws(() => runJobs(listing(body), env), /jobs listing has no total_count/);
  }
});
