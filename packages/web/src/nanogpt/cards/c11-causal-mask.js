// Card 11 - the causal mask as one fixed lower triangle. Sequence
// "Self-attention", 1 of 3 (c11 → c12-score-scaling → c10-weighted-values).
// Staged, one pipeline: ① NanoGPT's tril of ones cut to T × T (1 = may read,
// 0 = blocked), then 0 → score −∞ (masked_fill), then a per-row softmax ②.
// Every score is 0 (a calculated toy example), so the mask alone shapes the
// weights: row i splits 1 evenly over columns 0..i. The consequence is read
// off ①: the highlighted (framed) cell (i, i + 1) is row i's training target,
// and it is always the first 0 in its row. Both grids share the fixed [0, 1]
// heat, so ①'s triangle of 1s reads at a glance.
//
// The characters are real shakespeare_char tokens (the tokenizer card's
// "Before we…" line); T and block_size are interpolated, never typed. One
// control, the mask; off is a what-if (NanoGPT has no switch for it). Storage,
// the cut to T × T and the flash/is_causal branch are in the sources.
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { calculation, code, tinyShakespeare } from '../sources.js';

const A = fx.architecture;
const TOKENS = fx.tokenizer.tokenizers.find(t => t.id === 'char').tokens.slice(0, 7);
const T = TOKENS.length - 1; // six positions; the seventh character is row 5's target
const CHARS = TOKENS.slice(0, T);
const show = ch => (ch === '␣' ? '•' : ch);
const square = cell => Array.from({ length: T }, (unused, i) => Array.from({ length: T }, (unused2, j) => cell(i, j)));
// torch.tril(torch.ones(block_size, block_size)) cut to T × T, and the what-if.
export const TRIL = square((i, j) => (j <= i ? 1 : 0));
const ONES = square(() => 1);
// Row i's training target, (i, i + 1), as flat indices; row 5's is past the window.
export const TARGETS = CHARS.slice(0, -1).map((unused, i) => i * T + i + 1);

const CELL = 44;
// x2: the What-if title of ② (estimated at body size) must end inside the
// legend, the widest line, or the frame would refit in that state.
const G = { y: 190, x1: 142, x2: 514 };
const MID = G.y + (T / 2) * CELL;
const CONCEPT = 'causal-mask';
const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const columnLabels = CHARS.map((ch, i) => `${i} ${ch}`);
// Each target cell (i, i + 1) gets four lines inset 3px: the grid's own
// highlight ring is the grid's blue and too faint to read (c07's lit-row frame).
// Role observed (the target is the observed next character): near-black reads
// on the pale 0 cells and still shows on the dark 1 cells of the What-if.
const INSET = 3;
const targetFrames = CHARS.slice(0, -1).flatMap((unused, i) => {
  const x0 = G.x1 + (i + 1) * CELL + INSET, x1 = G.x1 + (i + 2) * CELL - INSET;
  const y0 = G.y + i * CELL + INSET, y1 = G.y + (i + 1) * CELL - INSET;
  return [['top', x0, y0, x1, y0], ['bottom', x0, y1, x1, y1], ['left', x0, y0, x0, y1], ['right', x1, y0, x1, y1]].map(([side, ax, ay, bx, by]) => ({
    id: `target-${i}-${side}`, type: 'line', semanticId: `target-${i}-${side}`, conceptId: CONCEPT,
    initialState: { from: { x: ax, y: ay }, to: { x: bx, y: by }, role: 'observed', opacity: 0 },
  }));
});

export const scene = {
  id: 'nanogpt-c11-causal-mask',
  title: 'Causal mask as a triangle',
  width: 960,
  height: 620,
  duration: 2,
  inputs: [
    { name: 'mask', type: 'bool', label: 'Causal mask (off = What-if)', default: true },
  ],
  exampleData: {
    tril: TRIL,
    ones: ONES,
    // Calculated toy example: every score 0.
    scores: square(() => 0),
    maskLabelOn: '① causal mask: 1 = may read, 0 = blocked',
    maskLabelOff: '① What-if, no mask: every cell 1',
    weightsLabelOn: '② weights: 0 → score −∞ → weight 0',
    weightsLabelOff: `② What-if weights: every row spreads over all ${T}`,
    readsOn: 'Each position reads itself and every earlier one, never a later one.',
    readsOff: `What-if, no mask: every row reads all ${T} positions, later ones included.`,
    targetOn: 'The highlighted cell is the next character, the one that row is trained to predict: always blocked.',
    targetOff: `Rows 0 to ${T - 2} could each read their highlighted cell: the very character each is trained to predict.`,
    blockSize: A.block_size,
  },
  derived: {
    maskTable: { op: 'choose', args: ['mask', 'tril', 'ones'] },
    // Live calculation: blocked scores leave the row, softmax splits 1 over the rest.
    masked: { op: 'causal_mask', args: ['scores', 'mask'] },
    weights: { op: 'softmax', args: ['masked'] },
    maskLabel: { op: 'choose', args: ['mask', 'maskLabelOn', 'maskLabelOff'] },
    weightsLabel: { op: 'choose', args: ['mask', 'weightsLabelOn', 'weightsLabelOff'] },
    reads: { op: 'choose', args: ['mask', 'readsOn', 'readsOff'] },
    target: { op: 'choose', args: ['mask', 'targetOn', 'targetOff'] },
  },
  objects: [
    text('question', 'Which positions may each position read, and why never its next character?', 40, 34, { typography: 'heading' }),
    note('status', 'Characters: Source value · every score 0: Calculated toy example · weights: Live calculation · mask off: What-if', 40, 60),
    note('equal-scores', 'Every score is 0 here, so the mask alone shapes the weights: each row splits 1 evenly over what it may read.', 40, 82),
    note('legend', 'Row label “i · char → next char”: position i is trained to predict character i + 1 (• = space, beyond this window).', 40, 104),

    { id: 'mask-table', type: 'grid', semanticId: 'causal-mask-table', conceptId: CONCEPT,
      initialState: { label: '{{maskLabel}}', x: G.x1, y: G.y, rows: T, cols: T, cell: CELL, matrixKind: 'input', numberFormat: 'integer', role: 'input',
        heat: true, valueScale: 'fixed', rowLabels: CHARS.map((ch, i) => `${i} · ${ch} → ${show(TOKENS[i + 1])}`), columnLabels,
        values: { $derive: 'maskTable' }, cellHighlight: TARGETS, cellHighlightKind: 'highlight', opacity: 0 } },
    ...targetFrames,
    { id: 'mask-to-weights', type: 'arrow', semanticId: 'mask-to-weights', conceptId: CONCEPT,
      initialState: { from: { x: G.x1 + T * CELL + 10, y: MID }, to: { x: G.x2 - 60, y: MID }, role: 'neutral', opacity: 0 } },
    { id: 'weights', type: 'grid', semanticId: 'attention-weights', conceptId: CONCEPT,
      initialState: { label: '{{weightsLabel}}', x: G.x2, y: G.y, rows: T, cols: T, cell: CELL, matrixKind: 'derived', role: 'output',
        heat: true, valueScale: 'fixed', rowLabels: columnLabels, columnLabels, values: { $derive: 'weights' }, opacity: 0 } },

    text('reads', '{{reads}}', 40, 494),
    text('target', '{{target}}', 40, 520),
    note('footer', 'NanoGPT always uses the triangle, in every head and every layer, for any T up to block_size = {{blockSize}}.', 40, 552),
    note('rounding', 'Each cell is rounded on its own, so a row can read 0.99 or 1.02; its exact sum is 1.', 40, 574),
  ],
  timeline: [
    { at: 0, action: 'appear', target: 'mask-table', duration: 0.4 },
    ...targetFrames.map(line => ({ at: 0, action: 'appear', target: line.id, duration: 0.4 })),
    { at: 0.6, action: 'appear', target: 'mask-to-weights', duration: 0.3 },
    { at: 1.0, action: 'appear', target: 'weights', duration: 0.4 },
  ],
};

export const reviewStates = [{ mask: true }, { mask: false }];

// Practice (commit before you see): row 99 of a block_size window - the card
// draws rows 0-5 of a T = 6 window, so the range needs the rule "row i keeps
// columns 0..i and blocks column i + 1", not a reading of the picture.
const Q = 99;
const BS = A.block_size;
export const activity = {
  id: 'c11-practice',
  check: 'choice_equals',
  version: 1,
  prompt: `In shakespeare_char training every window is T = ${BS} characters long (block_size). Positions count from 0, as on the card. With the causal mask on, which positions may the query at position ${Q} read?`,
  fixedInputs: { mask: true },
  // ponytail: SceneActivity shows no pick for an untouched answer, so this
  // naive default never renders; it only satisfies the choice declaration.
  // Bare ranges: the reasoning lives in the feedback, not the options.
  answer: { type: 'choice', label: 'Your answer', default: 'all', options: [
    { id: 'before', label: `0 to ${Q - 1}` },
    { id: 'self', label: `0 to ${Q}` },
    { id: 'target', label: `0 to ${Q + 1}` },
    { id: 'all', label: `0 to ${BS - 1} (all ${BS})` },
  ] },
  expected: 'self',
  checkLabel: 'Check',
  feedbackPass: `Right: position ${Q} reads positions 0 to ${Q}, itself and every earlier one, ${Q + 1} in all. Position ${Q + 1} is the character it is trained to predict, and it is blocked with everything after it, up to ${BS - 1}.`,
  feedbackFail: `Not quite. Row i keeps columns 0 to i: the diagonal stays, because a position reads itself, and column i + 1 - the character it is trained to predict - is the first one blocked, with everything after it. On the card, row 5 reads 0 to 5, and its target, the space, lies after the window. So position ${Q} reads 0 to ${Q}, ${Q + 1} positions; ${Q + 1} to ${BS - 1} are blocked.`,
};

// Phase 1 plan (docs/nanogpt-deep-dive-batch3-plans.md, c11, verbatim where it fits).
export const plan = {
  concept: 'causal mask',
  objective: 'After this card, the learner should understand that the causal mask is one fixed lower triangle over the T × T scores, so every position reads only itself and earlier positions, never the next character it is trained to predict.',
  prerequisites: [
    'attention lets a position read other positions and mix them (named on c02)',
    'softmax turns a row of scores into weights that sum to 1 (named, not taught)',
    'next-character targets: position i is trained to predict character i + 1 (taught in place by the row labels and the legend; c16 and c26 own the objective)',
  ],
  causalSteps: [
    'stage 1: the mask table - tril of ones cut to T × T, 1 on and below the diagonal, 0 above; row i keeps columns 0..i',
    'stage 2: wherever the table holds 0 the score becomes −∞ (masked_fill); every toy score is 0, so only the mask shapes what follows',
    'stage 3: softmax per row gives the weights; blocked weights are exactly 0 and row i splits 1 evenly over i + 1 positions',
    'consequence: the highlighted cell (i, i + 1) is row i\'s training target and always the first 0 in its row; row 5\'s target is past the window',
  ],
  primaryInteraction: 'one bool, "Causal mask (off = What-if)", default on (NanoGPT\'s state). Off: every 0 in the mask table becomes 1, the highlighted targets included; the weights fill the blocked triangle and every row reads 0.17 × 6; the two table labels and both captions switch through choose',
  check: 'practice (commit before you see): with the mask locked on, which positions may the query at position 99 of a T = 256 window read? The card draws rows 0-5 of a T = 6 window, so the range needs the rule (row i keeps columns 0..i and blocks column i + 1), not the picture',
  boundary: {
    decision: 'staged',
    reason: 'one causal pipeline revealed in stages: the tril table, then 0 → −∞ (masked_fill), then a per-row softmax. The highlighted targets are not a second mechanism; they explain where the cut falls. Storage, the cut to T × T and the flash/is_causal branch live in the sources',
    reviewed: {},
    sequence: { name: 'Self-attention', position: 1, of: 3, relationships: [
      { type: 'prerequisite', card: 'c12-score-scaling', direction: 'out' },
      { type: 'prerequisite', card: 'c10-weighted-values', direction: 'out' },
      { type: 'prerequisite', card: 'c05-position-mixing', direction: 'out' },
      { type: 'prerequisite', card: 'c13-multi-head', direction: 'out' },
    ] },
  },
};

const fmt = values => `[${values.join(', ')}]`;

export const sources = [
  code('model.py', 46, 50, 'The table ① draws, stored only on the manual path: "if not self.flash:" … "# causal mask to ensure that attention is only applied to the left in the input sequence", then a buffer holding "torch.tril(torch.ones(config.block_size, config.block_size))" - 1 on and below the diagonal, 0 above.'),
  code('model.py', 67, 69, 'The three stages, in order: "att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))", then "att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float(\'-inf\'))" (the table cut to T × T; every 0 turns the score into −∞), then "att = F.softmax(att, dim=-1)" (per row, so −∞ becomes weight exactly 0).'),
  code('model.py', 70, 70, 'Dropout on the weights comes next in training and is not modelled here: "att = self.attn_dropout(att)".'),
  code('model.py', 44, 45, 'Which path runs: "self.flash = hasattr(torch.nn.functional, \'scaled_dot_product_attention\')" - true on PyTorch 2.0 and later, the default.'),
  code('model.py', 62, 64, 'The default path applies the same triangle as a flag instead of a stored table: "if self.flash:" … "is_causal=True".'),
  { kind: 'doc', title: 'torch.nn.functional.scaled_dot_product_attention (PyTorch documentation)', url: 'https://pytorch.org/docs/stable/generated/torch.nn.functional.scaled_dot_product_attention.html',
    note: 'Documents is_causal: with it set, the call applies a lower-triangular causal mask - the same triangle the manual path stores, which is why the card says NanoGPT uses this triangle on either path.' },
  code('model.py', 99, 99, 'Every Block has its own causal attention: "self.attn = CausalSelfAttention(config)".'),
  code('model.py', 130, 130, 'And there are n_layer Blocks: "h = nn.ModuleList([Block(config) for _ in range(config.n_layer)]),". Every head of every layer uses the same triangle.'),
  code('model.py', 173, 173, 'Why any T up to block_size: "assert t <= self.config.block_size" - the stored table is block_size × block_size and is cut to T × T.'),
  code('train.py', 123, 125, 'Position i is trained to predict character i + 1: "x = torch.stack([torch.from_numpy((data[i:i+block_size]).astype(np.int64)) for i in ix])" and "y = torch.stack([torch.from_numpy((data[i+1:i+1+block_size]).astype(np.int64)) for i in ix])" - y is x shifted by one.'),
  code('model.py', 184, 187, 'Every position is scored against its own target: "loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-1)".'),
  code('config/train_shakespeare_char.py', 19, 19, 'The window in the practice: "block_size = 256 # context of up to 256 previous characters".'),
  calculation('Source value', `The characters of “${CHARS.join('')}” and block_size`,
    `generate_fixtures.py rebuilt the character vocabulary with prepare.py's logic over the sha-pinned Tiny Shakespeare file and split the tokenizer card's sentence into characters; this card labels its rows and columns with the first ${T}, ${fmt(CHARS)}, and names the seventh (a space) as row ${T - 1}'s target. block_size ${A.block_size} comes from the resolved shakespeare_char config (fx.architecture) and sets the practice's window.`),
  // Authored on this card, not by the fixture generator - so no reproduce command.
  { kind: 'calculation', status: 'Calculated toy example', title: 'Every score 0',
    note: `A ${T} × ${T} matrix of zeros typed into this card in place of q·k scores, so the mask alone shapes the weights: each row splits 1 evenly over what it may read. Real scores differ from row to row and key to key; NanoGPT does not attend evenly. The mask table itself is structural, built from T: 1 where column ≤ row, 0 above (torch.tril of ones, cut to T × T).` },
  calculation('Live calculation', 'The weights',
    `Computed on the card: causal_mask blanks every score above the diagonal (NanoGPT's −∞) and softmax splits each row's 1 over what is left: 1.00 | 0.50 × 2 | 0.33 × 3 | 0.25 × 4 | 0.20 × 5 | 0.17 × 6, blocked cells exactly 0 (drawn as the blocked band). The cells are rounded to 2 decimals one by one, so a row can read 0.99 (0.33 × 3) or 1.02 (0.17 × 6); every row sums to exactly 1.`),
  calculation('What-if', 'Mask off',
    `NanoGPT has no switch for the mask. With the toggle off the card shows what full attention would read: every cell of ① becomes 1 (choose), no score is blanked, and softmax spreads every row over all ${T} positions, 0.17 each - including the highlighted target.`),
  tinyShakespeare(`“${CHARS.join('')}” and the space after it open the tokenizer card's sentence, taken from this file.`),
];

export const evidence = {
  card: 'c11-causal-mask',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'CausalSelfAttention masks its T × T scores with one fixed lower triangle: the manual path stores torch.tril(torch.ones(block_size, block_size)), cuts it to T × T and turns every 0 into a score of −∞ before softmax (model.py:46-50, 67-69); the default flash path passes is_causal=True for the same triangle (model.py:62-64). Row i keeps columns 0..i, so position i never reads character i + 1, the one it is trained to predict (train.py:123-125).',
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: `source: model.py:44-45, :46-50, :62-64, :67-69, :70, :99, :130, :173, :184-187; train.py:123-125; config/train_shakespeare_char.py:19 - checked against the pinned files. Source value: characters ${fmt(TOKENS)} from fx.tokenizer, block_size ${A.block_size} from fx.architecture. Calculated toy example: every score 0. Live calculation: choose (the table), causal_mask and softmax (the weights). What-if: mask off. Doc: PyTorch scaled_dot_product_attention (is_causal).`,
  control: 'mask - bool "Causal mask (off = What-if)", default on (NanoGPT\'s state); the only control, in INTERACT.',
  consequence: `On: ① holds the lower triangle of 1s (shaded) and 0s above it (pale); the highlighted (framed) cells (0,1) (1,2) (2,3) (3,4) (4,5) - each row's next character - are each row's first 0; ② reads 1.00 | 0.50 ×2 | 0.33 ×3 | 0.25 ×4 | 0.20 ×5 | 0.17 ×6 with the blocked triangle drawn as the blocked band. Off (What-if): every 0 in ① becomes 1, the highlighted targets included; ② fills the triangle, every row 0.17 × ${T}; row 5 is the same in both states. The two table labels and both captions switch; the status line, legend, equal-scores note, footer and rounding note hold in both.`,
  interactionPurpose: 'See that the mask is the only thing between each position and the character it must predict: with it the cut falls exactly at every row\'s target, without it every row could read its own answer.',
  task: `Toggle the mask off and on, and follow the highlighted cells. Practice (mask locked on): which positions may the query at position ${Q} of a T = ${BS} window read? (choice; expected "0 to ${Q}" - a row the card does not draw, so it needs the rule, not the picture)`,
  capability: 'one bool input feeding choose (a whole matrix and four captions) and causal_mask; softmax over a masked row keeps blocked cells null (drawn as the blocked band); an integer-format input grid and a derived grid, both with fixed [0, 1] heat and row and column labels; on the input grid a static list cellHighlight of kind highlight, each cell framed by four lines; a replay of grid, arrow, grid; a choice practice with fixedInputs, graded by choice_equals.',
};
