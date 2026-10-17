// Imported files in chat (file-chat-ref.js; canvas-file-imports.md section 6): the canonical ref, its range shapes, one
// attachment for a selected card added to chat, selection kept apart from pins, and honest coverage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COVERAGE, describeFileCard, fileChatRef, fileCoverage, fileRange, fileScope } from './file-chat-ref.js';
import { attachedReducer, sameRef } from './chat-context.js';
import { refsForSend } from './chat-draft.js';
import { turnRefs } from './repo-context.js';

const ID = `fs_${'a'.repeat(24)}`, REV = 'b'.repeat(64);
const card = (view = {}, status = { preview: 'ready', context: 'none' }) => ({ id: 'c1', type: 'file', kind: 'workbook', label: 'sales',
  fileRef: { v: 1, source: { id: ID, rev: REV }, family: 'workbook', meta: { name: 'sales.xlsx', size: 3 * 1024 * 1024 }, view, status } });

test('the canonical ref is the source revision plus the card\'s scope; no stored revision, no ref', () => {
  assert.deepEqual(fileChatRef(card()), { sourceId: `file:${ID}@${REV}`, kind: 'file', name: 'sales.xlsx', version: '', range: null });
  assert.deepEqual(fileChatRef(card({ sheet: 'Q1' })).range, { sheet: 'Q1' });
  assert.deepEqual(fileChatRef(card({ pages: [3] })).range, { page: 3 });
  assert.equal(fileChatRef(card({ pages: [3, 5] })).range, null, 'several pages: the whole source');
  assert.deepEqual(fileChatRef(card({ slide: 2 })).range, { slide: 2 });
  assert.equal(fileChatRef({ id: 'x', type: 'file', kind: 'clip', assetKey: 'drop:1' }), null, 'an older card without fileRef');
  assert.equal(fileChatRef({ ...card(), fileRef: { ...card().fileRef, source: { id: ID, rev: null } } }), null, 'an upload not stored yet');
  assert.equal(fileChatRef({ ...card(), fileRef: { ...card().fileRef, source: { id: 'fs_short', rev: REV } } }), null);
});

test('every scope shape of the contract, and nothing else', () => {
  for (const range of [{ page: 1 }, { slide: 4 }, { sheet: 'Q1' }, { sheet: 'Q1', cells: 'A1:C20' }, { rows: [1, 50] }, { rows: [2, 9], cols: [1, 3] },
    { start: 10, end: 42 }, { cell: 'cell-7' }, { startSec: 12 }, { startSec: 12, endSec: 40.5 }, { object: 'Wheel_L' }]) assert.deepEqual(fileRange(range), range);
  assert.equal(fileRange(null), null);
  for (const bad of [{ page: 0 }, { page: 1, slide: 1 }, { sheet: '' }, { sheet: 'Q1', cells: 'a1' }, { rows: [5, 2] }, { rows: [1] }, { start: 9, end: 3 },
    { startSec: -1 }, { startSec: 5, endSec: 2 }, { quote: 'x' }, { object: 'x'.repeat(201) }, [], 'p1'])
    assert.throws(() => fileRange(bad), /range/, JSON.stringify(bad));
  assert.equal(fileScope(null), null);
});

test('a file card selected and then added to chat is one attachment; clearing the selection keeps the pin', () => {
  const selected = fileChatRef(card({ sheet: 'Q1' })), added = fileChatRef(card({ sheet: 'Q1' }));
  assert.ok(sameRef(selected, added));
  let attached = attachedReducer([], { type: 'attach', ref: added });
  attached = attachedReducer(attached, { type: 'attach', ref: selected });
  assert.equal(attached.length, 1, 'Add to chat twice is one ref');
  // The turn: the pinned ref, plus the selection as temporary context only when it is not already pinned.
  assert.deepEqual(turnRefs(attached, [selected]).refs, [added], 'one ref sent, not two');
  assert.deepEqual(refsForSend(turnRefs(attached, [selected]).refs, { target: selected }), [added], 'a file ref never carries text from the browser');
  // Clearing the selection is the selection only: the pinned ref stays.
  assert.deepEqual(turnRefs(attached, []).refs, [added]);
  // A different scope of the same file is a different attachment.
  assert.equal(attachedReducer(attached, { type: 'attach', ref: fileChatRef(card({ sheet: 'Q2' })) }).length, 2);
});

test('coverage is what was extracted, never what renders', () => {
  assert.deepEqual(COVERAGE, ['listed', 'extracted', 'partial', 'visually inspected', 'transcribed', 'unavailable', 'omitted']);
  assert.equal(fileCoverage(card().fileRef), 'listed', 'a ready preview with no extraction is listed only');
  assert.equal(fileCoverage(card({}, { preview: 'ready', context: 'extracted' }).fileRef), 'extracted');
  assert.equal(fileCoverage(card({}, { preview: 'failed', context: 'partial' }).fileRef), 'partial');
  assert.equal(fileCoverage(card({}, { context: 'unavailable' }).fileRef), 'unavailable');
  assert.equal(fileCoverage({}), 'listed');
  const described = describeFileCard(card());
  assert.equal(described.title, 'sales.xlsx');
  assert.match(described.text, /^Workbook file on the canvas: sales\.xlsx, 3 MiB\. only its name and type are known/);
  assert.doesNotMatch(described.text, /readable when|can be read/, 'not described as readable');
  assert.match(describeFileCard(card({}, { context: 'extracted' })).text, /its extracted text can be read when the file is attached/);
});
