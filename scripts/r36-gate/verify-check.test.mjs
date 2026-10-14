import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyVerdict, awaitVerify } from './verify-check.mjs';
test('newest completed same-sha verify must be success', () => {
  assert.equal(verifyVerdict([{ headSha: 'a', status: 'completed', conclusion: 'success' }], 'a'), null);
  assert.match(verifyVerdict([{ headSha: 'a', status: 'completed', conclusion: 'failure' }], 'a'), /failure/);
  assert.match(verifyVerdict([{ headSha: 'a', status: 'in_progress', conclusion: '' }], 'a'), /not completed/);
  assert.match(verifyVerdict([], 'a'), /no verify/);
  assert.match(verifyVerdict([{ headSha: 'b', status: 'completed', conclusion: 'success' }], 'a'), /no verify/);
});

// A fake clock: sleep advances it, so the waits cost nothing and the deadline is exact.
const harness = answers => {
  let t = 0, calls = 0, sleeps = 0;
  return {
    stats: () => ({ calls, sleeps, t }),
    opts: { timeoutMs: 600000, intervalMs: 30000, now: () => t, sleep: async ms => { sleeps++; t += ms; },
      fetch: () => { const a = answers[Math.min(calls++, answers.length - 1)]; if (a instanceof Error) throw a; return a; } },
  };
};
const run = (status, conclusion = '', databaseId = 7) => [{ databaseId, headSha: 'a', status, conclusion }];

test('a verify that completes on the third poll passes and the accepted run is returned', async () => {
  const h = harness([run('queued'), run('in_progress'), run('completed', 'success', 9)]);
  assert.deepEqual(await awaitVerify('a', h.opts), { verdict: null, databaseId: 9 });
  assert.deepEqual(h.stats(), { calls: 3, sleeps: 2, t: 60000 });
});
test('a verify still running at the deadline fails closed', async () => {
  const h = harness([run('in_progress')]);
  const { verdict } = await awaitVerify('a', h.opts);
  assert.match(verdict, /not completed \(in_progress\)/);
  assert.equal(h.stats().t, 600000); // 10 min of 30 s polls, no more
});
test('a failure, a missing run or a gh error during the wait fails immediately', async () => {
  let h = harness([run('in_progress'), run('completed', 'failure')]);
  assert.match((await awaitVerify('a', h.opts)).verdict, /concluded failure/);
  assert.deepEqual(h.stats(), { calls: 2, sleeps: 1, t: 30000 });
  h = harness([[]]);
  assert.match((await awaitVerify('a', h.opts)).verdict, /no verify/);
  assert.equal(h.stats().sleeps, 0);
  h = harness([run('in_progress'), new Error('gh down')]);
  await assert.rejects(awaitVerify('a', h.opts), /gh down/);
  assert.equal(h.stats().sleeps, 1);
});
