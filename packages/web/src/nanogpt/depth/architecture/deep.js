// Depth ladder - The Transformer, end to end - Deep dive.
// The exact tensor shapes of one GPT.forward call, step by step, and the
// implementation branches that change them. Each row is a step of the source
// (a function call or branch), its shape with named dimensions (B, T, C, nh,
// hs, V) and the same shape with the numbers of the selected call; the right
// column holds the equations those steps compute. The control picks the call
// site - a training step (train.py: model(X, Y), targets given), generate() on
// the Overview's "hear me spea", generate() on a prompt one character longer
// than block_size (the crop branch), or model(idx) called directly with that
// prompt (the assert branch: the edge case, nothing below it runs). A second
// control is a what-if: untie lm_head from wte. The bottom lines quantify the
// two engineering tradeoffs the branches encode - projecting only the last
// position when generating, and storing the tied matrix once. The att row is
// marked as the manual path: on PyTorch 2.0 or later self.flash is True and
// scaled_dot_product_attention returns y, so the model never holds the
// (B, nh, T, T) tensor (the Attention Deep dive card makes that branch its
// control). The att equation stops at the softmax; y = att v sits on the next
// row. Generation's saving is lm_head only: NanoGPT has no KV cache, so every
// Block reruns all T positions each step. The logits
// equation follows both controls: all positions with targets, the last one
// without; W_te when tied, W_lm in the what-if.
//
// Numbers: B, T, C, n_head, V, n_layer come from fx.architecture (the
// shakespeare_char config generate_fixtures.py resolved); the prompt length is
// the cross-entropy fixture's context; 257 is block_size + 1; the GPT-2-size
// comparison uses train.py's default n_embd (fx.config) and its fallback
// vocab_size 50304 (fx.tokenizer.modelVocabNote, checked by the test against
// the pinned sources). hs, 4C, B·T and every count are derive-op calculations.
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import { calculation, code, tinyShakespeare } from '../../sources.js';

const A = fx.architecture;
const CONCEPT = 'gpt-forward-shapes';
const PROMPT = fx.crossEntropy.context;
const TB = A.block_size;
const TOO_LONG = TB + 1;
const PADDED_VOCAB = Number(fx.tokenizer.modelVocabNote.match(/= (\d+)/)[1]);
const CALLS = ['train', 'generate', 'crop', 'direct'];
const byCall = values => Object.fromEntries(CALLS.map((call, i) => [call, values[i]]));

const BOX_X = 40, BOX_W = 240, BOX_H = 30;
const NAME_X = 288, NUM_X = 476, EQ_X = 616, EQ_W = 336, EQ_H = 36;
const ROW = { call: 112, assert: 150, embed: 188, qkv: 250, att: 288, attnOut: 348, fc: 386, mlpOut: 424, lnf: 474, head: 512, loss: 550 };
const BOTTOM = 612;
const DOWNSTREAM = ['embed', 'qkv', 'att', 'attnOut', 'fc', 'mlpOut', 'lnf', 'head', 'loss'];

const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
// One step of the source: its box (named after the function or branch), its
// shape with named dimensions, and the same shape for the selected call.
const step = (key, label, named, numbers, { boxOpacity, numOpacity, role = 'neutral', numRole = 'output' } = {}) => [
  { id: `${key}-step`, type: 'box', semanticId: `${key}-step`, conceptId: CONCEPT,
    initialState: { label, x: BOX_X, y: ROW[key], w: BOX_W, h: BOX_H, role, ...(boxOpacity ? { opacity: { $derive: boxOpacity } } : {}) } },
  note(`${key}-shape`, named, NAME_X, ROW[key] + 20, boxOpacity ? { opacity: { $derive: boxOpacity } } : {}),
  note(`${key}-numbers`, numbers, NUM_X, ROW[key] + 20, { role: numRole, ...(numOpacity ? { opacity: { $derive: numOpacity } } : {}) }),
];
const equation = (id, tex, rowKey, opacity) => ({ id, type: 'equation', semanticId: id, conceptId: CONCEPT,
  initialState: { text: tex, x: EQ_X, y: ROW[rowKey] - 3, w: EQ_W, h: EQ_H, opacity: { $derive: opacity } } });
const down = { boxOpacity: 'downOpacity', numOpacity: 'numOpacity' };

export const scene = {
  id: 'depth-architecture-deep',
  title: 'The Transformer, end to end · Deep dive: tensor shapes through GPT.forward',
  width: 960,
  height: 684,
  duration: 4,
  inputs: [
    { name: 'call', type: 'choice', label: 'Call site (branch)', default: 'train', options: [
      { id: 'train', label: 'training: model(X, Y)' },
      { id: 'generate', label: `generate() on “${PROMPT}”` },
      { id: 'crop', label: `generate() crops a ${TOO_LONG}-character prompt` },
      { id: 'direct', label: `model(idx), T = ${TOO_LONG} (What-if)` },
    ] },
    { name: 'tied', type: 'bool', label: 'lm_head shares its weight with wte', default: true },
  ],
  exampleData: {
    C: A.n_embd, nh: A.n_head, V: A.vocab_size, L: A.n_layer, Tb: TB,
    V2: PADDED_VOCAB, C2: fx.config.defaults.n_embd,
    // What forward receives at each call site: B sequences of T tokens.
    Bs: byCall([A.batch_size, 1, 1, 1]),
    Ts: byCall([TB, PROMPT.length, TB, TOO_LONG]),
    // lm_head's time dimension: every position with targets, the last without.
    Touts: byCall([TB, 1, 1, 1]),
    callBoxes: byCall(['get_batch → model(X, Y)', 'generate(): self(idx_cond)', `generate(): idx[:, -${TB}:]`, 'model(idx): no crop']),
    // What forward receives: generate() crops idx into idx_cond before the call.
    callShapes: byCall(['idx: (B, T)', 'idx: (B, T)', 'idx → idx_cond: (B, T)', 'idx: (B, T)']),
    asserts: byCall([`${TB} ≤ ${TB}: passes`, `${PROMPT.length} ≤ ${TB}: passes`, `${TB} ≤ ${TB} after the crop`, `${TOO_LONG} > ${TB}: AssertionError`]),
    assertRoles: byCall(['neutral', 'neutral', 'neutral', 'warning']),
    assertNumRoles: byCall(['output', 'output', 'output', 'warning']),
    // The crop branch shows the prompt it cut: (1, 257) -> (1, 256).
    cropPrefixes: byCall(['', '', `(1, ${TOO_LONG}) → `, '']),
    edges: byCall([
      `Training never trips the assert: get_batch always cuts exactly block_size = ${TB} characters.`,
      `A short prompt passes: T = ${PROMPT.length} ≤ ${TB}; T grows by one per generated character, up to ${TB}.`,
      `Edge case handled: a long prompt, or any sample grown past ${TB}, is cropped to its last ${TB} characters.`,
      `Edge case: AssertionError, "Cannot forward sequence of length ${TOO_LONG}, block size is only ${TB}". Nothing below runs.`,
    ]),
    edgeRoles: byCall(['neutral', 'neutral', 'success', 'warning']),
    heads: byCall(['lm_head(x)', 'lm_head(x[:, [-1], :])', 'lm_head(x[:, [-1], :])', 'lm_head(x[:, [-1], :])']),
    headShapes: byCall(['logits: (B, T, V)', 'logits: (B, 1, V)', 'logits: (B, 1, V)', 'logits: (B, 1, V)']),
    losses: byCall(['F.cross_entropy', 'targets is None', 'targets is None', 'targets is None']),
    lossShapes: byCall(['loss: mean over B·T rows', 'loss = None', 'loss = None', 'loss = None']),
    downOpacities: byCall([1, 1, 1, 0.3]),
    numOpacities: byCall([1, 1, 1, 0]),
    trainOpacities: byCall([1, 0, 0, 0]),
    genOpacities: byCall([0, 1, 1, 0]),
    // The replay walks every step that runs; after a failed assert, nothing.
    walkSteps: byCall(['highlight', 'highlight', 'highlight', 'pause']),
    unwalkSteps: byCall(['unhighlight', 'unhighlight', 'unhighlight', 'pause']),
    // lm_head's input: every position with targets, x[:, [-1], :] without.
    logitsTied: byCall(['z = \\mathrm{LN}_f(x)\\,W_{te}^{\\top}', ...Array(3).fill('z=\\mathrm{LN}_f(x)_{:,T-1}\\,W_{te}^{\\top}')]),
    logitsUntied: byCall(['z = \\mathrm{LN}_f(x)\\,W_{lm}^{\\top}', ...Array(3).fill('z=\\mathrm{LN}_f(x)_{:,T-1}\\,W_{lm}^{\\top}')]),
    tieLeadTied: 'Tying stores one matrix for wte and lm_head, saving',
    tieLeadUntied: 'What-if untied: lm_head adds its own',
  },
  derived: {
    B: { op: 'pick', args: ['Bs', 'call'] },
    T: { op: 'pick', args: ['Ts', 'call'] },
    Tout: { op: 'pick', args: ['Touts', 'call'] },
    Bv: { op: 'concat', args: ['B'] },
    Tv: { op: 'concat', args: ['T'] },
    Cv: { op: 'concat', args: ['C'] },
    Vv: { op: 'concat', args: ['V'] },
    // hs = C // n_head and the MLP's hidden width 4C.
    hs: { op: 'scale', args: ['Cv', 1 / A.n_head] },
    C4: { op: 'scale', args: ['Cv', 4] },
    // Tradeoff 1: scores lm_head produces - every position vs the last one.
    BT: { op: 'elementwise', args: ['Bv', 'Tv'] },
    nAll: { op: 'elementwise', args: ['BT', 'Vv'] },
    nLast: { op: 'elementwise', args: ['Bv', 'Vv'] },
    // Tradeoff 2: the V x C matrix tying stores once, here and at GPT-2 size.
    VC: { op: 'elementwise', args: ['Vv', 'Cv'] },
    V2v: { op: 'concat', args: ['V2'] },
    C2v: { op: 'concat', args: ['C2'] },
    VC2: { op: 'elementwise', args: ['V2v', 'C2v'] },
    tieLead: { op: 'choose', args: ['tied', 'tieLeadTied', 'tieLeadUntied'] },
    logitsTiedEq: { op: 'pick', args: ['logitsTied', 'call'] },
    logitsUntiedEq: { op: 'pick', args: ['logitsUntied', 'call'] },
    logitsEq: { op: 'choose', args: ['tied', 'logitsTiedEq', 'logitsUntiedEq'] },
    callBox: { op: 'pick', args: ['callBoxes', 'call'] },
    callShape: { op: 'pick', args: ['callShapes', 'call'] },
    assertText: { op: 'pick', args: ['asserts', 'call'] },
    assertRole: { op: 'pick', args: ['assertRoles', 'call'] },
    assertNumRole: { op: 'pick', args: ['assertNumRoles', 'call'] },
    cropPrefix: { op: 'pick', args: ['cropPrefixes', 'call'] },
    edge: { op: 'pick', args: ['edges', 'call'] },
    edgeRole: { op: 'pick', args: ['edgeRoles', 'call'] },
    head: { op: 'pick', args: ['heads', 'call'] },
    headShape: { op: 'pick', args: ['headShapes', 'call'] },
    loss: { op: 'pick', args: ['losses', 'call'] },
    lossShape: { op: 'pick', args: ['lossShapes', 'call'] },
    downOpacity: { op: 'pick', args: ['downOpacities', 'call'] },
    numOpacity: { op: 'pick', args: ['numOpacities', 'call'] },
    trainOpacity: { op: 'pick', args: ['trainOpacities', 'call'] },
    genOpacity: { op: 'pick', args: ['genOpacities', 'call'] },
    walkStep: { op: 'pick', args: ['walkSteps', 'call'] },
    unwalkStep: { op: 'pick', args: ['unwalkSteps', 'call'] },
  },
  objects: [
    text('question', 'What shape is the tensor after each step of GPT.forward, and which branches change it?', 40, 34),
    note('prerequisites', 'Builds on: Guided; tensor shapes and matrix products', 40, 58),
    note('status', `Source value sizes; shapes and counts: Live calculation. model(idx) at T = ${TOO_LONG} and untied weights: What-if.`, 40, 80),
    // Static rule from the bracket to the equations' right edge: the block is
    // sized from the scene's static content, and the bracket and equations are
    // input-bound (dimmed on a failed assert), so without it the card renders
    // shrunk below the text legibility floors.
    { id: 'header-rule', type: 'line', semanticId: 'header-rule', conceptId: CONCEPT,
      initialState: { from: { x: BOX_X - 10, y: 97 }, to: { x: EQ_X + EQ_W, y: 97 }, role: 'neutral', opacity: 0.3 } },

    ...step('call', '{{callBox}}', '{{callShape}}', '{{cropPrefix}}({{B}}, {{T}})'),
    ...step('assert', 'assert t <= block_size', 't = T, block_size = {{Tb}}', '{{assertText}}', { role: { $derive: 'assertRole' }, numRole: { $derive: 'assertNumRole' } }),
    ...step('embed', 'wte(idx) + wpe(pos)', 'x: (B, T, C) + (T, C)', '({{B}}, {{T}}, {{C}})', down),
    note('block-header', 'Block.forward, run n_layer = {{L}} times, each Block with its own weights:', BOX_X, ROW.qkv - 12, { opacity: { $derive: 'downOpacity' } }),
    { id: 'block-bracket', type: 'line', semanticId: 'block-bracket', conceptId: CONCEPT,
      initialState: { from: { x: BOX_X - 10, y: ROW.qkv }, to: { x: BOX_X - 10, y: ROW.mlpOut + BOX_H }, role: 'neutral', opacity: { $derive: 'downOpacity' } } },
    ...step('qkv', 'ln_1 → c_attn → split', 'q, k, v: (B, nh, T, hs)', '({{B}}, {{nh}}, {{T}}, {{hs.0}})', down),
    ...step('att', 'q @ kᵀ → mask → softmax', 'att: (B, nh, T, T)', '({{B}}, {{nh}}, {{T}}, {{T}})', down),
    note('att-path', '↑ manual path only: on the default path (scaled_dot_product_attention, PyTorch ≥ 2.0) the model never holds att.', BOX_X, ROW.att + BOX_H + 18, { opacity: { $derive: 'downOpacity' } }),
    ...step('attnOut', 'att @ v → c_proj, x + y', 'x: (B, T, C)', '({{B}}, {{T}}, {{C}})', down),
    ...step('fc', 'ln_2 → c_fc → gelu', 'h: (B, T, 4C)', '({{B}}, {{T}}, {{C4.0}})', down),
    ...step('mlpOut', 'c_proj, x + mlp', 'x: (B, T, C)', '({{B}}, {{T}}, {{C}})', down),
    ...step('lnf', 'ln_f', 'x: (B, T, C)', '({{B}}, {{T}}, {{C}})', down),
    ...step('head', '{{head}}', '{{headShape}}', '({{B}}, {{Tout}}, {{V}})', down),
    ...step('loss', '{{loss}}', '{{lossShape}}', '{{BT.0}} rows of {{V}}', { boxOpacity: 'downOpacity', numOpacity: 'trainOpacity' }),

    equation('eq-embed', 'x = W_{te}[\\mathrm{idx}] + W_{pe}[0{:}T]', 'embed', 'downOpacity'),
    equation('eq-att', '\\mathrm{softmax}(qk^\\top/\\sqrt{hs}+M)', 'att', 'downOpacity'),
    equation('eq-attn', 'y=\\text{att}\\,v,\\ x\\gets x+yW_{proj}^\\top', 'attnOut', 'downOpacity'),
    equation('eq-mlp', 'x \\gets x+\\text{mlp}(\\text{LN}_2(x))', 'mlpOut', 'downOpacity'),
    equation('eq-logits', '{{logitsEq}}', 'head', 'downOpacity'),
    equation('eq-loss', '\\ell=-\\frac{1}{BT}\\sum_{b,t}\\log p(Y_{bt})', 'loss', 'trainOpacity'),

    note('edge', '{{edge}}', 40, BOTTOM, { role: { $derive: 'edgeRole' } }),
    note('cost-train', 'Training scores every position: {{B}} × {{T}} × {{V}} = {{nAll.0}} logits, each compared with its target.', 40, BOTTOM + 22, { opacity: { $derive: 'trainOpacity' } }),
    note('cost-gen', 'Only the last position is scored: {{B}} × 1 × {{V}} = {{nLast.0}} logits, not {{nAll.0}}; all {{T}} positions still run every Block.', 40, BOTTOM + 22, { opacity: { $derive: 'genOpacity' } }),
    note('tie', '{{tieLead}} V × C = {{VC.0}} parameters; {{VC2.0}} at V = {{V2}}, C = {{C2}}.', 40, BOTTOM + 44),
  ],
  timeline: Object.keys(ROW).flatMap((key, i) => {
    const runs = DOWNSTREAM.includes(key);
    return [
      { at: 0.2 + i * 0.3, action: runs ? { $derive: 'walkStep' } : 'highlight', target: `${key}-step`, duration: 0.1 },
      { at: 0.45 + i * 0.3, action: runs ? { $derive: 'unwalkStep' } : 'unhighlight', target: `${key}-step`, duration: 0.1 },
    ];
  }),
};

export const sources = [
  code('train.py', 123, 125, 'The training batch: "ix = torch.randint(len(data) - block_size, (batch_size,))", so B = batch_size and every row is exactly block_size long; the targets are the same windows shifted by one.'),
  code('train.py', 300, 300, 'The training call site passes targets: "logits, loss = model(X, Y)".'),
  code('model.py', 312, 316, 'The generation call site: "idx_cond = idx if idx.size(1) <= self.config.block_size else idx[:, -self.config.block_size:]" (the crop branch), then "logits, _ = self(idx_cond)" with no targets - the whole (cropped) sequence, every step: NanoGPT keeps no KV cache, so scoring only the last position saves lm_head work, not Block work.'),
  code('sample.py', 81, 81, 'One prompt, so B = 1: "x = (torch.tensor(start_ids, dtype=torch.long, device=device)[None, ...])".'),
  code('model.py', 170, 173, 'GPT.forward reads "b, t = idx.size()" and checks "assert t <= self.config.block_size" - failing with "Cannot forward sequence of length" when forward is called on a prompt generate() did not crop.'),
  code('model.py', 174, 179, 'The embedding step: "pos = torch.arange(0, t, dtype=torch.long, device=device) # shape (t)", "tok_emb = self.transformer.wte(idx) # token embeddings of shape (b, t, n_embd)", "pos_emb = self.transformer.wpe(pos) # position embeddings of shape (t, n_embd)", "x = self.transformer.drop(tok_emb + pos_emb)" - (T, C) broadcasts over B.'),
  code('model.py', 103, 106, 'Block.forward, the two residual steps: "x = x + self.attn(self.ln_1(x))" and "x = x + self.mlp(self.ln_2(x))".'),
  code('model.py', 180, 181, 'n_layer Blocks in order: "for block in self.transformer.h:" / "x = block(x)".'),
  code('model.py', 53, 59, 'Attention splits the heads: "q, k, v  = self.c_attn(x).split(self.n_embd, dim=2)", then each is viewed as "(B, nh, T, hs)" with hs = C // n_head.'),
  code('model.py', 44, 50, 'Which attention path runs: "self.flash = hasattr(torch.nn.functional, \'scaled_dot_product_attention\')" is True on PyTorch 2.0 or later; only "if not self.flash:" does the model register the causal-mask buffer the manual path uses.'),
  code('model.py', 61, 71, 'The scores: "(B, nh, T, hs) x (B, nh, hs, T) -> (B, nh, T, T)". Two branches: "torch.nn.functional.scaled_dot_product_attention" with "is_causal=True" (the default: it returns y, so the model never holds att; PyTorch picks the kernel) or the manual path that materialises att, scales by "(1.0 / math.sqrt(k.size(-1)))", masks with -inf and applies the softmax; then "y = att @ v".'),
  code('model.py', 72, 75, 'Heads back side by side and projected: "y = y.transpose(1, 2).contiguous().view(B, T, C)" then "y = self.resid_dropout(self.c_proj(y))".'),
  code('model.py', 82, 92, 'The MLP: "self.c_fc    = nn.Linear(config.n_embd, 4 * config.n_embd, bias=config.bias)" widens to 4C, GELU, then "self.c_proj  = nn.Linear(4 * config.n_embd, config.n_embd, bias=config.bias)" back to C.'),
  code('model.py', 182, 182, 'The final LayerNorm: "x = self.transformer.ln_f(x)".'),
  code('model.py', 184, 191, 'The head branch: with targets "logits = self.lm_head(x)" and "loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-1)"; without, "logits = self.lm_head(x[:, [-1], :]) # note: using list [-1] to preserve the time dim" and "loss = None".'),
  code('model.py', 133, 138, 'lm_head is "nn.Linear(config.n_embd, config.vocab_size, bias=False)", and "self.transformer.wte.weight = self.lm_head.weight" ties it to wte - the untied variant on the card is a what-if.'),
  code('config/train_shakespeare_char.py', 18, 24, 'The sizes: "batch_size = 64", "block_size = 256", "n_layer = 6", "n_head = 6", "n_embd = 384".'),
  code('train.py', 137, 155, 'V: "meta_vocab_size = meta[\'vocab_size\']" (65 from shakespeare_char\'s meta.pkl), else "model_args[\'vocab_size\'] = meta_vocab_size if meta_vocab_size is not None else 50304" - the fallback used in the GPT-2-size comparison.'),
  code('train.py', 54, 54, 'train.py\'s own model default, the other size in that comparison: "n_embd = 768".'),
  calculation('Source value', 'B, T, C, n_head, n_layer, V and the prompt', "generate_fixtures.py resolved config/train_shakespeare_char.py over train.py's defaults (batch_size 64, block_size 256, n_embd 384, n_head 6, n_layer 6) and counted 65 distinct characters in the pinned dataset; the prompt is the fixture's cross-entropy context, 12 characters. B = 1 for generation because sample.py adds one batch dimension."),
  calculation('Live calculation', 'Every shape and count on the card', 'Derive ops at the selected call: hs = C / n_head, 4C, B·T, B × T × V and B × 1 × V logits, and V × C for the tied matrix (here and at V = 50304, C = 768).'),
  calculation('What-if', 'model(idx) at T = 257 and untied weights', 'T = block_size + 1 is the shortest sequence that takes the crop branch in generate(). The crop itself is ordinary: a long prompt takes it on the first step, and any sample takes it once it has grown past block_size (sample.py\'s default max_new_tokens does). The What-if is calling model(idx) directly at that length, which fails the assert in forward(). NanoGPT always ties wte and lm_head; the untied switch shows what the tie saves, not a shipped option.'),
  tinyShakespeare('The generation example "hear me spea" is from line 2: "Before we proceed any further, hear me speak."'),
];

export const evidence = {
  card: 'depth-architecture-deep',
  title: scene.title,
  depth: 'Deep dive',
  prerequisites: 'Builds on: Guided; tensor shapes and matrix products',
  ladderRole: 'The only depth that ties each step to its source function and branch: exact shapes with named dimensions, the equations those steps compute, the call-site branches (targets vs None, the crop, the assert) and the tradeoffs they encode.',
  learningQuestion: 'What shape is the tensor after each step of GPT.forward, and which branches change it?',
  concept: 'idx (B, T) -> assert T <= block_size -> wte + wpe (B, T, C) -> n_layer x [ln_1 -> q, k, v (B, nh, T, hs) -> att (B, nh, T, T) -> c_proj, residual -> ln_2 -> c_fc (B, T, 4C) -> c_proj, residual] -> ln_f -> lm_head: (B, T, V) with targets and cross-entropy over B·T rows, or (B, 1, V) from x[:, [-1], :] and loss None. generate() crops prompts longer than block_size; calling forward directly with them fails the assert. wte is lm_head\'s weight (tied).',
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: 'Source value: B, T, C, n_head, n_layer, V (fx.architecture), the 12-character prompt (fx.crossEntropy.context), train.py default n_embd 768 (fx.config.defaults) and fallback vocab 50304 (fx.tokenizer.modelVocabNote, checked against the pinned train.py and model.py). Live calculation: hs, 4C, B·T, logits counts, V × C. What-if: model(idx) called directly at T = block_size + 1 = 257, and untied lm_head (the crop at 257 is ordinary generate() behaviour).',
  control: 'call (choice): training model(X, Y) | generate() on "hear me spea" | generate() cropping a 257-character prompt to its last 256 before forward | model(idx) with T = 257. tied (bool): lm_head shares wte\'s weight (NanoGPT) or not (what-if).',
  consequence: 'training: (64, 256) ... logits (64, 256, 65), loss over (16384, 65) vs (16384), 1064960 logits. generate: (1, 12) ... logits (1, 1, 65), loss None, 65 logits instead of 780. crop: the call row reads generate(): idx[:, -256:], idx → idx_cond: (B, T), (1, 257) → (1, 256), so forward only ever sees T = 256; logits (1, 1, 65). generate: the edge line says T grows up to 256. direct: 257 > 256, AssertionError in warning colour, every later step dimmed with its numbers removed, the replay stops at the assert. The logits equation reads LN_f(x) W^T for training and LN_f(x)_{:,T-1} W^T for every targets-None call, matching the (B, 1, V) shape beside it; the att equation is softmax(qk^T/sqrt(hs) + M), matching att: (B, nh, T, T), and y = att v sits on the c_proj row; the att row always carries its note that only the manual path stores (B, nh, T, T) - on the default scaled_dot_product_attention path the model never holds att. generate/crop: the cost line adds that all T positions (12, 256) still run every Block - no KV cache, so the saving is lm_head only. untied: the logits equation switches W_te to W_lm and the tie line reads +24960 parameters (+38633472 at V = 50304, C = 768).',
  interactionPurpose: 'Trace the same forward pass through each real call site and see exactly which shapes change (B, T and the head), where the crop and the assert sit, and what the last-position projection and the weight tie buy.',
  task: 'none (explore only - no Practice on this board)',
  capability: 'choice input over four call sites (record-map picks) plus a bool what-if; derived labels, roles, opacities and equation text; equation objects; a highlight walk whose later steps are derive-resolved (highlight vs pause) so it stops at a failed assert.',
};

export const reviewStates = [
  { call: 'train', tied: true }, { call: 'generate', tied: true }, { call: 'crop', tied: true },
  { call: 'direct', tied: true }, { call: 'train', tied: false }, { call: 'generate', tied: false },
];
