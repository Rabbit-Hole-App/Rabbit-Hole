import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapMove, snapGrid, GRID } from './learn-snap.js';

const box = (x, y, w = 100, h = 50) => ({ x, y, w, h });

test('nothing to align against leaves the drag alone', () => {
  const result = snapMove(box(37, 91), []);
  assert.deepEqual([result.x, result.y], [37, 91]);
  assert.deepEqual(result.lines, []);
});

// Narrower than the other box, so only the left edges are in reach.
test('a near-miss on the left edge snaps flush and draws one guide', () => {
  const result = snapMove(box(104, 300, 60, 50), [box(100, 100, 100, 50)]);
  assert.equal(result.x, 100);
  assert.equal(result.y, 300); // untouched: the other box is far above
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0].axis, 'x');
  assert.equal(result.lines[0].at, 100);
});

test('past the tolerance nothing moves', () => {
  const result = snapMove(box(120, 300), [box(100, 100)], 6);
  assert.equal(result.x, 120);
  assert.deepEqual(result.lines, []);
});

test('centres align to centres - the "put it in the middle" case', () => {
  // other spans 100..200, centre 150. moving is 80 wide, so centre lands at x+40.
  const result = snapMove(box(107, 400, 80, 50), [box(100, 100, 100, 50)]);
  assert.equal(result.x + 40, 150);
  assert.equal(result.lines[0].at, 150);
});

// Two boxes of the same width sitting a few pixels apart match on left, centre
// AND right at once, all by the same distance. They land in the same place
// whichever wins, so the only observable difference is which guide gets drawn -
// and it should be the centre, because that is the one being asked for.
test('when every alignment ties, the guide drawn is the centre', () => {
  const result = snapMove(box(104, 400, 100, 50), [box(100, 100, 100, 50)]);
  assert.equal(result.x, 100, 'all three agree on where it lands');
  assert.equal(result.lines[0].at, 150, 'centre line, not the left edge at 100');
});

test('both axes can snap at once, one guide each', () => {
  const result = snapMove(box(103, 204), [box(100, 200)]);
  assert.deepEqual([result.x, result.y], [100, 200]);
  assert.deepEqual(result.lines.map(line => line.axis).sort(), ['x', 'y']);
});

test('a guide spans from the dragged box to the one it matched', () => {
  const result = snapMove(box(103, 500, 100, 50), [box(100, 100, 100, 50)]);
  const guide = result.lines[0];
  assert.equal(guide.from, 100);  // top of the higher box
  assert.equal(guide.to, 550);    // bottom of the lower one
});

test('the nearest of several candidates wins', () => {
  const result = snapMove(box(104, 900), [box(100, 100), box(106, 100)]);
  assert.equal(result.x, 106, 'two away beats four away');
});

test('right edge meets left edge, so shapes can sit shoulder to shoulder', () => {
  // moving right edge at 198; other left edge at 200.
  const result = snapMove(box(98, 900, 100, 50), [box(200, 100, 100, 50)]);
  assert.equal(result.x + 100, 200);
});

test('grid rounds both axes to the dot spacing', () => {
  assert.deepEqual(snapGrid(20, 20, 18), { x: 18, y: 18, lines: [] });
  assert.deepEqual(snapGrid(27, 0, 18), { x: 36, y: 0, lines: [] });
  assert.deepEqual(snapGrid(-4, -14, 18), { x: -0, y: -18, lines: [] });
});

test('the grid step matches the dots already drawn in index.css', () => {
  assert.equal(GRID, 18);
});
