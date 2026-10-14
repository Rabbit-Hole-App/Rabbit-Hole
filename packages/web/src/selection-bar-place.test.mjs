import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorOf, placeBar } from './selection-bar-place.js';

const bar = { w: 260, h: 32 }, view = { w: 1200, h: 800 };

test('the bar sits just above the selection, right-aligned to it, never over it', () => {
  const at = placeBar({ left: 300, top: 200, right: 700, bottom: 400 }, bar, view);
  assert.deepEqual(at, { left: 440, top: 160, side: 'above' });
  assert.ok(at.top + bar.h <= 200, 'its bottom edge is above the selection');
});

test('it flips below when there is no room above, and still never covers the selection', () => {
  const at = placeBar({ left: 300, top: 20, right: 700, bottom: 120 }, bar, view);
  assert.equal(at.side, 'below');
  assert.ok(at.top >= 120, 'below the selection');
});

test('on a narrow view it prefers below the selection, where a card has its own row of controls above it', () => {
  const at = placeBar({ left: 20, top: 200, right: 380, bottom: 400 }, bar, { w: 390, h: 800 }, { below: true });
  assert.equal(at.side, 'below');
  assert.ok(at.top >= 400 && at.left >= 8 && at.left + bar.w <= 390 - 8, JSON.stringify(at));
  assert.equal(placeBar({ left: 20, top: 200, right: 380, bottom: 790 }, bar, { w: 390, h: 800 }, { below: true }).side, 'above', 'no room below: above');
});

test('it is clamped into the view on every edge', () => {
  assert.equal(placeBar({ left: 0, top: 200, right: 100, bottom: 300 }, bar, view).left, 8, 'left edge');
  const far = placeBar({ left: 1100, top: 200, right: 1190, bottom: 300 }, bar, view);
  assert.ok(far.left + bar.w <= view.w - 8, 'right edge');
  const low = placeBar({ left: 300, top: 760, right: 700, bottom: 790 }, bar, view);
  assert.equal(low.side, 'above');
});

test('a selection that fills the view leaves the bar inside the view at the top', () => {
  const at = placeBar({ left: -50, top: -50, right: 1300, bottom: 900 }, bar, view);
  assert.equal(at.side, 'inside');
  assert.ok(at.top >= 0 && at.left >= 8);
});

test('the anchor is the union of the selected boxes, in view pixels', () => {
  assert.equal(anchorOf([], { x: 0, y: 0, z: 1 }), null);
  assert.deepEqual(anchorOf([{ x: 10, y: 20, w: 100, h: 50 }, { x: 200, y: 0, w: 50, h: 40 }], { x: 5, y: 7, z: 2 }), { left: 25, top: 7, right: 505, bottom: 147 });
});
