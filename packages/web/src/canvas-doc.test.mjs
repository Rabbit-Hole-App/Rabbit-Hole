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
