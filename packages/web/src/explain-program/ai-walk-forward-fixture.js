import { VISUAL_PROGRAM_STAMPS } from './stamps.js';

export const walkForwardFixture = {
  id: 'fixture-ai-walk-forward',
  stamps: VISUAL_PROGRAM_STAMPS,
  manifest: {
    title: 'Walk-Forward Validation Explorer',
    summary: 'Train on past days, skip a gap, then test on a fixed window of future days.',
    description: 'A timeline sorts thirteen days into training, the skipped gap, testing and later days. The training cutoff moves forward while the gap and test window keep the same length.',
    cardDescription: 'Each fold trains from day 1 through the cutoff, skips the next two days, then tests on the following three. Later days are left unused in that fold. Training and test days never overlap.',
    instructions: 'Move Training cutoff and watch the training window grow while the test window moves forward.',
    assumptions: ['This example uses an expanding training window, a two-day gap and a three-day test window.'],
    capabilities: ['number_inputs'],
    inputs: [{ id: 'cutoff', label: 'Training cutoff', type: 'number', default: 4, min: 4, max: 8, step: 1 }],
    readouts: [],
  },
  source: `
const dayCount = 13;
const gapDays = 2;
const testDays = 3;

function lane(id, label, start, end, role) {
  return { id, label, events: Array.from({ length: end - start + 1 }, (_, index) => {
    const day = start + index;
    return { id: 'day-' + day, at: day, label: String(day), role };
  }) };
}

export function evaluate({ inputs }) {
  const cutoff = Math.round(inputs.cutoff);
  const firstTest = cutoff + gapDays + 1;
  const lastTest = firstTest + testDays - 1;
  const objects = [
    ...sdk.timeline('fold', {
      x: 24, y: 16, w: 568, h: 254, domain: [1, dayCount], cursor: cutoff,
      lanes: [
        lane('train', 'Train', 1, cutoff, 'learner'),
        lane('skip', 'Skip', cutoff + 1, firstTest - 1, 'warning'),
        lane('test', 'Test', firstTest, lastTest, 'prediction'),
        lane('future', 'Later', lastTest + 1, dayCount, 'neutral'),
      ],
    }),
    sdk.box('split', 24, 282, 568, 40, {
      text: 'Train through day ' + cutoff + '  ·  Test on days ' + firstTest + '–' + lastTest,
      role: 'output',
    }),
  ];
  return { frame: sdk.frame(objects, { width: 616, height: 340 }) };
}`,
};
