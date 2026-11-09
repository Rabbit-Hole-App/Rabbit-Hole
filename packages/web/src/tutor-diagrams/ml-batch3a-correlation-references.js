const axes = {
  x: { label: 'Lag', min: 1, max: 4 },
  y: { label: 'Correlation', min: -1, max: 1 },
};

const stemPanel = (heading, label, values, caption) => ({
  heading,
  diagram: {
    kind: 'coordinate-plot', title: heading, ...axes,
    series: [{ label, kind: 'stem', points: values.map((y, i) => ({ x: i + 1, y })) }],
    caption,
  },
});

export const references = [
  {
    id: 'ml-acf-vs-pacf',
    lessons: ['15'],
    prompts: ['What is the difference between ACF and PACF for the same series?'],
    keywords: ['acf and pacf', 'acf vs pacf', 'pacf', 'partial autocorrelation'],
    useWhen: 'Compare the population ACF and PACF of one stationary process on shared axes. Work lag 2 by adjusting for lag 1.',
    spec: {
      version: 1,
      diagram: {
        kind: 'comparison', variant: 'panels', title: 'Population ACF and PACF for one stationary AR(1)',
        sharedAxes: ['x', 'y'],
        panels: [
          stemPanel('ACF · Autocorrelation', 'Population ACF', [0.6, 0.36, 0.216, 0.1296],
            'ACF measures the full correlation at each lag. For lags 1–4, the values are 0.6, 0.36, 0.216 and 0.1296.'),
          stemPanel('PACF · Partial autocorrelation', 'Population PACF', [0.6, 0, 0, 0],
            String.raw`PACF adjusts for intervening lags. Lag 1 stays at 0.6. At lag 2, $\frac{0.36-0.6^2}{1-0.6^2}=0$. Lags 3 and 4 are also zero.`),
        ],
        caption: String.raw`Both plots use $X_t=0.6X_{t-1}+\varepsilon_t$ with white-noise innovations. The lag-2 ACF is carried through lag 1.`,
      },
    },
  },
];
