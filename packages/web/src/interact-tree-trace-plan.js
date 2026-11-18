// Brief 31 proof plan: the fitted tree of ml-trees-grown-tree re-expressed as a flow, with one point (J: x = 6, y = 1) traced down it one test at a time. Built from the merge-sort plan's
// frozen skeleton (runtime, mode, control shapes) so only what differs is written here. ponytail: one pinned plan, brief depth only, no brief schema and no model fill.
import { STEPPER_PLANS } from './interact-stepper-plans.js';

const steps = [
  { label: 'Start at the root', callout: 'Point J: x = 6, y = 1. Start at the root test.' },
  { label: 'First test', highlightPath: ['root', 'rootr'], callout: '6 ≤ 4 is false: take No.' },
  { label: 'Second test', highlightPath: ['root', 'rootr', 'rootrl'], callout: '1 ≤ 2 is true: take Yes. The tree predicts class 0.' },
];
const data = {
  title: 'Decision tree',
  nodes: [
    { id: 'root', label: 'x ≤ 4?', role: 'decision' }, { id: 'rootl', label: 'Class 0 · 4 rows', role: 'outcome' }, { id: 'rootr', label: 'y ≤ 2?', role: 'decision' },
    { id: 'rootrl', label: 'Class 0 · 1 row', role: 'outcome' }, { id: 'rootrr', label: 'Class 1 · 3 rows', role: 'outcome' },
  ],
  edges: [{ from: 'root', to: 'rootl', label: 'Yes' }, { from: 'root', to: 'rootr', label: 'No' }, { from: 'rootr', to: 'rootrl', label: 'Yes' }, { from: 'rootr', to: 'rootrr', label: 'No' }],
  steps,
};
const affects = [{ scope: 'main', kind: 'entity', id: 'tree' }, { scope: 'main', kind: 'entity', id: 'callout' }];

const plan = structuredClone(STEPPER_PLANS['stepper-merge-sort-brief']);
Object.assign(plan, {
  title: 'Follow one point down the tree',
  story: 'A learner follows one point, J at x = 6 and y = 1, down a small fitted decision tree. At the root the test x ≤ 4 is false for J, so J takes No; at the next node the test y ≤ 2 is true, so J takes Yes and lands in class 0. Stepping forward highlights one more answered test each time while the tree itself never moves, so the route is the evidence.',
  cardDescription: 'Point J (x = 6, y = 1) enters at the root, answers one yes or no test at each node, and lands in a class when it reaches an outcome.',
  instructions: 'Step through the two tests for point J.',
  learningGoal: 'A decision tree classifies a point by answering one yes or no test per node, from the root to a class.',
});
Object.assign(plan.scene, {
  description: 'Family stepper-states. A decision tree drawn by the flow renderer with one highlighted route and a selected-state callout.\nA 640 px adjustable still scene with three ordered states. No elapsed time or playback.',
  entities: [{ id: 'tree', label: 'Decision tree', purpose: 'Show the fitted tree and the route point J has taken so far.' }, { id: 'callout', label: 'Selected-state explanation', purpose: 'Say which test was answered and how.' }],
  template: 'stepper-tree-trace', words: {}, data,
  observations: [{ id: 'aha', text: 'Each test sends J one way; two answers reach a class.', quantityIds: [], readoutIds: [] }],
  checkpoints: steps.map((step, i) => ({ id: `state${i}`, label: step.label, time: null, inputOverrides: { step: i }, actions: [], expected: step.callout })),
});
plan.mode.initialState = 'The first selected state is Start at the root.';
Object.assign(plan.controls[0], { purpose: 'Select one answered test of the trace.', items: steps.map(({ label }, i) => ({ id: `state${i}`, label })), affects });
Object.assign(plan.controls[1], { purpose: 'Return to the first state.', effect: 'Selects state zero.', affects });

export const TREE_TRACE_PLAN = Object.freeze(plan);
