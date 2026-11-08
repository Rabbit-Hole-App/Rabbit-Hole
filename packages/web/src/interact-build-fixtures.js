import { sealProgram } from './explain-program/contract.js';
import { VISUAL_PROGRAM_STAMPS } from './explain-program/stamps.js';

// Fixture builds for the canonical toss-and-drop plans (docs/features/interact.md section 7): real, runnable sdk-2 programs written with
// the generic drawing primitives only (circle, line, arrow, text; no topic renderer), plus the expected values computed DIRECTLY from the
// equations. Used by the composition, build, check and runner tests and by the offline fixture run. Fixture data, never product logic:
// nothing in the pipeline reads this file to decide what is correct; only a test or the fixture runner passes it in as the oracle.
export const G = 9.8;

// y = u t - g t^2 / 2 (up positive, t from launch); v = u - g t; a = -g; apex at u / g; return at 2 u / g; peak u^2 / 2g. A ball
// held by the gate until the apex and then released falls g (t - apex)^2 / 2 from the peak height.
export function tossDrop({ u = 3, g = G } = {}) {
  const apex = u / g, end = 2 * u / g, peak = u * u / (2 * g), y = t => u * t - g * t * t / 2;
  const at = t => ({
    time: t, velocity: u - g * t, acceleration: -g, belowPeak: peak - y(t),
    heldDrop: t <= apex ? 0 : g * (t - apex) ** 2 / 2, heldVelocity: t <= apex ? 0 : -g * (t - apex),
  });
  return { u, g, apex, end, peak, at, displayStart: -apex, displayEnd: end - apex };
}

const STANDARD_MAIN = String.raw`
export function evaluate({ time }) {
  const U = 3, G = 9.8, APEX = U / G, PEAK = U * U / (2 * G), S = 600, GROUND = 330, XT = 220, XH = 440;
  const t = Math.min(time, 2 * APEX);
  const height = U * t - G * t * t / 2, velocity = U - G * t;
  const fall = Math.max(0, t - APEX), drop = G * fall * fall / 2, heldVelocity = -G * fall;
  const yTossed = GROUND - S * height, yHeld = GROUND - S * (PEAK - drop), peakY = GROUND - S * PEAK;
  const shown = v => (Math.abs(v) < 5e-9 ? 0 : v), sign = v => (shown(v) > 0 ? '+' : '');
  const objects = [
    sdk.line('ground', 60, GROUND + 12, 580, GROUND + 12),
    sdk.text('launch-mark', 60, GROUND + 34, 'launch mark'),
    sdk.line('peak-line', 150, peakY, 500, peakY, { role: 'prediction', opacity: 0.5 }),
    sdk.text('peak-label', 505, peakY + 5, 'peak'),
    sdk.box('gate', XH - 24, yHeld + 12, 48, 6, { role: 'warning', opacity: t < APEX ? 1 : 0.25 }),
    sdk.circle('tossed-ball', XT, yTossed, 24, { role: 'output' }),
    sdk.circle('held-ball', XH, yHeld, 24, { role: 'input' }),
    sdk.text('tossed-label', XT - 40, GROUND + 56, 'tossed ball'),
    sdk.text('held-label', XH - 40, GROUND + 56, 'held ball'),
    sdk.text('velocity-readout', 20, 28, 'velocity ' + sign(velocity) + sdk.format(shown(velocity), 2) + ' m/s'),
    sdk.text('acceleration-readout', 20, 52, 'acceleration ' + sdk.format(-G, 1) + ' m/s^2'),
    sdk.text('up-label', 560, 28, 'up is +'),
  ];
  if (Math.abs(velocity) >= 0.02) objects.push(sdk.arrow('velocity-arrow', XT + 34, yTossed, XT + 34, yTossed - 40 * velocity, { role: 'output' }));
  objects.push(sdk.arrow('gravity-arrow', XT - 34, yTossed, XT - 34, yTossed + 30, { role: 'warning' }));
  if (fall > 0) objects.push(sdk.arrow('held-velocity-arrow', XH + 34, yHeld, XH + 34, yHeld - 40 * heldVelocity, { role: 'input' }));
  return {
    frame: sdk.frame(objects, { width: 640, height: 400, readouts: [{ id: 'tossedVelocity', value: velocity }, { id: 'tossedAcceleration', value: -G }] }),
    quantities: { velocity, acceleration: -G, tossedVelocity: velocity, tossedAcceleration: -G, tossedHeight: height, tossedBelowPeak: PEAK - height, heldDrop: drop, heldVelocity },
  };
}`;

const THREE_MOMENTS = String.raw`
export function evaluate() {
  const U = 3, G = 9.8, APEX = U / G, PEAK = U * U / (2 * G), S = 600, GROUND = 330;
  const moments = [{ id: 'before', t: APEX - 0.1, x: 120, label: '0.10 s before' }, { id: 'top', t: APEX, x: 320, label: 'at the top' }, { id: 'after', t: APEX + 0.1, x: 520, label: '0.10 s after' }];
  const shown = v => (Math.abs(v) < 5e-9 ? 0 : v), sign = v => (shown(v) > 0 ? '+' : '');
  const peakY = GROUND - S * PEAK, objects = [sdk.line('peak-line', 60, peakY, 580, peakY, { role: 'prediction', opacity: 0.5 }), sdk.text('up-label', 560, 28, 'up is +')];
  const quantities = { acceleration: -G }, readouts = [];
  for (const m of moments) {
    const height = U * m.t - G * m.t * m.t / 2, velocity = U - G * m.t, y = GROUND - S * height;
    objects.push(sdk.circle('ball-' + m.id, m.x, y, 24, { role: 'output' }), sdk.text('label-' + m.id, m.x - 50, GROUND + 34, m.label),
      sdk.text('velocity-' + m.id, m.x + 22, y - 18, 'v = ' + sign(velocity) + sdk.format(shown(velocity), 2) + ' m/s'));
    if (Math.abs(velocity) >= 0.02) objects.push(sdk.arrow('velocity-arrow-' + m.id, m.x, y, m.x, y - 40 * velocity, { role: 'output' }));
    const name = 'velocity' + m.id[0].toUpperCase() + m.id.slice(1);
    quantities[name] = velocity; quantities['belowPeak' + m.id[0].toUpperCase() + m.id.slice(1)] = PEAK - height; readouts.push({ id: name, value: velocity });
  }
  objects.push(sdk.text('acceleration-readout', 20, 28, 'a = ' + sdk.format(-G, 1) + ' m/s^2 at every moment'));
  return { frame: sdk.frame(objects, { width: 640, height: 400, readouts }), quantities };
}`;

const DEEP_MAIN = String.raw`
export function evaluate({ inputs, time }) {
  const G = 9.8, U = inputs.launchSpeed, U0 = 3, S = 160, X0 = 60, GROUND = 330;
  const end = 2 * U / G, t = Math.min(time, end), t0 = Math.min(time, 2 * U0 / G);
  const y = (u, s) => u * s - G * s * s / 2;
  const objects = [sdk.line('ground', 40, GROUND + 12, 600, GROUND + 12), sdk.text('time-label', 20, 28, 'time since launch ' + sdk.format(t, 2) + ' s'),
    sdk.circle('trial-ball', 420, GROUND - S * y(U, t), 24, { role: 'output' }), sdk.circle('reference-ball', 220, GROUND - S * y(U0, t0), 24, { role: 'input' }),
    sdk.text('trial-label', 380, GROUND + 34, 'trial'), sdk.text('reference-label', 170, GROUND + 34, 'reference')];
  const peak = U * U / (2 * G);
  return { frame: sdk.frame(objects, { width: 640, height: 400, readouts: [{ id: 'trialPeak', value: peak }, { id: 'trialTime', value: end }] }),
    quantities: { trialPeak: peak, trialTime: end, flightTime: end, peakHeight: peak, launchSpeed: U } };
}`;

const DEEP_COMPARE = String.raw`
export function evaluate({ inputs }) {
  const G = 9.8, U = inputs.trialSpeed, U0 = 3, S = 160, GROUND = 330, TAU = 0.1;
  const peak = u => u * u / (2 * G), offset = G * TAU * TAU / 2;
  const objects = [sdk.line('reference-peak', 60, GROUND - S * peak(U0), 280, GROUND - S * peak(U0), { role: 'input' }), sdk.line('trial-peak', 340, GROUND - S * peak(U), 580, GROUND - S * peak(U), { role: 'output' }),
    sdk.text('reference-label', 60, 28, 'reference peak ' + sdk.format(peak(U0), 2) + ' m'), sdk.text('trial-label', 340, 28, 'trial peak ' + sdk.format(peak(U), 2) + ' m'),
    sdk.text('offset-label', 60, 360, 'each ball is ' + sdk.format(offset, 3) + ' m below its own peak 0.10 s from it')];
  return { frame: sdk.frame(objects, { width: 640, height: 400, readouts: [{ id: 'referenceOffset', value: offset }, { id: 'trialOffset', value: offset }, { id: 'referencePeak', value: peak(U0) }, { id: 'trialPeak', value: peak(U) }] }),
    quantities: { referenceOffset: offset, trialOffset: offset, referencePeak: peak(U0), trialPeak: peak(U) } };
}`;

const OVERVIEW_MAIN = String.raw`
export function evaluate() {
  const G = 9.8, T = 0.1, S = 1200, PEAKY = 130, XT = 220, XR = 440, GROUND = 340;
  const drop = G * T * T / 2, fall = S * drop;
  const objects = [
    sdk.line('ground', 60, GROUND + 12, 580, GROUND + 12),
    sdk.line('shared-height', 150, PEAKY, 520, PEAKY, { role: 'prediction', opacity: 0.5 }),
    sdk.text('shared-label', 330, PEAKY - 14, 'same height, zero velocity'),
    sdk.circle('tossed-ball', XT, PEAKY, 24, { role: 'output' }),
    sdk.circle('released-ball', XR, PEAKY, 24, { role: 'input' }),
    sdk.circle('tossed-after', XT, PEAKY + fall, 24, { role: 'output', opacity: 0.35 }),
    sdk.circle('released-after', XR, PEAKY + fall, 24, { role: 'input', opacity: 0.35 }),
    sdk.arrow('tossed-gravity', XT - 44, PEAKY, XT - 44, PEAKY + 40, { role: 'warning' }),
    sdk.arrow('released-gravity', XR - 44, PEAKY, XR - 44, PEAKY + 40, { role: 'warning' }),
    sdk.text('tossed-label', XT - 70, GROUND + 56, 'tossed ball at its top'),
    sdk.text('released-label', XR - 50, GROUND + 56, 'just released'),
    sdk.text('drop-readout', 20, 28, 'after 0.10 s each ball has moved ' + sdk.format(drop, 3) + ' m down'),
    sdk.text('gravity-readout', 20, 52, 'gravity ' + sdk.format(G, 1) + ' m/s^2 on both'),
  ];
  return { frame: sdk.frame(objects, { width: 640, height: 400, readouts: [{ id: 'dropReadout', value: drop }] }), quantities: { drop, gravity: G } };
}`;

const PENDULUM_MAIN = String.raw`
export function evaluate({ inputs }) {
  const G = 9.8, L = inputs.length, PX = 320, PY = 60, S = 300, ANGLE = 0.3;
  const period = 2 * Math.PI * Math.sqrt(L / G);
  const bx = PX - S * L * Math.sin(ANGLE), by = PY + S * L * Math.cos(ANGLE);
  const objects = [
    sdk.line('ceiling', 240, PY - 6, 400, PY - 6),
    sdk.line('rest-line', PX, PY, PX, PY + S * L, { role: 'prediction', opacity: 0.4 }),
    sdk.line('string', PX, PY, bx, by),
    sdk.circle('weight', bx, by, 22, { role: 'output' }),
    sdk.text('length-label', PX + 14, PY + S * L / 2, 'length ' + sdk.format(L, 2) + ' m'),
    sdk.text('period-readout', 20, 28, 'period ' + sdk.format(period, 3) + ' s'),
    sdk.text('gravity-readout', 20, 52, 'gravity ' + sdk.format(G, 1) + ' m/s^2'),
  ];
  return { frame: sdk.frame(objects, { width: 640, height: 400, readouts: [{ id: 'periodReadout', value: period }] }), quantities: { length: L, gravity: G, period } };
}`;

const readout = (id, label, unit = 'm/s', decimals = 2) => ({ id, label, unit, decimals });
const base = (title, summary, description, assumptions) => ({ title, summary, description, assumptions });
const T = tossDrop();
const standardMainManifest = {
  ...base('Zero velocity at the top is not zero acceleration', 'A ball tossed up at 3.0 m/s and a second ball held at the same peak height until the top, then released; up is positive.',
    'Two balls near the top of a toss. The tossed ball slows, stops and speeds up downward; the held ball starts to fall only when the gate opens at the top. Velocity and acceleration are written in the scene.',
    ['Constant downward acceleration of 9.8 m/s^2, no air resistance, up is positive.']),
  inputs: [], duration: T.end,
  timeline: { label: 'Time from the apex', displayOffset: -T.apex, playbackRate: 0.1, markers: [{ id: 'before', label: '-0.10 s', time: T.apex - 0.1 }, { id: 'top', label: 'Top', time: T.apex }, { id: 'after', label: '+0.10 s', time: T.apex + 0.1 }] },
  readouts: [readout('tossedVelocity', 'Tossed ball velocity'), readout('tossedAcceleration', 'Tossed ball acceleration', 'm/s^2', 1)], capabilities: ['time_playback'],
};
const threeMomentsManifest = {
  ...base('Three moments around the top', 'The tossed ball 0.10 s before the top, at the top and 0.10 s after, up positive, on one height scale.',
    'Three balls at three moments, all on one height scale. The velocity arrows point up, vanish and point down while the acceleration stays the same.', ['Constant downward acceleration of 9.8 m/s^2, no air resistance, up is positive.']),
  inputs: [], readouts: [readout('velocityBefore', 'Velocity 0.10 s before'), readout('velocityTop', 'Velocity at the top'), readout('velocityAfter', 'Velocity 0.10 s after')], capabilities: ['time_playback'],
};
const overviewMainManifest = {
  ...base('Is a ball at the top of a throw weightless?', 'A tossed ball at its top and a ball just released from rest, at one height, each drawn again after 0.10 s.',
    'Two balls at the same height with zero velocity. Gravity pulls both down, so each ball is 0.049 m lower after 0.10 s.', ['Constant downward acceleration of 9.8 m/s^2, no air resistance, up is positive.']),
  inputs: [], readouts: [readout('dropReadout', 'Distance fallen in 0.10 s', 'm', 3)], capabilities: [],
};
const pendulumMainManifest = {
  ...base('Does a longer pendulum swing more slowly?', 'A weight on a string of the chosen length at the top of a small swing, with the period of one full swing.',
    'A pendulum drawn to scale with the chosen string length. The period grows with the square root of the length: four times the length takes twice as long.', ['Small swings, no air resistance, a constant 9.8 m/s^2.']),
  inputs: [{ type: 'number', id: 'length', label: 'String length', unit: 'm', default: 0.5, min: 0.25, max: 1, step: 0.05 }], readouts: [readout('periodReadout', 'Period', 's', 3)], capabilities: [],
};
const deepEnd = 2 * 5 / G;
const deepMainManifest = {
  ...base('Does a faster throw change the motion around its peak?', 'The reference throw at 3.0 m/s beside a trial throw at the chosen launch speed, on one time axis.',
    'A reference ball and a trial ball thrown at different speeds. The trial flight lasts 2u/g and its peak rises with the square of the launch speed.', ['Constant downward acceleration of 9.8 m/s^2, no air resistance, up is positive.']),
  inputs: [{ type: 'number', id: 'launchSpeed', label: 'Launch speed', unit: 'm/s', default: 5, min: 3, max: 5, step: 0.1 }], duration: deepEnd,
  timeline: { label: 'Time since launch', displayOffset: 0, playbackRate: 0.2, markers: [{ id: 'trialTop', label: 'Trial top', time: 5 / G }] },
  readouts: [readout('trialPeak', 'Trial peak height', 'm', 3), readout('trialTime', 'Trial flight time', 's', 3)], capabilities: ['time_playback'],
};
const deepCompareManifest = {
  ...base('Compare the two peaks', 'The reference throw and the trial throw, each aligned at its own top, on one height scale.', 'Two peak heights side by side with the distance each ball is below its own peak 0.10 s from the top.', ['Constant downward acceleration of 9.8 m/s^2, no air resistance, up is positive.']),
  inputs: [{ type: 'number', id: 'trialSpeed', label: 'Trial speed', unit: 'm/s', default: 5, min: 3, max: 5, step: 0.1 }],
  readouts: [readout('referenceOffset', 'Reference offset', 'm', 3), readout('trialOffset', 'Trial offset', 'm', 3), readout('referencePeak', 'Reference peak', 'm', 3), readout('trialPeak', 'Trial peak', 'm', 3)], capabilities: ['time_playback'],
};

// What the Scene Builder returns: unsealed drafts {manifest, source} per panel. Keys: standard, deep.
export const FIXTURE_DRAFTS = Object.freeze({
  pendulum: { main: { kind: 'program', program: { manifest: pendulumMainManifest, source: PENDULUM_MAIN } }, supporting: [] },
  overview: { main: { kind: 'program', program: { manifest: overviewMainManifest, source: OVERVIEW_MAIN } }, supporting: [] },
  standard: { main: { kind: 'program', program: { manifest: standardMainManifest, source: STANDARD_MAIN } }, supporting: [{ id: 'threeMoments', artifact: { kind: 'program', program: { manifest: threeMomentsManifest, source: THREE_MOMENTS } } }] },
  deep: { main: { kind: 'program', program: { manifest: deepMainManifest, source: DEEP_MAIN } }, supporting: [{ id: 'comparePeaks', artifact: { kind: 'program', program: { manifest: deepCompareManifest, source: DEEP_COMPARE } } }] },
});

// A fresh copy of a fixture draft (callers edit it to make a wrong candidate).
export const fixtureDraft = name => structuredClone(FIXTURE_DRAFTS[name]);

// Seal every program of a draft envelope with the visual (sdk-2) stamps, as the server's buildProgramArtifact does for a schema 1 program.
export async function sealEnvelope(draft) {
  const seal = async artifact => {
    if (artifact.kind !== 'program') return artifact;
    const sealed = await sealProgram(artifact.program, VISUAL_PROGRAM_STAMPS);
    if (!sealed.ok) throw new Error(`fixture program refused: ${sealed.issue}`);
    return { kind: 'program', program: sealed.value };
  };
  return { main: await seal(draft.main), supporting: await Promise.all(draft.supporting.map(async s => ({ id: s.id, artifact: await seal(s.artifact) }))) };
}

// Expected values for the Standard checks, per capture case id (interact-checks.js buildPlanCaptureCases names them cp-<checkpoint id>,
// start, end): trace.quantities name -> {expected, tol}. Computed from the equations above. Absolute tolerance 1e-6 for raw quantities.
export function standardOracle() {
  const rows = (at, extra = {}) => ({ velocity: at.velocity, tossedVelocity: at.velocity, acceleration: -G, tossedAcceleration: -G, tossedBelowPeak: at.belowPeak, heldDrop: at.heldDrop, heldVelocity: at.heldVelocity, ...extra });
  const cases = { start: T.at(0), end: T.at(T.end), 'cp-before': T.at(T.apex - 0.1), 'cp-top': T.at(T.apex), 'cp-after': T.at(T.apex + 0.1) };
  const expect = [];
  for (const [caseId, at] of Object.entries(cases)) for (const [name, expected] of Object.entries(rows(at))) expect.push({ case: caseId, panel: 'main', name, expected, tol: 1e-6 });
  const m = id => T.at(T.apex + id);
  for (const [name, expected] of [['velocityBefore', m(-0.1).velocity], ['velocityTop', m(0).velocity], ['velocityAfter', m(0.1).velocity], ['acceleration', -G],
    ['belowPeakBefore', m(-0.1).belowPeak], ['belowPeakAfter', m(0.1).belowPeak]]) expect.push({ case: 'start', panel: 'threeMoments', name, expected, tol: 1e-6 });
  return { id: 'toss-drop-standard', expect };
}

// Expected values for the Deep checks, by capture case id, computed from the equations of section 7 and the plan fixture's own case names:
// start, cp-<id>, end, and a number control's bound-/probe- cases at its minimum and maximum. u is the trial launch speed of that case; the
// reference throw is fixed at 3.0 m/s. Return time 2u/g and peak height u^2/(2g) do not depend on the elapsed time, so one row serves every instant.
// The apex-relative comparison: each ball 0.10 s from its own top is g * 0.1^2 / 2 = 0.049 m below it, whatever the launch speed.
export function deepOracle() {
  const speeds = { start: 5, 'cp-launch': 5, 'cp-trialTop': 5, 'cp-trialReturn': 5, 'cp-referenceReturn': 3, end: 5, 'bound-speed-min': 3, 'bound-speed-max': 5, 'probe-speed-min': 3, 'probe-speed-max': 5 };
  const expect = [];
  for (const [caseId, u] of Object.entries(speeds)) {
    const t = tossDrop({ u }), ref = tossDrop({ u: 3 }), offset = G * 0.1 ** 2 / 2;
    for (const [name, expected] of [['flightTime', t.end], ['trialTime', t.end], ['peakHeight', t.peak], ['trialPeak', t.peak]]) expect.push({ case: caseId, panel: 'main', name, expected, tol: 1e-6 });
    for (const [name, expected] of [['referenceOffset', offset], ['trialOffset', offset], ['referencePeak', ref.peak], ['trialPeak', t.peak]]) expect.push({ case: caseId, panel: 'comparePeaks', name, expected, tol: 1e-6 });
  }
  return { id: 'toss-drop-deep', expect };
}

// Expected values for the Overview (static program) checks: the distance either ball falls in 0.10 s from rest, g * 0.1^2 / 2 = 0.049 m. The static scene
// is one state, so one case ('default'; the plan's two checkpoints are aliases of it).
export function overviewOracle() {
  const drop = G * 0.1 ** 2 / 2;
  return { id: 'toss-drop-overview', expect: [{ case: 'default', panel: 'main', name: 'drop', expected: drop, tol: 1e-6 }, { case: 'default', panel: 'main', name: 'dropReadout', expected: drop, tol: 1e-6 }] };
}

// Expected values for the pendulum (a different subject): the period of a small swing, T = 2 pi sqrt(L / g), for the string length of each capture case.
// Case ids are the ones buildPlanCaptureCases makes for an untimed Experiment: default, cp-<id>, bound-/probe-<control>-min|max.
export const pendulumPeriod = length => 2 * Math.PI * Math.sqrt(length / G);
export function pendulumOracle() {
  const lengths = { default: 0.5, 'cp-short': 0.25, 'cp-long': 1, 'bound-length-min': 0.25, 'bound-length-max': 1, 'probe-length-min': 0.25, 'probe-length-max': 1 };
  return { id: 'pendulum-period', expect: Object.entries(lengths).flatMap(([caseId, length]) => ['period', 'periodReadout'].map(name => ({ case: caseId, panel: 'main', name, expected: pendulumPeriod(length), tol: 1e-6 }))) };
}
