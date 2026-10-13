import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawGeometry, moveEnd, resizeBox, snapAngle } from './learn-draw-modifiers.js';

const start = { x: 100, y: 100 };

test('a plain drag draws from the start to the pointer, in any direction', () => {
  assert.deepEqual(drawGeometry(false, start, { x: 160, y: 130 }), { x1: 100, y1: 100, x2: 160, y2: 130 });
  assert.deepEqual(drawGeometry(false, start, { x: 40, y: 20 }), { x1: 100, y1: 100, x2: 40, y2: 20 });
});

test('Shift squares a box on the longer side, keeping the drag direction (left and up too)', () => {
  assert.deepEqual(drawGeometry(false, start, { x: 160, y: 130 }, { shift: true }), { x1: 100, y1: 100, x2: 160, y2: 160 });
  assert.deepEqual(drawGeometry(false, start, { x: 80, y: 20 }, { shift: true }), { x1: 100, y1: 100, x2: 20, y2: 20 });
});

test('Alt draws from the centre; Shift+Alt is a centred square', () => {
  assert.deepEqual(drawGeometry(false, start, { x: 130, y: 110 }, { alt: true }), { x1: 70, y1: 90, x2: 130, y2: 110 });
  assert.deepEqual(drawGeometry(false, start, { x: 130, y: 110 }, { alt: true, shift: true }), { x1: 70, y1: 70, x2: 130, y2: 130 });
});

test('Shift snaps a line to the nearest 45 degrees, its length kept', () => {
  const flat = drawGeometry(true, start, { x: 200, y: 108 }, { shift: true });
  assert.equal(flat.y2, 100);
  assert.ok(Math.abs(flat.x2 - 100 - Math.hypot(100, 8)) < 0.01);
  const diagonal = snapAngle(-50, -46);
  assert.ok(Math.abs(diagonal.dx - diagonal.dy) < 0.01 && diagonal.dx < 0);
  // Alt: the line is centred on the start, the arrow still points at the pointer.
  assert.deepEqual(drawGeometry(true, start, { x: 150, y: 100 }, { alt: true }), { x1: 50, y1: 100, x2: 150, y2: 100 });
});

const box = { x1: 0, y1: 0, x2: 200, y2: 100 };

test('resizing a corner moves only that corner; dragging across the anchor flips cleanly', () => {
  assert.deepEqual(resizeBox(box, [1, 1], { x: 300, y: 150 }), { x1: 0, y1: 0, x2: 300, y2: 150 });
  assert.deepEqual(resizeBox(box, [1, 1], { x: -50, y: -20 }), { x1: -50, y1: -20, x2: 0, y2: 0 });
  assert.deepEqual(resizeBox(box, [0, 0], { x: 50, y: 20 }), { x1: 50, y1: 20, x2: 200, y2: 100 });
});

test('Shift keeps the original proportions; Alt keeps the centre', () => {
  assert.deepEqual(resizeBox(box, [1, 1], { x: 400, y: 110 }, { shift: true }), { x1: 0, y1: 0, x2: 400, y2: 200 });
  assert.deepEqual(resizeBox(box, [1, 1], { x: 250, y: 75 }, { alt: true }), { x1: -50, y1: 25, x2: 250, y2: 75 });
  assert.deepEqual(resizeBox(box, [1, 1], { x: 300, y: 50 }, { alt: true, shift: true }), { x1: -100, y1: -50, x2: 300, y2: 150 });
});

test('a resize never goes below the floor, and the anchor stays put', () => {
  const tiny = resizeBox(box, [1, 1], { x: 2, y: 2 }, {}, () => ({ w: 24, h: 40 }));
  assert.deepEqual(tiny, { x1: 0, y1: 0, x2: 24, y2: 40 });
  // Text that needs more height at a narrower width.
  const text = resizeBox(box, [1, 1], { x: 60, y: 10 }, {}, w => ({ w: 24, h: 4000 / w }));
  assert.equal(text.y2, 4000 / 60);
});

test('a line end moves alone, snaps with Shift, and mirrors about the middle with Alt', () => {
  const line = { x1: 0, y1: 0, x2: 100, y2: 0 };
  assert.deepEqual(moveEnd(line, 'end', { x: 80, y: 60 }), { x1: 0, y1: 0, x2: 80, y2: 60 });
  const snapped = moveEnd(line, 'end', { x: 100, y: 7 }, { shift: true });
  assert.equal(snapped.y2, 0);
  assert.deepEqual(moveEnd(line, 'end', { x: 120, y: 0 }, { alt: true }), { x1: -20, y1: 0, x2: 120, y2: 0 });
});
