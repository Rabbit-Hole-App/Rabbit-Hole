// canvasApi.persist()'s save (canvas-persist.js; architecture §6.5.5, LP1 Task 15): this browser's copy now, then the
// board's server copy, awaited. Fake storage and a fake onSave: no browser, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { boardFromText, boardHasContent, boardPending, boardText, conflictBaseKey, conflictDoc, lightBlocks, pendingWork, persistBoard, serial, sharingOf, withPendingWork } from './canvas-persist.js';

const big = `data:image/png;base64,${'A'.repeat(120001)}`, small = 'data:image/png;base64,AAAA';
const state = { strokes: [{ id: 's' }], shapes: [], items: [], links: [], blocks: [{ id: 'a', src: big }, { id: 'b', src: small }, { id: 'c' }], groups: [], areas: [] };
const memory = () => { const store = new Map(); return { store, storage: () => ({ setItem: (key, value) => store.set(key, value) }) }; };

test('persistBoard: writes the board at once under the key, in the debounced save\'s shape, oversized data URLs stripped', async () => {
  const { store, storage } = memory(), pushes = [];
  const out = await persistBoard({ state, storageKey: 'k', storage, onSave: async (saved, options) => { pushes.push([saved, options]); return 'skipped'; } });
  assert.deepEqual(out, { ok: true, local: true, remote: 'skipped' });
  const saved = JSON.parse(store.get('k'));
  assert.deepEqual(Object.keys(saved), ['strokes', 'shapes', 'items', 'links', 'blocks', 'groups', 'areas']);
  assert.deepEqual(saved.blocks, [{ id: 'a', src: '' }, { id: 'b', src: small }, { id: 'c' }]);
  assert.deepEqual(pushes.map(p => p[1]), [{ now: true }], 'the immediate push, once');
  assert.deepEqual(pushes[0][0], saved, 'onSave gets what was stored');
  assert.equal(state.blocks[0].src, big, 'the live board keeps its bytes');
  assert.deepEqual(lightBlocks(state.blocks), saved.blocks);
});

test('persistBoard: a shared board is saved only when its push succeeds (regression 4)', async () => {
  const { storage } = memory(), save = onSave => persistBoard({ state, storageKey: 'k', storage, onSave });
  assert.deepEqual(await save(async () => 'failed'), { ok: false, local: true, remote: 'failed' });
  assert.deepEqual(await save(async () => 'ok'), { ok: true, local: true, remote: 'ok' });
  assert.deepEqual(await save(async () => { throw new Error('offline'); }), { ok: false, local: true, remote: 'failed' });
  assert.deepEqual(await save(() => undefined), { ok: false, local: true, remote: 'failed' }, 'an onSave that cannot say is not a save');
  assert.deepEqual(await save(null), { ok: true, local: true, remote: 'skipped' }, 'no onSave: nothing to push');
});

test('persistBoard: full or blocked storage, or no key, is not a save - and pushes nothing, so a stale board never goes up', async () => {
  const full = () => ({ setItem: () => { throw new Error('QuotaExceededError'); } });
  const blocked = () => { throw new Error('SecurityError'); };
  let pushes = 0;
  const onSave = async () => { pushes += 1; return 'ok'; };
  assert.deepEqual(await persistBoard({ state, storageKey: 'k', storage: full, onSave }), { ok: false, local: false, remote: 'skipped' });
  assert.deepEqual(await persistBoard({ state, storageKey: 'k', storage: blocked, onSave }), { ok: false, local: false, remote: 'skipped' });
  assert.deepEqual(await persistBoard({ state, storageKey: null, storage: memory().storage, onSave }), { ok: false, local: false, remote: 'skipped' });
  assert.equal(pushes, 0, 'onSave reads the stored copy (LearnPage boardSnapshot): it runs only after a local write');
});

// LearnPage's board PUTs (review round 1, C-15a): one at a time, each reading the version the one before it wrote, so a
// section save's immediate PUT and the canvas's debounced one never 409 each other.
test('serial: while a slow first PUT is in flight, the second carries the version the first returned', async () => {
  const queue = serial(), sent = [];
  let version = 1, release;
  const slow = new Promise(resolve => { release = resolve; });
  const put = wait => queue(async () => { sent.push(version); await wait; version += 1; return 'ok'; });
  const first = put(slow), second = put(null);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(sent, [1], 'the second waits for the first');
  release();
  assert.deepEqual(await Promise.all([first, second]), ['ok', 'ok']);
  assert.deepEqual(sent, [1, 2]);
  // A task that throws does not stop the ones after it.
  await assert.rejects(queue(async () => { throw new Error('network'); }));
  assert.equal(await queue(async () => 'next'), 'next');
});

test('sharingOf: shared, private, or unknown while the board GET has not answered or failed', () => {
  assert.equal(sharingOf({ shared: true }), 'shared');
  assert.equal(sharingOf({ shared: false }), 'private');
  assert.equal(sharingOf(null), 'unknown');
  assert.equal(sharingOf({ unavailable: 'HTTP 503' }), 'unknown');
});

// LearnPage asks whether the server already holds this browser's board (docs/features/canvas-persistence.md): a copy saved
// without some key equals the canvas's full-shape write, so opening a board never saves it again; any real change differs.
test('boardText: content keys in one order, a missing key read as empty; a real change differs', () => {
  const anchor = { blocks: [{ id: 'a', type: 'explanation', title: 'Start' }] };
  const written = { strokes: [], shapes: [], items: [], links: [], blocks: anchor.blocks, groups: [], areas: [], exchanges: [], sources: [] };
  assert.equal(boardText(anchor), boardText(written), 'an anchor-only server copy and the canvas write are one board');
  assert.equal(boardText({ ...written, exchanges: [] }), boardText({ exchanges: [], ...written }), 'key order does not matter');
  assert.equal(boardText(null), boardText({}));
  for (const key of ['strokes', 'shapes', 'items', 'links', 'blocks', 'groups', 'areas', 'exchanges', 'sources']) {
    assert.notEqual(boardText({ ...written, [key]: [{ id: 'x' }] }), boardText(written), key);
  }
  assert.notEqual(boardText({ ...written, blocks: [{ ...anchor.blocks[0], title: 'Renamed' }] }), boardText(written), 'an edited card');
});

// The canvas document (docs/features/blocknote-canvas.md) is board content: a document-only edit is a change the server
// does not have yet, and a board without one compares equal to a copy saved without the key.
test('boardText counts the document: a doc-only edit differs, a missing doc equals none', () => {
  const doc = { v: 1, x: 0, y: 0, w: 760, blocks: [{ id: 'a', type: 'paragraph', content: [], children: [] }] };
  const edited = { ...doc, blocks: [{ ...doc.blocks[0], content: [{ type: 'text', text: 'hello', styles: {} }] }] };
  assert.notEqual(boardText({ ...state, doc }), boardText({ ...state, doc: edited }));
  assert.equal(boardText(state), boardText({ ...state, doc: undefined }));
  assert.notEqual(boardText(state), boardText({ ...state, doc }));
});

// Offline-recovery brief (owner, 2026-10-16), issue 1: Retry's reload is decided on the live board, never only on this
// browser's copy, which the canvas writes 400 ms after a change.
const EMPTY_BOARD = { strokes: [], shapes: [], items: [], links: [], blocks: [], groups: [], areas: [], exchanges: [], sources: [] };
const SERVER = { ...EMPTY_BOARD, blocks: [{ id: 'c1', type: 'explanation', title: 'Light' }] };
test('check 1: a live edit before the 400 ms browser save is pending, though this browser copy still matches the server', () => {
  const copy = SERVER, synced = boardText(SERVER);
  for (const live of [
    { ...SERVER, strokes: [{ id: 's1' }] }, // a stroke
    { ...SERVER, blocks: [...SERVER.blocks, { id: 'c2', type: 'note' }] }, // a card
    { ...SERVER, shapes: [{ id: 'r1' }] }, // a shape
    { ...SERVER, links: [{ id: 'l1', from: 'c1', to: 'c2' }] }, // a connection
    { ...SERVER, blocks: [] }, // a deletion
    { ...SERVER, doc: { v: 1, blocks: [{ type: 'paragraph', content: 'typed' }] } }, // document words
  ]) assert.equal(boardPending({ live, copy, answered: true, synced }), true, JSON.stringify(live));
  assert.equal(boardPending({ live: SERVER, copy, answered: true, synced }), false, 'nothing pending: Retry may reload');
});

test('check 2: the board GET failed and storage is memory-only: any content is pending; a persistent copy holding it is not', () => {
  const live = { ...EMPTY_BOARD, strokes: [{ id: 's1' }] };
  assert.equal(boardPending({ live, copy: null, answered: false, synced: null }), true, 'memory-only: a reload keeps nothing');
  assert.equal(boardPending({ live: EMPTY_BOARD, copy: null, answered: false, synced: null }), false, 'nothing to lose');
  assert.equal(boardPending({ live, copy: live, answered: false, synced: null }), false, 'a persistent copy holds it, and a reload reads it again');
  assert.equal(boardPending({ live, copy: EMPTY_BOARD, answered: false, synced: null }), true, 'the persistent copy is not written yet');
});

test('check 4: once the server holds the live board, nothing is pending; a server with no board waits only for content', () => {
  const live = { ...SERVER, strokes: [{ id: 's1' }] };
  assert.equal(boardPending({ live, copy: live, answered: true, synced: boardText(live) }), false);
  assert.equal(boardPending({ live, copy: null, answered: true, synced: boardText(live) }), false, 'blocked storage, saved to the account');
  assert.equal(boardPending({ live: EMPTY_BOARD, copy: EMPTY_BOARD, answered: true, synced: null }), false);
  assert.equal(boardPending({ live, copy: live, answered: true, synced: null }), true);
  assert.equal(boardHasContent({ doc: { v: 1, blocks: [] } }), false, 'an empty document sheet is not content');
  // A repository's Main canvas registers its repository as a source on open: never content, or Retry would never reload there
  // (rabbit-hole-check wp7-stale-chunk).
  assert.equal(boardPending({ live: { ...EMPTY_BOARD, sources: [{ id: 'repo', kind: 'repository' }] }, copy: EMPTY_BOARD, answered: true, synced: null }), false);
});

// board-empty-report: the server's copy arrives after the canvas mounted on an empty or older copy. What was made on this
// page since mount is put on the server's copy: the server's content is never dropped, this page's work is never dropped,
// and when both changed the same object, both versions are kept.
test('pending work: objects added (by id, or ink by content), changed and removed since mount; untouched ones are not work', () => {
  const ink = { tool: 'pen', points: [{ x: 1, y: 2 }] }, stroke = { tool: 'pen', points: [{ x: 5, y: 6 }] };
  const mounted = { blocks: [{ id: 'old', title: 'Old' }, { id: 'gone', title: 'Gone' }, { id: 'kept', title: 'Kept' }], strokes: [ink], items: [{ id: 'n', text: 'note', fresh: false }] };
  const live = { blocks: [{ id: 'old', title: 'Old, edited' }, { id: 'kept', title: 'Kept' }, { id: 'mine', title: 'Mine' }], strokes: [ink, stroke], items: [{ id: 'n', text: 'note' }] };
  assert.deepEqual(pendingWork(mounted, live), {
    blocks: { added: [{ id: 'mine', title: 'Mine' }], changed: [{ base: { id: 'old', title: 'Old' }, mine: { id: 'old', title: 'Old, edited' } }], removed: [{ id: 'gone', title: 'Gone' }] },
    strokes: { added: [stroke], changed: [], removed: [] },
  }, 'the canvas\'s own `fresh` marker is not a change');
  assert.deepEqual(pendingWork(mounted, mounted), {}, 'nothing made, nothing pending');
});

test('on the server copy: additions appended, an edit applied where the server still has the base, a conflict kept as a copy, a removal only of an unchanged base', () => {
  const ids = () => { let n = 0; return id => `${id}-copy-${n += 1}`; };
  const work = { blocks: {
    added: [{ id: 'mine', title: 'Mine' }, { id: 'c1', title: 'same id as a server card' }],
    changed: [{ base: { id: 'a', title: 'A' }, mine: { id: 'a', title: 'A, mine' } }, { base: { id: 'b', title: 'B' }, mine: { id: 'b', title: 'B, mine' } }, { base: { id: 'z', title: 'Z' }, mine: { id: 'z', title: 'Z, mine' } }],
    removed: [{ id: 'r', title: 'R' }, { id: 's', title: 'S' }],
  } };
  const server = { blocks: [{ id: 'c1', title: 'Attention' }, { id: 'a', title: 'A' }, { id: 'b', title: 'B, theirs' }, { id: 'r', title: 'R' }, { id: 's', title: 'S, theirs' }], exchanges: [{ id: 'x' }], sources: [] };
  const merged = withPendingWork(server, work, ids());
  assert.deepEqual(merged.state.blocks, [
    { id: 'c1', title: 'Attention' }, { id: 'a', title: 'A, mine' }, { id: 'b', title: 'B, theirs' }, { id: 's', title: 'S, theirs' },
    { id: 'b-copy-1', title: 'B, mine' }, { id: 'z', title: 'Z, mine' }, { id: 'mine', title: 'Mine' },
  ], 'c1 stays the server\'s; a takes this page\'s edit; b keeps both; z (removed on the server) comes back as edited here; r goes; s (changed there) stays');
  assert.deepEqual([merged.count, merged.conflicts], [5, 2]);
  assert.deepEqual([merged.state.exchanges, merged.state.sources], [[{ id: 'x' }], []], 'keys the canvas does not hold are the server\'s');
  assert.deepEqual(withPendingWork(server, {}), { state: server, count: 0, conflicts: 0 });
  assert.deepEqual(withPendingWork(server, undefined), { state: server, count: 0, conflicts: 0 }, 'no canvas on screen: the server copy as it is');
  const ink = { tool: 'pen', points: [] };
  assert.deepEqual(withPendingWork({ strokes: [ink] }, { strokes: { added: [ink], changed: [], removed: [] } }).count, 0, 'ink the server already holds is not doubled');
});

// 409 recovery (owner 2026-10-22: a conflicting save never loses either device's edits; LearnPage refused + Load). The board
// text the server held before the 409 is the base; this browser's edits since it go onto the server's newer copy.
const stroke = (id, x) => ({ id, points: [[x, 0], [x + 1, 1]], color: '#000', width: 2 });
const card = (id, body) => ({ id, type: 'explanation', dx: 0, dy: 0, title: id, body });
const baseBoard = { strokes: [stroke('s0', 0)], blocks: [card('e1', 'one'), card('e2', 'two')], doc: { blocks: [{ id: 'p', text: 'start' }] } };
const recover = ({ server, baseText, live }) => withPendingWork(server, pendingWork(boardFromText(baseText), live), id => `${id}-mine`);
const memoryStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

test('two devices editing the same canvas at once: both edits survive the 409', () => {
  const baseText = boardText(baseBoard);
  const server = { ...baseBoard, strokes: [...baseBoard.strokes, stroke('sA', 10)], blocks: [card('e1', 'one, edited on A'), card('e2', 'two')] };
  const live = { ...baseBoard, strokes: [...baseBoard.strokes, stroke('sB', 20)], blocks: [card('e1', 'one'), card('e2', 'two, edited on B')] };
  const merged = recover({ server, baseText, live });
  assert.deepEqual(merged.state.strokes.map(s => s.id), ['s0', 'sA', 'sB']);
  assert.deepEqual(merged.state.blocks.map(b => b.body), ['one, edited on A', 'two, edited on B']);
  assert.equal(merged.conflicts, 0);
  // Pen ink without ids is kept by content too.
  const inkOnly = recover({ server: { strokes: [{ points: [[1, 1]] }] }, baseText: boardText({}), live: { strokes: [{ points: [[2, 2]] }] } });
  assert.equal(inkOnly.state.strokes.length, 2);
});

test('conflict recovery after a 409: a card both devices changed keeps both versions; a removal never drops a newer edit', () => {
  const baseText = boardText(baseBoard);
  const server = { ...baseBoard, blocks: [card('e1', 'A wrote this'), card('e2', 'two, edited on A')] };
  const live = { ...baseBoard, blocks: [card('e1', 'B wrote this')] }; // B changed e1 and removed e2
  const merged = recover({ server, baseText, live });
  assert.deepEqual(merged.state.blocks.map(b => [b.id, b.body]), [['e1', 'A wrote this'], ['e2', 'two, edited on A'], ['e1-mine', 'B wrote this']]);
  assert.equal(merged.conflicts, 1, 'the caller says both versions are on the canvas');
  // An unchanged card B removed is removed.
  assert.deepEqual(recover({ server: baseBoard, baseText, live: { ...baseBoard, blocks: [card('e1', 'one')] } }).state.blocks.map(b => b.id), ['e1']);
  // The document: B's goes up only when A left it as it was; when both changed it, the server's stays (B's is offered back).
  const mineDoc = { blocks: [{ id: 'p', text: 'B' }] };
  assert.deepEqual(conflictDoc({ base: boardFromText(baseText), server: baseBoard, mine: mineDoc }), mineDoc);
  assert.equal(conflictDoc({ base: boardFromText(baseText), server: { doc: { blocks: [] } }, mine: mineDoc }), null);
  assert.equal(conflictDoc({ base: boardFromText(baseText), server: baseBoard, mine: baseBoard.doc }), null);
  assert.equal(conflictDoc({ base: boardFromText(boardText({})), server: {}, mine: null }), null);
});

test('reload during a pending conflict: the base outlives the page, and the edits in this browser\'s copy still go up', () => {
  const storage = memoryStorage(), key = 'learn:board:canvas-1';
  const live = { ...baseBoard, strokes: [...baseBoard.strokes, stroke('sB', 20)] };
  // The 409: the base is kept beside this browser's copy; then the page reloads before the server's copy came back.
  storage.setItem(conflictBaseKey(key), boardText(baseBoard));
  storage.setItem(key, JSON.stringify(live));
  const server = { ...baseBoard, strokes: [...baseBoard.strokes, stroke('sA', 10)] };
  const reloaded = JSON.parse(storage.getItem(key));
  const merged = recover({ server, baseText: storage.getItem(conflictBaseKey(key)), live: reloaded });
  assert.deepEqual(merged.state.strokes.map(s => s.id), ['s0', 'sA', 'sB']);
  assert.deepEqual(boardFromText(boardText(baseBoard)), { strokes: baseBoard.strokes, shapes: [], items: [], links: [], blocks: baseBoard.blocks, groups: [], areas: [], exchanges: [], sources: [], doc: baseBoard.doc });
  assert.equal('doc' in boardFromText(boardText({})), false, 'no document reads as none');
});

test('switching canvases with an unsaved conflicted edit: each canvas keeps its own base until it is merged', () => {
  const storage = memoryStorage(), one = 'learn:board:canvas-1', two = 'learn:board:canvas-2';
  storage.setItem(conflictBaseKey(one), boardText(baseBoard));
  storage.setItem(conflictBaseKey(two), boardText({}));
  assert.notEqual(conflictBaseKey(one), conflictBaseKey(two));
  // Back on canvas 1: its base, not canvas 2's, decides what its edits were.
  const live = { ...baseBoard, blocks: [...baseBoard.blocks, card('e3', 'new on B')] };
  const merged = recover({ server: { ...baseBoard, strokes: [] }, baseText: storage.getItem(conflictBaseKey(one)), live });
  assert.deepEqual(merged.state.blocks.map(b => b.id), ['e1', 'e2', 'e3']);
  assert.deepEqual(merged.state.strokes, [], 'a stroke removed on the other device stays removed');
});
