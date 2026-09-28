import test from 'node:test';
import assert from 'node:assert/strict';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import att from '../depth/fixtures/attention.generated.js';
import { validateActivity, PREDICATES, revealHiddenInputs, describeActivity } from '../../scene-activity.js';
import { formatCell } from '../../scene-format.js';
import { sceneContentBounds, sceneLegibility } from '../../scene-layout.js';
import { describeAnimation } from '../../scene-describe.js';
import { assertCardGates, assertCardPlan, assertEvidence, assertSources, evaluated, pinnedFile } from '../card-gates.mjs';
import { scene, plan, reviewStates, activity, sources, evidence } from './c12-score-scaling.js';

// Independent oracle: reader 5's q against every k in plain JS floats (never
// the scene's derive graph), × m, the later keys dropped, softmax.
const Q = att.heads[0].q, K = att.heads[0].k;
const READER = 5;
const RAW = K.map(k => k.reduce((s, x, d) => s + x * Q[READER][d], 0));
const weightsAt = m => {
  const visible = RAW.slice(0, READER + 1).map(s => s * m);
  const top = Math.max(...visible);
  const exps = visible.map(s => Math.exp(s - top));
  const total = exps.reduce((a, b) => a + b, 0);
  return [...exps.map(e => e / total), null, null, null];
};
const MULTIPLIERS = [0.25, 0.5, 1];
const R = 4; // 'r'
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const shown = result => result.state.objects.filter(object => object.visible).map(object => object.id);
const ALL = [0, 1, 2].flatMap(multiplier => [false, true].map(zeroRevealed => ({ multiplier, zeroRevealed })));
const close = (a, b) => (a === null ? b === null : Math.abs(a - b) < 1e-6);
const withoutContributors = box => { const { contributors: _c, ...rest } = box; return rest; };

test('c12 passes every gate at every review state and every input combination', () => {
  assertCardGates(scene, reviewStates);
  assertCardGates(scene, ALL);
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.ok(reviewStates.length >= 2 && reviewStates.length <= 6);
  // Every preset, and the reveal, are review states.
  for (const multiplier of [0, 1, 2]) assert.ok(reviewStates.some(s => s.multiplier === multiplier && !s.zeroRevealed));
  assert.ok(reviewStates.some(s => s.multiplier === 1 && s.zeroRevealed));
  // One INTERACT control; the latch is hidden.
  const visible = scene.inputs.filter(input => !input.hidden);
  assert.deepEqual(visible.map(i => [i.name, i.type, i.presentation, i.default]), [['multiplier', 'index', 'picker', 1]]);
  assert.deepEqual(scene.exampleData.multiplierLabels, ['× 1/4', '× 1/2 = 1/√hs', '× 1 (no factor)']);
  assert.deepEqual(scene.inputs.find(i => i.hidden), { name: 'zeroRevealed', type: 'bool', label: '× 0 row revealed', hidden: true, default: false });
});

test('c12 the rule preset is 1/√hs of the toy head, never typed; presets double', () => {
  assert.equal(att.hs, 4);
  assert.deepEqual(scene.exampleData.multipliers, MULTIPLIERS);
  assert.equal(scene.exampleData.multipliers[1], 1 / Math.sqrt(att.hs));
  assert.equal(scene.exampleData.rule, 1 / Math.sqrt(att.hs));
  assert.deepEqual(att.context.tokens, ['B', 'e', 'f', 'o', 'r', 'e', '␣', 'w', 'e']);
  assert.deepEqual(RAW.map(Math.round), [-2, 2, -2, 2, 8, 2, -2, 2, -2]);
});

test('c12 stage by stage: raw, scaled + masked, weights and bars match the oracle at every preset', () => {
  const results = assertCardGates(scene, ALL);
  ALL.forEach(({ multiplier, zeroRevealed }, k) => {
    const result = results[k], where = JSON.stringify(ALL[k]), m = MULTIPLIERS[multiplier];
    RAW.forEach((s, j) => assert.ok(close(byId(result, 'raw').values[j], s), `${where} raw ${j}`));
    byId(result, 'masked').values.forEach((v, j) => assert.ok(close(v, j <= READER ? RAW[j] * m : null), `${where} masked ${j}`));
    const w = weightsAt(m);
    for (const id of ['weights', 'bars']) byId(result, id).values.forEach((v, j) => assert.ok(close(v, w[j]), `${where} ${id} ${j}`));
    // The mask comes after the multiplier: the same three blanks at every preset.
    assert.deepEqual(byId(result, 'masked').values.slice(READER + 1), [null, null, null]);
    assert.equal(byId(result, 'times-m').label, `× ${['1/4', '1/2', '1'][multiplier]}`);
    assert.ok(byId(result, 'bars').peak === 1);
  });
  // 'r' reads 0.55 / 0.86 / 0.99 in its cell, and every weight cell each row draws.
  const cells = multiplier => byId(evaluated(scene, { multiplier }), 'weights').values.map(v => (v === null ? '' : formatCell(v)));
  assert.deepEqual(cells(0), ['0.04', '0.12', '0.04', '0.12', '0.55', '0.12', '', '', '']);
  assert.deepEqual(cells(1), ['0.01', '0.04', '0.01', '0.04', '0.86', '0.04', '', '', '']);
  assert.deepEqual(cells(2), ['0.00', '0.00', '0.00', '0.00', '0.99', '0.00', '', '', '']);
  // The legend's claims: a row can read 0.99 (each cell rounded on its own), 0.00 is above 0.
  assert.equal(cells(0).filter(Boolean).reduce((a, c) => a + Number(c), 0).toFixed(2), '0.99');
  assert.ok(weightsAt(1).slice(0, READER + 1).every(w => w > 0));
});

test('c12 captions follow the preset and stay true; the static lines hold at every preset', () => {
  const EXPECT = [
    { tag: 'What-if: × 1/4, not the rule', role: 'warning', r: '0.545' },
    { tag: 'The rule: × 1/√hs at this toy’s hs = 4', role: 'output', r: '0.86' },
    { tag: 'What-if: × 1, no factor', role: 'warning', r: '0.993' },
  ];
  EXPECT.forEach(({ tag, role, r }, multiplier) => {
    const [result] = assertCardGates(scene, [{ multiplier }]);
    assert.equal(byId(result, 'tag').label, tag);
    assert.equal(byId(result, 'tag').role, role);
    assert.equal(byId(result, 'readout').label, `weight on ‘r’: ${r} here, 0.86 at × 1/2 = 1/√hs`);
    // The readout is the oracle's 'r' weight, 3 decimals.
    assert.equal(Number(r), Math.round(weightsAt(MULTIPLIERS[multiplier])[R] * 1000) / 1000);
    assert.equal(Math.round(weightsAt(0.5)[R] * 1000) / 1000, 0.86);
    // flatter / sharper is what the weights do.
    const caption = `${byId(result, 'cap-1').label} ${byId(result, 'cap-2').label}`;
    if (multiplier === 0) assert.match(caption, /half the rule’s, so the weights are flatter/);
    if (multiplier === 2) assert.match(caption, /double the rule’s, so the weights are sharper/);
    if (multiplier === 1) {
      // The rule's gap is the oracle's: 'r' over the next visible score, raw and × 1/2.
      const gap = RAW[R] - Math.max(...RAW.slice(0, READER + 1).filter((_, j) => j !== R));
      assert.equal(caption, `× 1/√4 = × 1/2 halves every gap: ‘r’ leads by ${Math.round(gap / 2)}, not ${Math.round(gap)}, so the weights are flatter than with no factor`);
      assert.ok(weightsAt(0.5)[R] < weightsAt(1)[R]);
    }
  });
  assert.ok(weightsAt(0.25)[R] < weightsAt(0.5)[R] && weightsAt(0.5)[R] < weightsAt(1)[R]);
  // "any positive multiplier keeps the raw scores' order: 'r', then the three
  // visible 2s, then the two visible −2s; equal scores keep equal weights"
  assert.deepEqual(RAW.slice(0, READER + 1).map(Math.round), [-2, 2, -2, 2, 8, 2]);
  for (const m of [...MULTIPLIERS, 0.01, 3]) {
    const w = weightsAt(m);
    const order = [4, 1, 3, 5, 0, 2];
    for (let i = 1; i < order.length; i += 1) assert.ok(w[order[i - 1]] >= w[order[i]] - 1e-12);
    assert.ok(Math.abs(w[1] - w[3]) < 1e-6 && Math.abs(w[3] - w[5]) < 1e-6 && Math.abs(w[0] - w[2]) < 1e-6);
  }
  const labels = result => result.state.objects.filter(o => o.visible && o.label).map(o => o.label).join('\n');
  // The card never names a file, line or revision, and says "What-if" at every state.
  for (const result of assertCardGates(scene, ALL)) {
    assert.match(labels(result), /What-if/);
    assert.doesNotMatch(labels(result), /\.py\b|\.js\b|\bline \d|[a-z]:\d|\b[0-9a-f]{7}\b/);
  }
});

test('c12 the × 0 row: gated before commit, six 0.17 cells and three blanks after', () => {
  for (const multiplier of [0, 1, 2]) {
    const [hidden, revealed] = assertCardGates(scene, [{ multiplier, zeroRevealed: false }, { multiplier, zeroRevealed: true }]);
    assert.deepEqual(byId(hidden, 'zero-row').values, Array(9).fill(null), 'no value before commit');
    assert.ok(!shown(hidden).some(id => /^zero-(row|1|2|3)$/.test(id)));
    assert.ok(shown(hidden).includes('zero-wait'));
    // The gate blanks the displayed row before commit (w0Row itself is computed;
    // the tutor never gets it - see the describeAnimation test below).
    assert.deepEqual(hidden.derived.w0, Array(9).fill(null));
    const row = byId(revealed, 'zero-row').values;
    assert.deepEqual(row.slice(READER + 1), [null, null, null]);
    row.slice(0, READER + 1).forEach(v => assert.ok(Math.abs(v - 1 / 6) < 1e-6));
    assert.deepEqual(row.map(v => (v === null ? '' : formatCell(v))), ['0.17', '0.17', '0.17', '0.17', '0.17', '0.17', '', '', '']);
    assert.ok(shown(revealed).includes('zero-row') && !shown(revealed).includes('zero-wait'));
    assert.ok(['zero-1', 'zero-2', 'zero-3'].every(id => shown(revealed).includes(id)));
    assert.equal(byId(revealed, 'zero-1').label, '× 0 is not positive: no gap is left, so no order either.');
    assert.equal(byId(revealed, 'zero-2').label, '6 scores of 0, so 6 equal weights of 1/6, ‘r’ included.');
    assert.equal(byId(revealed, 'zero-3').label, 'sp w e stay blank: the mask comes after the multiplier.');
    assert.match(byId(revealed, 'zero-row').label, /What-if/);
  }
  // No preset draws a tie or the value 1/6 before the reveal.
  for (const m of MULTIPLIERS) assert.ok(weightsAt(m)[R] > 0.5);
  // The reveal objects follow the latch only (no timeline appear on them).
  assert.ok(!scene.timeline.some(event => /^zero-/.test(event.target)));
});

test('c12 the tutor payload has no × 0 weight before a committed attempt, and has it after', () => {
  const block = attemptLog => ({ type: 'animation', title: scene.title, scene, inputs: { multiplier: 1 }, time: scene.duration, activity, attemptLog });
  const before = describeAnimation(block([])).text;
  assert.match(before, /0\.86/, 'the payload does carry the drawn weights');
  assert.doesNotMatch(before, /0\.167|1\/6/);
  assert.match(describeAnimation(block([{ result: 'failed', answer: 'top' }])).text, /0\.167/);
});

test('c12 replay: each caption appears with its stage, none before its rows', () => {
  const at = time => shown(evaluated(scene, {}, time));
  const LATE = ['cap-1', 'cap-2', 'readout', 'order-1', 'order-2', 'order-3', 'legend-1', 'legend-2'];
  assert.ok(![...LATE, 'tag', 'times-m', 'masked'].some(id => at(0).includes(id)), at(0).join());
  assert.equal(at(0).includes('raw-note'), at(0).includes('raw'));
  assert.ok(at(0.7).includes('masked') && at(0.7).includes('tag') && !LATE.some(id => at(0.7).includes(id)), at(0.7).join());
  assert.ok(!at(0.7).includes('weights'));
  for (const id of [...LATE, 'tag', 'raw-note', 'weights', 'bars']) assert.ok(at(scene.duration).includes(id), id);
});

test('c12 one frame at scale 1 that never refits across presets or the reveal', () => {
  const legibility = sceneLegibility(scene);
  assert.equal(legibility.scale, 1);
  assert.ok(scene.width >= legibility.viewport.w && scene.height >= legibility.viewport.h, JSON.stringify(legibility.viewport));
  assert.ok(scene.height <= 900);
  for (const [k, result] of assertCardGates(scene, ALL).entries()) {
    assert.deepEqual(withoutContributors(sceneContentBounds(result.scene)), withoutContributors(legibility.bounds), JSON.stringify(ALL[k]));
    assert.ok(result.scene.objects.length <= 60);
  }
});

test('c12 plan: staged, verbatim objective, sequence "Self-attention" 2 of 3, no boundary flag', () => {
  assertCardPlan({ scene, plan });
  assert.equal(plan.boundary.decision, 'staged');
  assert.deepEqual(Object.keys(plan.boundary.reviewed), []);
  assert.equal(plan.objective, 'After this card, the learner should understand that NanoGPT multiplies every attention score by one positive number fixed by the head size, 1/√hs, before the mask and softmax, so the size of that number sets how peaked the visible weights are while their order and the masked zeros stay unchanged.');
  assert.deepEqual([plan.boundary.sequence.name, plan.boundary.sequence.position, plan.boundary.sequence.of], ['Self-attention', 2, 3]);
  assert.deepEqual(plan.boundary.sequence.relationships.map(r => [r.type, r.card, r.direction]), [
    ['prerequisite', 'c11-causal-mask', 'in'],
    ['prerequisite', 'c10-weighted-values', 'out'],
    ['prerequisite', 'c13-multi-head', 'out'],
    ['alternative_explanation', 'c21-temperature', undefined],
  ]);
  assert.equal(scene.title, 'Scaling scores by 1/√hs');
  assert.match(plan.check, /× 0/);
});

test('c12 practice: × 0, not a preset - graded, naive default wrong, reveal only after a committed attempt', () => {
  validateActivity(activity);
  assert.equal(activity.check, 'choice_equals');
  assert.deepEqual(activity.fixedInputs, { multiplier: 1 });
  assert.equal(activity.revealInput, 'zeroRevealed');
  assert.ok(!scene.exampleData.multipliers.includes(0), 'the asked case is not a preset');
  const ids = activity.answer.options.map(o => o.id);
  assert.deepEqual(ids, ['sixth', 'ninth', 'zero', 'top']);
  for (const id of ids) assert.equal(PREDICATES.choice_equals({ answer: id }, activity), id === 'sixth');
  assert.notEqual(activity.answer.default, activity.expected);
  assert.ok(ids.includes(activity.answer.default));
  // The options' numbers: 1/6 over the six visible keys; 1/9 forgets the mask.
  assert.equal((1 / 6).toFixed(2), '0.17');
  assert.equal((1 / 9).toFixed(2), '0.11');
  assert.equal(activity.answer.options.find(o => o.id === 'sixth').label, '0.17 (1/6)');
  // The naive default is false at × 0 even read loosely: 'r' ties, so it is not above the others.
  assert.equal(activity.answer.options.find(o => o.id === 'top').label, 'still above the others, below 0.55');
  // The latch comes from the attempt log only.
  assert.deepEqual(revealHiddenInputs({ activity, attemptLog: [] }), { zeroRevealed: false });
  assert.deepEqual(revealHiddenInputs({ activity, attemptLog: [{ result: 'failed' }] }), { zeroRevealed: true });
  assert.doesNotMatch(describeActivity({ activity, activityAnswer: 'top' }), /sixth|0\.167/);
  for (const t of [activity.prompt, activity.feedbackPass, activity.feedbackFail]) assert.doesNotMatch(t, /\.py\b|:\d+|generate_fixtures/);
  for (const phrase of ['1/9 forgets the mask', 'score of 0 with a weight of 0', 'only while the multiplier is positive']) assert.ok(activity.feedbackFail.includes(phrase), phrase);
  assert.match(activity.feedbackPass, /runs after the multiplier/);
});

test('c12 sources: every status labelled on the card; provenance lives under it', () => {
  assertSources(sources, scene);
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Calculated toy example', 'Live calculation', 'What-if', 'Source value']);
  const [result] = assertCardGates(scene, [{}]);
  const { n_embd: C, n_head: NH } = fx.architecture;
  assert.deepEqual([C, NH], [384, 6]);
  assert.equal(byId(result, 'real-hs').label, 'Source value: shakespeare_char has hs = 384 / 6 = 64, so its heads’ scores are × 1/8');
  // The characters are a Source value: the char tokenizer's first nine tokens.
  assert.match(byId(result, 'status').label, /^Characters: Source value · q, k: Calculated toy example/);
  assert.deepEqual(att.context.tokens, fx.tokenizer.tokenizers.find(t => t.id === 'char').tokens.slice(0, 9));
  assert.match(byId(result, 'reader').label, /^One reader \(query\): position 5,/);
  // The PyTorch 2.0 claim cites the comment line too (44), not only the hasattr line.
  assert.deepEqual(sources.find(s => s.kind === 'code' && s.note.includes('self.flash')).lines, [44, 45]);
});

const PATHS = ['model.py', 'train.py', 'config/train_shakespeare_char.py'];
const cached = PATHS.every(path => pinnedFile(path));
test('c12 every quoted fragment is in its cited lines at the pinned revision', { skip: !cached && 'pinned NanoGPT cache absent (run generate_fixtures.py)' }, () => {
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
  assert.ok(quotes >= 20, `${quotes} quotes checked`);
  const config = pinnedFile('config/train_shakespeare_char.py');
  assert.equal(config[23 - 1].trim(), `n_head = ${fx.architecture.n_head}`);
  assert.equal(config[24 - 1].trim(), `n_embd = ${fx.architecture.n_embd}`);
  // The mask line follows the multiply line in the manual path.
  const model = pinnedFile('model.py');
  assert.match(model[67 - 1], /math\.sqrt\(k\.size\(-1\)\)/);
  assert.match(model[68 - 1], /masked_fill/);
  assert.match(model[64 - 1], /is_causal=True\)$/);
  assert.doesNotMatch(model[64 - 1], /scale=/);
});

test('c12 evidence record is complete', () => {
  assertEvidence(evidence);
  assert.ok(evidence.sourceRevision.includes(fx.provenance.nanogpt.commit));
  assert.equal(evidence.learningQuestion, 'What does multiplying every score by one number do to the weights?');
});
