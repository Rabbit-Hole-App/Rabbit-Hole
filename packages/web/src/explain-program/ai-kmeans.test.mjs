import test from 'node:test';
import assert from 'node:assert/strict';
import { kmeansFixture as fixture } from './ai-kmeans-fixture.js';
import { parseGuestResult, parseReduceRequest, parseState, sealProgram } from './contract.js';
import { normalizeFrame } from './frame.js';
import { loadEngine, runProgram } from './runtime.js';
import { STATEFUL_RASTER_PROGRAM_STAMPS } from './stamps.js';

function checked(result) {
  assert.equal(result.ok, true, result.issue ?? result.detail);
  return result.value;
}

const [engine, sealed] = await Promise.all([
  loadEngine(), sealProgram({ manifest: fixture.manifest, source: fixture.source }, STATEFUL_RASTER_PROGRAM_STAMPS),
]);
const { manifest, source, sdkVersion } = checked(sealed);
const run = (operation, request) => checked(runProgram(engine, { source, sdkVersion, operation, request }));
const common = { requestId: 'kmeans', inputs: {}, seed: 1 };
const initialize = () => checked(parseState(run('initialize', common)));
const reduce = (state, event) => checked(parseState(run('reduce', checked(parseReduceRequest({
  ...common, time: 0, state, event,
}, manifest)))));
const step = state => reduce(state, { type: 'action', action: 'step' });
const draw = state => {
  const result = checked(parseGuestResult(run('evaluate', { ...common, time: 0, state }), manifest));
  checked(normalizeFrame(result.frame, manifest));
  return result;
};

const object = (result, id) => result.frame.objects.find(item => item.id === id);
const labels = result => result.frame.objects.filter(item => item.id.startsWith('point-')).map(item => item.text);
const centers = ({ quantities: { centerAX, centerAY, centerBX, centerBY } }) => [[centerAX, centerAY], [centerBX, centerBY]];
const markerPosition = target => ({ x: target.x + target.w / 2, y: target.y + target.h / 2 });

test('Step assigns the eight points before moving centroids to their means', () => {
  const initial = initialize(), original = draw(initial);
  assert.deepEqual(centers(original), [[-2.5, 0], [2.5, 0]]);
  assert.equal(original.quantities.inertia, undefined);
  assert.match(object(original, 'next-step').text, /assign points/i);

  const assigned = step(initial), assignment = draw(assigned);
  assert.deepEqual(centers(assignment), centers(original));
  assert.deepEqual(labels(assignment), ['A', 'A', 'B', 'B', 'A', 'A', 'B', 'B']);
  assert.equal(assignment.quantities.inertia, 18);
  assert.match(object(assignment, 'next-step').text, /move centroids/i);

  const moved = step(assigned), updated = draw(moved);
  assert.deepEqual(centers(updated), [[-1.75, 0], [1.75, 0]]);
  assert.deepEqual(labels(updated), labels(assignment));
  assert.equal(updated.quantities.inertia, 13.5);
  assert.match(object(updated, 'inertia').text, /13\.50/);
  assert.match(object(updated, 'next-step').text, /assign points/i);
  assert.deepEqual(draw(step(step(moved))), updated);
});

test('dragging both centroids restarts assignment and the new start converges to top and bottom groups', () => {
  const initial = initialize();
  const start = step(initial);
  const drags = fixture.events.filter(event => event.type.startsWith('drag_'));
  const relocatedState = drags.reduce(reduce, start), relocated = draw(relocatedState);
  assert.deepEqual(centers(relocated), [[0, 2], [0, -2]]);
  assert.equal(relocated.quantities.inertia, undefined);
  assert.deepEqual(labels(relocated), Array(8).fill(undefined));
  assert.match(object(relocated, 'next-step').text, /assign points/i);
  assert.deepEqual(manifest.targets.map(({ id, label, drag }) => [id, label, drag]), [
    ['centroid-a', 'Centroid A', true], ['centroid-b', 'Centroid B', true],
  ]);
  for (const { target, x, y } of drags.filter(event => event.type === 'drag_end')) {
    assert.deepEqual(markerPosition(object(relocated, target)), { x, y });
  }

  const assigned = step(relocatedState), assignment = draw(assigned);
  assert.deepEqual(labels(assignment), ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B']);
  assert.equal(assignment.quantities.inertia, 30);
  const moved = step(assigned), updated = draw(moved);
  assert.deepEqual(centers(updated), [[0, 1.25], [0, -1.25]]);
  assert.deepEqual(labels(updated), labels(assignment));
  assert.equal(updated.quantities.inertia, 25.5);
  assert.deepEqual(draw(step(step(moved))), updated);
  assert.deepEqual(draw(initialize()), draw(initial));
});

test('coincident centroids assign ties to A and leave an empty centroid where it was', () => {
  const initial = initialize(), original = draw(initial);
  const a = object(original, 'centroid-a'), b = object(original, 'centroid-b');
  const dragging = reduce(initial, { type: 'drag_start', target: b.id, ...markerPosition(b) });
  const assigned = step(reduce(dragging, { type: 'drag_end', target: b.id, ...markerPosition(a) }));
  assert.deepEqual(labels(draw(assigned)), Array(8).fill('A'));
  const moved = draw(step(assigned));
  assert.deepEqual(centers(moved), [[0, 0], [-2.5, 0]]);
  assert.deepEqual([moved.quantities.countA, moved.quantities.countB, moved.quantities.inertia], [8, 0, 38]);
});
