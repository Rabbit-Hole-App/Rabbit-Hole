import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import { scene, sources, evidence, reviewStates } from './deep.js';
import * as guided from './guided.js';
import { assertCardGates, assertEvidence, assertSources, evaluated } from '../../card-gates.mjs';
import { sceneContentBounds, sceneLegibility } from '../../../scene-layout.js';

const byId = result => new Map(result.state.objects.map(object => [object.id, object]));
const on = (objects, id) => objects.get(id).visible && objects.get(id).opacity > 0;
const shownText = (sc, inputs) => evaluated(sc, inputs).state.objects
  .filter(o => o.visible && o.opacity > 0 && o.label && ['text', 'code'].includes(o.type));
const A = fx.architecture;
const CALLS = ['train', 'generate', 'crop', 'direct'];
const ALL = CALLS.flatMap(call => [true, false].map(tied => ({ call, tied })));
const STEPS = ['call', 'assert', 'embed', 'qkv', 'att', 'attnOut', 'fc', 'mlpOut', 'lnf', 'head', 'loss'];
const AFTER_ASSERT = STEPS.slice(2);

// Independent oracle: what model.py does to the shapes at each call site.
// train.py:123-125 / :300: B = batch_size rows of block_size, targets given.
// sample.py:81 + generate(): one prompt (B = 1), cropped at model.py:314.
// A direct forward() call is not cropped and meets the assert at :173.
function forward(call) {
  const site = {
    train: { B: A.batch_size, T: A.block_size, targets: true, crop: false },
    generate: { B: 1, T: fx.crossEntropy.context.length, targets: false, crop: true },
    crop: { B: 1, T: A.block_size + 1, targets: false, crop: true },
    direct: { B: 1, T: A.block_size + 1, targets: false, crop: false },
  }[call];
  const T = site.crop && site.T > A.block_size ? A.block_size : site.T;
  const { B } = site, C = A.n_embd, nh = A.n_head, V = A.vocab_size;
  if (T > A.block_size) return { B, T, error: `Cannot forward sequence of length ${T}, block size is only ${A.block_size}` };
  return {
    B, T, call: [B, T], embed: [B, T, C], qkv: [B, nh, T, C / nh], att: [B, nh, T, T], attnOut: [B, T, C], fc: [B, T, 4 * C],
    mlpOut: [B, T, C], lnf: [B, T, C], head: site.targets ? [B, T, V] : [B, 1, V], lossRows: site.targets ? B * T : null,
  };
}
const tuple = shape => `(${shape.join(', ')})`;

test('passes every card gate at every call site, tied and untied', () => {
  assert.equal(reviewStates.length, 6);
  assertCardGates(scene, ALL);
});

test('Deep dive ladder rung: equations, named shapes, a branch control, an edge case, a what-if', () => {
  assert.deepEqual(scene.inputs.map(input => input.type), ['choice', 'bool']);
  assert.deepEqual(scene.inputs[0].options.map(option => option.id), CALLS);
  const objects = byId(evaluated(scene, {}));
  const equations = scene.objects.filter(o => o.type === 'equation').filter(o => on(objects, o.id));
  assert.ok(equations.length >= 5, `${equations.length} equations shown`);
  for (const name of ['(B, T)', '(B, T, C)', '(B, nh, T, hs)', '(B, nh, T, T)', '(B, T, 4C)', '(B, T, V)']) {
    assert.ok(shownText(scene, {}).some(o => o.label.includes(name)), `named shape ${name}`);
  }
  assert.ok(shownText(scene, { call: 'generate' }).some(o => o.label.includes('(B, 1, V)')));
  assert.equal(scene.objects[1].initialState.text, 'Builds on: Guided; tensor shapes and matrix products');
  for (const inputs of ALL) {
    assert.doesNotMatch(shownText(scene, inputs).map(o => o.label).join('\n'), /\b(beginner|intermediate|advanced|expert|newcomer)s?\b/i);
  }
});

test('every shape matches the forward-pass oracle at every call site', () => {
  for (const call of ['train', 'generate', 'crop']) {
    const want = forward(call);
    const objects = byId(evaluated(scene, { call }));
    for (const key of ['embed', 'qkv', 'att', 'attnOut', 'fc', 'mlpOut', 'lnf', 'head']) {
      assert.equal(objects.get(`${key}-numbers`).label, tuple(want[key]), `${call}: ${key}`);
    }
    assert.equal(objects.get('head-shape').label, want.head[1] === 1 ? 'logits: (B, 1, V)' : 'logits: (B, T, V)');
    assert.equal(on(objects, 'loss-numbers'), want.lossRows !== null, `${call}: loss numbers shown only with targets`);
    if (want.lossRows) assert.equal(objects.get('loss-numbers').label, `${want.lossRows} rows of ${A.vocab_size}`);
    assert.equal(objects.get('assert-step').role, 'neutral');
    if (call !== 'crop') assert.equal(objects.get('call-numbers').label, tuple(want.call), `${call}: call`);
  }
  // The crop: a 257-character prompt reaches forward as T = block_size.
  assert.equal(forward('crop').T, A.block_size);
  const crop = byId(evaluated(scene, { call: 'crop' }));
  assert.equal(crop.get('assert-numbers').label, '256 ≤ 256 after the crop');
  assert.equal(crop.get('call-numbers').label, '(1, 257) → (1, 256)');
});

test('edge case: forward() with T > block_size fails the assert and nothing below it runs', () => {
  const want = forward('direct');
  assert.equal(want.error, 'Cannot forward sequence of length 257, block size is only 256');
  const objects = byId(evaluated(scene, { call: 'direct' }));
  assert.equal(objects.get('assert-step').role, 'warning');
  assert.equal(objects.get('assert-numbers').label, '257 > 256: AssertionError');
  assert.equal(objects.get('assert-numbers').role, 'warning');
  assert.equal(objects.get('edge').role, 'warning');
  assert.ok(objects.get('edge').label.includes(want.error));
  for (const key of AFTER_ASSERT) {
    assert.equal(objects.get(`${key}-step`).opacity, 0.3, `${key} dimmed`);
    assert.ok(!on(objects, `${key}-numbers`), `${key} has no numbers - it never ran`);
  }
  for (const id of ['cost-train', 'cost-gen', 'eq-loss']) assert.ok(!on(objects, id));
  // The replay stops at the assert: no later step is ever highlighted.
  for (let t = 0; t <= scene.duration; t += 0.05) {
    const frame = byId(evaluated(scene, { call: 'direct' }, t));
    for (const key of AFTER_ASSERT) assert.ok(!frame.get(`${key}-step`).highlighted, `${key} highlighted at t=${t.toFixed(2)}`);
  }
});

test('the replay walks every step in order when the call runs', () => {
  const firstLit = (call, key) => {
    for (let t = 0; t <= scene.duration + 1e-9; t += 0.05) if (byId(evaluated(scene, { call }, t)).get(`${key}-step`).highlighted) return t;
    return Infinity;
  };
  for (const call of ['train', 'generate']) {
    const times = STEPS.map(key => firstLit(call, key));
    for (let i = 1; i < STEPS.length; i += 1) assert.ok(times[i - 1] < times[i], `${call}: ${STEPS[i - 1]} before ${STEPS[i]}`);
  }
});

test('tradeoffs are live calculations that match the oracle', () => {
  const V = A.vocab_size, C = A.n_embd;
  const train = evaluated(scene, { call: 'train' }), gen = evaluated(scene, { call: 'generate' });
  assert.equal(train.derived.nAll[0], A.batch_size * A.block_size * V);
  assert.equal(byId(train).get('cost-train').label,
    `Training scores every position: 64 × 256 × 65 = ${64 * 256 * 65} logits, each compared with its target.`);
  // NanoGPT has no KV cache: generate() reruns the whole sequence each step
  // (model.py:315), so projecting only the last position saves lm_head work only.
  assert.equal(byId(gen).get('cost-gen').label,
    `Only the last position is scored: 1 × 1 × 65 = 65 logits, not ${12 * 65}; all 12 positions still run every Block.`);
  assert.equal(byId(evaluated(scene, { call: 'crop' })).get('cost-gen').label,
    `Only the last position is scored: 1 × 1 × 65 = 65 logits, not ${256 * 65}; all 256 positions still run every Block.`);
  assert.ok(!on(byId(train), 'cost-gen') && !on(byId(gen), 'cost-train'));
  // Tying: one V x C matrix; at train.py's defaults (V = 50304, C = 768) it is 38633472.
  const tied = byId(train), untied = byId(evaluated(scene, { call: 'train', tied: false }));
  assert.equal(tied.get('tie').label, `Tying stores one matrix for wte and lm_head, saving V × C = ${V * C} parameters; ${50304 * 768} at V = 50304, C = 768.`);
  assert.equal(untied.get('tie').label, `What-if untied: lm_head adds its own V × C = ${V * C} parameters; ${50304 * 768} at V = 50304, C = 768.`);
  assert.match(tied.get('eq-logits').label, /W_\{te\}/);
  assert.match(untied.get('eq-logits').label, /W_\{lm\}/);
  // The logits equation follows the call too: every position with targets,
  // the last one (x[:, [-1], :]) without - the head shape beside it agrees.
  for (const inputs of ALL) {
    const objects = byId(evaluated(scene, inputs));
    const last = forward(inputs.call).head?.[1] === 1 || inputs.call === 'direct';
    const eq = objects.get('eq-logits').label;
    assert.equal(eq.includes('_{:,T-1}'), last, `${JSON.stringify(inputs)}: ${eq}`);
    assert.match(eq, inputs.tied ? /W_\{te\}/ : /W_\{lm\}/);
    if (inputs.call !== 'direct') assert.equal(objects.get('head-shape').label, last ? 'logits: (B, 1, V)' : 'logits: (B, T, V)');
  }
  assert.equal(train.derived.hs[0], C / A.n_head);
});

test('the att equation is att itself (B, nh, T, T); y = att v sits on the c_proj row', () => {
  const objects = byId(evaluated(scene, {}));
  const att = objects.get('eq-att').label, out = objects.get('eq-attn').label;
  assert.equal(att, String.raw`\mathrm{softmax}(qk^\top/\sqrt{hs}+M)`);
  assert.equal(objects.get('att-shape').label, 'att: (B, nh, T, T)');
  assert.ok(out.startsWith(String.raw`y=\text{att}\,v,`), out);
  assert.equal(objects.get('attnOut-step').label, 'att @ v → c_proj, x + y');
});

test('every step on the card has a code source', () => {
  const cited = new Set(sources.filter(s => s.kind === 'code').map(s => `${s.path}:${s.lines[0]}-${s.lines[1]}`));
  const STEP_SOURCES = {
    call: ['train.py:123-125', 'train.py:300-300', 'model.py:312-316', 'sample.py:81-81'],
    assert: ['model.py:170-173'], embed: ['model.py:174-179'], qkv: ['model.py:53-59', 'model.py:103-106'],
    att: ['model.py:61-71', 'model.py:44-50'], attnOut: ['model.py:72-75', 'model.py:103-106'], fc: ['model.py:82-92'],
    mlpOut: ['model.py:82-92', 'model.py:103-106'], lnf: ['model.py:182-182'], head: ['model.py:184-191', 'model.py:133-138'],
    loss: ['model.py:184-191'],
  };
  assert.deepEqual(Object.keys(STEP_SOURCES), STEPS);
  for (const [key, refs] of Object.entries(STEP_SOURCES)) for (const ref of refs) assert.ok(cited.has(ref), `${key}: cites ${ref}`);
});

test('the att row is marked as the manual path, and the flash branch is cited', () => {
  for (const inputs of ALL) {
    const objects = byId(evaluated(scene, inputs));
    // No backend claim: scaled_dot_product_attention returns y, so the model never holds att.
    assert.equal(objects.get('att-path').label, '↑ manual path only: on the default path (scaled_dot_product_attention, PyTorch ≥ 2.0) the model never holds att.');
    assert.equal(objects.get('att-path').opacity, objects.get('att-step').opacity, 'the note dims with its row');
  }
  const flash = sources.find(s => s.kind === 'code' && s.lines[0] === 44);
  assert.match(flash.note, /self\.flash = hasattr/);
});

test('structure, not prose: Deep dive text stays within 1.3x the Guided card', () => {
  const chars = sc => shownText(sc, Object.fromEntries(sc.inputs.map(d => [d.name, d.default]))).reduce((n, o) => n + o.label.length, 0);
  assert.ok(chars(scene) <= 1.3 * chars(guided.scene), `deep ${chars(scene)} vs guided ${chars(guided.scene)}`);
});

const PINNED = process.env.NANOGPT_PINNED
  || 'C:/Users/cyudhist/AppData/Local/Temp/claude/C--Users-cyudhist-Desktop-workspace-small-deploy/a0a20b94-1113-4966-863f-feffed07c1b6/scratchpad/nanogpt-3adf61e';
const lines = path => readFileSync(join(PINNED, path), 'utf8').split('\n');
test('the assert, the crop and the tie say what the card says', { skip: !existsSync(PINNED) && 'pinned NanoGPT copy not present' }, () => {
  const model = lines('model.py');
  assert.match(model[172], /assert t <= self\.config\.block_size, f"Cannot forward sequence of length \{t\}, block size is only \{self\.config\.block_size\}"/);
  assert.match(model[313], /idx\[:, -self\.config\.block_size:\]/);
  assert.match(model[137], /self\.transformer\.wte\.weight = self\.lm_head\.weight/);
  assert.match(model[44], /self\.flash = hasattr\(torch\.nn\.functional, 'scaled_dot_product_attention'\)/);
  assert.match(model[63], /is_causal=True/);
  assert.match(model[189], /logits = self\.lm_head\(x\[:, \[-1\], :\]\)/);
  assert.match(model[110], /vocab_size: int = 50304 /);
});

test('sources: well-formed, pinned, every status labelled, quotes verbatim', () => {
  assertSources(sources, scene);
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status).sort(), ['Live calculation', 'Source value', 'What-if']);
  if (!existsSync(PINNED)) return;
  for (const { path, lines: [start, end], note } of sources.filter(source => source.kind === 'code')) {
    const cited = lines(path).slice(start - 1, end).join('\n');
    const quotes = [...note.matchAll(/"([^"]+)"/g)].map(match => match[1]);
    assert.ok(quotes.length, `${path}:${start}: note quotes the source`);
    for (const quote of quotes) assert.ok(cited.includes(quote), `${path}:${start}-${end} contains "${quote}"`);
  }
});

test('evidence record is complete, depth-labelled and pinned', () => {
  assertEvidence(evidence);
  assert.equal(evidence.depth, 'Deep dive');
  assert.equal(evidence.prerequisites, scene.objects[1].initialState.text);
  assert.equal(evidence.sourceRevision, `karpathy/nanoGPT@${fx.provenance.nanogpt.commit}`);
  assert.equal(scene.objects[0].initialState.text, evidence.learningQuestion);
  assert.ok(evidence.learningQuestion.length <= 95);
});

// In the app the block is sized from the scene's static content
// (LearningBlocks sizeFor -> sceneLegibility) and each state is fitted into it
// (AnimatedScene -> sceneContentBounds); equal bounds mean the card never
// refits between states and renders at scale 1.
test('the frame never refits: every state has the bounds the block is sized from', () => {
  const block = sceneLegibility(structuredClone(scene)).bounds;
  for (const inputs of ALL) {
    const fitted = sceneContentBounds(evaluated(scene, inputs).scene);
    for (const edge of ['xMin', 'xMax', 'yMin', 'yMax']) {
      assert.ok(Math.abs(fitted[edge] - block[edge]) < 0.5, `${JSON.stringify(inputs)} ${edge}: ${fitted[edge]} vs ${block[edge]}`);
    }
  }
});
