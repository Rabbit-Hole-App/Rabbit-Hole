import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScene } from './stepper-merge-sort.mjs';

for (const depth of ['brief', 'balanced', 'detailed']) {
  test(`${depth}: merge outputs and comparison counts come from comparing the heads`, () => {
    const scene = buildScene(depth);
    for (const [i, v] of scene.variants.entries()) {
      const original = v.regions.find(r => r.id === 'input').values;
      assert.deepEqual(v.calculations.final.result, [...original].sort((a,b)=>a-b));
      assert.deepEqual(v.calculations.left.result, [...original.slice(0,2)].sort((a,b)=>a-b));
      assert.deepEqual(v.calculations.right.result, [...original.slice(2)].sort((a,b)=>a-b));
      assert.equal(v.calculations.total, i ? 4 : 5);
      for (const m of [v.calculations.left,v.calculations.right,v.calculations.final]) {
        assert.equal(m.comparisons,m.decisions.length);
        for (const d of m.decisions) assert.equal(d.chosen,Math.min(d.left,d.right));
      }
      assert.equal(v.states.at(-1).readouts.find(r=>r.id==='comparisons')?.value, depth==='brief' ? undefined : v.calculations.total);
    }
  });
}

test('changing the starting array changes the actual heads, decisions and work', () => {
  const [mixed, sorted] = buildScene('detailed').variants;
  assert.notDeepEqual(mixed.calculations.final.decisions, sorted.calculations.final.decisions);
  assert.notEqual(mixed.calculations.total, sorted.calculations.total);
  assert.deepEqual(mixed.regions.map(r=>r.id), sorted.regions.map(r=>r.id));
  assert.deepEqual(mixed.links,sorted.links);
});

test('Brief highlights one region and its aha shows the computed ordered left run', () => {
  const scene = buildScene('brief'), variant = scene.variants[0];
  assert.deepEqual(variant.states.map(state => state.id), ['split', 'singles', 'halves', 'finish']);
  for (const state of variant.states) assert.equal(state.active.length, 1, `${state.id} must focus one region`);
  const aha = variant.states.find(state => state.id === scene.aha.stateId);
  assert.equal(aha.id, 'halves');
  assert.deepEqual(aha.active, ['mergeLeft']);
  assert.equal(aha.calloutRegion, 'mergeLeft');
  const originalLeft = variant.regions.find(region => region.id === 'left').values;
  const orderedLeft = variant.regions.find(region => region.id === aha.calloutRegion).values;
  assert.deepEqual(orderedLeft, [...originalLeft].sort((a, b) => a - b));
  assert.notDeepEqual(orderedLeft, originalLeft, 'the aha visibly orders the original mixed left half');
  assert.deepEqual(orderedLeft, variant.calculations.left.result);
  assert.deepEqual(variant.regions.find(region => region.id === 'output').values, [1, 2, 3, 4]);
});
