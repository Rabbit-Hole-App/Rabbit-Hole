import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gapsFrom, nearestGap, nudgeBy, MIN_GAP } from './learn-gap-rail.js';

const box = (y, h = 100, x = 0) => ({ x, y, w: 560, h });

test('one gap between each pair of stacked things, placed midway', () => {
  assert.deepEqual(gapsFrom([box(0), box(120), box(240)]), [
    { index: 0, top: 100, bottom: 120, y: 110 },
    { index: 1, top: 220, bottom: 240, y: 230 },
  ]);
});

test('everything counts, in any order: a chat card, a shape and a card make two gaps', () => {
  const chat = box(0, 80), shape = { x: 700, y: 200, w: 120, h: 60 }, card = box(400, 100);
  assert.deepEqual(gapsFrom([card, shape, chat]).map(gap => gap.y), [140, 330]);
});

test('side-by-side things share a band - no gap between them', () => {
  const left = box(0, 100), right = { x: 800, y: 50, w: 100, h: 100 }, below = box(300);
  assert.deepEqual(gapsFrom([left, right, below]), [{ index: 0, top: 150, bottom: 300, y: 225 }]);
});

test('overlapping or touching things make no gap', () => {
  assert.deepEqual(gapsFrom([box(0), box(60)]), []);
  assert.deepEqual(gapsFrom([box(0), box(100)]), []);
  assert.deepEqual(gapsFrom([box(0)]), []);
  assert.deepEqual(gapsFrom([]), []);
});

test('[+] pushes the full step; [-] pulls but stops short of touching', () => {
  const gap = { top: 100, bottom: 300 };
  assert.equal(nudgeBy(gap, 120), 120);
  assert.equal(nudgeBy(gap, -120), -120);
  assert.equal(nudgeBy({ top: 100, bottom: 160 }, -120), -(60 - MIN_GAP));
  assert.equal(nudgeBy({ top: 100, bottom: 100 + MIN_GAP }, -120) === 0, true);
});

test('nearestGap picks the closest rail', () => {
  const gaps = [{ index: 0, y: 110 }, { index: 1, y: 230 }];
  assert.equal(nearestGap(gaps, 120).index, 0);
  assert.equal(nearestGap(gaps, 200).index, 1);
  assert.equal(nearestGap(gaps, 170).index, 0); // ties break to the earlier gap
});

test('nearestGap gives up when the pointer is nowhere near a gap', () => {
  const gaps = [{ index: 0, y: 110 }];
  assert.equal(nearestGap(gaps, 1000), null);
  assert.equal(nearestGap(gaps, 110 + 160), null); // the threshold itself is out
  assert.notEqual(nearestGap(gaps, 110 + 159), null);
  assert.equal(nearestGap([], 110), null);
});
