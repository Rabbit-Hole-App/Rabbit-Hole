import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CARD_NODE_CAP, EDGE_CAP, limitEdges, cardRefs, dropCardRef, graphCardBlock, graphScopeRef, releaseCodeRef, sameGraphCard, setCardScope, setCardSelection, subgraph } from './graph-card.js';
import { contextRef, nodeRef, rangeRef, selectionRefs, turnRefs } from './repo-context.js';
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

test('a panel view (owner brief 2026-10-16 item 5) is stored as its nodes and named a graph; a selection stays a subgraph', () => {
  const shown = graphCardBlock(repository, ['forward', 'model_py'], 'view'), search = graphCardBlock(repository, ['forward'], 'search');
  assert.deepEqual([shown.scope, shown.nodeIds, shown.view, shown.title], ['subgraph', ['forward', 'model_py'], 'view', 'karpathy/nanoGPT graph']);
  assert.deepEqual([search.scope, search.view], ['subgraph', 'search']);
  assert.equal(graphCardBlock(repository, ['forward']).view, undefined);
  assert.equal(graphCardBlock(repository, [], 'view').scope, 'whole', 'no node list is the whole graph, never a view');
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

// Owner review UI-10 (2026-10-21): the Sources pane's Use in this chat only detached the pinned ref, so a code source still
// selected (a Files file or range, a graph node, a graph card's node) came straight back in the next turn's refs.
test('switching a pinned and selected code ref off lets go of its selection: the next turn does not send it; on again sends it once', () => {
  const state = { selected: [], context: null };
  const viewer = { ...repository, graph: { get selected() { return state.selected; }, setSelected: v => { state.selected = v; } }, get context() { return state.context; }, setContext: v => { state.context = v; } };
  const block = { id: 'card-off', ...graphCardBlock(repository) };
  const outgoing = attached => turnRefs(attached, [...selectionRefs(viewer), ...cardRefs()]).refs;
  const cases = [
    ['a Files file', () => { state.context = { kind: 'file', path: 'train.py' }; return contextRef(viewer, state.context); }],
    ['a Files range', () => { state.context = { kind: 'range', path: 'model.py', start: 3, end: 9 }; return rangeRef(viewer, state.context); }],
    ['a graph node', () => { state.selected = ['forward']; return nodeRef(viewer, graph.nodes[1]); }],
    ['a graph card node', () => { setCardSelection(block.id, [graph.nodes[0]], block); return nodeRef(repository, graph.nodes[0]); }],
  ];
  for (const [what, select] of cases) {
    const ref = select(), pinned = [ref], sent = refs => refs.filter(other => sameRef(other, ref)).length;
    assert.equal(sent(outgoing(pinned)), 1, `${what}: pinned and selected rides once`);
    const off = pinned.filter(other => !sameRef(other, ref));
    assert.equal(sent(outgoing(off)), 1, `${what}: unpinning alone, the selection sends it back (the UI-10 bug)`);
    releaseCodeRef(viewer, ref);
    assert.equal(sent(outgoing(off)), 0, `${what}: switched off, it is not in the outgoing refs`);
    assert.equal(sent(outgoing([ref])), 1, `${what}: switched on again, it rides once`);
  }
  assert.deepEqual([state.selected, state.context, cardRefs()], [[], null, []], 'every selection let go');
  releaseCodeRef(null, nodeRef(repository, graph.nodes[2])); // a canvas without a repository: cards only, no throw
});

test('the canvas wires the card: lazy renderer, its own keys, and a reveal-or-insert path for the companion', () => {
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /const GraphCard = lazyFeature\(\(\) => import\('\.\/GraphCard\.jsx'\), 'The graph'\)/);
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
  const card = readFileSync(new URL('./GraphCard.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
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

test('a wheel over a graph card zooms only the card: the canvas wheel handler skips it (brief Clarification 5, cards check case 9)', () => {
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  const wheel = canvas.slice(canvas.indexOf('const wheel = event => {'), canvas.indexOf('event.preventDefault();', canvas.indexOf('const wheel = event => {')));
  assert.match(wheel, /if \(event\.target\.closest\?\.\('\[data-graph-card\]'\)\) return;/);
});

test('the connection cap counts eligible edges before it truncates, per displayed scope (item 4)', () => {
  const ring = n => Array.from({ length: n }, (_, i) => ({ source: `n${i % 40}`, target: `n${(i + 1 + Math.floor(i / 40)) % 40}` }));
  const all = new Set(Array.from({ length: 40 }, (_, i) => `n${i}`));
  assert.equal(EDGE_CAP, 250);
  assert.deepEqual([limitEdges(ring(249), all).edges.length, limitEdges(ring(249), all).eligible], [249, 249], 'below the cap: nothing hidden');
  assert.deepEqual([limitEdges(ring(250), all).edges.length, limitEdges(ring(250), all).eligible], [250, 250], 'exactly the cap: nothing hidden');
  assert.deepEqual([limitEdges(ring(630), all).edges.length, limitEdges(ring(630), all).eligible], [250, 630], 'above: 250 of 630');
  const focused = new Set(['n0', 'n1', 'n2']);
  const view = limitEdges([...ring(630), { source: 'n0', target: 'n99' }], focused);
  assert.ok(view.eligible < 630 && view.eligible === view.edges.length, 'a filtered view counts only edges between its displayed nodes');
  const graph = readFileSync(new URL('./RepositoryGraph.jsx', import.meta.url), 'utf8');
  assert.match(graph, /scene\.eligible>scene\.edges\.length[^]*data-graph-edge-limit/);
  assert.match(graph, /Showing \{scene\.edges\.length\} of \{scene\.eligible\} connections between displayed nodes/);
});
