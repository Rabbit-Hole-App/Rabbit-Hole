// A portaled ⋮ menu closes on a scroll only when the scroll moved its anchor (menu-scroll.js): the opening click's own
// scroll, which made taller cards lose their menu in the same click (card-thumbnails.md), leaves it open.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { closeOnAnchorScroll, menuShift } from './menu-scroll.js';

const anchorAt = rect => ({ isConnected: true, rect, getBoundingClientRect() { return this.rect; } });

test('a scroll that leaves the anchor where the menu measured it keeps the menu; one that moves it closes it', () => {
  let closed = 0;
  const anchor = anchorAt({ top: 412, left: 930 });
  const onScroll = closeOnAnchorScroll(anchor, () => { closed += 1; });
  onScroll();
  assert.equal(closed, 0, 'the scroll event of the opening click, the anchor already in place');
  anchor.rect = { top: 412.6, left: 930 };
  onScroll();
  assert.equal(closed, 0, 'sub-pixel jitter');
  anchor.rect = { top: 49, left: 930 };
  onScroll();
  assert.equal(closed, 1, 'the page scrolled under the menu');
});

test('a removed anchor, or none, closes on any scroll', () => {
  let closed = 0;
  const anchor = anchorAt({ top: 10, left: 10 });
  const onScroll = closeOnAnchorScroll(anchor, () => { closed += 1; });
  anchor.isConnected = false;
  onScroll();
  closeOnAnchorScroll(null, () => { closed += 1; })();
  assert.equal(closed, 2);
});

test('Menu uses it, and the card menus pass their ⋮ as the anchor', () => {
  const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
  assert.match(read('./ui.jsx'), /const onScroll = anchor \? closeOnAnchorScroll\(anchor, onClose\) : close;/);
  assert.match(read('./home/CardMenu.jsx'), /<Menu portal anchor=\{menu\?\.anchor\}/);
  assert.match(read('./home/PublicCards.jsx'), /<Menu portal anchor=\{menu\?\.anchor\}/);
});

// The owner's case (2026-10-16): the project ⋯ at x 96-124 beside a short name, menuAt putting the 240px menu's right edge
// near the button's - 100px past the left edge.
test('menuShift slides a menu back inside the window, 8px from each edge, and leaves one already inside alone', () => {
  const box = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });
  assert.deepEqual(menuShift(box(-100, 46, 240, 334), 1440, 900), { x: 108, y: 0 }, 'past the left edge');
  assert.deepEqual(menuShift(box(1300, 46, 240, 334), 1440, 900), { x: -108, y: 0 }, 'past the right edge');
  assert.deepEqual(menuShift(box(500, 46, 240, 334), 1440, 900), { x: 0, y: 0 }, 'inside');
  assert.deepEqual(menuShift(box(500, 700, 240, 334), 1440, 900), { x: 0, y: -142 }, 'below, past the bottom: slides up');
  assert.deepEqual(menuShift(box(500, -40, 240, 334), 1440, 900), { x: 0, y: 48 }, 'above, past the top: slides down');
  assert.deepEqual(menuShift(box(-84, 82, 400, 334), 360, 640), { x: 92, y: 0 }, 'wider than a phone: the left edge wins');
});
