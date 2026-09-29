// c12 - scaling scores by 1/√hs. Sequence "Self-attention", 2 of 3 (c11's
// mask is its prerequisite; c10 mixes the weights it makes). NanoGPT's manual
// path (model.py:67-69): att = (q @ kᵀ) × 1/√hs, then masked_fill(-inf), then
// softmax. One reader's row, fixed at position 5 (the second "e" of "Before
// we"), staged in that source order: ① raw q·k against all nine keys, ② the
// whole row × m, then the mask, ③ softmax → weights (cells and bars).
//
// One control, a multiplier preset: × 1/4 and × 1 are what-ifs, × 1/2 is the
// rule at this toy's hs = 4, bound as 1/Math.sqrt(att.hs), never typed. q and
// k are the depth ladder's hand-set head 0 (gen_attention.py), a calculated
// toy example; every score and weight is a live derive op. The practice asks
// about × 0, which no preset draws: its row is gate()d behind the hidden
// zeroRevealed latch and appears only after a committed attempt.
//
// Layout: ① top left → × m → ② top right; ③ and the bars under ②. The left
// column under ① explains the state beside the weights; the × 0 row and its
// line sit under that, enclosed by the always-drawn lines around them, so the
// reveal never refits the frame.
import att from '../depth/fixtures/attention.generated.js';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { code, calculation, tinyShakespeare } from '../sources.js';

const A = fx.architecture;
const HEAD = att.heads[0];
const HS = att.hs;
const READER = 5;
// The fixture's '␣' is a near-invisible speck in the mono cells: shown as •.
const KEYS = att.context.tokens.map(t => (t === '␣' ? '•' : t));
const LATER = `“${KEYS.slice(READER + 1).join(' ')}”`; // quoted: a leading • must not read as a list bullet
const SEEN = READER + 1;
const RULE = 1;
// The reader's raw scores from the fixture, for the note and the rule caption's gap.
const RAW_ROW = HEAD.k.map(k => k.reduce((s, x, d) => s + x * HEAD.q[READER][d], 0));
const round3 = v => Math.round(v * 1000) / 1000;
const [TOP, NEXT] = RAW_ROW.slice(0, SEEN).sort((a, b) => b - a);
const GAP = round3(TOP - NEXT); // 'r' over the next visible score, 6
const RULE_GAP = round3(GAP / Math.sqrt(HS));
const REAL_HS = A.n_embd / A.n_head;
const GEN_ATTENTION = 'uv run --with tiktoken==0.14.0 python packages/web/src/nanogpt/depth/fixtures/gen_attention.py --check';

const COL = 40;
const CELL = 44; // "-2.00" needs 44
const ROW_W = KEYS.length * CELL;
const RIGHT = 520; // ② ③ and the bars
const Y1 = 172, Y3 = 284, BARS_Y = 374, BARS_H = 110, ZERO_Y = 532;
const CONCEPT = 'score-scaling';

const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const row = (id, label, x, y, values, extra = {}) => ({ id, type: 'grid', semanticId: id, conceptId: CONCEPT,
  initialState: { label, x, y, rows: 1, cols: KEYS.length, cell: CELL, matrixKind: 'derived', columnLabels: [...KEYS],
    values: { $derive: values }, ...extra } });

export const scene = {
  id: 'nanogpt-c12-score-scaling',
  title: 'Scaling scores by 1/√hs',
  width: 960,
  height: 702,
  duration: 2,
  inputs: [
    { name: 'multiplier', type: 'index', label: 'Multiplier on the scores (preset)', of: 'multiplierLabels', default: RULE, presentation: 'picker' },
    { name: 'zeroRevealed', type: 'bool', label: '× 0 row revealed', hidden: true, default: false },
  ],
  exampleData: {
    multiplierLabels: ['× 1/4', '× 1/2 = 1/√hs', '× 1 (no factor)'],
    // The rule preset is the rule itself, computed from the toy's head size.
    multipliers: [0.25, 1 / Math.sqrt(HS), 1],
    rule: 1 / Math.sqrt(HS),
    mShorts: ['1/4', '1/2', '1'],
    Q: HEAD.q, K: HEAD.k,
    causal: true,
    tags: ['What-if: × 1/4, not the rule', `The rule: × 1/√hs at this toy’s hs = ${HS}`, 'What-if: × 1, no factor'],
    tagRoles: ['warning', 'output', 'warning'],
    caps1: ['every gap between scores is half the rule’s,', `× 1/√${HS} = × 1/2 halves every gap: ‘r’ leads by ${RULE_GAP}, not ${GAP},`, 'every gap between scores is double the rule’s,'],
    caps2: ['so the weights are flatter', 'so the weights are flatter than with no factor', 'so the weights are sharper'],
  },
  derived: {
    // ① one reader's raw scores, every key (model.py:67's q @ kᵀ).
    raw: { op: 'matmul', args: ['Q', 'K'] },
    rawRow: { op: 'pick', args: ['raw', READER] },
    // ② × m first, then the mask (model.py:67-68), ③ softmax (:69).
    m: { op: 'pick', args: ['multipliers', 'multiplier'] },
    mShort: { op: 'pick', args: ['mShorts', 'multiplier'] },
    scaled: { op: 'scale', args: ['raw', 'm'] },
    masked: { op: 'causal_mask', args: ['scaled', 'causal'] },
    maskedRow: { op: 'pick', args: ['masked', READER] },
    weights: { op: 'softmax', args: ['masked'] },
    w: { op: 'pick', args: ['weights', READER] },
    // The rule's weights, for the readout at every preset.
    ruleScaled: { op: 'scale', args: ['raw', 'rule'] },
    ruleMasked: { op: 'causal_mask', args: ['ruleScaled', 'causal'] },
    ruleWeights: { op: 'softmax', args: ['ruleMasked'] },
    wRuleRow: { op: 'pick', args: ['ruleWeights', READER] },
    // Where 'r' sits: the largest visible raw score. scale rejects nulls, so
    // negate before masking; argmin of the negation is the argmax.
    negRaw: { op: 'scale', args: ['raw', -1] },
    negMasked: { op: 'causal_mask', args: ['negRaw', 'causal'] },
    negRow: { op: 'pick', args: ['negMasked', READER] },
    rAt: { op: 'argmin', args: ['negRow'] },
    wR: { op: 'pick', args: ['w', 'rAt'] },
    wRule: { op: 'pick', args: ['wRuleRow', 'rAt'] },
    // The practice's case, × 0: out of every display until a committed attempt.
    zeroScaled: { op: 'scale', args: ['raw', 0] },
    zeroMasked: { op: 'causal_mask', args: ['zeroScaled', 'causal'] },
    zeroWeights: { op: 'softmax', args: ['zeroMasked'] },
    w0Row: { op: 'pick', args: ['zeroWeights', READER] },
    w0: { op: 'gate', args: ['w0Row', 'zeroRevealed'] },
    zeroOpacity: { op: 'choose', args: ['zeroRevealed', 1, 0] },
    waitOpacity: { op: 'choose', args: ['zeroRevealed', 0, 1] },
    tag: { op: 'pick', args: ['tags', 'multiplier'] },
    tagRole: { op: 'pick', args: ['tagRoles', 'multiplier'] },
    cap1: { op: 'pick', args: ['caps1', 'multiplier'] },
    cap2: { op: 'pick', args: ['caps2', 'multiplier'] },
  },
  objects: [
    text('question', 'What does multiplying every score by one number do to the weights?', COL, 30, { typography: 'heading' }),
    note('status', `Characters: Source value · q, k: Calculated toy example (hs = ${HS}) · Live calculation · What-if: × 1/4, × 1, × 0`, COL, 56),
    note('reader', `One reader (query): position ${READER}, the second “e” of “Before we” (• = space). It sees ${READER + 1} characters; ${LATER} come later.`, COL, 80),
    // The bridge from where the scores come from (q·k, as in multi-head
    // attention on this board) to the three steps this card is about.
    text('bridge', 'Starting from the q·k similarity scores (this query against every key): × 1/√hs → mask → softmax.', COL, 104),

    // ① → × m → ②, then ③ and the bars under ②. Scores carry no heat: their
    // only honest scale would be per row, and they feed the weights.
    row('raw', '① raw scores q·k: this reader against all 9 keys', COL, Y1, 'rawRow', { role: 'neutral', opacity: 0 }),
    { id: 'times-m', type: 'arrow', semanticId: 'times-m', conceptId: CONCEPT,
      initialState: { label: '× {{mShort}}', from: { x: COL + ROW_W + 10, y: Y1 + CELL / 2 }, to: { x: RIGHT - 8, y: Y1 + CELL / 2 }, role: 'neutral', opacity: 0 } },
    row('masked', `② × multiplier, then mask: ${LATER} → −∞, blank`, RIGHT, Y1, 'maskedRow', { role: 'neutral', opacity: 0 }),
    row('weights', '③ softmax → weights (fixed 0-1 shading)', RIGHT, Y3, 'w', { role: 'output', heat: true, valueScale: 'fixed', opacity: 0 }),
    { id: 'bars', type: 'bars', semanticId: 'weight-bars', conceptId: CONCEPT,
      initialState: { label: 'the same weights as bars: fixed axis, top line = 1', x: RIGHT, y: BARS_Y, w: ROW_W, h: BARS_H, cell: CELL, peak: 1,
        role: 'output', labels: [...KEYS], values: { $derive: 'w' }, opacity: 0 } },
    { id: 'bars-top', type: 'line', semanticId: 'weight-one', conceptId: CONCEPT,
      initialState: { from: { x: RIGHT, y: BARS_Y + 4 }, to: { x: RIGHT + ROW_W, y: BARS_Y + 4 }, role: 'neutral', opacity: 0 } },

    // Left column: what the chosen multiplier did.
    note('raw-note', `one score per key; the ${KEYS.length - SEEN} later keys are scored too`, COL, 238, { opacity: 0 }),
    text('tag', '{{tag}}', COL, 270, { role: { $derive: 'tagRole' }, opacity: 0 }),
    note('cap-1', '{{cap1}}', COL, 292, { opacity: 0 }),
    note('cap-2', '{{cap2}}', COL, 310, { opacity: 0 }),
    text('readout', 'weight on ‘r’: {{wR}} here, {{wRule}} at × 1/2 = 1/√hs', COL, 340, { role: 'output', opacity: 0 }),
    note('order-1', 'any positive multiplier keeps the raw scores’ order:', COL, 368, { opacity: 0 }),
    note('order-2', '‘r’, then the three visible 2s, then the two visible −2s;', COL, 386, { opacity: 0 }),
    note('order-3', 'equal scores keep equal weights', COL, 404, { opacity: 0 }),
    note('legend-1', 'blank = masked, exactly 0 · 0.00 = rounded, still above 0', COL, 428, { opacity: 0 }),
    note('legend-2', 'each cell is rounded on its own, so a row can read 0.99', COL, 446, { opacity: 0 }),

    // The practice's case. No timeline appear: opacity follows the latch.
    note('zero-wait', 'Not drawn: × 0. Answer the practice below, then its row appears here.', COL, ZERO_Y + 8, { opacity: { $derive: 'waitOpacity' } }),
    row('zero-row', '× 0 (What-if): the practice’s case', COL, ZERO_Y, 'w0', { role: 'output', heat: true, valueScale: 'fixed', opacity: { $derive: 'zeroOpacity' } }),
    note('zero-1', '× 0 is not positive: no gap is left, so no order either.', 460, ZERO_Y + 8, { opacity: { $derive: 'zeroOpacity' } }),
    note('zero-2', `${SEEN} scores of 0, so ${SEEN} equal weights of 1/${SEEN}, ‘r’ included.`, 460, ZERO_Y + 26, { opacity: { $derive: 'zeroOpacity' } }),
    note('zero-3', `${LATER} stay blank: the mask comes after the multiplier.`, 460, ZERO_Y + 44, { opacity: { $derive: 'zeroOpacity' } }),

    // NanoGPT's own factor, true at every preset.
    note('rule', 'NanoGPT: × 1/√hs with hs = n_embd / n_head - fixed by the shape, not learned, the same in every head and layer', COL, 614),
    note('real-hs', `Source value: shakespeare_char has hs = ${A.n_embd} / ${A.n_head} = ${REAL_HS}, so its heads’ scores are × 1/${Math.sqrt(REAL_HS)}`, COL, 634),
    note('fused', 'NanoGPT’s default fused attention call applies the same × 1/√hs inside it', COL, 654),
  ],
  // Replay in source order: q·k, × m (with the mask), softmax; each caption
  // appears with the stage it describes.
  timeline: [
    { at: 0, action: 'appear', target: 'raw', duration: 0.3 },
    { at: 0, action: 'appear', target: 'raw-note', duration: 0.3 },
    { at: 0.4, action: 'appear', target: 'times-m', duration: 0.3 },
    { at: 0.4, action: 'appear', target: 'tag', duration: 0.3 },
    { at: 0.6, action: 'appear', target: 'masked', duration: 0.3 },
    { at: 1.1, action: 'appear', target: 'weights', duration: 0.3 },
    { at: 1.1, action: 'appear', target: 'cap-1', duration: 0.3 },
    { at: 1.1, action: 'appear', target: 'cap-2', duration: 0.3 },
    { at: 1.1, action: 'appear', target: 'readout', duration: 0.3 },
    { at: 1.1, action: 'appear', target: 'order-1', duration: 0.3 },
    { at: 1.1, action: 'appear', target: 'order-2', duration: 0.3 },
    { at: 1.1, action: 'appear', target: 'order-3', duration: 0.3 },
    { at: 1.1, action: 'appear', target: 'legend-1', duration: 0.3 },
    { at: 1.1, action: 'appear', target: 'legend-2', duration: 0.3 },
    { at: 1.4, action: 'appear', target: 'bars', duration: 0.3 },
    { at: 1.4, action: 'appear', target: 'bars-top', duration: 0.3 },
  ],
};

// Every preset, then the committed × 0 reveal at the practice's state and
// while exploring afterwards.
export const reviewStates = [
  { multiplier: RULE, zeroRevealed: false },
  { multiplier: 0, zeroRevealed: false },
  { multiplier: 2, zeroRevealed: false },
  { multiplier: RULE, zeroRevealed: true },
  { multiplier: 2, zeroRevealed: true },
];

// Practice (commit before you see): × 0 is no preset, and no preset ties the
// visible weights, so the answer needs the rule, not a reading of the card.
export const activity = {
  id: 'c12-practice',
  check: 'choice_equals',
  version: 1,
  prompt: 'What-if, not one of the presets: suppose the multiplier were × 0. What weight would this reader put on ‘r’?',
  fixedInputs: { multiplier: RULE },
  revealInput: 'zeroRevealed',
  // ponytail: SceneActivity shows no pick for an untouched answer, so this
  // naive default never renders; it only satisfies the choice declaration.
  // Bare values, so no option echoes a caption.
  answer: { type: 'choice', label: 'Weight on ‘r’ at × 0', default: 'top', options: [
    { id: 'sixth', label: '0.17 (1/6)' },
    { id: 'ninth', label: '0.11 (1/9)' },
    { id: 'zero', label: '0.00' },
    { id: 'top', label: 'still above the others, below 0.55' },
  ] },
  expected: 'sixth',
  checkLabel: 'Check',
  feedbackPass: `Right: 1/6 ≈ 0.17. × 0 turns every visible score into 0, so the ${READER + 1} characters this reader sees tie and split the weight evenly, ‘r’ included. The mask runs after the multiplier, so ${LATER} are still −∞ and get exactly 0: ${READER + 1} share it, not ${KEYS.length}. A score of 0 is not a weight of 0: e⁰ = 1 for each of the ${READER + 1} before dividing by their sum.`,
  feedbackFail: `Not quite. × 0 turns every score into 0, so no gap is left: the ${READER + 1} characters this reader sees tie and split the weight evenly, 1/6 ≈ 0.17 each, ‘r’ included. 1/9 forgets the mask: it runs after the multiplier, so ${LATER} are still −∞ and get exactly 0. 0.00 mixes up a score of 0 with a weight of 0: softmax gives e⁰ = 1 to each of the ${READER + 1} before dividing by their sum. And ‘r’ stays on top only while the multiplier is positive: × 0 erases every gap, so ‘r’ ties with the others. The × 0 row now appears on the card.`,
};

// Phase 1 plan (docs/nanogpt-deep-dive-batch3-plans.md, c12; verbatim where it fits).
export const plan = {
  concept: 'attention score scaling',
  objective: 'After this card, the learner should understand that NanoGPT multiplies every attention score by one positive number fixed by the head size, 1/√hs, before the mask and softmax, so the size of that number sets how peaked the visible weights are while their order and the masked zeros stay unchanged.',
  prerequisites: [
    'c11-causal-mask: later positions get −∞ and weight exactly 0; equal visible scores split the weight evenly',
    'a score is q·k, one number per key for this reader (named at the raw-scores stage)',
    'softmax turns a row of scores into weights that sum to 1, and a larger score gets a larger weight (named)',
  ],
  causalSteps: [
    'raw scores q·k against all 9 keys; the later keys are scored too',
    'the whole row × m, then the 3 later characters → −∞, drawn blank (the mask comes after the multiplier)',
    'softmax → weights, drawn as cells with fixed 0-1 heat and as bars on a fixed 0-1 axis (masked = no bar)',
  ],
  primaryInteraction: 'one index picker, "Multiplier on the scores (preset)": × 1/4, × 1/2 = 1/√hs (the rule at this toy\'s hs = 4, the default), × 1 (no factor). It moves the × m label on the arrow, the scaled row, the weight cells and bars (\'r\' 0.55 / 0.86 / 0.99), the status tag (What-if, rule, What-if), one picked caption and the readout "weight on \'r\': here, at × 1/2 = 1/√hs"; the order and the masked blanks never change',
  check: 'practice (commit before you see, choice_equals, fixedInputs multiplier = × 1/2): suppose the multiplier were × 0 - what weight would this reader put on \'r\'? × 0 is not a preset and no preset draws a tie, so the answer needs the rule (× 0 erases every gap; the mask still applies after it; e⁰ = 1), not the picture. The gated × 0 row appears after the committed attempt',
  boundary: {
    decision: 'staged',
    reason: 'one causal pipeline in source order - raw scores → × m → mask → softmax - shown in three stages, with one control acting on one quantity. NanoGPT\'s 1/√hs is the value the same multiplier takes, fixed by the shape: a setting, not a second mental model. Why 1/√hs in particular (spread grows with hs, saturation) stays in the depth ladder\'s Attention Deep dive; the weighted mix is c10\'s',
    reviewed: {},
    sequence: { name: 'Self-attention', position: 2, of: 3, relationships: [
      { type: 'prerequisite', card: 'c11-causal-mask', direction: 'in' },
      { type: 'prerequisite', card: 'c10-weighted-values', direction: 'out' },
      { type: 'prerequisite', card: 'c13-multi-head', direction: 'out' },
      { type: 'alternative_explanation', card: 'c21-temperature' },
    ] },
  },
};

const fmt = values => `[${values.join(', ')}]`;

export const sources = [
  code('model.py', 67, 67, 'Scores and the multiplier in one line: "att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))" - every q·k score times one number, 1/√hs.'),
  code('model.py', 68, 68, 'The mask runs after the multiply: "att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float(\'-inf\'))" - later positions become −∞ whatever the multiplier did to them.'),
  code('model.py', 69, 69, 'Then "att = F.softmax(att, dim=-1)": −∞ gives weight exactly 0; the visible weights share 1.'),
  code('model.py', 66, 66, 'These three lines are the "# manual implementation of attention" branch.'),
  code('model.py', 57, 57, 'Why k.size(-1) is hs: "k = k.view(B, T, self.n_head, C // self.n_head).transpose(1, 2) # (B, nh, T, hs)" - so the factor is fixed by the shape, not a learned weight.'),
  code('model.py', 33, 33, 'The head size divides evenly: "assert config.n_embd % config.n_head == 0", so hs = n_embd / n_head.'),
  code('model.py', 10, 10, '"import math" - math.sqrt is a plain Python number here, not a parameter.'),
  code('model.py', 44, 45, 'Which branch runs: "support is only in PyTorch >= 2.0", then "self.flash = hasattr(torch.nn.functional, \'scaled_dot_product_attention\')" - True on PyTorch 2.0 or later.'),
  code('model.py', 62, 64, 'The default fused branch passes no scale argument: "y = torch.nn.functional.scaled_dot_product_attention(q, k, v, attn_mask=None, dropout_p=self.dropout if self.training else 0, is_causal=True)" - so PyTorch\'s default scale, 1/√hs, applies inside it.'),
  code('model.py', 46, 50, 'The mask buffer exists only on the manual path: "if not self.flash:" then "torch.tril(torch.ones(config.block_size, config.block_size))".'),
  code('model.py', 99, 99, 'Every Block has its own attention: "self.attn = CausalSelfAttention(config)" - the same factor in every layer.'),
  code('model.py', 130, 130, 'n_layer Blocks: "h = nn.ModuleList([Block(config) for _ in range(config.n_layer)]),".'),
  code('config/train_shakespeare_char.py', 23, 24, `shakespeare_char's sizes: "n_head = ${A.n_head}" and "n_embd = ${A.n_embd}" - hs = ${REAL_HS}, so the factor is × 1/${Math.sqrt(REAL_HS)}.`),
  code('train.py', 53, 54, 'train.py\'s defaults: "n_head = 12" and "n_embd = 768" - hs = 64 there too.'),
  code('model.py', 113, 114, 'GPTConfig\'s defaults agree: "n_head: int = 12" and "n_embd: int = 768".'),
  code('model.py', 217, 220, 'The GPT-2 sizes: "\'gpt2\':         dict(n_layer=12, n_head=12, n_embd=768)" through "\'gpt2-xl\':      dict(n_layer=48, n_head=25, n_embd=1600)" - hs = 64 in all four.'),
  { kind: 'doc', title: 'torch.nn.functional.scaled_dot_product_attention (PyTorch documentation)', url: 'https://pytorch.org/docs/stable/generated/torch.nn.functional.scaled_dot_product_attention.html',
    note: 'scale (optional float): "Scaling factor applied prior to softmax. If None, the default value is set to 1/√E", with E = q.size(-1) = hs. NanoGPT passes no scale, so its default fused path multiplies by the same 1/√hs.' },
  { kind: 'paper', title: 'Attention Is All You Need (Vaswani et al., 2017) - scaled dot-product attention', arxiv: '1706.03762', page: 4,
    note: 'Section 3.2.1: Attention(Q, K, V) = softmax(QKᵀ/√d_k)V. NanoGPT\'s hs is the paper\'s d_k.' },
  { ...calculation('Calculated toy example', 'q and k for the nine characters',
    `gen_attention.py head 0 (hand-set, not trained), hs = ${HS}: key k(j) is a position code, and the query of reader i is ${att.gain} × k(i − 1), so reader ${READER}'s raw scores are ${fmt(RAW_ROW.map(v => +v.toFixed(5)))} to 5 decimals. The same fixture feeds the depth ladder's Attention cards.`),
  reproduce: GEN_ATTENTION },
  calculation('Live calculation', 'Scores, the scaled and masked row, the weights and the readout',
    `Computed on the card: matmul (q · k for every key), pick row ${READER}, scale by the chosen multiplier, causal_mask (later keys → −∞, blank), softmax; the rule's weights by the same chain at 1/√${HS}; 'r' found as the argmin of the negated masked raw scores; the × 0 row by the same chain at 0, gate()d until a committed practice attempt. Rounded to 3 decimals in text; each cell shows 2, rounded on its own, so a weight row can read 0.99.`),
  { kind: 'calculation', status: 'What-if', title: '× 1/4, × 1 and × 0',
    note: `NanoGPT always multiplies by 1/√hs (× 1/2 at this toy's hs = ${HS}). × 1/4 and × 1 are the same pipeline with another multiplier; × 0 is the practice's case, drawn only after an answer is committed.` },
  calculation('Source value', 'The characters, n_embd and n_head for shakespeare_char',
    `The nine characters are the first nine character tokens of line 2 of the dataset (attention.generated.js context, the same tokens as fx.tokenizer's char tokenizer). fx.architecture: n_embd = ${A.n_embd}, n_head = ${A.n_head}, from config/train_shakespeare_char.py resolved over train.py's defaults; hs = ${REAL_HS} and × 1/${Math.sqrt(REAL_HS)} are computed from them.`),
  tinyShakespeare('"Before we", the nine characters the keys are named after, begins line 2 of the dataset.'),
];

export const evidence = {
  card: 'c12-score-scaling',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'NanoGPT multiplies every q·k score by one positive number, 1/√hs (model.py:67, k.size(-1) = hs), fixed by the head size and not learned, before the causal mask (:68) and softmax (:69); the default fused SDPA call (:64) applies the same default scale inside it. A smaller multiplier shrinks every gap (flatter weights), a larger one widens them (sharper); a positive one never changes the order, and the mask still zeroes the later keys.',
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: `source: model.py:10, :33, :44-45, :46-50, :57, :62-64, :66-69, :99, :113-114, :130, :217-220; train.py:53-54; config/train_shakespeare_char.py:23-24 - checked against the pinned files. Calculated toy example: attention.generated.js heads[0] q, k (gen_attention.py), hs = ${HS}. Live calculation: matmul, pick, scale, causal_mask, softmax, argmin, gate, choose. What-if: × 1/4, × 1, × 0. Source value: the characters (attention.generated.js context = fx.tokenizer char tokens 0-8), n_embd ${A.n_embd}, n_head ${A.n_head} (fx.architecture).`,
  control: '"Multiplier on the scores (preset)" index picker: × 1/4, × 1/2 = 1/√hs (default, the rule at hs = 4), × 1 (no factor). A hidden zeroRevealed latch, set only by a committed practice attempt, reveals the × 0 row.',
  consequence: 'The arrow label and the scaled row follow the multiplier (-0.50 … 2.00 at × 1/4, -1.00 … 4.00 at × 1/2, -2.00 … 8.00 at × 1), the three later cells stay blank; the weight cells and bars move \'r\' 0.55 / 0.86 / 0.99 while the others shrink toward 0.00; the tag reads What-if / The rule / What-if with a picked caption (flatter / halves every gap / sharper); the readout gives \'r\' here and at the rule. The order line (at any positive multiplier) and the legend are true at every state. After a committed attempt the × 0 row shows six 0.17 cells and three blanks, and its lines say × 0 is not positive, so the order is gone.',
  interactionPurpose: 'See that one positive multiplier only rescales the gaps between the visible scores: it sets how peaked the weights are, never their order and never which keys are masked.',
  task: 'Step through the presets and compare \'r\' and the equal pairs; then, in practice, predict \'r\'s weight at × 0 (not a preset) before the card draws it.',
  capability: 'index picker; live matmul → scale → causal_mask → softmax on one row (plus the rule chain and a × 0 chain); argmax as argmin of negated masked scores; derived arrow label; picked tag, tag role and captions; scores without heat, weights with fixed heat and as bars on a pinned peak (null = no bar); a hidden bool revealInput with gate()d values and choose()d opacity, no timeline appear on those objects; choice practice graded by choice_equals with fixedInputs.',
};
