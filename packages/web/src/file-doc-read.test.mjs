import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileDocOriginal } from './file-doc-read.js';
const settle = () => new Promise(resolve => setImmediate(resolve));
test('a rejected file read reports failure and a later Retry successfully reads the original', async () => {
  let attempts = 0; const states = [];
  const load = async () => { if (++attempts === 1) throw Error('temporary connection failure'); return new Blob(['recovered source text']); };
  const cancelFirst = readFileDocOriginal(load, value => states.push(value));
  await settle(); assert.equal(states.length, 1); assert.equal(states[0].status, 'failed'); assert.equal(states[0].blob, null);
  cancelFirst(); readFileDocOriginal(load, value => states.push(value)); await settle();
  assert.equal(attempts, 2); assert.equal(states[1].status, 'ready'); assert.equal(await states[1].blob.text(), 'recovered source text');
});
test('a cancelled prior read cannot populate a new source or access scope', async () => {
  let resolveOld; const states = [];
  const cancel = readFileDocOriginal(() => new Promise(resolve => { resolveOld = resolve; }), value => states.push(value));
  await settle(); cancel(); resolveOld(new Blob(['old private content'])); await settle(); assert.equal(states.length, 0);
});
test('an unavailable read clears stale content and legacy text becomes a Blob', async () => {
  const states = []; readFileDocOriginal(async () => null, value => states.push(value)); await settle();
  assert.deepEqual(states[0], { status: 'missing', blob: null });
  readFileDocOriginal(async () => 'legacy original', value => states.push(value)); await settle();
  assert.equal(states[1].status, 'ready'); assert.equal(await states[1].blob.text(), 'legacy original');
});
