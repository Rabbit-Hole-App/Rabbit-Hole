import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGuestResult, resolveInputs, sealProgram } from './contract.js';
import { normalizeFrame } from './frame.js';
import { textOverlaps } from './frame-overlap.js';
import { LIMITS } from './limits.js';
import { loadEngine, runProgram } from './runtime.js';

async function prepare(fixture, inputId, defaultValue) {
  const { manifest, source, stamps } = fixture;
  const sealed = await sealProgram({ manifest, source }, stamps);
  assert.equal(sealed.ok, true, sealed.issue);
  const artifact = sealed.value;
  assert.equal(artifact.sdkVersion, 'sdk-2');
  assert.equal(artifact.manifest.inputs.length, 1);
  assert.deepEqual(resolveInputs(artifact.manifest), { [inputId]: defaultValue });
  const [{ min, max, step }] = artifact.manifest.inputs;
  const settings = Array.from({ length: 1 + (max - min) / step }, (_, i) => min + i * step);
  const engine = await loadEngine();
  const draw = value => {
    const inputs = resolveInputs(artifact.manifest, { [inputId]: value });
    assert.deepEqual(inputs, { [inputId]: value });
    const request = { requestId: `${inputId}-${value}`, inputs, time: 0, seed: 1, state: null };
    // Check behavior even when parallel unit suites are contending for CPU.
    const reply = runProgram(engine, { source, sdkVersion: artifact.sdkVersion, request }, { ...LIMITS, interruptMs: 5000 });
    assert.equal(reply.ok, true, reply.detail);
    const parsed = parseGuestResult(reply.value, artifact.manifest);
    assert.equal(parsed.ok, true, parsed.issue);
    const { frame } = parsed.value;
    const normalized = normalizeFrame(frame, artifact.manifest);
    assert.equal(normalized.ok, true, normalized.issue);
    assert.ok(frame.objects.length <= 60);
    assert.deepEqual(textOverlaps(frame), [], `${inputId}=${value}: labels should remain readable`);
    return normalized.state.objects;
  };
  return { settings, draw };
}

test('each cutoff keeps the training days earlier than the gap and the three test days', async () => {
  const { walkForwardFixture } = await import('./ai-walk-forward-fixture.js');
  const { settings, draw } = await prepare(walkForwardFixture, 'cutoff', 4);
  const folds = [
    [[1, 2, 3, 4], [5, 6], [7, 8, 9], [10, 11, 12, 13]],
    [[1, 2, 3, 4, 5], [6, 7], [8, 9, 10], [11, 12, 13]],
    [[1, 2, 3, 4, 5, 6], [7, 8], [9, 10, 11], [12, 13]],
    [[1, 2, 3, 4, 5, 6, 7], [8, 9], [10, 11, 12], [13]],
    [[1, 2, 3, 4, 5, 6, 7, 8], [9, 10], [11, 12, 13], []],
  ];
  const lanes = [['train', 'learner'], ['skip', 'warning'], ['test', 'prediction'], ['future', 'neutral']];
  assert.deepEqual(settings, [4, 5, 6, 7, 8]);
  let baselineX;
  for (const [index, cutoff] of settings.entries()) {
    const objects = draw(cutoff);
    const byId = new Map(objects.map(object => [object.id, object]));
    const dayX = [];
    for (const [laneIndex, [lane, role]] of lanes.entries()) {
      const days = objects.filter(object => object.type === 'circle' && object.id.startsWith(`fold:e:${lane}:`));
      assert.deepEqual(days.map(day => Number(byId.get(`${day.id}:t`).label)), folds[index][laneIndex], `cutoff ${cutoff}, ${lane}`);
      const track = byId.get(`fold:track:${lane}`);
      for (const day of days) {
        const number = Number(byId.get(`${day.id}:t`).label);
        assert.equal(day.role, role);
        assert.equal(day.y, track.from.y);
        dayX.push(day.x);
      }
    }
    assert.ok(dayX.every((x, i) => i === 0 || x > dayX[i - 1]), 'training, skipped, test and later days remain in order with no overlap');
    baselineX ??= dayX;
    assert.deepEqual(dayX, baselineX, 'dates stay fixed as the cutoff moves');
    assert.equal(byId.get('fold:cursor:train').from.x, dayX[cutoff - 1]);
  }
  const saved = new Map(draw(5.6).map(object => [object.id, object]));
  assert.equal(saved.get('fold:cursor:train').from.x, baselineX[5], 'a fractional saved cutoff rounds to a whole day');
  assert.equal(saved.get('fold:e:train:day-6:t')?.label, '6');
});

test('radius classifies every point using inclusive Euclidean neighborhoods and MinPts includes self', async () => {
  const { dbscanFixture } = await import('./ai-dbscan-fixture.js');
  const { settings, draw } = await prepare(dbscanFixture, 'epsilon', 1);
  const points = 'ABCDEFGHIJK';
  const symbol = { C: ['core', 'circle', 'success'], B: ['border', 'polyline', 'learner'], N: ['noise', 'polyline', 'neutral'] };
  // A reaches four points (including itself) at radius 1. E is border at 2;
  // F is next to E but stays noise until E becomes core at 2.5.
  const expected = [
    ['NNNNNNNNNNN', 1],
    ['CBBBNNCBBBN', 4],
    ['CCBBNNCCBBN', 4],
    ['CCCCBNCCCCN', 5],
    ['CCCCCBCCCCN', 5],
  ];
  assert.deepEqual(settings, [0.5, 1, 1.5, 2, 2.5]);
  let baseline;
  for (const [index, epsilon] of settings.entries()) {
    const [classes, neighborhoodA] = expected[index];
    const byId = new Map(draw(epsilon).map(object => [object.id, object]));
    const positions = Array.from(points, (name, i) => {
      const mark = byId.get(`point-${name}`);
      const [, type, role] = symbol[classes[i]];
      assert.equal(mark?.type, type, `${name} at radius ${epsilon}`);
      assert.equal(mark.role, role);
      assert.equal(byId.get(`label-${name}`).label, name);
      if (classes[i] === 'B') {
        const [top, right, bottom, left, end] = mark.points;
        assert.deepEqual(end, top, 'the border diamond is closed');
        assert.equal(top[0], bottom[0]);
        assert.equal(right[1], left[1]);
        assert.ok(top[1] < bottom[1] && right[0] > left[0]);
        return [top[0], right[1]];
      }
      if (type === 'polyline') {
        const [topLeft, bottomRight, center, bottomLeft, topRight] = mark.points;
        assert.ok(topLeft[1] < bottomRight[1] && bottomLeft[1] > topRight[1]);
        return center;
      }
      return [mark.x, mark.y];
    });
    baseline ??= positions;
    assert.deepEqual(positions, baseline, 'increasing the radius never moves the data');
    for (const [code, [name, type, role]] of Object.entries(symbol)) {
      const count = [...classes].filter(value => value === code).length;
      const legend = byId.get(`legend-${name}`);
      assert.deepEqual([legend.type, legend.role], [type, role]);
      assert.equal(byId.get(`count-${name}`).label, `${name[0].toUpperCase()}${name.slice(1)}: ${count}`);
    }
    assert.equal(byId.get('neighborhood-a').label, `A: ${neighborhoodA} in range`);
    const [ax, ay] = positions[0];
    const pixelsPerUnit = ax - positions[1][0]; // A and B are one x unit apart.
    assert.ok(pixelsPerUnit > 0);
    const ring = byId.get('radius-a').points;
    for (const [x, y] of ring) assert.ok(Math.abs(Math.hypot(x - ax, y - ay) - pixelsPerUnit * epsilon) < 1e-8);
    assert.equal(ay - positions[2][1], pixelsPerUnit, 'the plot uses the same scale for x and y');
  }
});
