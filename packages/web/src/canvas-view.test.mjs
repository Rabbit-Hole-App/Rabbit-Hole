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
