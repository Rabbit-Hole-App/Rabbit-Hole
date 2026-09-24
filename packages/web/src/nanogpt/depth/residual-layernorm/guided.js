// Residual stream and LayerNorm, Guided depth - the mechanism of one pre-LN
// sub-block on one token vector, with numbers: x -> mean and std -> x-hat ->
// a sublayer reads gamma * x-hat -> its change is added back to x. The
// learner multiplies and shifts the token vector (x = a * x0 + b) and compares
// it, column by column, with the unchanged reference x0: the mean moves with
// both controls and the std with the multiplier, x-hat and therefore the
// sublayer's change stay identical for a positive multiplier (x -1, the
// contrast, flips both), and out = x + change keeps the shift and scale,
// because the stream itself is never normalized.
//
// Grounding: model.py LayerNorm.forward (F.layer_norm, eps 1e-5, weight gamma,
// no bias by default) and Block.forward's first add. Numbers: x0 is the same
// toy vector as the Overview and Deep dive cards (generate_fixtures.layernorm);
// mean, std and x-hat for every (a, b) come from gen_residual-layernorm.py (the
// evaluator has no square root); gamma is the base fixture's illustrative
// weight; the toy layer is a seeded 6 x 6 map. gamma * x-hat, the change, out,
// the two checks on x-hat, std / reference std and out minus the reference
// out are computed live by derive ops.
import fx from '../fixtures/residual-layernorm.generated.js';
import base from '../../fixtures/nanogpt-fixtures.generated.js';
import { code, calculation } from '../../sources.js';

const G = fx.guided;
const REF = G.table[G.scales.indexOf(1)][G.shifts.indexOf(0)];
const GAMMA = base.layernorm.gamma;
const CONCEPT = 'layernorm-residual';
const REPRODUCE = 'python packages/web/src/nanogpt/depth/fixtures/gen_residual-layernorm.py --check';

const CELL = 44;
const LX = 40, RX = 336, NOTE_X = 630;
const ROW = [164, 284, 404, 524]; // strip tops: x, x-hat, change, out
const n = REF.x.length;
const shiftText = b => (b < 0 ? `− ${-b}` : `+ ${b}`);
const aText = a => (a < 0 ? `−${-a}` : String(a));
// The relationship notes hold for a positive multiplier; × −1 flips x̂ and the change.
const REL = {
  positive: { xhat1: 'Same in both columns: shift and a', xhat2: 'positive multiplier cancel out.',
    change1: 'Same too: the layer only', change2: 'sees x̂, never x itself.', out: '= (a − 1)·x₀ + b: shift and scale kept' },
  negative: { xhat1: 'Signs flipped: shift and size', xhat2: 'cancel, a negative sign does not.',
    change1: 'Flipped too: the toy layer is', change2: 'linear and sees only x̂.', out: '= (a − 1)·x₀ + b − 2 × reference change' },
};

const obj = (id, type, initialState) => ({ id, type, semanticId: id, conceptId: CONCEPT, initialState });
const text = (id, value, x, y, extra = {}) => obj(id, 'text', { text: value, x, y, ...extra });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const strip = (id, x, y, values, extra = {}) => obj(id, 'strip', { cell: CELL, x, y, values: { $derive: values }, opacity: 0, ...extra });
const heat = group => ({ heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: group });

export const scene = {
  id: 'depth-residual-layernorm-guided',
  title: 'Residual stream and LayerNorm · Guided: normalize, change, add back',
  width: 960,
  height: 640,
  duration: 3.4,
  inputs: [
    { name: 'multiplier', type: 'index', label: 'Multiply every entry of x₀ by', of: 'multipliers', default: G.scales.indexOf(2), presentation: 'slider' },
    { name: 'shift', type: 'index', label: 'Then add to every entry', of: 'shifts', default: G.shifts.indexOf(2), presentation: 'picker' },
  ],
  exampleData: {
    multipliers: G.scales.map(a => `× ${aText(a)}`),
    shifts: G.shifts.map(shiftText),
    aTexts: G.scales.map(aText),
    rels: G.scales.map(a => (a > 0 ? REL.positive : REL.negative)),
    table: G.table,
    ref: REF,
    gamma: GAMMA,
    layer: G.layer,
  },
  derived: {
    row: { op: 'pick', args: ['table', 'multiplier'] },
    sel: { op: 'pick', args: ['row', 'shift'] },
    aText: { op: 'pick', args: ['aTexts', 'multiplier'] },
    rel: { op: 'pick', args: ['rels', 'multiplier'] },
    bText: { op: 'pick', args: ['shifts', 'shift'] },
    // Live: the sublayer reads gamma * x-hat, and its change is added back to x.
    yRef: { op: 'elementwise', args: ['gamma', 'ref.xhat'] },
    ySel: { op: 'elementwise', args: ['gamma', 'sel.xhat'] },
    changeRef: { op: 'weighted_sum', args: ['yRef', 'layer'] },
    changeSel: { op: 'weighted_sum', args: ['ySel', 'layer'] },
    outRef: { op: 'add', args: ['ref.x', 'changeRef'] },
    outSel: { op: 'add', args: ['sel.x', 'changeSel'] },
    // Live checks against the reference column: std scales by the multiplier,
    // and out moves by exactly x - x0 = (a - 1) * x0 + b, because the change is identical.
    stdRow: { op: 'concat', args: ['sel.std'] },
    stdRatio: { op: 'scale', args: ['stdRow', 1 / REF.std] },
    outRefNeg: { op: 'scale', args: ['outRef', -1] },
    outDiff: { op: 'add', args: ['outSel', 'outRefNeg'] },
    // Live checks on the selected x-hat: its entries sum to 0 and their squares average 1.
    xhatSum: { op: 'sum', args: ['sel.xhat'] },
    xhatSq: { op: 'dot', args: ['sel.xhat', 'sel.xhat'] },
    xhatSqRow: { op: 'concat', args: ['xhatSq'] },
    xhatMeanSq: { op: 'scale', args: ['xhatSqRow', 1 / n] },
  },
  objects: [
    text('question', 'How does LayerNorm rescale a token’s numbers before the block adds its change back?', 40, 34),
    note('prerequisites', 'Builds on: Overview (the stream adds each change); mean, variance and square root', 40, 58),
    text('status', 'Calculated toy example: x, mean, std, x̂ · Live calculation: change, out, checks', 40, 84, { typography: 'caption' }),
    text('col-ref', 'reference: x₀', LX, 122, { typography: 'caption' }),
    text('col-sel', 'yours: x = {{aText}} · x₀ {{bText}}', RX, 122, { typography: 'caption', role: 'input' }),

    // ① the token vector, and the two numbers LayerNorm measures on it
    strip('x-ref', LX, ROW[0], 'ref.x', { label: '① x: the token’s numbers going in', role: 'neutral' }),
    strip('x-sel', RX, ROW[0], 'sel.x', { role: 'input' }),
    note('stats-ref', `mean ${REF.mean} · std ${REF.std}`, LX, ROW[0] + CELL + 20, { opacity: 0 }),
    note('stats-sel', 'mean {{sel.mean}} · std {{sel.std}}', RX, ROW[0] + CELL + 20, { opacity: 0, role: 'input' }),
    text('rel-stats-1', 'Shift: mean only.', NOTE_X, ROW[0] + 18, { opacity: 0 }),
    text('rel-stats-1b', 'Multiplier: mean and std.', NOTE_X, ROW[0] + 40, { opacity: 0 }),
    note('rel-stats-2', 'live: std ÷ reference std = {{stdRatio.0}}', NOTE_X, ROW[0] + 62, { opacity: 0, role: 'output' }),

    // ② x-hat = (x - mean) / sqrt(var + eps)
    strip('xhat-ref', LX, ROW[1], 'ref.xhat', { label: '② x̂ = (x − mean) ÷ std', ...heat('xhat') }),
    strip('xhat-sel', RX, ROW[1], 'sel.xhat', { ...heat('xhat') }),
    note('check-sel', 'live: sum {{xhatSum}} · mean of squares {{xhatMeanSq.0}}', RX, ROW[1] + CELL + 20, { opacity: 0, role: 'output' }),
    text('rel-xhat-1', '{{rel.xhat1}}', NOTE_X, ROW[1] + 18, { opacity: 0 }),
    text('rel-xhat-2', '{{rel.xhat2}}', NOTE_X, ROW[1] + 40, { opacity: 0 }),

    // ③ the sublayer reads gamma * x-hat and writes a change
    strip('change-ref', LX, ROW[2], 'changeRef', { label: '③ change = toy layer reading γ · x̂', ...heat('change') }),
    strip('change-sel', RX, ROW[2], 'changeSel', { ...heat('change') }),
    text('rel-change-1', '{{rel.change1}}', NOTE_X, ROW[2] + 18, { opacity: 0 }),
    text('rel-change-2', '{{rel.change2}}', NOTE_X, ROW[2] + 40, { opacity: 0 }),

    // ④ the residual add: the stream keeps x
    strip('out-ref', LX, ROW[3], 'outRef', { label: '④ out = x + change (the residual add)', role: 'neutral' }),
    strip('out-sel', RX, ROW[3], 'outSel', { role: 'output' }),
    strip('out-diff', NOTE_X, ROW[3], 'outDiff', { label: 'live: out − reference out', role: 'output' }),
    note('rel-out', '{{rel.out}}', NOTE_X, ROW[3] + CELL + 20, { opacity: 0 }),

    note('toy-note', 'Toy stand-ins: γ (LayerNorm’s learned weight) is illustrative; the layer is seeded weights, not NanoGPT’s.', 40, 616),
  ],
  timeline: [
    { at: 0.0, action: 'appear', target: 'x-ref', duration: 0.3 },
    { at: 0.0, action: 'appear', target: 'x-sel', duration: 0.3 },
    { at: 0.3, action: 'appear', target: 'stats-ref', duration: 0.3 },
    { at: 0.3, action: 'appear', target: 'stats-sel', duration: 0.3 },
    { at: 0.5, action: 'appear', target: 'rel-stats-1', duration: 0.3 },
    { at: 0.5, action: 'appear', target: 'rel-stats-1b', duration: 0.3 },
    { at: 0.5, action: 'appear', target: 'rel-stats-2', duration: 0.3 },
    { at: 0.9, action: 'appear', target: 'xhat-ref', duration: 0.3 },
    { at: 0.9, action: 'appear', target: 'xhat-sel', duration: 0.3 },
    { at: 1.2, action: 'appear', target: 'check-sel', duration: 0.3 },
    { at: 1.3, action: 'appear', target: 'rel-xhat-1', duration: 0.3 },
    { at: 1.3, action: 'appear', target: 'rel-xhat-2', duration: 0.3 },
    { at: 1.7, action: 'appear', target: 'change-ref', duration: 0.3 },
    { at: 1.7, action: 'appear', target: 'change-sel', duration: 0.3 },
    { at: 2.0, action: 'appear', target: 'rel-change-1', duration: 0.3 },
    { at: 2.0, action: 'appear', target: 'rel-change-2', duration: 0.3 },
    { at: 2.4, action: 'appear', target: 'out-ref', duration: 0.3 },
    { at: 2.4, action: 'appear', target: 'out-sel', duration: 0.3 },
    { at: 2.7, action: 'appear', target: 'out-diff', duration: 0.3 },
    { at: 3.0, action: 'appear', target: 'rel-out', duration: 0.3 },
  ],
};

const fmt = values => `[${values.join(', ')}]`;

export const sources = [
  code('model.py', 18, 27, 'The LayerNorm module: “return F.layer_norm(input, self.weight.shape, self.weight, self.bias, 1e-5)” - mean and biased variance over the vector’s entries, divide by sqrt(var + 1e-5), then multiply by the weight γ.'),
  code('model.py', 23, 23, '“self.weight = nn.Parameter(torch.ones(ndim))” - γ starts as ones and is learned; the card uses illustrative values.'),
  code('train.py', 56, 56, '“bias = False # do we use bias inside LayerNorm and Linear layers?” - no β is added by default.'),
  code('model.py', 104, 104, 'Block.forward’s first add: “x = x + self.attn(self.ln_1(x))” - the sublayer reads the normalized vector, and its change is added to the un-normalized x.'),
  { kind: 'calculation', status: 'Calculated toy example', title: 'x = a · x₀ + b: mean, std and x̂; γ; the toy layer',
    note: `x₀ = ${fmt(REF.x)} is generate_fixtures.layernorm()’s toy vector (shared with the Overview and Deep dive cards). For every multiplier a in ${fmt(G.scales)} and shift b in ${fmt(G.shifts)}, gen_residual-layernorm.py computes x = a · x₀ + b, its mean, biased variance (÷ ${n}), std = sqrt(var + 1e-5) and x̂ = (x − mean) / std as F.layer_norm does, rounded to 4 decimals - here because the card cannot take a square root. γ = ${fmt(GAMMA)} is the base fixture’s illustrative weight. The toy layer is a seeded 6 × 6 map (normal, std ${G.layerStd}, seed ${fx.provenance.seed}, 2 decimals) standing in for attention or the MLP, redrawn until the card’s 2-decimal cells add up as printed (x + change = out, out − reference out) at every setting.`,
    reproduce: REPRODUCE },
  calculation('Live calculation', 'γ · x̂, the change, out, and the checks',
    `Computed on the card: γ · x̂ by elementwise, the change by weighted_sum (γ · x̂ times the toy layer), out = x + change by add, the sum of x̂ by sum and the mean of its squares by dot then scale (÷ 6); std ÷ reference std by scale (× 1 / ${REF.std}); out − reference out by scale (× −1) and add. Every result rounded to 3 decimals.`),
];

export const evidence = {
  card: 'depth-residual-layernorm-guided',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'LayerNorm subtracts a token vector’s mean and divides by sqrt(var + eps), so the normalized x̂ (mean 0, mean of squares 1) - and anything a sublayer computes from it - does not depend on a shift or positive rescale of the vector; the block then adds the sublayer’s change to the un-normalized x, so the stream keeps the shift and scale.',
  sourceRevision: `${fx.provenance.nanogpt.repo} @ ${fx.provenance.nanogpt.commit}`,
  provenance: 'calculated toy example: x = a·x0 + b, mean, biased var, std = sqrt(var + 1e-5), x-hat (4 decimals) from gen_residual-layernorm.py, x0 from generate_fixtures.layernorm(), illustrative gamma from the base fixture, seeded 6x6 toy layer; live calculation: gamma * x-hat (elementwise), change (weighted_sum), out (add), sum of x-hat (sum), mean of squares (dot, concat, scale by 1/6), std ÷ reference std (scale), out − reference out (scale by −1, add); source: model.py:18-27, :23, :104, train.py:56.',
  control: 'multiplier (index slider over × −1, × 0.5, × 1, × 1.5, × 2; default × 2) and shift (index picker over − 2, + 0, + 2; default + 2): x = a · x₀ + b, compared with the reference x₀.',
  consequence: 'The selected mean moves with the shift and the multiplier and the std with the multiplier only; for a positive multiplier x̂ and the change are identical to the reference column, and at × −1 every sign flips (live check at every setting: x̂ sums to 0, mean of squares 1); live readouts show std ÷ reference std = |a| and out − reference out = (a − 1) · x₀ + b entry by entry, minus 2 × the reference change at × −1.',
  interactionPurpose: 'Manipulate the input with two numeric controls and verify, on the card’s numbers, which stages of the sub-block are invariant and which carry the change - and break the invariance with a negative multiplier.',
  task: 'Explore only: move the multiplier and shift; check that std scales with the multiplier, that x̂ and the change match the reference for a positive multiplier and flip at × −1, and that x + change = out entry by entry.',
  capability: 'index slider + index picker; pick into a 5 x 3 record table and a per-multiplier record of relationship notes; elementwise, weighted_sum (vector times matrix), add, sum, dot, concat and scale derive ops (std ratio, out minus reference out); signed heat strips on shared groups whose values do not move between settings; {{}} readouts from picked records.',
  depth: 'Guided',
  prerequisites: 'Builds on: Overview (the stream adds each change); mean, variance and square root.',
  ladderRole: 'Opens the block up: real numbers for each stage, two controls on the input, and relationships the learner can check (x̂ invariant, sums to 0, squares average 1; out = x + change) - no shapes, source branches or edge cases.',
};

export const reviewStates = [
  { multiplier: G.scales.indexOf(2), shift: G.shifts.indexOf(2) },
  { multiplier: G.scales.indexOf(-1), shift: G.shifts.indexOf(2) },
  { multiplier: G.scales.indexOf(-1), shift: G.shifts.indexOf(0) },
  { multiplier: G.scales.indexOf(1), shift: G.shifts.indexOf(0) },
  { multiplier: G.scales.indexOf(0.5), shift: G.shifts.indexOf(-2) },
  { multiplier: G.scales.indexOf(1.5), shift: G.shifts.indexOf(0) },
];
