// HL-148: "Go to highlight" and "View passage" centre the PASSAGE at a readable zoom (the owner's rule: whatever the camera focuses ends up middle-centre, legible), not the whole 10,738 px file card at 20%.
// Pure camera maths (canvas-view.js passageZoom + centerOnBox with the passage as `focus`), the viewPassage hand-off, and wiring pins on the canvas's focus callback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { centerOnBox, passageZoom } from './canvas-view.js';
import { viewPassage } from './source-refs.js';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const REV = 'a'.repeat(64), FILE = `fs_${'1'.repeat(24)}`;
const ref = { v: 1, id: `sref_${'1'.repeat(24)}`, kind: 'markdown', source: { key: `file:${FILE}`, rev: REV, name: 'en.md', home: null }, anchor: { quote: { exact: 'Split criteria: measuring impurity', prefix: '', suffix: '' } } };
const fileCard = { id: 'file-1', kind: 'markdown', fileRef: { source: { id: FILE, rev: REV } } };
const AREA = { left: 0, right: 1180, top: 48, bottom: 900 };

test('passageZoom: a readable zoom for a passage: below 0.6 it is 1, from 0.6 up the learner\'s own zoom stays', () => {
  assert.equal(passageZoom(0.2), 1);
  assert.equal(passageZoom(0.59), 1);
  assert.equal(passageZoom(0.6), 0.6);
  assert.equal(passageZoom(1), 1);
  assert.equal(passageZoom(1.4), 1.4);
  assert.equal(passageZoom(undefined), 1);
});

test('a passage in a card far taller than the view ends up in the middle of the area, both axes, at the readable zoom (not the card\'s top, not the whole card)', () => {
  const card = { x: 84, y: 70, w: 699, h: 10738 }, passage = { x: 120, y: 2466, w: 253, h: 24 };
  const z = passageZoom(0.2), next = centerOnBox(card, { x: 0, y: 0, z }, AREA, passage);
  assert.equal(next.z, 1, 'the zoom is the one asked for, centerOnBox never changes it');
  assert.equal(Math.round(next.y + (passage.y + passage.h / 2) * z), Math.round((AREA.top + AREA.bottom) / 2), 'the passage\'s middle is the area\'s middle (y)');
  assert.equal(Math.round(next.x + (card.x + card.w / 2) * z), Math.round((AREA.left + AREA.right) / 2), 'the card fits across, so it is centred across');
});

test('a passage that is itself taller than the area is centred on its middle (its ends are cut, never the card\'s top)', () => {
  const card = { x: 84, y: 70, w: 699, h: 10738 }, passage = { x: 120, y: 3000, w: 500, h: 2400 };
  const next = centerOnBox(card, { x: 0, y: 0, z: 1 }, AREA, passage);
  assert.equal(Math.round(next.y + (passage.y + passage.h / 2)), Math.round((AREA.top + AREA.bottom) / 2));
});

test('with no passage the box taller than the area still starts at the area\'s top (the card focus every other caller uses is unchanged)', () => {
  const card = { x: 84, y: 70, w: 699, h: 10738 };
  assert.equal(centerOnBox(card, { x: 0, y: 0, z: 1 }, AREA).y, AREA.top - card.y);
});

test('viewPassage hands the camera the passage\'s measured rect and the card; an unresolved quote (no rect) focuses the card as it always did', () => {
  const calls = [], emitted = [];
  const rect = { left: 449, top: 345, width: 253, height: 20 };
  const opened = viewPassage(ref, { blocks: [fileCard], focus: (...args) => calls.push(args), emit: event => emitted.push(event), wait: fn => fn(), measure: (id, detail) => { calls.push(['measure', id, detail.quote.exact, detail.rev]); return rect; } });
  assert.equal(opened, 'opened');
  assert.deepEqual(calls, [['measure', 'file-1', 'Split criteria: measuring impurity', REV], ['file-1', { passage: rect }]]);
  assert.equal(emitted.length, 1, 'the card still paints its own emphasis');
  const plain = [];
  viewPassage(ref, { blocks: [fileCard], focus: (...args) => plain.push(args), emit: () => {}, wait: fn => fn(), measure: () => null });
  assert.deepEqual(plain, [['file-1', undefined]], 'no rect, no passage option: today\'s card focus');
  const gone = [];
  assert.equal(viewPassage(ref, { blocks: [], focus: (...args) => gone.push(args), emit: () => {}, wait: fn => fn(), measure: () => rect }), 'no-card');
  assert.deepEqual(gone, [], 'no card on the canvas: nothing moves');
});

test('wiring: the canvas turns the rect into a world box and centres it at the readable zoom; the card measures a resolved quote and refuses when its own scroller would move it', () => {
  const canvas = read('AdaptiveCanvas.jsx'), chip = read('SourceRefChip.jsx'), md = read('FileDocMarkdown.jsx'), refs = read('source-refs.js');
  assert.ok(canvas.includes("useSourceRefIndex(blocks, (id, options) => {"), 'the focus callback takes the options');
  assert.ok(canvas.includes('const box = options?.passage && surface.current ? toWorld(options.passage, surface.current.getBoundingClientRect(), viewRef.current) : null;'));
  assert.ok(canvas.includes('cameraRef.current = box ? { id, smooth: true, centre: true, focus: box, zoom: passageZoom(viewRef.current.z) } : { id, frame: true };'));
  assert.ok(canvas.includes('showBox(box, want.smooth, want.centre ?? true, want.zoom ?? null, want.focus ?? null)'), 'the consumer passes the focus box and the zoom');
  assert.ok(canvas.includes('const showBox = (box, smooth = false, centre = false, zoom = null, focus = null) => {') && canvas.includes('centerOnBox(box, current, within, focus)'));
  assert.ok(chip.includes('const stable = useCallback((id, options) => latest.current?.(id, options), []);'));
  assert.ok(refs.includes('const goTo = (focus, cardId, options) => focus?.(cardId, options);'));
  assert.ok(md.includes('if (asked) {') && md.includes('s.scrollHeight > s.clientHeight + 2)) return null;'), 'an inner scroll moves the passage after the camera: not measured');
}
);
