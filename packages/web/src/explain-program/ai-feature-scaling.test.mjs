import test from 'node:test';
import assert from 'node:assert/strict';
import { featureScalingFixture } from './ai-feature-scaling-fixture.js';
import { parseGuestResult, resolveInputs } from './contract.js';
import { normalizeFrame } from './frame.js';
import { textOverlaps } from './frame-overlap.js';
import { LIMITS } from './limits.js';
import { loadEngine, runProgram } from './runtime.js';

const { manifest, source, stamps } = featureScalingFixture;
const engine = await loadEngine();

function draw(saved) {
  const reply = runProgram(engine, {
    source, sdkVersion: stamps.sdkVersion, operation: 'evaluate',
    request: { requestId: 'scaling', inputs: resolveInputs(manifest, saved), time: 0, seed: 1, state: null },
  }, { ...LIMITS, interruptMs: 5000 });
  assert.equal(reply.ok, true, reply.detail);
  const parsed = parseGuestResult(reply.value, manifest);
  assert.equal(parsed.ok, true, parsed.issue);
  const { frame } = parsed.value;
  const normalized = normalizeFrame(frame, manifest);
  assert.equal(normalized.ok, true, normalized.issue);
  return { frame, byId: new Map(frame.objects.map(object => [object.id, object])), readouts: normalized.readouts };
}

const steps = [
  [0.25, 4.007804885470, 1.414213562373, 'B'],
  [0.50, 4.031128874149, 2.236067977500, 'B'],
  [0.75, 4.069705149025, 3.162277660168, 'B'],
  [1.00, 4.123105625618, 4.123105625618, null],
  [1.25, 4.190763653560, 5.099019513593, 'A'],
  [1.50, 4.272001872659, 6.082762530298, 'A'],
  [1.75, 4.366062299143, 7.071067811865, 'A'],
  [2.00, 4.472135955000, 8.062257748299, 'A'],
];

test('the slider changes weighted distances and shows an explicit tie at 1×', () => {
  assert.equal(stamps.sdkVersion, 'sdk-2');
  assert.deepEqual(resolveInputs(manifest), { xScale: 0.5 });
  const [{ min, max, step }] = manifest.inputs;
  assert.deepEqual(steps.map(([scale]) => scale), Array.from({ length: (max - min) / step + 1 }, (_, i) => min + i * step));
  for (const [xScale, distanceA, distanceB, nearest] of steps) {
    const { frame, byId, readouts } = draw({ xScale });
    for (const [id, distance] of [['distanceA', distanceA], ['distanceB', distanceB]]) {
      const measured = frame.readouts.find(item => item.id === id)?.value;
      assert.ok(Math.abs(measured - distance) < 1e-10, `${id} at scale ${xScale}: ${measured}`);
      const displayed = distance.toFixed(2);
      assert.equal(readouts.find(item => item.id === id)?.text, displayed);
      assert.ok(byId.get(id)?.text.endsWith(displayed), `visible ${id} at scale ${xScale}`);
    }
    assert.equal(byId.get('nearest')?.text, nearest ? `Nearest: ${nearest}` : 'Tie: A and B');
    for (const candidate of ['A', 'B']) {
      assert.equal(byId.get(`plot:points:s:${candidate}:0`)?.role === 'learner', nearest === null || nearest === candidate);
    }
  }
});

test('the query and both candidates stay at their original plotted coordinates', () => {
  const points = [['query', 1, 1], ['A', 2, 5], ['B', 5, 2]];
  const geometry = byId => points.map(([id]) => {
    const { x, y, w } = byId.get(`plot:points:s:${id}:0`);
    return { x, y, w };
  });
  const baseline = draw();
  const fixed = geometry(baseline.byId);
  const horizontal = baseline.byId.get('plot:points:axis:x');
  const vertical = baseline.byId.get('plot:points:axis:y');
  for (const [index, [, x, y]] of points.entries()) {
    assert.ok(Math.abs((fixed[index].x - horizontal.from.x) / (horizontal.to.x - horizontal.from.x) - x / 6) < 1e-10);
    assert.ok(Math.abs((fixed[index].y - vertical.from.y) / (vertical.to.y - vertical.from.y) - y / 6) < 1e-10);
  }
  for (const [xScale] of steps) {
    const { frame, byId } = draw({ xScale });
    assert.deepEqual(geometry(byId), fixed, `point geometry at scale ${xScale}`);
    assert.ok(frame.objects.length <= 40);
    assert.deepEqual(textOverlaps(frame), []);
  }
});
