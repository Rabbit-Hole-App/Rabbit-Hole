// Owner 2026-11-08/09: a card made from a card stands beside its source (right, level with the top, one gutter away, no connector). The geometry is pure; the wiring is read from the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { besideSpot, BESIDE_ASSUMED_W } from './beside-placement.js';
import { GAP } from './inline-ai-apply.js';

const src = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const source = { x: 100, y: 240, w: 440, h: 700 };

test('right of the source, level with its top, one gutter away', () => {
  const spot = besideSpot(source, { w: 440, h: 400 }, []);
  assert.deepEqual(spot, { x: source.x + source.w + GAP, y: source.y });
  assert.equal(GAP, 40);
});

test('a neighbour already to the right: the first free place further right in the row', () => {
  const wide = BESIDE_ASSUMED_W;
  const neighbour = { x: source.x + source.w + GAP, y: source.y + 50, w: 300, h: 200 };
  const spot = besideSpot(source, { w: 440, h: 400 }, [neighbour]);
  assert.ok(spot.x >= neighbour.x + neighbour.w, 'clear of the neighbour');
  assert.equal(spot.y, source.y, 'still level with the source');
  assert.ok(spot.x - (source.x + source.w) >= GAP + 0);
  assert.ok(wide >= 546);
});

test('nothing free in the first tries: null, and the caller keeps the column (below) placement', () => {
  const wall = { x: source.x + source.w, y: source.y - 50, w: 20000, h: 2000 };
  assert.equal(besideSpot(source, { w: 440, h: 400 }, [wall]), null);
});

test('no source box (not measured, not on this canvas): null', () => {
  assert.equal(besideSpot(null, { w: 440, h: 400 }, []), null);
  assert.equal(besideSpot({ x: 0, y: 0, w: 0, h: 0 }, { w: 440, h: 400 }, []), null);
});

test('a minimized tile as the source: its measured width is used, so the new card clears the tile', () => {
  const tile = { x: 0, y: 0, w: 546, h: 667 };
  assert.deepEqual(besideSpot(tile, { w: 440, h: 300 }, []), { x: 546 + GAP, y: 0 });
});

test('the card is placed clear of the source and of every obstacle: no overlap after the insert', () => {
  const others = [{ x: 700, y: 0, w: 300, h: 300 }, { x: 1100, y: 300, w: 546, h: 900 }];
  const spot = besideSpot(source, { w: 440, h: 400 }, others);
  const placed = { x: spot.x, y: spot.y, w: BESIDE_ASSUMED_W, h: source.h };
  for (const box of [source, ...others]) assert.ok(placed.x >= box.x + box.w || placed.x + placed.w <= box.x || placed.y >= box.y + box.h || placed.y + placed.h <= box.y, JSON.stringify(box));
});

test('wiring: Ask in a new card and Explore ask for a card beside the source with no connector; the slot is as tall as the source; an anchored slot puts the card on its place; reload keeps dx, dy', () => {
  const canvas = src('./AdaptiveCanvas.jsx'), slash = src('./learn-slash.js');
  assert.match(canvas, /\.\.\.\(destination === 'card' \|\| destination === 'follow-up' \|\| destination === 'explore' \? \{ beside: true \} : \{\}\)/);
  assert.match(canvas, /besideSpot\(source, size, boardObstacles\(\[beside\]\), \{ dy: besideDy \}\)/);
  assert.match(canvas, /if \(spot\) size = \{ \.\.\.size, h: Math\.round\(source\.h\) \}/);
  assert.match(canvas, /if \(slot\?\.at\) pendingAt\.current\.set\(block\.id, slot\.at\)/);
  assert.match(canvas, /if \(link && parent\?\.id &&/);
  assert.match(slash, /target\?\.beside && target\.id \? \{ beside: target\.id, /);
  assert.match(slash, /\.\.\.\(target\?\.beside \? \{ link: false \} : \{\}\)/);
  // the offsets are the block's own dx, dy: the saved board already stores them (a dragged card), so a reload keeps the place without a migration
  assert.match(canvas, /moves\.set\(id, \{ dx: Math\.round\(at\.x - \(box\.x - \(owner\.dx \|\| 0\)\)\), dy: Math\.round\(at\.y - \(box\.y - \(owner\.dy \|\| 0\)\)\) \}\)/);
});
