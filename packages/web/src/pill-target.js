// A Chat context pill goes to what it was made from (owner 2026-11-07: "click on the pill in the chat and goes to the
// content/section/card we attached"). One helper for every pill: it finds the canvas object behind a ref or a selection and
// asks the canvas to frame it. A deleted target says so and is never restored from a pill.
import { excerptChatRef } from './pdf-excerpt.js';
import { pdfRef } from './pdf-source.js';
import { fileChatRef } from './file-chat-ref.js';
import { codeCardRef } from './code-card.js';
import { SOURCE_REF_EVENT } from './source-ref.js';
import { CARD_GONE } from './canvas-refs-model.js';

export const AREA_GONE = 'That area is no longer on this canvas.';
// A ref made from a canvas object: if its object is gone the pill says so. Every other ref (a PDF, a paper, a repository file) opens
// its reader and also frames its card when one is on this canvas; with no card there is nothing to report.
export const ON_CANVAS = new Set(['card', 'image', 'media', 'group', 'file']);

// The ids of the canvas objects a ref may stand for, best first (blocks is the canvas's card list).
export function refObjectIds(ref, blocks = []) {
  const sourceId = String(ref?.sourceId || ''), own = /^(?:card|image|media):(.+)$/.exec(sourceId);
  if (own) return [own[1]];
  if (ref?.kind === 'group') return (ref.range?.cardIds || []).map(String);
  const made = [];
  for (const block of blocks) {
    try { if ([excerptChatRef(block), pdfRef(block), fileChatRef(block), codeCardRef(block)].some(entry => entry?.sourceId === sourceId)) made.push(block.id); } catch { /* a card the builders cannot read is not this ref's */ }
  }
  return made;
}

// A quote added from a Markdown card is flashed in that card, as View passage does for a Tutor passage (source-refs.js viewPassage).
const flash = (ref, block, { emit = event => window.dispatchEvent(event), wait = setTimeout } = {}) => {
  const quote = ref?.range?.quote, source = block?.fileRef?.source;
  if (typeof quote === 'string' && quote && source) wait(() => emit(new CustomEvent(SOURCE_REF_EVENT, { detail: { cardId: block.id, key: source.id, rev: source.rev, quote: { exact: quote } } })), 250);
};

// Returns { located: id } when the canvas framed it, { problem } when the pill's own object is gone, null when the ref has no canvas object
// to go to (the pill's reader still opens). ops: { blocks(), locateObject(id) }; emit and wait are for the passage flash.
export function goToRef(ref, ops) {
  const blocks = ops?.blocks?.() || [];
  const id = refObjectIds(ref, blocks).find(candidate => ops.locateObject(candidate));
  if (id) { flash(ref, blocks.find(block => block.id === id), ops); return { located: id }; }
  return ON_CANVAS.has(ref?.kind) ? { problem: CARD_GONE } : null;
}

// The selected-on-the-canvas chip: a card, a region or a group by its id, an Ask about selection area by its area: id (its remove X leaves no area).
export function goToSelection(selection, ops) {
  const id = String(selection?.id ?? '');
  if (!id) return null;
  if (id.startsWith('area:')) return ops.locateArea(id) ? { located: id } : { problem: AREA_GONE };
  return ops.locateObject(id) ? { located: id } : null; // a selection exists on the canvas by definition; only an area can be gone
}
