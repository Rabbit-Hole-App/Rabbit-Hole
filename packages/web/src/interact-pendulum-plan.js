// Brief 33 proof plan (owner local stack only): the landing page's pendulum card. A (1 kg, 1 m) is the reference; B follows two sliders. Built from the merge-sort plan's frozen skeleton (runtime tuple,
// supporting fields); the timed pieces are written here. ponytail: pinned, one plan, no brief schema and no model fill.
import { STEPPER_PLANS } from './interact-stepper-plans.js';

const lit = value => ({ op: 'literal', value });
const TWO_PI = 6.283185307;
const entity = id => ({ scope: 'main', kind: 'entity', id });
const affects = ['pendulums', 'plot', 'callout'].map(entity);
const number = (id, label, unit, purpose, min, max) => ({ id, label, type: 'number', purpose, selectionReason: 'The value varies continuously, and intermediate values show which one changes the timing and which does not.', nativeControlId: 'program.number', binding: { kind: 'input', id }, unit, default: 1, min, max, step: 0.1, onChange: 'recompute_still', affects });

const plan = structuredClone(STEPPER_PLANS['stepper-merge-sort-brief']);
Object.assign(plan, {
  title: "What changes a pendulum's swing?",
  story: "A learner compares two pendulums. A is the reference at 1 kg and 1 m; B is the learner's experiment with its own mass and string length. Both start at 20 degrees and swing for 8 seconds while a plot draws each angle against time with a marker at the current moment. Changing B's mass leaves its timing with A's, while a longer string swings slower and a shorter one faster, so the period depends on length and not on mass.",
  cardDescription: 'Pendulum A (1 kg, 1 m) is the reference. Set the mass and the string length of pendulum B, press play, and watch whether B keeps time with A or falls behind it.',
  instructions: 'Press play, then change the mass and the length of B.',
  learningGoal: "A pendulum's period depends on its length and not on its mass: T = 2 pi sqrt(L / g).",
  controls: [
    { id: 'play', label: 'Play', type: 'playback', purpose: 'Run the swing and replay it.', selectionReason: 'Time carries the swing, and the one supported transport drives every linked view.', nativeControlId: 'program.playback', binding: { kind: 'timeline' }, labels: { paused: 'Play', playing: 'Pause', ended: 'Replay' }, affects },
    { id: 'scrub', label: 'Time', type: 'scrubber', purpose: 'Stop on any moment of the swing.', selectionReason: 'A scrubber lets the learner stop on the moment being compared.', nativeControlId: 'program.scrubber', binding: { kind: 'timeline' }, unit: 's', step: 0.01, affects },
    number('mass', 'B mass', 'kg', 'Change how heavy the swinging ball B is.', 0.5, 3),
    number('length', 'B length', 'm', 'Change how long the string of B is.', 0.5, 2),
    { id: 'resetAll', label: 'Reset', type: 'reset', purpose: 'Return to the defaults.', selectionReason: 'Replay keeps the settings; Reset restores them.', nativeControlId: 'program.reset', binding: { kind: 'reset' }, effect: 'Restores B to 1 kg and 1 m and time 0, paused.', affects },
  ],
  mode: { kind: 'experiment', initialState: 'B at 1 kg and 1 m beside A; time 0 s, paused.', fixedValues: {}, adjustableIds: ['mass', 'length'],
    timeline: { label: 'Time', unit: 's', start: 0, end: lit(8), displayOffset: lit(0), markers: [], initialTime: 0, initialPlayback: 'paused', playbackRate: 1 }, onInputChange: 'reset_pause' },
  assumptions: ['Both pendulums start at 20 degrees with g = 9.81 m/s^2 and no damping.'], limitations: ['Small-angle physics; a very wide swing is slightly slower than T = 2 pi sqrt(L / g).'], claims: [],
});
Object.assign(plan.scene, {
  description: 'Family stepper-states. Two pendulums drawn with frame primitives, an angle-against-time plot drawn by the plot renderer, two period readouts and a callout.\nA 640 px scene with an 8 s timeline and two number inputs.',
  template: 'stepper-pendulum', words: {}, slots: {}, readoutIds: ['periodA', 'periodB'],
  data: { title: "What changes a pendulum's swing?", g: 9.81, theta0: 20, duration: 8, reference: { mass: 1, length: 1 }, plot: { title: 'Angle against time', time: 'Time', angle: 'Angle', yMax: 25 } },
  entities: [{ id: 'pendulums', label: 'Pendulums', purpose: 'A, the reference, and B, the experiment, swinging side by side.' }, { id: 'plot', label: 'Angle plot', purpose: 'Each pendulum\'s angle against time, a marker on each curve at the current time.' }, { id: 'callout', label: 'What it shows', purpose: 'One sentence about what the current settings show.' }],
  quantities: [
    { id: 'mass', label: 'B mass', unit: 'kg', meaning: 'Mass of the swinging ball B.', reference: 'A is fixed at 1 kg.', formula: 'mass' },
    { id: 'length', label: 'B length', unit: 'm', meaning: 'Length of the string of B.', reference: 'A is fixed at 1 m.', formula: 'length' },
    { id: 'periodA', label: 'A', unit: 's per swing', meaning: 'Time for one full swing of A.', reference: 'T = 2 pi sqrt(L / 9.81) with L = 1 m.', relation: 'periodA = 2 pi sqrt(1 / 9.81)', formula: `${TWO_PI} * sqrt(1 / 9.81)` },
    { id: 'periodB', label: 'B', unit: 's per swing', meaning: 'Time for one full swing of B.', reference: 'T = 2 pi sqrt(L / 9.81); the mass does not appear.', relation: 'periodB = 2 pi sqrt(length / 9.81)', formula: `${TWO_PI} * sqrt(length / 9.81)` },
  ],
  observations: [{ id: 'length', text: 'A longer string gives a longer period; the mass does not change it.', quantityIds: ['periodA', 'periodB'], readoutIds: ['periodA', 'periodB'] }],
  checkpoints: [{ id: 'start', label: 'Both at the start', time: lit(0), inputOverrides: {}, actions: [], expected: 'Both pendulums start at 20 degrees.' },
    { id: 'heavier', label: 'B heavier', time: lit(2), inputOverrides: { mass: 2 }, actions: [], expected: 'B keeps time with A: the period is 2.01 s.' },
    { id: 'longer', label: 'B longer', time: lit(2), inputOverrides: { length: 2 }, actions: [], expected: 'B takes 2.84 s per swing against 2.01 s for A.' }],
});
plan.scene.runtime.requiredCapabilities = ['time_playback', 'number_inputs', 'figures'];

export const PENDULUM_PLANS = Object.freeze({ 'stepper-pendulum-brief': plan });
