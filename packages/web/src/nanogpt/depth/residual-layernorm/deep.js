// Residual stream and LayerNorm, Deep dive - why NanoGPT's Block is wired the
// way it is. Three regions, each driven by one control:
//   A. the Block's wiring, pre-LN as in Block.forward (x + attn(ln_1(x)),
//      x + mlp(ln_2(x)), ln_f once after the last Block) or, as a what-if,
//      post-LN as in the original Transformer (LN(x + sublayer(x)), no ln_f):
//      what the identity path carries, as an equation, and what each layout
//      costs;
//   B. LayerNorm.forward at one position, with the eps edge cases: a constant
//      vector (variance 0: without eps the division is 0/0) and a nearly
//      constant one (variance below eps: eps shrinks x-hat);
//   C. the scaled init of the residual projections: _init_weights gives every
//      Linear and Embedding std 0.02, then only the parameters named
//      *c_proj.weight (attn.c_proj, mlp.c_proj) are re-drawn at 0.02 / sqrt(2 *
//      n_layer), so the std of what the 2 * n_layer residual adds write into
//      the stream stays at one branch's worth however deep the model is. The
//      bars show std, not variance: on one linear axis the scaled bars (1)
//      stay visible next to the unscaled sqrt(2L) ones (variance would be 1
//      against 2L = 96, a 1px sliver). This region is about pre-LN: in the
//      post-LN what-if the stream is re-normalized after every add, there is
//      no growing sum, and the bars give way to a note saying so.
//
// Every step in the diagram is one of model.py's modules or lines and has a
// code source entry; post-LN is a labelled what-if (paper source). Numbers: B,
// T, C, n_layer and warmup_iters are source values (fixtures); the LayerNorm
// cases and the init stds come from gen_residual-layernorm.py (square roots;
// eps and 0.02 parsed out of model.py); x0 is the same toy vector as the
// Overview and Guided cards. The bars (sqrt(2L) x each branch's std ratio) are
// computed live.
import fx from '../fixtures/residual-layernorm.generated.js';
import base from '../../fixtures/nanogpt-fixtures.generated.js';
import { code, calculation } from '../../sources.js';

const D = fx.deep;
const A = base.architecture;
const CONCEPT = 'pre-ln-block';
const REPRODUCE = 'python packages/web/src/nanogpt/depth/fixtures/gen_residual-layernorm.py --check';
const L = A.n_layer;
const CASES = Object.fromEntries(D.cases.map(c => [c.id, c]));
const SHAKESPEARE = D.init.find(d => d.nLayer === L);
const XL = D.init[D.init.length - 1];

// Region A geometry: the stream runs along HY, each sublayer branch hangs
// below it on BY; the (+) nodes are circles on the stream.
const HY = 160, BY = 222, BOX_H = 36, R = 18;
const PLUS1 = 310, PLUS2 = 670;
// Region B / C geometry.
const TOP = 424, BX = 40, CX = 500, BAR_CELL = 80;
const BARS = { x: CX + 24, y: 562, h: 100, cell: BAR_CELL, w: BAR_CELL * D.init.length, peak: Math.max(...D.init.map(d => d.sqrtAddsShown)) };

const obj = (id, type, initialState) => ({ id, type, semanticId: id, conceptId: CONCEPT, initialState });
const text = (id, value, x, y, extra = {}) => obj(id, 'text', { text: value, x, y, ...extra });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const box = (id, label, x, w, y = BY - BOX_H / 2, extra = {}) => obj(id, 'box', { label, x, y, w, h: BOX_H, ...extra });
const arrow = (id, from, to, extra = {}) => obj(id, 'arrow', { from, to, ...extra });
const line = (id, from, to) => obj(id, 'line', { from, to });
const p = (x, y) => ({ x, y });
// Shown only in one layout: opacity follows the control, never the timeline.
const PRE = { opacity: { $derive: 'preOnly' } };
const POST = { opacity: { $derive: 'postOnly' } };
const WARMUP = { defaults: base.config.defaults.warmup_iters, shakespeare: base.config.shakespeareChar.warmup_iters };

export const scene = {
  id: 'depth-residual-layernorm-deep',
  title: 'Residual stream and LayerNorm · Deep dive: pre-LN, eps and the scaled init',
  width: 960,
  height: 740,
  duration: 2.4,
  inputs: [
    { name: 'layout', type: 'choice', label: 'Block layout', default: 'pre',
      options: [{ id: 'pre', label: 'Pre-LN (NanoGPT)' }, { id: 'post', label: 'Post-LN (what-if)' }] },
    { name: 'vector', type: 'choice', label: 'Vector entering LayerNorm', default: 'x0',
      options: [{ id: 'x0', label: 'x₀ (as in Guided)' }, { id: 'near', label: 'Nearly constant' }, { id: 'constant', label: 'Constant (σ² = 0)' }] },
    { name: 'scaledInit', type: 'bool', label: 'Scale the c_proj weights only (as NanoGPT)', default: true },
  ],
  exampleData: {
    preOnlyBy: { pre: 1, post: 0 },
    postOnlyBy: { pre: 0, post: 1 },
    statusBy: {
      pre: 'Source value: NanoGPT’s Block.forward (pre-LN)',
      post: 'What-if: post-LN, the original Transformer’s layout, not NanoGPT',
    },
    statusRoleBy: { pre: 'output', post: 'warning' },
    repeatBy: {
      pre: `Block ×${L} (n_layer), then ln_f, then lm_head`,
      post: `Block ×${L}; the last LN feeds lm_head directly`,
    },
    equationBy: {
      pre: 'x_{k+1} = x_k + F_k(\\mathrm{LN}_k(x_k))\\;\\Rightarrow\\;x_{2L} = x_0 + \\sum_{k<2L} F_k(\\mathrm{LN}_k(x_k))',
      post: 'x_{k+1} = \\mathrm{LN}_k(x_k + F_k(x_k))\\;\\Rightarrow\\;x_0\\text{ re-normalized at all }2L\\text{ adds}',
    },
    identityBy: {
      pre: 'Identity path: x₀ reaches ln_f untouched; sublayers only add.',
      post: 'Identity path: x₀ is divided by a new std at every one of the 2L adds.',
    },
    costBy: {
      pre: 'Cost: the stream grows with depth (so ln_f, scaled init); warmup matters less.',
      post: 'Cost: large gradients near the output at init; post-LN needs a learning-rate warmup.',
    },
    cases: CASES,
    epsText: D.epsText,
    initStd: D.initStd,
    xLabelBy: {
      x0: 'Calculated toy example: x₀, a toy C = 6',
      near: 'Calculated toy example: x = 0.5 + 0.001·x₀',
      constant: 'Calculated toy example: x = 0.5 everywhere',
    },
    nearOnlyBy: { x0: 0, near: 1, constant: 0 },
    edgeBy: {
      x0: 'σ² ≫ ε: ε changes nothing you can see.',
      near: 'σ² < ε: ε dominates the root and shrinks x̂.',
      constant: 'σ² = 0: without ε, x̂ = 0 / 0; with ε, x̂ = 0.',
    },
    edgeRoleBy: { x0: 'neutral', near: 'warning', constant: 'warning' },
    sqrtAdds: D.init.map(d => d.sqrtAdds),
    sqrtAddsShown: D.init.map(d => d.sqrtAddsShown),
    stdRatio: D.init.map(d => d.stdRatio),
    stdBy: {
      scaled: `c_proj std ${SHAKESPEARE.scaledStdText} at n_layer ${L} … ${XL.scaledStdText} at ${XL.nLayer}`,
      plain: `What-if: c_proj std ${D.initStd} at all depths: grows as √(2L)`,
    },
    barsRoleBy: { scaled: 'output', plain: 'warning' },
  },
  derived: {
    preOnly: { op: 'pick', args: ['preOnlyBy', 'layout'] },
    postOnly: { op: 'pick', args: ['postOnlyBy', 'layout'] },
    status: { op: 'pick', args: ['statusBy', 'layout'] },
    statusRole: { op: 'pick', args: ['statusRoleBy', 'layout'] },
    repeat: { op: 'pick', args: ['repeatBy', 'layout'] },
    equation: { op: 'pick', args: ['equationBy', 'layout'] },
    identity: { op: 'pick', args: ['identityBy', 'layout'] },
    cost: { op: 'pick', args: ['costBy', 'layout'] },
    case: { op: 'pick', args: ['cases', 'vector'] },
    edge: { op: 'pick', args: ['edgeBy', 'vector'] },
    xLabel: { op: 'pick', args: ['xLabelBy', 'vector'] },
    nearOnly: { op: 'pick', args: ['nearOnlyBy', 'vector'] },
    edgeRole: { op: 'pick', args: ['edgeRoleBy', 'vector'] },
    // Live: the std of 2L uncorrelated branches is sqrt(2L) times one branch's,
    // and each scaled branch's std is (std / 0.02) of an unscaled one.
    scaledStdSum: { op: 'elementwise', args: ['sqrtAdds', 'stdRatio'] },
    bars: { op: 'choose', args: ['scaledInit', 'scaledStdSum', 'sqrtAddsShown'] },
    barsRole: { op: 'choose', args: ['scaledInit', 'barsRoleBy.scaled', 'barsRoleBy.plain'] },
    stdText: { op: 'choose', args: ['scaledInit', 'stdBy.scaled', 'stdBy.plain'] },
  },
  objects: [
    text('question', 'Why does NanoGPT normalize before each sublayer, and what keeps its stream stable?', 40, 34),
    note('prerequisites', 'Builds on: Guided; tensor shapes (B, T, C) and the variance of a sum', 40, 58),
    text('status', '{{status}}', 40, 84, { typography: 'caption', role: { $derive: 'statusRole' } }),

    // --- A. the Block's wiring -------------------------------------------------------
    note('stream-label', `residual stream x: (B, T, C) = (${A.batch_size}, ${A.block_size}, ${A.n_embd})`, 40, 128),
    arrow('hw-in', p(40, HY), p(PLUS1 - R - 1, HY), { role: 'input' }),
    line('split-1', p(62, HY), p(62, BY)),
    arrow('to-ln1', p(62, BY), p(86, BY), PRE),
    box('ln1', 'ln_1', 90, 72, undefined, PRE),
    arrow('ln1-attn', p(164, BY), p(186, BY), PRE),
    arrow('to-attn', p(62, BY), p(186, BY), POST),
    box('attn', 'attn', 190, 90),
    line('attn-out', p(280, BY), p(PLUS1, BY)),
    arrow('attn-up', p(PLUS1, BY), p(PLUS1, HY + R + 2)),
    obj('plus-1', 'circle', { label: '+', x: PLUS1, y: HY, w: 2 * R, role: 'input' }),
    arrow('hw-mid', p(PLUS1 + R + 1, HY), p(PLUS2 - R - 1, HY), { role: 'input', ...PRE }),
    arrow('to-ln-a', p(PLUS1 + R + 1, HY), p(346, HY), { role: 'input', ...POST }),
    box('ln-a', 'LN', 350, 60, HY - BOX_H / 2, { role: 'warning', ...POST }),
    arrow('hw-mid-post', p(412, HY), p(PLUS2 - R - 1, HY), { role: 'input', ...POST }),
    line('split-2', p(434, HY), p(434, BY)),
    arrow('to-ln2', p(434, BY), p(456, BY), PRE),
    box('ln2', 'ln_2', 460, 72, undefined, PRE),
    arrow('ln2-mlp', p(534, BY), p(556, BY), PRE),
    arrow('to-mlp', p(434, BY), p(556, BY), POST),
    box('mlp', 'mlp', 560, 90),
    line('mlp-out', p(650, BY), p(PLUS2, BY)),
    arrow('mlp-up', p(PLUS2, BY), p(PLUS2, HY + R + 2)),
    obj('plus-2', 'circle', { label: '+', x: PLUS2, y: HY, w: 2 * R, role: 'input' }),
    arrow('hw-out', p(PLUS2 + R + 1, HY), p(778, HY), { role: 'input', ...PRE }),
    box('ln-f', 'ln_f', 782, 64, HY - BOX_H / 2, PRE),
    arrow('lnf-head', p(848, HY), p(862, HY), PRE),
    arrow('to-ln-b', p(PLUS2 + R + 1, HY), p(706, HY), { role: 'input', ...POST }),
    box('ln-b', 'LN', 710, 60, HY - BOX_H / 2, { role: 'warning', ...POST }),
    arrow('hw-out-post', p(772, HY), p(862, HY), { role: 'input', ...POST }),
    box('lm-head', 'lm_head', 866, 76, HY - BOX_H / 2, { role: 'output' }),
    note('repeat', '{{repeat}}', 40, 266),
    obj('equation', 'equation', { text: '{{equation}}', x: 40, y: 280, w: 880, h: 40 }),
    text('identity', '{{identity}}', 40, 344),
    note('cost', '{{cost}}', 40, 366),
    note('warmup', `NanoGPT (pre-LN) still warms up: ${WARMUP.defaults} steps by default, ${WARMUP.shakespeare} for Shakespeare-char.`, 40, 388),

    // --- B. LayerNorm.forward at one position, and eps -------------------------------
    note('ln-head', 'LayerNorm over C at one (b, t); ε = {{epsText}}', BX, TOP),
    obj('ln-eq', 'equation', { text: '\\hat x = \\dfrac{x - \\mu}{\\sqrt{\\sigma^2 + \\epsilon}}', x: BX, y: TOP + 8, w: 420, h: 60 }),
    obj('x-strip', 'strip', { label: '{{xLabel}}', x: BX, y: 520, cell: 44, values: { $derive: 'case.x' }, role: 'input', opacity: 0 }),
    note('stats', 'μ = {{case.meanText}} · σ² = {{case.varText}}', 320, 534, { opacity: 0 }),
    note('std', '√(σ² + ε) = {{case.stdText}}', 320, 554, { opacity: 0 }),
    // The strip prints 2 decimals, so the nearly constant vector would read as
    // six .50s - the same as the constant one. Its 4-decimal values, shown only for it.
    note('near-exact', `4 decimals: ${CASES.near.x.map(v => v.toFixed(4)).join('  ')}`, BX, 580, { opacity: { $derive: 'nearOnly' }, role: 'input' }),
    obj('xhat-strip', 'strip', { label: 'x̂ (before × γ)', x: BX, y: 626, cell: 44, values: { $derive: 'case.xhat' }, role: 'output', opacity: 0 }),
    note('ratio', 'mean of x̂² = σ²/(σ²+ε) = {{case.ratio}}', 320, 636, { opacity: 0 }),
    note('no-eps', 'without ε: √σ² = {{case.noEpsText}}', 320, 654, { opacity: 0 }),
    text('edge', '{{edge}}', BX, 700, { typography: 'caption', role: { $derive: 'edgeRole' } }),
    note('bias', 'then × γ; + β only if bias=True (GPT-2 checkpoints)', BX, 724),

    // --- C. the scaled init -----------------------------------------------------------
    // Scaled: only the two residual projections' weights (named *c_proj.weight).
    note('init-head', 'only attn.c_proj (C, C), mlp.c_proj (C, 4·C):', CX, TOP),
    // Full-size slash, not a fraction: a text-style fraction shrinks 0.02 to
    // about 7px, and a display-style one has its digits clipped at the box top.
    obj('init-eq', 'equation', { text: '\\sigma_{c\\_proj} = {{initStd}}\\,/\\sqrt{2L}', x: CX, y: TOP + 20, w: 340, h: 40 }),
    // Secondary, beside the equation (whose drawn formula ends near x = 650).
    note('init-rest', `other Linear/Embedding: std ${D.initStd}`, 690, TOP + 38),
    // The growing sum exists only in pre-LN: in the post-LN what-if the rest of
    // this region gives way to a note.
    obj('sum-eq', 'equation', { text: '\\mathrm{std}(\\sum_{k<2L}F_k)\\propto\\sigma\\sqrt{2L}', x: CX, y: TOP + 74, w: 450, h: 34, ...PRE }),
    // The unscaled stds stay drawn in grey behind the live bars, so the scaled
    // init's flat 1-unit bars read against what they replace.
    obj('bars-ref', 'bars', { ...BARS, role: 'neutral', values: { $derive: 'sqrtAddsShown' }, ...PRE }),
    obj('bars', 'bars', { ...BARS, label: 'Live calculation: std of the sum by n_layer (grey: unscaled)', role: { $derive: 'barsRole' }, ...PRE,
      labels: D.init.map((d, i) => `${d.nLayer}: ×{{bars.${i}}}`), values: { $derive: 'bars' } }),
    note('std-text', '{{stdText}}', CX, 700, PRE),
    note('unit', `Source value: ×1 = one branch at std ${D.initStd}`, CX, 722, PRE),
    // At the bars' top edge: lower, it would run into region B's ratio line (x = 320, y = 636).
    note('post-1', 'Post-LN re-normalizes after every add, so no branch sum', CX, BARS.y, { role: 'warning', ...POST }),
    note('post-2', 'builds up: the bars and c_proj switch are pre-LN only.', CX, BARS.y + 20, { role: 'warning', ...POST }),
  ],
  timeline: [
    { at: 0.0, action: 'appear', target: 'x-strip', duration: 0.3 },
    { at: 0.3, action: 'appear', target: 'stats', duration: 0.2 },
    { at: 0.5, action: 'appear', target: 'std', duration: 0.2 },
    { at: 0.8, action: 'appear', target: 'xhat-strip', duration: 0.3 },
    { at: 1.0, action: 'appear', target: 'ratio', duration: 0.2 },
    { at: 1.2, action: 'appear', target: 'no-eps', duration: 0.2 },
  ],
};

const initNote = D.init.map(d => `n_layer ${d.nLayer} (${d.from}): 2L = ${d.adds}, std ${d.scaledStdText}`).join('; ');

export const sources = [
  code('model.py', 103, 106, 'Block.forward, pre-LN: “x = x + self.attn(self.ln_1(x))” then “x = x + self.mlp(self.ln_2(x))” - LayerNorm sits on the branch; the stream x itself is only ever added to.'),
  code('model.py', 98, 101, 'Block.__init__: “self.ln_1 = LayerNorm(config.n_embd, bias=config.bias)”, then attn, ln_2 and mlp - the four boxes on the branches.'),
  code('model.py', 18, 27, 'LayerNorm: γ = ones(ndim), β = zeros(ndim) only if bias, and “F.layer_norm(input, self.weight.shape, self.weight, self.bias, 1e-5)” - normalized over the last dimension, C, with eps = 1e-5.'),
  code('model.py', 53, 53, '“B, T, C = x.size() # batch size, sequence length, embedding dimensionality (n_embd)” - the stream’s shape inside every Block.'),
  code('model.py', 130, 131, '“h = nn.ModuleList([Block(config) for _ in range(config.n_layer)]),” and “ln_f = LayerNorm(config.n_embd, bias=config.bias),” - n_layer separate Blocks, and one more LayerNorm built once.'),
  code('model.py', 180, 182, '“for block in self.transformer.h: x = block(x)” then “x = self.transformer.ln_f(x)” - pre-LN leaves the stream un-normalized until ln_f.'),
  code('model.py', 133, 133, '“self.lm_head = nn.Linear(config.n_embd, config.vocab_size, bias=False)” - it reads ln_f’s output.'),
  code('model.py', 162, 168, '_init_weights: “torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)” for every nn.Linear and nn.Embedding.'),
  code('model.py', 142, 145, 'The scaled init: “if pn.endswith(\'c_proj.weight\'): torch.nn.init.normal_(p, mean=0.0, std=0.02/math.sqrt(2 * config.n_layer))” - “per GPT-2 paper”. Only two weights per Block match, attn.c_proj.weight and mlp.c_proj.weight; c_attn, c_fc, lm_head and the embeddings keep std 0.02.'),
  code('model.py', 37, 37, '“self.c_proj = nn.Linear(config.n_embd, config.n_embd, bias=config.bias)” - weight (C, C): the attention branch’s last projection into the stream.'),
  code('model.py', 84, 84, '“self.c_proj = nn.Linear(4 * config.n_embd, config.n_embd, bias=config.bias)” - weight (C, 4·C): the MLP branch’s last projection into the stream.'),
  code('train.py', 56, 56, '“bias = False # do we use bias inside LayerNorm and Linear layers?” - no β by default.'),
  code('model.py', 225, 225, "“config_args['bias'] = True # always True for GPT model checkpoints” - GPT-2 weights bring a β."),
  code('config/train_shakespeare_char.py', 18, 24, `“batch_size = ${A.batch_size}”, “block_size = ${A.block_size}”, “n_layer = ${A.n_layer}”, “n_embd = ${A.n_embd}” - B, T, n_layer and C for the Shakespeare-char model.`),
  code('train.py', 52, 52, `“n_layer = ${D.init[1].nLayer}” - train.py’s default depth (GPT-2 small).`),
  code('train.py', 66, 66, `“warmup_iters = ${WARMUP.defaults} # how many steps to warm up for” - NanoGPT’s default learning-rate warmup, pre-LN or not.`),
  code('train.py', 232, 234, '“# 1) linear warmup for warmup_iters steps” then “return learning_rate * (it + 1) / (warmup_iters + 1)” - get_lr ramps the rate up over the warmup.'),
  code('config/train_shakespeare_char.py', 33, 33, `“warmup_iters = ${WARMUP.shakespeare} # not super necessary potentially” - the Shakespeare-char run keeps a short warmup anyway.`),
  code('model.py', 216, 221, `from_pretrained’s config_args, e.g. “'gpt2-xl': dict(n_layer=${D.init[4].nLayer}, n_head=25, n_embd=1600)” - n_layer ${D.init.slice(1).map(d => d.nLayer).join(', ')} for gpt2 … gpt2-xl, the other bar depths.`),
  { kind: 'paper', title: 'Attention Is All You Need (Vaswani et al., 2017), section 3.1', arxiv: '1706.03762',
    note: 'The original Transformer’s post-LN arrangement, “LayerNorm(x + Sublayer(x))” - the card’s what-if layout. Not what NanoGPT does.' },
  { kind: 'paper', title: 'On Layer Normalization in the Transformer Architecture (Xiong et al., 2020)', arxiv: '2002.04745',
    note: 'Post-LN has large expected gradients near the output at initialization, which is why it needs a learning-rate warmup; pre-LN’s are well-behaved, and pre-LN trains without the warmup stage in their experiments. The card’s “cost” lines; NanoGPT, pre-LN, still keeps a warmup.' },
  { kind: 'paper', title: 'Language Models are Unsupervised Multitask Learners (GPT-2), section 2.3',
    url: 'https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf',
    note: 'LayerNorm moved to the input of each sub-block, an extra LayerNorm after the final block, and residual weights scaled at init by 1/√N for N residual layers - the design model.py follows.' },
  { kind: 'calculation', status: 'Source value', title: 'eps, the 0.02 init std, n_layer, B, T, C, warmup_iters',
    note: `gen_residual-layernorm.py parses eps = ${D.eps} out of LayerNorm.forward, std 0.02 out of _init_weights and 0.02 / sqrt(${D.addsPerLayer} * n_layer) out of the scaled init; n_layer ${D.init.map(d => d.nLayer).join(', ')} come from config/train_shakespeare_char.py, train.py and from_pretrained, and it computes √(2 · n_layer) = ${D.init.map(d => d.sqrtAdds).join(', ')} (the unscaled bars show 2 decimals) and std / 0.02 for the bars (the card cannot take a square root). B, T, C and warmup_iters (${WARMUP.defaults} in train.py, ${WARMUP.shakespeare} for Shakespeare-char) are the base fixture’s resolved config.`,
    reproduce: REPRODUCE },
  { kind: 'calculation', status: 'Calculated toy example', title: 'LayerNorm on x₀, a nearly constant and a constant vector',
    note: `x₀ = [${CASES.x0.x.join(', ')}] (generate_fixtures.layernorm(), shared with the Overview and Guided cards); nearly constant = 0.5 + 0.001 · x₀; constant = 0.5 everywhere - toy choices. gen_residual-layernorm.py computes μ, the biased σ², √(σ² + ε), x̂ (4 decimals), σ²/(σ² + ε) and √σ² (0 for the constant vector, so without ε x̂ would be 0 / 0) as F.layer_norm does; the card cannot take a square root. Scaled c_proj std: ${initNote}.`,
    reproduce: REPRODUCE },
  calculation('Live calculation', 'The bars: std of the summed branches by depth',
    'Computed on the card: with the scaled init, elementwise(√(2L), std / 0.02) - the std of 2L uncorrelated branches is √(2L) times one branch’s, and each scaled branch’s std is std / 0.02 = 1/√(2L) of an unscaled one, so the product is 1 at every depth; without it the std of the sum is √(2L). 1 unit = one average branch at std 0.02 (attention and MLP branches differ by a fixed factor; the scaled-to-unscaled ratio does not depend on it). Assumes the branch outputs are uncorrelated at init, so their variances add.'),
];

export const evidence = {
  card: 'depth-residual-layernorm-deep',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'NanoGPT is pre-LN: x_{k+1} = x_k + F_k(LN_k(x_k)), so the identity path carries x₀ untouched to ln_f and the un-normalized stream needs ln_f at the end and a depth-scaled init of the residual projections only (the attn.c_proj and mlp.c_proj weights, std 0.02/√(2·n_layer); every other Linear and Embedding keeps std 0.02) so the summed variance of the 2L residual branches does not grow with depth. Post-LN (the original Transformer) re-normalizes x₀ at every add and needs warmup. LayerNorm’s eps = 1e-5 keeps a constant vector finite (x̂ = 0 instead of 0/0) and shrinks x̂ when σ² < ε.',
  sourceRevision: `${fx.provenance.nanogpt.repo} @ ${fx.provenance.nanogpt.commit}`,
  provenance: 'source value: model.py:103-106, :98-101, :18-27, :53, :130-131, :180-182, :133, :162-168, :142-145, :37, :84, :225, :216-221; train.py:52, :56, :66, :232-234; config/train_shakespeare_char.py:18-24, :33 (eps, 0.02 and the scaled init parsed by gen_residual-layernorm.py); papers: arXiv 1706.03762 (post-LN), 2002.04745 (warmup), GPT-2 section 2.3; calculated toy example: LayerNorm cases from gen_residual-layernorm.py; live calculation: bars = choose(scaled, elementwise(√(2L), std / 0.02), √(2L)).',
  control: 'layout (choice: pre-LN NanoGPT / post-LN what-if), vector (choice: x₀ / nearly constant / constant), scaledInit (bool, default true).',
  consequence: 'layout: the LN boxes move from the branches onto the stream, ln_f disappears, the equation, identity-path and cost lines switch and the status turns What-if; the depth bars give way to a note, since post-LN has no growing sum, which also says the scaledInit switch acts on pre-LN only. vector: x₀ gives σ² ≫ ε and mean x̂² = 1; nearly constant (its 4-decimal values shown) gives σ² = 3.78e-6 < ε and mean x̂² = 0.27; constant gives σ² = 0, x̂ = 0 (0/0 without ε). scaledInit (pre-LN): the std of the summed branches goes from √(2L) (×3.46 … ×9.8, a What-if in the warning colour) to ×1 at every depth, and the c_proj std text shows 0.00577 … 0.00204. The warmup line states NanoGPT’s own warmup (2000 steps by default, 100 for Shakespeare-char).',
  interactionPurpose: 'Switch an implementation branch (layout), trigger the eps edge case (vector) and toggle the engineering choice (scaled init) that the equations explain, each on its own region of the card.',
  task: 'Explore only: compare what the identity path carries in each layout, find the input where ε matters, and read how the scaled init keeps the summed branch variance flat across depths.',
  capability: 'two choice inputs + one bool; pick over record maps for layout- and vector-dependent strings, roles and opacity (input-bound visibility, no timeline on those objects); derived LaTeX equation text; elementwise and choose for the live bars; {{}} inside bar labels; code sources for every diagram step.',
  depth: 'Deep dive',
  prerequisites: 'Builds on: Guided; tensor shapes (B, T, C) and the variance of a sum.',
  ladderRole: 'Connects the mechanism to the exact implementation: equations, named tensor shapes, the pre-LN vs post-LN branch, the eps edge case and the depth-scaled init tradeoff, every diagram step tied to a source line.',
};

export const reviewStates = [
  { layout: 'pre', vector: 'x0', scaledInit: true },
  { layout: 'post', vector: 'x0', scaledInit: true },
  { layout: 'pre', vector: 'constant', scaledInit: true },
  { layout: 'pre', vector: 'near', scaledInit: true },
  { layout: 'pre', vector: 'x0', scaledInit: false },
  { layout: 'post', vector: 'near', scaledInit: false },
];
