// Source passage references (Tutor release R3, docs/features/source-refs.md). A card made from a selected passage carries
// `sourceRef`: the source, its immutable revision (the sha256 of the stored bytes) and where in it the passage sits. Pure and
// shared: the browser builds drafts and reads cards with it, the control plane sanitizes with it, so both sides read one
// shape. The server mints the ref (control-plane source-refs.js); nothing here grants access.
//
//   { v: 1, id: 'sref_<24 hex>', kind: 'markdown' | 'pdf', source: { key, rev, name, home }, anchor }
//   markdown anchor: { quote: { exact, prefix, suffix } }   (the text quote, as file-doc-highlights.js keeps it)
//   pdf anchor: { kind: 'text' | 'region', page: { index, label }, rects, rotate, view, quote }   (pdf-anchor.js, PDF points)
// A shared reader's copy has no id, key, revision or quote (sharedSourceRef): the name tells where the card came from and
// nothing opens.
export const SOURCE_REF_ID = /^sref_[0-9a-f]{24}$/;
export const SOURCE_KEY = /^((doc:ctx|pdf:upload):[0-9a-f]{12}|file:fs_[0-9a-f]{24})$/;
export const SHA256 = /^[0-9a-f]{64}$/;
export const STATUSES = Object.freeze(['current', 'changed', 'missing', 'unavailable']);
export const QUOTE_LIMITS = Object.freeze({ exact: 8000, context: 500 });
// SOURCE_REF_EVENT: View passage asks a Markdown file card to emphasize a quote. EXPLAIN_PASSAGE_EVENT: a card's Explain on a selected passage
// hands LearnPage the minted ref id and the passage text to start the explanation with.
export const SOURCE_REF_EVENT = 'rh:source-passage', EXPLAIN_PASSAGE_EVENT = 'rh:explain-passage';

export const kindOfKey = key => (typeof key !== 'string' ? null : key.startsWith('file:') ? 'markdown' : /^(doc:ctx|pdf:upload):/.test(key) ? 'pdf' : null);

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
const quoteOf = quote => (quote && typeof quote.exact === 'string' && quote.exact
  ? { exact: quote.exact.slice(0, QUOTE_LIMITS.exact), prefix: text(quote.prefix, QUOTE_LIMITS.context), suffix: text(quote.suffix, QUOTE_LIMITS.context) } : null);

// The card's sourceRef as this module reads it, or null for anything malformed (a saved board can hold any JSON). A ref
// with an id opens; one without (a shared reader's) is a label.
export function sourceRefOf(block) {
  const ref = block?.sourceRef;
  if (!ref || typeof ref !== 'object' || ref.v !== 1 || (ref.kind !== 'markdown' && ref.kind !== 'pdf')) return null;
  const name = text(ref.source?.name, 160) || (ref.kind === 'pdf' ? 'PDF' : 'Markdown file');
  const opens = SOURCE_REF_ID.test(ref.id || '') && kindOfKey(ref.source?.key) === ref.kind && SHA256.test(ref.source?.rev || '');
  if (!opens) {
    const label = ref.kind === 'pdf' ? text(ref.anchor?.page?.label, 40) : '';
    return { v: 1, id: null, kind: ref.kind, source: { key: null, rev: null, name, home: null }, anchor: label ? { page: { index: null, label } } : null };
  }
  const anchor = ref.kind === 'markdown' ? (quoteOf(ref.anchor?.quote) ? { quote: quoteOf(ref.anchor.quote) } : null)
    : Number.isInteger(ref.anchor?.page?.index) && Array.isArray(ref.anchor.rects) ? ref.anchor : null;
  if (!anchor) return null;
  return { v: 1, id: ref.id, kind: ref.kind, source: { key: ref.source.key, rev: ref.source.rev, name, home: typeof ref.source.home === 'string' ? ref.source.home : null }, anchor };
}
export const navigable = ref => !!ref?.id;

// What a shared reader, a link fork or a publication sees of the ref: where the card came from, never a way into the source.
export function sharedSourceRef(ref) {
  if (!ref || typeof ref !== 'object' || (ref.kind !== 'markdown' && ref.kind !== 'pdf')) return null;
  const label = ref.kind === 'pdf' ? text(ref.anchor?.page?.label, 40) || null : null;
  return { v: 1, kind: ref.kind, source: { name: text(ref.source?.name, 160) || (ref.kind === 'pdf' ? 'PDF' : 'Markdown file') }, ...(label ? { anchor: { page: { label } } } : {}) };
}
// A block with its sourceRef reduced for sharing; a block without one is returned as it is.
export function withSharedSourceRef(block) {
  if (!block || typeof block !== 'object' || !('sourceRef' in block)) return block;
  const { sourceRef: ref, ...rest } = block;
  const shared = sharedSourceRef(ref);
  return shared ? { ...rest, sourceRef: shared } : rest;
}

// "notes.md" or "paper.pdf, p. 3": where the passage is, in the words the chip shows.
export function refLabel(ref) {
  if (!ref) return '';
  const page = ref.anchor?.page, where = page ? (page.label || page.index) : null;
  return `${ref.source.name}${where ? `, p. ${where}` : ''}`;
}

// The words a status gets on the chip. A current ref says nothing.
export const STATUS_TEXT = Object.freeze({
  changed: 'This source changed after the explanation was written, so the passage is not shown.',
  missing: 'This source is not available here, so the passage cannot be shown.',
  unavailable: 'You cannot open this source.',
});
// The same, as the one short line a card shows; the long form is its title and what a screen reader says.
export const STATUS_SHORT = Object.freeze({ changed: 'Source changed', missing: 'Source not available', unavailable: 'Source not available' });
export const NO_FILE_CARD = 'The file this passage is in is not on this canvas.';
export const CREATE_REFUSED = Object.freeze({
  source_changed: 'This source changed since you selected this passage. Select the passage again.',
  source_unavailable: 'This source is not available to you now. Select the passage again from a source you can open.',
});

// ---- Drafts: what the browser sends the server to mint a ref from a selection ----

// A selected passage of a stored Markdown file card: the file source's revision is the version, the quote the anchor.
export function markdownDraft({ block, quote, app }) {
  const source = block?.kind === 'markdown' ? block.fileRef?.source : null;
  const q = quoteOf(quote);
  if (!app || !source?.id || !SHA256.test(source.rev || '') || !q) return null;
  return { app, key: `file:${source.id}`, rev: source.rev, anchor: { quote: q } };
}
// A PDF excerpt's anchor (pdf-excerpt.js excerptOf): the document's sha256 at capture is the version.
export function excerptDraft({ excerpt, app }) {
  const source = excerpt?.source;
  if (!app || !SOURCE_KEY.test(source?.key || '') || kindOfKey(source.key) !== 'pdf' || !SHA256.test(source.sha256 || '') || !excerpt.page) return null;
  const { kind, page, rotate = 0, view = [], rects = [] } = excerpt;
  return { app, key: source.key, ...(source.home ? { home: source.home } : {}), rev: source.sha256,
    anchor: { kind, page: { index: page.index, label: page.label ?? null }, rects, rotate, view, quote: kind === 'text' ? excerpt.quote : null } };
}
// The ref a selected card offers: a PDF excerpt card's own excerpt. A Markdown passage is offered by the file card's text
// selection (FileDocMarkdown), not by a card.
export const draftOfBlock = (block, app) => (block?.excerpt ? excerptDraft({ excerpt: block.excerpt, app }) : null);

// ---- Navigation, from the blocks on the canvas ----

// Passage to explanation: the cards whose ref is this source at this revision (for a PDF, on this page when given), in board
// order. A card whose ref names an older revision of the same source is listed as changed: never matched by position or text.
export function explanationsFor(blocks, { key, rev, page = null }) {
  const current = [], changed = [];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    const ref = sourceRefOf(block);
    if (!navigable(ref) || ref.source.key !== key) continue;
    if (ref.source.rev !== rev) { changed.push(block.id); continue; }
    if (page != null && ref.anchor.page?.index !== page) continue;
    current.push({ cardId: block.id, ref });
  }
  return { current, changed };
}
// Card to passage in the PDF reader: the companion reader's ref at the page, carrying the anchor the reader emphasizes (the
// reader compares the revision and says "changed" itself). null when the ref cannot open or is not a PDF.
export function readerRef(ref) {
  if (!navigable(ref) || ref.kind !== 'pdf') return null;
  const { key, rev, name, home } = ref.source, { quote: _quote, ...anchor } = ref.anchor;
  const id = key.slice(key.indexOf(':') + 1);
  const base = key.startsWith('pdf:')
    ? { sourceId: `paper:${id}`, kind: 'web', name, version: '', range: { page: anchor.page.index }, ...(home ? { home } : {}) }
    : { sourceId: `doc:${id}`, kind: 'doc', name, version: '', range: { page: anchor.page.index } };
  return { ...base, range: { ...base.range, excerpt: { v: 1, id: ref.id, source: { key, sha256: rev, name, home }, ...anchor } } };
}
// Card to passage in a Markdown file card: the card holding the ref's file source, at any revision (the card itself says when
// its text differs), or null.
export function markdownCardOf(blocks, ref) {
  const id = ref?.source?.key?.slice('file:'.length);
  const holders = (blocks || []).filter(block => block?.kind === 'markdown' && block.fileRef?.source?.id === id);
  return (holders.find(block => block.fileRef.source.rev === ref.source.rev) || holders[0])?.id ?? null;
}
