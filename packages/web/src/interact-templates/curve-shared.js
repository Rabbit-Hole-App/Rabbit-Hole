import { curveRoles } from '../interact-curve-data.js';
import { textWidth } from '../tutor-diagrams/primitives.js';
export const roles = curveRoles;
export const normalize = slots => slots;
export const lanesOf = () => [];
export const states = W => ({
  yAtMarker: { label: W.readout.y, unit: '', decimals: 3 },
  ...(W.readout.slope ? { slope: { label: W.readout.slope, unit: '', decimals: 3 } } : {}),
});
// Native 640 px scene. Both tangent depths use the same plot and legend area.
// The extra top band contains the heading and live subtitle.
export const geometry = (range, tangent = false) => ({
  width: 640, height: 328,
  left: 16 + Math.max(40, Math.ceil(Math.max(...range.axisY.map(v => textWidth(String(v), 13)))) + 18),
  right: 414, top: 68, bottom: 274,
  plot: { x: 16, y: tangent ? 24 : 44, w: 414, h: 274 - (tangent ? 24 : 44) + 49 },
  x: range.x, y: range.axisY, kDefault: range.kDefault,
});
const J = JSON.stringify;
export function source(ctx, tangent = false) {
  const Q = Object.entries(ctx.q).map(([id, expr]) => J(id) + ': (inputs, x) => { const {' + ctx.inputIds.join(', ') + '} = inputs; return ' + expr + '; }').join(',\n');
  return String.raw`
const W = ${J(ctx.words)}, G = ${J(ctx.geometry)}, SLOTS = ${J(ctx.slots)}, READOUTS = ${J(ctx.readoutIds)}, TANGENT = ${tangent};
const Q = { ${Q} };
const fmt = n => n.toFixed(1).replace('-', '−');
function samples(inputs, midpoint, marker) {
  const f = x => Q[SLOTS.y](inputs, x);
  const xs = [G.x[0], G.x[1], midpoint, marker].filter(x => x >= G.x[0] && x <= G.x[1]);
  let points = Array.from(new Set(xs)).sort((a,b) => a-b).map(x => ({x, y:f(x)}));
  while (points.length < 24) {
    let best = -1, split = 0, error = -1;
    for (let i = 0; i < points.length-1; i++) {
      const a = points[i], b = points[i+1];
      for (const t of [0.25, 0.5, 0.75]) {
        const x = a.x + (b.x-a.x)*t, e = Math.abs(f(x) - (a.y + (b.y-a.y)*t));
        if (e > error) { best = i; split = x; error = e; }
      }
    }
    if (best < 0) break;
    points.splice(best+1, 0, {x:split, y:f(split)});
  }
  return points;
}
export function evaluate({inputs}) {
  const markerX = Q.xMarker(inputs, 0), midpoint = Q.x0(inputs, 0), k = Q.k(inputs, 0);
  const quantities = {};
  for (const id of Object.keys(Q)) quantities[id] = Q[id](inputs, markerX);
  const value = quantities[SLOTS.y], slope = quantities[SLOTS.slope];
  const sx = sdk.linear(G.x, [G.left, G.right]), sy = sdk.linear(G.y, [G.bottom, G.top]);
  const state = k < G.kDefault ? W.state.gentler : k > G.kDefault ? W.state.steeper : W.state.default;
  // sdk.plot owns its visible axes. The sdk.axis declarations supply their
  // metadata; they are not drawn a second time or printed twice.
  const ax = sdk.axis('axis.x', {x:G.left, y:G.bottom, length:G.right-G.left, orientation:'x', min:G.x[0], max:G.x[1], label:W.axis.x});
  const ay = sdk.axis('axis.y', {x:G.left, y:G.bottom, length:G.bottom-G.top, orientation:'y', min:G.y[0], max:G.y[1], label:W.axis.y});
  const series = [{label:TANGENT ? W.legend.curve : W.heading, kind:'line', points:samples(inputs, midpoint, markerX)}];
  if (TANGENT) {
    let lo = Math.max(G.x[0], markerX-1), hi = Math.min(G.x[1], markerX+1);
    if (Math.abs(slope) > 1e-15) {
      const a = markerX + (G.y[0]-value)/slope, b = markerX + (G.y[1]-value)/slope;
      lo = Math.max(lo, Math.min(a,b)); hi = Math.min(hi, Math.max(a,b));
    }
    series.push({label:W.legend.tangent, kind:'line', points:[lo,hi].map(x => ({x, y:Math.max(G.y[0], Math.min(G.y[1], value+slope*(x-markerX)))}))});
  }
  const objects = [
    sdk.text('scene.heading', 16, 14, W.heading), sdk.text('scene.state', 438, 14, state),
    sdk.plot('plot.curve', {...G.plot, axes:{x:{min:ax.min,max:ax.max,label:ax.label}, y:{min:ay.min,max:ay.max,label:ay.label}}, series}),
  ];
  // At either bound, guides almost coincide with the plot border; omit them
  // within one marker diameter so the legend and border stay readable.
  if (sy(value)-G.top >= 12 && G.bottom-sy(value) >= 12) objects.push(
    sdk.line('guide.marker.x', sx(markerX), sy(value), sx(markerX), G.bottom, {opacity:0.3}),
    sdk.line('guide.marker.y', G.left, sy(value), sx(markerX), sy(value), {opacity:0.3}),
  );
  objects.push(sdk.circle('ball.marker', sx(markerX), sy(value), 12));
  const lines = [W.marker.heading, W.marker.at + fmt(markerX), ...(TANGENT ? [] : [W.marker.note])];
  objects.push(...sdk.callout(438, sdk.clamp(sy(value)-28, 70, G.bottom-lines.length*28), lines, {id:'callout.marker'}));
  return {frame:sdk.frame(objects, {width:G.width, height:G.height, readouts:READOUTS.map(id => ({id, value:quantities[id]}))}), quantities};
}
`;
}
