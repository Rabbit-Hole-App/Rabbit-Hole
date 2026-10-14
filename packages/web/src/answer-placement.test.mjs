// Answers about a selected card (since 1f626264 an ordinary chat card, linked to its card): each lands in free space
// beside its card, over no card and no other answer (selected-pill-check's owner loop once stacked twelve on one spot).
// Pure: placeAnswers, the inline editor's placer (placeNote) over the canvas's obstacles (obstaclesOf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { obstaclesOf, placeAnswers } from './inline-ai-apply.js';

const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
// A column of twelve cards, 640 wide, 20 apart, as the canvas lays them out.
const cards = Array.from({ length: 12 }, (_, i) => ({ id: `card-${i}`, x: 0, y: i * 260, w: 640, h: 240 }));
const size = { w: 380, h: 180 };
// Before it is placed, an answer sits in the column flow at the top, over the first card: that box is not an obstacle.
const answer = (i, card) => ({ id: `answer-${i}`, target: card, size, ignore: [card.id] });
const flow = i => ({ id: `answer-${i}`, x: 130, y: 0, ...size });
const clear = (spots, obstacles) => {
  const placed = spots.map(spot => ({ x: spot.x, y: spot.y, ...size }));
  placed.forEach((box, i) => {
    for (const other of obstacles) assert.ok(!hit(box, other), `answer ${i} over ${other.id}`);
    placed.forEach((other, j) => assert.ok(j === i || !hit(box, other), `answer ${i} over answer ${j}`));
  });
  return placed;
};

test('twelve answers in one pass, one per card: none over a card or another answer, each beside its card', () => {
  const spots = placeAnswers(cards.map((card, i) => answer(i, card)), obstaclesOf({ boxes: [...cards, ...cards.map((_, i) => flow(i))] }));
  clear(spots, cards).forEach((box, i) => {
    const card = cards[i];
    assert.ok(Math.abs(box.y + box.h / 2 - (card.y + card.h / 2)) < 400 && Math.abs(box.x - (card.x + card.w)) < 400, `answer ${i} beside its card: ${JSON.stringify(box)}`);
  });
});

test('twelve answers about the same card: twelve free spots', () => {
  const card = cards[5];
  clear(placeAnswers(cards.map((_, i) => answer(i, card)), cards), cards);
});

test('one answer per pass, the earlier answers measured where they were placed: still no overlap', () => {
  const board = [...cards];
  const spots = [];
  for (let i = 0; i < 12; i++) {
    const [spot] = placeAnswers([answer(i, cards[i % 3])], obstaclesOf({ boxes: [...board, flow(i)] }));
    spots.push(spot);
    board.push({ id: `answer-${i}`, x: spot.x, y: spot.y, ...size });
  }
  clear(spots, cards);
});

test('the connector runs between the facing sides: card side first, answer side second', () => {
  const [spot] = placeAnswers([answer(0, cards[0])], cards);
  assert.equal(spot.side, 'right');
  assert.deepEqual(spot.sides, ['right', 'left']);
});
