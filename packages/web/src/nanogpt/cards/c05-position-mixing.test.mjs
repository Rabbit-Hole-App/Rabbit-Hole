import test from 'node:test';
import assert from 'node:assert/strict';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { validateActivity, PREDICATES } from '../../scene-activity.js';
import { sceneContentBounds, sceneLegibility } from '../../scene-layout.js';
import { assertCardGates, assertCardPlan, assertEvidence, assertSources, pinnedFile } from '../card-gates.mjs';
import { scene, plan, reviewStates, activity, sources, evidence } from './c05-position-mixing.js';

const WORD = [...'Before'];
const T = WORD.length;
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const withoutContributors = box => { const { contributors: _c, ...rest } = box; return rest; };
// The lines on screen, as "j-i" (input j -> output i).
const wires = result => result.state.objects.filter(o => o.type === 'line' && o.visible && (o.opacity ?? 1) > 0)
  .map(o => o.id.slice(2)).sort();
// Independent oracle: the rule, written out.
const expectedWires = sublayer => {
  const out = [];
  for (let i = 0; i < T; i += 1) for (let j = 0; j <= i; j += 1) if (sublayer === 0 || j === i) out.push(`${j}-${i}`);
  return out.sort();
};

test('c05 passes every gate at both states; one control, 49 objects, at scale 1', () => {
  const results = assertCardGates(scene, reviewStates);
  assert.deepEqual(reviewStates, [{ sublayer: 0 }, { sublayer: 1 }]);
  assert.deepEqual(scene.inputs.map(i => [i.name, i.type, i.presentation, i.default]), [['sublayer', 'index', 'picker', 0]]);
  assert.deepEqual(scene.exampleData.sublayers, ['② attn', '⑤ mlp']);
  assert.equal(scene.objects[0].semanticId, 'question');
  // The question asks for the contrast (which sub-layer), not c11's "which positions".
  assert.equal(scene.objects[0].initialState.text, 'Inside one Block, which sub-layer lets an output depend on other positions?');
  assert.equal(scene.objects.length, 49);
  assert.ok(scene.height <= 900);
  assert.deepEqual(scene.timeline, []);
  const legibility = sceneLegibility(scene);
  assert.equal(legibility.scale, 1);
  assert.ok(scene.width >= legibility.viewport.w && scene.height >= legibility.viewport.h, JSON.stringify(legibility.viewport));
  for (const result of results) assert.deepEqual(withoutContributors(sceneContentBounds(result.scene)), withoutContributors(legibility.bounds));
  // Derived opacity never shares a line with a timeline appear.
  assert.ok(scene.objects.filter(o => o.type === 'line').every(o => o.initialState.opacity === undefined || typeof o.initialState.opacity === 'object'));
});

test('c05 wiring: attn draws output i from inputs 0..i, mlp from input i alone; counts are live', () => {
  for (const sublayer of [0, 1]) {
    const [result] = assertCardGates(scene, [{ sublayer }]);
    assert.deepEqual(wires(result), expectedWires(sublayer), `sublayer ${sublayer}`);
    for (let i = 0; i < T; i += 1) {
      const n = sublayer === 0 ? i + 1 : 1;
      assert.equal(byId(result, `n-${i}`).label, `${n} input${n === 1 ? '' : 's'}`);
      assert.equal(byId(result, `in-${i}`).label, `${i} · ${WORD[i]}`);
      assert.equal(byId(result, `out-${i}`).label, `${i} · ${WORD[i]}`);
    }
  }
  assert.equal(expectedWires(0).length, 21);
  assert.equal(expectedWires(1).length, 6);
});

test('c05 captions follow the state; the fixed lines are true in both', () => {
  const [attn, mlp] = assertCardGates(scene, reviewStates);
  const labels = (result, ids) => ids.map(id => byId(result, id).label);
  const IDS = ['heading', 'row-in', 'row-out', 'rule-1', 'rule-2'];
  assert.deepEqual(labels(attn, IDS), ['② attn: causal self-attention', 'reads ln_1(x)', 'writes a',
    'Output i can depend on inputs 0 to i: itself and every earlier position.', 'Later positions are masked, so nothing flows backwards.']);
  assert.deepEqual(labels(mlp, IDS), ['⑤ mlp: c_fc → GELU → c_proj', 'reads ln_2(x + a)', 'writes m',
    'Output i depends on input i alone.', 'The same c_fc → GELU → c_proj runs at every position.']);
  for (const result of [attn, mlp]) {
    assert.equal(byId(result, 'precise').label, 'Inside attn, positions meet only in the scores and the weighted mix of values; c_attn and c_proj act per position.');
    assert.equal(byId(result, 'scale').label, `Six positions drawn; NanoGPT wires up to block_size = ${fx.architecture.block_size} the same way.`);
    // Risk 5: two e's - nothing may claim equal characters give equal outputs.
    assert.ok(result.state.objects.every(o => !/same (character|letter)|equal (character|output)/i.test(o.label || '')));
  }
});

test('c05 plan: single, verbatim objective, The MLP 1 of 2, no boundary flag', () => {
  assertCardPlan({ scene, plan });
  assert.equal(plan.boundary.decision, 'single');
  const { name, position, of, relationships } = plan.boundary.sequence;
  assert.deepEqual([name, position, of], ['The MLP', 1, 2]);
  assert.deepEqual(relationships.map(r => [r.type, r.card, r.direction]), [
    ['deepens', 'c02-block-anatomy', 'in'], ['prerequisite', 'c11-causal-mask', 'in'],
    ['prerequisite', 'c10-weighted-values', 'in'], ['prerequisite', 'c14-mlp', 'out']]);
  assert.doesNotMatch(plan.boundary.reason, /recorded when c14 is built/);
  assert.deepEqual(plan.boundary.reviewed, {});
  assert.equal(plan.objective, 'After this card, the learner should understand that inside a Block only attention moves information between positions: output i can depend on inputs 0 to i in attn but on input i alone in the MLP.');
});

// Independent oracle for the practice: a real one-head causal Block in plain
// JS (LayerNorm, causal softmax attention, GELU MLP, both residual adds) at
// T = block_size with seeded weights; change x at 100 and see which outputs move.
function blockOutputs(x, W) {
  const d = x[0].length;
  const ln = v => { const m = v.reduce((a, b) => a + b) / d; const s = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / d + 1e-5); return v.map(e => (e - m) / s); };
  const lin = (M, v) => M.map(row => row.reduce((a, w, k) => a + w * v[k], 0));
  const gelu = z => 0.5 * z * (1 + Math.tanh(0.7978845608 * (z + 0.044715 * z ** 3)));
  const h = x.map(ln);
  const q = h.map(v => lin(W.q, v)), k = h.map(v => lin(W.k, v)), v = h.map(u => lin(W.v, u));
  const a = q.map((qi, i) => {
    const s = k.slice(0, i + 1).map(kj => kj.reduce((acc, e, n) => acc + e * qi[n], 0) / Math.sqrt(d));
    const mx = Math.max(...s), e = s.map(z => Math.exp(z - mx)), tot = e.reduce((p, c) => p + c);
    const y = Array(d).fill(0);
    e.forEach((w, j) => v[j].forEach((val, n) => { y[n] += (w / tot) * val; }));
    return lin(W.o, y);
  });
  const x2 = x.map((xi, i) => xi.map((e, n) => e + a[i][n]));
  return x2.map(xi => { const m = lin(W.p, lin(W.f, ln(xi)).map(gelu)); return xi.map((e, n) => e + m[n]); });
}

test('c05 practice: input 100 of a 256 window reaches outputs 100 to 255 after a whole Block', () => {
  validateActivity(activity);
  const B = fx.architecture.block_size;
  assert.equal(B, 256);
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
  const mat = (r, c) => Array.from({ length: r }, () => Array.from({ length: c }, rnd));
  const d = 4;
  const W = { q: mat(d, d), k: mat(d, d), v: mat(d, d), o: mat(d, d), f: mat(4 * d, d), p: mat(d, 4 * d) };
  const x = mat(B, d);
  const base = blockOutputs(x, W);
  const moved = x.map(row => [...row]);
  moved[100][0] += 0.5; // one entry: a uniform shift would vanish in LayerNorm
  const after = blockOutputs(moved, W);
  const changed = base.map((row, i) => row.some((e, n) => Math.abs(e - after[i][n]) > 1e-12)).flatMap((c, i) => (c ? [i] : []));
  assert.deepEqual(changed, Array.from({ length: B - 100 }, (unused, k) => 100 + k), 'outputs 100..255 and nothing else');

  assert.equal(activity.check, 'choice_equals');
  const ids = activity.answer.options.map(o => o.id);
  assert.deepEqual(ids, ['only-100', 'from-100', 'upto-100', 'all']);
  for (const id of ids) assert.equal(PREDICATES.choice_equals({ answer: id }, activity), id === 'from-100');
  assert.equal(activity.answer.default, 'only-100', 'the naive default is wrong');
  const answerLabel = activity.answer.options.find(o => o.id === activity.expected).label;
  assert.equal(answerLabel, 'Positions 100 to 255');
  // Undrawn: neither end of the answer appears anywhere on the card in either
  // state, and each state's heading names one sub-layer, never both composed.
  const [, P, LAST] = answerLabel.match(/(\d+) to (\d+)/);
  const [attn, mlp] = assertCardGates(scene, reviewStates);
  for (const result of [attn, mlp]) {
    const shown = result.state.objects.filter(o => o.visible && (o.opacity ?? 1) > 0).map(o => o.label || '');
    assert.ok(shown.length > 20);
    for (const n of [P, LAST]) assert.ok(shown.every(label => !label.includes(n)), `${n} is drawn`);
  }
  assert.match(byId(attn, 'heading').label, /attn/); assert.doesNotMatch(byId(attn, 'heading').label, /mlp/);
  assert.match(byId(mlp, 'heading').label, /mlp/); assert.doesNotMatch(byId(mlp, 'heading').label, /attn/);
  assert.ok(activity.prompt.includes('Dropout is off') && activity.prompt.includes('can change'));
  assert.ok(activity.feedbackPass.includes('(156 positions)'));
  for (const t of [activity.prompt, activity.feedbackPass, activity.feedbackFail]) assert.doesNotMatch(t, /\.py\b|:\d+|generate_fixtures/);
});

test('c05 sources: every status is labelled on the card; provenance lives under it', () => {
  assertSources(sources, scene);
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Source value', 'Live calculation']);
  const cites = sources.filter(s => s.kind === 'code').map(s => `${s.path}:${s.lines.join('-')}`);
  assert.deepEqual(cites, ['model.py:45-50', 'model.py:56-59', 'model.py:64-64', 'model.py:67-71', 'model.py:72-75', 'model.py:82-92',
    'model.py:21-27', 'model.py:98-105', 'model.py:173-173', 'config/train_shakespeare_char.py:19-19',
    'config/train_shakespeare_char.py:25-25', 'sample.py:51-51']);
  assert.deepEqual(sources.filter(s => s.kind === 'doc').map(s => s.title.split(' ')[0]), ['torch.nn.Linear', 'torch.nn.GELU', 'torch.nn.Dropout', 'torch.nn.LayerNorm']);
});

const PATHS = ['model.py', 'config/train_shakespeare_char.py', 'sample.py'];
const cached = PATHS.every(path => pinnedFile(path));
test('c05 every quoted fragment is in its cited lines at the pinned revision', { skip: !cached && 'pinned NanoGPT cache absent (run generate_fixtures.py)' }, () => {
  const squash = t => t.replace(/\s+/g, ' ').trim();
  let quotes = 0;
  for (const source of sources.filter(s => s.kind === 'code')) {
    const [start, end] = source.lines;
    const cited = squash(pinnedFile(source.path).slice(start - 1, end).join(' '));
    for (const [, quote] of source.note.matchAll(/"([^"]+)"/g)) {
      quotes += 1;
      assert.ok(cited.includes(squash(quote)), `${source.path}:${start}-${end} lacks "${quote}"`);
    }
  }
  assert.ok(quotes >= 24, `${quotes} quotes checked`);
  const config = pinnedFile('config/train_shakespeare_char.py');
  assert.equal(Number(config[19 - 1].match(/block_size = (\d+)/)[1]), fx.architecture.block_size);
});

test('c05 evidence record is complete', () => {
  assertEvidence(evidence);
  assert.ok(evidence.sourceRevision.includes(fx.provenance.nanogpt.commit));
});
