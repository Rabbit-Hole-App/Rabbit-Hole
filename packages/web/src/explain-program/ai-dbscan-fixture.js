import { VISUAL_PROGRAM_STAMPS } from './stamps.js';

export const dbscanFixture = {
  id: 'fixture-ai-dbscan',
  stamps: VISUAL_PROGRAM_STAMPS,
  manifest: {
    title: 'DBSCAN Explorer',
    summary: 'Change the neighborhood radius to see which points are core, border or noise.',
    description: 'A fixed scatter plot shows core points as circles, border points as diamonds and noise as crosses. The circle around A shows its neighborhood radius. The legend counts points of each type.',
    cardDescription: 'Each point counts itself and its neighbors within the radius. At least four points in range make it core. Other points are border if a core point is within their radius, or noise otherwise.',
    instructions: 'Move Radius. Compare E and F at 2 and 2.5: a border point alone cannot make its neighbor a border point.',
    assumptions: ['MinPts is fixed at 4 and includes the point itself. The distance is Euclidean, and points exactly on the radius count.'],
    capabilities: ['number_inputs'],
    inputs: [{ id: 'epsilon', label: 'Radius (ε)', type: 'number', default: 1, min: 0.5, max: 2.5, step: 0.5 }],
    readouts: [],
  },
  source: `
const points = [
  [3, 3], [2, 3], [3, 4], [3, 2], [5, 3], [6, 3],
  [8, 5], [9, 5], [8, 6], [8, 4], [10, 1],
];
const names = 'ABCDEFGHIJK';
const minPts = 4;

function mark(id, x, y, category) {
  if (category === 'Core') return sdk.circle(id, x, y, 12, { role: 'success' });
  if (category === 'Border') return sdk.polyline(id, [[x, y - 7], [x + 7, y], [x, y + 7], [x - 7, y], [x, y - 7]], { role: 'learner' });
  return sdk.polyline(id, [[x - 5, y - 5], [x + 5, y + 5], [x, y], [x - 5, y + 5], [x + 5, y - 5]], { role: 'neutral' });
}

export function evaluate({ inputs }) {
  const epsilon = inputs.epsilon;
  // Squared Euclidean distance preserves the inclusive radius comparison.
  const neighborhoods = points.map(([x, y]) => points.flatMap(([u, v], index) =>
    (x - u) ** 2 + (y - v) ** 2 <= epsilon ** 2 ? [index] : []));
  const core = neighborhoods.map(neighbors => neighbors.length >= minPts);
  const categories = neighborhoods.map((neighbors, i) => core[i] ? 'Core' :
    neighbors.some(index => core[index]) ? 'Border' : 'Noise');

  // Equal axis scales make a neighborhood a circle in data and screen space.
  const plot = sdk.plot('dbscan', {
    x: 18, y: 16, w: 447.5, h: 295,
    xDomain: [0, 12], yDomain: [0, 7], yLabel: 'Feature y',
    series: [{ id: 'points', kind: 'scatter', points }],
  });
  const dots = plot.filter(object => object.kind === 'circle');
  const [a, b] = dots;
  const radius = epsilon * (a.x - b.x); // A and B are one horizontal unit apart.
  const ring = sdk.sample(angle => a.y + radius * Math.sin(angle), 0, 2 * Math.PI, 48)
    .map(([angle, y]) => [a.x + radius * Math.cos(angle), y]);

  const objects = [
    ...plot.filter(object => object.kind !== 'circle'),
    sdk.text('feature-x', 248, 331, 'Feature x', { align: 'middle' }),
    sdk.polyline('radius-a', ring, { role: 'input', opacity: 0.65 }),
    ...dots.flatMap(({ x, y }, index) => [
      mark('point-' + names[index], x, y, categories[index]),
      sdk.text('label-' + names[index], x + 11, y + 5, names[index]),
    ]),
    sdk.text('legend-title', 485, 63, 'Point types'),
    sdk.text('minimum', 485, 89, 'MinPts: ' + minPts),
    ...['Core', 'Border', 'Noise'].flatMap((category, index) => {
      const y = 120 + index * 30;
      const id = category.toLowerCase();
      const count = categories.filter(value => value === category).length;
      return [mark('legend-' + id, 491, y, category), sdk.text('count-' + id, 510, y + 5, category + ': ' + count)];
    }),
    sdk.line('radius-key', 485, 220, 497, 220, { role: 'input', opacity: 0.65 }),
    sdk.text('radius-label', 510, 225, 'Radius around A'),
    sdk.text('neighborhood-a', 510, 251, 'A: ' + neighborhoods[0].length + ' in range'),
  ];
  return { frame: sdk.frame(objects, { width: 662, height: 344 }) };
}`,
};
