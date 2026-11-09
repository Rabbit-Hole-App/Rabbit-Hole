import { SUPPORTED_PROGRAM_TUPLES } from './explain-program/stamps.js';
import { interactCapabilities } from './interact-control-catalogue.js';

// Validated ScenePlan fixtures (INT-01-C07): the canonical toss-and-drop Overview / Standard / Deep (docs/features/interact.md
// section 7, "Canonical toss-and-drop acceptance"), an untimed Experiment and a Static view with adjustable still parameters.
// interactFixtures() returns the capabilities they were designed against and the plans; every plan passes parseScenePlan.
const G = 9.8;
const lit = value => ({ op: 'literal', value });
const inp = id => ({ op: 'input', id });
const bin = (op, left, right) => ({ op, left, right });
const entity = (id, label, purpose) => ({ id, label, purpose });
const quantity = (id, label, unit, meaning, reference, relation) => ({ id, label, unit, meaning, reference, ...(relation ? { relation } : {}) });
const affects = (...ids) => ids.map(([scope, kind, id]) => ({ scope, kind, id }));
const tuple = SUPPORTED_PROGRAM_TUPLES.find(t => t.schemaVersion === 1 && t.sdkVersion === 'sdk-2');

const programRuntime = catalogueHash => ({ renderer: 'program', schemaVersion: tuple.schemaVersion, sdkVersion: tuple.sdkVersion, programTuple: tuple, requiredHelpers: [], requiredCapabilities: ['time_playback'], catalogueHash });
const specRuntime = catalogueHash => ({ renderer: 'spec', schemaVersion: 1, sdkVersion: null, programTuple: null, requiredHelpers: [], requiredCapabilities: [], catalogueHash });

const playback = (extra = {}) => ({ id: 'play', label: 'Play', type: 'playback', purpose: 'Run the motion and replay it.', selectionReason: 'Time explains the change, and the one supported transport drives every linked view.', nativeControlId: 'program.playback', binding: { kind: 'timeline' }, labels: { paused: 'Play', playing: 'Pause', ended: 'Replay' }, affects: affects(['main', 'entity', 'tossedBall'], ['main', 'entity', 'heldBall']), ...extra });
const scrubber = (label, extra = {}) => ({ id: 'scrub', label, type: 'scrubber', purpose: 'Inspect any instant of the motion.', selectionReason: 'A scrubber lets the learner stop on the instants the explanation compares.', nativeControlId: 'program.scrubber', binding: { kind: 'timeline' }, unit: 's', step: 0.01, affects: affects(['main', 'entity', 'tossedBall'], ['main', 'readout', 'tossedVelocity']), ...extra });

const tossedQuantities = [
  quantity('launchSpeed', 'Launch speed', 'm/s', 'Upward speed at the instant of the throw.', 'Measured at the launch mark, up is positive.'),
  quantity('gravity', 'Gravitational acceleration', 'm/s^2', 'Magnitude of the constant downward acceleration.', 'Idealized, no air resistance.'),
  quantity('velocity', 'Vertical velocity', 'm/s', 'Signed rate of change of height, up positive.', 'Zero at the apex.', 'v = launchSpeed - gravity * t'),
  quantity('acceleration', 'Vertical acceleration', 'm/s^2', 'Signed rate of change of velocity.', 'Constant -9.8 during free flight.'),
];

export async function interactFixtures() {
  const capabilities = await interactCapabilities({ renderers: ['spec', 'program'], stateful: true, componentControls: ['choice', 'bool', 'index', 'indices'], evidenceIds: ['kinematics_note'] });
  const h = capabilities.catalogueHash;
  const common = { schemaVersion: 1, assumptions: ['Constant downward acceleration of 9.8 m/s^2, no air resistance, up is positive.'], limitations: ['An idealized vertical throw; real balls feel drag.'] };

  const overview = {
    ...common, depth: 'overview',
    title: 'Is a ball at the top of a throw weightless?',
    story: 'Maya tossed a tennis ball straight up and swung too late. At the top it seemed to hang there. Her friend held a second ball at the same height and let go: it started from rest and fell. At the top of her throw the ball also had no velocity, and nothing was holding it up. Gravity had been slowing it on the way up and was now speeding it up on the way down.',
    cardDescription: 'A tossed ball at its top and a ball just released from rest are at the same height with zero velocity. Gravity pulls both down, so after 0.10 s each has moved 0.049 m.',
    learningGoal: 'Explain why a ball at the top of its throw still accelerates downward.',
    supportingVisuals: [],
    scene: {
      description: 'Two balls side by side at one shared height. The tossed ball has a faint trail from the launch mark; the released ball has an open gate around it. Gravity arrows point down on both and share one length scale.',
      runtime: specRuntime(h),
      entities: [entity('tossedBall', 'Tossed ball', 'The ball at the top of its throw.'), entity('releasedBall', 'Released ball', 'The ball just let go from rest.'), entity('gravityArrow', 'Gravity arrow', 'Shows the downward pull on each ball.')],
      quantities: [quantity('gravity', 'Gravitational acceleration', 'm/s^2', 'Magnitude of the constant downward acceleration.', 'Idealized, no air resistance.'), quantity('drop', 'Distance fallen in 0.10 s', 'm', 'How far each ball moves in 0.10 s from rest.', 'Measured down from the shared height.', 'drop = gravity * 0.10^2 / 2')],
      observations: [{ id: 'sameStart', text: 'Both balls have zero velocity and the same gravity arrow.', quantityIds: ['gravity'], readoutIds: [] }, { id: 'sameDrop', text: 'After 0.10 s each ball has moved 0.049 m down.', quantityIds: ['drop'], readoutIds: ['dropReadout'] }],
      checkpoints: [{ id: 'start', label: 'Start', time: null, inputOverrides: {}, actions: [], expected: 'Both balls are at rest at the same height.' }, { id: 'after', label: 'After 0.10 s', time: null, inputOverrides: {}, actions: [], expected: 'Both have moved 0.049 m down.' }],
      readoutIds: ['dropReadout'],
    },
    mode: { kind: 'static', initialState: 'Both balls shown at the shared height, velocity zero, gravity arrows down.', fixedValues: { gravity: G }, adjustableIds: [], timeline: null, onInputChange: 'recompute_still' },
    controls: [],
    claims: [{ id: 'dropClaim', text: 'Both balls fall 0.049 m in 0.10 s from zero velocity.', evidenceIds: ['kinematics_note'], check: 'Compute 9.8 * 0.10^2 / 2 and compare with the drawn offset.' }],
  };

  const threeMoments = {
    id: 'threeMoments', title: 'Three moments around the top', description: 'The tossed ball at 0.10 s before the top, at the top and 0.10 s after, up positive, on one shared height scale.',
    runtime: programRuntime(h), observations: [{ id: 'velocitiesFlip', text: 'Velocity reads +0.98, 0 and -0.98 m/s while acceleration stays -9.8 m/s^2.', quantityIds: [], readoutIds: ['velocityBefore', 'velocityTop', 'velocityAfter'] }],
    parameterBindings: [], readoutIds: ['velocityBefore', 'velocityTop', 'velocityAfter'],
  };
  const apex = bin('divide', lit(3), lit(G));
  const standard = {
    ...common, depth: 'standard',
    title: 'Zero velocity at the top is not zero acceleration',
    story: 'Maya tossed the ball up, waited for it to hang at the top, and swung. It had already dropped below her racket. If it stopped, how was it still accelerating? Her friend held a ball at shoulder height and let go. It began at zero velocity, and gravity immediately gave it downward speed. Her own ball had passed through the same moment. Three instants around the top: 0.10 s before, moving up at about 1 m/s; at the top, velocity zero; 0.10 s after, moving down at about 1 m/s. In each tenth of a second the velocity changed by about 1 m/s downward. Zero was one of the values it passed through.',
    cardDescription: 'A ball tossed at 3.0 m/s passes through zero velocity at its top, yet its acceleration stays -9.8 m/s^2 the whole time. Scrub through the top and watch the velocity change sign while the acceleration does not.',
    learningGoal: 'Explain why acceleration is not zero when velocity is zero at the top of a throw.',
    supportingVisuals: [threeMoments],
    scene: {
      description: 'A tossed ball rises from a launch mark and falls; a second ball is held by a release gate until the apex instant. Up is positive and both share one height scale. Velocity and acceleration arrows update with the scrubber.',
      runtime: programRuntime(h),
      entities: [entity('tossedBall', 'Tossed ball', 'Thrown up at 3.0 m/s.'), entity('heldBall', 'Held ball', 'Held by the gate until the apex instant, then released.'), entity('gate', 'Release gate', 'Supports the held ball until it opens.')],
      quantities: [...tossedQuantities, quantity('apexTime', 'Time of the apex', 's', 'Elapsed time at which velocity is zero.', 'Elapsed from launch.', 'apexTime = launchSpeed / gravity')],
      observations: [{ id: 'velocitySign', text: 'The velocity arrow shrinks to zero at the apex and then points down.', quantityIds: ['velocity'], readoutIds: ['tossedVelocity'] }, { id: 'accelerationConstant', text: 'The acceleration readout stays -9.8 m/s^2.', quantityIds: ['acceleration'], readoutIds: ['tossedAcceleration'] }],
      checkpoints: [
        { id: 'before', label: '0.10 s before the top', time: bin('subtract', apex, lit(0.1)), inputOverrides: {}, actions: [], expected: 'Velocity +0.98 m/s, acceleration -9.8 m/s^2, 0.049 m below the peak.' },
        { id: 'top', label: 'At the top', time: apex, inputOverrides: {}, actions: [], expected: 'Velocity 0, acceleration -9.8 m/s^2; the gate releases the held ball.' },
        { id: 'after', label: '0.10 s after the top', time: bin('add', apex, lit(0.1)), inputOverrides: {}, actions: [], expected: 'Velocity -0.98 m/s, acceleration -9.8 m/s^2, 0.049 m below the peak.' },
      ],
      readoutIds: ['tossedVelocity', 'tossedAcceleration'],
    },
    mode: {
      kind: 'time', initialState: 'Both balls at launch height at elapsed time 0, paused; the scrubber reads -0.306 s.', fixedValues: { launchSpeed: 3.0, gravity: G }, adjustableIds: [],
      timeline: {
        label: 'Time from the apex', unit: 's', start: 0, end: bin('divide', lit(6), lit(G)), displayOffset: bin('divide', lit(-3), lit(G)),
        markers: [{ id: 'before', label: '-0.10 s', time: bin('subtract', apex, lit(0.1)) }, { id: 'top', label: 'Top', time: apex }, { id: 'after', label: '+0.10 s', time: bin('add', apex, lit(0.1)) }],
        initialTime: 0, initialPlayback: 'paused', playbackRate: 0.1, // engineering pacing default: about 6.12 wall seconds
      },
      onInputChange: 'reset_pause',
    },
    controls: [playback(), scrubber('Time from the apex')],
    claims: [{ id: 'accelerationClaim', text: 'Acceleration is -9.8 m/s^2 at every instant of free flight, including the top.', evidenceIds: ['kinematics_note'], check: 'Differentiate v = u - g t: the slope is -g at every t.' }],
  };

  const compare = {
    id: 'comparePeaks', title: 'Compare the two peaks', description: 'The reference throw and the trial throw, each aligned at its own top, on one shared height scale.',
    runtime: programRuntime(h), observations: [{ id: 'nearPeaks', text: 'Within 0.20 s of its own peak each ball is within 0.049 m of it.', quantityIds: [], readoutIds: ['referenceOffset', 'trialOffset'] }],
    parameterBindings: [{ fromInputId: 'launchSpeed', toInputId: 'trialSpeed' }], readoutIds: ['referenceOffset', 'trialOffset', 'referencePeak', 'trialPeak'],
  };
  const deepEnd = bin('divide', bin('multiply', lit(2), inp('launchSpeed')), lit(G));
  const deep = {
    ...common, depth: 'deep',
    title: 'Does a faster throw change the motion around its peak?',
    story: 'Maya wanted to know how much time her eyes had actually seen at the top. Taking up as positive and t = 0 at the highest point, with no air resistance, her ball had acceleration -g, about -9.8 m/s^2, with no special case for the instant it stopped rising. Velocity and height followed v = -g t and y = y_top - g t^2 / 2. A tenth of a second either side of the top the ball was only 4.9 centimetres below it. Then she asked what a faster throw would change: the flight lasts 2u/g and the peak height is u^2 / (2g), but the shape of the motion around the peak is the same.',
    cardDescription: 'Change the launch speed from 3.0 to 5.0 m/s and replay. The flight lasts 2u/g and the peak rises as u squared, yet within 0.20 s of its own peak every throw stays within 0.049 m of that peak.',
    learningGoal: 'Predict how launch speed changes flight time and peak height, and explain why the motion near the peak does not change.',
    supportingVisuals: [compare],
    scene: {
      description: 'The reference throw at 3.0 m/s and the trial throw share one height axis and one time axis labelled Time since launch. The reference trace stops at its own return; both curves stay identifiable when the trial equals the reference.',
      runtime: programRuntime(h),
      entities: [entity('referenceBall', 'Reference ball', 'Thrown at 3.0 m/s, for comparison.'), entity('trialBall', 'Trial ball', 'Thrown at the chosen launch speed.')],
      quantities: [
        quantity('launchSpeed', 'Launch speed', 'm/s', 'Upward speed of the trial throw.', 'Up is positive.'),
        quantity('referenceLaunchSpeed', 'Reference launch speed', 'm/s', 'Upward speed of the reference throw.', 'Fixed at 3.0 m/s.'),
        quantity('gravity', 'Gravitational acceleration', 'm/s^2', 'Magnitude of the constant downward acceleration.', 'Idealized, no air resistance.'),
        quantity('flightTime', 'Time of flight', 's', 'Elapsed time from launch to return.', 'Elapsed from launch.', 'flightTime = 2 * launchSpeed / gravity'),
        quantity('peakHeight', 'Peak height', 'm', 'Greatest height above the launch mark.', 'Measured from the launch mark.', 'peakHeight = launchSpeed^2 / (2 * gravity)'),
      ],
      observations: [{ id: 'longerFlight', text: 'A faster throw lasts longer and peaks higher.', quantityIds: ['flightTime', 'peakHeight'], readoutIds: ['trialPeak'] }],
      checkpoints: [
        { id: 'launch', label: 'Launch', time: lit(0), inputOverrides: { launchSpeed: 5.0 }, actions: [], expected: 'Both balls at the launch mark.' },
        { id: 'trialTop', label: 'Trial top', time: bin('divide', inp('launchSpeed'), lit(G)), inputOverrides: {}, actions: [], expected: 'The trial ball is at its peak, u squared over 2g above the mark.' },
        { id: 'trialReturn', label: 'Trial return', time: deepEnd, inputOverrides: { launchSpeed: 5.0 }, actions: [], expected: 'The trial ball returns at 1.020 s.' },
        { id: 'referenceReturn', label: 'Reference return', time: deepEnd, inputOverrides: { launchSpeed: 3.0 }, actions: [], expected: 'At 3.0 m/s the flight ends at 0.612 s.' },
      ],
      readoutIds: ['trialPeak', 'trialTime'],
    },
    mode: {
      kind: 'experiment', initialState: 'Trial launch speed 5.0 m/s, paused at launch, time 0.', fixedValues: { referenceLaunchSpeed: 3.0, gravity: G }, adjustableIds: ['launchSpeed'],
      timeline: {
        label: 'Time since launch', unit: 's', start: 0, end: deepEnd, displayOffset: lit(0),
        markers: [{ id: 'trialTop', label: 'Trial top', time: bin('divide', inp('launchSpeed'), lit(G)) }],
        initialTime: 0, initialPlayback: 'paused', playbackRate: 0.2, // engineering pacing default: about 5.1 wall seconds at 5.0 m/s
      },
      onInputChange: 'reset_pause',
    },
    controls: [
      playback({ affects: affects(['main', 'entity', 'trialBall'], ['main', 'entity', 'referenceBall']) }),
      scrubber('Time since launch', { affects: affects(['main', 'entity', 'trialBall'], ['main', 'readout', 'trialTime']) }),
      { id: 'speed', label: 'Launch speed', type: 'number', purpose: 'Test whether a higher throw changes motion around its own peak.', selectionReason: 'The quantity varies continuously and intermediate speeds teach the pattern; two named cases would hide it.', nativeControlId: 'program.number', binding: { kind: 'input', id: 'launchSpeed' }, unit: 'm/s', default: 5.0, min: 3.0, max: 5.0, step: 0.1, affects: affects(['main', 'quantity', 'flightTime'], ['main', 'quantity', 'peakHeight'], ['comparePeaks', 'readout', 'trialOffset']) },
      { id: 'resetAll', label: 'Reset experiment', type: 'reset', purpose: 'Return to the reference defaults.', selectionReason: 'Replay keeps the speed; Reset restores 5.0 m/s so the learner can start over.', nativeControlId: 'program.reset', binding: { kind: 'reset' }, effect: 'Restores launch speed 5.0 m/s, time 0 and paused.', affects: affects(['main', 'quantity', 'launchSpeed']) },
    ],
    claims: [{ id: 'flightClaim', text: 'The flight lasts 2u/g and the peak height is u^2 / (2g).', evidenceIds: ['kinematics_note'], check: 'Solve y = u t - g t^2 / 2 = 0 and maximize y.' }],
  };

  const untimedExperiment = {
    ...common, depth: 'standard',
    title: 'How does peak height depend on launch speed?',
    story: 'Maya threw a ball at different speeds and watched where each one stopped rising. A ball thrown twice as fast went four times as high, because the height gained before gravity stops the ball grows with the square of the launch speed.',
    cardDescription: 'Move the launch speed and see where the ball stops rising. Doubling the speed quadruples the peak height.',
    learningGoal: 'Predict how peak height changes when launch speed changes.',
    supportingVisuals: [],
    scene: {
      description: 'A vertical height axis in metres with one ball drawn at its peak for the chosen launch speed and a dotted line at that height.',
      runtime: { ...programRuntime(h), requiredCapabilities: ['number_inputs'] },
      entities: [entity('ball', 'Ball', 'Drawn at its peak height.')],
      quantities: [quantity('launchSpeed', 'Launch speed', 'm/s', 'Upward speed at launch.', 'Up is positive.'), quantity('gravity', 'Gravitational acceleration', 'm/s^2', 'Magnitude of the constant downward acceleration.', 'Idealized.'), quantity('peakHeight', 'Peak height', 'm', 'Height gained before the ball stops rising.', 'Measured from the launch mark.', 'peakHeight = launchSpeed^2 / (2 * gravity)')],
      observations: [{ id: 'quadruple', text: 'Doubling the launch speed quadruples the peak height.', quantityIds: ['peakHeight'], readoutIds: ['peakReadout'] }],
      checkpoints: [{ id: 'slow', label: 'Slow throw', time: null, inputOverrides: { launchSpeed: 1.0 }, actions: [], expected: 'Peak about 0.05 m.' }, { id: 'fast', label: 'Fast throw', time: null, inputOverrides: { launchSpeed: 5.0 }, actions: [], expected: 'Peak about 1.28 m.' }],
      readoutIds: ['peakReadout'],
    },
    mode: { kind: 'experiment', initialState: 'Launch speed 3.0 m/s, ball drawn at its peak of 0.46 m.', fixedValues: { gravity: G }, adjustableIds: ['launchSpeed'], timeline: null, onInputChange: 'recompute_still' },
    controls: [
      { id: 'speed', label: 'Launch speed', type: 'number', purpose: 'See how peak height responds to launch speed.', selectionReason: 'A continuous range shows the squared relationship; a few presets would not.', nativeControlId: 'program.number', binding: { kind: 'input', id: 'launchSpeed' }, unit: 'm/s', default: 3.0, min: 1.0, max: 5.0, step: 0.5, affects: affects(['main', 'quantity', 'peakHeight'], ['main', 'readout', 'peakReadout']) },
      { id: 'resetAll', label: 'Reset experiment', type: 'reset', purpose: 'Return to 3.0 m/s.', selectionReason: 'One step back to the starting speed.', nativeControlId: 'program.reset', binding: { kind: 'reset' }, effect: 'Restores launch speed 3.0 m/s.', affects: affects(['main', 'quantity', 'launchSpeed']) },
    ],
    claims: [],
  };

  const staticAdjustable = {
    ...common, depth: 'overview',
    title: 'Three moments of one throw',
    story: 'Maya looked at one throw at three moments: just before the top, at the top and just after. At each moment she asked which way the ball was moving and which way gravity pulled.',
    cardDescription: 'Choose a moment of the throw to see the velocity and the gravity arrow. Velocity changes direction; gravity does not.',
    learningGoal: 'Say which way velocity and gravity point at three moments of a throw.',
    supportingVisuals: [],
    scene: {
      description: 'One ball on a height axis at the chosen moment, with a velocity arrow and a gravity arrow drawn on the same scale.',
      runtime: specRuntime(h),
      entities: [entity('ball', 'Ball', 'Shown at the chosen moment.'), entity('velocityArrow', 'Velocity arrow', 'Shows the direction and size of the velocity.'), entity('gravityArrow', 'Gravity arrow', 'Shows the downward pull.')],
      quantities: [quantity('velocity', 'Vertical velocity', 'm/s', 'Signed rate of change of height, up positive.', 'Zero at the top.')],
      observations: [{ id: 'arrows', text: 'The velocity arrow flips from up to down while the gravity arrow stays down.', quantityIds: ['velocity'], readoutIds: [] }],
      checkpoints: [{ id: 'before', label: 'Before the top', time: null, inputOverrides: { moment: 'before' }, actions: [], expected: 'Velocity arrow up, gravity arrow down.' }, { id: 'after', label: 'After the top', time: null, inputOverrides: { moment: 'after' }, actions: [], expected: 'Velocity arrow down, gravity arrow down.' }],
      readoutIds: [],
    },
    mode: { kind: 'static', initialState: 'The moment is At the top: no velocity arrow, gravity arrow down.', fixedValues: {}, adjustableIds: ['moment'], timeline: null, onInputChange: 'recompute_still' },
    controls: [{ id: 'moment', label: 'Moment', type: 'select', purpose: 'Compare the three named moments.', selectionReason: 'Three named cases are clearer as choices than as a continuous slider.', nativeControlId: 'spec.select', binding: { kind: 'input', id: 'moment' }, default: 'top', options: [{ value: 'before', label: 'Before the top' }, { value: 'top', label: 'At the top' }, { value: 'after', label: 'After the top' }], affects: affects(['main', 'entity', 'ball'], ['main', 'entity', 'velocityArrow']) }],
    claims: [],
  };

  // The Overview as a static PROGRAM scene (I3): the same teaching, built through the runtime that can be delivered end to end today. `overview` above keeps the
  // declarative renderer for the plan and catalogue tests; a composed card with a declarative panel is not wired yet (interact-job.js undeliverable).
  const overviewProgram = {
    ...overview,
    scene: {
      ...overview.scene,
      description: 'Two balls side by side at one shared height, each drawn again 0.049 m lower. Gravity arrows point down on both and share one length scale; the tossed ball is at its top, the other has just been released.',
      runtime: { ...programRuntime(h), requiredCapabilities: [] },
    },
  };

  // A different subject (I3): the period of a simple pendulum, an untimed Experiment through the same job, runner and card as the toss-and-drop. T = 2 pi sqrt(L / g) for
  // small swings; the string length is the one adjustable input.
  const pendulum = {
    ...common, depth: 'standard',
    title: 'Does a longer pendulum swing more slowly?',
    story: 'Maya hung her house key from a string and let it swing a little. She wondered whether a longer string would make each swing slower, and by how much. For small swings the time of one full swing, the period, is two pi times the square root of the string length divided by g. So a string four times as long takes twice as long, not four times as long. The weight of the key does not appear at all.',
    cardDescription: 'Change the string length and read how long one full swing takes. A string four times as long swings twice as slowly, because the period grows with the square root of the length.',
    learningGoal: 'Predict how the period of a pendulum changes when its string is made longer.',
    supportingVisuals: [],
    scene: {
      description: 'A weight on a string hangs from a fixed pivot and is drawn at the top of a small swing. The string is drawn to scale with the chosen length, and the period is written beside it.',
      runtime: { ...programRuntime(h), requiredCapabilities: [] },
      entities: [entity('weight', 'Weight', 'The key at the end of the string.'), entity('string', 'String', 'Drawn to scale with the chosen length.')],
      quantities: [quantity('length', 'String length', 'm', 'Distance from the pivot to the weight.', 'Measured down from the pivot.'), quantity('gravity', 'Gravitational acceleration', 'm/s^2', 'Magnitude of the constant downward acceleration.', 'Idealized.'), quantity('period', 'Period', 's', 'Time of one full swing, out and back.', 'Small swings only.', 'period = 2 * pi * sqrt(length / gravity)')],
      observations: [{ id: 'slowerWhenLonger', text: 'A longer string gives a longer period.', quantityIds: ['period'], readoutIds: ['periodReadout'] }],
      checkpoints: [{ id: 'short', label: 'Short string', time: null, inputOverrides: { length: 0.25 }, actions: [], expected: 'Period about 1.00 s.' }, { id: 'long', label: 'Long string', time: null, inputOverrides: { length: 1.0 }, actions: [], expected: 'Period about 2.01 s, twice the short string.' }],
      readoutIds: ['periodReadout'],
    },
    mode: { kind: 'experiment', initialState: 'String length 0.50 m, the weight at the top of a small swing, period about 1.42 s.', fixedValues: { gravity: G }, adjustableIds: ['length'], timeline: null, onInputChange: 'recompute_still' },
    controls: [
      { id: 'length', label: 'String length', type: 'number', purpose: 'See how the period responds to the string length.', selectionReason: 'The length varies continuously and the square-root pattern needs intermediate values; two presets would hide it.', nativeControlId: 'program.number', binding: { kind: 'input', id: 'length' }, unit: 'm', default: 0.5, min: 0.25, max: 1.0, step: 0.05, affects: affects(['main', 'quantity', 'period'], ['main', 'readout', 'periodReadout']) },
      { id: 'resetAll', label: 'Reset experiment', type: 'reset', purpose: 'Return to a 0.50 m string.', selectionReason: 'One step back to the starting length.', nativeControlId: 'program.reset', binding: { kind: 'reset' }, effect: 'Restores string length 0.50 m.', affects: affects(['main', 'quantity', 'length']) },
    ],
    claims: [],
  };

  return { capabilities, plans: { overview, overviewProgram, standard, deep, untimedExperiment, staticAdjustable, pendulum } };
}
