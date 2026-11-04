import test from 'node:test';
import assert from 'node:assert/strict';
import { textChunks } from './file-text.js';

// A small chunk size stands in for the 64 KiB one: the cut is in the middle of the fence below.
const FENCE = '```math\n' + 'x^2 + y^2 = z^2\n'.repeat(6) + '```\n';
const TEXT = 'before line one\nbefore line two\n' + FENCE + 'after line one\nafter line two\n';
const mid = TEXT.indexOf('x^2') + 20;

test('chunks without fences cut where they fall (unchanged)', () => {
  const { chunks } = textChunks(TEXT, 10000, mid);
  assert.equal(chunks.join(''), TEXT);
  assert.ok(chunks[0].includes('```math') && !chunks[0].includes('```\nafter'), 'the first chunk ends inside the fence');
});
test('fences: a boundary inside a fence is extended to the closing fence, and nothing is lost or repeated', () => {
  const { chunks } = textChunks(TEXT, 10000, mid, { fences: true });
  assert.equal(chunks.join(''), TEXT);
  assert.equal((chunks[0].match(/```/g) || []).length, 2, 'opened and closed in one chunk');
  assert.ok(chunks[0].endsWith('```\n'));
  assert.ok(chunks[1].startsWith('after line one'));
});
test('fences: a boundary outside any fence is not moved; two fences each whole', () => {
  const two = FENCE + 'between\n' + FENCE;
  const { chunks } = textChunks(two, 10000, 40, { fences: true });
  assert.equal(chunks.join(''), two);
  for (const chunk of chunks) assert.equal((chunk.match(/^```/gm) || []).length % 2, 0, JSON.stringify(chunk.slice(0, 30)));
});
test('fences: a fence that never closes does not hang or lose text; the cut stays', () => {
  const open = 'intro\n```math\n' + 'x^2\n'.repeat(40);
  const { chunks, truncated } = textChunks(open, 10000, 60, { fences: true });
  assert.equal(chunks.join(''), open);
  assert.ok(chunks.length > 1);
  assert.equal(truncated, false);
});
test('fences: the preview bound still wins over a fence that closes beyond it', () => {
  const { chunks, shown, truncated } = textChunks(TEXT, mid + 5, mid, { fences: true });
  assert.equal(shown, mid + 5);
  assert.equal(chunks.join('').length, mid + 5);
  assert.equal(truncated, true);
});
