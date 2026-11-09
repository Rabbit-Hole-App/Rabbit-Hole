// Single-frame teaching examples for the paired panel references.
const matrix = (title, columns, rows, extra = {}) => ({ version: 1, diagram: {
  kind: 'matrix', layout: 'teaching', title, columns,
  rows: rows.map(([id, heading, cells]) => ({ id, heading, cells })), ...extra,
} });
const axis = (label, min, max) => ({ label, min, max, scale: 'linear' });
const series = (label, kind, values) => ({ label, kind, points: values.map(([x, y, id, name]) => ({
  x, y, ...(id ? { id } : {}), ...(name ? { label: name } : {}),
})) });
const plot = (title, x, y, series, extra) => ({ version: 1, diagram: {
  kind: 'coordinate-plot', title, x, y, series, ...extra,
} });

export const singleSpecs = {
  'ml-feature-scaling-transformation': {
    useWhen: 'Use one table to match each sample ID to its original and scaled feature pair under stated centers and scales.',
    spec: matrix('Center and scale two features', ['Original $(x,y)$', "Scaled $(x',y')$"], [
      ['a', 'A', ['$(100,10)$', '$(-1,-1)$']],
      ['b', 'B', ['$(150,20)$', '$(0,0)$']],
      ['c', 'C', ['$(200,40)$', '$(1,2)$']],
    ], {
      caption: "Use $x'=\\frac{x-150}{50}$ and $y'=\\frac{y-20}{10}$. These are fixed teaching centers and scales. Each row keeps its sample ID.",
    }),
  },
  'ml-clustering-comparison': {
    useWhen: 'Show shared cluster assignments once and identify how the two algorithms handle the one isolated point.',
    spec: plot('K-means and DBSCAN on the same samples', axis('Feature 1', 0, 10), axis('Feature 2', 0, 10), [
      series('Cluster 1', 'scatter', [[1, 1], [1, 2], [2, 1]]),
      series('Cluster 2', 'scatter', [[7, 7], [7, 8], [8, 7]]),
      series('Isolated point', 'scatter', [[5, 0]]),
    ], {
      caption: 'K-means assigns $(5,0)$ to cluster 1 and DBSCAN labels it noise. The six dense points keep their groups in these illustrative assignments.',
    }),
  },
  'ml-concept-drift-comparison': {
    useWhen: 'Plot both conditional rules on shared axes with the same inputs so the change in targets is visible.',
    spec: plot('Concept drift changes the target rule', axis('Input $x$', 0, 5), axis('Target $y$', 0, 10), [
      series('Reference window $y=2x$', 'line', [[1, 2], [2, 4], [3, 6]]),
      series('Current window $y=8-2x$', 'line', [[1, 6], [2, 4], [3, 2]]),
    ], {
      caption: 'Both windows use inputs 1, 2 and 3. Their targets still agree at $x=2$ even though the conditional rule changes.',
    }),
  },
  'ml-one-hot-encoding-transformation': {
    useWhen: 'Keep each original category beside its row ID and show the separate binary indicators and unchanged feature.',
    spec: matrix('One-hot encode Color', ['Red', 'Blue', 'Amount'], [
      ['a', 'A · Red', ['1', '0', '10']],
      ['b', 'B · Blue', ['0', '1', '20']],
      ['c', 'C · Red', ['1', '0', '30']],
    ], {
      emphasis: { columns: [0, 1] },
      caption: 'Each row label names its original Color. Replace Color with two indicators, each 1 only for a matching color. Amount stays fixed.',
    }),
  },
  'ml-imputation-transformation': {
    useWhen: 'Keep observed cells and row IDs visible, mark the single imputed value, and state where the fill statistic came from.',
    spec: matrix('Fill one missing Age', ['Age before', 'Age after', 'Score'], [
      ['a', 'Row A', ['20', '20', '4']],
      ['b', 'Row B', ['—', '30', '7']],
      ['c', 'Row C', ['40', '40', '8']],
    ], {
      states: [{ row: 'b', column: 0, state: 'missing' }, { row: 'b', column: 1, state: 'changed' }],
      caption: 'Fill Row B’s Age with the training-set mean of 30. Fit on training data only and reuse that mean for validation and test data.',
    }),
  },
  'ml-boosting-correction-transformation': {
    useWhen: 'Use one table to show exact per-sample residuals and how a fixed learning rate changes each prediction.',
    spec: matrix('One residual correction step', ['Target $y$', 'Residual $r$', 'Prediction update'], [
      ['a', 'A', ['1', '$-1$', '$2\\to1.5$']],
      ['b', 'B', ['2', '0', '$2\\to2$']],
      ['c', 'C', ['3', '1', '$2\\to2.5$']],
    ], {
      caption: 'Use exact residuals $r=y-F_0$ in $F_1=F_0+0.5r$. The three corrections are $-0.5,0,0.5$.',
    }),
  },
  'ml-differencing-transformation': {
    useWhen: 'Line up observations and exact first differences by time so both source observations for each difference are visible.',
    spec: matrix('First-difference a short time series', ['Observation $y_t$', 'Difference $d_t$'], [
      ['t1', '$t_1$', ['10', '—']],
      ['t2', '$t_2$', ['13', '$13-10=3$']],
      ['t3', '$t_3$', ['15', '$15-13=2$']],
      ['t4', '$t_4$', ['19', '$19-15=4$']],
    ], {
      caption: 'Subtract the previous observation with $d_t=y_t-y_{t-1}$. The first observation has no preceding value.',
    }),
  },
  'ml-tree-impurity-gain': {
    useWhen: 'Keep the parent and child class counts beside their impurities and show how weighting the children gives the split gain.',
    spec: matrix('Does this split make the groups purer?', ['Counts $(A,B)$', 'Gini', 'Entropy (bits)'], [
      ['parent', 'Parent', ['$(4,4)$', '0.500', '1.0000']],
      ['left', 'Left', ['$(3,1)$', '0.375', '0.8113']],
      ['right', 'Right', ['$(1,3)$', '0.375', '0.8113']],
      ['weighted', 'Weighted children', ['—', '0.375', '0.8113']],
      ['gain', 'Gain', ['—', '0.125', '0.1887']],
    ], {
      emphasis: { rows: ['gain'] },
      caption: 'Each child holds 4 of 8 samples. Average the child impurities, then subtract from the parent to get the gain. Entropy is rounded.',
    }),
  },
  'ml-svm-c-tradeoff': {
    useWhen: 'Use one table to show exact soft-margin fits on the same samples, including margin width, hinge sum and classification error.',
    spec: matrix('Larger $C$ gives a narrower margin here', ['$C=0.05$', '$C=2$'], [
      ['weight', 'Weight $w$', ['0.25', '1']],
      ['margin', 'Margin edges', ['$\\pm 4$', '$\\pm 1$']],
      ['width', 'Margin width', ['8', '2']],
      ['hinge', 'Hinge sum', ['4.75', '3']],
      ['objective', 'Objective', ['0.26875', '6.5']],
      ['errors', 'Class errors', ['2 of 6', '2 of 6']],
    ], {
      caption: 'Class $-1$ has $x=-2,-1,0.5$ and class $+1$ has $x=-0.5,1,2$. Both fits use $b=0$. The objective is $w^2/2$ plus $C$ times hinge sum.',
    }),
  },
  'ml-svm-feature-map': {
    useWhen: 'Keep the original feature on the horizontal axis and show how the quadratic feature lets a straight line separate the same four samples.',
    spec: plot('A quadratic feature separates four samples', axis('Feature $x$', -2.5, 2.5), axis('Feature $x^2$', 0, 5), [
      series('Class A', 'scatter', [[-2, 4, 'outerLeft'], [2, 4, 'outerRight']]),
      series('Class B', 'scatter', [[-1, 1, 'innerLeft'], [1, 1, 'innerRight']]),
    ], {
      annotations: [{ kind: 'reference-line', axis: 'y', value: 2.5, label: 'Linear separator' }],
      caption: 'The order A, B, B, A defeats a single threshold in $x$. The map $\\phi(x)=(x,x^2)$ separates A at height 4 from B at 1 with $x^2=2.5$.',
    }),
  },
  'ml-knn-distance-weighted-vote': {
    useWhen: 'Use one vote table for the same three neighbors, with distances, per-neighbor weights, class totals and both winners.',
    spec: matrix('Distance weighting flips the KNN vote', ['Distance $d$', 'Uniform vote', '$1/d$ vote'], [
      ['a1', 'A1 $(0,2)$', ['2', '1', '$1/2$']],
      ['a2', 'A2 $(-3,0)$', ['3', '1', '$1/3$']],
      ['b1', 'B1 $(1,0)$', ['1', '1', '1']],
      ['totalA', 'Class A total', ['—', '2', '$5/6$']],
      ['totalB', 'Class B total', ['—', '1', '1']],
      ['winner', 'Winner', ['—', 'A', 'B']],
    ], {
      emphasis: { rows: ['winner'] },
      caption: 'Use Euclidean distance from $q=(0,0)$ with $k=3$. B1 is close enough to outweigh both class A neighbors.',
    }),
  },
  'ml-knn-scaled-distance': {
    useWhen: 'Use one table to hold raw coordinates fixed and compare distances and the winning class under two feature scales.',
    spec: matrix('Feature scaling changes the nearest neighbor', ['$s=1$', '$s=2$'], [
      ['a', 'A $(6,9)$', ['$\\sqrt{17}$', '$\\sqrt{20}$']],
      ['b', 'B $(8,6)$', ['$\\sqrt{10}$', '$\\sqrt{37}$']],
      ['nearest', 'Nearest class', ['B', 'A']],
    ], {
      emphasis: { rows: ['nearest'] },
      caption: 'With $q=(5,5)$ and $k=1$, use $d=\\sqrt{(s\\Delta x)^2+(\\Delta y)^2}$. The raw coordinates stay fixed.',
    }),
  },
  'ml-knn-k-boundaries': {
    useWhen: 'Plot the shared training points and mark which vertical boundaries apply to each neighbor count.',
    spec: plot('Increasing $k$ changes KNN boundaries', axis('Feature x', 0, 7), axis('Feature y', 0, 4), [
      series('Class A', 'scatter', [[1, 2, 'a1'], [2, 2, 'a2'], [5, 2, 'a3']]),
      series('Class B', 'scatter', [[3, 2, 'b1'], [4, 2, 'b2'], [6, 2, 'b3']]),
      series('Query q', 'scatter', [[5, 2.5, 'q']]),
    ], {
      annotations: [
        { kind: 'reference-line', axis: 'x', value: 2.5, label: 'Both $k=1$ and $k=3$ switch A to B' },
        { kind: 'reference-line', axis: 'x', value: 4.5, label: 'Only $k=1$ switches B to A' },
        { kind: 'reference-line', axis: 'x', value: 5.5, label: 'Only $k=1$ switches A to B' },
      ],
      caption: 'Break distance ties by smaller $x$. At $q=(5,2.5)$, uniform Euclidean voting gives A at $k=1$ and B at $k=3$ (A, B, B).',
    }),
  },
  'ml-kd-tree-partitions': {
    useWhen: 'Use the exact split segments to show their bounds and the first leaf visited, distinguishing descent from exact search.',
    spec: plot('Follow a KD-tree search through space', axis('Feature x', 0, 10), axis('Feature y', 0, 10), [
      series('Training samples', 'scatter', [[1, 1, 'a', 'A'], [3, 2, 'b', 'B'], [2, 5, 'c', 'C'], [4, 7, 'd', 'D'],
        [6, 2, 'e', 'E'], [8, 4, 'f', 'F'], [7, 7, 'g', 'G'], [9, 8, 'h', 'H']]),
      series('Query q', 'scatter', [[2, 1, 'q']]),
    ], {
      annotations: [
        { kind: 'segment', from: { x: 5, y: 0 }, to: { x: 5, y: 10 }, label: 'Root split $x=5$' },
        { kind: 'segment', from: { x: 0, y: 4 }, to: { x: 5, y: 4 }, label: 'Left split $y=4$' },
        { kind: 'segment', from: { x: 5, y: 6 }, to: { x: 10, y: 6 }, label: 'Right split $y=6$' },
        { kind: 'rectangle', xMin: 0, xMax: 5, yMin: 0, yMax: 4, label: 'First leaf A, B' },
        { kind: 'segment', from: { x: 2, y: 1 }, to: { x: 1, y: 1 }, label: 'A is nearest at $d=1$' },
      ],
      caption: 'For $q=(2,1)$, take $x<5$ then $y<4$. Each leaf holds two points. Exact search checks whether to backtrack.',
    }),
  },
  'ml-kmeans-assignment-update': {
    useWhen: 'Draw the assigned samples once and use arrows to show each centroid moving from its initial location to its cluster mean.',
    spec: plot('K-means assigns samples, then moves centers', axis('Feature x', -1, 9), axis('Feature y', -1, 3), [
      series('Cluster A', 'scatter', [[1, 1, 'a1', 'A1'], [2, 2, 'a2', 'A2'], [3, 1, 'a3', 'A3']]),
      series('Cluster B', 'scatter', [[6, 1, 'b1', 'B1'], [7, 2, 'b2', 'B2'], [8, 1, 'b3', 'B3']]),
    ], {
      annotations: [
        { kind: 'vector', from: { x: 0, y: 0 }, to: { x: 2, y: 4 / 3 }, label: 'Center A moves to its mean' },
        { kind: 'vector', from: { x: 8, y: 0 }, to: { x: 7, y: 4 / 3 }, label: 'Center B moves to its mean' },
      ],
      caption: 'Assign to the closest initial center, then move A to $(2,4/3)$ and B to $(7,4/3)$, the three-point means. Repeat assignment.',
    }),
  },
};
