import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outlineFrom, outlineProgress, applyOutlineOps, moveSection } from './learn-outline-model.js';

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

// --- applying a proposal the learner accepted ---
const ids = () => { let n = 0; return () => `new${++n}`; };
const blocks = () => [
  { id: 'h1', type: 'heading', level: 1, text: 'Attention', done: false },
  { id: 'c1', type: 'explanation' },
  { id: 'h2', type: 'heading', level: 2, text: 'Queries and keys', done: false },
];

test('add with no anchor appends at the end', () => {
  const out = applyOutlineOps(blocks(), [{ op: 'add', text: 'Training', level: 1, after: null }], ids());
  assert.equal(out.length, 4);
  assert.deepEqual(out[3], { id: 'new1', type: 'heading', dx: 0, dy: 0, level: 1, text: 'Training', done: false });
});

test('add after a heading lands directly after it, before its cards', () => {
  const out = applyOutlineOps(blocks(), [{ op: 'add', text: 'Scaling', level: 2, after: 'h1' }], ids());
  assert.deepEqual(out.map(b => b.id), ['h1', 'new1', 'c1', 'h2']);
});

test('a later op can build on a heading minted earlier in the same batch', () => {
  const out = applyOutlineOps(blocks(), [
    { op: 'add', text: 'Training', level: 1, after: null, key: 'k' },
    { op: 'add', text: 'Optimiser', level: 2, after: 'k' },
  ], ids());
  assert.deepEqual(out.map(b => b.id), ['h1', 'c1', 'h2', 'new1', 'new2']);
});

test('retitle and set_level change only their own heading', () => {
  const out = applyOutlineOps(blocks(), [{ op: 'retitle', id: 'h2', text: 'Keys' }, { op: 'set_level', id: 'h2', level: 1 }], ids());
  assert.equal(out[2].text, 'Keys');
  assert.equal(out[2].level, 1);
  assert.deepEqual(out[0], blocks()[0], 'the other heading is untouched');
  assert.deepEqual(out[1], blocks()[1], 'the card between them is untouched');
});

// A proposal is made against the outline as it was when the question was asked.
test('a section deleted between proposal and Apply is skipped, not fatal', () => {
  const out = applyOutlineOps(blocks(), [
    { op: 'retitle', id: 'gone', text: 'x' },
    { op: 'add', text: 'Training', level: 1, after: null },
  ], ids());
  assert.equal(out.length, 4);
  assert.equal(out[3].text, 'Training', 'the rest of the proposal still applies');
});

test('an add whose anchor has gone still keeps the section, at the end', () => {
  const out = applyOutlineOps(blocks(), [{ op: 'add', text: 'Orphan', level: 1, after: 'gone' }], ids());
  assert.equal(out.length, 4);
  assert.equal(out[3].text, 'Orphan');
});

test('applying nothing changes nothing', () => {
  assert.deepEqual(applyOutlineOps(blocks(), [], ids()).map(b => b.id), ['h1', 'c1', 'h2']);
  assert.deepEqual(applyOutlineOps(blocks(), undefined, ids()).map(b => b.id), ['h1', 'c1', 'h2']);
});

test('the blocks handed in are not mutated', () => {
  const original = blocks();
  const copy = JSON.parse(JSON.stringify(original));
  applyOutlineOps(original, [{ op: 'retitle', id: 'h1', text: 'Changed' }], ids());
  assert.deepEqual(original, copy);
});

test('a new heading is shaped like one the menu would insert', () => {
  const [added] = applyOutlineOps([], [{ op: 'add', text: 'First', level: 3, after: null }], ids());
  assert.deepEqual(Object.keys(added).sort(), ['done', 'dx', 'dy', 'id', 'level', 'text', 'type']);
  assert.equal(added.type, 'heading');
});

test('moving a section carries its cards and sub-sections, and never into itself', () => {
  const c = id => ({ id, type: 'card' });
  const list = [h('a', 1, 'A'), c('a1'), h('a2', 2, 'A.2'), c('a21'), h('b', 1, 'B'), c('b1'), h('c', 1, 'C')];
  const ids = out => out.map(block => block.id);
  assert.deepEqual(ids(moveSection(list, 'b', 'a')), ['b', 'b1', 'a', 'a1', 'a2', 'a21', 'c']);
  assert.deepEqual(ids(moveSection(list, 'a', null)), ['b', 'b1', 'c', 'a', 'a1', 'a2', 'a21']);
  assert.deepEqual(ids(moveSection(list, 'a2', 'c')), ['a', 'a1', 'b', 'b1', 'a2', 'a21', 'c'], 'a sub-section stops at the next section');
  assert.equal(moveSection(list, 'a', 'a2'), list, 'not into itself');
  assert.equal(moveSection(list, 'gone', 'a'), list);
});
