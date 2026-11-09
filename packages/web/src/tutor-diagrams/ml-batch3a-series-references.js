import { references as plotReferences } from './ml-plot-references.js';

// Extend the original Lesson 15 example with an illustrative residual series.
const original = plotReferences.find(reference => reference.id === 'time-series-components').spec.diagram;
const [trend, seasonal] = original.series;
const dayAxis = { ...original.x, label: 'Day' };
const contributionAxis = { label: 'Contribution', min: -1, max: 1 };
const residualValues = [0.25, -0.25, 0, 0.5, -0.5, 0, 0.25, -0.25];
const residual = {
  label: 'Residual', kind: 'stem',
  points: trend.points.map(({ x }, i) => ({ x, y: residualValues[i] })),
};
const observed = {
  label: 'Observed', kind: 'line',
  points: trend.points.map(({ x, y }, i) => ({ x, y: y + seasonal.points[i].y + residualValues[i] })),
};

function plotPanel(heading, y, series, example) {
  return { heading, diagram: {
    kind: 'coordinate-plot', title: heading, x: dayAxis, y, series,
    annotations: [{ kind: 'reference-line', axis: 'x', value: 4, label: example }],
  } };
}

const observations = [10, 13, 16, 19, 22, 25];
const rollingRows = [4, 5, 6, 7].map(day => {
  const firstDay = day - 3;
  const pastValues = observations.slice(firstDay - 1, day - 1);
  const inputs = pastValues.map((value, i) => `D${firstDay + i}:${value}`).join(' ');
  const mean = pastValues.reduce((sum, value) => sum + value, 0) / pastValues.length;
  return { id: `day-${day}`, heading: `Day ${day}`, cells: [inputs, String(mean)] };
});

export const references = [
  {
    id: 'ml-time-series-additive-residuals', lessons: ['15'],
    prompts: ['How do trend, seasonality and residuals add up to the original time series?'],
    keywords: ['additive decomposition', 'time series residuals', 'residual component', 'trend and seasonality', 'seasonality out', 'removing trend and seasonality'],
    useWhen: 'Decompose an additive series into trend, seasonal contribution and residuals. Align the dates and reconstruct an observed value from the three components at the same date.',
    spec: { version: 1, diagram: {
      kind: 'comparison', variant: 'panels', title: 'Additive time series with residuals', sharedAxes: ['x'],
      panels: [
        plotPanel('Observed and trend', { label: 'Value', min: 0, max: 7 }, [observed, trend], 'Day 4 · observed 3, trend 3.5'),
        plotPanel('Seasonal contribution', contributionAxis, [seasonal], 'Day 4 · seasonality −1'),
        plotPanel('Residuals', contributionAxis, [residual], 'Day 4 · residual +0.5'),
      ],
      caption: String.raw`Illustrative daily values. $\text{Observed}=\text{trend}+\text{seasonality}+\text{residual}$. On Day 4, $3.5-1+0.5=3$.`,
    } },
  },
  {
    id: 'ml-rolling-mean-feature', lessons: ['15'],
    prompts: ['Which past values go into a three-day rolling average before a prediction?'],
    keywords: ['rolling mean', 'rolling average', 'moving average feature', 'moving average', 'prior three days'],
    useWhen: 'Show a rolling mean feature alongside its prediction date and the three preceding dated observations. Keep the prediction day outside the feature window.',
    spec: { version: 1, diagram: {
      kind: 'matrix', layout: 'teaching', title: 'Three-day rolling mean before prediction',
      columns: ['Past values', 'Mean'],
      rows: rollingRows,
      emphasis: { columns: [1] },
      caption: String.raw`Illustrative values. For Day 4, $\frac{10+13+16}{3}=13$. Each feature uses the three days before its prediction day.`,
    } },
  },
];
