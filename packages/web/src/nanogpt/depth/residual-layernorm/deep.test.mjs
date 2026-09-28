import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import base from '../../fixtures/nanogpt-fixtures.generated.js';
import fx from '../fixtures/residual-layernorm.generated.js';
import * as deep from './deep.js';
import * as guided from './guided.js';
import * as overview from './overview.js';
import { assertCardGates, assertEvidence, assertSources, evaluated } from '../../card-gates.mjs';
import { textStyle } from '../../../scene-style.js';
import { requiredLeftMargin, sceneContentBounds, sceneLegibility } from '../../../scene-layout.js';

const { scene, sources, evidence, reviewStates, PARTS } = deep;
const D = fx.deep;
const results = assertCardGates(scene, reviewStates);
const byId = (result, id) => result.state.objects.find(o => o.id === id);
const shown = result => result.state.objects.filter(o => o.visible);
const r3 = v => Math.round(v * 1000) / 1000;
const close = (actual, expected, tol, what) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= tol, `${what}[${i}]: ${v} vs ${expected[i]}`));
const LEARNER_LABELS = /\b(beginners?|intermediate|advanced|experts?|newcomers?|novices?)\b/i;
const SHAPE = /\(\s*[A-Za-z][\w·]*(?:\s*,\s*[\w·×/]+)+\s*\)/g;
const defaults = card => Object.fromEntries((card.scene.inputs || []).map(d => [d.name, d.default]));
const textChars = (card, inputs = {}) => shown(evaluated(card.scene, { ...defaults(card), ...inputs }))
  .filter(o => o.label && ['text', 'code'].includes(o.type)).reduce((n, o) => n + o.label.length, 0);
const at = inputs => evaluated(scene, { ...defaults(deep), ...inputs });

// Every combination of the three experiment controls, on every sub-card.
const LAYOUTS = ['pre', 'post'], VECTORS = ['x0', 'near', 'constant'], INITS = [true, false];
const ALL = Object.values(PARTS).flatMap(part => LAYOUTS.flatMap(layout => VECTORS.flatMap(vector =>
  INITS.map(scaledInit => ({ part, layout, vector, scaledInit })))));
const partOf = id => scene.objects.find(o => o.id === id).part;
const QUESTION = { [PARTS.wiring]: 'question', [PARTS.layernorm]: 'question-ln', [PARTS.init]: 'question-init' };
const LN_IDS = ['question-ln', 'ln-head', 'x-strip', 'stats', 'std', 'near-exact', 'xhat-strip', 'ratio', 'no-eps', 'ln-eq', 'edge', 'bias'];
const INIT_IDS = ['question-init', 'status-init', 'init-head', 'init-eq', 'init-rest', 'bars-ref', 'bars', 'std-text', 'unit', 'post-1', 'post-2'];
const INIT_EQ = `\\sigma_{c\\_proj} = ${D.initStd}\\,/\\sqrt{2L}`;
const SUM_EQ = '\\mathrm{std}(\\sum_{k<2L}F_k)\\propto\\sigma\\sqrt{2L}';

// Independent oracle: F.layer_norm over one vector, biased variance, eps 1e-5.
function layerNorm(x, eps = 1e-5) {
  const n = x.length;
  const mean = x.reduce((s, v) => s + v, 0) / n;
  const variance = x.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance + eps);
  return { mean, variance, std, xhat: x.map(v => (v - mean) / std), ratio: variance / (variance + eps) };
}

test('controls: a pager over three sub-cards, an implementation branch, an edge-case trigger and the init tradeoff', () => {
  const [part, layout, vector, init] = scene.inputs;
  assert.deepEqual([part.name, part.type, part.presentation, part.label, part.of, part.default], ['part', 'index', 'pager', 'Deep dive', 'parts', 0]);
  assert.deepEqual(scene.exampleData.parts, ['Pre-LN or post-LN', 'LayerNorm and ε', 'The scaled init']);
  assert.deepEqual(PARTS, { wiring: 0, layernorm: 1, init: 2 });
  assert.deepEqual([layout.type, layout.options.map(o => o.id), layout.default], ['choice', ['pre', 'post'], 'pre']);
  assert.deepEqual([vector.type, vector.options.map(o => o.id)], ['choice', ['x0', 'near', 'constant']]);
  assert.deepEqual([init.type, init.default], ['bool', true]);
  // The six approved review states, each on the sub-card its content now lives on; every sub-card reviewed.
  const APPROVED = [
    [{ layout: 'pre', vector: 'x0', scaledInit: true }, PARTS.wiring],
    [{ layout: 'post', vector: 'x0', scaledInit: true }, PARTS.wiring],
    [{ layout: 'pre', vector: 'constant', scaledInit: true }, PARTS.layernorm],
    [{ layout: 'pre', vector: 'near', scaledInit: true }, PARTS.layernorm],
    [{ layout: 'pre', vector: 'x0', scaledInit: false }, PARTS.init],
    [{ layout: 'post', vector: 'near', scaledInit: false }, PARTS.init],
  ];
  // Then the defaults of 2/3 and 3/3.
  const PART_DEFAULTS = [[{ layout: 'pre', vector: 'x0', scaledInit: true }, PARTS.layernorm], [{ layout: 'pre', vector: 'x0', scaledInit: true }, PARTS.init]];
  assert.deepEqual(reviewStates, [...APPROVED, ...PART_DEFAULTS].map(([state, onPart]) => ({ part: onPart, ...state })));
  assert.deepEqual(reviewStates[0], defaults(deep));
  assert.deepEqual([...new Set(reviewStates.map(s => s.part))], Object.values(PARTS));
});

test('sub-cards: each shows only its own objects, its question first, one formula block and one visual', () => {
  assert.deepEqual(scene.objects.filter(o => o.part === undefined).map(o => o.id), []);
  assert.equal(partOf('status'), PARTS.wiring);
  assert.deepEqual(scene.objects.filter(o => o.part === PARTS.layernorm).map(o => o.id).sort(), [...LN_IDS].sort());
  assert.deepEqual(scene.objects.filter(o => o.part === PARTS.init).map(o => o.id).sort(), [...INIT_IDS].sort());
  // The one visual per sub-card: the Block diagram, the x -> x̂ strip pair, the bars over their grey reference.
  const VISUAL = { [PARTS.wiring]: ['arrow', 'box', 'circle', 'line'], [PARTS.layernorm]: ['strip'], [PARTS.init]: ['bars'] };
  for (const inputs of ALL) {
    const where = JSON.stringify(inputs);
    const result = at(inputs);
    const visible = shown(result);
    for (const o of visible) assert.equal(partOf(o.id), inputs.part, `${o.id} @${where}`);
    assert.equal(visible.filter(o => o.type === 'equation').length, 1, `one formula block @${where}`);
    for (const o of visible.filter(v => !['text', 'equation'].includes(v.type))) assert.ok(VISUAL[inputs.part].includes(o.type), `${o.id} (${o.type}) @${where}`);
    const texts = visible.filter(o => o.type === 'text');
    assert.equal(texts.reduce((a, b) => (b.y < a.y ? b : a)).id, QUESTION[inputs.part], `question first @${where}`);
    assert.equal(byId(result, 'prerequisites').visible, inputs.part === PARTS.wiring, `Builds on only on 1/3 @${where}`);
  }
  // Each sub-card's visual is drawn at its defaults.
  assert.ok(shown(at({ part: PARTS.wiring })).some(o => o.type === 'box'));
  assert.equal(shown(at({ part: PARTS.layernorm })).filter(o => o.type === 'strip').length, 2);
  assert.equal(shown(at({ part: PARTS.init })).filter(o => o.type === 'bars').length, 2);
});

test('the frame is sized once for the tallest sub-card and never refits: text at its authored size on every part', () => {
  const numbers = ({ contributors: _contributors, ...box }) => box;
  const legibility = sceneLegibility(scene);
  assert.equal(legibility.scale, 1);
  for (const [name, { effectivePx, floor }] of Object.entries(legibility.effective)) assert.ok(effectivePx >= floor, `${name}: ${effectivePx} < ${floor}`);
  const frame = numbers(legibility.bounds);
  // The renderer fits sceneContentBounds(scene), widened only by requiredLeftMargin(visible objects) (AnimatedScene.jsx).
  for (const inputs of ALL) {
    assert.deepEqual(numbers(sceneContentBounds(at(inputs).scene)), frame, JSON.stringify(inputs));
    assert.equal(requiredLeftMargin(shown(at(inputs))), 0, JSON.stringify(inputs));
  }
  // Every gate on every sub-card in every state, not only the review states.
  assertCardGates(scene, ALL);
});

test('the ladder: equations, named shapes, a "Builds on: Guided" line, more code sources, no more text than before the split', () => {
  assert.equal(scene.objects[0].semanticId, 'question');
  for (const id of Object.values(QUESTION)) assert.ok(scene.objects.find(o => o.id === id).initialState.text.length <= 95, id);
  assert.match(scene.objects[1].initialState.text, /^Builds on: Guided; /);
  const partResults = Object.values(PARTS).map(part => at({ part }));
  const union = partResults.flatMap(shown);
  assert.equal(union.filter(o => o.type === 'equation').length, 3, 'three equations, one per sub-card');
  const labels = union.filter(o => o.label && ['text', 'equation'].includes(o.type)).map(o => o.label).join(' ');
  assert.ok(new Set(labels.match(SHAPE)).size >= 3, `named shapes: ${labels.match(SHAPE)}`);
  for (const result of [...results, ...partResults]) assert.doesNotMatch(shown(result).map(o => o.label || '').join('\n'), LEARNER_LABELS);
  assert.doesNotMatch(JSON.stringify(evidence), LEARNER_LABELS);
  const codeCount = card => card.sources.filter(s => s.kind === 'code').length;
  assert.ok(codeCount(deep) > codeCount(guided) && codeCount(deep) > codeCount(overview));
  // Each sub-card reads lighter than Guided; the split added only the parts' own
  // questions, so the card's content is still at most ~1.3x Guided's text.
  for (const part of Object.values(PARTS)) assert.ok(textChars(deep, { part }) <= textChars(guided), `part ${part}`);
  const content = new Map(union.filter(o => o.label && o.type === 'text' && !['question-ln', 'question-init', 'status-init'].includes(o.id)).map(o => [o.id, o.label.length]));
  const ratio = [...content.values()].reduce((n, v) => n + v, 0) / textChars(guided);
  assert.ok(ratio <= 1.3, `Deep dive content is ${ratio.toFixed(2)}x Guided’s text`);
});

test('the layout control rewires the Block on 1/3 (LN on the branches or on the stream, ln_f only in pre) and turns 3/3 into a note', () => {
  const PRE_ONLY = ['ln1', 'ln2', 'ln-f', 'to-ln1', 'ln1-attn', 'to-ln2', 'ln2-mlp', 'hw-mid', 'hw-out', 'lnf-head'];
  const POST_ONLY = ['ln-a', 'ln-b', 'to-attn', 'to-mlp', 'to-ln-a', 'hw-mid-post', 'to-ln-b', 'hw-out-post'];
  const ALWAYS = ['attn', 'mlp', 'plus-1', 'plus-2', 'lm-head', 'hw-in', 'attn-up', 'mlp-up'];
  for (const layout of LAYOUTS) {
    const pre = layout === 'pre';
    const result = at({ part: PARTS.wiring, layout });
    for (const id of PRE_ONLY) assert.equal(byId(result, id).visible, pre, `${id} @${layout}`);
    for (const id of POST_ONLY) assert.equal(byId(result, id).visible, !pre, `${id} @${layout}`);
    for (const id of ALWAYS) assert.ok(byId(result, id).visible, id);
    assert.match(byId(result, 'equation').label, pre ? /x_{2L} = x_0 \+ \\sum_{k<2L}/ : /\\mathrm{LN}_k\(x_k \+ F_k\(x_k\)\)/);
  }
  // The status line follows the layout on the two sub-cards the layout changes; 2/3's
  // LayerNorm is the same in both layouts and carries its status in the strip label.
  const STATUS = { [PARTS.wiring]: 'status', [PARTS.init]: 'status-init' };
  for (const inputs of ALL) {
    const result = at(inputs);
    const visible = shown(result).filter(o => /^status/.test(o.id)).map(o => o.id);
    assert.deepEqual(visible, STATUS[inputs.part] ? [STATUS[inputs.part]] : [], JSON.stringify(inputs));
    if (!STATUS[inputs.part]) { assert.match(byId(result, 'x-strip').label, /^Calculated toy example: /); continue; }
    const status = byId(result, STATUS[inputs.part]);
    assert.equal(status.role, inputs.layout === 'pre' ? 'output' : 'warning');
    assert.match(status.label, inputs.layout === 'pre' ? /^Source value: NanoGPT’s Block\.forward \(pre-LN\)$/ : /^What-if: post-LN/);
  }
  // Nothing on 2/3 moves with the layout.
  for (const vector of VECTORS) {
    const drawnLn = layout => JSON.stringify(shown(at({ part: PARTS.layernorm, layout, vector })).map(o => [o.id, o.label, o.values, o.role]));
    assert.equal(drawnLn('pre'), drawnLn('post'), vector);
  }
  // 3/3's growing sum exists only in pre-LN: in post-LN it gives way to a note.
  for (const layout of LAYOUTS) for (const scaledInit of INITS) {
    const pre = layout === 'pre';
    const result = at({ part: PARTS.init, layout, scaledInit });
    for (const id of ['bars-ref', 'bars', 'std-text', 'unit']) assert.equal(byId(result, id).visible, pre, `${id} @${layout}`);
    for (const id of ['post-1', 'post-2']) assert.equal(byId(result, id).visible, !pre, id);
    for (const id of ['init-head', 'init-eq', 'init-rest']) assert.ok(byId(result, id).visible, id);
  }
  const post = at({ part: PARTS.init, layout: 'post' });
  assert.match(byId(post, 'post-1').label + ' ' + byId(post, 'post-2').label, /re-normalizes after every add.*pre-LN only/);
  // The scaledInit switch stays visible in post-LN; the note says it acts on pre-LN only,
  // and indeed nothing drawn in post-LN moves with it, on any sub-card.
  assert.match(byId(post, 'post-2').label, /c_proj switch are pre-LN only/);
  const drawn = result => JSON.stringify(shown(result).map(o => [o.id, o.label, o.values, o.role]));
  for (const part of Object.values(PARTS)) for (const vector of VECTORS) {
    assert.equal(drawn(at({ part, layout: 'post', vector, scaledInit: true })), drawn(at({ part, layout: 'post', vector, scaledInit: false })), `${part} ${vector}`);
  }
  // No two visible texts share space on any sub-card in any state (width estimated as card-gates does, 0.6 em per char).
  const box = o => { const f = textStyle(o.typography || 'body').fontSize; return [o.x, o.y - f, o.x + o.label.length * f * 0.6, o.y]; };
  for (const inputs of ALL) {
    const texts = shown(at(inputs)).filter(o => o.type === 'text' && o.label).map(o => [o.id, box(o)]);
    texts.forEach(([a, [ax0, ay0, ax1, ay1]], i) => texts.slice(i + 1).forEach(([b, [bx0, by0, bx1, by1]]) =>
      assert.ok(ax1 <= bx0 || bx1 <= ax0 || ay1 <= by0 || by1 <= ay0, `${a} overlaps ${b} @${JSON.stringify(inputs)}`)));
  }
  // NanoGPT's own warmup, from the resolved config, in both layouts.
  const { defaults: trainDefaults, shakespeareChar } = base.config;
  for (const layout of LAYOUTS) {
    assert.equal(byId(at({ part: PARTS.wiring, layout }), 'warmup').label, `NanoGPT (pre-LN) still warms up: ${trainDefaults.warmup_iters} steps by default, ${shakespeareChar.warmup_iters} for Shakespeare-char.`);
  }
  // The stream's shape is the Shakespeare-char config's B, T, C.
  const { batch_size: B, block_size: T, n_embd: C } = base.architecture;
  assert.equal(byId(results[0], 'stream-label').label, `residual stream x: (B, T, C) = (${B}, ${T}, ${C})`);
});

test('LayerNorm cases (2/3) match the oracle, and the edge-case words match the numbers', () => {
  const x0 = base.layernorm.presets[0].x;
  assert.deepEqual(D.cases.map(c => c.id), ['x0', 'near', 'constant']);
  assert.deepEqual(D.cases[0].x, x0, 'x0 is the shared toy vector');
  assert.deepEqual(D.cases[1].x, x0.map(v => Math.round((0.5 + 0.001 * v) * 1e6) / 1e6));
  assert.deepEqual(D.cases[2].x, x0.map(() => 0.5));
  assert.equal(D.eps, base.layernorm.eps);
  for (const c of D.cases) {
    const truth = layerNorm(c.x);
    assert.ok(Math.abs(c.var - truth.variance) < 1e-12 && Math.abs(c.std - truth.std) < 1e-8, c.id);
    c.xhat.forEach((v, i) => assert.ok(Math.abs(v - truth.xhat[i]) < 1e-4, `${c.id} xhat[${i}]`));
    assert.ok(Math.abs(c.ratio - truth.ratio) < 1e-4, `${c.id} ratio`);
    // mean of x̂² really is σ²/(σ²+ε).
    assert.ok(Math.abs(truth.xhat.reduce((s, v) => s + v * v, 0) / c.x.length - truth.ratio) < 1e-9);
  }
  const [x0Case, near, constant] = D.cases;
  assert.ok(x0Case.var / D.eps > 1e4, 'σ² ≫ ε');
  assert.ok(near.var < D.eps && near.ratio < 0.5, 'σ² < ε shrinks x̂');
  assert.equal(constant.var, 0);
  assert.deepEqual(constant.xhat, [0, 0, 0, 0, 0, 0]);
  assert.equal(constant.noEpsText, '0', 'without ε the root is 0, so x̂ would be 0 / 0');
  assert.ok(Math.abs(constant.std - Math.sqrt(D.eps)) < 1e-8, 'with σ² = 0 the root is √ε');
  // The nearly constant vector prints as .50 in every cell, so for it alone the
  // card adds its 4-decimal values - which differ from the constant vector's.
  assert.ok(near.x.every(v => v.toFixed(2) === '0.50'));
  const exact = near.x.map(v => v.toFixed(4));
  assert.deepEqual(exact, x0.map(v => (0.5 + 0.001 * v).toFixed(4)));
  assert.ok(exact.every(t => t !== '0.5000'));
  // What 2/3 shows for each case.
  const ln = vector => at({ part: PARTS.layernorm, vector });
  for (const c of D.cases) {
    const result = ln(c.id);
    for (const id of ['x-strip', 'xhat-strip', 'stats', 'std', 'ratio', 'no-eps', 'ln-head', 'edge', 'bias']) assert.ok(byId(result, id).visible, `${id} @${c.id}`);
    assert.deepEqual(byId(result, 'x-strip').values, c.x);
    assert.deepEqual(byId(result, 'xhat-strip').values, c.xhat);
    assert.equal(byId(result, 'stats').label, `μ = ${c.meanText} · σ² = ${c.varText}`);
    assert.equal(byId(result, 'ln-head').label, 'LayerNorm over C at one (b, t); ε = 1.00e-5');
    assert.equal(byId(result, 'std').label, `√(σ² + ε) = ${c.stdText}`);
    assert.equal(byId(result, 'ratio').label, `mean of x̂² = σ²/(σ²+ε) = ${c.ratio}`);
    assert.equal(byId(result, 'no-eps').label, `without ε: √σ² = ${c.noEpsText}`);
    assert.equal(byId(result, 'near-exact').visible, c.id === 'near', `near-exact @${c.id}`);
  }
  for (const [s, state] of reviewStates.entries()) {
    assert.equal(byId(results[s], 'near-exact').visible, state.part === PARTS.layernorm && state.vector === 'near', `near-exact @${JSON.stringify(state)}`);
  }
  assert.equal(byId(ln('near'), 'near-exact').label, `4 decimals: ${exact.join('  ')}`);
  assert.match(byId(ln('near'), 'x-strip').label, /x = 0\.5 \+ 0\.001·x₀$/);
  assert.match(byId(ln('constant'), 'x-strip').label, /x = 0\.5 everywhere$/);
  assert.match(byId(ln('x0'), 'edge').label, /^σ² ≫ ε/);
  assert.match(byId(ln('near'), 'edge').label, /^σ² < ε/);
  assert.match(byId(ln('constant'), 'edge').label, /^σ² = 0: without ε, x̂ = 0 \/ 0; with ε, x̂ = 0\.$/);
  assert.equal(byId(ln('constant'), 'edge').role, 'warning');
});

test('the scaled init (3/3): std 0.02 / √(2L) per depth, and the live bars show the std of 2L summed branches', () => {
  assert.deepEqual(D.init.map(d => d.nLayer), [base.architecture.n_layer, base.config.defaults.n_layer, 24, 36, 48]);
  assert.equal(D.initStd, 0.02);
  assert.equal(D.addsPerLayer, 2);
  for (const d of D.init) {
    assert.equal(d.adds, 2 * d.nLayer);
    assert.ok(Math.abs(d.scaledStd - 0.02 / Math.sqrt(2 * d.nLayer)) < 1e-8);
    assert.equal(d.scaledStdText, (0.02 / Math.sqrt(2 * d.nLayer)).toFixed(5));
    assert.ok(Math.abs(d.sqrtAdds - Math.sqrt(2 * d.nLayer)) < 1e-6);
    assert.equal(d.sqrtAddsShown, Math.round(Math.sqrt(2 * d.nLayer) * 100) / 100);
    assert.ok(Math.abs(d.stdRatio - 1 / Math.sqrt(2 * d.nLayer)) < 1e-6);
  }
  // Oracle from first principles: 2L uncorrelated branches, each with variance
  // (w / 0.02)^2 of an unscaled branch (w = the c_proj std); the std of their
  // sum is the root of the summed variances.
  const stdOfSum = (L, w) => Math.sqrt(Array.from({ length: 2 * L }, () => (w / 0.02) ** 2).reduce((t, v) => t + v, 0));
  const states = [...reviewStates, ...INITS.map(scaledInit => ({ ...defaults(deep), part: PARTS.init, scaledInit }))];
  for (const state of states) {
    const result = at(state);
    const scaled = state.scaledInit;
    // Unscaled bars show 2 decimals (short bar labels); the scaled product is exact to 3.
    // The bar heights carry the canonical values, so they match to 3 decimals.
    const expected = D.init.map(d => (scaled ? r3 : v => Math.round(v * 100) / 100)(stdOfSum(d.nLayer, scaled ? 0.02 / Math.sqrt(2 * d.nLayer) : 0.02)));
    assert.deepEqual(byId(result, 'bars').values.map(r3), expected);
    if (scaled) assert.deepEqual(expected, [1, 1, 1, 1, 1]);
    else assert.deepEqual(expected, [3.46, 4.9, 6.93, 8.49, 9.8]);
    // n_layer: the std of the sum in units of one branch (×1 = one branch at std 0.02).
    assert.deepEqual(byId(result, 'bars').labels, D.init.map((d, i) => `${d.nLayer}: ×${expected[i]}`));
    assert.equal(byId(result, 'bars').role, scaled ? 'output' : 'warning');
    close(byId(result, 'bars-ref').values, D.init.map(d => Math.sqrt(2 * d.nLayer)), 5e-3, 'grey reference: unscaled');
    assert.equal(byId(result, 'std-text').label, scaled ? 'c_proj std 0.00577 at n_layer 6 … 0.00204 at 48' : 'What-if: c_proj std 0.02 at all depths: grows as √(2L)');
    // Only the residual projections are scaled (GPT.__init__: pn.endswith('c_proj.weight')); every other
    // Linear and Embedding keeps _init_weights' std 0.02 - in both layouts, and on the toggle.
    assert.equal(byId(result, 'init-head').label, 'only attn.c_proj (C, C), mlp.c_proj (C, 4·C):');
    assert.equal(byId(result, 'init-rest').label, `other Linear/Embedding: std ${D.initStd}`);
  }
  for (const scaledInit of INITS) {
    const result = at({ part: PARTS.init, scaledInit });
    for (const id of ['bars', 'bars-ref', 'std-text', 'unit']) assert.ok(byId(result, id).visible, `${id} @scaledInit=${scaledInit}`);
  }
  // The flat scaled bars are drawn, not a sliver: at least 8px of the bars' height.
  const bars = scene.objects.find(o => o.id === 'bars').initialState;
  assert.ok((1 / bars.peak) * (bars.h - 4) >= 8, 'scaled bar height');
  assert.equal(byId(at({ part: PARTS.init }), 'unit').label, `Source value: ×1 = one branch at std ${D.initStd}`);
  assert.match(scene.inputs.find(d => d.name === 'scaledInit').label, /c_proj weights only/);
});

test('the formulas are readable: LayerNorm in display style, no text-style fraction, one block per sub-card', () => {
  for (const inputs of ALL) {
    const result = at(inputs);
    for (const eq of shown(result).filter(o => o.type === 'equation')) assert.doesNotMatch(eq.label, /\\frac\b/, eq.id);
  }
  assert.match(byId(at({ part: PARTS.layernorm }), 'ln-eq').label, /\\dfrac\{x - \\mu\}\{\\sqrt\{\\sigma\^2 \+ \\epsilon\}\}/);
  // 3/3's one formula block, one derivation: in pre-LN the growing sum, then the init it implies.
  assert.equal(byId(at({ part: PARTS.init, layout: 'pre' }), 'init-eq').label, `${SUM_EQ}\\;\\Rightarrow\\;${INIT_EQ}`);
  assert.equal(byId(at({ part: PARTS.init, layout: 'post' }), 'init-eq').label, INIT_EQ);
});

const pinned = path => {
  const sha = base.provenance.nanogpt.files[path];
  const file = join(tmpdir(), 'nanogpt-fixture-cache', sha);
  if (!existsSync(file)) return null;
  const bytes = readFileSync(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha, `${path} cache is not the pinned file`);
  return bytes.toString('utf8').split('\n');
};
const squash = s => s.replace(/\s+/g, ' ').trim();

test('sources: every code entry quotes its pinned lines; every diagram step has one; the what-if has its paper; each status on its sub-card', () => {
  // assertSources looks for each calculation status at the card's default,
  // which is 1/3; the toy example and the live bars are labelled on 2/3 and
  // 3/3. So each status is checked on the sub-card that shows it.
  const withStatuses = statuses => sources.filter(s => s.kind !== 'calculation' || statuses.includes(s.status));
  const pagedTo = part => ({ ...scene, inputs: scene.inputs.map(d => (d.presentation === 'pager' ? { ...d, default: part } : d)) });
  assertSources(withStatuses(['Source value']), pagedTo(PARTS.wiring));
  assertSources(withStatuses(['Calculated toy example']), pagedTo(PARTS.layernorm));
  assertSources(withStatuses(['Source value', 'Live calculation']), pagedTo(PARTS.init));
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Source value', 'Calculated toy example', 'Live calculation']);
  const code = sources.filter(s => s.kind === 'code');
  for (const source of code) {
    const lines = pinned(source.path);
    if (!lines) continue;
    const cited = squash(lines.slice(source.lines[0] - 1, source.lines[1]).join(' '));
    const quotes = [...source.note.matchAll(/“([^”]+)”/g)].map(m => squash(m[1]));
    assert.ok(quotes.length, `${source.path}:${source.lines} quotes its code`);
    for (const quote of quotes) assert.ok(cited.includes(quote), `${source.path}:${source.lines.join('-')} contains “${quote}”`);
  }
  // Each step drawn in either layout is backed by a code line that names it.
  const STEP_CODE = { ln_1: 'self.ln_1', attn: 'self.attn(self.ln_1(x))', ln_2: 'self.ln_2', mlp: 'self.mlp(self.ln_2(x))',
    '+': 'x = x + self.attn', ln_f: 'self.transformer.ln_f(x)', lm_head: 'self.lm_head', LN: 'F.layer_norm' };
  const labels = new Set(results.flatMap(result => shown(result).filter(o => ['box', 'circle'].includes(o.type)).map(o => o.label)));
  assert.deepEqual([...labels].sort(), Object.keys(STEP_CODE).sort());
  for (const [step, needle] of Object.entries(STEP_CODE)) {
    assert.ok(code.some(s => s.note.includes(needle)), `step "${step}" has a code source quoting ${needle}`);
  }
  const papers = sources.filter(s => s.kind === 'paper');
  assert.ok(papers.some(s => s.arxiv === '1706.03762' && /LayerNorm\(x \+ Sublayer\(x\)\)/.test(s.note)), 'post-LN what-if');
  assert.ok(papers.some(s => s.arxiv === '2002.04745'), 'warmup cost');
});

test('evidence record is complete, with the depth fields', () => {
  assertEvidence(evidence);
  assert.equal(evidence.depth, 'Deep dive');
  assert.equal(evidence.prerequisites, `${scene.objects[1].initialState.text}.`);
  assert.equal(evidence.learningQuestion, byId(results[0], 'question').label);
  assert.ok(evidence.ladderRole.trim());
});
