import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { focusFrameBox, legibleFrame } from './frame.js';

// Focus on an Explanation program (owner screenshot 2026-10-28: a wide drawing in a short box, its lower half and x-axis behind
// an internal scrollbar). The box is the legible box fitted into the room by the smaller of the two scales; under the legible box
// it stays legible and the Focus content scrolls. Synthetic frames of two shapes; nothing names a topic.
const text = { id: 't', type: 'text', initialState: { label: 'a', opacity: 1 } };
const frameOf = (width, height) => legibleFrame({ width, height, objects: [text], timeline: [] });
const wide = frameOf(960, 540), tall = frameOf(540, 720);
const aspect = box => box.w / box.h;

test('a wide frame in a desktop pane is limited by the height: the whole drawing fits, aspect kept, no scroll', () => {
  const room = { w: 1370, h: 560 }; // 1440 x 900 less the Focus header and the card's rows
  const box = focusFrameBox(wide, room);
  assert.equal(box.scroll, false);
  assert.ok(box.h <= room.h && box.w <= room.w, 'inside the room on both axes');
  assert.equal(box.h, 560, 'height-limited: it does not stretch to the full width');
  assert.ok(Math.abs(aspect(box) - aspect(wide)) < 0.01);
});

test('a tall frame is limited by the height too, and never wider than its aspect allows', () => {
  const box = focusFrameBox(tall, { w: 1370, h: 900 });
  assert.deepEqual([box.scroll, box.h, box.w], [false, 900, 675]);
  const narrow = focusFrameBox(tall, { w: 600, h: 1200 });
  assert.deepEqual([narrow.scroll, narrow.w, narrow.h], [false, 600, 800], 'width-limited when the room is narrow and deep');
});

test('under the legible box the drawing is not shrunk: the legible box is kept and the Focus content scrolls', () => {
  assert.deepEqual(focusFrameBox(wide, { w: 1216, h: 380 }), { w: 960, h: 540, scroll: true }, '1280 x 720: too short');
  assert.deepEqual(focusFrameBox(wide, { w: 350, h: 600 }), { w: 960, h: 540, scroll: true }, 'a phone: too narrow');
  assert.deepEqual(focusFrameBox(tall, { w: 540, h: 720 }), { w: 540, h: 720, scroll: false }, 'exactly legible fits');
});

test('Focus shows one title (the card hides its own kicker and title) and the canvas draws its maps and Curious through focusWidgets', () => {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  assert.match(css, /\[data-focus-host\] \[data-focus-hide\] \{ display: none; \}/);
  assert.match(css, /\[data-focus-host\]:has\(\[data-program-viewport\]\) \{ overflow: auto !important; \}/);
  assert.match(readFileSync(new URL('../LearningBlocks.jsx', import.meta.url), 'utf8'), /<div data-focus-hide><Kicker>/);
  const canvas = readFileSync(new URL('../AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /const drawnWidgets = focusWidgets\(\{ minimap, holeMap, curious \}, !!focus\);/);
  assert.match(canvas, /\{drawnWidgets\.minimap && <div data-canvas-minimap>/);
  assert.match(canvas, /!readOnly && toolbar && <div ref=\{toolbarRef\}/, 'the toolbar stays in Focus');
});
