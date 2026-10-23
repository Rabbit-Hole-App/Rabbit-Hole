import test from 'node:test';
import assert from 'node:assert/strict';
import { SPLIT_DEFAULT, defaultStudy, eligible, readStudy, studyKey, readerPinTarget, studyLayout, studyReducer, studyScope, writeStudy } from './study-state.js';

const KEY = 'small.adaptive-canvas:org:me@example.com:app';
const memory = () => { const map = new Map(); return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map }; };
const PDF_REF = { sourceId: 'doc:7', kind: 'doc', name: 'Paper.pdf', version: '', range: { page: 1 } };

test('readStudy: missing, bad JSON, wrong version and throwing storage all read as the default, never throw', () => {
  const storage = memory();
  assert.deepEqual(readStudy(storage, KEY), defaultStudy());
  storage.setItem(studyKey(KEY), '{not json');
  assert.deepEqual(readStudy(storage, KEY), defaultStudy());
  storage.setItem(studyKey(KEY), JSON.stringify({ v: 2, mode: 'study' }));
  assert.deepEqual(readStudy(storage, KEY), defaultStudy());
  assert.deepEqual(readStudy({ getItem: () => { throw Error('blocked'); } }, KEY), defaultStudy());
  assert.deepEqual(readStudy(null, KEY), defaultStudy());
  assert.equal(defaultStudy().split, 0.4);
});

test('readStudy: bad fields fall back one by one; split is clamped to 0.25..0.65', () => {
  const storage = memory();
  storage.setItem(studyKey(KEY), JSON.stringify({ v: 1, mode: 'weird', work: 'notebook', pin: { cardId: 'c1', kind: 'video', ref: PDF_REF }, split: 2, reader: { page: 'x', zoom: 1.5 }, canvasView: { x: 1 } }));
  const state = readStudy(storage, KEY);
  assert.equal(state.mode, 'canvas');
  assert.equal(state.work, 'notebook');
  assert.equal(state.pin, null, 'a kind Release 1 does not pin is dropped');
  assert.equal(state.split, 0.65);
  assert.deepEqual(state.reader, { zoom: 1.5 });
  assert.equal(state.canvasView, null);
  storage.setItem(studyKey(KEY), JSON.stringify({ v: 1, split: 0.01 }));
  assert.equal(readStudy(storage, KEY).split, 0.25);
  storage.setItem(studyKey(KEY), JSON.stringify({ v: 1, split: 'wide' }));
  assert.equal(readStudy(storage, KEY).split, SPLIT_DEFAULT);
});

test('writeStudy then readStudy round-trips; each canvas keeps its own state', () => {
  const storage = memory();
  const pinned = studyReducer(defaultStudy(), { type: 'pin', cardId: 'pdf1', kind: 'pdf', ref: PDF_REF });
  assert.deepEqual(writeStudy(storage, KEY, pinned), { ok: true });
  assert.deepEqual(readStudy(storage, KEY), pinned);
  assert.deepEqual(readStudy(storage, `${KEY}2`), defaultStudy(), 'another canvas is untouched');
  assert.deepEqual([...storage.map.keys()], [`${KEY}:study`]);
});

test('writeStudy: a storage failure is reported, never thrown and never reported as saved', () => {
  const full = { getItem: () => null, setItem: () => { throw Error('QuotaExceededError'); } };
  const result = writeStudy(full, KEY, defaultStudy());
  assert.equal(result.ok, false);
  assert.match(result.error, /Quota/);
  assert.equal(writeStudy(null, KEY, defaultStudy()).ok, false);
});

test('reducer: pin opens Study; only pin replaces the pin; unpin returns to Canvas', () => {
  let s = studyReducer(defaultStudy(), { type: 'pin', cardId: 'pdf1', kind: 'pdf', ref: PDF_REF });
  assert.equal(s.mode, 'study');
  assert.deepEqual(s.pin, { cardId: 'pdf1', kind: 'pdf', ref: PDF_REF });
  s = studyReducer(s, { type: 'readerAt', reader: { page: 4, zoom: 1.25 } });
  s = studyReducer(s, { type: 'select', id: 'other' });
  assert.equal(s.pin.cardId, 'pdf1', 'an unknown action (selecting a card) never retargets the pin');
  assert.deepEqual(studyReducer(s, { type: 'pin', cardId: 'pdf1', kind: 'pdf', ref: PDF_REF }).reader, { page: 4, zoom: 1.25 }, 'pinning the same card keeps its place');
  const changed = studyReducer(s, { type: 'pin', cardId: 'note1', kind: 'text', ref: { sourceId: 'card:note1', kind: 'text', name: 'Note', text: 'hello' } });
  assert.equal(changed.pin.cardId, 'note1');
  assert.equal(changed.reader, null, 'a new reference starts at its own beginning');
  assert.deepEqual(studyReducer(s, { type: 'pin', cardId: '', kind: 'pdf', ref: PDF_REF }), s, 'a bad pin changes nothing');
  const off = studyReducer(s, { type: 'unpin' });
  assert.equal(off.pin, null);
  assert.equal(off.mode, 'canvas');
  assert.equal(off.split, s.split);
});

test('reducer: Canvas hides the pin, Study restores it; setWork, setSplit, saveCamera', () => {
  let s = studyReducer(defaultStudy(), { type: 'pin', cardId: 'pdf1', kind: 'pdf', ref: PDF_REF });
  s = studyReducer(s, { type: 'setMode', mode: 'canvas' });
  assert.equal(s.mode, 'canvas');
  assert.equal(s.pin.cardId, 'pdf1', 'View > Canvas keeps the pin');
  s = studyReducer(s, { type: 'setMode', mode: 'study' });
  assert.equal(s.mode, 'study');
  s = studyReducer(s, { type: 'setWork', work: 'notebook', notebookId: 'nb1' });
  assert.deepEqual([s.work, s.notebookId], ['notebook', 'nb1']);
  s = studyReducer(s, { type: 'setWork', work: 'canvas' });
  assert.deepEqual([s.work, s.notebookId], ['canvas', 'nb1'], 'the notebook target is remembered');
  assert.equal(studyReducer(s, { type: 'setSplit', split: 0.9 }).split, 0.65);
  assert.equal(studyReducer(s, { type: 'setSplit', split: 0.5 }).split, 0.5);
  assert.deepEqual(studyReducer(s, { type: 'saveCamera', view: { x: 10, y: -4, z: 0.8 } }).canvasView, { x: 10, y: -4, z: 0.8 });
  assert.equal(studyReducer(s, { type: 'saveCamera', view: null }).canvasView, null);
});

test('eligible: PDF, text and sticky notes, Explanation; nothing else', () => {
  assert.equal(eligible({ type: 'pdf' }), 'pdf');
  assert.equal(eligible({ type: 'explanation' }), 'explanation');
  assert.equal(eligible({ kind: 'text', text: 'a note' }), 'text');
  assert.equal(eligible({ kind: 'sticky', text: 'a note' }), 'text');
  for (const other of [{ type: 'webpage' }, { type: 'video' }, { type: 'notebook' }, { type: 'repo-code' }, { type: 'code' }, { type: 'quiz' }, { type: 'slide' }, { kind: 'text', mode: 'code' }, { kind: 'rect' }, null, undefined, 'pdf'])
    assert.equal(eligible(other), null, JSON.stringify(other));
});

test('isolation: two canvases, two viewers and two review boards never read each other; the board suffix is chatKey-shaped', () => {
  const storage = memory();
  const key = (email, app) => `small.adaptive-canvas:org:${email}:${app}`;
  const a = key('ann@example.com', 'canvas-1'), b = key('bob@example.com', 'canvas-1'), c = key('ann@example.com', 'canvas-2');
  assert.equal(studyScope(a, null), a);
  assert.equal(studyKey(studyScope(a, 'tides')), `${a}:tides:study`);
  const pinned = studyReducer(defaultStudy(), { type: 'pin', cardId: 'pdf1', kind: 'pdf', ref: PDF_REF });
  assert.equal(writeStudy(storage, studyScope(a), pinned).ok, true);
  for (const other of [studyScope(b), studyScope(c), studyScope(a, 'tides')]) assert.deepEqual(readStudy(storage, other), defaultStudy(), other);
  assert.deepEqual(readStudy(storage, studyScope(a)), pinned);
});

test('a pin keeps the ref it was given, version included (no version is invented or checked here)', () => {
  const s = studyReducer(defaultStudy(), { type: 'pin', cardId: 'pdf1', kind: 'pdf', ref: { ...PDF_REF, version: '' } });
  assert.equal(s.pin.ref.version, '');
  assert.equal(studyReducer(defaultStudy(), { type: 'pin', cardId: 'p', kind: 'pdf', ref: { ...PDF_REF, version: 'v7' } }).pin.ref.version, 'v7');
});

test('studyLayout: beside the work while both keep their minimum, stacked from the real width, split clamped to the minimums', () => {
  assert.deepEqual(studyLayout({ width: 1000, height: 800, split: 0.4 }), { stacked: false, size: 400 });
  assert.deepEqual(studyLayout({ width: 1000, height: 800, split: 0.65 }), { stacked: false, size: 600 });
  assert.deepEqual(studyLayout({ width: 720, height: 800, split: 0.25 }), { stacked: false, size: 300 }, 'never below the reference minimum');
  assert.deepEqual(studyLayout({ width: 720, height: 800, split: 0.65 }), { stacked: false, size: 320 }, 'the work keeps its minimum');
  assert.equal(studyLayout({ width: 699, height: 800, split: 0.4 }).stacked, true);
  assert.deepEqual(studyLayout({ width: 500, height: 800, split: 0.4 }), { stacked: true, size: 320 });
  assert.deepEqual(studyLayout({ width: 500, height: 300, split: 0.65 }), { stacked: true, size: 180 }, 'a short space keeps the reference minimum');
});

test('readerPinTarget: the one PDF card of the source read; none when absent or ambiguous, never another type', () => {
  const refOf = object => ({ sourceId: object.assetKey });
  const blocks = [{ id: 'a', type: 'pdf', assetKey: 'doc:1' }, { id: 'b', type: 'pdf', assetKey: 'doc:2' }, { id: 'c', type: 'pdf', assetKey: 'doc:2' }, { id: 'e', type: 'explanation', assetKey: 'doc:3' }];
  assert.equal(readerPinTarget(blocks, 'doc:1', refOf), 'a');
  assert.equal(readerPinTarget(blocks, 'doc:2', refOf), null, 'two cards of one source: no guess');
  assert.equal(readerPinTarget(blocks, 'doc:3', refOf), null, 'only a PDF card');
  assert.equal(readerPinTarget(blocks, 'doc:9', refOf), null);
  assert.equal(readerPinTarget(null, 'doc:1', refOf), null);
});
