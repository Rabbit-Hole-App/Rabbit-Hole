import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outlineFrom, outlineProgress, applyOutlineOps, moveSection, outlineRevision, applyOutlineProposal, proposalProblem, STALE_PROPOSAL, MAX_OUTLINE_HEADINGS } from './learn-outline-model.js';

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

// R4 contract amendment C5a (lead, 2026-10-16) replaces the splice directly after the heading: an add after X lands
// after X's whole section, so it never takes X's cards or children.
test('add after a heading lands after its whole section, past its cards and sub-sections (C5a)', () => {
  const out = applyOutlineOps(blocks(), [{ op: 'add', text: 'Scaling', level: 2, after: 'h1' }], ids());
  assert.deepEqual(out.map(b => b.id), ['h1', 'c1', 'h2', 'new1']);
  const list = [h('x', 1, 'X'), card('x1'), h('xa', 2, 'X.a'), card('xa1'), h('y', 1, 'Y'), card('y1')];
  assert.deepEqual(applyOutlineOps(list, [{ op: 'add', text: 'After X', level: 1, after: 'x' }], ids()).map(b => b.id), ['x', 'x1', 'xa', 'xa1', 'new1', 'y', 'y1']);
  assert.deepEqual(applyOutlineOps(list, [{ op: 'add', text: 'After X.a', level: 2, after: 'xa' }], ids()).map(b => b.id), ['x', 'x1', 'xa', 'xa1', 'new1', 'y', 'y1']);
  assert.deepEqual(applyOutlineOps(list, [{ op: 'add', text: 'First child', level: 2, parent: 'x', after: 'x' }], ids()).map(b => b.id), ['x', 'x1', 'new1', 'xa', 'xa1', 'y', 'y1'], 'after its parent: first child heading, after the parent cards');
  assert.deepEqual(applyOutlineOps(list, [{ op: 'add', text: 'First of Y', level: 2, parent: 'y', after: 'y' }], ids()).map(b => b.id), ['x', 'x1', 'xa', 'xa1', 'y', 'y1', 'new1'], 'a parent with no child heading: the end of its section');
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

// Owner decision, Release A3 item 1: one 120-heading limit, checked against the resulting total, existing headings
// included; over it the whole proposal is refused with how many more fit, and the learner's own edits are never capped.
test('a proposal may take the contents to 120 headings and no further; the refusal says how many more fit', () => {
  assert.equal(MAX_OUTLINE_HEADINGS, 120);
  const existing = n => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, type: 'heading', level: 1, text: `Existing ${i}` }));
  const adds = n => Array.from({ length: n }, (_, i) => ({ op: 'add', key: `a${i}`, text: `New ${i}`, level: 1 }));
  assert.equal(applyOutlineProposal(existing(119), adds(1), { source: 'tutor', newId: ids() }).ok, true, '120 fits');
  const over = applyOutlineProposal(existing(120), adds(1), { source: 'tutor', newId: ids() });
  assert.deepEqual([over.ok, over.reason], [false, 'invalid'], '121 does not');
  assert.equal(over.message, 'This proposal cannot be applied: it adds 1 heading to 120, and the contents hold at most 120: no more fit.');
  assert.match(applyOutlineProposal(existing(100), adds(24), { source: 'tutor', newId: ids() }).message, /adds 24 headings to 100, .*: 20 more fit\.$/);
  assert.match(applyOutlineProposal(existing(119), adds(2), { source: 'tutor', newId: ids() }).message, /: 1 more fits\.$/);
  // Changes that add nothing still apply above the limit, and the learner's own add (no source) is never refused.
  assert.equal(applyOutlineProposal(existing(130), [{ op: 'retitle', id: 'e0', text: 'Renamed' }], { source: 'tutor', newId: ids() }).ok, true);
  const manual = applyOutlineProposal(existing(120), [{ op: 'add', text: 'Mine', level: 1 }], { newId: ids() });
  assert.equal(manual.ok, true);
  assert.equal(manual.blocks.filter(block => block.type === 'heading').length, 121);
  assert.equal(proposalProblem(outlineFrom(existing(120)), { ops: adds(1), source: 'syllabus' }), over.message);
});

test('a syllabus adoption may carry up to 96 changes; anything else stays at 24 (C7b)', () => {
  const topics = n => Array.from({ length: n }, (_, i) => ({ op: 'add', key: `t${i}`, text: `T${i}`, level: 1 }));
  assert.equal(applyOutlineProposal([], topics(96), { source: 'syllabus', newId: ids() }).ok, true);
  assert.equal(applyOutlineProposal([], topics(97), { source: 'syllabus', newId: ids() }).reason, 'invalid');
  assert.equal(applyOutlineProposal([], topics(25), { source: 'tutor', newId: ids() }).reason, 'invalid');
  assert.equal(applyOutlineProposal([], topics(25), { newId: ids() }).reason, 'invalid');
  assert.equal(proposalProblem([], { ops: topics(60), source: 'syllabus' }), null);
  assert.match(proposalProblem([], { ops: topics(60), source: 'tutor' }), /at most 24/);
});

// ---- Owner brief 2026-10-23: Table of contents actions change only the contents' own list, never the canvas. Each test
// drives the canvas command as the panel calls it (TableOfContents.jsx -> canvasApi.applyOutline / moveSection /
// toggleSectionDone / removeSection -> AdaptiveCanvas -> these functions) on a canvas with headings and cards, and checks
// the canvas blocks stay exactly as they were.
import { applyTocAction, moveTocSection, toggleTocDone, removeTocEntry, linkTocHeading, tocOf, tocHeading, tocEntryFor, linkedHeadings, outlinePlan } from './learn-outline-model.js';
import { readFileSync } from 'node:fs';

const canvasBoard = () => [h('t1', 1, 'Kitchen chemistry'), card('c1'), h('s11', 2, 'Maillard browning', true), card('c11'), h('t2', 1, 'Baking'), card('c2')];
let made = 0;
const mint = () => `new-${made += 1}`;
// As the panel's add row sends it (TableOfContents.jsx onBlur), and as the canvas applies it (AdaptiveCanvas applyOutline).
const panelAdd = (blocks, toc, level, text) => applyTocAction(blocks, toc, { changes: [{ op: 'add', level, text, after: null }] }, { newId: mint });
const unchanged = (blocks, label) => assert.deepEqual(blocks, canvasBoard(), `${label}: the canvas objects and their content are unchanged`);

test('TOC: add section creates no canvas object; the first edit copies the canvas headings into the list, linked and with their ids', () => {
  const blocks = canvasBoard();
  const result = panelAdd(blocks, null, 1, 'Fermentation');
  assert.equal(result.ok, true);
  assert.equal('blocks' in result, false);
  unchanged(blocks, 'add section');
  assert.equal(blocks.filter(b => b.type === 'heading').length, 3, 'no heading was added to the canvas');
  assert.deepEqual(result.toc, [
    { id: 't1', level: 1, text: 'Kitchen chemistry', done: false, heading: 't1' },
    { id: 's11', level: 2, text: 'Maillard browning', done: true, heading: 's11' },
    { id: 't2', level: 1, text: 'Baking', done: false, heading: 't2' },
    { id: 'new-1', level: 1, text: 'Fermentation', done: false },
  ]);
  // The outline the panel and the Tutor read: the stored list, as before plus the new section, at the same revision for
  // the copied part, so a proposal made before the first edit still applies.
  assert.deepEqual(outlineFrom(blocks, result.toc).map(e => [e.id, e.level, e.label]), [['t1', 1, 'Kitchen chemistry'], ['s11', 2, 'Maillard browning'], ['t2', 1, 'Baking'], ['new-1', 1, 'Fermentation']]);
  assert.equal(outlineRevision(outlineFrom(blocks, tocOf(blocks, null))), outlineRevision(outlineFrom(blocks)));
});

test('TOC: add subsection lands in the list only; the canvas keeps its count', () => {
  const blocks = canvasBoard();
  const first = panelAdd(blocks, null, 1, 'Fermentation');
  const second = panelAdd(blocks, first.toc, 2, 'Sourdough starters');
  assert.equal(second.ok, true);
  assert.deepEqual(second.toc.at(-1), { id: `new-${made}`, level: 2, text: 'Sourdough starters', done: false });
  assert.equal(second.toc.length, 5);
  assert.deepEqual(outlineFrom(blocks, second.toc).at(-1).level, 2);
  unchanged(blocks, 'add subsection');
});

test('TOC: Apply of a Tutor proposal changes only the list; a repeated Apply is stale and changes nothing', () => {
  const blocks = canvasBoard();
  const base = outlineRevision(outlineFrom(blocks));
  const proposal = { ops: [{ op: 'add', level: 2, text: 'Proofing', parent: 't2', description: 'Why dough rests.' }, { op: 'retitle', id: 't1', text: 'Kitchen science' }], base, source: 'tutor' };
  // As ProposalCard apply() and LearnPage's TOC conversation call it.
  const apply = toc => applyTocAction(blocks, toc, { baseOutlineRevision: proposal.base, changes: proposal.ops }, { source: proposal.source, newId: mint });
  const once = apply(null);
  assert.equal(once.ok, true, once.message);
  assert.equal(once.applied, 2);
  assert.deepEqual(once.toc.map(e => [e.id, e.level, e.text, e.description ?? '', e.heading ?? null]), [
    ['t1', 1, 'Kitchen science', '', 't1'], ['s11', 2, 'Maillard browning', '', 's11'], ['t2', 1, 'Baking', '', 't2'], [once.toc[3].id, 2, 'Proofing', 'Why dough rests.', null],
  ]);
  assert.equal(once.outlineRevision, outlineRevision(outlineFrom(blocks, once.toc)));
  unchanged(blocks, 'Apply');
  for (let i = 0; i < 3; i += 1) {
    const again = apply(once.toc);
    assert.deepEqual([again.ok, again.reason], [false, 'stale'], 'repeated Apply');
    assert.equal(again.toc, undefined);
  }
  unchanged(blocks, 'repeated Apply');
  // The same request asked again on the new contents adds no duplicate either (a twin title is skipped).
  const fresh = applyTocAction(blocks, once.toc, { baseOutlineRevision: once.outlineRevision, changes: [proposal.ops[0]] }, { source: 'tutor', newId: mint });
  assert.deepEqual([fresh.ok, fresh.applied, fresh.skipped], [true, 0, 1]);
  assert.deepEqual(fresh.toc, once.toc);
  // A view-only board takes nothing.
  assert.equal(applyTocAction(blocks, null, { changes: proposal.ops }, { canEdit: false }).reason, 'read_only');
});

test('TOC: edits, ticks, drags and removals of a linked entry change the entry only, never its canvas heading', () => {
  const blocks = canvasBoard();
  const renamed = applyTocAction(blocks, null, { changes: [{ op: 'retitle', id: 's11', text: 'Browning' }, { op: 'describe', id: 's11', description: 'Above 140 C.' }] }, {}).toc;
  assert.deepEqual(renamed[1], { id: 's11', level: 2, text: 'Browning', done: true, heading: 's11', description: 'Above 140 C.' });
  const ticked = toggleTocDone(blocks, renamed, 't2');
  assert.equal(ticked[2].done, true);
  const moved = moveTocSection(blocks, ticked, 't2', 't1');
  assert.deepEqual(moved.map(e => e.id), ['t2', 't1', 's11'], 'the section moves with its sub-sections in the contents');
  assert.deepEqual(moved.find(e => e.id === 's11'), renamed[1], 'an entry keeps what it holds when it moves');
  const removed = removeTocEntry(blocks, moved, 't1');
  assert.deepEqual(removed.map(e => e.id), ['t2', 's11'], 'only the entry goes; its sub-section stays');
  unchanged(blocks, 'edit, tick, drag and remove');
  // A tick on a board still reading its headings stores the copy; the canvas heading's own done is untouched.
  assert.deepEqual(toggleTocDone(blocks, null, 't1').map(e => [e.id, e.done]), [['t1', true], ['s11', true], ['t2', false]]);
  unchanged(blocks, 'first tick');
});

test('TOC: a title frames its linked canvas heading; an entry without one frames nothing; the viewed heading marks its entry', () => {
  const toc = [{ id: 't1', level: 1, text: 'A', done: false, heading: 't1' }, { id: 'n1', level: 1, text: 'B', done: false }];
  assert.equal(tocHeading(toc, 't1'), 't1');
  assert.equal(tocHeading(toc, 'n1'), null, 'nothing on the canvas to frame');
  assert.equal(tocHeading(toc, 'journey-heading'), 'journey-heading', 'a canvas heading id (the journey rail, Resume) frames itself');
  assert.equal(tocHeading(null, 'x'), 'x');
  assert.equal(tocEntryFor(toc, 't1'), 't1');
  assert.equal(tocEntryFor(toc, 's11'), null, 'a canvas heading the contents do not list marks no entry');
  assert.equal(tocEntryFor(null, 's11'), 's11');
});

test('TOC: a journey heading the contents no longer list reads as Section removed; the canvas heading and its cards stay', () => {
  const blocks = [h('notes', 1, 'Notes'), { id: 'hj', type: 'heading', level: 1, text: 'Step 1', journey_section_id: 's1', journey_id: 'j1' }, { id: 'k1', type: 'explanation', journey: { section_id: 's1' } }];
  const journey = { id: 'j1', state: 'active', active_section_id: 's1' }, path = { sections: [{ id: 's1', title: 'Step 1', status: 'current', heading_block_id: 'hj' }] };
  const listed = toggleTocDone(blocks, null, 'notes');
  assert.deepEqual(outlinePlan({ headings: linkedHeadings(blocks, listed), journey, path }).learningNow, { headingId: 'hj' });
  const removed = removeTocEntry(blocks, listed, 'hj');
  const plan = outlinePlan({ headings: linkedHeadings(blocks, removed), journey, path });
  assert.deepEqual(plan.steps.map(s => [s.sectionId, s.state]), [['s1', 'removed']]);
  assert.deepEqual(plan.learningNow, { sectionId: 's1', title: 'Step 1', removed: true });
  assert.equal(blocks.length, 3, 'the canvas heading and its card stay');
  assert.deepEqual(linkedHeadings(blocks, null).map(b => b.id), ['notes', 'hj'], 'a board reading its headings links them all');
  assert.deepEqual(linkTocHeading(removed, { id: 'hj', text: 'Step 1' }).at(-1), { id: 'hj', level: 1, text: 'Step 1', done: false, heading: 'hj' });
  assert.equal(linkTocHeading(listed, { id: 'hj' }), listed, 'already linked: unchanged');
  assert.deepEqual(tocOf(blocks, removed), removed);
});

// The wiring: every Table of contents command on the canvas sets the contents list and never the canvas blocks.
test('TOC: AdaptiveCanvas applyOutline, moveSection, toggleSectionDone, removeSection and linkTocHeading never set the canvas blocks', () => {
  const src = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const start = src.indexOf('      applyOutline: (ops, { base, source, planBase, plan = null } = {}) => {'), end = src.indexOf('      showSection: id => {', start);
  assert.ok(start > 0 && end > start);
  const commands = src.slice(start, end);
  for (const name of ['applyOutline:', 'moveSection:', 'toggleSectionDone:', 'removeSection:', 'linkTocHeading:']) assert.ok(commands.includes(name), name);
  assert.doesNotMatch(commands, /setBlocks|insertBlock|insertHeading/);
  assert.match(commands, /setToc\(result\.toc\)/);
  assert.match(src, /const outline = outlineFrom\(blocks, toc\);/);
  // Saved with the board and restored on load and undo.
  assert.match(src, /useState\(\(\) => \(Array\.isArray\(stored\.current\.toc\) \? stored\.current\.toc : null\)\)/);
  assert.match(src, /if \('toc' in state\) setToc\(state\.toc\);/);
});
