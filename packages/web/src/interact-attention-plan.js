// Brief 36 proof plan (owner local stack only): "How does a word attend to the others?", one token-links picture on the wide scene layout and a step control over the six words. Built from the merge-sort plan's frozen
// skeleton (runtime, mode, control shapes) so only what differs is written here. ponytail: pinned, one plan, brief depth only, no brief schema and no model fill.
import { STEPPER_PLANS } from './interact-stepper-plans.js';
import { ATTENTION_GEOMETRY } from './interact-attention-geometry.js';

const WORDS = ['The', 'cat', 'sat', 'on', 'the', 'mat'];
// A fixed 6 x 6 table of illustrative weights: row i is what word i gives to every word of the sentence (each row sums to 1, one largest weight). Not taken from a model.
const WEIGHTS = [[0.4, 0.35, 0.1, 0.05, 0.05, 0.05], [0.3, 0.4, 0.15, 0.05, 0.04, 0.06], [0.05, 0.4, 0.3, 0.1, 0.05, 0.1], [0.05, 0.1, 0.35, 0.2, 0.1, 0.2], [0.1, 0.05, 0.1, 0.15, 0.2, 0.4], [0.05, 0.05, 0.1, 0.25, 0.35, 0.2]];
const START = 2; // "sat"
// The three answers that pick the scene layout (layout.md section 4): one picture; the picture is drawn without its title and caption.
const LAYOUT = { pictureCount: 'one', runs: 'left-to-right', panelRole: 'none', figureParts: { title: false, caption: false } };
const affects = [{ scope: 'main', kind: 'entity', id: 'tokens' }, { scope: 'main', kind: 'entity', id: 'values' }];

const plan = structuredClone(STEPPER_PLANS['stepper-merge-sort-brief']);
Object.assign(plan, {
  title: 'How does a word attend to the others?',
  story: 'A learner picks one word of the sentence "The cat sat on the mat" and sees how strongly it attends to every word of the sentence: a line from the picked word to each word, thicker where the weight is larger. The six weights of a word sum to one, and the largest shows which word it looks at most. The weights are made up for the picture and are not taken from a model.',
  cardDescription: 'Pick a word and see how strongly it attends to every word in the sentence. The weights are illustrative, not taken from a model.',
  instructions: 'Pick a word.',
  learningGoal: 'In attention, each word gives a weight to every word of the sentence; the weights sum to one and the largest shows what it looks at most.',
  assumptions: ['The weights are illustrative; no model produced them.'], limitations: ['One six-word sentence and one attention head.'],
});
Object.assign(plan.scene, {
  layout: LAYOUT,
  description: 'Family stepper-states. One token-links diagram drawn by the written renderer with a ring round the picked word and a dot on the word it looks at most, three values, a formula and a note.\nA 640 x 400 px adjustable still scene on the wide layout with six ordered states. No elapsed time or playback.',
  entities: [{ id: 'tokens', label: 'Attention picture', purpose: 'Show the weights the picked word gives to every word of the sentence.' }, { id: 'values', label: 'Values', purpose: 'Name the picked word, the word it looks at most and that weight.' }],
  template: 'stepper-attention', words: {}, slots: {}, readoutIds: [],
  data: { title: 'How does a word attend to the others?', start: START, words: WORDS, weights: WEIGHTS, layout: LAYOUT,
    values: [{ quantity: 'word', label: 'Word', role: 'input' }, { quantity: 'target', label: 'Looks most at', role: 'warning' }, { quantity: 'weight', label: 'Weight', role: 'warning' }],
    formula: String.raw`\alpha_j = \mathrm{softmax}_j(q \cdot k_j)`, note: '{word} looks most at {target}.', geometry: ATTENTION_GEOMETRY },
  observations: [{ id: 'aha', text: 'Each word spreads one unit of weight over the sentence; the largest share shows what it looks at most.', quantityIds: [], readoutIds: [] }],
  checkpoints: [2, 5].map(i => ({ id: `state${i}`, label: WORDS[i], time: null, inputOverrides: { step: i }, actions: [], expected: `"${WORDS[i]}" is picked: its largest weight is ${Math.max(...WEIGHTS[i]).toFixed(2)}.` })),
});
plan.mode.initialState = 'The word "sat" is picked.';
Object.assign(plan.controls[0], { label: 'Word', purpose: 'Pick the word whose attention is shown.', default: START, items: WORDS.map((label, i) => ({ id: `word${i}`, label })), affects });
Object.assign(plan.controls[1], { purpose: 'Return to the starting word.', effect: 'Picks "sat" again.', affects });

export const ATTENTION_PLAN = Object.freeze(plan);
