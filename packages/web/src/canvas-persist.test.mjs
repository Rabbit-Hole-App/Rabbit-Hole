// canvasApi.persist()'s save (canvas-persist.js; architecture §6.5.5, LP1 Task 15): this browser's copy now, then a shared
// board's server copy, awaited. Fake storage and a fake onSave: no browser, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lightBlocks, persistBoard, serial, sharingOf } from './canvas-persist.js';

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
