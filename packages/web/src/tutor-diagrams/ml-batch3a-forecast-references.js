const columns = ['Input', 'Add', 'Result'];

export const references = [
  {
    id: 'ml-recursive-vs-direct-forecast',
    lessons: ['15'],
    prompts: ['How are recursive and direct multi-step forecasts different?'],
    keywords: ['recursive forecasting', 'direct forecasting', 'recursive forecast', 'direct forecast', 'recursive and direct', 'multi step forecasts', 'previous prediction'],
    useWhen: 'Start from one observed forecast origin. Trace the repeated one-step model and compare separate horizon models that use the same observed history.',
    spec: {
      version: 1,
      diagram: {
        kind: 'comparison', variant: 'panels', title: 'Two ways to forecast from Day 4',
        panels: [
          {
            heading: 'Recursive · reuse the last forecast',
            diagram: {
              kind: 'matrix', layout: 'teaching', title: 'One rule applied one step at a time',
              columns,
              rows: [
                { id: 'day-5', heading: 'Day 5', cells: ['6 actual', '+0.5', '6.5'] },
                { id: 'day-6', heading: 'Day 6', cells: ['6.5 pred.', '+0.5', '7'] },
                { id: 'day-7', heading: 'Day 7', cells: ['7 pred.', '+0.5', '7.5'] },
              ],
              emphasis: { cells: [{ row: 'day-6', column: 0 }, { row: 'day-7', column: 0 }] },
              caption: 'After the first step, the input is the previous forecast. The same +0.5 rule runs each time.',
            },
          },
          {
            heading: 'Direct · keep the observed input',
            diagram: {
              kind: 'matrix', layout: 'teaching', title: 'A separate rule for each horizon',
              columns,
              rows: [
                { id: 'day-5', heading: 'Day 5', cells: ['6 actual', '+0.5', '6.5'] },
                { id: 'day-6', heading: 'Day 6', cells: ['6 actual', '+1.2', '7.2'] },
                { id: 'day-7', heading: 'Day 7', cells: ['6 actual', '+1.8', '7.8'] },
              ],
              emphasis: { cells: [{ row: 'day-6', column: 0 }, { row: 'day-7', column: 0 }] },
              caption: 'The models for one, two and three days ahead all receive the same observed value 6.',
            },
          },
        ],
        caption: 'Day 4 is the last observation. Days 5–7 use toy models to show which values feed each forecast.',
      },
    },
  },
];
