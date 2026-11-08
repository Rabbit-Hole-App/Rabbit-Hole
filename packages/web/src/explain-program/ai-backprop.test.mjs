import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProgramArtifact } from '../../../control-plane/src/explain-program.js';
import { parseGuestResult, resolveInputs } from './contract.js';
import { normalizeFrame } from './frame.js';
import { loadEngine, runProgram } from './runtime.js';
import { backpropFixture as fixture } from './ai-backprop-fixture.js';

const engine = await loadEngine();
const artifact = await buildProgramArtifact({ manifest: fixture.manifest, source: fixture.source });
function evaluate(saved) {
  const inputs = resolveInputs(artifact.manifest, saved);
  const result = runProgram(engine, { source: artifact.source, sdkVersion: artifact.sdkVersion,
    operation: 'evaluate', request: { requestId: 'backprop', inputs, time: 0, seed: 1, state: null } });
  assert.equal(result.ok, true, result.detail);
  const parsed = parseGuestResult(result.value, artifact.manifest);
  assert.equal(parsed.ok, true, parsed.issue);
  const view = normalizeFrame(parsed.value.frame, artifact.manifest);
  assert.equal(view.ok, true, view.issue);
  assert.ok(parsed.value.frame.objects.length <= 60);
  return parsed.value;
}
const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const shown = (frame, id) => Number(frame.objects.find(o => o.id === id).text.split(': ')[1]);
const rounded = (value, decimals = 6) => Number(value.toFixed(decimals));
const lossAt = (x, w) => (0.8 * Math.tanh(x * w) - 0.6) ** 2 / 2;
const finiteDifference = (x, w) => (lossAt(x, w + 1e-5) - lossAt(x, w - 1e-5)) / 2e-5;

test('the displayed chain factors give the numerical weight derivative, even at zero or saturation', () => {
  for (const [x, w] of [[1.2, 0.4], [-1.2, 0.4], [0, 1.2], [1.2, 0], [2, 2], [2, -2], [-2, 2]]) {
    const { quantities: q, frame } = evaluate({ x, w, mode: 'backward' });
    near(q.loss, lossAt(x, w));
    near(q.gradient, finiteDifference(x, w), 2e-9);
    near(q.dLossDPrediction, q.prediction - 0.6);
    near(q.dPredictionDHidden, 0.8);
    near(q.dHiddenDPreactivation, 1 / Math.cosh(x * w) ** 2);
    near(q.dPreactivationDWeight, x);
    assert.equal(shown(frame, 'dl-dy'), rounded(q.dLossDPrediction, 4));
    assert.equal(shown(frame, 'dy-dh'), rounded(q.dPredictionDHidden, 1));
    assert.equal(shown(frame, 'dh-dz'), rounded(q.dHiddenDPreactivation));
    assert.equal(shown(frame, 'dz-dw'), rounded(q.dPreactivationDWeight));
    assert.equal(shown(frame, 'gradient-value'), rounded(q.gradient));
  }
});

test('each rate proposes one step and recomputes the loss at the proposed weight', () => {
  for (const rate of ['0.05', '0.1', '0.2']) for (const [x, w] of [[1.3, 0.2], [-1, 0.7], [0, 2], [2, 2]]) {
    const { quantities: q, frame } = evaluate({ x, w, rate, mode: 'update' });
    near(q.updatedWeight, w - Number(rate) * finiteDifference(x, w), 2e-9);
    near(q.updatedLoss, lossAt(x, q.updatedWeight));
    assert.ok(q.updatedLoss <= q.loss);
    assert.equal(q.weight, w);
    assert.equal(shown(frame, 'updated-weight'), rounded(q.updatedWeight));
    assert.equal(shown(frame, 'updated-loss'), rounded(q.updatedLoss));
  }
});

test('the three modes show forward values, a reverse path, or a proposed update without changing the inputs', () => {
  assert.equal(artifact.schemaVersion, 1);
  assert.equal(artifact.sdkVersion, 'sdk-6');
  const saved = { x: 8, w: -8, rate: '0.2' };
  assert.deepEqual(resolveInputs(artifact.manifest, { ...saved, mode: 'unknown' }), { x: 2, w: -2, rate: '0.2', mode: 'forward' });
  const forward = evaluate({ ...saved, mode: 'forward' });
  const backward = evaluate({ ...saved, mode: 'backward' });
  const update = evaluate({ ...saved, mode: 'update' });
  assert.equal(forward.quantities.weight, -2);
  near(forward.quantities.hidden, Math.tanh(-4));
  near(forward.quantities.prediction, 0.8 * Math.tanh(-4));
  assert.deepEqual(forward.quantities, backward.quantities);
  assert.deepEqual(forward.quantities, update.quantities);
  const arrow = (out, prefix) => out.frame.objects.find(o => o.kind === 'arrow' && o.id.startsWith(prefix));
  assert.ok(arrow(forward, 'forward-').from.x < arrow(forward, 'forward-').to.x);
  assert.equal(arrow(forward, 'backward-'), undefined);
  assert.ok(arrow(backward, 'backward-').from.x > arrow(backward, 'backward-').to.x);
  assert.ok(update.frame.objects.some(o => o.id === 'updated-weight'));
  assert.ok(!backward.frame.objects.some(o => o.id === 'updated-weight'));
  assert.deepEqual(evaluate({ ...saved, mode: 'invalid' }), forward);
});
