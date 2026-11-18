import { derived as toyDerived } from './topic-time-series-data.js';

const d = toyDerived();
const model = `$f(x)=${d.parameters.weight}x+${d.parameters.bias}$`;
const spec = diagram => ({ version: 1, diagram });
const line = (label, times, values) => ({ label, kind: 'line', samples: { x: times, y: values } });
const mark = (label, axis, value) => ({ kind: 'reference-line', label, axis, value });
const observed = line('Observed', d.times, d.readings);
observed.samples.x = { start: d.times[0], step: d.times[1] - d.times[0] };
const recursive = line('Recursive', d.recursive.times, d.recursive.predictions);
const refreshed = line('One-step', d.oneStep.times, d.oneStep.predictions);
function plot(title, series, annotations) {
  return { kind: 'coordinate-plot', title,
    x: { label: 'Time', min: d.times[0], max: d.times.at(-1) },
    y: { label: 'Reading', min: 0, max: Math.max(...d.readings) }, series, annotations };
}
const origin = mark('Origin', 'x', d.recursive.origin);
const mean = mark('Mean', 'y', d.baseline);
const fixed = mark('Fixed point', 'y', d.fixedPoint);
const overview = plot('Predictions become inputs', [observed, recursive], [origin, mean]);
overview.caption = `Worked example. ${model}.`;
const provenance = { kind: 'matrix', title: 'Inputs', columns: ['First', 'Next'],
  rows: [{ heading: 'Recursive', cells: d.recursive.provenance.slice(0, 2) },
    { heading: 'One-step', cells: d.oneStep.provenance.slice(0, 2) }] };
function mechanism(deep) {
  const traces = plot('Traces', [observed, recursive, refreshed], [origin, mean]);
  return { kind: 'comparison', variant: 'panels', title: 'Forecast feedback',
    caption: deep ? `Worked example. ${model}; $s=f(s)$.` : `Worked example. ${model}; recursion reuses predictions.`,
    panels: [{ heading: 'Traces', diagram: traces }, { heading: 'Inputs', diagram: provenance }] };
}
const laterOrigin = plot('Move the forecast origin',
  [observed, line('Earlier origin', d.recursive.times, d.recursive.predictions), line('Later origin', d.probe.times, d.probe.predictions)],
  [origin, mark('Later origin', 'x', d.probe.origin), mean, fixed]);
laterOrigin.caption = `Worked example. ${model}. A newly measured seed changes the path; the fixed point stays the same.`;

const paraphrases = [
  'Show a recursive rollout as predicted values become the next inputs.',
  'Why can forecast feedback drift away from refreshed one-step estimates?',
  'Compare a recursive rollout with forecasts that receive new measured readings.',
  'Trace forecast feedback from a measured seed to reused predictions.',
  'How does moving the starting point change a recursive rollout?',
];
const standard = { spec: spec(mechanism(false)) };
export const references = Object.freeze([{
  id: 'ml-time-series-recursive-rollout', topic: 'time-series', lessons: ['15'],
  sources: ['15', '16', '17', '18'].map(figure => ({ kind: 'figure-brief',
    path: `docs/features/explain-on-canvas/handoff/figure-briefs/d2l-sequence/briefs.md#figure-${figure}`, revision: '05d5f02f6' })),
  prompts: ['Rolling a predictor forward on its own outputs can amplify errors as measured inputs stop arriving.', ...paraphrases],
  paraphrases, keywords: ['recursive rollout', 'forecast feedback'],
  useWhen: 'Show measured inputs replaced by predictions during recursive rollout; NOT one-step forecasting alone or horizon-only comparisons.',
  ...standard, depths: { overview: { spec: spec(overview) }, standard,
    deep: { spec: spec(mechanism(true)), detailSpec: spec(laterOrigin) } },
}]);

export function derived() { return toyDerived(); }
