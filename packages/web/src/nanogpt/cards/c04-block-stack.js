// c04 - NanoGPT's stack of n_layer Blocks (model.py @3adf61e:
// h = nn.ModuleList([Block(config) for _ in range(config.n_layer)]), run in
// order by "for block in self.transformer.h: x = block(x)", then ln_f). One
// control picks a block: the chain lights every block up to it and haloes it,
// its six parameter tensors are listed under their real names (the block
// index changes, the shapes never do), its row of a toy weight table gets the
// selection ring (the numbers differ from every other row), and the running
// parameter count through that block grows by the same per-block amount each
// step. The practice asks whether two blocks share weights.
//
// Numbers: n_layer = 6 and C = 384 are source values (fx.architecture, the
// shakespeare_char config); n_layer = 12 is NanoGPT's default depth
// (fx.config.defaults), used only as a what-if at the same C. Shapes and every
// count are derive-op calculations. The toy weight table is typed in here:
// stand-in numbers, not trained or initialised weights.
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { calculation, code } from '../sources.js';

const A = fx.architecture;
const L = A.n_layer;
const L_DEFAULT = fx.config.defaults.n_layer;
const CONCEPT = 'transformer-stack';
const BLOCKS = Array.from({ length: L }, (unused, k) => k);

// Chain row: x, h[0] .. h[L-1], ln_f.
const CHAIN_Y = 80, CHAIN_H = 44, CHAIN_MID = CHAIN_Y + CHAIN_H / 2;
const BLOCK_X0 = 110, BLOCK_W = 80, PITCH = 102;
const blockX = k => BLOCK_X0 + k * PITCH;
const LNF_X = blockX(L - 1) + BLOCK_W + 30;

// Parameter section: tensor list on the left, toy table on the right.
const LIST_Y = 262, LIST_PITCH = 24, SHAPE_X = 322;
const GRID_X = 600, GRID_Y = 244, CELL = 48, TOY_COLS = 5;

// Calculated toy example: 5 stand-in entries per block. Every row differs
// from every other in every column (the test checks it). Not from a model.
const TOY = [
  [0.12, -0.45, 0.33, 0.08, -0.21],
  [-0.3, 0.17, 0.05, -0.62, 0.41],
  [0.54, 0.02, -0.19, 0.27, -0.08],
  [-0.07, -0.38, 0.46, 0.11, 0.29],
  [0.25, 0.6, -0.14, -0.33, 0.03],
  [-0.49, 0.09, 0.22, 0.36, -0.57],
];

// The six tensors one Block owns (bias = False: weights only), in module
// order, with their shapes as text bound to live derive results.
const TENSORS = [
  ['ln_1.weight', '({{C}},): {{C}} values'],
  ['attn.c_attn.weight', '({{C3.0}}, {{C}}): {{nAttn.0}} values'],
  ['attn.c_proj.weight', '({{C}}, {{C}}): {{C2.0}} values'],
  ['ln_2.weight', '({{C}},): {{C}} values'],
  ['mlp.c_fc.weight', '({{C4.0}}, {{C}}): {{nFc.0}} values'],
  ['mlp.c_proj.weight', '({{C}}, {{C4.0}}): {{nFc.0}} values'],
];

const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const box = (id, label, x, extra = {}) => ({ id, type: 'box', semanticId: id, conceptId: CONCEPT,
  initialState: { label, x, y: CHAIN_Y, w: BLOCK_W, h: CHAIN_H, opacity: 0, ...extra } });
const arrow = (id, x0, x1) => ({ id, type: 'arrow', semanticId: id, conceptId: CONCEPT,
  initialState: { from: { x: x0, y: CHAIN_MID }, to: { x: x1, y: CHAIN_MID }, role: 'neutral', opacity: 0 } });

export const scene = {
  id: 'nanogpt-c04-block-stack',
  title: 'A stack of n_layer blocks: same architecture, separate parameters',
  width: 960,
  height: 600,
  duration: 3,
  inputs: [
    { name: 'block', type: 'index', label: 'Block to inspect', of: 'blocks', default: 0, presentation: 'picker' },
  ],
  exampleData: {
    blocks: BLOCKS.map(k => `h[${k}]`),
    L, C: A.n_embd, Ldefault: L_DEFAULT,
    blockCounts: BLOCKS.map(k => k + 1),
    litRanges: BLOCKS.map(k => (k === 0 ? 'h[0]' : `h[0] … h[${k}]`)),
    blockWords: BLOCKS.map(k => (k === 0 ? '1 block' : `${k + 1} blocks`)),
    toy: TOY.flat(),
    // Chain: every block up to the picked one is lit (x has passed through it
    // and it is in the running count); the picked one also gets the halo.
    ...Object.fromEntries(BLOCKS.map(k => [`chain${k}Roles`, BLOCKS.map(i => (k <= i ? 'output' : 'neutral'))])),
    ...Object.fromEntries(BLOCKS.map(k => [`chain${k}Steps`, BLOCKS.map(i => (k === i ? 'highlight' : 'pause'))])),
  },
  derived: {
    // Shapes and counts at the source C (bias = False).
    Cv: { op: 'concat', args: ['C'] },
    C2: { op: 'elementwise', args: ['Cv', 'Cv'] },
    C3: { op: 'scale', args: ['Cv', 3] },
    C4: { op: 'scale', args: ['Cv', 4] },
    nAttn: { op: 'scale', args: ['C2', 3] },
    nFc: { op: 'scale', args: ['C2', 4] },
    tensorCounts: { op: 'concat', args: ['Cv', 'nAttn', 'C2', 'Cv', 'nFc', 'nFc'] },
    perBlock: { op: 'sum', args: ['tensorCounts'] },
    perBlockV: { op: 'concat', args: ['perBlock'] },
    // Running count through the picked block, the whole stack, and the what-if depth.
    n: { op: 'pick', args: ['blockCounts', 'block'] },
    running: { op: 'scale', args: ['perBlockV', 'n'] },
    stack: { op: 'scale', args: ['perBlockV', 'L'] },
    whatIf: { op: 'scale', args: ['perBlockV', 'Ldefault'] },
    // Millions to two decimals: derive results round to 3 decimals, so round
    // a tenth of the count in millions, then multiply back by 10.
    runningTenthM: { op: 'scale', args: ['running', 1e-7] },
    runningM: { op: 'scale', args: ['runningTenthM', 10] },
    stackTenthM: { op: 'scale', args: ['stack', 1e-7] },
    stackM: { op: 'scale', args: ['stackTenthM', 10] },
    whatIfTenthM: { op: 'scale', args: ['whatIf', 1e-7] },
    whatIfM: { op: 'scale', args: ['whatIfTenthM', 10] },
    litRange: { op: 'pick', args: ['litRanges', 'block'] },
    blockWord: { op: 'pick', args: ['blockWords', 'block'] },
    ...Object.fromEntries(BLOCKS.map(k => [`chain${k}Role`, { op: 'pick', args: [`chain${k}Roles`, 'block'] }])),
    ...Object.fromEntries(BLOCKS.map(k => [`chain${k}Step`, { op: 'pick', args: [`chain${k}Steps`, 'block'] }])),
  },
  objects: [
    text('question', 'n_layer Blocks run in order - what do they share, and what does each Block own?', 40, 34),
    note('status', 'Source value: n_layer = {{L}}, C = n_embd = {{C}} (shakespeare_char) · shapes and counts: Live calculation', 40, 58),

    // The stack, in the order forward() runs it.
    { id: 'x-in', type: 'box', semanticId: 'stack-input', conceptId: CONCEPT,
      initialState: { label: 'x', x: 40, y: CHAIN_Y, w: 48, h: CHAIN_H, role: 'input', opacity: 0 } },
    arrow('a-x', 90, BLOCK_X0 - 4),
    ...BLOCKS.flatMap(k => [
      box(`block-${k}`, `h[${k}]`, blockX(k), { role: { $derive: `chain${k}Role` } }),
      ...(k < L - 1 ? [arrow(`a-${k}`, blockX(k) + BLOCK_W + 2, blockX(k + 1) - 4)] : []),
    ]),
    arrow('a-lnf', blockX(L - 1) + BLOCK_W + 2, LNF_X - 4),
    box('ln-f', 'ln_f', LNF_X),
    arrow('a-head', LNF_X + BLOCK_W + 2, LNF_X + BLOCK_W + 26),
    note('to-head', 'lm_head', LNF_X + BLOCK_W + 40, CHAIN_MID + 5, { opacity: 0 }),

    // Running count: grows by one block's parameters per block.
    text('running', 'Lit {{litRange}}: {{blockWord}} × {{perBlock}} = {{running.0}} parameters ({{runningM.0}}M)', 40, 158, { role: 'output' }),
    note('stack', 'The whole stack, n_layer = {{L}} blocks: {{stack.0}} parameters ({{stackM.0}}M).', 40, 184),
    note('what-if', 'What-if: NanoGPT’s default depth, n_layer = {{Ldefault}}, at the same C: {{whatIf.0}} ({{whatIfM.0}}M) - more blocks, not bigger ones.', 40, 206),

    // The picked block's parameter tensors: the index changes, the shapes never do.
    text('tensors-head', 'Parameter tensors of h[{{block}}]', 40, 238, { role: 'output' }),
    ...TENSORS.flatMap(([name, shape], j) => [
      note(`tensor-${j}`, `transformer.h.{{block}}.${name}`, 40, LIST_Y + j * LIST_PITCH, { role: 'output' }),
      note(`shape-${j}`, shape, SHAPE_X, LIST_Y + j * LIST_PITCH),
    ]),
    text('per-block', 'One block: {{perBlock}} parameters = 12C² + 2C at C = {{C}}', 40, LIST_Y + 6 * LIST_PITCH + 18),
    note('per-block-2', 'bias = False, so weights only; every block has these six shapes', 40, LIST_Y + 6 * LIST_PITCH + 40),

    // Different numbers: the same tensor in each block, a few toy entries each.
    { id: 'toy-grid', type: 'grid', semanticId: 'toy-weights', conceptId: CONCEPT,
      initialState: { label: 'attn.c_attn.weight, 5 entries (toy)', x: GRID_X, y: GRID_Y, rows: L, cols: TOY_COLS, cell: CELL,
        values: TOY.flat(), rowLabels: BLOCKS.map(k => `h[${k}]`), matrixKind: 'input',
        heat: { mode: 'signed' }, valueScale: 'local', cellHighlight: { row: { $derive: 'block' } }, cellHighlightKind: 'select' } },

    note('scale', 'Colour: orange = +, blue = −; ring = h[{{block}}]’s row', 40, LIST_Y + 6 * LIST_PITCH + 78),
    note('toy-note', 'Calculated toy example: stand-in numbers, not trained weights. Same shape in every block; the numbers differ.', 40, 562),
    note('takeaway', 'nn.ModuleList builds n_layer Blocks from one recipe; h[0] reads x, each later Block the previous one’s output.', 40, 586),
  ],
  timeline: [
    // Replay: x runs through the blocks in order, then ln_f; then the pick's halo.
    ...['x-in', 'a-x', ...BLOCKS.flatMap(k => [`block-${k}`, ...(k < L - 1 ? [`a-${k}`] : [])]), 'a-lnf', 'ln-f', 'a-head', 'to-head']
      .map((target, i) => ({ at: 0.12 * i, action: 'appear', target, duration: 0.2 })),
    ...BLOCKS.map(k => ({ at: 2.5, action: { $derive: `chain${k}Step` }, target: `block-${k}`, duration: 0.3 })),
  ],
};

export const reviewStates = [{ block: 0 }, { block: 1 }, { block: 4 }, { block: L - 1 }];

const H1 = 1, H4 = 4;
export const activity = {
  id: 'c04-practice',
  check: 'choice_equals',
  version: 1,
  prompt: `h[${H1}] and h[${H4}] hold tensors with the same names after the block index and exactly the same shapes. Do the two blocks share weights?`,
  // ponytail: SceneActivity shows no pick for an untouched answer, so this
  // naive default never renders; it only satisfies the declaration.
  answer: { type: 'choice', label: 'Your answer', default: 'shared', options: [
    { id: 'shared', label: 'Yes: same shapes, one set of weights' },
    { id: 'separate', label: 'No: same shapes, separate weights' },
    { id: 'attention', label: 'Only the attention weights are shared' },
  ] },
  expected: 'separate',
  checkLabel: 'Check',
  feedbackPass: `Right: NanoGPT builds n_layer separate Block objects, each with its own tensors. h[${H1}] and h[${H4}] match in every shape, but their rows in the toy table differ in every entry, and training updates each block's tensors on their own. The one weight NanoGPT does share sits outside the blocks: the token embedding wte is also lm_head.`,
  feedbackFail: `Not quite: matching shapes do not make one tensor. Pick h[${H1}], then h[${H4}]: the parameter names differ by the block index, and their rows in the toy table differ in every entry. NanoGPT builds n_layer separate Block objects, attention and MLP included, so each block learns its own weights. The only shared weight in NanoGPT is wte with lm_head, outside the blocks.`,
};

// Phase 1 plan (docs/nanogpt-deep-dive-board-plan.md §10, verbatim where it fits).
export const plan = {
  concept: 'the stack of blocks',
  objective: 'After this card, the learner should understand that NanoGPT applies n_layer Blocks in order, each with the same structure but its own learned weights.',
  prerequisites: ['c02 (one Block\'s recipe)'],
  causalSteps: ['x', 'Block 1', 'Block 2', '…', 'Block n_layer', 'ln_f'],
  // Deviation from §10 ("what-if other depths"): one control. The picker's
  // running count already shows the count growing one block at a time; the
  // what-if depth is a fixed line, not a second control.
  primaryInteraction: 'pick a block; its parameter tensors (same shapes as every other block\'s, different values) light, and the running parameter count grows by one block\'s worth per block (source value n_layer = 6 for shakespeare_char; the what-if n_layer = 12 at the same C is a fixed line, not a control)',
  check: 'practice: do two blocks share weights? (reasoning from the lit tensors: same shapes, different values)',
  boundary: {
    decision: 'single',
    reason: 'one mental model (repeat the same recipe with separate weights)',
    sequence: { name: 'The block and the stack', position: 2, of: 2, relationships: [{ type: 'deepens', card: 'c02-block-anatomy' }] },
  },
};

const fmt = rows => rows.map(row => `[${row.join(', ')}]`).join(', ');

export const sources = [
  code('model.py', 130, 130, 'The stack: "h = nn.ModuleList([Block(config) for _ in range(config.n_layer)])" - n_layer separate Block objects, each constructed with its own parameters.'),
  code('model.py', 180, 182, 'Run in order: "for block in self.transformer.h:", "x = block(x)", then "x = self.transformer.ln_f(x)".'),
  code('model.py', 96, 101, 'Every Block is built from the same recipe: "self.ln_1 = LayerNorm(config.n_embd, bias=config.bias)", "self.attn = CausalSelfAttention(config)", "self.ln_2 = LayerNorm(config.n_embd, bias=config.bias)" and "self.mlp = MLP(config)".'),
  code('model.py', 35, 37, 'Attention weights: "self.c_attn = nn.Linear(config.n_embd, 3 * config.n_embd, bias=config.bias)" (weight shape (3C, C)) and "self.c_proj = nn.Linear(config.n_embd, config.n_embd, bias=config.bias)" (C, C). nn.Linear stores its weight as (out, in).'),
  code('model.py', 82, 84, 'MLP weights: "self.c_fc    = nn.Linear(config.n_embd, 4 * config.n_embd, bias=config.bias)" (4C, C) and "self.c_proj  = nn.Linear(4 * config.n_embd, config.n_embd, bias=config.bias)" (C, 4C).'),
  code('model.py', 21, 24, 'Each LayerNorm has "self.weight = nn.Parameter(torch.ones(ndim))" (C numbers) and "self.bias = nn.Parameter(torch.zeros(ndim)) if bias else None".'),
  code('train.py', 56, 56, '"bias = False # do we use bias inside LayerNorm and Linear layers?" - so each block holds weights only.'),
  code('model.py', 162, 166, 'Every Linear weight gets its own random draw: "torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)", applied module by module, so no two blocks start equal; training then updates each on its own.'),
  code('model.py', 138, 138, 'The one shared weight in NanoGPT sits outside the blocks: "self.transformer.wte.weight = self.lm_head.weight".'),
  code('config/train_shakespeare_char.py', 22, 24, 'The shakespeare_char sizes: "n_layer = 6" and "n_embd = 384".'),
  code('train.py', 52, 54, `NanoGPT's default depth, used as the what-if: "n_layer = ${L_DEFAULT}", paired there with "n_embd = 768".`),
  calculation('Source value', 'n_layer = 6 and C = 384', "generate_fixtures.py resolved config/train_shakespeare_char.py over train.py's defaults (n_layer = 6, n_embd = 384); the chain draws one box per Block from n_layer."),
  calculation('Live calculation', 'Tensor shapes and parameter counts',
    'Computed on the card by derive ops from C: 3C and 4C for the shapes; C, 3C², C², C, 4C², 4C² values per tensor; their sum per block (12C² + 2C); that sum times the number of lit blocks, times n_layer and times the what-if depth; millions rounded to two decimals.'),
  { kind: 'calculation', status: 'Calculated toy example', title: 'The toy weight table',
    note: `Typed into this card: ${fmt(TOY)} - five stand-in entries per block for the same tensor, attn.c_attn.weight. Not trained or initialised weights (those start as independent random draws of std 0.02); chosen so every block's row differs from every other in every entry.` },
  calculation('What-if', `n_layer = ${L_DEFAULT} at C = ${A.n_embd}`, `NanoGPT's default n_layer is ${L_DEFAULT} (with n_embd = 768); the shakespeare_char config uses ${L} at C = ${A.n_embd}. The count is what model.py would build at C = ${A.n_embd} with ${L_DEFAULT} blocks: the same per-block size, repeated ${L_DEFAULT} times.`),
];

export const evidence = {
  card: 'c04-block-stack',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'GPT.__init__ builds transformer.h as nn.ModuleList([Block(config) for _ in range(n_layer)]) (model.py:130): n_layer Blocks from one recipe, each an independent module with its own six tensors (ln_1.weight, attn.c_attn.weight, attn.c_proj.weight, ln_2.weight, mlp.c_fc.weight, mlp.c_proj.weight; bias = False). forward() runs them in order (model.py:180-182), then ln_f. Parameters grow linearly with depth: 12C² + 2C per block.',
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: 'source: model.py:130, :180-182, :96-101, :35-37, :82-84, :21-24, :162-166, :138; train.py:52-54, :56; config/train_shakespeare_char.py:22-24. Source value: n_layer = 6, C = 384 (fx.architecture), n_layer = 12 (fx.config.defaults). Live calculation: shapes 3C, 4C and counts via concat/elementwise/scale/sum; running count = per block × (picked index + 1). Calculated toy example: the 6 × 5 weight table typed into the card. What-if: n_layer = 12 at C = 384.',
  control: 'block (index picker, "Block to inspect") over h[0] .. h[5]; default h[0].',
  consequence: 'The chain lights h[0] through the picked block and haloes the picked one; the tensor list renames to transformer.h.<i>.* with unchanged shapes ((384,), (1152, 384), (384, 384), (384,), (1536, 384), (384, 1536)); the selection ring moves to the picked row of the toy table, whose numbers differ from every other row; the running count reads (i + 1) × 1770240: 1770240 (1.77M), 3540480 (3.54M), ... 10621440 (10.62M) at h[5], the whole stack; the what-if line keeps n_layer = 12 at 21242880 (21.24M).',
  interactionPurpose: 'Compare blocks to see what is shared (the recipe: tensor names after the index and every shape) and what is not (the numbers), and watch the count grow by the same amount per block - depth adds blocks, not bigger ones.',
  task: `Practice: do h[${H1}] and h[${H4}] share weights? (choice; expected "separate" - reasoned from the lit tensors: same shapes, different values)`,
  capability: 'index picker; pick-derived chain roles (lit up to the pick) and pick-derived timeline actions (highlight vs pause) for the halo; {{block}} interpolation in parameter names; live concat/elementwise/scale/sum counts with two-step rounding to millions; an input grid with signed local heat, row labels and a derived row selection ring; choice practice graded by choice_equals.',
};
