import test from 'node:test';
import assert from 'node:assert/strict';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { validateActivity, PREDICATES, revealHiddenInputs, describeActivity } from '../../scene-activity.js';
import { sceneContentBounds, sceneLegibility } from '../../scene-layout.js';
import { describeAnimation } from '../../scene-describe.js';
import { assertCardGates, assertCardPlan, assertEvidence, assertSources, evaluated, pinnedFile } from '../card-gates.mjs';
import { scene, plan, reviewStates, activity, sources, evidence } from './c19-gradient-step.js';

// Independent oracle in plain JS floats (never the scene's derive graph): the
// bowl L = ½·c·(w − w*)², one step w₁ = w − lr × g from w = 0.
const W0 = 0, W_STAR = 3, C = 2, C_STEEP = 4;
const LRS = [0.25, 0.5, 0.75, 1, 1.1];
const loss = (c, w) => (c / 2) * (w - W_STAR) ** 2;
const grad = (c, w) => c * (w - W_STAR);
const stepAt = (c, lr) => {
  const g = grad(c, W0), w1 = W0 - lr * g;
  return { g, step: w1 - W0, w1, L1: loss(c, w1), lc: lr * c, factor: 1 - lr * c };
};
const r3 = v => Math.round(v * 1000) / 1000;
// The plot frame: x 90..470 for w -1..7, y 420..150 for L 0..20.
const px = w => 90 + ((w + 1) / 8) * 380;
const py = L => 420 - (L / 20) * 270;
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const shown = result => result.state.objects.filter(object => object.visible).map(object => object.id);
const ALL = [0, 1, 2, 3, 4].flatMap(lrPreset => [false, true].map(steepRevealed => ({ lrPreset, steepRevealed })));
const withoutContributors = box => { const { contributors: _c, ...rest } = box; return rest; };
const REVEAL = /^steep-(seg-\d+|start|arrow|drop|1|2)$/;

test('c19 passes every gate at every review state and every input combination', () => {
  assertCardGates(scene, reviewStates);
  assertCardGates(scene, ALL);
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.ok(reviewStates.length >= 2 && reviewStates.length <= 6);
  // Every preset is reviewed, and the reveal at the default lr.
  for (let lrPreset = 0; lrPreset < LRS.length; lrPreset += 1) assert.ok(reviewStates.some(s => s.lrPreset === lrPreset), `preset ${lrPreset}`);
  assert.ok(reviewStates.some(s => s.lrPreset === 0 && s.steepRevealed));
  assert.ok(reviewStates.some(s => s.lrPreset === 0 && !s.steepRevealed));
  // One INTERACT control; the latch is hidden.
  const visible = scene.inputs.filter(input => !input.hidden);
  assert.deepEqual(visible.map(i => [i.name, i.type, i.presentation, i.label, i.default]), [['lrPreset', 'index', 'picker', 'Learning rate (preset)', 0]]);
  assert.deepEqual(scene.exampleData.lrLabels, ['lr 0.25', 'lr 0.5', 'lr 0.75', 'lr 1', 'lr 1.1']);
  assert.deepEqual(scene.exampleData.lrs, LRS);
  assert.deepEqual(scene.inputs.find(i => i.hidden), { name: 'steepRevealed', type: 'bool', label: 'Steeper bowl revealed', hidden: true, default: false });
});

test('c19 the step, the landing and every readout match the oracle at every preset', () => {
  const EXPECT = [
    [0.25, 1.5, 1.5, 2.25, 0.5, 0.5],
    [0.5, 3, 3, 0, 1, 0],
    [0.75, 4.5, 4.5, 2.25, 1.5, -0.5],
    [1, 6, 6, 9, 2, -1],
    [1.1, 6.6, 6.6, 12.96, 2.2, -1.2],
  ];
  const results = assertCardGates(scene, ALL);
  ALL.forEach(({ lrPreset }, k) => {
    const result = results[k], d = result.derived, o = stepAt(C, LRS[lrPreset]);
    const [lr, step, w1, L1, lc, factor] = EXPECT[lrPreset];
    assert.deepEqual([r3(LRS[lrPreset]), r3(o.step), r3(o.w1), r3(o.L1), r3(o.lc), r3(o.factor)], [lr, step, w1, L1, lc, factor]);
    assert.deepEqual([d.lr, d.step[0], d.w1[0], d.L1[0], d.lc[0], d.factor[0]], [lr, step, w1, L1, lc, factor]);
    // d1 = factor × d0 at every preset.
    assert.ok(Math.abs(d.d1[0] - d.factor[0] * d.d0[0]) < 1e-9);
    assert.deepEqual([d.d0[0], d.g0[0], d.L0[0]], [-3, -6, 9]);
    assert.equal(byId(result, 'step-readout').label, `lr ${lr}: step = −lr × g = ${step}`);
    assert.equal(byId(result, 'land-readout').label, `lands at w = ${w1}: loss ${L1}`);
    assert.equal(byId(result, 'lc-readout').label, `lr × c = ${lc}, w − w*: -3 → ${r3(w1 - W_STAR)}`);
    assert.equal(byId(result, 'start-readout').label, 'start: w = 0, loss 9, g = -6');
    // The arrow runs in w at the start's loss; the drop line meets the bowl at the landing.
    const arrow = byId(result, 'step-arrow');
    assert.deepEqual([arrow.from, arrow.to], [{ x: px(W0), y: py(9) }, { x: px(w1), y: py(9) }]);
    const drop = byId(result, 'drop');
    assert.deepEqual([drop.from, drop.to], [{ x: px(w1), y: py(9) }, { x: px(w1), y: py(L1) }]);
    assert.deepEqual([byId(result, 'land').x, byId(result, 'land').y], [px(w1), py(L1)]);
    assert.deepEqual([byId(result, 'start').x, byId(result, 'start').y], [px(W0), py(9)]);
  });
  // The judge's pixels at lr 0.25, and the slope line clear of the landing.
  const [first] = results;
  assert.deepEqual(byId(first, 'step-arrow').to, { x: 208.75, y: 298.5 });
  assert.deepEqual([byId(first, 'land').x, byId(first, 'land').y], [208.75, 389.625]);
  assert.deepEqual([byId(first, 'slope').from, byId(first, 'slope').to], [{ x: px(-0.8), y: py(13.8) }, { x: px(0.8), y: py(4.2) }]);
  assert.deepEqual([byId(first, 'slope').from, byId(first, 'slope').to], [{ x: 99.5, y: 233.7 }, { x: 175.5, y: 363.3 }]);
  // Its ends sit 0.8 loss below the drawn chords (about 11 px), and clear of the lr 0.25 landing.
  assert.ok(Math.hypot(208.75 - 175.5, 389.625 - 363.3) > 40);
  // The slope line is g: it rises 0.8 × 6 to the left and falls 0.8 × 6 to the right of the start.
  assert.deepEqual(first.derived.tanW, [-0.8, 0.8]);
  assert.deepEqual(first.derived.tanL, [r3(loss(C, W0) - 0.8 * grad(C, W0)), r3(loss(C, W0) + 0.8 * grad(C, W0))]);
  // The bowl's samples are exact at 3 decimals.
  assert.deepEqual(first.derived.LC, scene.exampleData.ws.map(w => loss(C, w)));
  assert.deepEqual(first.derived.LC, [16, 9, 4, 2.25, 1, 0.25, 0, 0.25, 1, 2.25, 4, 9, 16]);
});

test('c19 the outcome caption follows lr × c; the static lines hold at every preset', () => {
  const classOf = f => (f > 0 && f < 1 ? 'Stops short' : f === 0 ? 'Lands exactly' : f > -1 && f < 0 ? 'Overshoots' : f === -1 ? 'Bounces' : 'Climbs out');
  const ROLES = { 'Stops short': 'neutral', 'Lands exactly': 'success', Overshoots: 'output', Bounces: 'warning', 'Climbs out': 'warning' };
  LRS.forEach((lr, lrPreset) => {
    const [result] = assertCardGates(scene, [{ lrPreset }]);
    const f = r3(stepAt(C, lr).factor), cls = classOf(f), outcome = byId(result, 'outcome');
    assert.ok(outcome.label.startsWith(cls), `${lr}: ${outcome.label}`);
    assert.equal(outcome.role, ROLES[cls]);
    // Each caption's claim, from the oracle: lower, zero, lower, same, higher loss.
    const { L1 } = stepAt(C, lr), L0 = loss(C, W0);
    if (cls === 'Stops short') assert.ok(Math.abs(stepAt(C, lr).w1 - W0) === Math.abs(W_STAR - W0) / 2, 'halfway');
    if (cls === 'Lands exactly') assert.equal(L1, 0);
    if (cls === 'Overshoots') assert.ok(stepAt(C, lr).w1 > W_STAR && L1 < L0);
    if (cls === 'Bounces') assert.ok(stepAt(C, lr).w1 > W_STAR && L1 === L0);
    if (cls === 'Climbs out') assert.ok(stepAt(C, lr).w1 > W_STAR && L1 > L0);
  });
  assert.deepEqual(LRS.map(lr => classOf(r3(stepAt(C, lr).factor))), ['Stops short', 'Lands exactly', 'Overshoots', 'Bounces', 'Climbs out']);
  // The counterfactual pair: 0.25 and 0.75 land at the same loss on opposite sides of w*.
  assert.equal(stepAt(C, 0.25).L1, stepAt(C, 0.75).L1);
  assert.equal(W_STAR - stepAt(C, 0.25).w1, stepAt(C, 0.75).w1 - W_STAR);
  // The step is linear in lr; the landing loss is not monotone.
  assert.deepEqual(LRS.map(lr => r3(stepAt(C, lr).step / lr)), LRS.map(() => 6));
  // "any start": (w − w*) after = (1 − lr × c) × (w − w*) before holds from any w on this bowl.
  for (const w of [-1, 0, 2, 5]) for (const lr of LRS) {
    const after = w - lr * grad(C, w) - W_STAR;
    assert.ok(Math.abs(after - (1 - lr * C) * (w - W_STAR)) < 1e-12);
  }
  const STATIC = {
    bowl: 'This bowl: L = ½·c·(w − w*)², steepness c = 2, minimum w* = 3, so g = c × (w − w*)',
    direction: 'the gradient g < 0, so −lr × g > 0: the step moves right',
    'rule-1': '(w − w*) after = (1 − lr × c) × (w − w*) before',
    'rule-2': 'lr × c below 1: short · 1: lands · 1 to 2: overshoots',
    'rule-3': '2: bounces, same loss · above 2: climbs out · any start',
    legend: 'slope line: g at start · arrow: step in w · drop line: to the new loss (down = lower, level = same, up = higher)',
    'footer-1': 'NanoGPT’s loss depends on millions of weights, not one, and each weight gets its own g from one backward pass.',
    'footer-2': 'Its lr is set every iteration, and its step is AdamW, which builds on this plain step.',
  };
  const labels = result => result.state.objects.filter(o => o.visible && o.label).map(o => o.label).join('\n');
  for (const result of assertCardGates(scene, ALL)) {
    for (const [id, label] of Object.entries(STATIC)) assert.equal(byId(result, id).label, label, id);
    assert.match(labels(result), /Calculated toy example/);
    assert.match(labels(result), /Live calculation/);
    assert.doesNotMatch(labels(result), /\.py\b|\.js\b|\bline \d|[a-z]:\d|\b[0-9a-f]{7}\b/);
    // No NanoGPT lr value sits beside the toy lr.
    assert.doesNotMatch(labels(result), /6e-4|1e-3|0\.0006|0\.001\b/);
  }
});

test('c19 the steeper bowl: hidden before commit, drawn on the same axes after', () => {
  for (let lrPreset = 0; lrPreset < LRS.length; lrPreset += 1) {
    const [before, after] = assertCardGates(scene, [{ lrPreset, steepRevealed: false }, { lrPreset, steepRevealed: true }]);
    assert.ok(!shown(before).some(id => REVEAL.test(id)), shown(before).join());
    assert.ok(shown(before).includes('steep-wait') && !shown(after).includes('steep-wait'));
    const revealed = shown(after).filter(id => REVEAL.test(id));
    assert.equal(revealed.length, 8 + 5);
    assert.equal(byId(after, 'steep-1').label, 'Steeper bowl (Calculated toy example): c = 4, so g = -12 at w = 0, twice this bowl’s -6');
    assert.equal(byId(after, 'steep-2').label, 'lr 0.25: lr × c = 1, it steps 3 and lands on w* = 3 · lr 0.5: lr × c = 2, it steps 6, back to loss 18');
    // Its coordinates are computed ungated; only its opacity follows the latch.
    assert.deepEqual(after.derived.LS, scene.exampleData.sws.map(w => loss(C_STEEP, w)));
    assert.deepEqual(after.derived.LS, [18, 8, 2, 0.5, 0, 0.5, 2, 8, 18]);
    assert.equal(after.derived.g0S[0], grad(C_STEEP, W0));
    const arrow = byId(after, 'steep-arrow');
    assert.deepEqual([arrow.from, arrow.to], [{ x: px(W0), y: py(18) }, { x: px(W_STAR), y: py(18) }]);
    assert.deepEqual([byId(after, 'steep-start').x, byId(after, 'steep-start').y], [px(W0), py(18)]);
    // Its drop line runs from the arrow tip down to the steeper bowl's vertex: it lands at loss 0.
    const sdrop = byId(after, 'steep-drop');
    assert.deepEqual([sdrop.from, sdrop.to], [{ x: px(W_STAR), y: py(18) }, { x: px(W_STAR), y: py(0) }]);
    // Its vertex is the drawn bowl's minimum, on the x-axis.
    assert.deepEqual(byId(after, 'steep-seg-3').to, { x: px(W_STAR), y: py(0) });
  }
  // The steep arrow is lr 0.25's step on the steeper bowl: it ends on w*.
  assert.equal(stepAt(C_STEEP, 0.25).w1, W_STAR);
  // No timeline appear on the reveal objects: opacity follows the latch only.
  assert.ok(!scene.timeline.some(event => REVEAL.test(event.target) || event.target === 'steep-wait'));
  // Nothing the card draws before commit is the answer: no preset changes c,
  // and the answer lr (the default preset) visibly stops halfway on this bowl.
  assert.equal(stepAt(C, 0.25).w1, (W0 + W_STAR) / 2);
});

test('c19 the tutor payload has no steeper-bowl value before a committed attempt, and has it after', () => {
  const block = attemptLog => ({ type: 'animation', title: scene.title, scene, inputs: { lrPreset: 0, steepRevealed: attemptLog.length > 0 }, time: scene.duration, activity, attemptLog });
  const before = describeAnimation(block([])).text;
  assert.match(before, /2\.25/, 'the payload does carry the drawn landing');
  assert.doesNotMatch(before, /"g0S"|"LS"|-12\b/);
  const after = describeAnimation(block([{ result: 'failed', answer: 'half' }])).text;
  assert.match(after, /"g0S"/);
});

test('c19 replay: bowl → slope → step → landing, each caption with its stage', () => {
  const at = time => shown(evaluated(scene, {}, time));
  const SLOPE = ['slope', 'start-readout', 'direction'];
  const STEP = ['step-arrow', 'step-readout'];
  const LAND = ['drop', 'land', 'land-readout', 'lc-readout', 'outcome', 'rule-1', 'rule-2', 'rule-3'];
  assert.ok(at(0.7).includes('curve-seg-11') && at(0.7).includes('start') && at(0.7).includes('bowl'));
  assert.ok(![...SLOPE, ...STEP, ...LAND].some(id => at(0.7).includes(id)), at(0.7).join());
  assert.ok(SLOPE.every(id => at(1.15).includes(id)) && ![...STEP, ...LAND].some(id => at(1.15).includes(id)), at(1.15).join());
  assert.ok(STEP.every(id => at(1.55).includes(id)) && !LAND.some(id => at(1.55).includes(id)), at(1.55).join());
  for (const id of [...SLOPE, ...STEP, ...LAND]) assert.ok(at(scene.duration).includes(id), id);
  // The curve draws left to right.
  const segs = scene.timeline.filter(event => /^curve-seg-/.test(event.target));
  assert.equal(segs.length, 12);
  segs.forEach((event, i) => assert.equal(event.target, `curve-seg-${i}`));
  for (let i = 1; i < segs.length; i += 1) assert.ok(segs[i].at > segs[i - 1].at);
});

test('c19 one frame at scale 1 that never refits across presets or the reveal', () => {
  const legibility = sceneLegibility(scene);
  assert.equal(legibility.scale, 1);
  assert.ok(scene.width >= legibility.viewport.w && scene.height >= legibility.viewport.h, JSON.stringify(legibility.viewport));
  assert.ok(scene.height <= 900);
  for (const [k, result] of assertCardGates(scene, ALL).entries()) {
    assert.deepEqual(withoutContributors(sceneContentBounds(result.scene)), withoutContributors(legibility.bounds), JSON.stringify(ALL[k]));
    assert.ok(result.scene.objects.length <= 60);
  }
  assert.equal(scene.objects.length, 56);
  assert.equal(scene.objects.filter(o => !REVEAL.test(o.id) && o.id !== 'steep-wait').length, 42);
});

test('c19 plan: staged, verbatim objective, sequence "Training fundamentals" 2 of 2, no boundary flag', () => {
  assertCardPlan({ scene, plan });
  assert.equal(plan.boundary.decision, 'staged');
  assert.deepEqual(Object.keys(plan.boundary.reviewed), []);
  assert.equal(plan.objective, 'After this card, the learner should understand that one gradient step moves the weight by −lr × g, so on a bowl whose slope grows by c per unit of distance the product lr × c decides whether the step stops short, lands on the minimum, overshoots, bounces back to the same loss or climbs out.');
  assert.deepEqual([plan.boundary.sequence.name, plan.boundary.sequence.position, plan.boundary.sequence.of], ['Training fundamentals', 2, 2]);
  assert.deepEqual(plan.boundary.sequence.relationships.map(r => [r.type, r.card, r.direction]), [
    ['prerequisite', 'c26-training-objective', 'in'],
    ['prerequisite', 'c20-optimizer', 'out'],
    ['prerequisite', 'c17-lr-schedule', 'out'],
  ]);
  assert.equal(scene.title, 'One gradient step on a quadratic');
  assert.equal(plan.causalSteps.length, 4);
  assert.match(plan.check, /twice as steep/);
});

test('c19 practice: a bowl twice as steep - graded, naive default wrong, reveal only after a committed attempt', () => {
  validateActivity(activity);
  assert.equal(activity.check, 'choice_equals');
  assert.equal(activity.fixedInputs, undefined, 'the lr control does not bear on another bowl');
  assert.equal(activity.revealInput, 'steepRevealed');
  const ids = activity.answer.options.map(o => o.id);
  assert.deepEqual(activity.answer.options.map(o => [o.id, o.label]), [['eighth', '0.125'], ['quarter', '0.25'], ['half', '0.5'], ['one', '1']]);
  for (const id of ids) assert.equal(PREDICATES.choice_equals({ answer: id }, activity), id === 'quarter');
  assert.equal(activity.answer.default, 'half');
  assert.notEqual(activity.answer.default, activity.expected);
  // The expected option is the one lr that lands the steeper bowl in one step.
  const lands = activity.answer.options.filter(o => stepAt(C_STEEP, Number(o.label)).w1 === W_STAR).map(o => o.id);
  assert.deepEqual(lands, ['quarter']);
  // The picture-reader's 0.5 lands this bowl and bounces on the steeper one.
  assert.equal(stepAt(C, 0.5).w1, W_STAR);
  assert.deepEqual([stepAt(C_STEEP, 0.5).w1, stepAt(C_STEEP, 0.5).L1, loss(C_STEEP, W0)], [6, 18, 18]);
  assert.deepEqual([stepAt(C_STEEP, 1).step, stepAt(C_STEEP, 1).L1], [12, 162]);
  assert.deepEqual([stepAt(C_STEEP, 0.125).step, stepAt(C_STEEP, 0.125).L1], [1.5, 4.5]);
  // The case is not drawn: no preset's c is 4 and no option label echoes a caption.
  assert.ok(!scene.exampleData.cVec.includes(C_STEEP));
  assert.equal(activity.prompt, 'Not drawn: a bowl twice as steep, L(w) = 2(w − 3)², whose gradient is g = 4 × (w − 3). From the same start, w = 0, which learning rate lands exactly on its minimum in one step?');
  assert.equal(activity.feedbackPass, 'Right: 0.25. Twice as steep means twice the gradient at every w: at the start g = -12, not -6. The step still has to be +3 to reach w* = 3, so lr × 12 = 3 and lr = 0.25; in the card’s rule, lr × c = 0.25 × 4 = 1. This bowl’s 0.5 would give lr × c = 2 on the steeper one: it steps 6, to w = 6, back at loss 18 on the other side.');
  assert.equal(activity.feedbackFail, 'Not quite. Twice as steep doubles the gradient at every w: at the start g = 4 × (0 − 3) = -12. A step of −lr × g must still be +3 to land on w* = 3, so lr = 3 ÷ 12 = 0.25 (the card’s rule: lr × c = 1 with c = 4). 0.5 lands this card’s bowl, but on the steeper one lr × c = 2: it steps 6, to w = 6, the same loss 18 on the other side, a bounce. 1 steps 12, far past (loss 162). 0.125 steps 1.5: halfway. The steeper bowl now appears on the card.');
  // The latch comes from the attempt log only.
  assert.deepEqual(revealHiddenInputs({ activity, attemptLog: [] }), { steepRevealed: false });
  assert.deepEqual(revealHiddenInputs({ activity, attemptLog: [{ result: 'failed' }] }), { steepRevealed: true });
  assert.doesNotMatch(describeActivity({ activity, activityAnswer: 'half' }), /quarter/);
  for (const t of [activity.prompt, activity.feedbackPass, activity.feedbackFail]) assert.doesNotMatch(t, /\.py\b|:\d+|generate_fixtures/);
});

test('c19 sources: every status labelled on the card; provenance lives under it', () => {
  assertSources(sources, scene);
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Calculated toy example', 'Live calculation']);
  // "millions of weights": c04's per-Block count × n_layer, from the fixture.
  const { n_embd: Cm, n_layer: L } = fx.architecture;
  assert.deepEqual([Cm, L], [384, 6]);
  assert.equal(12 * Cm ** 2 + 2 * Cm, 1770240);
  assert.ok((12 * Cm ** 2 + 2 * Cm) * L > 1e6);
  assert.match(sources.find(s => s.kind === 'code' && s.lines[0] === 22).note, /1,770,240 weights per Block .* = 10,621,440/);
});

const PATHS = ['model.py', 'train.py', 'config/train_shakespeare_char.py'];
const cached = PATHS.every(path => pinnedFile(path));
test('c19 every quoted fragment is in its cited lines at the pinned revision', { skip: !cached && 'pinned NanoGPT cache absent (run generate_fixtures.py)' }, () => {
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
  assert.ok(quotes >= 18, `${quotes} quotes checked`);
  const train = pinnedFile('train.py');
  assert.equal(train[305 - 1].trim(), 'scaler.scale(loss).backward()');
  assert.equal(train[311 - 1].trim(), 'scaler.step(optimizer)');
  const config = pinnedFile('config/train_shakespeare_char.py');
  assert.equal(config[17 - 1].trim(), 'gradient_accumulation_steps = 1');
  // The config never overrides decay_lr, so it stays True.
  assert.ok(!config.some(line => /^\s*decay_lr\b/.test(line)));
  assert.match(pinnedFile('model.py')[284 - 1], /torch\.optim\.AdamW\(/);
});

test('c19 evidence record is complete', () => {
  assertEvidence(evidence);
  assert.ok(evidence.sourceRevision.includes(fx.provenance.nanogpt.commit));
  assert.equal(evidence.learningQuestion, 'One step of w − lr × g: where does it land, and what decides that?');
});
