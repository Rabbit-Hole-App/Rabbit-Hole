// c01 - NanoGPT's GPT.forward (model.py:170-193 @3adf61e), stage by stage,
// with the one input that changes what the head does: which call site runs
// it. train.py:300 passes targets, so (model.py:184) lm_head scores every
// position and a cross-entropy loss is computed; generate() (model.py:316)
// passes none, so only the last position is projected and loss is None.
// Dropout on/off is a SEPARATE switch (model.train()/eval()), shown as such.
// The two call sites are a PRESET view of the source - nothing runs here.
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { calculation, code, tinyShakespeare } from '../sources.js';

const A = fx.architecture;
const CONCEPT = 'gpt-forward-pass';

const box = (id, label, x, y, w, h, extra = {}) => ({
  id, type: 'box', semanticId: id, conceptId: CONCEPT,
  initialState: { label, x, y, w, h, opacity: 0, ...extra },
});
const note = (id, text, x, y, extra = {}) => ({
  id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text, x, y, typography: 'annotation', opacity: 0, ...extra },
});
const header = (id, text, y, typography = 'annotation') => ({
  id, type: 'text', semanticId: id, conceptId: CONCEPT, initialState: { text, x: 40, y, typography },
});
const arrow = (id, from, to) => ({
  id, type: 'arrow', semanticId: id, conceptId: CONCEPT,
  initialState: { from, to, opacity: 0, role: 'neutral' },
});
const line = (id, from, to) => ({
  id, type: 'line', semanticId: id, conceptId: CONCEPT,
  initialState: { from, to, opacity: 0, role: 'neutral' },
});
const appear = (at, target, duration = 0.3) => ({ at, action: 'appear', target, duration });

// Row 2: one box per entry of transformer.h - n_layer separate modules, drawn
// as separate boxes so the picture never suggests one block reused.
const BLOCK_X0 = 40, BLOCK_W = 60, BLOCK_PITCH = 88, ROW2_Y = 330, ROW2_MID = 350;
const blockIds = Array.from({ length: A.n_layer }, (unused, i) => `block-${i}`);
const blockObjects = blockIds.flatMap((id, i) => [
  box(id, `h[${i}]`, BLOCK_X0 + i * BLOCK_PITCH, ROW2_Y, BLOCK_W, 40),
  ...(i < A.n_layer - 1 ? [arrow(`${id}-next`, { x: BLOCK_X0 + i * BLOCK_PITCH + BLOCK_W + 3, y: ROW2_MID }, { x: BLOCK_X0 + (i + 1) * BLOCK_PITCH - 3, y: ROW2_MID })] : []),
]);
const lastBlockRight = BLOCK_X0 + (A.n_layer - 1) * BLOCK_PITCH + BLOCK_W;

// Row 3 sits on one line; y of its boxes and of the notes under them.
const ROW3_Y = 506, ROW3_MID = 528, SUB1 = 570, SUB2 = 588;

export const scene = {
  id: 'nanogpt-c01-forward-pass',
  title: 'NanoGPT forward pass: token IDs to logits',
  width: 960,
  height: 636,
  duration: 5.2,
  inputs: [
    { name: 'mode', type: 'index', label: 'Call site (preset)', of: 'modes', default: 0, presentation: 'picker' },
  ],
  exampleData: {
    modes: ['training step', 'generation step'],
    // Source: config/train_shakespeare_char.py over train.py defaults; V is
    // len(chars) of tinyshakespeare as data/shakespeare_char/prepare.py:25
    // computes it (all resolved by generate_fixtures.py).
    B: A.batch_size, T: A.block_size, C: A.n_embd, V: A.vocab_size, L: A.n_layer, p: A.dropout,
    modeCaptions: [
      'Training step: model(X, Y) → forward(idx=X, targets=Y)',
      'Generation step: self(idx_cond) → forward(idx=idx_cond), targets=None',
    ],
    btNotes: [
      'In this call: B = batch_size sequences, T = block_size characters each',
      'In this call: B = prompts in idx (one when sampling), T = tokens so far, cropped to block_size',
    ],
    // Dropout follows train()/eval(), not targets: estimate_loss passes
    // targets under model.eval() (train.py:218-227).
    dropNotes: ['dropout on: model.train()', 'dropout off: model.eval()'],
    sliceLabels: ['x, all T positions (B, T, C)', 'x[:, [-1], :]  (B, 1, C)'],
    sliceRoles: ['neutral', 'prediction'],
    sliceSubs: ['targets given: lm_head gets every position', 'targets None: only the last position'],
    headSubs: ['lm_head(x)', 'lm_head(x[:, [-1], :])'],
    logitsLabels: ['logits (B, T, V)', 'logits (B, 1, V)'],
    logitsSubs: ['a score row for every position', 'scores for the last position only'],
    lossLabels: ['loss (scalar)', 'loss = None'],
    lossRoles: ['output', 'neutral'],
    lossSubs: ['F.cross_entropy', 'targets is None'],
    targetsLabels: ['targets Y (B, T)', 'targets = None'],
    targetsRoles: ['observed', 'neutral'],
    targetsSubs: ['truth: next IDs', 'default: targets=None'],
    // logits feed the loss only when targets are given. In generation the
    // arrow's reveal step is a 'pause' marker, which changes no state, so the
    // arrow never shows and every object still enters in data-flow order.
    lossArrowSteps: ['appear', 'pause'],
  },
  derived: {
    modeCaption: { op: 'pick', args: ['modeCaptions', 'mode'] },
    btNote: { op: 'pick', args: ['btNotes', 'mode'] },
    dropNote: { op: 'pick', args: ['dropNotes', 'mode'] },
    sliceLabel: { op: 'pick', args: ['sliceLabels', 'mode'] },
    sliceRole: { op: 'pick', args: ['sliceRoles', 'mode'] },
    sliceSub: { op: 'pick', args: ['sliceSubs', 'mode'] },
    headSub: { op: 'pick', args: ['headSubs', 'mode'] },
    logitsLabel: { op: 'pick', args: ['logitsLabels', 'mode'] },
    logitsSub: { op: 'pick', args: ['logitsSubs', 'mode'] },
    lossLabel: { op: 'pick', args: ['lossLabels', 'mode'] },
    lossRole: { op: 'pick', args: ['lossRoles', 'mode'] },
    lossSub: { op: 'pick', args: ['lossSubs', 'mode'] },
    targetsLabel: { op: 'pick', args: ['targetsLabels', 'mode'] },
    targetsRole: { op: 'pick', args: ['targetsRoles', 'mode'] },
    targetsSub: { op: 'pick', args: ['targetsSubs', 'mode'] },
    lossArrowStep: { op: 'pick', args: ['lossArrowSteps', 'mode'] },
  },
  objects: [
    { id: 'question', type: 'text', semanticId: 'question', conceptId: CONCEPT,
      initialState: { text: 'What does each stage turn the tensor into - and what changes when the model generates?', x: 40, y: 34 } },
    header('mode-caption', '{{modeCaption}}', 62, 'caption'),
    header('config', 'Source value (no model runs here): B = batch_size = {{B}} · T = block_size = {{T}} · C = n_embd = {{C}} · n_layer = {{L}}', 86),
    header('vocab', 'V = vocab_size = {{V}}: the distinct characters in the Shakespeare text', 105),
    header('bt-note', '{{btNote}}', 124),

    // Row 1: IDs -> learned vectors, plus one vector per position, summed, dropout.
    box('idx', 'idx (B, T)', 40, 150, 130, 44, { role: 'input' }),
    note('idx-sub', 'integer token IDs', 40, 214),
    arrow('a-idx-tok', { x: 174, y: 172 }, { x: 200, y: 172 }),
    box('tok-emb', 'wte → tok_emb (B, T, C)', 204, 150, 230, 44, { identity: 'tied-weight' }),
    note('tok-emb-sub', 'ID → learned vector', 204, 214),
    box('pos-emb', 'wpe → pos_emb (T, C)', 204, 232, 230, 44),
    note('pos-emb-sub', 'arange(T): a vector per position', 204, 294),
    arrow('a-tok-plus', { x: 438, y: 182 }, { x: 462, y: 202 }),
    arrow('a-pos-plus', { x: 438, y: 244 }, { x: 462, y: 224 }),
    { id: 'plus', type: 'circle', semanticId: 'plus', conceptId: CONCEPT,
      initialState: { label: '+', x: 478, y: 213, w: 36, opacity: 0 } },
    arrow('a-plus-x', { x: 498, y: 213 }, { x: 522, y: 213 }),
    box('x-emb', 'drop → x (B, T, C)', 526, 191, 190, 44),
    note('x-sub-call', 'x = drop(tok_emb + pos_emb)', 526, 156),
    note('x-sub-bcast', 'the + broadcasts pos_emb (T, C) over B', 526, 174),
    note('x-sub-p', 'dropout p = {{p}}', 580, 256),
    note('x-sub-mode', '{{dropNote}}', 580, 274),
    note('x-sub-switch', 'model.train()/eval() switches it, not targets', 580, 292),

    // Row 1 -> row 2.
    line('c1-down', { x: 560, y: 239 }, { x: 560, y: 314 }),
    line('c1-left', { x: 560, y: 314 }, { x: 70, y: 314 }),
    arrow('c1-in', { x: 70, y: 314 }, { x: 70, y: 326 }),

    // Row 2: n_layer separate Blocks, then the final LayerNorm.
    ...blockObjects,
    arrow('a-blocks-ln', { x: lastBlockRight + 4, y: ROW2_MID }, { x: 572, y: ROW2_MID }),
    box('ln-f', 'ln_f → x (B, T, C)', 576, ROW2_Y, 180, 40),
    note('ln-f-sub', 'final LayerNorm', 770, 354),
    note('blocks-sub-1', '{{L}} separate Blocks in h (a ModuleList), run in order', 40, 394),
    note('blocks-sub-2', 'same architecture, each with its own learned weights - (B, T, C) in and out', 40, 412),

    // Row 2 -> the tensor lm_head receives, which depends on targets.
    line('c2-down', { x: 700, y: 374 }, { x: 700, y: 450 }),
    arrow('c2-left', { x: 700, y: 450 }, { x: 324, y: 450 }),
    box('slice', '{{sliceLabel}}', 40, 432, 280, 36, { role: { $derive: 'sliceRole' } }),
    note('slice-sub', '{{sliceSub}}', 340, 486),
    arrow('a-slice-head', { x: 130, y: 472 }, { x: 130, y: 502 }),

    // Row 3: vectors -> one score per vocabulary entry, then the loss branch.
    box('lm-head', 'lm_head (C → V)', 40, ROW3_Y, 180, 44, { identity: 'tied-weight' }),
    note('lm-head-sub', 'vector → a score per vocab entry', 40, SUB1),
    note('lm-head-sub-2', '{{headSub}}', 40, SUB2),
    arrow('a-head-logits', { x: 224, y: ROW3_MID }, { x: 252, y: ROW3_MID }),
    box('logits', '{{logitsLabel}}', 256, ROW3_Y, 190, 44, { role: 'prediction' }),
    note('logits-sub', '{{logitsSub}}', 256, SUB1),
    arrow('a-logits-loss', { x: 450, y: ROW3_MID }, { x: 478, y: ROW3_MID }),
    box('loss', '{{lossLabel}}', 482, ROW3_Y, 180, 44, { role: { $derive: 'lossRole' } }),
    note('loss-sub', '{{lossSub}}', 482, SUB1),
    arrow('a-targets-loss', { x: 698, y: ROW3_MID }, { x: 666, y: ROW3_MID }),
    box('targets', '{{targetsLabel}}', 702, ROW3_Y, 170, 44, { role: { $derive: 'targetsRole' } }),
    note('targets-sub', '{{targetsSub}}', 702, SUB1),

    // Footer.
    note('tying', 'Weight tying: wte.weight = lm_head.weight - one V × C matrix used by both coloured boxes.', 40, 618),
  ],
  timeline: [
    // Data-flow order in both presets: IDs, the two embeddings, their sum and
    // dropout, each Block in turn, ln_f, the tensor the head receives, the
    // head, logits, then the targets/loss branch.
    appear(0.0, 'idx'), appear(0.1, 'idx-sub'),
    appear(0.4, 'a-idx-tok', 0.2),
    appear(0.5, 'tok-emb'), appear(0.6, 'tok-emb-sub'),
    appear(0.8, 'pos-emb'), appear(0.9, 'pos-emb-sub'),
    appear(1.1, 'a-tok-plus', 0.2), appear(1.1, 'a-pos-plus', 0.2),
    appear(1.2, 'plus', 0.2), appear(1.25, 'x-sub-call'), appear(1.3, 'x-sub-bcast'),
    appear(1.35, 'a-plus-x', 0.2),
    appear(1.45, 'x-emb'),
    appear(1.5, 'x-sub-p'), appear(1.55, 'x-sub-mode'), appear(1.6, 'x-sub-switch'),
    appear(1.7, 'c1-down', 0.15), appear(1.75, 'c1-left', 0.15), appear(1.8, 'c1-in', 0.15),
    ...blockIds.flatMap((id, i) => [
      appear(1.9 + i * 0.2, id, 0.2),
      ...(i < A.n_layer - 1 ? [appear(2.0 + i * 0.2, `${id}-next`, 0.1)] : []),
    ]),
    appear(3.1, 'blocks-sub-1'), appear(3.1, 'blocks-sub-2'),
    appear(3.2, 'a-blocks-ln', 0.2),
    appear(3.3, 'ln-f'), appear(3.4, 'ln-f-sub'),
    appear(3.6, 'c2-down', 0.15), appear(3.65, 'c2-left', 0.15),
    appear(3.8, 'slice'), appear(3.85, 'slice-sub'),
    appear(3.95, 'a-slice-head', 0.15),
    appear(4.0, 'lm-head'), appear(4.1, 'lm-head-sub'), appear(4.1, 'lm-head-sub-2'),
    appear(4.2, 'tying'),
    appear(4.3, 'a-head-logits', 0.2),
    appear(4.4, 'logits'), appear(4.5, 'logits-sub'),
    appear(4.6, 'targets'), appear(4.65, 'targets-sub'),
    { at: 4.7, action: { $derive: 'lossArrowStep' }, target: 'a-logits-loss', duration: 0.2 },
    appear(4.7, 'a-targets-loss', 0.2),
    appear(4.8, 'loss'), appear(4.85, 'loss-sub'),
  ],
};

// Shown collapsed under the card; every line reference the card used to print lives here.
export const sources = [
  code('model.py', 170, 193, 'GPT.forward, the whole function this card draws. "def forward(self, idx, targets=None)": targets default to None.'),
  code('model.py', 184, 191, 'The branch the call site picks: with targets, "logits = self.lm_head(x)" and a cross-entropy loss; without, "logits = self.lm_head(x[:, [-1], :])" and "loss = None".'),
  code('model.py', 174, 179, 'Embeddings: "pos = torch.arange(0, t, dtype=torch.long, device=device)", "tok_emb = self.transformer.wte(idx)", "pos_emb = self.transformer.wpe(pos)", then "x = self.transformer.drop(tok_emb + pos_emb)".'),
  code('model.py', 180, 182, 'Each Block in transformer.h runs in order ("for block in self.transformer.h:", "x = block(x)"), then the final LayerNorm: "x = self.transformer.ln_f(x)".'),
  code('model.py', 130, 130, '"h = nn.ModuleList([Block(config) for _ in range(config.n_layer)])": n_layer separate Blocks, each with its own weights.'),
  code('model.py', 138, 138, 'Weight tying: "self.transformer.wte.weight = self.lm_head.weight".'),
  code('train.py', 300, 300, 'The training call site passes targets: "logits, loss = model(X, Y)".'),
  code('model.py', 314, 316, 'The generation call site: generate() crops idx to the last block_size tokens, then calls "logits, _ = self(idx_cond)" with no targets.'),
  code('train.py', 123, 125, 'get_batch: batch_size random offsets, block_size characters from each (B = batch_size, T = block_size); the targets are the same windows shifted one character: "y = torch.stack([torch.from_numpy((data[i+1:i+1+block_size]).astype(np.int64)) for i in ix])".'),
  code('sample.py', 81, 81, 'sample.py builds idx from one prompt: "x = (torch.tensor(start_ids, dtype=torch.long, device=device)[None, ...])", so B = 1.'),
  code('train.py', 218, 227, 'estimate_loss calls model(X, Y) with targets under model.eval(), then restores "model.train()" (line 227): dropout follows train()/eval(), not targets.'),
  code('sample.py', 51, 51, '"model.eval()" before sampling: dropout is off during generation.'),
  code('config/train_shakespeare_char.py', 18, 25, 'The sizes on the card: batch_size = 64, block_size = 256, n_layer = 6, n_embd = 384, and "dropout = 0.2" (line 25).'),
  code('data/shakespeare_char/prepare.py', 24, 25, '"chars = sorted(list(set(data)))" and "vocab_size = len(chars)": V is the number of distinct characters.'),
  code('train.py', 143, 143, "train.py reads V from the meta.pkl prepare.py wrote: \"meta_vocab_size = meta['vocab_size']\"."),
  calculation('Source value', 'B, T, C, n_layer, dropout p and V', "generate_fixtures.py read train.py's top-level defaults, executed config/train_shakespeare_char.py over them as configurator.py does, and took batch_size, block_size, n_embd, n_layer and dropout from the result; V = len(sorted(set(text))) over the sha-pinned Tiny Shakespeare file, as prepare.py computes it. No model runs on this card; the call-site picker only switches labels."),
  tinyShakespeare(`V = ${A.vocab_size} is the number of distinct characters in this file.`),
];

export const evidence = {
  card: 'c01-forward-pass',
  title: scene.title,
  learningQuestion: 'What does each stage turn the tensor into - and what changes when the model generates?',
  concept: 'GPT.forward: idx (B, T) IDs -> wte lookup (B, T, C) + wpe (T, C) broadcast over B -> dropout -> n_layer separate Blocks (B, T, C) -> ln_f -> lm_head scores over the vocabulary. With targets (model.py:184) lm_head scores every position and cross-entropy is computed; without targets only x[:, [-1], :] is projected and loss is None. Dropout is a separate switch: model.train()/eval().',
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: 'source: model.py:64,75,91,130,138,170-193,314,316; train.py:123-125,143,218-227,300; sample.py:51,81; config/train_shakespeare_char.py:18-25; data/shakespeare_char/prepare.py:25 (read at 3adf61e). Sizes and p: source, fx.architecture (config/train_shakespeare_char.py over train.py defaults; vocab_size = len(chars)) via generate_fixtures.py. No calculated toy example, recorded run or live calculation displays a number here; derive ops only pick state-following labels, roles and one reveal step.',
  control: 'mode (index, picker, labelled "Call site (preset)"): training step = train.py:300 model(X, Y) -> forward(idx=X, targets=Y); generation step = model.py:316 self(idx_cond) -> forward(idx=idx_cond), targets=None.',
  consequence: 'training: lm_head receives x with all T positions, logits (B, T, V), targets Y (B, T) feed a cross-entropy loss box, dropout on under model.train(); generation: lm_head receives x[:, [-1], :] (B, 1, C), logits (B, 1, V), targets = None and loss = None, no logits -> loss arrow, dropout off under model.eval() - labelled as a separate switch from targets.',
  interactionPurpose: 'Contrast the two call sites of the same forward(): the code path and tensor shapes up to ln_f are the same; dropout (at :179 and inside each Block, :64/:75/:91) is active only in train mode, which train()/eval() sets independently of targets; the head (which positions are projected, whether a loss exists) and the meaning of B/T change.',
  task: 'none (explore only - no Practice on this card)',
  capability: 'index picker input; pick-derived state-following labels and roles (lm_head input, logits, targets, loss); timeline reveals every stage in data-flow order in both presets, with no derived opacity - the one mode-only object (the logits -> loss arrow) gets a pick-derived reveal step (appear vs a no-op pause marker); n_layer Block boxes generated from fx.architecture; identity hue marks the tied wte/lm_head weight.',
};
