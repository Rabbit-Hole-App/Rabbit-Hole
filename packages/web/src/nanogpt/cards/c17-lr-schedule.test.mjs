import { test } from 'node:test';
import assert from 'node:assert/strict';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { assertCardGates, assertEvidence } from '../card-gates.mjs';
import { sceneContentBounds } from '../../scene-layout.js';
import { scene, evidence } from './c17-lr-schedule.js';

// Independent oracle: train.py:231-242 get_lr re-implemented in plain JS with
// config/train_shakespeare_char.py's values (lines 27-33 @3adf61e), and
// train.py:258's decay_lr switch - never the scene's own derive graph.
const CFG = { learning_rate: 1e-3, max_iters: 5000, lr_decay_iters: 5000, min_lr: 1e-4, warmup_iters: 100 };
const decayRatio = (it, warmup_iters) => (it - warmup_iters) / (CFG.lr_decay_iters - warmup_iters);
const getLr = (it, warmup_iters) => {
  if (it < warmup_iters) return CFG.learning_rate * (it + 1) / (warmup_iters + 1);
  if (it > CFG.lr_decay_iters) return CFG.min_lr;
  const coeff = 0.5 * (1.0 + Math.cos(Math.PI * decayRatio(it, warmup_iters)));
  return CFG.min_lr + coeff * (CFG.learning_rate - CFG.min_lr);
};
const WARMUP = [CFG.warmup_iters, CFG.warmup_iters, 1000];
const PRESETS = [
  { lr: it => getLr(it, WARMUP[0]), phase: it => (it < WARMUP[0] ? 'linear warmup' : 'cosine decay') },
  { lr: () => CFG.learning_rate, phase: () => 'constant (decay_lr = False)' },
  { lr: it => getLr(it, WARMUP[2]), phase: it => (it < WARMUP[2] ? 'linear warmup' : 'cosine decay') },
];
const sci = x => x.toExponential(2); // = generate_fixtures.py sci(): f'{x:.2e}' without the exponent's leading zero
const S = fx.lrSchedule;
const I = S.inspectIterations;
const FRAME = { x: 110, y: 130, w: 800, h: 220, xMax: CFG.max_iters, yMax: CFG.learning_rate * 1.1 };
const px = it => FRAME.x + (it / FRAME.xMax) * FRAME.w;
const py = lr => FRAME.y + FRAME.h - (lr / FRAME.yMax) * FRAME.h;
const byId = (result, id) => result.state.objects.find(o => o.id === id);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

const TAUGHT = [{ schedule: 0, inspect: 0 }, { schedule: 0, inspect: 2 }, { schedule: 1, inspect: 3 }, { schedule: 2, inspect: 3 }, { schedule: 0, inspect: 5 }];
const ALL = [0, 1, 2].flatMap(schedule => I.map((u, inspect) => ({ schedule, inspect })));

// What each note must say, per (preset, inspected iteration), and - for the
// two non-configured presets - which way it claims lr compares with the
// configured value there ('>' higher, '<' lower, '=' equal). The direction is
// checked against the oracle, so a mis-indexed or backwards note fails.
const NOTE_RULES = [
  [/^Not zero, just too small to see at this scale/, /^Still warmup/, /^First cosine iteration.*exactly learning_rate - the peak/,
    /^Cosine decay: the cosine starts flat/, /^Cosine decay: near the middle/, /^Last iteration.*lands on min_lr.*never runs: train\.py:332 breaks/],
  [/^decay_lr = False: .*full learning_rate/, /^decay_lr = False: .*still ramping/, /^decay_lr = False: .*matches the configured schedule/,
    /^decay_lr = False: .*above the configured value/, /^decay_lr = False: .*gap to the grey dot keeps widening/, /^decay_lr = False: .*not min_lr/],
  [/^What-if: .*starts lower.*too small to see/, /^What-if: .*far below the peak and the grey dot/, /^What-if: .*still be warming up.*near min_lr by coincidence/,
    /^What-if: .*peak and the first cosine.*already decayed/, /^What-if: the decay starts later.*less far along.*higher than as configured/, /^What-if: .*also ends exactly on min_lr/],
];
const DIRECTION = [null, ['>', '>', '=', '>', '>', '>'], ['<', '<', '<', '>', '>', '=']];
const sign = (a, b) => (Math.abs(a - b) < 1e-12 ? '=' : a > b ? '>' : '<');

test('fixture matches get_lr and the config', () => {
  assert.equal(S.learning_rate, CFG.learning_rate);
  assert.equal(S.min_lr, CFG.min_lr);
  assert.equal(S.lr_decay_iters, CFG.lr_decay_iters);
  assert.equal(S.max_iters, CFG.max_iters);
  assert.deepEqual(I, [0, CFG.warmup_iters - 1, CFG.warmup_iters, 1000, 2500, CFG.max_iters]);
  assert.ok(S.iterations.includes(0) && S.iterations.includes(CFG.warmup_iters) && S.iterations.at(-1) === CFG.max_iters);
  S.presets.forEach((preset, p) => {
    S.iterations.forEach((it, k) => near(preset.lr[k], PRESETS[p].lr(it), 1e-9, `preset ${p} lr at ${it}`));
    preset.inspect.forEach((rec, k) => {
      assert.equal(rec.iteration, I[k]);
      near(rec.lr, PRESETS[p].lr(I[k]), 1e-9, `preset ${p} inspect ${I[k]}`);
      assert.equal(rec.lrText, sci(PRESETS[p].lr(I[k])));
      assert.equal(rec.phase, PRESETS[p].phase(I[k]));
    });
  });
});

test('the facts the notes teach hold in the data', () => {
  const [conf, flat, long] = S.presets;
  // iteration 0 is learning_rate x 1/(warmup_iters+1) - not zero, but under 2px above the axis here
  near(conf.inspect[0].lr, CFG.learning_rate / (CFG.warmup_iters + 1), 1e-9, 'iter 0'); // fixture keeps 9 decimals
  assert.ok(conf.inspect[0].lr > 0 && py(0) - py(conf.inspect[0].lr) < 2.5);
  assert.ok(py(0) - py(long.inspect[0].lr) < 2.5);
  // 99 is still warmup, 100 is the first cosine iteration and the peak
  assert.equal(conf.inspect[1].phase, 'linear warmup');
  assert.equal(conf.inspect[2].phase, 'cosine decay');
  assert.equal(conf.inspect[2].lr, CFG.learning_rate);
  // the 99 and 100 dots (14px) overlap almost entirely: under 1px apart in x, under 3px in y
  assert.ok(Math.abs(px(I[1]) - px(I[2])) < 1 && Math.abs(py(conf.inspect[1].lr) - py(conf.inspect[2].lr)) < 3);
  // early decay has fallen little; 2500 is close to halfway between learning_rate and min_lr
  assert.ok(conf.inspect[3].lr > 0.9 * CFG.learning_rate);
  const half = (CFG.learning_rate + CFG.min_lr) / 2;
  assert.ok(Math.abs(conf.inspect[4].lr - half) < 0.05 * (CFG.learning_rate - CFG.min_lr));
  // the last iteration lands exactly on min_lr because lr_decay_iters = max_iters,
  // and train.py:332 (iter_num > max_iters: break) stops before get_lr's it > lr_decay_iters branch
  assert.equal(conf.inspect[5].iteration, CFG.max_iters);
  assert.equal(conf.inspect[5].lr, CFG.min_lr);
  assert.ok(!(CFG.max_iters > CFG.lr_decay_iters));
  // decay_lr = False: flat at learning_rate everywhere
  assert.ok(flat.lr.every(v => v === CFG.learning_rate));
  // what-if: 100 still warming up, at a height near min_lr (within 2px) by coincidence
  assert.equal(long.inspect[2].phase, 'linear warmup');
  assert.ok(Math.abs(py(long.inspect[2].lr) - py(CFG.min_lr)) < 2);
  // what-if: 1000 is the peak; at 2500 the decay is less far along (it starts later), so lr is higher
  assert.equal(long.inspect[3].lr, CFG.learning_rate);
  assert.ok(decayRatio(I[4], WARMUP[2]) < decayRatio(I[4], WARMUP[0]));
  assert.ok(long.inspect[4].lr > conf.inspect[4].lr);
  assert.equal(long.inspect[5].lr, CFG.min_lr);
  // decay_lr = False: the gap to the configured value widens from 1000 to 2500
  assert.ok(flat.inspect[4].lr - conf.inspect[4].lr > flat.inspect[3].lr - conf.inspect[3].lr);
});

test('gates pass at every state (all 18 preset x iteration picks)', () => {
  assertCardGates(scene, ALL);
});

test('curve, boundary, dots, readouts, source lines and notes follow the pick', () => {
  const results = assertCardGates(scene, ALL);
  ALL.forEach((inputs, n) => {
    const result = results[n];
    const { schedule: p, inspect: k } = inputs;
    const it = I[k];
    const lr = PRESETS[p].lr(it);
    const cfgLr = PRESETS[0].lr(it);
    const where = JSON.stringify(inputs);
    // the whole curve re-shapes with the preset
    S.iterations.slice(0, -1).forEach((x, i) => {
      const seg = byId(result, `curve-seg-${i}`);
      near(seg.from.x, px(x), 0.002, `${where} seg ${i} from.x`);
      near(seg.from.y, py(PRESETS[p].lr(x)), 0.002, `${where} seg ${i} from.y`);
      near(seg.to.x, px(S.iterations[i + 1]), 0.002, `${where} seg ${i} to.x`);
      near(seg.to.y, py(PRESETS[p].lr(S.iterations[i + 1])), 0.002, `${where} seg ${i} to.y`);
    });
    // the warmup_iters boundary sits at the preset's warmup_iters; hidden without get_lr
    const wu = byId(result, 'warmup-line');
    const wuLabel = byId(result, 'warmup-label');
    if (p === 1) assert.ok(wu.opacity === 0 && wuLabel.opacity === 0, `${where} no boundary for decay_lr = False`);
    else {
      assert.ok(wu.opacity > 0 && wuLabel.opacity > 0, `${where} boundary shown`);
      near(wu.from.x, px(WARMUP[p]), 1e-9, `${where} boundary x`);
      assert.equal(wu.to.x, wu.from.x);
      assert.equal(wuLabel.label, `warmup_iters = ${WARMUP[p]}`);
    }
    // inspected dot + readout
    const dot = byId(result, 'inspect-dot');
    near(dot.x, px(it), 0.002, `${where} dot x`);
    near(dot.y, py(lr), 0.002, `${where} dot y`);
    assert.equal(byId(result, 'readout').label, `Orange dot (inspected): iteration ${it} - lr = ${sci(lr)} - phase: ${PRESETS[p].phase(it)}`);
    // configured reference: same iteration on the configured schedule, only off the configured preset
    const ref = byId(result, 'configured-ref');
    const refText = byId(result, 'reference');
    near(ref.x, px(it), 0.002, `${where} ref x`);
    near(ref.y, py(cfgLr), 0.002, `${where} ref y`);
    assert.equal(refText.label, `Grey dot (as configured): iteration ${it} - lr = ${sci(cfgLr)} - phase: ${PRESETS[0].phase(it)}`);
    assert.equal(refText.label.includes(S.presets[0].inspect[k].lrText), true);
    const hint = byId(result, 'reference-hint');
    if (p === 0) assert.ok(ref.opacity === 0 && refText.opacity === 0 && hint.opacity === 1, `${where} reference hidden (hint shown) on the configured preset`);
    else assert.ok(ref.opacity > 0 && refText.opacity === 1 && hint.opacity === 0, `${where} reference shown`);
    assert.equal(byId(result, 'curve-caption').label, `Curve: stored preset “${S.presets[p].label}”`);
    // the source lines shown are the branch the oracle says ran
    const lines = ['lineA', 'lineB', 'lineC'].map(id => byId(result, id).label).join('\n');
    if (p === 1) assert.match(lines, /^train\.py:258\s+lr = get_lr\(iter_num\) if decay_lr else learning_rate$/m);
    else if (it < WARMUP[p]) assert.match(lines, /^train\.py:234\s+return learning_rate \* \(it \+ 1\) \/ \(warmup_iters \+ 1\)$/m);
    else assert.match(lines, /^train\.py:242\s+return min_lr \+ coeff \* \(learning_rate - min_lr\)$/m);
    // the note says what this state teaches, and its direction claim matches the oracle
    const note = `${byId(result, 'note').label} ${byId(result, 'note-2').label}`;
    assert.match(note, NOTE_RULES[p][k], `${where} note`);
    if (DIRECTION[p]) assert.equal(sign(lr, cfgLr), DIRECTION[p][k], `${where} note direction vs configured`);
  });
});

test('taught states read as specified', () => {
  const [c00, c02, c13, c23, c05] = assertCardGates(scene, TAUGHT);
  assert.match(byId(c00, 'note').label, /^Not zero/);
  assert.equal(byId(c00, 'readout').label, 'Orange dot (inspected): iteration 0 - lr = 9.90e-6 - phase: linear warmup');
  assert.match(byId(c02, 'note').label, /^First cosine iteration/);
  assert.equal(byId(c02, 'readout').label, 'Orange dot (inspected): iteration 100 - lr = 1.00e-3 - phase: cosine decay');
  assert.match(byId(c13, 'note').label, /^decay_lr = False/);
  assert.equal(byId(c13, 'reference').label, `Grey dot (as configured): iteration 1000 - lr = ${S.presets[0].inspect[3].lrText} - phase: cosine decay`);
  assert.match(byId(c23, 'curve-caption').label, /what-if/);
  assert.match(byId(c23, 'preset-line').label, /hypothetical variant - not a shipped config.*warmup_iters changed from 100 to 1000/);
  assert.equal(byId(c23, 'readout').label, 'Orange dot (inspected): iteration 1000 - lr = 1.00e-3 - phase: cosine decay');
  assert.match(byId(c05, 'note').label, /lands on min_lr/);
  assert.equal(byId(c05, 'readout').label, 'Orange dot (inspected): iteration 5000 - lr = 1.00e-4 - phase: cosine decay');
  assert.equal(byId(c05, 'preset-line').label, 'config/train_shakespeare_char.py: warmup_iters=100, lr_decay_iters=5000, min_lr=1e-4');
  assert.equal(byId(c05, 'source-3').label, 'learning_rate 1e-3, warmup_iters 100, min_lr 1e-4, lr_decay_iters 5000, max_iters 5000.');
  // the on-card provenance does not claim :258 was executed
  assert.match(byId(c05, 'source-1').label, /executed train\.py's get_lr \(:231-242\)/);
  assert.doesNotMatch(byId(c05, 'source-1').label, /:258/);
  assert.match(byId(c05, 'source-2').label, /applies :258's else-branch/);
});

test('layout budget and product rules', () => {
  const [result] = assertCardGates(scene, [{}]);
  assert.ok(result.scene.objects.length <= 60);
  assert.ok(scene.objects[0].initialState.text.length <= 95);
  assert.equal(scene.objects[0].id, 'question');
  assert.ok(scene.width <= 960);
  assert.ok(scene.inputs.every(input => /preset|stored/.test(input.label)), 'controls are labelled as stored presets');
  // derived-opacity objects carry no appear event (it would override the derived value)
  const appearing = new Set(scene.timeline.filter(e => e.action === 'appear').map(e => e.target));
  for (const id of ['configured-ref', 'reference', 'reference-hint', 'warmup-line', 'warmup-label']) assert.ok(!appearing.has(id), id);
  // the renderer fits the frame to content bounds: they must not change with the pick, or the plot
  // jumps (a long preset line once shifted it ~5px). The 20px reference ring at x = 910 may add <3px.
  const bounds = assertCardGates(scene, ALL).map(r => sceneContentBounds(r.scene));
  for (const edge of ['xMin', 'xMax', 'yMin', 'yMax']) {
    const values = bounds.map(b => b[edge]);
    assert.ok(Math.max(...values) - Math.min(...values) < 3, `content bound ${edge} varies with the pick: ${values}`);
  }
});

test('evidence record is complete', () => {
  assertEvidence(evidence);
  assert.equal(evidence.sourceRevision, 'karpathy/nanoGPT@3adf61e154c3fe3fca428ad6bc3818b27a3b8291');
});
