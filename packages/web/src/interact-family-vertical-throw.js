import { SUPPORTED_PROGRAM_TUPLES } from './explain-program/stamps.js';
import { evalQuantity, parseQuantity } from './interact-formula.js';
import { evalScalar } from './interact-plan.js';

// The family `vertical-throw` (owner brief 11, design MVP): a ball thrown straight up, shown at three depths. The depth picks the template (code, no pick step); the plan brief
// (interact-plan-brief.js) carries what a model writes (the title, the story, the ranges, the formulas, the words); expandBrief below writes everything else, in code: the runtime tuple,
// the controls and their bindings, the timeline, the checkpoints, the readouts, the quantity records, the template and its slots. Product code, derived from the three approved plans
// (interact-plan-fixtures.js tossOverview / tossStandard / tossDeep, and ledgeTossMoon on the same template as the Overview); the round-trip test proves the expansion rebuilds their frames.

// depth -> the template, the plan's depth word, the formula roles (the quantity ids a brief writes a formula for) and the inputs the depth offers.
export const FAMILY = Object.freeze({
  id: 'vertical-throw',
  depths: Object.freeze({
    brief: Object.freeze({ template: 'one-body', roles: Object.freeze(['height', 'velocity', 'acceleration', 'apexTime', 'apexHeight']), gravity: 'fixed', mass: false, inputs: Object.freeze([['launchSpeed', 'range'], ['gravity', 'fixed']]) }),
    balanced: Object.freeze({ template: 'two-lane', roles: Object.freeze(['tossedHeight', 'tossedVelocity', 'tossedAcceleration', 'dropHeight', 'dropVelocity', 'dropAcceleration', 'apexTime', 'apexHeight']), gravity: 'range', mass: false, inputs: Object.freeze([['launchSpeed', 'range'], ['gravity', 'range']]) }),
    detailed: Object.freeze({ template: 'body-plot', roles: Object.freeze(['height', 'velocity', 'acceleration', 'force', 'apexTime', 'apexHeight']), gravity: 'range', mass: true, inputs: Object.freeze([['launchSpeed', 'range'], ['gravity', 'range'], ['mass', 'range']]) }),
  }),
});

// What each formula role is: its label and unit on the card, its meaning and its sign convention (up is positive, the force a magnitude), and the piecewise ones.
export const ROLES = Object.freeze({
  height: { label: 'Height of the ball', unit: 'm', meaning: 'Height above the ground mark, up positive; the launch height is its value at t = 0.', reference: 'height = launchHeight + launchSpeed * t - gravity * t^2 / 2' },
  velocity: { label: 'Vertical velocity', unit: 'm/s', meaning: 'Signed rate of change of height, up positive; zero at the top.', reference: 'velocity = launchSpeed - gravity * t' },
  acceleration: { label: 'Vertical acceleration', unit: 'm/s^2', meaning: 'Signed rate of change of velocity: constant and negative (down), -gravity.', reference: 'acceleration = -gravity' },
  force: { label: 'Gravitational force', unit: 'N', meaning: 'Magnitude of the downward force of gravity on the ball (positive, the arrow draws it down).', reference: 'force = mass * gravity' },
  apexTime: { label: 'Time of the top', unit: 's', meaning: 'Elapsed time from launch at which the velocity is zero.', reference: 'apexTime = launchSpeed / gravity' },
  apexHeight: { label: 'Height of the top', unit: 'm', meaning: 'Height of the ball at its top above the ground mark.', reference: 'apexHeight = launchHeight + launchSpeed^2 / (2 * gravity)' },
  tossedHeight: { label: 'Toss height', unit: 'm', meaning: 'Height of the tossed ball above the ground mark, up positive.', reference: 'tossedHeight = launchHeight + launchSpeed * t - gravity * t^2 / 2' },
  tossedVelocity: { label: 'Toss velocity', unit: 'm/s', meaning: 'Signed velocity of the tossed ball, up positive; zero at the top.', reference: 'tossedVelocity = launchSpeed - gravity * t' },
  tossedAcceleration: { label: 'Toss acceleration', unit: 'm/s^2', meaning: 'Net acceleration of the tossed ball: -gravity.', reference: 'tossedAcceleration = -gravity' },
  dropHeight: { label: 'Drop height', unit: 'm', meaning: 'Height of the second ball: the apex height while the gate holds it, then equal to the tossed ball. Piecewise at the top (switchAt = launchSpeed / gravity).', reference: 'held: launchHeight + launchSpeed^2 / (2 * gravity); after the top: the tossed height', piecewise: true },
  dropVelocity: { label: 'Drop velocity', unit: 'm/s', meaning: 'Signed velocity of the second ball: zero while the gate holds it, then -gravity * (time from the top). Piecewise at the top.', reference: 'held: 0; after the top: -gravity * (t - launchSpeed / gravity)', piecewise: true },
  dropAcceleration: { label: 'Drop acceleration', unit: 'm/s^2', meaning: 'Net acceleration of the second ball: zero while the gate holds it, -gravity after the release. Piecewise at the top.', reference: 'held: 0; after the top: -gravity', piecewise: true },
});

// The inputs a depth offers: id, label, unit and what the control is for (the pinned plans' own words).
export const INPUTS = Object.freeze({
  launchSpeed: { label: 'Launch speed', unit: 'm/s', meaning: 'Upward speed at the instant of the throw.', reference: 'Measured at the launch mark, up is positive.' },
  gravity: { label: 'Gravity', quantityLabel: 'Gravitational acceleration', unit: 'm/s^2', meaning: 'Magnitude of the constant downward acceleration.', reference: 'Idealized, no air resistance.' },
  mass: { label: 'Mass', unit: 'kg', meaning: 'Mass of the ball.', reference: 'Does not change the motion.' },
});

// The five-line description of what a vertical-throw scene shows at each depth (the fill's system text).
const SHOWS = {
  brief: 'One lane (template one-body): one ball thrown up from a launch mark on a fixed height scale, a Motion arrow for its velocity (absent at the top), a constant gravity arrow and a callout naming the motion.',
  balanced: 'Two lanes (template two-lane): a tossed ball and a second ball held by a gate at the top height until the top, then released; both then fall together. Velocity and acceleration arrows on both.',
  detailed: 'One lane and a plot (template body-plot): the ball with its velocity and acceleration arrows and a callout of velocity, acceleration and the downward gravitational force, beside the velocity-time line with a moving dot.',
};
export const familyDescription = depth => [
  `Family ${FAMILY.id}: a ball thrown straight up; up is positive; no air resistance; the card is an experiment with Play, a scrubber, an At top button and Reset.`,
  `At depth ${depth}: ${SHOWS[depth]}`,
  'The timeline starts at launch and ends when the ball is back at its launch height (2 * launchSpeed / gravity); it pauses at the top (where the velocity is zero) and, in the two-lane and plot depths, 0.10 s before and after it.',
  'Inputs the reader changes: launch speed' + (FAMILY.depths[depth].gravity === 'range' ? ', gravity' : ' (gravity is fixed)') + (FAMILY.depths[depth].mass ? ', mass (it changes only the force)' : '') + '. Each has a minimum, a maximum, a default and a step.',
  'Write the physics as formulas over t and those input names, and the words the card shows (headings, state lines, callout lines) in the limits given.',
].join('\n');

const lit = value => ({ op: 'literal', value });
const inp = id => ({ op: 'input', id });
const bin = (op, left, right) => ({ op, left, right });
const entity = (id, label, purpose) => ({ id, label, purpose });
const affects = (...ids) => ids.map(([scope, kind, id]) => ({ scope, kind, id }));

// The entities of each depth (the pinned plans' ids: the controls' `affects` and the observations name them).
const ENTITIES = {
  brief: [entity('ball', 'Ball', 'The tossed ball (frame object id ball.toss), an SVG glyph that starts at the launch mark.'), entity('motionArrow', 'Motion arrow', 'Blue arrow showing the signed velocity (frame object id vec.v, labelled v); absent at the top.'),
    entity('gravityArrow', 'Gravity arrow', 'Dashed warm arrow (frame object id vec.a, labelled a), the same downward length throughout.'), entity('heightGuide', 'Launch-height guide', 'A fixed guide at the launch height on one height scale.')],
  balanced: [entity('tossedBall', 'Tossed ball', 'The ball thrown upward from the launch mark in the Toss lane (frame object id ball.toss).'), entity('dropBall', 'Dropped ball', 'The second ball in the Drop lane (frame object id ball.drop), held by the gate until the top.'),
    entity('gate', 'Release gate', 'Holds the second ball at the apex height, opens at the top.'), entity('velocityArrow', 'Velocity arrow', 'Blue arrow with the signed velocity of each ball (frame object ids vec.v.toss, vec.v.drop).'),
    entity('accelerationArrow', 'Acceleration arrow', 'Dashed warm arrow with the net acceleration of each ball (frame object ids vec.a.toss, vec.a.drop).')],
  detailed: [entity('ball', 'Ball', 'The tossed ball on the height ruler (frame object id ball.toss).'), entity('velocityArrow', 'Velocity arrow', 'Blue arrow with the signed velocity (frame object id vec.v, labelled v).'),
    entity('accelerationArrow', 'Acceleration arrow', 'Dashed warm arrow with the constant -gravity (frame object id vec.a, labelled a).'), entity('velocityGraph', 'Velocity-time graph', 'The velocity line with a linked marker and the slope segment (frame object id plot.vt).')],
};
const DESCRIPTION = {
  brief: 'One moving ball on a fixed height scale with a launch-height guide; the scale does not change with the launch speed, so a faster toss visibly rises higher. A blue Motion arrow beside the ball shortens on the way up, is absent at the top and points down on the way back. A separate dashed warm gravity arrow keeps the same direction and length throughout. Beside the ball a callout (frame object id callout.toss) names the motion and shows gravity. The scene starts at launch and runs the whole rise and fall. No second ball, graph, equation, number readout or comparison strip.',
  balanced: 'Two equal-width lanes side by side in one frame: a Toss lane (frame object id lane.toss) and a Drop lane (lane.drop), each with a heading and a state line. Both use the same fixed height scale and the same velocity-arrow and acceleration-arrow scales; zero height is the launch mark, up is positive. A release gate at the apex height holds the second ball (velocity and acceleration zero) until the top, then opens. Each ball (ball.toss, ball.drop) has a blue velocity arrow and a dashed warm acceleration arrow, and a callout (callout.toss, callout.drop) of two readings. After release faint outlines keep the shared starting height. No graph, no mass control, no snapshot strip.',
  detailed: 'Two equal-width scenes side by side in one frame. Left, the motion: a ball (frame object id ball.toss) on a height ruler fixed to the highest top, zero at the launch mark, up positive, with a blue velocity arrow (vec.v), a separate dashed warm acceleration arrow (vec.a) and a callout (callout.toss) beside it reading velocity, acceleration and the downward gravitational force, plus a state line. Right, velocity over time (plot.vt): the line on fixed scales, a linked marker and a note with the slope. Ball, marker and readings move together. No snapshot strip.',
};
const READOUT_IDS = { brief: ['motionState', 'gravityState'], balanced: ['tossedVelocity', 'tossedAcceleration', 'dropVelocity', 'dropAcceleration'], detailed: ['velocity', 'acceleration', 'force', 'motionState'] };
const LEARNING_GOAL = {
  brief: 'Say that gravity still pulls the ball down at the top of its throw, where it is still for an instant.',
  balanced: 'Explain why the acceleration is not zero at the top, where the velocity is zero, by comparing the tossed ball with a ball released from rest.',
  detailed: 'Explain that the force of gravity is m g and the acceleration is -g at every instant, including the top, so a larger mass changes the force and not the motion.',
};
const OBSERVATIONS = {
  brief: [{ id: 'motionArrow', text: 'The Motion arrow shortens while the ball rises, is absent at the top and points down while it falls.', quantityIds: ['velocity'], readoutIds: ['motionState'] },
    { id: 'gravityConstant', text: 'The gravity arrow keeps the same direction and length, so gravity pulls down at the top too.', quantityIds: ['acceleration'], readoutIds: ['gravityState'] },
    { id: 'fasterHigher', text: 'A faster toss reaches its top later and higher on the same fixed height scale.', quantityIds: ['apexTime', 'apexHeight', 'height'], readoutIds: [] }],
  balanced: [{ id: 'velocityFlips', text: 'The toss velocity changes sign at the top while the acceleration does not.', quantityIds: ['tossedVelocity'], readoutIds: ['tossedVelocity'] },
    { id: 'accelerationConstant', text: 'The toss acceleration stays at -gravity at every instant, including the top.', quantityIds: ['tossedAcceleration'], readoutIds: ['tossedAcceleration'] },
    { id: 'sameAfterRelease', text: 'After the release the dropped ball has the same height, velocity and acceleration as the tossed ball at every shared instant.', quantityIds: ['tossedHeight', 'dropVelocity', 'dropHeight'], readoutIds: ['dropVelocity', 'dropAcceleration'] },
    { id: 'topMoves', text: 'A faster toss or a weaker gravity moves the top later and higher; the readings at the top do not change.', quantityIds: ['apexTime', 'apexHeight'], readoutIds: [] }],
  detailed: [{ id: 'velocitySamples', text: 'The velocity follows the straight line v = u - g t and is zero at the top.', quantityIds: ['velocity'], readoutIds: ['velocity'] },
    { id: 'accelerationSlope', text: 'The slope of the velocity line is -gravity at every instant, so the acceleration is nonzero at the top.', quantityIds: ['acceleration'], readoutIds: ['acceleration'] },
    { id: 'forceByMass', text: 'The force at the top is mass times gravity, while the trajectory and the velocity graph stay identical.', quantityIds: ['force', 'height'], readoutIds: ['force'] },
    { id: 'topMoves', text: 'A faster toss or a weaker gravity moves the top later and higher on the fixed scales.', quantityIds: ['apexTime', 'apexHeight'], readoutIds: [] }],
};
const CLAIM = {
  brief: { id: 'gravityAtTop', text: 'At the top the velocity is zero and the acceleration is still downward, so gravity keeps pulling.', evidenceIds: ['kinematics_note'], check: 'Differentiate v = u - g t: the slope is -g at every t, including the top.' },
  balanced: { id: 'sameAfterRelease', text: 'After the release both balls share height, velocity and acceleration at every instant, and the toss acceleration is -gravity throughout.', evidenceIds: ['kinematics_note'], check: 'Toss: y = u t - g t^2 / 2 about its top equals y_top - g tau^2 / 2, the same as a ball released from rest at the top.' },
  detailed: { id: 'forceAndAcceleration', text: 'The gravitational force is m g and the acceleration is -g at every instant, so doubling the mass doubles the force and leaves the motion unchanged.', evidenceIds: ['kinematics_note'], check: 'a = F / m = -m g / m = -g; v = u - g t and y = u t - g t^2 / 2 do not contain m.' },
};

// The reference line of each quantity record in the plan (plain words; the formula hints in ROLES are for the fill).
const REF = { height: 'Measured from the ground mark, up is positive.', velocity: 'Zero at the top.', acceleration: 'Constant -gravity during flight.', force: 'Downward.', apexTime: 'Elapsed from launch.', apexHeight: 'Measured from the ground mark, up is positive.',
  tossedHeight: 'Measured from the ground mark, up is positive.', tossedVelocity: 'Zero at the top.', tossedAcceleration: 'Constant -gravity during flight.', dropHeight: 'Measured from the ground mark, up is positive.', dropVelocity: 'Up is positive.', dropAcceleration: 'Up is positive.' };
const num = n => Number(n.toFixed(6));
const fmt = n => String(num(n));

// The control declarations the three approved plans carry, with the brief's numbers.
const tossControls = (extra, ids) => ({ affects: affects(...ids), ...extra });
const numberControl = (input, id, purpose, selectionReason, range, ids, onChange = 'reset_pause') => tossControls({ id, label: INPUTS[input].label, type: 'number', purpose, selectionReason, nativeControlId: 'program.number', binding: { kind: 'input', id: input }, unit: INPUTS[input].unit, default: range.default, min: range.min, max: range.max, step: range.step, onChange }, ids);
const speedControl = (range, ids) => numberControl('launchSpeed', 'speed', 'See how the speed of the toss moves the top without changing what gravity does there.', 'The speed varies continuously and intermediate speeds show that the top moves while the pull does not; two named cases would hide that.', range, ids);
const gravityControl = (range, ids) => numberControl('gravity', 'gravityControl', 'See that a different gravity changes the acceleration and the time to the top, not the idea.', 'Gravity varies continuously and the learner can compare nearby values; two planets would hide that.', range, ids);
const massControl = (range, ids) => numberControl('mass', 'massControl', 'See that mass changes the force of gravity and leaves the acceleration and the motion unchanged.', 'The mass varies continuously, and the learner changes it while paused at the top to compare force and acceleration at the same instant.', range, ids, 'recompute_still');
const seekTop = (markerId, ids) => tossControls({ id: 'atTop', label: 'At top', type: 'seek', purpose: 'Jump to the top of the toss and pause there.', selectionReason: 'The top is the one instant the explanation is about; a button reaches it exactly, which dragging the scrubber does not.', nativeControlId: 'program.seek', binding: { kind: 'marker', id: markerId }, effect: 'Seeks the top marker and pauses.' }, ids);
const resetTo = (effect, ids) => tossControls({ id: 'resetAll', label: 'Reset experiment', type: 'reset', purpose: 'Return to the defaults.', selectionReason: 'Replay keeps the settings; Reset restores them so the learner can start over.', nativeControlId: 'program.reset', binding: { kind: 'reset' }, effect }, ids);
const playback = ids => ({ id: 'play', label: 'Play', type: 'playback', purpose: 'Run the motion and replay it.', selectionReason: 'Time explains the change, and the one supported transport drives every linked view.', nativeControlId: 'program.playback', binding: { kind: 'timeline' }, labels: { paused: 'Play', playing: 'Pause', ended: 'Replay' }, affects: affects(...ids) });
const scrubber = (label, ids) => ({ id: 'scrub', label, type: 'scrubber', purpose: 'Inspect any instant of the motion.', selectionReason: 'A scrubber lets the learner stop on the instants the explanation compares.', nativeControlId: 'program.scrubber', binding: { kind: 'timeline' }, unit: 's', step: 0.01, affects: affects(...ids) });

const ONE_BODY_EXPECT = { rising: 'Moving up: a short blue Motion arrow up, gravity arrow down.', top: 'Still for an instant at the top: no Motion arrow, gravity arrow still down; playback pauses here.', falling: 'Moving down: a short blue Motion arrow down, gravity arrow down.', fastTop: 'At the fastest launch speed the top comes later and higher on the same height scale.' };

// -> a ScenePlan (a plain object; run planProblems / ScenePlanSchema on it) from a brief and its depth. `catalogueHash` is the control catalogue's hash the plan was designed against (interactCapabilities with seek:
// true, as the pinned plans use); without it the plan keeps an empty hash and only the pure checks (planProblems, the build) apply. The brief is trusted to match briefSchema(depth) (parse it first).
export function expandBrief(brief, depth, { catalogueHash = '' } = {}) {
  const family = FAMILY.depths[depth];
  if (!family) throw new Error(`the family ${FAMILY.id} has no depth "${depth}"`);
  const sdk8 = SUPPORTED_PROGRAM_TUPLES.find(t => t.schemaVersion === 1 && t.sdkVersion === 'sdk-8');
  const runtime = { renderer: 'program', schemaVersion: sdk8.schemaVersion, sdkVersion: sdk8.sdkVersion, programTuple: sdk8, requiredHelpers: [], requiredCapabilities: ['time_playback', 'number_inputs', 'props', 'figures'], catalogueHash };
  const fixedGravity = family.gravity === 'fixed' ? brief.gravity.fixed : null;
  const speed = brief.launchSpeed, gravityRange = fixedGravity === null ? brief.gravity : { min: fixedGravity, max: fixedGravity, default: fixedGravity, step: 0.1 };
  const g = fixedGravity === null ? inp('gravity') : lit(fixedGravity), speedExpr = inp('launchSpeed');
  const top = bin('divide', speedExpr, g), flight = bin('divide', bin('multiply', lit(2), speedExpr), g);
  const around = dt => bin(dt < 0 ? 'subtract' : 'add', top, lit(Math.abs(dt)));
  const topDefault = speed.default / gravityRange.default;
  const playbackRate = Math.max(0.1, Math.round(topDefault / 2.04 * 10) / 10);
  const timeline = (label, displayOffset, markers) => ({ label, unit: 's', start: 0, end: flight, displayOffset, markers, initialTime: 0, initialPlayback: 'paused', playbackRate });

  const input = (id, formulaText) => ({ id, label: INPUTS[id].quantityLabel ?? INPUTS[id].label, unit: INPUTS[id].unit, meaning: INPUTS[id].meaning, reference: INPUTS[id].reference, formula: formulaText ?? id });
  const role = id => {
    const r = ROLES[id], f = brief.formulas[id];
    return { id, label: r.label, unit: r.unit, meaning: r.meaning, reference: REF[id], ...(r.piecewise ? {} : { relation: `${id} = ${f.formula}` }),
      formula: f.formula, ...(f.switchAt != null && f.formulaAfter != null ? { switchAt: f.switchAt, formulaAfter: f.formulaAfter } : {}) };
  };
  const rolesOf = ids => ids.map(role);
  const launch = brief.launchHeight, defaults = `launch speed ${fmt(speed.default)} m/s` + (family.gravity === 'range' ? `, gravity ${fmt(gravityRange.default)} m/s^2` : '') + (family.mass ? `, mass ${fmt(brief.mass.default)} kg` : '');
  const quantities = depth === 'brief' ? [input('launchSpeed'), input('gravity'), ...rolesOf(['apexTime', 'apexHeight', 'velocity', 'height', 'acceleration'])]
    : depth === 'balanced' ? [input('launchSpeed'), input('gravity'), ...rolesOf(['apexTime', 'apexHeight', 'tossedVelocity', 'tossedAcceleration', 'tossedHeight', 'dropVelocity', 'dropAcceleration', 'dropHeight'])]
      : [input('launchSpeed'), input('gravity'), input('mass'), ...rolesOf(['apexTime', 'apexHeight', 'height', 'velocity', 'acceleration', 'force'])];
  const slots = depth === 'brief' ? { height: 'height', velocity: 'velocity', acceleration: 'acceleration' }
    : depth === 'balanced' ? { toss: { height: 'tossedHeight', velocity: 'tossedVelocity', acceleration: 'tossedAcceleration' }, drop: { height: 'dropHeight', velocity: 'dropVelocity', acceleration: 'dropAcceleration' } }
      : { height: 'height', velocity: 'velocity', acceleration: 'acceleration', force: 'force', plotted: 'velocity' };

  const maxSpeed = speed.max, minGravity = gravityRange.min;
  const checkpoints = depth === 'brief' ? [
    { id: 'rising', label: 'Rising', time: bin('multiply', lit(0.5), top), inputOverrides: {}, actions: [], expected: ONE_BODY_EXPECT.rising },
    { id: 'top', label: 'At the top', time: top, inputOverrides: {}, actions: [], expected: ONE_BODY_EXPECT.top },
    { id: 'falling', label: 'Falling', time: bin('multiply', lit(1.5), top), inputOverrides: {}, actions: [], expected: ONE_BODY_EXPECT.falling },
    { id: 'fastTop', label: 'Fastest toss at its top', time: top, inputOverrides: { launchSpeed: maxSpeed }, actions: [], expected: ONE_BODY_EXPECT.fastTop }]
    : depth === 'balanced' ? [
      { id: 'before', label: '0.10 s before the top', time: around(-0.1), inputOverrides: {}, actions: [], expected: 'The toss velocity is positive and the acceleration is -gravity; the second ball is held, with velocity and acceleration zero.' },
      { id: 'top', label: 'At the top', time: top, inputOverrides: {}, actions: [], expected: 'The toss velocity is zero and its acceleration is still -gravity; the gate opens and the second ball is released at zero velocity.' },
      { id: 'after', label: '0.10 s after the top', time: around(0.1), inputOverrides: {}, actions: [], expected: 'Both balls move down at the same velocity with acceleration -gravity.' },
      { id: 'fastTop', label: 'Fast toss, weak gravity, at the top', time: top, inputOverrides: { launchSpeed: maxSpeed, gravity: minGravity }, actions: [], expected: 'At the fastest toss and the weakest gravity the top comes later and higher; both velocities read zero.' }]
      : [
        { id: 'before', label: '0.10 s before the top', time: around(-0.1), inputOverrides: {}, actions: [], expected: 'Velocity positive, acceleration -gravity, force mass times gravity.' },
        { id: 'top', label: 'At the top', time: top, inputOverrides: {}, actions: [], expected: 'The velocity is zero, the acceleration -gravity and the force mass times gravity, downward.' },
        { id: 'heavyTop', label: 'At the top with the largest mass', time: top, inputOverrides: { mass: brief.mass.max }, actions: [], expected: 'The force is larger; velocity, acceleration and height are exactly as at the default mass.' },
        { id: 'fastTop', label: 'Fast toss, weak gravity, at the top', time: top, inputOverrides: { launchSpeed: maxSpeed, gravity: minGravity }, actions: [], expected: 'At the fastest toss and the weakest gravity the top comes later and higher; velocity zero, acceleration -gravity.' }];

  const ballIds = depth === 'balanced' ? [['main', 'entity', 'tossedBall'], ['main', 'entity', 'dropBall']] : depth === 'detailed' ? [['main', 'entity', 'ball'], ['main', 'entity', 'velocityGraph']] : [['main', 'entity', 'ball']];
  const apexIds = [['main', 'quantity', 'apexTime'], ['main', 'quantity', 'apexHeight']];
  const reset = `Restores ${defaults} and time 0, paused.`;
  const controls = depth === 'brief' ? [
    playback(ballIds), scrubber('Time since launch', [...ballIds, ['main', 'readout', 'motionState']]), speedControl(speed, [['main', 'entity', 'ball'], ...apexIds]), seekTop('top', [['main', 'entity', 'ball'], ['main', 'readout', 'motionState']]),
    resetTo(reset, [['main', 'quantity', 'launchSpeed']])]
    : depth === 'balanced' ? [
      playback(ballIds), scrubber('Time from the top', [...ballIds, ['main', 'readout', 'tossedVelocity'], ['main', 'readout', 'dropVelocity']]), speedControl(speed, [['main', 'entity', 'tossedBall'], ...apexIds]),
      gravityControl(brief.gravity, [['main', 'entity', 'accelerationArrow'], ['main', 'quantity', 'apexTime'], ['main', 'readout', 'tossedAcceleration']]), seekTop('top', [['main', 'entity', 'gate'], ['main', 'readout', 'tossedVelocity']]),
      resetTo(reset, [['main', 'quantity', 'launchSpeed']])]
      : [playback(ballIds), scrubber('Time since launch', [...ballIds, ['main', 'readout', 'velocity']]), speedControl(speed, [['main', 'entity', 'ball'], ...apexIds]),
        gravityControl(brief.gravity, [['main', 'entity', 'accelerationArrow'], ['main', 'quantity', 'apexTime'], ['main', 'readout', 'acceleration'], ['main', 'readout', 'force']]), massControl(brief.mass, [['main', 'readout', 'force']]),
        seekTop('top', [['main', 'entity', 'ball'], ['main', 'readout', 'motionState']]), resetTo(reset, [['main', 'quantity', 'launchSpeed']])];

  const modeTimeline = depth === 'brief' ? timeline('Time since launch', lit(0), [{ id: 'top', label: 'Top', time: top, pause: true }])
    : depth === 'balanced' ? timeline('Time from the top', bin('multiply', lit(-1), top), [{ id: 'before', label: '-0.10 s', time: around(-0.1), pause: true }, { id: 'top', label: 'Top', time: top, pause: true }, { id: 'after', label: '+0.10 s', time: around(0.1), pause: true }])
      : timeline('Time since launch', lit(0), [{ id: 'before', label: 'Top -0.10 s', time: around(-0.1), pause: true }, { id: 'top', label: 'Top', time: top, pause: true }, { id: 'after', label: 'Top +0.10 s', time: around(0.1), pause: true }]);
  const adjustableIds = ['launchSpeed', ...(family.gravity === 'range' ? ['gravity'] : []), ...(family.mass ? ['mass'] : [])];
  const gravityText = family.gravity === 'fixed' ? `Gravity fixed at ${fmt(fixedGravity)} m/s^2` : 'The same gravity for both balls and no air resistance';
  const assumptions = [depth === 'brief' ? `${gravityText}, no air resistance, up is positive.` : depth === 'balanced' ? 'No air resistance, the same gravity for both balls, up is positive.' : 'No air resistance, up is positive.'];
  return {
    schemaVersion: 1, supportingVisuals: [], limitations: ['An idealized vertical throw; real balls feel drag.'], depth,
    title: brief.title, story: brief.story, cardDescription: brief.cardDescription, instructions: brief.instructions, learningGoal: LEARNING_GOAL[depth],
    scene: {
      description: DESCRIPTION[depth], runtime, entities: ENTITIES[depth], quantities, template: family.template, slots, words: { ...brief.words },
      observations: OBSERVATIONS[depth], checkpoints, readoutIds: READOUT_IDS[depth],
    },
    mode: {
      kind: 'experiment', initialState: `${defaults.charAt(0).toUpperCase() + defaults.slice(1)}; ${depth === 'balanced' ? 'both balls at launch height at the start' : launch > 0 ? `the ball at the launch mark, ${fmt(launch)} m above the ground mark` : 'the ball at the launch mark'}, time 0.000 s, paused.`,
      fixedValues: fixedGravity === null ? {} : { gravity: fixedGravity }, adjustableIds, timeline: modeTimeline, onInputChange: 'reset_pause',
    },
    controls, claims: [CLAIM[depth]], assumptions,
  };
}

// -> the brief (interact-plan-brief.js) a pinned vertical-throw plan corresponds to: what a model would have to write to get this plan back from expandBrief. Reads the plan's own fields.
export function extractBrief(plan) {
  const depth = plan.depth, family = FAMILY.depths[depth];
  if (!family) throw new Error(`the family ${FAMILY.id} has no depth "${depth}"`);
  const range = id => { const c = plan.controls.find(control => control.type === 'number' && control.binding.id === id); return { min: c.min, max: c.max, default: c.default, step: c.step }; };
  const byId = new Map(plan.scene.quantities.map(q => [q.id, q]));
  const formulas = Object.fromEntries(family.roles.map(id => { const q = byId.get(id); return [id, { formula: q.formula, switchAt: q.switchAt ?? null, formulaAfter: q.formulaAfter ?? null }]; }));
  // The launch height is the height formula's value at launch, read from the first height role at the default inputs (0 for the toss, the ledge's metres for the Moon card).
  const heightId = depth === 'balanced' ? 'tossedHeight' : 'height', defaults = { launchSpeed: range('launchSpeed').default, ...(family.gravity === 'range' ? { gravity: range('gravity').default } : {}) };
  const launchHeight = launchHeightOf(byId.get(heightId), defaults, plan.mode.fixedValues ?? {});
  return {
    title: plan.title, story: plan.story, cardDescription: plan.cardDescription, instructions: plan.instructions, launchHeight,
    launchSpeed: range('launchSpeed'), gravity: family.gravity === 'fixed' ? { fixed: plan.mode.fixedValues.gravity } : range('gravity'), ...(family.mass ? { mass: range('mass') } : {}),
    formulas, words: { ...plan.scene.words },
  };
}

// The height at t = 0: the formula with t = 0 and the default inputs, evaluated by the plan's own grammar.
function launchHeightOf(quantity, inputs, fixed) { return Math.round(evalQuantity(quantity, inputs, 0, {}, fixed) * 1e9) / 1e9; }

// The reference physics (up positive; the force a magnitude; the second ball held at the top height until the top, then falling from rest): the value a role must have at inputs `v` (launch speed), `g`, `m` and time `t`
// for a launch height `h0`.
export function referenceValue(role, t, { v, g, m = 1, h0 = 0 }) {
  const top = v / g, toss = h0 + v * t - g * t * t / 2, held = t < top;
  switch (role) {
    case 'height': case 'tossedHeight': return toss;
    case 'velocity': case 'tossedVelocity': return v - g * t;
    case 'acceleration': case 'tossedAcceleration': return -g;
    case 'force': return m * g;
    case 'apexTime': return top;
    case 'apexHeight': return h0 + v * v / (2 * g);
    case 'dropHeight': return held ? h0 + v * v / (2 * g) : toss;
    case 'dropVelocity': return held ? 0 : -g * (t - top);
    case 'dropAcceleration': return held ? 0 : -g;
    default: throw new Error(`no reference physics for the role "${role}"`);
  }
}

// family.referenceCheck(brief, depth) -> { ok, failures: [{ role, point, got, expected }] }: the brief's formulas against the reference physics at 24 points over the brief's own input ranges and timeline (0 to 2 v / g, the return to the launch height),
// skipping 1e-3 s around a piecewise switch, relative tolerance 1e-4 (against the larger of the expected value and 1, so a reference of zero is an absolute 1e-4). A formula that does not parse is a failure with
// point null and the parser's message as `got`. At most 12 failures are listed.
export function referenceCheck(brief, depth) {
  const family = FAMILY.depths[depth], fixedGravity = family.gravity === 'fixed' ? brief.gravity.fixed : null;
  const names = ['launchSpeed', ...(fixedGravity === null ? ['gravity'] : []), ...(family.mass ? ['mass'] : [])], fixed = fixedGravity === null ? {} : { gravity: fixedGravity };
  const failures = [], quantities = {};
  for (const role of family.roles) {
    const f = brief.formulas[role], quantity = { id: role, formula: f.formula, ...(f.switchAt != null && f.formulaAfter != null ? { switchAt: f.switchAt, formulaAfter: f.formulaAfter } : {}) };
    try { parseQuantity(quantity, { names, fixed }); quantities[role] = quantity; } catch (error) { if (!error.code) throw error; failures.push({ role, point: null, got: error.message, expected: 'a formula over t and the input names' }); }
  }
  // The input sets: every corner of the ranges plus the defaults; the times: evenly spread over the timeline, enough per set to reach 24 points.
  const axes = [['launchSpeed', brief.launchSpeed], ...(fixedGravity === null ? [['gravity', brief.gravity]] : []), ...(family.mass ? [['mass', brief.mass]] : [])];
  let sets = [Object.fromEntries(axes.map(([id, r]) => [id, r.default]))];
  for (let bits = 0; bits < 2 ** axes.length; bits++) sets.push(Object.fromEntries(axes.map(([id, r], i) => [id, bits >> i & 1 ? r.max : r.min])));
  const perSet = Math.ceil(24 / sets.length);
  for (const inputs of sets) {
    const v = inputs.launchSpeed, g = fixedGravity ?? inputs.gravity, m = inputs.mass ?? 1, end = 2 * v / g, top = v / g;
    for (let k = 1; k <= perSet; k++) {
      const t = end * k / (perSet + 1);
      for (const [role, quantity] of Object.entries(quantities)) {
        if (ROLES[role].piecewise && Math.abs(t - top) < 1e-3) continue;
        const expected = referenceValue(role, t, { v, g, m, h0: brief.launchHeight });
        let got; try { got = evalQuantity(quantity, inputs, t, {}, fixed); } catch (error) { if (!error.code) throw error; if (failures.length < 12) failures.push({ role, point: { ...inputs, t }, got: error.message, expected }); continue; }
        if (!Number.isFinite(got) || Math.abs(got - expected) > 1e-4 * Math.max(Math.abs(expected), 1)) { if (failures.length < 12) failures.push({ role, point: { ...inputs, t: Number(t.toFixed(6)) }, got, expected }); }
      }
    }
  }
  const seen = new Set(), unique = failures.filter(f => { const key = `${f.role}|${f.point ? JSON.stringify(f.point) : 'parse'}`; if (seen.has(key)) return false; seen.add(key); return true; });
  return { ok: unique.length === 0, failures: unique.slice(0, 12) };
}

// ---- the family object (owner 2026-11-14 00:50, family contract) ----
// What the brief schema (interact-plan-brief.js briefSchema), the fill (control-plane interact-design-fill.js), the checks and the template generator (interact-templates/generate.js) read, so a second family is one
// more such object plus a registry entry (control-plane interact-families.js). A family exports: id; FAMILY ({ id, depths: { depth: { template, roles, inputs: [[inputId, 'range' | 'fixed']], ... } } });
// INPUTS and ROLES (label, unit, meaning per input and per formula role); LIMITS (brief limits beyond the shared ones) and scalars ([{ id, description, max }]: single numbers the brief carries beside the inputs);
// referenceCheck(brief, depth); expandBrief, extractBrief, familyDescription(depth); formulaGrammar and formulaRules (the fill's text lines: the grammar with the independent variable's sentence, and the
// family's own rules); templates (the template names it draws); context(...) (the geometry its templates need); and, instead of a timeline, optionally independent: { id, domain } for a still scene.
export const LIMITS = Object.freeze({ launchHeight: 10 });
export const scalars = Object.freeze([{ id: 'launchHeight', description: 'height of the launch mark above the ground mark in metres (0 when the ball is thrown from the ground mark)', max: LIMITS.launchHeight }]);
export const templates = Object.freeze(['one-body', 'two-lane', 'body-plot']);
export const formulaGrammar = Object.freeze([
  'A formula is text: numbers, names, + - * /, unary minus, parentheses, and ^ with a literal whole-number exponent 2, 3 or 4 (for example t^2). Nothing else: no functions, no conditions, no other powers. At most 200 characters and 32 nodes.',
  'The readable names are `t` (elapsed seconds since launch, 0 at the launch), the scene\'s numeric inputs by id (launchSpeed, gravity, mass where the scene has them) and, where the scene fixes gravity, `gravity`. Up is positive; a force is a magnitude. A quantity that changes rule at one moment is piecewise: `formula` applies while t < switchAt, `formulaAfter` from switchAt on; switchAt is a formula over the inputs only (no t). Give switchAt and formulaAfter as null when the quantity has one rule at every time.',
]);
// Brief 12: three lines the first matrix showed the fast model needs (two briefs wrote launchHeight as a name, some formulas ran past 32 nodes, a detailed timeline began before the launch).
const FORMULA_RULES = Object.freeze([
  'launchHeight is a number: write it as a literal, never as a name in a formula.',
  'A formula has at most 32 nodes.',
  'The detailed timeline counts time from the launch, and a marker is never before 0.',
]);
// The Deep card draws the acceleration arrow at 3.4 px per m/s^2 and a vector under 12 px is not an arrow (sdk-geometry.js), so the build refused every plan whose gravity range reached 1 (three of three clone
// runs, 2026-11-14); every depth that lets gravity vary gets the floor (the Overview fixes it). Rules of the depth, after the grammar: formulaRules(depth) -> lines.
// A lane heading and its state word share one line of the lane (sdk.panel: 10 px a character, 24 px between them): two-lane's lanes are 302 px, body-plot's 310 px, one-body's 616 px (never cut).
const LANE_ROOM = { balanced: 'Each lane: its heading (words.lane_first, words.lane_second) plus its longest state word is at most 24 characters in all; they share one line and a longer state word is cut on the card.', detailed: 'words.lane plus its longest state word (words.where_*) is at most 25 characters in all; they share one line and a longer state word is cut on the card.' };
export const formulaRules = depth => Object.freeze([...FORMULA_RULES, ...(LANE_ROOM[depth] ? [LANE_ROOM[depth]] : []), ...(FAMILY.depths[depth]?.gravity === 'range' ? ['gravity: every value of its range is at least 4 (a smaller gravity draws no acceleration arrow and the card is refused). Every marker time is at least 0.'] : [])]);

const superscripts = unit => String(unit ?? '').replace('^2', '²').replace('^3', '³');
// The geometry the vertical-throw templates draw from: the largest rise above the launch height, the longest timeline end and the plotted quantity's largest size over the corners and middle of every input range,
// and the units of the body's height, velocity, acceleration and force. -> { range: { rise, end, plotted }, units }. A timed body: the velocity starts positive and crosses zero at the top.
export function context({ bodies, slots, parsed, numberInputs, endExpr, quantities }) {
  const body = bodies[0], plotted = slots.plotted ?? body.velocity;
  const evalQ = (id, values, t) => { const q = parsed[id], at = { ...values, t }; return q.formulaAfter && t >= evalScalar(q.switchAt, values) ? evalScalar(q.formulaAfter, at) : evalScalar(q.formula, at); };
  const topAt = (values, end) => { // the body's velocity crosses zero (bisection), as the program finds it
    if (evalQ(body.velocity, values, 0) <= 0) return 0;
    let lo = 0, hi = end;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (evalQ(body.velocity, values, mid) > 0) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  let grid = [{}];
  for (const input of numberInputs) grid = grid.flatMap(values => [input.min, (input.min + input.max) / 2, input.max].map(value => ({ ...values, [input.id]: value })));
  const range = { rise: 0, end: 0, plotted: 0 };
  for (const values of grid) {
    const end = evalScalar(endExpr, { ...values, t: 0 });
    range.rise = Math.max(range.rise, evalQ(body.height, values, topAt(values, end)) - evalQ(body.height, values, 0));
    range.end = Math.max(range.end, end);
    range.plotted = Math.max(range.plotted, Math.abs(evalQ(plotted, values, 0)), Math.abs(evalQ(plotted, values, end)));
  }
  const unitOf = id => superscripts(quantities.get(id)?.unit);
  return { range, units: { height: unitOf(body.height), velocity: unitOf(body.velocity), acceleration: unitOf(body.acceleration), ...(slots.force ? { force: unitOf(slots.force) } : {}) } };
}

export const verticalThrow = Object.freeze({ id: FAMILY.id, FAMILY, INPUTS, ROLES, LIMITS, scalars, templates, formulaGrammar, formulaRules, referenceCheck, context, expandBrief, extractBrief, familyDescription });
