import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gapsFrom, nearestGap } from './learn-gap-rail.js';

const box = (y, h = 100) => ({ x: 0, y, w: 560, h });

test('one gap per adjacent pair, placed midway between the cards', () => {
  const blocks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const bounds = { a: box(0), b: box(120), c: box(240) };
  assert.deepEqual(gapsFrom(blocks, bounds), [
    { index: 0, beforeId: 'b', y: 110 },
    { index: 1, beforeId: 'c', y: 230 },
  ]);
});

test('the gap carries the id of the card below it - that is the one holding the space', () => {
  const [gap] = gapsFrom([{ id: 'a' }, { id: 'b' }], { a: box(0), b: box(120) });
  assert.equal(gap.beforeId, 'b');
});

test('a pair with no measurement yet produces no gap', () => {
  const blocks = [{ id: 'a' }, { id: 'unmeasured' }, { id: 'c' }];
  const bounds = { a: box(0), c: box(240) };
  assert.deepEqual(gapsFrom(blocks, bounds), []);
});

test('fewer than two cards has nothing to separate', () => {
  assert.deepEqual(gapsFrom([{ id: 'a' }], { a: box(0) }), []);
  assert.deepEqual(gapsFrom([], {}), []);
});

// Negative space overlaps the cards, which inverts their y order. Gap identity
// has to stay pinned to array order or the rail jumps to a different gap
// halfway through a press-and-hold on [-].
test('overlapping cards keep gap identity in array order', () => {
  const blocks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const bounds = { a: box(0), b: box(-60), c: box(180) };
  const gaps = gapsFrom(blocks, bounds);
  assert.deepEqual(gaps.map(gap => gap.index), [0, 1]);
  assert.deepEqual(gaps.map(gap => gap.beforeId), ['b', 'c']);
  assert.equal(gaps[0].y, 20); // (0 + 100 + -60) / 2, inverted and still between
});

test('nearestGap picks the closest rail', () => {
  const gaps = [{ index: 0, beforeId: 'b', y: 110 }, { index: 1, beforeId: 'c', y: 230 }];
  assert.equal(nearestGap(gaps, 120).index, 0);
  assert.equal(nearestGap(gaps, 200).index, 1);
  assert.equal(nearestGap(gaps, 170).index, 0); // ties break to the earlier gap
});

test('nearestGap gives up when the pointer is nowhere near a gap', () => {
  const gaps = [{ index: 0, beforeId: 'b', y: 110 }];
  assert.equal(nearestGap(gaps, 1000), null);
  assert.equal(nearestGap(gaps, 110 + 160), null); // the threshold itself is out
  assert.notEqual(nearestGap(gaps, 110 + 159), null);
  assert.equal(nearestGap([], 110), null);
});
