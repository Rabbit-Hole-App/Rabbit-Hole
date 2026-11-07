// Option 1 of the job-failure logging plan: every terminal generation-job failure writes exactly one structured `job_failed` line to the
// Worker log (Cloudflare Workers Logs), with ids, tokens and numbers only. Doubles only: no network, no paid call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { logJobFailure } from '../src/job-failure-log.js';
import { explainStack } from './explain-fixture.js';
import { animationStack, NEEDS_PROPOSAL } from './animation-fixture.js';
import { CadJobs } from '../src/cad-jobs.js';

const KEYS = ['attempt', 'calls', 'category', 'elapsed_ms', 'event', 'interrupted', 'job_id', 'kind', 'retryable', 'stage', 'stage_ms', 'stop_reason'];

// Captures the job_failed lines console.log writes while a test runs.
function capture(t) {
  const lines = [];
  t.mock.method(console, 'log', (line) => { if (String(line).includes('"event":"job_failed"')) lines.push(String(line)); });
  return lines;
}
// A line is safe when it has exactly the documented keys and every text value is a token (no sentence, address or provider text).
function assertSafe(line) {
  const entry = JSON.parse(line);
  assert.deepEqual(Object.keys(entry).sort(), KEYS);
  for (const key of ['stage', 'stop_reason', 'category']) assert.ok(entry[key] === null || /^[a-z0-9_]+$/.test(entry[key]), `${key} is a token`);
  assert.ok(Object.values(entry.stage_ms).every(Number.isFinite) && Object.values(entry.calls).every(Number.isInteger));
  return entry;
}

test('the helper writes the documented fields from a failed record, counts stage time and calls, and leaves the words out', t => {
  const lines = capture(t);
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const job = { id: 'job_abc', attempt: 2, stopReason: 'deadline', createdAt: 100, deadline: 1_000_000 - 4000 + 600000,
    failure: { stage: 'rendering', category: 'transport', message: 'Explain my secret pendulum prompt', retryable: false },
    prompt: 'Explain my secret pendulum prompt', owner: { email: 'a@b.example', userId: 'u-9' },
    timing: { stages: [{ stage: 'authoring', startedAt: 1_000, endedAt: 3_500 }, { stage: 'rendering', startedAt: 990_000, endedAt: null }, { stage: 'authoring', startedAt: 4_000, endedAt: 4_500 }] },
    calls: [{ role: 'author' }, { role: 'review' }, { role: 'author' }] };
  logJobFailure('explain', job, { windowMs: 600000 });
  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0], /pendulum|example|u-9|message|prompt/);
  assert.deepEqual(assertSafe(lines[0]), { event: 'job_failed', kind: 'explain', job_id: 'job_abc', stage: 'rendering', stop_reason: 'deadline', category: 'transport', retryable: false,
    attempt: 2, elapsed_ms: 4000, stage_ms: { authoring: 3000, rendering: 10000 }, calls: { author: 2, review: 1 }, interrupted: false });
});

test('elapsed time counts from createdAt when no window is given, and the helper never throws on a malformed record', t => {
  const lines = capture(t);
  t.mock.timers.enable({ apis: ['Date'], now: 5000 });
  logJobFailure('cad', { id: 'c1', createdAt: 1000 });
  assert.equal(JSON.parse(lines[0]).elapsed_ms, 4000);
  for (const bad of [null, undefined, 7, {}, { timing: { stages: [null, {}, { stage: 'x y', startedAt: 'no' }] }, calls: [null, {}, { role: 4 }], failure: 'text', deadline: 'soon' }]) {
    assert.doesNotThrow(() => logJobFailure('whiteboard', bad, { windowMs: 'x' }));
  }
  assert.equal(lines.length, 1 + 5, 'a malformed record still writes one line');
  assert.equal(JSON.parse(lines.at(-1)).elapsed_ms, null);
});

test('explain: a failed job writes one line, none more on later alarms, and the deadline names the stage', async t => {
  const lines = capture(t);
  const budget = explainStack(t, { used: 50e6 });
  const made = await budget.create();
  const failed = await budget.run(made.body.job.id);
  assert.equal(failed.stage, 'failed');
  assert.equal(lines.length, 1);
  const entry = assertSafe(lines[0]);
  assert.deepEqual([entry.kind, entry.job_id, entry.stop_reason, entry.category, entry.interrupted], ['explain', made.body.job.id, 'budget', 'budget', false]);
  assert.doesNotMatch(lines[0], /pendulum/i);
  await budget.actor.alarm(); await budget.actor.alarm();
  assert.equal(lines.length, 1, 'a terminal job logs nothing more');

  const timed = explainStack(t, { generate: true });
  const job = await timed.create();
  for (let i = 0; i < 6 && timed.state.data.get(`job:${job.body.job.id}`).stage !== 'awaiting_approval'; i++) await timed.actor.alarm();
  assert.equal((await timed.approve(job.body.job.id)).status, 202);
  const record = timed.state.data.get(`job:${job.body.job.id}`);
  record.deadline = Date.now() - 1;
  await timed.actor.alarm();
  const stopped = timed.state.data.get(`job:${job.body.job.id}`);
  assert.deepEqual([stopped.stage, stopped.stopReason, stopped.failure.message], ['failed', 'deadline', `This explanation reached its time limit while ${record.stage}.`]);
  assert.equal(lines.length, 2);
  assert.deepEqual([JSON.parse(lines[1]).stop_reason, JSON.parse(lines[1]).stage], ['deadline', record.stage]);
});

test('animation: a stopped build writes one line with its reason and stage', { skip: NEEDS_PROPOSAL }, async t => {
  const lines = capture(t);
  const s = animationStack(t, { reply: role => (role === 'review' ? { accepted: false, repairable: false } : {}) });
  const { done } = await s.generated();
  assert.deepEqual([done.stage, done.stopReason], ['failed', 'unsupported_repair']);
  assert.equal(lines.length, 1);
  const entry = assertSafe(lines[0]);
  assert.deepEqual([entry.kind, entry.stop_reason, entry.stage, entry.job_id], ['animation', 'unsupported_repair', done.failure.stage, done.id]);
  assert.ok(entry.calls.author >= 1 && entry.stage_ms.authoring >= 0);
});

test('cad: an executor failure and a deadline each write one line, with no diagnostics text', async t => {
  const lines = capture(t);
  const records = new Map(), id = 'cad-log';
  records.set('job:' + id, { id, modelId: 'model', cardId: 'card', attempt: 1, state: 'building', stage: 'building', operation: 'build', repairs: 0, limits: { repairs: 0, calls: 2, usd: 0.2, elapsedMs: 1000 }, calls: 0, reservedUsd: 0, createdAt: Date.now(), deadline: Date.now() + 1000 });
  const storage = { get: async key => structuredClone(records.get(key)), put: async (key, value) => records.set(key, structuredClone(value)), getAlarm: async () => null, setAlarm: async () => {} };
  const actor = new CadJobs({ storage, blockConcurrencyWhile: fn => fn() }, { CAD_MAX_REPAIRS: '0', CAD_EXECUTOR_TOKEN: 'secret-token' });
  await actor.callback(new Request(`https://cad/callback?id=${id}&attempt=1&action=fail`, { method: 'POST', body: JSON.stringify({ error: 'execution_failed', diagnostics: 'ValueError: a private dimension named Widget' }) }));
  assert.equal(lines.length, 1);
  const entry = assertSafe(lines[0]);
  assert.deepEqual([entry.kind, entry.job_id, entry.stop_reason, entry.stage], ['cad', id, 'execution_failed', 'building']);
  assert.doesNotMatch(lines[0], /Widget|ValueError|secret/);
  const job = await storage.get('job:' + id);
  await actor.fail({ ...job, state: 'building', stage: 'building' }, 'CAD reached its accepted time limit.', 'deadline');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[1]).stop_reason, 'deadline');
});
