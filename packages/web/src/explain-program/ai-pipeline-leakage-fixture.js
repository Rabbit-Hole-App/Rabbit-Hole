import { VISUAL_PROGRAM_STAMPS } from './stamps.js';

export const pipelineLeakageFixture = {
  id: 'fixture-ai-pipeline-leakage',
  stamps: VISUAL_PROGRAM_STAMPS,
  manifest: {
    title: 'Pipeline Leakage Explorer',
    summary: 'See how fitting a scaler on held-out data changes what the pipeline learns and what it reports.',
    description: 'Compare the scaler mean, population standard deviation, and standardized held-out values when fitting on training rows or all rows.',
    cardDescription: 'A scaler learns a mean and standard deviation from the rows it fits on. A held-out row may be transformed with those values, but including it in the fit leaks test data.',
    instructions: 'Switch Fit scaler on from Training rows to All rows. Watch what happens to the fit, the two held-out results, and the leakage status.',
    assumptions: ['One numeric feature with three training and two held-out rows. This scaler uses population standard deviation. Displayed values are rounded to two decimals.'],
    capabilities: ['select_inputs'],
    inputs: [{ id: 'fitOn', label: 'Fit scaler on', type: 'select', default: 'train', options: [
      { value: 'train', label: 'Training rows' }, { value: 'all', label: 'All rows' },
    ] }],
    readouts: [],
  },
  source: `
const training = [{ id: 'T1', value: 2 }, { id: 'T2', value: 4 }, { id: 'T3', value: 6 }];
const heldOut = [{ id: 'H1', value: 8 }, { id: 'H2', value: 10 }];

function drawRows(rows, x, role) {
  return rows.map(({ id, value }, i) => sdk.box('row-' + id.toLowerCase(), x + i * 90, 43, 80, 36, {
    text: id + ': ' + value, role,
  }));
}

export function evaluate({ inputs }) {
  const leaks = inputs.fitOn === 'all';
  const fitRows = leaks ? [...training, ...heldOut] : training;
  const mean = fitRows.reduce((sum, row) => sum + row.value, 0) / fitRows.length;
  const std = Math.sqrt(fitRows.reduce((sum, row) => sum + (row.value - mean) ** 2, 0) / fitRows.length);
  const fixed = value => sdk.format(value, 2);
  const objects = [
    sdk.text('train-heading', 24, 30, 'Training rows'),
    sdk.text('held-out-heading', 318, 30, 'Held-out rows'),
    ...drawRows(training, 24, 'input'),
    ...drawRows(heldOut, 318, leaks ? 'warning' : 'observed'),
    sdk.text('train-use', 24, 103, 'Used in fit'),
    sdk.text('held-out-use', 318, 103, leaks ? 'Used in fit and transformed' : 'Transformed only'),
    sdk.text('fit-heading', 24, 143, 'Scaler fit: ' + fitRows.length + ' rows'),
    sdk.box('fit-mean', 24, 156, 270, 36, { text: 'Mean (μ): ' + fixed(mean), role: 'input' }),
    sdk.box('fit-std', 318, 156, 270, 36, { text: 'Population std (σ): ' + fixed(std), role: 'input' }),
    sdk.text('scaled-heading', 24, 220, 'Held-out rows after scaling'),
    sdk.text('formula', 318, 220, 'z = (x − μ) / σ'),
    ...heldOut.map(({ id, value }, index) => sdk.box('scaled-' + id.toLowerCase(), 24 + index * 294, 233, 270, 36, {
      text: id + ': ' + value + ' → ' + fixed((value - mean) / std), role: 'output',
    })),
    sdk.box('leakage-status', 24, 286, 564, 38, {
      text: leaks ? 'Leakage: held-out rows influence the fit' : 'No leakage: fit uses training rows only',
      role: leaks ? 'warning' : 'success',
    }),
  ];
  return { frame: sdk.frame(objects, { width: 612, height: 340 }) };
}`,
};
