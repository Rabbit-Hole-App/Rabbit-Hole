// Holdout / generalization set (reviewer's request): scenes NOT used while
// building the interaction runtime, authored only with the existing input
// types (index, bool, choice, indices, vec2), existing derive ops and the
// generic renderer. No new primitive, no new input type, no scene-ID branch,
// no bespoke React renderer. Where the vocabulary cannot express something,
// the gap is reported in docs/rabbit-hole-interactive-visuals-ledger.md
// rather than papered over with a special case.

// --- H1: repo / codebase navigator -------------------------------------------
// Rabbit Hole's own product shape: drill Repository -> file -> class ->
// function, with the breadcrumb, the code excerpt and the architecture
// highlight all following one selection. Expressed as ONE index input over a
// flat node list (each node carries its own crumb, code and arch column);
// clicking any node - chip or architecture box - writes that index, and
// every view derives from it. See the ledger for the two vocabulary gaps
// this surfaced (dependent per-level domains; a vertical clickable text list).

// One signature line per node - the SVG text primitive renders a single line
// (multi-line code is a reported vocabulary gap), so the excerpt is the one
// line that names what the symbol IS.
// One signature line per node, kept short enough to fit the code box's width
// (single-line SVG text does not wrap or ellipsize - a reported gap - so the
// excerpt must fit on its own).
const H1_NODES = [
  { label: 'model.py', crumb: 'nanoGPT › model.py', arch: 0,
    code: 'class GPT(nn.Module): self.blocks = [Block(c) ...]' },
  { label: 'Block', crumb: 'nanoGPT › model.py › Block', arch: 1,
    code: 'class Block: self.attn = CausalSelfAttention(c)' },
  { label: 'CausalSelfAttention', crumb: 'nanoGPT › model.py › Block › CausalSelfAttention', arch: 2,
    code: 'class CausalSelfAttention: self.c_attn = Linear(...)' },
  { label: 'forward()', crumb: 'nanoGPT › model.py › Block › CausalSelfAttention › forward()', arch: 3,
    code: 'def forward(x): att = (q @ k.T) * scale' },
];
// The architecture column, one box per level, highlighted at the node's own
// `arch` row. A 4x1 grid whose highlighted row IS the selection - no values,
// so it is an input matrix carrying only structure.
const H1_ARCH_LABELS = ['Repository', 'file: model.py', 'class hierarchy', 'attention forward'];

export const repoNavigatorScene = {
  id: 'repo-navigator',
  title: 'Codebase navigator',
  width: 980,
  height: 480,
  duration: 2,
  inputs: [
    { name: 'nodeIndex', type: 'index', label: 'Symbol', of: 'nodes', default: 0, presentation: 'visual' },
  ],
  exampleData: { nodes: H1_NODES, arch: H1_ARCH_LABELS },
  derived: {
    sel: { op: 'pick', args: ['nodes', 'nodeIndex'] },
    archRow: { op: 'pick', args: ['nodeArch', 'nodeIndex'] },
  },
  objects: [
    { id: 'caption', type: 'text', semanticId: 'caption', conceptId: 'repo-navigation',
      initialState: { text: '{{sel.crumb}}', x: 40, y: 34 } },
    { id: 'symbols', type: 'tokens', semanticId: 'symbol-path', conceptId: 'repo-navigation',
      initialState: { label: 'the current symbol (also selectable with Interact below)', x: 40, y: 78, w: 760, h: 32, opacity: 0, role: 'input',
        tokens: H1_NODES.map(node => node.label), pickInput: 'nodeIndex', cellHighlight: { $derive: 'nodeIndex' } } },
    // The architecture column - one box per level, the current level ringed.
    { id: 'architecture', type: 'grid', semanticId: 'architecture', conceptId: 'repo-navigation',
      initialState: { label: 'architecture', x: 40, y: 150, rows: 4, cols: 1, cell: 46, opacity: 0, role: 'observed',
        matrixKind: 'input', rowLabels: [...H1_ARCH_LABELS], values: [null, null, null, null],
        cellHighlight: { row: { $derive: 'nodeIndex' } }, cellHighlightKind: 'select' } },
    { id: 'code', type: 'code', semanticId: 'code-excerpt', conceptId: 'repo-navigation',
      initialState: { text: '{{sel.code}}', x: 420, y: 150, w: 520, h: 220, opacity: 0, role: 'code' } },
    { id: 'hint', type: 'text', semanticId: 'hint', conceptId: 'repo-navigation',
      initialState: { text: 'breadcrumb, architecture highlight and code all follow the one selection', x: 40, y: 420, typography: 'annotation' } },
  ],
  timeline: [
    { at: 0.0, action: 'appear', target: 'symbols', duration: 0.4 },
    { at: 0.3, action: 'appear', target: 'architecture', duration: 0.4 },
    { at: 0.5, action: 'appear', target: 'code', duration: 0.4 },
  ],
};

// --- H2: CNN feature-map inspector -------------------------------------------
// Image -> layer 1/2/3 -> inspect a channel. Two index inputs (layer as a
// picker, channel as a slider); the feature map is a heat grid whose values
// are selected by (layer, channel) through nested pick. Existing types only.

// Three layers x four channels, each a small 4x4 feature map (authored toy
// data - deeper layers fire more sparsely, so the maps visibly differ).
const H2_LAYERS = ['edges', 'textures', 'parts'];
const featureMap = (layer, channel) => Array.from({ length: 16 }, (unused, i) => {
  const row = Math.floor(i / 4), col = i % 4;
  const base = Math.sin((row + 1) * (channel + 1) * 0.9) * Math.cos((col + 1) * (layer + 1) * 0.7);
  return Number((Math.max(0, base) ** (layer + 1)).toFixed(2)); // ReLU-ish, sparser when deeper
});
const H2_MAPS = H2_LAYERS.map((unused, layer) => Array.from({ length: 4 }, (u, channel) => featureMap(layer, channel)));

export const cnnInspectorScene = {
  id: 'cnn-feature-inspector',
  title: 'CNN feature-map inspector',
  width: 900,
  height: 520,
  duration: 2,
  inputs: [
    { name: 'layerIndex', type: 'index', label: 'Layer', of: 'layers', default: 0 },
    { name: 'channelIndex', type: 'index', label: 'Channel', of: 'channels', default: 0, presentation: 'slider' },
  ],
  exampleData: { layers: H2_LAYERS, channels: ['0', '1', '2', '3'], maps: H2_MAPS },
  derived: {
    layerMaps: { op: 'pick', args: ['maps', 'layerIndex'] },
    featureMap: { op: 'pick', args: ['layerMaps', 'channelIndex'] },
    layerName: { op: 'pick', args: ['layers', 'layerIndex'] },
  },
  objects: [
    { id: 'caption', type: 'text', semanticId: 'caption', conceptId: 'cnn-features',
      initialState: { text: 'layer "{{layerName}}", channel {{channelIndex}} — deeper layers fire more sparsely', x: 40, y: 34 } },
    { id: 'photo', type: 'image', semanticId: 'source-image', conceptId: 'cnn-features',
      initialState: { src: '/lesson-assets/vlm-patch-source.jpg', x: 40, y: 90, w: 220, h: 220, opacity: 0, role: 'input' } },
    { id: 'image-label', type: 'text', semanticId: 'image-label', conceptId: 'cnn-features',
      initialState: { text: 'input image', x: 40, y: 318, typography: 'annotation' } },
    // Short chip labels (the layer NAME; the number is the position): the
    // "layer N: name" form overran the card's right edge. The caption carries
    // the full "layer N" phrasing.
    { id: 'layer-picker', type: 'tokens', semanticId: 'layer-path', conceptId: 'cnn-features',
      initialState: { label: 'the inspected layer (also selectable with Interact below)', x: 320, y: 90, w: 300, h: 32, opacity: 0, role: 'input',
        tokens: [...H2_LAYERS],
        pickInput: 'layerIndex', cellHighlight: { $derive: 'layerIndex' } } },
    // The feature map: a 4x4 heat grid of activations for the chosen (layer,
    // channel). Theme-neutral legend: the heat ramp saturates with magnitude,
    // so "more saturated = stronger" is true in both light and dark themes
    // (the earlier "brighter" read inverted under the light-theme ramp).
    { id: 'feature-map', type: 'grid', semanticId: 'feature-map', conceptId: 'cnn-features',
      initialState: { label: 'activation map — a more saturated cell is a stronger response', x: 320, y: 160, rows: 4, cols: 4, cell: 52, opacity: 0, role: 'observed',
        matrixKind: 'derived', heat: true, valueScale: 'local', values: { $derive: 'featureMap' } } },
    { id: 'hint', type: 'text', semanticId: 'hint', conceptId: 'cnn-features',
      initialState: { text: 'the same channel across layers shows how features grow from edges to parts', x: 40, y: 470, typography: 'annotation' } },
  ],
  timeline: [
    { at: 0.0, action: 'appear', target: 'photo', duration: 0.4 },
    { at: 0.3, action: 'appear', target: 'layer-picker', duration: 0.4 },
    { at: 0.5, action: 'appear', target: 'feature-map', duration: 0.4 },
  ],
};

// H1 needs a parallel array of each node's arch row for a clean pick; derived
// above references nodeArch, declared here to keep exampleData readable.
repoNavigatorScene.exampleData.nodeArch = H1_NODES.map(node => node.arch);

export const holdoutBoardBlocks = () => [
  { id: crypto.randomUUID(), type: 'animation', dx: 0, dy: 0, title: repoNavigatorScene.title, scene: repoNavigatorScene, time: 2, selectedObject: null, marked: null },
  { id: crypto.randomUUID(), type: 'animation', dx: 0, dy: 0, title: cnnInspectorScene.title, scene: cnnInspectorScene, time: 2, selectedObject: null, marked: null },
];
