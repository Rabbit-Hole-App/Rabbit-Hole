// Code cards (repo-graph Release 2, C:/s/spec/repo-graph-r2-plan.md; brief "Clarification: code-file cards"): a canvas block of
// type 'repo-code' that points at code, never runs it. A repository card stores no source text, only where to read it (app,
// repo, commit, path, lines, graph node); it reads through the owner-checked server route at its own commit (use-card-source.js).
// An upload card's text lives in its asset. Pure, so the unit tests read it; CodeCard.jsx, the Files viewer and the graph use it.
import { codeRef } from './chat-sources.js';
import { codeLanguage } from './code-language.js';

export const CODE_CARD = { w: 480, h: 320 };
// The preview's bound: a longer file or range shows its first lines and says so; Expand shows the whole stored text.
export const PREVIEW_LINES = 40;
// What Add to chat carries for an upload card (the server's per-ref text bound is 8000 characters).
const REF_TEXT = 8000;
// The canvas drag from the Files browser: its payload is a repository source (dragging a file or a symbol onto the canvas).
export const CODE_DRAG = 'application/x-rh-code-card';

const nameOf = path => String(path || '').split('/').pop();
const lines = (start, end) => (start ? `:${start}${end && end > start ? `-${end}` : ''}` : '');

// A repository card's block (no id or position: insertCard places it). label: a symbol's name, shown after the file's.
// A symbol (nodeId) with only its first line reads on from there; lines start-end are exactly that range.
export function repoCodeCard({ app, repo, commit, path, start = null, end = null, nodeId = null, label = null }) {
  const file = nameOf(path);
  return {
    type: 'repo-code',
    title: label && label !== file ? `${file} · ${label}` : file,
    language: codeLanguage(path),
    source: { kind: 'repository', app, repo, commit, path, ...(start ? { start, ...(end ? { end } : {}) } : {}), ...(nodeId ? { nodeId } : {}) },
  };
}

// A graph node's card (inspector.js objectOf: a file or a symbol with a path; an external dependency has none, so null).
export function nodeCodeCard({ app, repo, commit }, object) {
  if (!object?.path || object.kind === 'external') return null;
  return repoCodeCard({ app, repo, commit, path: object.path, ...(object.kind === 'file' ? {} : { start: object.line || null, nodeId: object.nodeId || object.id, label: object.label }) });
}

// An uploaded file's card (lane DROP): its stored asset, never a repository association.
export const uploadCodeCard = ({ assetKey, name, size }) => ({ type: 'repo-code', title: nameOf(name), language: codeLanguage(name), source: { kind: 'upload', assetKey, name: nameOf(name), size } });

// Equivalent sources: the same file at the same commit and lines (or the same upload). A different commit or range is a
// different card, so it is never mistaken for a duplicate.
export function sameCodeSource(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'upload') return a.assetKey === b.assetKey;
  return a.app === b.app && a.commit === b.commit && a.path === b.path && (a.start || null) === (b.start || null) && (a.end || null) === (b.end || null) && (a.nodeId || null) === (b.nodeId || null);
}

// The one creation path (contract: a thin wrapper over canvasOps.insertCard, which reveals an equivalent card instead of a
// duplicate and is one Undo step). at: the world point of a drop, or null for the view. Returns insertCard's answer, or null
// when this canvas cannot take cards (no canvasOps.insertCard, as on a view-only page).
export function insertCodeCard(ops, block, at = null) {
  if (!ops?.insertCard || !block?.source) return null;
  return ops.insertCard(block, { same: other => other?.type === 'repo-code' && sameCodeSource(other.source, block.source), at });
}

// Several code cards (Add code card on a graph selection): one group near the view, one Undo step, through canvasOps.insertCards.
// Equivalent sources collapse to one card, and a card already on the canvas is not added again. One card takes insertCodeCard.
export function insertCodeCards(ops, blocks) {
  const list = blocks.filter((block, index) => block?.source && blocks.findIndex(other => other?.source && sameCodeSource(other.source, block.source)) === index);
  if (list.length <= 1 || !ops?.insertCards) return list.map(block => insertCodeCard(ops, block));
  return ops.insertCards(list, { sameAs: block => other => other?.type === 'repo-code' && sameCodeSource(other.source, block.source), size: CODE_CARD });
}

// The card as chat context (repo-context.js identity): a repository card is the code ref the graph and Files use for the
// same file, symbol or lines, so they dedupe; the server reads it at its commit under its owner check. An upload card is a
// card ref carrying its text, bounded, as the client resolves card text at Send.
export function codeCardRef(block, text = '') {
  const source = block?.source;
  if (source?.kind === 'repository') {
    if (source.nodeId) return { sourceId: `code:${source.repo}@${source.commit}:${source.path}#${encodeURIComponent(source.nodeId)}`, kind: 'code', name: String(block.title || source.path).slice(0, 120), version: source.commit, range: source.start ? { path: source.path, start: source.start, end: source.end || source.start } : null };
    return codeRef({ repo: source.repo, commit: source.commit, path: source.path, start: source.start || 0, end: source.end || source.start || 0 });
  }
  if (source?.kind === 'upload') return { sourceId: `upload:${source.assetKey}`, kind: 'card', name: String(block.title || source.name).slice(0, 120), version: null, range: null, text: String(text).slice(0, REF_TEXT) };
  return null;
}

// What the card shows of its numbered lines. useCardSource already cut them to the card's range with the file's own line
// numbers (card-source.js cardLines), so they are never cut again here; bounded unless expanded.
// Returns { lines: [{ n, text }], shown, total, excerpt } - excerpt when fewer lines show than the card's code has.
export function previewOf(lines, expanded = false) {
  const range = (lines || []).map(line => ({ n: line.n, text: String(line.text ?? '').replace(/\r$/, '') }));
  const shown = expanded ? range : range.slice(0, PREVIEW_LINES);
  return { lines: shown, shown: shown.length, total: range.length, excerpt: shown.length < range.length };
}

// The card's provenance line: repo › path:lines · commit, or the uploaded file's name.
export function provenanceOf(block) {
  const source = block?.source;
  // A redacted card (repository-cards.js) keeps only its place and kind: it names nothing.
  if (block.redacted || (source?.kind === 'repository' && !(source.repo && source.path && source.commit))) return 'Repository content unavailable';
  if (source?.kind === 'repository') return `${source.repo} › ${source.path}${lines(source.start, source.end)} · ${String(source.commit).slice(0, 7)}`;
  if (source?.kind === 'upload') return `Uploaded file · ${source.name}`;
  return '';
}

// A Files-browser drag's payload, parsed and checked: a repository source with an app, repo, 40-hex commit and path, or null.
export function dragSource(dataTransfer) {
  let value = null;
  try { value = JSON.parse(dataTransfer?.getData?.(CODE_DRAG) || 'null'); } catch { return null; }
  if (!value || typeof value.app !== 'string' || typeof value.repo !== 'string' || !/^[0-9a-f]{40}$/.test(value.commit || '') || typeof value.path !== 'string' || !value.path) return null;
  return value;
}
