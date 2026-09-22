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
// Four cards, seeded fresh: exploration inputs at their declared defaults,
// no attempts, everything at its useful paused checkpoint.
export const interactiveAppReviewBlocks = () => [
  { id: crypto.randomUUID(), type: 'animation', dx: 0, dy: 0, title: attentionExplorerScene.title, scene: attentionExplorerScene, time: 4, selectedObject: null, marked: null, activity: attentionActivity },
  { id: crypto.randomUUID(), type: 'animation', dx: 0, dy: 0, title: patchExplorerScene.title, scene: patchExplorerScene, time: 3, selectedObject: null, marked: null, activity: patchActivity },
  { id: crypto.randomUUID(), type: 'animation', dx: 0, dy: 0, title: candidateFutureScene.title, scene: candidateFutureScene, time: 3, selectedObject: null, marked: null, activity: candidateActivity },
  { id: crypto.randomUUID(), type: 'scene', dx: 0, dy: 0, title: 'Vector-projection explorer', spec: vectorProjectionSpec, state: null, attempts: 0, selectedObject: null, activity: projectionActivity, h: 680 },
];

// --- Practice tasks (spec T09) -------------------------------------------------
// Authored task data for the shared activity layer (scene-activity.js).
// Expected values live here and only here; the runtime keeps them out of
// every display, tooltip and tutor payload until their own rules allow.

export const attentionActivity = {
  id: 'i01-practice', check: 'set_equals', version: 2,
  prompt: 'With the query fixed on the THIRD token and the causal mask on, select every position that query may attend to.',
  // State truth: the moment an attempt begins (and at Check, and on New
  // attempt) the visualization snaps to exactly this declared state, so the
  // diagram the learner sees while answering IS the state being asked about.
  fixedInputs: { queryIndex: 2, maskEnabled: true },
  answer: { type: 'indices', label: 'Your prediction', of: 'tokens', default: [] },
  expected: [0, 1, 2],
  notReady: 'Select at least one position first.',
  feedbackPass: 'Right - a causal query attends to itself and every earlier position, so positions 1, 2 and 3 are all allowed.',
  feedbackFail: 'Not quite - a causal query sees every earlier position AND itself, never a later one. Try again with a new attempt.',
};

export const patchActivity = {
  id: 'i02-practice', check: 'index_equals', version: 1,
  prompt: 'Which patch sits at row 3, column 2 of the grid? Pick its number.',
  answer: { type: 'index', label: 'Your answer', of: 'patches', default: 0 },
  expected: 9,
  feedbackPass: 'Right - patches count row-major, so row 3 starts at patch 9 and its second column is patch 10.',
  feedbackFail: 'Not quite - the grid counts row-major: patches 1-4 are row 1, 5-8 row 2, so row 3 column 2 is patch 10. Try a new attempt.',
};

export const candidateActivity = {
  id: 'i03-practice', check: 'choice_equals', version: 1,
  prompt: 'Under the squared-distance cost, which candidate future should be preferred? Committing a prediction reveals the example costs.',
  answer: { type: 'choice', label: 'Your prediction', options: [{ id: 'A', label: 'Path A' }, { id: 'B', label: 'Path B' }, { id: 'C', label: 'Path C' }], default: 'A' },
  expected: 'B',
  revealInput: 'resultsRevealed',
  checkLabel: 'Check prediction',
  feedbackPass: 'Right - B ends at (1, 0), one unit from the goal, the smallest squared distance of the three.',
  feedbackFail: 'The revealed costs show B is cheapest: it ends one unit from the goal. Your committed answer stays recorded; start a new attempt to predict again.',
};

export const projectionActivity = {
  id: 'i04-practice', check: 'projection_zero', version: 1,
  prompt: 'Make the projection zero using a valid, nonzero axis b.',
  checkLabel: 'Check zero projection',
  feedbackPass: 'Zero - a and b are perpendicular, so a has no component along the axis.',
  feedbackFail: 'The projection is not zero yet - move a (or the axis b) until a·b vanishes, then check again.',
};

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

// --- I03: candidate-future explorer -------------------------------------------
// A world model predicts three candidate futures from the current state; the
// learner inspects them, commits a prediction, and only then sees the costs.
// Branching-futures composition: current state -> Path A/B/C arrows ->
// predicted-future boxes, in identity colours with real arrowheads - never a
// coordinate picture without axes. The costs 4, 1, 9 are DERIVED from the
// declared terminals (squared distance to the goal) and the whole cost chart
// is invisible until a committed attempt reveals it; an explicit placeholder
// says so, so hidden never reads as broken.

const I03_GOAL = [0, 0];
const I03_TERMINALS = { A: [2, 0], B: [1, 0], C: [0, 3] };
// Where the inspecting pointer sits, per candidate - scene pixels, derived
// through the pool exactly like every other bound value.
const I03_ROW_Y = { A: 150, B: 260, C: 370 };

export const candidateFutureScene = {
  id: 'candidate-future-explorer',
  title: 'Candidate-future explorer',
  width: 960,
  height: 560,
  duration: 3,
  inputs: [
    { name: 'candidate', type: 'choice', label: 'Inspect candidate', default: 'A',
      options: [{ id: 'A', label: 'Path A' }, { id: 'B', label: 'Path B' }, { id: 'C', label: 'Path C' }] },
    // The commit/reveal latch. hidden: the activity reducer alone writes it -
    // the learner command path refuses it and no widget renders for it.
    { name: 'resultsRevealed', type: 'bool', label: 'Results revealed', default: false, hidden: true },
  ],
  exampleData: {
    goal: I03_GOAL,
    A: I03_TERMINALS.A, B: I03_TERMINALS.B, C: I03_TERMINALS.C,
    markY: { A: I03_ROW_Y.A + 38, B: I03_ROW_Y.B + 38, C: I03_ROW_Y.C + 38 },
    oneV: 1, zeroV: 0,
  },
  derived: {
    dA: { op: 'sub', args: ['A', 'goal'] },
    dB: { op: 'sub', args: ['B', 'goal'] },
    dC: { op: 'sub', args: ['C', 'goal'] },
    costA: { op: 'dot', args: ['dA', 'dA'] },
    costB: { op: 'dot', args: ['dB', 'dB'] },
    costC: { op: 'dot', args: ['dC', 'dC'] },
    costs: { op: 'concat', args: ['costA', 'costB', 'costC'] },
    shownCosts: { op: 'gate', args: ['costs', 'resultsRevealed'] },
    bestAt: { op: 'argmin', args: ['shownCosts'] },
    inspectY: { op: 'pick', args: ['markY', 'candidate'] },
    chartOpacity: { op: 'choose', args: ['resultsRevealed', 'oneV', 'zeroV'] },
    placeholderOpacity: { op: 'choose', args: ['resultsRevealed', 'zeroV', 'oneV'] },
  },
  objects: [
    { id: 'caption', type: 'text', semanticId: 'caption', conceptId: 'candidate-futures',
      initialState: { text: 'inspecting Path {{candidate}} — one of three futures the world model predicts from the current state', x: 40, y: 36 } },
    { id: 'current-state', type: 'box', semanticId: 'current-state', conceptId: 'candidate-futures',
      initialState: { label: 'current state', x: 40, y: 232, w: 160, h: 56, opacity: 0, role: 'observed' } },
    // One branch per candidate: an ARROW (real head) in the candidate's own
    // identity colour, into its predicted-future box.
    { id: 'arrow-a', type: 'arrow', semanticId: 'branch-a', conceptId: 'candidate-futures',
      initialState: { from: { x: 202, y: 252 }, to: { x: 392, y: I03_ROW_Y.A + 28 }, opacity: 0, role: 'prediction', identity: 'future-a' } },
    { id: 'arrow-b', type: 'arrow', semanticId: 'branch-b', conceptId: 'candidate-futures',
      initialState: { from: { x: 202, y: 260 }, to: { x: 392, y: I03_ROW_Y.B + 28 }, opacity: 0, role: 'prediction', identity: 'future-b' } },
    { id: 'arrow-c', type: 'arrow', semanticId: 'branch-c', conceptId: 'candidate-futures',
      initialState: { from: { x: 202, y: 268 }, to: { x: 392, y: I03_ROW_Y.C + 28 }, opacity: 0, role: 'prediction', identity: 'future-c' } },
    { id: 'future-a', type: 'box', semanticId: 'predicted-future-a', conceptId: 'candidate-futures',
      initialState: { label: 'Path A → future A', x: 400, y: I03_ROW_Y.A, w: 220, h: 56, opacity: 0, role: 'prediction', identity: 'future-a' } },
    { id: 'future-b', type: 'box', semanticId: 'predicted-future-b', conceptId: 'candidate-futures',
      initialState: { label: 'Path B → future B', x: 400, y: I03_ROW_Y.B, w: 220, h: 56, opacity: 0, role: 'prediction', identity: 'future-b' } },
    { id: 'future-c', type: 'box', semanticId: 'predicted-future-c', conceptId: 'candidate-futures',
      initialState: { label: 'Path C → future C', x: 400, y: I03_ROW_Y.C, w: 220, h: 56, opacity: 0, role: 'prediction', identity: 'future-c' } },
    // The inspection pointer: its y IS the choice input, resolved through the
    // derive pool like any other bound value. A pointer beside the box - one
    // object, never a second shape stacked on the same spot.
    { id: 'inspecting', type: 'text', semanticId: 'inspecting-marker', conceptId: 'candidate-futures',
      initialState: { text: '◀ inspecting', x: 632, y: { $derive: 'inspectY' }, role: 'learner', typography: 'annotation' } },
    // The cost chart exists only after commitment - values, numerals and the
    // lowest-cost highlight all arrive through the reveal gate, and the
    // whole object is invisible until then.
    { id: 'cost-chart', type: 'grid', semanticId: 'candidate-costs', conceptId: 'candidate-futures',
      // No heat: under a magnitude ramp the LARGEST cost would read as the
      // most emphasised cell, which fights "lower is better". The numerals
      // carry magnitude; the highlight marks the winner (the smallest).
      initialState: { label: 'cost to goal — squared distance (lower is better)', x: 742, y: 220, rows: 1, cols: 3, cell: 56, opacity: { $derive: 'chartOpacity' },
        role: 'output', matrixKind: 'derived',
        columnLabels: ['A', 'B', 'C'], values: { $derive: 'shownCosts' },
        cellHighlight: { $derive: 'bestAt' }, cellHighlightKind: 'select' } },
    { id: 'cost-placeholder', type: 'text', semanticId: 'cost-placeholder', conceptId: 'candidate-futures',
      initialState: { text: 'costs appear after you commit a prediction', x: 700, y: 250, opacity: { $derive: 'placeholderOpacity' }, typography: 'annotation' } },
    { id: 'cost-note', type: 'text', semanticId: 'cost-note', conceptId: 'candidate-futures',
      initialState: { text: 'cost = squared distance from each predicted end to the goal — computed from the declared example data', x: 40, y: 480, typography: 'annotation' } },
    { id: 'provenance-note', type: 'text', semanticId: 'provenance-note', conceptId: 'candidate-futures',
      initialState: { text: 'Toy example — these are predicted outcomes, not observations.', x: 40, y: 510, typography: 'annotation' } },
  ],
  timeline: [
    { at: 0.0, action: 'appear', target: 'current-state', duration: 0.3 },
    { at: 0.4, action: 'appear', target: 'arrow-a', duration: 0.4 },
    { at: 0.55, action: 'appear', target: 'arrow-b', duration: 0.4 },
    { at: 0.7, action: 'appear', target: 'arrow-c', duration: 0.4 },
    { at: 0.9, action: 'appear', target: 'future-a', duration: 0.3 },
    { at: 1.05, action: 'appear', target: 'future-b', duration: 0.3 },
    { at: 1.2, action: 'appear', target: 'future-c', duration: 0.3 },
  ],
};

export const attentionExplorerScene = {
  id: 'attention-explorer',
  title: 'Attention explorer',
  width: 980,
  height: 720,
  duration: 4,
  inputs: [
    // 'visual': the token chips ON the scene are the one query control -
    // real, focusable, keyboard-activable items - so no duplicate strip
    // widget renders for the same input.
    { name: 'queryIndex', type: 'index', label: 'Query token', of: 'tokens', default: 0, presentation: 'visual' },
    { name: 'maskEnabled', type: 'bool', label: 'Causal mask', default: true },
  ],
  exampleData: {
    tokens: I01_TOKENS, Q: I01_Q, K: I01_K, V: I01_V,
    // The mask presentation follows the mask STATE - captions are data the
    // toggle selects between, never a renderer branch.
    scoresCaptionOn: 'scores QKᵀ/√dk — future positions masked',
    scoresCaptionOff: 'scores QKᵀ/√dk — all positions available',
    maskLegendOn: 'gray cells = masked (unavailable to this query)',
    maskLegendOff: '',
  },
  derived: {
    scoresRaw: { op: 'matmul', args: ['Q', 'K'] },
    // 1/sqrt(dk) for dk = 2 - the literal numeric parameter form scale takes.
    scores: { op: 'scale', args: ['scoresRaw', 0.7071067811865476] },
    masked: { op: 'causal_mask', args: ['scores', 'maskEnabled'] },
    weights: { op: 'softmax', args: ['masked'] },
    qword: { op: 'pick', args: ['tokens', 'queryIndex'] },
    qrow: { op: 'pick', args: ['Q', 'queryIndex'] },
    wrow: { op: 'pick', args: ['weights', 'queryIndex'] },
    output: { op: 'weighted_sum', args: ['wrow', 'V'] },
    scoresCaption: { op: 'choose', args: ['maskEnabled', 'scoresCaptionOn', 'scoresCaptionOff'] },
    maskLegend: { op: 'choose', args: ['maskEnabled', 'maskLegendOn', 'maskLegendOff'] },
  },
  objects: [
    // --- the story of the selected query: one band, read left to right ---
    { id: 'caption', type: 'text', semanticId: 'caption', conceptId: 'causal-self-attention',
      initialState: { text: 'query: {{qword}} — follow one row: token → its Q row → its weights → its output', x: 40, y: 36 } },
    { id: 'chars', type: 'tokens', semanticId: 'tokens', conceptId: 'qkv-projection',
      initialState: { label: 'the query token (also selectable with Interact below)', x: 40, y: 88, opacity: 0, tokens: [...I01_TOKENS], role: 'input',
        pickInput: 'queryIndex', cellHighlight: { $derive: 'queryIndex' } } },
    { id: 'q-row', type: 'strip', semanticId: 'selected-query-vector', conceptId: 'qkv-projection',
      initialState: { label: 'Q[{{queryIndex}}] — its query row', x: 40, y: 208, cell: 46, w: 92, h: 46, opacity: 0, role: 'observed', identity: 'query',
        heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'qk-inputs', values: { $derive: 'qrow' } } },
    { id: 'arrow-q-weights', type: 'arrow', semanticId: 'arrow-q-weights', conceptId: 'softmax-attention-weights',
      initialState: { from: { x: 142, y: 231 }, to: { x: 196, y: 231 }, opacity: 0, role: 'neutral' } },
    // The weights as VALUES, not just bar heights: a 1x4 heat row on the
    // fixed probability domain, each cell carrying its own numeral, key
    // tokens named across the top.
    { id: 'weights-row', type: 'grid', semanticId: 'attention-weights', conceptId: 'softmax-attention-weights',
      initialState: { label: 'attention weights for {{qword}} — the row sums to 1', x: 206, y: 208, rows: 1, cols: 4, cell: 52, opacity: 0,
        role: 'observed', matrixKind: 'derived', distribution: true, heat: true, valueScale: 'fixed',
        columnLabels: [...I01_TOKENS], values: { $derive: 'wrow' } } },
    { id: 'arrow-weights-output', type: 'arrow', semanticId: 'arrow-weights-output', conceptId: 'attention-output',
      initialState: { from: { x: 424, y: 231 }, to: { x: 478, y: 231 }, opacity: 0, role: 'neutral' } },
    { id: 'output-row', type: 'strip', semanticId: 'attention-output', conceptId: 'attention-output',
      initialState: { label: 'output — the weighted mix of V', x: 488, y: 208, cell: 46, w: 92, h: 46, opacity: 0, role: 'output',
        heat: true, valueScale: 'shared', valueScaleGroup: 'v-chain', values: { $derive: 'output' } } },
    { id: 'equation', type: 'equation', semanticId: 'attention-equation', conceptId: 'attention-output',
      initialState: { text: '\\text{softmax}\\left(\\dfrac{QK^T}{\\sqrt{d_k}}\\right)V', x: 640, y: 196, w: 430, h: 60, opacity: 0 } },
    // --- the full picture underneath, secondary to the band above ---
    { id: 'full-picture', type: 'text', semanticId: 'full-picture-heading', conceptId: 'causal-self-attention',
      initialState: { text: 'the full picture — every query at once', x: 40, y: 316, typography: 'annotation' } },
    { id: 'q-matrix', type: 'grid', semanticId: 'query-matrix', conceptId: 'qkv-projection',
      initialState: { label: 'Q', x: 90, y: 360, rows: 4, cols: 2, cell: 40, opacity: 0, role: 'observed', identity: 'query',
        heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'qk-inputs', matrixKind: 'input',
        rowLabels: [...I01_TOKENS], values: I01_Q.flat(),
        cellHighlight: { row: { $derive: 'queryIndex' } }, cellHighlightKind: 'highlight' } },
    { id: 'k-matrix', type: 'grid', semanticId: 'key-matrix', conceptId: 'qkv-projection',
      initialState: { label: 'K', x: 270, y: 360, rows: 4, cols: 2, cell: 40, opacity: 0, role: 'observed', identity: 'key',
        heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'qk-inputs', matrixKind: 'input',
        rowLabels: [...I01_TOKENS], values: I01_K.flat() } },
    { id: 'v-matrix', type: 'grid', semanticId: 'value-matrix', conceptId: 'qkv-projection',
      initialState: { label: 'V', x: 450, y: 360, rows: 4, cols: 2, cell: 40, opacity: 0, role: 'observed', identity: 'value',
        heat: true, valueScale: 'shared', valueScaleGroup: 'v-chain', matrixKind: 'input',
        rowLabels: [...I01_TOKENS], values: I01_V.flat() } },
    // The real comparison, recomputed from the inputs on every change: raw
    // QKᵀ/√dk with the causal mask applied when the toggle says so. A masked
    // cell is null - excluded - and softmax never sees it. Caption and
    // legend both follow the mask input through the derive pool.
    { id: 'scores-matrix', type: 'grid', semanticId: 'scores-matrix', conceptId: 'causal-self-attention',
      initialState: { label: '{{scoresCaption}}', x: 680, y: 360, rows: 4, cols: 4, cell: 50, opacity: 0, role: 'observed',
        heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'scores-view', matrixKind: 'relational',
        rowLabels: [...I01_TOKENS], columnLabels: [...I01_TOKENS], values: { $derive: 'masked' },
        cellHighlight: { row: { $derive: 'queryIndex' } }, cellHighlightKind: 'highlight' } },
    { id: 'mask-legend', type: 'text', semanticId: 'mask-legend', conceptId: 'causal-self-attention',
      initialState: { text: '{{maskLegend}}', x: 680, y: 600, typography: 'annotation' } },
  ],
  timeline: [
    { at: 0.0, action: 'appear', target: 'chars', duration: 0.4 },
    { at: 0.5, action: 'appear', target: 'q-row', duration: 0.4 },
    { at: 0.7, action: 'appear', target: 'arrow-q-weights', duration: 0.3 },
    { at: 0.9, action: 'appear', target: 'weights-row', duration: 0.4 },
    { at: 1.1, action: 'appear', target: 'arrow-weights-output', duration: 0.3 },
    { at: 1.3, action: 'appear', target: 'output-row', duration: 0.4 },
    { at: 1.6, action: 'appear', target: 'equation', duration: 0.4 },
    { at: 2.2, action: 'appear', target: 'q-matrix', duration: 0.4 },
    { at: 2.4, action: 'appear', target: 'k-matrix', duration: 0.4 },
    { at: 2.6, action: 'appear', target: 'v-matrix', duration: 0.4 },
    { at: 3.0, action: 'appear', target: 'scores-matrix', duration: 0.5 },
  ],
};
