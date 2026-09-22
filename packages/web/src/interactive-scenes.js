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
    { id: 'positions', type: 'tokens', semanticId: 'patch-positions', conceptId: 'vlm-pipeline',
      initialState: { label: 'the 16 patches as a token sequence', x: 40, y: 490, opacity: 0, role: 'observed',
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

export const attentionExplorerScene = {
  id: 'attention-explorer',
  title: 'Attention explorer',
  width: 1040,
  height: 700,
  duration: 4,
  inputs: [
    { name: 'queryIndex', type: 'index', label: 'Query token', of: 'tokens', default: 0 },
    { name: 'maskEnabled', type: 'bool', label: 'Causal mask', default: true },
  ],
  exampleData: { tokens: I01_TOKENS, Q: I01_Q, K: I01_K, V: I01_V },
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
  },
  objects: [
    { id: 'caption', type: 'text', semanticId: 'caption', conceptId: 'causal-self-attention',
      initialState: { text: 'query: {{qword}} - scores, weights and output below all follow it', x: 40, y: 36 } },
    { id: 'chars', type: 'tokens', semanticId: 'tokens', conceptId: 'qkv-projection',
      initialState: { label: 'click a token to change the query', x: 40, y: 88, opacity: 0, tokens: [...I01_TOKENS], role: 'input',
        pickInput: 'queryIndex', cellHighlight: { $derive: 'queryIndex' } } },
    { id: 'q-matrix', type: 'grid', semanticId: 'query-matrix', conceptId: 'qkv-projection',
      initialState: { label: 'Q', x: 110, y: 220, rows: 4, cols: 2, cell: 46, opacity: 0, role: 'observed', identity: 'query',
        heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'qk-inputs', matrixKind: 'input',
        rowLabels: [...I01_TOKENS], values: I01_Q.flat(),
        cellHighlight: { row: { $derive: 'queryIndex' } }, cellHighlightKind: 'highlight' } },
    { id: 'k-matrix', type: 'grid', semanticId: 'key-matrix', conceptId: 'qkv-projection',
      initialState: { label: 'K', x: 330, y: 220, rows: 4, cols: 2, cell: 46, opacity: 0, role: 'observed', identity: 'key',
        heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'qk-inputs', matrixKind: 'input',
        rowLabels: [...I01_TOKENS], values: I01_K.flat() } },
    { id: 'v-matrix', type: 'grid', semanticId: 'value-matrix', conceptId: 'qkv-projection',
      initialState: { label: 'V', x: 550, y: 220, rows: 4, cols: 2, cell: 46, opacity: 0, role: 'observed', identity: 'value',
        heat: true, valueScale: 'shared', valueScaleGroup: 'v-chain', matrixKind: 'input',
        rowLabels: [...I01_TOKENS], values: I01_V.flat() } },
    // The real comparison, recomputed from the inputs on every change: raw
    // QKᵀ/√dk with the causal mask applied when the toggle says so. A masked
    // cell is null - excluded - and softmax below never sees it.
    { id: 'scores-matrix', type: 'grid', semanticId: 'scores-matrix', conceptId: 'causal-self-attention',
      initialState: { label: 'scores: QKᵀ/√dk, masked cells excluded', x: 790, y: 220, rows: 4, cols: 4, cell: 50, opacity: 0, role: 'observed',
        heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'scores-view', matrixKind: 'relational',
        rowLabels: [...I01_TOKENS], columnLabels: [...I01_TOKENS], values: { $derive: 'masked' },
        cellHighlight: { row: { $derive: 'queryIndex' } }, cellHighlightKind: 'highlight' } },
    { id: 'q-row', type: 'strip', semanticId: 'selected-query-vector', conceptId: 'qkv-projection',
      initialState: { label: 'selected query row Q[{{queryIndex}}]', x: 110, y: 500, cell: 46, w: 92, h: 46, opacity: 0, role: 'observed', identity: 'query',
        heat: { mode: 'signed' }, valueScale: 'shared', valueScaleGroup: 'qk-inputs', values: { $derive: 'qrow' } } },
    { id: 'weights-row', type: 'bars', semanticId: 'attention-weights', conceptId: 'softmax-attention-weights',
      initialState: { label: 'attention weights for {{qword}} - each bar is a probability', x: 330, y: 480, w: 240, h: 110, cell: 60, peak: 1, opacity: 0,
        role: 'observed', distribution: true, labels: [...I01_TOKENS], values: { $derive: 'wrow' } } },
    { id: 'output-row', type: 'strip', semanticId: 'attention-output', conceptId: 'attention-output',
      initialState: { label: 'output - the weighted mix of V', x: 790, y: 500, cell: 46, w: 92, h: 46, opacity: 0, role: 'output',
        heat: true, valueScale: 'shared', valueScaleGroup: 'v-chain', values: { $derive: 'output' } } },
    { id: 'equation', type: 'equation', semanticId: 'attention-equation', conceptId: 'attention-output',
      initialState: { text: '\\text{softmax}\\left(\\dfrac{QK^T}{\\sqrt{d_k}}\\right)V', x: 330, y: 630, w: 430, h: 60, opacity: 0 } },
  ],
  timeline: [
    { at: 0.0, action: 'appear', target: 'chars', duration: 0.4 },
    { at: 0.4, action: 'appear', target: 'q-matrix', duration: 0.4 },
    { at: 0.6, action: 'appear', target: 'k-matrix', duration: 0.4 },
    { at: 0.8, action: 'appear', target: 'v-matrix', duration: 0.4 },
    { at: 1.4, action: 'appear', target: 'scores-matrix', duration: 0.5 },
    { at: 2.2, action: 'appear', target: 'q-row', duration: 0.4 },
    { at: 2.4, action: 'appear', target: 'weights-row', duration: 0.4 },
    { at: 2.6, action: 'appear', target: 'output-row', duration: 0.4 },
    { at: 3.0, action: 'appear', target: 'equation', duration: 0.4 },
  ],
};
