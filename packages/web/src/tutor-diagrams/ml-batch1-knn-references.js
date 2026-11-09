// Fixed worked examples for written /explain. Coordinates, votes and partitions
// are semantic data; the existing teaching layouts own every visual style.
const axis = (label, min, max) => ({ label, min, max, scale: 'linear' });
const scatter = (label, values) => ({ label, kind: 'scatter',
  points: values.map(([id, x, y, name]) => ({ id, x, y, label: name ?? id.toUpperCase() })),
});
const panels = (title, entries, caption, sharedAxes) => ({ version: 1, diagram: {
  kind: 'comparison', variant: 'panels', title,
  panels: entries.map(([heading, diagram]) => ({ heading, diagram })), caption,
  ...(sharedAxes ? { sharedAxes } : {}),
} });
const reference = (id, prompts, keywords, useWhen, spec) => ({ id, lessons: ['06'], prompts, keywords, useWhen, spec });

const weightedPlot = {
  kind: 'coordinate-plot', title: 'The same $k = 3$ neighbors',
  x: axis('Feature x', -4, 3), y: axis('Feature y', -2, 5),
  series: [scatter('Class A', [['a1', 0, 2, 'A1'], ['a2', -3, 0, 'A2']]),
    scatter('Class B', [['b1', 1, 0, 'B1']]), scatter('Query q', [['q', 0, 0, 'q']])],
  annotations: [
    { kind: 'segment', from: { x: 0, y: 0 }, to: { x: 0, y: 2 }, label: String.raw`A1: $d = 2$; $1/d = \frac{1}{2}$` },
    { kind: 'segment', from: { x: 0, y: 0 }, to: { x: -3, y: 0 }, label: String.raw`A2: $d = 3$; $1/d = \frac{1}{3}$` },
    { kind: 'segment', from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, label: 'B1: $d = 1$; $1/d = 1$' },
  ],
  caption: 'Euclidean distance from $q = (0, 0)$. All three training points vote; none has zero distance.',
};
const weightedVotes = {
  kind: 'matrix', layout: 'teaching', title: 'Count neighbors or sum inverse distances',
  columns: ['Dist.', 'Uniform vote', '$1/d$ vote'],
  rows: [
    { id: 'a1', heading: 'A1 (Class A)', cells: ['2', '1', String.raw`$\frac{1}{2}$`] },
    { id: 'a2', heading: 'A2 (Class A)', cells: ['3', '1', String.raw`$\frac{1}{3}$`] },
    { id: 'b1', heading: 'B1 (Class B)', cells: ['1', '1', '1'] },
    { id: 'totalA', heading: 'Class A total', cells: ['—', '2', String.raw`$\frac{5}{6}$`] },
    { id: 'totalB', heading: 'Class B total', cells: ['—', '1', '1'] },
    { id: 'winner', heading: 'Winner', cells: ['—', 'A', 'B'] },
  ],
  emphasis: { rows: ['winner'] },
  caption: String.raw`Uniform voting gives A two votes. Inverse-distance voting gives B more weight: $1 > \frac{5}{6}$.`,
};

const rawX = axis('Raw feature x', 0, 12), rawY = axis('Raw feature y', 0, 12);
const scalingPlot = (s, aSquared, bSquared, winner) => ({
  kind: 'coordinate-plot', title: `$s = ${s}$: nearest class ${winner}`,
  x: rawX, y: rawY,
  series: [scatter('Class A', [['a', 6, 9, 'A']]), scatter('Class B', [['b', 8, 6, 'B']]),
    scatter('Query q', [['q', 5, 5, 'q']])],
  annotations: [
    { kind: 'segment', from: { x: 5, y: 5 }, to: { x: 6, y: 9 }, label: `A: $d = \\sqrt{${aSquared}}$` },
    { kind: 'segment', from: { x: 5, y: 5 }, to: { x: 8, y: 6 }, label: `B: $d = \\sqrt{${bSquared}}$` },
  ],
  caption: `For $k = 1$, class ${winner} wins. Distances use $s = ${s}$; the plotted points stay at their original raw coordinates.`,
});

const boundaryX = axis('Feature x', 0, 7), boundaryY = axis('Feature y', 0, 4);
const boundaryPlot = (k, winner, boundaries, caption) => ({
  kind: 'coordinate-plot', title: `$k = ${k}$: q predicts ${winner}`, x: boundaryX, y: boundaryY,
  series: [scatter('Class A', [['a1', 1, 2, 'A1'], ['a2', 2, 2, 'A2'], ['a3', 5, 2, 'A3']]),
    scatter('Class B', [['b1', 3, 2, 'B1'], ['b2', 4, 2, 'B2'], ['b3', 6, 2, 'B3']]),
    scatter('Query q', [['q', 5, 2.5, 'q']])],
  annotations: boundaries.map(([value, left, right]) => ({ kind: 'reference-line', axis: 'x', value,
    label: `${left} | ${right} at $x = ${value}$` })), caption,
});

const kdTree = {
  kind: 'tree', layout: 'binary', title: 'First leaf visited by $q = (2, 1)$',
  highlightPath: ['root', 'left', 'lowerLeft'],
  nodes: [
    { id: 'root', label: '$x < 5$?', count: 8 },
    { id: 'left', label: '$y < 4$?', parent: 'root', side: 'left', edgeLabel: '$x < 5$', count: 4 },
    { id: 'right', label: '$y < 6$?', parent: 'root', side: 'right', edgeLabel: String.raw`$x \ge 5$`, count: 4 },
    { id: 'lowerLeft', label: 'A, B', parent: 'left', side: 'left', edgeLabel: '$y < 4$', count: 2, detail: 'First leaf visited' },
    { id: 'upperLeft', label: 'C, D', parent: 'left', side: 'right', edgeLabel: String.raw`$y \ge 4$`, count: 2 },
    { id: 'lowerRight', label: 'E, F', parent: 'right', side: 'left', edgeLabel: '$y < 6$', count: 2 },
    { id: 'upperRight', label: 'G, H', parent: 'right', side: 'right', edgeLabel: String.raw`$y \ge 6$`, count: 2 },
  ],
  caption: 'The route chooses the first leaf to inspect. Exact nearest-neighbor search may backtrack to another region.',
};
const kdPlot = {
  kind: 'coordinate-plot', title: 'The same splits partition feature space',
  x: axis('Feature x', 0, 10), y: axis('Feature y', 0, 10),
  series: [scatter('Training samples', [['a', 1, 1], ['b', 3, 2], ['c', 2, 5], ['d', 4, 7],
    ['e', 6, 2], ['f', 8, 4], ['g', 7, 7], ['h', 9, 8]]), scatter('Query q', [['q', 2, 1, 'q']])],
  annotations: [
    { kind: 'segment', from: { x: 5, y: 0 }, to: { x: 5, y: 10 }, label: 'Root split: $x = 5$' },
    { kind: 'segment', from: { x: 0, y: 4 }, to: { x: 5, y: 4 }, label: 'Left split: $y = 4$' },
    { kind: 'segment', from: { x: 5, y: 6 }, to: { x: 10, y: 6 }, label: 'Right split: $y = 6$' },
    { kind: 'rectangle', xMin: 0, xMax: 5, yMin: 0, yMax: 4, label: 'First leaf visited: A, B' },
    { kind: 'segment', from: { x: 2, y: 1 }, to: { x: 1, y: 1 }, label: 'A is nearest: $d = 1$' },
  ],
  caption: 'The root split spans the domain. Each horizontal split stops at its parent region. A is the nearest sample to q.',
};

export const references = [
  reference('ml-knn-distance-weighted-vote', [
    'Can distance-weighted KNN disagree with majority voting on the same three neighbors?',
    'Show how inverse-distance weights change a KNN prediction.',
  ], ['knn', 'k-nearest neighbors', 'distance-weighted knn', 'inverse-distance vote', 'uniform vote'],
  'Compare uniform and inverse-distance voting with exact distances, per-neighbor weights and class totals for the same k = 3 set.',
  panels('The same neighbors can give different KNN votes', [
    ['Distances from the query', weightedPlot], ['Compare the vote totals', weightedVotes],
  ], 'At $k = 3$, uniform voting predicts A; weights $w = 1/d$ predict B. The closer B neighbor outweighs the two A neighbors.')),

  reference('ml-knn-scaled-distance', [
    'Why can changing the scale of one feature change the nearest neighbor?',
    'Keep the points fixed and show how doubling the x contribution changes KNN distance.',
  ], ['knn', 'feature scaling', 'scaling one feature', 'scaled distance', 'weighted euclidean distance', 'metric weights', 'nearest neighbour'],
  'Hold raw coordinates and both axes fixed while changing the metric d = √((sΔx)² + Δy²); separate metric distance from drawn displacement.',
  panels('Feature scaling changes which neighbor is closest', [
    ['x contribution: $s = 1$', scalingPlot(1, 17, 10, 'B')],
    ['x contribution: $s = 2$', scalingPlot(2, 20, 37, 'A')],
  ], String.raw`$d = \sqrt{(s\Delta x)^2 + (\Delta y)^2}$. Points and axes stay fixed; segments show raw displacements; labels show metric distances.`, ['x', 'y'])),

  reference('ml-knn-k-boundaries', [
    'How does changing K from 1 to 3 change a KNN decision boundary?',
    'Show KNN boundaries and the prediction for one query using the same training points.',
  ], ['knn', 'knn decision boundary', 'changing k', 'k equals 1', 'k equals 3', 'nearest-neighbor boundary', 'knn smoothing'],
  'Compare actual Euclidean majority-vote regions for k = 1 and k = 3 on identical 2D samples; all training y values equal 2.',
  panels('Changing K changes the decision regions', [
    ['$k = 1$', boundaryPlot(1, 'A', [[2.5, 'A', 'B'], [4.5, 'B', 'A'], [5.5, 'A', 'B']],
      String.raw`For every $y$: A at $x \le 2.5$; B at $2.5 < x \le 4.5$; A at $4.5 < x \le 5.5$; B at $x > 5.5$.`)],
    ['$k = 3$', boundaryPlot(3, 'B', [[2.5, 'A', 'B']],
      String.raw`For every $y$: A at $x \le 2.5$; B at $x > 2.5$. At q, the three votes are A, B, B.`)],
  ], 'Uniform votes, Euclidean distance. Break equal-distance neighbor ties by smaller x. All training $y = 2$, so boundaries are vertical.', ['x', 'y'])),

  reference('ml-kd-tree-partitions', [
    'How do KD-tree splits correspond to regions in a two-dimensional plot?',
    'Trace the first KD-tree leaf visited for a query and show its nearest neighbor.',
  ], ['kd-tree', 'kd-tree partitions', 'kd tree', 'k-d tree', 'spatial partition', 'nearest-neighbor search', 'first leaf visited', 'backtracking'],
  'Pair a binary KD-tree with the exact bounded partition segments, sample counts and first query route; do not imply descent alone completes exact search.',
  panels('A KD-tree links branch tests to spatial regions', [
    ['Follow the branch conditions', kdTree], ['Locate the same leaf in space', kdPlot],
  ], '$q = (2, 1)$ enters the lower-left leaf A, B. A is nearest at distance 1; exact search also checks whether backtracking is needed.')),
];
