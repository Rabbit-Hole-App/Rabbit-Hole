// Host-computed layout evidence for a program frame: which text objects' estimated boxes overlap. Pure geometry on the frame the program
// returned, with the SAME text estimate the scene layout lint and the renderer's label placement use (scene-layout.js estimateTextBox,
// scene-style.js body size). It reads no subject and no wording; it is evidence for a reviewer or a test, never a gate, and the estimate is
// conservative rather than font-accurate (about 0.6 em per character; a math run is estimated at 0.5 em per TeX character, the same rule
// scene-layout-lint.js uses for an equation).
import { estimateTextBox } from '../scene-layout.js';
import { textStyle } from '../scene-style.js';
import { textWidthPx } from '../interact-description-fit.js';

// Characters a run is worth at the body size: a math run's TeX length scaled by the equation rule above.
const runLength = run => (run.kind === 'math' ? Math.ceil(run.tex.length * (textStyle('equation').fontSize * 0.5) / (textStyle('body').fontSize * 0.6)) : run.text.length);

// -> [{ id, box: {xMin, xMax, yMin, yMax} }] for every text object with something to draw.
export function textBoxes(frame) {
  return (frame.objects || []).filter(object => object.kind === 'text').map(object => {
    const length = object.runs ? object.runs.reduce((sum, run) => sum + runLength(run), 0) : (object.text || '').length;
    const box = estimateTextBox({ text: 'x'.repeat(length), x: object.x, y: object.y, fontSize: textStyle('body').fontSize, anchor: object.align === 'middle' ? 'middle' : 'start', baseline: 'auto' });
    return { id: object.id, box };
  });
}

// The geometry the capture trace carries so the host can check overlaps (text, circles, boxes, arrows), bounded: -> [{ id, kind, x, y, w?, h?, from?, to?, text?, align? }].
// Lines and the figure kinds (axis, plot) travel too, with only what the layout rules read (a figure's own text: figureTextBoxes).
export const traceObjects = (objects = []) => objects.filter(o => ['text', 'circle', 'box', 'arrow', 'line', 'axis', 'plot'].includes(o.kind)).slice(0, 80).map(o => ({
  id: o.id, kind: o.kind, x: o.x, y: o.y, ...(o.w != null ? { w: o.w } : {}), ...(o.h != null ? { h: o.h } : {}), ...(o.from ? { from: o.from, to: o.to } : {}), ...(o.opacity === 0 ? { opacity: 0 } : {}),
  ...(o.kind === 'text' ? { text: (o.text ?? (o.runs || []).map(run => run.text ?? run.tex ?? '').join('')).slice(0, 160), align: o.align } : {}),
  ...(o.kind === 'axis' ? { length: o.length, orientation: o.orientation, min: o.min, max: o.max, ...(o.ticks ? { ticks: o.ticks } : {}), label: o.label, ...(o.unit ? { unit: o.unit } : {}) } : {}),
  ...(o.kind === 'plot' ? { axes: o.axes, series: (o.series || []).map(series => ({ label: series.label })) } : {}) }));
// The frame size the text-outside-frame rule needs; the capture seam puts it in the trace beside `objects`: layoutProblems({ objects, ...traceFrame(frame) }).
export const traceFrame = frame => ({ width: frame.width, height: frame.height });

// The box of a circle (x, y is its centre, w its diameter) or a box (x, y its top left corner); null for anything else.
const shapeBox = o => (o.kind === 'circle' ? { xMin: o.x - o.w / 2, xMax: o.x + o.w / 2, yMin: o.y - o.w / 2, yMax: o.y + o.w / 2 }
  : o.kind === 'box' ? { xMin: o.x, xMax: o.x + o.w, yMin: o.y, yMax: o.y + o.h } : null);
// The box of an arrowhead as the written connector draws it (tutor-diagrams/primitives.js connector: 7 px long, 3.4 px either side); null for a point-length arrow.
const HEAD_LENGTH = 7, HEAD_HALF_WIDTH = 3.4;
const headBox = o => {
  if (o.kind !== 'arrow' || !o.from || !o.to) return null;
  const length = Math.hypot(o.to.x - o.from.x, o.to.y - o.from.y);
  if (!length) return null;
  const dx = (o.to.x - o.from.x) / length, dy = (o.to.y - o.from.y) / length, tip = Math.min(HEAD_LENGTH, length);
  const bx = o.to.x - dx * tip, by = o.to.y - dy * tip, xs = [o.to.x, bx - dy * HEAD_HALF_WIDTH, bx + dy * HEAD_HALF_WIDTH], ys = [o.to.y, by + dx * HEAD_HALF_WIDTH, by - dx * HEAD_HALF_WIDTH];
  return { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) };
};
const shared = (p, q) => ({ width: Math.min(p.xMax, q.xMax) - Math.max(p.xMin, q.xMin), height: Math.min(p.yMax, q.yMax) - Math.max(p.yMin, q.yMin) });

// -> [{ a, b, kind, width, height }]: text over text, text over a circle, box or arrowhead, and an arrowhead over a circle, whenever the boxes intersect at all, in object
// order, at most `limit`. A shape's OWN label (a box's or circle's `text`) is not a separate object and so never a pair. Pure geometry, no subject and no wording.
export function frameOverlaps(frame, limit = 8) {
  const objects = frame.objects || [], texts = textBoxes(frame), out = [];
  const push = (a, b, kind, p, q) => { const { width, height } = shared(p, q); if (width > 0 && height > 0 && out.length < limit) out.push({ a, b, kind, width: Math.round(width * 10) / 10, height: Math.round(height * 10) / 10 }); };
  for (let i = 0; i < texts.length; i += 1) for (let j = i + 1; j < texts.length; j += 1) push(texts[i].id, texts[j].id, 'text-text', texts[i].box, texts[j].box);
  for (const text of texts) {
    for (const o of objects) {
      const shape = shapeBox(o), head = headBox(o);
      if (shape) push(text.id, o.id, `text-${o.kind}`, text.box, shape);
      if (head) push(text.id, o.id, 'text-arrowhead', text.box, head);
    }
  }
  const heads = objects.map(o => [o, headBox(o)]).filter(([, box]) => box), circles = objects.filter(o => o.kind === 'circle');
  for (const [arrow, box] of heads) for (const circle of circles) push(arrow.id, circle.id, 'arrowhead-circle', box, shapeBox(circle));
  // A label on an arrowhead is already a problem; its shaft clearance is not a second one.
  return [...out, ...layoutProblems(frame, limit - out.length).filter(p => !out.some(o => o.a === p.a && o.b === p.b))];
}

// ---- Layout rules (owner, 2026-11-12): a label keeps clear of lines and arrows, a label stays inside the frame, and a figure's own titles and tick labels count as labels.
// Labels are measured with the card description's per-glyph advance tables (interact-description-fit.js) and drawn centred on y; the box is the ink height (0.7 em), the same
// estimate for a frame text and a figure title, so a label the SDK helpers place (sdk.vector 8 px past the tip, sdk.gate and sdk.groundMark labels below their strokes) passes.
export const LABEL_CLEARANCE = 8; // px between a label and a line or an arrow shaft
export const MARK_LENGTH = 16; // a stroke shorter than this (a tick mark, a gate leg) is a mark beside its label, not a rule line: it only may not touch it
const INK = 0.7;
const TICK_SIZE = 13, TITLE_SIZE = 14, TICK_LEN = 5, TICK_HEIGHT = Math.ceil(TICK_SIZE * 1.25); // FrameFigures.jsx draws with the same numbers
const BAND_Y = 60; // FIGURE_BAND.y (contract.js), the room a y axis keeps to its left; not imported so the check stays free of the figure renderer

const objectText = o => o.text ?? (o.runs || []).map(run => run.text ?? run.tex ?? '').join('');
// A label's box: x at the anchor (`middle`, `end` or start), y the centre of its line.
const inkBox = (text, x, y, anchor, size) => {
  const width = textWidthPx(text, size), half = size * INK / 2;
  const [xMin, xMax] = anchor === 'end' ? [x - width, x] : anchor === 'middle' ? [x - width / 2, x + width / 2] : [x, x + width];
  return { xMin, xMax, yMin: y - half, yMax: y + half };
};
const titleOf = (name, unit) => (unit ? `${name} (${unit})` : name);
const linear = (min, max, start, end) => value => start + ((value - min) / (max - min)) * (end - start);

// -> [{ id, owner, box }]: the tick labels and titles of an `axis` or `plot` object, where FrameFigures.jsx draws them. shortcut: a figure's interior ticks are chosen by the written
// plots' own tick placement (plot-ticks.js, which needs the figure renderer); only the given ticks, or the two ends, are estimated here. Upgrade by exporting the tick positions as data.
export function figureTextBoxes(object) {
  const out = [], add = (id, text, x, y, anchor, size) => out.push({ id: `${object.id}.${id}`, owner: object.id, box: inkBox(text, x, y, anchor, size) });
  if (object.kind === 'axis') {
    const { x, y, length, min, max } = object, horizontal = object.orientation === 'x';
    const position = horizontal ? linear(min, max, x, x + length) : linear(min, max, y, y - length);
    for (const value of object.ticks ?? [min, max]) {
      if (horizontal) add(`tick${value}`, String(value), position(value), y + TICK_LEN + 4 + TICK_HEIGHT / 2, 'middle', TICK_SIZE);
      else add(`tick${value}`, String(value), x - TICK_LEN - 4, position(value), 'end', TICK_SIZE);
    }
    const title = titleOf(object.label, object.unit);
    if (horizontal) add('title', title, x + length, y + TICK_LEN + 4 + TICK_HEIGHT + 14, 'end', TITLE_SIZE);
    else add('title', title, x - BAND_Y + 4, y - length - 8, 'start', TITLE_SIZE);
  } else if (object.kind === 'plot') {
    const { x, y, w, h, axes, series = [] } = object;
    const left = x + Math.max(40, Math.ceil(Math.max(...[axes.y.min, axes.y.max].map(value => textWidthPx(String(value), TICK_SIZE)))) + 18);
    const top = y + (series.length > 1 ? 44 : 24), right = x + w - 16, bottom = y + h - (TICK_HEIGHT + 8 + 24);
    for (const value of [axes.x.min, axes.x.max]) add(`xtick${value}`, String(value), linear(axes.x.min, axes.x.max, left, right)(value), bottom + 8 + TICK_HEIGHT / 2, 'middle', TICK_SIZE);
    for (const value of [axes.y.min, axes.y.max]) add(`ytick${value}`, String(value), left - 8, linear(axes.y.min, axes.y.max, bottom, top)(value), 'end', TICK_SIZE);
    add('xtitle', titleOf(axes.x.label, axes.x.unit), right, bottom + 8 + TICK_HEIGHT + 14, 'end', TITLE_SIZE);
    add('ytitle', titleOf(axes.y.label, axes.y.unit), x + 4, y + 12, 'start', TITLE_SIZE);
    if (series.length > 1) {
      let legendRight = right;
      series.forEach((entry, index) => { legendRight -= textWidthPx(entry.label, TICK_SIZE); add(`legend${index}`, entry.label, legendRight, y + 34, 'start', TICK_SIZE); legendRight -= 32; });
    }
  }
  return out;
}

// The distance between a segment and a box (0 when they touch or cross).
function segmentGap(a, b, box) {
  const { xMin, xMax, yMin, yMax } = box;
  const inside = p => p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax;
  if (inside(a) || inside(b)) return 0;
  const crosses = (p, q, r, s) => {
    const d = (q.x - p.x) * (s.y - r.y) - (q.y - p.y) * (s.x - r.x);
    if (!d) return false;
    const t = ((r.x - p.x) * (s.y - r.y) - (r.y - p.y) * (s.x - r.x)) / d, u = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  };
  const corners = [{ x: xMin, y: yMin }, { x: xMax, y: yMin }, { x: xMax, y: yMax }, { x: xMin, y: yMax }];
  if (corners.some((c, i) => crosses(a, b, c, corners[(i + 1) % 4]))) return 0;
  const toSegment = p => {
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy, t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  const toBox = p => Math.hypot(Math.max(xMin - p.x, 0, p.x - xMax), Math.max(yMin - p.y, 0, p.y - yMax));
  return Math.min(toBox(a), toBox(b), ...corners.map(toSegment));
}

const round1 = n => Math.round(n * 10) / 10;

// -> [{ a, b, kind, width, height, gap?, hint }]: the label rules on frame objects (a text object's `text` or `runs`; a figure's own text by figureTextBoxes), at most `limit`.
//   text-line / text-arrow : a label closer than LABEL_CLEARANCE to a line or an arrow shaft (a mark under MARK_LENGTH: touching it); `gap` is the measured distance, width and height are 0
//   text-text              : a figure's title or tick label over a text object or another figure's text
//   text-frame             : a label or figure title that leaves the frame, `b` is 'frame', width and height the overflow in px; only when the frame's width and height are given
// Each carries `hint`, one line saying what to change. Pure geometry on the frame, no subject and no wording.
// TODO(integrator): interact-checks.js builds the [overlap] message from a, b, kind, width, height only; append ` - ${o.hint}` so the repairer reads the fix hint, and pass the frame size
// (layoutProblems({ objects, ...traceFrame(frame) }) needs the trace to carry width and height: interact-fixtures.js and web/render/program-render.jsx) so text-frame can fire.
export function layoutProblems(frame, limit = 8) {
  const objects = frame.objects || [], out = [];
  const labels = objects.filter(o => o.kind === 'text' && objectText(o)).map(o => ({ id: o.id, owner: o.id, box: inkBox(objectText(o), o.x, o.y, o.align === 'middle' ? 'middle' : 'start', textStyle('body').fontSize) }));
  const figures = objects.filter(o => o.kind === 'axis' || o.kind === 'plot').flatMap(figureTextBoxes);
  const all = [...labels, ...figures], push = problem => { if (out.length < limit) out.push(problem); };
  for (const label of all) {
    for (const o of objects) {
      if ((o.kind !== 'line' && o.kind !== 'arrow') || o.opacity === 0 || !o.from || !o.to || o.id === label.owner) continue;
      const length = Math.hypot(o.to.x - o.from.x, o.to.y - o.from.y), need = length < MARK_LENGTH ? 0 : LABEL_CLEARANCE, gap = segmentGap(o.from, o.to, label.box);
      if (need ? gap < need - 1e-6 : gap === 0) push({ a: label.id, b: o.id, kind: `text-${o.kind === 'arrow' ? 'arrow' : 'line'}`, width: 0, height: 0, gap: round1(gap), hint: `move "${label.id}" so it is at least ${LABEL_CLEARANCE} px clear of "${o.id}" (it is ${round1(gap)} px), or move "${o.id}"` });
    }
  }
  for (const figure of figures) {
    for (const other of all) {
      if (other.owner === figure.owner || (figures.includes(other) && other.id < figure.id)) continue;
      const p = figure.box, q = other.box, width = Math.min(p.xMax, q.xMax) - Math.max(p.xMin, q.xMin), height = Math.min(p.yMax, q.yMax) - Math.max(p.yMin, q.yMin);
      if (width > 0 && height > 0) push({ a: figure.id, b: other.id, kind: 'text-text', width: round1(width), height: round1(height), hint: `move "${other.owner}" off "${figure.id}", the text of "${figure.owner}"` });
    }
  }
  if (frame.width > 0 && frame.height > 0) {
    for (const label of all) {
      const { xMin, xMax, yMin, yMax } = label.box, width = Math.max(-xMin, xMax - frame.width, 0), height = Math.max(-yMin, yMax - frame.height, 0);
      if (width > 0 || height > 0) push({ a: label.id, b: 'frame', kind: 'text-frame', width: round1(width), height: round1(height), hint: `keep "${label.id}" inside the ${frame.width} x ${frame.height} frame: shorten its text or move "${label.owner}"` });
    }
  }
  return out;
}

// -> [{ a, b, width, height }]: every pair whose boxes share area (width x height px of overlap), in object order, at most `limit` pairs.
export function textOverlaps(frame, limit = 8) {
  const boxes = textBoxes(frame), out = [];
  for (let i = 0; i < boxes.length && out.length < limit; i++) {
    for (let j = i + 1; j < boxes.length && out.length < limit; j++) {
      const p = boxes[i].box, q = boxes[j].box;
      const width = Math.min(p.xMax, q.xMax) - Math.max(p.xMin, q.xMin), height = Math.min(p.yMax, q.yMax) - Math.max(p.yMin, q.yMin);
      if (width > 0 && height > 0) out.push({ a: boxes[i].id, b: boxes[j].id, width: Math.round(width * 10) / 10, height: Math.round(height * 10) / 10 });
    }
  }
  return out;
}
