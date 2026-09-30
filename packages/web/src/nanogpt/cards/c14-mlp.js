// Card 14 - inside the MLP for one position: c_fc widens C = 4 numbers to
// 4C = 16, GELU bends each on its own, c_proj sums them back to 4. Sequence
// "The MLP", 2 of 2 (c05 shows the MLP works on each position alone; this
// card opens that step). One staged pipeline in source order (model.py:88-90).
//
// A calculated toy example: the weights are hand-picked (fx.mlp), the three
// inputs are raw vectors normalized as ln_2 does. h = input · W_fcᵀ and
// m = GELU(h) · W_projᵀ are live matmuls; GELU is precomputed by the fixture
// generator, since the evaluator has no erf. The one control picks the
// position's input (the Before characters c05 uses); the weights never change.
// The practice asks about position 0's input with every sign flipped, which no
// preset draws; its What-if rows are gated behind the hidden `revealed` latch.
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { buildPool, canonical } from '../../scene-derive.js';
import { code, calculation, tinyShakespeare } from '../sources.js';
import { WORD_TOKENS } from './c07-embedding-lookup.js';

const A = fx.architecture;
const M = fx.mlp;
const CHARS = WORD_TOKENS.chars.slice(0, M.presets.length); // B e f
M.presets.forEach((p, i) => { if (p.char !== CHARS[i]) throw new Error(`fx.mlp preset ${i} is "${p.char}", not "${CHARS[i]}"`); });
const HID = M.Wfc.length; // 16 = 4C
const POSITIVE = M.presets.map(p => p.positive);
const [P0, N0] = [POSITIVE[0], HID - POSITIVE[0]]; // B: 10 stay positive, 6 squeezed

const CELL = 46;
const X = 180;                        // every strip's left edge
const IN_Y = 128, H_Y = 254, G_Y = 360, M_Y = 486, NEG_Y = 558;
const IN_R = X + 4 * CELL, H_R = X + HID * CELL; // 364, 916
const WHATIF_M_X = 680;               // clear of the c_proj funnel line
const CONCEPT = 'mlp';

const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const rowName = (id, value, y, extra = {}) => text(id, value, 40, y, { typography: 'caption', ...extra });
const line = (id, from, to) => ({ id, type: 'line', semanticId: id, conceptId: CONCEPT,
  initialState: { from, to, role: 'neutral', opacity: 0 } });
// One signed colour scale for every row, so a squeezed cell is pale against its h cell.
const strip = (id, y, values, extra = {}) => ({ id, type: 'strip', semanticId: id, conceptId: CONCEPT,
  initialState: { x: X, y, cell: CELL, role: 'neutral', heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'c14-mlp',
    values: { $derive: values }, ...extra } });
const WHATIF = { opacity: { $derive: 'whatIfOp' } };

export const scene = {
  id: 'nanogpt-c14-mlp',
  title: 'Inside the MLP: c_fc → GELU → c_proj',
  width: 960,
  height: 851,                         // the padded content, 850.32: a 960-wide frame draws it at scale 1
  duration: 3.8,
  inputs: [
    { name: 'position', type: 'index', label: 'Position’s input (preset)', of: 'positions', default: 0, presentation: 'picker' },
    { name: 'revealed', type: 'bool', label: 'Flipped input revealed', hidden: true, default: false },
  ],
  exampleData: {
    positions: CHARS.map((c, i) => `${i} · ${c}`),
    xRows: M.presets.map(p => [p.input]),    // each a 1-row matrix: matmul is A·Bᵀ
    Wfc: M.Wfc, Wproj: M.Wproj,               // (out, in), as nn.Linear stores them
    gRows: M.presets.map(p => [p.gelu]),
    gNegRow: [M.flipped.gelu],
    C: A.n_embd, Cv: [A.n_embd],
    xLabels: CHARS.map((c, i) => `ln_2(x + a) at position ${i} · ${c} (toy numbers)`),
    captions: CHARS.map((c, i) => `Position ${i} · ${c}: ${POSITIVE[i]} of the ${HID} hidden numbers stay positive; the other ${HID - POSITIVE[i]} end between −0.17 and 0.`),
    captionNeg: `What-if, input flipped: the ${N0} squeezed for “${CHARS[0]}” stay positive, its ${P0} are squeezed.`,
    revealAtPos: CHARS.map((c, i) => i === M.flipped.of),
    no: false,
  },
  derived: {
    revealAt: { op: 'pick', args: ['revealAtPos', 'position'] },
    whatIf: { op: 'choose', args: ['revealed', 'revealAt', 'no'] },
    whatIfOp: { op: 'choose', args: ['whatIf', 1, 0] },
    xPicked: { op: 'pick', args: ['xRows', 'position'] },
    h: { op: 'matmul', args: ['xPicked', 'Wfc'] },
    // The flipped case: no bias, so its h is exactly −h (the test checks it).
    xNeg: { op: 'scale', args: ['xRows.0', -1] },
    hNeg: { op: 'matmul', args: ['xNeg', 'Wfc'] },
    g: { op: 'pick', args: ['gRows', 'position'] },
    m: { op: 'matmul', args: ['g', 'Wproj'] },
    mNeg: { op: 'matmul', args: ['gNegRow', 'Wproj'] },
    // Out of every display until a committed attempt (blank, not zero).
    gNegShown: { op: 'gate', args: ['gNegRow', 'whatIf'] },
    mNegShown: { op: 'gate', args: ['mNeg', 'whatIf'] },
    C4: { op: 'scale', args: ['Cv', 4] },
    xLabel: { op: 'pick', args: ['xLabels', 'position'] },
    captionAt: { op: 'pick', args: ['captions', 'position'] },
    caption: { op: 'choose', args: ['whatIf', 'captionNeg', 'captionAt'] },
  },
  objects: [
    text('question', 'What happens to one position’s vector inside the MLP?', 40, 30, { typography: 'heading' }),
    note('status', 'Characters, sizes: Source value · input, weights, GELU values: Calculated toy example · h, m: Live calculation', 40, 56),
    note('builds-on', 'Builds on: the MLP works on each position alone; ln_2 hands it a normalized vector', 40, 78),

    rowName('name-input', 'input · C = 4', IN_Y + 28, { opacity: 0 }),
    strip('input', IN_Y, 'xPicked', { label: '{{xLabel}}', role: 'input', opacity: 0 }),
    line('fc-left', { x: X, y: IN_Y + CELL }, { x: X, y: H_Y }),
    line('fc-right', { x: IN_R, y: IN_Y + CELL }, { x: H_R, y: H_Y }),
    note('fc-label', 'c_fc: 4 → 16', 380, 222, { opacity: 0 }),
    rowName('name-h', 'h · 4C = 16', H_Y + 28, { opacity: 0 }),
    strip('h', H_Y, 'h', { opacity: 0 }),
    rowName('name-gelu', 'GELU ↓', 336, { opacity: 0 }),
    text('gelu-line', 'GELU(h) = h · Φ(h), on each number alone (Φ: the standard normal CDF)', 250, 336, { opacity: 0 }),
    rowName('name-g', `GELU(h) · ${HID}`, G_Y + 28, { opacity: 0 }),
    strip('g', G_Y, 'g', { opacity: 0 }),
    line('proj-left', { x: X, y: G_Y + CELL }, { x: X, y: M_Y }),
    line('proj-right', { x: H_R, y: G_Y + CELL }, { x: IN_R, y: M_Y }),
    note('proj-label', 'c_proj: 16 → 4', 380, 450, { opacity: 0 }),
    rowName('name-m', 'm · C = 4', M_Y + 28, { opacity: 0 }),
    strip('m', M_Y, 'm', { role: 'output', opacity: 0 }),

    // The practice's case, additive and tied to position 0; no timeline appear.
    strip('whatif-m', M_Y, 'mNegShown', { x: WHATIF_M_X, label: 'What-if m, input flipped', ...WHATIF }),
    rowName('name-whatif-g', 'What-if GELU(h)', NEG_Y + 28, WHATIF),
    strip('whatif-g', NEG_Y, 'gNegShown', WHATIF), // no label: it would sit on m's bottom edge; the row name and caption name it

    text('caption', '{{caption}}', 40, 634, { role: 'output', opacity: 0 }),
    text('fc-rule', 'c_fc: each hidden number is a learned weighted sum of the input’s 4 numbers, with no bias.', 40, 664, { opacity: 0 }),
    text('gelu-rule', 'GELU keeps each sign: h > 0 keeps over half of itself; h < 0 ends between −0.17 and 0.', 40, 688, { opacity: 0 }),
    text('proj-rule', `c_proj: each of m’s 4 numbers is a learned weighted sum of all ${HID} GELU outputs.`, 40, 712, { opacity: 0 }),
    text('same-weights', 'The same weights run at every position: another position changes the input, never the weights.', 40, 744),
    note('legend', 'cells: orange = +, blue = −, one colour scale for every row', 40, 766),
    note('size-note', 'Source value: shakespeare_char has C = {{C}}: c_fc makes 4C = {{C4.0}} numbers per position; this toy has C = 4.', 40, 788),
    note('dropout-note', `Source value: in training, dropout (p = ${A.dropout}) follows c_proj; then the Block adds m to the stream: x + a + m.`, 40, 810),
  ],
  // Replay in source order: input, c_fc, h, GELU, GELU(h), c_proj, m; each rule
  // and the caption appear with the stage they describe.
  timeline: [
    ...[[0, ['input', 'name-input']], [0.5, ['fc-left', 'fc-right', 'fc-label', 'fc-rule']], [1, ['h', 'name-h']],
      [1.5, ['gelu-line', 'name-gelu']], [2, ['g', 'name-g', 'gelu-rule', 'caption']], [2.5, ['proj-left', 'proj-right', 'proj-label', 'proj-rule']], [3, ['m', 'name-m']]]
      .flatMap(([at, targets]) => targets.map(target => ({ at, action: 'appear', target, duration: 0.4 }))),
    { at: 3.4, action: 'highlight', target: 'm', duration: 0.3 },
  ],
};

// Every preset, then the practice's reveal at position 0.
export const reviewStates = [{ position: 0 }, { position: 1 }, { position: 2 }, { position: 0, revealed: true }];

// Practice (commit before you see): position 0's input with every sign
// flipped, which no preset draws. Option numbers come from the card's own
// derive graph (the cell pool, unrounded).
const pool = buildPool({ exampleData: { ...scene.exampleData, position: 0, revealed: false }, derived: scene.derived }, canonical);
const minus = s => s.replace(/-/g, '−');
const tuple = v => minus(`(${v.map(x => x.toFixed(2)).join(', ')})`);
const [mB, mFlip] = [pool.m[0], pool.mNeg[0]];
const B = `“${CHARS[0]}”`;
const OPTIONS = {
  'same-minus': `The same ${P0} stay positive, and the output is −m`,
  'other-minus': `The other ${N0} stay positive, and the output is −m`,
  'other-same': `The other ${N0} stay positive, and the output is still m`,
  'other-neither': `The other ${N0} stay positive, and the output is neither −m nor m`,
};
export const activity = {
  id: 'c14-practice',
  check: 'choice_equals',
  version: 1,
  fixedInputs: { position: M.flipped.of },
  revealInput: 'revealed',
  prompt: `Suppose every sign of position 0’s input were flipped (not drawn; as NanoGPT trains shakespeare_char, c_fc has no bias). Which hidden numbers would stay positive after GELU, and what would the MLP output be?`,
  // ponytail: SceneActivity shows no pick for an untouched answer, so this
  // naive default never renders; it only satisfies the choice declaration.
  answer: { type: 'choice', label: 'After the flip: which stay positive, and the output', default: 'same-minus',
    options: Object.entries(OPTIONS).map(([id, label]) => ({ id, label })) },
  expected: 'other-neither',
  checkLabel: 'Check',
  feedbackPass: `Right. c_fc has no bias, so the flipped input gives −h: every hidden number changes sign. GELU keeps signs, so the ${N0} squeezed for ${B} now stay positive and its ${P0} are squeezed. GELU does not treat +h and −h alike, so nothing makes c_proj’s sum −m or m: here ${tuple(mFlip)} against m = ${tuple(mB)}. The What-if rows now show it.`,
  feedbackFail: `Not quite. c_fc has no bias, so the flipped input gives −h: every hidden number changes sign, which “the same ${P0}” ignores; the ${N0} squeezed for ${B} now stay positive. “−m” treats GELU as odd, but a negative number ends between −0.17 and 0 while a positive one keeps over half of itself, so GELU(−h) is not −GELU(h). “Still m” ignores that the positive set changed, so c_proj sums different numbers. Here the output is ${tuple(mFlip)}; m = ${tuple(mB)} and −m = ${tuple(mB.map(v => -v))}. The What-if rows now show it.`,
};

// Phase 1 plan (docs/nanogpt-deep-dive-batch4-plans.md, c14).
export const plan = {
  concept: 'The MLP\'s inside for one position: c_fc widens ln_2(x + a)\'s C numbers to 4C (no bias in shakespeare_char), GELU maps each on its own to h·Φ(h), c_proj sums them back to C numbers m; in training dropout follows, and the Block adds m to the stream, x + a + m. GELU is not linear, so neither is the MLP.',
  objective: 'After this card, the learner should understand that inside the MLP c_fc widens one position’s C numbers to 4C, GELU bends each of them on its own (a positive one keeps more than half of itself, a negative one ends between −0.17 and 0), then c_proj sums them back into C numbers, so the MLP is not a linear map.',
  prerequisites: [
    'c05-position-mixing: the MLP (step ⑤) works on each position alone, and the same c_fc → GELU → c_proj runs at every position; this card opens that step for one position',
    'c02-block-anatomy: step ⑤ reads ln_2(x + a) and writes m; step ⑥ adds m to the stream, x + a + m',
    'c15-layernorm: ln_2 hands the MLP a normalized vector; the toy input is one such vector',
    'a weighted sum of numbers: each output is Σ w·input, with learned weights',
  ],
  causalSteps: [
    'input: ln_2(x + a) at one position, C = 4 toy numbers',
    'c_fc: h = input·W_fcᵀ, 4 numbers widen to 16 (4C); each h_j is a learned weighted sum of the input\'s 4 numbers, with no bias',
    'GELU: GELU(h)_j = h_j·Φ(h_j), each of the 16 on its own; every sign is kept - h > 0 keeps between half and all of itself, h < 0 ends between −0.17 and 0',
    'c_proj: m = GELU(h)·W_projᵀ, 16 numbers back to 4; each m_i is a learned weighted sum of all 16 GELU outputs',
    'footnote only: dropout in training, then the Block adds m to the stream, x + a + m',
  ],
  primaryInteraction: 'one control in INTERACT, "Position’s input (preset)" (index picker 0 · B, 1 · e, 2 · f, default 0): the input switches preset, h and m recompute live, GELU(h) switches to that preset\'s precomputed values and the caption follows (10, 4, 11 of 16 stay positive); the weights never change, which carries c05\'s rule',
  check: 'practice (commit before you see, choice_equals, fixedInputs position 0): suppose every sign of position 0\'s input were flipped - which hidden numbers stay positive after GELU, and what is the output? The flipped input is no preset and no drawn row has its positive set; answer: the other 6 stay positive and the output is neither −m nor m. After a committed attempt the What-if GELU(h) row and What-if m strip appear, tied to position 0',
  boundary: {
    decision: 'staged',
    reason: 'one mental model: widen, bend each number, project back. The three steps are causally dependent (GELU reads c_fc\'s output, c_proj reads GELU\'s), so under staging before splitting they stay one card, revealed progressively. One visual region (the funnel with its What-if pair), one control, one practice; no "and" in the title; height 851. Not merged into c05: c05 is the wiring between positions, this card the computation inside one position',
    reviewed: {},
    sequence: { name: 'The MLP', position: 2, of: 2, relationships: [
      { type: 'prerequisite', card: 'c05-position-mixing', direction: 'in' },
      { type: 'deepens', card: 'c02-block-anatomy', direction: 'in' },
      { type: 'prerequisite', card: 'c15-layernorm', direction: 'in' },
    ] },
  },
};

const fmt = rows => rows.map(row => `(${row.join(', ')})`).join(', ');
const DOCS = 'https://docs.pytorch.org/docs/stable/generated/';

export const sources = [
  code('model.py', 82, 85, 'The MLP\'s parts: "self.c_fc    = nn.Linear(config.n_embd, 4 * config.n_embd, bias=config.bias)" widens C to 4C, "self.gelu    = nn.GELU()", "self.c_proj  = nn.Linear(4 * config.n_embd, config.n_embd, bias=config.bias)" sums back to C, and "self.dropout = nn.Dropout(config.dropout)".'),
  code('model.py', 88, 92, 'Its forward, in the card\'s order: "x = self.c_fc(x)", "x = self.gelu(x)", "x = self.c_proj(x)", "x = self.dropout(x)", "return x".'),
  code('model.py', 100, 101, 'Each Block has its own: "self.ln_2 = LayerNorm(config.n_embd, bias=config.bias)" and "self.mlp = MLP(config)".'),
  code('model.py', 104, 105, 'What the MLP reads and where m goes: "x = x + self.attn(self.ln_1(x))" then "x = x + self.mlp(self.ln_2(x))" - in c02\'s notation it reads ln_2(x + a) and the stream becomes x + a + m.'),
  code('model.py', 23, 27, 'How the toy inputs are normalized: "self.weight = nn.Parameter(torch.ones(ndim))", "self.bias = nn.Parameter(torch.zeros(ndim)) if bias else None" and "return F.layer_norm(input, self.weight.shape, self.weight, self.bias, 1e-5)".'),
  code('train.py', 56, 56, 'shakespeare_char trains without bias: "bias = False # do we use bias inside LayerNorm and Linear layers?" (the shakespeare_char config does not change it).'),
  code('train.py', 147, 148, 'It reaches the model: "model_args = dict(n_layer=n_layer, n_head=n_head, n_embd=n_embd, block_size=block_size," "bias=bias, vocab_size=None, dropout=dropout)".'),
  code('model.py', 116, 116, 'GPTConfig\'s own default is different: "bias: bool = True # True: bias in Linears and LayerNorms, like GPT-2. False: a bit better and faster".'),
  code('model.py', 225, 225, 'And GPT-2 checkpoints keep a bias: "config_args[\'bias\'] = True # always True for GPT model checkpoints".'),
  code('config/train_shakespeare_char.py', 22, 25, `The real sizes: "n_layer = 6", "n_head = 6", "n_embd = ${A.n_embd}" and "dropout = ${A.dropout}" - so c_fc makes 4 × ${A.n_embd} = ${4 * A.n_embd} numbers per position.`),
  code('model.py', 164, 164, 'Real weights start small and are learned: "torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)" - the toy weights are hand-picked instead.'),
  code('train.py', 218, 227, 'Dropout acts only in training: estimate_loss switches to "model.eval()" to measure and back with "model.train()".'),
  code('sample.py', 51, 51, 'Generation runs in eval mode, dropout off: "model.eval()".'),
  { kind: 'doc', title: 'torch.nn.GELU (PyTorch documentation)', url: `${DOCS}torch.nn.GELU.html`,
    note: '“Applies the Gaussian Error Linear Units function.” GELU(x) = x ∗ Φ(x), “where Φ(x) is the Cumulative Distribution Function for Gaussian Distribution.” approximate: “the gelu approximation algorithm to use: \'none\' | \'tanh\'. Default: \'none\'” - NanoGPT\'s nn.GELU() is the exact form this card uses. Element-wise: output “same shape as the input”.' },
  { kind: 'doc', title: 'torch.nn.Linear (PyTorch documentation)', url: `${DOCS}torch.nn.Linear.html`,
    note: '“Applies an affine linear transformation to the incoming data: y = xAᵀ + b.” bias: “If set to False, the layer will not learn an additive bias.” weight: “the learnable weights of the module of shape (out_features, in_features)” - so c_fc\'s weight is (4C, C), stored here as W_fc (16 × 4).' },
  { kind: 'paper', title: 'Gaussian Error Linear Units (GELUs) (Hendrycks & Gimpel, 2016)', arxiv: '1606.08415',
    note: 'The paper that defines GELU(x) = x·Φ(x): the input weighted by the probability that a standard normal falls below it.' },
  calculation('Calculated toy example', 'The inputs, W_fc, W_proj and the GELU values',
    `Hand-picked by generate_fixtures.py (fx.mlp), not trained: C = 4, no bias. Raw inputs ${fmt(M.presets.map(p => p.raw))} for ${CHARS.join(', ')}, normalized as F.layer_norm does (weight ones, no β, eps ${M.eps}) and rounded to 2 decimals: ${fmt(M.presets.map(p => p.input))}. W_fc (16 × 4, stored (out, in)) = ${fmt(M.Wfc)}. W_proj (4 × 16; every row sums to 0) = ${fmt(M.Wproj)}. GELU(h) = 0.5·h·(1 + erf(h/√2)) of h = W_fc·input, rounded to 4 decimals, for each preset and for position 0's input with every sign flipped. The characters only label the presets: the numbers do not come from them.`),
  calculation('Live calculation', 'h and m',
    'Computed on the card by derive ops: pick (the chosen input and its GELU values), matmul (h = input · W_fcᵀ; m = GELU(h) · W_projᵀ), scale by −1 and matmul for the flipped case\'s h, which the test checks is exactly −h; gate and choose hide the What-if rows until a committed practice attempt at position 0. Each cell is rounded to 2 decimals on its own.'),
  calculation('Source value', 'The characters, n_embd and dropout',
    `B, e, f are the first three characters of c07's word “${WORD_TOKENS.word}”, from the tokenizer card's sentence in the sha-pinned Tiny Shakespeare file. n_embd ${A.n_embd}, dropout ${A.dropout} and bias ${A.bias} come from the resolved shakespeare_char config (fx.architecture); 4C = ${4 * A.n_embd} is computed from n_embd.`),
  tinyShakespeare(`“${WORD_TOKENS.word}” is the first word of the tokenizer card's sentence, taken from this file.`),
];

export const evidence = {
  card: 'c14-mlp',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: plan.concept,
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: 'source: model.py:82-85 and :88-92 (MLP), :100-101 and :104-105 (ln_2, the Block\'s adds), :23-27 (LayerNorm), :116 (GPTConfig bias True), :225 (checkpoints bias True), :164 (init std 0.02); train.py:56 (bias False), :147-148 (model_args), :218-227 (eval/train); config/train_shakespeare_char.py:22-25; sample.py:51 - checked against the pinned files. PyTorch docs for GELU and Linear quoted from docs.pytorch.org (2.14). Calculated toy example: fx.mlp (inputs, W_fc, W_proj, GELU values; generate_fixtures.py mlp()). Live calculation: pick, matmul, scale, gate, choose. Source value: B, e, f (c07 WORD_TOKENS), n_embd/dropout/bias (fx.architecture).',
  control: 'position - index picker "Position’s input (preset)" over 0 · B, 1 · e, 2 · f (default 0); revealed - hidden bool owned by the practice (set by a committed attempt).',
  consequence: 'The input strip switches preset; h recomputes live; GELU(h) switches to that preset\'s values; m recomputes (B (-1.97, 1.77, 1.44, -1.98), e (0.78, -1.41, -0.56, -0.23), f (-2.17, 1.81, -0.38, 1.18)); the caption reads 10, 4 or 11 of 16 stay positive; the weights never change. After a committed practice attempt at position 0 a What-if GELU(h) row and a What-if m strip (-0.23, 1.23, -1.78, 1.37) appear and the caption says the 6 squeezed for B stay positive.',
  interactionPurpose: 'See that how much of each hidden number survives GELU depends on that number, which comes from this position\'s input, while the weights are the same at every position.',
  task: 'Pick each preset and compare h with GELU(h): positive cells keep over half, negative ones end pale, between −0.17 and 0. Practice: with the picker locked at B, which hidden numbers stay positive, and what is m, if every sign of the input flips? (choice; expected: the other 6, and neither −m nor m).',
  capability: 'index picker; live pick/matmul pipeline over a 1-row matrix; precomputed GELU picked per preset; signed heat strips in one shared valueScaleGroup; line objects for the funnels; timeline appear on static objects only; a hidden-bool revealInput with gate()d values and choose()d opacity tied to position 0 by a picked boolean; choice practice graded by choice_equals with fixedInputs.',
};
