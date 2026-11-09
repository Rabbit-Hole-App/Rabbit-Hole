// Illustrative lesson-07 data for the written /explain author. Existing semantic
// panels, plots and matrices own all rendering; these are not source evidence.
const axis = (label, min, max) => ({ label, min, max, scale: 'linear' });
const points = values => values.map(([id, x, y, label]) => ({ id, x, y, label }));
const scatter = (label, values) => ({ label, kind: 'scatter', points: points(values) });
const ref = (id, prompts, keywords, useWhen, title, panels, caption, sharedAxes) => ({
  id, lessons: ['07'], prompts, keywords, useWhen,
  spec: { version: 1, diagram: { kind: 'comparison', variant: 'panels', title,
    panels: panels.map(diagram => ({ heading: diagram.title, diagram })), caption,
    ...(sharedAxes ? { sharedAxes } : {}),
  } },
});
const kmeansSamples = [
  scatter('Cluster A', [['a1', 1, 1, 'A1'], ['a2', 2, 2, 'A2'], ['a3', 3, 1, 'A3']]),
  scatter('Cluster B', [['b1', 6, 1, 'B1'], ['b2', 7, 2, 'B2'], ['b3', 8, 1, 'B3']]),
];
const kmeansPlot = (title, centers, caption) => ({
  kind: 'coordinate-plot', title, x: axis('Feature x', -1, 9), y: axis('Feature y', -1, 3),
  series: kmeansSamples,
  annotations: centers.map(([label, x, y]) => ({ kind: 'point', label, x, y })), caption,
});

export const references = [
  ref('ml-kmeans-assignment-update',
    ['Explain the assignment and update steps in one K-means iteration using the same points.',
      'What is the difference between assigning points to clusters and moving K-means centroids?'],
    ['k-means', 'kmeans', 'assignment step', 'update step', 'centroid update', 'cluster mean'],
    'Separate nearest-center assignment from the mean update. Preserve every sample ID, coordinate, series color and axis; only centers move.',
    'K-means: assign first, then update', [
      kmeansPlot('1. Assign to initial centers', [['$c_A$', 0, 0], ['$c_B$', 8, 0]],
        'Use nearest-center distance to assign points. The centers stay fixed at $c_A=(0,0)$ and $c_B=(8,0)$.'),
      kmeansPlot('2. Update each cluster mean', [['$c_A$', 2, 4 / 3], ['$c_B$', 7, 4 / 3]],
        'Only centers move: $c_A=(2,\\frac{4}{3})$, $c_B=(7,\\frac{4}{3})$. Each is the mean of its three points; all samples stay fixed.'),
    ], 'Illustrative Euclidean K-means with two clusters. Filled marks are samples; hollow marks are centers. Repeat assignment after this update.', ['x', 'y']),

  ref('ml-dbscan-core-border-noise',
    ['Explain how DBSCAN distinguishes core, border and noise points with epsilon 1 and min_samples 4.',
      'Why can a sparse point be a DBSCAN border point instead of noise?'],
    ['dbscan', 'core point', 'border point', 'noise point', 'epsilon neighborhood', 'min_samples', 'density reachability'],
    'Compute Euclidean neighborhoods including self. A non-core point is border only if it lies within epsilon of a core point; show the counts and distances.',
    'DBSCAN: core, border and noise', [
      { kind: 'coordinate-plot', title: 'One cluster and an isolated point',
        x: axis('Feature x', 1, 6), y: axis('Feature y', 1, 5),
        series: [
          scatter('Core', [['c1', 2, 2, 'C1'], ['c2', 2.5, 2, 'C2'], ['c3', 2, 2.5, 'C3'], ['c4', 2.5, 2.5, 'C4']]),
          scatter('Border', [['b', 3.4, 2, 'B']]), scatter('Noise', [['n', 5, 4, 'N']]),
        ],
        annotations: [
          { kind: 'circle', label: 'C2 neighborhood (epsilon 1)', center: { x: 2.5, y: 2 }, radius: 1 },
          { kind: 'segment', label: 'C2 to B: 0.9 (inside)', from: { x: 2.5, y: 2 }, to: { x: 3.4, y: 2 } },
          { kind: 'segment', label: 'C4 to B: 1.030 (outside)', from: { x: 2.5, y: 2.5 }, to: { x: 3.4, y: 2 } },
        ],
        caption: 'B has only B and C2 within distance 1. It is border because C2 is core; N is too far from every core.',
      },
      { kind: 'matrix', layout: 'teaching', title: 'Counts and distance to a core',
        columns: ['Nearby', 'Count', 'To core'],
        rows: [
          { id: 'c1', heading: 'C1 · Core', cells: ['C1 C2 C3 C4', '4', '0'] },
          { id: 'c2', heading: 'C2 · Core', cells: ['C1 C2 C3 C4 B', '5', '0'] },
          { id: 'c3', heading: 'C3 · Core', cells: ['C1 C2 C3 C4', '4', '0'] },
          { id: 'c4', heading: 'C4 · Core', cells: ['C1 C2 C3 C4', '4', '0'] },
          { id: 'b', heading: 'B · Border', cells: ['C2 B', '2', '0.9'] },
          { id: 'n', heading: 'N · Noise', cells: ['N', '1', '2.915'] },
        ], emphasis: { rows: ['b'] },
        caption: 'Count includes self. To core is the nearest core distance (0 for cores); border needs fewer than 4 neighbors and distance at most 1.',
      },
    ], 'Illustrative Euclidean data: epsilon 1; min_samples 4 counts the point itself. All four core points belong to one cluster.'),

  ref('ml-gmm-responsibilities',
    ['Show how a Gaussian mixture model turns likelihoods into numerical responsibilities for each sample.',
      'How does a GMM calculate the probability that a point belongs to each cluster?'],
    ['gmm', 'gaussian mixture', 'responsibilities', 'soft membership', 'posterior probability', 'cluster probability', 'likelihood normalization'],
    'Compare numerical GMM membership for fixed means, priors and unit covariance. Distinguish component density from normalized posterior probability.',
    'GMM: normalize likelihoods into responsibilities', [
      { kind: 'coordinate-plot', title: 'Two unit-covariance Gaussians',
        x: axis('Feature x', -1.5, 3.5), y: axis('Feature y', -1.5, 1.5),
        series: [scatter('Samples', [['x0', 0, 0, 'X0'], ['x1', 1, 0, 'X1'], ['x2', 2, 0, 'X2']])],
        annotations: [
          { kind: 'circle', label: 'Component A contour', center: { x: 0, y: 0 }, radius: 1 },
          { kind: 'circle', label: 'Component B contour', center: { x: 2, y: 0 }, radius: 1 },
        ],
        caption: 'Radius-1 circles are equal-density contours, not membership boundaries. Every sample has responsibility for both components.',
      },
      { kind: 'matrix', layout: 'teaching', title: 'Bayes normalization for each sample',
        columns: ['Prior', 'Density', 'Share'],
        rows: [
          { id: 'x0a', heading: 'X0 / A', cells: ['0.5', '0.1592', '0.8808'] },
          { id: 'x0b', heading: 'X0 / B', cells: ['0.5', '0.0215', '0.1192'] },
          { id: 'x1a', heading: 'X1 / A', cells: ['0.5', '0.0965', '0.5'] },
          { id: 'x1b', heading: 'X1 / B', cells: ['0.5', '0.0965', '0.5'] },
          { id: 'x2a', heading: 'X2 / A', cells: ['0.5', '0.0215', '0.1192'] },
          { id: 'x2b', heading: 'X2 / B', cells: ['0.5', '0.1592', '0.8808'] },
        ], emphasis: { columns: [2] },
        caption: '$p(x|k)=e^{-d^2/2}/(2\\pi)$ is a density. $r_k=\\pi_kp(x|k)/\\sum_j\\pi_jp(x|j)$. Share is posterior; pairs sum to 1. Rounded.',
      },
    ], 'Illustrative 2D GMM with equal priors $0.5$, means $(0, 0)$ and $(2, 0)$, and identity covariance. $d$ is distance to the component mean.'),
];
