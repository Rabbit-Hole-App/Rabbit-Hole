import { RASTER_CAPABILITY } from './stamps.js';

export const regressionFitFixture = {
  id: 'fixture-ai-regression-fit',
  manifest: {
    title: 'Regression Fit Explorer',
    summary: 'Move Slope to tilt the line and Intercept to shift it up or down. A residual is the vertical gap between an observed point and the line. Mean squared error is the average of the six squared residuals.',
    description: 'A plot of six synthetic observations, a prediction line and a vertical residual at each observed x. Readouts show the squared errors by x and their mean.',
    assumptions: [],
    capabilities: [RASTER_CAPABILITY, 'number_inputs'],
    inputs: [
      { id: 'slope', label: 'Slope', type: 'number', default: 0.5, min: -1.5, max: 1.5, step: 0.25 },
      { id: 'intercept', label: 'Intercept', type: 'number', default: 0, min: -2, max: 2, step: 0.25 },
    ],
    readouts: [],
  },
  source: `
const samples = [[-3, -3], [-2, 0], [-1, -1], [1, 3], [2, 2], [3, 5]];
const xDomain = [-4, 4];
// At either end of the x domain, the slider limits keep predictions between -8 and 8.
const yDomain = [-10, 10];

export function evaluate({ inputs }) {
  const { slope, intercept } = inputs;
  const predict = x => slope * x + intercept;
  const observations = samples.map(([x, y], i) => {
    const predicted = predict(x);
    return { id: 'p' + (i + 1), x, y, predicted, squaredError: (y - predicted) ** 2 };
  });
  const mse = observations.reduce((sum, point) => sum + point.squaredError, 0) / observations.length;

  const axes = sdk.plot('regression', {
    x: 16, y: 48, w: 426, h: 330, xDomain, yDomain, xLabel: 'x', yLabel: 'y',
    series: [{ id: 'bounds', points: [[xDomain[0], yDomain[0]], [xDomain[1], yDomain[1]]] }],
  });
  // Use the plot's mapped domain corners to align all marks with its axes.
  const [[left, bottom], [right, top]] = axes.pop().points;
  const marks = sdk.geometry('regression', {
    x: left, y: top, w: right - left, h: bottom - top, xDomain, yDomain,
    segments: [
      { id: 'fit', from: [xDomain[0], predict(xDomain[0])], to: [xDomain[1], predict(xDomain[1])], role: 'prediction' },
      ...observations.map(({ id, x, y, predicted }) => ({ id, from: [x, y], to: [x, predicted], role: 'warning' })),
    ],
    points: observations.map(({ id, x, y }) => ({ id, at: [x, y], role: 'observed' })),
  });

  const statsX = 466, statsW = 272;
  const objects = [
    sdk.circle('legend-observed-dot', 29, 26, 8, { role: 'observed' }),
    sdk.text('legend-observed', 41, 31, 'Observed point'),
    sdk.line('legend-fit-line', 151, 26, 171, 26, { role: 'prediction' }),
    sdk.text('legend-fit', 180, 31, 'Model line'),
    sdk.line('legend-residual-line', 269, 26, 286, 26, { role: 'warning' }),
    sdk.text('legend-residual', 295, 31, 'Residual'),
    ...axes, ...marks,
    sdk.text('squared-errors-title', statsX, 31, 'Squared errors by x'),
    ...observations.flatMap(({ x, squaredError }, i) => sdk.readout('squared-error-' + (i + 1), {
      x: statsX, y: 47 + 42 * i, w: statsW, h: 34, label: 'x = ' + x, value: squaredError, decimals: 4, role: 'neutral',
    })),
    ...sdk.readout('mse', {
      x: statsX, y: 311, w: statsW, h: 44, label: 'Mean squared error', value: mse, decimals: 3,
    }),
  ];
  return {
    frame: sdk.frame(objects, { width: 756, height: 392 }),
    quantities: { mse, ...Object.fromEntries(observations.map(({ squaredError }, i) => ['squaredError' + (i + 1), squaredError])) },
  };
}`,
};
