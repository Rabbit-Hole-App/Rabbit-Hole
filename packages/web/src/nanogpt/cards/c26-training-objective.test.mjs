import test from 'node:test';
import assert from 'node:assert/strict';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import tl from '../depth/fixtures/training-loss.generated.js';
import { validateActivity, PREDICATES, describeActivity } from '../../scene-activity.js';
import { sceneContentBounds, sceneLegibility } from '../../scene-layout.js';
import { ungroupedNumbers } from '../../scene-format.js';
import { assertCardGates, assertCardPlan, assertEvidence, assertSources, evaluated, pinnedFile } from '../card-gates.mjs';
import { scene, plan, reviewStates, activity, sources, evidence } from './c26-training-objective.js';
import { plan as c19Plan } from './c19-gradient-step.js';

// Independent oracle, typed as the plan lists it (docs/nanogpt-deep-dive-batch4-plans.md, c26):
// the recorded p at iteration 1000 and the judge's table by T - never the scene's derive graph.
const P = [0.397769, 0.018573, 0.211479, 0.132347, 0.208491, 0.246526, 0.072372, 0.274424];
const TABLE = [ // T, sum, mean, e→f share, perplexity
  [1, 0.922, 0.922, null, '2.51'],
  [2, 4.908, 2.454, 1.993, '11.63'],
  [3, 6.462, 2.154, 1.329, '8.62'],
  [4, 8.484, 2.121, 0.997, '8.34'],
  [5, 10.052, 2.01, 0.797, '7.46'],
  [6, 11.452, 1.909, 0.664, '6.75'],
  [7, 14.078, 2.011, 0.569, '7.47'],
  [8, 15.371, 1.921, 0.498, '6.83'],
];
const r3 = v => Math.round(v * 1000) / 1000;
const LOSS = P.map(p => Number((-Math.log(p)).toFixed(4)));
const ALL = TABLE.map((unused, window) => ({ window }));
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const shown = result => result.state.objects.filter(object => object.visible).map(object => object.id);
const labels = result => result.state.objects.filter(o => o.visible && o.label).map(o => o.label);
const withoutContributors = box => { const { contributors: _c, ...rest } = box; return rest; };
// Layout the card declares: columns from x 170 at 60 px; bars 392..542, peak 4.5.
const COL_X = 170, CELL = 60, BAR_BASE = 542, PX = 146 / 4.5;

test('c26 passes every gate at every review state and every window', () => {
  assertCardGates(scene, reviewStates);
  assertCardGates(scene, ALL);
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.deepEqual(reviewStates, [{ window: 7 }, { window: 1 }, { window: 0 }, { window: 4 }]);
  // One INTERACT control: the What-if window length, default the drawn T = 8.
  assert.deepEqual(scene.inputs.map(i => [i.name, i.type, i.presentation, i.label, i.default, i.hidden]),
    [['window', 'index', 'slider', 'What-if: window length T (preset)', 7, undefined]]);
  assert.deepEqual(scene.exampleData.windowLabels, ['T = 1', 'T = 2', 'T = 3', 'T = 4', 'T = 5', 'T = 6', 'T = 7', 'T = 8']);
});

test('c26 fixture: the recorded window is from the toy run c18 plots, at its last checkpoint; the anchor is c16 ln 65', () => {
  const O = tl.recorded.objective;
  assert.deepEqual(Object.keys(O), ['text', 'at', 'iteration', 'pairs', 'p', 'loss', 'pplByT']);
  assert.equal(O.text, 'Before we');
  assert.equal(O.at, 15);
  // The tokenizer card's stream, in the same run's training slice.
  const stream = fx.tokenizer.tokenizers.find(t => t.id === 'char').tokens.slice(0, 9);
  assert.equal(stream.join('').replace(/␣/g, ' '), O.text);
  assert.ok(O.at + O.text.length <= fx.toyRun.config.train_chars);
  assert.equal(O.iteration, fx.toyRun.checkpoints.at(-1).iteration);
  assert.equal(O.iteration, tl.recorded.iterations.at(-1));
  assert.deepEqual(O.pairs, ['B→e', 'e→f', 'f→o', 'o→r', 'r→e', 'e→␣', '␣→w', 'w→e']);
  assert.deepEqual(O.p, P);
  assert.deepEqual(O.loss, [0.9219, 3.986, 1.5536, 2.0223, 1.5679, 1.4003, 2.6259, 1.2931]);
  // −ln p from the 6-decimal p lands within the 4-decimal rounding of the stored loss.
  O.loss.forEach((l, i) => assert.ok(Math.abs(l + Math.log(P[i])) < 1e-4, `${i}`));
  // pplByT = e^ of the mean exactly as the card prints it.
  assert.deepEqual(O.pplByT, TABLE.map(row => row[4]));
  TABLE.forEach(([T, sum, mean]) => {
    assert.equal(r3(LOSS.slice(0, T).reduce((a, b) => a + b, 0)), sum, `sum T=${T}`);
    assert.equal(r3(sum * (1 / T)), mean, `mean T=${T}`);
    assert.equal(Math.exp(mean).toFixed(2), O.pplByT[T - 1], `ppl T=${T}`);
  });
  // The same run as c18: its training loss at iteration 1000, and c16's uniform guess.
  assert.equal(fx.toyRun.checkpoints.at(-1).train, 2.1613);
  assert.equal(fx.crossEntropy.uniform65, 4.1744);
  assert.equal(tl.recorded.uniformLoss, fx.crossEntropy.uniform65);
});

test('c26 every stage follows T and matches the oracle at every window', () => {
  const results = assertCardGates(scene, ALL);
  TABLE.forEach(([T, sum, mean, share, ppl], window) => {
    const result = results[window], d = result.derived;
    assert.deepEqual([d.T, d.sum, d.mean, d.ppl, d.BT], [T, sum, mean, ppl, fx.architecture.batch_size * fx.architecture.block_size]);
    assert.equal(r3(d.sum / T), d.mean);
    assert.equal(d.share, r3(3.986 / T));
    if (share !== null) assert.equal(d.share, share);
    // ② the grid: p (%) then −ln p, blank past T; the drawn losses never change with T.
    const grid = byId(result, 'scores');
    assert.deepEqual(grid.values.slice(0, 8).map(v => (v === null ? null : v.toFixed(2))),
      P.map((p, i) => (i < T ? (p * 100).toFixed(2) : null)));
    assert.deepEqual(grid.values.slice(8), LOSS.map((l, i) => (i < T ? l : null)));
    assert.deepEqual(byId(result, 'loss-bars').values, LOSS.map((l, i) => (i < T ? l : null)));
    // −ln of the printed p is within 0.01 of the printed −ln p (each cell rounded on its own).
    for (let i = 0; i < T; i += 1) assert.ok(Math.abs(-Math.log(Number((P[i] * 100).toFixed(2)) / 100) - Number(LOSS[i].toFixed(2))) <= 0.0100001, `cell ${i}`);
    // ① the brackets: x covers characters 0..T − 1, y covers 1..T (one pitch to the right).
    const [x, y] = [byId(result, 'x-slice'), byId(result, 'y-slice')];
    assert.deepEqual([x.from.x, x.to.x], [COL_X + 6, COL_X + T * CELL - 6]);
    assert.deepEqual([y.from.x, y.to.x], [COL_X + CELL + 6, COL_X + (T + 1) * CELL - 6]);
    // ③ the mean line sits at the mean on the bars' scale and spans the T scored columns.
    const m = byId(result, 'mean-line');
    assert.ok(Math.abs(m.from.y - (BAR_BASE - mean * PX)) < 0.001 && m.from.y === m.to.y);
    assert.deepEqual([m.from.x, m.to.x], [COL_X, COL_X + T * CELL]);
    assert.equal(byId(result, 'mean-tag').label, `mean ${mean}`);
    assert.equal(byId(result, 'objective').label, `Objective = (sum of the T losses) ÷ T = ${sum} ÷ ${T} = ${mean} · each position counts 1/${T}`);
    assert.equal(byId(result, 'perplexity').label, `Perplexity = e^${mean} = ${ppl}: the same uncertainty as choosing uniformly`);
    assert.equal(byId(result, 'perplexity-2').label, `among about ${ppl} equally likely possibilities.`);
    assert.equal(byId(result, 'scope').label, 'This card: the mean over one T-position window. NanoGPT: the same mean over all B × T scored positions in the batch.');
    // e→f's share, or where it lies at T = 1.
    const onScreen = shown(result);
    if (T === 1) {
      assert.ok(onScreen.includes('outside') && !onScreen.includes('share'));
      assert.equal(byId(result, 'outside').label, 'e→f lies past a 1-position window');
    } else {
      assert.ok(onScreen.includes('share') && !onScreen.includes('outside'));
      assert.equal(byId(result, 'share').label, `e→f, the least expected (p = 1.86%), adds its 3.986 ÷ ${T} = ${share}`);
      // e→f is the least expected of every scored position.
      assert.equal(Math.min(...P.slice(0, T)), P[1]);
    }
    assert.equal(byId(result, 'state-1').label, T === 1 ? 'T = 1: 1 scored position, counting 1/1.' : `T = ${T}: ${T} scored positions, each counting 1/${T}.`);
  });
  // The anchor: ln 65 on the bars' scale, above the tallest bar (e→f).
  const anchor = byId(results[7], 'anchor');
  assert.ok(Math.abs(anchor.from.y - (BAR_BASE - Math.log(65) * PX)) < 0.1);
  assert.ok(anchor.from.y < BAR_BASE - Math.max(...LOSS) * PX);
  // The shares shrink as 1/T: 1.993 at T = 2 down to 0.498 at T = 8.
  assert.deepEqual(results.slice(1).map(r => r.derived.share), TABLE.slice(1).map(row => row[3]));
});

test('c26 captions are true at every state; status words only; the practice numbers are nowhere on the card', () => {
  const STATIC = {
    question: 'How do a window’s per-position losses become the one number training lowers?',
    'status-1': 'Recorded toy run (a bigram model, not NanoGPT; it reads only the previous character): p',
    'status-2': 'Calculated toy example: −ln p, e^mean · Live calculation: sum, mean, share, B · T',
    'status-3': 'What-if: window length T (NanoGPT’s is 256) · Source value: text, 65, B, T',
    'shift-1': 'y is x shifted by one: position i’s target is character i + 1.',
    'shift-2': 'A window of T characters gives T scored predictions (sp = space).',
    'anchor-tag': 'uniform guess 4.17',
    uniform: 'Uniform guess over all 65 characters: perplexity 65, loss ln 65 = 4.17 at every position.',
    'state-2': 'The drawn losses stay the same: T only sets how many are averaged.',
    legend: 'Grid: p(target) in % and its loss −ln p, each cell rounded on its own · bars: −ln p · line: their mean',
    footer: 'NanoGPT averages B · T = 64 · 256 = 16,384 positions per step and logs that mean as its loss, not e^loss.',
  };
  for (const result of assertCardGates(scene, ALL)) {
    for (const [id, label] of Object.entries(STATIC)) assert.equal(byId(result, id).label, label, id);
    const all = labels(result).join('\n');
    for (const status of ['Recorded toy run', 'Calculated toy example', 'Live calculation', 'What-if', 'Source value']) assert.ok(all.includes(status), status);
    assert.doesNotMatch(all, /\.py\b|\.js\b|\bline \d|[a-z]:\d|\b[0-9a-f]{7}\b/);
    // The judge's fix: e^4.17 is 64.7, so the anchor never claims e^4.17 = 65.
    assert.doesNotMatch(all, /e\^4\.17/);
    // The practice's losses and its answer appear nowhere (no cell reads 1.00 either).
    assert.doesNotMatch(all, /\b1\.03\b|\b1\.00\b|\b9\.00\b|\b5\.00\b|\b264\b/);
    const cells = byId(result, 'scores').values.filter(v => v !== null).map(v => v.toFixed(2));
    assert.ok(!cells.some(c => ['1.00', '1.03', '9.00'].includes(c)), cells.join());
    assert.deepEqual(labels(result).flatMap(ungroupedNumbers), []);
    // Never implies a longer window lowers the loss.
    assert.doesNotMatch(all, /longer (window|context)[^.]*(lower|better)/i);
  }
  assert.equal(Math.exp(4.17).toFixed(1), '64.7');
  assert.equal(Math.log(65).toFixed(2), '4.17');
});

test('c26 replay: the shift, then the scores, then the mean, then perplexity', () => {
  const at = time => shown(evaluated(scene, {}, time));
  const SHIFT = ['stream-label', ...Array.from({ length: 9 }, (unused, k) => `char-${k}`), 'x-label', 'x-slice', 'y-label', 'y-slice', 'shift-1', 'shift-2'];
  const MEAN = ['loss-bars', 'mean-line', 'mean-tag', 'objective', 'scope', 'state-1', 'state-2'];
  const PPL = ['anchor', 'anchor-tag', 'perplexity', 'perplexity-2', 'uniform'];
  assert.ok(SHIFT.every(id => at(0.4).includes(id)) && ![...MEAN, ...PPL, 'scores'].some(id => at(0.4).includes(id)), at(0.4).join());
  assert.ok(at(1.05).includes('scores') && ![...MEAN, ...PPL].some(id => at(1.05).includes(id)), at(1.05).join());
  assert.ok(MEAN.every(id => at(1.55).includes(id)) && !PPL.some(id => at(1.55).includes(id)), at(1.55).join());
  for (const id of [...SHIFT, 'scores', ...MEAN, ...PPL]) assert.ok(at(scene.duration).includes(id), id);
  // The two window-driven share captions carry no appear: their opacity follows T only.
  assert.ok(!scene.timeline.some(event => ['share', 'outside'].includes(event.target)));
});

test('c26 one frame at scale 1 that never refits across windows', () => {
  const legibility = sceneLegibility(scene);
  assert.equal(legibility.scale, 1);
  assert.ok(scene.width >= legibility.viewport.w && scene.height >= legibility.viewport.h, JSON.stringify(legibility.viewport));
  assert.ok(scene.height <= 900);
  for (const [k, result] of assertCardGates(scene, ALL).entries()) {
    assert.deepEqual(withoutContributors(sceneContentBounds(result.scene)), withoutContributors(legibility.bounds), JSON.stringify(ALL[k]));
  }
  assert.equal(scene.objects.length, 37);
});

test('c26 plan: staged, verbatim objective, sequence "Training fundamentals" 1 of 2 matching c19, no boundary flag', () => {
  assertCardPlan({ scene, plan });
  assert.equal(plan.boundary.decision, 'staged');
  assert.deepEqual(Object.keys(plan.boundary.reviewed), []);
  assert.equal(plan.objective, 'After this card, the learner should understand that NanoGPT\'s training objective is the plain mean of −ln p(next character) over every position it scores, each counting 1/N of it (N = B·T per step), a number perplexity only re-reads as e^mean.');
  const seq = plan.boundary.sequence;
  assert.deepEqual([seq.name, seq.position, seq.of], ['Training fundamentals', 1, 2]);
  assert.deepEqual([c19Plan.boundary.sequence.name, c19Plan.boundary.sequence.position, c19Plan.boundary.sequence.of], [seq.name, 2, seq.of]);
  assert.deepEqual(seq.relationships.map(r => [r.type, r.card, r.direction]), [
    ['prerequisite', 'c16-cross-entropy', 'in'],
    ['prerequisite', 'c11-causal-mask', 'in'],
    ['deepens', 'c01-forward-pass', 'in'],
    ['prerequisite', 'c19-gradient-step', 'out'],
    ['prerequisite', 'c18-train-val', 'out'],
  ]);
  // c19 records the same edge from its side.
  assert.ok(c19Plan.boundary.sequence.relationships.some(r => r.type === 'prerequisite' && r.card === 'c26-training-objective' && r.direction === 'in'));
  assert.equal(scene.title, 'The training objective: per-position targets, their mean, perplexity');
  assert.equal(plan.causalSteps.length, 4);
});

test('c26 practice: a 256-position window - graded, naive default wrong, feedback true', () => {
  validateActivity(activity);
  assert.equal(activity.check, 'choice_equals');
  assert.deepEqual(activity.fixedInputs, { window: 7 });
  const N = fx.architecture.block_size;
  assert.equal(N, 256);
  const mean = (255 * 1 + 9) / N;
  assert.equal(mean, 1.03125);
  assert.deepEqual(activity.answer.options.map(o => [o.id, o.label]), [['max', '9.00'], ['kinds', '5.00'], ['sum', '264.00'], ['none', '1.00'], ['mean', mean.toFixed(2)]]);
  assert.equal(activity.expected, 'mean');
  for (const { id } of activity.answer.options) assert.equal(PREDICATES.choice_equals({ answer: id }, activity), id === 'mean');
  assert.equal(activity.answer.default, 'max');
  assert.notEqual(activity.answer.default, activity.expected);
  // Only the equal-weight mean over all 256 positions gives the expected label.
  assert.equal(activity.answer.options.find(o => o.id === 'max').label, (9).toFixed(2));
  assert.equal(activity.answer.options.find(o => o.id === 'kinds').label, ((1 + 9) / 2).toFixed(2));
  assert.equal(activity.answer.options.find(o => o.id === 'sum').label, (255 + 9).toFixed(2));
  assert.equal(((9 - 1) / N).toFixed(2), '0.03');
  assert.equal(activity.prompt, 'NanoGPT’s shakespeare_char windows are block_size = 256 characters long; the card draws at most 8. Take one such window as a batch of one. Suppose 255 of its positions each score −ln p = 1.00 and one surprising position scores 9.00. What is this window’s loss, the mean NanoGPT minimizes?');
  assert.equal(activity.feedbackPass, 'Right: (255 × 1.00 + 9.00) ÷ 256 = 264 ÷ 256 = 1.03. Every position counts 1/256, so the one surprise lifts the mean only (9.00 − 1.00) ÷ 256 = 0.03 above 1.00. On the card the same 1/T rule shrinks e→f’s share from 3.986 ÷ 2 = 1.993 at T = 2 to 3.986 ÷ 8 = 0.498 at T = 8: the longer the window, the less one position moves the objective.');
  assert.equal(activity.feedbackFail, 'Not quite. NanoGPT’s loss is the mean of −ln p over every scored position, each counting 1/256 here: (255 × 1.00 + 9.00) ÷ 256 = 1.03. 9.00 lets the worst position decide; 5.00 averages the two kinds of position without counting them; 264.00 is the sum, not the mean; 1.00 ignores the surprise, which still adds (9.00 − 1.00) ÷ 256 = 0.03. On the card: e→f adds 3.986 ÷ T.');
  // The case is not drawn: the card's T stops at 8, and its means, shares and perplexities never reach it.
  assert.ok(Math.max(...scene.exampleData.Ts) < N);
  const results = assertCardGates(scene, [...ALL, activity.fixedInputs]);
  assert.ok(!results.some(r => r.derived.mean === r3(mean)));
  assert.doesNotMatch(describeActivity({ activity, activityAnswer: 'max' }), /"mean"|1\.03/);
  for (const t of [activity.prompt, activity.feedbackPass, activity.feedbackFail]) {
    assert.doesNotMatch(t, /\.py\b|:\d+|generate_fixtures/);
    assert.deepEqual(ungroupedNumbers(t), []);
  }
});

test('c26 sources: every status labelled on the card; provenance lives under it', () => {
  assertSources(sources, scene);
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status),
    ['Recorded toy run', 'Calculated toy example', 'Live calculation', 'What-if', 'Source value']);
  const tlEntries = sources.filter(s => s.kind === 'calculation' && ['Recorded toy run', 'Calculated toy example'].includes(s.status));
  for (const s of tlEntries) assert.match(s.reproduce, /gen_training_loss\.py --check$/);
  assert.ok(sources.some(s => s.kind === 'doc' && /cross_entropy/.test(s.url)));
});

const PATHS = ['model.py', 'train.py', 'config/train_shakespeare_char.py', 'data/shakespeare_char/prepare.py', 'README.md', 'sample.py'];
const cached = PATHS.every(path => pinnedFile(path));
test('c26 every quoted fragment is in its cited lines at the pinned revision', { skip: !cached && 'pinned NanoGPT cache absent (run generate_fixtures.py)' }, () => {
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
  assert.deepEqual([config[17 - 1], config[18 - 1]].map(s => s.trim()), ['gradient_accumulation_steps = 1', 'batch_size = 64']);
  // ignore_index = −1 never fires: get_batch reads targets from a uint16 file.
  assert.match(pinnedFile('train.py')[120 - 1], /dtype=np\.uint16/);
  // NanoGPT never computes e^loss: perplexity is a README todo only.
  for (const path of ['train.py', 'model.py', 'sample.py']) assert.ok(!pinnedFile(path).some(l => /perplex/i.test(l)), path);
  assert.deepEqual(pinnedFile('README.md').flatMap((l, i) => (/perplex/i.test(l) ? [i + 1] : [])), [214]);
});

test('c26 evidence record is complete', () => {
  assertEvidence(evidence);
  assert.ok(evidence.sourceRevision.includes(fx.provenance.nanogpt.commit));
  assert.equal(evidence.learningQuestion, 'How do a window’s per-position losses become the one number training lowers?');
});
