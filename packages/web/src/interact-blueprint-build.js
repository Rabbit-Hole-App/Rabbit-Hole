// Build, the pure half (Brief 38 spec section 6): what code works out from a checked blueprint and what the Program is made of. No model, no renderer, no layout here: interact-templates/blueprint.js places
// the card with the layout module, interact-blueprint-check.js measures. Nothing in this file names a subject or branches on an id, a label or a title of a blueprint.
import { DEFAULT_DECIMALS, LABEL_GAP_PX, DOT_MAX_PX, DOT_MIN_PX, DOT_NAMED_PX, GRAPH_SAMPLES, KEPT_SAMPLES, SAMPLE_POSITIONS, SAMPLE_TIMES, THING_ROLES, TRACE_POINTS, Y_MARGIN } from './interact-blueprint-constants.js';

export const defaultsOf = blueprint => Object.fromEntries(blueprint.inputs.map(input => [input.id, input.default]));
const evenly = (min, max, count) => Array.from({ length: count }, (_, k) => (count === 1 ? min : min + (max - min) * k / (count - 1)));
const clean = value => Math.round(value * 1e9) / 1e9; // 0.1 + 0.2 is shown and compared as 0.3
export const timesOf = (blueprint, count) => evenly(0, blueprint.time.duration, count).map(clean);

// The settings the checks try (spec section 5): the defaults; each control in turn at every sampled position with the others at their defaults; every number control at its minimum together, then at its maximum together.
export function settingsGrid(blueprint) {
  const base = defaultsOf(blueprint), grid = [{ name: 'the defaults', inputs: base, changed: [] }];
  for (const input of blueprint.inputs) {
    const values = input.type === 'number' ? evenly(input.min, input.max, SAMPLE_POSITIONS).map(clean) : input.type === 'select' ? input.options.map(option => option.value) : [false, true];
    for (const value of values) if (value !== base[input.id]) grid.push({ name: `${input.id} = ${value}`, inputs: { ...base, [input.id]: value }, changed: [input.id] });
  }
  const numbers = blueprint.inputs.filter(input => input.type === 'number');
  if (numbers.length > 1) for (const end of ['min', 'max']) grid.push({ name: `every number control at its ${end === 'min' ? 'minimum' : 'maximum'}`, inputs: { ...base, ...Object.fromEntries(numbers.map(input => [input.id, input[end]])) }, changed: numbers.map(input => input.id) });
  return grid;
}

// ---- parts ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The points of a part, each a pair of coordinates (a number or an output id). A dot is one point; a line or an arrow two; a trace the point it follows. A label has no position of its own (it is near a part, and code places it, brief 43);
// a stored blueprint whose label still has `at` (brief 41's) contributes that point.
export const pointsOf = part => (part.type === 'line' || part.type === 'arrow' ? [part.from, part.to] : part.type === 'label' ? (part.at ? [part.at] : []) : part.type === 'rect' ? [part.at] : [part.at]);
export const outputsOfPart = part => [...pointsOf(part).flat(), ...(part.type === 'dot' ? [part.size] : [])].filter(entry => typeof entry === 'string' && !['small', 'medium', 'large'].includes(entry));
const at = (entry, out) => (typeof entry === 'number' ? entry : out[entry]);
export const resolve = (point, out) => [at(point[0], out), at(point[1], out)];

// The reach of all the parts over every row: the smallest box (x and y in the lesson's units, y up) that holds every point at every setting and time.
export function reachOf(blueprint, rows) {
  const reach = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const out of rows) for (const part of blueprint.pictures.main.parts) for (const point of pointsOf(part)) {
    const [x, y] = resolve(point, out);
    reach.minX = Math.min(reach.minX, x); reach.maxX = Math.max(reach.maxX, x); reach.minY = Math.min(reach.minY, y); reach.maxY = Math.max(reach.maxY, y);
  }
  return reach;
}

// One scale for both axes (y up) fits the reach into the picture's box with room all round, centred. A reach that is one point has no scale.
export function fitWindow(reach, box, pad) {
  const spanX = reach.maxX - reach.minX, spanY = reach.maxY - reach.minY, room = [box[2] - 2 * pad, box[3] - 2 * pad];
  const candidates = [spanX > 0 ? room[0] / spanX : Infinity, spanY > 0 ? room[1] / spanY : Infinity], s = Math.min(...candidates);
  if (!Number.isFinite(s) || s <= 0) return null;
  const r4 = value => Math.round(value * 1e4) / 1e4;
  return { s: r4(s), ox: r4(box[0] + pad + (room[0] - spanX * s) / 2 - reach.minX * s), oy: r4(box[1] + pad + (room[1] - spanY * s) / 2 + reach.maxY * s) };
}

// ---- roles ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// A thing's colour comes from its position, as the renderer colours the lines of a graph: the series are ordered by the position of their thing, the things that have a line take the first colours in that
// order and the others follow in their own order. So a line, its dot and every part and value that is of the same thing agree whenever each line has a thing of its own.
export function rolesOf(blueprint) {
  const position = Object.fromEntries(blueprint.things.map((thing, k) => [thing.id, k]));
  const series = (blueprint.pictures.panel?.series ?? []).map((entry, k) => ({ ...entry, k })).sort((a, b) => (position[a.of] ?? 99) - (position[b.of] ?? 99) || a.k - b.k);
  const order = [...new Set([...series.map(entry => entry.of), ...blueprint.things.map(thing => thing.id)])].filter(id => id in position);
  return { things: Object.fromEntries(order.map((id, k) => [id, THING_ROLES[k]])), series: series.map((entry, k) => ({ value: entry.value, label: entry.label, of: entry.of, role: THING_ROLES[k] })) };
}

// ---- texts ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const unitText = unit => (!unit ? '' : unit === '°' || unit === '%' ? unit : ` ${unit}`);
export const valueText = (entry, number) => `${entry.label}: ${number.toFixed(entry.decimals ?? DEFAULT_DECIMALS)}${unitText(entry.unit)}`;

// The lines the explanation shows at one state: every `always` line, then the text of the first case whose flag is true, else `otherwise`.
export const linesAt = (blueprint, out) => {
  const hit = blueprint.explanation.cases.find(entry => out[entry.when] === true);
  return [...blueprint.explanation.always, ...(hit ? [hit.text] : blueprint.explanation.otherwise !== undefined ? [blueprint.explanation.otherwise] : [])];
};

// ---- the guest functions: plain functions with no free variable, written once, run natively by the checker and embedded in the Program text with toString() ---------------------------
// Indices of the samples to keep: both ends, every turning point, then midpoints of the widest gaps while room remains (at most `max`); each index at most once, in order, so no two samples share an x.
export function keepIndices(ys, max) {
  const n = ys.length, spread = Math.max(...ys) - Math.min(...ys), eps = 1e-9 * (spread || 1), keep = new Set([0, n - 1]);
  let last = 0;
  for (let i = 1; i < n; i++) { const d = ys[i] - ys[i - 1], sign = Math.abs(d) <= eps ? 0 : d > 0 ? 1 : -1; if (sign !== 0) { if (last !== 0 && sign !== last) keep.add(i - 1); last = sign; } }
  let kept = [...keep].sort((a, b) => a - b);
  if (kept.length > max) kept = kept.filter((_, k) => k === 0 || k === kept.length - 1 || k % Math.ceil(kept.length / (max - 1)) === 0).slice(0, max - 1).concat(n - 1).filter((v, k, all) => all.indexOf(v) === k);
  while (kept.length < max) {
    let gap = 0, from = -1;
    for (let k = 1; k < kept.length; k++) if (kept[k] - kept[k - 1] > gap) { gap = kept[k] - kept[k - 1]; from = k - 1; }
    if (gap < 2) break;
    kept.splice(from + 1, 0, kept[from] + Math.floor(gap / 2));
  }
  return kept;
}
// The number of turning points of a line sampled at equal steps (a change of direction between two moves, a rest in between ignored).
export function turnsOf(ys) {
  const spread = Math.max(...ys) - Math.min(...ys), eps = 1e-9 * (spread || 1);
  let last = 0, turns = 0;
  for (let i = 1; i < ys.length; i++) { const d = ys[i] - ys[i - 1], sign = Math.abs(d) <= eps ? 0 : d > 0 ? 1 : -1; if (sign !== 0) { if (last !== 0 && sign !== last) turns++; last = sign; } }
  return turns;
}
// One curve for the plot from samples at equal steps of x: the kept samples, y clamped to the range as the last guard, x rounded so it still rises.
export function curveOf(xs, ys, range, max) {
  const out = { x: [], y: [] };
  for (const i of keepIndices(ys, max)) {
    const x = Math.round(xs[i] * 1e6) / 1e6, y = Math.round(Math.min(range[1], Math.max(range[0], ys[i])) * 1e4) / 1e4;
    if (out.x.length && x <= out.x[out.x.length - 1]) continue;
    out.x.push(x); out.y.push(y);
  }
  return out;
}
// The /explain coordinate-plot spec: the same structure at every setting and time, only the samples differ. An empty unit is left out (the parser refuses blank text).
export function specOf(plot, curves) {
  const axis = (a, range) => ({ label: a.label, min: range[0], max: range[1], ...(a.unit ? { unit: a.unit } : {}) });
  return { version: 1, diagram: { kind: 'coordinate-plot', title: plot.title, x: axis(plot.x, plot.xRange), y: axis(plot.y, plot.yRange), series: plot.series.map((entry, k) => ({ label: entry.label, kind: 'line', samples: { x: curves[k].x, y: curves[k].y } })) } };
}
// The drawn curve of the renderer (a Steffen monotone cubic, tutor-diagrams/plot-lines.js monotoneLinePath) at x: where a marker dot sits so it stays on the line.
export function splineAt(xs, ys, t) {
  const n = xs.length;
  if (n < 2) return ys[0];
  const dx = [], s = [], m = [];
  for (let i = 1; i < n; i++) { dx.push(xs[i] - xs[i - 1]); s.push((ys[i] - ys[i - 1]) / dx[i - 1]); }
  for (let i = 1; i < n - 1; i++) { const l = s[i - 1], r = s[i], sign = Math.sign(l); m.push(sign !== Math.sign(r) ? 0 : sign * Math.min(2 * Math.abs(l), 2 * Math.abs(r), Math.abs((l * dx[i] + r * dx[i - 1]) / (dx[i - 1] + dx[i])))); }
  if (n === 2) return ys[0] + (ys[1] - ys[0]) * (t - xs[0]) / dx[0];
  m.unshift((3 * s[0] - m[0]) / 2); m.push((3 * s[n - 2] - m[m.length - 1]) / 2);
  let i = 0;
  while (i < n - 2 && t > xs[i + 1]) i++;
  const h = dx[i], u = (t - xs[i]) / h, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h * m[i] + (3 * u2 - 2 * u3) * ys[i + 1] + (u3 - u2) * h * m[i + 1];
}
// A dot's diameter in px: a named size, or an output between 0 and 1 mapped across the dot range (clamped).
export function diameterOf(size, out, named, low, high) { return named[size] !== undefined ? named[size] : low + Math.min(1, Math.max(0, out[size])) * (high - low); }

// Where a label's text goes (brief 43): the centre of its text box on the first of above, below, right, left of `ext` (the extent [x0, y0, x1, y1] of the part it is near, in px, y down) at `gap` px, whose box is inside `bounds` and
// clear of every obstacle by frame-overlap.js's rules: a line or an arrow shaft 8 px (a mark under 16 px long: not touching), a circle, an arrowhead or another label's box not at all. -> { x, y } (x the middle of the text, y the centre
// of its line: the text is drawn at y + 4.9) or null when no side is clear. w is the text's width; the box is the text's ink and its estimate together, so a label that passes here passes the host's rules.
// An obstacle is { s: [x1, y1, x2, y2] } (a segment) or { b: [xMin, yMin, xMax, yMax] } (a box).
export function labelSpot(ext, w, gap, obstacles, bounds) {
  const up = 5.9, down = 10.8, cx = (ext[0] + ext[2]) / 2, cy = (ext[1] + ext[3]) / 2;
  const tries = [[cx, ext[1] - gap - down], [cx, ext[3] + gap + up], [ext[2] + gap + w / 2, cy - 2.45], [ext[0] - gap - w / 2, cy - 2.45]];
  const distance = (s, box) => {
    const a = { x: s[0], y: s[1] }, b = { x: s[2], y: s[3] }, inside = p => p.x >= box[0] && p.x <= box[2] && p.y >= box[1] && p.y <= box[3];
    if (inside(a) || inside(b)) return 0;
    const corners = [{ x: box[0], y: box[1] }, { x: box[2], y: box[1] }, { x: box[2], y: box[3] }, { x: box[0], y: box[3] }];
    const crosses = (p, q, r, t) => { const d = (q.x - p.x) * (t.y - r.y) - (q.y - p.y) * (t.x - r.x); if (!d) return false; const u = ((r.x - p.x) * (t.y - r.y) - (r.y - p.y) * (t.x - r.x)) / d, v = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / d; return u >= 0 && u <= 1 && v >= 0 && v <= 1; };
    if (corners.some((c, i) => crosses(a, b, c, corners[(i + 1) % 4]))) return 0;
    const onSegment = p => { const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy, u = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0; return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy)); };
    const toBox = p => Math.hypot(Math.max(box[0] - p.x, 0, p.x - box[2]), Math.max(box[1] - p.y, 0, p.y - box[3]));
    return Math.min(toBox(a), toBox(b), ...corners.map(onSegment));
  };
  for (const [x, y] of tries) {
    const box = [x - w / 2, y - up, x + w / 2, y + down];
    if (box[0] < bounds[0] || box[1] < bounds[1] || box[2] > bounds[2] || box[3] > bounds[3]) continue;
    const blocked = obstacles.some(o => (o.s ? distance(o.s, box) < (Math.hypot(o.s[2] - o.s[0], o.s[3] - o.s[1]) < 16 ? 1 : 9) : Math.min(box[2], o.b[2]) - Math.max(box[0], o.b[0]) > -1 && Math.min(box[3], o.b[3]) - Math.max(box[1], o.b[1]) > -1));
    if (!blocked) return { x, y };
  }
  return null;
}

// The y range of a graph: the sampled range widened by Y_MARGIN each side, then rounded outward to a step of one tenth of the range's order of magnitude.
export function yRangeOf(values) {
  const lo = Math.min(...values), hi = Math.max(...values), spread = hi - lo || Math.max(Math.abs(hi), 1), pad = spread * Y_MARGIN;
  const step = 10 ** (Math.floor(Math.log10(spread + 2 * pad)) - 1);
  const down = Math.floor((lo - pad) / step) * step, up = Math.ceil((hi + pad) / step) * step, r = value => Math.round(value * 1e9) / 1e9;
  return [r(down), r(up)];
}

// ---- the Program ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// One source text: the data it needs and the placed boxes embedded as JSON, the model's function embedded as written inside a wrapper that hides everything of ours, and our own evaluate.
// `data` = { P: what evaluate reads of the blueprint, L: the placed boxes }, made by interact-templates/blueprint.js.
export function programSource(code, data) {
  // A Worker bundle (esbuild keepNames) wraps the helper functions in __name(...) calls that toString() carries into the guest text; the guest gets the same no-op the bundler's own helper is.
  return `const __name = target => target;
const compute = (function (sdk, P, L, evaluate, keepIndices, curveOf, specOf, splineAt, diameterOf, labelSpot) {
${code}
;
return compute;
})(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined);
const P = ${JSON.stringify(data.P)}, L = ${JSON.stringify(data.L)}, NAMED = ${JSON.stringify(DOT_NAMED_PX)};
${[keepIndices, curveOf, specOf, splineAt, diameterOf, labelSpot].map(fn => fn.toString()).join('\n')}
const grid = (a, b, n) => { const out = []; for (let k = 0; k < n; k++) out.push(a + (b - a) * k / (n - 1)); return out; };
const X = x => L.window.ox + x * L.window.s, Y = y => L.window.oy - y * L.window.s;
export function evaluate({ inputs, time }) {
  const t = Math.min(Math.max(time || 0, 0), P.duration), set = { ...P.defaults, ...inputs }, out = compute(set, t), objects = [];
  const num = v => (typeof v === 'number' ? v : out[v]), extents = {}, obstacles = [];
  for (const part of P.parts) {
    const id = 'part.' + part.id, opts = { role: part.role };
    if (part.type === 'line') { const x1 = X(num(part.from[0])), y1 = Y(num(part.from[1])), x2 = X(num(part.to[0])), y2 = Y(num(part.to[1])); objects.push(sdk.line(id, x1, y1, x2, y2, opts)); extents[part.id] = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]; obstacles.push({ s: [x1, y1, x2, y2] }); }
    else if (part.type === 'arrow') {
      const x1 = X(num(part.from[0])), y1 = Y(num(part.from[1])), x2 = X(num(part.to[0])), y2 = Y(num(part.to[1])), length = Math.hypot(x2 - x1, y2 - y1);
      objects.push(sdk.arrow(id, x1, y1, x2, y2, part.label ? { role: part.role, text: part.label } : opts)); extents[part.id] = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]; obstacles.push({ s: [x1, y1, x2, y2] });
      if (length) { const dx = (x2 - x1) / length, dy = (y2 - y1) / length, tip = Math.min(7, length), bx = x2 - dx * tip, by = y2 - dy * tip, hx = [x2, bx - dy * 3.4, bx + dy * 3.4], hy = [y2, by + dx * 3.4, by - dx * 3.4]; obstacles.push({ b: [Math.min(...hx), Math.min(...hy), Math.max(...hx), Math.max(...hy)] }); }
    }
    else if (part.type === 'dot') { const x = X(num(part.at[0])), y = Y(num(part.at[1])), d = diameterOf(part.size, out, NAMED, ${DOT_MIN_PX}, ${DOT_MAX_PX}); objects.push(sdk.circle(id, x, y, d, opts)); extents[part.id] = [x - d / 2, y - d / 2, x + d / 2, y + d / 2]; obstacles.push({ b: extents[part.id] }); }
    else if (part.type === 'trace' && t > 0) {
      const n = Math.min(${TRACE_POINTS - 1}, Math.max(1, Math.round(t / P.duration * ${TRACE_POINTS - 1}))), points = [];
      for (let k = 0; k <= n; k++) { const o = compute(set, t * k / n); points.push([X(o[part.at[0]]), Y(o[part.at[1]])]); }
      objects.push(sdk.polyline(id, points, opts)); extents[part.id] = [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
    }
  }
  // A label is placed here, never by the model (brief 43): beside the part it is near, on the first side that is clear; no clear side leaves it out of this frame (the checker counts it). A stored label with at is placed around that point.
  for (const part of P.parts) if (part.type === 'label') {
    const ext = part.near !== undefined ? extents[part.near] : part.at ? [X(num(part.at[0])), Y(num(part.at[1])), X(num(part.at[0])), Y(num(part.at[1]))] : null;
    if (!ext) continue;
    const w = L.labelWidths[part.id], spot = labelSpot(ext, w, ${LABEL_GAP_PX}, obstacles, L.stageBounds);
    if (!spot) continue;
    objects.push(sdk.text('part.' + part.id, spot.x, spot.y + 4.9, part.text, { align: 'middle', role: part.role }));
    obstacles.push({ b: [spot.x - w / 2, spot.y - 5.9, spot.x + w / 2, spot.y + 10.8] });
  }
  if (P.plot) {
    const plot = P.plot, over = plot.over, xs = over === 'time' ? grid(0, P.duration, ${GRAPH_SAMPLES}) : grid(plot.xRange[0], plot.xRange[1], ${GRAPH_SAMPLES}), nowX = over === 'time' ? t : set[over];
    const rows = xs.map(x => (over === 'time' ? compute(set, x) : compute({ ...set, [over]: x }, t))), curves = plot.series.map(entry => curveOf(xs, rows.map(row => row[entry.value]), plot.yRange, ${KEPT_SAMPLES}));
    objects.push(sdk.diagram(specOf(plot, curves), { x: L.figure.at[0], y: L.figure.at[1], w: L.figure.w }));
    const G = L.plotGeometry, A = G.plotArea, F = { left: L.figure.at[0] + A.left, right: L.figure.at[0] + A.right, top: L.figure.at[1] + A.top, bottom: L.figure.at[1] + A.bottom };
    const nowPx = F.left + (nowX - G.x.min) / (G.x.max - G.x.min) * (F.right - F.left), yPx = y => F.top + (G.y.max - y) / (G.y.max - G.y.min) * (F.bottom - F.top);
    objects.push(sdk.line('now', nowPx, F.top, nowPx, F.bottom, { role: 'neutral' }));
    plot.series.forEach((entry, k) => objects.push(sdk.circle('dot.' + k, nowPx, yPx(splineAt(curves[k].x, curves[k].y, nowX)), ${DOT_MIN_PX}, { role: entry.role })));
  }
  L.values.forEach((entry, k) => {
    const unit = !entry.unit ? '' : entry.unit === '°' || entry.unit === '%' ? entry.unit : ' ' + entry.unit;
    objects.push(sdk.box('value.' + k, entry.box[0], entry.box[1], entry.box[2], entry.box[3], { role: 'neutral', text: entry.label + ': ' + out[entry.value].toFixed(entry.decimals) + unit }), sdk.circle('chip.' + k, entry.dot[0], entry.dot[1], entry.dot[2], { role: entry.role }));
  });
  if (L.formula) objects.push(sdk.math('formula', L.formula.at[0], L.formula.at[1] + 5.25, P.formula, { align: L.formula.align, role: 'neutral' }));
  const hit = P.cases.find(entry => out[entry.when] === true), lines = [...P.always, ...(hit ? [hit.text] : P.otherwise !== undefined ? [P.otherwise] : [])];
  if (L.explanation.kind === 'box') objects.push(sdk.box('note', L.explanation.box[0], L.explanation.box[1], L.explanation.box[2], L.explanation.box[3], { role: 'neutral', text: lines[0] }));
  else L.explanation.ys.forEach((cy, k) => objects.push(sdk.text('line.' + k, L.explanation.x, cy + 4.9, L.bullet + lines[k], { align: 'start', role: 'neutral' })));
  const quantities = {};
  for (const id of P.quantityIds) quantities[id] = typeof out[id] === 'boolean' ? (out[id] ? 1 : 0) : out[id];
  return { frame: sdk.frame(objects, { width: 640, height: 400 }), quantities };
}`;
}
