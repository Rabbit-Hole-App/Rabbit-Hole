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

// Only three verbs. Move and delete are absent on purpose: a list of titles
// cannot show that moving a section reflows the cards below it.
test('the vocabulary is add, retitle and set_level only', () => {
  const ops = OUTLINE_TOOL.input_schema.properties.ops.items.properties.op.enum;
  assert.deepEqual([...ops].sort(), ['add', 'retitle', 'set_level']);
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

test('a batch is bounded, so one turn cannot rewrite a whole lesson', () => {
  const many = Array.from({ length: 13 }, (_, i) => ({ op: 'add', text: `S${i}`, level: 1 }));
  assert.throws(() => validateOutlineOps(many, outline), /at once|too many/i);
  assert.equal(validateOutlineOps(many.slice(0, 12), outline).length, 12);
});

// Proposing against a lesson with no sections yet is the common first case.
test('an empty outline still accepts adds, but nothing that addresses an id', () => {
  assert.equal(validateOutlineOps([{ op: 'add', text: 'First', level: 1 }], []).length, 1);
  assert.throws(() => validateOutlineOps([{ op: 'retitle', id: 'h1', text: 'x' }], []));
});
