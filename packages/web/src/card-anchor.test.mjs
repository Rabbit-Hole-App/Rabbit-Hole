// BUG 3 (canvas-cards): a dragged card is anchored; a card inserted above it moves the column, never the card. Pure rules on boxes; no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dragged, flowPlace, holdAnchors } from './card-anchor.js';

// The column as the canvas measures it: each card's drawn box is its flow place plus its offsets. Cards 560 wide, 300 tall, a 20 px gap.
const column = blocks => { let y = 0; return Object.fromEntries(blocks.map(block => { const box = { x: 100 + (block.dx || 0), y: y + (block.dy || 0), w: 560, h: 300 }; y += 320; return [block.id, box]; })); };
const apply = (blocks, moves) => blocks.map(block => (moves.has(block.id) ? { ...block, ...moves.get(block.id) } : block));
const A = { id: 'A', dx: 0, dy: 0 }, B = { id: 'B', dx: 0, dy: 0 }, C = { id: 'C', dx: 0, dy: 0 };

test('dragging sets the world position it puts the card at', () => {
  const blocks = [A, B, C], bounds = column(blocks);
  const moved = dragged(B, bounds.B, 150, -40);
  assert.deepEqual([moved.dx, moved.dy, moved.at], [150, -40, { x: 100 + 150, y: 320 - 40 }]);
  assert.equal(dragged(B, undefined, 5, 6).at, undefined, 'an unmeasured card is not anchored');
  assert.deepEqual(flowPlace(bounds.B, B), { x: 100, y: 320 });
});

test('the screenshot case: a card inserted above an arranged card does not move it; an unmoved card still moves with the column', () => {
  let blocks = [A, dragged(B, column([A, B, C]).B, 150, -40), C];
  const seen = new Map();
  assert.equal(holdAnchors(blocks, column(blocks), seen).size, 0, 'the first measure only records');
  const worldB = column(blocks).B;
  const N = { id: 'N', dx: 0, dy: 0 };
  blocks = [N, ...blocks]; // a new card at the view index, above everything: the whole column shifts down by one card
  const after = column(blocks);
  assert.notDeepEqual(after.B, worldB, 'reproduction: with no anchor the arranged card follows the column');
  const moves = holdAnchors(blocks, after, seen);
  assert.deepEqual([...moves.keys()], ['B'], 'only the anchored card is re-offset; A and C, never dragged, move with the column as before');
  blocks = apply(blocks, moves);
  assert.deepEqual(column(blocks).B, worldB, 'the arranged card is where the learner left it');
  assert.deepEqual(blocks.find(block => block.id === 'B').at, { x: worldB.x, y: worldB.y });
  assert.equal(holdAnchors(blocks, column(blocks), seen).size, 0, 'settled: a later measure changes nothing');
});

test('a card growing above, a removed card above, and two arranged cards at once all leave arranged cards in place', () => {
  const Bd = dragged(B, column([A, B, C]).B, 30, 70), Cd = dragged(C, column([A, B, C]).C, -20, 10);
  let blocks = [A, Bd, Cd]; const seen = new Map();
  holdAnchors(blocks, column(blocks), seen);
  const world = column(blocks);
  const settle = () => { blocks = apply(blocks, holdAnchors(blocks, column(blocks), seen)); assert.equal(holdAnchors(blocks, column(blocks), seen).size, 0, 'the measure after the re-offset records and changes nothing'); };
  blocks = [{ ...A, id: 'A2' }, ...blocks]; // another card above
  settle();
  assert.deepEqual([column(blocks).B, column(blocks).C], [world.B, world.C]);
  blocks = blocks.filter(block => block.id !== 'A2'); // and removed again
  settle();
  assert.deepEqual([column(blocks).B, column(blocks).C], [world.B, world.C]);
});

test('a card the learner keeps dragging is not fought: an offset that changed is a move, not the column moving', () => {
  let blocks = [A, dragged(B, column([A, B, C]).B, 10, 10), C]; const seen = new Map();
  holdAnchors(blocks, column(blocks), seen);
  blocks = blocks.map(block => (block.id === 'B' ? { ...block, dx: 60, dy: 50 } : block));
  assert.equal(holdAnchors(blocks, column(blocks), seen).size, 0, 'dragging B changes its offsets, so nothing is re-offset');
});

test('a board saved before this loads unchanged: no `at`, so nothing is held and nothing is recorded', () => {
  const blocks = [A, { ...B, dx: 40, dy: 25 }, C], seen = new Map();
  assert.equal(holdAnchors(blocks, column(blocks), seen).size, 0);
  assert.equal(seen.size, 0);
  const shifted = [{ id: 'N', dx: 0, dy: 0 }, ...blocks];
  assert.equal(holdAnchors(shifted, column(shifted), seen).size, 0, 'a never-dragged card keeps the column behaviour');
});

// CV-3 on the stacked canvas (CV-4/5/8): reload keeps the anchor, the layout field lists carry `at`, and the canvas wires the two functions.
import { readFileSync } from 'node:fs';

test('reload: an anchored card saved with the board (JSON round trip) is held on the next load and the next insertion above it', () => {
  let blocks = [A, dragged(B, column([A, B, C]).B, 150, -40), C];
  const worldB = column(blocks).B;
  blocks = JSON.parse(JSON.stringify(blocks)); // the board saved and loaded again: a fresh `seen`
  assert.deepEqual(blocks[1].at, { x: worldB.x, y: worldB.y });
  const seen = new Map();
  assert.equal(holdAnchors(blocks, column(blocks), seen).size, 0, 'the loaded board is not moved');
  blocks = [{ id: 'N', dx: 0, dy: 0 }, ...blocks];
  blocks = apply(blocks, holdAnchors(blocks, column(blocks), seen));
  assert.deepEqual(column(blocks).B, worldB);
});

test('CV-3 with a CV-5 slot and a CV-4 beside card: the anchor reads only the flow place, so a resized (slotted) card and a never-dragged beside card behave as before', () => {
  const slotted = { id: 'S', dx: 0, dy: 0, cardLayout: { mode: 'full', slot: { w: 560, h: 300 } } }, beside = { id: 'T', dx: 700, dy: 20 };
  let blocks = [A, slotted, beside, dragged(B, column([A, slotted, beside, B]).B, 90, 10)];
  const seen = new Map();
  holdAnchors(blocks, column(blocks), seen);
  const before = column(blocks);
  blocks = [{ id: 'N', dx: 0, dy: 0 }, ...blocks];
  blocks = apply(blocks, holdAnchors(blocks, column(blocks), seen));
  assert.deepEqual(column(blocks).B, before.B, 'the dragged card stays');
  assert.notDeepEqual(column(blocks).T, before.T, 'a never-dragged beside card still moves with the column (it is not anchored until the learner drags it)');
  assert.notDeepEqual(column(blocks).S, before.S);
});

test('the layout lists that decide what is content carry `at`, and the canvas wires dragged and holdAnchors', () => {
  for (const file of ['area-crop.js', 'explain-client.js', 'explain-inputs.js', 'inline-ai-context.js']) {
    assert.match(readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'), /'dy', 'at', /, `${file} lists at as layout`);
  }
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.ok(canvas.includes("import { dragged, holdAnchors } from './card-anchor.js';"));
  assert.ok(canvas.includes('dragged(block, boundsRef.current[id], dx, dy)'));
  assert.ok(canvas.includes('holdAnchors(blocksRef.current, bounds, anchorSeen.current)'));
});
