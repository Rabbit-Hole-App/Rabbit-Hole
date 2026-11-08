import test from 'node:test';
import assert from 'node:assert/strict';
import { regressionFitFixture } from './ai-regression-fit-fixture.js';
import { draftSchemaVersion, parseGuestResult, resolveInputs, sealProgram } from './contract.js';
import { normalizeFrame } from './frame.js';
import { loadEngine, runProgram } from './runtime.js';
import { RASTER_PROGRAM_STAMPS } from './stamps.js';

const { manifest, source } = regressionFitFixture;
const sealed = await sealProgram({ manifest, source }, {
  ...RASTER_PROGRAM_STAMPS, schemaVersion: draftSchemaVersion(regressionFitFixture),
});
assert.equal(sealed.ok, true, sealed.issue);
const artifact = sealed.value;
const engine = await loadEngine();

function evaluate(saved = {}) {
  const result = runProgram(engine, {
    source: artifact.source, sdkVersion: artifact.sdkVersion,
    request: { requestId: 'regression', inputs: resolveInputs(artifact.manifest, saved), time: 0, seed: 1, state: null },
  });
  assert.equal(result.ok, true, result.detail);
  const parsed = parseGuestResult(result.value, artifact.manifest);
  assert.equal(parsed.ok, true, parsed.issue);
  const view = normalizeFrame(parsed.value.frame, artifact.manifest);
  assert.equal(view.ok, true, view.issue);
  return { objects: view.state.objects, quantities: parsed.value.quantities };
}

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const objectWithId = (objects, id) => {
  const object = objects.find(item => item.id === id);
  assert.ok(object, `missing object ${id}`);
  return object;
};

test('slope and intercept independently update the six squared errors and their mean', () => {
  assert.equal(artifact.schemaVersion, 1);
  const cases = [
    // At slope 0.5 and intercept 0, the residuals are −1.5, 1, −0.5, 2.5, 1 and 3.5.
    { saved: {}, errors: [2.25, 1, 0.25, 6.25, 1, 12.25], mse: 23 / 6, shownMse: 3.833 },
    // Changing slope alone puts three observations on the line and three two units above it.
    { saved: { slope: 1 }, errors: [0, 4, 0, 4, 0, 4], mse: 2, shownMse: 2 },
    // Raising the intercept one unit leaves all six observations one unit from the line.
    { saved: { slope: 1, intercept: 1 }, errors: [1, 1, 1, 1, 1, 1], mse: 1, shownMse: 1 },
  ];
  for (const { saved, errors, mse, shownMse } of cases) {
    const { objects, quantities } = evaluate(saved);
    assert.deepEqual(errors.map((_, i) => quantities['squaredError' + (i + 1)]), errors);
    near(quantities.mse, mse);
    const shown = id => Number(objectWithId(objects, id).label.split(': ').at(-1));
    assert.deepEqual(errors.map((_, i) => shown('squared-error-' + (i + 1))), errors);
    assert.equal(shown('mse'), shownMse);
  }
});

test('the fixed plot contains all six vertical residuals at the slider limits', () => {
  const axes = objects => objects.filter(object => object.id.startsWith('plot:regression:'));
  const initial = evaluate();
  const corners = [
    { saved: { slope: -1.5, intercept: -2 }, heights: [0.3, 0.9] },
    { saved: { slope: -1.5, intercept: 2 }, heights: [0.1, 0.7] },
    { saved: { slope: 1.5, intercept: -2 }, heights: [0.9, 0.3] },
    { saved: { slope: 1.5, intercept: 2 }, heights: [0.7, 0.1] },
  ];
  for (const { saved, heights } of corners) {
    const { objects } = evaluate(saved);
    assert.ok(objects.length <= 60);
    assert.deepEqual(axes(objects), axes(initial.objects));
    const horizontal = objectWithId(objects, 'plot:regression:axis:x');
    const vertical = objectWithId(objects, 'plot:regression:axis:y');
    const { x: left, y: bottom } = horizontal.from;
    const { x: right } = horizontal.to;
    const { y: top } = vertical.to;
    const fit = objectWithId(objects, 'regression:segment:fit');
    assert.equal(fit.from.x, left);
    assert.equal(fit.to.x, right);
    near((fit.from.y - top) / (bottom - top), heights[0]);
    near((fit.to.y - top) / (bottom - top), heights[1]);
    for (let i = 1; i <= 6; i++) {
      const pointId = 'regression:point:p' + i;
      const { x, y, w } = objectWithId(objects, pointId);
      const start = objectWithId(initial.objects, pointId);
      assert.deepEqual({ x, y }, { x: start.x, y: start.y });
      assert.ok(x - w / 2 > left && x + w / 2 < right && y - w / 2 > top && y + w / 2 < bottom);
      const { from, to } = objectWithId(objects, 'regression:segment:p' + i);
      assert.deepEqual(from, { x, y });
      assert.equal(to.x, x);
      assert.ok(to.y > top && to.y < bottom);
      near(to.y, fit.from.y + (x - left) / (right - left) * (fit.to.y - fit.from.y));
    }
  }
});
