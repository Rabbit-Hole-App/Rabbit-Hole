import { J, head } from './shared.js';

// Template two-lane: a first body that is thrown up and a second body held at the first one's top height until its top, then released, in two lanes on one shared height axis; each body has a
// velocity arrow, an acceleration arrow (none while the quantity is zero) and a callout of its two readings; a gate holds the second body. scene.slots = { <firstLane>: { height, velocity, acceleration },
// <secondLane>: {...} } with the plan's own two lane names (for example toss and drop): the lane names make the frame ids (lane.<name>, ball.<name>, vec.v.<name>, callout.<name>, gate.<name>) and, capitalised,
// the lane headings. The second body's quantities are the plan's piecewise formulas (held, then free fall), so the template never computes the release itself: it reads them. The words are the template's.
export const roles = Object.freeze(['height', 'velocity', 'acceleration']);

export const words = Object.freeze({
  first: { where: { launch: 'At launch', top: 'At the top', end: 'At launch height', up: 'Rising', down: 'Falling' } },
  second: { where: { held: 'Held in place', released: 'Just released', end: 'At launch height', falling: 'Falling together' } },
  launch: 'Launch height', axis: { label: 'Height' }, v: 'v', a: 'a',
  states: {},
});

// Both lanes, in the plan's order: the first rises, the second is the held body.
export const normalize = slots => slots;
export const lanesOf = slots => Object.keys(slots);
const title = name => name.charAt(0).toUpperCase() + name.slice(1);

const ceilTo = (value, step) => Number((Math.ceil(value / step - 1e-9) * step).toFixed(9));
// The fewest ticks that stay readable: the smallest step from the list that gives at most six.
export const ticksTo = max => { const step = [0.1, 0.2, 0.5, 1, 2, 5, 10].find(s => Math.floor(max / s + 1e-9) + 1 <= 6) ?? 10; return Array.from({ length: Math.floor(max / step + 1e-9) + 1 }, (_, i) => Number((i * step).toFixed(9))); };

// Geometry: a 892 x 358 frame, two 407 px lanes, 105 px per metre unless the axis (the highest rise over the input domain plus 5%, rounded up to 0.1 m) needs less.
export const geometry = range => {
  const max = ceilTo(range.rise * 1.05, 0.1);
  return { width: 892, height: 358, scale: Math.min(105, 231 / max), axisMax: max, ticks: ticksTo(max) };
};

export function source(ctx) {
  const { slots, geometry: geo } = ctx, [first, second] = lanesOf(slots), toss = slots[first], drop = slots[second];
  return head(ctx, toss) + String.raw`
const W = ${J(words)};
const U = ${J(ctx.units)};
const READOUTS = ${J(ctx.readoutIds)};
const A = ${J(first)}, B = ${J(second)}, TITLE = ${J({ [first]: title(first), [second]: title(second) })}, DROP = ${J(drop)};
export function evaluate({ inputs, time }) {
  const m = motion(inputs, time), atTop = Math.abs(m.tau) < EPS, qs = quantities(inputs, time), base = Q[${J(toss.height)}](inputs, 0);
  const FLOOR = 299, S = ${J(geo.scale)}, R = 15, released = m.tau >= -EPS, peakY = FLOOR - m.peak * S;
  const drop = { h: snap(qs[DROP.height] - base), v: qs[DROP.velocity], a: qs[DROP.acceleration] };
  const lane = (tag, title, x0, where, body) => {
    const x = x0 + 142, y = FLOOR - body.h * S, out = [...sdk.panel({ id: 'lane.' + tag, x: x0, y: 34, w: 407, h: 300, title: title, state: where }),
      sdk.text('label.launch.' + tag, x0 + 196, FLOOR + 27, W.launch), sdk.line('guide.' + tag, x, peakY, x, FLOOR, { opacity: 0.35 })];
    return { x, y, out };
  };
  const firstWhere = m.launch ? W.first.where.launch : atTop ? W.first.where.top : m.ended ? W.first.where.end : m.v > 0 ? W.first.where.up : W.first.where.down;
  const secondWhere = !released ? W.second.where.held : atTop ? W.second.where.released : m.ended ? W.second.where.end : W.second.where.falling;
  const L1 = lane(A, TITLE[A], 26, firstWhere, { h: m.h }), L2 = lane(B, TITLE[B], 459, secondWhere, drop);
  const ghosts = released && m.tau > EPS;
  const arrows = (tag, x, y, v, a) => {
    const out = Math.abs(v) * 12 < 1 ? [sdk.circle('vec.v.' + tag + '.zero', x - 26, y, 6, { role: 'input' })]
      : sdk.vector('vec.v.' + tag, { x: x - 26, y: y }, { value: Math.abs(v), direction: v > 0 ? 'up' : 'down' }, { scale: 12, minLength: 3, label: W.v, side: v > 0 ? 'left' : 'right' });
    if (Math.abs(a) > 1e-9) out.push(...sdk.vector('vec.a.' + tag, { x: x + 25, y: y }, { value: Math.abs(a), direction: a < 0 ? 'down' : 'up' }, { scale: 3.4, label: W.a, side: 'left' }));
    out.push(...sdk.callout(x + 52, sdk.clamp(y - 29, 40, 248), [W.v + ' = ' + sg(v, 2) + ' ' + U.velocity, W.a + ' = ' + sg(a, 1) + ' ' + U.acceleration], { id: 'callout.' + tag }));
    return out;
  };
  const objects = [sdk.axis('axis.h', { x: 60, y: FLOOR, length: ${J(geo.axisMax)} * S, orientation: 'y', min: 0, max: ${J(geo.axisMax)}, ticks: ${J(geo.ticks)}, label: W.axis.label, unit: U.height }), ...L1.out, ...L2.out];
  if (ghosts) objects.push(sdk.circle('ghost.' + A, L1.x, peakY, 2 * R, { opacity: 0.35 }), sdk.circle('ghost.' + B, L2.x, peakY, 2 * R, { opacity: 0.35 }));
  objects.push(...sdk.gate('gate.' + B, L2.x, peakY + R, { w: 46, open: released }));
  objects.push(sdk.circle('ball.' + A, L1.x, L1.y, 2 * R), sdk.circle('ball.' + B, L2.x, L2.y, 2 * R));
  objects.push(...arrows(A, L1.x, L1.y, m.v, m.a), ...arrows(B, L2.x, L2.y, drop.v, drop.a));
  return {
    frame: sdk.frame(objects, { width: ${geo.width}, height: ${geo.height}, readouts: READOUTS.map(id => ({ id: id, value: qs[id] })) }),
    quantities: qs,
  };
}`;
}
