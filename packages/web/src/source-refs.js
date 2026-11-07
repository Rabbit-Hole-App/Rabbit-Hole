// Source passage references in the browser (Tutor release R3, docs/features/source-refs.md; control plane source-refs.js). The
// server mints a ref from a selection (mintSourceRef), a job and a card carry it, and a card's status is read again
// (resolveSourceRef) whenever it is shown: an immutable revision means "current" is a fact the server checked, not a guess.
// `post` is the page's api POST (learn-slash.js's, LearnPage's): { data, status } errors as api() throws them. Pure: no React.
import { startTiming } from './client-timing.js';
import { CREATE_REFUSED, SOURCE_REF_EVENT, explanationsFor, markdownCardOf, navigable, readerRef, sourceRefOf } from './source-ref.js';

export const SOURCE_REFS = '/api/learn/source-refs';

// A selection's draft (source-ref.js markdownDraft / excerptDraft / draftOfBlock) -> the server's ref, or throws with words a
// learner can act on: a changed or unavailable source says to select again.
export async function mintSourceRef(post, draft) {
  try { return (await post(SOURCE_REFS, draft)).ref; }
  catch (error) {
    const code = error.data?.code || (error.status === 404 ? 'source_unavailable' : null);
    throw Object.assign(new Error(CREATE_REFUSED[code] || error.message), { status: error.status, code });
  }
}

// Statuses are asked together: every card shown in one tick shares one request. A failed request leaves the status unknown
// (null), which shows nothing wrong and opens nothing until a retry.
const waiting = new Map();
export function resolveSourceRef(post, app, id, { delay = 0, schedule = setTimeout } = {}) {
  const key = app;
  let batch = waiting.get(key);
  if (!batch) {
    batch = { ids: new Set(), done: null };
    batch.done = new Promise(resolve => schedule(async () => {
      waiting.delete(key);
      const timing = startTiming('source_resolve_ms');
      try { resolve(new Map((await post(`${SOURCE_REFS}/resolve`, { app, ids: [...batch.ids] })).refs.map(ref => [ref.id, ref]))); timing.end('ok'); }
      catch { timing.end('failed'); resolve(new Map()); }
    }, delay));
    waiting.set(key, batch);
  }
  batch.ids.add(id);
  return batch.done.then(map => map.get(id) || null);
}

// The canvas's blocks that matter here - a card with a navigable ref, a Markdown file card - and its camera, as a store the readers
// (the Markdown file card, the PDF reader) read from: they sit outside the canvas's React tree. The canvas publishes
// (SourceRefChip.jsx useSourceRefIndex); a reader subscribes.
let state = { blocks: [], focus: null, pending: [] };
const listeners = new Set();
export const published = () => state;
const relevant = block => navigable(sourceRefOf(block)) || (block?.kind === 'markdown' && !!block.fileRef?.source?.id);
export function publishBlocks(blocks, focus = null) {
  const next = (Array.isArray(blocks) ? blocks : []).filter(relevant);
  if (focus === state.focus && next.length === state.blocks.length && next.every((block, i) => block === state.blocks[i])) return;
  state = { ...state, blocks: next, focus };
  for (const listener of listeners) listener();
}
export function subscribeBlocks(listener) { listeners.add(listener); return () => listeners.delete(listener); }
// The Tutor's slots on this canvas that stand for a step's passage ({ slotId, ref, start, end }: the step's minted ref and the plan's raw offsets), so a Markdown file
// card's passage menu can reach a slot before its card exists (View explanation lands on the slot that becomes the explanation).
export function publishPending(pending) {
  if (JSON.stringify(pending) === JSON.stringify(state.pending)) return;
  state = { ...state, pending };
  for (const listener of listeners) listener();
}

// Card to passage. A PDF opens the companion reader at the page with the passage emphasized (the existing
// 'small:excerpt-source' event, ExcerptCard.jsx); a Markdown passage focuses its file card, which then emphasizes the quote.
// Returns what happened, so the chip can say so: 'opened' | 'unavailable' (the ref cannot open) | 'no-card' (the Markdown card is
// not on this canvas).
// raw: the card is a roadmap card (stepId), so its Markdown quote is raw Markdown and may be matched folded once the whole file is drawn (source-ref.js resolveRawPassage).
// range: a Tutor slot's step, which has no quote yet: the plan's raw offsets, read from the file card's own text there.
export function viewPassage(ref, { blocks = state.blocks, focus = state.focus, emit = event => window.dispatchEvent(event), wait = setTimeout, raw = false, range = null } = {}) {
  if (!navigable(ref)) return 'unavailable';
  if (ref.kind === 'pdf') { emit(new CustomEvent('small:excerpt-source', { detail: { ref: readerRef(ref) } })); return 'opened'; }
  const cardId = markdownCardOf(blocks, ref);
  if (!cardId) return 'no-card';
  focus?.(cardId);
  // The camera moves first; the card paints its emphasis once it is on screen.
  wait(() => emit(new CustomEvent(SOURCE_REF_EVENT, { detail: { cardId, key: ref.source.key, rev: ref.source.rev, quote: ref.anchor?.quote, ...(raw ? { raw: true } : {}), ...(range ? { range } : {}) } })), 250);
  return 'opened';
}

// The camera to one explanation card (a reader's "View explanation" on a passage that has several).
export const focusExplanation = (cardId, { focus = state.focus } = {}) => focus?.(cardId);

// Passage to explanation: the camera to the first explanation card for this source (at this revision, for a PDF on this page).
// Returns how many there are.
export function viewExplanation(where, { blocks = state.blocks, focus = state.focus } = {}) {
  const { current } = explanationsFor(blocks, where);
  if (current.length) focus?.(current[0].cardId);
  return current.length;
}

// When a Tutor slot first appears: its passage is emphasized for a moment ONLY if it is already in view - no camera move, no scroll, no Show more, nothing said when it
// cannot be shown (owner 2026-11-06, plan 5.4).
export function emphasizePassage(ref, range, { blocks = state.blocks, emit = event => window.dispatchEvent(event) } = {}) {
  const cardId = navigable(ref) && ref.kind === 'markdown' ? markdownCardOf(blocks, ref) : null;
  if (cardId && range) emit(new CustomEvent(SOURCE_REF_EVENT, { detail: { cardId, key: ref.source.key, rev: ref.source.rev, range, raw: true, quiet: true } }));
  return !!cardId;
}

// UI.06: where a step's passage is drawn now, for placing its slot beside it. A Markdown file card registers how to find a raw range in its own rendered text
// (FileDocMarkdown); the canvas asks once, when it first places the slot. null: no such card, the range does not resolve, or it is not in the card's visible
// scroller (collapsed, scrolled away): the caller then uses the source card's own box, never a guessed paragraph.
const measures = new Map();
export function registerPassageMeasure(cardId, measure) { measures.set(cardId, measure); return () => { if (measures.get(cardId) === measure) measures.delete(cardId); }; }
export const measurePassage = (cardId, detail) => { try { return measures.get(cardId)?.(detail) ?? null; } catch { return null; } };
// A screen rect (getBoundingClientRect) to world units on a canvas whose surface starts at `origin` (its own rect) under view { x, y, z }.
export const toWorld = (rect, origin, view) => (rect ? { x: (rect.left - origin.left - view.x) / view.z, y: (rect.top - origin.top - view.y) / view.z, w: rect.width / view.z, h: rect.height / view.z } : null);

// UI.04 / roadmap 3.8: the passage a Tutor step is about, for its canvas slot and its Chat entry. The roadmap view never carries source text, so this asks the
// entitled resolve route for the step's R3 reference with excerpt: true (control plane source-refs.js: the learner's own CURRENT Markdown ref, at most 400
// characters). One answer per (canvas, ref id), cached; a failed request is not cached (the next ask tries again). -> { state: 'ready', text } | { state: 'unavailable' }
// (a changed or missing source, a PDF, or no reference: never a guessed or stale quote).
const excerpts = new Map();
export const UNAVAILABLE = Object.freeze({ state: 'unavailable' });
export const cachedExcerpt = (app, id) => excerpts.get(`${app}|${id}`) ?? null;
export function stepExcerpt(post, app, id) {
  if (!app || !id) return Promise.resolve(UNAVAILABLE);
  const key = `${app}|${id}`;
  if (excerpts.has(key)) return Promise.resolve(excerpts.get(key));
  const timing = startTiming('source_resolve_ms');
  return post(`${SOURCE_REFS}/resolve`, { app, ids: [id], excerpt: true }).then(
    ({ refs }) => { timing.end('ok'); const found = (refs || []).find(ref => ref.id === id), out = found?.status === 'current' && typeof found.excerpt === 'string' && found.excerpt ? { state: 'ready', text: found.excerpt } : UNAVAILABLE; excerpts.set(key, out); return out; },
    () => { timing.end('failed'); return UNAVAILABLE; });
}
export const forgetExcerpts = () => excerpts.clear();

// The Ctrl+K line that follows Explain on a highlighted passage (FileDocMarkdown's bulb opens Ctrl+K with /explain and the passage):
// the minted ref and the passage ride that one /explain or /interactive line, once, and only within five minutes. `held` is a ref
// ({ current: { sourceRef, text, at } }); any other line, or a stale hold, leaves the target as Ctrl+K sent it.
// The pill the bulb opens: 'explain' is the /interactive job route (the plan card with Generate, Edit and Cancel, and the skeleton beside the passage);
// 'explanation' would be the written /explain. One constant, so switching back is a one-word edit.
export const HIGHLIGHT_EXPLAIN_COMMAND = 'explain';
export function heldPassageTarget(target, line, held, now = Date.now()) {
  const pass = held?.current;
  if (!pass || !/^\/(explain|interactive)\b/i.test(String(line ?? '').trim())) return target;
  held.current = null;
  return now - pass.at > 5 * 60_000 ? target : { ...(target || {}), id: target?.id ?? null, text: pass.text, sourceRef: pass.sourceRef };
}
