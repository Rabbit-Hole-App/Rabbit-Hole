import { VISUAL_PROGRAM_STAMPS } from './stamps.js';

export const featureScalingFixture = {
  id: 'fixture-ai-feature-scaling',
  stamps: VISUAL_PROGRAM_STAMPS,
  manifest: {
    title: 'Feature Scaling Explorer',
    summary: 'Scaling one feature changes how much it contributes to distance and can change which neighbor is closest.',
    description: 'A fixed plot of the query at (1, 1) and candidates A at (2, 5) and B at (5, 2). The readouts show their distances after scaling the x gap and identify the nearest candidate or a tie.',
    cardDescription: 'A is closer in x; B is closer in y. Increasing the x scale makes the horizontal gap count more toward distance. The plotted coordinates stay fixed.',
    instructions: 'Move X scale through 1×, where the two distances tie.',
    assumptions: ['Two candidates and one fixed query. The x gap is multiplied by the scale before computing Euclidean distance; the y gap is unchanged.'],
    capabilities: ['number_inputs'],
    inputs: [{ id: 'xScale', label: 'X scale', type: 'number', unit: '×', default: 0.5, min: 0.25, max: 2, step: 0.25 }],
    readouts: [{ id: 'distanceA', label: 'Distance to A', decimals: 2 }, { id: 'distanceB', label: 'Distance to B', decimals: 2 }],
  },
  source: `
const query = [1, 1];
const candidates = [{ id: 'A', point: [2, 5] }, { id: 'B', point: [5, 2] }];

export function evaluate({ inputs }) {
  const distance = ([x, y]) => Math.sqrt((inputs.xScale * (x - query[0])) ** 2 + (y - query[1]) ** 2);
  const [distanceA, distanceB] = candidates.map(({ point }) => distance(point));
  const nearest = distanceA === distanceB ? null : distanceA < distanceB ? 'A' : 'B';
  const candidateRole = id => nearest === null || nearest === id ? 'learner' : 'observed';
  const points = [
    { id: 'query', label: 'Query', point: query, role: 'input' },
    ...candidates.map(({ id, point }) => ({ id, label: id, point, role: candidateRole(id) })),
  ];
  const plot = sdk.plot('points', {
    x: 20, y: 16, w: 270, h: 289, xDomain: [0, 6], yDomain: [0, 6],
    yLabel: 'Feature y',
    series: points.map(({ id, point, role }) => ({ id, kind: 'scatter', points: [point], role })),
  });
  const labels = points.map(({ id, label, point }) => {
    const dot = plot.find(object => object.id === 'plot:points:s:' + id + ':0');
    return sdk.text('label-' + id, dot.x + 12, dot.y + 5, label + ' (' + point.join(', ') + ')');
  });
  const objects = [
    ...plot,
    ...labels,
    sdk.text('feature-x', 155, 321, 'Feature x', { align: 'middle' }),
    sdk.text('distance-title', 344, 86, 'Scaled distances'),
    ...sdk.readout('distanceA', { x: 344, y: 104, w: 248, h: 42, label: 'Distance to A', value: distanceA, role: candidateRole('A') }),
    ...sdk.readout('distanceB', { x: 344, y: 158, w: 248, h: 42, label: 'Distance to B', value: distanceB, role: candidateRole('B') }),
    sdk.box('nearest', 344, 212, 248, 42, { text: nearest ? 'Nearest: ' + nearest : 'Tie: A and B', role: 'learner' }),
  ];
  const readouts = [{ id: 'distanceA', value: distanceA }, { id: 'distanceB', value: distanceB }];
  return { frame: sdk.frame(objects, { width: 612, height: 340, readouts }) };
}`,
};
