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
