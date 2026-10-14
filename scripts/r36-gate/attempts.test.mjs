import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// Real job listings (gh api .../runs/<id>/jobs?filter=all, rerun-listings.json), as GitHub lists every part again under
// a rerun's new run_attempt: a part the rerun did not rerun keeps the runner and start of the run it copies.
const listings = JSON.parse(readFileSync(new URL('./rerun-listings.json', import.meta.url), 'utf8'));
const ALL = ['units', 'checkpoints', ...[1, 2, 3, 4, 5, 6, 7].map(k => `shard-${k}`)];
const at = twos => Object.fromEntries(ALL.map(p => [p, twos.includes(p) ? 2 : 1]));
// 38616535709: shards 5-7 failed at 1 and passed rerun at 2. Before this fix collect read all nine parts at attempt 2 and
// found no units, checkpoint or shard-1..4 artifact there (drill 2's real case).
test('run 38616535709: a failed-only rerun reads a part it did not rerun from the attempt that part ran in', () => {
  assert.deepEqual(pickAttempts(jobsOf(listings['38616535709']), ALL), { attempts: at(['shard-5', 'shard-6', 'shard-7']), errors: [] });
});
// 38624979369, the proof run: attempt 1 failed checkpoints, shard-2 (canary), shard-6 and shard-7; attempt 2 reran only those.
const proof = listings['38624979369'], rerun = ['checkpoints', 'shard-2', 'shard-6', 'shard-7'];
test('run 38624979369 attempt 1 (drill 1): each failed part fails, naming the part and its attempt', () => {
  const r = pickAttempts(jobsOf(proof.filter(j => j.run_attempt === 1)), ALL);
  assert.deepEqual(r, { attempts: at([]), errors: rerun.map(p => `${p}: newest attempt 1 failure`) });
});
test('run 38624979369 attempt 2 (drill 3): the rerun parts come from attempt 2, the passed parts from attempt 1', () => {
  assert.deepEqual(pickAttempts(jobsOf(proof), ALL), { attempts: at(rerun), errors: [] });
});
test('drill 4: a rerun part that fails again fails, and an older pass never stands in for a newer failure', () => {
  const again = proof.map(j => j.name === 'run (shard-7)' && j.run_attempt === 2 ? { ...j, conclusion: 'failure' } : j);
  assert.deepEqual(pickAttempts(jobsOf(again), ALL), { attempts: at(rerun), errors: ['shard-7: newest attempt 2 failure'] });
  // Attempt 3 reruns shard-1, which passed at 1 (Re-run this job), and it fails: the attempt-1 pass is stale.
  const stale = [...proof, ...proof.filter(j => j.run_attempt === 2).map(j => j.name === 'run (shard-1)'
    ? { ...j, run_attempt: 3, conclusion: 'failure', runner_id: 1000000900, started_at: '2026-10-14T20:10:00Z' } : { ...j, run_attempt: 3 })];
  assert.deepEqual(pickAttempts(jobsOf(stale), ALL), { attempts: { ...at(rerun), 'shard-1': 3 }, errors: ['shard-1: newest attempt 3 failure'] });
});
test('run 38619263836 (drill 5): a cancelled run fails closed, naming every cancelled part and its attempt', () => {
  const r = pickAttempts(jobsOf(listings['38619263836']), ALL);
  assert.deepEqual(r.errors, ALL.filter(p => p !== 'units').map(p => `${p}: newest attempt 1 cancelled`));
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
