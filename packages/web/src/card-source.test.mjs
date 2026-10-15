import test from 'node:test';
import assert from 'node:assert/strict';
import { cardGraph, cardLines, cardRequest, failureStatus } from './card-source.js';

const commit = 'a'.repeat(40);

test('a card reads only what its source names, and a redacted card reads nothing', () => {
  assert.deepEqual(cardRequest({ type: 'repo-code', source: { kind: 'repository', app: 'repo-1', commit, path: 'm.py', start: 2 } }), { kind: 'file', key: `file:repo-1@${commit}:m.py`, app: 'repo-1', commit, path: 'm.py' });
  assert.deepEqual(cardRequest({ type: 'repo-graph', repository: { app: 'repo-1', commit }, nodeIds: ['a'] }), { kind: 'graph', key: `graph:repo-1@${commit}`, app: 'repo-1', commit });
  assert.deepEqual(cardRequest({ type: 'repo-code', source: { kind: 'upload', assetKey: 'k' } }), { kind: 'upload', key: 'upload:k' });
  for (const block of [null, { type: 'repo-code', redacted: true, source: { kind: 'repository' } }, { type: 'repo-graph', redacted: true }, { type: 'repo-code', source: { kind: 'repository', app: 'repo-1' } }, { type: 'pdf' }]) assert.equal(cardRequest(block), null);
});

test('403 and 404 are unavailable; anything else failed', () => {
  assert.equal(failureStatus({ status: 403 }), 'unavailable');
  assert.equal(failureStatus({ status: 404 }), 'unavailable');
  assert.equal(failureStatus({ status: 500 }), 'failed');
  assert.equal(failureStatus(new Error('offline')), 'failed');
});

test('lines keep the file numbering: a range, start to the end, or the whole file', () => {
  const file = 'a\nb\nc\nd';
  assert.deepEqual(cardLines(file, 2, 3), { text: 'b\nc', lines: [{ n: 2, text: 'b' }, { n: 3, text: 'c' }], totalLines: 4 });
  assert.equal(cardLines(file, 3).text, 'c\nd');
  assert.equal(cardLines(file).lines.length, 4);
  assert.equal(cardLines(file, 2, 99).text, 'b\nc\nd', 'a range past the end stops at the end');
});

test('a subgraph keeps its nodes that still exist and only the edges between them', () => {
  const graph = { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }] };
  assert.deepEqual(cardGraph(graph, ['a', 'b', 'gone']), { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ source: 'a', target: 'b' }] });
  assert.deepEqual(cardGraph(graph, []), graph);
  assert.deepEqual(cardGraph(null, ['a']), { nodes: [], edges: [] });
});
