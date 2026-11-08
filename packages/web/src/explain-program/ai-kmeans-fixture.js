import { RASTER_CAPABILITY } from './stamps.js';

const viewport = { width: 640, height: 362 };
const plot = { x: 202, y: 176, scale: 52, xLimit: 3, yLimit: 2.5 };
const initialCenters = [[-2.5, 0], [2.5, 0]];
const targets = [
  { id: 'centroid-a', label: 'Centroid A', drag: true },
  { id: 'centroid-b', label: 'Centroid B', drag: true },
];
const drag = (type, index, [x, y]) => ({
  type, target: targets[index].id, x: plot.x + x * plot.scale, y: plot.y - y * plot.scale,
});

export const kmeansFixture = {
  id: 'fixture-ai-kmeans',
  manifest: {
    title: 'K-means Stepper',
    summary: 'Drag the centroids to choose their starting positions. One press of Step assigns points to the nearest centroid. The next moves each centroid to the mean of its group. Inertia is the sum of squared distances to the assigned centroids.',
    description: 'Eight points and two draggable centroids on an x-y plot. The plot labels each assigned point with its group. The readouts show the next step, inertia and the centroid coordinates.',
    assumptions: ['Eight synthetic points and two centroids.'],
    capabilities: [RASTER_CAPABILITY],
    inputs: [],
    readouts: [],
    viewport,
    actions: [{ id: 'step', label: 'Step' }],
    targets,
  },
  source: `
// Each quadrant contains the same two offsets reflected across the axes.
const points = [[-2, 1.5], [-1.5, 1], [2, 1.5], [1.5, 1], [-2, -1.5], [-1.5, -1], [2, -1.5], [1.5, -1]];
const viewport = ${JSON.stringify(viewport)};
const plot = ${JSON.stringify(plot)};
const ids = ${JSON.stringify(targets.map(target => target.id))};
const labels = ['A', 'B'];
const roles = ['observed', 'prediction'];
const toFrame = ([x, y]) => [plot.x + x * plot.scale, plot.y - y * plot.scale];
const fromFrame = (x, y) => [
  sdk.clamp((x - plot.x) / plot.scale, -plot.xLimit, plot.xLimit),
  sdk.clamp((plot.y - y) / plot.scale, -plot.yLimit, plot.yLimit),
];
const squaredDistance = ([x, y], [cx, cy]) => (x - cx) ** 2 + (y - cy) ** 2;

export function initialState() {
  return { centers: ${JSON.stringify(initialCenters)}, groups: null, next: 'assign' };
}

export function reduce({ state, event }) {
  const { centers, groups, next } = state;
  if (['drag_start', 'drag_move', 'drag_end'].includes(event.type)) {
    const index = ids.indexOf(event.target);
    if (index === -1) return state;
    const at = fromFrame(event.x, event.y);
    if (at[0] === centers[index][0] && at[1] === centers[index][1]) return state;
    return { centers: centers.map((center, i) => i === index ? at : center), groups: null, next: 'assign' };
  }
  if (event.type !== 'action' || event.action !== 'step') return state;

  if (next === 'assign') {
    // Equal squared distances always go to A.
    const assigned = points.map(point => squaredDistance(point, centers[0]) <= squaredDistance(point, centers[1]) ? 0 : 1);
    return { centers, groups: assigned, next: 'move' };
  }

  const totals = [[0, 0, 0], [0, 0, 0]];
  points.forEach(([x, y], i) => {
    const sum = totals[groups[i]];
    sum[0] += x;
    sum[1] += y;
    sum[2]++;
  });
  const means = totals.map(([x, y, count], i) => count ? [x / count, y / count] : centers[i]);
  return { centers: means, groups, next: 'assign' };
}

function plotLine(id, from, to, opts) {
  return sdk.line(id, ...toFrame(from), ...toFrame(to), opts);
}

export function evaluate({ state }) {
  const { centers, groups, next } = state;
  const { xLimit, yLimit } = plot;
  const objects = [sdk.text('plot-title', 46, 27, 'Points and centroids')];
  for (const tick of [-2, -1, 0, 1, 2]) {
    const opacity = tick === 0 ? .65 : .18;
    objects.push(
      plotLine('x-grid-' + tick, [tick, -yLimit], [tick, yLimit], { opacity }),
      plotLine('y-grid-' + tick, [-xLimit, tick], [xLimit, tick], { opacity }),
      sdk.text('x-tick-' + tick, toFrame([tick, 0])[0], 345, String(tick), { align: 'middle' }),
    );
    if (tick !== 0) objects.push(sdk.text('y-tick-' + tick, 16, toFrame([0, tick])[1] + 5, String(tick), { align: 'middle' }));
  }
  objects.push(
    sdk.text('x-axis-label', toFrame([xLimit, 0])[0], 345, 'x', { align: 'middle' }),
    sdk.text('y-axis-label', plot.x, 20, 'y', { align: 'middle' }),
  );

  const counts = [0, 0];
  let inertia = 0;
  if (groups) points.forEach((point, i) => {
    const group = groups[i], center = centers[group];
    counts[group]++;
    inertia += squaredDistance(point, center);
    objects.push(plotLine('assignment-' + i, point, center, { role: roles[group], opacity: .55 }));
  });
  points.forEach((point, i) => {
    const [x, y] = toFrame(point), group = groups?.[i];
    const opts = groups ? { text: labels[group], role: roles[group] } : { role: 'neutral' };
    objects.push(sdk.circle('point-' + i, x - 12, y - 12, 24, opts));
  });
  centers.forEach((center, i) => {
    const [x, y] = toFrame(center);
    objects.push(sdk.box(ids[i], x - 17, y - 17, 34, 34, { text: labels[i], role: roles[i] }));
  });

  const panelX = 402;
  objects.push(
    sdk.line('divider', 384, 20, 384, 340, { opacity: .5 }),
    sdk.text('next-step', panelX, 55, 'Next: ' + (next === 'assign' ? 'assign points' : 'move centroids')),
    sdk.text('inertia', panelX, 85, 'Inertia: ' + (groups ? sdk.format(inertia) : '—')),
    sdk.line('stats-divider', panelX, 104, 620, 104, { opacity: .5 }),
  );
  centers.forEach(([x, y], i) => {
    const labelY = 136 + 62 * i;
    const position = '(' + sdk.format(x) + ', ' + sdk.format(y) + ')';
    objects.push(sdk.text(ids[i] + '-position', panelX, labelY, 'Centroid ' + labels[i] + ': ' + position, { role: roles[i] }));
    if (groups) objects.push(sdk.text(ids[i] + '-count', panelX, labelY + 24, counts[i] + (counts[i] === 1 ? ' assigned point' : ' assigned points')));
  });

  return {
    frame: sdk.frame(objects, viewport),
    quantities: {
      centerAX: centers[0][0], centerAY: centers[0][1], centerBX: centers[1][0], centerBY: centers[1][1],
      countA: counts[0], countB: counts[1], ...(groups ? { inertia } : {}),
    },
  };
}`,
  events: [
    drag('drag_start', 0, initialCenters[0]),
    drag('drag_move', 0, [-1, 1]),
    drag('drag_end', 0, [0, 2]),
    drag('drag_start', 1, initialCenters[1]),
    drag('drag_move', 1, [1, -1]),
    drag('drag_end', 1, [0, -2]),
    { type: 'action', action: 'step' },
    { type: 'action', action: 'step' },
  ],
};
