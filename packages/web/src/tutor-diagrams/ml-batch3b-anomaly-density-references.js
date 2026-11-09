const normalDensity = Array.from({ length: 17 }, (_, index) => {
  const x = index / 2 - 4;
  const y = Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI);
  return { x, y: Number(y.toFixed(6)) };
});

export const references = [
  {
    id: 'ml-zscore-distribution-tails',
    lessons: ['16'],
    prompts: ['Why do z scores in the tails get flagged as anomalies?'],
    keywords: ['z score tails', 'z score distribution', 'three sigma', 'normal distribution tails', 'normal tail probability'],
    useWhen: 'Show the two tails of a standard normal density beyond three standard deviations. Each observation has a z-score on the horizontal axis. Area under the curve over a range of z-scores gives the probability of that range.',
    spec: {
      version: 1,
      diagram: {
        kind: 'coordinate-plot', title: 'Three-sigma cutoff on a bell curve',
        x: { label: 'Z-score', min: -4, max: 4 },
        y: { label: 'Probability density', min: 0, max: 0.45 },
        series: [{ label: 'Standard normal', kind: 'line', points: normalDensity }],
        annotations: [
          { kind: 'band', axis: 'x', from: -4, to: -3, label: '$z < -3$' },
          { kind: 'band', axis: 'x', from: 3, to: 4, label: '$z > 3$' },
        ],
        caption: 'Flag observations with $|z|>3$. The two tails contain about 0.27% of the probability under the standard normal curve.',
      },
    },
  },
  {
    id: 'ml-local-outlier-factor',
    lessons: ['16'],
    prompts: ['How does local outlier factor compare a point with its neighbours?'],
    keywords: ['local outlier factor', 'lof', 'lof compare', 'local reachability density', 'reachability distance'],
    useWhen: 'Compare local outlier factor for two points with the same nearest gap. Use horizontal distances and k=2. Reachability distance to a neighbour is the larger of the gap and that neighbour’s distance to its second-nearest other point. Local reachability density is the reciprocal of the mean reachability distance. The dense-row probe has density 2/9 and each of its neighbours has density 2/3. The sparse-row probe and both of its neighbours have density 1/4.',
    spec: {
      version: 1,
      diagram: {
        kind: 'coordinate-plot', title: 'LOF compares nearby densities',
        x: { label: 'Position $x$', min: -1, max: 40 },
        y: { label: 'Display row', min: 0, max: 3 },
        series: [
          { label: 'Dense row', kind: 'scatter', points: [0, 1, 2, 3, 7].map(x => ({ x, y: 2 })) },
          { label: 'Sparse row', kind: 'scatter', points: [15, 19, 23, 27, 31, 35, 39].map(x => ({ x, y: 1 })) },
        ],
        annotations: [
          { kind: 'segment', from: { x: 3, y: 2 }, to: { x: 7, y: 2 }, label: 'Nearest gap of 4' },
          { kind: 'segment', from: { x: 23, y: 1 }, to: { x: 27, y: 1 }, label: 'Nearest gap of 4' },
          { kind: 'point', x: 7, y: 2, label: String.raw`Reachability distances 4 and 5. $\mathrm{LOF}=(2/3)\div(2/9)=3$` },
          { kind: 'point', x: 27, y: 1, label: String.raw`Reachability distances 4 and 4. $\mathrm{LOF}=(1/4)\div(1/4)=1$` },
        ],
        caption: '$k=2$. Distances use only $x$. LOF divides mean neighbour reachability density by the point’s.',
      },
    },
  },
];
