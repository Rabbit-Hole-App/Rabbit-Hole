import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outlineFrom, outlineProgress, applyOutlineOps, moveSection, outlineRevision, applyOutlineProposal, proposalProblem, STALE_PROPOSAL } from './learn-outline-model.js';

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

test('a description is trimmed, capped at 240, and empty when absent (C1, C2)', () => {
  const outline = outlineFrom([{ ...h('a', 1, 'A'), description: '  What attention computes.  ' }, h('b', 2, 'B'), { ...h('c', 2, 'C'), description: 'x'.repeat(300) }, { ...h('d', 1, 'D'), description: 7 }]);
  assert.deepEqual(outline.map(entry => entry.description.length), [24, 0, 240, 0]);
  assert.equal(outline[0].description, 'What attention computes.');
  assert.deepEqual(Object.keys(outline[0]).sort(), ['description', 'done', 'id', 'label', 'level']);
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

// --- R4 contract C3: the outline revision ---
const described = () => [
  { id: 'h1', type: 'heading', level: 1, text: 'Attention', done: false },
  { id: 'c1', type: 'explanation' },
  { id: 'h2', type: 'heading', level: 2, text: 'Queries and keys', done: false, description: 'How a query scores keys.' },
  { id: 'c2', type: 'explanation' },
  { id: 'h3', type: 'heading', level: 1, text: 'Training', done: false },
];
const rev = list => outlineRevision(outlineFrom(list));

test('the revision is 8 hex digits, the same for the same outline, and pinned for the worker', () => {
  assert.match(rev(described()), /^[0-9a-f]{8}$/);
  assert.equal(rev(described()), rev(described()));
  assert.equal(outlineRevision([]), '741638a5', 'FNV-1a of "[]" - the worker must print the same');
  assert.equal(outlineRevision([{ id: 'a', level: 1, label: 'A', description: '' }]), outlineRevision([{ id: 'a', level: 1, label: 'A' }]), 'a missing description hashes as empty');
});

test('the revision changes with ids, order, levels, titles and descriptions, never with completion', () => {
  const base = rev(described());
  const edit = change => rev(change(described()));
  assert.notEqual(edit(list => (list[0].text = 'Attn', list)), base);
  assert.notEqual(edit(list => (list[2].level = 3, list)), base);
  assert.notEqual(edit(list => (list[2].description = 'Other.', list)), base);
  assert.notEqual(edit(list => [list[4], ...list.slice(0, 4)]), base);
  assert.notEqual(edit(list => (list[0].id = 'h9', list)), base);
  assert.equal(edit(list => (list[0].done = true, list)), base, 'ticking a section never stales a proposal');
  assert.equal(edit(list => [...list, { id: 'c9', type: 'explanation' }]), base, 'cards are not part of the outline');
});

// --- R4 contract C5 + C7: validated, stale-safe, duplicate-safe apply ---
const ok = (list, ops, options) => {
  const result = applyOutlineProposal(list, ops, { newId: ids(), ...options });
  assert.equal(result.ok, true, result.message);
  return result;
};
const order = result => result.blocks.map(block => block.id);

test('an add under a parent lands at the end of the parent subtree by default, past its cards', () => {
  const result = ok(described(), [{ op: 'add', text: 'Values', level: 2, parent: 'h1', description: 'What a match returns.' }]);
  assert.deepEqual(order(result), ['h1', 'c1', 'h2', 'c2', 'new1', 'h3']);
  assert.equal(result.blocks[4].description, 'What a match returns.');
  assert.equal(result.blocks[4].done, false);
});

test('after the parent is its first sub-heading, after the parent cards; after a sub-heading is past that section', () => {
  assert.deepEqual(order(ok(described(), [{ op: 'add', text: 'Scores', level: 2, parent: 'h1', after: 'h1' }])), ['h1', 'c1', 'new1', 'h2', 'c2', 'h3']);
  assert.deepEqual(order(ok(described(), [{ op: 'add', text: 'Values', level: 2, parent: 'h1', after: 'h2' }])), ['h1', 'c1', 'h2', 'c2', 'new1', 'h3']);
});

test('a parent can be a heading added earlier in the same proposal, by key', () => {
  const result = ok([], [
    { op: 'add', key: 't1', text: 'Topic', level: 1, description: 'The topic.' },
    { op: 'add', key: 's1', text: 'Sub one', level: 2, parent: 't1' },
    { op: 'add', text: 'Sub two', level: 2, parent: 't1', after: 's1' },
    { op: 'add', text: 'Deeper', level: 3, parent: 's1' },
  ]);
  assert.deepEqual(result.blocks.map(block => [block.level, block.text]), [[1, 'Topic'], [2, 'Sub one'], [3, 'Deeper'], [2, 'Sub two']]);
  assert.equal(result.applied, 4);
});

test('describe sets a description, and an empty one clears it', () => {
  const set = ok(described(), [{ op: 'describe', id: 'h1', description: '  What attention is.  ' }]);
  assert.equal(set.blocks[0].description, 'What attention is.');
  const cleared = ok(described(), [{ op: 'describe', id: 'h2', description: '' }]);
  assert.equal('description' in cleared.blocks[2], false);
});

test('an invalid op refuses the whole proposal and changes nothing', () => {
  const bad = [
    [{ op: 'retitle', id: 'gone', text: 'x' }],
    [{ op: 'add', text: 'X', level: 2, parent: 'gone' }],
    [{ op: 'add', text: 'X', level: 3, parent: 'h1' }],
    [{ op: 'add', text: 'X', level: 2, parent: 'h1', after: 'h3' }],
    [{ op: 'add', text: 'X', level: 1, after: 'gone' }],
    [{ op: 'add', text: '   ', level: 1 }],
    [{ op: 'add', text: 'x'.repeat(201), level: 1 }],
    [{ op: 'add', text: 'X', level: 4 }],
    [{ op: 'describe', id: 'h1', description: 'x'.repeat(241) }],
    [{ op: 'remove', id: 'h1' }],
    [{ op: 'add', key: 'k', text: 'A', level: 1 }, { op: 'add', key: 'k', text: 'B', level: 1 }],
    Array.from({ length: 24 }, (_, i) => ({ op: 'add', text: `T${i}`, level: 1 })),
  ];
  for (const ops of bad) {
    const result = applyOutlineProposal(described(), [{ op: 'retitle', id: 'h1', text: 'Changed' }, ...ops], { newId: ids() });
    assert.equal(result.ok, false, JSON.stringify(ops).slice(0, 80));
    assert.equal(result.reason, 'invalid');
    assert.equal(result.blocks, undefined, 'no partial result to apply');
  }
  assert.equal(applyOutlineProposal(described(), 'nope').reason, 'invalid');
  assert.equal(applyOutlineProposal(described(), Array.from({ length: 24 }, (_, i) => ({ op: 'add', text: `T${i}`, level: 1 })), { newId: ids() }).ok, true, '24 changes fit');
});

test('a proposal made against an older revision is stale and changes nothing', () => {
  const base = rev(described());
  const edited = described();
  edited[0].text = 'Attention, renamed by the learner';
  const result = applyOutlineProposal(edited, [{ op: 'retitle', id: 'h1', text: 'Tutor title' }], { base });
  assert.deepEqual(result, { ok: false, reason: 'stale', message: STALE_PROPOSAL });
  assert.equal(STALE_PROPOSAL, 'The contents changed since this proposal. Ask the Tutor again.');
});

test('completion ticked after the proposal does not make it stale', () => {
  const base = rev(described());
  const ticked = described();
  ticked[2].done = true;
  assert.equal(ok(ticked, [{ op: 'add', text: 'Values', level: 2, parent: 'h1' }], { base }).blocks[2].done, true, 'progress kept');
});

test('pressing Apply twice on the same proposal is stale the second time', () => {
  const list = described();
  const proposal = { ops: [{ op: 'add', text: 'Values', level: 2, parent: 'h1' }], base: rev(list) };
  const first = ok(list, proposal.ops, { base: proposal.base });
  assert.equal(applyOutlineProposal(first.blocks, proposal.ops, { base: proposal.base, newId: ids() }).reason, 'stale');
});

test('a proposal re-adopting existing headings skips them and puts its subtopics under the existing topic', () => {
  const list = described();
  const ops = [
    { op: 'add', key: 't1', text: '  attention ', level: 1 },
    { op: 'add', text: 'Queries   and KEYS', level: 2, parent: 't1' },
    { op: 'add', text: 'Values', level: 2, parent: 't1' },
    { op: 'add', key: 't2', text: 'Inference', level: 1 },
    { op: 'add', text: 'Sampling', level: 2, parent: 't2' },
  ];
  const result = ok(list, ops, { base: rev(list) });
  assert.deepEqual([result.applied, result.skipped], [3, 2]);
  assert.deepEqual(result.blocks.filter(block => block.type === 'heading').map(block => block.text), ['Attention', 'Queries and keys', 'Values', 'Training', 'Inference', 'Sampling']);
  const again = ok(result.blocks, ops, { base: rev(result.blocks) });
  assert.deepEqual([again.applied, again.skipped], [0, 5], 'adopting the same syllabus again adds nothing');
});

test('the same title under a different parent is not a duplicate', () => {
  const list = [...described(), { id: 'h4', type: 'heading', level: 2, text: 'Overview', done: false }];
  const result = ok(list, [{ op: 'add', text: 'Overview', level: 2, parent: 'h1' }], { base: rev(list) });
  assert.equal(result.skipped, 0);
});

test('the learner edit in the panel (no base) applies unconditionally and is never deduplicated', () => {
  const result = ok(described(), [{ op: 'add', text: 'Attention', level: 1 }]);
  assert.equal(result.skipped, 0);
});

test('proposalProblem reports stale or invalid before Apply, null when it applies', () => {
  const outline = outlineFrom(described());
  assert.equal(proposalProblem(outline, { ops: [{ op: 'add', text: 'V', level: 2, parent: 'h1' }], base: outlineRevision(outline) }), null);
  assert.equal(proposalProblem(outline, { ops: [], base: 'deadbeef' }), STALE_PROPOSAL);
  assert.match(proposalProblem(outline, { ops: [{ op: 'add', text: 'V', level: 3, parent: 'h1' }] }), /one level below/);
  assert.equal(proposalProblem(outline, { ops: [{ op: 'add', key: 'a', text: 'A', level: 1 }, { op: 'add', key: 'b', text: 'B', level: 1 }, { op: 'add', text: 'C', level: 2, parent: 'b' }] }), null, 'each add earlier in the proposal has its own id');
});
