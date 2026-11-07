import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { parseFrame } from './contract.js';
import { normalizeFrame } from './frame.js';
import { SDK_SOURCE } from './sdk.js';
import { GRAPH_SOURCE } from './sdk-graph.js';

// Only the trusted SDK and our test-owned data execute here.
const sdk = runInNewContext(`${SDK_SOURCE}\n${GRAPH_SOURCE}\nsdk`);
const bounds = { x: 20, y: 30, w: 620, h: 370 };
const nodes = [
  { id: 'pick', label: 'Is it cached?', role: 'input' },
  { id: 'read', label: 'Read source' },
  { id: 'store', label: 'Store result' },
  { id: 'done', label: 'Return result', role: 'success' },
];
const edges = [
  { from: 'pick', to: 'read', label: 'No' },
  { from: 'read', to: 'store' },
  { from: 'store', to: 'done' },
  { from: 'pick', to: 'done', label: 'Yes' },
];
const graph = { ...bounds, nodes, edges };
const draw = (config = graph) => JSON.parse(JSON.stringify(sdk.graph('cache', config)));

function crossed([x1, y1], [x2, y2], box) {
  assert.ok(x1 === x2 || y1 === y2, 'each segment is orthogonal');
  return x1 === x2
    ? x1 > box.x && x1 < box.x + box.w && Math.max(y1, y2) > box.y && Math.min(y1, y2) < box.y + box.h
    : y1 > box.y && y1 < box.y + box.h && Math.max(x1, x2) > box.x && Math.min(x1, x2) < box.x + box.w;
}

test('graph returns a contract-safe layered DAG, with labeled arrows and a skip path around the middle boxes', () => {
  const objects = draw();
  const frame = { width: 680, height: 430, objects };
  assert.equal(parseFrame(frame).ok, true);
  const normalized = normalizeFrame(frame);
  assert.equal(normalized.ok, true, normalized.issue);
  const boxes = objects.filter(object => object.kind === 'box');
  assert.equal(boxes.length, 4);
  assert.deepEqual(objects.filter(object => object.kind === 'text').map(object => object.text), ['No', 'Yes']);
  assert.equal(objects.filter(object => object.kind === 'arrow').length, 4);
  assert.ok(boxes[0].y < boxes[1].y && boxes[1].y < boxes[2].y && boxes[2].y < boxes[3].y);
  assert.ok(objects.length <= 60 && objects.every(object => object.id.startsWith('cache.')));
  for (const object of objects) {
    const points = object.kind === 'arrow'
      ? [[object.from.x, object.from.y], [object.to.x, object.to.y]]
      : object.kind === 'polyline' ? object.points : [];
    for (const [i, point] of points.entries()) {
      assert.ok(point[0] >= bounds.x && point[0] <= bounds.x + bounds.w);
      assert.ok(point[1] >= bounds.y && point[1] <= bounds.y + bounds.h);
      if (i) for (const box of boxes) assert.equal(crossed(points[i - 1], point, box), false, `${object.id} crosses ${box.id}`);
    }
  }
});

test('active paths highlight an edge only when both endpoints are active, with stable IDs and geometry', () => {
  const full = draw();
  const hit = draw({ ...graph, active: ['pick', 'done'] });
  const miss = draw({ ...graph, active: ['pick', 'read', 'store', 'done'] });
  const geometry = objects => objects.map(({ opacity, role, ...object }) => object);
  assert.deepEqual(geometry(hit), geometry(full));
  assert.deepEqual(geometry(miss), geometry(full));
  const arrows = objects => objects.filter(object => object.kind === 'arrow');
  assert.equal(arrows(hit).filter(object => object.opacity === 1).length, 1);
  assert.equal(arrows(miss).filter(object => object.opacity === 1).length, 4);
  assert.equal(arrows(hit).find(object => object.id.includes('pick:done')).role, 'learner');
  assert.ok(arrows(hit).filter(object => object.opacity < 1).every(object => object.role === 'neutral' && object.opacity >= 0.72));
  assert.ok(hit.filter(object => object.text).every(object => (object.opacity ?? 1) === 1), 'all branch and node text stays legible');
});

test('graph rejects malformed endpoints, IDs, cycles, unknown roles and active nodes', () => {
  assert.throws(() => draw({ ...graph, edges: [{ from: 'pick', to: 'missing' }] }), /unknown node/);
  assert.throws(() => draw({ ...graph, edges: [{ from: 'pick', to: 'pick' }] }), /self-edge/);
  assert.throws(() => draw({ ...graph, edges: [...edges, edges[0]] }), /duplicate edge/);
  assert.throws(() => draw({ ...graph, nodes: [...nodes, nodes[0]] }), /duplicate node/);
  assert.throws(() => draw({ ...graph, edges: [...edges, { from: 'done', to: 'pick' }] }), /acyclic/);
  assert.throws(() => draw({ ...graph, active: ['missing'] }), /unknown node/);
  assert.throws(() => draw({ ...graph, nodes: [{ ...nodes[0], role: 'custom' }, ...nodes.slice(1)] }), /role/);
});

test('insufficient bounds and a dense fan-out fail instead of emitting an unreadable graph', () => {
  assert.throws(() => draw({ ...graph, w: 50 }), /room/);
  assert.throws(() => draw({ ...graph, h: 80 }), /room/);
  const dense = Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}` }));
  assert.throws(() => draw({ ...bounds, nodes: dense, edges: dense.slice(1).map(({ id }) => ({ from: 'n0', to: id })) }), /four/);
});
