import assert from 'node:assert/strict';
import test from 'node:test';
import { CONTRACT_LIMITS, parseFrame } from './contract.js';
import { normalizeFrame } from './frame.js';
import { SDK_SOURCE } from './sdk.js';
import { GEOMETRY_SOURCE } from './sdk-geometry.js';

// Only this trusted helper source runs natively. Generated programs run in QuickJS.
const sdk = new Function(`${SDK_SOURCE}\n${GEOMETRY_SOURCE}\nreturn sdk;`)();
const viewport = { x: 30, y: 40, w: 300, h: 200, xDomain: [-3, 3], yDomain: [-2, 2] };
const byId = (objects, id) => objects.find(object => object.id === id);

test('geometry maps all four primitive collections into one valid Frame', () => {
  const objects = sdk.geometry('plane', {
    ...viewport,
    points: [{ id: 'origin', at: [0, 0], label: 'Origin', role: 'observed' }],
    segments: [{ id: 'axis', from: [-3, 0], to: [3, 0] }],
    vectors: [{ id: 'velocity', from: [0, 0], to: [2, 1], label: 'Velocity', role: 'output' }],
    paths: [{ id: 'route', points: [[-3, -2], [0, 1], [3, 2]], role: 'prediction' }],
  });
  const frame = sdk.frame(objects, { width: 400, height: 300 });
  assert.equal(parseFrame(frame).ok, true);
  const normalized = normalizeFrame(frame);
  assert.equal(normalized.ok, true, normalized.issue);
  const origin = byId(objects, 'plane:point:origin');
  assert.deepEqual([origin.kind, origin.x, origin.y, origin.role], ['circle', 180, 140, 'observed']);
  const vector = byId(objects, 'plane:vector:velocity');
  assert.equal(vector.kind, 'arrow');
  assert.deepEqual(vector.from, { x: 180, y: 140 });
  assert.deepEqual(vector.to, { x: 280, y: 90 });
  assert.deepEqual(byId(objects, 'plane:path:route').points, [[30, 240], [180, 90], [330, 40]]);
  assert.equal(byId(objects, 'plane:vector:velocity:label').text, 'Velocity');
});

test('a moving vector preserves its IDs and represents zero without an arrow', () => {
  const at = to => sdk.geometry('plane', { ...viewport, vectors: [{ id: 'v', from: [0, 0], to, label: 'v' }] });
  const first = at([1, 1]);
  const moved = at([-1, -1]);
  const stopped = at([0, 0]);
  assert.deepEqual(first.map(item => item.id), moved.map(item => item.id));
  assert.deepEqual(first.map(item => item.id), stopped.map(item => item.id));
  assert.deepEqual(moved[0].to, { x: 130, y: 190 });
  assert.equal(stopped[0].opacity, 0);
  assert.equal(parseFrame({ objects: stopped }).ok, true);
});

test('labels near the same point occupy separate readable positions', () => {
  const objects = sdk.geometry('plane', { ...viewport, points: [
    { id: 'a', at: [0, 0], label: 'Alpha' },
    { id: 'b', at: [0.02, 0], label: 'Bravo' },
    { id: 'c', at: [0, 0.02], label: 'Charlie' },
  ] });
  const labels = objects.filter(item => item.kind === 'text');
  assert.equal(labels.length, 3);
  for (const [index, a] of labels.entries()) {
    assert.ok(a.x >= viewport.x && a.x + 9 * a.text.length <= viewport.x + viewport.w);
    assert.ok(a.y - 15 >= viewport.y && a.y + 5 <= viewport.y + viewport.h);
    for (const b of labels.slice(index + 1)) {
      assert.ok(a.x + 9 * a.text.length <= b.x || b.x + 9 * b.text.length <= a.x || Math.abs(a.y - b.y) >= 20);
    }
  }
});

test('a sloped vector leaves its label clear of the arrow shaft', () => {
  const objects = sdk.geometry('plane', {
    ...viewport,
    vectors: [{ id: 'v', from: [0, 0], to: [2, 1], label: 'Velocity' }],
  });
  const vector = byId(objects, 'plane:vector:v');
  const label = byId(objects, 'plane:vector:v:label');
  for (let step = 0; step <= 100; step += 1) {
    const x = vector.from.x + (vector.to.x - vector.from.x) * step / 100;
    const y = vector.from.y + (vector.to.y - vector.from.y) * step / 100;
    assert.ok(x < label.x || x > label.x + 10 * label.text.length || y < label.y - 15 || y > label.y + 5);
  }
});

test('geometry refuses invalid or overlong input before constructing a Frame', () => {
  assert.throws(() => sdk.geometry('plane', { ...viewport, xDomain: [1, 1] }), /domain/i);
  assert.throws(() => sdk.geometry('plane', { ...viewport, yDomain: [-Number.MAX_VALUE, Number.MAX_VALUE] }), /domain/i);
  assert.throws(() => sdk.geometry('plane', { ...viewport, w: CONTRACT_LIMITS.size + 1 }), /viewport/i);
  assert.throws(() => sdk.geometry('plane', { ...viewport, points: [{ id: 'bad', at: [4, 0] }] }), /point/i);
  assert.throws(() => sdk.geometry('plane', { ...viewport, points: [{ id: 'bad', at: [0, 0], label: 'x'.repeat(201) }] }), /label/i);
  assert.throws(() => sdk.geometry('plane', { ...viewport, points: [{ id: 'bad', at: [0, 0], role: 'made-up' }] }), /role/i);
  assert.throws(() => sdk.geometry('plane', { ...viewport, points: [{ id: 'a', at: [0, 0] }, { id: 'a', at: [1, 1] }] }), /duplicate/i);
  assert.throws(() => sdk.geometry('plane', { ...viewport, paths: [{ id: 'curve', points: Array(201).fill([0, 0]) }] }), /points/i);
  assert.throws(() => sdk.geometry('plane', { ...viewport, vectors: Array(31).fill({ id: 'v', from: [0, 0], to: [1, 1] }) }), /vectors/i);
});
