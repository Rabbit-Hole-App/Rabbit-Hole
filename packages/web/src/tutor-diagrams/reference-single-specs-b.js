// Single-frame teaching alternatives keyed by their panel reference IDs.
export const singleSpecs = {
  'ml-dbscan-core-border-noise': {
    useWhen: 'Show Euclidean DBSCAN on one scatterplot. Label neighbor counts including self and use a core point’s radius to distinguish border from noise.',
    spec: { version: 1, diagram: {
      kind: 'coordinate-plot', title: 'DBSCAN core, border and noise',
      x: { label: 'Feature x', min: 1, max: 6 },
      y: { label: 'Feature y', min: 1, max: 5 },
      series: [
        { kind: 'scatter', label: 'Core', points: [
          { id: 'c1', x: 2, y: 2, label: 'C1 · 4 neighbors' },
          { id: 'c2', x: 2.5, y: 2, label: 'C2 · 5 neighbors' },
          { id: 'c3', x: 2, y: 2.5, label: 'C3 · 4 neighbors' },
          { id: 'c4', x: 2.5, y: 2.5, label: 'C4 · 4 neighbors' },
        ] },
        { kind: 'scatter', label: 'Border', points: [{ id: 'b', x: 3.4, y: 2, label: 'B · 2 neighbors' }] },
        { kind: 'scatter', label: 'Noise', points: [{ id: 'n', x: 5, y: 4, label: 'N · 1 neighbor' }] },
      ],
      annotations: [
        { kind: 'circle', label: 'C2 neighborhood, $\\varepsilon=1$', center: { x: 2.5, y: 2 }, radius: 1 },
        { kind: 'segment', label: 'C2 to B, 0.9 inside', from: { x: 2.5, y: 2 }, to: { x: 3.4, y: 2 } },
        { kind: 'segment', label: 'C4 to B, 1.030 outside', from: { x: 2.5, y: 2.5 }, to: { x: 3.4, y: 2 } },
      ],
      caption: 'Counts include self. A core has at least 4 neighbors. B has only itself and C2 within radius 1. N’s nearest core is 2.915 away.',
    } },
  },
  'ml-fit-quality-comparison': {
    useWhen: 'Show underfitting, a reasonable fit and overfitting as separate lines on one plot of the same observed points, with one labelled held-out point the overfit curve misses. Plot the observed data once, as scatter (the held-out point is one labelled point of it); models are lines only, at most three series.',
    spec: { version: 1, diagram: {
      kind: 'coordinate-plot', title: 'A simple fit versus an overfit curve',
      x: { label: 'Input x', min: 0, max: 4 },
      y: { label: 'Target y', min: 0, max: 10 },
      series: [
        { kind: 'scatter', label: 'Observed points', points: [{ x: 0, y: 1 }, { x: 1, y: 2.2 }, { x: 2, y: 4.8 }, { x: 3, y: 7.2 }, { x: 4, y: 9 }, { id: 'held', x: 1.5, y: 3.5, label: 'Held-out point' }] },
        { kind: 'line', label: 'Simple fit', points: [{ x: 0, y: 0.8 }, { x: 1, y: 2.4 }, { x: 2, y: 4.7 }, { x: 3, y: 7 }, { x: 4, y: 9.1 }] },
        { kind: 'line', label: 'Overfit curve', points: [{ x: 0, y: 1 }, { x: 0.5, y: 4 }, { x: 1, y: 2.2 }, { x: 1.5, y: 1 }, { x: 2, y: 4.8 }, { x: 2.5, y: 9 }, { x: 3, y: 7.2 }, { x: 3.5, y: 5 }, { x: 4, y: 9 }] },
      ],
      caption: 'Illustrative fits. The overfit curve passes through every training point but misses the held-out point; the simple fit stays close to it.',
    } },
  },
  'ml-gmm-responsibilities': {
    useWhen: 'Show component densities and normalized GMM memberships together for each sample. State the fixed priors, means and covariance.',
    spec: { version: 1, diagram: {
      kind: 'matrix', layout: 'teaching', title: 'GMM responsibilities from two densities',
      columns: ['Density A, B', 'Share A, B'],
      rows: [
        { id: 'x0', heading: '$X_0$ at $(0,0)$', cells: ['0.1592, 0.0215', '0.8808, 0.1192'] },
        { id: 'x1', heading: '$X_1$ at $(1,0)$', cells: ['0.0965, 0.0965', '0.5, 0.5'] },
        { id: 'x2', heading: '$X_2$ at $(2,0)$', cells: ['0.0215, 0.1592', '0.1192, 0.8808'] },
      ],
      emphasis: { columns: [1] },
      caption: 'Means $(0,0)$ and $(2,0)$, identity covariance, priors 0.5 each. Posterior $r_k=\\frac{\\pi_k p(x|k)}{\\sum_j \\pi_j p(x|j)}$. Each pair sums to 1.',
    } },
  },
  'ml-ordinal-encoding': {
    useWhen: 'Show a fixed codebook for ordered categories by encoding the same identifiable rows. The codes capture rank and leave spacing unspecified.',
    spec: { version: 1, diagram: {
      kind: 'matrix', layout: 'teaching', title: 'Ordinal encoding preserves order',
      columns: ['Level', 'Code'],
      rows: [
        { id: 'a', heading: 'A', cells: ['Low', '0'] },
        { id: 'b', heading: 'B', cells: ['High', '2'] },
        { id: 'c', heading: 'C', cells: ['Medium', '1'] },
        { id: 'd', heading: 'D', cells: ['Medium', '1'] },
        { id: 'e', heading: 'E', cells: ['Low', '0'] },
        { id: 'f', heading: 'F', cells: ['High', '2'] },
      ],
      emphasis: { columns: [1] },
      caption: 'Low, Medium and High map to 0, 1 and 2 in rank order. Distances between levels are unspecified. Reuse the same codebook for later rows.',
    } },
  },
  'ml-value-binning': {
    useWhen: 'Show which sample values belong to each numbered bin and count them in the same table. Make both boundary cases explicit.',
    spec: { version: 1, diagram: {
      kind: 'matrix', layout: 'teaching', title: 'Assign seven values to four bins',
      columns: ['Samples (value)', 'Count'],
      rows: [
        { id: 'bin-0', heading: '0 · $[0,10)$', cells: ['A (5)', '1'] },
        { id: 'bin-1', heading: '1 · $[10,20)$', cells: ['B (12), C (19)', '2'] },
        { id: 'bin-2', heading: '2 · $[20,30)$', cells: ['D (20), E (26)', '2'] },
        { id: 'bin-3', heading: '3 · $[30,40]$', cells: ['F (39), G (40)', '2'] },
      ],
      emphasis: { rows: ['bin-2', 'bin-3'] },
      caption: 'Each bin includes its left edge. The last bin also includes 40, the final right edge. So 20 enters bin 2 and 40 enters bin 3.',
    } },
  },
  'ml-feature-interaction': {
    useWhen: 'Keep width and length next to their product for the same examples. Use the rows to show how length changes the effect of width.',
    spec: { version: 1, diagram: {
      kind: 'matrix', layout: 'teaching', title: 'Area captures the width–length interaction',
      columns: ['Width $x_1$', 'Length $x_2$', 'Area $x_1 x_2$'],
      rows: [
        { id: 'a', heading: 'A', cells: ['1', '1', '1'] },
        { id: 'b', heading: 'B', cells: ['1', '2', '2'] },
        { id: 'c', heading: 'C', cells: ['2', '1', '2'] },
        { id: 'd', heading: 'D', cells: ['2', '2', '4'] },
      ],
      emphasis: { columns: [2] },
      caption: 'The product adds a feature alongside both inputs. Raising width from 1 to 2 adds 1 to area at length 1 and 2 at length 2.',
    } },
  },
  'ml-confusion-denominators': {
    useWhen: 'Use a single confusion matrix with actual rows and predicted columns. Calculate precision, recall and specificity in its caption using the relevant group totals.',
    spec: { version: 1, diagram: {
      kind: 'heatmap', title: 'Precision, recall and specificity on 200 cases',
      rowLabel: 'Actual', columnLabel: 'Predicted', columns: ['Negative', 'Positive'],
      rows: [{ label: 'Negative', cells: [90, 10] }, { label: 'Positive', cells: [20, 80] }],
      range: { min: 0, max: 100 },
      highlights: [{ row: 1, column: 0 }],
      caption: 'Precision $80/90\\approx88.89\\%$ uses predicted positives. Recall $80/100=80\\%$ uses actual positives. Specificity $90/100=90\\%$ uses actual negatives.',
    } },
  },
  'ml-soft-vote-probabilities': {
    useWhen: 'Put model probabilities, hard vote counts and soft averages in one table. Highlight the different winning classes.',
    spec: { version: 1, diagram: {
      kind: 'matrix', layout: 'teaching', title: 'Hard and soft voting pick different classes',
      columns: ['Class A', 'Class B'],
      rows: [
        { id: 'model-1', heading: 'Model 1', cells: ['55%', '45%'] },
        { id: 'model-2', heading: 'Model 2', cells: ['55%', '45%'] },
        { id: 'model-3', heading: 'Model 3', cells: ['5%', '95%'] },
        { id: 'hard', heading: 'Hard', cells: ['2 votes', '1 vote'] },
        { id: 'soft', heading: 'Soft', cells: ['38.33%', '61.67%'] },
      ],
      emphasis: { cells: [{ row: 'hard', column: 0 }, { row: 'soft', column: 1 }] },
      caption: 'Hard voting counts each model’s top class. Soft voting averages probabilities with equal weights. Model 3’s 95% for B tips the average.',
    } },
  },
  'ml-adaboost-weight-update': {
    useWhen: 'Show one binary AdaBoost round with a shared starting weight, an error-dependent multiplier per row and the normalized weight for the next learner.',
    spec: { version: 1, diagram: {
      kind: 'matrix', layout: 'teaching', title: 'AdaBoost upweights the missed row',
      columns: ['Multiplier', 'Next weight'],
      rows: [
        { id: 'r1', heading: 'R1', cells: ['$e^{-\\alpha}$', '$1/6$'] },
        { id: 'r2', heading: 'R2', cells: ['$e^{-\\alpha}$', '$1/6$'] },
        { id: 'r3', heading: 'R3 · Missed', cells: ['$e^\\alpha$', '$1/2$'] },
        { id: 'r4', heading: 'R4', cells: ['$e^{-\\alpha}$', '$1/6$'] },
      ],
      emphasis: { rows: ['r3'] },
      caption: 'All rows start at $1/4$. Only R3 is missed, so $\\epsilon=1/4$ and $\\alpha=\\ln(3)/2$. Multiply the weights, then normalize them to sum to 1.',
    } },
  },
  'ml-stacking-oof-predictions': {
    useWhen: 'List each held-out row with its scoring fold, the two base predictions and the observed target. Identify the training rows for both folds.',
    spec: { version: 1, diagram: {
      kind: 'matrix', layout: 'teaching', title: 'Stacking trains on held-out predictions',
      columns: ['Linear', 'Tree', 'Target'],
      rows: [
        { id: 'r1', heading: 'R1 · F1', cells: ['0.20', '0', '0'] },
        { id: 'r2', heading: 'R2 · F1', cells: ['0.75', '1', '1'] },
        { id: 'r3', heading: 'R3 · F2', cells: ['0.60', '1', '0'] },
        { id: 'r4', heading: 'R4 · F2', cells: ['0.80', '1', '1'] },
      ],
      emphasis: { columns: [0, 1] },
      caption: 'F1 fits both models on R3 and R4. F2 fits on R1 and R2. Score only held-out rows. Linear and Tree give class 1 probabilities.',
    } },
  },
  'ml-minority-accuracy-trap': {
    useWhen: 'Show the majority-only predictions as counts and derive accuracy and minority recall from those same cells.',
    spec: { version: 1, diagram: {
      kind: 'heatmap', title: '95% accuracy, 0% minority recall',
      rowLabel: 'Actual', columnLabel: 'Predicted', columns: ['Majority', 'Minority'],
      rows: [{ label: 'Majority', cells: [95, 0] }, { label: 'Minority', cells: [5, 0] }],
      range: { min: 0, max: 100 },
      highlights: [{ row: 1, column: 0 }],
      caption: 'Every case is predicted majority. Accuracy is $95/100=95\\%$ of all cases. Minority recall is $0/5=0\\%$ of actual minority cases.',
    } },
  },
  'ml-psi-bin-contributions': {
    useWhen: 'Calculate PSI in one table of common bins, reference and current shares, each bin’s contribution and the total.',
    spec: { version: 1, diagram: {
      kind: 'matrix', layout: 'teaching', title: 'PSI on four shared bins',
      columns: ['Ref.', 'Current', 'PSI part'],
      rows: [
        { id: 'bin-0', heading: '$[0,1)$', cells: ['10%', '5%', '0.0347'] },
        { id: 'bin-1', heading: '$[1,2)$', cells: ['40%', '15%', '0.2452'] },
        { id: 'bin-2', heading: '$[2,3)$', cells: ['40%', '40%', '0.0000'] },
        { id: 'bin-3', heading: '$[3,4]$', cells: ['10%', '40%', '0.4159'] },
        { id: 'total', heading: 'Total', cells: ['100%', '100%', '0.6958'] },
      ],
      emphasis: { cells: [{ row: 'bin-3', column: 2 }], rows: ['total'] },
      caption: 'All shares are positive. Sum the unrounded terms $(q-p)\\ln(q/p)$ with reference share $p$ and current share $q$, then round.',
    } },
  },
  'ml-acf-vs-pacf': {
    useWhen: 'Compare exact population ACF and PACF values for one stationary AR(1) at each lag. Explain the partial correlation at lag 2.',
    spec: { version: 1, diagram: {
      kind: 'bar-chart', variant: 'grouped', title: 'Population ACF and PACF for an AR(1)',
      categories: ['Lag 1', 'Lag 2', 'Lag 3', 'Lag 4'],
      series: [
        { label: 'ACF · Full correlation', values: [0.6, 0.36, 0.216, 0.1296] },
        { label: 'PACF · Partial correlation', values: [0.6, 0, 0, 0] },
      ],
      caption: 'For $X_t=0.6X_{t-1}+\\varepsilon_t$ with white noise, PACF adjusts for intervening lags. At lag 2, $\\frac{0.36-0.6^2}{1-0.6^2}=0$.',
    } },
  },
  'ml-recursive-vs-direct-forecast': {
    useWhen: 'Trace both multi-step forecasting methods from a single observed value. Show each input, increment and output in the same horizon row.',
    spec: { version: 1, diagram: {
      kind: 'matrix', layout: 'teaching', title: 'Multi-step forecasts from Day 4',
      columns: ['Recursive', 'Direct'],
      rows: [
        { id: 'day-5', heading: 'Day 5', cells: ['$6+0.5=6.5$', '$6+0.5=6.5$'] },
        { id: 'day-6', heading: 'Day 6', cells: ['$6.5+0.5=7$', '$6+1.2=7.2$'] },
        { id: 'day-7', heading: 'Day 7', cells: ['$7+0.5=7.5$', '$6+1.8=7.8$'] },
      ],
      caption: 'Day 4 observed value is 6. Recursive reuses its previous prediction after Day 5. Direct uses a separate model per horizon, all with input 6.',
    } },
  },
  'ml-cpu-vs-gpu': {
    useWhen: 'Compare typical CPU and GPU cores, low latency versus high throughput, and suitable workloads in one table.',
    spec: { version: 1, diagram: {
      kind: 'matrix', title: 'CPU and GPU',
      columns: ['CPU', 'GPU'],
      rows: [
        { heading: 'Cores', cells: ['Few large general-purpose cores', 'Thousands of small compute cores'] },
        { heading: 'Goal', cells: ['Low task latency', 'High throughput'] },
        { heading: 'Work', cells: ['Serial or branch-heavy', 'Parallel data work'] },
      ],
    } },
  },
  'ml-dropout-network': {
    useWhen: 'Show which links remain active under one random training mask. Explain the inference scaling rule for classical dropout.',
    spec: { version: 1, diagram: {
      kind: 'matrix', layout: 'teaching', title: 'One training mask drops $h_2$',
      columns: ['Input links from', 'Output link to'],
      rows: [
        { id: 'h1', heading: '$h_1$', cells: ['$x_1,x_2$', '$y$'] },
        { id: 'h2', heading: '$h_2$ off', cells: ['Masked · $x_1,x_2$', 'Masked · $y$'] },
        { id: 'h3', heading: '$h_3$', cells: ['$x_1,x_2$', '$y$'] },
      ],
      emphasis: { rows: ['h2'] },
      caption: 'Masks are random during training. At inference, classical dropout keeps all units and scales activations by keep rate $p$ ($h_i\\mapsto ph_i$).',
    } },
  },
};
