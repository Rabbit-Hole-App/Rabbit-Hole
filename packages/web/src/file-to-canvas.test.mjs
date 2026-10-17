// Context row -> Add to canvas for an imported file (file-to-canvas.js) and Ctrl+K Edit on a file card (file-chat-ref.js
// fileEditLocked): the stored source is reused through the canvas's own insert, nothing is attached or detached, and a file
// card with no semantic editing path is never offered Edit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addFileToCanvas, canvasFamilyOf, fileCardFromSource, sameFileCard, sourceFromHead } from './file-to-canvas.js';
import { fileEditLocked } from './file-chat-ref.js';

const ID = `fs_${'e'.repeat(24)}`, REV = 'f'.repeat(64);
const ref = (name = 'beach.mp4', range = null) => ({ sourceId: `file:${ID}@${REV}`, kind: 'file', name, version: '', range });
const head = (rev = REV) => new Headers({ 'x-source-rev': rev, 'content-type': 'video/mp4', 'content-length': '3145728', 'content-disposition': "attachment; filename*=UTF-8''beach%20day.mp4" });

test('which rows can become a card: shipped fileRef families only; PDFs, code and planned families keep their own paths', () => {
  assert.equal(canvasFamilyOf(ref('beach.mp4')).id, 'video');
  assert.equal(canvasFamilyOf(ref('photo.png')).id, 'image');
  assert.equal(canvasFamilyOf(ref('paper.pdf')), null, 'a PDF keeps its own Add to canvas (pdf-to-canvas)');
  assert.equal(canvasFamilyOf(ref('logo.svg')).id, 'svg', 'Lane 3 shipped svg and audio');
  assert.equal(canvasFamilyOf(ref('song.flac')).id, 'audio');
  assert.equal(canvasFamilyOf(ref('notes.doc')), null, 'a planned family: no button until its lane ships it (.docx shipped with Lane 2)');
  assert.equal(canvasFamilyOf({ ...ref(), kind: 'doc' }), null);
  assert.equal(canvasFamilyOf({ ...ref(), sourceId: 'file:fs_x@y' }), null);
});

test('the stored source from its HEAD; another revision is refused', () => {
  assert.deepEqual(sourceFromHead(head(), ref()), { id: ID, rev: REV, name: 'beach day.mp4', type: 'video/mp4', size: 3145728 });
  assert.equal(sourceFromHead(head('0'.repeat(64)), ref()), null);
});

test('the card is the family\'s card with one compact fileRef: no bytes, URL or text', () => {
  const card = fileCardFromSource(sourceFromHead(head(), ref()), canvasFamilyOf(ref()));
  assert.deepEqual([card.type, card.kind, card.label], ['file', 'clip', 'beach day']);
  assert.deepEqual(card.fileRef.source, { id: ID, rev: REV });
  assert.equal(card.fileRef.family, 'video');
  assert.ok(JSON.stringify(card).length < 2048);
  assert.doesNotMatch(JSON.stringify(card), /https?:|blob:|base64|\/api\//);
  assert.ok(sameFileCard(ID, REV)(card));
});

test('Add to canvas: one insert through the canvas (the ordinary save follows), owner first, then the canvas\'s own board; nothing attached', async () => {
  const calls = [], inserted = [];
  const ops = { insertCard: (block, options) => { inserted.push({ block, options }); return { id: 'new', existed: false }; } };
  const reply = statuses => async (url, init) => { calls.push([url, init.method]); const status = statuses.shift(); return { ok: status === 200, status, headers: head() }; };
  assert.deepEqual(await addFileToCanvas({ ref: ref(), app: 'canvas-1', ops, call: reply([200]) }), { id: 'new', existed: false });
  assert.deepEqual(calls, [[`/api/learn/files/${ID}`, 'HEAD']], 'the owner reads the stored source; nothing is uploaded');
  assert.equal(inserted.length, 1);
  assert.ok(inserted[0].options.same(inserted[0].block), 'an equivalent card is revealed, not added twice');
  assert.deepEqual(Object.keys(ops), ['insertCard'], 'the only thing it can touch is the canvas insert: no chat or context call');
  calls.length = 0;
  await addFileToCanvas({ ref: ref(), app: 'canvas-1', ops, call: reply([404, 200]) });
  assert.deepEqual(calls.map(c => c[0]), [`/api/learn/files/${ID}`, `/api/learn/files/${ID}?app=canvas-1&board=main`], 'a fork\'s owner reads through their own board');
  await assert.rejects(addFileToCanvas({ ref: ref(), app: 'canvas-1', ops, call: reply([404, 404]) }), /not available/);
  await assert.rejects(addFileToCanvas({ ref: ref(), app: 'canvas-1', ops, call: async () => ({ ok: true, status: 200, headers: head('0'.repeat(64)) }) }), /different version/);
  await assert.rejects(addFileToCanvas({ ref: ref('paper.pdf'), app: 'canvas-1', ops, call: reply([200]) }), /cannot be added/);
});

test('the Context row: Add to canvas runs on its own row and never attaches or detaches', () => {
  const pane = readFileSync(new URL('./SourcesPane.jsx', import.meta.url), 'utf8');
  assert.match(pane, /const canAddFile = ready && !canAdd && !!canvasFamilyOf\(ref\) && !!chat\.canvasOps\?\.insertCard;/);
  const button = pane.slice(pane.indexOf('{canAddFile &&'), pane.indexOf('</button>}', pane.indexOf('{canAddFile &&')));
  assert.match(button, /run\(item, 'canvas', \(\) => addFileToCanvas\(\{ ref, app: chat\.canvas, ops: chat\.canvasOps, headers: wsHeaders\(\) \}\)\)/);
  assert.match(button, /aria-label=\{`Add \$\{name\} to canvas`\}/);
  assert.doesNotMatch(button, /attach|detach|canvasContext/, 'its handler changes no chat or context state');
});

test('Ctrl+K: a file card with no semantic editing path takes no Edit; one whose family edits does', () => {
  const card = (id, family) => ({ id, type: 'file', kind: 'x', fileRef: { v: 1, source: { id: ID, rev: REV }, family } });
  const board = { blocks: [card('v', 'video'), card('n', 'notebook'), { id: 'e', type: 'explanation', title: 'Plain card' }] };
  assert.equal(fileEditLocked(['v'], board), true, 'a video has no edit path');
  assert.equal(fileEditLocked(['e', 'v'], board), true, 'any locked file in the selection locks Edit');
  assert.equal(fileEditLocked(['n'], board), false, 'a notebook edits (registry can.edit)');
  assert.equal(fileEditLocked(['e'], board), false);
  assert.equal(fileEditLocked(['v'], null), false);
  const editor = readFileSync(new URL('./InlineAiEditor.jsx', import.meta.url), 'utf8');
  assert.match(editor, /const fileLocked = !target\.creation && fileEditLocked\(target\.ids \|\| \[\], canvas\.board\?\.\(\)\);/);
  assert.match(editor, /useState\(target\.creation \|\| fileLocked \? 'explain'/, 'opens in Explain');
  assert.match(editor, /disabled=\{\(target\.creation \|\| fileLocked\) && value === 'edit'\}/, 'Edit is disabled in the mode menu');
  assert.match(editor, /if \(mode === 'edit' && fileLocked\) \{ setRefused\(FILE_EDIT_LOCKED\); return; \}/, 'and refused at send');
});

test('stored document cards retain their actual format for the family renderer', () => {
  const card = fileCardFromSource({ id: ID, rev: REV, name: 'report.docx', type: 'application/octet-stream', size: 100 }, canvasFamilyOf(ref('report.docx')));
  assert.equal(card.format, 'docx');
});
