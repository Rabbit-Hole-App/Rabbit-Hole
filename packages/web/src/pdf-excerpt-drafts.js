// Excerpt drafts the reader hands to the canvas or Chat (pdf-excerpts contract): the Excerpt shape, kept in memory by id so a
// drag or a 'small:pdf-excerpt' event carries only the id. A region draft also holds its crop, a Promise of
// { blob, width, height } from pdf-crop.js renderCrop (a drag starts before the picture is drawn); the blob never goes on a card.
const drafts = new Map();
export const EXCERPT_EVENT = 'small:pdf-excerpt', EXCERPT_DRAG = 'application/x-rh-pdf-excerpt';

export function put(draft, crop = null) { drafts.set(draft.id, { draft, crop: crop && Promise.resolve(crop) }); return draft.id; }
export const get = id => drafts.get(id)?.draft || null;
export const getCrop = id => drafts.get(id)?.crop || null;

// The contract's Excerpt from what the reader knows. `source`: { key, sha256, name, home }; `page`: { index, label }.
export const excerptDraft = ({ id, kind, source, page, rotate, view, rects, quote = null, highlightId = null, part = null }) => ({
  v: 1, id, kind, source: { key: source.key, sha256: source.sha256, name: source.name, home: source.home ?? null },
  page: { index: page.index, label: page.label ?? null }, rotate, view: [...view], rects: rects.map(rect => [...rect]),
  quote: kind === 'text' ? quote : null, highlightId, crop: null, part,
});

// One event per insertion: a split selection sends all its parts in order (draftIds), so the set is one Undo step.
export const sendExcerpt = (action, ids) => window.dispatchEvent(new CustomEvent(EXCERPT_EVENT, { detail: Array.isArray(ids) ? { action, draftIds: ids } : { action, draftId: ids } }));
