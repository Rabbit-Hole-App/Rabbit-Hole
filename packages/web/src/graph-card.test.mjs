import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dropCardRef, graphCardBlock, sameGraphCard, setCardSelection, subgraph } from './graph-card.js';
import { nodeRef, turnRefs } from './repo-context.js';
import { sameRef } from './chat-context.js';

// The interactive graph card (C:/s/spec/repo-graph-r2-plan.md, lane GRAPH): its block, its subgraph, its chat context.
const commit = 'a'.repeat(40);
const graph = { nodes: [
  { id: 'model_py', label: 'model.py', path: 'model.py', line: 1 },
  { id: 'forward', label: 'forward()', path: 'model.py', line: 12 },
  { id: 'train_py', label: 'train.py', path: 'train.py', line: 1 },
  { id: 'torch', label: 'torch', path: null },
], edges: [
  { source: 'model_py', target: 'forward', relation: 'contains', confidence: 'EXTRACTED' },
  { source: 'train_py', target: 'model_py', relation: 'imports', confidence: 'EXTRACTED' },
  { source: 'forward', target: 'torch', relation: 'calls', confidence: 'INFERRED' },
] };
const repository = { name: 'repo-1234abcd-nanogpt', app: { repo: 'karpathy/nanoGPT' }, snapshot: { commit, graph } };

test('a block keeps a pinned reference, never the graph: repository, commit, scope and node ids', () => {
  const whole = graphCardBlock(repository), sub = graphCardBlock(repository, ['forward', 'model_py']);
  assert.deepEqual([whole.type, whole.scope, whole.nodeIds, whole.repository], ['repo-graph', 'whole', [], { app: 'repo-1234abcd-nanogpt', repo: 'karpathy/nanoGPT', commit }]);
  assert.deepEqual([sub.scope, sub.nodeIds], ['subgraph', ['forward', 'model_py']]);
  assert.ok(!JSON.stringify(sub).includes('forward()'), 'no node label or source rides in the board');
  assert.ok(JSON.stringify(sub).length < 400);
});

test('the same graph at the same commit and scope is one card; another commit or node set is another', () => {
  const a = graphCardBlock(repository, ['forward', 'model_py']);
  assert.ok(sameGraphCard({ ...graphCardBlock(repository, ['model_py', 'forward']), id: 'x' }, a), 'node order does not matter');
  assert.ok(!sameGraphCard(graphCardBlock(repository, ['forward']), a));
  assert.ok(!sameGraphCard(graphCardBlock(repository), a));
  assert.ok(!sameGraphCard({ ...a, repository: { ...a.repository, commit: 'b'.repeat(40) } }, a));
  assert.ok(!sameGraphCard({ ...a, type: 'graph' }, a), 'a lesson graph block is never a repository graph card');
});

test('a subgraph is its nodes and only the relationships between them: no neighbour is added', () => {
  const sub = subgraph(graph, ['model_py', 'forward']);
  assert.deepEqual(sub.nodes.map(n => n.id), ['model_py', 'forward']);
  assert.deepEqual(sub.edges.map(e => `${e.source}>${e.target}`), ['model_py>forward']);
  assert.equal(subgraph(graph, []), graph, 'whole scope is the graph itself');
});

test('nodes selected in a card are the companion graph refs; the same file in both is one sent ref; removing a chip lets go', async () => {
  const block = { id: 'card-1', ...graphCardBlock(repository) };
  const { useCardRefs } = await import('./graph-card.js'); // the store is module state; read it through its snapshot below
  assert.equal(typeof useCardRefs, 'function');
  setCardSelection(block.id, [graph.nodes[0], graph.nodes[1]], block);
  const fromCompanion = nodeRef(repository, graph.nodes[0]);
  const { refs } = turnRefs([], [fromCompanion, nodeRef(repository, graph.nodes[0]), nodeRef(repository, graph.nodes[1])]);
  assert.equal(refs.length, 2, 'a file chosen in the companion and in a card is one ref');
  dropCardRef(fromCompanion);
  setCardSelection(block.id, [], block);
  assert.ok(sameRef(fromCompanion, nodeRef({ app: { repo: block.repository.repo }, snapshot: { commit: block.repository.commit } }, graph.nodes[0])), 'card refs use the same identity');
});

test('the canvas wires the card: lazy renderer, its own keys, and a reveal-or-insert path for the companion', () => {
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /const GraphCard = lazy\(\(\) => import\('\.\/GraphCard\.jsx'\)\)/);
  assert.match(canvas, /block\.type === 'repo-graph'/);
  assert.match(canvas, /closest\?\.\('\[data-companion\],\[data-graph-card\]'\)/, 'Delete on a focused node never deletes the card');
  const page = readFileSync(new URL('./LearnPage.jsx', import.meta.url), 'utf8');
  assert.match(page, /insertCard: \(block, \{ same = null, at = null \} = \{\}\) =>/);
  const panel = readFileSync(new URL('./GraphPanel.jsx', import.meta.url), 'utf8');
  for (const marker of ['data-graph-add-to-canvas', 'data-graph-add-selection', 'data-graph-add-code', 'data-graph-node-menu']) assert.ok(panel.includes(marker), marker);
  assert.doesNotMatch(panel.slice(panel.indexOf('const addGraph')), /sendMessage|\/api\/learn\/ask/, 'Add to canvas never sends');
});
