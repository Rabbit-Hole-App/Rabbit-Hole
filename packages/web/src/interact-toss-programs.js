import { sealProgram } from './explain-program/contract.js';
import { FIGURES_PROGRAM_STAMPS } from './explain-program/stamps.js';

// Scripted sdk-8 build programs for the three reference toss-and-drop plans (interact-plan-fixtures.js referencePlans tossOverview, tossStandard, tossDeep): what a model author would write for
// them, written by hand so the owner can review the LOOK of a generated scene against the Codex HTML cards (docs/features/interact/references) with no model call. Fixture data, never product
// logic: the pipeline never reads this file to decide what is right; the tests run each program through the real headless checks (interact-checks.js) against the oracles of interact-oracle.js.
// The look is the renderer's (frame-look.js, FrameFigures.jsx); a program only follows its conventions: ball.toss / ball.drop bodies, lane.toss / lane.drop sdk.panel lanes, the frame's first y
// sdk.axis, vec.* vectors, callout.* callouts, plot.vt with its .note. Geometry follows the Codex SVGs at a 1000 px viewport (a 892 px scene; two 432 px columns in a 892 px frame; 105 px per metre).
// No vector label sits inside a lane: frame-overlap.js counts the lane's own box as a box under every text object over it (text-box), so a v or a label over a lane cannot pass; the callout carries
// the readings instead. The program never draws text inside a lane.

const PLAN_TEXT = { assumptions: ['Constant downward acceleration, no air resistance, up is positive.'] };
const input = (id, label, unit, def, min, max) => ({ type: 'number', id, label, unit, default: def, min, max, step: 0.1 });
const speed = input('launchSpeed', 'Launch speed', 'm/s', 4, 2, 5), gravity = input('gravity', 'Gravity', 'm/s^2', 9.8, 6, 12), mass = input('mass', 'Mass', 'kg', 1, 0.2, 3);
const readout = (id, label, unit, decimals) => ({ id, label, unit, decimals });
const state = (id, label, labels) => ({ id, label, kind: 'state', labels, decimals: 0 });
const CAPABILITIES = ['time_playback', 'number_inputs', 'props', 'figures'];
const TOP = 4 / 9.8, TOP_MARKER = (id, label, time) => ({ id, label, time });

// Shared by all three programs: the physics (y = u t - g t^2 / 2, v = u - g t, a = -g, top at u / g), the signed number format and the one-lane vector helpers.
const COMMON = String.raw`
const EPS = 1e-8;
const sg = (v, d) => { const a = Math.abs(v); if (a < 0.5 * Math.pow(10, -d)) return (0).toFixed(d); return (v < 0 ? '−' : '+') + a.toFixed(d); };
const motion = (u, g, time) => {
  const top = u / g, end = 2 * top, t = Math.min(Math.max(time, 0), end), v = u - g * t;
  return { top, end, t, peak: u * u / (2 * g), h: Math.max(0, u * t - g * t * t / 2), v: Math.abs(v) < 1e-9 ? 0 : v, tau: t - top, launch: t < EPS, ended: t >= end - EPS };
};
`;

// ---- Overview (brief): one moving ball, the speed the one parameter ----
const OVERVIEW_SOURCE = COMMON + String.raw`
export function evaluate({ inputs, time }) {
  const u = inputs.launchSpeed, g = 9.8, m = motion(u, g, time), atTop = Math.abs(m.tau) < EPS;
  const FLOOR = 315, S = 200, X = 348, R = 18, y = FLOOR - m.h * S;
  const word = atTop ? 'Still for an instant' : m.v > 0 ? 'Moving up' : 'Moving down';
  const where = m.launch ? 'At launch' : atTop ? 'At the top' : m.ended ? 'Back at launch height' : m.v > 0 ? 'Rising' : 'Falling';
  const objects = [
    ...sdk.panel({ id: 'lane.toss', x: 18, y: 34, w: 856, h: 300, title: 'One toss', state: where }),
    sdk.line('guide.launch', 36, FLOOR, 856, FLOOR, { opacity: 0.5 }),
    sdk.text('label.launch', 36, FLOOR + 36, 'Launch height'),
    sdk.line('guide.toss', X, FLOOR, X, y, { opacity: 0.35 }),
  ];
  if (!m.launch) objects.push(sdk.circle('ghost.toss', X, FLOOR, 2 * R, { opacity: 0.35 }));
  objects.push(sdk.circle('ball.toss', X, y, 2 * R));
  if (!atTop) objects.push(...sdk.vector('vec.v', { x: X - 31, y: y }, { value: Math.abs(m.v), direction: m.v > 0 ? 'up' : 'down' }, { scale: 12, minLength: 3 }));
  objects.push(...sdk.vector('vec.a', { x: X + 31, y: y }, { value: g, direction: 'down' }, { scale: 48 / g }));
  objects.push(...sdk.callout(X + 61, sdk.clamp(y - 24, 40, 272), [word, 'Gravity pulls down'], { id: 'callout.toss' }));
  return {
    frame: sdk.frame(objects, { width: 892, height: 388, readouts: [{ id: 'motionState', value: word }, { id: 'gravityState', value: 'Gravity pulls down' }] }),
    quantities: { launchSpeed: u, gravity: g, apexTime: m.top, apexHeight: m.peak, velocity: m.v, height: m.h },
  };
}`;

// ---- Standard (balanced): the toss and the drop in two lanes, two parameters ----
const STANDARD_SOURCE = COMMON + String.raw`
export function evaluate({ inputs, time }) {
  const u = inputs.launchSpeed, g = inputs.gravity, m = motion(u, g, time), atTop = Math.abs(m.tau) < EPS;
  const FLOOR = 299, S = 105, R = 15, released = m.tau >= -EPS, peakY = FLOOR - m.peak * S;
  const drop = { h: released ? m.h : m.peak, v: released ? -g * Math.max(0, m.tau) : 0, a: released ? -g : 0 };
  const lane = (tag, title, x0, where, body) => {
    const x = x0 + 142, y = FLOOR - body.h * S, out = [...sdk.panel({ id: 'lane.' + tag, x: x0, y: 34, w: 407, h: 276, title: title, state: where }),
      sdk.text('label.launch.' + tag, x0 + 296, FLOOR + 27, 'Launch height'), sdk.line('guide.' + tag, x, peakY, x, FLOOR, { opacity: 0.35 })];
    return { x, y, out };
  };
  const tossWhere = m.launch ? 'At launch' : atTop ? 'At the top' : m.ended ? 'At launch height' : m.v > 0 ? 'Rising' : 'Falling';
  const dropWhere = !released ? 'Held in place' : atTop ? 'Just released' : m.ended ? 'At launch height' : 'Falling together';
  const L1 = lane('toss', 'Toss', 26, tossWhere, { h: m.h }), L2 = lane('drop', 'Drop', 459, dropWhere, drop);
  const ghosts = released && m.tau > EPS;
  const arrows = (tag, x, y, v, a) => {
    const out = Math.abs(v) * 12 < 1 ? [sdk.circle('vec.v.' + tag + '.zero', x - 26, y, 6, { role: 'input' })]
      : sdk.vector('vec.v.' + tag, { x: x - 26, y: y }, { value: Math.abs(v), direction: v > 0 ? 'up' : 'down' }, { scale: 12, minLength: 3 });
    if (a !== 0) out.push(...sdk.vector('vec.a.' + tag, { x: x + 25, y: y }, { value: Math.abs(a), direction: 'down' }, { scale: 3.4 }));
    out.push(...sdk.callout(x + 52, sdk.clamp(y - 29, 40, 248), ['v = ' + sg(v, 2) + ' m/s', 'a = ' + (a === 0 ? '0.0' : '−' + g.toFixed(1)) + ' m/s²'], { id: 'callout.' + tag }));
    return out;
  };
  const objects = [sdk.axis('axis.h', { x: 60, y: FLOOR, length: 2.2 * S, orientation: 'y', min: 0, max: 2.2, ticks: [0, 0.5, 1, 1.5, 2], label: 'Height', unit: 'm' }), ...L1.out, ...L2.out];
  if (ghosts) objects.push(sdk.circle('ghost.toss', L1.x, peakY, 2 * R, { opacity: 0.35 }), sdk.circle('ghost.drop', L2.x, peakY, 2 * R, { opacity: 0.35 }));
  objects.push(...sdk.gate('gate.drop', L2.x, peakY + R, { w: 46, open: released }));
  objects.push(sdk.circle('ball.toss', L1.x, L1.y, 2 * R), sdk.circle('ball.drop', L2.x, L2.y, 2 * R));
  objects.push(...arrows('toss', L1.x, L1.y, m.v, -g), ...arrows('drop', L2.x, L2.y, drop.v, drop.a));
  return {
    frame: sdk.frame(objects, { width: 892, height: 358, readouts: [{ id: 'tossedVelocity', value: m.v }, { id: 'tossedAcceleration', value: -g }, { id: 'dropVelocity', value: drop.v }, { id: 'dropAcceleration', value: drop.a }] }),
    quantities: { launchSpeed: u, gravity: g, apexTime: m.top, apexHeight: m.peak, tossedVelocity: m.v, tossedAcceleration: -g, tossedHeight: m.h, dropVelocity: drop.v, dropAcceleration: drop.a, dropHeight: drop.h },
  };
}`;

// ---- Deep (detailed): the moving ball on a height ruler, the velocity-time graph beside it, three parameters ----
const DEEP_SOURCE = COMMON + String.raw`
export function evaluate({ inputs, time }) {
  const u = inputs.launchSpeed, g = inputs.gravity, mass = inputs.mass, m = motion(u, g, time), atTop = Math.abs(m.tau) < EPS;
  const FLOOR = 299, S = 105, X = 26 + 129, R = 13, y = FLOOR - m.h * S, topY = FLOOR - m.peak * S, force = mass * g;
  const where = m.launch ? 'Ready to toss' : atTop ? 'At the top' : m.ended ? 'Back at launch height' : m.v > 0 ? 'Rising' : 'Falling';
  const line = [{ x: 0, y: u }, { x: m.end, y: -u }];
  const objects = [
    sdk.axis('axis.h', { x: 60, y: FLOOR, length: 2.2 * S, orientation: 'y', min: 0, max: 2.2, ticks: [0, 0.5, 1, 1.5, 2], label: 'Height', unit: 'm' }),
    ...sdk.panel({ id: 'lane.toss', x: 26, y: 34, w: 407, h: 276, title: 'The motion', state: where }),
    sdk.text('label.launch', 322, FLOOR + 27, 'Launch height'),
    sdk.line('guide.toss', X, topY, X, FLOOR, { opacity: 0.35 }),
  ];
  if (!m.launch) objects.push(sdk.circle('ghost.toss', X, FLOOR, 2 * R, { opacity: 0.35 }));
  objects.push(sdk.circle('ball.toss', X, y, 2 * R));
  if (Math.abs(m.v) * 12 >= 1) objects.push(...sdk.vector('vec.v', { x: X - 22, y: y }, { value: Math.abs(m.v), direction: m.v > 0 ? 'up' : 'down' }, { scale: 12, minLength: 3 }));
  objects.push(...sdk.vector('vec.a', { x: X + 23, y: y }, { value: g, direction: 'down' }, { scale: 3.4 }));
  objects.push(...sdk.callout(X + 49, sdk.clamp(y - 37, 40, 220), ['v = ' + sg(m.v, 2) + ' m/s', 'a = −' + g.toFixed(1) + ' m/s²', 'Fg = ' + force.toFixed(1) + ' N ↓'], { id: 'callout.toss' }));
  objects.push(sdk.text('plot.vt.head', 459, 20, 'Velocity over time'), sdk.text('plot.vt.eq', 459 + 190, 20, 'v = ' + u.toFixed(1) + ' − ' + g.toFixed(1) + 't'));
  objects.push(sdk.plot('plot.vt', { x: 459, y: 30, w: 407, h: 294, axes: { x: { label: 'Time since launch', unit: 's', min: 0, max: 1.8 }, y: { label: 'Velocity', unit: 'm/s', min: -5.5, max: 5.5 } },
    series: [{ label: 'v = u − g t', kind: 'line', points: line }, { label: 'now', kind: 'scatter', points: [{ x: m.t, y: m.v }] }] }));
  objects.push(sdk.text('plot.vt.note', 459 + 40, 338, 'Slope a = −' + g.toFixed(1) + ' m/s²'));
  return {
    frame: sdk.frame(objects, { width: 892, height: 358, readouts: [{ id: 'velocity', value: m.v }, { id: 'acceleration', value: -g }, { id: 'force', value: force }, { id: 'motionState', value: where }] }),
    quantities: { launchSpeed: u, gravity: g, mass: mass, apexTime: m.top, apexHeight: m.peak, height: m.h, velocity: m.v, acceleration: -g, force: force },
  };
}`;

const MOTION_LABELS = ['Moving up', 'Still for an instant', 'Moving down'];
const manifest = (title, summary, description, extra) => ({ title, summary, ...PLAN_TEXT, description, ...extra, capabilities: CAPABILITIES });
const timeline = (label, displayOffset, markers) => ({ label, displayOffset, playbackRate: 0.2, markers });

// The three {manifest, source} drafts, keyed by the plan they build. The manifest follows the plan's controls, timeline, readouts and capabilities exactly (the composition checks refuse any difference).
export const TOSS_PROGRAMS = Object.freeze({
  tossOverview: {
    manifest: manifest('The ball stops rising. Gravity doesn’t stop.', 'One tossed ball on a fixed height scale: a motion arrow that shrinks to nothing at the top, and a gravity arrow that never changes.',
      'A ball starts at the launch height and rises and falls on a height scale that does not change with the launch speed. A blue arrow beside it shows its velocity: it shortens while the ball rises, vanishes at the top and points down on the way back. A dashed orange gravity arrow keeps one length and points down throughout. A callout beside the ball names the motion and says gravity pulls down.',
      { inputs: [speed], duration: 10 / 9.8, timeline: timeline('Time since launch', 0, [TOP_MARKER('top', 'Top', TOP)]),
        readouts: [state('motionState', 'Motion', MOTION_LABELS), state('gravityState', 'Gravity', ['Gravity pulls down', 'No pull'])] }),
    source: OVERVIEW_SOURCE,
  },
  tossStandard: {
    manifest: manifest('Zero velocity isn’t zero acceleration.', 'A tossed ball and a ball held at the top height until the top, then released, in two lanes on one height scale.',
      'Two lanes side by side on one height scale from 0 to 2.2 metres. The left lane shows the tossed ball with a blue velocity arrow and a dashed orange acceleration arrow; the right lane shows a second ball held by a gate at the top height until the top, then released. A callout beside each ball gives its velocity and acceleration. After the release both balls have the same height, velocity and acceleration.',
      { inputs: [speed, gravity], duration: 10 / 6, timeline: timeline('Time from the top', -TOP, [TOP_MARKER('before', '-0.10 s', TOP - 0.1), TOP_MARKER('top', 'Top', TOP), TOP_MARKER('after', '+0.10 s', TOP + 0.1)]),
        readouts: [readout('tossedVelocity', 'Toss velocity', 'm/s', 2), readout('tossedAcceleration', 'Toss acceleration', 'm/s^2', 1), readout('dropVelocity', 'Drop velocity', 'm/s', 2), readout('dropAcceleration', 'Drop acceleration', 'm/s^2', 1)] }),
    source: STANDARD_SOURCE,
  },
  tossDeep: {
    manifest: manifest('Zero velocity. Nonzero acceleration.', 'A tossed ball on a height ruler beside the velocity-time line v = u - g t, with its velocity, acceleration and gravitational force.',
      'Left, a ball on a height ruler from 0 to 2.2 metres with a blue velocity arrow, a dashed orange acceleration arrow and a callout giving velocity, acceleration and the downward gravitational force. Right, the velocity against time: a straight line of slope minus g, with a marker that moves with the ball. Mass changes the force only.',
      { inputs: [speed, gravity, mass], duration: 10 / 6, timeline: timeline('Time since launch', 0, [TOP_MARKER('before', 'Top -0.10 s', TOP - 0.1), TOP_MARKER('top', 'Top', TOP), TOP_MARKER('after', 'Top +0.10 s', TOP + 0.1)]),
        readouts: [readout('velocity', 'Velocity', 'm/s', 2), readout('acceleration', 'Acceleration', 'm/s^2', 1), readout('force', 'Gravitational force', 'N', 1), state('motionState', 'Motion', ['Ready to toss', 'Rising', 'At the top', 'Falling', 'Back at launch height'])] }),
    source: DEEP_SOURCE,
  },
});

// What the Scene Builder returns for a plan: an unsealed draft {main, supporting}, a fresh copy each call (callers edit it to make a wrong candidate).
export const tossDraft = name => ({ main: { kind: 'program', program: structuredClone(TOSS_PROGRAMS[name]) }, supporting: [] });

// The program sealed with the sdk-8 (figures) stamps, the tuple the reference plans approve (interact-plan-fixtures.js sdk8).
export async function sealTossProgram(name) {
  const sealed = await sealProgram(structuredClone(TOSS_PROGRAMS[name]), FIGURES_PROGRAM_STAMPS);
  if (!sealed.ok) throw new Error(`toss program ${name} refused: ${sealed.issue}`);
  return sealed.value;
}
