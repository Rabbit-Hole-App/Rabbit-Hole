// A portaled ⋮ menu closes on a scroll only when the scroll moved its anchor (menu-scroll.js): the opening click's own
// scroll, which made taller cards lose their menu in the same click (card-thumbnails.md), leaves it open.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { closeOnAnchorScroll } from './menu-scroll.js';

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
