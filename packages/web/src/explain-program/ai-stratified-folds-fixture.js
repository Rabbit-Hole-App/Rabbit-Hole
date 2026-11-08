import { VISUAL_PROGRAM_STAMPS } from './stamps.js';

export const stratifiedFoldsFixture = {
  id: 'fixture-ai-stratified-folds',
  stamps: VISUAL_PROGRAM_STAMPS,
  manifest: {
    title: 'Stratified Folds Explorer',
    summary: 'Compare test folds with and without preserving the class proportions of an imbalanced dataset.',
    description: 'Three folds of the same labeled samples are shown for each strategy, with the selected test fold marked and its class counts displayed.',
    cardDescription: 'Regular folds split these ordered samples into blocks. Stratified folds distribute each class across all three folds.',
    instructions: 'Move Test fold from 1 to 3. Compare the test rows and class counts. The other two folds are training data.',
    assumptions: ['This dataset has nine A samples and three B samples, ordered by class. Regular folds do not shuffle in this example.'],
    capabilities: ['number_inputs'],
    inputs: [{ id: 'fold', label: 'Test fold', type: 'number', default: 1, min: 1, max: 3, step: 1 }],
    readouts: [],
  },
  source: `
const foldCount = 3;
const makeSamples = (label, count) => Array.from({ length: count }, (_, i) => ({ id: label + (i + 1), label }));
const majority = makeSamples('A', 9);
const minority = makeSamples('B', 3);
const samples = [...majority, ...minority];
const foldSize = samples.length / foldCount;

const regular = Array.from({ length: foldCount }, (_, i) => samples.slice(i * foldSize, (i + 1) * foldSize));
const stratified = Array.from({ length: foldCount }, (_, i) => [
  ...majority.filter((_, j) => j % foldCount === i),
  ...minority.filter((_, j) => j % foldCount === i),
]);

function drawFolds(strategy, heading, x, folds, selected) {
  const b = folds[selected].filter(sample => sample.label === 'B').length;
  const a = folds[selected].length - b;
  const sameMix = b * samples.length === minority.length * folds[selected].length;
  return [
    sdk.text(strategy + '-heading', x, 63, heading),
    ...folds.flatMap((fold, index) => {
      const y = 77 + index * 44;
      const id = strategy + '-fold-' + (index + 1);
      const isTest = index === selected;
      return [
        sdk.box(id + '-role', x, y, 90, 34, {
          text: (index + 1) + (isTest ? ' · Test' : ' · Train'),
          role: isTest ? 'input' : 'neutral',
        }),
        ...fold.map((sample, slot) => sdk.box(id + '-sample-' + sample.id, x + 104 + slot * 52, y, 46, 34, {
          text: sample.id, role: sample.label === 'A' ? 'observed' : 'learner',
        })),
      ];
    }),
    sdk.text(strategy + '-test-mix', x, 224, 'Test mix: ' + a + ' A / ' + b + ' B'),
    sdk.box(strategy + '-minority', x, 238, 306, 36, {
      text: b === 0 ? 'Minority class missing' : sameMix ? 'Matches dataset mix' : 'Minority overrepresented',
      role: b === 0 ? 'warning' : sameMix ? 'success' : 'neutral',
    }),
  ];
}

export function evaluate({ inputs }) {
  const selected = Math.round(inputs.fold) - 1;
  const objects = [
    sdk.text('dataset-mix', 330, 28, 'Dataset: ' + majority.length + ' majority (A) / ' + minority.length + ' minority (B)', { align: 'middle' }),
    ...drawFolds('regular', 'Regular folds', 18, regular, selected),
    ...drawFolds('stratified', 'Stratified folds', 336, stratified, selected),
  ];
  return { frame: sdk.frame(objects, { width: 660, height: 290 }) };
}`,
};
