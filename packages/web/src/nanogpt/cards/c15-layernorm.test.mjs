import { test } from 'node:test';
import assert from 'node:assert/strict';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { assertCardGates, assertEvidence } from '../card-gates.mjs';
import { scene, evidence } from './c15-layernorm.js';

const STATES = [{ input: 0 }, { input: 1 }, { input: 2 }];
const { presets, gamma } = fx.layernorm;
const name = label => label.replace('x', 'x₀');

// Independent oracle: F.layer_norm over one vector, in plain JS (biased
// variance, eps = 1e-5 as model.py:27 passes it), then the weight, no bias.
function layerNorm(x, weight, eps = 1e-5) {
  const n = x.length;
  const mean = x.reduce((s, v) => s + v, 0) / n;
  const variance = x.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance + eps);
  const xhat = x.map(v => (v - mean) / std);
  return { mean, variance, std, centered: x.map(v => v - mean), xhat, y: xhat.map((v, i) => weight[i] * v) };
}
const truths = presets.map(p => layerNorm(p.x, gamma));
const [ref, shifted, scaled] = truths;
const maxGap = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

const close = (actual, expected, tol, what) => {
  assert.equal(actual.length, expected.length, `${what}: length`);
  actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= tol, `${what}[${i}]: ${v} vs ${expected[i]}`));
};
const obj = (result, id) => result.state.objects.find(o => o.id === id);
const sceneObj = (result, id) => result.scene.objects.find(o => o.id === id);

const results = assertCardGates(scene, STATES);

test('the question comes first and is concise', () => {
  const [first] = scene.objects;
  assert.equal(first.semanticId, 'question');
  assert.ok(first.initialState.text.length <= 95, `${first.initialState.text.length} chars`);
});

test('the presets really are x0, x0 + 3 and 2 · x0', () => {
  const [x, shift, scale] = presets.map(p => p.x);
  close(shift, x.map(v => v + 3), 1e-9, 'x + 3');
  close(scale, x.map(v => 2 * v), 1e-9, '2 · x');
  assert.equal(fx.layernorm.eps, 1e-5);
  assert.deepEqual(scene.exampleData.presets, ['x₀', 'x₀ + 3', '2 · x₀']);
});

test('every displayed number matches an independent LayerNorm at every state', () => {
  results.forEach((result, i) => {
    const preset = presets[i];
    const truth = truths[i];
    // The fixture agrees with the oracle...
    assert.ok(Math.abs(preset.mean - truth.mean) < 1e-4);
    assert.ok(Math.abs(preset.var - truth.variance) < 1e-4);
    assert.ok(Math.abs(preset.std - truth.std) < 1e-4);
    // ...and the card shows it.
    close(obj(result, 'x-strip').values, preset.x, 1e-9, `x @${i}`);
    close(obj(result, 'centered-strip').values, truth.centered, 1e-5, `x - mean @${i}`);
    close(obj(result, 'xhat-strip').values, truth.xhat, 1e-4, `xhat @${i}`);
    close(obj(result, 'y-strip').values, truth.y, 1e-3, `y @${i}`); // live op rounds to 3 decimals
    close(obj(result, 'gamma-strip').values, gamma, 0, 'gamma');
    // The live check row is x-hat(selected) - x-hat(x0): zero, as the oracle says it must be at 4 decimals.
    assert.ok(maxGap(truth.xhat, ref.xhat) < 5e-5, `oracle x-hat gap @${i}`);
    assert.deepEqual(obj(result, 'check-strip').values, [0, 0, 0, 0, 0, 0], `check row @${i}`);
    assert.equal(obj(result, 'x-read').label, `Selected preset: “${name(preset.label)}” (stored)`);
    assert.equal(obj(result, 'x-strip').label, `x = ${name(preset.label)}: the vector going into LayerNorm`);
    assert.equal(obj(result, 'mean-read').label, `① subtract the mean:  mean = ${preset.mean}`);
    assert.equal(obj(result, 'std-read').label, `② divide by std = √(var + eps) = ${preset.std}`);
    assert.equal(obj(result, 'std-detail').label, `var = ${preset.var} (mean of (x − mean)², ÷ n) · eps = 0.00001`);
  });
});

test('the reference state does not compare x0 with itself; the others show x0', () => {
  const [a, b, c] = results;
  assert.match(obj(a, 'mean-ref').label, /is the reference preset/);
  assert.match(obj(a, 'std-ref').label, /is the reference preset/);
  for (const other of [b, c]) {
    assert.equal(obj(other, 'mean-ref').label, `x₀ for comparison: mean = ${presets[0].mean}`);
    assert.equal(obj(other, 'std-ref').label, `x₀ for comparison: std = ${presets[0].std}`);
  }
});

// Every claim the verdicts and the evidence make about what changes, checked
// against the oracle rather than against the card's own numbers.
test('the claims about what changes are true', () => {
  const differs = (u, v) => Math.abs(u - v) > 1e-6;
  // Shift: x and mean change; x - mean, var and std do not.
  assert.ok(differs(shifted.mean, ref.mean));
  assert.ok(maxGap(shifted.centered, ref.centered) < 1e-9);
  assert.ok(!differs(shifted.variance, ref.variance) && !differs(shifted.std, ref.std));
  assert.ok(maxGap(shifted.xhat, ref.xhat) < 1e-9, 'shift: x-hat identical');
  // Rescale: x, mean, x - mean, var and std change; x-hat only up to eps.
  assert.ok(differs(scaled.mean, ref.mean) && differs(scaled.variance, ref.variance) && differs(scaled.std, ref.std));
  assert.ok(maxGap(scaled.centered, ref.centered) > 1e-3);
  const gap = maxGap(scaled.xhat, ref.xhat);
  assert.ok(gap > 0 && gap < 5e-5, `rescale: x-hat equal to 4 decimals but not exactly (gap ${gap})`);
  // What the card and the record say.
  const [a, b, c] = results.map(r => `${obj(r, 'verdict').label} ${obj(r, 'verdict-2').label}`);
  assert.match(a, /zero by definition/);
  assert.match(a, /move x and its mean \(std too, for 2 · x₀\)/);
  assert.match(b, /removed the shift exactly; std did not move/);
  assert.match(c, /matches x̂ for x₀/);
  assert.match(c, /up to eps/);
  assert.match(evidence.consequence, /Shift \(x₀ \+ 3\): x and the mean change; x - mean, var and std do not/);
  assert.match(evidence.consequence, /Rescale \(2 · x₀\): x, mean, x - mean, var and std all change/);
  assert.match(evidence.consequence, /identical for the shift and equal to displayed precision for the rescale/);
  // std readouts on the card agree: same for the shift, different for the rescale.
  assert.equal(obj(results[0], 'std-read').label, obj(results[1], 'std-read').label);
  assert.notEqual(obj(results[0], 'std-read').label, obj(results[2], 'std-read').label);
});

test('x-hat, y and their colour scale do not move between presets; x does', () => {
  const [a, ...others] = results;
  for (const other of others) {
    for (const id of ['xhat-strip', 'y-strip']) {
      assert.deepEqual(obj(other, id).values, obj(a, id).values, id);
      assert.deepEqual(sceneObj(other, id).valueDomain, sceneObj(a, id).valueDomain, `${id} domain`);
    }
    assert.notDeepEqual(obj(other, 'x-strip').values, obj(a, 'x-strip').values);
  }
});

test('source lines are quoted one per code object, with their citations', () => {
  const text = scene.objects.map(o => o.initialState.text || '').join('\n');
  assert.match(text, /x = x \+ self\.attn\(self\.ln_1\(x\)\) {3}# model\.py:104/);
  assert.match(text, /x = x \+ self\.mlp\(self\.ln_2\(x\)\) {3}# model\.py:105/);
  assert.match(text, /model\.py:131, applied after the last Block at :182/);
  assert.match(text, /bias = True \(model\.py:225\)/);
  assert.match(text, /train\.py:56/);
});

test('evidence record is complete', () => {
  assertEvidence(evidence);
  assert.equal(evidence.sourceRevision, `karpathy/nanoGPT @ ${fx.provenance.nanogpt.commit}`);
});
