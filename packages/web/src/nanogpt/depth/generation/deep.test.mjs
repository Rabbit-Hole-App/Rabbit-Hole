import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import g from '../fixtures/generation.generated.js';
import { scene, sources, evidence, reviewStates } from './deep.js';
import { assertCardGates, assertEvidence, assertSources, evaluated } from '../../card-gates.mjs';
import { sceneContentBounds, sceneLegibility } from '../../../scene-layout.js';
import { scene as guided } from './guided.js';

const F = g.first;
const V = g.vocabSize;
const PARTS = [0, 1, 2, 3];
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const label = (result, id) => byId(result, id).label;
const shown = result => result.state.objects.filter(o => o.visible && o.label && ['text', 'code'].includes(o.type)).map(o => o.label);
const option = name => scene.inputs.find(i => i.name === name).options.map(o => o.id);
const EVERY = option('prompt').flatMap(prompt => option('topK').flatMap(topK => option('temperature').map(temperature => ({ prompt, topK, temperature }))));
const EVERY_PART = PARTS.flatMap(part => EVERY.map(inputs => ({ ...inputs, part })));
const TOPK = { none: null, k1: 1, k3: 3, k200: 200 };
const TEMP = { t0: 0, t08: 0.8, t1: 1 };
// Sub-cards: an object that belongs to one part is read on that part, so the
// branch checks below see every idea of the card in one merged result.
const partOf = id => scene.objects.find(object => object.id === id).part;
const whole = inputs => {
  const parts = PARTS.map(part => evaluated(scene, { ...inputs, part }));
  return { ...parts[0], state: { objects: parts[0].state.objects.map(o => byId(parts[partOf(o.id) ?? 0], o.id)) } };
};

// Independent oracle: generate()'s middle steps in plain JS on the full
// V-wide logit row (the toy's unseen characters are -Infinity), exactly as
// model.py 318-324 order them: / T, top-k against min(top_k, V), softmax.
function oracle(topK, T) {
  const z = [...F.counts.map(c => Math.log(c) / T), ...Array(V - F.counts.length).fill(-Infinity)];
  let cut = z;
  if (topK !== null) {
    const kth = [...z].sort((a, b) => b - a)[Math.min(topK, V) - 1];
    cut = z.map(v => (v < kth ? -Infinity : v));
  }
  const m = Math.max(...cut);
  const e = cut.map(v => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map(v => v / s).slice(0, F.counts.length);
}

const r3 = v => Math.round(v * 1000) / 1000;
// Each sub-card's own objects.
const OWN = [
  ['question', 'prerequisites', 'step-crop', 'shape-crop', 'next-crop', 'step-forward', 'shape-forward', 'next-forward', 'step-scale', 'shape-scale',
    'idx', 'crop-line', 'forward-line', 'tradeoff-crop'],
  ['question-temperature', 'step-topk', 'shape-topk', 'scaled', 'cut-marks', 'cut-key', 'no-logits', 't-line', 'k-line', 'eq-topk', 'eq-key', 'tradeoff-k'],
  ['question-softmax', 'step-softmax', 'shape-softmax', 'probs', 'kept-count', 'no-probs', 'eq-softmax', 'eq-key-softmax', 'renorm', 'renorm-none'],
  ['question-draw', 'step-draw', 'shape-draw', 'next-draw', 'step-cat', 'shape-cat', 'draw-line', 'idx-next', 'appended', 'invalid-draw', 'no-greedy'],
];

test('deep dive passes every gate in every configuration on every sub-card; structure of the depth', () => {
  assert.equal(EVERY.length, 24);
  assertCardGates(scene, EVERY_PART);
  assert.ok(reviewStates.length >= 2 && reviewStates.length <= 3 * PARTS.length);
  // Review states cover every sub-card.
  assert.deepEqual([...new Set(reviewStates.map(s => s.part))].sort(), PARTS);
  const [first] = assertCardGates(scene, reviewStates);
  assert.match(label(first, 'prerequisites'), /^Builds on: Guided; tensor shapes/);
  assert.equal(scene.objects.filter(o => o.type === 'equation').length, 2);
  // "Builds on:" on 1/4 only; at most one formula block per sub-card.
  assert.equal(partOf('prerequisites'), 0);
  assert.equal(scene.objects.filter(o => /^Builds on/.test(o.initialState.text || '')).length, 1);
  for (const part of PARTS) assert.ok(scene.objects.filter(o => o.type === 'equation' && o.part === part).length <= 1, `part ${part}: one formula`);
  // T = 0 is offered only as an invalid What-if, not as a generate() setting.
  assert.equal(scene.inputs.find(i => i.name === 'temperature').options.find(o => o.id === 't0').label, '0 - invalid (What-if)');
  assert.ok(!scene.objects.some(o => o.type === 'code'), 'no code listing on the card');
  const surface = [scene.title, ...scene.inputs.flatMap(i => [i.label, ...(i.options || []).map(o => o.label)]), ...scene.exampleData.parts,
    ...PARTS.flatMap(part => shown(evaluated(scene, { part })))].join('\n');
  assert.doesNotMatch(surface, /beginner|intermediate|advanced|expert|newcomer|novice/i);
  // Depth is structure, not prose: each sub-card at most ~1.3x the Guided card's visible text.
  const chars = (s, inputs) => evaluated(s, inputs).state.objects.filter(o => o.visible && o.label && ['text', 'code'].includes(o.type))
    .reduce((n, o) => n + o.label.length, 0);
  const defaults = s => Object.fromEntries(s.inputs.map(d => [d.name, d.default]));
  for (const part of PARTS) assert.ok(chars(scene, { ...defaults(scene), part }) <= 1.3 * chars(guided, defaults(guided)), `part ${part}: deep text within 1.3x guided`);
});

test('sub-cards: one idea each, a question first, and a frame that never refits', () => {
  const pager = scene.inputs.find(i => i.presentation === 'pager');
  assert.deepEqual(pager, { name: 'part', type: 'index', label: 'Deep dive', of: 'parts', default: 0, presentation: 'pager' });
  assert.deepEqual(scene.exampleData.parts, ['Crop, forward, last position', 'Temperature and top-k', 'Softmax over the kept logits', 'Draw and append']);
  // Only the status line is on every part.
  assert.deepEqual(scene.objects.filter(o => o.part === undefined).map(o => o.id), ['status']);
  // Which ideas live where.
  const ids = part => scene.objects.filter(o => o.part === part).map(o => o.id).sort();
  for (const part of PARTS) assert.deepEqual(ids(part), [...OWN[part]].sort(), `part ${part} ids`);
  // One visual per sub-card: a table, a chart or a token row. The −∞ marks
  // label the table's cells and the appended chip ends the grown idx row.
  const visuals = part => scene.objects.filter(o => o.part === part && ['grid', 'bars', 'tokens'].includes(o.type) && !['cut-marks', 'appended'].includes(o.id)).map(o => o.id);
  assert.deepEqual(PARTS.map(visuals), [['idx'], ['scaled'], ['probs'], ['idx-next']]);
  // Question first on every part: its topmost text, at the same place.
  for (const part of PARTS) {
    const texts = scene.objects.filter(o => o.part === part && o.type === 'text');
    const top = texts.reduce((a, b) => (b.initialState.y < a.initialState.y ? b : a));
    assert.match(top.initialState.text, /\?$/, `part ${part} opens with a question`);
    assert.deepEqual([top.initialState.x, top.initialState.y], [24, 32]);
  }
  // 2/4: the table sits beside the top-k box, and the T and k lines start
  // under its −∞ / Invalid row, clear of its column labels.
  const at = id => scene.objects.find(o => o.id === id).initialState;
  assert.equal(at('scaled').y, at('step-topk').y + 14);
  for (const id of ['t-line', 'k-line']) assert.ok(at(id).y > at('no-logits').y + 20 && at(id).y > at('cut-key').y + 20, id);
  // Each part's steps start on the same row under the header.
  for (const part of PARTS) assert.equal(Math.min(...scene.objects.filter(o => o.part === part && o.type === 'box').map(o => o.initialState.y)), 100);
  // At the defaults each part shows its own objects (the T = 0-only and
  // branch-only lines aside) and the status line.
  const ONLY_SOMETIMES = ['cut-key', 'no-logits', 'no-probs', 'renorm', 'invalid-draw', 'no-greedy'];
  for (const part of PARTS) {
    const visible = evaluated(scene, { part }).state.objects.filter(o => o.visible).map(o => o.id).sort();
    assert.deepEqual(visible, ['status', ...OWN[part].filter(id => !ONLY_SOMETIMES.includes(id))].sort(), `part ${part} at the defaults`);
  }
  // On a part: its own objects and the status line, never another part's.
  for (const inputs of EVERY_PART) {
    const visible = evaluated(scene, inputs).state.objects.filter(o => o.visible).map(o => o.id);
    for (const id of visible) assert.ok(id === 'status' || partOf(id) === inputs.part, `${JSON.stringify(inputs)} shows ${id}`);
  }
  // The frame renders at scale 1 (the tallest part fits the viewport), and
  // every part in every state measures the same bounds as the raw scene, so
  // paging and the controls never refit the card.
  const legible = sceneLegibility(scene);
  assert.equal(legible.scale, 1);
  assert.ok(legible.bounds.yMax - legible.bounds.yMin <= 800 && legible.bounds.xMax - legible.bounds.xMin <= 1060);
  const { contributors: _c, ...frame } = legible.bounds;
  for (const inputs of EVERY_PART) {
    const { contributors: _d, ...box } = sceneContentBounds(evaluated(scene, inputs).scene);
    assert.deepEqual(box, frame, JSON.stringify(inputs));
  }
  // 2/4 is the tallest part and sets the frame's bottom.
  assert.equal(partOf(legible.bounds.contributors.yMax), 1);
});

test('probabilities follow the oracle on every branch; T = 0 shows none', () => {
  for (const inputs of EVERY) {
    const result = whole(inputs);
    const where = JSON.stringify(inputs);
    const T = TEMP[inputs.temperature];
    const k = TOPK[inputs.topK];
    const bars = byId(result, 'probs').values;
    const cells = byId(result, 'scaled').values;
    if (T === 0) {
      assert.ok(bars.every(v => v === null) && cells.every(v => v === null), `${where} nothing computed at T = 0`);
      assert.equal(byId(result, 'appended').visible, false);
      // T = 0 is invalid, never an argmax: ÷ T is flagged, the steps after it
      // are dimmed as not valid, and cat never runs, so no grown idx.
      assert.equal(label(result, 'no-logits'), 'Invalid: generate() requires T > 0');
      assert.equal(byId(result, 'no-logits').role, 'warning');
      assert.equal(byId(result, 'step-scale').role, 'warning');
      for (const id of ['step-topk', 'step-softmax', 'step-draw', 'step-cat', 'next-draw', 'shape-cat', 'probs']) {
        assert.equal(byId(result, id).opacity, 0.3, `${where} ${id} dimmed`);
      }
      assert.equal(byId(result, 'idx-next').visible, false, `${where} cat never runs`);
      assert.equal(byId(result, 'no-greedy').visible, true);
      assert.equal(byId(result, 'no-logits').visible, true);
      // The What-if on the draw sub-card says so itself.
      assert.equal(byId(result, 'invalid-draw').visible, true);
      assert.equal(label(result, 'invalid-draw'), 'Invalid: generate() requires T > 0');
      assert.equal(byId(result, 'invalid-draw').role, 'warning');
      assert.equal(byId(result, 'kept-count').visible, false);
      assert.equal(byId(result, 'cut-marks').visible, false);
      assert.equal(byId(result, 'cut-key').visible, false);
      assert.equal(byId(result, 'k-line').visible, false, `${where} no kept set without logits`);
      assert.deepEqual(byId(result, 'scaled').cellHighlight, [], `${where} no ringed survivors at T = 0`);
      // What torch does at T = 0 (checked with torch 2.14.0): positive logits
      // ÷ 0 are +inf, the 0 logit is 0/0 = NaN, unseen stay -inf; softmax is
      // all NaN and torch.multinomial raises, so generate() crashes.
      const inf = F.counts.flatMap((c, i) => (Math.log(c) / 0 === Infinity ? [F.display[i]] : []));
      const nan = F.counts.flatMap((c, i) => (Number.isNaN(Math.log(c) / 0) ? [F.display[i]] : []));
      assert.deepEqual([inf.length, nan], [7, ['c']]);
      assert.equal(label(result, 't-line'), `T = 0: ÷ 0 makes ${inf.join(' ')} +∞, ${nan.join(' ')} NaN (0 ÷ 0) and unseen −∞.`);
      assert.equal(label(result, 'no-probs'), 'softmax → NaN everywhere: nothing valid to draw');
      assert.equal(label(result, 'draw-line'), 'torch.multinomial raises RuntimeError: generate() crashes.');
      assert.equal(label(result, 'no-greedy'), 'generate() has no greedy branch: top_k = 1 is greedy unless the top logits tie.');
      assert.equal(byId(result, 'renorm').visible, false);
      assert.equal(byId(result, 'renorm-none').visible, false);
      continue;
    }
    assert.equal(byId(result, 'no-greedy').visible, false);
    assert.equal(byId(result, 'no-logits').visible, false);
    assert.equal(byId(result, 'invalid-draw').visible, false);
    assert.equal(byId(result, 'k-line').visible, true);
    assert.equal(byId(result, 'step-scale').role, 'neutral');
    for (const id of ['step-topk', 'step-cat', 'next-draw', 'shape-cat', 'probs', 'idx-next']) assert.equal(byId(result, id).opacity, 1, `${where} ${id} runs`);
    const expected = oracle(k, T);
    bars.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= 0.0015, `${where} p[${i}] ${v} vs ${expected[i]}`));
    expected.forEach((v, i) => { if (v === 0) assert.equal(bars[i], 0, `${where} cut p[${i}] is exactly 0`); });
    cells.forEach((v, i) => assert.ok(Math.abs(v - F.logits[i] / T) < 0.002, `${where} ÷ T[${i}]`));
    // The generator's kept sets and draws agree with the oracle.
    const kept = expected.map(v => v > 0);
    assert.equal(result.derived.kept, kept.filter(Boolean).length);
    assert.equal(label(result, 'kept-count'), `${kept.filter(Boolean).length} of ${F.counts.length} drawable`);
    assert.deepEqual(byId(result, 'cut-marks').tokens, kept.map(x => (x ? '  ' : '−∞')));
    assert.deepEqual(byId(result, 'scaled').cellHighlight, kept.flatMap((x, i) => (x ? [i] : [])));
    const recorded = g.deep.draws[g.deep.topKs.indexOf(k)][g.deep.temperatures.indexOf(T)];
    recorded.probs.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-4, `${where} fixture p[${i}]`));
    assert.ok(kept[F.display.indexOf(recorded.picked)], `${where} the draw is a kept character`);
    assert.deepEqual(byId(result, 'appended').tokens, [recorded.picked]);
    assert.match(label(result, 'draw-line'), new RegExp(`^idx_next = “${recorded.picked}” \\(recorded, seed 1337\\)`));
    if (k === 1) {
      assert.equal(recorded.picked, F.display[0], 'top_k = 1 is greedy');
      assert.ok(new Set(F.counts).size === F.counts.length, 'no tied logits here, so k = 1 keeps one');
      assert.match(label(result, 'draw-line'), /: top logit \(ties all stay\)$/);
    }
    // Renormalisation over K: p(z) over K = uncut p(z) ÷ (uncut p summed over K).
    const uncut = oracle(null, T);
    const mass = uncut.reduce((a, v, i) => a + (kept[i] ? v : 0), 0);
    assert.ok(Math.abs(expected[0] - uncut[0] / mass) < 1e-12, `${where} equation's denominator`);
    assert.ok(Math.abs(result.derived.pAllTop - uncut[0]) <= 0.0015 && Math.abs(result.derived.keptMass - mass) <= 0.003, `${where} uncut p and mass`);
    assert.ok(Math.abs(result.derived.pAllTop / result.derived.keptMass - result.derived.pTop) <= 0.002, `${where} the line's ≈ holds`);
    // The caption's p(z) is the bar's canonical value shown to three decimals.
    assert.ok(Math.abs(result.derived.pTop - bars[0]) <= 0.0005, `${where} caption p(z) vs bar`);
    // Something cut: the numeric check shows; nothing cut: K = all V and p(z) is the uncut value.
    const cut = kept.some(x => !x);
    assert.equal(byId(result, 'renorm').visible, cut, `${where} renorm`);
    assert.equal(byId(result, 'renorm-none').visible, !cut, `${where} renorm-none`);
    // Captions show the bar's canonical p(z) to three decimals (r3).
    if (cut) assert.equal(label(result, 'renorm'), `over K: p(z) = ${result.derived.pAllTop} (uncut) ÷ ${result.derived.keptMass} (uncut sum over K) ≈ ${r3(bars[0])}`);
    else {
      assert.equal(r3(bars[0]), result.derived.pAllTop, `${where} nothing cut, p(z) unchanged`);
      assert.equal(label(result, 'renorm-none'), `nothing cut: K = all V, the sum over K is 1, so p(z) stays ${r3(bars[0])}`);
    }
  }
});

test('branches: the crop changes nothing downstream; top_k 200 is a no-op on 65 characters', () => {
  const base = { topK: 'k3', temperature: 't08' };
  const [long, short] = [whole({ ...base, prompt: 'long' }), whole({ ...base, prompt: 'short' })];
  assert.deepEqual(byId(long, 'probs').values, byId(short, 'probs').values, 'only the last block_size characters are read');
  // The prompt's space shows as a visible ␣ chip.
  assert.deepEqual(byId(long, 'idx').tokens, [...g.prompt].map(c => (c === ' ' ? '␣' : c)));
  assert.ok(byId(long, 'idx').tokens.every(t => t.trim() !== '') && byId(long, 'idx-next').tokens.includes('␣'));
  // The judge's worked example: k = 3, T = 0.8 lifts p(z) from 0.548 to 0.605.
  assert.equal(label(long, 'renorm'), 'over K: p(z) = 0.548 (uncut) ÷ 0.905 (uncut sum over K) ≈ 0.605');
  assert.deepEqual(byId(long, 'idx').cellHighlight, [7, 8, 9]);
  assert.equal(g.prompt.slice(-g.block), F.window);
  assert.equal(label(long, 'crop-line'), `t = ${g.prompt.length} > toy block_size = ${g.block} → t_c = ${g.block}; ${g.prompt.length - g.block} dropped (lit = idx_cond)`);
  assert.equal(label(short, 'crop-line'), `t = ${g.block} ≤ toy block_size = ${g.block} → t_c = t; no crop (lit = idx_cond)`);
  assert.equal(label(long, 'forward-line'), `toy forward: counts after “${F.window}” give ${F.counts.length} finite logits; ${V - F.counts.length} unseen are −∞`);
  assert.equal(byId(long, 'cut-key').visible, true, 'the −∞ key shows when something is cut');
  assert.equal(byId(long, 'appended').x, 400 + g.prompt.length * 49.5, 'the appended chip sits after the prompt');
  const [none, k200] = [whole({ prompt: 'long', topK: 'none', temperature: 't1' }), whole({ prompt: 'long', topK: 'k200', temperature: 't1' })];
  assert.deepEqual(byId(none, 'probs').values, byId(k200, 'probs').values);
  assert.equal(byId(k200, 'cut-key').visible, false, 'no −∞ key when nothing is cut');
  assert.equal(label(k200, 'k-line'), `k = min(200, V = ${V}) = ${V} ≥ ${F.counts.length} finite: nothing is cut.`);
  const k3 = whole({ prompt: 'long', topK: 'k3', temperature: 't1' });
  assert.equal(label(k3, 'k-line'), 'k = 3 keeps z, o, e; the rest become −∞, so p = 0.');
  // One state across sub-cards: the pager feeds no derivation (only the pool
  // holds its index), so every control has the same effect on every part.
  for (const inputs of EVERY) {
    const [first, ...rest] = PARTS.map(part => ({ ...evaluated(scene, { ...inputs, part }).derived, part: undefined }));
    for (const derived of rest) assert.deepEqual(derived, first, JSON.stringify(inputs));
  }
});

test('source values on the card come from the pinned sources', () => {
  assertCardGates(scene, [reviewStates[0]]);
  const result = whole(reviewStates[0]);
  assert.deepEqual(reviewStates[0], { part: 0, prompt: 'long', topK: 'k200', temperature: 't08' }, 'defaults are sample.py\'s');
  assert.equal(g.sample.top_k.value, 200);
  assert.equal(g.sample.temperature.value, 0.8);
  assert.equal(g.generateDefaults.temperature, 1);
  assert.equal(g.generateDefaults.top_k, null);
  assert.equal(label(result, 'tradeoff-k'), `top_k = 200 keeps 200 of GPT-2's 50,257 tokens (${(100 * 200 / 50257).toFixed(1)}%) but all 65 characters here.`);
  // No cache: from a 1-token start, the windows grow 1..256 and then stay 256
  // for the remaining 500 - 256 steps (closed form, not the module's loop).
  const bs = fx.architecture.block_size;
  assert.equal(bs, 256);
  assert.equal(g.sample.start.value, '\n');
  const rerun = (bs * (bs + 1)) / 2 + (500 - bs) * bs;
  assert.equal(rerun, 95360);
  assert.equal(label(result, 'tradeoff-crop'), `Tradeoff: no cache, so each token re-runs its whole window (≤ 256): 500 tokens from a 1-char start = 95,360 positions.`);
  assert.equal(label(result, 't-line'), 'T = 0.8: every logit gap is multiplied by 1/T = 1.25.');
});

const PINNED = process.env.NANOGPT_PINNED
  || 'C:/Users/cyudhist/AppData/Local/Temp/claude/C--Users-cyudhist-Desktop-workspace-small-deploy/a0a20b94-1113-4966-863f-feffed07c1b6/scratchpad/nanogpt-3adf61e';
test('sources: every step has code, pinned and quoted verbatim', () => {
  assertSources(sources, scene);
  const code = sources.filter(s => s.kind === 'code');
  // One entry per pipeline step, in the order generate() runs them.
  const steps = [[313, 314], [315, 316], [317, 318], [319, 322], [323, 324], [325, 326], [327, 328]];
  for (const [a, b] of steps) assert.ok(code.some(s => s.path === 'model.py' && s.lines[0] === a && s.lines[1] === b), `model.py:${a}-${b}`);
  assert.equal(scene.objects.filter(o => o.type === 'box').length, steps.length, 'one step box per cited step');
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Calculated toy example', 'Live calculation', 'Recorded toy run', 'Source value']);
  assert.ok(code.length > 10);
  if (!existsSync(PINNED)) return;
  for (const { path, lines: [start, end], note } of code) {
    const cited = readFileSync(join(PINNED, path), 'utf8').split('\n').slice(start - 1, end).join('\n');
    const quotes = [...note.matchAll(/“([^”]+)”/g)].map(m => m[1]);
    assert.ok(quotes.length, `${path}:${start} quotes the source`);
    for (const quote of quotes) assert.ok(cited.includes(quote), `${path}:${start}-${end} contains "${quote}"`);
  }
});

test('evidence record is complete', () => {
  assertEvidence(evidence);
  assert.equal(evidence.depth, 'Deep dive');
  assert.ok(evidence.prerequisites && evidence.ladderRole);
  assert.equal(evidence.learningQuestion, scene.objects[0].initialState.text);
  assert.equal(scene.objects[0].part, 0, 'the card\'s question opens 1/4');
});
