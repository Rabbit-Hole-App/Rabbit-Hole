import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasSeed } from '../src/canvas-conversation.js';

test('canvas branches carry only their own initial exchange and preserve full text', () => {
  const body = { canvas_seed: { question: 'Why this box?', answer: 'A'.repeat(10000) } };
  assert.deepEqual(canvasSeed(body), [{ role: 'user', content: 'Why this box?' }, { role: 'assistant', content: 'A'.repeat(10000) }]);
  assert.deepEqual(canvasSeed({ message: 'A regular question' }), []);
});

test('reject changing an existing thread, non-Learn contexts and unbounded seeds', () => {
  const canvas_seed = { question: 'Why?', answer: 'An explanation.' };
  assert.throws(() => canvasSeed({ canvas_seed, thread_id: 'another-thread' }));
  assert.throws(() => canvasSeed({ canvas_seed }, 'agent'));
  for (const seed of [null, {}, { ...canvas_seed, question: ' ' }, { ...canvas_seed, answer: 1 }, { ...canvas_seed, answer: 'x'.repeat(32001) }]) {
    assert.throws(() => canvasSeed({ canvas_seed: seed }));
  }
});
