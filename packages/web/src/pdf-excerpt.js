// PDF excerpt cards (C:/s/spec/pdf-excerpts/contract.md, CARD lane): a reader draft becomes one canvas block - a text excerpt
// (an explanation card, which has the Scrollable / Full content layout) or a region excerpt (an image `file` card of its stored
// crop) - with the contract's `excerpt` and the learner's own `note` kept apart. Never a second copy of the PDF, never a model call.
import { wsHeaders } from './api.js';
import { family } from './file-capabilities.js';
import { fileChatRef } from './file-chat-ref.js';
import { fileCardFromSource } from './file-to-canvas.js';
import { pageRef, pdfSource } from './pdf-source.js';
import { newId, putHighlight } from './pdf-highlights.js';
import { getCrop } from './pdf-excerpt-drafts.js';
import { cacheAsset } from './learn-asset-cache.js';
import { sourceKey } from './file-source-client.js';

// Owner decision 4: one text card holds at most 8,000 characters; the reader offers Shorten or Split before it gets here.
export const EXCERPT_LIMIT = 8000;
// A text card's opening box: fixed, so its flow place is known and a split's cards stack exactly (Full content grows it).
export const EXCERPT_CARD = { w: 440, h: 340 };

const nameOf = excerpt => String(excerpt?.source?.name || 'PDF').slice(0, 100);
export const pageText = page => String(page?.label || page?.index || '');
// Deterministic, never AI: the document's title and page. The chat chip uses exactly this; a card of a split adds its part.
export const excerptName = excerpt => `${nameOf(excerpt)} · p. ${pageText(excerpt.page)}`;
export const excerptTitle = excerpt => `${excerptName(excerpt)}${excerpt.part ? ` (part ${excerpt.part.index} of ${excerpt.part.of})` : ''}`;
export const isExcerpt = block => !!block?.excerpt && (block.excerpt.kind === 'text' || block.excerpt.kind === 'region');

// The crop upload (SERVER lane route): raw PNG, retry-safe on the excerpt id. Throws the server's own reason.
export async function uploadCrop({ app, board = 'main', excerpt, blob }, call = fetch) {
  const { key, home, sha256 } = excerpt.source;
  const query = new URLSearchParams({ app, board, key, ...(home && home !== app ? { home } : {}), sha256, page: String(excerpt.page.index) });
  const response = await call(`/api/learn/pdf-excerpts/${encodeURIComponent(excerpt.id)}/crop?${query}`, { method: 'PUT', body: blob, headers: { ...wsHeaders(), 'content-type': 'image/png' } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(body?.error || `The picture was not saved (the server answered ${response.status}).`), { status: response.status });
  return body;
}

// Whether this learner may open the excerpt's PDF now (the bytes routes' own check, via GET /api/learn/pdf-source). Never throws.
export async function sourceAvailable({ app, excerpt }, call = fetch) {
  const { key, home } = excerpt?.source || {};
  if (!pdfSource(key)) return false;
  const query = new URLSearchParams({ app, key, ...(home && home !== app ? { home } : {}) });
  try { return (await call(`/api/learn/pdf-source?${query}`, { headers: wsHeaders() })).ok; } catch { return false; }
}

// The contract's Excerpt, rebuilt from known keys only: nothing a draft carries beside it (the crop's bytes) reaches the board.
// An uploaded paper's bytes live on a canvas: `home` defaults to this one, so a copy, fork or Rabbit Hole still names it.
function excerptOf(draft, app, { highlightId, crop }) {
  const key = draft.source.key;
  return {
    v: 1, id: draft.id, kind: draft.kind,
    source: { key, sha256: draft.source.sha256, name: draft.source.name, home: draft.source.home ?? (pdfSource(key)?.kind === 'paper' ? app : null) },
    page: { index: draft.page.index, label: draft.page.label ?? null }, rotate: draft.rotate ?? 0, view: [...(draft.view || [])],
    rects: (draft.rects || []).map(rect => [...rect]), quote: draft.kind === 'text' ? { ...draft.quote } : null,
    highlightId: highlightId ?? null, crop: crop ?? null, part: draft.part ? { index: draft.part.index, of: draft.part.of } : null,
  };
}

// The stored crop's image card fields, at the crop's own aspect ratio. `stored`: the crop route's fileRef, which is exactly
// fileCardFromSource's (SERVER lane); without it (a crop already on the excerpt) the same shape is rebuilt from the crop.
function cropCard(excerpt, stored) {
  const card = fileCardFromSource({ id: excerpt.crop.source.id, rev: excerpt.crop.source.rev, name: `${nameOf(excerpt)}, page ${pageText(excerpt.page)} excerpt.png`, type: 'image/png' }, family('image'), {});
  const fileRef = stored?.source?.id === excerpt.crop.source.id ? structuredClone(stored) : card.fileRef;
  return { ...card, fileRef: { ...fileRef, meta: { ...fileRef.meta, width: excerpt.crop.width, height: excerpt.crop.height } } };
}

const uploads = new Map(), highlightIds = new Map(), inflight = new Map();
// A region's crop, stored once per excerpt id (a retry after a later step failed reuses it). { crop, stored }.
// A canvas never saved has no board yet, and the server stores a crop only for a saved board: save it (saveBoard) and send once more.
async function storedCrop(draft, excerpt, { app, board, saveBoard = null }, { crop = getCrop, upload = uploadCrop, cache = cacheAsset }) {
  if (draft.crop?.source?.id) return { crop: draft.crop, stored: null };
  if (!uploads.has(draft.id)) {
    const picture = await crop(draft.id);
    if (!picture?.blob) throw new Error('The picture of this region could not be made.');
    const send = () => upload({ app, board, excerpt, blob: picture.blob });
    const answer = await send().catch(async problem => {
      if (problem.status !== 404 || !/save this board/i.test(problem.message) || !saveBoard) throw problem;
      await saveBoard();
      return send();
    });
    // This browser keeps the stored bytes under the source's key, as an import does: the card shows them before the board save
    // that writes its file reference (the server's read rule); a fresh browser reads them from the server after that save.
    await Promise.resolve(cache(sourceKey(answer.source), picture.blob)).catch(() => {});
    uploads.set(draft.id, { crop: { source: { id: answer.source.id, rev: answer.source.rev }, width: answer.width ?? picture.width, height: answer.height ?? picture.height }, stored: answer.fileRef || null });
  }
  return uploads.get(draft.id);
}

async function build(draft, { app, board = 'main', saveBoard = null, deps = {} }) {
  if (draft.kind !== 'text' && draft.kind !== 'region') throw new Error('This selection cannot become a card.');
  const exact = draft.kind === 'text' ? String(draft.quote?.exact || '') : '';
  if (draft.kind === 'text' && !exact.trim()) throw new Error('Nothing is selected.');
  // Never truncated: an oversize selection is the reader's Shorten / Split choice, before any card exists.
  if (exact.length > EXCERPT_LIMIT) throw new Error(`This selection has ${exact.length.toLocaleString('en-US')} characters; one excerpt card holds ${EXCERPT_LIMIT.toLocaleString('en-US')}. Shorten it or split it into cards.`);
  let excerpt = excerptOf(draft, app, { highlightId: draft.highlightId });
  const region = draft.kind === 'region' ? await storedCrop(draft, excerpt, { app, board, saveBoard }, deps) : null;
  // The reader highlight: a saved one keeps its identity; otherwise one id per draft, so a retry resends the same highlight.
  let highlightId = draft.highlightId;
  if (!highlightId) {
    highlightId = highlightIds.get(draft.id) || (deps.newId || newId)('pdfh');
    highlightIds.set(draft.id, highlightId);
    const { key, home, sha256 } = excerpt.source;
    await (deps.putHighlight || putHighlight)(highlightId, { app, key, home, sha256, kind: draft.kind, page: excerpt.page, rects: excerpt.rects, rotate: excerpt.rotate, view: excerpt.view, quote: excerpt.quote });
    // An open reader of this PDF re-reads its highlights (LearnPaper listens), so the new mark shows at once.
    globalThis.dispatchEvent?.(new CustomEvent('small:pdf-highlights', { detail: { key } }));
  }
  excerpt = { ...excerpt, highlightId, crop: region?.crop ?? null };
  const title = excerptTitle(excerpt);
  if (draft.kind === 'text') return { type: 'explanation', title, excerpt, note: '', w: EXCERPT_CARD.w, h: EXCERPT_CARD.h };
  // The text card's width, not the full column: a column-wide card spilled past the visible canvas beside the open panel.
  return { ...cropCard(excerpt, region.stored), label: title, excerpt, note: '', w: EXCERPT_CARD.w };
}

// The draft as a block, or throws with a reason to show. Every server step (crop, highlight) has finished before it resolves,
// so a failure leaves no card. One run per draft id: a double click or a retry while one is in flight joins it.
// saveBoard: saves this canvas's board now (canvasApi.persist), for a crop on a board never saved. deps (tests): { crop, upload, putHighlight, newId }.
export function materialize(draft, options) {
  if (!draft?.id) return Promise.reject(new Error('This selection is no longer available. Select it again.'));
  if (!inflight.has(draft.id)) inflight.set(draft.id, build(draft, options).finally(() => inflight.delete(draft.id)));
  return inflight.get(draft.id);
}

// One insertion intent (one or several draft ids: a split's parts) -> one insert, one Undo step. A repeat of the same intent
// joins the run in flight, and once its cards exist only reveals them. A new draft id (a deliberate second Add) is a new card.
// { draft(id), build(draft), find(excerptId) -> block id | null, insert(blocks) -> ids, focus(id) }. Resolves { ids, existed }.
const placing = new Map();
export function placeExcerpts(draftIds, { draft, build: make, find, insert, focus }) {
  const key = draftIds.join(' ');
  if (placing.has(key)) return placing.get(key);
  const run = (async () => {
    const existing = draftIds.map(find);
    if (existing.every(Boolean)) { focus?.(existing.at(-1)); return { ids: existing, existed: true }; }
    const drafts = draftIds.filter((id, index) => !existing[index]).map(draft);
    if (!drafts.length || drafts.some(entry => !entry)) throw new Error('This selection is no longer available. Select it again.');
    const blocks = await Promise.all(drafts.map(make));
    return { ids: insert(blocks.filter(block => !find(block.excerpt.id))) || [], existed: false };
  })().finally(() => placing.delete(key));
  placing.set(key, run);
  return run;
}

// The chat context of an excerpt card or a draft (contract "Chat"). Text: its own ref kind, the verbatim words as client text,
// the learner's note on a card. Region: the stored crop's image file ref (the model is sent the picture), named for its page.
// Two excerpts of one PDF are two refs (their ids); the same card selected and added to chat is one (sameRef).
export function excerptText(excerpt, note = '') {
  const head = `Verbatim excerpt from "${nameOf(excerpt)}", page ${pageText(excerpt.page)}:\n${excerpt.quote?.exact || ''}`;
  return String(note || '').trim() ? `${head}\n\nLearner note: ${String(note).trim()}` : head;
}
export function excerptChatRef(blockOrDraft) {
  const block = blockOrDraft?.excerpt ? blockOrDraft : null, excerpt = block ? block.excerpt : blockOrDraft;
  if (!excerpt?.id || !excerpt.source || !excerpt.page) return null;
  const name = excerptName(excerpt).slice(0, 120);
  if (excerpt.kind === 'region') {
    const ref = block?.fileRef ? fileChatRef(block, null) : excerpt.crop?.source ? fileChatRef(cropCard(excerpt), null) : null;
    return ref && { ...ref, name, open: excerptSourceRef(excerpt) };
  }
  if (excerpt.kind !== 'text' || !excerpt.quote?.exact) return null;
  // The name carries the printed page ("p. xii"); chips show no range label for an excerpt. open: the reader ref a
  // chip click opens (the server keeps only the known ref fields).
  return { sourceId: `excerpt:${excerpt.id}`, kind: 'excerpt', name, open: excerptSourceRef(excerpt), version: '', range: { page: excerpt.page.index }, text: excerptText(excerpt, block?.note) };
}
// A region draft's crop is stored before it can be attached (Add to chat needs no card): { ref, fileRef } for chat.addToChat.
export async function draftChatRef(draft, { app, board = 'main', saveBoard = null, deps = {} }) {
  if (draft.kind !== 'region') return { ref: excerptChatRef(draft), fileRef: null };
  const excerpt = excerptOf(draft, app, {});
  const { crop, stored } = await storedCrop(draft, excerpt, { app, board, saveBoard }, deps);
  const card = cropCard({ ...excerpt, crop }, stored);
  return { ref: { ...fileChatRef(card, null), name: excerptName(excerpt).slice(0, 120), open: excerptSourceRef(excerpt) }, fileRef: card.fileRef };
}

// Open source: the companion reader's ref for the PDF at the excerpt's page (pdf-source.js pageRef shape, with its home), plus
// the anchor itself, which the reader brings into view and emphasizes.
export function excerptSourceRef(excerpt) {
  const ref = pageRef({ pdf: excerpt?.source?.key, number: excerpt?.page?.index, label: excerpt?.source?.name, home: excerpt?.source?.home });
  return ref && { ...ref, range: { ...ref.range, excerpt } };
}

// The card as canvas context (describeBlock: selection, canvas_context, Ctrl+K): the quotation marked verbatim with its source and
// page, the learner's note marked as theirs, never mixed; a region says it is a picture nobody has transcribed.
export function describeExcerpt(block) {
  const excerpt = block.excerpt, title = excerptTitle(excerpt), where = `"${nameOf(excerpt)}", page ${pageText(excerpt.page)}`;
  const note = String(block.note || '').trim() ? `Learner's note (their own words, not from the PDF): ${String(block.note).trim()}` : '';
  if (excerpt.kind === 'region') return { kind: 'PDF excerpt (image)', title, material: 'file',
    text: [`Excerpt from the PDF ${where}: a cropped picture of a selected region of the page. Its content has not been transcribed; a model sees it only when the picture is attached.`, note].filter(Boolean).join('\n') };
  return { kind: 'PDF excerpt', title,
    text: [`Verbatim quotation from the PDF ${where} (only this selection of the document, not the whole PDF):`, `"""\n${excerpt.quote?.exact || ''}\n"""`, note].filter(Boolean).join('\n') };
}

// A copy of an excerpt card for a new Rabbit Hole (Dive.jsx): the same excerpt and crop reference - no PDF bytes, no new access
// (the source routes still check the reader) - its home named, the learner's note kept.
export function excerptSeed(block, parentApp) {
  if (!isExcerpt(block)) return null;
  const { id: _id, dx: _dx, dy: _dy, space: _space, refs: _refs, ...copy } = block;
  const source = copy.excerpt.source;
  return { ...copy, excerpt: { ...copy.excerpt, source: { ...source, home: source.home ?? (pdfSource(source.key)?.kind === 'paper' ? parentApp : null) } } };
}
