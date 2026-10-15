import { codeRef } from './chat-sources.js';
import { MAX_REFS, sameRef } from './chat-context.js';

// Repository selections as chat context (repo-canvas-graph.md sections 6-8, owner 2026-10-15). One identity for the graph,
// the Files reader and Add to chat: a chat-context ContextRef of kind 'code' whose sourceId is code:<repo>@<commit>:<path>
// (chat-sources.js codeRef, the shape citations already use), plus #<node id> for a symbol. So a file picked in the graph
// and the same file picked in Files are one ref; two files with one name (different paths), one file at two commits, and
// two ranges of one file are different refs. The server resolves each against its own snapshot (repository-context.js
// resolveCodeRefs): a ref is identity, never proof of access and never source text.
// `repository` is use-repository.js's object; a ref is built only from its loaded snapshot, so the commit is the code shown.
const nameOf = path => path.split('/').pop();
const MEMORY = new Set(['decision', 'question', 'session']); // map-memory.js fixture records: looked at, never context
const isFileNode = node => !!node.path && node.label === nameOf(node.path);

export function nodeRef(repository, node) {
  const repo = repository.app?.repo || '', commit = repository.snapshot?.commit || '';
  if (isFileNode(node)) return codeRef({ repo, commit, path: node.path });
  // A symbol's range is its line, so the reader opens there (chat-sources.js codeSource reads range.path); the server resolves it
  // by its node id. ponytail: a path holding '#' reads ambiguously next to a symbol's #id; such GitHub paths are rare.
  return { sourceId: `code:${repo}@${commit}:${node.path || ''}#${encodeURIComponent(node.id)}`, kind: 'code', name: String(node.label || node.id).slice(0, 120), version: commit, range: node.path && node.line ? { path: node.path, start: node.line, end: node.line } : null };
}
export const rangeRef = (repository, { path, start, end }) => codeRef({ repo: repository.app?.repo || '', commit: repository.snapshot?.commit || '', path, start, end });

// The Files reader's one selection (use-repository.js context: a file, a symbol or a line range, agent/scope.js shapes).
export function contextRef(repository, context) {
  if (!context?.path && !context?.nodeId && !context?.id) return null;
  if (context.kind === 'range') return rangeRef(repository, context);
  if (context.kind === 'file') return codeRef({ repo: repository.app?.repo || '', commit: repository.snapshot?.commit || '', path: context.path });
  const node = repository.snapshot?.graph.nodes.find(n => n.id === (context.nodeId || context.id));
  return node ? nodeRef(repository, node) : null;
}

const unique = refs => refs.filter((ref, i) => refs.findIndex(other => sameRef(other, ref)) === i);
const nodesOf = repository => {
  const byId = new Map((repository?.snapshot?.graph.nodes || []).map(n => [n.id, n]));
  return (repository?.graph.selected || []).map(id => byId.get(id)).filter(n => n && !MEMORY.has(n.kind));
};

// The temporary context the viewers hold now: the graph's selected nodes, then the Files reader's selection, once each.
export function selectionRefs(repository) {
  if (!repository?.snapshot) return [];
  const own = contextRef(repository, repository.context);
  return unique([...nodesOf(repository).map(node => nodeRef(repository, node)), ...(own ? [own] : [])]);
}
// The graph's selected nodes only (the graph's own Add to chat).
export const graphRefs = repository => (repository?.snapshot ? unique(nodesOf(repository).map(node => nodeRef(repository, node))) : []);

// Removing a chip lets go of what put it there, so it does not come straight back as a selection (brief section 6).
export function dropRef(repository, ref) {
  const keep = (repository.graph.selected || []).filter(id => {
    const node = repository.snapshot?.graph.nodes.find(n => n.id === id);
    return !node || !sameRef(nodeRef(repository, node), ref);
  });
  if (keep.length !== repository.graph.selected.length) repository.graph.setSelected(keep);
  const own = contextRef(repository, repository.context);
  if (own && sameRef(own, ref)) repository.setContext(null);
}
// Closing the viewer: no invisible selection keeps riding with the next question (pinned refs stay).
export function clearSelection(repository) {
  if (repository?.graph.selected?.length) repository.graph.setSelected([]);
  if (repository?.context) repository.setContext(null);
}

// What a turn sends and what the composer shows agree (brief section 6): pinned refs first, then each temporary ref not
// already pinned, up to the server's 20; `left` are the temporary refs that do not fit, shown as not sent.
export function turnRefs(attached = [], temporary = []) {
  const extra = temporary.filter(ref => !attached.some(pinned => sameRef(pinned, ref)));
  const room = Math.max(0, MAX_REFS - attached.length);
  return { refs: [...attached, ...extra.slice(0, room)], temporary: extra.slice(0, room), left: extra.slice(room) };
}

// A chip's second line: where the ref points (path and lines, or path and symbol), for its title.
export function refWhere(ref) {
  const m = /^code:([^@]*)@([^:]*):(.*)$/.exec(ref.sourceId || '');
  if (!m) return '';
  const hash = m[3].lastIndexOf('#'), path = hash < 0 ? m[3] : m[3].slice(0, hash);
  const lines = ref.range ? `:${ref.range.start}${ref.range.end > ref.range.start ? `-${ref.range.end}` : ''}` : '';
  return `${m[1]} › ${path || 'external'}${lines} · ${m[2].slice(0, 7)}`;
}

// The repository behind lane D's graph element (<Suspense><GraphPanel repository={...} /></Suspense>), for the composer's
// chips. ponytail: read from the element so LearnPage needs one line; pass `repository` to LearnSurface when it grows a prop.
export const codebaseOf = element => element?.props?.repository || element?.props?.children?.props?.repository || null;
