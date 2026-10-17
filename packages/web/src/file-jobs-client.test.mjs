// Reconnecting cards to their durable jobs (file-jobs-client.js): a reopened canvas reads status only, never submits a
// second import, stops at a settled state, and never applies a result to a card that was removed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JOB_STAGE_LABELS, jobCards, jobIdempotencyKey, stageLabel, submitFileJob, watchFileJobs } from './file-jobs-client.js';

const card = (id, job, source = 'fs_' + 'a'.repeat(24)) => ({ id, type: 'pdf', fileRef: { v: 1, source: { id: source, rev: 'f'.repeat(64) }, family: 'presentation', job } });
// Timers the test advances by hand.
function clock() {
  let now = 0, seq = 0; const pending = new Map();
  return {
    setTimeout: (fn, ms) => { const id = ++seq; pending.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: id => pending.delete(id),
    async tick(ms) { now += ms; for (const [id, t] of [...pending]) if (t.at <= now) { pending.delete(id); await t.fn(); } await new Promise(r => setImmediate(r)); },
    get size() { return pending.size; },
  };
}
const server = states => {
  const calls = [];
  return { calls, fetch: async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET' });
    const id = url.match(/jobs\/(fj_[a-z0-9]+)/)?.[1], list = states[id];
    if (!list) return { status: 404, json: async () => ({ error: 'Not available' }) };
    const state = list.length > 1 ? list.shift() : list[0];
    return { status: 200, json: async () => ({ job: { id, state } }) };
  } };
};
const flush = () => new Promise(r => setImmediate(r));

test('stage labels are the truthful stages, with no percentage', () => {
  assert.deepEqual(Object.values(JOB_STAGE_LABELS), ['Queued', 'Validating', 'Converting', 'Preparing preview', 'Ready', 'Ready with limitations', 'Failed', 'Cancelled']);
  assert.equal(stageLabel({ state: 'converting', cancelRequested: true }), 'Cancelling');
  assert.equal(stageLabel({ state: 'cancelled', cancelRequested: true }), 'Cancelled');
});

test('reopening a canvas reconnects each card to its job by status reads only, until it settles', async () => {
  const s = server({ fj_a: ['converting', 'preparing_preview', 'ready'] }), t = clock(), seen = [];
  const blocks = [card('c1', 'fj_a'), { id: 'plain', type: 'note' }];
  assert.deepEqual(jobCards(blocks), [{ cardId: 'c1', jobId: 'fj_a', sourceId: 'fs_' + 'a'.repeat(24) }]);
  watchFileJobs({ blocks, fetchImpl: s.fetch, onJob: (cardId, job) => seen.push([cardId, job.state]), timers: t });
  await flush();
  for (let i = 0; i < 5; i++) await t.tick(20_000);
  assert.deepEqual(seen, [['c1', 'converting'], ['c1', 'preparing_preview'], ['c1', 'ready']]);
  assert.equal(t.size, 0, 'a settled job is not polled again');
  assert.ok(s.calls.every(c => c.method === 'GET'), 'reconnect never submits');
});

test('a removed card stops being watched and never receives the late result', async () => {
  const s = server({ fj_a: ['converting', 'ready'] }), t = clock(), seen = [];
  const w = watchFileJobs({ blocks: [card('c1', 'fj_a')], fetchImpl: s.fetch, onJob: (cardId, job) => seen.push([cardId, job.state]), timers: t });
  await flush();
  w.update([]); // the card was deleted or undone
  await t.tick(60_000);
  assert.deepEqual(seen, [['c1', 'converting']]);
  assert.equal(s.calls.length, 1);
});

test('a job the viewer can no longer read stops quietly; share links read through the link', async () => {
  const s = server({}), t = clock(), seen = [];
  watchFileJobs({ blocks: [card('c1', 'fj_gone')], fetchImpl: s.fetch, onJob: () => seen.push(1), share: 'tok', timers: t });
  await flush(); await t.tick(60_000);
  assert.equal(s.calls.length, 1); assert.match(s.calls[0].url, /\?share=tok$/); assert.deepEqual(seen, []);
});

test('submit carries one idempotency key per card, converter and source revision', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return { json: async () => ({ job: { id: 'fj_a', state: 'queued' } }) }; };
  const args = { sourceId: 'fs_' + 'a'.repeat(24), sourceRev: 'f'.repeat(64), cardId: 'card 1', converter: 'slides', app: 'canvas-1' };
  await submitFileJob(fetchImpl, args); await submitFileJob(fetchImpl, args);
  assert.equal(sent[0].body.idempotency_key, sent[1].body.idempotency_key);
  assert.equal(sent[0].body.idempotency_key, jobIdempotencyKey({ cardId: 'card 1', converter: 'slides', sourceRev: 'f'.repeat(64) }));
  assert.match(sent[0].body.idempotency_key, /^[A-Za-z0-9:_.-]{8,128}$/);
  assert.equal(sent[0].url, `/api/learn/files/${args.sourceId}/jobs`);
});
