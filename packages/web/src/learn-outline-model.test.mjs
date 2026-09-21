import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outlineFrom, outlineProgress } from './learn-outline-model.js';

const h = (id, level, text, done = false) => ({ id, type: 'heading', level, text, done });
const card = id => ({ id, type: 'explanation' });

test('only headings form the outline', () => {
  const outline = outlineFrom([card('a'), h('h1', 1, 'Attention'), card('b'), h('h2', 2, 'Keys')]);
  assert.deepEqual(outline.map(entry => entry.id), ['h1', 'h2']);
  assert.deepEqual(outline.map(entry => entry.level), [1, 2]);
});

test('an untitled section is still listed, with a readable label', () => {
  assert.deepEqual(outlineFrom([h('h1', 1, '   ')]).map(entry => entry.label), ['Untitled section']);
  assert.deepEqual(outlineFrom([h('h1', 2, '')]).map(entry => entry.label), ['Untitled sub-section']);
  assert.deepEqual(outlineFrom([h('h1', 3, '')]).map(entry => entry.label), ['Untitled sub-sub-section']);
});

test('a missing level reads as a top-level section', () => {
  assert.equal(outlineFrom([{ id: 'x', type: 'heading', text: 'X' }])[0].level, 1);
});

test('done carries through as a boolean, never undefined', () => {
  const outline = outlineFrom([h('a', 1, 'A', true), { id: 'b', type: 'heading', level: 1, text: 'B' }]);
  assert.deepEqual(outline.map(entry => entry.done), [true, false]);
});

test('no headings is an empty outline, not a broken one', () => {
  assert.deepEqual(outlineFrom([card('a')]), []);
  assert.deepEqual(outlineFrom(undefined), []);
});

// The bar measures every entry, because a sub-section you have not done is work
// remaining just as much as a section is.
test('progress counts every entry at any depth', () => {
  const outline = outlineFrom([h('a', 1, 'A', true), h('b', 2, 'B'), h('c', 2, 'C', true)]);
  const progress = outlineProgress(outline);
  assert.equal(progress.total, 3);
  assert.equal(progress.done, 2);
});

test('an empty outline has no progress and no dots, and does not divide by zero', () => {
  const progress = outlineProgress([]);
  assert.deepEqual([progress.total, progress.done, progress.milestones], [0, 0, []]);
  assert.equal(Number.isFinite(progress.fraction), true);
  assert.equal(progress.fraction, 0);
});

// A dot per sub-sub-section would be a smear, so only top-level sections mark
// the bar - and each sits where its own section ends.
test('a dot marks the end of each top-level section', () => {
  const outline = outlineFrom([h('a', 1, 'A'), h('b', 2, 'B'), h('c', 1, 'C')]);
  const { milestones } = outlineProgress(outline);
  assert.deepEqual(milestones.map(m => m.label), ['A', 'C']);
  assert.deepEqual(milestones.map(m => m.at), [2 / 3, 1]);
});

test('a dot is filled only when its whole section is done', () => {
  const outline = outlineFrom([h('a', 1, 'A', true), h('b', 2, 'B'), h('c', 1, 'C', true)]);
  const { milestones } = outlineProgress(outline);
  assert.deepEqual(milestones.map(m => m.done), [false, true], 'A is not done while B is outstanding');
});

test('content before the first section does not invent a dot', () => {
  const outline = outlineFrom([h('b', 2, 'Orphan sub-section'), h('a', 1, 'Real')]);
  const { milestones } = outlineProgress(outline);
  assert.deepEqual(milestones.map(m => m.label), ['Real']);
});

test('fraction is the share of entries done', () => {
  assert.equal(outlineProgress(outlineFrom([h('a', 1, 'A', true), h('b', 1, 'B')])).fraction, 0.5);
});
