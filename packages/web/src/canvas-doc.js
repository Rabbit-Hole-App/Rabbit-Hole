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
// document (a 409): it goes over the server's board as the newer edit - unless it is the server's already. replaced: this
// browser's copy the server's replaces. Whatever loses comes back as `replaced`, for the page to keep under :replaced, and
// its document, when it has words the result lacks, is offered back (Restore my unsaved document): with kept, the losing
// document is the server's; otherwise it is this browser's. Nothing is ever dropped silently.
export function docOnServerCopy(serverState, { kept = null, replaced = null } = {}) {
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const keep = !!kept && !same(kept, serverState?.doc);
  const state = keep ? { ...serverState, doc: kept } : serverState;
  const lost = keep && !docIsEmpty(serverState?.doc) ? { ...(replaced || {}), doc: serverState.doc } : replaced;
  const offer = lost?.doc && !docIsEmpty(lost.doc) && !same(lost.doc, state?.doc) ? lost.doc : null;
  return { state, push: keep, offer, replaced: lost || null };
}

// A press that keeps the document editor's focus (AdaptiveCanvas's shell blurs a focused field when a press lands outside
// it): BlockNote's slash menu, toolbars and drag handles sit beside its contenteditable, inside the same [data-canvas-doc].
export const pressKeepsDocFocus = (active, target) => !!active?.closest?.('[data-canvas-doc]')?.contains(target);

// The save status after a PUT (LearnPage saveBoard): Saved only when the document sent is the document as shown, the
// editor's unsaved words included (liveBoard().doc); otherwise the push that carries them, already on its way, says Saved.
export const docSaved = (sent, shown) => JSON.stringify(sent ?? null) === JSON.stringify(shown ?? null);

// A drag the canvas's file drop must leave alone: anything without files (BlockNote's block drag carries blocknote/html).
export const isFileDrag = dataTransfer => !!dataTransfer?.types && [...dataTransfer.types].includes('Files');

// Where the document's caret is on screen (CanvasDoc, for the camera's caret follow): the range's own rect, or - on an
// empty line, where the caret sits beside the line's <br> and has no rect - the line's box.
export const caretRect = range => {
  const node = range?.startContainer, line = node && (node.nodeType === 1 ? node : node.parentElement);
  return [range?.getClientRects?.()[0], range?.getBoundingClientRect?.(), line?.getBoundingClientRect?.()].find(box => box && (box.width || box.height)) || null;
};

// Ctrl/Cmd+End and Ctrl/Cmd+Home in the document: 'end' or 'start', for the editor to move the caret itself (CanvasDoc).
export const docEdgeKey = ({ key, ctrlKey, metaKey, shiftKey, altKey }) => ((ctrlKey || metaKey) && !shiftKey && !altKey ? ({ End: 'end', Home: 'start' }[key] || null) : null);
