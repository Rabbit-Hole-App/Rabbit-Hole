import { RASTER_CAPABILITY } from './stamps.js';

const training = [
  { id: 'a1', label: 'A1', at: [-1.25, 1] },
  { id: 'a2', label: 'A2', at: [-1.5, -1] },
  { id: 'a3', label: 'A3', at: [-0.5, 0] },
  { id: 'b1', label: 'B1', at: [0.5, 1] },
  { id: 'b2', label: 'B2', at: [1.25, -0.75] },
  { id: 'b3', label: 'B3', at: [1.5, 0.5] },
];
const viewport = { width: 636, height: 382 };
const plot = { x: 48, y: 48, w: 288, h: 288 };
const toFrame = ([x, y]) => ({ x: plot.x + (x + 2) * plot.w / 4, y: plot.y + (2 - y) * plot.h / 4 });

export const boundaryFixture = {
  id: 'fixture-ai-boundary',
  manifest: {
    title: 'Move a nearest-neighbor boundary',
    summary: 'Drag the labeled points to reshape the colored regions. Move Q or switch between 1 and 3 neighbors to see how the vote changes. Leave-one-out error counts misses when each training point is classified without itself.',
    description: 'Six labeled training points and one query on a two-dimensional plot. The shaded regions show which class wins at each location.',
    assumptions: [],
    inputs: [
      { id: 'neighbors', type: 'select', label: 'Neighbors', default: '1', options: [
        { value: '1', label: '1 neighbor' }, { value: '3', label: '3 neighbors' },
      ] },
    ],
    readouts: [],
    capabilities: [RASTER_CAPABILITY, 'select_inputs'],
    viewport,
    actions: [],
    targets: [...training.map(({ id, label }) => ({ id, label, drag: true })), { id: 'query', label: 'Query (Q)', drag: true }],
  },
  source: `
const training = ${JSON.stringify(training)};
const plot = ${JSON.stringify(plot)};
const viewport = ${JSON.stringify(viewport)};
const size = 24;
// White-backed tints of the shared identity-2 and identity-3 palette.
const regionColors = [[233, 228, 212, 255], [202, 201, 230, 255]];
const classLabel = ['A', 'B'];
const classOf = i => i < 3 ? 0 : 1;

const worldX = x => sdk.clamp(4 * (x - plot.x) / plot.w - 2, -2, 2);
const worldY = y => sdk.clamp(2 - 4 * (y - plot.y) / plot.h, -2, 2);
const toFrame = ([x, y]) => [plot.x + (x + 2) * plot.w / 4, plot.y + (2 - y) * plot.h / 4];

export function initialState() {
  return { points: training.map(point => point.at), query: [0, 1] };
}

export function reduce({ state, event }) {
  if (!['drag_start', 'drag_move', 'drag_end'].includes(event.type)) return state;
  const at = [worldX(event.x), worldY(event.y)];
  if (event.target === 'query') return { ...state, query: at };
  const index = training.findIndex(point => point.id === event.target);
  return { ...state, points: state.points.map((point, i) => i === index ? at : point) };
}

// Keep the first three ranks with strict comparisons so distance ties keep their original index.
function nearest(points, x, y, count, exclude = -1, indices = []) {
  let d1 = Infinity, d2 = Infinity, d3 = Infinity;
  let i1 = -1, i2 = -1, i3 = -1;
  for (let i = 0; i < points.length; i++) {
    if (i === exclude) continue;
    const dx = points[i][0] - x, dy = points[i][1] - y, distance = dx * dx + dy * dy;
    if (distance < d1) {
      d3 = d2; i3 = i2;
      d2 = d1; i2 = i1;
      d1 = distance; i1 = i;
    } else if (distance < d2) {
      d3 = d2; i3 = i2;
      d2 = distance; i2 = i;
    } else if (distance < d3) {
      d3 = distance; i3 = i;
    }
  }
  indices[0] = i1;
  if (count === 3) { indices[1] = i2; indices[2] = i3; }
  return indices;
}

function predict(indices) {
  return indices.length === 1 ? classOf(indices[0])
    : Number(classOf(indices[0]) + classOf(indices[1]) + classOf(indices[2]) >= 2);
}

export function evaluate({ inputs, state }) {
  const count = Number(inputs.neighbors), { points, query } = state;
  const neighbors = nearest(points, query[0], query[1], count), prediction = predict(neighbors);
  const misses = [];
  points.forEach((point, i) => {
    if (predict(nearest(points, point[0], point[1], count, i)) !== classOf(i)) misses.push(training[i].label);
  });

  const pixels = [], cellNeighbors = [];
  const columns = Array.from({ length: size }, (_, col) => worldX(plot.x + (col + 0.5) * plot.w / size));
  for (let row = 0; row < size; row++) {
    const y = worldY(plot.y + (row + 0.5) * plot.h / size);
    for (let col = 0; col < size; col++) {
      const rgba = regionColors[predict(nearest(points, columns[col], y, count, -1, cellNeighbors))];
      pixels.push(rgba[0], rgba[1], rgba[2], rgba[3]);
    }
  }

  const [qx, qy] = toFrame(query), panel = 380;
  const objects = [
    sdk.text('plot-title', plot.x, 26, 'Decision regions'),
    sdk.raster('regions', { ...plot, rows: size, cols: size, pixels }),
    sdk.line('x-axis', plot.x, plot.y + plot.h, plot.x + plot.w, plot.y + plot.h),
    sdk.line('y-axis', plot.x, plot.y, plot.x, plot.y + plot.h),
    sdk.text('x-min', plot.x, 362, '−2', { align: 'middle' }),
    sdk.text('x-max', plot.x + plot.w, 362, '2', { align: 'middle' }),
    sdk.text('x-name', plot.x + plot.w / 2, 362, 'x', { align: 'middle' }),
    sdk.text('y-min', 22, plot.y + plot.h + 5, '−2', { align: 'middle' }),
    sdk.text('y-max', 22, plot.y + 5, '2', { align: 'middle' }),
    sdk.text('y-name', 22, plot.y + plot.h / 2, 'y', { align: 'middle' }),
    ...neighbors.map((i, n) => sdk.line('vote-' + n, qx, qy, ...toFrame(points[i]), { opacity: 0.7 })),
    ...points.map((point, i) => {
      const [x, y] = toFrame(point), { id, label } = training[i];
      return classOf(i) === 0 ? sdk.circle(id, x - 16, y - 16, 32, { text: label })
        : sdk.box(id, x - 16, y - 16, 32, 32, { text: label });
    }),
    sdk.circle('query', qx - 15, qy - 15, 30, { text: 'Q', role: 'learner' }),
    sdk.raster('class-a-swatch', { x: panel, y: 49, w: 18, h: 18, rows: 1, cols: 1, pixels: regionColors[0] }),
    sdk.text('class-a', panel + 26, 63, 'Class A · circles'),
    sdk.raster('class-b-swatch', { x: panel, y: 79, w: 18, h: 18, rows: 1, cols: 1, pixels: regionColors[1] }),
    sdk.text('class-b', panel + 26, 93, 'Class B · squares'),
    sdk.line('separator', panel, 116, 605, 116, { opacity: 0.4 }),
    sdk.text('query-title', panel, 147, 'Query (Q)'),
    sdk.text('neighbors', panel, 177, 'Neighbors: ' + neighbors.map(i => training[i].label).join(', ')),
    sdk.text('prediction', panel, 206, 'Prediction: Class ' + classLabel[prediction]),
    sdk.line('error-separator', panel, 229, 605, 229, { opacity: 0.4 }),
    sdk.text('error', panel, 261, 'Leave-one-out error: ' + misses.length + ' / 6'),
    sdk.text('misses', panel, 291, 'Misses: ' + (misses.join(', ') || 'none')),
  ];
  return {
    frame: sdk.frame(objects, viewport),
    quantities: { prediction, leaveOneOutErrors: misses.length, queryX: query[0], queryY: query[1] },
  };
}
`,
  events: [
    { type: 'drag_start', target: 'a1', ...toFrame(training[0].at) },
    { type: 'drag_move', target: 'a1', ...toFrame([0.75, 0.75]) },
    { type: 'drag_end', target: 'a1', ...toFrame([1, 0.75]) },
    { type: 'input', input: 'neighbors', value: '3' },
  ],
};
