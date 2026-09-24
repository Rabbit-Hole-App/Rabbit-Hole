import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import tl from '../fixtures/training-loss.generated.js';
import * as deep from './deep.js';
import * as guided from './guided.js';
import * as overview from './overview.js';
import { assertCardGates, assertEvidence, assertSources } from '../../card-gates.mjs';

const { scene, sources, evidence, reviewStates } = deep;
const CFG = Object.fromEntries(tl.iteration.configs.map(c => [c.id, c]));
const byId = (result, id) => result.state.objects.find(object => object.id === id);
// Independent oracle: get_lr's three branches written from its definition.
const getLr = (c, it) => {
  if (it < c.warmupIters) return c.learningRate * (it + 1) / (c.warmupIters + 1);
  if (it > c.lrDecayIters) return c.minLr;
  const ratio = (it - c.warmupIters) / (c.lrDecayIters - c.warmupIters);
  return c.minLr + 0.5 * (1 + Math.cos(Math.PI * ratio)) * (c.learningRate - c.minLr);
};
const branchOf = (c, it) => (it < c.warmupIters ? 0 : it > c.lrDecayIters ? 2 : 1);

test('deep passes every gate at every reviewed state; two controls, one of them a branch', () => {
  assert.equal(scene.objects[0].semanticId, 'question');
  const results = assertCardGates(scene, reviewStates);
  assert.deepEqual(scene.inputs.map(d => d.type), ['index', 'choice']);
  assert.ok(scene.objects.filter(o => o.type === 'equation').length >= 5);
  assert.ok(!scene.objects.some(o => o.type === 'code'), 'no code listing on the card');
  assert.match(byId(results[0], 'prerequisites').label, /^Builds on: Guided/);
  const shown = results[0].state.objects.filter(o => o.visible && o.label).map(o => o.label).join('\n');
  assert.doesNotMatch(shown, /beginner|intermediate|advanced|expert|newcomer/i);
});

test('resolved configs agree with train.py and the config files', () => {
  const char = CFG.char, gpt2 = CFG.gpt2;
  const sc = fx.config.shakespeareChar, d = fx.config.defaults;
  assert.deepEqual([char.batchSize, char.blockSize, char.learningRate, char.minLr, char.warmupIters, char.lrDecayIters, char.maxIters, char.evalInterval, char.alwaysSaveCheckpoint, char.gradClip, char.weightDecay, ...char.betas],
    [sc.batch_size, sc.block_size, sc.learning_rate, sc.min_lr, sc.warmup_iters, sc.lr_decay_iters, sc.max_iters, sc.eval_interval, sc.always_save_checkpoint, sc.grad_clip, sc.weight_decay, sc.beta1, sc.beta2]);
  assert.equal(char.vocabSize, fx.architecture.vocab_size);
  // train_gpt2 keeps train.py's optimizer and schedule defaults ...
  assert.deepEqual([gpt2.learningRate, gpt2.minLr, gpt2.warmupIters, gpt2.alwaysSaveCheckpoint, gpt2.gradClip, ...gpt2.betas],
    [d.learning_rate, d.min_lr, d.warmup_iters, d.always_save_checkpoint, d.grad_clip, d.beta1, d.beta2]);
  // ... and its own header comment: "12 batch size * 1024 block size * 5 gradaccum * 8 GPUs = 491,520".
  assert.equal(gpt2.batchSize * gpt2.blockSize * gpt2.gradAccumPerProcess * gpt2.worldSize, 491520);
  assert.equal(gpt2.gradAccumConfigured / gpt2.worldSize, gpt2.gradAccumPerProcess);
  assert.equal(gpt2.vocabSize, 50304);
  for (const c of [char, gpt2]) {
    assert.ok(Math.abs(c.lnVocab - Math.log(c.vocabSize)) < 1e-4);
    assert.equal(c.maxIters, c.lrDecayIters, 'so the floor branch is only a what-if');
  }
});

test('every (config, iteration) shows the right branch, learning rate, eval rule and lesson', () => {
  const states = ['char', 'gpt2'].flatMap(config => [0, 1, 2, 3, 4, 5].map(stop => ({ stop, config })));
  const results = assertCardGates(scene, states);
  results.forEach((result, n) => {
    const { stop, config } = states[n];
    const c = CFG[config];
    const s = c.stops[stop];
    const it = s.iteration;
    const lr = getLr(c, it);
    assert.ok(Math.abs(s.lr - lr) < 5e-10, `${config} ${it} lr (stored to 9 decimals)`);
    // 4 significant figures: train_gpt2's last warmup value 5.997e-4 must not read as the 6.000e-4 peak.
    assert.equal(s.lrText, lr.toExponential(3));
    assert.equal(byId(result, 'get-lr').label, `get_lr(${it}) = ${lr.toExponential(3)}`);
    const branch = branchOf(c, it);
    [0, 1, 2].forEach(k => assert.equal(byId(result, `branch-${k}`).role, k === branch ? 'output' : 'neutral'));
    const eq = byId(result, 'lr-eq').label;
    if (branch === 0) assert.ok(eq.includes(`t=${it},\\ W=${c.warmupIters}`));
    if (branch === 1) assert.ok(eq.endsWith(`r=${(it - c.warmupIters) / (c.lrDecayIters - c.warmupIters)}`));
    if (branch === 2) assert.ok(eq.includes(`t=${it}>D=${c.lrDecayIters}`));
    // estimate_loss: it % eval_interval == 0, never past max_iters; no save at it = 0.
    const reached = it <= c.maxIters;
    const runs = reached && it % c.evalInterval === 0;
    assert.equal(byId(result, 'estimate').label, `estimate_loss(): ${runs ? 'runs' : 'skipped'}`);
    assert.equal(byId(result, 'estimate').role, runs ? 'success' : 'neutral');
    assert.ok(byId(result, 'eval-line').label.startsWith(`${it} % ${c.evalInterval} = ${it % c.evalInterval}: ${runs ? 'runs' : 'skipped'}`));
    if (runs && it === 0) assert.match(byId(result, 'eval-line').label, /saves nothing: the save needs iter_num > 0$/);
    if (runs && it > 0) assert.match(byId(result, 'eval-line').label, c.alwaysSaveCheckpoint ? /always_save_checkpoint = True/ : /only if val < best_val_loss/);
    assert.equal(byId(result, 'lr-status').label, reached ? 'Source value' : 'What-if');
    // The stop's lesson, with its arithmetic checked.
    const note = `${byId(result, 'note-a').label} ${byId(result, 'note-b').label}`;
    const text = x => x.toExponential(3);
    const expected = [
      [c.learningRate / (c.warmupIters + 1), `ln V = ln ${c.vocabSize} = ${Math.log(c.vocabSize).toFixed(2)}`],
      [c.learningRate * c.warmupIters / (c.warmupIters + 1), `η = ${c.learningRate.toExponential(0)}`],
      [c.learningRate, 'the peak'],
      [(c.learningRate + c.minLr) / 2, 'cos(π/2) = 0'],
      [c.minLr, 'iter_num > max_iters ends the loop'],
      [c.minLr, `lr_decay_iters = max_iters = ${c.maxIters}`],
    ][stop];
    assert.ok(Math.abs(lr - expected[0]) < 1e-12, `${config} stop ${stop}: the note's formula gives lr`);
    assert.ok(note.includes(text(expected[0])) && note.includes(expected[1]), `${config} stop ${stop} note: ${note}`);
    assert.equal(byId(result, 'note-a').role, [0, 5].includes(stop) ? 'warning' : 'neutral');
    if (stop === 5) assert.ok(!reached && it === c.lrDecayIters + 1);
    if (stop === 1) assert.notEqual(text(lr), text(c.learningRate), 'the last warmup value reads below the peak');
  });
});

test('shapes and live products match the oracle for both configs', () => {
  const results = assertCardGates(scene, [{ config: 'char' }, { config: 'gpt2' }]);
  results.forEach((result, n) => {
    const c = CFG[['char', 'gpt2'][n]];
    const [B, T, V, M, P] = [c.batchSize, c.blockSize, c.vocabSize, c.gradAccumPerProcess, c.worldSize];
    assert.equal(byId(result, 'shapes').label, `X, Y: (B, T) = (${B}, ${T})   →   logits: (B, T, V) = (${B}, ${T}, ${V})`);
    // ignore_index=-1 would drop targets of -1 from the mean; get_batch reads uint16 tokens, so there are none and N = B*T.
    assert.equal(byId(result, 'flatten').label, `view(−1, V): (B·T, V) = (${B * T}, ${V}); get_batch emits no −1, so N = B·T`);
    // The mean runs over the targets that are not -1 - exactly ignore_index's rule.
    assert.equal(byId(result, 'loss-eq').label, '\\mathcal{L}_m=-\\tfrac1N\\sum_{i:\\,y_i\\neq-1}\\ln\\mathrm{softmax}(z_i)[y_i]');
    // Summed over the M micro-steps of each process, averaged over the P processes (DDP).
    assert.ok(byId(result, 'accum-eq').label.startsWith('g=\\frac1P\\sum_{p,m}') && byId(result, 'accum-eq').label.endsWith(`P=${P},\\ M=${M}`));
    assert.equal(byId(result, 'loop-label').label, `micro-steps: M = ${M}`);
    // Counts grouped in thousands, as train.py prints tokens_per_iter with "{tokens_per_iter:,}".
    const grouped = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    assert.equal(byId(result, 'tokens').label, `Tokens per iteration = M·P·B·T = ${M}·${P}·${B}·${T} = ${grouped(M * P * B * T)}, as printed at start-up (Source value)`);
    // Memory holds one micro-step's activations; the logits are only part of them.
    assert.equal(byId(result, 'memory').label, `Tradeoff: memory holds one micro-step’s activations (the logits alone are B·T·V = ${grouped(B * T * V)} values),`);
    // DDP averages the P processes' gradients, so one step's gradient covers M·P·B sequences (491,520 / 1024 = 480 for train_gpt2).
    assert.equal(byId(result, 'memory-2').label, `and time pays for M = ${M} of them in a row; each step’s gradient averages M·P·B = ${M * P * B} sequences (Live calculation).`);
    // Without accumulation one process runs all M*B sequences in one pass: M times the logits of one micro-step.
    assert.equal(byId(result, 'memory-3').label, `Without accumulation one process would hold all M·B = ${M * B} sequences at once (logits: M·B·T·V = ${grouped(M * B * T * V)} values).`);
    if (c.id === 'gpt2') assert.deepEqual([M * B, grouped(M * B * T * V), grouped(B * T * V)], [60, '3,090,677,760', '618,135,552']);
    assert.equal(M * P * B * T, M * P * B * c.blockSize);
    if (c.id === 'gpt2') assert.equal(grouped(M * P * B * T), '491,520', 'the figure in config/train_gpt2.py’s own comment');
    assert.equal(byId(result, 'decay').label, `λ = ${c.weightDecay} only where dim ≥ 2 (weights, embeddings); betas (${c.betas.join(', ')})`);
  });
});

test('every step on the card has a code source', () => {
  const has = (path, line) => sources.some(s => s.kind === 'code' && s.path === path && s.lines[0] <= line && line <= s.lines[1]);
  const steps = {
    'get-lr': [['train.py', 233], ['train.py', 258]],
    estimate: [['train.py', 263], ['train.py', 276], ['train.py', 216]],
    forward: [['train.py', 300], ['model.py', 186]],
    loss: [['model.py', 187], ['train.py', 120], ['train.py', 125]],
    backward: [['train.py', 298], ['train.py', 301], ['train.py', 305]],
    clip: [['train.py', 309]],
    step: [['train.py', 311], ['model.py', 270]],
    zero: [['train.py', 314]],
  };
  for (const [step, cites] of Object.entries(steps)) {
    assert.ok(scene.objects.some(o => o.id === step && o.type === 'box'), step);
    for (const [path, line] of cites) assert.ok(has(path, line), `${step}: ${path}:${line}`);
  }
  const codeCount = card => card.sources.filter(s => s.kind === 'code').length;
  assert.ok(codeCount(deep) > codeCount(guided) && codeCount(guided) > codeCount(overview), 'the most code sources at the deepest level');
});

// Every “quoted” fragment in a code source is in its cited lines of the
// sha-pinned file (fetched into the generators' cache by gen_training_loss.py).
test('code quotes of all three cards hold at the pinned revision', t => {
  const cache = join(tmpdir(), 'nanogpt-fixture-cache');
  const files = tl.provenance.nanogpt.files;
  const missing = Object.values(files).filter(sha => !existsSync(join(cache, sha)));
  if (missing.length) return t.skip('run gen_training_loss.py once to fetch the pinned files');
  for (const card of [overview, guided, deep]) {
    for (const source of card.sources.filter(s => s.kind === 'code')) {
      const sha = files[source.path];
      assert.ok(sha, `${source.path} is pinned`);
      const bytes = readFileSync(join(cache, sha));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), sha);
      const lines = bytes.toString('utf8').split('\n');
      assert.ok(source.lines[1] <= lines.length, `${source.path}:${source.lines} within the file`);
      const cited = lines.slice(source.lines[0] - 1, source.lines[1]).join(' ').replace(/\s+/g, ' ');
      for (const [, quote] of source.note.matchAll(/“([^”]+)”/g)) {
        assert.ok(cited.includes(quote.replace(/\s+/g, ' ')), `${card.scene.id} ${source.path}:${source.lines}: “${quote}”`);
      }
    }
  }
});

test('sources and evidence', () => {
  assertSources(sources, scene);
  assertEvidence(evidence);
  assert.equal(evidence.depth, 'Deep dive');
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Source value', 'Live calculation']);
  assert.match(sources.find(s => s.status === 'Source value').reproduce, /gen_training_loss\.py --check$/);
});
