import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syllabusToOutlineOps, syllabusProposal } from './syllabus-outline.js';
import { outlineFrom, outlineRevision, applyOutlineProposal, MAX_OUTLINE_HEADINGS } from './learn-outline-model.js';

const syllabus = {
  goal: 'Read a tide table',
  topics: [
    { id: 't1', title: 'Tides', description: 'Why the sea rises and falls.', objectives: ['Explain the bulges'], subtopics: [{ id: 't1.1', title: 'The moon', description: 'Its pull makes the bulges.' }, { id: 't1.2', title: 'The sun' }], refs: [] },
    { id: 't2', title: 'Tide tables', objectives: ['Read a height'], refs: [] },
  ],
};
let n = 0;
const newId = () => `b${n += 1}`;
const adopt = (blocks, proposal) => applyOutlineProposal(blocks, proposal.ops, { base: proposal.base, newId });

test('empty contents: each topic becomes a level-1 heading with its description, its subtopics level-2 headings under it', () => {
  const ops = syllabusToOutlineOps(syllabus, []);
  assert.deepEqual(ops, [
    { op: 'add', key: 'syllabus-1', text: 'Tides', level: 1, description: 'Why the sea rises and falls.' },
    { op: 'add', text: 'The moon', level: 2, parent: 'syllabus-1', description: 'Its pull makes the bulges.' },
    { op: 'add', text: 'The sun', level: 2, parent: 'syllabus-1' },
    { op: 'add', key: 'syllabus-2', text: 'Tide tables', level: 1 },
  ]);
  const result = adopt([], syllabusProposal(syllabus, []));
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(outlineFrom(result.blocks).map(e => [e.level, e.label, e.description, e.done]), [
    [1, 'Tides', 'Why the sea rises and falls.', false], [2, 'The moon', 'Its pull makes the bulges.', false], [2, 'The sun', '', false], [1, 'Tide tables', '', false],
  ]);
});

test('adopting again proposes nothing, and an Apply of the old proposal is stale, so re-adoption never duplicates', () => {
  const proposal = syllabusProposal(syllabus, []);
  const first = adopt([], proposal);
  assert.deepEqual(syllabusToOutlineOps(syllabus, outlineFrom(first.blocks)), []);
  assert.deepEqual(adopt(first.blocks, proposal), { ok: false, reason: 'stale', message: 'The contents changed since this proposal. Ask the Tutor again.' });
});

test('existing contents: a matched topic gets only its missing subtopics and a description it lacks; titles and descriptions are never overwritten', () => {
  const blocks = [
    { id: 'h1', type: 'heading', level: 1, text: '  tides ', done: true },
    { id: 'c1', type: 'explanation' },
    { id: 'h2', type: 'heading', level: 2, text: 'THE MOON', description: 'My own words.', done: true },
    { id: 'h3', type: 'heading', level: 1, text: 'Waves', description: 'Kept.' },
  ];
  const outline = outlineFrom(blocks);
  const ops = syllabusToOutlineOps(syllabus, outline);
  assert.deepEqual(ops, [
    { op: 'describe', id: 'h1', description: 'Why the sea rises and falls.' },
    { op: 'add', text: 'The sun', level: 2, parent: 'h1' },
    { op: 'add', key: 'syllabus-2', text: 'Tide tables', level: 1 },
  ]);
  const result = adopt(blocks, syllabusProposal(syllabus, outline));
  assert.equal(result.ok, true, result.message);
  const after = outlineFrom(result.blocks);
  assert.deepEqual(after.map(e => [e.id, e.label, e.done]).slice(0, 2), [['h1', 'tides', true], ['h2', 'THE MOON', true]], 'existing headings keep their ids, titles and completion');
  assert.equal(after.find(e => e.id === 'h2').description, 'My own words.');
  assert.equal(after.find(e => e.id === 'h3').description, 'Kept.');
  assert.deepEqual(after.map(e => e.label), ['tides', 'THE MOON', 'The sun', 'Waves', 'Tide tables'], 'the new subtopic lands in its topic, the new topic at the end');
  assert.equal(result.blocks.findIndex(b => b.id === 'c1') < result.blocks.findIndex(b => b.text === 'The sun'), true, 'the topic keeps its cards ahead of the new subtopic');
});

test('a described heading gets no describe; a sub-heading of the same title under another topic does not count as present', () => {
  const outline = [{ id: 'a', level: 1, label: 'Tides', done: false, description: 'Mine.' }, { id: 'b', level: 1, label: 'Other', done: false, description: '' }, { id: 'c', level: 2, label: 'The sun', done: false, description: '' }];
  assert.deepEqual(syllabusToOutlineOps({ topics: [syllabus.topics[0]] }, outline), [
    { op: 'add', text: 'The moon', level: 2, parent: 'a', description: 'Its pull makes the bulges.' },
    { op: 'add', text: 'The sun', level: 2, parent: 'a' },
  ]);
});

test('an old syllabus without descriptions or subtopics adopts as plain level-1 topics; the proposal carries the current revision', () => {
  const old = { goal: 'g', topics: [{ id: 't1', title: 'Nodes', objectives: ['Draw a node'], refs: [] }] };
  const outline = [{ id: 'x', level: 1, label: 'Intro', done: false, description: '' }];
  assert.deepEqual(syllabusProposal(old, outline), { ops: [{ op: 'add', key: 'syllabus-1', text: 'Nodes', level: 1 }], base: outlineRevision(outline), source: 'syllabus' });
  assert.deepEqual(syllabusToOutlineOps({ topics: [] }, outline), []);
});

// The page caps a syllabus proposal at 96 ops (lead ruling C8 size A); the contents' 120-heading limit is the test below.
test('the largest valid syllabus (12 topics, 6 subtopics each) stays within the 96-op cap, on empty and on matching contents', () => {
  const big = { topics: Array.from({ length: 12 }, (_, i) => ({ title: `Unit ${i + 1}`, description: 'd', objectives: ['o'], subtopics: Array.from({ length: 6 }, (_, j) => ({ title: `Part ${j + 1}` })) })) };
  assert.equal(syllabusToOutlineOps(big, []).length, 84);
  const titlesOnly = big.topics.map((t, i) => ({ id: `u${i}`, level: 1, label: t.title, done: false, description: '' }));
  assert.equal(syllabusToOutlineOps(big, titlesOnly).length, 84, '12 describes and 72 subtopic adds');
  // Applying 84 is the page's cap (PANEL 5b9343ef, table-of-contents tests) and toc-tutor-check step 8 on the release.
});

// Owner decision, Release A3 item 1: adoption is checked against the resulting total, existing headings included. The
// largest syllabus (84 headings) fits empty contents and fits beside 36 others; beside 37 the whole adoption is refused
// with how many more fit, and the existing contents stay exactly as they were.
test('the largest syllabus adopts into empty contents and into existing ones that leave room; past 120 nothing applies', () => {
  const big = { topics: Array.from({ length: 12 }, (_, i) => ({ title: `Unit ${i + 1}`, description: 'd', objectives: ['o'], subtopics: Array.from({ length: 6 }, (_, j) => ({ title: `Part ${j + 1}` })) })) };
  // As the page applies it: with the proposal's source, so the syllabus op cap and the heading limit both hold.
  const adoptAll = (blocks, proposal) => applyOutlineProposal(blocks, proposal.ops, { base: proposal.base, source: proposal.source, newId });
  const headings = blocks => blocks.filter(block => block.type === 'heading').length;
  const empty = adoptAll([], syllabusProposal(big, []));
  assert.equal(empty.ok, true);
  assert.equal(headings(empty.blocks), 84);
  const others = n => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, type: 'heading', level: 1, text: `Mine ${i}`, done: false }));
  const fits = adoptAll(others(36), syllabusProposal(big, outlineFrom(others(36))));
  assert.equal(fits.ok, true);
  assert.equal(headings(fits.blocks), MAX_OUTLINE_HEADINGS);
  assert.deepEqual(fits.blocks.slice(0, 36), others(36), 'the existing headings are kept, in order');
  const before = others(37);
  const over = adoptAll(before, syllabusProposal(big, outlineFrom(before)));
  assert.deepEqual([over.ok, over.reason], [false, 'invalid']);
  assert.equal(over.message, 'This proposal cannot be applied: it adds 84 headings to 37, and the contents hold at most 120: 83 more fit.');
  assert.equal(over.blocks, undefined, 'nothing partly applied');
  assert.deepEqual(before, others(37), 'the existing contents are untouched');
  // A matching topic adds only its missing subtopics, so the same syllabus beside its own titles counts 72 new headings.
  const titles = big.topics.map((t, i) => ({ id: `u${i}`, type: 'heading', level: 1, text: t.title, done: false }));
  assert.equal(adoptAll([...titles, ...others(36)], syllabusProposal(big, outlineFrom([...titles, ...others(36)]))).ok, true, '12 + 36 + 72 = 120');
  assert.match(adoptAll([...titles, ...others(37)], syllabusProposal(big, outlineFrom([...titles, ...others(37)]))).message, /adds 72 headings to 49, .*: 71 more fit\.$/);
});

// Owner brief 2026-10-23: the page adopts a syllabus into the Table of contents' own list (AdaptiveCanvas applyOutline ->
// applyTocAction). The canvas keeps every object as it was and gains no heading; the 120 limit counts the list.
test('adoption as the page applies it changes the contents only: no canvas heading, the limit counts the stored list', async () => {
  const { applyTocAction, tocOf } = await import('./learn-outline-model.js');
  const canvas = [{ id: 'k1', type: 'explanation', dx: 0, dy: 0, title: 'Course notes', body: 'Where the course starts.' }];
  const before = structuredClone(canvas);
  const adoptToc = (toc, proposal) => applyTocAction(canvas, toc, { baseOutlineRevision: proposal.base, changes: proposal.ops }, { source: proposal.source, newId });
  const first = adoptToc(null, syllabusProposal(syllabus, outlineFrom(canvas)));
  assert.equal(first.ok, true, first.message);
  assert.equal('blocks' in first, false, 'the answer carries no canvas blocks');
  assert.deepEqual(first.toc.map(e => [e.level, e.text, e.description || '', e.done]), [
    [1, 'Tides', 'Why the sea rises and falls.', false], [2, 'The moon', 'Its pull makes the bulges.', false], [2, 'The sun', '', false], [1, 'Tide tables', '', false],
  ]);
  assert.ok(first.toc.every(e => e.heading === undefined), 'new entries link no canvas heading');
  assert.deepEqual(canvas, before, 'the canvas is untouched');
  // Adopting the same syllabus again proposes nothing; Apply of the old proposal is stale.
  assert.deepEqual(syllabusToOutlineOps(syllabus, outlineFrom(canvas, first.toc)), []);
  assert.equal(adoptToc(first.toc, syllabusProposal(syllabus, outlineFrom(canvas))).reason, 'stale');
  const big = { topics: Array.from({ length: 12 }, (_, i) => ({ title: `Unit ${i + 1}`, objectives: ['o'], subtopics: Array.from({ length: 6 }, (_, j) => ({ title: `Part ${j + 1}` })) })) };
  const mine = n => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, level: 1, text: `Mine ${i}`, done: false }));
  assert.equal(adoptToc(mine(36), syllabusProposal(big, outlineFrom(canvas, mine(36)))).toc.length, MAX_OUTLINE_HEADINGS);
  assert.match(adoptToc(mine(37), syllabusProposal(big, outlineFrom(canvas, mine(37)))).message, /adds 84 headings to 37, .*: 83 more fit\.$/);
  assert.deepEqual(canvas, before, 'still untouched');
  assert.deepEqual(tocOf(canvas, null), [], 'a canvas without headings starts with empty contents');
});
