import { J, head } from './shared.js';

// Template one-body: one body moving along a vertical in one lane, a velocity arrow beside it, a constant-length acceleration arrow, a callout naming the motion, and the launch-height guide.
// roles: the quantities it reads (scene.slots): height, velocity, acceleration, apexTime, apexHeight. The words are the template's (the plan holds no lane or state wording); the program and the plan
// supply every number. Frame ids follow the renderer's conventions (frame-look.js): lane.toss, ball.toss, vec.v, vec.a, callout.toss.
export const roles = Object.freeze(['height', 'velocity', 'acceleration', 'apexTime', 'apexHeight']);

export const words = Object.freeze({
  lane: 'One toss', launch: 'Launch height', gravity: { pulls: 'Gravity pulls down', none: 'No pull' },
  motion: { up: 'Moving up', top: 'Still for an instant', down: 'Moving down' },
  where: { launch: 'At launch', top: 'At the top', end: 'Back at launch height', up: 'Rising', down: 'Falling' },
  // the state readouts this template knows how to report (id -> the manifest definition)
  states: {
    motionState: { label: 'Motion', kind: 'state', labels: ['Moving up', 'Still for an instant', 'Moving down'], decimals: 0 },
    gravityState: { label: 'Gravity', kind: 'state', labels: ['Gravity pulls down', 'No pull'], decimals: 0 },
  },
});

// Geometry: a 892 x 388 frame, one lane across it, 200 px per metre unless the plan's highest rise needs less (ctx.range.rise is the largest height above launch over the input domain).
export const geometry = range => ({ width: 892, height: 388, scale: Math.min(200, 256 / range.rise) });

export function source(ctx) {
  const { slots, geometry: geo } = ctx;
  return head(ctx, slots) + String.raw`
const W = ${J(words)};
const READOUTS = ${J(ctx.readoutIds)};
export function evaluate({ inputs, time }) {
  const m = motion(inputs, time), atTop = Math.abs(m.tau) < EPS, qs = quantities(inputs, time);
  const FLOOR = 315, S = ${J(geo.scale)}, X = 348, R = 18, y = FLOOR - m.h * S, pulls = m.a < 0;
  const word = atTop ? W.motion.top : m.v > 0 ? W.motion.up : W.motion.down;
  const where = m.launch ? W.where.launch : atTop ? W.where.top : m.ended ? W.where.end : m.v > 0 ? W.where.up : W.where.down;
  const objects = [
    ...sdk.panel({ id: 'lane.toss', x: 18, y: 34, w: 856, h: 330, title: W.lane, state: where }),
    sdk.line('guide.launch', 36, FLOOR, 856, FLOOR, { opacity: 0.5 }),
    sdk.text('label.launch', 36, FLOOR + 26, W.launch),
    sdk.line('guide.toss', X, FLOOR, X, y, { opacity: 0.35 }),
  ];
  if (!m.launch) objects.push(sdk.circle('ghost.toss', X, FLOOR, 2 * R, { opacity: 0.35 }));
  objects.push(sdk.circle('ball.toss', X, y, 2 * R));
  // A letter keeps 14 px off the ground line (the 8 px label clearance plus half its height): it moves along its arrow, beside it, never onto the line.
  const clear = parts => { const letter = parts.find(o => o.kind === 'text'); if (letter && Math.abs(letter.y - FLOOR) < 14) letter.y = FLOOR + (letter.y < FLOOR ? -14 : 14); return parts; };
  if (!atTop) objects.push(...clear(sdk.vector('vec.v', { x: X - 31, y: y }, { value: Math.abs(m.v), direction: m.v > 0 ? 'up' : 'down' }, { scale: 12, minLength: 3, label: 'v', side: m.v > 0 ? 'left' : 'right' })));
  if (Math.abs(m.a) > 1e-9) objects.push(...clear(sdk.vector('vec.a', { x: X + 31, y: y }, { value: Math.abs(m.a), direction: pulls ? 'down' : 'up' }, { scale: 48 / Math.abs(m.a), label: 'a', side: 'left' })));
  objects.push(...sdk.callout(X + 61, sdk.clamp(y - 24, 40, 272), [word, pulls ? W.gravity.pulls : W.gravity.none], { id: 'callout.toss' }));
  const states = { motionState: word, gravityState: pulls ? W.gravity.pulls : W.gravity.none };
  return {
    frame: sdk.frame(objects, { width: ${geo.width}, height: ${geo.height}, readouts: READOUTS.map(id => ({ id: id, value: id in states ? states[id] : qs[id] })) }),
    quantities: qs,
  };
}`;
}
