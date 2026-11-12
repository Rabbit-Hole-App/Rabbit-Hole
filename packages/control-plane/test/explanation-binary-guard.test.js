// Owner check 2026-11-08: the binary tree layout is kept only for binary / heap / BST questions; elsewhere the same tree is drawn with the default layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPLANATION_GUIDANCE, plainTreesUnlessBinary } from '../src/learn-primitives.js';

const tree = { version: 1, diagram: { kind: 'tree', title: 'Family', layout: 'binary', nodes: [
  { id: 'a', label: 'Grandparent' }, { id: 'b', label: 'Parent one', parent: 'a', side: 'left' }, { id: 'c', label: 'Parent two', parent: 'a', side: 'right' }] } };
const body = spec => `Intro text.\n\n\`\`\`rh-diagram\n${JSON.stringify(spec)}\n\`\`\`\n\nMore text.`;
const diagramOf = md => JSON.parse(md.match(/```rh-diagram\n([\s\S]*?)\n```/)[1]).diagram;

test('a binary tree outside a binary question is drawn as the ordinary tree (no layout, no sides)', () => {
  const d = diagramOf(plainTreesUnlessBinary(body(tree), 'How is a family tree organized?'));
  assert.equal(d.kind, 'tree');
  assert.equal(d.layout, undefined);
  assert.ok(d.nodes.every(n => n.side === undefined));
  assert.deepEqual(d.nodes.map(n => [n.id, n.label, n.parent]), [['a', 'Grandparent', undefined], ['b', 'Parent one', 'a'], ['c', 'Parent two', 'a']]);
});

test('binary, heap and BST questions keep the binary layout byte for byte', () => {
  for (const q of ['How does a binary search tree work?', 'How does a min heap work?', 'Explain a BST insert']) assert.equal(plainTreesUnlessBinary(body(tree), q), body(tree), q);
});

test('a binary question turns an ordinary tree with at most two children per node into the binary layout, sides in written order', () => {
  const plain = { version: 1, diagram: { kind: 'tree', title: 'Heap', nodes: [{ id: 'a', label: 'Root 1' }, { id: 'b', label: 'Child 3', parent: 'a' }, { id: 'c', label: 'Child 5', parent: 'a' }, { id: 'd', label: 'Leaf 4', parent: 'b' }] } };
  const d = diagramOf(plainTreesUnlessBinary(body(plain), 'How does a binary heap work?'));
  assert.equal(d.layout, 'binary');
  assert.deepEqual(d.nodes.map(n => [n.id, n.side]), [['a', undefined], ['b', 'left'], ['c', 'right'], ['d', 'left']]);
  const wide = { version: 1, diagram: { ...plain.diagram, nodes: [...plain.diagram.nodes, { id: 'e', label: 'Child 7', parent: 'a' }] } };
  assert.equal(plainTreesUnlessBinary(body(wide), 'How does a binary heap work?'), body(wide), 'three children under one node stay an ordinary tree');
});

test('the guidance names the binary layout', () => {
  assert.match(EXPLANATION_GUIDANCE, /For a binary tree use kind "tree" with layout "binary"; give each child its side\./);
  assert.doesNotMatch(EXPLANATION_GUIDANCE, /For an operation on a binary tree or BST/, 'the operation paragraph is dead text: the server guard decides the layout (owner 2026-11-08 clean-up)');
});
