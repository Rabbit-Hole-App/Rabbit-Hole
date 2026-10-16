import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syllabusToOutlineOps, syllabusProposal } from './syllabus-outline.js';
import { outlineFrom, outlineRevision, applyOutlineProposal } from './learn-outline-model.js';

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
