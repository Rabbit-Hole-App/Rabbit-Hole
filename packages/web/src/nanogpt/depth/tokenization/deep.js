// Tokenization · Deep dive - what the tokenizer choice costs inside the model,
// and where it breaks. The same line as the other two depths, now followed as
// tensors through NanoGPT's code: encode -> x (B, T) -> wte lookup (B, T, C) ->
// lm_head logits. Two implementation branches are the controls:
//   * meta - train.py's vocab_size branch: meta.pkl found (data/shakespeare_char,
//     V = 65 read as-is) or absent (from scratch it falls back to 50304, GPT-2's
//     50257 padded to a multiple of 64). With the shakespeare_char sizes kept
//     (C = 384 ...) the absent branch is a what-if, labelled as such.
//   * input - the training path (prepare.py's uint16 .bin files, get_batch) or
//     the sampling path (sample.py encodes one prompt, B = 1; generate() projects
//     only the last position). The digit prompt is the edge case: the character
//     encoder has no '1' (the play's only digit is 3), so stoi raises KeyError;
//     GPT-2's byte-level encoder cannot fail.
// Every step box is named after the source function or branch and has a code
// entry in `sources`; the card itself carries no code or line references.
//
// Numbers: sizes are source values (fx.architecture, i.e. config/train_shakespeare_
// char.py over train.py's defaults; gen_tokenization.py for the split sizes, the
// fallback vocab_size, the uint16 bound, the prompts' IDs). Every product - V, the
// padding, wte and whole-model parameter counts, logits per batch, context in
// characters, the bar lengths - is a derive op on the card. Derive ops print
// raw digits, so FIGURES runs the same ops once per state and groups them
// (1,003,854 not 1003854); shape tuples keep plain digits.
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import tok from '../fixtures/tokenization.generated.js';
import { buildPool } from '../../../scene-derive.js';
import { calculation, code, tinyShakespeare, tiktoken } from '../../sources.js';

const CONCEPT = 'tokenization';
const A = fx.architecture;
const [line, digits] = tok.prompts;
const PATHS = ['train', 'line', 'digits'];
// sample.py:81 builds x from one prompt: tensor(start_ids)[None, ...], so B = 1;
// generate() calls forward without targets, which projects x[:, [-1], :] (model.py:190).
const PROMPT_B = 1, LAST_ONLY = 1;
const byPath = (train, lineV, digitsV) => ({ train, line: lineV, digits: digitsV });
const quote = s => `“${s}”`;
const grouped = n => Math.round(n).toLocaleString('en-US');
const texGrouped = n => grouped(n).replaceAll(',', '{,}'); // KaTeX: a comma inside braces sets no space

// Layout: a branch row, then the data path as a column of steps with one
// detail line each; equations; the parameter bar; the tradeoff lines.
const STEP = { x: 40, w: 260, h: 36 };
const DETAIL_X = 320;
const ROWS = { branch: 96, encode: 150, batch: 204, wte: 258, head: 312 };
const EQ = { r1: 366, r2: 406, r3: 446 };
const PARAM = { title: 510, y: 520, h: 26, x: 40, pxPerParam: 0.00002 }; // 20 px per million parameters

const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, typography: 'annotation', ...extra } });
const step = (id, label, y, extra = {}) => ({ id, type: 'box', semanticId: id, conceptId: CONCEPT,
  initialState: { label, x: STEP.x, y, w: STEP.w, h: STEP.h, ...extra } });
const down = (id, fromY, toY) => ({ id, type: 'arrow', semanticId: id, conceptId: CONCEPT,
  initialState: { from: { x: STEP.x + STEP.w / 2, y: fromY }, to: { x: STEP.x + STEP.w / 2, y: toY }, role: 'neutral', opacity: { $derive: 'dim' } } });
const eq = (id, latex, x, y, w) => ({ id, type: 'equation', semanticId: id, conceptId: CONCEPT, initialState: { text: latex, x, y, w, h: 34 } });
const detail = (id, value, y, extra = {}) => text(id, value, DETAIL_X, y, extra);

const ONLY_DIGIT = `the only digit among the ${tok.vocab.length} characters is ${tok.digits.join(', ')}`;
const TRY_DIGITS = `Edge case to try: the digit prompt - ${ONLY_DIGIT}.`;
const TRY_META = 'Edge case to try: turn meta.pkl on, then pick the digit prompt.';
const EXAMPLE = {
  C: A.n_embd, L: A.n_layer, Cv: [A.n_embd], blockSize: A.block_size, blockSizeV: [A.block_size],
  // Record maps below are keyed by the bool's name: choose turns it into one.
  trueKey: 'true', falseKey: 'false',
  vMeta: tok.vocab.length, vFallback: tok.vocabFallback,
  charVocab: tok.vocab.length, bpeVocab: tok.bpe.vocab,
  one: [1],
  uint16Tex: texGrouped(tok.uint16Max),
  // Per block, bias=False: c_attn C x 3C, attn c_proj C x C, c_fc C x 4C,
  // mlp c_proj 4C x C (model.py:35,37,82,84) - weights in units of C squared -
  // plus ln_1 and ln_2, C weights each (model.py:98,100; LayerNorm has no bias).
  linearWidths: [3, 1, 4, 4],
  layerNormsPerBlock: 2,
  barX: [PARAM.x],
  labelGap: [PARAM.x + 10],
  B: { train: [A.batch_size], line: [PROMPT_B], digits: [PROMPT_B] },
  // IDs per sequence position: block_size for a training window, the prompt's
  // own length when sampling (0 where encode failed - that line is hidden).
  Tfound: byPath(A.block_size, line.char.ids.length, 0),
  Tabsent: byPath(A.block_size, line.bpe.ids.length, digits.bpe.ids.length),
  Tlogits: byPath([A.block_size], [LAST_ONLY], [LAST_ONLY]),
  Tname: byPath('T', '1', '1'),
  // GPT-2's rate is the whole play's average (characters / IDs), so its products are approximate.
  charsPerId: { true: 1, false: tok.chars.total / tok.bpe.total },
  rateShown: { true: '1', false: `≈${tok.bpe.charsPerId}` },
  approxMark: { true: '', false: '≈' },
  encoded: {
    found: byPath(`${grouped(tok.chars.train)} train IDs (first 90%), ${grouped(tok.chars.val)} val (last 10%)`,
      `${quote(line.text)} → ${line.char.ids.length} IDs`,
      `${quote(digits.text)} → ${digits.char.error}: the ${tok.vocab.length} characters have no ${quote(digits.char.missing)}`),
    absent: byPath(`${grouped(tok.bpe.train)} train IDs (first 90%), ${grouped(tok.bpe.val)} val (last 10%)`,
      `${quote(line.text)} → ${line.bpe.ids.length} IDs`,
      `${quote(digits.text)} → ${digits.bpe.ids.length} IDs: ${digits.bpe.ids.join(', ')}`),
  },
  encodeBox: { true: 'encode: stoi[c] per character', false: 'encode: GPT-2 byte pairs' },
  branchBox: { true: 'meta.pkl found: V read', false: 'no meta.pkl: V = fallback' },
  batchBox: byPath('get_batch: uint16 .bin', 'sample: one prompt, B = 1', 'sample: one prompt, B = 1'),
  headBox: byPath('lm_head: every position', 'lm_head: last position only', 'lm_head: last position only'),
  batchTail: byPath(', int64 read from uint16', ' - the encoded prompt', ' - the encoded prompt'),
  // Where the digit prompt stops: only with the character encoder.
  fails: { true: byPath(0, 0, 1), false: byPath(0, 0, 0) },
  dims: { true: byPath(1, 1, 0.35), false: byPath(1, 1, 1) },
  shows: { true: byPath(1, 1, 0), false: byPath(1, 1, 1) },
  encodeRole: { true: byPath('neutral', 'neutral', 'warning'), false: byPath('neutral', 'neutral', 'neutral') },
  // model.py's reason for the fallback's padding, shown only when there is padding.
  padWhy: { true: '', false: ' (multiple of 64, for efficiency)' },
  // The edge-case line follows the state: an invitation, or a pointer to the failure above.
  edgeText: {
    true: byPath(TRY_DIGITS, TRY_DIGITS, `Edge case shown above: ${ONLY_DIGIT}, so ${quote(digits.char.missing)} has no ID.`),
    false: byPath(TRY_META, TRY_META,
      `Edge case to try: turn meta.pkl on - the ${tok.vocab.length} characters have no ${quote(digits.char.missing)}; byte pairs encode any text.`),
  },
};
const LIVE = {
  metaKey: { op: 'choose', args: ['meta', 'trueKey', 'falseKey'] },
  // The branch: V, and how much of it is padding.
  V: { op: 'choose', args: ['meta', 'vMeta', 'vFallback'] },
  Vv: { op: 'concat', args: ['V'] },
  tokV: { op: 'choose', args: ['meta', 'charVocab', 'bpeVocab'] },
  tokVv: { op: 'concat', args: ['tokV'] },
  pad: { op: 'sub', args: ['Vv', 'tokVv'] },
  maxId: { op: 'sub', args: ['tokVv', 'one'] },
  // Parameters: wte = V x C; the rest per model.py's modules (get_num_params, wpe excluded).
  wte: { op: 'elementwise', args: ['Vv', 'Cv'] },
  cSq: { op: 'elementwise', args: ['Cv', 'Cv'] },
  widths: { op: 'sum', args: ['linearWidths'] },
  linears: { op: 'scale', args: ['cSq', 'widths'] },
  norms: { op: 'scale', args: ['Cv', 'layerNormsPerBlock'] },
  block: { op: 'add', args: ['linears', 'norms'] },
  blocks: { op: 'scale', args: ['block', 'L'] },
  body: { op: 'add', args: ['blocks', 'Cv'] }, // + ln_f
  total: { op: 'add', args: ['body', 'wte'] },
  bodyW: { op: 'scale', args: ['body', PARAM.pxPerParam] },
  wteW: { op: 'scale', args: ['wte', PARAM.pxPerParam] },
  wteX: { op: 'add', args: ['bodyW', 'barX'] },
  barsW: { op: 'add', args: ['bodyW', 'wteW'] },
  wteLabelX: { op: 'add', args: ['barsW', 'labelGap'] },
  // The data path for the chosen input.
  Bv: { op: 'pick', args: ['B', 'input'] },
  Tf: { op: 'pick', args: ['Tfound', 'input'] },
  Ta: { op: 'pick', args: ['Tabsent', 'input'] },
  T: { op: 'choose', args: ['meta', 'Tf', 'Ta'] },
  Tl: { op: 'pick', args: ['Tlogits', 'input'] },
  Tn: { op: 'pick', args: ['Tname', 'input'] },
  bt: { op: 'elementwise', args: ['Bv', 'Tl'] },
  logits: { op: 'elementwise', args: ['bt', 'Vv'] },
  // The context tradeoff: block_size IDs in characters of text.
  cpiTable: { op: 'pick', args: ['charsPerId', 'metaKey'] },
  ctx: { op: 'scale', args: ['blockSizeV', 'cpiTable'] },
  rate: { op: 'pick', args: ['rateShown', 'metaKey'] },
  about: { op: 'pick', args: ['approxMark', 'metaKey'] },
  // Labels, roles and visibility for the chosen branch and input.
  encF: { op: 'pick', args: ['encoded.found', 'input'] },
  encA: { op: 'pick', args: ['encoded.absent', 'input'] },
  enc: { op: 'choose', args: ['meta', 'encF', 'encA'] },
  encodeLabel: { op: 'pick', args: ['encodeBox', 'metaKey'] },
  branchLabel: { op: 'pick', args: ['branchBox', 'metaKey'] },
  batchLabel: { op: 'pick', args: ['batchBox', 'input'] },
  headLabel: { op: 'pick', args: ['headBox', 'input'] },
  tail: { op: 'pick', args: ['batchTail', 'input'] },
  failsNow: { op: 'pick', args: ['fails', 'metaKey'] },
  fail: { op: 'pick', args: ['failsNow', 'input'] },
  dimsNow: { op: 'pick', args: ['dims', 'metaKey'] },
  dim: { op: 'pick', args: ['dimsNow', 'input'] },
  showsNow: { op: 'pick', args: ['shows', 'metaKey'] },
  shown: { op: 'pick', args: ['showsNow', 'input'] },
  rolesNow: { op: 'pick', args: ['encodeRole', 'metaKey'] },
  encRole: { op: 'pick', args: ['rolesNow', 'input'] },
  why: { op: 'pick', args: ['padWhy', 'metaKey'] },
  edgesNow: { op: 'pick', args: ['edgeText', 'metaKey'] },
  edge: { op: 'pick', args: ['edgesNow', 'input'] },
};
// The live results above, digit-grouped for print: the same ops run at every
// state (meta x input), so each printed figure is the derive result itself.
const FIGURES = Object.fromEntries([true, false].map(meta => [String(meta), Object.fromEntries(PATHS.map(input => {
  const d = buildPool({ exampleData: { ...EXAMPLE, meta, input }, derived: LIVE });
  const raw = { V: d.V, tokV: d.tokV, maxId: d.maxId[0], wte: d.wte[0], total: d.total[0], logits: d.logits[0] };
  const text = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, grouped(v)]));
  const tex = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, texGrouped(v)]));
  return [input, { ...text, tex, ctx: `${d.about}${grouped(d.ctx[0])}` }];
}))]));

export const scene = {
  id: 'depth-tokenization-deep',
  title: 'Tokenization · Deep dive: what the tokenizer costs the model',
  width: 960,
  height: 612,
  duration: 1,
  inputs: [
    { name: 'meta', type: 'bool', label: 'meta.pkl found (character vocabulary)', default: true },
    { name: 'input', type: 'choice', label: 'Input', default: 'train',
      options: [{ id: 'train', label: 'Training batch' }, { id: 'line', label: 'Prompt: the play\'s line' }, { id: 'digits', label: `Prompt: ${digits.text}` }] },
  ],
  exampleData: { ...EXAMPLE, figures: FIGURES },
  derived: {
    ...LIVE,
    figuresNow: { op: 'pick', args: ['figures', 'metaKey'] },
    fig: { op: 'pick', args: ['figuresNow', 'input'] },
  },
  objects: [
    text('question', 'What does the tokenizer choice cost inside the model - and where does it break?', 40, 34, { typography: 'body' }),
    text('prerequisites', 'Builds on: Guided; matrix shapes (B, T, C)', 40, 58),
    text('status', 'Source value: sizes  ·  Live calculation: every product  ·  What-if: no meta.pkl with these sizes', 40, 80, { typography: 'caption' }),

    // The branch that sets V.
    step('branch', '{{branchLabel}}', ROWS.branch, { role: 'input' }),
    detail('branch-detail', 'V = {{fig.V}}: {{fig.tokV}} token IDs + {{pad.0}} padding rows{{why}}', ROWS.branch + 23),

    // The data path.
    step('encode', '{{encodeLabel}}', ROWS.encode, { role: { $derive: 'encRole' } }),
    detail('encode-detail', '{{enc}}', ROWS.encode + 23, { role: { $derive: 'encRole' } }),
    down('a-encode', ROWS.encode + STEP.h + 2, ROWS.batch - 2),
    step('batch', '{{batchLabel}}', ROWS.batch, { opacity: { $derive: 'dim' } }),
    detail('batch-detail', 'x: (B, T) = ({{Bv.0}}, {{T}}){{tail}}', ROWS.batch + 23, { opacity: { $derive: 'shown' } }),
    detail('not-reached', 'Nothing below runs: the prompt never became IDs.', ROWS.batch + 23, { role: 'warning', opacity: { $derive: 'fail' } }),
    down('a-batch', ROWS.batch + STEP.h + 2, ROWS.wte - 2),
    step('wte', 'wte: table ({{V}}, {{C}})', ROWS.wte, { opacity: { $derive: 'dim' } }),
    detail('wte-detail', 'tok_emb = wte(x): (B, T, C) = ({{Bv.0}}, {{T}}, {{C}})', ROWS.wte + 23, { opacity: { $derive: 'shown' } }),
    down('a-wte', ROWS.wte + STEP.h + 2, ROWS.head - 2),
    step('head', '{{headLabel}}', ROWS.head, { opacity: { $derive: 'dim' } }),
    detail('head-detail', 'logits: (B, {{Tn}}, V) = ({{Bv.0}}, {{Tl.0}}, {{V}}) → {{fig.logits}} scores', ROWS.head + 23, { opacity: { $derive: 'shown' } }),

    // The exact relations behind the numbers above.
    eq('eq-lookup', '\\text{tok\\_emb}[b,t,:] = W_{te}[\\,x[b,t],\\,:\\,],\\quad x \\in \\{0,\\dots,V{-}1\\}^{B \\times T}', 40, EQ.r1, 880),
    eq('eq-vocab', 'V = {{fig.tex.tokV}} + {{pad.0}} = {{fig.tex.V}}', 40, EQ.r2, 420),
    eq('eq-wte', '|W_{te}| = V\\,C = {{fig.tex.V}} \\cdot {{C}} = {{fig.tex.wte}}', 500, EQ.r2, 440),
    eq('eq-params', 'N = L\\,(12C^2 + 2C) + C + VC = {{fig.tex.total}}', 40, EQ.r3, 420),
    eq('eq-uint16', '\\max x = {{fig.tex.maxId}} \\le 2^{16} - 1 = {{uint16Tex}}', 500, EQ.r3, 420),

    // Where the parameters go: blocks + ln_f against the token table, same scale in both branches.
    text('param-title', 'N as get_num_params counts it (position table excluded), 20 px per million', 40, PARAM.title, { typography: 'caption' }),
    { id: 'param-body', type: 'box', semanticId: 'param-body', conceptId: CONCEPT,
      initialState: { label: 'blocks + ln_f', x: PARAM.x, y: PARAM.y, w: { $derive: 'bodyW.0' }, h: PARAM.h, role: 'neutral' } },
    { id: 'param-wte', type: 'box', semanticId: 'param-wte', conceptId: CONCEPT,
      initialState: { x: { $derive: 'wteX.0' }, y: PARAM.y, w: { $derive: 'wteW.0' }, h: PARAM.h, role: 'warning' } },
    text('param-wte-label', 'wte: {{fig.wte}} of {{fig.total}}', { $derive: 'wteLabelX.0' }, PARAM.y + 18, { typography: 'caption', role: 'warning' }),

    text('tradeoff', 'Tradeoff: block_size = {{blockSize}} IDs span {{fig.ctx}} characters ({{rate}} per ID)', 40, 580, { typography: 'body' }),
    text('edge', '{{edge}}', 40, 602),
  ],
  timeline: [],
};


const GEN = 'uv run --with tiktoken==0.14.0 python packages/web/src/nanogpt/depth/fixtures/gen_tokenization.py --check';

export const sources = [
  // The vocab_size branch.
  code('train.py', 137, 144, 'The branch the first control sets: "if os.path.exists(meta_path):" then "meta_vocab_size = meta[\'vocab_size\']" - 65 for data/shakespeare_char.'),
  code('train.py', 149, 156, 'From scratch: "model_args[\'vocab_size\'] = meta_vocab_size if meta_vocab_size is not None else 50304", then GPTConfig(**model_args). No padding when meta.pkl is found.'),
  code('model.py', 111, 111, 'The fallback explained: "vocab_size: int = 50304 # GPT-2 vocab_size of 50257, padded up to nearest multiple of 64 for efficiency".'),
  // encode.
  code('data/shakespeare_char/prepare.py', 29, 35, 'Character encode: "stoi = { ch:i for i,ch in enumerate(chars) }" and "encode(s): [stoi[c] for c in s]".'),
  code('data/shakespeare/prepare.py', 19, 22, 'GPT-2 encode for the training files: "enc = tiktoken.get_encoding("gpt2")", "enc.encode_ordinary(train_data)".'),
  code('sample.py', 56, 74, 'Sampling picks the encoder by the same file: resuming a checkpoint whose dataset folder has meta.pkl, "encode = lambda s: [stoi[c] for c in s]" (a character it never saw raises KeyError); otherwise "enc.encode(s, allowed_special={"<|endoftext|>"})", which encodes any text.'),
  // Storage and batching.
  code('data/shakespeare_char/prepare.py', 37, 40, 'The split is by position: "train_data = data[:int(n*0.9)]", "val_data = data[int(n*0.9):]" - validation is the last 10% of the play.'),
  code('data/shakespeare_char/prepare.py', 48, 52, 'IDs stored as "np.array(train_ids, dtype=np.uint16)" in train.bin / val.bin.'),
  code('data/shakespeare/prepare.py', 26, 30, 'The GPT-2 IDs are stored as uint16 too: 50256 still fits.'),
  code('train.py', 116, 125, 'get_batch: "np.memmap(..., dtype=np.uint16)", batch_size random offsets, x and y of block_size IDs each, ".astype(np.int64)" - x, y are (B, T).'),
  code('sample.py', 80, 81, 'One prompt: "start_ids = encode(start)", "x = (torch.tensor(start_ids, dtype=torch.long, device=device)[None, ...])" - B = 1, T = the prompt\'s length.'),
  // wte and lm_head.
  code('model.py', 127, 127, 'The table: "wte = nn.Embedding(config.vocab_size, config.n_embd)" - V rows of C numbers.'),
  code('model.py', 177, 177, 'The lookup: "tok_emb = self.transformer.wte(idx) # token embeddings of shape (b, t, n_embd)".'),
  code('model.py', 133, 133, '"self.lm_head = nn.Linear(config.n_embd, config.vocab_size, bias=False)": one score per vocabulary row.'),
  code('model.py', 138, 138, 'Weight tying: "self.transformer.wte.weight = self.lm_head.weight" - the V x C table is counted once.'),
  code('model.py', 184, 191, 'With targets (training) lm_head scores every position; without (generation) "logits = self.lm_head(x[:, [-1], :])", the last position only.'),
  // The parameter count.
  code('model.py', 150, 160, 'get_num_params: every parameter, minus the position table wpe when non_embedding=True; wte stays in because lm_head shares it.'),
  code('model.py', 35, 37, 'Attention weights per block: c_attn C x 3C and c_proj C x C (bias=False in this config).'),
  code('model.py', 82, 84, 'MLP weights per block: c_fc C x 4C and c_proj 4C x C.'),
  code('model.py', 96, 101, 'A Block: ln_1, attn, ln_2, mlp - two LayerNorms of C weights each.'),
  code('model.py', 21, 24, 'LayerNorm: a weight of ndim ones, and no bias when bias=False.'),
  code('model.py', 131, 131, 'The final "ln_f = LayerNorm(config.n_embd, bias=config.bias)": C more weights.'),
  code('config/train_shakespeare_char.py', 18, 24, 'The sizes: batch_size = 64, block_size = 256, n_layer = 6, n_head = 6, n_embd = 384.'),
  calculation('Source value', 'B, T, C and n_layer',
    'generate_fixtures.py read train.py\'s defaults and executed config/train_shakespeare_char.py over them, as configurator.py does.'),
  { ...calculation('Source value', 'Split sizes, the fallback vocab_size, the uint16 bound and the prompts\' IDs',
    `gen_tokenization.py: prepare.py's 90/10 split of the sha-pinned text (${tok.chars.train} / ${tok.chars.val} characters) and the same split through tiktoken "gpt2" (${tok.bpe.train} / ${tok.bpe.val} IDs) - both checked against the sizes the two prepare.py files print; ${tok.chars.total} / ${tok.bpe.total} = ${(tok.chars.total / tok.bpe.total).toFixed(4)} characters per GPT-2 ID over the whole text (printed ${tok.bpe.charsPerId}); the fallback ${tok.vocabFallback} parsed from train.py and checked against model.py and 64 x ceil(${tok.bpe.vocab} / 64); np.uint16's largest value ${tok.uint16Max}; sample.py's two encoders run on "${line.text}" and "${digits.text}" (the character encoder raises ${digits.char.error}; GPT-2 gives ${digits.bpe.ids.join(', ')}).`),
  reproduce: GEN },
  calculation('Live calculation', 'V, padding, parameter counts, logits, context and the bar',
    'Computed on the card from the source values: V by the branch (choose), padding = V - token IDs (sub), largest ID = token IDs - 1; wte = V x C; per block C^2 x (3 + 1 + 4 + 4) + 2C, times n_layer, plus C for ln_f, plus wte = N; logits = B x T\' x V (T\' = T in training, 1 when generating); context = block_size x characters per ID (the whole play\'s characters / GPT-2 IDs, printed rounded to the character); bar lengths = parameters x 20 px per million. The same ops run once per state when the card loads, only to print their results with digit grouping.'),
  calculation('What-if', 'No meta.pkl with the shakespeare_char sizes',
    'The branch off keeps config/train_shakespeare_char.py\'s sizes (C = 384, n_layer = 6, block_size = 256) with GPT-2 IDs - what "python train.py config/train_shakespeare_char.py --dataset=shakespeare" would build from scratch. Not a shipped configuration; the branch itself is train.py\'s.'),
  tinyShakespeare('The text both encoders split; its only digit is 3.'),
  tiktoken(`GPT-2's ${tok.bpe.vocab}-entry byte-level BPE: every string encodes, so it cannot raise on an unseen character.`),
];

export const evidence = {
  card: scene.id,
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'The tokenizer fixes V: meta.pkl gives 65 (read as-is); without it train.py falls back to 50304 (50257 padded to a multiple of 64). V sets the wte/lm_head table (V x C, tied), the logits (B, T, V), and with C = 384 moves wte from 0.2% to about 64% of get_num_params. GPT-2 IDs cover 3.3 characters each on average, so block_size = 256 spans about 845 characters. IDs are stored as uint16 (max 65535). The character encoder raises KeyError on an unseen character; byte-level BPE cannot.',
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: 'Source value: fx.architecture (generate_fixtures.py), gen_tokenization.py (split sizes vs prepare.py comments, fallback vocab_size from train.py/model.py, uint16 bound, sample.py encoders on two prompts). Live calculation: every product. What-if: the no-meta.pkl branch with shakespeare_char sizes.',
  control: 'meta - bool: meta.pkl found (train.py:140 os.path.exists branch); input - choice: Training batch | Prompt: the play\'s line | Prompt: Sonnet 18',
  consequence: 'meta off: V 65 -> 50304 (47 padding rows), the wte table, wte and N equations, logits count, the wte bar (sliver -> 64% of N), the encode step and the context tradeoff (256 -> about 845 characters) all change, and the branch line gives the reason for the padding (model.py). input: training shapes (64, 256) vs a prompt (1, T) with logits for the last position only; the digit prompt with meta on raises KeyError and dims every later step. The edge-case line follows the state: it invites the digit prompt, says to turn meta.pkl on first, or points at the failure already shown.',
  interactionPurpose: 'Flip the real implementation branches and trace their cost through exact shapes, equations and parameter counts, and trigger the one input where the character tokenizer breaks.',
  task: 'none (explore only)',
  capability: 'bool + choice inputs; choose/pick over record maps keyed by both; live products (concat, elementwise, sum, scale, add, sub) feeding KaTeX equations, shape readouts and a proportional bar; input-bound opacity and roles for the failing branch.',
  depth: 'Deep dive',
  prerequisites: 'Builds on: Guided; matrix shapes (B, T, C)',
  ladderRole: 'Only this depth follows the IDs into the model: exact shapes and equations, the vocab_size and training/sampling branches, the KeyError edge case and the quantified parameter/context tradeoff.',
};
export const reviewStates = [true, false].flatMap(meta => PATHS.map(input => ({ meta, input })));
