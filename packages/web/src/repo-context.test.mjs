import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSelection, contextRef, dropRef, graphRefs, nodeRef, rangeRef, refWhere, selectionRefs, turnRefs } from './repo-context.js';
import { MAX_REFS, sameRef } from './chat-context.js';

const commit = 'a'.repeat(40);
const graph = { nodes: [
  { id: 'model_py', label: 'model.py', path: 'src/model.py', line: 1 },
  { id: 'forward', label: 'forward()', path: 'src/model.py', line: 12 },
  { id: 'other_model', label: 'model.py', path: 'tests/model.py', line: 1 },
  { id: 'torch', label: 'torch', path: null },
  { id: 'd1', label: 'A decision', kind: 'decision' },
], edges: [] };
function repo(over = {}) {
  const state = { selected: [], context: null };
  const r = {
    app: { repo: 'karpathy/nanoGPT' }, snapshot: { commit, graph },
    graph: { get selected() { return state.selected; }, setSelected: v => { state.selected = v; } },
    get context() { return state.context; }, setContext: v => { state.context = v; },
    ...over,
  };
  return { r, state };
}

test('a file node and the same file from Files are one ref; same name at another path or commit is another', () => {
  const { r } = repo();
  const fromGraph = nodeRef(r, graph.nodes[0]), fromFiles = contextRef(r, { kind: 'file', path: 'src/model.py', id: 'file:src/model.py' });
  assert.ok(sameRef(fromGraph, fromFiles));
  assert.equal(fromGraph.sourceId, `code:karpathy/nanoGPT@${commit}:src/model.py`);
  assert.ok(!sameRef(fromGraph, nodeRef(r, graph.nodes[2])));
  const later = repo({ snapshot: { commit: 'b'.repeat(40), graph } }).r;
  assert.ok(!sameRef(fromGraph, nodeRef(later, graph.nodes[0])));
});

test('a symbol keeps its node id; ranges of one file stay distinct', () => {
  const { r } = repo();
  const symbol = nodeRef(r, graph.nodes[1]);
  assert.equal(symbol.sourceId, `code:karpathy/nanoGPT@${commit}:src/model.py#forward`);
  assert.equal(symbol.kind, 'code'); assert.equal(symbol.version, commit); assert.deepEqual(symbol.range, { path: 'src/model.py', start: 12, end: 12 });
  assert.equal(nodeRef(r, graph.nodes[3]).range, null);
  assert.ok(!sameRef(rangeRef(r, { path: 'src/model.py', start: 1, end: 5 }), rangeRef(r, { path: 'src/model.py', start: 6, end: 9 })));
  assert.deepEqual(rangeRef(r, { path: 'src/model.py', start: 3, end: 4 }).range, { path: 'src/model.py', start: 3, end: 4 });
  assert.match(refWhere(symbol), /karpathy\/nanoGPT › src\/model\.py:12 · aaaaaaa/);
  assert.match(refWhere(nodeRef(r, graph.nodes[3])), /external/);
});

test('temporary refs: graph nodes then the Files selection, once each; fixture records never ride', () => {
  const { r, state } = repo();
  state.selected = ['model_py', 'forward', 'd1', 'gone'];
  state.context = { kind: 'file', path: 'src/model.py', id: 'file:src/model.py' };
  const refs = selectionRefs(r);
  assert.equal(refs.length, 2);
  assert.equal(graphRefs(r).length, 2);
  assert.deepEqual(selectionRefs(repo({ snapshot: null }).r), []);
});

test('removing a chip drops its node and the Files selection that made it; clear empties both', () => {
  const { r, state } = repo();
  state.selected = ['model_py', 'forward'];
  state.context = { kind: 'file', path: 'src/model.py' };
  dropRef(r, nodeRef(r, graph.nodes[0]));
  assert.deepEqual(state.selected, ['forward']);
  assert.equal(state.context, null);
  clearSelection(r);
  assert.deepEqual(state.selected, []);
});

test('turn refs: pinned first, a pinned temporary ref is not sent twice, the rest stop at the server limit', () => {
  const { r } = repo();
  const pinned = [nodeRef(r, graph.nodes[0])];
  const temporary = [nodeRef(r, graph.nodes[0]), nodeRef(r, graph.nodes[1])];
  const turn = turnRefs(pinned, temporary);
  assert.equal(turn.refs.length, 2); assert.equal(turn.temporary.length, 1); assert.equal(turn.left.length, 0);
  const many = Array.from({ length: MAX_REFS }, (_, i) => rangeRef(r, { path: 'a.py', start: i + 1, end: i + 1 }));
  const full = turnRefs(many.slice(0, 19), [nodeRef(r, graph.nodes[1]), nodeRef(r, graph.nodes[3])]);
  assert.equal(full.refs.length, MAX_REFS); assert.equal(full.left.length, 1);
});
