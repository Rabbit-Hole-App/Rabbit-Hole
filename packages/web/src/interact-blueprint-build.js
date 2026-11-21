// Build, the pure half (Brief 38 spec section 6): what code works out from a checked blueprint and what the Program is made of. No model, no renderer, no layout here: interact-templates/blueprint.js places
// the card with the layout module, interact-blueprint-check.js measures. Nothing in this file names a subject or branches on an id, a label or a title of a blueprint.
import { ARROW_DOT_GAP_PX, DEFAULT_DECIMALS, LABEL_GAPS_PX, DOT_MAX_PX, DOT_MIN_PX, DOT_NAMED_PX, GRAPH_SAMPLES, KEPT_SAMPLES, SAMPLE_POSITIONS, SAMPLE_TIMES, THING_ROLES, TRACE_POINTS, Y_MARGIN } from './interact-blueprint-constants.js';

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

// The y range of a graph: the sampled range widened by Y_MARGIN each side, then rounded outward to a step of one tenth of the range's order of magnitude.
export function yRangeOf(values) {
  const lo = Math.min(...values), hi = Math.max(...values), spread = hi - lo || Math.max(Math.abs(hi), 1), pad = spread * Y_MARGIN;
  const step = 10 ** (Math.floor(Math.log10(spread + 2 * pad)) - 1);
  const down = Math.floor((lo - pad) / step) * step, up = Math.ceil((hi + pad) / step) * step, r = value => Math.round(value * 1e9) / 1e9;
  return [r(down), r(up)];
}

// ---- the Program writer (Brief 46, spec section 11) ------------------------------------------------------------------------------------------------------------------------------------
// Every placement decision comes from the build-schema: the layout id (its boxes are the config's), the mapping (scene px, y down: x_px = originPx[0] + x*pxPerUnit, y_px = originPx[1] - y*pxPerUnit), the fixed parts in units, each label beside its `near` part on
// its side, each arrow's lengthFactor and startAtEdge, the kind picture's parts, texts and ranges, the values, formula and explanation in the given arrangement, the time. Computed parts come from the model's function through the mapping every frame.
// The writer has no judgment: no window from the reach, no search for a label's place, no wrapping of a note. It keeps ONE rule, once, for motion decoration: a label that would land on a part in a frame, and an arrow shorter than its dot's radius, are left out of that frame.
// -> { source, placed } ; `placed` is what the writer worked out from the config (boxes, the plot's measured geometry), for the host's manifest and the reports.
import CONFIG from './interact-card.config.json' with { type: 'json' };
import { VALUE_DOT, valueBoxes } from './interact-layout.js';
import { textWidthPx } from './interact-description-fit.js';
import { renderTutorDiagram } from './tutor-diagrams/TutorDiagram.js';

const r2 = value => Math.round(value * 100) / 100;
const FRAME = [0, 0, CONFIG.scene.width, CONFIG.scene.height];
const labelWidth = text => Math.ceil(Math.max(String(text).length * CONFIG.text.bodySize * 0.6, textWidthPx(String(text), CONFIG.text.bodySize))) + 2;

// Where a label's text box is on one side of the extent `ext` = [x0, y0, x1, y1] of the part it is near (px, y down), at `gap` px; `side` is one of eight. The box is the text's ink and its estimate together (8 px clear of a line is the frame rule, the gap is that and 4 px).
// -> { x, y } (x the middle of the text, y the centre of its line: the text is drawn at y + 4.9) or null when the box is outside `bounds` or touches an obstacle ({ s: [x1, y1, x2, y2] } a segment kept 8 px away, a mark under 16 px not touched; { b: [xMin, yMin, xMax, yMax] } a box not touched).
export function labelAt(ext, w, side, gap, obstacles, bounds) {
  const up = 5.9, down = 10.8, cx = (ext[0] + ext[2]) / 2, cy = (ext[1] + ext[3]) / 2;
  const above = ext[1] - gap - down, below = ext[3] + gap + up, right = ext[2] + gap + w / 2, left = ext[0] - gap - w / 2, middle = cy - 2.45;
  const spot = { above: [cx, above], below: [cx, below], right: [right, middle], left: [left, middle], 'above-right': [right, above], 'above-left': [left, above], 'below-right': [right, below], 'below-left': [left, below] }[side];
  if (!spot) return null;
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
  const [x, y] = spot, box = [x - w / 2, y - up, x + w / 2, y + down];
  if (box[0] < bounds[0] || box[1] < bounds[1] || box[2] > bounds[2] || box[3] > bounds[3]) return null;
  const blocked = obstacles.some(o => (o.s ? distance(o.s, box) < (Math.hypot(o.s[2] - o.s[0], o.s[3] - o.s[1]) < 16 ? 1 : 9) : Math.min(box[2], o.b[2]) - Math.max(box[0], o.b[0]) > -1 && Math.min(box[3], o.b[3]) - Math.max(box[1], o.b[1]) > -1));
  return blocked ? null : { x, y };
}

// The card's boxes for a build-schema, all from the config: the pictures' boxes (a text area three rows tall takes the last picture row), the values, the formula and the explanation in the given arrangement.
export function placeFromBuild(blueprint, build) {
  const layoutId = build.layout, slots = CONFIG.layouts[layoutId];
  if (!slots) throw Object.assign(new Error(`the build-schema names layout "${layoutId}", which the config does not have`), { code: 'layout_unknown' });
  const arrangement = build.texts.arrangement, ex = build.texts.explanation, columns = CONFIG.boxes.columns, grid = CONFIG.scene.grid;
  const lineCount = ex.always.length + (ex.cases.length || ex.otherwise !== undefined ? 1 : 0);
  let valueCount = build.texts.values.length, rowsTall = null;
  const capacity = tall => ({ values: tall === 2 ? 2 : 3, lines: Math.floor((columns.heights[tall].h - columns.formulaBand) / columns.lineHeight) });
  if (arrangement === 'columns') {
    if (!['wide', 'side-by-side', 'equal-split', 'stacked'].includes(layoutId)) throw Object.assign(new Error(`layout ${layoutId} has no columns arrangement`), { code: 'arrangement' });
    rowsTall = valueCount <= 2 && lineCount <= capacity(2).lines ? 2 : 3; valueCount = Math.min(valueCount, capacity(rowsTall).values);
  }
  const picture = slot => { const box = slots[slot]; if (!box) return null; const bottom = box[1] + box[3]; return arrangement === 'columns' && rowsTall === 3 && Math.abs(bottom - 311.2) < 0.5 ? [box[0], box[1], box[2], r2(box[3] - grid.rowHeight)] : box; };
  const centred = ([x, y, w, h]) => [x, r2(y + (h - CONFIG.boxes.valueHeight) / 2), w, CONFIG.boxes.valueHeight];
  const out = { layout: layoutId, arrangement, rowsTall, stage: picture('stage'), panel: picture('panel'), valueCount };
  if (arrangement === 'rows') {
    const boxes = valueBoxes(layoutId, valueCount), [fx, fy, fw, fh] = slots.formula, note = slots.note;
    Object.assign(out, {
      valueBoxes: boxes.map(entry => centred(entry.box)), valueDots: boxes.map(({ box: [x, y, , h] }) => [x + VALUE_DOT.centreX, r2(y + h / 2), VALUE_DOT.diameter]),
      formula: { at: [fx + fw / 2, fy + fh / 2], align: 'middle' },
      explanation: { kind: 'box', box: layoutId === 'tall' ? note : layoutId === 'tall-with-panel' ? [note[0], r2(note[1] + note[3] - CONFIG.boxes.noteTwoLines), note[2], CONFIG.boxes.noteTwoLines] : centred(note) },
    });
  } else {
    const area = columns.heights[rowsTall], slot = (area.h - CONFIG.boxes.valueGap * (valueCount - 1)) / valueCount, left = columns.textBox[0] + CONFIG.boxes.textClear, below = area.y + columns.formulaBand;
    const boxes = Array.from({ length: valueCount }, (_, i) => { const top = area.y + i * (slot + CONFIG.boxes.valueGap); return { box: [columns.valuesBox[0], r2(top + (slot - CONFIG.boxes.valueHeight) / 2), columns.valuesBox[1], CONFIG.boxes.valueHeight], dot: [columns.valuesBox[0] + VALUE_DOT.centreX, r2(top + slot / 2), VALUE_DOT.diameter] }; });
    Object.assign(out, {
      valueBoxes: boxes.map(entry => entry.box), valueDots: boxes.map(entry => entry.dot), formula: { at: [left, r2(area.y + columns.formulaBand / 2)], align: 'start' },
      explanation: { kind: 'lines', x: left, ys: Array.from({ length: Math.min(lineCount, capacity(rowsTall).lines) }, (_, i) => r2(below + columns.lineHeight * (i + 0.5))) },
    });
  }
  return out;
}

// What the host draws a kind picture with (the same shape as interact-layout.js figureOptions, which takes a layout's answers where this takes the build-schema's decisions): the picture's box, the 14 px sizes, the optional parts.
const figureOptionsOf = (box, parts) => ({ box: { width: box[2], height: box[3] }, sizes: { title: CONFIG.text.bodySize, heading: CONFIG.text.bodySize, body: CONFIG.text.bodySize, small: CONFIG.text.bodySize }, parts: { ...(parts ?? {}) } });

// the guest part of the Program: the model's function embedded as written inside a wrapper that hides everything of ours, then our own evaluate
export function programFromBuild({ blueprint, buildSchema: build, yRange: sampledRange = null }) {
  const placed = placeFromBuild(blueprint, build), main = build.pictures.main, panelBuild = build.pictures.panel, roles = rolesOf(blueprint);
  if (main.type !== 'parts') throw Object.assign(new Error('the main picture is a kind picture; the writer draws a parts picture there'), { code: 'main_kind' });
  const mapping = main.mapping, fixed = Object.fromEntries(main.fixedParts.map(part => [part.id, part])), arrows = Object.fromEntries(main.arrows.map(entry => [entry.id, entry]));
  const dropped = new Set(main.dropped.map(entry => entry.id)), bpParts = blueprint.pictures.main.parts, byId = Object.fromEntries(bpParts.map(part => [part.id, part]));
  const roleOf = part => (part.of ? roles.things[part.of] : 'neutral');
  // the drawn parts: the blueprint's non-label parts, a fixed part with the build-schema's coordinates; an arrow's label is the label entry that carries its id
  const labelOf = Object.fromEntries(main.labels.map(entry => [entry.id, entry]));
  const parts = bpParts.filter(part => part.type !== 'label' && !dropped.has(part.id)).map(part => {
    const own = fixed[part.id] ?? {}, out = { type: part.type, id: part.id, role: roleOf(part) };
    for (const key of ['from', 'to', 'at', 'size']) if (part[key] !== undefined) out[key] = own[key] ?? part[key];
    if (part.type === 'arrow') Object.assign(out, { factor: arrows[part.id]?.lengthFactor ?? 1, edge: arrows[part.id]?.startAtEdge === true });
    return out;
  });
  const labels = main.labels.filter(entry => ['label', 'arrow'].includes(byId[entry.id]?.type) && !dropped.has(entry.id)).map(entry => ({ id: entry.id, object: byId[entry.id].type === 'label' ? `part.${entry.id}` : `part.${entry.id}.label`, near: entry.near, side: entry.side, text: entry.text, role: roleOf(byId[entry.id]), width: labelWidth(entry.text) }));
  // the graph
  let plot = null, plotGeometry = null, figure = null;
  const panel = blueprint.pictures.panel;
  if (panel && panelBuild) {
    if (panelBuild.type !== 'kind' || panelBuild.kind !== 'coordinate-plot') throw Object.assign(new Error('the writer draws a coordinate-plot in the panel'), { code: 'panel_kind' });
    const over = panel.x.over, input = blueprint.inputs.find(entry => entry.id === over), ranges = panelBuild.ranges ?? {};
    const xRange = ranges.x ?? (over === 'time' ? [0, build.time.duration ?? blueprint.time.duration] : [input.min, input.max]), yRange = ranges.y ?? sampledRange;
    if (!yRange) throw Object.assign(new Error('the build-schema gives no y range and none was measured'), { code: 'y_range' });
    const shown = panelBuild.parts?.title !== false, labelsShown = panelBuild.texts?.labels ?? [];
    plot = { title: panelBuild.texts?.title ?? panel.title, showTitle: shown, over, x: { label: panel.x.label, unit: panel.x.unit }, y: { label: panel.y.label, unit: panel.y.unit }, xRange, yRange,
      series: panel.series.map((entry, k) => ({ value: entry.value, label: labelsShown[k] ?? entry.label, role: roles.series.find(item => item.value === entry.value)?.role ?? 'neutral' })) };
    figure = { at: [placed.panel[0], placed.panel[1]], w: placed.panel[2], h: placed.panel[3] };
    const rendered = renderTutorDiagram(specOf(plot, plot.series.map(() => ({ x: [xRange[0], xRange[1]], y: [yRange[0], yRange[1]] }))), figure.w, figureOptionsOf(placed.panel, panelBuild.parts));
    const g = rendered.geometry; plotGeometry = { plotArea: g.plotArea, x: g.x, y: g.y, min: rendered.min };
  }
  const values = build.texts.values.slice(0, placed.valueCount).map((entry, k) => {
    const value = blueprint.values.find(candidate => candidate.value === entry.id);
    return { value: entry.id, label: entry.label, unit: value?.unit ?? '', decimals: entry.decimals ?? value?.decimals ?? DEFAULT_DECIMALS, box: placed.valueBoxes[k], dot: placed.valueDots[k], role: value ? roleOf({ of: value.of }) : 'neutral' };
  });
  const ex = build.texts.explanation;
  const P = {
    duration: build.time.duration ?? blueprint.time.duration, defaults: Object.fromEntries(blueprint.inputs.map(entry => [entry.id, entry.default])), mapping, parts, labels, plot,
    formula: build.texts.formula, always: ex.always, cases: ex.cases, otherwise: ex.otherwise, quantityIds: blueprint.math.outputs.filter(output => output.kind === 'number' || output.kind === 'flag').map(output => output.id),
  };
  const L = { stageBounds: [placed.stage[0], placed.stage[1], placed.stage[0] + placed.stage[2], placed.stage[1] + placed.stage[3]], figure, plotGeometry, values, formula: build.texts.formula === null ? null : placed.formula, explanation: placed.explanation, bullet: CONFIG.boxes.columns.bullet };
  return { source: programSource(blueprint.math.code, { P, L }), placed: { ...placed, plotGeometry, dropped: [...dropped] } };
}

function programSource(code, data) {
  // A Worker bundle (esbuild keepNames) wraps the helper functions in __name(...) calls that toString() carries into the guest text; the guest gets the same no-op the bundler's own helper is.
  const text = `const __name = target => target;
const compute = (function (sdk, P, L, evaluate, keepIndices, curveOf, specOf, splineAt, diameterOf, labelAt) {
${code}
;
return compute;
})(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined);
const P = ${JSON.stringify(data.P)}, L = ${JSON.stringify(data.L)}, NAMED = ${JSON.stringify(DOT_NAMED_PX)};
${Object.entries({ keepIndices, curveOf, specOf, splineAt, diameterOf, labelAt }).map(([name, fn]) => `const ${name} = ${fn.toString()};`).join('\n')}
const grid = (a, b, n) => { const out = []; for (let k = 0; k < n; k++) out.push(a + (b - a) * k / (n - 1)); return out; };
const X = x => P.mapping.originPx[0] + x * P.mapping.pxPerUnit, Y = y => P.mapping.originPx[1] - y * P.mapping.pxPerUnit;
export function evaluate({ inputs, time }) {
  const t = Math.min(Math.max(time || 0, 0), P.duration), set = { ...P.defaults, ...inputs }, out = compute(set, t), objects = [];
  const num = v => (typeof v === 'number' ? v : out[v]), extents = {}, obstacles = [];
  const dots = P.parts.filter(part => part.type === 'dot').map(part => ({ x: X(num(part.at[0])), y: Y(num(part.at[1])), r: diameterOf(part.size, out, NAMED, ${DOT_MIN_PX}, ${DOT_MAX_PX}) / 2 }));
  for (const part of P.parts) {
    const id = 'part.' + part.id, opts = { role: part.role };
    if (part.type === 'line') { const x1 = X(num(part.from[0])), y1 = Y(num(part.from[1])), x2 = X(num(part.to[0])), y2 = Y(num(part.to[1])); objects.push(sdk.polyline(id, [[x1, y1], [x2, y2]], opts)); extents[part.id] = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]; obstacles.push({ s: [x1, y1, x2, y2] }); }
    else if (part.type === 'arrow') {
      // the arrow's tip is lengthFactor of the way along what the lesson computes; startAtEdge: from a dot's centre it starts at the dot's edge plus ${ARROW_DOT_GAP_PX} px; short of the dot's radius it is left out of this frame (motion decoration)
      let x1 = X(num(part.from[0])), y1 = Y(num(part.from[1])), x2 = X(num(part.to[0])), y2 = Y(num(part.to[1]));
      x2 = x1 + (x2 - x1) * part.factor; y2 = y1 + (y2 - y1) * part.factor;
      const whole = Math.hypot(x2 - x1, y2 - y1), dot = part.edge ? dots.find(d => Math.abs(d.x - x1) < 0.01 && Math.abs(d.y - y1) < 0.01) : null;
      if (dot) { if (whole < dot.r + ${ARROW_DOT_GAP_PX} + 1) continue; x1 += (x2 - x1) / whole * (dot.r + ${ARROW_DOT_GAP_PX}); y1 += (y2 - y1) / whole * (dot.r + ${ARROW_DOT_GAP_PX}); }
      const length = Math.hypot(x2 - x1, y2 - y1);
      // the head is the composed theme's: 12 px long, 4 px either side of the shaft, drawn as an open V of two strokes from the tip
      let head = null, wings = null;
      if (length) { const dx = (x2 - x1) / length, dy = (y2 - y1) / length, back = Math.min(12, length), bx = x2 - dx * back, by = y2 - dy * back; wings = [[bx - dy * 4, by + dx * 4], [x2, y2], [bx + dy * 4, by - dx * 4]]; head = [Math.min(...wings.map(p => p[0])), Math.min(...wings.map(p => p[1])), Math.max(...wings.map(p => p[0])), Math.max(...wings.map(p => p[1]))]; }
      // motion decoration, the same rule: an arrowhead that would land on a dot's box (the frame rules take a circle by its box) is left out of this frame
      if (head && dots.some(d => Math.min(head[2], d.x + d.r) - Math.max(head[0], d.x - d.r) > 0 && Math.min(head[3], d.y + d.r) - Math.max(head[1], d.y - d.r) > 0)) continue;
      objects.push(sdk.polyline(id, [[x1, y1], [x2, y2]], opts)); if (wings) objects.push(sdk.polyline(id + '.head', wings, opts)); extents[part.id] = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]; obstacles.push({ s: [x1, y1, x2, y2] });
      if (head) obstacles.push({ b: head });
    }
    else if (part.type === 'dot') { const x = X(num(part.at[0])), y = Y(num(part.at[1])), d = diameterOf(part.size, out, NAMED, ${DOT_MIN_PX}, ${DOT_MAX_PX}); objects.push(sdk.circle(id, x, y, d, opts)); extents[part.id] = [x - d / 2, y - d / 2, x + d / 2, y + d / 2]; obstacles.push({ b: extents[part.id] }); }
    else if (part.type === 'trace' && t > 0) {
      const n = Math.min(${TRACE_POINTS - 1}, Math.max(1, Math.round(t / P.duration * ${TRACE_POINTS - 1}))), points = [];
      for (let k = 0; k <= n; k++) { const o = compute(set, t * k / n); points.push([X(o[part.at[0]]), Y(o[part.at[1]])]); }
      objects.push(sdk.polyline(id, points, opts)); extents[part.id] = [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
    }
  }
  // each label stands beside the part it is near, on its side; one that would land on a part in this frame is left out of this frame
  for (const label of P.labels) {
    const ext = extents[label.near]; if (!ext) continue;
    const spot = labelAt(ext, label.width, label.side, ${LABEL_GAPS_PX[0]}, obstacles, L.stageBounds); if (!spot) continue;
    objects.push(sdk.text(label.object, spot.x, spot.y + 4.9, label.text, { align: 'middle', role: label.role }));
    obstacles.push({ b: [spot.x - label.width / 2, spot.y - 5.9, spot.x + label.width / 2, spot.y + 10.8] });
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
  if (L.explanation.kind === 'box') { if (lines.length) objects.push(sdk.box('note', L.explanation.box[0], L.explanation.box[1], L.explanation.box[2], L.explanation.box[3], { role: 'neutral', text: lines[0] })); }
  else L.explanation.ys.forEach((cy, k) => { if (lines[k] !== undefined) objects.push(sdk.text('line.' + k, L.explanation.x, cy + 4.9, L.bullet + lines[k], { align: 'start', role: 'neutral' })); });
  const quantities = {};
  for (const id of P.quantityIds) quantities[id] = typeof out[id] === 'boolean' ? (out[id] ? 1 : 0) : out[id];
  return { frame: sdk.frame(objects, { width: ${CONFIG.scene.width}, height: ${CONFIG.scene.height} }), quantities };
}`;
  // brief 46: the Program must fit the contract's 16 KiB and a Worker bundle prints the helper functions with deeper indentation and keeps comments; everything after the model's function is stripped of comment lines and indentation (the model's own code is not touched)
  const at = text.lastIndexOf('\nconst P = ');
  return text.slice(0, at) + text.slice(at).replace(/^[ \t]*\/\/.*\n/gm, '').replace(/^[ \t]+/gm, '');
}
