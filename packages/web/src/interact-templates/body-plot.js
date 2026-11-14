import { J, head } from './shared.js';
import { ticksTo } from './two-lane.js';

// Template body-plot: one body on a height ruler (velocity arrow, acceleration arrow, a callout of velocity, acceleration and the downward force) beside the plot of one quantity against time with
// a marker that moves with the body and a note with the slope. roles: scene.slots = { height, velocity, acceleration, force, plotted? } (plotted defaults to velocity).
// shortcut: the plotted line is drawn through its two end points, exact only while the plotted quantity is linear in time (constant acceleration); upgrade when a plan plots a curve.
export const roles = Object.freeze(['height', 'velocity', 'acceleration', 'force']);

export const normalize = slots => slots;
export const lanesOf = () => [];

// The state readout this template reports, worded by the plan's scene.words.
export const states = W => ({ motionState: { label: W.readout.motion, kind: 'state', labels: [W.where.launch, W.where.up, W.where.top, W.where.down, W.where.end], decimals: 0 } });

const ceilTo = (value, step) => Number((Math.ceil(value / step - 1e-9) * step).toFixed(9));

// Geometry: a 640 x 312 frame (the contract's own card size, text 1:1 at the legibility floors), the ruler lane at the left (310 px, 105 px per metre unless the axis needs less to fit in AXIS px), the plot in the
// right 294 px; the plot's time axis runs to the longest timeline end rounded up to 0.2 s, its value axis to the plotted quantity's largest size plus 10% rounded up to 0.5 (ctx.range: rise, end, plotted).
const AXIS = 175;
export const geometry = range => {
  const max = ceilTo(range.rise * 1.05, 0.1), floor = 34 + 34 + AXIS;
  return { width: 640, height: floor + 69, scale: Math.min(105, Math.round(AXIS / max * 1e6) / 1e6), axisMax: max, ticks: ticksTo(max), timeMax: ceilTo(range.end, 0.2), valueMax: ceilTo(range.plotted * 1.1, 0.5), floor, laneW: 310, plotX: 334, plotW: 294, x: 110 };
};

export function source(ctx) {
  const { slots, geometry: geo } = ctx, plotted = slots.plotted ?? slots.velocity;
  return head(ctx, slots) + String.raw`
const W = ${J(ctx.words)};
const U = ${J(ctx.units)};
const READOUTS = ${J(ctx.readoutIds)};
export function evaluate({ inputs, time }) {
  const m = motion(inputs, time), atTop = Math.abs(m.tau) < EPS, qs = quantities(inputs, time);
  const FLOOR = ${J(geo.floor)}, S = ${J(geo.scale)}, X = ${J(geo.x)}, R = 13, PX = ${J(geo.plotX)}, PW = ${J(geo.plotW)}, y = FLOOR - m.h * S, topY = FLOOR - m.peak * S, force = qs[${J(slots.force)}];
  const where = m.launch ? W.where.launch : atTop ? W.where.top : m.ended ? W.where.end : m.v > 0 ? W.where.up : W.where.down;
  const v0 = Q[${J(plotted)}](inputs, 0), line = [{ x: 0, y: v0 }, { x: m.end, y: Q[${J(plotted)}](inputs, m.end) }];
  const objects = [
    sdk.axis('axis.h', { x: 60, y: FLOOR, length: ${J(geo.axisMax)} * S, orientation: 'y', min: 0, max: ${J(geo.axisMax)}, ticks: ${J(geo.ticks)}, label: W.axis.label, unit: U.height }),
    ...sdk.panel({ id: 'lane.toss', x: 12, y: 34, w: ${J(geo.laneW)}, h: FLOOR + 36 - 34, title: W.lane, state: where }),
    sdk.text('label.launch', X + 52, FLOOR + 27, W.launch),
    sdk.line('guide.toss', X, topY, X, FLOOR, { opacity: 0.35 }),
  ];
  if (!m.launch) objects.push(sdk.circle('ghost.toss', X, FLOOR, 2 * R, { opacity: 0.35 }));
  objects.push(sdk.circle('ball.toss', X, y, 2 * R));
  if (Math.abs(m.v) * 12 >= 1) objects.push(...sdk.vector('vec.v', { x: X - 22, y: y }, { value: Math.abs(m.v), direction: m.v > 0 ? 'up' : 'down' }, { scale: 12, minLength: 3, label: W.v, side: m.v > 0 ? 'left' : 'right' }));
  if (Math.abs(m.a) > 1e-9) objects.push(...sdk.vector('vec.a', { x: X + 23, y: y }, { value: Math.abs(m.a), direction: m.a < 0 ? 'down' : 'up' }, { scale: 3.4, label: W.a, side: 'left' }));
  objects.push(...sdk.callout(X + 49, sdk.clamp(y - 37, 40, FLOOR - 79), [W.v + ' = ' + sg(m.v, 2) + ' ' + U.velocity, W.a + ' = ' + sg(m.a, 1) + ' ' + U.acceleration, W.force + ' = ' + force.toFixed(1) + ' ' + U.force + ' ↓'], { id: 'callout.toss' }));
  objects.push(sdk.text('plot.vt.head', PX, 20, W.plot.heading), sdk.text('plot.vt.eq', PX + 172, 20, W.plot.eq + v0.toFixed(1) + (m.a < 0 ? ' − ' : ' + ') + Math.abs(m.a).toFixed(1) + 't'));
  objects.push(sdk.plot('plot.vt', { x: PX, y: 30, w: PW, h: FLOOR + 36 - 30, axes: { x: { label: ${J(ctx.timeline.label)}, unit: ${J(ctx.timeline.unit)}, min: 0, max: ${J(geo.timeMax)} }, y: { label: W.plot.yLabel, unit: U.velocity, min: -${J(geo.valueMax)}, max: ${J(geo.valueMax)} } },
    series: [{ label: W.plot.line, kind: 'line', points: line }, { label: W.plot.now, kind: 'scatter', points: [{ x: m.t, y: qs[${J(plotted)}] }] }] }));
  objects.push(sdk.text('plot.vt.note', PX + 40, FLOOR + 36 + 22, W.plot.slope + sg(m.a, 1) + ' ' + U.acceleration));
  const states = { motionState: where };
  return {
    frame: sdk.frame(objects, { width: ${geo.width}, height: ${geo.height}, readouts: READOUTS.map(id => ({ id: id, value: id in states ? states[id] : qs[id] })) }),
    quantities: qs,
  };
}`;
}
