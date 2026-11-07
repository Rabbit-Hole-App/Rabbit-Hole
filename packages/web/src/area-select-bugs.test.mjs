// Ask about selection bug hunt (owner 2026-11-07): the pure rules and the wiring that the fixes rest on. Source and unit checks, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { areaTarget, areaTooSmall, visibleCrop, withoutPicture } from './area-crop.js';

const read = name => readFileSync(new URL('./' + name, import.meta.url), 'utf8');

test('a click, a tiny drag and an Escape pulled back to the start are no selection', () => {
  assert.equal(areaTooSmall({ x1: 5, y1: 5, x2: 5, y2: 5 }, 1), true);
  assert.equal(areaTooSmall({ x1: 0, y1: 0, x2: 200, y2: 7 }, 1), true, 'one thin side is enough');
  assert.equal(areaTooSmall({ x1: 0, y1: 0, x2: 3, y2: 3 }, 2), true, 'zoom counts: 8 screen pixels');
  assert.equal(areaTooSmall({ x1: 300, y1: 200, x2: 100, y2: 50 }, 1), false, 'dragged right to left and up is fine');
});

test('a rectangle dragged past the edge is cut to the visible surface; nothing visible is no capture', () => {
  const box = { width: 800, height: 600 };
  assert.deepEqual(visibleCrop({ x: 700, y: 500, w: 300, h: 300 }, box), { x: 700, y: 500, w: 100, h: 100 });
  assert.deepEqual(visibleCrop({ x: -50, y: -50, w: 100, h: 100 }, box), { x: 0, y: 0, w: 50, h: 50 });
  assert.deepEqual(visibleCrop({ x: 100, y: 100, w: 200, h: 200 }, box), { x: 100, y: 100, w: 200, h: 200 }, 'inside stays as drawn');
  assert.equal(visibleCrop({ x: 900, y: 100, w: 100, h: 100 }, box), null, 'wholly off screen');
  assert.equal(visibleCrop({ x: 795, y: 100, w: 100, h: 100 }, box), null, 'under 8 visible pixels');
});

test('the target only says an image is attached when there is a picture', () => {
  const withShot = areaTarget({ id: 'area:a', bindings: [], preview: 'data:image/png;base64,AAAA', at: 1 });
  const noShot = areaTarget({ id: 'area:a', bindings: [], preview: null, at: 1 });
  assert.match(withShot.text, /the attached image shows that area/);
  assert.doesNotMatch(noShot.text, /attached image/);
  assert.match(noShot.text, /no picture of it could be attached/);
  assert.deepEqual(withoutPicture(withShot).text, noShot.text, 'an upload that fails later turns the same words');
  assert.equal(withoutPicture(noShot).text, noShot.text, 'idempotent');
});

test('the canvas wiring: no empty capture, only its own rectangle cleared, background painted, failures said, tool only where it lands', () => {
  const canvas = read('AdaptiveCanvas.jsx');
  assert.match(canvas, /if \(areaTooSmall\(rect, view\.z\)\) \{ setAreaMarquee\(null\); return; \}\s+const mine = \{ \.\.\.rect, busy: true \};/);
  assert.match(canvas, /setAreaMarquee\(current => \(current === mine \? null : current\)\)/);
  assert.match(canvas, /const crop = visibleCrop\(/);
  assert.match(canvas, /backgroundColor: getComputedStyle\(document\.documentElement\)\.getPropertyValue\('--color-white'\)/);
  assert.match(canvas, /catch \{[^}]*preview = null; blob = null;[^}]*toast\('The picture of the selection could not be taken/);
  assert.match(canvas, /NAV_TOOLS\.filter\(\(\[value\]\) => value !== 'askArea' \|\| onAreaShot\)/, 'a canvas with nothing to receive the shot (shared, member) has no such tool');
  const page = read('LearnPage.jsx');
  assert.match(page, /uploadFailed\(previous, target\.id\)[\s\S]{0,260}could not be sent/);
});
