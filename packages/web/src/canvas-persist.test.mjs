// canvasApi.persist()'s save (canvas-persist.js; architecture §6.5.5, LP1 Task 15): this browser's copy now, then a shared
// board's server copy, awaited. Fake storage and a fake onSave: no browser, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lightBlocks, persistBoard } from './canvas-persist.js';

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

test('persistBoard: full or blocked storage, or no key, is not a save', async () => {
  const full = () => ({ setItem: () => { throw new Error('QuotaExceededError'); } });
  const blocked = () => { throw new Error('SecurityError'); };
  assert.deepEqual(await persistBoard({ state, storageKey: 'k', storage: full, onSave: null }), { ok: false, local: false, remote: 'skipped' });
  assert.deepEqual(await persistBoard({ state, storageKey: 'k', storage: blocked, onSave: async () => 'ok' }), { ok: false, local: false, remote: 'ok' });
  assert.deepEqual(await persistBoard({ state, storageKey: null, storage: memory().storage, onSave: null }), { ok: false, local: false, remote: 'skipped' });
});
