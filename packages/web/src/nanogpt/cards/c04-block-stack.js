// c04 - NanoGPT's stack of n_layer Blocks (model.py @3adf61e:
// h = nn.ModuleList([Block(config) for _ in range(config.n_layer)]), run in
// order by "for block in self.transformer.h: x = block(x)", then ln_f). One
// control, an n_layer slider over 1..12: the chain builds exactly that many
// Blocks (unbuilt ones are hidden) and haloes the newest, h[n_layer - 1]; its
// six parameter tensors are listed under their real names (the index changes,
// the shapes never do); a toy weight table compares it with the previous
// block (same shape, different numbers); and the count n_layer × one block
// steps up by the same amount each time (a live step line), drawn as a
// running total, one bar per block. The practice asks for a depth the slider
// cannot show (24).
//
// Sub-cards (owner rule 2026-09-28: one idea, at most one visual per frame):
// Part 1/3 the chain, 2/3 the tensors and the toy table (one block's count),
// 3/3 the count and its bars (that count × n_layer). The one n_layer slider
// drives all three; the status line is shared.
//
// Numbers: n_layer = 6 and C = 384 are source values (fx.architecture, the
// shakespeare_char config); n_layer = 12 is NanoGPT's default depth
// (fx.config.defaults); every other depth is a what-if at the same C. Shapes
// and every count are derive-op calculations. The toy weight table is typed in
// here: stand-in numbers, not trained or initialised weights.
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { groupDigits } from '../../scene-format.js';
import { calculation, code } from '../sources.js';

const A = fx.architecture;
const L = A.n_layer;
const L_DEFAULT = fx.config.defaults.n_layer;
const MAX = 12; // slider range 1..12; NanoGPT's default depth is its top
const CONCEPT = 'transformer-stack';
const COUNTS = Array.from({ length: MAX }, (unused, i) => i + 1);
const BLOCKS = COUNTS.map(n => n - 1);
const PER_BLOCK = 12 * A.n_embd ** 2 + 2 * A.n_embd; // the practice's numbers and the millions label

// Chain: two rows of six, read like wrapped text. x, h[0] .. h[5] on the
// first; h[6] .. h[11] on the second; ln_f follows the newest block.
const ROW_Y = [92, 180], CHAIN_H = 52, PER_ROW = 6;
const BLOCK_X0 = 110, BLOCK_W = 80, PITCH = 102;
const blockX = k => BLOCK_X0 + (k % PER_ROW) * PITCH;
const blockY = k => ROW_Y[Math.floor(k / PER_ROW)];
const mid = k => blockY(k) + CHAIN_H / 2;
const SLOT = 0.08; // replay: one slot per chain item

// Every part is laid out from the top of the same frame (question 34, the
// shared status 58).
export const PARTS = ['Blocks run in order', 'What each Block owns', 'The parameter count'];
const onPart = (part, objects) => objects.map(object => ({ ...object, part }));
// Part 1/3 - the two notes sit under the last built row: row 1 up to n_layer = 6.
const NOTES_Y = [180, 272];
// Part 2/3 - tensor list on the left, toy table on the right.
const LIST_Y = 120, LIST_PITCH = 24, SHAPE_X = 330;
const GRID_X = 640, GRID_Y = 120, CELL = 48, TOY_COLS = 5;
// Part 3/3 - bars: one per depth, height = that stack's block parameters (millions).
const COUNT_Y = 96, BARS_X = 40, BARS_Y = 146, BAR_CELL = 34, BARS_H = 140, BAR_NOTE_Y = 184;

// Calculated toy example: 5 stand-in entries of attn.c_attn.weight per block.
// Every row differs from every other in every column (the test checks it).
// Not from a model.
export const TOY = [
  [0.12, -0.45, 0.33, 0.08, -0.21],
  [-0.3, 0.17, 0.05, -0.62, 0.41],
  [0.54, 0.02, -0.19, 0.27, -0.08],
  [-0.07, -0.38, 0.46, 0.11, 0.29],
  [0.25, 0.6, -0.14, -0.33, 0.03],
  [-0.49, 0.09, 0.22, 0.36, -0.57],
  [0.31, -0.26, -0.52, 0.19, 0.14],
  [-0.18, 0.44, 0.07, -0.09, -0.36],
  [0.06, -0.13, 0.38, -0.47, 0.22],
  [-0.41, 0.28, -0.06, 0.52, -0.15],
  [0.47, -0.04, 0.16, -0.24, 0.35],
  [-0.23, 0.35, -0.31, 0.04, -0.44],
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

// The status follows the depth: only 6 is a source value.
const status = n => (n === L
  ? `Source value: n_layer = ${L}, C = n_embd = ${A.n_embd} (shakespeare_char) · counts: Live calculation · other depths: What-if`
  : n === L_DEFAULT
    ? `What-if: n_layer = ${L_DEFAULT}, NanoGPT’s default depth (its default C is 768), here at C = ${A.n_embd} · counts: Live calculation`
    : `What-if: n_layer = ${n} at shakespeare_char’s C = ${A.n_embd} (shakespeare_char’s n_layer is ${L}) · counts: Live calculation`);

// Where the chain ends at each depth: ln_f one column after the newest block.
const chainEnd = n => {
  const k = n - 1, col = (k % PER_ROW) + 1, y = mid(k);
  const x = BLOCK_X0 + col * PITCH;
  return {
    lnf: { x, y: blockY(k) },
    inFrom: { x: blockX(k) + BLOCK_W + 2, y }, inTo: { x: x - 4, y },
    headFrom: { x: x + BLOCK_W + 2, y }, headTo: { x: x + BLOCK_W + 26, y },
    head: { x: x + BLOCK_W + 40, y: y + 5 },
    notes: [0, 24].map(dy => NOTES_Y[Math.floor(k / PER_ROW)] + dy),
    ats: [0, 1, 2, 3].map(i => SLOT * (2 * n + 1 + i)),
  };
};

// The arrow into block k + 1: along the row, or wrapping from h[5] to h[6]
// (its head stops above h[6]'s halo, which reaches 8 above the box).
const link = k => ((k + 1) % PER_ROW
  ? { from: { x: blockX(k) + BLOCK_W + 2, y: mid(k) }, to: { x: blockX(k + 1) - 4, y: mid(k) } }
  : { from: { x: blockX(k) + BLOCK_W / 2, y: blockY(k) + CHAIN_H + 2 }, to: { x: blockX(k + 1) + BLOCK_W / 2, y: blockY(k + 1) - 10 } });

// The toy table at each depth: the previous block and the newest one, or
// h[0] alone at n_layer = 1 (there is no earlier block to show).
const toyAt = n => (n === 1
  ? { rows: 1, values: TOY[0], labels: ['h[0]'], ring: 0, legendY: GRID_Y + CELL + 26 }
  : { rows: 2, values: [...TOY[n - 2], ...TOY[n - 1]], labels: [`h[${n - 2}]`, `h[${n - 1}]`], ring: 1, legendY: GRID_Y + 2 * CELL + 26 });
const toyNote = n => `Calculated toy example (not trained or initialised): ${n === 1
  ? 'at n_layer = 1 only h[0] is built, nothing to compare.'
  : `h[${n - 2}] and h[${n - 1}]: same shape, different numbers.`}`;

const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const box = (id, label, x, y, extra = {}) => ({ id, type: 'box', semanticId: id, conceptId: CONCEPT,
  initialState: { label, x, y, w: BLOCK_W, h: CHAIN_H, opacity: 0, ...extra } });
const arrow = (id, from, to) => ({ id, type: 'arrow', semanticId: id, conceptId: CONCEPT,
  initialState: { from, to, role: 'neutral', opacity: 0 } });

export const scene = {
  id: 'nanogpt-c04-block-stack',
  title: 'A stack of n_layer blocks: same architecture, separate parameters',
  width: 960,
  height: 380,
  duration: 3,
  inputs: [
    { name: 'part', type: 'index', label: 'Part', of: 'parts', default: 0, presentation: 'pager' },
    { name: 'layers', type: 'index', label: 'n_layer (number of Blocks)', of: 'counts', default: L - 1, presentation: 'slider' },
  ],
  exampleData: {
    parts: PARTS,
    counts: COUNTS,
    prevCounts: COUNTS.map(n => n - 1),
    C: A.n_embd, maxDepth: MAX, on: true,
    blockWords: COUNTS.map(n => (n === 1 ? '1 block' : `${n} blocks`)),
    // Text markers print a number as written (17.7), so the two-decimal
    // millions label is a string per depth; the test checks it against the
    // derived count.
    millions: COUNTS.map(n => (n * PER_BLOCK / 1e6).toFixed(2)),
    statuses: COUNTS.map(status),
    toyNotes: COUNTS.map(toyNote),
    toys: COUNTS.map(toyAt),
    ends: COUNTS.map(chainEnd),
    // Every row is the depths 1..12; scaled by one block's count and masked
    // past row i, row i is the bars at n_layer = i + 1 (blank = not built).
    depthGrid: COUNTS.map(() => COUNTS),
    // Replay: a block (and the arrow into it) appears only once built; the
    // newest gets the halo.
    ...Object.fromEntries(BLOCKS.map(k => [`built${k}s`, COUNTS.map(n => (k < n ? 'appear' : 'pause'))])),
    ...Object.fromEntries(BLOCKS.slice(0, -1).map(k => [`linked${k}s`, COUNTS.map(n => (k + 1 < n ? 'appear' : 'pause'))])),
    ...Object.fromEntries(BLOCKS.map(k => [`halo${k}s`, COUNTS.map(n => (k === n - 1 ? 'highlight' : 'pause'))])),
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
    // The stack at the slider's depth: n_layer × one block.
    n: { op: 'pick', args: ['counts', 'layers'] },
    stack: { op: 'scale', args: ['perBlockV', 'n'] },
    stackMillions: { op: 'pick', args: ['millions', 'layers'] },
    // The step from n_layer - 1 to n_layer: the same at every depth.
    prev: { op: 'pick', args: ['prevCounts', 'layers'] },
    prevStack: { op: 'scale', args: ['perBlockV', 'prev'] },
    step: { op: 'sub', args: ['stack', 'prevStack'] },
    // Bars: the running total through h[k - 1] in millions, blank past
    // n_layer, on an axis pinned to the deepest stack so a bar never rescales.
    perBlockM: { op: 'scale', args: ['perBlockV', 1e-6] },
    barGrid: { op: 'scale', args: ['depthGrid', 'perBlockM.0'] },
    barTable: { op: 'causal_mask', args: ['barGrid', 'on'] },
    barVals: { op: 'pick', args: ['barTable', 'layers'] },
    deepest: { op: 'scale', args: ['perBlockV', 'maxDepth'] },
    barPeak: { op: 'scale', args: ['deepest', 1e-6] },
    blockWord: { op: 'pick', args: ['blockWords', 'layers'] },
    status: { op: 'pick', args: ['statuses', 'layers'] },
    toyNote: { op: 'pick', args: ['toyNotes', 'layers'] },
    toy: { op: 'pick', args: ['toys', 'layers'] },
    end: { op: 'pick', args: ['ends', 'layers'] },
    ...Object.fromEntries(BLOCKS.map(k => [`built${k}`, { op: 'pick', args: [`built${k}s`, 'layers'] }])),
    ...Object.fromEntries(BLOCKS.slice(0, -1).map(k => [`linked${k}`, { op: 'pick', args: [`linked${k}s`, 'layers'] }])),
    ...Object.fromEntries(BLOCKS.map(k => [`halo${k}`, { op: 'pick', args: [`halo${k}s`, 'layers'] }])),
  },
  objects: [
    // Each part's question first, then the shared status, so every part reads
    // question, status, content in document order.
    ...onPart(0, [text('question', 'n_layer Blocks run in order - what does each Block read?', 40, 34)]),
    ...onPart(1, [text('question-owns', 'What do the Blocks share, and what does each Block own?', 40, 34)]),
    ...onPart(2, [text('question-count', 'Add one Block - how much does the parameter count grow?', 40, 34)]),
    note('status', '{{status}}', 40, 58), // every part

    // Part 1/3 - the stack, in the order forward() runs it: only built blocks show.
    ...onPart(0, [
      { id: 'x-in', type: 'box', semanticId: 'stack-input', conceptId: CONCEPT,
        initialState: { label: 'x', x: 40, y: ROW_Y[0], w: 48, h: CHAIN_H, role: 'input', opacity: 0 } },
      arrow('a-x', { x: 90, y: mid(0) }, { x: BLOCK_X0 - 4, y: mid(0) }),
      ...BLOCKS.flatMap(k => [
        box(`block-${k}`, `h[${k}]`, blockX(k), blockY(k)),
        ...(k < MAX - 1 ? [arrow(`a-${k}`, link(k).from, link(k).to)] : []),
      ]),
      arrow('a-lnf', { $derive: 'end.inFrom' }, { $derive: 'end.inTo' }),
      box('ln-f', 'ln_f', { $derive: 'end.lnf.x' }, { $derive: 'end.lnf.y' }),
      arrow('a-head', { $derive: 'end.headFrom' }, { $derive: 'end.headTo' }),
      note('to-head', 'lm_head', { $derive: 'end.head.x' }, { $derive: 'end.head.y' }, { opacity: 0 }),
      note('newest', 'The halo marks the newest block, h[{{layers}}].', 40, { $derive: 'end.notes.0' }),
      note('takeaway', 'n_layer Blocks from one recipe, held in an nn.ModuleList; h[0] reads x, each later Block the previous one’s output.', 40, { $derive: 'end.notes.1' }),
    ]),

    // Part 2/3 - the newest block's parameter tensors (the index changes, the
    // shapes never do) and the same tensor's numbers in the previous block.
    ...onPart(1, [
      text('tensors-head', 'Parameter tensors of h[{{layers}}], the newest block', 40, 94, { role: 'output' }),
      ...TENSORS.flatMap(([name, shape], j) => [
        note(`tensor-${j}`, `transformer.h.{{layers}}.${name}`, 40, LIST_Y + j * LIST_PITCH, { role: 'output' }),
        note(`shape-${j}`, shape, SHAPE_X, LIST_Y + j * LIST_PITCH),
      ]),
      text('per-block', 'One block: {{perBlock}} parameters = 12C² + 2C at C = {{C}}', 40, 268),
      note('per-block-2', 'bias = False, so weights only; every block has these six shapes', 40, 290),
      { id: 'toy-grid', type: 'grid', semanticId: 'toy-weights', conceptId: CONCEPT,
        initialState: { label: 'attn.c_attn.weight, 5 entries (toy)', x: GRID_X, y: GRID_Y, rows: { $derive: 'toy.rows' }, cols: TOY_COLS, cell: CELL,
          values: { $derive: 'toy.values' }, rowLabels: { $derive: 'toy.labels' }, matrixKind: 'input',
          heat: { mode: 'signed' }, valueScale: 'local', cellHighlight: { row: { $derive: 'toy.ring' } }, cellHighlightKind: 'select' } },
      note('scale', 'orange +, blue −; ring: the newest block', GRID_X, { $derive: 'toy.legendY' }),
      note('toy-note', '{{toyNote}}', 40, 326),
      note('takeaway-2', 'No weight is shared between Blocks. NanoGPT’s one tied weight, wte = lm_head, sits outside the stack.', 40, 350),
    ]),

    // Part 3/3 - the count (one block's worth × n_layer), its step, and the
    // running total as bars.
    ...onPart(2, [
      text('count', 'n_layer = {{n}}: {{blockWord}} × {{perBlock}} = {{stack.0}} block parameters ({{stackMillions}}M)', 40, COUNT_Y, { role: 'output' }),
      { id: 'bars', type: 'bars', semanticId: 'stack-counts', conceptId: CONCEPT,
        initialState: { label: 'Running total: bar k = h[0] … h[k−1] together', x: BARS_X, y: BARS_Y, w: MAX * BAR_CELL, h: BARS_H, cell: BAR_CELL,
          values: { $derive: 'barVals' }, peak: { $derive: 'barPeak.0' }, labels: COUNTS.map(String), role: 'output',
          cellHighlight: { $derive: 'layers' }, cellHighlightKind: 'select' } },
      note('bars-1', 'Bar k is k blocks together, not the size of block k.', 480, BAR_NOTE_Y),
      note('bars-2', 'Blank past n_layer: those blocks are not built.', 480, BAR_NOTE_Y + 22),
      note('bars-3', 'n_layer {{prev}} → {{n}} adds {{step.0}} parameters.', 480, BAR_NOTE_Y + 44, { role: 'output' }),
      note('bars-4', 'Dark bar: the total through the newest block, h[{{layers}}].', 480, BAR_NOTE_Y + 66),
    ]),
  ],
  timeline: [
    // Replay: x runs through the built blocks in order, then ln_f; then the halo.
    { at: 0, action: 'appear', target: 'x-in', duration: 0.2 },
    { at: SLOT, action: 'appear', target: 'a-x', duration: 0.2 },
    ...BLOCKS.flatMap(k => [
      { at: SLOT * (2 + 2 * k), action: { $derive: `built${k}` }, target: `block-${k}`, duration: 0.2 },
      ...(k < MAX - 1 ? [{ at: SLOT * (3 + 2 * k), action: { $derive: `linked${k}` }, target: `a-${k}`, duration: 0.2 }] : []),
    ]),
    ...['a-lnf', 'ln-f', 'a-head', 'to-head'].map((target, i) => ({ at: { $derive: `end.ats.${i}` }, action: 'appear', target, duration: 0.2 })),
    ...BLOCKS.map(k => ({ at: 2.6, action: { $derive: `halo${k}` }, target: `block-${k}`, duration: 0.3 })),
  ],
};

// n_layer = 1, 6 (source) and 12 (default) on every part; 2 (the first
// block-to-block arrow; the first previous-vs-newest pair) on the chain and the
// toy table; 7 (first of the second row) on the chain.
export const reviewStates = [
  ...[0, 1, L - 1, L, MAX - 1].map(layers => ({ part: 0, layers })),
  ...[0, 1, L - 1, MAX - 1].map(layers => ({ part: 1, layers })),
  ...[0, L - 1, MAX - 1].map(layers => ({ part: 2, layers })),
];

// Practice (commit before you see): a depth past the slider's 12.
const DEEP = 24;
const TRIANGLE = (DEEP * (DEEP + 1)) / 2; // 1 + 2 + … + 24
export const activity = {
  id: 'c04-practice',
  check: 'choice_equals',
  version: 3,
  prompt: `A ${DEEP}-layer stack at the same C = ${A.n_embd}, past the slider's ${MAX}: how many parameters do its Blocks hold?`,
  // ponytail: SceneActivity shows no pick for an untouched answer, so this
  // naive default never renders; it only satisfies the declaration.
  // Bare numbers: the reasoning lives in the feedback, not the options.
  answer: { type: 'choice', label: 'Your answer', default: 'shared', options: [
    { id: 'shared', label: groupDigits(PER_BLOCK) },
    { id: 'linear', label: groupDigits(DEEP * PER_BLOCK) },
    { id: 'bigger', label: groupDigits(TRIANGLE * PER_BLOCK) },
  ] },
  expected: 'linear',
  checkLabel: 'Check',
  feedbackPass: `Right: ${DEEP} × ${groupDigits(PER_BLOCK)} = ${groupDigits(DEEP * PER_BLOCK)} (${(DEEP * PER_BLOCK / 1e6).toFixed(2)}M). NanoGPT builds ${DEEP} Blocks from one recipe, each with its own six tensors, and at the same C every Block has the same shapes - so the count grows by exactly one block's worth per layer, the same step the card shows at every depth from 1 to ${MAX}. Shared weights would keep it at ${groupDigits(PER_BLOCK)}; if deeper Blocks were bigger, the steps would grow (1 + 2 + … + ${DEEP} = ${TRIANGLE} blocks' worth, ${groupDigits(TRIANGLE * PER_BLOCK)}).`,
  feedbackFail: `Not quite. ${groupDigits(PER_BLOCK)} is one block: the count would stay there only if the Blocks shared weights, but each Block owns its own. ${groupDigits(TRIANGLE * PER_BLOCK)} is 1 + 2 + … + ${DEEP} = ${TRIANGLE} blocks' worth, as if deeper Blocks were bigger, but at the same C every Block has the same six shapes. So the count grows by one block's worth per layer: ${DEEP} × ${groupDigits(PER_BLOCK)} = ${groupDigits(DEEP * PER_BLOCK)}.`,
};

// Phase 1 plan (docs/nanogpt-deep-dive-board-plan.md §10, verbatim where it fits).
export const plan = {
  concept: 'the stack of blocks',
  objective: 'After this card, the learner should understand that NanoGPT applies n_layer Blocks in order, each with the same structure but its own learned weights.',
  prerequisites: ['c02 (one Block\'s recipe)'],
  causalSteps: ['x', 'Block 1', 'Block 2', '…', 'Block n_layer', 'ln_f'],
  // Owner decision 2026-09-28: the fixed what-if line became this slider; it
  // also replaces the block picker (the newest block is the inspected one).
  // Owner rule 2026-09-28: paged into three sub-cards, one visual each; the
  // one slider drives all three.
  primaryInteraction: 'slide n_layer from 1 to 12 (source value 6 for shakespeare_char; 12 is NanoGPT\'s default, a what-if at the same C, as is every other depth), one slider shared by three sub-cards: on Part 1/3 the chain builds that many Blocks and haloes the newest; on 2/3 the newest block\'s parameter tensors are listed as transformer.h.<n_layer - 1>.* with unchanged shapes, and the toy table compares it with the previous block (same shape, different values); on 3/3 the count n_layer × one block rises by the same live step (n_layer - 1 → n_layer adds one block\'s worth) at every depth, and the running-total bars fill to n_layer',
  check: 'practice (commit before you see): how many parameters do the Blocks of a 24-layer stack hold at the same C? 24 is past the slider and the options are bare numbers, so the answer needs the rule (separate weights per block: one block\'s worth per layer), not a reading of the card',
  boundary: {
    decision: 'single',
    reason: 'one mental model (repeat the same recipe with separate weights). Paged into three sub-cards, one visual each: Part 1/3 the chain, Part 2/3 the tensors and toy table (one block\'s count), Part 3/3 the count and bars (that count × n_layer)',
    sequence: { name: 'The block and the stack', position: 2, of: 2, relationships: [{ type: 'deepens', card: 'c02-block-anatomy', direction: 'in' }] },
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
  code('model.py', 162, 166, 'Every Linear weight first gets its own random draw: "torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)", so no two blocks start equal; training then updates each on its own.'),
  code('model.py', 141, 145, 'The draw is applied to every module by "self.apply(self._init_weights)"; then each block\'s two c_proj weights (attn.c_proj, mlp.c_proj) are redrawn: "if pn.endswith(\'c_proj.weight\'):", "torch.nn.init.normal_(p, mean=0.0, std=0.02/math.sqrt(2 * config.n_layer))" - a start scale that shrinks as n_layer grows.'),
  code('model.py', 138, 138, 'The one shared weight in NanoGPT sits outside the blocks: "self.transformer.wte.weight = self.lm_head.weight".'),
  code('config/train_shakespeare_char.py', 22, 24, 'The shakespeare_char sizes: "n_layer = 6" and "n_embd = 384".'),
  code('model.py', 112, 114, `GPTConfig's defaults, the top of the slider: "n_layer: int = ${L_DEFAULT}", paired there with "n_embd: int = 768".`),
  code('train.py', 52, 54, `train.py's defaults agree: "n_layer = ${L_DEFAULT}", paired there with "n_embd = 768".`),
  calculation('Source value', 'n_layer = 6 and C = 384', "generate_fixtures.py resolved config/train_shakespeare_char.py over train.py's defaults (n_layer = 6, n_embd = 384); the slider starts at n_layer = 6."),
  calculation('Live calculation', 'Tensor shapes and parameter counts',
    'Computed on the card by derive ops from C: 3C and 4C for the shapes; C, 3C², C², C, 4C², 4C² values per tensor; their sum per block (12C² + 2C); that sum times n_layer for the count, minus the count at n_layer - 1 for the step, and times every k from 1 to 12 for the running-total bars (blank past n_layer). The millions label is the same count to two decimals.'),
  { kind: 'calculation', status: 'Calculated toy example', title: 'The toy weight table',
    note: `Typed into this card: ${fmt(TOY)} - five stand-in entries per block (h[0] to h[11]) for the same tensor, attn.c_attn.weight; the table shows the previous and the newest block. Not trained or initialised weights (those start as independent random draws of std 0.02); chosen so every block's row differs from every other in every entry.` },
  calculation('What-if', `n_layer = 1 to ${MAX} except ${L}, at C = ${A.n_embd}`, `NanoGPT's default n_layer is ${L_DEFAULT} (GPTConfig and train.py, with n_embd = 768); the shakespeare_char config uses ${L} at C = ${A.n_embd}. Every other slider depth is what model.py would build at C = ${A.n_embd} with that many blocks: the same per-block size, repeated.`),
];

export const evidence = {
  card: 'c04-block-stack',
  title: scene.title,
  // The whole card's question; each sub-card asks its own part of it on the surface.
  learningQuestion: 'n_layer Blocks run in order - what do they share, and what does each Block own?',
  concept: 'GPT.__init__ builds transformer.h as nn.ModuleList([Block(config) for _ in range(n_layer)]) (model.py:130): n_layer Blocks from one recipe, each an independent module with its own six tensors (ln_1.weight, attn.c_attn.weight, attn.c_proj.weight, ln_2.weight, mlp.c_fc.weight, mlp.c_proj.weight; bias = False). forward() runs them in order (model.py:180-182), then ln_f. Parameters grow linearly with depth: 12C² + 2C per block.',
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: 'source: model.py:130, :180-182, :96-101, :35-37, :82-84, :21-24, :162-166, :141-145, :138, :112-114; train.py:52-54, :56; config/train_shakespeare_char.py:22-24. Source value: n_layer = 6, C = 384 (fx.architecture). Live calculation: shapes 3C, 4C and counts via concat/elementwise/scale/sum; count = per block × n_layer; step = count - per block × (n_layer - 1) via sub; running-total bars = per block × 1..12 through causal_mask. Calculated toy example: the 12 × 5 weight table typed into the card. What-if: every depth but 6 at C = 384, 12 being NanoGPT\'s default (fx.config.defaults).',
  control: 'layers (index slider, "n_layer (number of Blocks)") over n_layer = 1 .. 12; default 6. The header pager (part, "Part · k/3") pages the sub-cards and is not in INTERACT.',
  consequence: 'Three sub-cards ("Part · 1/3" .. "3/3": Blocks run in order, What each Block owns, The parameter count) share the slider and the status line, which reads Source value at 6 and What-if elsewhere (12: NanoGPT\'s default). Part 1/3: the chain shows x, h[0] .. h[n_layer - 1] (two rows of six), ln_f and lm_head, with the newest block haloed. Part 2/3: the tensor list renames to transformer.h.<n_layer - 1>.* with unchanged shapes ((384,), (1152, 384), (384, 384), (384,), (1536, 384), (384, 1536)); the toy table shows the previous and the newest block (h[0] alone at 1). Part 3/3: the count reads n_layer × 1,770,240: 1,770,240 (1.77M) at 1, 10,621,440 (10.62M) at 6, 17,702,400 (17.70M) at 10, 21,242,880 (21.24M) at 12; the step line reads "n_layer n - 1 → n adds 1,770,240 parameters." at every depth; the running-total bars (bar k = h[0] .. h[k - 1]) fill to n_layer, the current one marked. A depth set on one part is already applied on the others.',
  interactionPurpose: 'Change the depth and watch what does not change (the recipe: tensor names after the index and every shape) and what does (another block with its own numbers, and the same step in the count every time) - depth adds blocks, not bigger ones.',
  task: `Practice: how many parameters do the Blocks of a ${DEEP}-layer stack hold at the same C? (choice; expected "linear", ${DEEP} × 1,770,240 = 42,485,760 - a depth past the slider, so it needs the rule, not the picture)`,
  capability: 'a "Part" pager over three sub-cards (one frame sized for the tallest, so paging never rescales); index slider shared by every part; pick-derived timeline actions (appear vs pause) so only built blocks show, and a pick-derived halo; pick-derived positions and replay time for ln_f and its arrows, and pick-derived rows for the chain\'s two notes (under row 1 up to n_layer = 6); {{layers}} interpolation in parameter names; live concat/elementwise/scale/sum counts, a sub-derived step and a picked two-decimal millions label; bars from causal_mask over every depth\'s count (blank past n_layer) on a pinned peak, with a derived mark; an input grid whose rows, values and row labels are picked per depth, signed local heat and a derived row ring; choice practice graded by choice_equals.',
};
