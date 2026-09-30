// Card 5 - where positions mix inside a Block. Sequence "The MLP", 1 of 2
// (c05 → c14: this card is the wiring between positions, c14 the computation
// inside one position). One relation drawn in two states: which inputs each output can
// depend on in ② attn (the causal lower triangle, drawn as wiring) and in
// ⑤ mlp (the diagonal: one position at a time). "Before" is c07's real
// shakespeare_char text; block_size comes from fx.architecture. The wiring is
// generated here from the rule (TRIL, EYE), never typed; the per-output
// counts are live sums. No toy numbers.
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { code, calculation, tinyShakespeare } from '../sources.js';
import { WORD_TOKENS } from './c07-embedding-lookup.js';

const { word: WORD, chars: CHARS } = WORD_TOKENS;
const A = fx.architecture;
const T = CHARS.length; // 6 drawn: T(T+1)/2 lines + 2T tiles stays under 60 objects
const POS = [...Array(T).keys()];
// Structure from source: model.py:49's tril buffer (manual path) and
// is_causal=True (default path) give output i inputs 0..i; the MLP acts per
// position (model.py:87-92), the identity pattern.
const TRIL = POS.map(i => POS.map(j => (j <= i ? 1 : 0)));
const EYE = POS.map(i => POS.map(j => (j === i ? 1 : 0)));

const X0 = 330, PITCH = 100, TW = 76, TH = 44;
const IN_Y = 150, OUT_Y = IN_Y + TH + 160;
const cx = j => X0 + j * PITCH + TW / 2;
const COUNT_Y = OUT_Y + TH + 22;
const RULE_Y = COUNT_Y + 48;

const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: 'position-mixing',
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const tile = (id, k, y, role) => ({ id, type: 'box', semanticId: id, conceptId: 'position-mixing',
  initialState: { label: `${k} · ${CHARS[k]}`, x: X0 + k * PITCH, y, w: TW, h: TH, role } });
// Input j → output i for every j ≤ i. The 6 diagonal lines are in both
// states; the 15 with j < i take their opacity from the picked wiring (no
// timeline appear, which would override it).
const wire = (j, i) => ({ id: `w-${j}-${i}`, type: 'line', semanticId: `w-${j}-${i}`, conceptId: 'position-mixing',
  initialState: { from: { x: cx(j), y: IN_Y + TH + 2 }, to: { x: cx(i), y: OUT_Y - 2 }, role: 'output',
    ...(j < i ? { opacity: { $derive: `conn.${i}.${j}` } } : {}) } });

export const scene = {
  id: 'nanogpt-c05-position-mixing',
  title: 'Where positions mix inside a Block',
  width: 960,
  height: 620,
  duration: 0.1, // no replay; the schema refuses 0
  inputs: [
    { name: 'sublayer', type: 'index', label: 'Sub-layer', of: 'sublayers', default: 0, presentation: 'picker' },
  ],
  exampleData: {
    sublayers: ['② attn', '⑤ mlp'], // c02's step names
    connBy: [TRIL, EYE],
    countLabels: POS.concat(T).map(n => `${n} input${n === 1 ? '' : 's'}`),
    headings: ['② attn: causal self-attention', '⑤ mlp: c_fc → GELU → c_proj'],
    rowIns: ['reads ln_1(x)', 'reads ln_2(x + a)'],
    rowOuts: ['writes a', 'writes m'],
    rule1s: ['Output i can depend on inputs 0 to i: itself and every earlier position.', 'Output i depends on input i alone.'],
    rule2s: ['Later positions are masked, so nothing flows backwards.', 'The same c_fc → GELU → c_proj runs at every position.'],
    T: A.block_size,
  },
  derived: {
    conn: { op: 'pick', args: ['connBy', 'sublayer'] },
    ...Object.fromEntries(POS.flatMap(i => [
      [`reads${i}`, { op: 'sum', args: [`conn.${i}`] }],
      // Short marker: the static '{{n5}}' must not reach past the widest drawn line.
      [`n${i}`, { op: 'pick', args: ['countLabels', `reads${i}`] }],
    ])),
    heading: { op: 'pick', args: ['headings', 'sublayer'] },
    rowIn: { op: 'pick', args: ['rowIns', 'sublayer'] },
    rowOut: { op: 'pick', args: ['rowOuts', 'sublayer'] },
    rule1: { op: 'pick', args: ['rule1s', 'sublayer'] },
    rule2: { op: 'pick', args: ['rule2s', 'sublayer'] },
  },
  objects: [
    // Sequence review: the contrast in the question, so the attn default is not c11's question again (plan risk 7).
    text('question', 'Inside one Block, which sub-layer lets an output depend on other positions?', 40, 34, { typography: 'heading' }),
    note('status', 'Characters, block_size: Source value · counts: Live calculation', 40, 62),
    text('heading', '{{heading}}', 40, 110),

    text('row-in', '{{rowIn}}', 40, IN_Y + 28, { typography: 'caption' }),
    ...POS.map(j => tile(`in-${j}`, j, IN_Y, 'input')),
    ...POS.flatMap(i => POS.filter(j => j <= i).map(j => wire(j, i))),
    text('row-out', '{{rowOut}}', 40, OUT_Y + 28, { typography: 'caption' }),
    ...POS.map(i => tile(`out-${i}`, i, OUT_Y, 'output')),
    note('count-label', 'can depend on', 40, COUNT_Y),
    ...POS.map(i => note(`n-${i}`, `{{n${i}}}`, X0 + i * PITCH + 6, COUNT_Y)),

    // The card's takeaway for the chosen sub-layer: the line a learner reads first.
    text('rule-1', '{{rule1}}', 40, RULE_Y, { typography: 'heading' }),
    text('rule-2', '{{rule2}}', 40, RULE_Y + 26),
    note('precise', 'Inside attn, positions meet only in the scores and the weighted mix of values; c_attn and c_proj act per position.', 40, RULE_Y + 60),
    note('scale', 'Six positions drawn; NanoGPT wires up to block_size = {{T}} the same way.', 40, RULE_Y + 82),
  ],
  timeline: [],
};

export const reviewStates = [{ sublayer: 0 }, { sublayer: 1 }];

// Practice (commit before you see): position 100 of a 256 window, through a
// whole Block - neither is drawn; the card shows six positions and the two
// sub-layers as separate states.
const P = 100;
const LAST = A.block_size - 1;
export const activity = {
  id: 'c05-practice',
  check: 'choice_equals',
  version: 1,
  prompt: `A full NanoGPT window is block_size = ${A.block_size} positions (0 to ${LAST}); the card draws six. Dropout is off, as when generating. Only the Block’s input x at position ${P} changes. After the whole Block (attn with its residual add, then mlp with its residual add), which positions of the Block’s output can change?`,
  // ponytail: SceneActivity shows no pick for an untouched answer, so this
  // naive default never renders; it only satisfies the declaration.
  answer: { type: 'choice', label: 'Your answer', default: 'only-100', options: [
    { id: 'only-100', label: `Only position ${P}` },
    { id: 'from-100', label: `Positions ${P} to ${LAST}` },
    { id: 'upto-100', label: `Positions 0 to ${P}` },
    { id: 'all', label: `All ${A.block_size} positions` },
  ] },
  expected: 'from-100',
  checkLabel: 'Check',
  feedbackPass: `Right: ${P} to ${LAST} (${A.block_size - P} positions). attn carries the change forward to every output from ${P} on; outputs 0 to ${P - 1} have position ${P} masked. ln_2, the MLP and the adds work on each position alone, so they add no spread.`,
  feedbackFail: `Not quite. Chain the two sub-layers. attn: output i reads inputs 0 to i, so a change at ${P} can reach outputs ${P} to ${LAST} and never 0 to ${P - 1}. Then ln_2, the MLP and the adds act on each position alone: no further spread. So ${P} to ${LAST}. “All ${A.block_size} positions” would need attention without the mask or an MLP that mixes positions; “Only position ${P}” ignores attention; “Positions 0 to ${P}” reads the wiring backwards. On the card: input 3 reaches outputs 3, 4, 5 in attn and only 3 in mlp.`,
};

// Phase 1 plan (docs/nanogpt-deep-dive-batch3-plans.md, c05; verbatim where it fits).
export const plan = {
  concept: 'Position mixing inside one Block: which input positions each output position can depend on, in the attention sub-layer compared with the MLP sub-layer. Only attention moves information between positions, and only forward.',
  objective: 'After this card, the learner should understand that inside a Block only attention moves information between positions: output i can depend on inputs 0 to i in attn but on input i alone in the MLP.',
  prerequisites: [
    'c02-block-anatomy: attn (② step) and mlp (⑤ step) are the Block\'s two sub-layers; attn reads ln_1(x) and mlp reads ln_2(x + a), each followed by a residual add',
    'c11-causal-mask: an attention output at position i reads positions 0 to i',
  ],
  causalSteps: [
    'six positions, 0 to 5, each hold one sub-layer input vector',
    'attn: output i can depend on inputs 0 to i (the tril buffer on the manual path, is_causal=True on the default path)',
    'mlp: output i = dropout(c_proj(GELU(c_fc(input i)))), so it depends on 1 input; the same weights run at every position',
    'precision line: inside attn, positions meet only in the (T, T) scores and where the weights mix the values; c_attn, the head split, the re-assembly, c_proj, ln_1/ln_2 and the residual adds act on each position alone',
  ],
  primaryInteraction: 'one control, sublayer (index picker ② attn / ⑤ mlp, default attn): 21 lines join input j to output i for every j ≤ i; switching to mlp fades the 15 lines with j < i, the counts drop from 1..6 to all 1, and the heading, row labels and two rule lines follow the state',
  check: 'practice (choice): after a whole Block, which outputs can change when only input 100 of a 256-position window changes? Undrawn: position 100 of 256 (the card draws 0 to 5) and the two sub-layers composed through a whole Block (the card draws them as separate states); answer 100 to 255',
  boundary: {
    decision: 'single',
    reason: 'one relation, "which inputs can an output depend on", drawn for the two sub-layers of one Block; the contrast is the idea. Without the MLP state only c11\'s triangle remains; without the attn state "the MLP works per position" has nothing to stand against. One visual region, one control, one practice; not staged (no pipeline). Not in the Self-attention sequence: first of "The MLP" (c05 → c14), the prerequisite of c14, which opens the MLP for one position',
    reviewed: {},
    sequence: { name: 'The MLP', position: 1, of: 2, relationships: [
      { type: 'deepens', card: 'c02-block-anatomy', direction: 'in' },
      { type: 'prerequisite', card: 'c11-causal-mask', direction: 'in' },
      { type: 'prerequisite', card: 'c10-weighted-values', direction: 'in' },
      { type: 'prerequisite', card: 'c14-mlp', direction: 'out' },
    ] },
  },
};

const DOCS = 'https://docs.pytorch.org/docs/stable/generated/';

export const sources = [
  code('model.py', 45, 50, 'Which path builds the mask: "self.flash = hasattr(torch.nn.functional, \'scaled_dot_product_attention\')"; only "if not self.flash:" registers the manual buffer "torch.tril(torch.ones(config.block_size, config.block_size))" - 1 where key j ≤ query i, the triangle the attn state draws.'),
  code('model.py', 56, 59, 'Per position: "q, k, v  = self.c_attn(x).split(self.n_embd, dim=2)" is a Linear on each position\'s vector, and ".view(B, T, self.n_head, C // self.n_head).transpose(1, 2)" only splits it into heads.'),
  code('model.py', 64, 64, 'The default path: "scaled_dot_product_attention(q, k, v, attn_mask=None, dropout_p=self.dropout if self.training else 0, is_causal=True)" - the same lower triangle, with dropout only in training.'),
  code('model.py', 67, 71, 'The one place positions meet (manual path): "att = (q @ k.transpose(-2, -1))" scores every query against every key, "att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float(\'-inf\'))" removes the later keys, and "y = att @ v" mixes the visible values.'),
  code('model.py', 72, 75, 'Back per position: "y = y.transpose(1, 2).contiguous().view(B, T, C)" re-assembles the heads and "y = self.resid_dropout(self.c_proj(y))" projects each position\'s vector alone.'),
  code('model.py', 82, 92, 'The MLP: "self.c_fc    = nn.Linear(config.n_embd, 4 * config.n_embd, bias=config.bias)", "self.gelu    = nn.GELU()", "self.c_proj  = nn.Linear(4 * config.n_embd, config.n_embd, bias=config.bias)"; forward runs "x = self.c_fc(x)", "x = self.gelu(x)", "x = self.c_proj(x)", "x = self.dropout(x)" - every step on the last dimension, one position at a time.'),
  code('model.py', 21, 27, 'ln_1 and ln_2 per position: "self.weight = nn.Parameter(torch.ones(ndim))" and "return F.layer_norm(input, self.weight.shape, self.weight, self.bias, 1e-5)" - normalized_shape is (ndim,), the last dimension only; the Block builds both with ndim = n_embd.'),
  code('model.py', 98, 105, 'The Block the practice composes: "self.ln_1 = LayerNorm(config.n_embd, bias=config.bias)", "self.ln_2 = LayerNorm(config.n_embd, bias=config.bias)"; "x = x + self.attn(self.ln_1(x))" then "x = x + self.mlp(self.ln_2(x))" - each add is position by position.'),
  code('model.py', 173, 173, 'Why at most block_size positions: "assert t <= self.config.block_size".'),
  code('config/train_shakespeare_char.py', 19, 19, 'The window for shakespeare_char: "block_size = 256 # context of up to 256 previous characters".'),
  code('config/train_shakespeare_char.py', 25, 25, 'Dropout in training: "dropout = 0.2".'),
  code('sample.py', 51, 51, 'Why the practice says dropout is off: "model.eval()" before generating, so every Dropout is the identity.'),
  { kind: 'doc', title: 'torch.nn.Linear (PyTorch documentation)', url: `${DOCS}torch.nn.Linear.html`,
    note: 'Shape: input “(∗, H_in) where ∗ means any number of dimensions including none”, output “(∗, H_out) where all but the last dimension are the same shape as the input” - c_attn, c_fc and both c_proj act on the last dimension, so each position is transformed alone.' },
  { kind: 'doc', title: 'torch.nn.GELU (PyTorch documentation)', url: `${DOCS}torch.nn.GELU.html`,
    note: '“Applies the Gaussian Error Linear Units function.” Shape: “(∗), where ∗ means any number of dimensions”, output “(∗), same shape as the input” - element-wise, so no position reads another.' },
  { kind: 'doc', title: 'torch.nn.Dropout (PyTorch documentation)', url: `${DOCS}torch.nn.Dropout.html`,
    note: '“During training, randomly zeroes some of the elements of the input tensor with probability p.” “Furthermore, the outputs are scaled by a factor of 1/(1-p) during training. This means that during evaluation the module simply computes an identity function.” - element-wise in training, nothing at all when generating.' },
  { kind: 'doc', title: 'torch.nn.LayerNorm (PyTorch documentation; F.layer_norm links here)', url: `${DOCS}torch.nn.LayerNorm.html`,
    note: '“The mean and standard-deviation are calculated over the last D dimensions, where D is the dimension of normalized_shape.” NanoGPT passes weight.shape = (n_embd,), so D = 1: each position is normalized on its own.' },
  calculation('Source value', `The characters of “${WORD}” and block_size`,
    `“${WORD}” is c07's word: the first ${T} characters of the tokenizer card's sentence, taken from the sha-pinned Tiny Shakespeare file (IDs not shown). block_size ${A.block_size} comes from the resolved shakespeare_char config (fx.architecture).`),
  calculation('Live calculation', 'The wiring and the counts',
    `The two ${T} × ${T} patterns are generated from the rule in the card module, never typed: attn = 1 where j ≤ i (the tril pattern), mlp = 1 where j = i (per position). pick selects one by the Sub-layer control; each line with j < i takes its opacity from it; sum counts each output's inputs (1..${T} for attn, 1 each for mlp).`),
  tinyShakespeare(`“${WORD}” is the first word of the tokenizer card's sentence, taken from this file.`),
];

export const evidence = {
  card: 'c05-position-mixing',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: plan.concept,
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: 'source: model.py:45-50 (flash flag, tril buffer), :56-59 (c_attn, head split), :64 (is_causal=True), :67-71 (scores, masked_fill, att @ v), :72-75 (re-assembly, c_proj), :82-92 (MLP), :21-27 (LayerNorm weight, layer_norm), :98-105 (ln_1/ln_2 of n_embd, Block forward), :173 (t <= block_size); config/train_shakespeare_char.py:19, :25; sample.py:51 (model.eval) - checked against the pinned files. PyTorch docs for Linear, GELU, Dropout and LayerNorm quoted from docs.pytorch.org (2.14). Source value: "Before" (c07 WORD_TOKENS), block_size from fx.architecture. Live: pick and sum over the generated TRIL / EYE patterns. No toy numbers.',
  control: 'sublayer - index picker "Sub-layer" over ② attn / ⑤ mlp, default ② attn.',
  consequence: 'attn: 21 lines join input j to output i for every j ≤ i and the counts read 1 input … 6 inputs; mlp: the 15 lines with j < i fade out, only the 6 verticals stay and every count reads 1 input. The heading, the row labels (reads ln_1(x) / writes a, reads ln_2(x + a) / writes m) and the two rule lines follow the state; the precision line and the block_size line are true in both.',
  interactionPurpose: 'Set attention\'s causal wiring against the MLP\'s per-position wiring, so "only attention moves information between positions" is seen as a difference in lines, not read as a sentence.',
  task: 'Switch between ② attn and ⑤ mlp and follow input 3: it reaches outputs 3, 4, 5 in attn and only 3 in mlp. Practice: compose both through a whole Block for input 100 of a 256 window, neither drawn.',
  capability: 'index picker; pick of a generated 0/1 wiring matrix; nested dotted $derive (conn.i.j) as line opacity with no timeline appear; sum of a matrix row, then pick of a pluralized count label by that sum; picked heading, row labels and rule lines; empty timeline (duration 0.1); a choice practice about an undrawn position.',
};
