// Fixed teaching examples. All inputs remain visible, and existing semantic
// matrices, histograms and compositions own the rendering and formula layout.
export const references = [
  {
    id: 'ml-feature-interaction', lessons: ['08'],
    prompts: [
      'Explain feature interactions with a width-times-length feature.',
      'Show why the effect of width on area depends on length.',
    ],
    keywords: ['feature interaction', 'interaction term', 'product feature', 'multiply two inputs', 'multiplies two inputs', 'multiplicative feature', 'feature engineering', 'width times length'],
    useWhen: 'Derive an actual product column while preserving both original features and sample IDs; show how one input changes the effect of the other.',
    spec: { version: 1, diagram: {
      kind: 'transformation', variant: 'visual', title: 'A product captures a feature interaction',
      operation: 'Add an interaction: $x_3 = x_1 x_2$',
      before: { label: 'Two input features', diagram: {
        kind: 'matrix', layout: 'teaching', title: 'Width and length', columns: ['$x_1$', '$x_2$'],
        rows: [
          { id: 'a', heading: 'A', cells: ['1', '1'] },
          { id: 'b', heading: 'B', cells: ['1', '2'] },
          { id: 'c', heading: 'C', cells: ['2', '1'] },
          { id: 'd', heading: 'D', cells: ['2', '2'] },
        ],
        caption: '$x_1$ is width; $x_2$ is length. Area is their product.',
      } },
      after: { label: 'Keep inputs, add area', diagram: {
        kind: 'matrix', layout: 'teaching', title: 'The derived product', columns: ['$x_1$', '$x_2$', '$x_1 x_2$'],
        rows: [
          { id: 'a', heading: 'A', cells: ['1', '1', '1'] },
          { id: 'b', heading: 'B', cells: ['1', '2', '2'] },
          { id: 'c', heading: 'C', cells: ['2', '1', '2'] },
          { id: 'd', heading: 'D', cells: ['2', '2', '4'] },
        ],
        emphasis: { columns: [2] },
        caption: 'When $x_1$ rises from 1 to 2, area rises by $x_2$: by 1 at $x_2=1$, by 2 at $x_2=2$.',
      } },
      identity: { mode: 'preserved', note: 'Rows A–D and both inputs stay fixed; the added column is area.' },
      caption: 'The new feature lets a model use area while keeping width and length separately.',
    } },
  },
  {
    id: 'ml-raw-log-distributions', lessons: ['08'],
    prompts: [
      'Show raw and log-transformed histograms for the same skewed sample.',
      'Compare a feature distribution before and after a log transform, including the data pairs.',
    ],
    keywords: ['raw versus log', 'raw and log', 'raw and log distributions', 'log transform', 'log-transformed', 'log1p', 'take logs', 'skewed distribution', 'log histogram', 'transformed distribution'],
    useWhen: 'Compare the same visible observations before and after an exact log transform, with explicit domain and independently counted bins in each coordinate.',
    spec: { version: 1, diagram: {
      kind: 'comparison', variant: 'panels', title: 'The same observations on raw and log scales',
      panels: [
        { heading: 'Raw values', diagram: {
          kind: 'histogram', title: 'Original scale', xLabel: '$x$',
          binEdges: [0, 32, 64, 96, 128], measure: 'count',
          series: [{ label: 'Eight observations', values: [6, 1, 0, 1] }],
          caption: 'Raw values: 0, 1, 3, 7, 15, 31, 63, 127. Six of eight values lie below 32.',
        } },
        { heading: 'Log values', diagram: {
          kind: 'histogram', title: 'Log scale', xLabel: String.raw`$z = \log_2(1+x)$`,
          binEdges: [0, 2, 4, 6, 8], measure: 'count',
          series: [{ label: 'Eight observations', values: [2, 2, 2, 2] }],
          caption: 'Transformed values are 0 through 7. The largest gaps shrink; these log values are evenly spaced.',
        } },
        { heading: 'Same eight observations', diagram: {
          kind: 'matrix', layout: 'teaching', title: 'Same eight observations', columns: ['Raw $x$', '$z$'],
          rows: [
            { id: 'a', heading: 'A', cells: ['0', '0'] },
            { id: 'b', heading: 'B', cells: ['1', '1'] },
            { id: 'c', heading: 'C', cells: ['3', '2'] },
            { id: 'd', heading: 'D', cells: ['7', '3'] },
            { id: 'e', heading: 'E', cells: ['15', '4'] },
            { id: 'f', heading: 'F', cells: ['31', '5'] },
            { id: 'g', heading: 'G', cells: ['63', '6'] },
            { id: 'h', heading: 'H', cells: ['127', '7'] },
          ],
          caption: String.raw`$z=\log_2(1+x)$ is defined for $x>-1$; every raw value here is nonnegative.`,
        } },
      ],
      caption: 'Both panels count the same eight samples in different x units. Logs compress this right tail; they do not ensure normality.',
    } },
  },
];
