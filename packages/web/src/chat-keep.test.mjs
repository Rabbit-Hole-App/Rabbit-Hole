import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_REPLY, keepAsCard } from './chat-keep.js';

// Owner 2026-11-13: Create as card is offered only for a reply JEV judges worth keeping; the client asks once per reply and never for a short one.
const LONG = 'x'.repeat(MIN_REPLY + 10);
const reply = body => async () => ({ ok: true, json: async () => body });

test('a reply under the minimum or with no question never calls', async () => {
  let calls = 0;
  const post = async () => { calls += 1; return { ok: true, json: async () => ({ keep: true, via: 'jev' }) }; };
  assert.equal(await keepAsCard({ app: 'canvas-0a1b2c3d', id: 'short', question: 'q', reply: 'too short' }, post), false);
  assert.equal(await keepAsCard({ app: 'canvas-0a1b2c3d', id: 'noq', question: '  ', reply: LONG }, post), false);
  assert.equal(await keepAsCard({ app: null, id: 'noapp', question: 'q', reply: LONG }, post), false);
  assert.equal(calls, 0);
});

test('JEV\'s yes or no is the answer, and two askers of one reply share one call', async () => {
  let calls = 0;
  const post = async (url, init) => { calls += 1; assert.equal(url, '/api/learn/chat/keep'); assert.deepEqual(Object.keys(JSON.parse(init.body)).sort(), ['app', 'question', 'reply']); return { ok: true, json: async () => ({ keep: true, via: 'jev' }) }; };
  const [a, b] = await Promise.all([keepAsCard({ app: 'canvas-0a1b2c3d', id: 'm1', question: 'How does attention work?', reply: LONG }, post), keepAsCard({ app: 'canvas-0a1b2c3d', id: 'm1', question: 'How does attention work?', reply: LONG }, post)]);
  assert.deepEqual([a, b, calls], [true, true, 1]);
  assert.equal(await keepAsCard({ app: 'canvas-0a1b2c3d', id: 'm2', question: 'ok?', reply: LONG }, reply({ keep: false, via: 'jev' })), false);
});

test('a failed, refused or fallback check offers nothing and is not remembered: the next ask tries again', async () => {
  for (const [id, post] of [['f1', async () => { throw new Error('offline'); }], ['f2', async () => ({ ok: false, json: async () => ({}) })], ['f3', reply({ keep: true, via: 'fallback' })]]) {
    assert.equal(await keepAsCard({ app: 'canvas-0a1b2c3d', id, question: 'q?', reply: LONG }, post), false, id);
  }
  let calls = 0;
  const now = async () => { calls += 1; return { ok: true, json: async () => ({ keep: true, via: 'jev' }) }; };
  assert.equal(await keepAsCard({ app: 'canvas-0a1b2c3d', id: 'f1', question: 'q?', reply: LONG }, now), true, 'f1 asks again and now gets an answer');
  assert.equal(calls, 1);
});
