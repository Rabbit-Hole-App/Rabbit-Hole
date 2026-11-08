import { VISUAL_PROGRAM_STAMPS } from './stamps.js';

export const anomalyIsolationFixture = {
  id: 'fixture-ai-anomaly-isolation',
  stamps: VISUAL_PROGRAM_STAMPS,
  manifest: {
    title: 'Anomaly Isolation Explorer',
    summary: 'Follow two points through the same isolation tree and compare how many splits leave each point alone.',
    description: 'A number line shows five points and the cuts made so far. The tree traces the paths of typical point B and outlier E, and reports which points are still in their groups.',
    cardDescription: 'An isolation tree cuts a group into smaller groups. In this toy tree, the outlier E is alone after one cut. Typical point B stays with other points longer.',
    instructions: 'Move Split depth from 0 to 3. Follow the two colored paths and compare when B and E are alone.',
    assumptions: ['Five points on one feature and one fixed example of an isolation tree. The depths describe this tree only; a forest uses many randomized trees.'],
    capabilities: ['number_inputs'],
    inputs: [{ id: 'depth', label: 'Split depth', type: 'number', default: 0, min: 0, max: 3, step: 1 }],
    readouts: [],
  },
  source: `
const points = [
  { id: 'A', x: 1 }, { id: 'B', x: 2 }, { id: 'C', x: 3 }, { id: 'D', x: 4 }, { id: 'E', x: 9 },
];
const splits = {
  root: { at: 6, below: 'left', above: 'E' },
  left: { at: 2.5, below: 'low', above: 'high' },
  low: { at: 1.5, below: 'A', above: 'B' },
  high: { at: 3.5, below: 'C', above: 'D' },
};

function pathTo(x, depth) {
  const path = ['root'];
  while (path.length <= depth) {
    const split = splits[path.at(-1)];
    if (!split) break;
    path.push(x < split.at ? split.below : split.above);
  }
  return path;
}

export function evaluate({ inputs }) {
  const depth = Math.round(inputs.depth);
  const paths = Object.fromEntries(points.map(({ id, x }) => [id, pathTo(x, depth)]));
  const [typical, outlier] = [paths.B, paths.E];
  const pathRole = id => id === 'B' ? 'learner' : id === 'E' ? 'warning' : 'observed';
  const xPosition = x => 40 + 56 * x;
  const visible = new Set(Object.values(paths).flat());
  const edges = Object.entries(splits).flatMap(([from, split]) => [
    { from, to: split.below, label: 'Yes' }, { from, to: split.above, label: 'No' },
  ]);
  const nodes = [...Object.keys(splits), ...points.map(point => point.id)].map(id => ({
    id,
    label: splits[id] ? 'x < ' + splits[id].at + '?' : id + ' alone',
    role: typical.includes(id) ? 'learner' : outlier.includes(id) ? 'warning' : 'neutral',
  }));
  const outlierEdges = outlier.slice(1).map((id, i) => 'tree.e.' + outlier[i] + ':' + id + '.');
  const tree = sdk.graph('tree', {
    x: 12, y: 108, w: 616, h: 426, nodes, edges, active: [...new Set([...typical, ...outlier])],
  }).map(object => object.kind !== 'text' && outlierEdges.some(prefix => object.id.startsWith(prefix))
    ? { ...object, role: 'warning' } : object);
  const status = id => {
    const path = paths[id];
    const group = points.filter(point => paths[point.id].at(-1) === path.at(-1));
    return id + ' · ' + (group.length === 1 ? 'Alone' : group.map(point => point.id).join(', ')) + ' at depth ' + (path.length - 1);
  };

  const objects = [
    sdk.text('axis-title', 40, 22, 'Feature x · cuts made so far'),
    sdk.line('axis', xPosition(0), 58, xPosition(10), 58, { role: 'neutral' }),
    ...Object.entries(splits).filter(([, split]) => visible.has(split.below)).map(([id, { at }]) =>
      sdk.line('cut-' + id, xPosition(at), 36, xPosition(at), 78, { role: 'input' })),
    ...points.flatMap(({ id, x }) => [
      sdk.circle('point-' + id, xPosition(x), 58, 12, { role: pathRole(id) }),
      sdk.text('point-label-' + id, xPosition(x), 96, id + ': ' + x, { align: 'middle', role: pathRole(id) }),
    ]),
    ...tree,
    sdk.box('typical-path', 24, 548, 284, 38, { text: status('B'), role: 'learner' }),
    sdk.box('outlier-path', 332, 548, 284, 38, { text: status('E'), role: 'warning' }),
  ];
  return { frame: sdk.frame(objects, { width: 640, height: 600 }) };
}`,
};
