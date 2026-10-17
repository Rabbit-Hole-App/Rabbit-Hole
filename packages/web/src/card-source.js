// What a code or graph card shows, read the way the server allows (repo-graph Release 2, lane contract
// C:/s/spec/repo-graph-r2-plan.md; control plane repository-cards.js). A repository card stores no code: its source comes
// from /api/repositories/card-source at the card's own commit, by repository and commit, for whoever the repository rule
// allows (repositories.js readableVersion: confirmed public, or the asker's own import) - a fork or a share viewer too. A card
// the server sent redacted is unavailable without asking. Pure helpers here; the hook is use-card-source.js.

// The read a card needs, or null when there is nothing it may read.
export function cardRequest(block) {
  if (!block || block.redacted) return null;
  if (block.type === 'repo-code' && block.source?.kind === 'repository') {
    const { repo, commit, path } = block.source;
    return repo && commit && path ? { kind: 'file', key: `file:${repo}@${commit}:${path}`, repo, commit, path } : null;
  }
  if (block.type === 'repo-code' && block.source?.kind === 'upload') return block.source.assetKey ? { kind: 'upload', key: `upload:${block.source.assetKey}` } : null;
  if (block.type === 'repo-graph') {
    const { repo, commit } = block.repository || {};
    return repo && commit ? { kind: 'graph', key: `graph:${repo}@${commit}`, repo, commit } : null;
  }
  return null;
}

// A 403 or 404 is "not yours to read" (the routes never say whose or what); anything else is a failure worth a retry.
export const failureStatus = error => (error?.status === 403 || error?.status === 404 ? 'unavailable' : 'failed');

// The card's lines: start to end, start to the file's end when it has no end, else the whole file. Numbers are the file's
// own line numbers.
export function cardLines(content, start = null, end = null) {
  const all = String(content ?? '').split('\n');
  const from = Number.isInteger(start) && start >= 1 ? start : 1;
  const to = Number.isInteger(end) && end >= from ? Math.min(end, all.length) : all.length;
  const lines = all.slice(from - 1, to).map((text, i) => ({ n: from + i, text }));
  return { text: lines.map(line => line.text).join('\n'), lines, totalLines: all.length };
}

// A link's read (learn-boards.js sharedCard): the server already cut the card's stored range, so its lines are numbered on
// from `first`, the file's own number of the range's first line.
export function rangeLines(content, first = 1) {
  const lines = String(content ?? '').split('\n').map((text, i) => ({ n: first + i, text }));
  return { text: lines.map(line => line.text).join('\n'), lines };
}

// A subgraph card's nodes and the edges between them; a whole-graph card (no node ids) is the whole graph. Ids the
// snapshot no longer has are dropped, never invented.
export function cardGraph(graph, nodeIds = []) {
  if (!graph?.nodes) return { nodes: [], edges: [] };
  if (!nodeIds?.length) return { nodes: graph.nodes, edges: graph.edges || [] };
  const keep = new Set(nodeIds);
  const nodes = graph.nodes.filter(node => keep.has(node.id)), ids = new Set(nodes.map(node => node.id));
  return { nodes, edges: (graph.edges || []).filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
}

// A React effect runs after render. Do not briefly return another source/access scope's ready state before it resets.
export const currentCardSource = (state, identity, usable) => state.identity === identity ? state : { status: usable ? 'loading' : 'unavailable' };
