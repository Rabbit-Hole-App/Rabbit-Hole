import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import tl from '../fixtures/training-loss.generated.js';
import { groupDigits } from '../../../scene-format.js';
import { sceneContentBounds, sceneLegibility } from '../../../scene-layout.js';
import * as deep from './deep.js';
import * as guided from './guided.js';
import * as overview from './overview.js';
import { assertCardGates, assertEvidence, assertSources, evaluated } from '../../card-gates.mjs';

const { scene, sources, evidence, reviewStates } = deep;
const CFG = Object.fromEntries(tl.iteration.configs.map(c => [c.id, c]));
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const onScreen = result => result.state.objects.filter(object => object.visible).map(object => object.id).sort();
// Independent oracle: get_lr's three branches written from its definition.
const getLr = (c, it) => {
  if (it < c.warmupIters) return c.learningRate * (it + 1) / (c.warmupIters + 1);
  if (it > c.lrDecayIters) return c.minLr;
  const ratio = (it - c.warmupIters) / (c.lrDecayIters - c.warmupIters);
  return c.minLr + 0.5 * (1 + Math.cos(Math.PI * ratio)) * (c.learningRate - c.minLr);
};
const branchOf = (c, it) => (it < c.warmupIters ? 0 : it > c.lrDecayIters ? 2 : 1);

test('deep passes every gate at every reviewed state; a pager and two controls, one of them a branch', () => {
  assert.equal(scene.objects[0].semanticId, 'question');
  const results = assertCardGates(scene, reviewStates);
  assert.deepEqual(scene.inputs.map(d => [d.name, d.type, d.presentation]), [['part', 'index', 'pager'], ['stop', 'index', 'picker'], ['config', 'choice', undefined]]);
  assert.deepEqual(scene.inputs[0], { name: 'part', type: 'index', label: 'Deep dive', of: 'parts', default: 0, presentation: 'pager' });
  assert.ok(scene.objects.filter(o => o.type === 'equation').length >= 5);
  assert.ok(!scene.objects.some(o => o.type === 'code'), 'no code listing on the card');
  assert.equal(byId(results[0], 'prerequisites').label, 'Builds on: Guided (mean of −ln p; keep the lowest held-out checkpoint); shapes, gradients, learning rate, AdamW.');
  // The AdamW equation is labelled as the conceptual update, on the equation's row; decay stays on the dim >= 2 group.
  const update = results[reviewStates.findIndex(state => state.part === 2)];
  const [label, adamw] = ['adamw-label', 'adamw-eq'].map(id => byId(update, id));
  assert.equal(label.label, 'AdamW, conceptual update');
  assert.ok(label.visible && label.y > adamw.y && label.y < adamw.y + adamw.h);
  assert.match(byId(update, 'decay').label, /only where dim ≥ 2/);
  for (const result of results) {
    const shown = result.state.objects.filter(o => o.visible && o.label).map(o => o.label).join('\n');
    assert.doesNotMatch(shown, /beginner|intermediate|advanced|expert|newcomer/i);
  }
  // Every sub-card is reviewed.
  assert.deepEqual([...new Set(reviewStates.map(state => state.part))].sort(), [0, 1, 2]);
});

// One idea per sub-card: which objects each part shows (the pager itself is in the card header).
const PARTS = {
  0: ['question', 'prerequisites', 'get-lr', 'arrow-get-lr', 'estimate', 'branch-0', 'branch-1', 'branch-2', 'lr-status', 'lr-eq', 'eval-line', 'note-a', 'note-b'],
  1: ['question-micro', 'forward', 'arrow-forward', 'loss', 'arrow-loss', 'backward', 'loop', 'loop-label', 'shapes', 'loss-eq', 'flatten', 'accum-eq', 'memory', 'memory-2', 'memory-3'],
  2: ['question-update', 'clip', 'arrow-clip', 'step', 'arrow-step', 'zero', 'clip-eq', 'adamw-eq', 'adamw-label', 'decay', 'zero-note', 'tokens'],
};

test('three sub-cards, one idea each: question first, Builds on only on 1/3, equations counted per part', () => {
  assert.deepEqual(scene.exampleData.parts, ['get_lr schedule and eval', 'Micro-steps: forward, loss, backward', 'The step: clip, AdamW, zero_grad']);
  assert.ok(scene.objects.every(object => [0, 1, 2].includes(object.part)), 'every object belongs to one sub-card');
  for (const config of ['char', 'gpt2']) {
    for (const [part, ids] of Object.entries(PARTS)) {
      const result = evaluated(scene, { part: Number(part), config });
      assert.deepEqual(onScreen(result), [...ids].sort(), `part ${part} (${config})`);
      assert.ok(ids.length <= 60);
      // The part's question is its first line, at the top of the frame.
      const [first] = ids.map(id => byId(result, id)).filter(o => o.type === 'text').sort((a, b) => a.y - b.y);
      assert.match(first.id, /^question/);
      assert.equal(first.typography, 'heading');
      // ponytail: owner rule is one formula block per sub-card; 5 equations cannot go one per part in at most 4
      // parts, and a merged block fails the shared equation-width lint. 2/3 and 3/3 carry two each, pending the
      // owner's call - asserted exactly so the count cannot grow unnoticed.
      const equations = ids.map(id => byId(result, id)).filter(o => o.type === 'equation');
      assert.equal(equations.length, [1, 2, 2][part], `part ${part}: equations`);
    }
  }
  assert.deepEqual(scene.objects.filter(o => /^Builds on/.test(o.initialState.text || '')).map(o => o.part), [0]);
  // Arrows join the steps of one part only; each part's steps start on the same row.
  const boxes = ['get-lr', 'forward', 'clip'].map(id => scene.objects.find(o => o.id === id));
  assert.deepEqual(boxes.map(o => [o.part, o.initialState.y]), [[0, 84], [1, 84], [2, 84]]);
  assert.ok(!scene.objects.some(o => ['arrow-estimate', 'arrow-backward'].includes(o.id)), 'no arrow crosses a sub-card');
  // A part's steps appear in order from the start of the clip, whichever part is open.
  for (const part of [0, 1, 2]) {
    const first = evaluated(scene, { part }).scene.timeline.filter(event => event.action === 'appear').sort((a, b) => a.at - b.at)[0];
    assert.equal(first.target, ['get-lr', 'forward', 'clip'][part]);
    assert.ok(first.at < 0.2);
  }
});

test('the frame never refits: every part and state has the same bounds, drawn at scale 1', () => {
  const legibility = sceneLegibility(scene);
  assert.equal(legibility.scale, 1);
  for (const { effectivePx, floor } of Object.values(legibility.effective)) assert.ok(effectivePx >= floor);
  const frame = ({ contributors: _c, ...box }) => box;
  const states = [0, 1, 2].flatMap(part => ['char', 'gpt2'].flatMap(config => [0, 1, 2, 3, 4, 5].map(stop => ({ part, config, stop }))));
  const bounds = states.map(inputs => frame(sceneContentBounds(evaluated(scene, inputs).scene)));
  bounds.forEach((box, n) => assert.deepEqual(box, bounds[0], `frame at ${JSON.stringify(states[n])}`));
  // Vertically the drawn frame is the static one the block is sized from (the tallest part, 2/3).
  const fixed = frame(legibility.bounds);
  assert.deepEqual([bounds[0].yMin, bounds[0].yMax], [fixed.yMin, fixed.yMax]);
  assert.equal(legibility.bounds.contributors.yMax, 'memory-3');
  // ponytail: the static estimate reads the un-interpolated {{marker}} text, so its right edge (the tokens
  // line's raw template) sits past every drawn state's; the drawn frame stays inside it at scale 1.
  assert.ok(bounds[0].xMin === fixed.xMin && bounds[0].xMax <= fixed.xMax);
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
  const states = ['char', 'gpt2'].flatMap(config => [0, 1, 2, 3, 4, 5].map(stop => ({ part: 0, stop, config })));
  const results = assertCardGates(scene, states);
  results.forEach((result, n) => {
    const { stop, config } = states[n];
    for (const id of ['get-lr', 'estimate', 'lr-eq', 'eval-line', 'lr-status', 'note-a']) assert.ok(byId(result, id).visible, `${id} on 1/3`);
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
    assert.ok(byId(result, 'eval-line').label.startsWith(`${groupDigits(it)} % ${c.evalInterval} = ${it % c.evalInterval}: ${runs ? 'runs' : 'skipped'}`));
    if (runs && it === 0) assert.match(byId(result, 'eval-line').label, /saves nothing: the save needs iter_num > 0$/);
    if (runs && it > 0) assert.match(byId(result, 'eval-line').label, c.alwaysSaveCheckpoint ? /always_save_checkpoint = True/ : /only if val < best_val_loss/);
    assert.equal(byId(result, 'lr-status').label, reached ? 'Source value' : 'What-if');
    // The stop's lesson, with its arithmetic checked.
    const note = `${byId(result, 'note-a').label} ${byId(result, 'note-b').label}`;
    const text = x => x.toExponential(3);
    const expected = [
      [c.learningRate / (c.warmupIters + 1), `ln V = ln ${groupDigits(c.vocabSize)} = ${Math.log(c.vocabSize).toFixed(2)}`],
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

test('shapes and live products match the oracle for both configs, on the sub-card that shows them', () => {
  const [micro, update] = [1, 2].map(part => assertCardGates(scene, [{ part, config: 'char' }, { part, config: 'gpt2' }]));
  micro.forEach((result, n) => {
    const c = CFG[['char', 'gpt2'][n]];
    const other = update[n];
    for (const id of ['shapes', 'flatten', 'loss-eq', 'accum-eq', 'loop-label', 'memory', 'memory-2', 'memory-3']) assert.ok(byId(result, id).visible, `${id} on 2/3`);
    for (const id of ['tokens', 'decay', 'clip-eq']) assert.ok(byId(other, id).visible, `${id} on 3/3`);
    const [B, T, V, M, P] = [c.batchSize, c.blockSize, c.vocabSize, c.gradAccumPerProcess, c.worldSize];
    assert.equal(byId(result, 'shapes').label, `X, Y: (B, T) = (${B}, ${T})   →   logits: (B, T, V) = (${B}, ${T}, ${V})`);
    // ignore_index=-1 would drop targets of -1 from the mean; get_batch reads uint16 tokens, so there are none and N = B*T.
    assert.equal(byId(result, 'flatten').label, `view(−1, V): (B·T, V) = (${B * T}, ${V}); get_batch emits no −1, so N = B·T`);
    // The mean runs over the targets that are not -1 - exactly ignore_index's rule.
    assert.equal(byId(result, 'loss-eq').label, '\\mathcal{L}_m=-\\tfrac1N\\sum_{i:\\,y_i\\neq-1}\\ln\\mathrm{softmax}(z_i)[y_i]');
    // Summed over the M micro-steps of each process, averaged over the P processes (DDP).
    assert.ok(byId(result, 'accum-eq').label.startsWith('g=\\frac1P\\sum_{p,m}') && byId(result, 'accum-eq').label.endsWith(`P=${P},\\ M=${M}`));
    assert.equal(byId(result, 'loop-label').label, `micro-steps: M = ${M}`);
    assert.equal(byId(other, 'clip-eq').label, `g\\gets g\\,\\min(1,\\,c/\\lVert g\\rVert_2),\\quad c=${c.gradClip.toFixed(1)}`);
    // Counts grouped in thousands, as train.py prints tokens_per_iter with "{tokens_per_iter:,}".
    const grouped = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    assert.equal(byId(other, 'tokens').label, `Tokens per iteration = M·P·B·T = ${M}·${P}·${B}·${T} = ${grouped(M * P * B * T)}, as printed at start-up (Source value)`);
    // Memory holds one micro-step's activations; the logits are only part of them.
    assert.equal(byId(result, 'memory').label, `Tradeoff: memory holds one micro-step’s activations (the logits alone are B·T·V = ${grouped(B * T * V)} values),`);
    // DDP averages the P processes' gradients, so one step's gradient covers M·P·B sequences (491,520 / 1024 = 480 for train_gpt2).
    assert.equal(byId(result, 'memory-2').label, `and time pays for M = ${M} of them in a row; each step’s gradient averages M·P·B = ${M * P * B} sequences (Live calculation).`);
    // Without accumulation one process runs all M*B sequences in one pass: M times the logits of one micro-step.
    assert.equal(byId(result, 'memory-3').label, `Without accumulation one process would hold all M·B = ${M * B} sequences at once (logits: M·B·T·V = ${grouped(M * B * T * V)} values).`);
    if (c.id === 'gpt2') assert.deepEqual([M * B, grouped(M * B * T * V), grouped(B * T * V)], [60, '3,090,677,760', '618,135,552']);
    assert.equal(M * P * B * T, M * P * B * c.blockSize);
    if (c.id === 'gpt2') assert.equal(grouped(M * P * B * T), '491,520', 'the figure in config/train_gpt2.py’s own comment');
    assert.equal(byId(other, 'decay').label, `λ = ${c.weightDecay} only where dim ≥ 2 (weights, embeddings); betas (${c.betas.join(', ')})`);
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
  // Each status is labelled on the sub-card whose values it describes; the card-wide check reads all three at once.
  assertSources(sources, { ...scene, objects: scene.objects.map(({ part: _part, ...object }) => object) });
  const labels = part => evaluated(scene, { part }).state.objects.filter(o => o.visible && o.label).map(o => o.label).join('\n');
  assert.deepEqual([0, 1, 2].map(part => ['Source value', 'Live calculation'].filter(status => labels(part).includes(status))),
    [['Source value'], ['Live calculation'], ['Source value']]);
  assertEvidence(evidence);
  assert.equal(evidence.depth, 'Deep dive');
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Source value', 'Live calculation']);
  assert.match(sources.find(s => s.status === 'Source value').reproduce, /gen_training_loss\.py --check$/);
});
