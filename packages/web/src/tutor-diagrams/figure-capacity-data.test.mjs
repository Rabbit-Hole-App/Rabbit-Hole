import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decoderShapes, vocabShapes, expertShapes, router, latentShapes, layerLocalShapes } from './figure-capacity-data.js';

test('capacity examples isolate width, layer count, vocabulary and expert selection', () => {
  const [base, narrow, stateWide, updateWide] = decoderShapes;
  assert.ok(narrow.layers > base.layers && narrow.state < base.state);
  assert.equal(stateWide.layers, updateWide.layers);
  assert.ok(stateWide.state > base.state && updateWide.update > base.update);
  assert.equal(stateWide.update, base.update);
  assert.equal(updateWide.state, base.state);
  assert.equal(vocabShapes[0].state, vocabShapes[1].state);
  for (const { size, state, tiedWeights } of vocabShapes) assert.equal(tiedWeights, size * state);
  assert.deepEqual(expertShapes.map(shape => shape.bankWeights), [18432, 36864, 36864]);
  assert.deepEqual(expertShapes.map(shape => shape.usedWeights), [9216, 9216, 18432]);
  assert.deepEqual(router.map(row => row.weight), [0.6, 0.4, 0, 0]);
  assert.equal(router.reduce((sum, row) => sum + row.weight, 0), 1);
  assert.ok(latentShapes.every(shape => shape.cache === latentShapes[0].cache && shape.active === latentShapes[0].active));
  assert.deepEqual(layerLocalShapes.map(shape => shape.readersPerGroup), [4, 2]);
  for (const { query, groups, readersPerGroup } of layerLocalShapes) assert.equal(groups * readersPerGroup, query);
});
