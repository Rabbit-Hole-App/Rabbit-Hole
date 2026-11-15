// The document card's page-side rules (docs/features/blocknote-canvas.md): the board size warning, the block types this
// version edits, and the migration of a legacy single document into a Document card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_LIMIT, DOC_BLOCK_TYPES, boardSizeWarning, docIsEmpty, migrateDocToCard, unknownDocBlock } from './canvas-doc.js';

const para = text => ({ id: text || 'p', type: 'paragraph', content: text ? [{ type: 'text', text, styles: {} }] : [], children: [] });

test('migrateDocToCard: a legacy document becomes one Document card, blocks verbatim; nothing is dropped', () => {
  const blocks = [para('Light reactions make ATP'), { id: 'x', type: 'futureWidget', props: {}, content: 'kept', children: [] }, { ...para(''), type: 'divider' }];
  const state = { v: 1, blocks: [{ id: 'note', type: 'sticky', dx: 4, dy: 5 }], doc: { v: 1, x: 0, y: 0, w: 760, blocks } };
  const next = migrateDocToCard(state);
  assert.equal('doc' in next, false, 'the legacy key is gone');
  assert.equal(next.blocks.length, 2);
  assert.deepEqual(next.blocks[0], state.blocks[0], 'existing cards are untouched');
  const card = next.blocks[1];
  assert.deepEqual({ ...card, id: undefined }, { id: undefined, type: 'doc', dx: 0, dy: 0, title: 'Document', blocks });
  assert.match(card.id, /^doc-[0-9a-f]{16}$/);
  assert.equal(card.blocks, blocks, 'the blocks are passed through, unknown types included');
  assert.equal(migrateDocToCard({ blocks: [], doc: { blocks } }).blocks.length, 1, 'a board with no cards gains the card');
  assert.ok('doc' in state, 'the input is not mutated');
});

test('migrateDocToCard: same state, same id; idempotent; other content, other id; empty and absent doc add no card', () => {
  const doc = { v: 1, blocks: [para('one')] };
  const a = migrateDocToCard({ blocks: [], doc }), b = migrateDocToCard({ blocks: [], doc: JSON.parse(JSON.stringify(doc)) });
  assert.equal(a.blocks[0].id, b.blocks[0].id, 'two clients make the same card');
  const again = migrateDocToCard({ ...a, doc });
  assert.equal(again.blocks.length, 1, 'a state that already holds the card (a second migration, a server state that kept doc) gains nothing');
  assert.equal('doc' in again, false);
  assert.notEqual(migrateDocToCard({ blocks: [], doc: { blocks: [para('two')] } }).blocks[0].id, a.blocks[0].id);
  const empty = migrateDocToCard({ blocks: [{ id: 'n', type: 'sticky' }], doc: { v: 1, blocks: [para(''), para('')] } });
  assert.deepEqual(empty, { blocks: [{ id: 'n', type: 'sticky' }] }, 'an empty sheet is dropped, no card');
  const plain = { blocks: [{ id: 'n' }] };
  assert.equal(migrateDocToCard(plain), plain, 'no doc is the same object');
  assert.equal(migrateDocToCard(null), null);
});

test('the size warning starts at 85% of the server limit', () => {
  assert.equal(BOARD_LIMIT, 1_900_000);
  assert.equal(boardSizeWarning(1_614_999), false);
  assert.equal(boardSizeWarning(1_615_000), true);
});

test('block types: text only (no media); an unknown saved type is caught, also when nested', () => {
  for (const type of ['image', 'video', 'audio', 'file']) assert.equal(DOC_BLOCK_TYPES.includes(type), false, type);
  assert.equal(unknownDocBlock([para('a'), { ...para('b'), type: 'heading' }]), false);
  assert.equal(unknownDocBlock([{ ...para('a'), children: [{ ...para('b'), type: 'image' }] }]), true);
  assert.equal(docIsEmpty({ blocks: [para(''), { ...para(''), type: 'heading' }] }), true);
  assert.equal(docIsEmpty({ blocks: [para('words')] }), false);
});

// Home canvas-doc-check bug 2 (lead 12:08 AM PT): a click on a slash menu item did not apply it and dropped the focus to the
// page. The canvas shell blurs a focused field when a press lands outside it (AdaptiveCanvas onPointerDownCapture), and
// BlockNote's menus, toolbars and drag handles sit beside its contenteditable, not in it. A press anywhere in the same
// document keeps the editor's focus.
test('a press on the document editor\'s own menus keeps its focus; a press outside the document does not', async () => {
  const { pressKeepsDocFocus } = await import('./canvas-doc.js');
  const menuItem = {}, card = {};
  const paper = { contains: node => node === menuItem };
  const editor = { closest: selector => (selector === '[data-canvas-doc]' ? paper : null) };
  const note = { closest: () => null };
  assert.equal(pressKeepsDocFocus(editor, menuItem), true, 'the slash menu item');
  assert.equal(pressKeepsDocFocus(editor, card), false, 'a card on the canvas');
  assert.equal(pressKeepsDocFocus(note, menuItem), false, 'a canvas note is not the document');
  assert.equal(pressKeepsDocFocus(null, menuItem), false);
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8'), /if \(editable && !active\.contains\(event\.target\) && !pressKeepsDocFocus\(active, event\.target\) && /, 'the shell uses it');
});

// Home canvas-doc-check bug 1 (lead 12:08 AM PT): Ctrl+End in a long document scrolled the overflow-hidden canvas surface
// (ProseMirror's scrollRectIntoView and the browser's caret reveal scroll any ancestor), sliding the world under a camera
// that never moved. Any scroll of the surface becomes a camera move, committed at once (flushSync) so docCaret measures
// after it, and the surface goes back to 0. The browser check is C:/s/bn/ctrlend.mjs (scrollTop 6979 before the fix).
test('a scroll of the canvas surface becomes a camera move and the surface returns to 0', async () => {
  const { readFileSync } = await import('node:fs');
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /const dx = element\.scrollLeft, dy = element\.scrollTop;\s+if \(!dx && !dy\) return;\s+element\.scrollLeft = 0; element\.scrollTop = 0;\s+flushSync\(\(\) => setView\(v => \(autoView\.current = \{ \.\.\.v, x: v\.x - dx, y: v\.y - dy \}\)\)\);/);
  assert.match(canvas, /element\.addEventListener\('scroll', scrolled\);/);
});

// Lead 12:56 AM PT (block-drag diagnosis fix 1): the canvas's file drop acted on any drop that reached the surface, so an
// editor drag (BlockNote's block drag carries blocknote/html, never Files) could be cancelled and sent as an empty upload.
test('only a drag that carries files is a file drop', async () => {
  const { isFileDrag } = await import('./canvas-doc.js');
  assert.equal(isFileDrag({ types: ['blocknote/html', 'text/html', 'text/plain'] }), false, 'a block drag');
  assert.equal(isFileDrag({ types: ['Files'] }), true);
  assert.equal(isFileDrag(null), false);
  // Repository graph Release 2 (lane DROP): a drag that began on this page - a card's image, a Files row - is never a file
  // drop, Files entry or not; once it ends, a file from outside drops again.
  const { notePageDrag } = await import('./canvas-doc.js');
  notePageDrag(true);
  assert.equal(isFileDrag({ types: ['text/uri-list', 'text/html', 'Files'] }), false, 'an image dragged from a card');
  notePageDrag(false);
  assert.equal(isFileDrag({ types: ['Files'] }), true);
  const { readFileSync } = await import('node:fs');
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  // A Files-browser code drag (code-card.js) is taken first; any other drop is a file drop only when it carries files.
  assert.match(canvas, /onDrop=\{event => \{[^\n]*if \(!onDropFiles \|\| !isFileDrag\(event\.dataTransfer\)\) return;/);
});

// Lead 1:14 AM PT (fast-e2e 38703004485, card-context-menu-check part 4): only the document's own caret reveal pans. A
// scroll from anywhere else (Playwright's or a focus's scrollIntoView of a card) is left as main had it, or the card moves
// under the tools gutter on every click retry.
test('the surface scroll pans the camera only while the document has the focus', async () => {
  const { readFileSync } = await import('node:fs');
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  // While a card is focused the surface never scrolls (Focus places the card on screen, not the camera); otherwise as before.
  assert.match(canvas, /const scrolled = \(\) => \{(?:\s+\/\/[^\n]*)+\s+if \(focusRef\.current\) \{ element\.scrollLeft = 0; element\.scrollTop = 0; return; \}\s+\/\/[^\n]*\s+if \(!document\.activeElement\?\.closest\?\.\('\[data-canvas-doc\]'\)\) return;\s+const dx = element\.scrollLeft/);
});

// Lead 1:28 AM PT: Ctrl+End / Ctrl+Home are the editor's own moves, not the browser's native caret move, which raced
// ProseMirror (the caret came back to the start in 2 of 3 runs). Ctrl+Shift+End/Home stay native (no range API here).
test('docEdgeKey: Ctrl/Cmd+End and Ctrl/Cmd+Home only', async () => {
  const { docEdgeKey } = await import('./canvas-doc.js');
  assert.equal(docEdgeKey({ key: 'End', ctrlKey: true }), 'end');
  assert.equal(docEdgeKey({ key: 'Home', metaKey: true }), 'start');
  assert.equal(docEdgeKey({ key: 'End' }), null, 'End alone is the line end');
  assert.equal(docEdgeKey({ key: 'End', ctrlKey: true, shiftKey: true }), null, 'extending the selection stays native');
  assert.equal(docEdgeKey({ key: 'End', ctrlKey: true, altKey: true }), null);
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('./CanvasDoc.jsx', import.meta.url), 'utf8'), /const edge = docEdgeKey\(event\);/);
});
