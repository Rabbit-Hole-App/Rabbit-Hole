import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGuestResult, resolveInputs, sealProgram } from './contract.js';
import { normalizeFrame } from './frame.js';
import { textOverlaps } from './frame-overlap.js';
import { LIMITS } from './limits.js';
import { programInputs, resetProgram, setProgramInput } from './program-card.js';
import { loadEngine, runProgram } from './runtime.js';

const engine = await loadEngine();
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} vs ${expected}`);

async function open(fixture, values) {
  const sealed = await sealProgram({ manifest: fixture.manifest, source: fixture.source }, fixture.stamps);
  assert.equal(sealed.ok, true, sealed.issue);
  const { manifest, sdkVersion, source } = sealed.value;
  assert.equal(sdkVersion, 'sdk-2');
  assert.equal(manifest.inputs.length, 1);
  const [control] = manifest.inputs;
  assert.deepEqual(control.options.map(option => option.value), values);
  assert.equal(control.default, values[0]);

  return inputs => {
    const reply = runProgram(engine, {
      source, sdkVersion, operation: 'evaluate',
      request: { requestId: fixture.id, inputs: resolveInputs(manifest, inputs), time: 0, seed: 1, state: null },
    }, { ...LIMITS, interruptMs: 5000 });
    assert.equal(reply.ok, true, reply.detail);
    const parsed = parseGuestResult(reply.value, manifest);
    assert.equal(parsed.ok, true, parsed.issue);
    const { frame } = parsed.value;
    const normalized = normalizeFrame(frame, manifest);
    assert.equal(normalized.ok, true, normalized.issue);
    assert.ok(frame.objects.length <= 60, `frame has ${frame.objects.length} objects`);
    assert.deepEqual(textOverlaps(frame), [], 'plot labels should not overlap');
    return {
      byId: new Map(frame.objects.map(object => [object.id, object])),
      values: Object.fromEntries(frame.readouts.map(({ id, value }) => [id, value])),
      displayed: Object.fromEntries(normalized.readouts.map(({ id, text }) => [id, text])),
    };
  };
}

test('the SVM margin narrows and rings only the points with positive hinge loss', async () => {
  const { svmMarginFixture } = await import('./ai-svm-margin-fixture.js');
  const cases = [
    ['0.05', 80 / 13, [0, 1, 2, 3]],
    ['0.3', 8 / 3, [1, 2, 3]],
    ['1', 2, [2, 3]],
    ['5', 1, [3]],
  ];
  const draw = await open(svmMarginFixture, cases.map(([c]) => c));
  for (const [c, width, violatingRows] of cases) {
    const { byId, values, displayed } = draw({ c });
    close(values.marginWidth, width, `C=${c}: width`);
    assert.equal(values.violations, 2 * violatingRows.length);
    assert.equal(values.misclassified, 2);
    assert.equal(displayed.marginWidth, width.toFixed(2));
    assert.ok(byId.get('marginWidth').text.endsWith(displayed.marginWidth));
    assert.ok(byId.get('violations').text.endsWith(displayed.violations));
    assert.ok(byId.get('misclassified').text.endsWith(displayed.misclassified));

    const axis = byId.get('feature-axis');
    const toX = px => 8 * (px - axis.from.x) / (axis.to.x - axis.from.x) - 4;
    const boundary = byId.get('decision-boundary');
    close(toX(boundary.from.x), 0, 'boundary stays at zero');
    close(toX(boundary.to.x), 0, 'boundary stays vertical');
    for (const [id, position] of [['margin-negative', -width / 2], ['margin-positive', width / 2]]) {
      const edge = byId.get(id);
      close(toX(edge.from.x), position, `${id} edge`);
      close(toX(edge.to.x), position, `${id} stays vertical`);
    }
    for (const [row, x] of [2, 1, 0.5, -0.25].entries()) {
      for (const [sign, position, symbol] of [['positive', x, '+'], ['negative', -x, '−']]) {
        const dot = byId.get(`point-${row}-${sign}`);
        const halo = byId.get(`violation-${row}-${sign}`);
        close(toX(dot.x), position, 'point coordinates stay fixed');
        assert.equal(dot.text, symbol);
        assert.equal(Boolean(halo), violatingRows.includes(row), `C=${c}: ${sign} at x=${position}`);
        if (halo) assert.deepEqual([halo.x, halo.y, halo.role], [dot.x, dot.y, 'warning']);
      }
    }
  }
});

test('interpolation fits every training sample and makes held-out predictions worse', async () => {
  const { overfittingFixture } = await import('./ai-overfitting-fixture.js');
  const cases = [
    ['1', 0.64, 0.16, [-1.6, -1.1, -0.6, -0.1, 0.4, 0.9, 1.4, 1.9, 2.4]],
    ['4', 0, 1.5869140625, [-2, -2.59375, -1, 0.90625, 2, 1.90625, 1, 0.40625, 2]],
  ];
  const draw = await open(overfittingFixture, cases.map(([degree]) => degree));
  for (const [degree, train, validation, predictions] of cases) {
    const { byId, values, displayed } = draw({ degree });
    close(values.trainMse, train, `degree ${degree}: training MSE`);
    close(values.validationMse, validation, `degree ${degree}: validation MSE`);
    for (const [id, expected] of [['trainMse', train], ['validationMse', validation]]) {
      assert.equal(displayed[id], expected.toFixed(3));
      assert.ok(byId.get(id).text.endsWith(displayed[id]));
    }

    const xAxis = byId.get('plot:fit:axis:x');
    const yAxis = byId.get('plot:fit:axis:y');
    const toX = px => 4 * (px - xAxis.from.x) / (xAxis.to.x - xAxis.from.x) - 2;
    const toY = py => 6 * (py - yAxis.from.y) / (yAxis.to.y - yAxis.from.y) - 3;
    const curve = byId.get('plot:fit:s:model').points;
    for (const [i, predicted] of predictions.entries()) {
      const x = -2 + i * 0.5;
      const isTraining = i % 2 === 0;
      const index = Math.floor(i / 2);
      const sample = byId.get(`plot:fit:s:${isTraining ? 'train' : 'validation'}:${index}`);
      close(toX(sample.x), x, 'sample x');
      close(toY(sample.y), x === 0 ? 2 : x, 'sample y');
      const fitted = curve.find(([px]) => Math.abs(toX(px) - x) < 1e-9);
      assert.ok(fitted, `curve samples x=${x}`);
      close(toY(fitted[1]), predicted, `degree ${degree}: fit at x=${x}`);
      if (!isTraining) {
        const residual = byId.get(`validation-residual-${index}`);
        assert.deepEqual(residual.from, { x: sample.x, y: sample.y });
        close(toX(residual.to.x), x, 'residual is vertical');
        close(toY(residual.to.y), predicted, 'residual ends on the fit');
      }
    }
  }
});

test('saved selections reopen and Reset reproduces each default frame', async () => {
  const { svmMarginFixture } = await import('./ai-svm-margin-fixture.js');
  const { overfittingFixture } = await import('./ai-overfitting-fixture.js');
  for (const [fixture, values, changedReadout] of [
    [svmMarginFixture, ['0.05', '0.3', '1', '5'], 'marginWidth'],
    [overfittingFixture, ['1', '4'], 'validationMse'],
  ]) {
    const { manifest } = fixture;
    const [{ id }] = manifest.inputs;
    const draw = await open(fixture, values);
    const initial = { inputs: {} };
    const last = values.at(-1);
    const saved = JSON.parse(JSON.stringify(setProgramInput(initial, manifest, id, last)));
    assert.deepEqual(programInputs(manifest, saved), { [id]: last });
    assert.notEqual(draw(programInputs(manifest, saved)).values[changedReadout], draw().values[changedReadout]);
    assert.deepEqual(draw(programInputs(manifest, resetProgram(saved))), draw());
  }
});
