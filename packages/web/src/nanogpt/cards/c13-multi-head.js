// Card 13 - multi-head attention: one query, several heads. A calculated toy
// example computed LIVE: hand-built Q, K, V for n_head = 3 heads of size
// hs = 4 (C = 12), over the first four GPT-2 BPE tokens recorded in the
// fixture. Every head runs model.py:67-71 (scale, causal mask, softmax,
// att @ v) through the derive seam; the three head outputs are concatenated
// (model.py:72) and the selected head's slice is framed. c_proj (:75) is
// named, not computed. Those lines, the head split (:56-59) and the fused
// flash path (:62-64) are the card's `sources`, shown collapsed under it.
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { code, calculation, tiktoken, tinyShakespeare } from '../sources.js';

const TOKENS = fx.tokenizer.tokenizers[1].tokens.slice(0, 4).map(t => t.replaceAll('␣', '•'));
const N_HEAD = 3, HS = 4, C = N_HEAD * HS;
const HEADS = Array.from({ length: N_HEAD }, (unused, h) => `head ${h}`);

// Hand-built, not trained. Keys are one-hot position codes (K_h = I), so the
// raw score q·k_j is just entry j of the query row: each Q row "points at" a
// position. Head 0's rows point at the previous token, head 1's at the first
// token, head 2's at the token itself. Future entries are 0 (they are masked
// anyway). Tail entries are chosen so every softmax row's 2-decimal display
// is the plain rounding of the true weights and sums to exactly 1 - the
// display never has to redistribute a rounding residual (checked in the test).
const IDENTITY = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
const QS = [
  [[4, 0, 0, 0], [6, 1, 0, 0], [1, 6, 2, 0], [0, 2, 6, 1]], // head 0: previous token
  [[4, 0, 0, 0], [5, 2, 0, 0], [6, 2, 3, 0], [6, 1, 3, 0]], // head 1: first token
  [[4, 0, 0, 0], [1, 5, 0, 0], [0, 2, 5, 0], [0, 1, 3, 5]], // head 2: the token itself
];
const VS = [
  [[2, 0, 1, 0], [0, 1, 0, 2], [1, 2, 0, 0], [0, 0, 2, 1]],
  [[1, 1, 0, 0], [0, 0, 1, 1], [2, 0, 0, 1], [0, 2, 1, 0]],
  [[0, 1, 2, 0], [1, 0, 0, 2], [0, 2, 0, 1], [2, 0, 1, 0]],
];
const ROLE = ['the previous token', 'the first token', 'the token itself'];

// The design caption for each head x query. The first token has nothing
// before it, so no head can show its role there; at the second token
// "previous" and "first" are the same token.
const ROLE_TABLE = HEADS.map((name, h) => TOKENS.map((unused, q) => {
  if (q === 0) return `At "${TOKENS[0]}" nothing earlier is visible: all ${N_HEAD} heads put their whole weight on it and agree.`;
  if (q === 1 && h < 2) return `In this hand-built example "previous" (head 0) and "first" (head 1) are both "${TOKENS[0]}" here, so both land on it.`;
  return `In this hand-built example ${name} was built to attend mostly to ${ROLE[h]}.`;
}));

// One full per-head pipeline at a fixed head, for the concatenation: every
// head's output at the selected query, computed the same way.
const headPipeline = h => ({
  [`raw${h}`]: { op: 'matmul', args: [`Qs.${h}`, `Ks.${h}`] },
  [`scaled${h}`]: { op: 'scale', args: [`raw${h}`, 0.5] }, // 1/sqrt(hs), hs = 4
  [`masked${h}`]: { op: 'causal_mask', args: [`scaled${h}`, 'causal'] },
  [`att${h}`]: { op: 'softmax', args: [`masked${h}`] },
  [`w${h}`]: { op: 'pick', args: [`att${h}`, 'query'] },
  [`out${h}`]: { op: 'weighted_sum', args: [`w${h}`, `Vs.${h}`] },
});

const ANN = 'annotation';
const COL = 32;
const TOKENS_Y = 192;
const ROW_Y = 338; // the selected head's score / weight / output row
const RIGHT = 640; // the head-output column
const CONCAT_CELL = 48, CONCAT_Y = 598;
const FOOT = 710;

const corners = ({ x, y, w, h }) => ({ tl: { x, y }, tr: { x: x + w, y }, bl: { x, y: y + h }, br: { x: x + w, y: y + h } });
// Four lines around a rectangle - static corners, or a derived corner record.
const frame = (id, rect) => {
  const at = key => (typeof rect === 'string' ? { $derive: `${rect}.${key}` } : corners(rect)[key]);
  return [['top', 'tl', 'tr'], ['bottom', 'bl', 'br'], ['left', 'tl', 'bl'], ['right', 'tr', 'br']].map(([side, a, b]) => ({
    id: `${id}-${side}`, type: 'line', semanticId: `${id}-${side}`, conceptId: 'head-concat',
    initialState: { from: at(a), to: at(b), opacity: 0, role: 'learner' },
  }));
};
const FRAME_SIDES = ['top', 'bottom', 'left', 'right'];
const note = (id, conceptId, text, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId, initialState: { text, x: COL, y, typography: ANN, ...extra } });

export const scene = {
  id: 'nanogpt-c13-multi-head',
  title: 'Multi-head attention: one query, several heads',
  width: 960,
  height: FOOT + 56,
  duration: 4,
  inputs: [
    { name: 'head', type: 'index', label: 'Head (preset)', of: 'heads', default: 0, presentation: 'picker' },
    { name: 'query', type: 'index', label: 'Query token', of: 'tokens', default: 3, presentation: 'picker' },
  ],
  exampleData: {
    tokens: TOKENS,
    heads: HEADS,
    nHead: N_HEAD, hs: HS, C,
    realNHead: fx.architecture.n_head, realC: fx.architecture.n_embd,
    causal: true,
    Qs: QS, Ks: [IDENTITY, IDENTITY, IDENTITY], Vs: VS,
    sliceIdx: HEADS.map((unused, h) => Array.from({ length: HS }, (u, d) => h * HS + d)),
    // Layout only: each head's frame corners, 6px outside its slice.
    sliceFrames: HEADS.map((unused, h) => corners({ x: COL + h * HS * CONCAT_CELL - 6, y: CONCAT_Y - 6, w: HS * CONCAT_CELL + 12, h: CONCAT_CELL + 12 })),
    sliceNotes: HEADS.map((name, h) => `framed = ${name}, entries ${h * HS + 1}-${(h + 1) * HS} of ${C}`),
    roleTable: ROLE_TABLE,
    maskNotes: [
      `Query "${TOKENS[0]}" sees only itself; every later position is masked.`,
      `Query "${TOKENS[1]}" sees "${TOKENS[0]}" and itself; later positions are masked.`,
      `Query "${TOKENS[2]}" sees itself and earlier tokens; "${TOKENS[3]}" is masked.`,
      `Query "${TOKENS[3]}" is the last token: every position is visible.`,
    ],
  },
  derived: {
    headName: { op: 'pick', args: ['heads', 'head'] },
    qword: { op: 'pick', args: ['tokens', 'query'] },
    // The selected head, end to end.
    Qsel: { op: 'pick', args: ['Qs', 'head'] },
    Ksel: { op: 'pick', args: ['Ks', 'head'] },
    Vsel: { op: 'pick', args: ['Vs', 'head'] },
    rawSel: { op: 'matmul', args: ['Qsel', 'Ksel'] },          // q @ k^T
    scaledSel: { op: 'scale', args: ['rawSel', 0.5] },          // x 1/sqrt(hs), hs = 4
    maskedSel: { op: 'causal_mask', args: ['scaledSel', 'causal'] },
    attSel: { op: 'softmax', args: ['maskedSel'] },
    scoreRow: { op: 'pick', args: ['maskedSel', 'query'] },
    wRow: { op: 'pick', args: ['attSel', 'query'] },
    headOut: { op: 'weighted_sum', args: ['wRow', 'Vsel'] },
    // Where the weight peaks: softmax is monotonic, so the largest visible
    // weight sits at the largest visible score = argmin of the negated,
    // masked scores.
    negSel: { op: 'scale', args: ['scaledSel', -1] },
    negMasked: { op: 'causal_mask', args: ['negSel', 'causal'] },
    negRow: { op: 'pick', args: ['negMasked', 'query'] },
    topAt: { op: 'argmin', args: ['negRow'] },
    topWord: { op: 'pick', args: ['tokens', 'topAt'] },
    vTop: { op: 'pick', args: ['Vsel', 'topAt'] },
    // Every head at the same query, then side by side (model.py:72).
    ...headPipeline(0), ...headPipeline(1), ...headPipeline(2),
    concatOut: { op: 'concat', args: ['out0', 'out1', 'out2'] },
    slice: { op: 'pick', args: ['sliceIdx', 'head'] },
    sliceFrame: { op: 'pick', args: ['sliceFrames', 'head'] },
    sliceNote: { op: 'pick', args: ['sliceNotes', 'head'] },
    roleRow: { op: 'pick', args: ['roleTable', 'head'] },
    roleNote: { op: 'pick', args: ['roleRow', 'query'] },
    maskNote: { op: 'pick', args: ['maskNotes', 'query'] },
  },
  objects: [
    { id: 'question', type: 'text', semanticId: 'question', conceptId: 'multi-head-attention',
      initialState: { text: 'How can heads attend differently to the same tokens, and how are their outputs combined?', x: COL, y: 30 } },
    note('provenance', 'multi-head-attention', 'Calculated toy example, live calculation: each head\'s Q, K, V is hand-built, not from a trained model.', 56),
    note('config', 'multi-head-attention', 'Toy sizes: n_head {{nHead}}, hs {{hs}}, C (= n_embd) {{C}}; NanoGPT shakespeare_char uses n_head {{realNHead}}, n_embd {{realC}}.', 78),
    note('keys-note', 'multi-head-attention', 'Keys are hand-built one-hot positions, so the token text does not enter these numbers.', 100),
    note('split-note', 'multi-head-attention', 'In NanoGPT q, k, v = c_attn(x), each cut into n_head slices of width hs: each head has its own learned weights.', 122),
    { id: 'tokens', type: 'tokens', semanticId: 'tokens', conceptId: 'multi-head-attention',
      initialState: { label: 'GPT-2 BPE tokens (• = space); bold = query', x: COL, y: TOKENS_Y, opacity: 0,
        tokens: [...TOKENS], role: 'observed', tokenStyle: 'labels', cellHighlight: { $derive: 'query' } } },
    { id: 'inspecting', type: 'text', semanticId: 'inspecting', conceptId: 'multi-head-attention',
      initialState: { text: 'Inspecting {{headName}} at query "{{qword}}" - one row of that head only', x: COL, y: ROW_Y - 78 } },
    // The selected head's one row: scaled scores -> weights -> output.
    // No heat on the scores: its only honest scale would be per-row, and it
    // feeds the weights (a chain the gate refuses "local" on); numbers suffice,
    // and a masked (-inf) score draws blank.
    { id: 'scores-row', type: 'grid', semanticId: 'head-score-row', conceptId: 'scaled-scores',
      initialState: { label: '1. scores q·k × 1/√hs', x: COL, y: ROW_Y, rows: 1, cols: 4, cell: 60, opacity: 0, role: 'neutral',
        matrixKind: 'derived', columnLabels: [...TOKENS], values: { $derive: 'scoreRow' } } },
    { id: 'arrow-scores-weights', type: 'arrow', semanticId: 'arrow-scores-weights', conceptId: 'softmax-attention-weights',
      initialState: { from: { x: 278, y: ROW_Y + 30 }, to: { x: 326, y: ROW_Y + 30 }, opacity: 0, role: 'neutral' } },
    { id: 'weights-row', type: 'grid', semanticId: 'head-weight-row', conceptId: 'softmax-attention-weights',
      initialState: { label: '2. softmax weights (sum to 1)', x: 336, y: ROW_Y, rows: 1, cols: 4, cell: 60, opacity: 0, role: 'observed',
        matrixKind: 'derived', distribution: true, heat: true, valueScale: 'fixed',
        columnLabels: [...TOKENS], values: { $derive: 'wRow' } } },
    { id: 'arrow-weights-output', type: 'arrow', semanticId: 'arrow-weights-output', conceptId: 'attention-output',
      initialState: { from: { x: 582, y: ROW_Y + 30 }, to: { x: RIGHT - 14, y: ROW_Y + 30 }, opacity: 0, role: 'neutral' } },
    // Frames drawn as four lines (a box's fill would tint the heat cells and
    // misstate their values): the same colour ties the inspected head's
    // output to its slice of the concatenation below.
    ...frame('head-output-frame', { x: RIGHT - 6, y: ROW_Y - 6, w: 4 * 60 + 12, h: 60 + 12 }),
    // Its title is a text at the grids' title height (a strip has no column
    // headers, so its own label would sit lower than the two titles beside it).
    { id: 'head-output-title', type: 'text', semanticId: 'head-output-title', conceptId: 'attention-output',
      initialState: { text: '3. {{headName}} output = Σ w·V', x: RIGHT, y: ROW_Y - 50, typography: 'caption' } },
    { id: 'head-output', type: 'strip', semanticId: 'head-output', conceptId: 'attention-output',
      initialState: { x: RIGHT, y: ROW_Y, cell: 60, opacity: 0, role: 'output',
        heat: true, valueScale: 'shared', valueScaleGroup: 'c13-head-outputs', values: { $derive: 'headOut' } } },
    // The one V row that dominates the sum, column-aligned with the output.
    { id: 'v-top-title', type: 'text', semanticId: 'v-top-title', conceptId: 'attention-output',
      initialState: { text: 'V row of "{{topWord}}" (largest w)', x: RIGHT, y: ROW_Y + 94, typography: ANN } },
    { id: 'v-top', type: 'strip', semanticId: 'v-top', conceptId: 'attention-output',
      initialState: { x: RIGHT, y: ROW_Y + 106, cell: 60, opacity: 0, role: 'input',
        heat: true, valueScale: 'shared', valueScaleGroup: 'c13-head-outputs', values: { $derive: 'vTop' } } },
    // Left column under the rows: ends before the V row at x = RIGHT.
    note('mask-note', 'causal-mask', '{{maskNote}}', ROW_Y + 94),
    note('mask-legend', 'causal-mask', 'masked, not a value: blank score = -inf; gray weight = exactly 0', ROW_Y + 116),
    note('top-note', 'softmax-attention-weights', 'Largest weight (computed): {{headName}} puts most of it on "{{topWord}}".', ROW_Y + 138),
    note('role-note', 'multi-head-attention', '{{roleNote}}', ROW_Y + 196),
    // Every head's output at this query, side by side.
    ...frame('slice-frame', 'sliceFrame'),
    { id: 'concat', type: 'strip', semanticId: 'concat-heads', conceptId: 'head-concat',
      initialState: { label: 'concat at query "{{qword}}": all {{nHead}} head outputs side by side = {{C}} numbers', x: COL, y: CONCAT_Y, cell: CONCAT_CELL, opacity: 0, role: 'output',
        heat: true, valueScale: 'shared', valueScaleGroup: 'c13-head-outputs', values: { $derive: 'concatOut' },
        cellHighlight: { $derive: 'slice' }, cellHighlightKind: 'highlight' } },
    ...HEADS.map((name, h) => ({ id: `concat-head-${h}`, type: 'text', semanticId: `concat-head-${h}`, conceptId: 'head-concat',
      initialState: { text: `{{heads.${h}}}`, x: COL + h * HS * CONCAT_CELL + (HS * CONCAT_CELL) / 2 - 24, y: CONCAT_Y + 76, typography: ANN } })),
    { id: 'slice-note', type: 'text', semanticId: 'slice-note', conceptId: 'head-concat',
      initialState: { text: '{{sliceNote}}', x: 636, y: CONCAT_Y + 20, typography: ANN, role: 'learner' } },
    { id: 'slice-note-2', type: 'text', semanticId: 'slice-note-2', conceptId: 'head-concat',
      initialState: { text: 'same numbers as its framed output above', x: 636, y: CONCAT_Y + 40, typography: ANN } },
    { id: 'cproj-note', type: 'text', semanticId: 'cproj-note', conceptId: 'head-concat',
      initialState: { text: 'Then c_proj, a learned C × C linear layer, mixes all {{C}} entries across heads - not computed here.', x: COL, y: FOOT, typography: 'caption' } },
    // Footer: caveat.
    note('caveat', 'multi-head-attention', 'Trained heads can overlap or have no clean human-readable role; nothing guarantees every pair of heads differs.', FOOT + 34),
  ],
  timeline: [
    { at: 0.0, action: 'appear', target: 'tokens', duration: 0.4 },
    { at: 0.5, action: 'appear', target: 'scores-row', duration: 0.4 },
    { at: 0.9, action: 'appear', target: 'arrow-scores-weights', duration: 0.3 },
    { at: 1.1, action: 'appear', target: 'weights-row', duration: 0.4 },
    { at: 1.5, action: 'appear', target: 'arrow-weights-output', duration: 0.3 },
    ...FRAME_SIDES.map(side => ({ at: 1.7, action: 'appear', target: `head-output-frame-${side}`, duration: 0.4 })),
    { at: 1.7, action: 'appear', target: 'head-output', duration: 0.4 },
    { at: 1.7, action: 'appear', target: 'v-top', duration: 0.4 },
    ...FRAME_SIDES.map(side => ({ at: 2.3, action: 'appear', target: `slice-frame-${side}`, duration: 0.5 })),
    { at: 2.3, action: 'appear', target: 'concat', duration: 0.5 },
  ],
};

const { n_head: realNHead, n_embd: realC } = fx.architecture;

export const sources = [
  code('model.py', 56, 59, 'The head split: “q, k, v  = self.c_attn(x).split(self.n_embd, dim=2)”, then each is viewed as n_head heads of size hs = C // n_head, e.g. “q = q.view(B, T, self.n_head, C // self.n_head).transpose(1, 2) # (B, nh, T, hs)”. Each head gets its own hs-wide slice of one learned projection.'),
  code('model.py', 66, 71, 'The manual attention path (“# manual implementation of attention”) every head runs on the card: “att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))” (step 1); “att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float(\'-inf\'))” (blank masked scores); “att = F.softmax(att, dim=-1)” (step 2, masked weights exactly 0); “y = att @ v” (step 3). “att = self.attn_dropout(att)” acts only in training and is not shown.'),
  code('model.py', 72, 72, 'The concatenation: “y = y.transpose(1, 2).contiguous().view(B, T, C) # re-assemble all head outputs side by side”.'),
  code('model.py', 75, 75, 'Named on the card, not computed: “y = self.resid_dropout(self.c_proj(y))” - c_proj mixes the C concatenated entries across heads.'),
  code('model.py', 35, 37, 'The two learned projections: “self.c_attn = nn.Linear(config.n_embd, 3 * config.n_embd, bias=config.bias)” makes q, k, v for all heads at once; “self.c_proj = nn.Linear(config.n_embd, config.n_embd, bias=config.bias)” is the C × C output mix.'),
  code('model.py', 62, 64, 'What NanoGPT runs by default with PyTorch >= 2.0 (self.flash, line 45): the fused “torch.nn.functional.scaled_dot_product_attention(q, k, v, attn_mask=None, dropout_p=self.dropout if self.training else 0, is_causal=True)”, which computes the same attention as the manual path the card draws.'),
  code('config/train_shakespeare_char.py', 23, 24, `“n_head = ${realNHead}” and “n_embd = ${realC}” - the real sizes the card sets its toy ones against, read by the fixture generator from this config resolved over train.py defaults.`),
  tiktoken(`The four tokens ${TOKENS.map(t => `“${t}”`).join(', ')} (• = space) are the first ${TOKENS.length} of the ${fx.tokenizer.tokenizers[1].count} that tiktoken “gpt2” encode_ordinary makes of “${fx.tokenizer.text}” - the call data/shakespeare/prepare.py makes - recorded by generate_fixtures.py. They only label the columns: the keys are one-hot positions, so the token text does not enter the numbers.`),
  tinyShakespeare(`“${fx.tokenizer.text}”, the text the four tokens come from, is from line 2 of the dataset.`),
  // Authored on this card, not by the fixture generator - so no reproduce command.
  { kind: 'calculation', status: 'Calculated toy example', title: 'Q, K, V for each head',
    note: `Typed into this card, not trained: n_head = ${N_HEAD} heads of size hs = ${HS} (C = ${C}). Each head’s Q and V are small integer matrices and every K is the identity (one-hot positions), so a raw score q·k_j is entry j of the query row. Head 0’s query rows point at the previous token, head 1’s at the first token, head 2’s at the token itself. Tail entries are chosen so every displayed 2-decimal weight row is the plain rounding of the true weights and sums to exactly 1.` },
  calculation('Live calculation', 'Scores, weights, head outputs and the concatenation',
    'Computed on the card by derive ops, for the selected head and for all three heads at the selected query: matmul (q @ kᵀ), scale by 0.5 = 1/√hs, causal_mask (future scores -inf), softmax, pick (the query row), weighted_sum (Σ w·V), then concat of the three head outputs. The largest weight is argmin of the negated masked scores.'),
];

export const evidence = {
  card: 'c13-multi-head',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'CausalSelfAttention splits q, k, v (one learned c_attn projection) into n_head heads of size C // n_head; each head scales its scores by 1/sqrt(hs), masks the future, softmaxes and mixes its own V; the head outputs are laid side by side into C numbers and c_proj mixes them.',
  sourceRevision: `${fx.provenance.nanogpt.repo} @ ${fx.provenance.nanogpt.commit}`,
  provenance: 'source: model.py:35 and :56 (one c_attn for q, k, v), :57-59 (head split), :64 (fused flash path, PyTorch >= 2.0), :67 (x 1.0/math.sqrt(k.size(-1))), :68 (masked_fill -inf), :69 (softmax), :70 (attn_dropout, not shown), :71 (att @ v), :72 (transpose/view re-assembly), :75 (c_proj), read at @3adf61e; real sizes n_head/n_embd from fx.architecture (config/train_shakespeare_char.py); tokens: fx.tokenizer.tokenizers[1].tokens.slice(0,4) (tiktoken gpt2 output recorded by generate_fixtures.py); calculated toy example: hand-built Q, K = I, V per head in exampleData; live calculation: matmul, scale 0.5, causal_mask, softmax, pick, weighted_sum, argmin, concat.',
  control: '"Head (preset)" index picker over head 0/1/2 (default head 0); "Query token" index picker over the four tokens (default the last).',
  consequence: 'From the second token on, head moves the weight mass (head 0 -> previous token, head 1 -> first token, head 2 -> itself in this hand-built example; at the second token heads 0 and 1 coincide on the first token), changes the head output and its dominant V row, and moves the orange frame to that head\'s slice of the 12-number concatenation. At the first token every head puts all its weight on it, so heads cannot differ there. Query changes which key positions are visible (future scores -inf drawn blank, weights exactly 0 drawn gray) and every head\'s output in the concatenation.',
  interactionPurpose: 'Compare heads on the same query to see different attention patterns from the same tokens, and see that the per-head outputs are only placed side by side before c_proj mixes them.',
  task: 'Pick each head at the last query and say where its weight goes; then pick an earlier query and see which positions disappear, and why the first token leaves the heads no choice.',
  capability: 'two index pickers; per-head derive pipelines (matmul, scale, causal_mask, softmax, pick, weighted_sum) plus concat; argmax composed as argmin of negated masked scores; head x query caption table picked twice; masked cells drawn blank (scores, no heat) or gray (weights) and explained in words; scores carry no heat (a per-row scale is all they could honestly have); frames drawn as four lines with picked (derived) corner coordinates. Illustrates the manual attention path (:66-71); the default flash path (:64) is cited in the card\'s sources, not drawn.',
};
