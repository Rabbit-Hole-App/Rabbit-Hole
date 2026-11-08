import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProgramArtifact } from '../../../control-plane/src/explain-program.js';
import { boundaryFixture as fixture } from './ai-boundary-fixture.js';
import {
  parseGuestResult, parseInitializeRequest, parseReduceRequest, parseState,
  parseStatefulEvaluateRequest, resolveInputs,
} from './contract.js';
import { normalizeFrame } from './frame.js';
import { loadEngine, runProgram } from './runtime.js';

function checked(result) {
  assert.equal(result.ok, true, result.issue ?? result.detail);
  return result.value;
}

const [engine, artifact] = await Promise.all([loadEngine(), buildProgramArtifact({ manifest: fixture.manifest, source: fixture.source })]);
const { manifest, source, sdkVersion } = artifact;
const inputsFor = values => resolveInputs(manifest, values);
const defaults = inputsFor({});
const run = (operation, request) => checked(runProgram(engine, { source, sdkVersion, operation, request }));
const common = { requestId: 'boundary', seed: 1 };
const initialize = (inputs = defaults) => checked(parseState(run('initialize', checked(parseInitializeRequest({ ...common, inputs })))));
const reduce = (state, event, inputs = defaults) => checked(parseState(run('reduce', checked(parseReduceRequest({
  ...common, inputs, time: 0, state, event,
}, manifest)))));
const evaluate = (state, inputs = defaults) => {
  const result = checked(parseGuestResult(run('evaluate', checked(parseStatefulEvaluateRequest({
    ...common, inputs, time: 0, state,
  }))), manifest));
  checked(normalizeFrame(result.frame, manifest));
  return result;
};

const frameObject = (result, id) => result.frame.objects.find(object => object.id === id);
const center = object => [object.x + object.w / 2, object.y + (object.h ?? object.w) / 2];
const targets = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'query'];

test('default query follows its closest point for k=1 and the majority for k=3', () => {
  assert.equal(artifact.schemaVersion, 2);
  assert.deepEqual(artifact.manifest.targets.map(target => target.id), targets);
  assert.ok(artifact.manifest.targets.every(target => target.drag));

  const state = initialize(), one = evaluate(state);
  const threeInputs = inputsFor({ neighbors: '3' });
  const next = reduce(state, { type: 'input', input: 'neighbors', value: '3' }, threeInputs);
  assert.deepEqual(next, state, 'changing k preserves the points');
  const three = evaluate(next, threeInputs);
  // B1 is closest to the query; the next two neighbors are A3 and A1.
  // Only B1 loses its majority when it must predict its own label from three other points.
  assert.deepEqual([one.quantities.prediction, three.quantities.prediction], [1, 0]);
  assert.deepEqual([one.quantities.leaveOneOutErrors, three.quantities.leaveOneOutErrors], [0, 1]);
  assert.equal(frameObject(one, 'prediction').text, 'Prediction: Class B');
  assert.equal(frameObject(three, 'prediction').text, 'Prediction: Class A');
  assert.match(frameObject(three, 'error').text, /leave-one-out.*1 \/ 6/i);
  assert.notDeepEqual(frameObject(one, 'regions').pixels, frameObject(three, 'regions').pixels);
});

test('drag coordinates share raster axes, clamp at plot corners, and retain all seven targets', () => {
  const initial = initialize(), original = evaluate(initial);
  const { x, y, w, h, rows, cols, pixels } = frameObject(original, 'regions');
  assert.deepEqual([rows, cols], [24, 24]);
  assert.deepEqual(center(frameObject(original, 'a1')), [x + w * 3 / 16, y + h / 4]);
  const upper = reduce(initial, { type: 'drag_start', target: 'query', x: 0, y: 0 });
  const upperFrame = evaluate(upper);
  assert.deepEqual(center(frameObject(upperFrame, 'query')), [x, y]);
  assert.deepEqual([upperFrame.quantities.queryX, upperFrame.quantities.queryY, upperFrame.quantities.prediction], [-2, 2, 0]);

  // The raster samples cell centers, with row zero at the top. Its corners are in opposite regions.
  const pixelAt = (r, c) => pixels.slice(4 * (r * cols + c), 4 * (r * cols + c) + 4);
  assert.notDeepEqual(pixelAt(0, 0), pixelAt(rows - 1, cols - 1));
  for (const [r, c, want] of [[0, 0, 0], [rows - 1, cols - 1, 1]]) {
    const at = { x: x + (c + 0.5) * w / cols, y: y + (r + 0.5) * h / rows };
    const result = evaluate(reduce(upper, { type: 'drag_move', target: 'query', ...at }));
    const [actualX, actualY] = center(frameObject(result, 'query'));
    assert.ok(Math.abs(actualX - at.x) < 1e-9 && Math.abs(actualY - at.y) < 1e-9);
    assert.equal(result.quantities.prediction, want);
    assert.deepEqual(frameObject(result, want === 0 ? 'class-a-swatch' : 'class-b-swatch').pixels, pixelAt(r, c));
  }

  const lower = reduce(upper, { type: 'drag_end', target: 'query', x: x + w + 12, y: y + h + 12 });
  const lowerFrame = evaluate(lower);
  assert.deepEqual(center(frameObject(lowerFrame, 'query')), [x + w, y + h]);
  assert.deepEqual([lowerFrame.quantities.queryX, lowerFrame.quantities.queryY, lowerFrame.quantities.prediction], [2, -2, 1]);
  for (const result of [original, upperFrame, lowerFrame]) {
    assert.deepEqual(result.frame.objects.filter(object => targets.includes(object.id)).map(object => object.id), targets);
    assert.ok(result.frame.objects.length <= 60);
  }
  assert.deepEqual(evaluate(JSON.parse(JSON.stringify(lower))), lowerFrame);
  assert.deepEqual(evaluate(initialize()), original);
});

test('coincident points break ties by stable index but exclude themselves from training error', () => {
  const initial = initialize(), original = evaluate(initial);
  const [x, y] = center(frameObject(original, 'b1'));
  const move = { type: 'drag_end', target: 'a1', x, y };
  const coincident = reduce(initial, move);
  const query = reduce(coincident, { ...move, target: 'query' });
  const result = evaluate(query);

  // A1 and B1 sit at zero distance from the query. A1 comes first.
  // When predicting either one in isolation, the other is its unique nearest point.
  assert.equal(result.quantities.prediction, 0);
  // B3 also picks A1 over the equally distant B1.
  assert.equal(result.quantities.leaveOneOutErrors, 3);
  assert.match(frameObject(result, 'misses').text, /A1, B1, B3/);
  assert.notDeepEqual(frameObject(result, 'regions').pixels, frameObject(original, 'regions').pixels);
  assert.deepEqual(reduce(initial, move), coincident);
  assert.deepEqual(evaluate(query), result);
});
