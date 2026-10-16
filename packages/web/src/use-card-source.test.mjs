// A link's card reads (use-card-source.js readCardSource, follow-up R3 item 5 and its security review finding 1): cards of the
// same link, viewer and board version share one read per source - repository, commit, path and stored range for code, the node
// set for a subgraph - however many cards show it; anything that changes the server's answer is a read of its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readCardSource } from './use-card-source.js';
import { cardRequest } from './card-source.js';

const commit = 'a'.repeat(40);
const code = (id, extra = {}) => ({ id, type: 'repo-code', source: { kind: 'repository', app: 'repo-1', repo: 'acme/lab', commit, path: 'm.py', start: 2, end: 9, ...extra } });
const graph = (id, nodeIds, scope = 'subgraph') => ({ id, type: 'repo-graph', repository: { app: 'repo-1', repo: 'acme/lab', commit }, scope, nodeIds });
const upload = (id, assetKey) => ({ id, type: 'repo-code', source: { kind: 'upload', assetKey, name: 'n.py' } });

function stubFetch(t) {
  const original = globalThis.fetch, urls = [];
  globalThis.fetch = async url => { urls.push(String(url)); return new Response(JSON.stringify({ content: 'x', start: 2, graph: { nodes: [], edges: [] } }), { status: 200 }); };
  t.after(() => { globalThis.fetch = original; });
  return urls;
}
const read = (block, scope) => readCardSource(cardRequest(block), block, scope);

test('code cards of one source and range share a read on a link; another range, link, viewer or version reads again', async t => {
  const urls = stubFetch(t), scope = { token: 'tok-code-aaaaaaaaaaaaaaaaaaaa', viewer: null, version: 3 };
  await Promise.all([read(code('c1'), scope), read(code('c2'), scope), read(code('c3'), scope)]);
  assert.equal(urls.length, 1, 'three cards, one read');
  assert.match(urls[0], /\/cards\/c1\/source$/, 'by the first card\'s id');
  await read(code('c4', { end: 10 }), scope);
  await read(code('c5', { path: 'n.py' }), scope);
  await read(code('c6'), { ...scope, token: 'tok-other-aaaaaaaaaaaaaaaaaaa' });
  await read(code('c7'), { ...scope, viewer: 'ben@test' });
  await read(code('c8'), { ...scope, version: 4 });
  assert.equal(urls.length, 6);
});

test('subgraph cards share a read for the same node set in any order; another set, or the whole graph, reads again', async t => {
  const urls = stubFetch(t), scope = { token: 'tok-graph-aaaaaaaaaaaaaaaaaaa', viewer: null, version: 1 };
  await Promise.all([read(graph('g1', ['a', 'b']), scope), read(graph('g2', ['b', 'a']), scope)]);
  assert.equal(urls.length, 1);
  await read(graph('g3', ['a']), scope);
  await Promise.all([read(graph('g4', [], 'whole'), scope), read(graph('g5', ['a', 'b'], 'whole'), scope)]);
  assert.equal(urls.length, 3, 'one read for the subset, one for the whole graph however its node list reads');
});

test('upload cards of one file share the link\'s asset read', async t => {
  const urls = stubFetch(t), scope = { token: 'tok-upload-aaaaaaaaaaaaaaaaaa', viewer: null, version: 1 };
  await Promise.all([read(upload('u1', 'k1'), scope), read(upload('u2', 'k1'), scope)]);
  await read(upload('u3', 'k2'), scope);
  assert.deepEqual(urls.map(u => u.split('/assets/')[1]), ['k1', 'k2']);
});
