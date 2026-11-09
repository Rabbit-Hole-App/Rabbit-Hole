const predictionAxes = {
  x: { label: 'Input x', min: 0, max: 4, scale: 'linear' },
  y: { label: 'Prediction', min: 0, max: 9 },
};

export const references = [
  {
    id: 'ml-repeated-sample-fits',
    lessons: ['10'],
    prompts: ['Why does fitting the same model on different samples give different predictions?'],
    keywords: ['repeated fits', 'different training samples', 'vary across training samples', 'prediction spread', 'variance across samples'],
    useWhen: 'Show several fitted predictions from different training samples, then compute their pointwise mean and observed minimum-to-maximum range.',
    spec: {
      version: 1,
      diagram: {
        kind: 'comparison', variant: 'panels',
        title: 'The same fitting rule on three samples',
        panels: [
          {
            heading: 'Start with different samples',
            diagram: {
              kind: 'matrix', layout: 'teaching', title: 'Two training points per fit',
              columns: ['At x = 0', 'At x = 4'],
              rows: [
                { id: 'a', heading: 'Fit A', cells: ['1', '5'] },
                { id: 'b', heading: 'Fit B', cells: ['3', '5'] },
                { id: 'c', heading: 'Fit C', cells: ['2', '8'] },
              ],
              caption: 'Each line fits both points in its own sample. All three use the same straight-line model.',
            },
          },
          {
            heading: 'Fit one line to each sample',
            diagram: {
              kind: 'coordinate-plot', title: 'Individual predictions on shared axes',
              ...predictionAxes,
              series: [
                { label: 'Fit A', kind: 'line', points: [{ x: 0, y: 1 }, { x: 4, y: 5 }] },
                { label: 'Fit B', kind: 'line', points: [{ x: 0, y: 3 }, { x: 4, y: 5 }] },
                { label: 'Fit C', kind: 'line', points: [{ x: 0, y: 2 }, { x: 4, y: 8 }] },
              ],
            },
          },
          {
            heading: 'Summarize at each input',
            diagram: {
              kind: 'coordinate-plot', title: 'Mean and observed range',
              ...predictionAxes,
              series: [
                { label: 'Mean and observed range', kind: 'line', points: [
                  { x: 0, y: 2, low: 1, high: 3 },
                  { x: 1, y: 3, low: 2, high: 3.5 },
                  { x: 4, y: 6, low: 5, high: 8 },
                ] },
              ],
              caption: 'At x = 4, the three predictions are 5, 5 and 8. Their mean is 6. The shaded band runs from the smallest to the largest prediction.',
            },
          },
        ],
        caption: 'Prediction spread across training samples illustrates model variance. These three fits give an illustrative observed range.',
      },
    },
  },
];
