// The canvas's one document (docs/features/blocknote-canvas.md), the parts the page and the canvas need without loading
// BlockNote: the block types this version edits, the per-viewer view choice, and the board's size against the server limit.

// BlockNote 0.54's default blocks less image, video, audio and file (no media in this MVP; CanvasDoc.jsx builds the schema
// from the same list). A saved block of any other type is content this version cannot edit, never dropped.
export const DOC_BLOCK_TYPES = ['paragraph', 'heading', 'quote', 'bulletListItem', 'numberedListItem', 'checkListItem', 'toggleListItem', 'codeBlock', 'table', 'divider'];
const KNOWN = new Set(DOC_BLOCK_TYPES);
export const unknownDocBlock = blocks => (blocks || []).some(block => !KNOWN.has(block?.type) || unknownDocBlock(block?.children));

// Canvas or Editor, remembered in this browser for this person and this canvas (owner decision B1); Canvas when unset.
export const docViewKey = canvasKey => `${canvasKey}:view`;
export const readDocView = (storage, canvasKey) => {
  try { return storage.getItem(docViewKey(canvasKey)) === 'editor' ? 'editor' : 'canvas'; } catch { return 'canvas'; }
};
export const writeDocView = (storage, canvasKey, view) => {
  try { storage.setItem(docViewKey(canvasKey), view === 'editor' ? 'editor' : 'canvas'); } catch { /* the choice lasts this visit */ }
};

// The server refuses a board over 1.9 MB (learn-boards.js MAX_STATE); the page warns from 85% of it, before a save fails.
export const BOARD_LIMIT = 1_900_000;
export const boardSizeWarning = chars => chars >= BOARD_LIMIT * 0.85;

// A document with no words in it (an empty sheet, empty paragraphs) is not content (home/canvas-local.js).
const hasText = block => (Array.isArray(block?.content) ? block.content.some(part => String(part?.text || '').trim()) : !!block?.content?.rows?.length)
  || (block?.type !== 'paragraph' && block?.type !== undefined && !Array.isArray(block?.content)) || (block?.children || []).some(hasText);
export const docIsEmpty = doc => !doc || !Array.isArray(doc.blocks) || !doc.blocks.some(hasText);

// A newer server copy on open (LearnPage's board load). kept: this browser's document put aside by Reload and keep my
// document (a 409): it goes over the server's board as the newer edit - unless it is the server's already. Otherwise a
// replaced local copy whose document differs is offered back (Restore my unsaved document). Nothing is ever dropped.
export function docOnServerCopy(serverState, { kept = null, replaced = null } = {}) {
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if (kept && !same(kept, serverState?.doc)) return { state: { ...serverState, doc: kept }, push: true, offer: null };
  if (!kept && replaced?.doc && !same(replaced.doc, serverState?.doc)) return { state: serverState, push: false, offer: replaced.doc };
  return { state: serverState, push: false, offer: null };
}
