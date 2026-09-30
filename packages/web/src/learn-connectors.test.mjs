import test from 'node:test';
import assert from 'node:assert/strict';
import { sidePoint, nearestSide, shapeBox, elbowPoints, routePath, polylineMid, freeElbow } from './learn-connectors.js';

const box = { x: 0, y: 0, w: 100, h: 60 };

test('each side has a port at its middle', () => {
  assert.deepEqual(sidePoint(box, 'top'), { x: 50, y: 0 });
  assert.deepEqual(sidePoint(box, 'right'), { x: 100, y: 30 });
  assert.deepEqual(sidePoint(box, 'bottom'), { x: 50, y: 60 });
  assert.deepEqual(sidePoint(box, 'left'), { x: 0, y: 30 });
  assert.deepEqual(shapeBox({ x1: 100, y1: 60, x2: 0, y2: 0 }), box);
});

test('a click lands on the side facing it', () => {
  assert.equal(nearestSide(box, { x: 300, y: 35 }), 'right');
  assert.equal(nearestSide(box, { x: 45, y: -80 }), 'top');
});

test('elbow routes only turn at right angles and leave and enter through the ports', () => {
  const cases = [['right', 'left', { x: 300, y: 200 }], ['bottom', 'top', { x: 250, y: 300 }], ['right', 'top', { x: 300, y: 200 }], ['bottom', 'left', { x: 300, y: 200 }]];
  for (const [aSide, bSide, b] of cases) {
    const a = sidePoint(box, aSide);
    const points = elbowPoints(a, aSide, b, bSide);
    assert.deepEqual(points[0], a);
    assert.deepEqual(points[points.length - 1], b);
    for (let i = 1; i < points.length; i += 1) assert.ok(points[i].x === points[i - 1].x || points[i].y === points[i - 1].y, `${aSide}->${bSide} segment ${i} is diagonal`);
  }
  // it leaves the right port going right, and enters the left port from the left
  const [a, out] = elbowPoints({ x: 100, y: 30 }, 'right', { x: 300, y: 200 }, 'left');
  assert.ok(out.x > a.x && out.y === a.y);
});

test('every route has a middle for its label and an arrowhead direction', () => {
  const a = { x: 0, y: 0 }, b = { x: 200, y: 0 };
  assert.deepEqual(routePath(a, 'right', b, 'left', 'straight').mid, { x: 100, y: 0 });
  assert.deepEqual(routePath(a, 'right', b, 'left', 'curved').mid, { x: 100, y: 0 });
  const elbow = routePath(a, 'right', { x: 200, y: 100 }, 'left', 'elbow');
  assert.match(elbow.d, /^M0 0 L24 0/);
  assert.ok(elbow.from.x < 200, 'the arrowhead points into the target from the left');
  // a loose end (while dragging) still routes
  assert.match(routePath(a, 'bottom', { x: 50, y: 300 }, null, 'elbow').d, /^M0 0 L0 24/);
});

test('polylineMid is halfway by length', () => {
  assert.deepEqual(polylineMid([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 30 }]), { x: 10, y: 10 });
});

test('a drawn elbow arrow runs across, down, across', () => {
  assert.deepEqual(freeElbow({ x1: 0, y1: 0, x2: 100, y2: 50 }), [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 50 }]);
});

test('an elbow to a shape behind its port detours instead of crossing either shape', () => {
  const inside = (p, b) => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;
  // every segment sampled, so a run straight through a box is caught
  const crosses = (points, b) => points.slice(1).some((q, i) => [0.25, 0.5, 0.75].some(t => inside({ x: points[i].x + (q.x - points[i].x) * t, y: points[i].y + (q.y - points[i].y) * t }, b)));
  const source = { x: 0, y: 0, w: 100, h: 60 };
  const target = { x: 300, y: -200, w: 100, h: 60 };
  const points = elbowPoints(sidePoint(source, 'bottom'), 'bottom', sidePoint(target, 'top'), 'top');
  assert.ok(!crosses(points, source) && !crosses(points, target), JSON.stringify(points));
  const same = elbowPoints(sidePoint(source, 'bottom'), 'bottom', sidePoint(target, 'bottom'), 'bottom');
  assert.ok(!crosses(same, source) && !crosses(same, target), JSON.stringify(same));
  // mixed sides: out of the bottom, into the left of a shape up and to the right
  const mixed = elbowPoints(sidePoint(source, 'bottom'), 'bottom', sidePoint(target, 'left'), 'left');
  assert.ok(!crosses(mixed, source) && !crosses(mixed, target), JSON.stringify(mixed));
  const across = elbowPoints(sidePoint(source, 'right'), 'right', sidePoint({ x: -300, y: 200, w: 100, h: 60 }, 'top'), 'top');
  assert.ok(!crosses(across, source), JSON.stringify(across));
});
