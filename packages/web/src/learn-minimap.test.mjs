import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minimapLayout, minimapToView } from './learn-minimap.js';

const surface = { w: 1000, h: 500 };
const size = { w: 180, h: 120 };
const view = { x: 0, y: 0, z: 1 }; // camera at the origin, unzoomed

test('nothing on the canvas gives nothing to draw', () => {
  const layout = minimapLayout([], { x: 0, y: 0, z: 1 }, surface, size);
  assert.equal(layout, null);
});

test('one box and the viewport both land inside the minimap', () => {
  const layout = minimapLayout([{ x: 0, y: 0, w: 500, h: 400 }], view, surface, size);
  for (const rect of [...layout.boxes, layout.view]) {
    assert.ok(rect.x >= -0.01 && rect.y >= -0.01, `${JSON.stringify(rect)} starts inside`);
    assert.ok(rect.x + rect.w <= size.w + 0.01 && rect.y + rect.h <= size.h + 0.01, `${JSON.stringify(rect)} ends inside`);
  }
});

// The whole point of a minimap is to find yourself after panning into nowhere,
// so the viewport must be part of what gets framed, not just the content.
test('content you have panned away from still shows, and so does where you are', () => {
  const layout = minimapLayout([{ x: 0, y: 0, w: 200, h: 200 }], { x: -9000, y: -4000, z: 1 }, surface, size);
  assert.ok(layout.boxes[0].x + layout.boxes[0].w <= size.w + 0.01);
  assert.ok(layout.view.x + layout.view.w <= size.w + 0.01);
  assert.ok(layout.view.x > layout.boxes[0].x, 'the viewport sits to the right of the content it left behind');
});

test('aspect ratio is kept - a wide canvas does not become a square', () => {
  const layout = minimapLayout([{ x: 0, y: 0, w: 1000, h: 100 }], view, surface, size);
  const box = layout.boxes[0];
  assert.ok(Math.abs(box.w / box.h - 10) < 0.5, `got ${box.w}x${box.h}`);
});

test('the framed content is centred in the minimap', () => {
  const layout = minimapLayout([{ x: 0, y: 0, w: 1000, h: 1000 }], { x: 0, y: 0, z: 1 }, { w: 1000, h: 1000 }, size);
  const left = Math.min(...layout.boxes.map(b => b.x), layout.view.x);
  const right = Math.max(...layout.boxes.map(b => b.x + b.w), layout.view.x + layout.view.w);
  assert.ok(Math.abs(left - (size.w - (right - left)) / 2) < 1, `left ${left}, span ${right - left}`);
});

test('zooming in shrinks the viewport rectangle, it does not move the content', () => {
  const boxes = [{ x: 0, y: 0, w: 1000, h: 1000 }];
  const out = minimapLayout(boxes, { x: 0, y: 0, z: 1 }, surface, size);
  const inn = minimapLayout(boxes, { x: 0, y: 0, z: 2 }, surface, size);
  assert.ok(inn.view.w < out.view.w, `${inn.view.w} < ${out.view.w}`);
});

test('every box is projected, in order', () => {
  const layout = minimapLayout([{ x: 0, y: 0, w: 10, h: 10 }, { x: 900, y: 900, w: 10, h: 10 }], view, surface, size);
  assert.equal(layout.boxes.length, 2);
  assert.ok(layout.boxes[1].x > layout.boxes[0].x);
});

// A zero-size box would divide by zero on the way to a scale.
test('a degenerate box does not produce NaN', () => {
  const layout = minimapLayout([{ x: 5, y: 5, w: 0, h: 0 }], view, surface, size);
  for (const value of [layout.boxes[0].x, layout.boxes[0].y, layout.view.x, layout.view.w]) {
    assert.ok(Number.isFinite(value), `${value} is finite`);
  }
});

// The NanoGPT board is ~25 cards in one ~20000px column: fitted whole it was a hairline.
test('a very tall canvas keeps a usable width, and the frame follows the viewport down the column', () => {
  const column = Array.from({ length: 25 }, (_, i) => ({ x: 0, y: i * 800, w: 1100, h: 760 }));
  const inner = size.w - 12;
  const top = minimapLayout(column, { x: 0, y: 0, z: 1 }, surface, size);
  assert.ok(top.boxes[0].w >= 0.45 * inner - 0.5, `content ${top.boxes[0].w}px wide of ${inner}`);
  const deep = minimapLayout(column, { x: 0, y: -12000, z: 1 }, surface, size);
  for (const layout of [top, deep]) assert.ok(layout.view.y >= 0 && layout.view.y + layout.view.h <= size.h, 'the viewport stays inside the frame');
  assert.ok(deep.offsetY < top.offsetY, 'the frame scrolled down with the viewport');
  // A press still sends the camera where it points.
  const back = minimapToView({ x: deep.view.x + deep.view.w / 2, y: deep.view.y + deep.view.h / 2 }, deep, surface, 1);
  assert.ok(Math.abs(back.y + 12000) < 2, `${back.y}`);
});
