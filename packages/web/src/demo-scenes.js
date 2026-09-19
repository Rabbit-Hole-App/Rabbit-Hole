// Three authored scenes that exercise what the renderer gained in the
// stabilisation pass: a pinned bar axis, arrows with real endpoints, a camera
// that moves the frame, value-mapped grid fill, typeset maths and monospace
// code. Each one teaches something rather than demonstrating a primitive -
// a scene that only shows off is a scene nobody learns the engine from.

// --- 1. why an axis must hold still -----------------------------------------
// The same reveal drawn twice. On the left the axis is recomputed from the
// values every frame, so two plans the learner never touched appear to get
// cheaper at the exact moment the third turns out worse. On the right the axis
// is pinned and only the plan that changed moves.

const PREDICTED = [4, 3, 9];
const ACTUAL = [4, 3, 14];
const PLANS = ['A', 'B', 'C'];

export const axisScene = {
  id: 'why-a-pinned-axis',
  title: 'Why a cost axis has to hold still',
  width: 760,
  height: 420,
  duration: 12,
  objects: [
    { id: 'caption', type: 'text', semanticId: 'caption', conceptId: 'reading-a-chart', initialState: { text: '', x: 40, y: 34 } },
    { id: 'loose-label', type: 'text', semanticId: 'loose-axis-label', initialState: { text: 'axis read from the data', x: 96, y: 92, opacity: 0 } },
    { id: 'loose', type: 'bars', semanticId: 'loose-axis', conceptId: 'reading-a-chart',
      initialState: { label: 'predicted cost', x: 96, y: 130, h: 190, opacity: 0, values: [...PREDICTED], labels: [...PLANS], role: 'warning' } },
    { id: 'pinned-label', type: 'text', semanticId: 'pinned-axis-label', initialState: { text: 'axis pinned to the worst case', x: 452, y: 92, opacity: 0 } },
    { id: 'pinned', type: 'bars', semanticId: 'pinned-axis', conceptId: 'reading-a-chart',
      initialState: { label: 'predicted cost', x: 452, y: 130, h: 190, opacity: 0, peak: 16, values: [...PREDICTED], labels: [...PLANS], role: 'output' } },
    { id: 'note', type: 'text', semanticId: 'note', initialState: { text: '', x: 40, y: 386 } },
  ],
  timeline: [
    { at: 0.0, action: 'type_text', target: 'caption', value: 'three plans, and what each one was predicted to cost', duration: 1.4 },
    { at: 0.6, action: 'appear', target: 'loose-label', duration: 0.4 },
    { at: 0.6, action: 'appear', target: 'loose', duration: 0.5 },
    { at: 0.9, action: 'appear', target: 'pinned-label', duration: 0.4 },
    { at: 0.9, action: 'appear', target: 'pinned', duration: 0.5 },
    { at: 2.6, action: 'change_text', target: 'caption', value: 'now plan C is run, and it costs far more than predicted' },
    { at: 3.2, action: 'set_values', target: 'loose', value: [...ACTUAL], duration: 3.2, easing: 'easeInOut' },
    { at: 3.2, action: 'set_values', target: 'pinned', value: [...ACTUAL], duration: 3.2, easing: 'easeInOut' },
    { at: 7.0, action: 'change_text', target: 'caption', value: 'watch A and B on the left - they never changed' },
    { at: 7.4, action: 'emphasize', target: 'loose', duration: 0.5 },
    { at: 8.6, action: 'type_text', target: 'note', value: 'a floating axis makes untouched bars shrink, so the learner reads a change that never happened', duration: 2.4 },
    { at: 11.4, action: 'highlight_cell', target: 'pinned', value: 'max' },
    { at: 11.4, action: 'highlight_cell', target: 'loose', value: 'max' },
  ],
};

// --- 2. a residual connection ------------------------------------------------
// Straight arrows with authored endpoints, which is what `connect` could never
// draw: its anchors are fixed bottom-to-top, so a sideways flow came out
// diagonal. The camera closes on the addition at the end, because that is the
// part of the picture the sentence is about.

const row = 176;
const box = (id, label, x, role) => ({
  id, type: 'box', semanticId: id, conceptId: 'residual-connection',
  initialState: { label, x, y: row, w: 150, h: 58, opacity: 0, role },
});
const arrow = (id, from, to, role) => ({
  id, type: 'arrow', semanticId: id, conceptId: 'residual-connection',
  initialState: { from, to, opacity: 0, role },
});

export const residualScene = {
  id: 'a-residual-connection',
  title: 'What a residual connection actually does',
  width: 860,
  height: 420,
  duration: 13,
  objects: [
    { id: 'caption', type: 'text', semanticId: 'caption', initialState: { text: '', x: 40, y: 34 } },
    box('input', 'x', 40, 'input'),
    box('block', 'attention + MLP', 260, 'observed'),
    box('sum', 'x + block(x)', 500, 'output'),
    box('next', 'next layer', 700, 'input'),
    arrow('a1', { x: 190, y: row + 29 }, { x: 258, y: row + 29 }, 'neutral'),
    arrow('a2', { x: 410, y: row + 29 }, { x: 498, y: row + 29 }, 'neutral'),
    arrow('a3', { x: 650, y: row + 29 }, { x: 698, y: row + 29 }, 'neutral'),
    // the residual itself: straight over the top of the block it skips
    arrow('skip', { x: 115, y: 150 }, { x: 560, y: 150 }, 'input'),
    { id: 'skip-label', type: 'text', semanticId: 'skip-label', conceptId: 'residual-connection',
      initialState: { text: 'the original x, carried past untouched', x: 190, y: 128, opacity: 0, role: 'input' } },
    { id: 'note', type: 'text', semanticId: 'note', initialState: { text: '', x: 40, y: 320 } },
  ],
  timeline: [
    { at: 0.0, action: 'type_text', target: 'caption', value: 'a layer transforms x, and something has to survive the transform', duration: 1.6 },
    { at: 0.8, action: 'appear', target: 'input', duration: 0.4 },
    { at: 1.4, action: 'appear', target: 'a1', duration: 0.3 },
    { at: 1.7, action: 'appear', target: 'block', duration: 0.4 },
    { at: 2.6, action: 'change_text', target: 'caption', value: 'on its own, the block replaces x entirely' },
    { at: 3.4, action: 'appear', target: 'a2', duration: 0.3 },
    { at: 3.7, action: 'appear', target: 'sum', duration: 0.4 },
    { at: 4.6, action: 'change_text', target: 'caption', value: 'the residual adds x back, so the block only has to learn the change' },
    { at: 5.0, action: 'appear', target: 'skip', duration: 0.9 },
    { at: 5.4, action: 'appear', target: 'skip-label', duration: 0.4 },
    { at: 6.6, action: 'highlight', target: 'sum' },
    { at: 7.0, action: 'focus_camera', target: 'sum', value: { zoom: 1.7 } },
    // pull back to the whole frame before narrating: text outside the zoomed
    // region is simply not on screen, so a caption written during a zoom is lost
    { at: 8.4, action: 'zoom_camera', value: { zoom: 1 }, duration: 1.0 },
    { at: 8.4, action: 'pan_camera', value: { x: 430, y: 210 }, duration: 1.0 },
    { at: 9.4, action: 'unhighlight', target: 'sum' },
    { at: 9.6, action: 'type_text', target: 'note', value: 'gradients reach x through the addition, not only through the block', duration: 2.0 },
    { at: 11.8, action: 'appear', target: 'a3', duration: 0.3 },
    { at: 12.1, action: 'appear', target: 'next', duration: 0.4 },
  ],
};

// --- 3. one function, three notations ----------------------------------------
// The same sigmoid written as maths, as code, and as the numbers it actually
// produces. The strip fills by value, so the S shape is visible before a single
// numeral is read.

const SIGMOID = [0.05, 0.08, 0.13, 0.20, 0.31, 0.43, 0.57, 0.69, 0.80, 0.87, 0.92, 0.95];

export const sigmoidScene = {
  id: 'one-function-three-notations',
  title: 'One function, three notations',
  width: 760,
  height: 420,
  duration: 12,
  objects: [
    { id: 'caption', type: 'text', semanticId: 'caption', initialState: { text: '', x: 40, y: 34 } },
    { id: 'maths-label', type: 'text', semanticId: 'maths-label', initialState: { text: 'as maths', x: 40, y: 96, opacity: 0 } },
    { id: 'maths', type: 'equation', semanticId: 'sigmoid-equation', conceptId: 'sigmoid',
      initialState: { text: '\\sigma(x) = \\frac{1}{1 + e^{-x}}', x: 40, y: 112, w: 280, h: 56, opacity: 0 } },
    { id: 'code-label', type: 'text', semanticId: 'code-label', initialState: { text: 'as code', x: 420, y: 96, opacity: 0 } },
    { id: 'code', type: 'code', semanticId: 'sigmoid-code', conceptId: 'sigmoid',
      initialState: { text: '1 / (1 + torch.exp(-x))', x: 420, y: 132, opacity: 0 } },
    { id: 'numbers-label', type: 'text', semanticId: 'numbers-label', initialState: { text: 'as the numbers it produces, x from -3 to 3', x: 40, y: 232, opacity: 0 } },
    // a data object hangs its own label 10px above its top edge, so leave room
    // for it or the two lines collide
    { id: 'curve', type: 'strip', semanticId: 'sigmoid-values', conceptId: 'sigmoid',
      initialState: { label: 'fill carries the value', x: 40, y: 282, cell: 46, opacity: 0, heat: true, role: 'observed', values: SIGMOID.map(() => 0) } },
    { id: 'note', type: 'text', semanticId: 'note', initialState: { text: '', x: 40, y: 376 } },
  ],
  timeline: [
    { at: 0.0, action: 'type_text', target: 'caption', value: 'the sigmoid squashes any number into the range 0 to 1', duration: 1.6 },
    { at: 0.9, action: 'appear', target: 'maths-label', duration: 0.3 },
    { at: 1.1, action: 'appear', target: 'maths', duration: 0.5 },
    { at: 2.2, action: 'appear', target: 'code-label', duration: 0.3 },
    { at: 2.4, action: 'appear', target: 'code', duration: 0.5 },
    { at: 3.4, action: 'change_text', target: 'caption', value: 'the same function, written for a person and written for a machine' },
    { at: 4.4, action: 'appear', target: 'numbers-label', duration: 0.3 },
    { at: 4.6, action: 'appear', target: 'curve', duration: 0.4 },
    { at: 5.2, action: 'set_values', target: 'curve', value: [...SIGMOID], duration: 2.6, easing: 'easeInOut' },
    { at: 8.2, action: 'change_text', target: 'caption', value: 'and the same function again, as twelve numbers' },
    { at: 8.6, action: 'highlight_cell', target: 'curve', value: 6 },
    { at: 9.0, action: 'type_text', target: 'note', value: 'the fill is the value, so the S shape reads before any numeral does', duration: 2.2 },
  ],
};

// The three scenes as canvas blocks, each parked at a moment where its picture
// has fully drawn - a board that opens on three empty frames teaches nobody
// anything. Press play, or scrub back to zero, to watch them build.
const RESTING = [[axisScene, 11.6], [residualScene, 12.6], [sigmoidScene, 11.6]];
export const demoBlocks = () => RESTING.map(([scene, time]) => ({
  id: crypto.randomUUID(), type: 'animation', dx: 0, dy: 0,
  title: scene.title, scene, time, selectedObject: null, marked: null,
}));

// Named review boards. ?board=<name> seeds exactly what is under review and
// nothing else, so a visual check starts from an empty surface every time.
// A name with no entry here is simply an empty board, which is the useful
// default: adding a review board is adding one line.
// Every role, drawn side by side by the real renderer. Ruling 18 found that
// five of the ten roles are pixel-identical pairs and that `observed` is the
// body-text ink exactly - a claim nobody can check from a palette listing, so
// the swatches are boxes the renderer resolves the same way it resolves a
// lesson. The ink line at the top is the comparison `observed` has to beat.
const ROLE_ORDER = ['neutral', 'input', 'output', 'prediction', 'observed', 'learner', 'tutor', 'code', 'warning', 'success'];
export const rolesScene = {
  id: 'role-palette',
  title: 'Every role, side by side',
  width: 760,
  height: 340,
  duration: 3,
  objects: [
    { id: 'note', type: 'text', semanticId: 'note', initialState: { text: 'plain body text, for comparison', x: 40, y: 34, typography: 'body' } },
    ...ROLE_ORDER.map((role, index) => ({
      id: role,
      type: 'box',
      semanticId: role,
      initialState: {
        label: role,
        role,
        x: 40 + (index % 5) * 140,
        y: 80 + Math.floor(index / 5) * 110,
        w: 120,
        h: 72,
        opacity: 0,
      },
    })),
  ],
  timeline: ROLE_ORDER.map((role, index) => ({
    at: Number((0.1 + index * 0.08).toFixed(2)),
    action: 'appear',
    target: role,
    duration: 'fast',
  })),
};

// Named review boards. ?board=<name> seeds exactly what is under review and
// nothing else, so a visual check starts from an empty surface every time.
// A name with no entry here is simply an empty board, which is the useful
// default: adding a review board is adding one line.
const block = (scene, time) => ({
  id: crypto.randomUUID(), type: 'animation', dx: 0, dy: 0,
  title: scene.title, scene, time, selectedObject: null, marked: null,
});
export const BOARDS = {
  demo: demoBlocks,
  // Exactly the two pictures the palette question needs: the roles side by
  // side, and the one shipped scene where a role reading as body ink actually
  // costs the learner something.
  'a5b-visual': () => [block(rolesScene, 3), block(sigmoidScene, 11.6)],
};
