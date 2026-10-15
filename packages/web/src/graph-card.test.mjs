import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CARD_NODE_CAP, cardRefs, dropCardRef, graphCardBlock, graphScopeRef, sameGraphCard, setCardScope, setCardSelection, subgraph } from './graph-card.js';
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

// Home's cards check case 5: Add selection as graph took the page down. The card-source reply carries `skipped`, the hook
// dropped it, and the card read source.skipped.length on a ready graph. The hook keeps it, the card tolerates its absence,
// and a card that throws while drawing shows its own failed state instead of the page's crash screen.
test('a ready graph card never throws on a reply without skipped, and a render error stays inside the card', () => {
  const hook = readFileSync(new URL('./use-card-source.js', import.meta.url), 'utf8');
  assert.match(hook, /graph: cardGraph\(data\.graph, [^)]*\)[^;]*, skipped: data\.skipped \|\| \[\] \}\)/);
  const card = readFileSync(new URL('./GraphCard.jsx', import.meta.url), 'utf8');
  assert.match(card, /source\.skipped\?\.length > 0/);
  assert.doesNotMatch(card, /source\.skipped\.length > 0/);
  assert.match(card, /class GraphCardBoundary extends Component \{[\s\S]*static getDerivedStateFromError\(\)/);
  assert.match(card, /export default function GraphCard\(\{ block, selected = false \}\) \{[\s\S]*?return <GraphCardBoundary block=\{block\} \/>;\n\}/);
  assert.match(card, /data-graph-card-state="failed"[\s\S]*data-graph-card-retry/);
});

test('a selected graph card names its scope as one graph ref; a node chosen inside it replaces the scope (brief 6)', () => {
  const whole = { id: 'g1', type: 'repo-graph', title: 'karpathy/nanoGPT graph', repository: { app: 'repo-x', repo: 'karpathy/nanoGPT', commit: 'a'.repeat(40) }, scope: 'whole', nodeIds: [] };
  assert.deepEqual(graphScopeRef(whole), { sourceId: `graph:karpathy/nanoGPT@${'a'.repeat(40)}`, kind: 'graph', name: 'karpathy/nanoGPT graph', version: 'a'.repeat(40), range: null });
  assert.equal(graphScopeRef({ ...whole, scope: 'subgraph', nodeIds: ['model', 'model gpt'] }).sourceId, `graph:karpathy/nanoGPT@${'a'.repeat(40)}#model,model%20gpt`);
  setCardScope('g1', whole, true);
  assert.deepEqual(cardRefs().map(r => r.kind), ['graph'], 'selected with no node inside: the scope rides');
  setCardSelection('g1', [{ id: 'model', label: 'model.py', path: 'model.py', line: 1 }], whole);
  assert.deepEqual(cardRefs().map(r => r.kind), ['code'], 'a node chosen inside replaces the scope');
  setCardSelection('g1', [], whole);
  assert.deepEqual(cardRefs().map(r => r.kind), ['graph']);
  dropCardRef(graphScopeRef(whole));
  assert.deepEqual(cardRefs(), [], 'removing the chip lets the scope go');
  setCardScope('g1', whole, true); setCardScope('g1', whole, false);
  assert.deepEqual(cardRefs(), [], 'deselecting the card lets it go');
});

test('a card draws up to its cap and says when the graph is larger (brief 11: no silent truncation)', () => {
  assert.ok(CARD_NODE_CAP >= 58, 'a 58-node repository draws whole');
  const card = readFileSync(new URL('./GraphCard.jsx', import.meta.url), 'utf8'), graph = readFileSync(new URL('./RepositoryGraph.jsx', import.meta.url), 'utf8');
  assert.match(card, /cap=\{CARD_NODE_CAP\}/);
  assert.match(card, /data-graph-card-limit[^>]*>· Showing \{CARD_NODE_CAP\} of \{graph\.nodes\.length\} nodes/);
  assert.match(graph, /cap \?\? 24\+/);
  assert.match(card, /setCardScope\(block\.id, block, selected\)/);
});
