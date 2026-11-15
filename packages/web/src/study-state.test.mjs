import test from 'node:test';
import assert from 'node:assert/strict';
import { NOT_SAVED, studyStatusText, SPLIT_DEFAULT, defaultStudy, eligible, readStudy, studyKey, readerPinTarget, studyLayout, studyReducer, studyScope, writeStudy } from './study-state.js';

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
  assert.deepEqual(writeStudy(storage, KEY, pinned), { ok: true, durable: true });
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

// Owner 2026-10-23 (honest persistence): only a store that outlives the page is Saved; a blocked browser's in-memory stand-in
// (storage-fallback.js memoryStorage) accepts the write and loses it on reload, so it is Not saved.
test('persistence status: durable storage is Saved; blocked, throwing or memory-backed storage is Not saved, and memory loses it on reload', async () => {
  const { memoryStorage } = await import('./storage-fallback.js');
  const pinned = studyReducer(defaultStudy(), { type: 'pin', cardId: 'pdf1', kind: 'pdf', ref: PDF_REF });
  const durable = writeStudy(memory(), KEY, pinned);
  assert.deepEqual(durable, { ok: true, durable: true });
  assert.equal(studyStatusText(durable.ok ? 'saved' : 'error'), 'Saved on this browser');
  for (const storage of [null, { getItem: () => null, setItem: () => { throw Error('SecurityError'); } }]) {
    const result = writeStudy(storage, KEY, pinned);
    assert.equal(result.ok, false);
    assert.equal(result.durable, false);
  }
  const page = memoryStorage();
  const kept = writeStudy(page, KEY, pinned);
  assert.equal(kept.ok, false, 'memory-backed storage is never reported as saved');
  assert.equal(kept.durable, false);
  assert.deepEqual(readStudy(page, KEY), pinned, 'the arrangement still applies on this page');
  assert.deepEqual(readStudy(memoryStorage(), KEY), defaultStudy(), 'a reload starts a new memory store: it is gone');
  assert.equal(studyStatusText('error'), NOT_SAVED);
  assert.equal(NOT_SAVED, 'Not saved: this browser is not allowing Rabbit Hole to store this. It applies until you reload.');
  assert.equal(studyStatusText(null), '');
});

// Study map choices (docs/features/focus-study.md): an older v:1 arrangement without maps, or with a malformed one, keeps its
// pin, divider and reader and reads as no Study choice (both maps hidden while studying).
test('maps: old v:1 data without maps and malformed maps keep pin, split and reader and get the default', () => {
  const storage = memory();
  const old = { v: 1, mode: 'study', work: 'canvas', pin: { cardId: 'pdf1', kind: 'pdf', ref: PDF_REF }, notebookId: null, split: 0.5, reader: { page: 3 }, canvasView: null };
  storage.setItem(studyKey(KEY), JSON.stringify(old));
  // The Release 1 shape reads as itself plus the codebase Study's fields at their defaults (the pin keeps its own tab).
  assert.deepEqual(readStudy(storage, KEY), { ...defaultStudy(), ...old, maps: {}, referenceTab: 'pin' });
  for (const maps of [null, 'on', [true], { minimap: 'yes', holeMap: 1, curious: true }]) {
    storage.setItem(studyKey(KEY), JSON.stringify({ ...old, maps }));
    const state = readStudy(storage, KEY);
    assert.deepEqual([state.maps, state.pin?.cardId, state.split, state.reader], [{}, 'pdf1', 0.5, { page: 3 }], JSON.stringify(maps));
  }
  storage.setItem(studyKey(KEY), JSON.stringify({ ...old, maps: { minimap: true, holeMap: 'x' } }));
  assert.deepEqual(readStudy(storage, KEY).maps, { minimap: true }, 'each map is cleaned on its own');
  assert.deepEqual(defaultStudy().maps, {});
});

test('maps: setMap records an explicit Study choice, survives a write and read, and outlives unpin and mode changes', () => {
  const storage = memory();
  let s = studyReducer(defaultStudy(), { type: 'pin', cardId: 'pdf1', kind: 'pdf', ref: PDF_REF });
  s = studyReducer(s, { type: 'setMap', name: 'holeMap', on: true });
  assert.deepEqual(s.maps, { holeMap: true });
  s = studyReducer(s, { type: 'setMap', name: 'minimap', on: false });
  assert.deepEqual(s.maps, { holeMap: true, minimap: false });
  for (const bad of [{ name: 'curious', on: true }, { name: 'toolbar', on: false }, { name: 'minimap', on: 'yes' }, {}]) assert.deepEqual(studyReducer(s, { type: 'setMap', ...bad }), s, JSON.stringify(bad));
  assert.deepEqual(writeStudy(storage, KEY, s), { ok: true, durable: true });
  assert.deepEqual(readStudy(storage, KEY).maps, { holeMap: true, minimap: false });
  assert.deepEqual(studyReducer(s, { type: 'unpin' }).maps, s.maps);
  assert.deepEqual(studyReducer(studyReducer(s, { type: 'setMode', mode: 'canvas' }), { type: 'setMode', mode: 'study' }).maps, s.maps);
});

test('maps: blocked storage keeps the choice for the page and never reports it saved', async () => {
  const { memoryStorage } = await import('./storage-fallback.js');
  const s = studyReducer(defaultStudy(), { type: 'setMap', name: 'minimap', on: true });
  assert.equal(writeStudy(null, KEY, s).ok, false);
  const page = memoryStorage();
  assert.equal(writeStudy(page, KEY, s).ok, false);
  assert.deepEqual(readStudy(page, KEY).maps, { minimap: true });
});

// Pinned Study for a codebase canvas (pinned-study-codebase-spec.md 2a): the reference tab, the work with its card ids, Files' place.
import { WORK_ID, normalize, ownedId } from './study-state.js';
import { defaultWork, firstSourceFile, studyPill, studyTheseActions, workCards, workOptions, workTarget } from './study-work.js';

test('reducer: setReferenceTab, setWork with a card id per kind, filesAt, panelWas; unpin clears the pin and not the tab', () => {
  let s = defaultStudy();
  assert.deepEqual([s.referenceTab, s.work, s.workSet, s.filesPlace, s.runId, s.runbookId, s.panelWas], ['graph', 'canvas', false, null, null, null, null]);
  s = studyReducer(s, { type: 'setReferenceTab', tab: 'files' });
  assert.equal(s.referenceTab, 'files');
  assert.equal(studyReducer(s, { type: 'setReferenceTab', tab: 'pin' }).referenceTab, 'files', 'Pinned needs a pin');
  assert.equal(studyReducer(s, { type: 'setReferenceTab', tab: 'bogus' }).referenceTab, 'files');
  s = studyReducer(s, { type: 'filesAt', path: 'sample.py', line: 14 });
  assert.deepEqual(s.filesPlace, { path: 'sample.py', line: 14 });
  assert.deepEqual(studyReducer(s, { type: 'filesAt', path: 'README.md' }).filesPlace, { path: 'README.md' });
  assert.deepEqual(studyReducer(s, { type: 'filesAt', path: '' }).filesPlace, { path: 'sample.py', line: 14 }, 'no path changes nothing');
  s = studyReducer(s, { type: 'setWork', work: 'run', cardId: 'r1' });
  assert.deepEqual([s.work, s.runId, s.workSet], ['run', 'r1', true]);
  s = studyReducer(s, { type: 'setWork', work: 'runbook', cardId: 'd1' });
  s = studyReducer(s, { type: 'setWork', work: 'canvas' });
  assert.deepEqual([s.work, s.runId, s.runbookId], ['canvas', 'r1', 'd1'], 'each card is remembered');
  assert.equal(ownedId({ ...s, work: 'run' }), 'r1');
  assert.equal(ownedId(s), null);
  assert.deepEqual(Object.keys(WORK_ID), ['notebook', 'run', 'runbook']);
  assert.equal(studyReducer(s, { type: 'setWork', work: 'bogus' }).work, 'canvas');
  assert.equal(studyReducer(s, { type: 'panelWas', open: true }).panelWas, true);
  assert.equal(studyReducer(studyReducer(s, { type: 'panelWas', open: true }), { type: 'panelWas', open: null }).panelWas, null);
  // A pin takes the Pinned tab; unpin removes the pin and falls back, keeping a tab that was not the pin.
  let p = studyReducer(s, { type: 'pin', cardId: 'pdf1', kind: 'pdf', ref: PDF_REF });
  assert.equal(p.referenceTab, 'pin');
  assert.deepEqual([studyReducer(p, { type: 'unpin' }).pin, studyReducer(p, { type: 'unpin' }).referenceTab], [null, 'files']);
  p = studyReducer(studyReducer(p, { type: 'setReferenceTab', tab: 'graph' }), { type: 'unpin' });
  assert.equal(p.referenceTab, 'graph');
});

test('normalize: the Release 1 shape (no referenceTab, work canvas or notebook) reads unchanged; new fields are cleaned one by one', () => {
  const old = { v: 1, mode: 'study', work: 'notebook', pin: null, notebookId: 'nb', split: 0.4, reader: null, canvasView: null, maps: {} };
  assert.deepEqual(normalize(old), { ...defaultStudy(), ...old, workSet: true });
  assert.equal(normalize({ v: 1, work: 'canvas' }).workSet, false, 'an old Canvas was never a choice');
  assert.equal(normalize({ v: 1, referenceTab: 'pin' }).referenceTab, 'graph', 'Pinned without a pin');
  assert.equal(normalize({ v: 1, referenceTab: 'files' }).referenceTab, 'files');
  assert.equal(normalize({ v: 1, referenceTab: 'nope' }).referenceTab, 'graph');
  assert.equal(normalize({ v: 1, work: 'runbook', runbookId: 'd', runId: 4 }).runId, null);
  assert.deepEqual(normalize({ v: 1, filesPlace: { path: 'a.py', line: 3.7 } }).filesPlace, { path: 'a.py', line: 3 });
  assert.equal(normalize({ v: 1, filesPlace: { path: 7 } }).filesPlace, null);
  assert.equal(normalize({ v: 1, panelWas: 'yes' }).panelWas, null);
  // Written and read back (this browser only) the new arrangement is itself.
  const s = studyReducer(studyReducer(defaultStudy(), { type: 'filesAt', path: 'a.py', line: 9 }), { type: 'setWork', work: 'run', cardId: 'r' });
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(s))), s);
});

const RUN = { id: 'r1', type: 'run', generated: { kind: 'rehearsal' } }, BOOK = { id: 'd1', type: 'doc', generated: { kind: 'rehearsal' } };
const PLAIN_DOC = { id: 'd2', type: 'doc' }, NB = { id: 'n1', type: 'notebook' };
const names = blocks => workOptions(blocks).map(option => option.work + (option.disabled ? '(off)' : ''));

test('work options: what the canvas has, Canvas always; Release 1 keeps Notebook (greyed) and Canvas', () => {
  assert.deepEqual(names([RUN, BOOK, NB]), ['run', 'runbook', 'notebook', 'canvas']);
  assert.deepEqual(names([RUN, BOOK]), ['run', 'runbook', 'canvas'], 'no notebook: no Notebook tab');
  assert.deepEqual(names([BOOK]), ['runbook', 'canvas']);
  assert.deepEqual(names([RUN, PLAIN_DOC]), ['run', 'canvas'], 'a document that is not generated is not the Runbook');
  assert.deepEqual(names([]), ['notebook(off)', 'canvas']);
  assert.deepEqual(names([NB]), ['notebook', 'canvas']);
  assert.deepEqual(names(null), ['notebook(off)', 'canvas']);
});

test('work target: the remembered card, else the only one, else none (the picker asks)', () => {
  const two = [RUN, { ...RUN, id: 'r2' }];
  assert.equal(workTarget(defaultStudy(), [RUN], 'run').id, 'r1');
  assert.equal(workTarget(defaultStudy(), two, 'run'), null);
  assert.equal(workTarget({ ...defaultStudy(), runId: 'r2' }, two, 'run').id, 'r2');
  assert.equal(workTarget({ ...defaultStudy(), runId: 'gone' }, two, 'run'), null);
  assert.equal(workTarget(defaultStudy(), [RUN], 'canvas'), null);
  const cards = workCards([RUN, BOOK, NB, PLAIN_DOC]);
  assert.deepEqual([cards.run.length, cards.runbook.length, cards.notebook.length], [1, 1, 1]);
});

test('default work: a Study never given a work opens on Run, else the Runbook; a chosen work is left alone', () => {
  assert.deepEqual(defaultWork(defaultStudy(), [RUN, BOOK]), { work: 'run', cardId: 'r1' });
  assert.deepEqual(defaultWork(defaultStudy(), [BOOK]), { work: 'runbook', cardId: 'd1' });
  assert.equal(defaultWork(defaultStudy(), [NB, PLAIN_DOC]), null);
  assert.equal(defaultWork(studyReducer(defaultStudy(), { type: 'setWork', work: 'canvas' }), [RUN]), null, 'Canvas was chosen');
  assert.equal(defaultWork(studyReducer(defaultStudy(), { type: 'setWork', work: 'notebook', cardId: 'n' }), [RUN]), null);
});

test('the Study | Canvas pill: a generated Run card or Runbook, or a card pin; nothing else', () => {
  assert.equal(studyPill([RUN], null), true);
  assert.equal(studyPill([BOOK], null), true);
  assert.equal(studyPill([], { cardId: 'p' }), true);
  for (const blocks of [[], [NB], [PLAIN_DOC], [{ id: 'x', type: 'run' }], null]) assert.equal(studyPill(blocks, null), false, JSON.stringify(blocks));
});

test('Study these: Files at the first source file of the route, Run as the work, Study open; the first parseable source wins', () => {
  const record = { route: { steps: [{ source: 'not a cite' }, { source: 'sample.py:14' }, { source: 'README.md:2' }], source: 'x.md:1' } };
  assert.deepEqual(firstSourceFile(record), { path: 'sample.py', line: 14 });
  assert.deepEqual(firstSourceFile({ route: { source: 'README.md:82-103' } }), { path: 'README.md', line: 82 });
  assert.deepEqual(firstSourceFile({ route: { steps: [], install: [{ source: 'setup.py:3' }] } }), { path: 'setup.py', line: 3 });
  assert.equal(firstSourceFile({}), null);
  const actions = studyTheseActions({ blocks: [RUN, BOOK], place: { path: 'sample.py', line: 14 } });
  assert.deepEqual(actions.map(a => a.type), ['filesAt', 'setReferenceTab', 'setWork', 'setMode']);
  const s = actions.reduce(studyReducer, defaultStudy());
  assert.deepEqual([s.mode, s.work, s.runId, s.referenceTab, s.filesPlace], ['study', 'run', 'r1', 'files', { path: 'sample.py', line: 14 }]);
  assert.deepEqual(studyTheseActions({ blocks: [], place: null }).map(a => a.type), ['setReferenceTab', 'setMode'], 'no card, no source: only what exists');
});
