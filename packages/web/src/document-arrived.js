// A dropped Markdown or PDF starts the Tutor (docs/features/learn-sections/roadmap-unplug-spec.md section B, owner 2026-11-19), the way a connected repository does: the page tells the Tutor
// flow (TutorRehearsal.jsx) that a document arrived, with its text (a Markdown file's text; a PDF's pages as the browser read them). The flow reads it (learn_index with a source), then
// answers with the one opening (source-arrived.js). The detail waits here until the flow is mounted: the drop opens Chat, and the flow mounts with it.
export const DOCUMENT_ARRIVED_EVENT = 'rh-document-arrived';
export const DOC_TEXT_MAX = 512 * 1024, DOC_PAGES_MAX = 400; // what the server takes (learn-document.js)
const waiting = new Map();
// detail: { kind: 'markdown' | 'pdf', name, text (markdown), pages (pdf: one string a page), blockId?, assetKey? }
export function documentArrived(canvas, detail) {
  if (!canvas || !detail || !['markdown', 'pdf'].includes(detail.kind) || !detail.name) return;
  waiting.set(canvas, detail);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(DOCUMENT_ARRIVED_EVENT, { detail: { canvas, ...detail } }));
}
// -> the document that arrived on this canvas and has not been taken yet (once), or null.
export function takeDocument(canvas) { const detail = waiting.get(canvas) ?? null; waiting.delete(canvas); return detail; }
// The learn_index body for a document: only what the server takes. A long PDF sends its first pages and as much of them as fits; a long Markdown file its first 512 KB.
export function documentBody({ kind, name, text = '', pages = [], blockId = null }) {
  const source = { kind, name: String(name).slice(0, 200), ...(blockId ? { blockId: String(blockId).slice(0, 80) } : {}) };
  if (kind === 'markdown') return { action: 'learn_index', layer: 'overview', source: { ...source, text: String(text).slice(0, DOC_TEXT_MAX) } };
  const kept = []; let size = 0;
  for (const page of pages.slice(0, DOC_PAGES_MAX)) { const next = String(page ?? ''); if (size + next.length + 1 > DOC_TEXT_MAX) break; kept.push(next); size += next.length + 1; }
  return { action: 'learn_index', layer: 'overview', source: { ...source, pages: kept } };
}
