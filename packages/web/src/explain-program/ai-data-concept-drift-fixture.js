import { VISUAL_PROGRAM_STAMPS } from './stamps.js';

export const dataConceptDriftFixture = {
  id: 'fixture-ai-data-concept-drift',
  stamps: VISUAL_PROGRAM_STAMPS,
  manifest: {
    title: 'Data and Concept Drift Explorer',
    summary: 'Data drift changes how often a feature value occurs. Concept drift changes which labels occur at the same feature value.',
    description: 'Side-by-side baseline and recent windows show the feature mix, the rate of class 1 within each feature group, and the error of the same fixed classifier.',
    cardDescription: 'The model always predicts class 0 for low X and class 1 for high X. Data drift changes the feature mix while label rates within each group stay fixed. Concept drift changes those rates while the mix stays fixed.',
    instructions: 'Switch Recent window from Baseline to Data drift, then to Concept drift. See which bars move and how the same model’s error changes.',
    assumptions: ['Each window contains 200 synthetic examples. Error is the fraction of examples the fixed rule classifies incorrectly. All probability bars use the same 0–100% scale.'],
    capabilities: ['select_inputs'],
    inputs: [{ id: 'scenario', label: 'Recent window', type: 'select', default: 'baseline', options: [
      { value: 'baseline', label: 'Baseline' },
      { value: 'data-drift', label: 'Data drift' },
      { value: 'concept-drift', label: 'Concept drift' },
    ] }],
    readouts: [
      { id: 'baselineError', label: 'Baseline model error', unit: '%', decimals: 0 },
      { id: 'recentError', label: 'Recent model error', unit: '%', decimals: 0 },
    ],
  },
  source: `
// Each [total, class 1 count] pair describes one feature group: low, then high.
const windows = {
  baseline: [[150, 15], [50, 35]],
  'data-drift': [[50, 5], [150, 105]],
  'concept-drift': [[150, 90], [50, 20]],
};
const predict = [0, 1];
const percent = value => sdk.format(100 * value, 0) + '%';

function summarize(groups) {
  const size = groups.reduce((sum, [count]) => sum + count, 0);
  const mix = groups.map(([count]) => count / size);
  const rate = groups.map(([count, positive]) => positive / count);
  const wrong = groups.reduce((sum, [count, positive], i) => sum + (predict[i] === 0 ? positive : count - positive), 0);
  return { size, mix, rate, wrong, error: wrong / size };
}

function drawWindow(id, name, x, window, mixChanges, rateChanges) {
  const rows = [
    ['mix-low', 116, window.mix[0], mixChanges], ['mix-high', 148, window.mix[1], mixChanges],
    ['label-low', 217, window.rate[0], rateChanges], ['label-high', 249, window.rate[1], rateChanges],
  ];
  const barWidth = 148;
  return [
    sdk.text(id + '-heading', x, 61, name + ' · ' + window.size + ' examples'),
    ...rows.flatMap(([row, y, value, changes]) => [
      sdk.box(id + '-' + row + '-track', x, y - 13, barWidth, 16),
      sdk.box(id + '-' + row + '-bar', x, y - 13, barWidth * value, 16, { role: changes ? 'learner' : 'observed' }),
      sdk.text(id + '-' + row + '-value', x + barWidth + 12, y, percent(value)),
    ]),
    sdk.text(id + '-error', x, 293, window.wrong + ' / ' + window.size + ' wrong · ' + percent(window.error), { role: 'output' }),
  ];
}

export function evaluate({ inputs: { scenario } }) {
  const baseline = summarize(windows.baseline);
  const recent = summarize(windows[scenario]);
  const mixChanges = recent.mix.some((value, i) => value !== baseline.mix[i]);
  const rateChanges = recent.rate.some((value, i) => value !== baseline.rate[i]);
  const heading = (id, y, label, changed) => sdk.text(id, 24, y, label + (changed ? ' · Changed' : ' · Unchanged'), { role: changed ? 'learner' : 'neutral' });
  const objects = [
    sdk.text('model-rule', 24, 26, 'Fixed model: low X → class 0 · high X → class 1', { role: 'prediction' }),
    heading('mix-heading', 88, 'Feature mix P(X)', mixChanges),
    sdk.text('mix-low', 38, 116, 'Low X'),
    sdk.text('mix-high', 38, 148, 'High X'),
    heading('rate-heading', 189, 'Label rate P(Y = 1 | X)', rateChanges),
    sdk.text('rate-low', 38, 217, 'Low X'),
    sdk.text('rate-high', 38, 249, 'High X'),
    sdk.text('error-heading', 24, 293, 'Model error'),
    ...drawWindow('baseline', 'Baseline', 221, baseline, false, false),
    ...drawWindow('recent', 'Recent', 461, recent, mixChanges, rateChanges),
  ];
  const readouts = [{ id: 'baselineError', value: 100 * baseline.error }, { id: 'recentError', value: 100 * recent.error }];
  return { frame: sdk.frame(objects, { width: 700, height: 315, readouts }) };
}`,
};
