import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { assertCardGates, assertEvidence, assertSources } from '../card-gates.mjs';
import { scene, evidence, sources } from './c15-layernorm.js';

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

// Every line the card used to cite is now a source entry, and each note that
// quotes a line quotes it verbatim (checked against the pinned files below).
test('sources: provenance lives under the card, not on it', () => {
  assertSources(sources, scene);
  const at = (path, lines) => sources.find(s => s.kind === 'code' && s.path === path && s.lines.join('-') === lines.join('-'));
  for (const [path, lines, quoted] of [
    ['model.py', [18, 27], 'return F.layer_norm(input, self.weight.shape, self.weight, self.bias, 1e-5)'],
    ['model.py', [23, 23], 'self.weight = nn.Parameter(torch.ones(ndim))'],
    ['model.py', [24, 24], 'self.bias = nn.Parameter(torch.zeros(ndim)) if bias else None'],
    ['train.py', [56, 56], 'bias = False # do we use bias inside LayerNorm and Linear layers?'],
    ['model.py', [225, 225], "config_args['bias'] = True # always True for GPT model checkpoints"],
    ['model.py', [104, 105], 'x = x + self.attn(self.ln_1(x))'],
    ['model.py', [98, 100], 'ln_1'],
    ['model.py', [131, 131], 'ln_f'],
    ['model.py', [182, 182], 'x = self.transformer.ln_f(x)'],
    ['config/train_shakespeare_char.py', [24, 24], `n_embd = ${fx.architecture.n_embd}`],
  ]) {
    const entry = at(path, lines);
    assert.ok(entry, `cites ${path}:${lines.join('-')}`);
    assert.ok(entry.note.includes(quoted), `${path}:${lines.join('-')} note has "${quoted}"`);
  }
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Calculated toy example', 'Live calculation']);
  // The residual add stays on the card as maths, without the code listing.
  const shown = results[0].state.objects.filter(o => o.visible && o.label).map(o => o.label).join(' | ');
  assert.match(shown, /x ← x \+ attn\(ln_1\(x\)\), {2}then {2}x ← x \+ mlp\(ln_2\(x\)\)/);
});

// The sha256-pinned NanoGPT files generate_fixtures.py caches; the line check
// is skipped where that cache is absent.
const cached = path => {
  const sha = fx.provenance.nanogpt.files[path];
  const file = sha && join(tmpdir(), 'nanogpt-fixture-cache', sha);
  if (!file || !existsSync(file)) return null;
  const bytes = readFileSync(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha, `${path} cache is not the pinned file`);
  return bytes.toString('utf8').split('\n');
};
// Entries whose note paraphrases instead of quoting: what the cited lines must hold.
const UNQUOTED = { 'model.py:98-100': ['self.ln_1 = LayerNorm', 'self.ln_2 = LayerNorm'], 'model.py:131-131': ['ln_f = LayerNorm'] };

test('sources: what each code entry quotes is inside its cited lines', () => {
  for (const { path, lines: [start, end], note } of sources.filter(s => s.kind === 'code')) {
    const quotes = [...note.matchAll(/“([^”]+)”/g)].map(m => m[1]);
    const expected = quotes.length ? quotes : UNQUOTED[`${path}:${start}-${end}`];
    assert.ok(expected, `${path}:${start}-${end} quotes its line or is listed in UNQUOTED`);
    const file = cached(path);
    if (!file) continue;
    const cited = file.slice(start - 1, end).join('\n');
    for (const quote of expected) assert.ok(cited.includes(quote), `${path}:${start}-${end} contains "${quote}"`);
  }
});

test('evidence record is complete', () => {
  assertEvidence(evidence);
  assert.equal(evidence.sourceRevision, `karpathy/nanoGPT @ ${fx.provenance.nanogpt.commit}`);
});
