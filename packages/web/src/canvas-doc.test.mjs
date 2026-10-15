// The canvas document's page-side rules (docs/features/blocknote-canvas.md): the view choice, the board size warning, the
// block types this version edits, and what a newer server copy does to a document this browser still holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_LIMIT, DOC_BLOCK_TYPES, boardSizeWarning, docIsEmpty, docOnServerCopy, docViewKey, readDocView, unknownDocBlock, writeDocView } from './canvas-doc.js';

const memory = () => { const items = new Map(); return { getItem: key => (items.has(key) ? items.get(key) : null), setItem: (key, value) => items.set(key, String(value)) }; };
const KEY = 'small.adaptive-canvas:gmail-com:a@gmail.com:canvas-0f9e8d7c';
const para = text => ({ id: text || 'p', type: 'paragraph', content: text ? [{ type: 'text', text, styles: {} }] : [], children: [] });

test('the view: Canvas until this person picks Editor here; the choice is per canvas key', () => {
  const storage = memory();
  assert.equal(docViewKey(KEY), `${KEY}:view`);
  assert.equal(readDocView(storage, KEY), 'canvas');
  writeDocView(storage, KEY, 'editor');
  assert.equal(readDocView(storage, KEY), 'editor');
  assert.equal(readDocView(storage, `${KEY}x`), 'canvas', 'another canvas keeps its own default');
  writeDocView(storage, KEY, 'anything');
  assert.equal(readDocView(storage, KEY), 'canvas');
  assert.equal(readDocView({ getItem: () => { throw Error('blocked'); } }, KEY), 'canvas', 'blocked storage reads as Canvas');
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

test('a newer server copy: a kept document goes over it and is pushed; a replaced one is offered back; nothing is dropped', () => {
  const server = { blocks: [], doc: { v: 1, x: 0, y: 0, w: 760, blocks: [para('server')] } };
  const mine = { v: 1, x: 0, y: 0, w: 760, blocks: [para('mine, unsaved')] };
  const kept = docOnServerCopy(server, { kept: mine, replaced: { doc: mine } });
  assert.deepEqual(kept.state.doc, mine, 'Reload and keep my document: mine goes over the server copy');
  assert.equal(kept.push, true, 'and is saved as the newer edit');
  assert.deepEqual(kept.offer, server.doc, 'the server document it replaced is offered back');
  const plain = docOnServerCopy(server, { replaced: { doc: mine } });
  assert.deepEqual(plain.state, server, 'a plain open shows the server copy');
  assert.deepEqual(plain.offer, mine, 'and offers mine back');
  assert.deepEqual(docOnServerCopy(server, { replaced: { doc: server.doc } }), { state: server, push: false, offer: null, replaced: { doc: server.doc } }, 'the same document is nothing to offer');
  assert.deepEqual(docOnServerCopy(server, { kept: server.doc }), { state: server, push: false, offer: null, replaced: null }, 'keeping what the server has is no push');
});

// Lead 11:43 PM PT (owner decision A1): Reload and keep my document never loses the server's copy. On 8a478cab the server's
// document was overwritten by the push with nothing kept and nothing offered.
test('Reload and keep my document keeps the server document it replaces under :replaced and offers it back', () => {
  const server = { blocks: [{ id: 'card' }], doc: { v: 1, x: 0, y: 0, w: 760, blocks: [para('written on the laptop')] } };
  const mine = { v: 1, x: 0, y: 0, w: 760, blocks: [para('written here, refused with 409')] };
  const local = { blocks: [{ id: 'local card' }], doc: mine };
  const next = docOnServerCopy(server, { kept: mine, replaced: local });
  assert.deepEqual(next.state, { ...server, doc: mine }, 'mine wins as the newer edit');
  assert.equal(next.push, true);
  assert.deepEqual(next.replaced, { blocks: [{ id: 'local card' }], doc: server.doc }, ':replaced holds every losing piece: this browser other content and the server document');
  assert.deepEqual(next.offer, server.doc, 'Restore my unsaved document brings the server document back');
  const emptyServer = docOnServerCopy({ blocks: [], doc: { v: 1, x: 0, y: 0, w: 760, blocks: [para('')] } }, { kept: mine });
  assert.equal(emptyServer.offer, null, 'an empty server sheet is nothing to offer');
  assert.equal(emptyServer.replaced, null);
});

// Lead 12:03 AM PT (owner decision A1, Toolbar canvas-doc-persist-check decision 3): Restore my unsaved document set the
// canvas's document but the open editor kept showing the server text - CanvasDoc reads its blocks once, when the editor is
// made, so a replaced document needs a new editor. And a reload within the save pause (500 ms + 400 ms) must not drop the
// last words typed: the page's pagehide writes them to this browser's copy first.
test('a replaced document remounts its editor; leaving the page writes pending words first', async () => {
  const { readFileSync } = await import('node:fs');
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /replaceDoc: next => \{[^\n]*setDocEpoch\(epoch => epoch \+ 1\);[^\n]*\}/, 'replaceDoc gives the editor a new key');
  assert.match(canvas, /<CanvasDoc key=\{docEpoch\} blocks=\{doc\.blocks\}/, 'the editor is keyed by that epoch');
  assert.match(canvas, /window\.addEventListener\('pagehide', flushDoc\)/, 'leaving the page flushes the pending document');
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

// Home P0 (lead 12:23 AM PT, diagnosis C:/s/bn/saved-stale.md): every PUT answer set Saved, so words typed while a PUT was
// in flight showed Saved for up to about 900 ms before the push that carries them. Saved only when the PUT carried the
// document as shown (the editor's unsaved words included).
test('docSaved: Saved only when the PUT carried the document as shown', async () => {
  const { docSaved } = await import('./canvas-doc.js');
  const run = (words, styles = {}) => ({ type: 'text', text: words, styles });
  const sent = { v: 1, x: 0, y: 0, w: 760, blocks: [{ id: 'p', type: 'paragraph', props: {}, content: [run('Light reactions make ATP')], children: [] }] };
  const shown = JSON.parse(JSON.stringify(sent));
  assert.equal(docSaved(sent, shown), true, 'the server has what is shown');
  shown.blocks[0].content = [run('Light reactions make '), run('ATP', { bold: true })];
  assert.equal(docSaved(sent, shown), false, 'bold typed during the PUT is not saved yet');
  assert.equal(docSaved(undefined, null), true, 'no document on either side');
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('./LearnPage.jsx', import.meta.url), 'utf8'), /const shown = canvas\(\)\?\.liveBoard\?\.\(\);\s+setSaveState\(!shown \|\| docSaved\(state\.doc, shown\.doc\) \? \{ state: 'saved' \} : \{ state: 'saving' \}\);/);
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
  assert.match(canvas, /onDrop=\{event => \{ if \(!onDropFiles \|\| !isFileDrag\(event\.dataTransfer\)\) return;/);
});

// Lead 1:02 AM PT, Home scenario 5: on an empty line the DOM caret sits beside the line's <br> and has no client rect, so
// docCaret was never told about it and the camera did not follow new empty lines (only ProseMirror's own reveal, which
// knows nothing of the composer and chrome over the canvas). The empty line's own box stands in for the caret.
test('caretRect: the range rect when there is one, else the empty line box', async () => {
  const { caretRect } = await import('./canvas-doc.js');
  const zero = { x: 0, y: 0, width: 0, height: 0 }, line = { x: 40, y: 700, width: 600, height: 24 }, text = { x: 90, y: 300, width: 1, height: 21 };
  assert.deepEqual(caretRect({ getClientRects: () => [text], getBoundingClientRect: () => text, startContainer: { nodeType: 3, parentElement: { getBoundingClientRect: () => line } } }), text);
  assert.deepEqual(caretRect({ getClientRects: () => [], getBoundingClientRect: () => zero, startContainer: { nodeType: 1, getBoundingClientRect: () => line } }), line, 'an empty paragraph');
  assert.equal(caretRect(null), null);
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('./CanvasDoc.jsx', import.meta.url), 'utf8'), /const box = caretRect\(range\);/);
});

// Lead 1:14 AM PT (fast-e2e 38703004485, card-context-menu-check part 4): only the document's own caret reveal pans. A
// scroll from anywhere else (Playwright's or a focus's scrollIntoView of a card) is left as main had it, or the card moves
// under the tools gutter on every click retry.
test('the surface scroll pans the camera only while the document has the focus', async () => {
  const { readFileSync } = await import('node:fs');
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /const scrolled = \(\) => \{\s+\/\/[^\n]*\s+if \(!document\.activeElement\?\.closest\?\.\('\[data-canvas-doc\]'\)\) return;\s+const dx = element\.scrollLeft/);
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
