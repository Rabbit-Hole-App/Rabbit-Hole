// Card 10 - one head's output: the weights mix the values. Sequence
// "Self-attention", 3 of 3 (c11 causal mask -> c12 score scaling -> this);
// c13 (multi-head) deepens it. Replaces the reused attention explorer on this
// board: its mask and softmax steps are c11's and c12's, so only the last
// step, y = att @ v for one row of one head (model.py:71), is left here.
//
// Characters, not BPE (owner, batch-3 question 4): the first four characters
// of the same "Before we…" line c11, c12 and c05 use. A calculated toy
// example with hs = 2, so every value vector is a point on a plane: Q, K, V
// are typed in here; the weight row (q·k × 1/√hs, causal mask, softmax), the
// output and every dot position are live derive ops. The query is the one
// control; later characters fade (weight exactly 0, no pull). The practice
// asks for an equal-weight mix the card never draws.
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { buildPool, canonical } from '../../scene-derive.js';
import { code, calculation, tinyShakespeare } from '../sources.js';

const TOKENS = fx.tokenizer.tokenizers.find(t => t.id === 'char').tokens.slice(0, 4); // B e f o
const A = fx.architecture;
const HS = 2;
// Calculated toy example: hand-typed, not trained (the test pins them).
export const Q = [[1, 0], [0, 1], [1, 1], [1, -1]];
export const K = [[1, 0], [0, 1], [1, 1], [-1, 1]];
export const V = [[1, 0], [-1, 0], [0, 1], [1, 1]];

// The plane: an affine layout map from a value (v1, v2) to scene units.
export const PLANE = { x0: 250, y0: 540, unit: 150 };
const toPx = ([v1, v2]) => [PLANE.x0 + PLANE.unit * v1, PLANE.y0 - PLANE.unit * v2];
const VPX = V.map(toPx);
const AXIS = { left: 60, bottom: 590, top: 340, right: 450 };
const DOT = 20, OUT_DOT = 14, MEAN_DOT = 12; // the output sits inside a value's ring at B
const CELL = 56;
const VT = { x: 640, y: 150 };           // the value table
const OUT_Y = VT.y + 4 * CELL + 66;      // the output row, column-aligned under it
const LEGEND_X = 520, LEGEND_Y = 532;    // right of the plane
const RULE_Y = 250;                      // left column, under the weight row
const FOOT_Y = 648;                      // under the plane
const RULE = [
  'At generation the weights are never negative and add up',
  'to 1, so the output is a weighted average of the values it',
  'can see - not their sum - and lands between them.',
];
// Name labels sit 26px outward from their dot: below for the dim-2 = 0 row,
// above for dim-2 = 1 (no dot carries a label of its own).
const nameAt = ([x, y], v2) => [x - 4, v2 > 0 ? y - 24 : y + 32];

const visibleUpTo = (q, on, off) => TOKENS.map((unused, j) => (j <= q ? on : off));
const CONCEPT = 'attention-output';
const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const line = (id, from, to, extra = {}) => ({ id, type: 'line', semanticId: id, conceptId: CONCEPT,
  initialState: { from, to, role: 'neutral', ...extra } });
const dot = (id, x, y, w, role, opacity) => ({ id, type: 'circle', semanticId: id, conceptId: CONCEPT,
  initialState: { x, y, w, h: w, role, opacity } });
const OUT_AT = { x: { $derive: 'outPx.0' }, y: { $derive: 'outPx.1' } };

export const scene = {
  id: 'nanogpt-c10-weighted-values',
  title: 'One head’s output: the weights mix the values',
  width: 960,
  height: 750,
  duration: 2,
  inputs: [
    { name: 'query', type: 'index', label: 'Query character', of: 'tokens', default: 3, presentation: 'picker' },
    { name: 'revealed', type: 'bool', label: 'Equal-weight mix revealed', hidden: true, default: false },
  ],
  exampleData: {
    tokens: TOKENS,
    Q, K, V, Vpx: VPX,
    hs: HS,
    invSqrtHs: 1 / Math.sqrt(HS),
    causal: true,
    zeros4: TOKENS.map(() => 0),
    // Per query: later characters fade and lose their spoke; at the first
    // character the one spoke has zero length, so it is hidden too.
    dotOps: TOKENS.map((unused, q) => visibleUpTo(q, 1, 0.3)),
    spokeOps: TOKENS.map((unused, q) => (q === 0 ? TOKENS.map(() => 0) : visibleUpTo(q, 1, 0))),
    // The practice reveal draws only at the practice's own query.
    ghostOps: TOKENS.map((unused, q) => (q === TOKENS.length - 1 ? 1 : 0)),
    // Composed per query so an unresolved {{marker}} never widens the static
    // frame past what any state draws.
    outLabels: TOKENS.map(t => `this head’s output for “${t}”`),
  },
  derived: {
    qword: { op: 'pick', args: ['tokens', 'query'] },
    outLabel: { op: 'pick', args: ['outLabels', 'query'] },
    // The weights (c11's mask, c12's scaled scores and softmax), live.
    raw: { op: 'matmul', args: ['Q', 'K'] },
    scaled: { op: 'scale', args: ['raw', 'invSqrtHs'] },
    masked: { op: 'causal_mask', args: ['scaled', 'causal'] },
    att: { op: 'softmax', args: ['masked'] },
    w: { op: 'pick', args: ['att', 'query'] },
    // The mix: y = Σ w_j v_j, and the same weights on the dots' positions.
    out: { op: 'weighted_sum', args: ['w', 'V'] },
    outPx: { op: 'weighted_sum', args: ['w', 'Vpx'] },
    // Largest weight = largest visible score (softmax keeps order); negate
    // before masking, since scale refuses nulls.
    negScaled: { op: 'scale', args: ['scaled', -1] },
    negMasked: { op: 'causal_mask', args: ['negScaled', 'causal'] },
    negRow: { op: 'pick', args: ['negMasked', 'query'] },
    topAt: { op: 'argmin', args: ['negRow'] },
    topWord: { op: 'pick', args: ['tokens', 'topAt'] },
    dotOp: { op: 'pick', args: ['dotOps', 'query'] },
    spokeOp: { op: 'pick', args: ['spokeOps', 'query'] },
    // Practice reveal (What-if): equal weights -> the plain average.
    uniform: { op: 'softmax', args: ['zeros4'] },
    meanOut: { op: 'weighted_sum', args: ['uniform', 'V'] },
    meanPx: { op: 'weighted_sum', args: ['uniform', 'Vpx'] },
    ghostAtQuery: { op: 'pick', args: ['ghostOps', 'query'] },
    ghostOp: { op: 'choose', args: ['revealed', 'ghostAtQuery', 0] },
  },
  objects: [
    text('question', 'Where does a head’s output land among the values its query can see?', 40, 30, { typography: 'heading' }),
    note('status', 'Characters: Source value · q, k, v: Calculated toy example · weights, output: Live calculation', 40, 56),
    note('builds-on', 'Builds on: which characters a query can see (masked weight = 0); softmax weights that add up to 1', 40, 78),

    // The input: the chosen query's weights, one per character it can see.
    { id: 'weights-row', type: 'grid', semanticId: 'weight-row', conceptId: 'softmax-attention-weights',
      initialState: { label: 'weights of “{{qword}}” (blank = later, weight 0)', x: 40, y: VT.y, rows: 1, cols: 4, cell: 60, opacity: 0, role: 'neutral',
        matrixKind: 'derived', distribution: true, heat: true, valueScale: 'fixed', columnLabels: [...TOKENS], values: { $derive: 'w' } } },

    // The rule that takes the weights to the plane, between the two.
    ...RULE.map((value, i) => text(`rule-${i + 1}`, value, 40, RULE_Y + 22 * i)),

    // The values, and under them (column-aligned) the output they mix into.
    { id: 'v-table', type: 'grid', semanticId: 'value-table', conceptId: CONCEPT,
      initialState: { label: 'values v, one row per character', x: VT.x, y: VT.y, rows: 4, cols: 2, cell: CELL, opacity: 0, role: 'input',
        matrixKind: 'input', heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'c10-values',
        rowLabels: [...TOKENS], columnLabels: ['dim 1', 'dim 2'], values: V.flat() } },
    note('colour-1', 'cells: orange = +', VT.x + 2 * CELL + 24, VT.y + 20),
    note('colour-2', 'cells: blue = −', VT.x + 2 * CELL + 24, VT.y + 42),
    { id: 'out-row', type: 'strip', semanticId: 'head-output', conceptId: CONCEPT,
      initialState: { label: '{{outLabel}}', x: VT.x, y: OUT_Y, cell: CELL, opacity: 0, role: 'output',
        heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'c10-values', values: { $derive: 'out' } } },

    // The plane: an L-shaped frame outside the data, ticks and axis names.
    line('axis-bottom', { x: AXIS.left, y: AXIS.bottom }, { x: AXIS.right, y: AXIS.bottom }),
    line('axis-left', { x: AXIS.left, y: AXIS.bottom }, { x: AXIS.left, y: AXIS.top }),
    ...[-1, 0, 1].map(v => note(`tick-x${v + 1}`, v < 0 ? '−1' : String(v), toPx([v, 0])[0] - (v < 0 ? 8 : 4), AXIS.bottom + 22)),
    ...[0, 1].map(v => note(`tick-y${v}`, String(v), AXIS.left - 16, toPx([0, v])[1] + 5)),
    note('axis-x-name', 'dim 1', AXIS.right + 8, AXIS.bottom + 4),
    note('axis-y-name', 'dim 2', AXIS.left + 8, AXIS.top + 4),

    // One spoke per visible value, to the output (drawn under the dots).
    ...VPX.map(([x, y], j) => line(`spoke-${j}`, { x, y }, OUT_AT, { opacity: { $derive: `spokeOp.${j}` } })),
    // The values as points; later characters fade. No label on a circle (it
    // would be centred on it): each name is its own text, outward.
    ...VPX.map(([x, y], j) => dot(`value-${j}`, x, y, DOT, 'input', { $derive: `dotOp.${j}` })),
    ...VPX.map((p, j) => {
      const [x, y] = nameAt(p, V[j][1]);
      return text(`name-${j}`, TOKENS[j], x, y, { opacity: { $derive: `dotOp.${j}` } });
    }),
    // The What-if reveal after Check, under the output dot.
    dot('mean-dot', { $derive: 'meanPx.0' }, { $derive: 'meanPx.1' }, MEAN_DOT, 'neutral', { $derive: 'ghostOp' }),
    dot('out-dot', OUT_AT.x, OUT_AT.y, OUT_DOT, 'output', 0),

    note('legend-values', 'dots = the values v, one per character', LEGEND_X, LEGEND_Y),
    note('legend-output', 'green dot = this head’s output for “{{qword}}”', LEGEND_X, LEGEND_Y + 22, { role: 'output' }),
    note('legend-faded', 'faded = later character: weight exactly 0, no pull', LEGEND_X, LEGEND_Y + 44),
    note('legend-mean', 'grey dot, What-if: equal weights → plain average', LEGEND_X, LEGEND_Y + 66, { opacity: { $derive: 'ghostOp' } }),

    text('caption', 'Pulled hardest by “{{topWord}}”, its largest weight.', 40, FOOT_Y, { role: 'output' }),
    note('size-note', `Source value: shakespeare_char heads have hs = ${A.n_embd} / ${A.n_head} = ${A.n_embd / A.n_head} numbers per v; this toy has hs = ${HS}.`, 40, FOOT_Y + 30),
    note('dropout-note', `Source value: in training, dropout (p = ${A.dropout}) zeroes some weights, scales up the rest, so they need not add up to 1.`, 40, FOOT_Y + 52),
  ],
  // Replay: only the weight row, the table, the output row and dot appear;
  // everything with a query-bound opacity carries no appear (it would win).
  timeline: [
    { at: 0, action: 'appear', target: 'weights-row', duration: 0.4 },
    { at: 0.4, action: 'appear', target: 'v-table', duration: 0.4 },
    { at: 1, action: 'appear', target: 'out-row', duration: 0.4 },
    { at: 1, action: 'appear', target: 'out-dot', duration: 0.4 },
    // The consequence gets the renderer's highlight halo, so it outranks the values.
    { at: 1.4, action: 'highlight', target: 'out-dot', duration: 0.3 },
  ],
};

// Every query, then the practice's query after a committed attempt.
export const reviewStates = [{ query: 3 }, { query: 2 }, { query: 1 }, { query: 0 }, { query: 3, revealed: true }];

// Practice (commit before you see): an equal-weight mix, which no drawn row
// is. Option values come from V and from the card's own derive graph.
const pool = buildPool({ exampleData: { ...scene.exampleData, query: 3, revealed: false }, derived: scene.derived }, canonical);
const pair = ([a, b]) => `(${a.toFixed(2)}, ${b.toFixed(2)})`;
const LAST = TOKENS.length - 1;
const QW = TOKENS[LAST];
const SUM = V.reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
const MEAN = SUM.map(s => s / V.length);
const OPTIONS = {
  unchanged: pair(pool.out),
  own: pair(V[LAST]),
  top: pair(V[pool.topAt]),
  average: pair(MEAN),
  sum: pair(SUM),
};
const perDim = d => `(${V.map(v => v[d]).join(' + ').replace(/\+ -/g, '− ')})/${V.length}`;
export const activity = {
  id: 'c10-practice',
  check: 'choice_equals',
  version: 1,
  fixedInputs: { query: LAST },
  revealInput: 'revealed',
  prompt: `Suppose “${QW}” put equal weight, 1/${V.length}, on each of the ${V.length} characters it sees (on the card its weights differ). Using the value table, where would its output land?`,
  // ponytail: SceneActivity shows no pick for an untouched answer, so this
  // naive default never renders; it only satisfies the choice declaration.
  answer: { type: 'choice', label: `Where “${QW}”’s output lands (dim 1, dim 2)`, default: 'unchanged',
    options: Object.entries(OPTIONS).map(([id, label]) => ({ id, label })) },
  expected: 'average',
  checkLabel: 'Check',
  feedbackPass: `Right. With every weight 1/${V.length} the mix is the plain average: (${perDim(0)}, ${perDim(1)}) = ${OPTIONS.average}. The values did not change, the weights did, and the output moved from ${OPTIONS.unchanged} to ${OPTIONS.average}; it still lies between the ${V.length} values. The grey dot now marks it.`,
  feedbackFail: `Not quite. The output is Σ w·v, so equal weights 1/${V.length} give the plain average: (${perDim(0)}, ${perDim(1)}) = ${OPTIONS.average}. ${OPTIONS.unchanged} is the card's output with its unequal weights - the weights, not only the values, set where the output lands. ${OPTIONS.own} and ${OPTIONS.top} are single values: one value wins only when its weight is 1. ${OPTIONS.sum} is the sum: the weights add up to 1, so the output is an average and lands between the values, never outside them. The grey dot now marks ${OPTIONS.average}.`,
};

// Phase 1 plan (docs/nanogpt-deep-dive-batch3-plans.md, c10; characters per
// the resolved question 4 of board plan §11).
export const plan = {
  concept: 'Weighted values: for one query, a single head\'s output y = att @ v (one row) is the weighted average of the value vectors that query can see. This is the output before the heads are joined and c_proj mixes them.',
  objective: 'After this card, the learner should understand that one attention head\'s output for a query is the weighted average of the value vectors that query can see, so it always lands between those values, pulled toward each in proportion to its weight.',
  prerequisites: [
    'c11-causal-mask: a query sees itself and earlier characters; a masked weight is exactly 0',
    'c12-score-scaling: a query\'s weights are never negative and add up to 1 (at generation)',
    'a vector is a list of numbers; a 2-number vector can be drawn as a point',
  ],
  causalSteps: [
    'the chosen query\'s weight row: one weight per character it can see, computed live (q·k, × 1/√hs, mask, softmax) but the card\'s input; scores and mask are not drawn (c11 and c12 own them)',
    'each visible value v_j is scaled by its weight w_j; a masked character has weight 0 and gives no pull',
    'the results are added: y = Σ w_j v_j (one row); the weights are ≥ 0 and add up to 1 at generation, so y is a weighted average and lies between the visible values',
  ],
  primaryInteraction: 'one control in INTERACT, "Query character" (index picker over B, e, f, o; default o, so all four values are in the mix; the mask is fixed on, c11 owns the toggle): the weight row recomputes, later characters fade to 0.3 and lose their spoke, and the output dot, the spokes\' shared endpoint and the output row move to the live average - B on its own value, e on the segment between two values, f between three, o inside all four, nearest B',
  check: 'practice (commit before you see): with the query locked at o, where would its output land if it put equal weight 1/4 on each of the four characters it sees? No drawn row is uniform over every character it sees, and (0.25, 0.50) is never a drawn output, so the answer is computed from the value table with the rule; after Check a grey What-if dot marks the plain average',
  boundary: {
    decision: 'single',
    reason: 'one mental model: one head\'s output is a weighted average of the visible values. One control; its causes, the mask (c11) and scaled scores -> softmax (c12), are the sequence\'s earlier cards and multi-head (c13) deepens it. The inherited explorer\'s mask toggle and its score, mask and softmax stages are dropped, not staged: staging them here would make this card the whole sequence again',
    reviewed: {},
    sequence: { name: 'Self-attention', position: 3, of: 3, relationships: [
      { type: 'prerequisite', card: 'c11-causal-mask', direction: 'in' },
      { type: 'prerequisite', card: 'c12-score-scaling', direction: 'in' },
      { type: 'deepens', card: 'c13-multi-head', direction: 'out' },
      { type: 'prerequisite', card: 'c05-position-mixing', direction: 'out' },
    ] },
  },
};

const fmt = rows => rows.map(row => `(${row.join(', ')})`).join(', ');

export const sources = [
  code('model.py', 66, 71, 'The manual attention path: "att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))", "att = att.masked_fill(self.bias[:,:,:T,:T] == 0, float(\'-inf\'))" and "att = F.softmax(att, dim=-1)" make the weights this card takes as its input; "y = att @ v" is the mix it draws - one row of it, for one head.'),
  code('model.py', 56, 59, 'Each head has its own value vectors: "q, k, v  = self.c_attn(x).split(self.n_embd, dim=2)", then "v = v.view(B, T, self.n_head, C // self.n_head).transpose(1, 2) # (B, nh, T, hs)" - hs numbers per value.'),
  code('model.py', 33, 33, 'hs = n_embd / n_head exactly: "assert config.n_embd % config.n_head == 0".'),
  code('model.py', 62, 64, 'The fused path NanoGPT takes "if self.flash:": "y = torch.nn.functional.scaled_dot_product_attention(q, k, v, attn_mask=None, dropout_p=self.dropout if self.training else 0, is_causal=True)" - the same weighted mix, fused, with dropout only in training.'),
  code('model.py', 39, 39, 'The dropout on the weights: "self.attn_dropout = nn.Dropout(config.dropout)".'),
  code('model.py', 70, 70, 'Applied between softmax and the mix: "att = self.attn_dropout(att)" - in training the row need not add up to 1, which is why the card calls the output an average at generation only.'),
  code('model.py', 72, 72, 'After this card (c13): "y = y.transpose(1, 2).contiguous().view(B, T, C) # re-assemble all head outputs side by side".'),
  code('model.py', 75, 76, 'Then c_proj mixes the joined heads: "y = self.resid_dropout(self.c_proj(y))", "return y".'),
  code('model.py', 104, 104, 'And the Block adds it to the residual stream: "x = x + self.attn(self.ln_1(x))".'),
  code('config/train_shakespeare_char.py', 23, 25, `The real sizes: "n_head = ${A.n_head}", "n_embd = ${A.n_embd}" and "dropout = ${A.dropout}" - so each head's v has ${A.n_embd / A.n_head} numbers.`),
  code('sample.py', 51, 51, 'Generation runs in eval mode, dropout off: "model.eval()".'),
  code('train.py', 216, 228, 'Training runs in train mode, dropout on: estimate_loss switches to "model.eval()" to measure and back with "model.train()".'),
  { kind: 'doc', title: 'torch.nn.Dropout (PyTorch documentation)', url: 'https://docs.pytorch.org/docs/stable/generated/torch.nn.Dropout.html',
    note: 'In training, Dropout zeroes each element with probability p and scales the rest by 1/(1 - p); in eval mode it is the identity. On att that means a training row need not add up to 1.' },
  calculation('Source value', 'The characters, n_head, n_embd and dropout',
    `generate_fixtures.py rebuilt the shakespeare_char vocabulary with prepare.py's logic over the sha-pinned Tiny Shakespeare file and split the tokenizer card's line “${fx.tokenizer.text}” into characters; this card takes the first ${TOKENS.length}, ${TOKENS.join(', ')} - the same line c11, c12 and c05 use. n_head ${A.n_head}, n_embd ${A.n_embd} and dropout ${A.dropout} come from the resolved shakespeare_char config (fx.architecture).`),
  // Authored on this card, not by the fixture generator - so no reproduce command.
  { kind: 'calculation', status: 'Calculated toy example', title: 'q, k and v for one head',
    note: `Typed into this card, not trained: head size hs = ${HS} (NanoGPT's shakespeare_char heads have ${A.n_embd / A.n_head}), so each value is a point on the plane. Q = ${fmt(Q)}; K = ${fmt(K)}; V = ${fmt(V)}, one row per character ${TOKENS.join(', ')}. The characters only label the rows: the numbers do not come from them. The plane draws v = (v1, v2) at x = ${PLANE.x0} + ${PLANE.unit}·v1, y = ${PLANE.y0} − ${PLANE.unit}·v2 (layout only).` },
  calculation('Live calculation', 'The weights, the output and the dots',
    `Computed on the card by derive ops: matmul (q·k for every pair), scale by 1/√${HS}, causal_mask (later characters excluded), softmax, pick (the query's row) - then weighted_sum of V with that row for the output, and of the dot positions for where the output dot and the spokes' shared end go. The largest weight is argmin of the negated masked scores. The practice's reveal is weighted_sum with softmax of four zeros (1/4 each). The weight row is rounded to 2 decimals so that it adds up to exactly 1 (a cell may move by 0.01); every other cell is rounded to 2 decimals on its own.`),
  tinyShakespeare(`“${fx.tokenizer.text}”, the line the four characters come from.`),
];

export const evidence = {
  card: 'c10-weighted-values',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: plan.concept,
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: `source: model.py:66-71 (manual path; y = att @ v at :71), :56-59 (per-head v, hs), :33, :62-64 (fused path), :39 and :70 (attn_dropout), :72 and :75-76 (joined, then c_proj - named only), :104 (residual add); config/train_shakespeare_char.py:23-25; sample.py:51; train.py:216-228 - checked against the pinned files. Source value: characters ${TOKENS.join(', ')} (fx.tokenizer, the char tokenizer), n_head/n_embd/dropout (fx.architecture). Calculated toy example: Q, K, V with hs = ${HS} typed into the card. Live calculation: matmul, scale, causal_mask, softmax, pick, weighted_sum, argmin, choose. What-if: the equal-weight reveal after Check.`,
  control: 'query - index picker "Query character" over B, e, f, o (default o, the last); revealed - hidden bool owned by the practice (set by a committed attempt).',
  consequence: 'The weight row recomputes for the chosen character (later cells blank, exactly 0); later value dots fade to 0.3 and their spokes hide; the green output dot, the spokes\' shared endpoint and the output row move to the live average: B (1.00, 0.00), sitting on its own value (no spoke); e (-0.34, 0.00) on the segment between B and e; f (0.00, 0.50) between three; o (0.47, 0.33) inside all four, nearest B. The caption names the character with the largest weight. After a committed practice attempt a grey What-if dot marks the equal-weight average (0.25, 0.50) at o.',
  interactionPurpose: 'Move the query and watch the output stay between the visible values, pulled toward each by its weight - an average, not a sum - while later characters, with weight exactly 0, give no pull.',
  task: 'Pick each character from B to o and say where the output sits among the dots and why. Practice: with the query locked at o, where would the output land with equal weights 1/4? (choice; expected (0.25, 0.50) - no drawn row is uniform, so it needs the rule).',
  capability: 'index picker; live matmul/scale/causal_mask/softmax/pick/weighted_sum pipeline; argmax by argmin of negated masked scores; circles with derived centres (weighted_sum on a pixel table) and derived opacity; lines with a derived shared endpoint and derived opacity (no appear on those); a derived 1x4 weight grid with distribution and fixed heat (masked cells blank); a signed shared-heat value table and output strip; choice practice with fixedInputs and a hidden-bool revealInput gating a choose-derived What-if dot.',
};
