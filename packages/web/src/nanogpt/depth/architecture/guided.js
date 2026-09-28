// Depth ladder - The Transformer, end to end - Guided.
// Where the Shakespeare model's parameters live, counted live from the sizes
// NanoGPT builds it with: the token embedding wte (V x C, shared with lm_head),
// the position embedding wpe (block_size x C), n_layer Blocks of 4C^2
// (attention: c_attn C x 3C + c_proj C x C) + 8C^2 (MLP: c_fc C x 4C + c_proj
// 4C x C) + 2C (two LayerNorm weights; bias = False, so no bias vectors), and
// ln_f (C). Two pickers change C and V; one fixed axis makes the growth
// visible - C doubles, every block grows x4 (C^2) while wte and wpe grow x2 (C);
// V goes from 65 characters to GPT-2's padded 50304, and only wte moves.
// The card also subtracts wpe from the total, which is the count
// get_num_params() returns, and shows it the way GPT.__init__ prints it at
// start-up (millions, two decimals). A gutter of the Overview's stage names
// (number lists, blocks, scores) marks which rows implement which stage, each
// with a short role: the embeddings, the blocks' share of all parameters
// (compared live, so it flips with V), and the token matrix reused as the
// output. The scores stage's lm_head has no row of its own: it is wte's matrix.
//
// Numbers: C = 384 and V = 65 are the shakespeare_char config generate_fixtures.py
// resolved (fx.architecture); C = 768 is train.py's own default (fx.config);
// V = 50304 is train.py's fallback when no meta.pkl exists, read from the
// fixture's model-vocab note (checked against the pinned model.py and train.py
// by the test). Every count on the card is computed by derive ops at the
// selected setting; nothing is typed.
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import { calculation, code, tinyShakespeare } from '../../sources.js';
import { groupDigits } from '../../../scene-format.js';

const A = fx.architecture;
const CONCEPT = 'transformer-parameters';
// train.py's fallback vocab_size (no meta.pkl) as the fixture recorded it.
const PADDED_VOCAB = Number(fx.tokenizer.modelVocabNote.match(/= (\d+)/)[1]);
const CS = [fx.config.shakespeareChar.n_embd, fx.config.defaults.n_embd];
const VS = [A.vocab_size, PADDED_VOCAB];

// One fixed axis for every setting, so a bar's length is comparable across
// settings: 0 .. 45M parameters over 500px (the largest bar, 6 blocks at
// C = 768, is 42.5M).
const BAR_X = 420, BAR_SPAN = 500, AXIS_MAX = 45e6;
const PX = BAR_SPAN / AXIS_MAX;
const NAME_X = 172;
const ROW = { wte: 118, wpe: 176, blocks: 246, lnf: 316, lmhead: 374 };
const BAR_H = 34;
const AXIS_Y = 430;
const TICKS = [0, 10e6, 20e6, 30e6, 40e6];
// The Overview's stages, as a gutter beside the rows that implement them:
// the stage name, then what those parameters are.
const GUTTER = [
  ['gutter-lists', 'number lists', ['token + position', 'embeddings'], ROW.wte, ROW.wpe + BAR_H],
  ['gutter-blocks', '{{L}} blocks', ['{{blocksShare}}', 'parameters'], ROW.blocks - 14, ROW.blocks + BAR_H + 14],
  ['gutter-scores', '{{V}} scores', ['token matrix,', 'reused (tied)'], ROW.lnf, ROW.lmhead + BAR_H],
];

const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const bar = (id, y, w, role, extra = {}) => ({ id, type: 'box', semanticId: id, conceptId: CONCEPT,
  initialState: { x: BAR_X, y, w: { $derive: w }, h: BAR_H, role, opacity: 0, ...extra } });
// The six blocks are one bar cut into equal parts: a box per block would be
// ~20px wide at C = 384, where the box's rounded corners turn it into a pill.
const dividers = Array.from({ length: A.n_layer - 1 }, (unused, i) => ({
  id: `block-divider-${i}`, type: 'line', semanticId: `block-divider-${i}`, conceptId: CONCEPT,
  initialState: { from: { x: { $derive: `divX.${i}` }, y: ROW.blocks }, to: { x: { $derive: `divX.${i}` }, y: ROW.blocks + BAR_H },
    role: 'prediction', opacity: 0 } }));
// Box labels are one centred line, so the three-line stack is text objects
// centred in the box.
const gutter = GUTTER.flatMap(([id, stage, [role0, role1], top, bottom]) => {
  const y = (top + bottom) / 2 - 13;
  return [
    { id, type: 'box', semanticId: id, conceptId: CONCEPT, initialState: { x: 40, y: top, w: 116, h: bottom - top, role: 'neutral' } },
    text(`${id}-stage`, stage, 50, y),
    note(`${id}-role-0`, role0, 50, y + 18),
    note(`${id}-role-1`, role1, 50, y + 34),
  ];
});
const ticks = TICKS.map((value, i) => note(`tick-${i}`, value ? `${value / 1e6}M` : '0',
  BAR_X + value * PX - (value ? 12 : 3), AXIS_Y + 20));

export const scene = {
  id: 'depth-architecture-guided',
  title: 'The Transformer, end to end · Guided: where the parameters live',
  width: 960,
  height: 686,
  duration: 3,
  inputs: [
    { name: 'width', type: 'index', label: 'n_embd, the width C', of: 'widths', default: 0, presentation: 'picker' },
    { name: 'vocab', type: 'index', label: 'vocab_size V', of: 'vocabs', default: 0, presentation: 'picker' },
  ],
  exampleData: {
    widths: [`${CS[0]} (shakespeare_char)`, `${CS[1]} (NanoGPT's default)`],
    vocabs: [`${VS[0]} characters`, `${groupDigits(VS[1])} GPT-2 tokens, padded`],
    Cs: CS, Vs: VS,
    L: A.n_layer, Tb: A.block_size,
    divIndex: Array.from({ length: A.n_layer - 1 }, (unused, i) => i + 1),
    divOrigin: Array.from({ length: A.n_layer - 1 }, () => BAR_X),
    // The status of the selected sizes: [width][vocab]; only 384 / 65 is shipped.
    sizeTags: [['Source value sizes', 'What-if sizes'], ['What-if sizes', 'What-if sizes']],
    blocksShares: ['most of the', 'under half the'],
  },
  derived: {
    C: { op: 'pick', args: ['Cs', 'width'] },
    V: { op: 'pick', args: ['Vs', 'vocab'] },
    Cv: { op: 'concat', args: ['C'] },
    Vv: { op: 'concat', args: ['V'] },
    // One Block (bias = False): attention 4C^2, MLP 8C^2, two LayerNorm weights 2C.
    C2: { op: 'elementwise', args: ['Cv', 'Cv'] },
    attn: { op: 'scale', args: ['C2', 4] },
    mlp: { op: 'scale', args: ['C2', 8] },
    ln2: { op: 'scale', args: ['Cv', 2] },
    blockParts: { op: 'concat', args: ['attn', 'mlp', 'ln2'] },
    block: { op: 'sum', args: ['blockParts'] },
    blockV: { op: 'concat', args: ['block'] },
    blocks: { op: 'scale', args: ['blockV', A.n_layer] },
    // Embeddings: wte is V x C (and is lm_head's weight), wpe is block_size x C.
    wte: { op: 'elementwise', args: ['Vv', 'Cv'] },
    wpe: { op: 'scale', args: ['Cv', A.block_size] },
    parts: { op: 'concat', args: ['wte', 'wpe', 'blocks', 'Cv'] },
    total: { op: 'sum', args: ['parts'] },
    // get_num_params(): the total minus wpe.
    negWpe: { op: 'scale', args: ['wpe', -1] },
    printedParts: { op: 'concat', args: ['total', 'negWpe'] },
    nonEmb: { op: 'sum', args: ['printedParts'] },
    nonEmbV: { op: 'concat', args: ['nonEmb'] },
    // The start-up print formats millions with two decimals ("%.2fM"). Derive
    // results are rounded to 3 decimals, so rounding a tenth of the count in
    // millions and multiplying back by 10 rounds it to 2.
    tenthM: { op: 'scale', args: ['nonEmbV', 1e-7] },
    printedM: { op: 'scale', args: ['tenthM', 10] },
    // The blocks' role: most of the parameters, or under half (argmin is 0
    // when everything else together is smaller than the blocks).
    totalV: { op: 'concat', args: ['total'] },
    rest: { op: 'sub', args: ['totalV', 'blocks'] },
    restVsBlocks: { op: 'concat', args: ['rest', 'blocks'] },
    blocksMinor: { op: 'argmin', args: ['restVsBlocks'] },
    blocksShare: { op: 'pick', args: ['blocksShares', 'blocksMinor'] },
    // Geometry on the fixed axis.
    wteW: { op: 'scale', args: ['wte', PX] },
    wpeW: { op: 'scale', args: ['wpe', PX] },
    lnfW: { op: 'scale', args: ['Cv', PX] },
    blocksW: { op: 'scale', args: ['blocks', PX] },
    segWv: { op: 'scale', args: ['blockV', PX] },
    segW: { op: 'pick', args: ['segWv', 0] },
    divOffset: { op: 'scale', args: ['divIndex', 'segW'] },
    divX: { op: 'add', args: ['divOffset', 'divOrigin'] },
    sizeTagRow: { op: 'pick', args: ['sizeTags', 'width'] },
    sizeTag: { op: 'pick', args: ['sizeTagRow', 'vocab'] },
  },
  objects: [
    text('question', "Where do the Shakespeare model's parameters live, and what makes each part grow?", 40, 34),
    note('prerequisites', 'Builds on: the text-to-next-character pipeline; counting a matrix as rows × columns', 40, 58),
    note('status', 'Live calculation on Source value sizes ({{L}} blocks, block_size {{Tb}}). Any other C or V is a What-if.', 40, 80),

    note('gutter-head', 'Overview stage', 40, 106),
    ...gutter,

    text('wte-name', 'wte: token embedding', NAME_X, ROW.wte + 13, { role: 'input' }),
    note('wte-count', 'V × C = {{V}} × {{C}} = {{wte.0}}', NAME_X, ROW.wte + 32),
    bar('wte-bar', ROW.wte, 'wteW.0', 'input'),

    text('wpe-name', 'wpe: position embedding', NAME_X, ROW.wpe + 13, { role: 'output' }),
    note('wpe-count', 'block_size × C = {{Tb}} × {{C}} = {{wpe.0}}', NAME_X, ROW.wpe + 32),
    bar('wpe-bar', ROW.wpe, 'wpeW.0', 'output'),

    text('blocks-name', 'Blocks: n_layer × (12C² + 2C)', NAME_X, ROW.blocks + 13, { role: 'prediction' }),
    note('blocks-count', '{{L}} × {{block}} = {{blocks.0}}', NAME_X, ROW.blocks + 32),
    bar('blocks-bar', ROW.blocks, 'blocksW.0', 'prediction'),
    ...dividers,

    text('lnf-name', 'ln_f: final LayerNorm', NAME_X, ROW.lnf + 13),
    note('lnf-count', 'C = {{C}}', NAME_X, ROW.lnf + 32),
    bar('lnf-bar', ROW.lnf, 'lnfW.0', 'neutral'),

    text('lmhead-name', 'lm_head: a score per token', NAME_X, ROW.lmhead + 13, { role: 'input' }),
    note('lmhead-count', 'the wte matrix again (tied): +0', NAME_X, ROW.lmhead + 32),

    { id: 'axis', type: 'line', semanticId: 'axis', conceptId: CONCEPT,
      initialState: { from: { x: BAR_X, y: AXIS_Y }, to: { x: BAR_X + BAR_SPAN, y: AXIS_Y }, role: 'neutral' } },
    ...ticks,
    note('axis-title', 'parameters, on one fixed scale for every setting', BAR_X, AXIS_Y + 40),

    text('block-split', 'One block: attention 4C² = {{attn.0}} · MLP 8C² = {{mlp.0}} · two LayerNorms 2C = {{ln2.0}}', 40, 504),
    note('block-origin', 'attention: c_attn C × 3C = 3C², c_proj C × C = C² · MLP: c_fc C × 4C = 4C², c_proj 4C × C = 4C²', 40, 526),
    text('total', 'Total: wte + wpe + blocks + ln_f = {{total}} ({{sizeTag}})', 40, 556),
    text('printed', 'The start-up count leaves wpe out: {{total}} − {{wpe.0}} = {{nonEmb}}. NanoGPT prints it as', 40, 586),
    text('printed-line', 'number of parameters: {{printedM.0}}M', 40, 610, { typography: 'code' }),
    note('printed-why', 'wte stays in that count: the same matrix is lm_head, so it does real work at the output too.', 40, 634),
    note('try', 'Try it: doubling C multiplies every C² term by 4 and every C term by 2. Switching V moves only wte.', 40, 666),
  ],
  timeline: [
    { at: 0, action: 'appear', target: 'wte-bar', duration: 0.3 },
    { at: 0.4, action: 'appear', target: 'wpe-bar', duration: 0.3 },
    { at: 0.8, action: 'appear', target: 'blocks-bar', duration: 0.3 },
    ...dividers.map((divider, i) => ({ at: 1.1 + i * 0.2, action: 'appear', target: divider.id, duration: 0.2 })),
    { at: 2.3, action: 'appear', target: 'lnf-bar', duration: 0.3 },
  ],
};

export const sources = [
  code('model.py', 126, 133, 'The parameters GPT owns: "wte = nn.Embedding(config.vocab_size, config.n_embd)", "wpe = nn.Embedding(config.block_size, config.n_embd)", "h = nn.ModuleList([Block(config) for _ in range(config.n_layer)])", "ln_f = LayerNorm(config.n_embd, bias=config.bias)" and "self.lm_head = nn.Linear(config.n_embd, config.vocab_size, bias=False)".'),
  code('model.py', 138, 138, 'Weight tying: "self.transformer.wte.weight = self.lm_head.weight" - one V × C matrix, counted once.'),
  code('model.py', 35, 37, 'Attention weights: "self.c_attn = nn.Linear(config.n_embd, 3 * config.n_embd, bias=config.bias)" (3C²) and "self.c_proj = nn.Linear(config.n_embd, config.n_embd, bias=config.bias)" (C²).'),
  code('model.py', 82, 84, 'MLP weights: "self.c_fc    = nn.Linear(config.n_embd, 4 * config.n_embd, bias=config.bias)" (4C²) and "self.c_proj  = nn.Linear(4 * config.n_embd, config.n_embd, bias=config.bias)" (4C²).'),
  code('model.py', 96, 101, 'A Block holds "self.ln_1 = LayerNorm(config.n_embd, bias=config.bias)", attention, "self.ln_2 = LayerNorm(config.n_embd, bias=config.bias)" and the MLP.'),
  code('model.py', 21, 24, 'A LayerNorm has "self.weight = nn.Parameter(torch.ones(ndim))" (C numbers) and a bias only when bias is True.'),
  code('train.py', 56, 56, '"bias = False # do we use bias inside LayerNorm and Linear layers?" - so no bias vectors are counted.'),
  code('model.py', 147, 160, 'The start-up print, "number of parameters: %.2fM" (two decimals, which the card reproduces), and the count it uses: "n_params = sum(p.numel() for p in self.parameters())", then "n_params -= self.transformer.wpe.weight.numel()"; the docstring says wte stays in because it is "actually used as weights in the final layer".'),
  code('train.py', 137, 155, 'Where V comes from: "meta_vocab_size = meta[\'vocab_size\']" when meta.pkl exists (65 for shakespeare_char), otherwise "model_args[\'vocab_size\'] = meta_vocab_size if meta_vocab_size is not None else 50304".'),
  code('config/train_shakespeare_char.py', 19, 24, 'The shakespeare_char sizes: "block_size = 256", "n_layer = 6" and "n_embd = 384".'),
  code('train.py', 54, 54, "train.py's own default, the other width on the picker: \"n_embd = 768\"."),
  calculation('Source value', 'C, V, n_layer and block_size', "generate_fixtures.py resolved config/train_shakespeare_char.py over train.py's defaults (C = 384, n_layer = 6, block_size = 256) and read train.py's default n_embd = 768; V = 65 is the distinct characters of the pinned dataset, and 50304 is train.py's fallback vocab_size - the same value as GPTConfig's default, which the fixture's model-vocab note records."),
  calculation('Live calculation', 'Every parameter count on the card', 'Computed by derive ops at the selected C and V: 4C², 8C² and 2C per block, times n_layer; V × C for wte, block_size × C for wpe, C for ln_f; their sum; and the sum minus wpe, which is what get_num_params() returns, rounded to two decimals in millions as the start-up print does. Bar lengths are those counts on one fixed axis. The total carries the status of its setting: Source value sizes at C = 384, V = 65, What-if sizes otherwise.'),
  calculation('What-if', 'C = 768 or V = 50304 on the Shakespeare model', 'NanoGPT ships no config with 6 blocks, block_size 256 and these values; the counts are what model.py would build if you set them.'),
  tinyShakespeare('V = 65 is the number of distinct characters in this file.'),
];

export const evidence = {
  card: 'depth-architecture-guided',
  title: scene.title,
  depth: 'Guided',
  prerequisites: 'Builds on: the text-to-next-character pipeline; counting a matrix as rows × columns',
  ladderRole: 'The only depth that puts numbers on the Overview stages and lets the learner verify how they scale: parameter counts per part, grouped under the stage each part implements, computed live on one fixed axis under two size pickers, down to the line NanoGPT prints.',
  learningQuestion: "Where do the Shakespeare model's parameters live, and what makes each part grow?",
  concept: 'Parameters live in wte (V × C, tied to lm_head), wpe (block_size × C), n_layer Blocks of 12C² + 2C each (attention 4C², MLP 8C², two LayerNorm weights) and ln_f (C). Blocks grow with C², embeddings with V × C: for characters the blocks hold almost everything; with GPT-2 tokens wte outgrows all six blocks together at C = 384 and nearly matches them at C = 768. get_num_params() subtracts wpe and keeps wte because it is also the output layer.',
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: 'Source value: C = 384, n_layer = 6, block_size = 256, V = 65 (fx.architecture), C = 768 (fx.config.defaults), V = 50304 (fx.tokenizer.modelVocabNote, checked against model.py and train.py). Live calculation: every count via elementwise/scale/sum/concat derive ops. What-if: any setting other than C = 384 with V = 65.',
  control: 'width (index picker): n_embd 384 or 768. vocab (index picker): V = 65 characters or 50304 GPT-2 tokens.',
  consequence: 'At 384/65: attention 589824, MLP 1179648, LN 768 per block, blocks 10621440, wte 24960, wpe 98304, total 10745088, start-up count 10646784, printed as number of parameters: 10.65M (42.53M, 29.94M, 81.11M at the other settings). C = 768: each block and the blocks bar grow ×4 (to 42476544), wte and wpe ×2. V = 50304: only wte grows (19316736 at C = 384, 38633472 at C = 768), and its bar becomes comparable to all six blocks. The stage gutter reads number lists (token + position embeddings) / 6 blocks (most of the parameters; under half the parameters at C = 384 with V = 50304, where wte outgrows them) / 65 scores (50304 scores with GPT-2 tokens; token matrix, reused (tied)); lm_head adds +0. Under the block split, each weight matrix as rows × columns: c_attn C × 3C = 3C², c_proj C × C = C², c_fc C × 4C = 4C², c_proj 4C × C = 4C². The total is tagged (Source value sizes) at 384/65 and (What-if sizes) at the other three settings.',
  interactionPurpose: 'Let the learner check the scaling laws on real counts - C² for the blocks, C and V × C for the embeddings - and reconcile the total with the number NanoGPT prints.',
  task: 'none (explore only - no Practice on this board)',
  capability: 'two index pickers; live elementwise/scale/sum/concat/add derive chain; derived box widths and divider positions on one fixed pixel scale; two-step 3-decimal rounding for the %.2f print; a live sub/argmin comparison picks the blocks role; {{}} labels bound to derived counts.',
};

// All four settings.
export const reviewStates = [{ width: 0, vocab: 0 }, { width: 1, vocab: 0 }, { width: 0, vocab: 1 }, { width: 1, vocab: 1 }];
