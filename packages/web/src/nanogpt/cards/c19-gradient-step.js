// c19 - one plain gradient step on one weight. Sequence "Training fundamentals",
// 2 of 2 (c26 names the number a step lowers; this card shows how one step
// lowers a loss). A calculated toy bowl, L = ½·c·(w − w*)² with c = 2 and
// w* = 3, and one weight starting at w = 0. Staged in causal order: ① the bowl,
// ② the slope g at the start, ③ the step −lr × g, ④ where it lands.
//
// One control, a learning-rate preset (0.25, 0.5, 0.75, 1, 1.1): the step grows
// in a straight line with lr, but the landing loss falls to 0, comes back to
// the start's 9, then passes it - five classes of one factor, 1 − lr × c. Every
// number on the card is a live derive op on the module literals below. The
// practice asks about a bowl twice as steep (c = 4), which no preset draws: its
// curve, dot, arrow, drop line and captions follow the hidden steepRevealed latch and
// appear only after a committed attempt.
//
// Layout: the plot on the left, the readouts beside it at x 500; the reveal
// slot, legend and footers under the plot, so the reveal never refits the frame.
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { axesObjects, seriesMapping, seriesObjects } from '../plot.js';
import { code, calculation } from '../sources.js';
import { groupDigits } from '../../scene-format.js';

const A = fx.architecture;
const W0 = 0;
const W_STAR = 3;
const C = 2;
const C_STEEP = 2 * C;
const LRS = [0.25, 0.5, 0.75, 1, 1.1];
// Dense near w* so the minimum does not kink; exact at the pool's 3 decimals.
const WS = [-1, 0, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7];
const SWS = [0, 1, 2, 2.5, 3, 3.5, 4, 5, 6];
const DELTA = [-0.8, 0.8];
const CONCEPT = 'gradient-step';

// The steeper bowl from W0, for the practice's options and feedback.
const G0 = C * (W0 - W_STAR);
const G0_STEEP = C_STEEP * (W0 - W_STAR);
const steepAt = lr => {
  const w1 = W0 - lr * G0_STEEP;
  return { step: w1 - W0, w1, loss: (C_STEEP / 2) * (w1 - W_STAR) ** 2 };
};
const L0_STEEP = (C_STEEP / 2) * (W0 - W_STAR) ** 2;
const LANDS = (W_STAR - W0) / -G0_STEEP; // the lr that steps exactly to w*
const [EIGHTH, QUARTER, HALF, ONE] = [LANDS / 2, LANDS, 2 * LANDS, 4 * LANDS].map(steepAt);

const frame = {
  id: 'plot', x: 90, y: 150, w: 380, h: 270, conceptId: CONCEPT,
  xDomain: [-1, 7], yDomain: [0, 20],
  xTicks: [{ value: 0, label: '0' }, { value: W_STAR, label: `${W_STAR} (w*)` }, { value: 6, label: '6' }],
  yTicks: [{ value: 0, label: '0' }, { value: 10, label: '10' }, { value: 20, label: '20' }],
  xTitle: 'w (the one weight)', yTitle: 'loss L(w)',
};
const MAPS = [
  seriesMapping(frame, 'curve', 'ws', 'LC', WS.length),
  seriesMapping(frame, 'slope', 'tanW', 'tanL', 2),
  seriesMapping(frame, 'start', 'w0', 'L0', 1),
  seriesMapping(frame, 'aEnd', 'w1', 'L0', 1),
  seriesMapping(frame, 'land', 'w1', 'L1', 1),
  seriesMapping(frame, 'steep', 'sws', 'LS', SWS.length),
  seriesMapping(frame, 'steepStart', 'w0', 'L0S', 1),
  seriesMapping(frame, 'steepEnd', 'wStar', 'L0S', 1),
];

const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const at = name => ({ x: { $derive: `${name}Px.0` }, y: { $derive: `${name}Py.0` } });
const at2 = (name, i) => ({ x: { $derive: `${name}Px.${i}` }, y: { $derive: `${name}Py.${i}` } });
const hidden = { opacity: 0 };
const steep = { opacity: { $derive: 'steepOp' } };
const RX = 500;

export const scene = {
  id: 'nanogpt-c19-gradient-step',
  title: 'One gradient step on a quadratic',
  width: 960,
  height: 640,
  duration: 2,
  inputs: [
    { name: 'lrPreset', type: 'index', label: 'Learning rate (preset)', of: 'lrLabels', default: 0, presentation: 'picker' },
    { name: 'steepRevealed', type: 'bool', label: 'Steeper bowl revealed', hidden: true, default: false },
  ],
  exampleData: {
    lrLabels: LRS.map(lr => `lr ${lr}`),
    lrs: LRS,
    w0: [W0], wStar: [W_STAR],
    cNum: C, cVec: [C], halfC: C / 2, one: [1],
    ws: WS, wStarN: WS.map(() => W_STAR),
    sws: SWS, wStarS: SWS.map(() => W_STAR),
    halfCSteep: C_STEEP / 2, cSteepNum: C_STEEP,
    DELTA,
    outcomes: [
      'Stops short: halfway to the minimum',
      'Lands exactly on the minimum',
      'Overshoots the minimum, but the loss drops',
      'Bounces: past the minimum, back to the same loss',
      'Climbs out: past the minimum, loss up',
    ],
    outcomeRoles: ['neutral', 'success', 'output', 'warning', 'warning'],
    ...Object.assign({}, ...MAPS.map(map => map.exampleData)),
  },
  derived: {
    lr: { op: 'pick', args: ['lrs', 'lrPreset'] },
    // ② the slope at the start: g = c × (w − w*).
    d0: { op: 'sub', args: ['w0', 'wStar'] },
    g0: { op: 'scale', args: ['d0', 'cNum'] },
    d0sq: { op: 'elementwise', args: ['d0', 'd0'] },
    L0: { op: 'scale', args: ['d0sq', 'halfC'] },
    // ③ the step: w₁ = w − lr × g.
    lrg: { op: 'scale', args: ['g0', 'lr'] },
    w1: { op: 'sub', args: ['w0', 'lrg'] },
    step: { op: 'sub', args: ['w1', 'w0'] },
    // ④ where it lands.
    d1: { op: 'sub', args: ['w1', 'wStar'] },
    d1sq: { op: 'elementwise', args: ['d1', 'd1'] },
    L1: { op: 'scale', args: ['d1sq', 'halfC'] },
    lc: { op: 'scale', args: ['cVec', 'lr'] },
    factor: { op: 'sub', args: ['one', 'lc'] },
    // ① the bowl.
    dc: { op: 'sub', args: ['ws', 'wStarN'] },
    dcsq: { op: 'elementwise', args: ['dc', 'dc'] },
    LC: { op: 'scale', args: ['dcsq', 'halfC'] },
    // The slope line through the start: w ± 0.8, L ± 0.8 × g (long enough to leave the curve visibly).
    g0s: { op: 'pick', args: ['g0', 0] },
    w0pair: { op: 'concat', args: ['w0', 'w0'] },
    L0pair: { op: 'concat', args: ['L0', 'L0'] },
    tanW: { op: 'add', args: ['DELTA', 'w0pair'] },
    dL: { op: 'scale', args: ['DELTA', 'g0s'] },
    tanL: { op: 'add', args: ['dL', 'L0pair'] },
    // The practice's steeper bowl: computed ungated, only its opacity follows the latch.
    ds: { op: 'sub', args: ['sws', 'wStarS'] },
    dssq: { op: 'elementwise', args: ['ds', 'ds'] },
    LS: { op: 'scale', args: ['dssq', 'halfCSteep'] },
    L0S: { op: 'scale', args: ['d0sq', 'halfCSteep'] },
    g0S: { op: 'scale', args: ['d0', 'cSteepNum'] },
    ...Object.assign({}, ...MAPS.map(map => map.derived)),
    outcome: { op: 'pick', args: ['outcomes', 'lrPreset'] },
    outcomeRole: { op: 'pick', args: ['outcomeRoles', 'lrPreset'] },
    steepOp: { op: 'choose', args: ['steepRevealed', 1, 0] },
    waitOp: { op: 'choose', args: ['steepRevealed', 0, 1] },
  },
  objects: [
    text('question', 'One step of w − lr × g: where does it land, and what decides that?', 40, 30, { typography: 'heading' }),
    note('status', 'Calculated toy example: one weight, one bowl-shaped loss · Live calculation: curve, step, readouts', 40, 56),
    text('bowl', `This bowl: L = ½·c·(w − w*)², steepness c = ${C}, minimum w* = ${W_STAR}, so g = c × (w − w*)`, 40, 80, hidden),

    ...axesObjects(frame, { tickMarks: false }),
    // The practice's bowl first, so the drawn bowl and the step lie over it.
    ...seriesObjects(frame, 'steep', SWS.length, { role: 'output' }).map(o => ({ ...o, initialState: { ...o.initialState, ...steep } })),
    { id: 'steep-start', type: 'circle', semanticId: 'steep-start', conceptId: CONCEPT,
      initialState: { ...at('steepStart'), w: 12, h: 12, role: 'output', ...steep } },
    { id: 'steep-arrow', type: 'arrow', semanticId: 'steep-step', conceptId: CONCEPT,
      initialState: { from: at('steepStart'), to: at('steepEnd'), role: 'output', ...steep } },
    // Its drop line to the new loss: the steeper curve's vertex (SWS[4] = w*, loss 0).
    { id: 'steep-drop', type: 'line', semanticId: 'steep-drop-line', conceptId: CONCEPT,
      initialState: { from: at('steepEnd'), to: at2('steep', SWS.indexOf(W_STAR)), role: 'output', ...steep } },
    ...seriesObjects(frame, 'curve', WS.length, { role: 'input' }).map(o => ({ ...o, initialState: { ...o.initialState, ...hidden } })),
    { id: 'slope', type: 'line', semanticId: 'slope-line', conceptId: CONCEPT,
      initialState: { from: at2('slope', 0), to: at2('slope', 1), role: 'prediction', ...hidden } },
    { id: 'start', type: 'circle', semanticId: 'start-point', conceptId: CONCEPT,
      initialState: { ...at('start'), w: 12, h: 12, role: 'observed', ...hidden } },
    { id: 'step-arrow', type: 'arrow', semanticId: 'step', conceptId: CONCEPT,
      initialState: { from: at('start'), to: at('aEnd'), role: 'learner', ...hidden } },
    { id: 'drop', type: 'line', semanticId: 'drop-line', conceptId: CONCEPT,
      initialState: { from: at('aEnd'), to: at('land'), role: 'learner', ...hidden } },
    { id: 'land', type: 'circle', semanticId: 'landing', conceptId: CONCEPT,
      initialState: { ...at('land'), w: 14, h: 14, role: 'learner', ...hidden } },

    // Beside the plot: the start, then what the chosen lr did.
    text('start-readout', 'start: w = {{w0.0}}, loss {{L0.0}}, g = {{g0.0}}', RX, 150, hidden),
    // The widest line in this column, and static: it fixes the frame's right edge at every state.
    note('direction', 'the gradient g < 0, so −lr × g > 0: the step moves right', RX, 172, hidden),
    text('step-readout', 'lr {{lr}}: step = −lr × g = {{step.0}}', RX, 206, { role: 'learner', ...hidden }),
    text('land-readout', 'lands at w = {{w1.0}}: loss {{L1.0}}', RX, 228, hidden),
    text('lc-readout', 'lr × c = {{lc.0}}, w − w*: {{d0.0}} → {{d1.0}}', RX, 250, hidden),
    text('outcome', '{{outcome}}', RX, 282, { role: { $derive: 'outcomeRole' }, ...hidden }),
    note('rule-1', '(w − w*) after = (1 − lr × c) × (w − w*) before', RX, 318, hidden),
    note('rule-2', 'lr × c below 1: short · 1: lands · 1 to 2: overshoots', RX, 336, hidden),
    note('rule-3', '2: bounces, same loss · above 2: climbs out · any start', RX, 354, hidden),

    // The practice's case. No timeline appear: opacity follows the latch.
    note('steep-wait', 'Not drawn: the steeper bowl. Answer the practice below, then it appears here, on the same axes.', 40, 492, { opacity: { $derive: 'waitOp' } }),
    note('steep-1', `Steeper bowl (Calculated toy example): c = ${C_STEEP}, so g = {{g0S.0}} at w = {{w0.0}}, twice this bowl’s {{g0.0}}`, 40, 492, steep),
    note('steep-2', `lr ${LANDS}: lr × c = ${LANDS * C_STEEP}, it steps ${QUARTER.step} and lands on w* = ${W_STAR} · lr ${2 * LANDS}: lr × c = ${2 * LANDS * C_STEEP}, it steps ${HALF.step}, back to loss ${HALF.loss}`, 40, 510, steep),

    note('legend', 'slope line: g at start · arrow: step in w · drop line: to the new loss (down = lower, level = same, up = higher)', 40, 540),
    note('footer-1', 'NanoGPT’s loss depends on millions of weights, not one, and each weight gets its own g from one backward pass.', 40, 574),
    note('footer-2', 'Its lr is set every iteration, and its step is AdamW, which builds on this plain step.', 40, 592),
  ],
  // Replay in causal order: the bowl, the slope at the start, the step, the landing;
  // each caption appears with its stage.
  timeline: [
    { at: 0, action: 'appear', target: 'bowl', duration: 0.3 },
    ...WS.slice(1).map((unused, i) => ({ at: Number((i * 0.05).toFixed(2)), action: 'appear', target: `curve-seg-${i}`, duration: 0.1 })),
    { at: 0.6, action: 'appear', target: 'start', duration: 0.2 },
    ...['slope', 'start-readout', 'direction'].map(target => ({ at: 0.8, action: 'appear', target, duration: 0.3 })),
    ...['step-arrow', 'step-readout'].map(target => ({ at: 1.2, action: 'appear', target, duration: 0.3 })),
    ...['drop', 'land', 'land-readout', 'lc-readout', 'outcome', 'rule-1', 'rule-2', 'rule-3'].map(target => ({ at: 1.6, action: 'appear', target, duration: 0.3 })),
  ],
};

// Every preset (lr 0.5 is seen with the reveal, where its landing meets the
// steeper bowl's vertex), then the committed reveal at the default lr.
export const reviewStates = [
  { lrPreset: 0, steepRevealed: false },
  { lrPreset: 2, steepRevealed: false },
  { lrPreset: 3, steepRevealed: false },
  { lrPreset: 4, steepRevealed: false },
  { lrPreset: 0, steepRevealed: true },
  { lrPreset: 1, steepRevealed: true },
];

// Practice (commit before you see): no preset changes c, so the steeper bowl
// needs the rule, not a reading of the picture. The lr control does not bear
// on another bowl, so there are no fixedInputs (the c05 precedent).
export const activity = {
  id: 'c19-practice',
  check: 'choice_equals',
  version: 1,
  prompt: `Not drawn: a bowl twice as steep, L(w) = ${C_STEEP / 2}(w − ${W_STAR})², whose gradient is g = ${C_STEEP} × (w − ${W_STAR}). From the same start, w = ${W0}, which learning rate lands exactly on its minimum in one step?`,
  revealInput: 'steepRevealed',
  // ponytail: SceneActivity shows no pick for an untouched answer, so this
  // naive default never renders; it only satisfies the choice declaration.
  // Bare values, so no option echoes a caption.
  answer: { type: 'choice', label: 'Learning rate', default: 'half', options: [
    { id: 'eighth', label: String(LANDS / 2) },
    { id: 'quarter', label: String(LANDS) },
    { id: 'half', label: String(2 * LANDS) },
    { id: 'one', label: String(4 * LANDS) },
  ] },
  expected: 'quarter',
  checkLabel: 'Check',
  feedbackPass: `Right: ${LANDS}. Twice as steep means twice the gradient at every w: at the start g = ${G0_STEEP}, not ${G0}. The step still has to be +${W_STAR - W0} to reach w* = ${W_STAR}, so lr × ${-G0_STEEP} = ${W_STAR - W0} and lr = ${LANDS}; in the card’s rule, lr × c = ${LANDS} × ${C_STEEP} = ${LANDS * C_STEEP}. This bowl’s ${2 * LANDS} would give lr × c = ${2 * LANDS * C_STEEP} on the steeper one: it steps ${HALF.step}, to w = ${HALF.w1}, back at loss ${HALF.loss} on the other side.`,
  feedbackFail: `Not quite. Twice as steep doubles the gradient at every w: at the start g = ${C_STEEP} × (${W0} − ${W_STAR}) = ${G0_STEEP}. A step of −lr × g must still be +${W_STAR - W0} to land on w* = ${W_STAR}, so lr = ${W_STAR - W0} ÷ ${-G0_STEEP} = ${LANDS} (the card’s rule: lr × c = ${LANDS * C_STEEP} with c = ${C_STEEP}). ${2 * LANDS} lands this card’s bowl, but on the steeper one lr × c = ${2 * LANDS * C_STEEP}: it steps ${HALF.step}, to w = ${HALF.w1}, the same loss ${HALF.loss} on the other side, a bounce. ${4 * LANDS} steps ${ONE.step}, far past (loss ${ONE.loss}). ${LANDS / 2} steps ${EIGHTH.step}: halfway. The steeper bowl now appears on the card.`,
};

// Phase 1 plan (docs/nanogpt-deep-dive-batch4-plans.md, c19; verbatim where it fits).
export const plan = {
  concept: 'one plain gradient step on one weight',
  objective: 'After this card, the learner should understand that one gradient step moves the weight by −lr × g, so on a bowl whose slope grows by c per unit of distance the product lr × c decides whether the step stops short, lands on the minimum, overshoots, bounces back to the same loss or climbs out.',
  prerequisites: [
    'c26-training-objective (the sequence \'Training fundamentals\', 1 of 2): NanoGPT\'s loss is one number, the mean −ln p over the B·T positions of a step, that training pushes down. c19 replaces it with a one-weight bowl',
    'the slope of a curve at a point, taught in place: the slope line drawn through the start point is g',
    'no calculus: the card gives g = c × (w − w*) for its own bowl, and the practice prompt gives the steeper bowl\'s gradient',
  ],
  causalSteps: [
    'the bowl: L = ½·c·(w − w*)² with c = 2, w* = 3; the one weight starts at w = 0, where the loss is 9',
    'the gradient at the start: g = c × (0 − 3) = −6, drawn as a slope line through the start dot',
    'the step: −lr × g = 6·lr, a horizontal arrow in w at the start\'s loss level',
    'where it lands: a drop line from the arrow tip to the bowl, the landing dot at w₁ = 6·lr with loss (6·lr − 3)²; below the arrow = lower, level = same, above = higher',
  ],
  primaryInteraction: 'one index picker, "Learning rate (preset)": lr 0.25 (default), 0.5, 0.75, 1, 1.1. It moves the step arrow\'s end, the drop line and the landing dot, three readouts (the step, where it lands, lr × c and w − w* before → after) and one picked outcome caption (stops short / lands / overshoots with a lower loss / bounces to the same loss / climbs out). The step grows in a straight line with lr but the landing loss does not; 0.25 and 0.75 land at the same loss on opposite sides of w*',
  check: 'practice (commit before you see, choice_equals, no fixedInputs): a bowl twice as steep, L(w) = 2(w − 3)², g = 4 × (w − 3), from the same start w = 0 - which learning rate lands exactly on its minimum in one step? No preset changes c, so the answer needs the rule (g doubles with c; lr × c = 1 with c = 4, so lr = 0.25), not the picture, whose landing lr 0.5 bounces there. The steeper bowl, its start dot, its step arrow, its drop line to the vertex and two captions appear after the committed attempt',
  boundary: {
    decision: 'staged',
    reason: 'one causal pipeline - slope at the start → × lr → step in w → new loss - replayed in order, with one control acting on one quantity. The five presets are values of that one quantity, and short, lands, overshoots, bounces and climbs out are the five classes of one factor, 1 − lr × c; the steeper bowl applies the same rule with another c. The update rules (momentum, Adam, AdamW, weight decay) stay on c20, lr across iterations on c17, what NanoGPT\'s loss is on c26, clipping and accumulation on Training · Deep dive',
    reviewed: {},
    sequence: { name: 'Training fundamentals', position: 2, of: 2, relationships: [
      { type: 'prerequisite', card: 'c26-training-objective', direction: 'in' },
      { type: 'prerequisite', card: 'c20-optimizer', direction: 'out' },
      { type: 'prerequisite', card: 'c17-lr-schedule', direction: 'out' },
    ] },
  },
};

const PER_BLOCK = 12 * A.n_embd ** 2 + 2 * A.n_embd;

export const sources = [
  code('train.py', 305, 305, 'The backward pass: "scaler.scale(loss).backward()" - one call fills a gradient g for every weight at once; the card follows one of them.'),
  code('config/train_shakespeare_char.py', 17, 17, 'shakespeare_char runs "gradient_accumulation_steps = 1", so each step has one backward pass.'),
  code('train.py', 48, 48, 'The default is "gradient_accumulation_steps = 5 * 8 # used to simulate larger batch sizes": several backward passes add into g before one step. Not modelled on the card.'),
  code('train.py', 301, 301, 'With accumulation the loss is divided first: "loss = loss / gradient_accumulation_steps # scale the loss to account for gradient accumulation".'),
  code('train.py', 306, 309, 'Before the step g is clipped: "# clip the gradient", "if grad_clip != 0.0:", "torch.nn.utils.clip_grad_norm_(model.parameters(), grad_clip)". Not modelled on the card.'),
  code('train.py', 311, 311, 'The step itself: "scaler.step(optimizer)".'),
  code('train.py', 314, 314, 'Then "optimizer.zero_grad(set_to_none=True)": each step\'s g is used once.'),
  code('train.py', 199, 199, 'The optimizer: "optimizer = model.configure_optimizers(weight_decay, learning_rate, (beta1, beta2), device_type)".'),
  code('model.py', 284, 284, 'NanoGPT steps with AdamW, not the plain step on the card: "optimizer = torch.optim.AdamW(optim_groups, lr=learning_rate, betas=betas, **extra_args)". Its update builds on −lr × g (c20).'),
  code('train.py', 257, 260, 'The lr is set every iteration: "# determine and set the learning rate for this iteration", "lr = get_lr(iter_num) if decay_lr else learning_rate", "param_group[\'lr\'] = lr" (c17).'),
  code('train.py', 65, 65, '"decay_lr = True # whether to decay the learning rate" - the default; the shakespeare_char config does not change it.'),
  code('train.py', 58, 58, 'NanoGPT\'s lr values are nowhere on the card: the default "learning_rate = 6e-4 # max learning rate".'),
  code('config/train_shakespeare_char.py', 27, 27, 'and shakespeare_char\'s "learning_rate = 1e-3 # with baby networks can afford to go a bit higher". The card\'s lr values belong to its toy bowl only.'),
  code('model.py', 184, 187, 'The loss NanoGPT differentiates is not a bowl: "if targets is not None:" … "loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-1)", the mean over the B·T rows (c26).'),
  code('config/train_shakespeare_char.py', 22, 24, `The footer's millions of weights: "n_layer = ${A.n_layer}" and "n_embd = ${A.n_embd}" give 12C² + 2C = ${groupDigits(PER_BLOCK)} weights per Block (c04's count), × ${A.n_layer} Blocks = ${groupDigits(PER_BLOCK * A.n_layer)}, before the embeddings.`),
  { kind: 'calculation', status: 'Calculated toy example', title: 'The bowl, the start and the learning-rate presets',
    note: `Typed into the card: L(w) = ½·c·(w − w*)² with c = ${C}, w* = ${W_STAR}, start w = ${W0} (loss ${(C / 2) * (W0 - W_STAR) ** 2}, g = ${G0}); presets lr ${LRS.join(', ')}; curve samples w = ${WS.join(', ')} (dense near w* so the minimum does not kink). The practice's bowl is twice as steep, c = ${C_STEEP} (g = ${G0_STEEP} at the start, loss ${L0_STEEP}), sampled at w = ${SWS.join(', ')}. A quadratic, so one step lands exactly where (1 − lr × c) × (w − w*) says; a real loss is not a bowl.` },
  calculation('Live calculation', 'The curve, the slope line, the step, the landing and the readouts',
    'Computed on the card: pick (the lr, the outcome caption), sub, scale and elementwise (g = c × (w − w*), L = ½·c·(w − w*)², w₁ = w − lr × g, lr × c, 1 − lr × c), concat and add (the slope line w ± 0.8, L ± 0.8 × g), and plot.js\'s scale/add mapping to pixels. Rounded to 3 decimals. The steeper bowl is computed the same way, and choose() keeps it at opacity 0 until a committed practice attempt.'),
];

export const evidence = {
  card: 'c19-gradient-step',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'One gradient step moves a weight by −lr × g, opposite the slope. On a bowl L = ½·c·(w − w*)², g = c × (w − w*), so one step multiplies w − w* by 1 − lr × c: lr × c below 1 stops short, 1 lands, 1 to 2 overshoots with a lower loss, 2 bounces to the same loss, above 2 climbs out. NanoGPT fills g for every weight with one backward pass (train.py:305) and steps with AdamW (model.py:284) at an lr set every iteration (train.py:257-260); its loss is a cross-entropy mean (model.py:184-187), not a bowl.',
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: `source: train.py:48, :58, :65, :199, :257-260, :301, :305, :306-309, :311, :314; model.py:184-187, :284; config/train_shakespeare_char.py:17, :22-24, :27 - checked against the pinned files. Calculated toy example: c = ${C}, w* = ${W_STAR}, w0 = ${W0}, lr presets ${LRS.join(', ')}, curve samples, and the practice's c = ${C_STEEP} bowl, typed into the card. Live calculation: pick, sub, scale, elementwise, concat, add, choose.`,
  control: '"Learning rate (preset)" index picker: lr 0.25 (default), 0.5, 0.75, 1, 1.1. A hidden steepRevealed latch, set only by a committed practice attempt, reveals the steeper bowl.',
  consequence: 'The step arrow grows 1.5 / 3 / 4.5 / 6 / 6.6 at loss 9; the drop line and landing dot land at w = 1.5 (loss 2.25, below), 3 (loss 0, on the axis), 4.5 (2.25, below), 6 (9, level) and 6.6 (12.96, above); the readouts give the step, the landing, lr × c = 0.5 / 1 / 1.5 / 2 / 2.2 and w − w* going -3 → -1.5 / 0 / 1.5 / 3 / 3.6; the outcome caption reads stops short / lands / overshoots with a lower loss / bounces / climbs out. The start, the slope line and the rule lines are true at every preset. After a committed attempt the c = 4 bowl, its start dot at loss 18, its lr 0.25 step to w* = 3 and its drop line to loss 0 appear with two captions.',
  interactionPurpose: 'See that the step is linear in lr but the landing is not: the product lr × c alone sorts one step into five outcomes.',
  task: 'Step through the presets and compare where each lands; then, in practice, pick the lr that lands a bowl twice as steep in one step before the card draws it.',
  capability: 'index picker; a plot composed by plot.js (axesObjects without tick marks, eight seriesMapping calls including single points); circles and lines with derived endpoints; an arrow with derived from and to; picked caption and caption role; a hidden bool revealInput with choose()d opacity and no timeline appear on the reveal objects; choice practice graded by choice_equals without fixedInputs.',
};
