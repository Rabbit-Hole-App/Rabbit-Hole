// A7 placement (docs/features/inline-ai-editor.md): one placer, fed by every kind of thing on the board, never on top
// of anything. Pure: the canvas hands obstaclesOf its measured boxes, sampled connector paths, group frames, areas and
// comment pins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as apply from './inline-ai-apply.js';

const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const size = { w: 260, h: 120 };
const target = { x: 400, y: 300, w: 64, h: 64 };
const line = (id, from, to) => ({ id, points: Array.from({ length: 21 }, (_, i) => ({ x: from.x + ((to.x - from.x) * i) / 20, y: from.y + ((to.y - from.y) * i) / 20 })) });
// A crowded board: one of every kind around the target, each where the placer would otherwise like to go.
const crowd = {
  boxes: [
    { id: 'card', x: 520, y: 220, w: 300, h: 220 }, // a card to the right
    { id: 'shape', x: 100, y: 280, w: 200, h: 120 }, // a shape to the left
    { id: 'sticky', x: 360, y: 420, w: 160, h: 160 }, // a sticky below
    { id: 'text', x: 330, y: 160, w: 220, h: 30 }, // a text box above
    { id: 'ink', x: 860, y: 260, w: 120, h: 120 }, // an ink stroke further right
  ],
  paths: [line('link', { x: 300, y: 500 }, { x: 900, y: 600 })], // a connector across the lower right
  frames: [{ id: 'group', x: 40, y: 40, w: 300, h: 180 }], // a group frame up and left
  areas: [{ id: 'area', x: 560, y: 40, w: 300, h: 150 }], // an area up and right
  pins: [{ x: 200, y: 460, w: 28, h: 28 }], // a comment pin lower left
};
const kinds = obstacles => obstacles.map(box => ({ ...box }));

test('A7: on a crowded board with every kind of object, the placed box touches none of them, nor the target', () => {
  const obstacles = apply.obstaclesOf(crowd, ['target']);
  const spot = apply.placeNote(target, size, kinds(obstacles), { x: 0, y: 0, w: 1400, h: 900 });
  const box = { x: spot.x, y: spot.y, ...size };
  for (const obstacle of obstacles) assert.equal(hit(box, obstacle), false, `overlaps ${JSON.stringify(obstacle)}`);
  assert.equal(hit(box, target), false);
  // Every kind really is an obstacle: the connector, frame, area and pin each became boxes.
  assert.ok(obstacles.some(entry => entry.id === 'link') && obstacles.some(entry => entry.id === 'group') && obstacles.some(entry => entry.id === 'area'));
  assert.equal(obstacles.length, crowd.boxes.length + 21 + 1 + 1 + 1);
});

test('A7: with no free spot in the rings, the box goes past everything, still free - never on top of anything', () => {
  const wall = [];
  for (let x = -2000; x <= 2000; x += 200) for (let y = -2000; y <= 2000; y += 200) if (!hit({ x, y, w: 180, h: 180 }, { x: target.x - 20, y: target.y - 20, w: target.w + 40, h: target.h + 40 })) wall.push({ x, y, w: 180, h: 180 });
  const spot = apply.placeNote(target, size, wall, { x: 0, y: 0, w: 1400, h: 900 });
  const box = { x: spot.x, y: spot.y, ...size };
  assert.equal(wall.some(obstacle => hit(box, obstacle)), false);
  assert.equal(spot.offscreen, true, 'the only free spot is off-screen: the caller pans to it');
});

test('A7: a selection at the edge of what the learner sees is placed inside the view on the open side', () => {
  const edge = { x: 1300, y: 300, w: 64, h: 64 };
  const spot = apply.placeNote(edge, size, [], { x: 0, y: 0, w: 1400, h: 900 });
  assert.equal(spot.offscreen, false);
  assert.notEqual(spot.side, 'right', 'not off the right edge');
});

test('A7: a lone connector is placed clear of its path and of both ends', () => {
  const a = { id: 'a', x: 100, y: 100, w: 80, h: 80 }, b = { id: 'b', x: 500, y: 100, w: 80, h: 80 };
  const path = line('l1', { x: 180, y: 140 }, { x: 500, y: 140 });
  const mid = { x: 339, y: 139, w: 2, h: 2 };
  const obstacles = apply.obstaclesOf({ boxes: [a, b], paths: [path] }, ['l1']);
  const spot = apply.placeNote(mid, size, [...obstacles, ...apply.obstaclesOf({ paths: [path] })], { x: 0, y: 0, w: 1400, h: 900 });
  const box = { x: spot.x, y: spot.y, ...size };
  for (const obstacle of [a, b, ...apply.obstaclesOf({ paths: [path] })]) assert.equal(hit(box, obstacle), false);
});

test('A7: the edit ghost diff keeps same words and marks removed and added ones', () => {
  assert.deepEqual(apply.wordDiff('bottom row extra words', 'bottom row extra WORDS'), [{ kind: 'same', t: 'bottom row extra ' }, { kind: 'del', t: 'words' }, { kind: 'add', t: 'WORDS' }]);
  assert.deepEqual(apply.wordDiff('one two', 'one two three'), [{ kind: 'same', t: 'one two ' }, { kind: 'add', t: 'three' }]);
  const parts = apply.wordDiff('s =+ x and retrun s', 's += x and return s');
  assert.equal(parts.filter(part => part.kind === 'del').map(part => part.t.trim()).join(','), '=+,retrun');
  assert.equal(parts.filter(part => part.kind === 'add').map(part => part.t.trim()).join(','), '+=,return');
  assert.equal(parts.filter(part => part.kind !== 'del').map(part => part.t).join(''), 's += x and return s', 'same and added words make the new text');
});
