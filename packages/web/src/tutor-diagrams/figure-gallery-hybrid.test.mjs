import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compression, embeddings, history, keyValue, localMix } from './figure-gallery-hybrid-data.js';

test('the carried state keeps its width as new cache codes accumulate', () => {
  assert.deepEqual(history.map(({ state }) => state), [[1, -1], [2.5, 0.5], [1.25, 2.25]]);
  assert.deepEqual(history.map(({ code }) => code), [0, 1.5, 1]);
});

test('the short causal filter feeds the gated write before the query read', () => {
  const last = localMix.at(-1);
  assert.deepEqual(last.filtered, [0.5, 1.75, 2.25]);
  assert.equal(last.carried, 1.125);
  assert.equal(last.updated, 4.5);
  assert.equal(last.readout, 2.25);
});

test('tied key and value projection leaves position rotation on the key branch only', () => {
  assert.deepEqual(keyValue.shared, [3, 1, 3]);
  assert.deepEqual(keyValue.globalRotated, [-1, 3, 3]);
  assert.deepEqual(keyValue.localValue, [0, 2, 3]);
  assert.deepEqual(keyValue.localRotated, [-1, 2, 3]);
});

test('two layer-local lookup rows give different additions at one stream width', () => {
  assert.deepEqual(embeddings.firstRow, [0.5, 1]);
  assert.deepEqual(embeddings.secondRow, [-0.25, 0.5]);
  assert.deepEqual(embeddings.afterA, [1.5, 0, 0, 2]);
  assert.deepEqual(embeddings.afterB, [1.5, -0.25, 0, 2.5]);
});

test('fine selection and coarse grouping share the uncompressed recent window', () => {
  assert.deepEqual(compression.fine.map(group => group.mean), [4, 6, 7]);
  assert.deepEqual(compression.coarse.map(group => group.mean), [3.667, 7.667]);
  assert.deepEqual(compression.nearest, { from: 5, to: 6, mean: 7 });
  assert.deepEqual(compression.recent, [5, 7]);
});
