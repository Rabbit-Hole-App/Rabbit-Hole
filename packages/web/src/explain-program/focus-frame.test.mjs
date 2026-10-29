import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { focusFrameBox, legibleFrame, readableScale } from './frame.js';

// Focus on an Explanation program (owner screenshot 2026-10-28: a wide drawing in a short box, its lower half and x-axis behind
// an internal scrollbar). The box is the legible box fitted into the room by the smaller of the two scales, shrunk to fit down
// to its readable scale; only under that does the drawing scroll above the rows. Synthetic frames of two shapes; nothing names
// a topic.
const text = { id: 't', type: 'text', initialState: { label: 'a', opacity: 1 } };
const sceneOf = (width, height, objects = [text]) => ({ width, height, objects, timeline: [] });
const frameOf = (width, height) => legibleFrame(sceneOf(width, height));
const wide = frameOf(960, 540), tall = frameOf(540, 720);
const min = readableScale(sceneOf(960, 540));
const aspect = box => box.w / box.h;

test('readableScale: the scale where the smallest text reaches the 12 px floor; never above 1', () => {
  assert.equal(min, 0.8, 'body text, 15 px at the legible box, may draw down to 12 px');
  assert.equal(readableScale(sceneOf(960, 540, [{ ...text, initialState: { ...text.initialState, typography: 'annotation' } }])), 12 / 13);
  assert.equal(readableScale(sceneOf(960, 540, [])), 0.8, 'no text: as if body text');
  assert.equal(readableScale(sceneOf(4000, 1000)), 1, 'a frame already capped under its floors by MAX_SCENE_VIEWPORT is never shrunk');
});

test('a wide frame in a desktop pane is limited by the height: the whole drawing fits, aspect kept, no scroll', () => {
  const room = { w: 1370, h: 560 }; // 1440 x 900 less the Focus header and the card's rows
  const box = focusFrameBox(wide, room, min);
  assert.equal(box.scroll, false);
  assert.ok(box.h <= room.h && box.w <= room.w, 'inside the room on both axes');
  assert.equal(box.h, 560, 'height-limited: it does not stretch to the full width');
  assert.ok(Math.abs(aspect(box) - aspect(wide)) < 0.01);
});

// Owner, 2026-10-28: "a 16:9 visualization with 500 px available height fits at about 889 px wide".
test('height-limited under the legible box: a 16:9 frame in 500 px of height fits at 889 x 500, centred, not full width', () => {
  assert.deepEqual(focusFrameBox(wide, { w: 1370, h: 500 }, min), { w: 889, h: 500, scroll: false });
  assert.deepEqual(focusFrameBox(wide, { w: 972, h: 498 }, min), { w: 885, h: 498, scroll: false }, '1440 x 900 with Chat open (measured room)');
});

test('width-limited: a tall frame, or a wide one in a narrow deep room, fills the width and keeps its aspect', () => {
  const box = focusFrameBox(tall, { w: 1370, h: 900 }, min);
  assert.deepEqual([box.scroll, box.h, box.w], [false, 900, 675]);
  assert.deepEqual(focusFrameBox(tall, { w: 600, h: 1200 }, min), { w: 600, h: 800, scroll: false }, 'grows past the legible box');
  assert.deepEqual(focusFrameBox(wide, { w: 800, h: 900 }, min), { w: 800, h: 450, scroll: false }, 'shrinks to 0.83, still readable');
  assert.deepEqual(focusFrameBox(tall, { w: 540, h: 720 }, min), { w: 540, h: 720, scroll: false }, 'exactly legible fits');
});

// Owner, 2026-10-29: "reclaim space first, preserve readable text, avoid a separate scrollbar inside the animation"; "if the
// complete readable content genuinely cannot fit, scroll the whole Focus content as ONE surface". Under the readable scale the
// drawing is drawn whole at that scale and the focused card scrolls; the drawing never has a box or scrollbar of its own.
test('under the readable scale the drawing is drawn whole at it and the Focus content scrolls as one surface', () => {
  assert.deepEqual(focusFrameBox(wide, { w: 710, h: 394 }, min), { w: 768, h: 432, scroll: true }, '1280 x 720 app with Chat open: too small to fit readably');
  assert.deepEqual(focusFrameBox(wide, { w: 330, h: 600 }, min), { w: 768, h: 432, scroll: true }, 'a phone: too narrow');
  assert.deepEqual(focusFrameBox(wide, { w: 1216, h: 380 }), { w: 960, h: 540, scroll: true }, 'without a readable scale the legible box is the floor');
  const scene = readFileSync(new URL('./ProgramScene.jsx', import.meta.url), 'utf8');
  assert.match(scene, /style=\{focusBox \? \{ flex: 'none', width: focusBox\.w \+ 2, height: focusBox\.h \+ 2, overflow: 'hidden', alignSelf: 'safe center' \} : undefined\}/, 'the drawing is whole and centred, never scrolled inside its own box');
  assert.match(scene, /focusFrameBox\(box, \{ w: card\.clientWidth - fixed\.w, h: card\.clientHeight - fixed\.h - rowsHeight \}, box\.minScale\)/, 'the room is the card less its fixed chrome and rows, never the sized viewport');
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(max-height: 800px\) \{\s*\[data-focus-host\] \[data-program-card\], \[data-focus-host\] \[data-program-card\] > div:last-child \{ gap: 0\.25rem; \}/, 'a short window closes up the rows first');
});

test('Focus shows one title (the card hides its own kicker and title) and the canvas draws its maps and Curious through focusWidgets', () => {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  assert.match(css, /\[data-focus-host\] \[data-focus-hide\] \{ display: none; \}/);
  assert.match(css, /\[data-focus-host\]:has\(\[data-program-viewport\]\) \{ overflow: auto !important; overscroll-behavior: contain; \}/, 'one surface scrolls, and its end never scrolls the page under it');
  assert.match(readFileSync(new URL('../LearningBlocks.jsx', import.meta.url), 'utf8'), /<div data-focus-hide><Kicker>/);
  assert.match(readFileSync(new URL('../LearningBlocks.jsx', import.meta.url), 'utf8'), /<div data-focus-hide>\{!block\.anchor && <Kicker>Explanation<\/Kicker>\}/, 'a text Explanation too');
  const canvas = readFileSync(new URL('../AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /const drawnWidgets = focusWidgets\(\{ minimap, holeMap, curious \}, !!focus\);/);
  assert.match(canvas, /\{drawnWidgets\.minimap && <div data-canvas-minimap>/);
  assert.match(canvas, /!readOnly && toolbar && <div ref=\{toolbarRef\}/, 'the toolbar stays in Focus');
});
