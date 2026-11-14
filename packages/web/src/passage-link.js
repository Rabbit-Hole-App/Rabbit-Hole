// HL-146 (owner Ctrl+K spec item 6, option B of docs/features/explain/hl-145/server-proposal.md): a passage explained through Ctrl+K inside an EXPLANATION card. No server, no migration:
// the card already saves its own highlights (block.highlights, explanation-interactions.js), so the explained passage is one more of them, tagged `explainedBy: <the new card's id>` (drawn pink, never
// the Highlight yellow), and the new card carries `fromPassage: { cardId, highlightId, contentRevision }`. The board save stores the blocks as sent (learn-boards.js stateText). Pure: no React, no DOM.
import { highlightsFor, segmentHolds } from './explanation-interactions.js';

const fold = text => String(text ?? '').replace(/\s+/g, ' ').trim();

// ---- the passage held while the selection toolbar offers it ----
// The card's selection toolbar (ExplanationInteractions) knows the selection's anchors; Ctrl+K opens from the key or from that toolbar's button, and the editor reads the held passage when it opens,
// by card and words (so a selection that moved on is not the one explained).
const held = new Map();
export const holdPassage = (cardId, passage) => { if (cardId && passage?.segments?.length && passage.revision) held.set(cardId, passage); else held.delete(cardId); };
export const heldPassage = (cardId, words) => { const passage = held.get(cardId); return passage && fold(passage.quote) === fold(words) ? passage : null; };

// ---- linking ----
export const explainedHighlightId = newId => `explained-${newId}`;
// The blocks with the passage saved on its card and the new card naming it, or the very same array when there is nothing true to link (a missing card, no anchors, no revision, a card as its own source).
export function linkPassage(blocks, passage, newId) {
  const sourceId = passage?.cardId;
  if (!Array.isArray(blocks) || !sourceId || !newId || sourceId === newId || !passage.revision || !Array.isArray(passage.segments) || !passage.segments.length) return blocks;
  if (!blocks.some(block => block?.id === sourceId) || !blocks.some(block => block?.id === newId)) return blocks;
  const highlightId = explainedHighlightId(newId);
  return blocks.map(block => {
    if (block?.id === sourceId) return { ...block, highlights: [...(block.highlights || []).filter(h => h?.id !== highlightId), { id: highlightId, contentRevision: passage.revision, segments: passage.segments, explainedBy: newId }] };
    if (block?.id === newId) return { ...block, fromPassage: { cardId: sourceId, highlightId, contentRevision: passage.revision } };
    return block;
  });
}

// The ids of this card's explained highlights that still hold on the revision shown (a changed revision or moved text draws nothing: highlightsFor).
export const explainedIds = (block, revision) => new Set(highlightsFor(block, revision).filter(h => h.explainedBy).map(h => h.id));
export const hasExplained = block => Array.isArray(block?.highlights) && block.highlights.some(h => h?.explainedBy);

// ---- the new card's way back ----
export const PASSAGE_STATUS_TEXT = Object.freeze({
  changed: 'The card changed after this was written, so the passage is not shown.',
  'card-gone': 'The card this passage was in is not on this canvas.',
  'highlight-gone': 'The highlight on this passage was removed.',
});
// What the new card's source is now: { status, cardId, highlightId, title } or null when the card has no fromPassage. Never a guessed position: text that no longer holds is `changed`.
export function passageSource(blocks, card) {
  const link = card?.fromPassage;
  if (!link || typeof link.cardId !== 'string' || typeof link.highlightId !== 'string') return null;
  const source = (blocks || []).find(block => block?.id === link.cardId), title = source?.title ? String(source.title) : '';
  if (!source) return { status: 'card-gone', cardId: link.cardId, highlightId: link.highlightId, title };
  const highlight = (source.highlights || []).find(h => h?.id === link.highlightId && h.explainedBy === card.id);
  if (!highlight) return { status: 'highlight-gone', cardId: link.cardId, highlightId: link.highlightId, title };
  const holds = Array.isArray(highlight.segments) && highlight.segments.length > 0 && highlight.segments.every(segment => segmentHolds(source, segment));
  return { status: holds ? 'current' : 'changed', cardId: link.cardId, highlightId: link.highlightId, title };
}

// The camera's way to a passage: the card holding it is focused, then its card asks its own text to bring the mark into view (ExplanationInteractions).
export const PASSAGE_EVENT = 'rh:explained-passage';
