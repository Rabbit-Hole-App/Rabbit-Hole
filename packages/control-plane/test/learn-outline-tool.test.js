import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OUTLINE_TOOL, validateOutlineOps } from '../src/learn-outline-tool.js';

const outline = [
  { id: 'h1', level: 1, label: 'Attention', done: false },
  { id: 'h2', level: 2, label: 'Queries and keys', done: false },
];

test('the tool is the plain Anthropic shape, like the arXiv tools', () => {
  assert.equal(typeof OUTLINE_TOOL.name, 'string');
  assert.equal(typeof OUTLINE_TOOL.description, 'string');
  assert.equal(OUTLINE_TOOL.input_schema.type, 'object');
  assert.deepEqual(OUTLINE_TOOL.input_schema.required, ['ops']);
});

// Four verbs: describe joined for heading descriptions (owner decision 3A, contract C5). Move and delete are absent on
// purpose: a list of titles cannot show that moving a section reflows the cards below it.
test('the vocabulary is add, retitle, describe and set_level only', () => {
  const ops = OUTLINE_TOOL.input_schema.properties.ops.items.properties.op.enum;
  assert.deepEqual([...ops].sort(), ['add', 'describe', 'retitle', 'set_level']);
});

test('adding a section is accepted, with or without a place to put it', () => {
  assert.deepEqual(validateOutlineOps([{ op: 'add', text: 'Positional encoding', level: 1 }], outline),
    [{ op: 'add', text: 'Positional encoding', level: 1, after: null }]);
  assert.equal(validateOutlineOps([{ op: 'add', text: 'Why sin and cos', level: 2, after: 'h1' }], outline)[0].after, 'h1');
});

test('retitle and set_level address a heading that exists', () => {
  assert.deepEqual(validateOutlineOps([{ op: 'retitle', id: 'h2', text: 'Keys and queries' }], outline),
    [{ op: 'retitle', id: 'h2', text: 'Keys and queries' }]);
  assert.deepEqual(validateOutlineOps([{ op: 'set_level', id: 'h2', level: 1 }], outline),
    [{ op: 'set_level', id: 'h2', level: 1 }]);
});

// The model is answering from an outline the client sent; an id outside it is
// either a hallucination or a stale turn, and neither should touch the canvas.
test('an id the client never sent is refused', () => {
  for (const ops of [
    [{ op: 'retitle', id: 'nope', text: 'x' }],
    [{ op: 'set_level', id: 'nope', level: 2 }],
    [{ op: 'add', text: 'x', level: 1, after: 'nope' }],
  ]) assert.throws(() => validateOutlineOps(ops, outline), /outline/i, JSON.stringify(ops));
});

test('an id minted earlier in the same batch can be built on', () => {
  const ops = validateOutlineOps([
    { op: 'add', text: 'Positional encoding', level: 1, key: 'new1' },
    { op: 'add', text: 'Why sin and cos', level: 2, after: 'new1' },
  ], outline);
  assert.equal(ops[1].after, 'new1');
});

test('nonsense is refused rather than partly applied', () => {
  for (const ops of [
    'not an array',
    [],
    [{ op: 'delete', id: 'h1' }],
    [{ op: 'move', id: 'h1', after: 'h2' }],
    [{ op: 'add', level: 1 }],
    [{ op: 'add', text: '   ', level: 1 }],
    [{ op: 'add', text: 'x', level: 9 }],
    [{ op: 'retitle', id: 'h1' }],
    [{ op: 'set_level', id: 'h1', level: 0 }],
    [{ op: 'add', text: 'x'.repeat(201), level: 1 }],
  ]) assert.throws(() => validateOutlineOps(ops, outline), undefined, JSON.stringify(ops));
});

// 24, raised from 12 so adopting a Tutor syllabus is one proposal (owner decision 5B, contract C5).
test('a batch is bounded, so one turn cannot rewrite a whole lesson', () => {
  const many = Array.from({ length: 25 }, (_, i) => ({ op: 'add', text: `S${i}`, level: 1 }));
  assert.throws(() => validateOutlineOps(many, outline), /at once|too many/i);
  assert.equal(validateOutlineOps(many.slice(0, 24), outline).length, 24);
});

// Proposing against a lesson with no sections yet is the common first case.
test('an empty outline still accepts adds, but nothing that addresses an id', () => {
  assert.equal(validateOutlineOps([{ op: 'add', text: 'First', level: 1 }], []).length, 1);
  assert.throws(() => validateOutlineOps([{ op: 'retitle', id: 'h1', text: 'x' }], []));
});

// Contract C5 (owner decision 4A): a subtopic goes under an existing topic, by stable id, one level deeper.
const tree = [
  { id: 'a', level: 1, label: 'Attention', done: true },
  { id: 'a1', level: 2, label: 'Queries and keys', done: false },
  { id: 'a1x', level: 3, label: 'Scaling', done: false },
  { id: 'b', level: 1, label: 'Training', done: false },
  { id: 'b1', level: 2, label: 'Loss', done: false },
];

test('an add under a parent carries the parent and its description; the level is one deeper than the parent', () => {
  assert.deepEqual(validateOutlineOps([{ op: 'add', text: ' Multi-head ', level: 2, parent: 'a', description: ' Several attention patterns side by side. ' }], tree),
    [{ op: 'add', text: 'Multi-head', level: 2, after: null, parent: 'a', description: 'Several attention patterns side by side.' }]);
  assert.deepEqual(validateOutlineOps([{ op: 'add', text: 'Softmax', level: 3, parent: 'a1', after: 'a1x' }], tree)[0], { op: 'add', text: 'Softmax', level: 3, after: 'a1x', parent: 'a1' });
  assert.equal('description' in validateOutlineOps([{ op: 'add', text: 'x', level: 2, parent: 'a', description: '' }], tree)[0], false, 'an empty description is none');
  for (const op of [
    { op: 'add', text: 'x', level: 3, parent: 'a' },
    { op: 'add', text: 'x', level: 1, parent: 'a' },
    { op: 'add', text: 'x', level: 2, parent: 'a1x' },
  ]) assert.throws(() => validateOutlineOps([op], tree), /deeper|level/i, JSON.stringify(op));
});

test('with a parent, after is the parent itself or inside its subtree; anything else is refused', () => {
  for (const after of ['a', 'a1', 'a1x']) assert.equal(validateOutlineOps([{ op: 'add', text: 'x', level: 2, parent: 'a', after }], tree)[0].after, after);
  for (const after of ['b', 'b1']) assert.throws(() => validateOutlineOps([{ op: 'add', text: 'x', level: 2, parent: 'a', after }], tree), /not inside/);
  assert.throws(() => validateOutlineOps([{ op: 'add', text: 'x', level: 2, parent: 'nope' }], tree), /No section nope/);
});

test('a syllabus adoption builds topics and their subtopics from keys minted earlier in the same proposal', () => {
  const ops = validateOutlineOps([
    { op: 'add', key: 'k1', text: 'Tides', level: 1, description: 'Why the sea rises and falls.' },
    { op: 'add', key: 'k1s1', text: 'The moon', level: 2, parent: 'k1' },
    { op: 'add', key: 'k1s2', text: 'The sun', level: 2, parent: 'k1', after: 'k1s1' },
    { op: 'add', key: 'k2', text: 'Tide tables', level: 1 },
    { op: 'add', text: 'Reading heights', level: 2, parent: 'k2' },
  ], []);
  assert.deepEqual(ops.map(op => [op.text, op.parent ?? null]), [['Tides', null], ['The moon', 'k1'], ['The sun', 'k1'], ['Tide tables', null], ['Reading heights', 'k2']]);
  // k2 was appended after k1's subtree, so it is not inside k1.
  assert.throws(() => validateOutlineOps([
    { op: 'add', key: 'k1', text: 'Tides', level: 1 }, { op: 'add', key: 'k2', text: 'Tables', level: 1 },
    { op: 'add', text: 'x', level: 2, parent: 'k1', after: 'k2' },
  ], []), /not inside/);
  assert.throws(() => validateOutlineOps([{ op: 'add', key: 'a', text: 'x', level: 1 }], tree), /key/, 'a key never shadows an existing id');
  assert.throws(() => validateOutlineOps([{ op: 'add', key: 'k', text: 'x', level: 1 }, { op: 'add', key: 'k', text: 'y', level: 1 }], tree), /key/, 'keys are unique');
});

test('a level change earlier in the proposal is the structure later ops see', () => {
  assert.throws(() => validateOutlineOps([{ op: 'add', text: 'x', level: 3, parent: 'b' }], tree));
  assert.equal(validateOutlineOps([{ op: 'set_level', id: 'b', level: 2 }, { op: 'add', text: 'x', level: 3, parent: 'b' }], tree).length, 2);
});

test('describe sets an existing heading\'s description, 1-240 characters, by id', () => {
  assert.deepEqual(validateOutlineOps([{ op: 'describe', id: 'b1', description: ' How wrong a prediction is. ' }], tree), [{ op: 'describe', id: 'b1', description: 'How wrong a prediction is.' }]);
  for (const op of [{ op: 'describe', id: 'b1' }, { op: 'describe', id: 'b1', description: '  ' }, { op: 'describe', id: 'b1', description: 'x'.repeat(241) }, { op: 'describe', id: 'zz', description: 'x' }])
    assert.throws(() => validateOutlineOps([op], tree), undefined, JSON.stringify(op));
  assert.throws(() => validateOutlineOps([{ op: 'add', text: 'x', level: 1, description: 'x'.repeat(241) }], tree), /240/);
  assert.equal(validateOutlineOps([{ op: 'describe', id: 'b1', description: 'x'.repeat(240) }], tree)[0].description.length, 240);
});

// Owner decision, Release A3 item 1: a Tutor proposal never takes the contents past 120; the refusal says how many fit.
test('adds that would take the contents past 120 headings are refused with how many more fit', () => {
  const outline = n => Array.from({ length: n }, (_, i) => ({ id: `h${i}`, level: 1, label: `S${i}`, done: false }));
  const adds = n => Array.from({ length: n }, (_, i) => ({ op: 'add', text: `New ${i}`, level: 1 }));
  assert.equal(validateOutlineOps(adds(1), outline(119)).length, 1);
  assert.throws(() => validateOutlineOps(adds(1), outline(120)), /^Error: The table of contents holds at most 120 headings and has 120: no more fit$/);
  assert.throws(() => validateOutlineOps(adds(3), outline(118)), /has 118: 2 more fit$/);
  assert.equal(validateOutlineOps([{ op: 'retitle', id: 'h0', text: 'R' }], outline(120)).length, 1, 'a rename adds nothing');
});

test('one bad op refuses the whole proposal', () => {
  assert.throws(() => validateOutlineOps([{ op: 'add', text: 'fine', level: 2, parent: 'a' }, { op: 'add', text: 'bad', level: 2, parent: 'missing' }], tree));
});
