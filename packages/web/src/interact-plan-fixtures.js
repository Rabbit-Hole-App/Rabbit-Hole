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
const propsTuple = SUPPORTED_PROGRAM_TUPLES.find(t => t.schemaVersion === 1 && t.sdkVersion === 'sdk-7');

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
  // The three reference plans carry an At top (seek) control, which the catalogue offers only when seek is enabled (a different catalogue hash): they are returned apart, with the capabilities they were designed against, so the older plans and their tests keep their own.
  const referenceCapabilities = await interactCapabilities({ renderers: ['spec', 'program'], stateful: true, componentControls: ['choice', 'bool', 'index', 'indices'], evidenceIds: ['kinematics_note'], seek: true });
  const common = { schemaVersion: 1, assumptions: ['Constant downward acceleration of 9.8 m/s^2, no air resistance, up is positive.'], limitations: ['An idealized vertical throw; real balls feel drag.'] };

  const overview = {
    ...common, depth: 'brief',
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
    ...common, depth: 'balanced',
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
    ...common, depth: 'detailed',
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
    ...common, depth: 'balanced',
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
    ...common, depth: 'brief',
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
    ...common, depth: 'balanced',
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

  // The Standard toss-and-drop as one Experiment card (owner 2026-11-12, design-pin fixture "toss-drop-standard-controls"): the main scene only, with the launch speed and the arrows as
  // controls. Derived from `standard`, which stays untouched. The Show arrows switch is a two-option select because the program renderer has no native Boolean switch (section 4).
  const liveApex = bin('divide', inp('launchSpeed'), lit(G)), liveEnd = bin('divide', bin('multiply', lit(2), inp('launchSpeed')), lit(G));
  const standardControls = {
    ...standard,
    title: 'Zero velocity at the top is not zero acceleration',
    story: 'Maya tossed the ball up, waited for it to hang at the top, and swung. It had already dropped below her racket. If it stopped, how was it still accelerating? Her friend held a ball at shoulder height and let go. It began at zero velocity, and gravity immediately gave it downward speed. Her own ball had passed through the same moment. She tossed it faster, from 3.0 up to 5.0 m/s: the top came later and higher, but at the top the velocity was always zero and the acceleration was still 9.8 m/s^2 downward. Zero was one of the values the velocity passed through; the acceleration never changed.',
    cardDescription: 'Toss a ball up at 3.0 to 5.0 m/s. At its top the velocity is zero, yet the acceleration stays -9.8 m/s^2 at every launch speed. No air resistance.',
    learningGoal: 'Explain why acceleration is not zero when velocity is zero at the top of a throw, at any launch speed.',
    supportingVisuals: [],
    scene: {
      ...standard.scene,
      // The physical-props SDK (sdk-7, capability props): sdk.vector, sdk.gate and sdk.groundMark are offered to the builder for this card.
      runtime: { ...programRuntime(h), sdkVersion: propsTuple.sdkVersion, programTuple: propsTuple, requiredCapabilities: ['time_playback', 'props'] },
      description: 'A tossed ball rises from a launch mark and falls; a second ball is held by a release gate until the apex instant. Up is positive and both share one height scale. A velocity arrow and an acceleration arrow sit on each ball and update with the scrubber; the launch speed moves the apex.',
      entities: [...standard.scene.entities, entity('velocityArrow', 'Velocity arrow', 'Shows the signed velocity of each ball; shrinks to a dot at the top.'), entity('accelerationArrow', 'Acceleration arrow', 'Shows the constant -9.8 m/s^2 on each ball.')],
      quantities: [...standard.scene.quantities, quantity('height', 'Height of the tossed ball', 'm', 'Height of the tossed ball above the launch mark.', 'Measured from the launch mark, up is positive.', 'height = launchSpeed * t - gravity * t^2 / 2')],
      observations: [...standard.scene.observations, { id: 'apexMoves', text: 'A faster throw reaches its top later and higher; at the top the velocity reads zero and the acceleration still reads -9.8 m/s^2.', quantityIds: ['apexTime', 'velocity'], readoutIds: ['tossedVelocity', 'tossedHeight'] }],
      // The top comes first: a boundary value of Launch speed is captured at the first checkpoint that references it, so the maximum speed is shown at its own top (interact-checks.js buildPlanCaptureCases).
      checkpoints: [
        { id: 'top', label: 'At the top', time: liveApex, inputOverrides: {}, actions: [], expected: 'Velocity 0, acceleration -9.8 m/s^2; the gate releases the held ball.' },
        { id: 'before', label: '0.10 s before the top', time: bin('subtract', liveApex, lit(0.1)), inputOverrides: {}, actions: [], expected: 'Velocity +0.98 m/s, acceleration -9.8 m/s^2, 0.049 m below the peak.' },
        { id: 'after', label: '0.10 s after the top', time: bin('add', liveApex, lit(0.1)), inputOverrides: {}, actions: [], expected: 'Velocity -0.98 m/s, acceleration -9.8 m/s^2, 0.049 m below the peak.' },
      ],
      readoutIds: ['tossedHeight', 'tossedVelocity', 'tossedAcceleration'],
    },
    mode: {
      kind: 'experiment', initialState: 'Launch speed 3.0 m/s, arrows on; both balls at launch height at elapsed time 0, paused; the scrubber reads -0.306 s.', fixedValues: { gravity: G }, adjustableIds: ['launchSpeed', 'showArrows'],
      timeline: {
        label: 'Time from the top', unit: 's', start: 0, end: liveEnd, displayOffset: bin('multiply', lit(-1), liveApex),
        markers: [{ id: 'before', label: '-0.10 s', time: bin('subtract', liveApex, lit(0.1)) }, { id: 'top', label: 'Top', time: liveApex }, { id: 'after', label: '+0.10 s', time: bin('add', liveApex, lit(0.1)) }],
        initialTime: 0, initialPlayback: 'paused', playbackRate: 0.1, // engineering pacing default: about 6.1 wall seconds at 3.0 m/s, 10.2 s at 5.0 m/s
      },
      onInputChange: 'reset_pause',
    },
    controls: [
      playback({ affects: affects(['main', 'entity', 'tossedBall'], ['main', 'entity', 'heldBall']) }),
      scrubber('Time from the top', { affects: affects(['main', 'entity', 'tossedBall'], ['main', 'readout', 'tossedVelocity']) }),
      { id: 'speed', label: 'Launch speed', type: 'number', purpose: 'Test whether the acceleration at the top depends on how fast the ball was thrown.', selectionReason: 'The speed varies continuously and intermediate speeds show that the top moves while the acceleration does not; two named cases would hide that.', nativeControlId: 'program.number', binding: { kind: 'input', id: 'launchSpeed' }, unit: 'm/s', default: 3.0, min: 3.0, max: 5.0, step: 0.1, affects: affects(['main', 'entity', 'tossedBall'], ['main', 'quantity', 'apexTime'], ['main', 'readout', 'tossedHeight'], ['main', 'readout', 'tossedVelocity']) },
      { id: 'arrows', label: 'Show arrows', type: 'select', purpose: 'Hide the velocity and acceleration arrows to read the motion from the balls and the readouts alone.', selectionReason: 'Two named states, on and off, are clearer as choice buttons than a slider; the program renderer has no native Boolean switch, so the planned two-option select is used (section 4).', nativeControlId: 'program.select', binding: { kind: 'input', id: 'showArrows' }, default: 'on', options: [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }], affects: affects(['main', 'entity', 'velocityArrow'], ['main', 'entity', 'accelerationArrow']) },
    ],
    claims: [...standard.claims, { id: 'accelerationAnySpeed', text: 'The acceleration readout stays -9.8 m/s^2 at every launch speed from 3.0 to 5.0 m/s, including at the top.', evidenceIds: ['kinematics_note'], check: 'v = u - g t has slope -g for every u, so a = -g whatever the launch speed.' }],
  };

  return { capabilities, plans: { overview, overviewProgram, standard, standardControls, deep, untimedExperiment, staticAdjustable, pendulum }, referenceCapabilities, referencePlans: tossReferencePlans(referenceCapabilities.catalogueHash) };
}

// ---- The three reference toss-and-drop cards (owner 2026-11-13) ---------------------------------------------------------------------------------------------------------------
// toss-overview / toss-standard / toss-deep are built from the Mode, What-the-scene-shows and Controls columns of the three rows of
// docs/features/interact/references/tutor-scene-examples.md and the HTML references beside it. All three are mode Interact with ONE program frame (Standard's two lanes and
// Deep's graph are inside the main frame; no supporting panels). Controls exactly as the references: launch speed 2.0-5.0 default 4.0 step 0.1 (all), gravity 6.0-12.0 default 9.8
// step 0.1 (Standard, Deep), mass 0.2-3.0 default 1.0 step 0.1 (Deep). Gravity is fixed at 9.8 on the Overview. Playback is 0.2x; playback pauses at the markers marked pause.
// The Deep mass changes force only (recompute_still: it pauses at the same time, position and velocity kept); everything else returns to launch, paused (reset_pause).
// The fixtures' numbers are the ones a builder must reproduce; interact-oracle.js computes them from the equations (never from this file).
const sdk8 = SUPPORTED_PROGRAM_TUPLES.find(t => t.schemaVersion === 1 && t.sdkVersion === 'sdk-8');
const tossRuntime = catalogueHash => ({ renderer: 'program', schemaVersion: sdk8.schemaVersion, sdkVersion: sdk8.sdkVersion, programTuple: sdk8, requiredHelpers: [], requiredCapabilities: ['time_playback', 'number_inputs', 'props', 'figures'], catalogueHash });
const tossCommon = { schemaVersion: 1, supportingVisuals: [], limitations: ['An idealized vertical throw; real balls feel drag.'] };
const speedExpr = inp('launchSpeed'), gravityExpr = inp('gravity');
const topOf = gravity => bin('divide', speedExpr, gravity), flightOf = gravity => bin('divide', bin('multiply', lit(2), speedExpr), gravity);
const around = (gravity, dt) => bin(dt < 0 ? 'subtract' : 'add', topOf(gravity), lit(Math.abs(dt)));
const tossControls = (extra, ids) => ({ affects: affects(...ids), ...extra });
const speedControl = (ids, onChange = 'reset_pause') => tossControls({ id: 'speed', label: 'Launch speed', type: 'number', purpose: 'See how the speed of the toss moves the top without changing what gravity does there.', selectionReason: 'The speed varies continuously and intermediate speeds show that the top moves while the pull does not; two named cases would hide that.', nativeControlId: 'program.number', binding: { kind: 'input', id: 'launchSpeed' }, unit: 'm/s', default: 4.0, min: 2.0, max: 5.0, step: 0.1, onChange }, ids);
const gravityControl = ids => tossControls({ id: 'gravityControl', label: 'Gravity', type: 'number', purpose: 'See that a different gravity changes the acceleration and the time to the top, not the idea.', selectionReason: 'Gravity varies continuously and the learner can compare nearby values; two planets would hide that.', nativeControlId: 'program.number', binding: { kind: 'input', id: 'gravity' }, unit: 'm/s^2', default: 9.8, min: 6.0, max: 12.0, step: 0.1, onChange: 'reset_pause' }, ids);
const massControl = ids => tossControls({ id: 'massControl', label: 'Mass', type: 'number', purpose: 'See that mass changes the force of gravity and leaves the acceleration and the motion unchanged.', selectionReason: 'The mass varies continuously, and the learner changes it while paused at the top to compare force and acceleration at the same instant.', nativeControlId: 'program.number', binding: { kind: 'input', id: 'mass' }, unit: 'kg', default: 1.0, min: 0.2, max: 3.0, step: 0.1, onChange: 'recompute_still' }, ids);
const seekTop = (markerId, ids) => tossControls({ id: 'atTop', label: 'At top', type: 'seek', purpose: 'Jump to the top of the toss and pause there.', selectionReason: 'The top is the one instant the explanation is about; a button reaches it exactly, which dragging the scrubber does not.', nativeControlId: 'program.seek', binding: { kind: 'marker', id: markerId }, effect: 'Seeks the top marker and pauses.' }, ids);
const resetTo = (effect, ids) => tossControls({ id: 'resetAll', label: 'Reset experiment', type: 'reset', purpose: 'Return to the defaults.', selectionReason: 'Replay keeps the settings; Reset restores them so the learner can start over.', nativeControlId: 'program.reset', binding: { kind: 'reset' }, effect }, ids);
const apexQuantities = [
  quantity('apexTime', 'Time of the top', 's', 'Elapsed time from launch at which the velocity is zero.', 'Elapsed from launch.', 'apexTime = launchSpeed / gravity'),
  quantity('apexHeight', 'Height of the top', 'm', 'Height of the ball at its top above the launch mark.', 'Measured from the launch mark, up is positive.', 'apexHeight = launchSpeed^2 / (2 * gravity)'),
];
const launchSpeedQuantity = quantity('launchSpeed', 'Launch speed', 'm/s', 'Upward speed at the instant of the throw.', 'Measured at the launch mark, up is positive.');
const gravityQuantity = quantity('gravity', 'Gravitational acceleration', 'm/s^2', 'Magnitude of the constant downward acceleration.', 'Idealized, no air resistance.');

function tossReferencePlans(h) {
  const runtime = tossRuntime(h);
  const timeline = (label, end, displayOffset, markers) => ({ label, unit: 's', start: 0, end, displayOffset, markers, initialTime: 0, initialPlayback: 'paused', playbackRate: 0.2 });

  // ---- Overview (brief): one moving ball, one parameter ----
  const g = lit(G), apex = topOf(g);
  const tossOverview = {
    ...tossCommon, depth: 'brief',
    title: 'The ball stops rising. Gravity doesn’t stop.',
    story: 'Maya tossed a tennis ball straight up for a serve. It seemed to hang above her. She swung and missed.\n\n"I thought it was waiting up there," she said.\n\nShe tossed it again and watched. The ball rose more slowly, stopped for an instant at the top, and then started down.\n\n"If it stopped, why did it come back down?"\n\nAt the top of the throw, the ball had stopped moving upward. For that instant its velocity was zero. But nothing was holding it up.\n\nGravity was still pulling down. It had slowed the ball on the way up, and now it was speeding it up on the way down.\n\nOn her next toss, Maya started her swing a little earlier. This time she heard the ball pop against the strings.',
    cardDescription: 'Gravity slows the ball on the way up and speeds it up on the way down. At the top, the ball is still for an instant. Gravity is already pulling it downward.',
    instructions: 'Change launch speed, then press Play. At the top, playback pauses so you can inspect the arrows. Press Play again to watch the ball fall, or drag the timeline to inspect any moment.',
    learningGoal: 'Say that gravity still pulls the ball down at the top of its throw, where it is still for an instant.',
    scene: {
      description: 'One moving ball on a fixed height scale with a launch-height guide; the scale does not change with the launch speed, so a faster toss visibly rises higher. A blue Motion arrow beside the ball shortens on the way up, is absent at the top and points down on the way back. A separate dashed warm gravity arrow keeps the same direction and length throughout. Beside the ball a callout (frame object id callout.toss) reads Moving up, Still for an instant or Moving down, with Gravity pulls down always shown. The scene starts at launch and runs the whole rise and fall. No second ball, graph, equation, number readout or comparison strip.',
      runtime,
      entities: [entity('ball', 'Ball', 'The tossed ball (frame object id ball.toss), an SVG glyph that starts at the launch mark.'), entity('motionArrow', 'Motion arrow', 'Blue arrow showing the signed velocity (frame object id vec.v, labelled v); absent at the top.'), entity('gravityArrow', 'Gravity arrow', 'Dashed warm arrow (frame object id vec.a, labelled a), the same downward length throughout.'), entity('heightGuide', 'Launch-height guide', 'A fixed guide at the launch height on one height scale.')],
      quantities: [launchSpeedQuantity, gravityQuantity, ...apexQuantities,
        quantity('velocity', 'Vertical velocity', 'm/s', 'Signed rate of change of height, up positive.', 'Zero at the top.', 'velocity = launchSpeed - gravity * t'),
        quantity('height', 'Height of the ball', 'm', 'Height above the launch mark.', 'Measured from the launch mark, up is positive.', 'height = launchSpeed * t - gravity * t^2 / 2')],
      observations: [
        { id: 'motionArrow', text: 'The Motion arrow shortens while the ball rises, is absent at the top and points down while it falls.', quantityIds: ['velocity'], readoutIds: ['motionState'] },
        { id: 'gravityConstant', text: 'The gravity arrow keeps the same direction and length, so gravity pulls down at the top too.', quantityIds: [], readoutIds: ['gravityState'] },
        { id: 'fasterHigher', text: 'A faster toss reaches its top later and higher on the same fixed height scale.', quantityIds: ['apexTime', 'apexHeight'], readoutIds: [] },
      ],
      checkpoints: [
        { id: 'rising', label: 'Rising', time: bin('multiply', lit(0.5), apex), inputOverrides: {}, actions: [], expected: 'Moving up at 2.0 m/s: a short blue Motion arrow up, gravity arrow down.' },
        { id: 'top', label: 'At the top', time: apex, inputOverrides: {}, actions: [], expected: 'Still for an instant at 0.408 s and 0.816 m: no Motion arrow, gravity arrow still down; playback pauses here.' },
        { id: 'falling', label: 'Falling', time: bin('multiply', lit(1.5), apex), inputOverrides: {}, actions: [], expected: 'Moving down at 2.0 m/s: a short blue Motion arrow down, gravity arrow down.' },
        { id: 'fastTop', label: 'Fastest toss at its top', time: apex, inputOverrides: { launchSpeed: 5.0 }, actions: [], expected: 'At 5.0 m/s the top comes at 0.510 s and 1.276 m, higher on the same height scale.' },
      ],
      readoutIds: ['motionState', 'gravityState'],
    },
    mode: {
      kind: 'experiment', initialState: 'Launch speed 4.0 m/s; the ball at the launch mark, time 0.000 s, paused.', fixedValues: { gravity: G }, adjustableIds: ['launchSpeed'],
      timeline: timeline('Time since launch', flightOf(g), lit(0), [{ id: 'top', label: 'Top', time: apex, pause: true }]), // 0.2x physical time: 2.04 wall seconds to the top at 4.0 m/s
      onInputChange: 'reset_pause',
    },
    controls: [
      playback({ affects: affects(['main', 'entity', 'ball']) }),
      scrubber('Time since launch', { affects: affects(['main', 'entity', 'ball'], ['main', 'readout', 'motionState']) }),
      speedControl([['main', 'entity', 'ball'], ['main', 'quantity', 'apexTime'], ['main', 'quantity', 'apexHeight']]),
      seekTop('top', [['main', 'entity', 'ball'], ['main', 'readout', 'motionState']]),
      resetTo('Restores launch speed 4.0 m/s, time 0 and paused.', [['main', 'quantity', 'launchSpeed']]),
    ],
    claims: [{ id: 'gravityAtTop', text: 'At the top the velocity is zero and the acceleration is still 9.8 m/s^2 downward, so gravity keeps pulling.', evidenceIds: ['kinematics_note'], check: 'Differentiate v = u - g t: the slope is -g at every t, including the top.' }],
    assumptions: ['Gravity fixed at 9.8 m/s^2, no air resistance, up is positive.'],
  };

  // ---- Standard (balanced): toss and drop, two parameters ----
  const flight = flightOf(gravityExpr), top = topOf(gravityExpr);
  const tossStandard = {
    ...tossCommon, depth: 'balanced',
    title: 'Zero velocity isn’t zero acceleration.',
    story: 'Maya tossed the ball straight up, waited for it to hang at the top, and swung. By then it had dropped below her racket.\n\n"I don\'t get it," she said. "If it stopped, how was it still accelerating?"\n\nHer friend picked up the ball and held it at shoulder height. "Watch what happens the moment I let go."\n\nHe opened his fingers. The ball began to fall. It started with zero velocity, and gravity immediately began giving it downward speed.\n\nMaya looked up. Her own ball had passed through that same moment. The difference was how it got there. Her hand had sent it upward, and gravity had been slowing its climb from the moment it left her fingers.\n\nShe pictured three instants around the top. A tenth of a second before, it was moving up at about a metre per second. At the top, its velocity was zero. A tenth of a second later, it was moving down at about a metre per second.\n\nVelocity tells you how fast something is moving and which way. Acceleration tells you how quickly that velocity changes. In each tenth of a second, the ball\'s velocity changed by about one metre per second downward. Zero was one of the values it passed through.\n\nMaya took another ball. She began her swing while it was still climbing and met it as it came down. This one cleared the net.',
    cardDescription: 'At the top, velocity is zero for an instant, but gravity keeps changing it: $a = -g$. The gate releases a second ball at that moment. Both then fall together from rest. No air resistance.',
    instructions: 'Change launch speed or gravity, then press Play. At each pause, compare velocity and acceleration. Press Play again to continue, or drag the timeline. At top jumps to the shared release.',
    learningGoal: 'Explain why the acceleration is not zero at the top, where the velocity is zero, by comparing the tossed ball with a ball released from rest.',
    scene: {
      description: 'Two equal-width lanes side by side in one frame: a pale blue Toss lane (frame object id lane.toss) and a pale orange Drop lane (lane.drop), each with a heading and a state line (Toss: At launch, Rising, At the top, Falling, At launch height; Drop: Held in place, Just released, Falling together, At launch height). Both use the same fixed 0 to 2.2 m height scale and the same velocity-arrow and acceleration-arrow scales; zero height is the launch mark, up is positive. A release gate at the apex height holds the second ball (velocity and acceleration zero) until the top, then opens. Each ball (ball.toss, ball.drop) has a blue velocity arrow (vec.v.toss, vec.v.drop) on one side and a dashed warm acceleration arrow (vec.a.toss, vec.a.drop) on the other, and a callout (callout.toss, callout.drop) of two readings: v in m/s and a in m/s^2. After release faint outlines keep the shared starting height. No graph, no mass control, no snapshot strip.',
      runtime,
      entities: [entity('tossedBall', 'Tossed ball', 'The ball thrown upward from the launch mark in the Toss lane (frame object id ball.toss).'), entity('dropBall', 'Dropped ball', 'The second ball in the Drop lane (frame object id ball.drop), held by the gate until the top.'), entity('gate', 'Release gate', 'Holds the second ball at the apex height, opens at the top.'), entity('velocityArrow', 'Velocity arrow', 'Blue arrow with the signed velocity of each ball (frame object ids vec.v.toss, vec.v.drop).'), entity('accelerationArrow', 'Acceleration arrow', 'Dashed warm arrow with the net acceleration of each ball (frame object ids vec.a.toss, vec.a.drop).')],
      quantities: [launchSpeedQuantity, quantity('gravity', 'Gravitational acceleration', 'm/s^2', 'Magnitude of the constant downward acceleration, the same for both balls.', 'Idealized, no air resistance.'), ...apexQuantities,
        quantity('tossedVelocity', 'Toss velocity', 'm/s', 'Signed velocity of the tossed ball, up positive.', 'Zero at the top.', 'tossedVelocity = launchSpeed - gravity * t'),
        quantity('tossedAcceleration', 'Toss acceleration', 'm/s^2', 'Net acceleration of the tossed ball.', 'Constant -gravity during flight.'),
        quantity('tossedHeight', 'Toss height', 'm', 'Height of the tossed ball above the launch mark.', 'Measured from the launch mark, up is positive.', 'tossedHeight = launchSpeed * t - gravity * t^2 / 2'),
        quantity('dropVelocity', 'Drop velocity', 'm/s', 'Signed velocity of the second ball: zero while held, then -gravity * (time from the top).', 'Up is positive.'),
        quantity('dropAcceleration', 'Drop acceleration', 'm/s^2', 'Net acceleration of the second ball: zero while the gate holds it, -gravity after release.', 'Up is positive.'),
        quantity('dropHeight', 'Drop height', 'm', 'Height of the second ball: the apex height while held, then equal to the tossed ball.', 'Measured from the launch mark, up is positive.')],
      observations: [
        { id: 'velocityFlips', text: 'The toss velocity reads +0.98, 0.00 and -0.98 m/s at -0.10, 0 and +0.10 s from the top at 9.8 m/s^2.', quantityIds: ['tossedVelocity'], readoutIds: ['tossedVelocity'] },
        { id: 'accelerationConstant', text: 'The toss acceleration stays at -gravity (-9.8 m/s^2 by default) at every instant, including the top.', quantityIds: ['tossedAcceleration'], readoutIds: ['tossedAcceleration'] },
        { id: 'sameAfterRelease', text: 'After the release the dropped ball has the same height, velocity and acceleration as the tossed ball at every shared instant.', quantityIds: ['tossedHeight', 'dropVelocity', 'dropHeight'], readoutIds: ['dropVelocity', 'dropAcceleration'] },
        { id: 'topMoves', text: 'A faster toss or a weaker gravity moves the top later and higher; the readings at the top do not change.', quantityIds: ['apexTime', 'apexHeight'], readoutIds: [] },
      ],
      checkpoints: [
        { id: 'before', label: '0.10 s before the top', time: around(gravityExpr, -0.1), inputOverrides: {}, actions: [], expected: 'Toss +0.98 m/s with acceleration -9.8 m/s^2; the second ball is held, v 0.00 and a 0.0.' },
        { id: 'top', label: 'At the top', time: top, inputOverrides: {}, actions: [], expected: 'Toss 0.00 m/s with acceleration -9.8 m/s^2; the gate opens and the second ball is released at 0.00 m/s.' },
        { id: 'after', label: '0.10 s after the top', time: around(gravityExpr, 0.1), inputOverrides: {}, actions: [], expected: 'Both balls -0.98 m/s with acceleration -9.8 m/s^2, 0.049 m below the top.' },
        { id: 'fastTop', label: 'Fast toss, weak gravity, at the top', time: top, inputOverrides: { launchSpeed: 5.0, gravity: 6.0 }, actions: [], expected: 'At 5.0 m/s and 6.0 m/s^2 the top comes at 0.833 s and 2.083 m; both velocities read 0.00 and the toss acceleration is -6.0 m/s^2.' },
      ],
      readoutIds: ['tossedVelocity', 'tossedAcceleration', 'dropVelocity', 'dropAcceleration'], // the two lane state lines are sdk.panel state text, not readouts: the author guidance caps readouts at 4
    },
    mode: {
      kind: 'experiment', initialState: 'Launch speed 4.0 m/s, gravity 9.8 m/s^2; both balls at launch height at the start, paused; the scrubber reads -0.408 s.', fixedValues: {}, adjustableIds: ['launchSpeed', 'gravity'],
      timeline: timeline('Time from the top', flight, bin('multiply', lit(-1), top), [{ id: 'before', label: '-0.10 s', time: around(gravityExpr, -0.1), pause: true }, { id: 'top', label: 'Top', time: top, pause: true }, { id: 'after', label: '+0.10 s', time: around(gravityExpr, 0.1), pause: true }]),
      onInputChange: 'reset_pause',
    },
    controls: [
      playback({ affects: affects(['main', 'entity', 'tossedBall'], ['main', 'entity', 'dropBall']) }),
      scrubber('Time from the top', { affects: affects(['main', 'entity', 'tossedBall'], ['main', 'entity', 'dropBall'], ['main', 'readout', 'tossedVelocity'], ['main', 'readout', 'dropVelocity']) }),
      speedControl([['main', 'entity', 'tossedBall'], ['main', 'quantity', 'apexTime'], ['main', 'quantity', 'apexHeight']]),
      gravityControl([['main', 'entity', 'accelerationArrow'], ['main', 'quantity', 'apexTime'], ['main', 'readout', 'tossedAcceleration']]),
      seekTop('top', [['main', 'entity', 'gate'], ['main', 'readout', 'tossedVelocity']]),
      resetTo('Restores launch speed 4.0 m/s, gravity 9.8 m/s^2 and the start time, paused.', [['main', 'quantity', 'launchSpeed']]),
    ],
    claims: [{ id: 'sameAfterRelease', text: 'After the release both balls share height, velocity and acceleration at every instant, and the toss acceleration is -gravity throughout.', evidenceIds: ['kinematics_note'], check: 'Toss: y = u t - g t^2 / 2 about its top equals y_top - g tau^2 / 2, the same as a ball released from rest at the top.' }],
    assumptions: ['No air resistance, the same gravity for both balls, up is positive.'],
  };

  // ---- Deep (detailed): moving ball and velocity graph, three parameters ----
  const tossDeep = {
    ...tossCommon, depth: 'detailed',
    title: 'Zero velocity. Nonzero acceleration.',
    story: 'Maya missed her serve again. The ball had looked still for just long enough to persuade her she could wait. She wanted to know how much time her eyes had actually seen.\n\nHer friend gave her a clue by dropping a ball from his hand. At the instant it came free, its velocity was zero. Gravity was already accelerating it downward. Maya wondered if she could use that same starting point to calculate what happened around the top of her throw.\n\nShe took upward as positive and set t = 0 at the highest point. For the calculation, she treated the throw as vertical and ignored air resistance. The ball\'s weight was F = -m g, so Newton\'s second law gave her a = F / m = -g, about -9.8 m/s^2. There was no special case in that calculation for the moment when the ball stopped rising.\n\nWith zero velocity at t = 0, she could write its velocity and height on either side of the top.\n\nv(t) = -g t, y(t) = y_top - g t^2 / 2.\n\nThe velocity told the story she expected. A tenth of a second before the top, it was moving up at about 0.98 m/s. A tenth after, it was moving down at the same speed. The velocity had changed by nearly two metres per second in just a fifth of a second.\n\nThe height surprised her. At both those instants, the ball was only 4.9 centimetres below the top. For that whole fifth of a second, it stayed within a space smaller than the width of the ball itself. That was enough to make it look as if it hung there.\n\nOn the next serve, she saw the same little hesitation in the air. This time she was already swinging.',
    cardDescription: 'At the top, $v = 0$, but the velocity–time slope stays $a = -g$. Gravity’s force is $F_g = mg$: more mass means more force, with the same acceleration. No air resistance.',
    instructions: 'Change launch speed or gravity, then press Play. Compare the readings at each pause near the top. Change mass while paused to compare force and acceleration. Press Play again or drag the timeline to continue.',
    learningGoal: 'Explain that the force of gravity is m g and the acceleration is -g at every instant, including the top, so a larger mass changes the force and not the motion.',
    scene: {
      description: 'Two equal-width scenes side by side in one frame. Left, The motion: a ball (frame object id ball.toss) on a height ruler fixed at 0 to 2.2 m, zero at the launch mark, up positive, with a blue velocity arrow (vec.v), a separate dashed warm acceleration arrow (vec.a) and a callout (callout.toss) beside it reading velocity (m/s), acceleration (m/s^2) and the downward gravitational force (N), plus a state line (Ready to toss, Rising, At the top, Falling, Back at launch height). Right, Velocity over time (frame object id plot.vt): the line v = u - g t on fixed scales 0 to 1.8 s and -5.5 to +5.5 m/s, a blue trace up to the current instant, a linked marker, a faint continuation and an orange local segment labelled with the slope a = -g. Ball, marker and readings move together. No snapshot strip.',
      runtime,
      entities: [entity('ball', 'Ball', 'The tossed ball on the height ruler (frame object id ball.toss).'), entity('velocityArrow', 'Velocity arrow', 'Blue arrow with the signed velocity (frame object id vec.v, labelled v).'), entity('accelerationArrow', 'Acceleration arrow', 'Dashed warm arrow with the constant -gravity (frame object id vec.a, labelled a).'), entity('velocityGraph', 'Velocity-time graph', 'The line v = u - g t with a linked marker and the slope segment (frame object id plot.vt).')],
      quantities: [launchSpeedQuantity, gravityQuantity, quantity('mass', 'Mass', 'kg', 'Mass of the ball.', 'Does not change the motion.'), ...apexQuantities,
        quantity('height', 'Height of the ball', 'm', 'Height above the launch mark.', 'Measured from the launch mark, up is positive.', 'height = launchSpeed * t - gravity * t^2 / 2'),
        quantity('velocity', 'Vertical velocity', 'm/s', 'Signed rate of change of height, up positive.', 'Zero at the top.', 'velocity = launchSpeed - gravity * t'),
        quantity('acceleration', 'Vertical acceleration', 'm/s^2', 'Slope of the velocity-time line.', 'Constant -gravity.'),
        quantity('force', 'Gravitational force', 'N', 'Magnitude of the downward force of gravity on the ball.', 'Downward.', 'force = mass * gravity')],
      observations: [
        { id: 'velocitySamples', text: 'The velocity follows v = u - g t: +0.98, 0.00 and -0.98 m/s at 0.10 s before, at and 0.10 s after the top at 9.8 m/s^2.', quantityIds: ['velocity'], readoutIds: ['velocity'] },
        { id: 'accelerationSlope', text: 'The slope of the velocity line is -gravity at every instant, so the acceleration is nonzero at the top.', quantityIds: ['acceleration'], readoutIds: ['acceleration'] },
        { id: 'forceByMass', text: 'The force at the top is mass times gravity: 9.8 N at 1.0 kg and 29.4 N at 3.0 kg, while the trajectory and the velocity graph stay identical.', quantityIds: ['force', 'height'], readoutIds: ['force'] },
        { id: 'topMoves', text: 'A faster toss or a weaker gravity moves the top later and higher on the fixed scales.', quantityIds: ['apexTime', 'apexHeight'], readoutIds: [] },
      ],
      checkpoints: [
        { id: 'before', label: '0.10 s before the top', time: around(gravityExpr, -0.1), inputOverrides: {}, actions: [], expected: 'Velocity +0.98 m/s, acceleration -9.8 m/s^2, force 9.8 N, height 0.767 m.' },
        { id: 'top', label: 'At the top', time: top, inputOverrides: {}, actions: [], expected: 'At 0.408 s and 0.816 m the velocity is 0.00 m/s, the acceleration -9.8 m/s^2 and the force 9.8 N downward.' },
        { id: 'heavyTop', label: 'At the top with 3.0 kg', time: top, inputOverrides: { mass: 3.0 }, actions: [], expected: 'Force 29.4 N downward; velocity 0.00 m/s, acceleration -9.8 m/s^2 and height 0.816 m exactly as at 1.0 kg.' },
        { id: 'fastTop', label: 'Fast toss, weak gravity, at the top', time: top, inputOverrides: { launchSpeed: 5.0, gravity: 6.0 }, actions: [], expected: 'At 5.0 m/s and 6.0 m/s^2 the top comes at 0.833 s and 2.083 m; velocity 0.00 m/s, acceleration -6.0 m/s^2, force 6.0 N.' },
      ],
      readoutIds: ['velocity', 'acceleration', 'force', 'motionState'],
    },
    mode: {
      kind: 'experiment', initialState: 'Launch speed 4.0 m/s, gravity 9.8 m/s^2, mass 1.0 kg; the ball at the launch mark, time 0.000 s, paused.', fixedValues: {}, adjustableIds: ['launchSpeed', 'gravity', 'mass'],
      timeline: timeline('Time since launch', flight, lit(0), [{ id: 'before', label: 'Top -0.10 s', time: around(gravityExpr, -0.1), pause: true }, { id: 'top', label: 'Top', time: top, pause: true }, { id: 'after', label: 'Top +0.10 s', time: around(gravityExpr, 0.1), pause: true }]),
      onInputChange: 'reset_pause',
    },
    controls: [
      playback({ affects: affects(['main', 'entity', 'ball'], ['main', 'entity', 'velocityGraph']) }),
      scrubber('Time since launch', { affects: affects(['main', 'entity', 'ball'], ['main', 'entity', 'velocityGraph'], ['main', 'readout', 'velocity']) }),
      speedControl([['main', 'entity', 'ball'], ['main', 'quantity', 'apexTime'], ['main', 'quantity', 'apexHeight']]),
      gravityControl([['main', 'entity', 'accelerationArrow'], ['main', 'quantity', 'apexTime'], ['main', 'readout', 'acceleration'], ['main', 'readout', 'force']]),
      massControl([['main', 'readout', 'force']]),
      seekTop('top', [['main', 'entity', 'ball'], ['main', 'readout', 'motionState']]),
      resetTo('Restores launch speed 4.0 m/s, gravity 9.8 m/s^2, mass 1.0 kg and time 0, paused.', [['main', 'quantity', 'launchSpeed']]),
    ],
    claims: [{ id: 'forceAndAcceleration', text: 'The gravitational force is m g and the acceleration is -g at every instant, so doubling the mass doubles the force and leaves the motion unchanged.', evidenceIds: ['kinematics_note'], check: 'a = F / m = -m g / m = -g; v = u - g t and y = u t - g t^2 / 2 do not contain m.' }],
    assumptions: ['No air resistance, up is positive.'],
  };

  return { tossOverview, tossStandard, tossDeep };
}
