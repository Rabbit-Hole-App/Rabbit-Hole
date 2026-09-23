import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { scene, evidence, sources } from './c20-optimizer.js';
import { assertCardGates, assertEvidence, assertSources } from '../card-gates.mjs';

const opt = fx.optimizer;
const STATES = [0, 1, 2, 3].map(optimizer => ({ optimizer }));
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const r3 = v => { const r = Math.round(v * 1000) / 1000; return Object.is(r, -0) ? 0 : r; };
const updateOf = id => opt.optimizers.find(entry => entry.id === id).updateInLr;
const [W1, W2, W3, B] = [0, 1, 2, 3];

test('c20-optimizer passes every gate at every optimizer preset', () => {
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.ok(scene.objects[0].initialState.text.length <= 95);
  assert.ok(!scene.objects.some(object => object.type === 'tokens'), 'no second option row inside the visual');
  assertCardGates(scene, STATES);
});

test('displayed rows are the fixture rows for the selected preset, beside the SGD baseline', () => {
  const sgd = opt.optimizers[0];
  assertCardGates(scene, STATES).forEach((result, k) => {
    const entry = opt.optimizers[k];
    const label = scene.exampleData.optimizerLabels[k];
    assert.deepEqual(byId(result, 'update-grid').values, [...sgd.updateInLr, ...entry.updateInLr].map(r3), `update rows at ${k}`);
    assert.deepEqual(byId(result, 'sgd-bars').values, sgd.absUpdateInLr);
    assert.deepEqual(byId(result, 'step-bars').values, entry.updateInLr.map(Math.abs), `bars are |update| at ${k}`);
    // One scale per preset: the peak is the largest bar across both rows.
    const peak = Math.max(...sgd.absUpdateInLr, ...entry.absUpdateInLr);
    assert.equal(byId(result, 'sgd-bars').peak, peak);
    assert.equal(byId(result, 'step-bars').peak, peak);
    assert.deepEqual(byId(result, 'grad-grid').values, [...opt.lastGradient, ...opt.gradientMean, ...opt.gradientRms]);
    assert.equal(byId(result, 'selected').label, `Selected: ${label}`);
    assert.equal(byId(result, 'step-bars').label, `Selected ${label}: |Δθ| ÷ lr`);
    opt.params.forEach((param, i) => assert.ok(byId(result, `param-${i}`).label.endsWith(`θ starts at ${param.theta}`)));
  });
  // Only the AdamW label is the card's own words; the others are the fixture's.
  scene.exampleData.optimizerLabels.forEach((label, k) => {
    if (opt.optimizers[k].id !== 'adamw') assert.equal(label, opt.optimizers[k].label);
  });
});

// Independent oracle: the grid's mean and RMS rows, recomputed from the raw
// 20-step gradient history, and the contrast the Adam lines point at.
test('mean and RMS rows are statistics of the gradient history (independent oracle)', () => {
  const history = opt.gradientHistory;
  assert.equal(history.length, opt.steps);
  const r4 = v => Math.round(v * 1e4) / 1e4;
  const close = (a, b, what) => assert.ok(Math.abs(a - b) <= 1e-4 + 1e-9, `${what}: ${a} vs ${b}`);
  opt.params.forEach((_, i) => {
    const column = history.map(step => step[i]);
    // History entries are themselves rounded to 4 dp, so allow one unit of rounding.
    close(r4(Math.sqrt(column.reduce((sum, g) => sum + g * g, 0) / column.length)), opt.gradientRms[i], `rms[${i}]`);
    close(r4(column.reduce((sum, g) => sum + g, 0) / column.length), opt.gradientMean[i], `mean[${i}]`);
  });
  assert.deepEqual(history.at(-1), opt.lastGradient);
  const ratio = i => Math.abs(opt.gradientMean[i]) / opt.gradientRms[i];
  // Steady: mean ~ RMS, so Adam steps ~ one lr. Noisy w3: |mean| under half its RMS.
  for (const i of [W1, W2, B]) assert.ok(ratio(i) > 0.98, `steady ${i}: |mean|/RMS ${ratio(i)}`);
  assert.ok(ratio(W3) < 0.5, `noisy w3: |mean|/RMS ${ratio(W3)}`);
  assert.ok(Math.abs(opt.gradientRms[W3] - 1) < 0.1, `noisy w3: RMS about one, ${opt.gradientRms[W3]}`);
});

// Independent oracle: what each update rule must do to these gradients,
// checked in plain JS against the fixture's stored results.
test('each stored update obeys its rule (independent oracle)', () => {
  const [sgd, momentum, adam, adamw] = ['sgd', 'momentum', 'adam', 'adamw'].map(updateOf);
  // SGD: delta / lr = -g, exactly.
  sgd.forEach((u, i) => assert.equal(u, -opt.lastGradient[i]));
  assert.ok(Math.abs(sgd[W1]) > 90 * Math.abs(sgd[W2]), 'SGD: w1 moves ~100x more than w2');
  // Momentum: a steady gradient accumulates to mean * (1 - beta^T) / (1 - beta).
  const beta = Number(/momentum (\d*\.\d+)/.exec(opt.optimizers[1].label)[1]);
  const pile = (1 - beta ** opt.steps) / (1 - beta);
  for (const i of [W1, W2, B]) {
    const expected = -opt.gradientMean[i] * pile;
    assert.ok(Math.abs(momentum[i] - expected) < 0.03 * Math.abs(expected), `momentum[${i}] ${momentum[i]} vs ${expected}`);
    assert.ok(Math.abs(momentum[i]) > 5 * Math.abs(sgd[i]), `momentum[${i}] piles far past SGD`);
  }
  // Noisy w3: m has the mean row's sign, not the latest g's, so it steps opposite to SGD.
  assert.ok(Math.sign(opt.gradientMean[W3]) !== Math.sign(opt.lastGradient[W3]), 'the mean and latest g of w3 disagree in sign');
  assert.equal(Math.sign(momentum[W3]), -Math.sign(opt.gradientMean[W3]));
  assert.equal(Math.sign(momentum[W3]), -Math.sign(sgd[W3]));
  // Adam: steady params step about one lr whatever the gradient scale; noisy w3 about half.
  for (const i of [W1, W2, B]) assert.ok(Math.abs(Math.abs(adam[i]) - 1) < 0.02, `adam[${i}] = ${adam[i]}`);
  assert.ok(Math.abs(adam[W3]) > 0.35 && Math.abs(adam[W3]) < 0.65, `adam w3 about half: ${adam[W3]}`);
  assert.equal(Math.sign(adam[W3]), -Math.sign(sgd[W3]), 'Adam w3 also steps opposite to SGD');
  // AdamW - Adam = -wd * theta on weights (theta ~ theta0 + 19 Adam-sized steps); b is exempt.
  assert.equal(adamw[B], adam[B]);
  assert.equal(opt.params[B].decay, false);
  for (const i of [W1, W2]) {
    const theta = opt.params[i].theta + opt.lr * (opt.steps - 1) * adamw[i];
    assert.ok(Math.abs((adamw[i] - adam[i]) + opt.weightDecay * theta) < 0.005, `decay[${i}]`);
  }
  // The decay pull is opposite in sign to each weight's starting value (none crosses zero here).
  for (const i of [W1, W2, W3]) assert.equal(Math.sign(adamw[i] - adam[i]), -Math.sign(opt.params[i].theta), `decay sign ${i}`);
});

test('the Adam / + decay / = AdamW grid is a live calculation that adds up, identical in every state', () => {
  const adam = updateOf('adam'), adamw = updateOf('adamw');
  const decay = adamw.map((u, i) => r3(u - adam[i]));
  const expected = [...adam.map(r3), ...decay, ...adamw.map(r3)];
  for (const result of assertCardGates(scene, STATES)) assert.deepEqual(byId(result, 'decay-grid').values, expected);
  adam.forEach((u, i) => assert.ok(Math.abs(r3(u) + decay[i] - r3(adamw[i])) <= 0.0011, `Adam + decay = AdamW at ${i}`));
  assert.equal(decay[B], 0);
});

test('explanations are words only and follow the selection', () => {
  assertCardGates(scene, STATES).forEach((result, k) => {
    const lines = [0, 1, 2, 3, 4, 5].map(line => byId(result, `explain-${line}`).label);
    assert.deepEqual(lines, scene.exampleData.explanations[k]);
    for (const line of lines) assert.doesNotMatch(line, /[0-9]/, `explanation carries a typed number: ${line}`);
  });
});

test('the bias note is bound to the resolved source value', () => {
  assert.equal(fx.architecture.bias, false);
  const [result] = assertCardGates(scene, [{ optimizer: 0 }]);
  assert.match(byId(result, 'exempt-note-2').label, /bias = False/);
});

test('betas, wd and grad_clip are the fx.config source values, and the toy run used them', () => {
  const { defaults, shakespeareChar } = fx.config;
  assert.deepEqual(opt.betas, [defaults.beta1, defaults.beta2], 'toy Adam betas are the train.py defaults');
  assert.equal(opt.weightDecay, defaults.weight_decay);
  assert.notEqual(shakespeareChar.beta2, defaults.beta2, 'the char config overrides beta2');
  const [result] = assertCardGates(scene, [{ optimizer: 0 }]);
  const label = id => byId(result, id).label;
  assert.ok(label('settings-note').includes(`betas (${defaults.beta1}, ${defaults.beta2}) and wd ${defaults.weight_decay} are source values`));
  assert.ok(label('settings-note').endsWith(`lr ${opt.lr} is a toy choice.`));
  assert.ok(label('beta2-note').includes(`beta2 to ${shakespeareChar.beta2};`));
  assert.ok(label('beta2-note').endsWith(`the toy keeps ${defaults.beta2}.`));
  assert.ok(label('clip-note').includes(`gradient norm to ${defaults.grad_clip} before each step`));
  assert.ok(label('decay-note-2').includes(`(wd ${defaults.weight_decay})`));
  assert.ok(!scene.objects.some(object => object.type === 'code'), 'no code listings on the card: they are sources');
});

test('sources: code citations, toy provenance and the status labels the card shows', () => {
  assertSources(sources, scene);
  const cites = sources.filter(entry => entry.kind === 'code').map(entry => `${entry.path}:${entry.lines.join('-')}`);
  for (const cite of ['model.py:284-284', 'model.py:268-275', 'model.py:23-23', 'train.py:56-56', 'train.py:60-63',
    'config/train_shakespeare_char.py:31-31', 'train.py:307-309']) assert.ok(cites.includes(cite), `cites ${cite}`);
  assert.equal(cites[0], 'model.py:284-284', 'the AdamW line comes first');
  const statuses = sources.filter(entry => entry.kind === 'calculation').map(entry => entry.status);
  assert.deepEqual([...new Set(statuses)].sort(), ['Calculated toy example', 'Live calculation', 'Source value']);
});

// Source quotes in the sources' notes, checked against the sha256-pinned
// NanoGPT files that generate_fixtures.py caches. Skipped where that cache is absent.
const cached = path => {
  const sha = fx.provenance.nanogpt.files[path];
  const file = join(tmpdir(), 'nanogpt-fixture-cache', sha);
  if (!existsSync(file)) return null;
  const bytes = readFileSync(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha, `${path} cache is not the pinned file`);
  return bytes.toString('utf8').split('\n');
};
const files = { 'model.py': cached('model.py'), 'train.py': cached('train.py'), 'config/train_shakespeare_char.py': cached('config/train_shakespeare_char.py') };
test('source quotes and line numbers match NanoGPT @3adf61e', { skip: !Object.values(files).every(Boolean) && 'pinned source cache absent' }, () => {
  // Every "quoted" span in a code note sits inside the lines that entry cites.
  for (const { path, lines: [start, end], note } of sources.filter(entry => entry.kind === 'code')) {
    const cited = files[path].slice(start - 1, end).join('\n');
    const quotes = [...note.matchAll(/"([^"]+)"/g)].map(match => match[1]);
    assert.ok(quotes.length, `${path}:${start} note quotes the source`);
    for (const quote of quotes) assert.ok(cited.includes(quote), `${path}:${start}-${end} does not contain "${quote}"`);
  }
  const { 'model.py': model, 'train.py': train, 'config/train_shakespeare_char.py': config } = files;
  assert.match(model[263 - 1], /def configure_optimizers/);
  assert.match(model[270 - 1], /p\.dim\(\) >= 2/);
  assert.match(model[271 - 1], /p\.dim\(\) < 2/);
  assert.match(model[274 - 1], /'weight_decay': 0\.0/);
  assert.ok(!config.some(line => /^bias\s*=/.test(line)), 'the char config keeps bias');
  // Every fx.config value the card shows sits on the line its source cites.
  const value = (lines, line, name) => Number(new RegExp(`^${name} = ([0-9.e-]+)`).exec(lines[line - 1])[1]);
  const { defaults, shakespeareChar } = fx.config;
  assert.equal(value(train, 60, 'weight_decay'), defaults.weight_decay);
  assert.equal(value(train, 61, 'beta1'), defaults.beta1);
  assert.equal(value(train, 62, 'beta2'), defaults.beta2);
  assert.equal(value(train, 63, 'grad_clip'), defaults.grad_clip);
  assert.equal(value(config, 31, 'beta2'), shakespeareChar.beta2);
  assert.match(train[311 - 1], /scaler\.step\(optimizer\)/);
});

test('evidence record is complete', () => {
  assertEvidence(evidence);
});
