// CV-7: "Fit canvas" frames the cards, not a far-off text item; a board with no cards frames everything.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fitBoxes } from './canvas-view.js';

const card = { x: 4000, y: 4000, w: 560, h: 900 }, text = { x: 70, y: 5618, w: 300, h: 40 }, group = { x: 3980, y: 3980, w: 600, h: 960 };

test('CV-7: with a card on the board the fit frames the card and its group, never the text item', () => {
  assert.deepEqual(fitBoxes([card], [group], [text]), [card, group]);
  assert.ok(!fitBoxes([card], [], [text]).includes(text));
});

test('CV-7: a board with only text items, notes or marks is framed by them, as before', () => {
  assert.deepEqual(fitBoxes([], [], [text]), [text]);
  assert.deepEqual(fitBoxes([], [group], [text]), [group, text]);
  assert.deepEqual(fitBoxes([], [], []), []);
});

test('CV-7: the canvas hands its measured card boxes, group frames and the rest to fitBoxes', () => {
  const source = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(source, /import \{ fitBoxes[^}]*\} from '\.\/canvas-view\.js'/);
  assert.match(source, /const zoomFit = \(\) => frame\(fitBoxes\(Object\.values\(boundsRef\.current\), inlineScreenBoxes\('\[data-group-box\]'\), boxesOf\(\[\.\.\.shapesRef\.current, \.\.\.itemsRef\.current\]\.map\(entry => entry\.id\)\)\)\);/);
});

// CV-6: a board whose cards sit far from the top of the column opens on its first file card.
import { framesAnyBlock, firstViewTarget, topView } from './canvas-view.js';
const area = { left: 0, right: 1200, top: 60, bottom: 800 };

test('CV-6: framesAnyBlock is true only when a card is inside the visible world', () => {
  const home = { x: 320, y: 84, z: 1 }; // the opening camera: the top of the column
  assert.equal(framesAnyBlock(home, area, [{ x: 0, y: 0, w: 560, h: 900 }]), true);
  assert.equal(framesAnyBlock(home, area, [{ x: 4000, y: 4000, w: 560, h: 900 }]), false);
  assert.equal(framesAnyBlock(home, area, []), false);
});

test('CV-6: the first view targets the first file card, else the first card in reading order', () => {
  const blocks = [{ id: 'a', type: 'explanation' }, { id: 'm', type: 'file' }, { id: 'b', type: 'explanation' }];
  const bounds = { a: { x: 2000, y: 900, w: 500, h: 800 }, m: { x: 84, y: 7000, w: 699, h: 10486 }, b: { x: 1000, y: 100, w: 500, h: 800 } };
  assert.equal(firstViewTarget(blocks, bounds), bounds.m);
  assert.equal(firstViewTarget(blocks.filter(block => block.type !== 'file'), bounds), bounds.b);
  assert.equal(firstViewTarget([{ id: 'z', type: 'explanation' }], {}), null);
});

test('CV-6: topView shows the top of the card at a legible zoom (at least 0.5), centred, never zoomed out to fit a tall card', () => {
  const markdown = { x: 84, y: 7000, w: 699, h: 10486 };
  const view = topView(markdown, area);
  assert.ok(view.z >= 0.5 && view.z <= 1, `zoom ${view.z}`);
  assert.equal(view.z, 1, 'a 699 px card fits the 1200 px room at zoom 1');
  assert.ok(Math.abs(view.y + markdown.y * view.z - (area.top + 48)) < 1e-9, 'the card top sits one pad below the top of the area');
  assert.ok(framesAnyBlock(view, area, [markdown]));
  const wide = topView({ x: 0, y: 0, w: 4000, h: 500 }, area);
  assert.equal(wide.z, 0.5, 'a very wide card is held at the zoom floor');
  assert.ok(wide.x === area.left, 'and framed from its left edge');
});

test('CV-6: the canvas opens on the first view once, only while the learner has not moved the camera, and not on a shared program lead', () => {
  const source = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  const effect = source.slice(source.indexOf('const firstViewDone = useRef(false);'), source.indexOf('}, [bounds]); // eslint-disable-line react-hooks/exhaustive-deps', source.indexOf('const firstViewDone')));
  assert.ok(effect.includes('firstViewDone.current = true'));
  assert.ok(effect.includes('manualMoves.current !== openedAt.current'));
  assert.ok(effect.includes('opening.current && blocksRef.current[0]?.program'));
  assert.ok(effect.includes('framesAnyBlock(viewRef.current, area, boxes)'));
  assert.ok(effect.includes('setView(autoView.current = topView(target, area))'));
});
