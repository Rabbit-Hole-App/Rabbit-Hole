// The four interactive review cards (docs/rabbit-hole-interactive-visuals-
// agent-spec-v2.md §8). Deliberately authored fixtures: original example
// data, declared typed inputs, and derive-seam pipelines - the shared
// runtime knows none of these words. I01 lives here; I04 rides the existing
// vector_projection_v1 behaviour (scene-behaviors.js) and needs no scene JSON.

// --- I01: attention explorer -------------------------------------------------
// A small calculated example of one attention head, with the query position
// and the causal mask as learning inputs. Every number on screen resolves
// through the derive seam from the Q/K/V declared below - the mask toggle
// recomputes weights and output, it never just repaints cells.

const I01_TOKENS = ['river', 'flows', 'south', 'today'];
// Two-dimensional heads, chosen so extremes sit on the diagonal: the shared
// score domain is then identical with the mask on or off, and a toggled mask
// changes exactly the numbers it should - never every cell's contrast.
const I01_Q = [[1, 0], [0, 1], [1, 1], [1, -1]];
const I01_K = [[1, 0], [0, 1], [1, 1], [-1, 1]];
const I01_V = [[1, 0], [0, 1], [1, 1], [-1, 0]];

// --- I02: image-patch explorer -----------------------------------------------
// One real local image, a fixed 4x4 grid over it, and a single patchIndex
// input that a click on the image, the slider, and the steppers all write.
// The enlarged view is a WINDOW onto the same file (the renderer's crop
// fractions), so source and crop can never disagree - and no request of any
// kind fires when a patch is selected.

// Zero-based data, one-based people: internal index 5 is patch 6 of 16,
// row 2, column 2, and the record says so in its own words.
const I02_PATCHES = Array.from({ length: 16 }, (unused, index) => {
  const row = Math.floor(index / 4), column = index % 4;
  return {
    x: column * 0.25, y: row * 0.25, w: 0.25, h: 0.25,
    human: `Patch ${index + 1} of 16 · row ${row + 1}, column ${column + 1}`,
  };
});

export const patchExplorerScene = {
  id: 'image-patch-explorer',
  title: 'Image-patch explorer',
  width: 960,
  height: 590,
  duration: 3,
  inputs: [
    { name: 'patchIndex', type: 'index', label: 'Patch', of: 'patches', default: 0, presentation: 'slider' },
  ],
  exampleData: { patches: I02_PATCHES },
  derived: {
    patch: { op: 'pick', args: ['patches', 'patchIndex'] },
  },
  objects: [
    { id: 'caption', type: 'text', semanticId: 'caption', conceptId: 'vlm-pipeline',
      initialState: { text: '{{patch.human}} - click the image, drag the slider, or step', x: 40, y: 36 } },
    { id: 'photo', type: 'image', semanticId: 'source-image', conceptId: 'vlm-pipeline',
      initialState: { src: '/lesson-assets/vlm-patch-source.jpg', x: 40, y: 100, w: 320, h: 320, opacity: 0, role: 'input' } },
    // Overlaid on the image, drawn after so it paints on top; carries the
    // learner's pick (SelectionMark ring on the chosen cell) and the click
    // targets that write patchIndex.
    { id: 'patch-grid', type: 'grid', semanticId: 'patch-grid', conceptId: 'vlm-pipeline',
      initialState: { label: '16 fixed-size patches - click one', x: 40, y: 100, rows: 4, cols: 4, cell: 80, opacity: 0, role: 'input',
        pickInput: 'patchIndex', cellHighlight: { $derive: 'patchIndex' } } },
    { id: 'patch-crop', type: 'image', semanticId: 'patch-crop', conceptId: 'vlm-pipeline',
      initialState: { src: '/lesson-assets/vlm-patch-source.jpg', x: 520, y: 140, w: 220, h: 220, opacity: 0, role: 'input',
        crop: { $derive: 'patch' } } },
    // SVG will not stroke an <image>, so the crop's frame is its own box -
    // a related highlight tied to the source cell's selection by content,
    // not a second independent selection.
    { id: 'patch-crop-outline', type: 'box', semanticId: 'patch-crop-outline', conceptId: 'vlm-pipeline',
      initialState: { x: 520, y: 140, w: 220, h: 220, opacity: 0, role: 'neutral' } },
    { id: 'crop-label', type: 'text', semanticId: 'crop-label', conceptId: 'vlm-pipeline',
      initialState: { text: 'the same patch, enlarged - a window onto the same file', x: 520, y: 384, opacity: 0, typography: 'annotation' } },
    // The patch as a sequence position: one chip per patch token, the chosen
    // one lit as a downstream consequence of the selection above.
    // Authored w/h: a tokens row has no authored box by default, and the
    // content-bounds fit then under-measures it - which cropped this strip at
    // the frame's bottom edge in review. 859 = the exact chip-run width for
    // '1'..'16' at the shared chip metrics; 32 = the chip height.
    { id: 'positions', type: 'tokens', semanticId: 'patch-positions', conceptId: 'vlm-pipeline',
      initialState: { label: 'the 16 patches as a token sequence', x: 40, y: 490, w: 859, h: 32, opacity: 0, role: 'observed',
        tokens: I02_PATCHES.map((unused, index) => String(index + 1)),
        cellHighlight: { $derive: 'patchIndex' }, cellHighlightKind: 'highlight' } },
  ],
  timeline: [
    { at: 0.0, action: 'appear', target: 'photo', duration: 0.4 },
    { at: 0.3, action: 'appear', target: 'patch-grid', duration: 0.4 },
    { at: 0.8, action: 'appear', target: 'patch-crop', duration: 0.4 },
    { at: 0.8, action: 'appear', target: 'patch-crop-outline', duration: 0.4 },
    { at: 1.0, action: 'appear', target: 'crop-label', duration: 0.3 },
    { at: 1.6, action: 'appear', target: 'positions', duration: 0.4 },
  ],
};

// --- The review board (spec T12) ------------------------------------------------
// Four EXPLORE-ONLY cards: the learner inspects the concept; there is no
// practice task on any of them. (The activity layer still exists generically
// for lessons that genuinely need a task, but these four do not attach one.)
export const interactiveAppReviewBlocks = () => [
  { id: crypto.randomUUID(), type: 'animation', dx: 0, dy: 0, title: attentionExplorerScene.title, scene: attentionExplorerScene, time: 4, selectedObject: null, marked: null },
  { id: crypto.randomUUID(), type: 'animation', dx: 0, dy: 0, title: patchExplorerScene.title, scene: patchExplorerScene, time: 3, selectedObject: null, marked: null },
  { id: crypto.randomUUID(), type: 'animation', dx: 0, dy: 0, title: candidateFutureScene.title, scene: candidateFutureScene, time: 3, selectedObject: null, marked: null },
  { id: crypto.randomUUID(), type: 'scene', dx: 0, dy: 0, title: 'Vector-projection explorer', spec: vectorProjectionSpec, state: null, attempts: 0, selectedObject: null, h: 680 },
];

// No practice tasks: these four cards are explore-only. The generic activity
// layer (scene-activity.js / SceneActivity.jsx) still exists for a lesson
// that genuinely needs a task, but nothing on this board attaches one.

// --- I04: vector-projection explorer -------------------------------------------
// Rides the existing vector_projection_v1 behaviour and its project()
// calculation (scene-behaviors.js) - the spec's "existing named projection
// calculation", not a second implementation. This is the activity spec the
// review board seeds as a lesson block.
export const vectorProjectionSpec = {
  type: 'interactive_scene',
  id: 'vector-projection-explorer',
  schemaVersion: 1,
  behaviorId: 'vector_projection_v1',
  renderer: 'svg',
  conceptIds: ['vector-projection', 'dot-product'],
  // The scene-declared symmetric domain the spec names: ±5, clamped on every
  // write path and drawn by the renderer.
  initialState: { a: [3, 2], b: [2, 0], range: 5 },
  interactions: [
    { input: 'drag_handle', target: 'a', action: 'set_vector' },
    { input: 'drag_handle', target: 'b', action: 'set_vector' },
    { input: 'number', action: 'set_vector' },
    { input: 'button', label: 'Reset experiment', action: 'reset_attempt' },
  ],
  execution: { mode: 'local_calculation' },
  buildGoal: 'Drag a vector or its axis - or type coordinates - and watch the projection recompute live.',
  checkGoal: 'Make the projection zero using a valid, nonzero axis b.',
};

// --- I03: world-model planner -------------------------------------------------
// A world model rolls each candidate ACTION forward into a short predicted
// trajectory (t+1 -> t+2 -> outcome). Two things are manipulated and each
// changes real state, not a highlight:
//   1. Action  -> the predicted rollout boxes and that action's cost readout
//                 both change to the model's prediction for THAT action.
//   2. Goal    -> the cost weights change, so the SAME three futures yield a
//                 different cheapest action. Safest rings Brake; Fastest rings
//                 Continue. This is the counterfactual: the world model predicts
//                 futures; the objective decides which future the planner prefers.
// Every number (collision risk, time, total cost, the ringed pick) is DERIVED
// from the declared example data through scale/add/argmin - none is typed.

export const candidateFutureScene = {
  id: 'candidate-future-explorer',
  title: 'World-model planner',
  width: 980,
  height: 510,
  duration: 3,
  inputs: [
    { name: 'action', type: 'index', label: 'Action', of: 'actions', default: 0, presentation: 'picker' },
    { name: 'goal', type: 'index', label: 'Goal', of: 'goals', default: 0, presentation: 'picker' },
  ],
  exampleData: {
    actions: ['Turn left', 'Brake', 'Continue'],
    goals: ['Safest', 'Fastest'],
    // One predicted trajectory per action: t+1, t+2, outcome.
    rollouts: [
      ['veers left', 'crosses lane', 'collision risk'],
      ['slows', 'stops short', 'safe stop'],
      ['holds speed', 'closes gap', 'near miss'],
    ],
    collision: [0.5, 0.1, 0.8], // collision risk per action
    time: [2, 3, 1],            // steps to goal per action (higher = slower)
    cWeightByGoal: [8, 1],      // how much each goal weights collision risk
    tWeightByGoal: [1, 2],      // how much each goal weights time
    // Weights are chosen so every total stays under 10 - the cell formatter
    // keeps two decimals below 10 and drops them above, so this keeps the grid
    // and the readout showing the same number.
  },
  derived: {
    actionName: { op: 'pick', args: ['actions', 'action'] },
    goalName: { op: 'pick', args: ['goals', 'goal'] },
    selRoll: { op: 'pick', args: ['rollouts', 'action'] },
    selColl: { op: 'pick', args: ['collision', 'action'] },
    selTime: { op: 'pick', args: ['time', 'action'] },
    cWeight: { op: 'pick', args: ['cWeightByGoal', 'goal'] },
    tWeight: { op: 'pick', args: ['tWeightByGoal', 'goal'] },
    wColl: { op: 'scale', args: ['collision', 'cWeight'] },
    wTime: { op: 'scale', args: ['time', 'tWeight'] },
    totals: { op: 'add', args: ['wColl', 'wTime'] },
    selTotal: { op: 'pick', args: ['totals', 'action'] },
    preferredAt: { op: 'argmin', args: ['totals'] },
    preferredName: { op: 'pick', args: ['actions', 'preferredAt'] },
  },
  objects: [
    { id: 'caption', type: 'text', semanticId: 'caption', conceptId: 'world-model',
      initialState: { text: 'Goal: {{goalName}} — pick an action; its predicted rollout and its cost both change', x: 40, y: 34 } },
    // The predicted trajectory for the SELECTED action: current state, then two
    // predicted steps, then the outcome. Each box's text is the model's
    // prediction for this action, so changing the action changes the future.
    // Step headers sit above the strip (short, clear of the arrow line); the
    // box text is just the predicted state, so it never overruns its box.
    { id: 'head-now', type: 'text', semanticId: 'head-now', conceptId: 'world-model',
      initialState: { text: 'now', x: 40, y: 100, typography: 'annotation' } },
    { id: 'head-t1', type: 'text', semanticId: 'head-t1', conceptId: 'world-model',
      initialState: { text: 't+1', x: 234, y: 100, typography: 'annotation' } },
    { id: 'head-t2', type: 'text', semanticId: 'head-t2', conceptId: 'world-model',
      initialState: { text: 't+2', x: 448, y: 100, typography: 'annotation' } },
    { id: 'head-out', type: 'text', semanticId: 'head-out', conceptId: 'world-model',
      initialState: { text: 'outcome', x: 662, y: 100, typography: 'annotation' } },
    { id: 'current-state', type: 'box', semanticId: 'current-state', conceptId: 'world-model',
      initialState: { label: 'current state', x: 40, y: 120, w: 150, h: 56, opacity: 0, role: 'observed' } },
    { id: 'arrow-1', type: 'arrow', semanticId: 'step-1', conceptId: 'world-model',
      initialState: { from: { x: 194, y: 148 }, to: { x: 206, y: 148 }, opacity: 0, role: 'prediction' } },
    { id: 'step-1', type: 'box', semanticId: 'predicted-t1', conceptId: 'world-model',
      initialState: { label: '{{selRoll.0}}', x: 234, y: 120, w: 170, h: 56, opacity: 0, role: 'prediction' } },
    { id: 'arrow-2', type: 'arrow', semanticId: 'step-2', conceptId: 'world-model',
      initialState: { from: { x: 408, y: 148 }, to: { x: 420, y: 148 }, opacity: 0, role: 'prediction' } },
    { id: 'step-2', type: 'box', semanticId: 'predicted-t2', conceptId: 'world-model',
      initialState: { label: '{{selRoll.1}}', x: 448, y: 120, w: 170, h: 56, opacity: 0, role: 'prediction' } },
    { id: 'arrow-3', type: 'arrow', semanticId: 'step-3', conceptId: 'world-model',
      initialState: { from: { x: 622, y: 148 }, to: { x: 634, y: 148 }, opacity: 0, role: 'prediction' } },
    { id: 'outcome', type: 'box', semanticId: 'predicted-outcome', conceptId: 'world-model',
      initialState: { label: '{{selRoll.2}}', x: 662, y: 120, w: 180, h: 56, opacity: 0, role: 'prediction' } },
    { id: 'rollout-note', type: 'text', semanticId: 'rollout-note', conceptId: 'world-model',
      initialState: { text: 'the rollout above is the world model’s prediction for “{{actionName}}”', x: 40, y: 198, typography: 'annotation' } },
    // The selected action's cost, read straight from the derived vectors.
    { id: 'cost-readout', type: 'text', semanticId: 'cost-readout', conceptId: 'world-model',
      initialState: { text: '“{{actionName}}” — collision risk {{selColl}} · time {{selTime}} · total cost {{selTotal}}', x: 40, y: 250, role: 'output' } },
    // Total cost per action UNDER THIS GOAL. Changing the goal re-weights the
    // costs, so the ringed cheapest action moves - same futures, different pick.
    { id: 'cost-chart', type: 'grid', semanticId: 'action-costs', conceptId: 'world-model',
      initialState: { label: 'total cost per action under this goal (lower is better)', x: 40, y: 336, rows: 1, cols: 3, cell: 64, opacity: 0,
        role: 'output', matrixKind: 'derived',
        columnLabels: ['left', 'brake', 'continue'], values: { $derive: 'totals' },
        cellHighlight: { $derive: 'preferredAt' }, cellHighlightKind: 'select' } },
    { id: 'preferred-note', type: 'text', semanticId: 'preferred-note', conceptId: 'world-model',
      initialState: { text: 'under “{{goalName}}” the planner prefers “{{preferredName}}” — the future with the lowest total cost', x: 40, y: 452, typography: 'annotation' } },
    { id: 'provenance-note', type: 'text', semanticId: 'provenance-note', conceptId: 'world-model',
      initialState: { text: 'Toy example — rollouts and costs come from the declared example data, not observations.', x: 40, y: 480, typography: 'annotation' } },
  ],
  timeline: [
    { at: 0.0, action: 'appear', target: 'current-state', duration: 0.3 },
    { at: 0.3, action: 'appear', target: 'arrow-1', duration: 0.25 },
    { at: 0.45, action: 'appear', target: 'step-1', duration: 0.3 },
    { at: 0.6, action: 'appear', target: 'arrow-2', duration: 0.25 },
    { at: 0.75, action: 'appear', target: 'step-2', duration: 0.3 },
    { at: 0.9, action: 'appear', target: 'arrow-3', duration: 0.25 },
    { at: 1.05, action: 'appear', target: 'outcome', duration: 0.3 },
    { at: 1.3, action: 'appear', target: 'cost-readout', duration: 0.3 },
    { at: 1.5, action: 'appear', target: 'cost-chart', duration: 0.4 },
  ],
};

export const attentionExplorerScene = {
  id: 'attention-explorer',
  title: 'Attention explorer',
  width: 860,
  height: 410,
  duration: 4,
  inputs: [
    // One query control, in the INTERACT zone below (a picker). The tokens
    // in the visual are LABELS that highlight the selection - not a second
    // toolbar - so the learner never sees two query selectors.
    { name: 'queryIndex', type: 'index', label: 'Query token', of: 'tokens', default: 0 },
    { name: 'maskEnabled', type: 'bool', label: 'Causal mask', default: true },
  ],
  exampleData: {
    tokens: I01_TOKENS, Q: I01_Q, K: I01_K, V: I01_V,
    // The mask presentation follows the mask STATE - captions are data the
    // toggle selects between, never a renderer branch.
    scoresCaptionOn: 'scores QKᵀ/√dk — future masked',
    scoresCaptionOff: 'scores QKᵀ/√dk — all visible',
    maskLegendOn: 'gray = masked (this query cannot see the future)',
    maskLegendOff: 'mask off — every position is available to this query',
  },
  derived: {
    scoresRaw: { op: 'matmul', args: ['Q', 'K'] },
    // 1/sqrt(dk) for dk = 2 - the literal numeric parameter form scale takes.
    scores: { op: 'scale', args: ['scoresRaw', 0.7071067811865476] },
    masked: { op: 'causal_mask', args: ['scores', 'maskEnabled'] },
    weights: { op: 'softmax', args: ['masked'] },
    qword: { op: 'pick', args: ['tokens', 'queryIndex'] },
    qrow: { op: 'pick', args: ['Q', 'queryIndex'] },
    // The one thing the learner is following: the SELECTED query's scores
    // against every key, and the weights and output that follow from them.
    // One representation per purpose - no full 4x4 matrix duplicating this.
    scoreRow: { op: 'pick', args: ['masked', 'queryIndex'] },
    wrow: { op: 'pick', args: ['weights', 'queryIndex'] },
    output: { op: 'weighted_sum', args: ['wrow', 'V'] },
    scoresCaption: { op: 'choose', args: ['maskEnabled', 'scoresCaptionOn', 'scoresCaptionOff'] },
    maskLegend: { op: 'choose', args: ['maskEnabled', 'maskLegendOn', 'maskLegendOff'] },
  },
  objects: [
    // One dominant pipeline, read left to right: the selected query token,
    // its Q row, its scores against every key, the attention weights, the
    // output. Changing the query changes every stage; toggling the mask fills
    // or blanks the future scores and reshapes the whole distribution - the
    // counterfactuals a learner comes here to see.
    { id: 'caption', type: 'text', semanticId: 'caption', conceptId: 'causal-self-attention',
      initialState: { text: 'query: {{qword}} — its Q row → scores against each key → attention weights → output', x: 40, y: 36 } },
    { id: 'chars', type: 'tokens', semanticId: 'tokens', conceptId: 'qkv-projection',
      initialState: { label: 'the four tokens — the highlighted one is the current query', x: 40, y: 84, opacity: 0, tokens: [...I01_TOKENS], role: 'input',
        cellHighlight: { $derive: 'queryIndex' } } },
    { id: 'q-row', type: 'strip', semanticId: 'selected-query-vector', conceptId: 'qkv-projection',
      initialState: { label: 'Q[{{qword}}]', x: 40, y: 190, cell: 44, w: 88, h: 44, opacity: 0, role: 'observed', identity: 'query',
        heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'qk-inputs', values: { $derive: 'qrow' } } },
    { id: 'arrow-q-scores', type: 'arrow', semanticId: 'arrow-q-scores', conceptId: 'causal-self-attention',
      initialState: { from: { x: 132, y: 212 }, to: { x: 172, y: 212 }, opacity: 0, role: 'neutral' } },
    { id: 'scores-row', type: 'grid', semanticId: 'scores-row', conceptId: 'causal-self-attention',
      initialState: { label: '{{scoresCaption}}', x: 178, y: 190, rows: 1, cols: 4, cell: 46, opacity: 0,
        role: 'observed', matrixKind: 'derived', heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'scores-view',
        columnLabels: [...I01_TOKENS], values: { $derive: 'scoreRow' } } },
    { id: 'arrow-scores-weights', type: 'arrow', semanticId: 'arrow-scores-weights', conceptId: 'softmax-attention-weights',
      initialState: { from: { x: 366, y: 212 }, to: { x: 442, y: 212 }, opacity: 0, role: 'neutral' } },
    { id: 'weights-row', type: 'grid', semanticId: 'attention-weights', conceptId: 'softmax-attention-weights',
      initialState: { label: 'attention weights (sum to 1)', x: 448, y: 190, rows: 1, cols: 4, cell: 46, opacity: 0,
        role: 'observed', matrixKind: 'derived', distribution: true, heat: true, valueScale: 'fixed',
        columnLabels: [...I01_TOKENS], values: { $derive: 'wrow' } } },
    { id: 'arrow-weights-output', type: 'arrow', semanticId: 'arrow-weights-output', conceptId: 'attention-output',
      initialState: { from: { x: 636, y: 212 }, to: { x: 702, y: 212 }, opacity: 0, role: 'neutral' } },
    { id: 'output-row', type: 'strip', semanticId: 'attention-output', conceptId: 'attention-output',
      initialState: { label: 'output = Σ wᵢ·Vᵢ', x: 708, y: 190, cell: 44, w: 88, h: 44, opacity: 0, role: 'output',
        heat: true, valueScale: 'shared', valueScaleGroup: 'v-chain', values: { $derive: 'output' } } },
    { id: 'mask-legend', type: 'text', semanticId: 'mask-legend', conceptId: 'causal-self-attention',
      initialState: { text: '{{maskLegend}}', x: 178, y: 290, typography: 'annotation' } },
    { id: 'equation', type: 'equation', semanticId: 'attention-equation', conceptId: 'attention-output',
      initialState: { text: '\\text{output} = \\text{softmax}\\left(\\dfrac{QK^T}{\\sqrt{d_k}}\\right)V', x: 178, y: 330, w: 560, h: 60, opacity: 0 } },
  ],
  timeline: [
    { at: 0.0, action: 'appear', target: 'chars', duration: 0.4 },
    { at: 0.4, action: 'appear', target: 'q-row', duration: 0.4 },
    { at: 0.6, action: 'appear', target: 'arrow-q-scores', duration: 0.3 },
    { at: 0.8, action: 'appear', target: 'scores-row', duration: 0.4 },
    { at: 1.0, action: 'appear', target: 'arrow-scores-weights', duration: 0.3 },
    { at: 1.2, action: 'appear', target: 'weights-row', duration: 0.4 },
    { at: 1.4, action: 'appear', target: 'arrow-weights-output', duration: 0.3 },
    { at: 1.6, action: 'appear', target: 'output-row', duration: 0.4 },
    { at: 2.0, action: 'appear', target: 'equation', duration: 0.4 },
  ],
};
