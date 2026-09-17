import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ellipsePoints, regionTargets } from '../src/region-targets.js';

const loop = (x, y, radius) => Array.from({ length: 41 }, (_, i) => ({ x: x + radius * Math.cos(i * Math.PI / 20), y: y + radius * Math.sin(i * Math.PI / 20) }));
const lesson = { runId: 'r1' };
const part = (id, kind, vertices, closed = false, objectId = id) => ({ id, meta: { objectId, kind, label: id, author: 'script', renderStatus: 'complete', runId: 'r1' }, vertices, closed });
const editor = shapes => ({
  getZoomLevel: () => 1, getCurrentPageShapes: () => shapes,
  getShapePageBounds: id => { const v = shapes.find(s => s.id === id).vertices; const x = Math.min(...v.map(p => p.x)), y = Math.min(...v.map(p => p.y)); return { x, y, w: Math.max(...v.map(p => p.x)) - x, h: Math.max(...v.map(p => p.y)) - y }; },
  getShapeGeometry: s => ({ getVertices: () => s.vertices, isClosed: s.closed }),
  getShapePageTransform: () => ({ applyToPoint: p => p }),
});
const dot = part('dot', 'point', loop(0, 0, 5), true, 'midpoint');
test('a single drag closes an ellipse in either direction', () => {
  for (const [start, end] of [[{x:-20,y:-20},{x:20,y:20}],[{x:20,y:20},{x:-20,y:-20}]]) {
    const points = ellipsePoints(start, end);
    assert.ok(Math.hypot(points[0].x-points.at(-1).x,points[0].y-points.at(-1).y) < 0.001);
    assert.equal(regionTargets(editor([dot]),lesson,points).candidates[0].objectId,'midpoint');
  }
});
test('a circle enclosing the midpoint prefers it over crossing axes and curve', () => {
  const curve = part('curve', 'curve', [{ x: -100, y: 100 }, { x: 0, y: 0 }, { x: 100, y: -100 }]);
  const axis = part('axis', 'axis', [{ x: 0, y: -100 }, { x: 0, y: 100 }]);
  assert.deepEqual(regionTargets(editor([dot, curve, axis]), lesson, loop(0, 0, 20)).candidates.map(c => c.objectId), ['midpoint']);
});
test('bounds alone do not select a distant curve', () => {
  const curve = part('curve', 'curve', [{ x: -100, y: -100 }, { x: 100, y: -100 }, { x: 100, y: 100 }]);
  assert.equal(regionTargets(editor([curve]), lesson, loop(0, 0, 20)).candidates.length, 0);
});
test('multiple enclosed objects stay ambiguous; shared semantic parts merge', () => {
  const label = part('label', 'annotation', loop(10, 0, 3), true, 'midpoint');
  const other = part('other', 'point', loop(-10, 0, 3), true);
  const found = regionTargets(editor([dot, label, other]), lesson, loop(0, 0, 30)).candidates;
  assert.equal(found.length, 2); assert.equal(found.find(c => c.objectId === 'midpoint').shapeIds.length, 2);
});
test('open loops, empty regions, moved and deleted objects are handled without guessing', () => {
  assert.match(regionTargets(editor([dot]), lesson, loop(0, 0, 30).slice(0, 20)).error, /Close/);
  assert.equal(regionTargets(editor([dot]), lesson, loop(200, 200, 30)).candidates.length, 0);
  assert.equal(regionTargets(editor([]), lesson, loop(0, 0, 30)).candidates.length, 0);
  const moved = { ...dot, vertices: dot.vertices.map(p => ({ x: p.x + 200, y: p.y + 200 })) };
  assert.equal(regionTargets(editor([moved]), lesson, loop(200, 200, 30)).candidates[0].objectId, 'midpoint');
});
