import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { anchorOf, barCeiling, placeBar, rowUnderBand, usesHost } from './selection-bar-place.js';
import { pinTopCentre } from './comments/anchors.js';

const bar = { w: 260, h: 32 }, view = { w: 1200, h: 800 };

test('the bar sits just above the selection, right-aligned to it, never over it', () => {
  const at = placeBar({ left: 300, top: 200, right: 700, bottom: 400 }, bar, view);
  assert.deepEqual(at, { left: 440, top: 148, side: 'above' }); // gap 20 clears a top-centre comment pin (owner, 2026-10-21)
  assert.ok(at.top + bar.h <= 200, 'its bottom edge is above the selection');
});

test('it flips below when there is no room above, and still never covers the selection', () => {
  const at = placeBar({ left: 300, top: 20, right: 700, bottom: 120 }, bar, view);
  assert.equal(at.side, 'below');
  assert.ok(at.top >= 120, 'below the selection');
});

// Owner 2026-10-29: the page header is an opaque band over the canvas, so a card at the top keeps its bar out from under it.
test('the bar never sits under the page header band over the canvas', () => {
  assert.equal(barCeiling({ bottom: 48 }, { top: 0 }), 56, 'the band over the surface: 8 px below it');
  assert.equal(barCeiling({ bottom: 60 }, { top: 100 }), 8, 'a header above the surface (in flow): the plain 8 px');
  assert.equal(barCeiling(undefined, { top: 0 }), 8, 'no header (a shared or embedded canvas)');
  const top = barCeiling({ bottom: 48 }, { top: 0 });
  const at = placeBar({ left: 300, top: 60, right: 700, bottom: 200 }, bar, view, { top });
  assert.equal(at.side, 'below', 'a card just under the band: the bar goes below it');
  assert.ok(placeBar({ left: 300, top: 40, right: 700, bottom: 790 }, bar, view, { top }).top >= 56, 'inside a tall selection, still below the band');
});

// fast-e2e on 6fc4ae23b (chat-outputs 16, panel-header L1): a first-row card's own row (Add to chat) lay under the band.
test('a card row that the band would hide stands below the card', () => {
  const band = barCeiling({ bottom: 48 }, { top: 0 }, 0);
  assert.equal(band, 48);
  assert.equal(rowUnderBand(68, 1, band), true, 'the opening camera\'s first card: its row would be under the band');
  assert.equal(rowUnderBand(90, 1, band), false, 'room for the row between the band and the card');
  assert.equal(rowUnderBand(70, 0.5, band), false, 'zoomed out, the row is smaller');
  assert.equal(rowUnderBand(10, 1, 0), false, 'no band over the surface');
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

test('the floating bar never covers a narrow object top-centre comment pin, at zoom 0.2, 1 and 2 (owner, 2026-10-21)', () => {
  const object = { x: 300, y: 300, w: 120, h: 80 }, SIZE = 30;
  for (const z of [0.2, 1, 2]) {
    const anchor = anchorOf([object], { x: 0, y: 0, z });
    const at = placeBar(anchor, bar, view);
    const pin = pinTopCentre(anchor, 0, SIZE, 4);
    const apart = at.top + bar.h <= pin.top || pin.top + SIZE <= at.top || at.left + bar.w <= pin.left || pin.left + SIZE <= at.left;
    assert.ok(apart, `z=${z}: ${JSON.stringify({ at, pin })}`);
  }
});

test('a pinned card shows the floating bar, which never meets its pin at zoom 0.2, 1 and 2 (owner ruling, 2026-10-21)', () => {
  const card = { x: 200, y: 260, w: 340, h: 220 }, SIZE = 30, pinned = id => id === 'c1';
  assert.equal(usesHost({ sole: 'c1', pinned }, 'c1'), false, 'a pinned card: the floating bar');
  assert.equal(usesHost({ sole: 'c2', pinned }, 'c2'), true, 'a card without a pin keeps its row');
  assert.equal(usesHost({ sole: 'c2', narrow: true, pinned }, 'c2'), false, 'a narrow view: the floating bar');
  assert.equal(usesHost({ sole: 'c2', pinned, cut: id => id === 'c2' }, 'c2'), false, 'a card whose row is under the Chat panel: the floating bar (owner, 2026-10-28)');
  assert.equal(usesHost({ sole: 'c2', pinned, cut: () => false }, 'c2'), true, 'a card whose row is in view keeps it');
  for (const z of [0.2, 1, 2]) {
    const anchor = anchorOf([card], { x: 10, y: 5, z });
    const at = placeBar(anchor, bar, view), pin = pinTopCentre(anchor, 0, SIZE, 4);
    const apart = at.top + bar.h <= pin.top || pin.top + SIZE <= at.top || at.left + bar.w <= pin.left || pin.left + SIZE <= at.left;
    assert.ok(apart, `z=${z}: ${JSON.stringify({ at, pin })}`);
  }
  assert.match(readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8'), /const hasPin = commentPins && presenting === null \? id => commentPins\.some\(pin => pin\.anchor\?\.kind === 'object' && pin\.anchor\.object_id === id\)[\s\S]*pinned=\{hasPin\}/, 'the canvas tells the bar which objects have pins');
});
