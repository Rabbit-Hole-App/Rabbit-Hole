// What a code or graph card shows, read the way the server allows (repo-graph Release 2, lane contract
// C:/s/spec/repo-graph-r2-plan.md; control plane repository-cards.js). A repository card stores no code: its source comes
// from the owner-checked repository routes at the card's own commit, so a viewer who does not own the repository reads
// nothing, and a card the server sent redacted is unavailable without asking. Pure helpers here; the hook is use-card-source.js.

// The read a card needs, or null when there is nothing it may read.
export function cardRequest(block) {
  if (!block || block.redacted) return null;
  if (block.type === 'code' && block.source?.kind === 'repository') {
    const { app, commit, path } = block.source;
    return app && commit && path ? { kind: 'file', key: `file:${app}@${commit}:${path}`, app, commit, path } : null;
  }
  if (block.type === 'code' && block.source?.kind === 'upload') return block.source.assetKey ? { kind: 'upload', key: `upload:${block.source.assetKey}` } : null;
  if (block.type === 'graph') {
    const { app, commit } = block.repository || {};
    return app && commit ? { kind: 'graph', key: `graph:${app}@${commit}`, app, commit } : null;
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

// A subgraph card's nodes and the edges between them; a whole-graph card (no node ids) is the whole graph. Ids the
// snapshot no longer has are dropped, never invented.
export function cardGraph(graph, nodeIds = []) {
  if (!graph?.nodes) return { nodes: [], edges: [] };
  if (!nodeIds?.length) return { nodes: graph.nodes, edges: graph.edges || [] };
  const keep = new Set(nodeIds);
  const nodes = graph.nodes.filter(node => keep.has(node.id)), ids = new Set(nodes.map(node => node.id));
  return { nodes, edges: (graph.edges || []).filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
}
