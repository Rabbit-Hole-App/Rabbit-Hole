// scripts/r36-gate/timing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRun, stageDurations, parseArgs } from './timing.mjs';

const at = m => new Date(Date.UTC(2026, 9, 13, 18, 0) + m * 60000).toISOString();
test('parseArgs never reads the --artifacts value as a run id or attempt', () => {
  assert.deepEqual(parseArgs(['123']), { id: '123', attempt: '1', artifacts: undefined });
  assert.deepEqual(parseArgs(['123', '2']), { id: '123', attempt: '2', artifacts: undefined });
  assert.deepEqual(parseArgs(['123', '--artifacts', '/x']), { id: '123', attempt: '1', artifacts: '/x' });
  assert.deepEqual(parseArgs(['--artifacts', '/x', '123', '2']), { id: '123', attempt: '2', artifacts: '/x' });
});
test('a run with no job that both started and completed reports null minutes and no jobs', () => {
  const run = { id: 1, run_attempt: 1, created_at: at(0) };
  const jobs = [{ name: 'queued only', created_at: at(0), started_at: at(1) }];
  assert.deepEqual(summarizeRun(run, jobs), { runId: 1, attempt: 1, queueMin: null, wallMin: null, runnerMin: 0, jobs: [] });
});
test('queue, wall and runner minutes are separate; an idle wait step counts as runner time', () => {
  const run = { id: 1, run_attempt: 1, created_at: at(0) };
  const jobs = [
    { name: 'run (shard-1)', created_at: at(0), started_at: at(1), completed_at: at(11),
      steps: [{ name: 'Wait for same-SHA canonical verify', started_at: at(2), completed_at: at(3) }, { name: 'Run shard-1', started_at: at(3), completed_at: at(11) }] },
    { name: 'collect', created_at: at(11), started_at: at(11.5), completed_at: at(12) },
  ];
  const s = summarizeRun(run, jobs);
  assert.equal(s.queueMin, 1);
  assert.equal(s.wallMin, 12);
  assert.equal(s.runnerMin, 10.5);
  assert.equal(s.jobs[0].idleMin, 1);
});
test('stage durations come from matching start and exit receipts', () => {
  const files = [
    { name: 'process-dive-check.mjs-1791915596654-3684.start.json', json: { at: at(1) } },
    { name: 'process-dive-check.mjs-1791915596654-3684.exit.json', json: { at: at(3.5) } },
    { name: 'process-orphan.mjs-1-2.start.json', json: { at: at(4) } },
  ];
  assert.deepEqual(stageDurations(files), [{ check: 'dive-check.mjs', min: 2.5, started: at(1) }]);
});
