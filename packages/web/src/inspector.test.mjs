// The Map inspector's facts (docs/features/inspector.md): only what the snapshot stores, the graph's own relation names,
// and the conversation asked about an object while it was in context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextOf, fileObject, languageOf, objectOf, relationshipGroups, symbolsIn, turnsAbout, typeOf } from './inspector.js';

// Graphify's shape as the indexer stores it (index_repository.py): a file node named after its file, symbols, an external.
const graph = {
  nodes: [
    { id: 'model', label: 'model.py', path: 'model.py', line: 1, kind: 'code' },
    { id: 'model_gpt', label: 'GPT', path: 'model.py', line: 118, kind: 'code' },
    { id: 'model_block', label: 'Block', path: 'model.py', line: 94, kind: 'code' },
    { id: 'model_gpt_forward', label: '.forward()', path: 'model.py', line: 170, kind: 'symbol' },
    { id: 'train', label: 'train.py', path: 'train.py', line: 1, kind: 'code' },
    { id: 'torch', label: 'torch', path: null, line: 1, kind: 'external' },
  ],
  edges: [
    { source: 'model', target: 'model_gpt', relation: 'contains', confidence: 'EXTRACTED' },
    { source: 'model', target: 'model_block', relation: 'contains', confidence: 'EXTRACTED' },
    { source: 'model', target: 'torch', relation: 'imports', confidence: 'EXTRACTED' },
    { source: 'train', target: 'model', relation: 'imports_from', confidence: 'EXTRACTED' },
    { source: 'model_gpt', target: 'model_gpt_forward', relation: 'method', confidence: 'EXTRACTED' },
    { source: 'train', target: 'model_gpt_forward', relation: 'calls', confidence: 'INFERRED' },
  ],
};

test('a Files row and its graph node are one object, with the file context id', () => {
  const row = fileObject(graph, 'model.py');
  assert.deepEqual(row, { id: 'file:model.py', label: 'model.py', kind: 'file', path: 'model.py', line: 1, commit: null, nodeId: 'model' });
  assert.deepEqual(objectOf(graph, graph.nodes[0]), row);
  assert.equal(fileObject(graph, 'configurator.py').nodeId, null); // no node: no edges are invented for it
  assert.deepEqual(objectOf(graph, graph.nodes[3]), { id: 'model_gpt_forward', kind: 'symbol', label: '.forward()', path: 'model.py', line: 170, nodeId: 'model_gpt_forward' });
  assert.deepEqual(objectOf(graph, graph.nodes[5]), { id: 'torch', kind: 'external', label: 'torch', path: null, line: null, nodeId: 'torch' });
  assert.deepEqual(contextOf(row, 'abc'), { id: 'file:model.py', kind: 'file', label: 'model.py', path: 'model.py', line: 1, nodeId: 'model', commit: 'abc' });
});

test('type and language come from the extension and the node kind only', () => {
  assert.equal(languageOf('data/shakespeare_char/prepare.py'), 'Python');
  assert.equal(languageOf('README.md'), null);
  assert.equal(typeOf(fileObject(graph, 'model.py')), 'Python file');
  assert.equal(typeOf(fileObject(graph, 'notes.txt')), 'file');
  assert.equal(typeOf({ kind: 'symbol' }), 'Function');
  assert.equal(typeOf({ kind: 'external' }), 'External dependency');
  assert.equal(typeOf({ kind: 'code' }), 'Symbol');
});

test('a file lists the symbols whose path it is, in source order, without itself', () => {
  assert.deepEqual(symbolsIn(graph, 'model.py').map((n) => n.label), ['Block', 'GPT', '.forward()']);
  assert.deepEqual(symbolsIn(graph, 'configurator.py'), []);
});

test('relationships keep the graph\'s relation names, grouped by direction, inferred edges marked', () => {
  const model = relationshipGroups(graph, 'model');
  assert.deepEqual(model.map((g) => [g.label, g.items.map((i) => i.node.label)]), [['Contains', ['GPT', 'Block']], ['Imports', ['torch']], ['Imported by', ['train.py']]]);
  const forward = relationshipGroups(graph, 'model_gpt_forward');
  assert.deepEqual(forward.map((g) => [g.label, g.items.map((i) => [i.node.label, i.inferred])]), [['Method of', [['GPT', false]]], ['Called by', [['train.py', true]]]]);
  assert.deepEqual(relationshipGroups(graph, null), []);
  assert.deepEqual(relationshipGroups({ nodes: [], edges: [{ source: 'a', target: 'b', relation: 'wraps' }] }, 'b'), [{ label: 'Wraps (incoming)', items: [{ node: { id: 'a', label: 'a' }, inferred: true }] }]);
});

test('conversation about an object is the questions and answers asked while it was in context', () => {
  const at = (id) => ({ selected: id ? { id } : null });
  const turns = [
    { id: 1, kind: 'user', scope: at('file:train.py') }, { id: 2, kind: 'answer', scope: at('file:train.py') },
    { id: 3, kind: 'user', scope: at(null) }, { id: 4, kind: 'answer', scope: at(null) },
    { id: 5, kind: 'note', scope: at('file:train.py') }, { id: 6, kind: 'user', scope: at('model') },
  ];
  assert.deepEqual(turnsAbout(turns, 'file:train.py').map((t) => t.id), [1, 2]);
  assert.deepEqual(turnsAbout(turns, 'torch'), []);
});

test('a node shows once per group even when two edges say the same thing, extracted winning over inferred', () => {
  const g = { nodes: [{ id: 'a', label: 'model.py' }, { id: 't', label: 'torch' }], edges: [{ source: 'a', target: 't', relation: 'imports', confidence: 'INFERRED' }, { source: 'a', target: 't', relation: 'imports_from', confidence: 'EXTRACTED' }] };
  assert.deepEqual(relationshipGroups(g, 't'), [{ label: 'Imported by', items: [{ node: { id: 'a', label: 'model.py' }, inferred: false }] }]);
});
