// Residual stream, Overview depth - why each block adds to its input instead
// of replacing it. Intuition only: one token's numbers drawn as a colour
// pattern (cells too small for digits), passed through n_layer = 6 toy blocks
// (the Shakespeare-char model's depth). Every block reads a size-normalized
// copy of what flows in (LayerNorm) and computes from it. With the stream kept
// (NanoGPT), the block's result is a change added to the stream, so the
// token's own pattern is still there after Block 6, shifted by each block's
// change. Replaced (a what-if - NanoGPT's Block.forward always adds), the
// block's output is all that flows on: each block rebuilds from the last
// output alone, the token itself is not passed on, and what comes out is
// only one block's small result (the same maps write small changes).
//
// Grounding: model.py Block.forward (x = x + attn(ln_1(x)), x = x + mlp(ln_2(x))),
// LayerNorm.forward, and the n_layer Blocks GPT.forward runs in order; n_layer
// from the Shakespeare config. Numbers: the token vector x0 is
// generate_fixtures.layernorm()'s, the same vector the Guided and Deep dive
// cards use; each block is a seeded toy map from gen_residual-layernorm.py,
// which runs both chains through the same maps (the block reads a LayerNorm'd
// copy - a square root the card cannot take). The kept running totals are
// added live by derive ops.
import fx from '../fixtures/residual-layernorm.generated.js';
import { code, calculation } from '../../sources.js';

const O = fx.overview;
const CONCEPT = 'residual-stream';
const REPRODUCE = 'python packages/web/src/nanogpt/depth/fixtures/gen_residual-layernorm.py --check';

const CELL = 21; // under 22px the renderer draws colour only, no digits
const STAGE_X = i => 170 + 118 * i; // stage 0 = the token, stage k = after Block k
const READ_DX = 40; // each block's read branch leaves the stream this far left of its column
const BOX_Y = 112, BOX_H = 40;
const CHANGE_Y = 184, STREAM_Y = 352;
const GRID_H = CELL * O.x0.length;
const STREAM_MID = STREAM_Y + GRID_H / 2;
const blocks = Array.from({ length: O.nLayer }, (unused, i) => i + 1);

const heatGrid = { rows: O.x0.length, cols: 1, cell: CELL, heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'overview-stream' };
const obj = (id, type, initialState) => ({ id, type, semanticId: id, conceptId: CONCEPT, initialState });
const text = (id, value, x, y, extra = {}) => obj(id, 'text', { text: value, x, y, ...extra });
const note = (id, value, x, y, extra = {}) => text(id, value, x, y, { typography: 'annotation', ...extra });

export const scene = {
  id: 'depth-residual-layernorm-overview',
  title: 'Residual stream and LayerNorm · Overview: the stream keeps the token',
  width: 960,
  height: 616,
  duration: 4.2,
  inputs: [
    { name: 'stream', type: 'bool', label: 'Keep the stream: add each change', default: true },
  ],
  exampleData: {
    x0: O.x0,
    kept: O.kept,
    replaced: O.replaced,
    takeawayOn: 'Kept: after 6 blocks the token’s own pattern is still there, shifted by each block’s change.',
    takeawayOff: 'What-if, replaced: only the last block’s small result flows on, not the token’s own numbers.',
    roleOn: 'output',
    roleOff: 'warning',
  },
  derived: {
    // Live: with the stream kept, what flows on after block k is the token plus every change so far.
    ...Object.fromEntries(blocks.map(k => [`total${k}`, { op: 'add', args: [k === 1 ? 'x0' : `total${k - 1}`, `kept.${k - 1}`] }])),
    // Each block's result: a change to add (kept) or, in the what-if, the whole of what flows on.
    ...Object.fromEntries(blocks.map(k => [`change${k}`, { op: 'choose', args: ['stream', `kept.${k - 1}`, `replaced.${k - 1}`] }])),
    ...Object.fromEntries(blocks.map(k => [`out${k}`, { op: 'choose', args: ['stream', `total${k}`, `replaced.${k - 1}`] }])),
    streamOpacity: { op: 'choose', args: ['stream', 1, 0] },
    takeaway: { op: 'choose', args: ['stream', 'takeawayOn', 'takeawayOff'] },
    takeawayRole: { op: 'choose', args: ['stream', 'roleOn', 'roleOff'] },
    // Every value the card can ever show, whatever the toggle: pins the shared
    // colour scale so the token's own column keeps its colours.
    scaleAll: { op: 'concat', args: ['x0', ...blocks.map(k => `total${k}`), ...blocks.map(k => `replaced.${k - 1}`)] },
  },
  objects: [
    text('question', 'Why does each block add its result to its input instead of replacing it?', 40, 34),
    text('prerequisites', 'No prerequisites.', 40, 58, { typography: 'annotation' }),
    text('status', 'Calculated toy example: one token, 6 toy blocks · Live calculation: the running totals', 40, 84, { typography: 'caption' }),

    note('row-blocks', 'blocks, in order', 40, BOX_Y + BOX_H / 2 + 4),
    note('row-change', 'each block’s result', 40, CHANGE_Y + GRID_H / 2 + 4),
    note('row-read-1', '↑ reads a size-normalized', 40, STREAM_Y - 34),
    note('row-read-2', 'copy (LayerNorm)', 52, STREAM_Y - 16),
    note('row-stream', 'what flows on', 40, STREAM_MID + 4),
    // Never shown: holds scaleAll in the shared colour group so its range is
    // the same with the stream kept or replaced.
    obj('scale-anchor', 'grid', { ...heatGrid, rows: 2 * O.nLayer + 1, cols: O.x0.length, matrixKind: 'derived', x: STAGE_X(0) - 20, y: CHANGE_Y,
      opacity: 0, values: { $derive: 'scaleAll' } }),
    obj('token', 'grid', { ...heatGrid, matrixKind: 'input', x: STAGE_X(0) - 11, y: STREAM_Y, role: 'input', opacity: 0, values: { $derive: 'x0' } }),

    ...blocks.flatMap(k => {
      const x = STAGE_X(k);
      const branch = x - READ_DX;
      return [
        obj(`block-${k}`, 'box', { label: `Block ${k}`, x: x - 48, y: BOX_Y, w: 96, h: BOX_H, opacity: 0 }),
        // What flows in reaches the block's branch point in both layouts...
        obj(`feed-${k}`, 'line', { from: { x: STAGE_X(k - 1) + 14, y: STREAM_MID }, to: { x: branch, y: STREAM_MID }, role: 'input', opacity: 0 }),
        // ...and the block reads it (as a normalized copy).
        obj(`read-${k}`, 'arrow', { from: { x: branch, y: STREAM_MID }, to: { x: branch, y: BOX_Y + BOX_H + 2 }, opacity: 0 }),
        obj(`change-${k}`, 'grid', { ...heatGrid, matrixKind: 'derived', x: x - 11, y: CHANGE_Y, opacity: 0, values: { $derive: `change${k}` } }),
        obj(`down-${k}`, 'arrow', { from: { x, y: CHANGE_Y + GRID_H + 4 }, to: { x, y: STREAM_Y - 6 }, opacity: 0 }),
        // The stream itself carried past the block into this stage. Cut when replaced.
        obj(`carry-${k}`, 'arrow', { from: { x: branch, y: STREAM_MID }, to: { x: x - 16, y: STREAM_MID },
          role: 'input', opacity: { $derive: 'streamOpacity' } }),
        obj(`out-${k}`, 'grid', { ...heatGrid, matrixKind: 'derived', x: x - 11, y: STREAM_Y,
          role: k === O.nLayer ? 'output' : 'neutral', opacity: 0, values: { $derive: `out${k}` } }),
      ];
    }),

    // Named under the stream row, clear of the arrows that come down into it.
    text('token-label', 'token in', STAGE_X(0) - 30, STREAM_Y + GRID_H + 22, { typography: 'caption', role: 'input' }),
    text('out-label', 'out', STAGE_X(O.nLayer) - 12, STREAM_Y + GRID_H + 22, { typography: 'caption', role: 'output' }),

    text('takeaway', '{{takeaway}}', 40, 530, { role: { $derive: 'takeawayRole' } }),
    note('ln', 'Each block reads a normalized copy; inside the blocks the stream itself is never normalized, only added to.', 40, 554),
    note('always', 'NanoGPT always adds: every block writes its change into the stream.', 40, 576),
    note('legend', 'Colour: orange = positive, blue = negative, stronger = larger.', 40, 598),
  ],
  timeline: [
    { at: 0, action: 'appear', target: 'token', duration: 0.4 },
    ...blocks.flatMap(k => {
      const at = 0.4 + (k - 1) * 0.6;
      return [
        { at, action: 'appear', target: `feed-${k}`, duration: 0.15 },
        { at, action: 'appear', target: `read-${k}`, duration: 0.2 },
        { at: at + 0.05, action: 'appear', target: `block-${k}`, duration: 0.2 },
        { at: at + 0.15, action: 'appear', target: `change-${k}`, duration: 0.25 },
        { at: at + 0.3, action: 'appear', target: `down-${k}`, duration: 0.15 },
        { at: at + 0.4, action: 'appear', target: `out-${k}`, duration: 0.2 },
      ];
    }),
  ],
};

export const sources = [
  code('model.py', 103, 106, 'Block.forward: “x = x + self.attn(self.ln_1(x))” then “x = x + self.mlp(self.ln_2(x))” - each sublayer reads a normalized copy, ln_1(x) or ln_2(x), and its result is added to the stream x; the stream is never replaced.'),
  code('model.py', 26, 27, 'LayerNorm.forward: “return F.layer_norm(input, self.weight.shape, self.weight, self.bias, 1e-5)” - the size-normalized copy each block reads.'),
  code('model.py', 180, 181, 'GPT.forward runs the blocks in order: “for block in self.transformer.h: x = block(x)”.'),
  code('config/train_shakespeare_char.py', 22, 22, `“n_layer = ${O.nLayer}” - the number of blocks drawn on the card.`),
  { kind: 'calculation', status: 'Calculated toy example', title: 'The token and six toy blocks, kept and replaced',
    note: `The token’s numbers are generate_fixtures.layernorm()’s toy vector x₀ = [${O.x0.join(', ')}], the same one the Guided and Deep dive cards use. Each toy block is a seeded 6 × 6 map (normal, std ${O.mapStd}, seed ${fx.provenance.seed}, 2 decimals) that reads a LayerNorm’d copy of what flows in (mean 0, mean square 1, eps 1e-5) and multiplies it by the map; one toy block stands for one read-and-add, where NanoGPT’s Block does two (attention, then the MLP). Kept: its result is a change, added to the stream, and the next block reads the new total. Replaced (a what-if; NanoGPT always adds): its result is all that flows on, and the next block reads only that. gen_residual-layernorm.py runs both chains through the same six maps and rounds to 2 decimals, the kept totals as the card’s live add reproduces them.`,
    reproduce: REPRODUCE },
  calculation('Live calculation', 'The running totals',
    'Computed on the card by the add derive op: with the stream kept, what flows on after Block k is the token plus the changes of Blocks 1..k. With the toggle off the choose op shows the what-if chain instead.'),
];

export const evidence = {
  card: 'depth-residual-layernorm-overview',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'A residual block reads a normalized copy of the stream and adds its result to the stream instead of replacing it, so the token’s own numbers are carried through every block, each block changing them a little; without the add each block rebuilds from the last output alone and the token’s own numbers are not passed on.',
  sourceRevision: `${fx.provenance.nanogpt.repo} @ ${fx.provenance.nanogpt.commit}`,
  provenance: 'calculated toy example: x0 from generate_fixtures.layernorm(), six seeded 6x6 toy maps reading a LayerNorm’d copy, run kept and replaced by gen_residual-layernorm.py (reproducible, --check); live calculation: kept running totals by add, choose picks kept or what-if values; source: model.py:103-106 (the adds, ln_1/ln_2 on the branch), :26-27 (LayerNorm.forward), :180-181 (blocks in order), n_layer = 6 from config/train_shakespeare_char.py:22.',
  control: 'stream (bool) "Keep the stream: add each change", default true (NanoGPT’s behaviour); off is a what-if.',
  consequence: 'On: each block’s result is a small change, and every “what flows on” column is the token plus the changes so far - the token’s colour pattern survives Block 6, visibly shifted. Off: each block’s result is all that flows on (the result and stream rows show the same column), the carry arrows disappear, and the pattern is rebuilt at every block from the last output, weak and unlike the token.',
  interactionPurpose: 'One discrete cause/effect switch: remove the add and watch the token stop being passed on, while the same blocks still read and compute.',
  task: 'Explore only: flip the toggle and compare the “out” column with the token’s column.',
  capability: 'bool input; add derive ops for the running totals; choose for the block results, passed-on values, captions, role and the carry arrows’ opacity; 6x1 heat grids with 21px cells (colour without digits) on one shared scale, pinned by a never-drawn anchor grid (concat of every value either chain shows) so the token keeps its colours when the toggle flips; read branches from the stream into every block.',
  depth: 'Overview',
  prerequisites: 'No prerequisites.',
  ladderRole: 'Gives the cause/effect intuition - add keeps the token, replace loses it, and each block reads a normalized copy - with colour patterns and one switch, no numbers, symbols or equations.',
};

export const reviewStates = [{ stream: true }, { stream: false }];
