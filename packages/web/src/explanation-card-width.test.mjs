// The Explanation card's width follows its widest visual (explanation-card-width.js; owner 2026-11-08). Pure rule tests on real reference diagrams plus source reads of the wiring; no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CARD_CHROME, CARD_FLOOR, MAX_VISUAL_WIDTH, PICTURE_DISPLAY_WIDTH, TILE_FLOOR, diagramWidth, explanationCardWidth, tileWidthFor, widthFor } from './explanation-card-width.js';
import { naturalSize, renderTutorDiagram } from './tutor-diagrams/TutorDiagram.js';
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

// BUG 1 (canvas-cards): the card is sized from its visual. The layouts keep their height whatever the room, so the coordinate plot (a fixed 240 px plot area) drawn in 408
// is portrait; naturalSize measures it at the 4:3 room (capped at the card's widest ordinary room), every other kind at the room its own layout asks for.
const gallery = JSON.parse(read('./tutor-diagrams/kind-gallery.json'));
const plot = gallery.find(e => e.diagram.kind === 'coordinate-plot');
test('a coordinate plot is drawn landscape: its natural size is 4:3 of its height, capped; a flow keeps the 440 card; the width follows the layout, not a table', () => {
  const asked = naturalSize(plot, 408, 686), alone = renderTutorDiagram(plot, 408);
  assert.equal(alone.height, asked.height, 'the layout keeps its height at any room');
  assert.equal(asked.width, Math.ceil(alone.height * 4 / 3), 'a portrait plot is measured at the room that makes it 4:3');
  assert.ok(asked.width > alone.width && asked.width <= 686);
  assert.equal(naturalSize(plot, 408, 500).width, alone.width, 'a cap below the 4:3 room leaves it as drawn');
  const card686 = explanationCardWidth(card(`${PROSE}\n\n${fence(plot)}\n\nMore.`));
  assert.equal(card686, asked.width + CARD_CHROME, 'the Explanation card is the plot plus the card chrome');
  assert.ok(card686 <= 720, 'never above the card preferred width for this rule (FULL_WIDTH.preferred)');
  assert.equal(naturalSize(ordinary.spec || ordinary).width, 408, 'a flow asks for no more room than it has');
  assert.equal(diagramWidth(plot), alone.width, 'the tile keeps measuring at the usual room: the plot rule is the card\'s');
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

// CV-1: a newly generated Explanation opens in Full layout (card-layout.js fullLength), whose width is fixed at that moment: it must be the width the card's visual asks for, not the type's 440.
import { fullLength } from './card-layout.js';
test('a new Explanation with a plot opens at the plot\'s card width, not 440; one without a visual keeps 440', () => {
  const withPlot = card(`${PROSE}\n\n${fence(plot)}\n\nMore.`), prose = card(PROSE);
  assert.equal(fullLength(withPlot, explanationCardWidth(withPlot) ?? 440).cardLayout.fullWidth, explanationCardWidth(withPlot));
  assert.ok(explanationCardWidth(withPlot) > 440);
  assert.equal(fullLength(prose, explanationCardWidth(prose) ?? 440).cardLayout.fullWidth, 440);
  assert.match(read('./AdaptiveCanvas.jsx'), /added = openedExplanation\(added\);/, 'the canvas opens it through the one helper, which passes the derived width');
});

// CV-8: a new Explanation opens whole (a Full layout, no 520 px cap, the visual's width) from EVERY origin: a typed command, Ctrl+K, the Tutor (placeRoadmapCard), a chat answer
// (insertBlock without fit, insertImported). placeExplain places only v2 /explain job cards, which are 'animation' blocks (scene or program), never an Explanation, and has no 520 cap.
import { openedExplanation } from './explanation-card-width.js';
test('openedExplanation: every new Explanation opens in Full layout at its visual\'s width; anchors, excerpts, other types and cards that already have a layout are untouched', () => {
  const plotCard = card(`${PROSE}\n\n${fence(plot)}\n\nMore.`), prose = card(PROSE);
  const opened = openedExplanation(plotCard);
  assert.equal(opened.cardLayout.mode, 'full', 'a Full layout: the type\'s 520 px autoMax (a card with no layout) never applies');
  assert.equal(opened.cardLayout.fullWidth, explanationCardWidth(plotCard), 'and the width its plot asks for');
  assert.equal(openedExplanation(prose).cardLayout.fullWidth, CARD_FLOOR, 'prose only: the usual 440');
  const saved = { ...plotCard, cardLayout: { mode: 'scrollable', scrollableSize: { w: 500, h: 400 }, fullWidth: 500, slot: { w: 500, h: 400 } } };
  assert.equal(openedExplanation(saved), saved, 'a card that already has a layout is untouched');
  const animation = { id: 'a', type: 'animation', explainJob: { id: 'j' } };
  assert.equal(openedExplanation(animation), animation, 'an /explain v2 job card (placeExplain) is an animation: not an Explanation, untouched');
  const anchor = { ...prose, anchor: { source: 'shared' } }, excerpt = { ...prose, excerpt: { id: 'x', kind: 'text', page: 1 } };
  assert.equal(openedExplanation(anchor), anchor, 'a topic anchor keeps its shape');
  assert.equal(openedExplanation(excerpt), excerpt, 'a PDF excerpt keeps its shape');
  const canvas = read('./AdaptiveCanvas.jsx');
  assert.equal(canvas.match(/openedExplanation\(/g).length, 3, 'insertBlock, insertImported (no saved size) and placeRoadmapCard use it');
  assert.match(canvas, /placeRoadmapCard: [\s\S]{0,700}openedExplanation\(\{ \.\.\.block, dx: 0, dy: 0 \}\)/, 'the Tutor-made card is opened whole');
});
