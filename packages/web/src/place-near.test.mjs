// UX-2: a floating control placed beside a selection lands right above it whatever the canvas zoom (the control's left/top are in the origin's own units, the rectangles are client pixels).
import test from 'node:test';
import assert from 'node:assert/strict';
import { placeNear } from './place-near.js';

const box = (x, y, w, h) => ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, x, y, getBoundingClientRect() { return this; } });
// a card whose own units are drawn at `zoom`: its client rectangle is zoom times its layout size, at (cx, cy)
const card = (zoom, cx = 100, cy = 50) => { const b = box(cx, cy, 720 * zoom, 900 * zoom); b.offsetWidth = 720; return b; };
const control = () => ({ offsetWidth: 118, offsetHeight: 42, style: {} });
// the selection sits `down` card-units below the card's top, `across` units from its left, 400 x 23 units
const place = (zoom, down) => {
  const origin = card(zoom), el = control();
  const rect = box(origin.left + 140 * zoom, origin.top + down * zoom, 400 * zoom, 23 * zoom);
  placeNear(el, rect, origin, origin); // the card's own scroll area is the visible frame
  return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
};

test('at 100% the control sits 6 units above the selection, centred on it', () => {
  const { left, top } = place(1, 600);
  assert.equal(top, 600 - 42 - 6);
  assert.equal(left, 140 + 200 - 59);
});

test('at 60% the control sits at the same place in the card\'s own units (it used to land ~40% of the distance too high)', () => {
  const full = place(1, 600), zoomed = place(0.6, 600);
  assert.ok(Math.abs(zoomed.top - full.top) < 1e-6, `top ${zoomed.top} vs ${full.top}`);
  assert.ok(Math.abs(zoomed.left - full.left) < 1e-6, `left ${zoomed.left} vs ${full.left}`);
});

test('near the top of the card it goes below the selection, at any zoom', () => {
  for (const zoom of [1, 0.6, 2]) assert.ok(Math.abs(place(zoom, 10).top - (10 + 23 + 6)) < 1e-6, `zoom ${zoom}`);
});
