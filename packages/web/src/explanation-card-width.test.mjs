// The Explanation card's width follows its widest visual (explanation-card-width.js; owner 2026-11-08). Pure rule tests on real reference diagrams plus source reads of the wiring; no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CARD_CHROME, CARD_FLOOR, MAX_VISUAL_WIDTH, PICTURE_DISPLAY_WIDTH, TILE_FLOOR, diagramWidth, explanationCardWidth, tileWidthFor, widthFor } from './explanation-card-width.js';
import { isMinimized, tileWidth } from './explanation-minimize.js';
import { references as dataRefs } from './tutor-diagrams/ml-data-references.js';
import examples from './tutor-diagrams/examples.json' with { type: 'json' };

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const fence = spec => `\`\`\`rh-diagram\n${JSON.stringify(spec)}\n\`\`\``;
const PROSE = 'A short paragraph of prose.\n\nAnother short paragraph.';
const WIDE = dataRefs.find(r => r.id === 'bayes-class-token-counts').spec; // a teaching matrix: 707 px wide at the card's usual room
const ordinary = examples.find(e => (e.spec || e).diagram?.kind === 'flow');
const card = (body, extra = {}) => ({ id: 'c1', type: 'explanation', title: 'T', body, ...extra });
const picture = { id: 'p1', status: 'ready' };
const PICTURE_FENCE = '```rh-illustration\n{"version":1,"id":"p1","prompt":"a volcano","alt":"a volcano","caption":"look"}\n```';

test('a diagram reports its natural width; an ordinary one is 408, a dense one is wider; an invalid spec asks for no room', () => {
  assert.equal(diagramWidth(JSON.stringify(ordinary.spec || ordinary)), 408);
  assert.equal(diagramWidth(WIDE), 707);
  assert.equal(diagramWidth('{"not":"a diagram"}'), 0);
  assert.equal(diagramWidth('not json'), 0);
});

test('width rule: prose-only stays at the card\'s 440 (408 of room), a 700 px diagram is drawn whole (no horizontal scroll), a 1200 px one is capped at 960 and scrolls', () => {
  assert.equal(explanationCardWidth(card(PROSE)), CARD_FLOOR, 'prose only');
  assert.equal(explanationCardWidth(card(`${PROSE}\n\n${fence(ordinary.spec || ordinary)}\n\nMore.`)), CARD_FLOOR, 'an ordinary diagram fits the usual room');
  const wide = explanationCardWidth(card(`${PROSE}\n\n${fence(WIDE)}\n\nMore.`));
  assert.equal(wide, 707 + CARD_CHROME);
  assert.ok(wide - CARD_CHROME >= diagramWidth(WIDE), 'the room inside the card holds the whole diagram: no horizontal scroll');
  assert.equal(widthFor(700), 700 + CARD_CHROME);
  const huge = widthFor(1200);
  assert.equal(huge, MAX_VISUAL_WIDTH + CARD_CHROME, 'never wider than 960 of room');
  assert.ok(huge - CARD_CHROME < 1200, 'a 1200 px diagram still scrolls inside it, as before');
  assert.equal(explanationCardWidth({ type: 'quiz', body: 'x' }), undefined, 'only an Explanation');
  assert.equal(explanationCardWidth({ type: 'explanation' }), undefined, 'a pending card with no body keeps the type\'s own width');
});

test('a picture is displayed at 512 px: the card and its tile widen to fit it (544 + the 2 px border), the wider of picture and diagram wins', () => {
  assert.equal(PICTURE_DISPLAY_WIDTH, 512);
  const withPicture = card(`${PROSE}\n\n${PICTURE_FENCE}\n\nMore.`, { figures: { p1: picture } });
  assert.equal(explanationCardWidth(withPicture), PICTURE_DISPLAY_WIDTH + CARD_CHROME, 'room for the picture at 512 plus the card\'s chrome');
  assert.equal(explanationCardWidth(card(`${PROSE}\n\n${PICTURE_FENCE}`, { figures: { p1: { id: 'p1', status: 'failed' } } })), CARD_FLOOR, 'a picture that failed draws nothing and asks for nothing');
  const both = card(`${PICTURE_FENCE}\n\n${fence(WIDE)}`, { figures: { p1: picture } });
  assert.equal(explanationCardWidth(both), 707 + CARD_CHROME, 'a picture and a wider diagram: the wider');
  assert.equal(tileWidthFor({ kind: 'picture' }), PICTURE_DISPLAY_WIDTH + CARD_CHROME, 'its tile is the same width, the picture at 512');
  const src = read('./IllustrationFigure.jsx');
  assert.match(src, /style=\{\{ maxWidth: PICTURE_DISPLAY_WIDTH \}\} className=\{`mx-auto /, 'square at 512 and centred in any wider card');
});

test('the tile uses the same rule on its one visual and never scales it: a 707 px diagram is a 741 px tile, a picture tile is as wide as the picture card, Open restores the card at the same width', () => {
  const diagramCard = card(`${PROSE}\n\n${fence(WIDE)}\n\nMore.`, { w: 300, h: 500 });
  const tile = { ...diagramCard, minimized: true };
  assert.equal(isMinimized(tile), true);
  assert.equal(tileWidth(tile), 707 + CARD_CHROME, 'the diagram at its natural width inside the tile');
  assert.equal(tileWidth(tile), explanationCardWidth(diagramCard), 'the same function as the card');
  const pictureCard = card(`${PROSE}\n\n${PICTURE_FENCE}`, { figures: { p1: picture } });
  assert.equal(tileWidth({ ...pictureCard, minimized: true }), explanationCardWidth(pictureCard));
  assert.equal(tileWidth({ ...card(PROSE), minimized: true }), TILE_FLOOR, 'a tile with no visual keeps its 408');
  const opened = { ...tile, minimized: false };
  assert.equal(explanationCardWidth(opened), explanationCardWidth(diagramCard), 'Open restores the card at the same derived width');
  assert.equal(JSON.stringify(opened).includes('"width"'), false, 'width is derived on render, never stored on the card');
  const css = read('./index.css');
  assert.doesNotMatch(css, /data-explanation-tile\] \[data-tile-visual="diagram"\] svg \{ width: 100%/, 'no scaling down in the tile');
  assert.doesNotMatch(read('./explanation-minimize.js'), /TILE_WIDTH/, 'no fixed tile width');
});

test('the canvas takes the derived width: wider than its 560 column the card is centred, a dragged width still wins, and the stacked column keeps neighbours apart', () => {
  const canvas = read('./AdaptiveCanvas.jsx');
  assert.match(canvas, /const cardWidth = tile \? tileWidth\(block\) : sized\?\.width \?\? explanationCardWidth\(block\) \?\? BLOCK_TYPES\[block\.type\]\?\.width;/);
  assert.match(canvas, /width=\{cardWidth\} wide=\{cardWidth > COLUMN\}/, 'a card wider than the column is centred on it (self-center), as a wide slide is');
  assert.match(canvas, /const displayWidth = full \? [^;]*size\.w \|\| width;/, 'a saved (dragged) width wins over the derived one');
  assert.match(canvas, /<div ref=\{column\}[^>]*className=\{`absolute top-0 left-0 flex flex-col gap-5/, 'cards are stacked in one column: a wider card never lies over the cards above or below it');
  // The centred extents of a stack of cards at the derived widths never overlap horizontally with a neighbour's vertical band: stacked cards are separated by the 20 px gap in y.
  const COLUMN = 560, widths = [CARD_FLOOR, 707 + CARD_CHROME, PICTURE_DISPLAY_WIDTH + CARD_CHROME], heights = [300, 420, 380];
  let y = 0; const boxes = widths.map((w, i) => { const box = { x: (COLUMN - w) / 2, y, w, h: heights[i] }; y += heights[i] + 20; return box; });
  for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i].y >= boxes[i - 1].y + boxes[i - 1].h, `card ${i} starts below card ${i - 1}`);
});
