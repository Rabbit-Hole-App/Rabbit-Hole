import { askPath } from '../shared-ask.js';

// Where a message goes and which thread it joins. The bar freezes this at Send
// (T02 §6.3); nothing here reads the live page.
export function scopeOf(surface) {
  const resource = surface.resource;
  if (!resource) return { org: surface.org, kind: 'workspace', slug: null, title: null, selected: null };
  return { org: surface.org, kind: resource.kind, slug: resource.slug, title: resource.title || null, selected: surface.selected || null };
}

// Drafts are kept per org|kind:slug|selected. A rename or a new commit keeps the draft.
export const scopeKey = (scope) => `${scope.org}|${scope.kind}:${scope.slug || ''}|${scope.selected?.id || ''}`;

// A project's context reads repository › file › symbol (docs/features/workspace-dock.md). `selected` is a graph node
// ({id, label, commit, path, line, kind}) or a whole file: kind 'file', id `file:<path>`, which no graph node stands for.
const nameOf = (path) => path.split('/').pop();
export const fileContext = (path, commit, line = 1) => ({ id: `file:${path}`, label: nameOf(path), kind: 'file', path, line, commit });
// A line range from the code reader (repository-browser.md): kind 'range', its own id, and the whole range the learner
// selected, however long. The chip reads `lines a–b` under its file; the snippet is the server's to bound.
const span = (start, end) => (end > start ? `${start}–${end}` : `${start}`);
export const rangeContext = (path, start, end, commit) => ({ id: `range:${path}:${start}-${end}`, label: `${end > start ? 'lines' : 'line'} ${span(start, end)}`, kind: 'range', path, line: start, start, end, commit });
export const rangeTitle = (s) => `${nameOf(s.path)}:${span(s.start, s.end)}`;
// The file chip, when the selection is a symbol inside a file: a node named like its file is that file and shows once.
const parentFile = (selected) => (selected && selected.kind !== 'file' && selected.path && nameOf(selected.path) !== selected.label ? selected.path : null);

// Home, Library and Explore are places, not scope: they show no chip (T02 §6.2).
export function chipsFor(scope) {
  if (scope.kind === 'workspace') return [];
  const s = scope.selected, file = parentFile(s);
  return [{ key: 'resource', label: scope.title || scope.slug }, ...(file ? [{ key: 'file', label: nameOf(file), title: file }] : []), ...(s ? [{ key: 'selected', label: s.label }] : [])];
}

// The chips are a project's breadcrumb (owner, 2026-10-08: "if we are not in a particular project, the breadcrumbs
// disappear"): shown only on that project's own page. Elsewhere - Home, Library, Explore, an app, or a draft held from a
// project after leaving it - there is no breadcrumb row; the offer row still names a held draft's scope.
export const crumbsShown = (target, live) => target.kind === 'project' && live.kind === 'project' && live.slug === target.slug;

// Ask actions write a ready question into the composer and focus it; they never send (owner, 2026-10-08: "it should
// already write a question in the chat so that the user only needs to press send"). A composer that already holds the
// learner's own words keeps them (AgentBar.jsx, ask.jsx). `text` is the question; the context is set by the caller.
export const askDraft = (text) => window.dispatchEvent(new CustomEvent('small:ask-focus', { detail: { text } }));
const linesOf = (s) => `${s.end > s.start ? `lines ${s.start}–${s.end}` : `line ${s.start}`} of ${nameOf(s.path)}`;
const verb = (s) => (s.kind === 'range' && s.end > s.start ? 'do' : 'does');
export const askQuestion = (s) => (s.kind === 'range' ? `What ${verb(s)} ${linesOf(s)} do?` : `What does ${s.label} do, and how is it used here?`);
export const whyQuestion = (s) => `Why ${verb(s)} ${s.kind === 'range' ? linesOf(s) : s.label} matter in this codebase?`;

// × on a chip below the resource falls back one level and no further (owner, 2026-10-06 §3): a symbol to its file,
// a file to the repository. Only the resource chip clears everything.
export const contextWithout = (selected, key) => (key === 'selected' && parentFile(selected) ? fileContext(parentFile(selected), selected.commit) : null);

// What a project question carries (control-plane repositories.js repositoryAsk): identity, never source text. A symbol by
// node id, a whole file by path, a line range as {path, start, end} (the shape Learn's chat already sends, ask.jsx).
export const wireContext = (s) => ({ commit: s.commit, ...(s.kind === 'range' ? { range: { path: s.path, start: s.start, end: s.end } } : s.kind === 'file' ? { path: s.path } : { nodeId: s.id }), label: s.kind === 'range' ? rangeTitle(s) : s.label });

// Workspace and app threads stay on /api/ask; projects and canvases use Learn's LEARN_DB threads (T02 §6.3). A published
// canvas picked on Explore (surface.js pickCard) asks as its own page's composer does: the shared ask, by its link token.
export function endpointFor(scope) {
  if (scope.kind === 'workspace') return { path: '/api/ask', scope: {} };
  if (scope.kind === 'shared') return { path: askPath(scope.slug), scope: {} };
  return { path: scope.kind === 'app' ? '/api/ask' : '/api/learn/ask', scope: { app: scope.slug } };
}
