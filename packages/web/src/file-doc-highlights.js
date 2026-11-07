import { containsOffset, locateQuote } from './learn-wiki-highlights.js';

// A Markdown file card's saved highlights (docs/features/pdf-excerpts.md "Markdown cards"): the same pdf_highlights rows and
// routes as a PDF or webpage capture, under the key file:<file source id>, with the file source's own revision as the version.
// The anchor is the text quote (exact + a little text either side), never a DOM position, so Show more, a re-render, a resize
// or a reload keep each highlight on the occurrence it was made on. The file itself is never touched.
export const markdownHighlightSource = (block, app) => {
  const id = block?.kind === 'markdown' ? block.fileRef?.source?.id : null;
  return id && app && block.fileRef.source.rev ? { app, key: `file:${id}` } : null;
};

// The PUT body (control-plane pdf-excerpts.js highlightAnchor): the route also wants a page, rects and a view, which a
// Markdown card has no use for; one empty rectangle satisfies it and nothing reads it.
export const markdownHighlightBody = (source, block, quote) => ({
  ...source, sha256: block.fileRef.source.rev, kind: 'text', page: { index: 1, label: null }, rects: [[0, 0, 0, 0]], rotate: 0, view: [0, 0, 0, 0], quote,
});

// What the list answered for the revision on show; another revision's highlights are not drawn.
export const currentHighlights = (answer, rev) => (answer && answer.sha256 === rev ? answer.highlights || [] : []);

// Each highlight's place in the rendered text (offsets into root.textContent); one the text no longer holds is left out.
export const placeHighlights = (text, highlights) => highlights.flatMap(h => { const span = locateQuote(text, h.quote); return span ? [{ h, span }] : []; });

// The highlight under a caret offset, if any.
export const highlightAt = (placed, offset) => placed.find(({ span }) => containsOffset(span, offset))?.h || null;

// UI.07 (file 05): the Tutor's persistent source relationships in a Markdown card, a layer apart from the learner's highlights (wiki-highlight) and the
// transient navigation emphasis. cards: explanationsFor(...).current (saved cards with a verified ref at THIS revision, published by the canvas); resolve(card):
// its span in the rendered text { status, start, end } (exact quote, or folded raw for a roadmap card once the whole file is drawn). Overlapping spans are one
// anchor with every card on it (one chooser), in text order; an unresolved or ambiguous quote makes no anchor (never a look-alike passage).
export function tutorAnchors(cards, resolve) {
  const spans = cards.flatMap(card => { const span = resolve(card); return span?.status === 'resolved' ? [{ start: span.start, end: span.end, cards: [card] }] : []; }).sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  for (const span of spans) {
    const last = out.at(-1);
    if (last && span.start < last.end) { last.end = Math.max(last.end, span.end); last.cards.push(...span.cards); } else out.push({ ...span, cards: [...span.cards] });
  }
  return out;
}
// Which file 05 shape a resolved range takes, from the rendered element it sits in: a diagram block (outline), code lines (tinted lines), a heading with the
// content after it (whole-section rail), else prose (the exact text tinted). closest(selector) answers for the range's start container; spansBlocks: the range
// crosses more than one top-level block.
export const anchorShape = ({ inDiagram, inCode, startsAtHeading, spansBlocks }) => (inDiagram ? 'diagram' : inCode ? 'code' : startsAtHeading && spansBlocks ? 'section' : 'prose');
// The View card button's words (file 05): tooltip "View card", accessible name "View card: <title>"; several cards share one chooser.
export const viewCardLabel = cards => (cards.length === 1 ? `View card: ${cards[0].title || 'Explanation'}` : `View card: ${cards.length} cards`);
