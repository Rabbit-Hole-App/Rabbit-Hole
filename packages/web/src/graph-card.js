import { useSyncExternalStore } from 'react';
import { nodeRef } from './repo-context.js';
import { sameRef } from './chat-context.js';

// The interactive graph card (repo-canvas-graph.md clarification sections 1, 4-6 and 8; C:/s/spec/repo-graph-r2-plan.md).
// The block keeps a reference, never the graph: the repository, the pinned commit, the scope and, for a subgraph, its node
// ids. The card reads the snapshot through the owner-checked route at render time, so a viewer without access sees no labels.
export const GRAPH_CARD = { w: 560, h: 520 };

// `repository` is use-repository.js's object; the commit is the loaded snapshot's, the code the learner is looking at.
export function graphCardBlock(repository, nodeIds = []) {
  const repo = repository.app?.repo || '', commit = repository.snapshot?.commit || '';
  const scope = nodeIds.length ? 'subgraph' : 'whole';
  return { type: 'repo-graph', title: scope === 'whole' ? `${repo} graph` : `${repo} subgraph`, repository: { app: repository.name, repo, commit }, scope, nodeIds: [...nodeIds], camera: null, w: GRAPH_CARD.w, h: GRAPH_CARD.h };
}

// The same graph at the same revision and scope: a second Add reveals the first card (double-click, retry) instead of a copy.
// The canvas's own Duplicate still makes intentional copies.
const key = ids => [...(ids || [])].sort().join('\n');
export const sameGraphCard = (a, b) => a?.type === 'repo-graph' && a.repository?.app === b.repository.app && a.repository?.commit === b.repository.commit && a.scope === b.scope && key(a.nodeIds) === key(b.nodeIds);

// A subgraph is its nodes and only the indexed relationships between them: no neighbour is added (brief section 1).
export function subgraph(graph, nodeIds) {
  if (!graph || !nodeIds?.length) return graph;
  const ids = new Set(nodeIds);
  return { nodes: graph.nodes.filter(n => ids.has(n.id)), edges: graph.edges.filter(e => ids.has(e.source) && ids.has(e.target)) };
}

// The card's repository as repo-context.js reads it, so card refs and companion refs share one identity (brief section 6).
export const cardRepository = block => ({ app: { repo: block.repository?.repo || '' }, snapshot: { commit: block.repository?.commit || '' } });

// Each graph card's internal node selection, as temporary chat context: the same kind of ref the companion Graph gives, so a
// file chosen in both is one chip. In memory only: an unmounted card (deleted, another canvas, a reload) lets go of its
// selection, so a reopened card never resurrects one (brief section 8).
const cards = new Map(), listeners = new Set();
let refs = [];
const emit = () => {
  const all = [...cards.values()].flatMap(entry => entry.refs);
  refs = all.filter((ref, i) => all.findIndex(other => sameRef(other, ref)) === i);
  listeners.forEach(listener => listener());
};
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const NONE = [];

export function setCardSelection(id, nodes, block) {
  if (nodes.length) cards.set(id, { ids: nodes.map(n => n.id), refs: nodes.map(n => nodeRef(cardRepository(block), n)) });
  else if (!cards.delete(id)) return;
  emit();
}
export const useCardSelection = id => useSyncExternalStore(subscribe, () => cards.get(id)?.ids || NONE);
export const useCardRefs = () => useSyncExternalStore(subscribe, () => refs);
// Removing a chip lets go of the node that put it there (repo-context.js dropRef, for cards).
export function dropCardRef(ref) {
  let changed = false;
  for (const [id, entry] of cards) {
    const keep = entry.ids.map((nodeId, i) => [nodeId, entry.refs[i]]).filter(([, own]) => !sameRef(own, ref));
    if (keep.length === entry.ids.length) continue;
    changed = true;
    if (keep.length) cards.set(id, { ids: keep.map(([nodeId]) => nodeId), refs: keep.map(([, own]) => own) });
    else cards.delete(id);
  }
  if (changed) emit();
}
