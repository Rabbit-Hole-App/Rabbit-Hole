// The Map inspector's facts (docs/features/inspector.md). Canonical snapshot data only: nothing here guesses a purpose,
// a summary or an edge (repository-graph-data-audit.md). Pure; node:test loads it.
import { fileContext } from './agent/scope.js';

// The inspector's Overview tab (Purpose, Why it matters, Symbols, Relationships) is hidden for now (owner, 2026-10-08:
// "lets hide it. so we have only chat"). The inspector opens on Chat; a fixture record still shows its own view.
// ponytail: one switch, so the tab and its e2e checks come back together.
export const OVERVIEW_TAB = false;

const nameOf = (path) => path.split('/').pop();
// The indexer's code extensions (lesson-renderer/index_repository.py CODE), named.
const LANGUAGES = { '.py': 'Python', '.pyi': 'Python', '.js': 'JavaScript', '.jsx': 'JavaScript', '.ts': 'TypeScript', '.tsx': 'TypeScript', '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.c': 'C', '.h': 'C', '.cpp': 'C++', '.rb': 'Ruby', '.cs': 'C#', '.sh': 'Shell' };
export const languageOf = (path) => LANGUAGES[(path || '').match(/\.[^./]+$/)?.[0]] || null;

// Graphify names a file's own node after the file; that node is the file, inspected once, with its edges.
const fileNode = (graph, path) => graph.nodes.find((n) => n.path === path && n.label === nameOf(path)) || null;

// What the inspector shows, from a Files row or a graph node: { id, kind, label, path, line, nodeId }. A file's id is the
// composer's file context id (agent/scope.js), so "In context" is one comparison.
export function fileObject(graph, path, line = 1) {
  return { ...fileContext(path, null, line), nodeId: fileNode(graph, path)?.id || null };
}
export function objectOf(graph, node) {
  if (node.path && node.label === nameOf(node.path)) return fileObject(graph, node.path);
  return { id: node.id, kind: node.kind || 'symbol', label: node.label, path: node.path || null, line: node.path ? node.line || 1 : null, nodeId: node.id };
}
// The composer context for an inspected object, pinned to the snapshot's commit.
export const contextOf = ({ id, kind, label, path, line, nodeId }, commit) => ({ id, kind, label, path, line, nodeId, commit });

// The type line under the title. A Graphify node only says callable ('symbol'), external, or its file type ('code').
export function typeOf(o) {
  if (o.kind === 'file') return [languageOf(o.path), 'file'].filter(Boolean).join(' ');
  return { symbol: 'Function', external: 'External dependency' }[o.kind] || 'Symbol';
}

// The symbols a file defines: every node whose path is that file, in source order.
export const symbolsIn = (graph, path) => graph.nodes.filter((n) => n.path === path && n.label !== nameOf(path)).sort((a, b) => (a.line || 0) - (b.line || 0));

// The graph's own relation names, read from each edge (index_repository.py keeps Graphify's); only the reverse wording is ours.
const REVERSE = { calls: 'Called by', contains: 'Contained in', imports: 'Imported by', imports_from: 'Imported by', method: 'Method of', inherits: 'Inherited by', uses: 'Used by' };
const said = (relation) => (relation || 'related').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
// One node's edges grouped by relation and direction: [{ label, items: [{ node, inferred }] }], each node once per group
// (imports and imports_from both read Imported by). An edge whose other end is not a node keeps its raw id, never a made-up name.
export function relationshipGroups(graph, id) {
  if (!id) return [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n])), groups = new Map();
  for (const e of graph.edges) {
    const out = e.source === id;
    if (!out && e.target !== id) continue;
    const other = out ? e.target : e.source, label = out ? said(e.relation) : REVERSE[e.relation] || `${said(e.relation)} (incoming)`;
    if (!groups.has(label)) groups.set(label, new Map());
    const items = groups.get(label), inferred = e.confidence !== 'EXTRACTED';
    items.set(other, { node: byId.get(other) || { id: other, label: other }, inferred: (items.get(other)?.inferred ?? true) && inferred });
  }
  return [...groups].map(([label, items]) => ({ label, items: [...items.values()] }));
}

// Conversation about this object: the turns asked while it was the composer's context (agent/bar.js keeps each turn's
// scope). The server stores no selection with a message (audit G1), so this is this browser session only.
