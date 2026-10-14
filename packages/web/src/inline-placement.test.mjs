// Free space and matching the surroundings for a new inline result (owner brief 2026-10-13 §7).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STYLE, placeResult, regionStyle } from './inline-placement.js';
import { freeSpot, obstaclesOf } from './inline-ai-apply.js';
import { flowBoard, treeBoard, withBoxes } from './inline-ai-fixtures.js';

const bounds = { x: 0, y: 0, w: 300, h: 200 };
const view = { x: 0, y: 0, w: 1600, h: 1000 };

test('placeResult: on empty space the result is centred on the anchor and in view', () => {
  const spot = placeResult(bounds, { x: 800, y: 500 }, [], view);
  assert.deepEqual([spot.x, spot.y, spot.dx, spot.dy, spot.offscreen], [650, 400, 650, 400, false]);
  // The offset is relative to the result's own frame: a layout that does not start at 0,0 keeps its shape.
  const shifted = placeResult({ x: 20, y: 30, w: 300, h: 200 }, { x: 800, y: 500 }, [], view);
  assert.deepEqual([shifted.dx, shifted.dy], [630, 370]);
});

test('placeResult: a crowded canvas - the nearest free spot, a margin to everything, nothing moved', () => {
  // A dense block of cards around the anchor.
  const boxes = [];
  for (let col = 0; col < 6; col += 1) for (let row = 0; row < 4; row += 1) boxes.push({ id: `c${col}-${row}`, x: 300 + col * 170, y: 200 + row * 140, w: 150, h: 120 });
  const obstacles = obstaclesOf({ boxes });
  const before = structuredClone(obstacles);
  const spot = placeResult(bounds, { x: 800, y: 450 }, obstacles, view);
  assert.ok(freeSpot({ ...bounds, x: spot.x, y: spot.y }, obstacles), 'clear of every obstacle, with the shared margin');
  assert.deepEqual(obstacles, before);
  assert.equal(spot.offscreen, false);
  // Nearest: never further from the anchor than the "beside everything" fallback.
  const centre = { x: spot.x + 150, y: spot.y + 100 };
  assert.ok(Math.hypot(centre.x - 800, centre.y - 450) < 900);
});

test('placeResult: when no free spot is in view, it says so instead of landing silently off-screen', () => {
  const wall = obstaclesOf({ boxes: [{ id: 'wall', x: -50, y: -50, w: 1700, h: 1100 }] });
  const spot = placeResult(bounds, { x: 800, y: 500 }, wall, view);
  assert.equal(spot.offscreen, true);
  assert.ok(freeSpot({ ...bounds, x: spot.x, y: spot.y }, wall));
  // With no viewport there is nothing to be off.
  assert.equal(placeResult(bounds, { x: 800, y: 500 }, [], null).offscreen, false);
});

test('placeResult: real board obstacles from the canvas fixtures', () => {
  const board = withBoxes(treeBoard());
  const obstacles = obstaclesOf({ boxes: Object.entries(board.boxes).map(([id, box]) => ({ id, ...box })) });
  const spot = placeResult(bounds, { x: 500, y: 250 }, obstacles, view);
  assert.ok(freeSpot({ ...bounds, x: spot.x, y: spot.y }, obstacles));
});

test('regionStyle: a blank canvas or an empty region takes the default style', () => {
  assert.deepEqual(regionStyle({ shapes: [], links: [] }, { x: 0, y: 0 }), DEFAULT_STYLE);
  assert.deepEqual(regionStyle(treeBoard(), { x: 9000, y: 9000 }), DEFAULT_STYLE);
});

test('regionStyle: the region\'s shape kind, colours, connector route and spacing, from valid values only', () => {
  const tree = regionStyle(treeBoard(), { x: 450, y: 250 });
  assert.deepEqual([tree.kind, tree.color, tree.route, tree.lineColor, tree.nodeW, tree.nodeH], ['ellipse', '#37352f', 'straight', '#37352f', 64, 64]);
  assert.ok(tree.gap >= 16 && tree.gap <= 240);
  assert.equal(tree.from, 6);
  const flow = regionStyle(flowBoard(), { x: 300, y: 800 });
  assert.deepEqual([flow.kind, flow.color, flow.round], ['rect', '#2383e2', true]);
  const odd = regionStyle({ shapes: [{ id: 'x', kind: 'rect', x1: 0, y1: 0, x2: 100, y2: 50, color: 'red;background:url(x)', fontSize: 9999, font: 'comic', width: NaN }], links: [] }, { x: 50, y: 25 });
  assert.deepEqual([odd.color, odd.fontSize, odd.font, odd.width], [DEFAULT_STYLE.color, 160, DEFAULT_STYLE.font, DEFAULT_STYLE.width]);
});
