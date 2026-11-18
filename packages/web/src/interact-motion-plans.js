// Brief 32 proof plans (owner local stack only): two timed cards drawn through sdk.diagram. A: the brief 31 decision tree with a dot that travels one point's route (x and y sliders). B: the
// ml-trees-majority-vote forest's three votes growing the bars of a bar chart. Built from the merge-sort plan's frozen skeleton (runtime tuple, supporting fields); the timed pieces are written here.
// ponytail: pinned, one plan per card, no brief schema and no model fill.
import { STEPPER_PLANS } from './interact-stepper-plans.js';
import { TREE_GEOMETRY } from './interact-tree-motion-geometry.js';

const lit = value => ({ op: 'literal', value });
const base = structuredClone(STEPPER_PLANS['stepper-merge-sort-brief']);
const timeline = { label: 'Time', unit: 's', start: 0, end: lit(6), displayOffset: lit(0), markers: [], initialTime: 0, initialPlayback: 'paused', playbackRate: 1 };
const transport = affects => [
  { id: 'play', label: 'Play', type: 'playback', purpose: 'Run the card and replay it.', selectionReason: 'Time carries the change, and the one supported transport drives every linked view.', nativeControlId: 'program.playback', binding: { kind: 'timeline' }, labels: { paused: 'Play', playing: 'Pause', ended: 'Replay' }, affects },
  { id: 'scrub', label: 'Time', type: 'scrubber', purpose: 'Stop on any moment of the card.', selectionReason: 'A scrubber lets the learner stop on the moment being compared.', nativeControlId: 'program.scrubber', binding: { kind: 'timeline' }, unit: 's', step: 0.01, affects },
];
const reset = (affects, effect) => ({ id: 'resetAll', label: 'Reset', type: 'reset', purpose: 'Return to the defaults.', selectionReason: 'Replay keeps the settings; Reset restores them.', nativeControlId: 'program.reset', binding: { kind: 'reset' }, effect, affects });
const number = (id, affects, purpose) => ({ id, label: id, type: 'number', purpose, selectionReason: 'The value varies continuously and each side of the test sends the point down a different branch.', nativeControlId: 'program.number', binding: { kind: 'input', id }, unit: 'units', default: id === 'x' ? 6 : 1, min: 0, max: 8, step: 0.5, onChange: 'recompute_still', affects });
const entity = id => ({ scope: 'main', kind: 'entity', id });

// Card A
const treeAffects = ['tree', 'dot', 'callout'].map(entity);
const treeData = {
  title: 'Decision tree',
  nodes: [
    { id: 'root', label: 'x ≤ 4?', role: 'decision' }, { id: 'rootl', label: 'Class 0 · 4 rows', role: 'outcome' }, { id: 'rootr', label: 'y ≤ 2?', role: 'decision' },
    { id: 'rootrl', label: 'Class 0 · 1 row', role: 'outcome' }, { id: 'rootrr', label: 'Class 1 · 3 rows', role: 'outcome' },
  ],
  edges: [{ from: 'root', to: 'rootl', label: 'Yes' }, { from: 'root', to: 'rootr', label: 'No' }, { from: 'rootr', to: 'rootrl', label: 'Yes' }, { from: 'rootr', to: 'rootrr', label: 'No' }],
  root: 'root',
  tests: { root: { input: 'x', max: 4, yes: 'rootl', no: 'rootr' }, rootr: { input: 'y', max: 2, yes: 'rootrl', no: 'rootrr' } },
  prediction: { rootl: 'Class 0', rootrl: 'Class 0', rootrr: 'Class 1' },
  duration: 6, geometry: TREE_GEOMETRY,
};
const tree = structuredClone(base);
Object.assign(tree, {
  title: 'Follow one point down the tree',
  story: "A learner sends a point, J at x = 6 and y = 1 to start, down a small fitted decision tree. A dot rests on the root while the first test is read out with the point's own numbers, slides along the branch the answer chooses, rests on the next test, then slides to a class and shows the tree's prediction. The lit path grows as the dot passes each node, and changing x or y sends the dot down another branch.",
  cardDescription: 'Point J (x = 6, y = 1) enters at the root, answers one yes or no test at each node, and lands in a class when it reaches an outcome.',
  instructions: 'Press play, or change x and y to send the point down another branch.',
  learningGoal: 'A decision tree classifies a point by answering one yes or no test per node, from the root to a class.',
  controls: [...transport(treeAffects), number('x', treeAffects, 'Move the point left or right across the first test.'), number('y', treeAffects, 'Move the point up or down across the second test.'), reset(treeAffects, 'Restores x = 6, y = 1 and time 0, paused.')],
  mode: { kind: 'experiment', initialState: 'Point J at x = 6 and y = 1; the dot on the root, time 0 s, paused.', fixedValues: {}, adjustableIds: ['x', 'y'], timeline, onInputChange: 'reset_pause' },
  assumptions: ['The tree is fixed: the first test is x ≤ 4, the second y ≤ 2.'], limitations: ['One small tree; real trees are deeper and are fitted from data.'], claims: [],
});
Object.assign(tree.scene, {
  description: 'Family stepper-states. A decision tree drawn by the flow renderer with a dot that travels the route of one point, and a callout that reads each test.\nA 640 px scene with a 6 s timeline and two number inputs.',
  template: 'stepper-tree-motion', data: treeData, words: {}, readoutIds: [], slots: {},
  entities: [{ id: 'tree', label: 'Decision tree', purpose: 'The fitted tree with the route taken so far lit.' }, { id: 'dot', label: 'Point J', purpose: 'The dot that stands for the point and travels its route.' }, { id: 'callout', label: 'Test readout', purpose: 'The test the dot is at and its verdict, then the prediction.' }],
  quantities: ['x', 'y'].map(id => ({ id, label: id, unit: 'units', meaning: `The ${id} value of the point.`, reference: 'Read against the test at each node.', formula: id })),
  observations: [{ id: 'route', text: 'Each test sends the point one way; two answers reach a class.', quantityIds: ['x', 'y'], readoutIds: [] }],
  checkpoints: [['root', 'At the root', 0.6], ['second', 'At the second test', 3], ['leaf', 'At the class', 5.5]].map(([id, label, time]) => ({ id, label, time: lit(time), inputOverrides: {}, actions: [], expected: label })),
});
tree.scene.runtime.requiredCapabilities = ['time_playback', 'number_inputs', 'figures'];

// Card B: the reference forest's three trees and their predictions for row J (ml-trees-majority-vote)
const VOTES = [{ tree: 'Tree 1', rule: 'x ≤ 4', class: 0 }, { tree: 'Tree 2', rule: 'y ≤ 4', class: 1 }, { tree: 'Tree 3', rule: 'x ≤ 5', class: 1 }];
const voteAffects = ['chart', 'callout'].map(entity);
const vote = structuredClone(base);
Object.assign(vote, {
  depth: 'balanced', title: 'Let the trees vote',
  story: "A learner watches a small forest vote on one held-out row, J. Each tree predicts a class in turn, and the bar of that class grows from its old count to the new one while a callout names the tree that just voted. When the last vote is in, the class with the most votes is the forest's answer, so the vote is the evidence to read off the bars.",
  cardDescription: "Three trees each predict the class of row J. Every vote lifts the bar of the class it chose, and the class with the most votes is the forest's answer.",
  instructions: 'Press play, or drag the time to watch each vote arrive.',
  learningGoal: 'A forest answers with the class that most of its trees vote for.',
  controls: [...transport(voteAffects)],
  mode: { kind: 'time', initialState: 'No votes yet, time 0 s, paused.', fixedValues: {}, adjustableIds: [], timeline, onInputChange: 'reset_pause' },
  assumptions: ["The three trees and their votes are the lesson forest's for row J."], limitations: ['Three trees; a real forest has many more.'], claims: [],
});
Object.assign(vote.scene, {
  description: 'Family stepper-states. A bar chart with one bar per class that grows as each tree votes, and a callout that names the tree that just voted.\nA 640 px scene with a 6 s timeline and no inputs.',
  template: 'stepper-vote-motion', data: { title: 'Votes for row J', unit: 'votes', classes: ['Class 0', 'Class 1'], votes: VOTES, duration: 6 }, words: {}, readoutIds: [], slots: {},
  entities: [{ id: 'chart', label: 'Vote bars', purpose: 'One bar per class, growing as each vote arrives.' }, { id: 'callout', label: 'Vote readout', purpose: 'The tree that just voted and, at the end, the winning class.' }],
  quantities: [], observations: [{ id: 'winner', text: 'The class with the most votes wins.', quantityIds: [], readoutIds: [] }],
  checkpoints: [['first', 'First vote in', 1.5], ['second', 'Second vote in', 3.5], ['last', 'All votes in', 5.8]].map(([id, label, time]) => ({ id, label, time: lit(time), inputOverrides: {}, actions: [], expected: label })),
});
vote.scene.runtime.requiredCapabilities = ['time_playback', 'figures'];

export const MOTION_PLANS = Object.freeze({ 'stepper-tree-motion-brief': tree, 'stepper-vote-motion-balanced': vote });
