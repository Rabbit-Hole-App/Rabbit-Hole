// c02 - the recipe inside one NanoGPT Block (model.py Block.forward @3adf61e):
// x = x + attn(ln_1(x)), then x = x + mlp(ln_2(x)). Six operations in a fixed
// order, stepped through with one control. At each step the operation gets the
// highlight, the tensor it reads is drawn in the input colour and the tensor it
// writes in the output colour; the residual stream (x, the two adds, the block
// input and output) keeps its own identity colour at every step. The one
// relationship the stepping shows: only the two adds write the stream - the
// other four operations read it (or each other) and make new tensors.
//
// Not duplicated from c01 (shapes through the whole model) or c03 (the residual
// add on/off): no numbers flow through this card. B, T and C are source values
// (fx.architecture), stated once.
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { calculation, code } from '../sources.js';

const A = fx.architecture;
const CONCEPT = 'transformer-block';

// Geometry: the stream runs along S; the two branches sit on the box row below.
const S = 130;
const ROW_Y = 208, ROW_H = 44, ROW_MID = ROW_Y + ROW_H / 2;
const BOX_W = 72;
const PLUS = [450, 760]; // centres of the two adds on the stream
const TAP = [195, 505]; // where each branch leaves the stream
const R = 16; // add circle radius

const text = (id, value, x, y, extra = {}) => ({ id, type: 'text', semanticId: id, conceptId: CONCEPT,
  initialState: { text: value, x, y, ...extra } });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });
const hidden = { opacity: 0 };
const stream = { identity: 'residual-stream', ...hidden };
const box = (id, label, x, extra = {}) => ({ id, type: 'box', semanticId: id, conceptId: CONCEPT,
  initialState: { label, x, y: ROW_Y, w: BOX_W, h: ROW_H, ...hidden, ...extra } });
const stroke = (type, id, from, to, extra = {}) => ({ id, type, semanticId: id, conceptId: CONCEPT,
  initialState: { from, to, ...hidden, ...extra } });
const role = name => ({ role: { $derive: name } });

// Per-step roles (steps 0..5 = ln_1, attn, add, ln_2, mlp, add): which tensor
// the step reads (input) and which it writes (output).
const I = 'input', O = 'output', N = 'neutral';
const ROLES = {
  xRole: [I, N, I, N, N, N], // x on the stream: read by ln_1 and by the first add
  tap1Role: [I, N, N, N, N, N],
  h1Role: [O, I, N, N, N, N], // ln_1(x)
  aRole: [N, O, I, N, N, N], // a = attn(ln_1(x))
  xaRole: [N, N, O, I, N, I], // x + a on the stream
  tap2Role: [N, N, N, I, N, N],
  h2Role: [N, N, N, O, I, N], // ln_2(x + a)
  mRole: [N, N, N, N, O, I], // m = mlp(ln_2(x + a))
  outRole: [N, N, N, N, N, O], // x + a + m, the block's output
};
// The operation of each step gets the highlight; the others a no-op marker.
const OPS = ['ln1', 'attn', 'plus1', 'ln2', 'mlp', 'plus2'];
const highlightSteps = Object.fromEntries(OPS.map((op, k) => [`${op}Steps`, OPS.map((unused, step) => (step === k ? 'highlight' : 'pause'))]));

export const scene = {
  id: 'nanogpt-c02-block-anatomy',
  title: 'Anatomy of one transformer block',
  width: 960,
  height: 540,
  duration: 4,
  inputs: [
    { name: 'step', type: 'index', label: 'Operation, in order', of: 'steps', default: 0, presentation: 'slider' },
  ],
  exampleData: {
    steps: ['① ln_1', '② attn', '③ add', '④ ln_2', '⑤ mlp', '⑥ add'],
    B: A.batch_size, T: A.block_size, C: A.n_embd,
    ...ROLES,
    ...highlightSteps,
    stepTitles: [
      'Step 1 of 6 · ln_1: normalize',
      'Step 2 of 6 · attn: attend',
      'Step 3 of 6 · x + a: add back',
      'Step 4 of 6 · ln_2: normalize',
      'Step 5 of 6 · mlp: the MLP',
      'Step 6 of 6 · x + a + m: add back',
    ],
    readsList: [
      'Reads: x, from the residual stream',
      'Reads: ln_1(x)',
      'Reads: x and a',
      'Reads: x + a, from the residual stream',
      'Reads: ln_2(x + a)',
      'Reads: x + a and m',
    ],
    writesList: [
      'Writes: ln_1(x), a new normalized tensor for attention',
      'Writes: a = attn(ln_1(x)), an update for every position',
      'Writes: x + a, back onto the residual stream',
      'Writes: ln_2(x + a), a new normalized tensor for the MLP',
      'Writes: m = mlp(ln_2(x + a)), a second update',
      'Writes: x + a + m, back onto the stream: the Block’s output',
    ],
    whatList: [
      'Each token vector is normalized on its own before attention reads it.',
      'Causal self-attention: each position mixes in information from itself and earlier positions.',
      'The first residual add: the stream keeps x and gains the attention update a.',
      'The updated stream is normalized again, this time for the MLP.',
      'The MLP transforms each position’s vector on its own: c_fc, GELU, c_proj.',
      'The second residual add: the stream now carries x + a + m, the same shape as x.',
    ],
    streamList: [
      'Residual stream after this step: x (unchanged)',
      'Residual stream after this step: x (unchanged)',
      'Residual stream after this step: x + a (changed by the add)',
      'Residual stream after this step: x + a (unchanged)',
      'Residual stream after this step: x + a (unchanged)',
      'Residual stream after this step: x + a + m (changed: the Block’s output)',
    ],
  },
  derived: {
    ...Object.fromEntries(Object.keys(ROLES).map(name => [`${name}Now`, { op: 'pick', args: [name, 'step'] }])),
    ...Object.fromEntries(OPS.map(op => [`${op}Step`, { op: 'pick', args: [`${op}Steps`, 'step'] }])),
    stepTitle: { op: 'pick', args: ['stepTitles', 'step'] },
    reads: { op: 'pick', args: ['readsList', 'step'] },
    writes: { op: 'pick', args: ['writesList', 'step'] },
    what: { op: 'pick', args: ['whatList', 'step'] },
    streamNow: { op: 'pick', args: ['streamList', 'step'] },
  },
  objects: [
    text('question', 'What does one Block do to x, in what order - and which steps change x itself?', 40, 34),
    text('recipe', 'One Block, as NanoGPT writes it:  x ← x + attn(ln_1(x)),  then  x ← x + mlp(ln_2(x))', 40, 60, { typography: 'caption' }),

    // The residual stream: block input -> add -> add -> block output.
    { id: 'x-in', type: 'box', semanticId: 'block-input', conceptId: CONCEPT,
      initialState: { label: 'block input', x: 40, y: S - 22, w: 130, h: 44, ...stream } },
    stroke('arrow', 'stream-a', { x: 172, y: S }, { x: PLUS[0] - R - 2, y: S }, stream),
    { id: 'plus1', type: 'circle', semanticId: 'add-1', conceptId: CONCEPT,
      initialState: { label: '+', x: PLUS[0], y: S, w: 2 * R, ...stream } },
    stroke('arrow', 'stream-b', { x: PLUS[0] + R + 2, y: S }, { x: PLUS[1] - R - 2, y: S }, stream),
    { id: 'plus2', type: 'circle', semanticId: 'add-2', conceptId: CONCEPT,
      initialState: { label: '+', x: PLUS[1], y: S, w: 2 * R, ...stream } },
    stroke('arrow', 'stream-c', { x: PLUS[1] + R + 2, y: S }, { x: 806, y: S }, stream),
    { id: 'x-out', type: 'box', semanticId: 'block-output', conceptId: CONCEPT,
      initialState: { label: 'block output', x: 810, y: S - 22, w: 130, h: 44, ...stream } },
    note('lbl-x', 'x', 240, S - 10, { typography: 'caption', ...role('xRoleNow'), ...hidden }),
    note('lbl-xa', 'x + a', 560, S - 10, { typography: 'caption', ...role('xaRoleNow'), ...hidden }),
    note('lbl-out', 'x + a + m', 812, S - 32, { typography: 'caption', ...role('outRoleNow'), ...hidden }),
    note('add1-label', '③ add', PLUS[0] - 22, S - 32, hidden),
    note('add2-label', '⑥ add', PLUS[1] - 22, S - 32, hidden),

    // Branch 1: ln_1 -> attn -> back into the first add.
    stroke('arrow', 'tap1', { x: TAP[0], y: S + 2 }, { x: TAP[0], y: ROW_Y - 4 }, role('tap1RoleNow')),
    box('ln1', '① ln_1', TAP[0] - BOX_W / 2),
    stroke('arrow', 'wire-h1', { x: TAP[0] + BOX_W / 2 + 2, y: ROW_MID }, { x: 335, y: ROW_MID }, role('h1RoleNow')),
    note('lbl-h1', 'ln_1(x)', 248, ROW_MID - 14, { typography: 'caption', ...role('h1RoleNow'), ...hidden }),
    box('attn', '② attn', 339),
    stroke('line', 'wire-a', { x: 339 + BOX_W + 2, y: ROW_MID }, { x: PLUS[0], y: ROW_MID }, role('aRoleNow')),
    stroke('arrow', 'up-a', { x: PLUS[0], y: ROW_MID }, { x: PLUS[0], y: S + R + 4 }, role('aRoleNow')),
    note('lbl-a', 'a', 426, ROW_MID - 14, { typography: 'caption', ...role('aRoleNow'), ...hidden }),

    // Branch 2: ln_2 -> mlp -> back into the second add.
    stroke('arrow', 'tap2', { x: TAP[1], y: S + 2 }, { x: TAP[1], y: ROW_Y - 4 }, role('tap2RoleNow')),
    box('ln2', '④ ln_2', TAP[1] - BOX_W / 2),
    stroke('arrow', 'wire-h2', { x: TAP[1] + BOX_W / 2 + 2, y: ROW_MID }, { x: 645, y: ROW_MID }, role('h2RoleNow')),
    note('lbl-h2', 'ln_2(x + a)', 553, ROW_MID - 14, { typography: 'caption', ...role('h2RoleNow'), ...hidden }),
    box('mlp', '⑤ mlp', 649),
    stroke('line', 'wire-m', { x: 649 + BOX_W + 2, y: ROW_MID }, { x: PLUS[1], y: ROW_MID }, role('mRoleNow')),
    stroke('arrow', 'up-m', { x: PLUS[1], y: ROW_MID }, { x: PLUS[1], y: S + R + 4 }, role('mRoleNow')),
    note('lbl-m', 'm', 734, ROW_MID - 14, { typography: 'caption', ...role('mRoleNow'), ...hidden }),

    // What the selected step does - every line follows the control.
    text('step-title', '{{stepTitle}}', 40, 310, { typography: 'heading' }),
    text('reads', '{{reads}}', 40, 342, { role: 'input' }),
    text('writes', '{{writes}}', 40, 368, { role: 'output' }),
    text('what', '{{what}}', 40, 394),
    text('stream-now', '{{streamNow}}', 40, 420),

    // Key and takeaway.
    note('key-read', 'read by this step', 40, 460, { role: 'input' }),
    note('key-write', 'written by this step', 176, 460, { role: 'output' }),
    note('key-stream', 'the residual stream, lit at every step', 334, 460, { role: 'input', identity: 'residual-stream' }),
    note('key-halo', 'halo = this step’s operation', 610, 460),
    note('takeaway', 'Only the two adds (③ and ⑥) write to the residual stream; the other four steps make new tensors off to the side.', 40, 490),
    note('shape', 'Every arrow carries one (B, T, C) tensor - Source value: B = {{B}}, T = {{T}}, C = {{C}} in shakespeare_char training.', 40, 516),
  ],
  timeline: [
    // Replay: the recipe in data-flow order, then the selected step's highlight.
    ...[
      'x-in', 'stream-a', 'lbl-x', 'tap1', 'ln1', 'wire-h1', 'lbl-h1', 'attn', 'wire-a', 'up-a', 'lbl-a', 'plus1', 'add1-label',
      'stream-b', 'lbl-xa', 'tap2', 'ln2', 'wire-h2', 'lbl-h2', 'mlp', 'wire-m', 'up-m', 'lbl-m', 'plus2', 'add2-label',
      'stream-c', 'x-out', 'lbl-out',
    ].map((target, i) => ({ at: 0.1 * i, action: 'appear', target, duration: 0.2 })),
    ...OPS.map(op => ({ at: 3.4, action: { $derive: `${op}Step` }, target: op, duration: 0.3 })),
  ],
};

// Every step reveals the tensors of its own operation (a selected-state check the test repeats).
export const reviewStates = [0, 1, 2, 3, 4, 5].map(step => ({ step }));

// Phase 1 plan (docs/nanogpt-deep-dive-board-plan.md §10, verbatim where it fits).
export const plan = {
  concept: 'the transformer block',
  objective: 'After this card, the learner should understand the recipe one Block applies to x: normalize, attend, add back, normalize, MLP, add back.',
  prerequisites: ['residual add (c03) - named, not required to follow the order', 'LayerNorm (c15) - named, not required to follow the order'],
  causalSteps: ['x', 'ln_1', 'attn', 'x + …', 'ln_2', 'mlp', 'x + …'],
  primaryInteraction: 'step through the six operations; the tensor each reads and writes lights, and the residual path x stays lit the whole way',
  check: 'none: the order is the lesson; a practice question would test memory, not reasoning',
  boundary: {
    decision: 'staged',
    reason: 'one causal pipeline in a fixed order; staging it keeps the recipe whole',
    sequence: { name: 'The block and the stack', position: 1, of: 2, relationships: [{ type: 'deepens', card: 'c04-block-stack', direction: 'out' }] },
  },
};

export const sources = [
  code('model.py', 94, 106, 'The whole Block: "class Block(nn.Module):" builds its four parts and "def forward(self, x):" runs them in the order the card steps through, then "return x".'),
  code('model.py', 104, 104, 'Steps ① to ③: "x = x + self.attn(self.ln_1(x))" - normalize, attend, add back.'),
  code('model.py', 105, 105, 'Steps ④ to ⑥: "x = x + self.mlp(self.ln_2(x))" - normalize, MLP, add back.'),
  code('model.py', 98, 101, 'The four parts: "self.ln_1 = LayerNorm(config.n_embd, bias=config.bias)", "self.attn = CausalSelfAttention(config)", "self.ln_2 = LayerNorm(config.n_embd, bias=config.bias)" and "self.mlp = MLP(config)".'),
  code('model.py', 26, 27, 'ln_1 and ln_2 return a new tensor: "return F.layer_norm(input, self.weight.shape, self.weight, self.bias, 1e-5)".'),
  code('model.py', 52, 76, 'attn: "B, T, C = x.size()", causal attention ("is_causal=True" on the default flash path), the heads re-assembled with ".view(B, T, C)", then "y = self.resid_dropout(self.c_proj(y))" and "return y" - an update the same shape as x.'),
  code('model.py', 87, 92, 'mlp works on each position\'s vector: "x = self.c_fc(x)", "x = self.gelu(x)", "x = self.c_proj(x)", "x = self.dropout(x)".'),
  code('model.py', 180, 181, 'The Block\'s output becomes the next x: "for block in self.transformer.h:" then "x = block(x)".'),
  code('config/train_shakespeare_char.py', 18, 24, 'The sizes on the card: "batch_size = 64", "block_size = 256" and "n_embd = 384".'),
  calculation('Source value', 'B, T and C', "generate_fixtures.py resolved config/train_shakespeare_char.py over train.py's defaults (batch_size = 64, block_size = 256, n_embd = 384). No model runs on this card; the step control only switches which operation and tensors are lit."),
];

export const evidence = {
  card: 'c02-block-anatomy',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'One NanoGPT Block (model.py:94-106) applies six operations in a fixed order: ln_1, attn, add back (x + a), ln_2, mlp, add back (x + a + m). Only the two adds write to the residual stream; ln_1/ln_2 and attn/mlp read it or each other and produce new tensors. The Block returns the (B, T, C) shape it reads.',
  sourceRevision: `${fx.provenance.nanogpt.repo}@${fx.provenance.nanogpt.commit}`,
  provenance: 'source: model.py:94-106 (Block), :104, :105 (the two lines stepped through), :98-101 (its parts), :26-27 (LayerNorm forward), :52-76 (attention forward), :87-92 (MLP forward), :180-181 (x = block(x)); config/train_shakespeare_char.py:18-24. B, T, C: source values from fx.architecture. No toy numbers, recorded run or live arithmetic: derive ops only pick per-step roles, captions and highlight steps.',
  control: 'step (index slider with Previous/Next, "Operation, in order") over the six operations: ① ln_1, ② attn, ③ add, ④ ln_2, ⑤ mlp, ⑥ add; default ① ln_1.',
  consequence: 'The selected operation gets the highlight halo; the tensor it reads turns to the input colour and the tensor it writes to the output colour (x, ln_1(x), a, x + a, ln_2(x + a), m, x + a + m); the residual stream keeps its identity colour at every step. Captions give the step, what it reads, what it writes, what it does, and the stream after it: unchanged at ①②④⑤, changed at ③ (x + a) and ⑥ (x + a + m, the output).',
  interactionPurpose: 'Walk the recipe in order and see which step reads and writes which tensor - in particular that the residual stream is only ever written by the two adds.',
  task: 'none (explore only - no Practice on this card: the order is the lesson, a question would test memory)',
  capability: 'index slider input; pick-derived per-step roles on text labels and wires (input = read, output = written); pick-derived timeline actions (highlight vs a no-op pause) for the step\'s operation; identity hue on the residual stream; timeline replay in data-flow order.',
};
