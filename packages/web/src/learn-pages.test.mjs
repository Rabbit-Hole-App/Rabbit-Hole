import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageRects, PAGE_W, PAGE_H, PAGE_LIMIT } from './learn-pages.js';

const COLUMN = 560;

test('A4 at 96dpi, portrait', () => {
  assert.equal(PAGE_W, 794);
  assert.equal(PAGE_H, 1123);
});

test('an empty canvas still shows one page to write on', () => {
  const pages = pageRects(0, COLUMN);
  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0], { n: 1, x: (COLUMN - PAGE_W) / 2, y: 0, w: PAGE_W, h: PAGE_H });
});

// The column sits in the middle of the paper, so the margin either side is the
// room you actually have before running off the page.
test('the column is centred on the page', () => {
  const [page] = pageRects(0, COLUMN);
  assert.equal(page.x + page.w / 2, COLUMN / 2);
  assert.equal(page.x, -117);
});

test('pages are added only as the content needs them', () => {
  assert.equal(pageRects(PAGE_H - 1, COLUMN).length, 1);
  assert.equal(pageRects(PAGE_H + 1, COLUMN).length, 2);
  // Content ending exactly on a boundary is still covered by that page.
  assert.equal(pageRects(PAGE_H * 3, COLUMN).length, 3);
  assert.equal(pageRects(PAGE_H * 3 + 1, COLUMN).length, 4);
});

test('they stack without gaps or overlap', () => {
  const pages = pageRects(PAGE_H * 2.5, COLUMN);
  for (let i = 1; i < pages.length; i++) assert.equal(pages[i].y, pages[i - 1].y + pages[i - 1].h);
  assert.deepEqual(pages.map(page => page.n), pages.map((_, i) => i + 1));
});

// Content dragged above the origin must not silently lose its page.
test('a negative extent is treated as the top of the first page', () => {
  assert.equal(pageRects(-5000, COLUMN).length, 1);
});

test('nonsense never produces a broken page list', () => {
  for (const bad of [NaN, undefined, null, Infinity, 'x']) {
    const pages = pageRects(bad, COLUMN);
    assert.ok(pages.length >= 1 && pages.length <= PAGE_LIMIT, String(bad));
    assert.ok(pages.every(page => Number.isFinite(page.y) && Number.isFinite(page.x)), String(bad));
  }
});

// A canvas panned into the far distance must not try to draw ten thousand pages.
test('the page count is capped', () => {
  assert.equal(pageRects(PAGE_H * 10000, COLUMN).length, PAGE_LIMIT);
});

test('landscape pages swap the A4 sides and still centre on the column', () => {
  const [page] = pageRects(0, COLUMN, true);
  assert.deepEqual([page.w, page.h, page.x], [PAGE_H, PAGE_W, (COLUMN - PAGE_H) / 2]);
  assert.equal(pageRects(PAGE_W + 1, COLUMN, true).length, 2);
});
