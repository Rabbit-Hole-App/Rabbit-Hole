// Source passage references in the browser (Tutor release R3, docs/features/source-refs.md; control plane source-refs.js). The
// server mints a ref from a selection (mintSourceRef), a job and a card carry it, and a card's status is read again
// (resolveSourceRef) whenever it is shown: an immutable revision means "current" is a fact the server checked, not a guess.
// `post` is the page's api POST (learn-slash.js's, LearnPage's): { data, status } errors as api() throws them. Pure: no React.
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
      try { resolve(new Map((await post(`${SOURCE_REFS}/resolve`, { app, ids: [...batch.ids] })).refs.map(ref => [ref.id, ref]))); }
      catch { resolve(new Map()); }
    }, delay));
    waiting.set(key, batch);
  }
  batch.ids.add(id);
  return batch.done.then(map => map.get(id) || null);
}

// The canvas's blocks that matter here - a card with a navigable ref, a Markdown file card - and its camera, as a store the readers
// (the Markdown file card, the PDF reader) read from: they sit outside the canvas's React tree. The canvas publishes
// (SourceRefChip.jsx useSourceRefIndex); a reader subscribes.
let state = { blocks: [], focus: null, passages: [], goProposal: null };
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

// ---- The Tutor's passages (Fix C): where on a source each roadmap step stands, and how to get to what it made ----
// The canvas publishes one link per step that has a place to go (roadmap-canvas.js passageLinksOf: { stepId, sourceKey, start, end, target }) and how to reach a pending proposal
// (goProposal(stepId): the camera to its card, an explicit click only). A Markdown file card reads them to draw its small passage-to-explanation icons.
export function publishRoadmapPassages(passages, goProposal = null) {
  const same = JSON.stringify(passages) === JSON.stringify(state.passages) && goProposal === state.goProposal;
  if (same) return;
  state = { ...state, passages, goProposal };
  for (const listener of listeners) listener();
}
// A Markdown file card tells where a step's passage is drawn (raw offsets in, a screen rect out; null when it is not drawn or cannot be told apart), so a proposal can be
// placed beside the right paragraph. Nothing scrolls or paints here.
const readers = new Map();
export function registerPassageReader(blockId, reader) { readers.set(blockId, reader); return () => { if (readers.get(blockId) === reader) readers.delete(blockId); }; }
export const passageRect = (blockId, start, end) => { try { return readers.get(blockId)?.rectOf(start, end) ?? null; } catch { return null; } };

// Card to passage. A PDF opens the companion reader at the page with the passage emphasized (the existing
// 'small:excerpt-source' event, ExcerptCard.jsx); a Markdown passage focuses its file card, which then emphasizes the quote.
// Returns what happened, so the chip can say so: 'opened' | 'unavailable' (the ref cannot open) | 'no-card' (the Markdown card is
// not on this canvas).
export function viewPassage(ref, { blocks = state.blocks, focus = state.focus, emit = event => window.dispatchEvent(event), wait = setTimeout } = {}) {
  if (!navigable(ref)) return 'unavailable';
  if (ref.kind === 'pdf') { emit(new CustomEvent('small:excerpt-source', { detail: { ref: readerRef(ref) } })); return 'opened'; }
  const cardId = markdownCardOf(blocks, ref);
  if (!cardId) return 'no-card';
  focus?.(cardId);
  // The camera moves first; the card paints its emphasis once it is on screen.
  wait(() => emit(new CustomEvent(SOURCE_REF_EVENT, { detail: { cardId, key: ref.source.key, rev: ref.source.rev, quote: ref.anchor.quote, anchor: ref.anchor } })), 250);
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
