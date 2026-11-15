// Document cards (docs/features/blocknote-canvas.md), the parts the page and the canvas need without loading BlockNote:
// the block types this version edits, the migration of a legacy single document into a card, and the board's size against the server limit.

// BlockNote 0.54's default blocks less image, video, audio and file (no media in this MVP; CanvasDoc.jsx builds the schema
// from the same list). A saved block of any other type is content this version cannot edit, never dropped.
export const DOC_BLOCK_TYPES = ['paragraph', 'heading', 'quote', 'bulletListItem', 'numberedListItem', 'checkListItem', 'toggleListItem', 'codeBlock', 'table', 'divider'];
const KNOWN = new Set(DOC_BLOCK_TYPES);
export const unknownDocBlock = blocks => (blocks || []).some(block => !KNOWN.has(block?.type) || unknownDocBlock(block?.children));

// A document as a card (owner decision 2026-11-14, docs/features/blocknote-canvas.md): a canvas block of type 'doc' holding native
// BlockNote blocks, so it is saved, copied, shared and forked with the board like any card. Several per canvas.
export const DOC_CARD_SIZE = { w: 640, h: 640 };
export const newDocBlock = () => ({ id: crypto.randomUUID(), type: 'doc', dx: 0, dy: 0, blocks: [] });

// The server refuses a board over 1.9 MB (learn-boards.js MAX_STATE); the page warns from 85% of it, before a save fails.
export const BOARD_LIMIT = 1_900_000;
export const boardSizeWarning = chars => chars >= BOARD_LIMIT * 0.85;

// A document with no words in it (an empty sheet, empty paragraphs) is not content (home/canvas-local.js).
const hasText = block => (Array.isArray(block?.content) ? block.content.some(part => String(part?.text || '').trim()) : !!block?.content?.rows?.length)
  || (block?.type !== 'paragraph' && block?.type !== undefined && !Array.isArray(block?.content)) || (block?.children || []).some(hasText);
export const docIsEmpty = doc => !doc || !Array.isArray(doc.blocks) || !doc.blocks.some(hasText);

// A legacy board's single document (state.doc, retired 2026-11-15) becomes one Document card appended to the board's blocks, the
// blocks verbatim (an unknown block type is kept, never dropped). A pure load-time transform: the card id is a deterministic hash
// of the blocks, so two clients migrating the same state make the same card and the save's dedupe collapses them. An empty doc is
// dropped with no card; no doc is a no-op (the same object). Two FNV-1a runs with different seeds: synchronous (crypto.subtle is not).
const hashText = text => [0x811c9dc5, 0x01000193 ^ 0x5bd1e995].map(seed => {
  let h = seed;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}).join('');
export const docCardId = blocks => `doc-${hashText(JSON.stringify(blocks))}`;
export function migrateDocToCard(state) {
  if (!state || typeof state !== 'object' || !('doc' in state)) return state;
  const { doc, ...rest } = state;
  if (docIsEmpty(doc)) return rest;
  const id = docCardId(doc.blocks), blocks = Array.isArray(rest.blocks) ? rest.blocks : [];
  if (blocks.some(block => block?.id === id)) return { ...rest, blocks };
  return { ...rest, blocks: [...blocks, { id, type: 'doc', dx: 0, dy: 0, title: 'Document', blocks: doc.blocks }] };
}

// A press that keeps the document editor's focus (AdaptiveCanvas's shell blurs a focused field when a press lands outside
// it): BlockNote's slash menu, toolbars and drag handles sit beside its contenteditable, inside the same [data-canvas-doc].
export const pressKeepsDocFocus = (active, target) => !!active?.closest?.('[data-canvas-doc]')?.contains(target);

// A drag the canvas's file drop must leave alone: anything without files (BlockNote's block drag carries blocknote/html),
// and any drag that began on this page - an image or link inside a card, a Files row - even when the browser adds a Files
// entry to it (Chromium does for a dragged <img>). Only a file from outside the page is a drop.
let pageDrag = false;
export const notePageDrag = on => { pageDrag = on; };
if (typeof document !== 'undefined') {
  document.addEventListener('dragstart', () => notePageDrag(true), true);
  // dragend misses a drag whose source left the page mid-drag, so a drop ends it too, after the drop handlers have run.
  // ponytail: a page drag cancelled with a detached source stays marked until the next drop or page drag.
  document.addEventListener('dragend', () => notePageDrag(false), true);
  document.addEventListener('drop', () => notePageDrag(false));
}
export const isFileDrag = dataTransfer => !pageDrag && !!dataTransfer?.types && [...dataTransfer.types].includes('Files');

// Ctrl/Cmd+End and Ctrl/Cmd+Home in the document: 'end' or 'start', for the editor to move the caret itself (CanvasDoc).
export const docEdgeKey = ({ key, ctrlKey, metaKey, shiftKey, altKey }) => ((ctrlKey || metaKey) && !shiftKey && !altKey ? ({ End: 'end', Home: 'start' }[key] || null) : null);
