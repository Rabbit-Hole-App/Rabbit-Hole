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
  assert.match(canvas, /besideSpot\(source, size, boardObstacles\(\[anchor\]\), \{ dy: besideDy \}\)/);
  assert.match(canvas, /if \(at\) size = \{ \.\.\.size, h: Math\.round\(source\.h\) \}/);
  // typed /explain (BUG 4): follow the selected or latest explanation card through followPlace, never the column once there is one to follow
  assert.match(canvas, /\(\{ at, size \} = followPlace\(\{ source, size, id, obstacles: boardObstacles\(\[anchor\]\) \}\)\)/);
  assert.match(canvas, /beside \|\| \(follow && !given \? followAnchor\(\) : null\)/);
  assert.match(canvas, /if \(slot\?\.at\) pendingAt\.current\.set\(block\.id, slot\.at\)/);
  assert.match(canvas, /if \(link && parent\?\.id &&/);
  assert.match(slash, /target\?\.beside && target\.id \? \{ beside: target\.id, /);
  assert.match(slash, /\.\.\.\(target\?\.beside \? \{ link: false \} : \{\}\)/);
  // the offsets are the block's own dx, dy: the saved board already stores them (a dragged card), so a reload keeps the place without a migration
  assert.match(canvas, /moves\.set\(id, \{ dx: Math\.round\(at\.x - \(box\.x - \(owner\.dx \|\| 0\)\)\), dy: Math\.round\(at\.y - \(box\.y - \(owner\.dy \|\| 0\)\)\) \}\)/);
});

// CV-4 (film): with nothing selected and no explanation card yet, the first typed /explain follows the markdown card on the board, not the column.
test('wiring: followAnchor falls back to the markdown file card when there is no explanation card yet', () => {
  const canvas = src('./AdaptiveCanvas.jsx');
  assert.match(canvas, /explainCard\(block\) && drawn\(block\.id\)\)\?\.id\s*\n\s*\?\? blocksRef\.current\.find\(block => block\.type === 'file' && block\.kind === 'markdown' && drawn\(block\.id\)\)\?\.id \?\? null/);
});

// canvas-cards BUG 4: a typed /explain lands to the right of the previous card, loosely scattered, never overlapping; a full row starts a new one under it, never the column.
import { followPlace, scatterOf, SCATTER_MAX_DY } from './beside-placement.js';
test('the scatter is deterministic per request, inside 0..0.35 of the source height, and alternates one and two gutters', () => {
  assert.deepEqual(scatterOf('slot:abc', 700), scatterOf('slot:abc', 700), 'the same request, the same place');
  const draws = Array.from({ length: 60 }, (_, i) => scatterOf(`slot:request-${i}`, 700));
  assert.ok(draws.every(({ dy }) => dy >= 0 && dy <= Math.min(SCATTER_MAX_DY, Math.round(0.35 * 700))), 'dy stays within 35% of the source and the cap');
  assert.deepEqual([...new Set(draws.map(({ gap }) => gap))].sort((a, b) => a - b), [GAP, 2 * GAP], 'both gaps occur');
  assert.ok(new Set(draws.map(({ dy }) => dy)).size > 20, 'cards do not line up: many different offsets');
});
test('followPlace: beside the source with its scatter, no overlap; a full row gives a new row under the source, right of the column, never null', () => {
  const size = { w: 440, h: 400 };
  const first = followPlace({ source, size, id: 'slot:1', obstacles: [] });
  const { dy, gap } = scatterOf('slot:1', source.h);
  assert.deepEqual(first.at, { x: source.x + source.w + gap, y: source.y + Math.min(dy, source.h - 40) });
  assert.equal(first.size.h, source.h, 'as tall as the source');
  // Fill the source's row for every try: one box per attempt, wide enough to block it.
  const w = Math.max(size.w, BESIDE_ASSUMED_W), blockers = Array.from({ length: 6 }, (_, k) => ({ x: source.x + source.w + 1 + k * (w + 2 * GAP), y: source.y, w: w + 2 * GAP, h: source.h }));
  const full = followPlace({ source, size, id: 'slot:1', obstacles: blockers });
  assert.ok(full.at && Number.isFinite(full.at.x) && Number.isFinite(full.at.y), 'a place is found, not the column');
  const card = { ...full.at, w: size.w, h: size.h };
  assert.ok(!blockers.some(box => card.x < box.x + box.w && card.x + card.w > box.x && card.y < box.y + box.h && card.y + card.h > box.y), 'it overlaps nothing');
  assert.ok(full.at.y > source.y + source.h - 1 || full.at.x > blockers.at(-1).x + blockers.at(-1).w - 1, 'a new row under the source, or past the row');
});

// CV-4 cap: besideDy = min(0.35 x source height, 120 px). A card lands level with the source's top region, never far down a tall source.
test('the scatter offset is capped at 120 px for a tall source and unchanged for a short one', () => {
  assert.equal(SCATTER_MAX_DY, 120);
  const ids = Array.from({ length: 200 }, (_, i) => 'slot:cap-' + i);
  assert.ok(ids.every(id => scatterOf(id, 5400).dy <= 120), 'a 5,400 px Full markdown: dy <= 120 for every request');
  assert.ok(ids.some(id => scatterOf(id, 5400).dy === 120), 'the cap is reached (uncapped it would reach about 1,890)');
  for (const id of ids) {
    const a = scatterOf(id, 300).dy, b = scatterOf(id, 200).dy;
    assert.ok(a <= 105, 'a 300 px source keeps the 0.35 range');
    assert.ok(Math.abs(b - a * 200 / 300) <= 1, 'below the cap dy is still 0.35 x the height times the hash fraction (linear in the height)');
  }
  const first = followPlace({ source: { x: 100, y: 240, w: 440, h: 5400 }, size: { w: 440, h: 400 }, id: 'slot:1', obstacles: [] });
  assert.ok(first.at.y - 240 <= 120, 'followPlace beside a 5,400 px source starts within 120 px of its top');
});

// CV-4 (real board): beside a very tall source (a 10,500 px Full markdown) the new card needs a free 720 px, not a free column as tall as the source; it stays close, level with the top region.
import { BESIDE_ASSUMED_H } from './beside-placement.js';
test('beside a very tall source the card lands next to it, not past every card down its column', () => {
  const tall = { x: 0, y: 0, w: 699, h: 10500 }, size = { w: 440, h: 330 };
  const elsewhere = [{ x: 760, y: 3000, w: 700, h: 800 }, { x: 790, y: 9000, w: 460, h: 840 }]; // cards far down the source's right-hand side
  const placed = followPlace({ source: tall, size, id: 'slot:real-1', obstacles: elsewhere });
  const { dy, gap } = scatterOf('slot:real-1', tall.h);
  assert.deepEqual(placed.at, { x: 699 + gap, y: dy }, 'the first free place right of the source, level with its top region');
  assert.equal(placed.size.h, BESIDE_ASSUMED_H, 'the slot is no taller than a card');
  assert.ok(besideSpot(tall, size, elsewhere).x > placed.at.x + 700, 'reproduction: a spot as tall as the source is blocked by those cards and lands a whole card further right');
  const near = followPlace({ source: tall, size, id: 'slot:real-2', obstacles: [{ x: 699, y: 0, w: 800, h: 300 }] });
  assert.ok(near.at.x > 699 + 700 && near.at.y <= 120, 'a card right beside it pushes the new one one step right, still at the top');
});
