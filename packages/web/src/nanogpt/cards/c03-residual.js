// Card 3 - what the residual add preserves. Grounding: model.py Block.forward
// (NanoGPT @3adf61e, lines 104-105): x = x + self.attn(self.ln_1(x)); then
// x = x + self.mlp(self.ln_2(x)). x and u are toy numbers authored here; out,
// out - x and the squared sizes are computed live by derive ops.
//
// x and u are chosen so the shared colour domain is the same in both states
// (max |value| = 2.3: out[0] when on, (u - x)[4] when off), so x's own cells
// never change colour when the toggle flips - only out and out - x do.
import fx from '../fixtures/nanogpt-fixtures.generated.js';

const CELL = 48;
const STRIP_X = 460;
const heatStrip = { cell: CELL, heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'residual-stream', opacity: 0 };

export const scene = {
  id: 'nanogpt-c03-residual',
  title: 'What the residual preserves',
  width: 960,
  height: 660,
  duration: 3,
  inputs: [
    { name: 'residual', type: 'bool', label: 'Residual add: x + branch', default: true },
  ],
  exampleData: {
    commit: fx.provenance.nanogpt.commit.slice(0, 7),
    // Calculated toy example: a 6-dim residual-stream vector and a deliberately
    // small branch update. Not from a model.
    x: [2.1, -1.3, 0.8, 1.7, -2.0, 0.9],
    u: [0.2, 0.1, -0.15, 0.05, 0.3, -0.1],
    statusOn: 'Residual add ON: out = x + u, which is what NanoGPT’s Block.forward does',
    statusOff: 'Residual add OFF: out = u, a what-if; NanoGPT’s code always adds x back',
    outBoxOn: 'out = x + u',
    outBoxOff: 'out = u (no add)',
    skipOn: 'carries x',
    skipOff: 'cut (what-if)',
    outCaptionOn: 'out = x + u: the new x, goes on to ln_2 and the MLP',
    outCaptionOff: 'out = u alone: x was not added back',
    changeCaptionOn: 'out − x = u: only the small update changed',
    changeCaptionOff: 'out − x = u − x: x itself was not passed on',
    takeawayOn: 'On: every entry of x reaches out, shifted only by the small update u.',
    takeawayOff: 'Off: out is only what the branch computed; x’s own entries are not copied into out.',
    verdictOn: 'the change is small next to x',
    verdictOff: 'the change is about as large as x',
    // The what-if state is styled as a warning so it never carries the same
    // visual weight as NanoGPT's real behaviour.
    roleOn: 'output',
    roleOff: 'warning',
  },
  derived: {
    sumXU: { op: 'add', args: ['x', 'u'] },
    out: { op: 'choose', args: ['residual', 'sumXU', 'u'] },
    change: { op: 'sub', args: ['out', 'x'] },
    changeSq: { op: 'dot', args: ['change', 'change'] },
    xSq: { op: 'dot', args: ['x', 'x'] },
    skipOpacity: { op: 'choose', args: ['residual', 1, 0.2] },
    // The last skip segment vanishes when off, so no arrowhead lands on out.
    skipArrowOpacity: { op: 'choose', args: ['residual', 1, 0] },
    stateRole: { op: 'choose', args: ['residual', 'roleOn', 'roleOff'] },
    verdict: { op: 'choose', args: ['residual', 'verdictOn', 'verdictOff'] },
    status: { op: 'choose', args: ['residual', 'statusOn', 'statusOff'] },
    outBox: { op: 'choose', args: ['residual', 'outBoxOn', 'outBoxOff'] },
    skipNote: { op: 'choose', args: ['residual', 'skipOn', 'skipOff'] },
    outCaption: { op: 'choose', args: ['residual', 'outCaptionOn', 'outCaptionOff'] },
    changeCaption: { op: 'choose', args: ['residual', 'changeCaptionOn', 'changeCaptionOff'] },
    takeaway: { op: 'choose', args: ['residual', 'takeawayOn', 'takeawayOff'] },
  },
  objects: [
    { id: 'question', type: 'text', semanticId: 'question', conceptId: 'residual',
      initialState: { text: 'In x = x + attn(ln_1(x)), what does the skip path carry forward unchanged?', x: 40, y: 30 } },
    // Source lines, verbatim from model.py:104-105.
    { id: 'code-attn', type: 'code', semanticId: 'code-attn', conceptId: 'residual',
      initialState: { text: 'x = x + self.attn(self.ln_1(x))', x: 40, y: 62, role: 'code' } },
    { id: 'code-mlp', type: 'code', semanticId: 'code-mlp', conceptId: 'residual',
      initialState: { text: 'x = x + self.mlp(self.ln_2(x))', x: 40, y: 82, role: 'code' } },
    { id: 'source-note', type: 'text', semanticId: 'source-note', conceptId: 'residual',
      initialState: { text: 'source: NanoGPT @{{commit}} model.py:104-105, Block.forward', x: 330, y: 62, typography: 'annotation' } },
    { id: 'twice-note', type: 'text', semanticId: 'twice-note', conceptId: 'residual',
      initialState: { text: 'the residual add runs twice per block: after attention, then after the MLP', x: 330, y: 82, typography: 'annotation' } },
    { id: 'status', type: 'text', semanticId: 'toggle-state', conceptId: 'residual',
      initialState: { text: '{{status}}', x: 40, y: 124, role: { $derive: 'stateRole' } } },
    { id: 'skip-code-note', type: 'text', semanticId: 'skip-code-note', conceptId: 'residual',
      initialState: { text: "the leading 'x +' in line 104 is the skip path", x: 40, y: 150, typography: 'annotation' } },

    // The first add (line 104) as a diagram: branch down the middle, skip path
    // around it. When the add is off the skip path dims and its final arrow
  // into out disappears, so the diagram never shows x flowing into out.
    { id: 'x-box', type: 'box', semanticId: 'x-in', conceptId: 'residual',
      initialState: { label: 'x: residual stream in', x: 40, y: 170, w: 240, h: 44, role: 'input' } },
    { id: 'arrow-x-branch', type: 'arrow', semanticId: 'arrow-x-branch', conceptId: 'residual',
      initialState: { from: { x: 160, y: 216 }, to: { x: 160, y: 254 } } },
    { id: 'branch-box', type: 'box', semanticId: 'branch', conceptId: 'residual',
      initialState: { label: 'branch: attn(ln_1(x))', x: 40, y: 258, w: 240, h: 44 } },
    { id: 'arrow-branch-out', type: 'arrow', semanticId: 'arrow-branch-out', conceptId: 'residual',
      initialState: { from: { x: 160, y: 304 }, to: { x: 160, y: 342 } } },
    { id: 'u-tag', type: 'text', semanticId: 'u-tag', conceptId: 'residual',
      initialState: { text: 'u', x: 172, y: 328, typography: 'annotation' } },
    { id: 'out-box', type: 'box', semanticId: 'out', conceptId: 'residual',
      initialState: { label: '{{outBox}}', x: 40, y: 346, w: 240, h: 44, role: { $derive: 'stateRole' } } },
    { id: 'arrow-out-next', type: 'arrow', semanticId: 'arrow-out-next', conceptId: 'residual',
      initialState: { from: { x: 160, y: 392 }, to: { x: 160, y: 420 } } },
    { id: 'next-note', type: 'text', semanticId: 'next-note', conceptId: 'residual',
      initialState: { text: 'next: ln_2, MLP, second add (line 105)', x: 40, y: 450, typography: 'annotation' } },
    { id: 'skip-1', type: 'line', semanticId: 'skip-path', conceptId: 'residual',
      initialState: { from: { x: 282, y: 192 }, to: { x: 320, y: 192 }, role: 'input', opacity: { $derive: 'skipOpacity' } } },
    { id: 'skip-2', type: 'line', semanticId: 'skip-path-down', conceptId: 'residual',
      initialState: { from: { x: 320, y: 192 }, to: { x: 320, y: 368 }, role: 'input', opacity: { $derive: 'skipOpacity' } } },
    { id: 'skip-3', type: 'arrow', semanticId: 'skip-path-in', conceptId: 'residual',
      initialState: { from: { x: 320, y: 368 }, to: { x: 285, y: 368 }, role: 'input', opacity: { $derive: 'skipArrowOpacity' } } },
    { id: 'skip-label', type: 'text', semanticId: 'skip-label', conceptId: 'residual',
      initialState: { text: 'skip path', x: 332, y: 272, typography: 'annotation' } },
    { id: 'skip-note', type: 'text', semanticId: 'skip-note', conceptId: 'residual',
      initialState: { text: '{{skipNote}}', x: 332, y: 290, typography: 'annotation' } },

    // The four vectors, columns aligned, on ONE signed colour scale.
    { id: 'x-strip', type: 'strip', semanticId: 'x-vector', conceptId: 'residual',
      initialState: { ...heatStrip, label: 'x: residual stream in (toy vector)', x: STRIP_X, y: 170, role: 'input', values: { $derive: 'x' } } },
    { id: 'u-strip', type: 'strip', semanticId: 'branch-update', conceptId: 'residual',
      initialState: { ...heatStrip, label: 'u: toy stand-in for attn(ln_1(x)), deliberately small', x: STRIP_X, y: 258, values: { $derive: 'u' } } },
    { id: 'out-strip', type: 'strip', semanticId: 'out-vector', conceptId: 'residual',
      initialState: { ...heatStrip, label: '{{outCaption}}', x: STRIP_X, y: 346, role: { $derive: 'stateRole' }, values: { $derive: 'out' } } },
    { id: 'change-strip', type: 'strip', semanticId: 'change-vector', conceptId: 'residual',
      initialState: { ...heatStrip, label: '{{changeCaption}}', x: STRIP_X, y: 434, values: { $derive: 'change' } } },

    { id: 'scale-note', type: 'text', semanticId: 'scale-note', conceptId: 'residual',
      initialState: { text: 'one colour scale for all four rows: shades compare', x: STRIP_X, y: 506, typography: 'annotation' } },
    { id: 'heat-legend', type: 'text', semanticId: 'heat-legend', conceptId: 'residual',
      initialState: { text: 'colour: orange = +, blue = −, stronger = larger', x: 40, y: 480, typography: 'annotation' } },
    { id: 'size-readout', type: 'text', semanticId: 'size-readout', conceptId: 'residual',
      initialState: { text: 'squared size of the change Σ(out − x)² = {{changeSq}} vs Σx² = {{xSq}}: {{verdict}}', x: 40, y: 536, role: 'output', opacity: 0 } },
    { id: 'takeaway', type: 'text', semanticId: 'takeaway', conceptId: 'residual',
      initialState: { text: '{{takeaway}}', x: 40, y: 564 } },
    { id: 'trained-note', type: 'text', semanticId: 'trained-note', conceptId: 'residual',
      initialState: { text: 'In a trained model the size of the branch update varies; this toy u is small by choice.', x: 40, y: 590, typography: 'annotation' } },
    { id: 'provenance-note', type: 'text', semanticId: 'provenance-note', conceptId: 'residual',
      initialState: { text: 'x, u: calculated toy example, numbers authored on this card, not computed by attention.', x: 40, y: 612, typography: 'annotation' } },
    { id: 'provenance-live', type: 'text', semanticId: 'provenance-live', conceptId: 'residual',
      initialState: { text: 'out, out − x, Σ: live calculation (add, sub, dot). Code lines: source.', x: 40, y: 634, typography: 'annotation' } },
  ],
  timeline: [
    { at: 0.0, action: 'appear', target: 'x-strip', duration: 0.4 },
    { at: 0.5, action: 'appear', target: 'u-strip', duration: 0.4 },
    { at: 1.0, action: 'appear', target: 'out-strip', duration: 0.4 },
    { at: 1.5, action: 'appear', target: 'change-strip', duration: 0.4 },
    { at: 2.0, action: 'appear', target: 'size-readout', duration: 0.4 },
  ],
};

export const evidence = {
  card: 'c03-residual',
  title: scene.title,
  learningQuestion: scene.objects[0].initialState.text,
  concept: 'The residual add x = x + branch(x) carries x forward unchanged through the skip path; the branch only contributes an update. NanoGPT does this twice per block.',
  sourceRevision: `${fx.provenance.nanogpt.repo} @ ${fx.provenance.nanogpt.commit}`,
  provenance: 'source: model.py:104-105 (Block.forward) quoted verbatim; calculated toy example: x and u authored in exampleData, u is not computed from x by attention; live calculation: out = choose(residual, add(x,u), u), out - x = sub, squared sizes = dot.',
  control: 'residual (bool) "Residual add: x + branch", default true.',
  consequence: 'On: out = x + u, out - x = u, a small change next to x. Off (what-if): out = u, out - x = u - x, about as large as x itself (squared sums compared); the skip path dims, its arrow into out disappears, and captions say x is not carried forward by this branch alone.',
  interactionPurpose: 'A counterfactual toggle: remove the add and see that x no longer reaches out through this branch, while the shared colour scale keeps x\'s cells unchanged across states.',
  task: 'Compare out and out - x with the add on and off; say what the skip path carries.',
  capability: 'bool input + choose/add/sub/dot derive ops, signed heat strips on one shared valueScaleGroup, derived opacity on the skip path, choose-driven captions.',
};
