import { cloneElement, createElement as h } from 'react';
import { label, lineHeight, textWidth, widestFormula, wire, wrap } from './primitives.js';
import { closedLinePath, monotoneLinePath, showPlotMarker } from './plot-lines.js';
import { plotTicks } from './plot-ticks.js';
import { TEACHING as T, TEACHING_GRID, TEACHING_SERIES, TEACHING_SERIES_INK, TEACHING_ZERO, mixHex, teachingConnector } from './teaching-theme.js';
import { axisName, isStackedBar, plotSeriesPoints, restatesPoint } from './ml-plot-spec.js';

const PAD = 12;
const SMALL = 12;
const COLORS = [...TEACHING_SERIES, T.ink, T.muted];
const INKS = [...TEACHING_SERIES_INK, T.ink, T.muted]; // the darker weight of a series colour: text only (an end label), never a stroke
// Weights, heavy to light: the series line 4.5 (in the series fill colour), the marker ring 2 (a 14 px marker), guides and outlines 1.5.
const TICK = 15, MARKER = 7, LINE = 4.5, GRID = 1.5;
// The caps of a coordinate plot (the author's constraints sheet reads these): value labels only on a plot of ONE series with at most this many samples;
// a marker on every sample of a line series up to PLOT_MARKER_ALL_MAX_SAMPLES, only the first, the last and the labelled samples of a longer one (PLOT_MARKER_LINE_ONLY_FROM_SAMPLES is no longer read);
// at most PLOT_NOTES_MAX callouts (an annotation's label in a pill; no number is drawn).
// A note never restates a sample's own coordinates (PL-1): a labelled sample draws no badge and no list line.
export const PLOT_VALUE_LABEL_MAX_SAMPLES = 8, PLOT_MARKER_ALL_MAX_SAMPLES = 8, PLOT_MARKER_LINE_ONLY_FROM_SAMPLES = 20, PLOT_NOTES_MAX = 6;
export const PLOT_CAPS = Object.freeze({ valueLabelMaxSamples: PLOT_VALUE_LABEL_MAX_SAMPLES, markerAllMaxSamples: PLOT_MARKER_ALL_MAX_SAMPLES,
  markerLineOnlyFromSamples: PLOT_MARKER_LINE_ONLY_FROM_SAMPLES, notesMax: PLOT_NOTES_MAX });
const SOFT = TEACHING_SERIES; // the saturated series fills (the pale soft tokens stay defined, unused)
const DASH = [undefined, '10 6', '2 6', '12 6', '6 4 1 4'];
const pointString = values => values.map(p => p.join(',')).join(' ');
const format = value => String(value);
const amount = (value, unit) => `${value}${unit ? ` ${unit}` : ''}`;

function scale(axis, start, end) {
  if (axis.scale === 'log' && (axis.max - axis.min) / axis.min < 0.5) {
    const span = Math.log1p((axis.max - axis.min) / axis.min);
    return value => start + (end - start) * Math.log1p((value - axis.min) / axis.min) / span;
  }
  const project = axis.scale === 'log' ? Math.log : value => value;
  const min = project(axis.min), max = project(axis.max);
  return value => start + (end - start) * (project(value) - min) / (max - min);
}
// r is the circle's radius: 4.5 in the bar charts' legends, MARKER (a 12 px circle) for the marks of a plot; the square and diamond keep the same visual weight.
function symbol(x, y, index, attributes = {}, title, r = 4.5) {
  const props = { fill: COLORS[index], stroke: T.outline, strokeWidth: r > 5 ? 2 : 1.5, ...attributes };
  const child = title ? h('title', null, title) : null;
  if (index % 3 === 1) return h('rect', { x: x - r * 0.9, y: y - r * 0.9, width: r * 1.8, height: r * 1.8, ...props }, child);
  if (index % 3 === 2) return h('polygon', { points: pointString([[x, y - r * 1.1], [x + r * 1.1, y], [x, y + r * 1.1], [x - r * 1.1, y]]), ...props }, child);
  return h('circle', { cx: x, cy: y, r, ...props }, child);
}
function curve(points, colorIndex, attributes = {}, path) {
  const geometry = path ? { d: path } : { points: pointString(points) };
  return h(path ? 'path' : 'polyline', { ...geometry, fill: 'none', stroke: COLORS[colorIndex], strokeWidth: LINE,
    strokeDasharray: DASH[colorIndex], strokeLinejoin: 'round', strokeLinecap: 'round', ...attributes });
}
function stepPoints(points) {
  return points.flatMap((p, i) => i ? [[p[0], points[i - 1][1]], p] : [p]);
}
// A short stable id for a clip path (two plots on one page share an id only when their clip shapes are the same).
const hashOf = text => [...text].reduce((sum, ch) => (Math.imul(sum, 31) + ch.charCodeAt(0)) >>> 0, 7).toString(36);
function bodyWidth(d, requested) {
  const text = [d.x?.label, d.y?.label, ...(d.series ?? []).map(s => s.label),
    ...(d.annotations ?? []).map(a => a.label), ...(d.categories ?? [])];
  return Math.max(requested, 408, ...text.filter(Boolean).map(t => widestFormula(t) + 150)); // 408: the narrowest card content (cards are clamped 440 to 720, CV-1)
}

function plotEndLabels(series) {
  const endSeries = series.flatMap((entry, i) => entry.endLabel ? [{ entry, color: INKS[i] }] : []);
  const endLabelWidth = Math.ceil(Math.max(0, ...endSeries.map(({ entry }) =>
    Math.max(Math.min(128, textWidth(entry.label, SMALL)), widestFormula(entry.label, SMALL)))));
  const labels = endSeries.map(({ entry, color }) => {
    const lines = wrap(entry.label, endLabelWidth, SMALL);
    return { name: entry.label, value: (entry.points ?? plotSeriesPoints(entry)).at(-1).y, color, lines, height: lines.length * lineHeight(SMALL) };
  }).sort((a, b) => b.value - a.value);
  return {
    labels,
    gutter: endLabelWidth ? endLabelWidth + 12 : 0,
    height: labels.reduce((sum, item) => sum + item.height + 4, 0),
  };
}

export function sharedPlotLabelSpace(diagrams) {
  const measurements = diagrams.map(diagram => plotEndLabels(diagram.series));
  return {
    gutter: Math.max(...measurements.map(({ gutter }) => gutter)),
    height: Math.max(...measurements.map(({ height }) => height)),
  };
}

// The legend of a plot or a bar chart: one pill per series (22 px tall, rx 11): the series colour at 18% over the ground, a 1.5 px outline and the name at 12 px / 500 in the
// series ink, a 9 px marker (series fill, ink ring) at the left; 8 px apart, centred in one row, a second row only when they do not fit. Returns the elements and the height.
function legendPills(items, width, top) {
  const pills = items.map(({ i, text }) => {
    const lines = wrap(text, width - 2 * PAD - 52, 12);
    const text12 = Math.ceil(Math.max(...lines.map(line => textWidth(line, 12)), widestFormula(lines.join(' '), 12)));
    return { i, lines, height: Math.max(22, lines.length * lineHeight(12) + 6), width: 10 + 9 + 6 + text12 + 10 };
  });
  const elements = [];
  let y = top;
  for (let start = 0; start < pills.length;) {
    let end = start + 1, total = pills[start].width;
    while (end < pills.length && total + 8 + pills[end].width <= width - 2 * PAD) total += 8 + pills[end++].width;
    const row = pills.slice(start, end), rowHeight = Math.max(...row.map(pill => pill.height));
    let px = (width - total) / 2;
    for (const pill of row) {
      const cy = y + rowHeight / 2;
      elements.push(h('rect', { x: px, y: cy - pill.height / 2, width: pill.width, height: pill.height, rx: Math.min(11, pill.height / 2), fill: mixHex(COLORS[pill.i], T.ground, 0.18), stroke: INKS[pill.i], strokeWidth: 1.5, 'data-tutor-plot-legend': '' }));
      elements.push(symbol(px + 10 + 4.5, cy, pill.i, { stroke: INKS[pill.i] }, undefined, 4.5));
      elements.push(label(pill.lines, px + 10 + 9 + 6, cy, { anchor: 'start', size: 12, weight: 500, fill: INKS[pill.i] }));
      px += pill.width + 8;
    }
    y += rowHeight + (end < pills.length ? 8 : 0);
    start = end;
  }
  return { elements, height: y - top };
}

// An axis title on the figure: the label and unit. axisName (ml-plot-spec.js) also adds "log scale" for the written description; the sampled ticks already say it here.
const titleOf = axis => `${axis.label}${axis.unit ? ` (${axis.unit})` : ''}`;

// A tick label's horizontal extent, from its anchor (start, middle or end).
const tickSpan = ({ at, lines, anchor }) => {
  const w = Math.max(...lines.map(line => textWidth(line, TICK)));
  return anchor === 'start' ? [at, at + w] : anchor === 'end' ? [at - w, at] : [at - w / 2, at + w / 2];
};

// The plot is laid out wider until no two x tick labels touch (a label such as 999999999.9999999 is 169 px wide at 15 px; the endpoints always stay labelled).
function coordinatePlot(diagram, requested, options) {
  let layout;
  for (let pass = 0, asked = requested; pass < 4; pass++) {
    layout = plotLayout(diagram, asked, options);
    if (!layout.crowded) break;
    asked = layout.width + 2 * layout.crowded; // moving the right edge by d moves each gap by d / 2
  }
  const { crowded, ...drawn } = layout;
  return drawn;
}

function plotLayout(diagram, requested, { sharedLabelSpace } = {}) {
  const d = diagram.series.some(series => series.samples) ? { ...diagram,
    series: diagram.series.map(series => series.samples ? { ...series, points: plotSeriesPoints(series) } : series),
  } : diagram;
  const endLabels = plotEndLabels(d.series);
  const endGutter = Math.max(endLabels.gutter, sharedLabelSpace?.gutter ?? 0);
  let remainingLabels = endLabels.height;
  const width = Math.max(bodyWidth(d, requested), 324 + endGutter);
  // The y title runs along the axis when it is plain text that fits the plot's height; otherwise it stays above the plot, bold 16.
  const yName = titleOf(d.y);
  const rotateY = widestFormula(yName) === 0 && textWidth(yName, 16) * 1.1 <= 232;
  const top0 = rotateY ? 40 : 66;
  const bottomEdge = top0 + Math.max(240, endLabels.height, sharedLabelSpace?.height ?? 0);
  const bounds = { left: 104, right: width - 24 - endGutter, top: top0, bottom: bottomEdge };
  const { left, right, top, bottom } = bounds;
  const x = scale(d.x, left, right), y = scale(d.y, bottom, top);
  const xy = p => [x(p.x), y(p.y)];
  const curves = d.series.map(series => series.points.map(xy));
  // The d of a series' path (undefined: the series is drawn as a straight polyline).
  const drawnPath = (series, values) => {
    const smooth = series.smooth !== false;
    if (series.closed) return closedLinePath(values, smooth);
    if (series.kind === 'line' && smooth) return monotoneLinePath(values, series.points[0].low !== undefined ? series.points.map(p => [y(p.high), y(p.low)]) : undefined);
    return undefined;
  };
  // A plot of exactly one line series and an x-band: the band is the area under the curve (clip = the series path closed to the baseline); several series keep a full-height band.
  const sole = d.series.length === 1 && d.series[0].kind === 'line' && !d.series[0].closed ? d.series[0] : null;
  const underPath = sole && (() => {
    const values = curves[0], base = y(Math.min(d.y.max, Math.max(d.y.min, 0)));
    return `${drawnPath(sole, values) ?? `M${values.join('L')}`}L${values.at(-1)[0]},${base}L${values[0][0]},${base}Z`;
  })();
  const clipId = underPath ? `plot-under-${hashOf(underPath)}` : null;
  // The colour a point's ring takes: the x-band that holds it (the narrowest), else the nearest one; no band: the ground.
  const xBands = (d.annotations ?? []).flatMap((a, k) => a.kind === 'band' && a.axis === 'x' ? [{ from: a.from, to: a.to, fill: SOFT[k % 3] }] : []);
  const bandFill = value => {
    const reach = band => Math.max(band.from - value, value - band.to, 0);
    return [...xBands].sort((a, b) => reach(a) - reach(b) || (a.to - a.from) - (b.to - b.from))[0]?.fill ?? T.surface;
  };
  const elements = [h('rect', { x: left, y: top, width: right - left, height: bottom - top,
    fill: 'none', 'data-tutor-plot-area': '' })];
  const geometry = [], foreground = [];
  if (rotateY) {
    const cx = PAD + 10, cy = (top + bottom) / 2;
    elements.push(h('g', { transform: `rotate(-90 ${cx} ${cy})`, 'data-tutor-plot-y-title': '' }, label(yName, cx, cy, { size: 16, weight: 700 })));
  } else {
    const yTitle = wrap(yName, width - 2 * PAD, 16);
    elements.push(label(yTitle, PAD, PAD + yTitle.length * lineHeight(16) / 2, { anchor: 'start', weight: 700, size: 16 }));
  }
  let xTicks = plotTicks(d.x, x, { horizontal: true });
  // A log axis labels every sampled x; a decade label whose text would touch one of them is dropped.
  if (d.x.scale === 'log' && d.series.every(s => s.points.length <= 8)) {
    const touches = (a, b) => tickSpan(a)[0] < tickSpan(b)[1] + 8 && tickSpan(b)[0] < tickSpan(a)[1] + 8;
    const sampled = [...new Set(d.series.flatMap(s => s.points.map(p => p.x)))].sort((a, b) => a - b)
      .map(value => ({ at: x(value), lines: [String(value)], anchor: value <= d.x.min ? 'start' : value >= d.x.max ? 'end' : 'middle' }));
    const decades = xTicks.filter(tick => !sampled.some(s => s.at === tick.at)), apart = decades.filter(tick => !sampled.some(s => touches(s, tick)));
    // Fewer than three labels would leave the axis unreadable: then the decades stay and the plot is laid out wider (coordinatePlot) until none touch.
    xTicks = [...sampled, ...(sampled.length + apart.length < 3 ? decades : apart)].sort((a, b) => a.at - b.at);
  }
  // No axis lines: horizontal dashed guides (one at every y tick, so the minimum marks the bottom of the plot) and the tick numerals are the frame.
  // When the y range crosses 0 the guide at 0 is solid and muted: the one line a plot keeps.
  const crossesZero = d.y.min < 0 && d.y.max > 0;
  let zeroDrawn = false;
  for (const { at, lines, anchor } of plotTicks(d.y, y, { labelWidth: left - PAD - 8 })) {
    const zero = crossesZero && Math.abs(at - y(0)) < 0.5;
    zeroDrawn ||= zero;
    elements.push(h('line', { x1: left, x2: right, y1: at, y2: at, stroke: zero ? TEACHING_ZERO : TEACHING_GRID, strokeWidth: GRID, ...(zero ? { 'data-tutor-plot-zero': '' } : { strokeDasharray: '4 4' }), 'data-tutor-plot-grid': '' }));
    elements.push(label(lines, left - 8, at, { anchor, size: TICK, fill: T.muted }));
  }
  if (crossesZero && !zeroDrawn) elements.push(h('line', { x1: left, x2: right, y1: y(0), y2: y(0), stroke: TEACHING_ZERO, strokeWidth: GRID, 'data-tutor-plot-zero': '', 'data-tutor-plot-grid': '' }));
  const tickHeight = Math.max(...xTicks.map(tick => tick.lines.length)) * lineHeight(TICK);
  for (const { at, lines, anchor } of xTicks) elements.push(label(lines, at, bottom + 8 + tickHeight / 2, { anchor, size: TICK, fill: T.muted }));
  const xTitle = wrap(titleOf(d.x), right - left, 16);
  let legendY = bottom + 8 + tickHeight / 2 + 14; // the x title's centre is 24 px under the tick labels'
  elements.push(label(xTitle, (left + right) / 2, legendY + xTitle.length * lineHeight(16) / 2, { weight: 700, size: 16 }));
  legendY += xTitle.length * lineHeight(16) + 12;
  const occupied = [];
  // True when a box (grown by `margin`) holds a point of any curve: a label placed there would sit on a line.
  const onCurve = (box, margin = 4) => curves.some(values => values.slice(1).some(([x2, y2], k) => {
    const [x1, y1] = values[k], steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 3));
    return Array.from({ length: steps + 1 }, (_, s) => [x1 + (x2 - x1) * s / steps, y1 + (y2 - y1) * s / steps])
      .some(([px, py]) => px > box.x - margin && px < box.x + box.width + margin && py > box.y - margin && py < box.y + box.height + margin);
  }));
  const apart = (a, b) => a.x + a.width + 3 < b.x || b.x + b.width + 3 < a.x || a.y + a.height + 3 < b.y || b.y + b.height + 3 < a.y;
  // An annotation's label is a callout: its text in a pill (wrapped at 200 px) in the first free cell the placement finds (cells that sit on a curve are skipped first), and a 1.5 px leader
  // with the standard head ending at the mark: a point's ring (stop = its radius), else the annotation's anchor. No numbered badge is drawn: a number would point at a list that is gone.
  let calloutCount = 0;
  function callout(anchor, text, stop = 0) {
    if (calloutCount >= PLOT_NOTES_MAX) return;
    calloutCount++;
    const lines = wrap(text, 200, SMALL);
    const size = Math.ceil(Math.max(...lines.map(line => Math.max(textWidth(line, SMALL), widestFormula(line, SMALL))))) + 20, tall = Math.max(22, lines.length * lineHeight(SMALL) + 8);
    let box;
    for (const avoidCurves of [true, false]) {
      for (let radius = 0; radius <= 7 && !box; radius++) {
        // The first choice is 14 px up and to the right of the mark, clear of its ring.
        for (const [dx, dy] of [[14 + 22 * radius, -14 - tall - 22 * radius], [-size - 10 - 22 * radius, -24], [10, 10 + 22 * radius], [-size - 10, 10 + 22 * radius], [10, -24 - 22 * radius]]) {
          const candidate = { x: Math.max(left + 2, Math.min(right - size - 2, anchor[0] + dx)),
            y: Math.max(top + 2, Math.min(bottom - tall - 2, anchor[1] + dy)), width: size, height: tall };
          if (occupied.every(other => apart(candidate, other)) && (!avoidCurves || !onCurve(candidate))) { box = candidate; break; }
        }
      }
      if (box) break;
    }
    // Dense repeated coordinates use a free row in the chart; the mark stays exact and the leader keeps the label tied to it.
    if (!box) {
      for (let row = top + 2; row < bottom - tall && !box; row += tall + 4) {
        for (let col = left + 2; col < right - size - 2; col += 26) {
          if (occupied.every(other => apart({ x: col, y: row, width: size, height: tall }, other))) { box = { x: col, y: row, width: size, height: tall }; break; }
        }
      }
    }
    if (!box) return;
    occupied.push(box);
    const corner = [Math.max(box.x, Math.min(box.x + size, anchor[0])), Math.max(box.y, Math.min(box.y + tall, anchor[1]))];
    const away = Math.hypot(anchor[0] - corner[0], anchor[1] - corner[1]) || 1;
    const end = [anchor[0] - (anchor[0] - corner[0]) * stop / away, anchor[1] - (anchor[1] - corner[1]) * stop / away];
    foreground.push(h('g', { 'data-tutor-plot-leader': text }, wire([corner, end], { width: 1.5 })));
    foreground.push(h('rect', { ...box, rx: Math.min(11, tall / 2), fill: T.surface, stroke: T.outline, strokeWidth: 1.5, 'data-tutor-plot-callout': text }));
    foreground.push(label(lines, box.x + size / 2, box.y + tall / 2, { size: SMALL, weight: 700 }));
  }
  for (const [i, a] of (d.annotations ?? []).entries()) {
    const color = COLORS[i % 3], fill = SOFT[i % 3];
    const props = { fill, stroke: T.outline, strokeWidth: 1.5 };
    let anchor;
    if (a.kind === 'point') {
      anchor = xy(a);
      foreground.push(h('circle', { cx: anchor[0], cy: anchor[1], r: 6, fill: bandFill(a.x), stroke: T.outline, strokeWidth: 2, 'data-tutor-plot-point': `${a.x},${a.y}` }));
    } else if (a.kind === 'segment' || a.kind === 'vector') {
      const start = xy(a.from), end = xy(a.to);
      anchor = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
      const line = teachingConnector([start, end], { arrow: a.kind === 'vector', active: true });
      geometry.push(h('g', { 'data-tutor-plot-segment': a.kind }, line));
    } else if (a.kind === 'reference-line') {
      const attrs = a.axis === 'x' ? { x1: x(a.value), x2: x(a.value), y1: top, y2: bottom }
        : { x1: left, x2: right, y1: y(a.value), y2: y(a.value) };
      anchor = [(attrs.x1 + attrs.x2) / 2, (attrs.y1 + attrs.y2) / 2];
      geometry.push(h('line', { ...attrs, stroke: color, strokeWidth: 1.8, strokeDasharray: '5 4', 'data-tutor-plot-reference': `${a.axis}:${a.value}` }));
    } else if (a.kind === 'rectangle' || a.kind === 'band') {
      const xMin = a.kind === 'rectangle' ? a.xMin : a.axis === 'x' ? a.from : d.x.min;
      const xMax = a.kind === 'rectangle' ? a.xMax : a.axis === 'x' ? a.to : d.x.max;
      const yMin = a.kind === 'rectangle' ? a.yMin : a.axis === 'y' ? a.from : d.y.min;
      const yMax = a.kind === 'rectangle' ? a.yMax : a.axis === 'y' ? a.to : d.y.max;
      anchor = [(x(xMin) + x(xMax)) / 2, (y(yMin) + y(yMax)) / 2];
      // A band is a pale wash: its colour at 0.18 over the ground (the legend pills' tint), no outline, so the curve, the stems and the points on it read through it.
      const under = a.kind === 'band' && a.axis === 'x' && clipId;
      if (under && !geometry.some(item => item.props?.id === clipId)) geometry.push(h('clipPath', { id: clipId }, h('path', { d: underPath })));
      geometry.push(h('rect', { x: x(xMin), y: y(yMax), width: x(xMax) - x(xMin), height: y(yMin) - y(yMax),
        ...(a.kind === 'band' ? { fill: mixHex(fill, T.ground, 0.18), stroke: 'none' } : props), ...(under ? { clipPath: `url(#${clipId})` } : {}), [`data-tutor-plot-${a.kind}`]: a.label }));
    } else if (a.kind === 'polygon') {
      const vertices = a.points.map(xy);
      anchor = vertices.reduce((sum, p) => [sum[0] + p[0] / vertices.length, sum[1] + p[1] / vertices.length], [0, 0]);
      geometry.push(h('polygon', { points: pointString(vertices), ...props, 'data-tutor-plot-polygon': a.label }));
    } else if (a.kind === 'circle' || a.kind === 'ellipse') {
      const rx = a.radius ?? a.radiusX, ry = a.radius ?? a.radiusY;
      anchor = xy(a.center);
      if (d.x.scale === 'log' || d.y.scale === 'log') {
        // A data-space circle is not an SVG ellipse after a logarithmic transform.
        const vertices = Array.from({ length: 96 }, (_, j) => xy({ x: a.center.x + rx * Math.cos(j * Math.PI / 48), y: a.center.y + ry * Math.sin(j * Math.PI / 48) }));
        geometry.push(h('polygon', { points: pointString(vertices), ...props, [`data-tutor-plot-${a.kind}`]: a.label }));
      } else geometry.push(h('ellipse', { cx: anchor[0], cy: anchor[1], rx: x(a.center.x + rx) - anchor[0], ry: anchor[1] - y(a.center.y + ry),
        ...props, [`data-tutor-plot-${a.kind}`]: a.label }));
    }
    // A point whose label only restates its coordinates (PL-1) draws no callout: its ring carries it.
    if (!(a.kind === 'point' && restatesPoint(a.label, a))) callout(anchor, a.label, a.kind === 'point' ? 7 : 0);
  }
  // A line series draws no marker where a scatter series has a point (within 0.5 px): the scatter's marker stays, drawn last (on top).
  const scatterAt = d.series.flatMap((series, k) => series.kind === 'scatter' ? curves[k] : []);
  const marks = [], scatterMarks = [], legend = [];
  for (const [i, series] of d.series.entries()) {
    const hasUncertainty = series.points[0].low !== undefined;
    if (hasUncertainty && ['line', 'step'].includes(series.kind)) {
      const high = series.points.map(p => [x(p.x), y(p.high)]);
      const low = series.points.map(p => [x(p.x), y(p.low)]);
      const project = values => series.kind === 'step' ? stepPoints(values) : values;
      geometry.push(h('polygon', { points: pointString([...project(high), ...project(low).reverse()]), fill: SOFT[i], fillOpacity: 0.4, stroke: COLORS[i], strokeWidth: 0.8,
        'data-tutor-plot-uncertainty': series.label }));
    }
    const values = series.points.map(xy);
    if (series.kind === 'line' || series.kind === 'step') {
      // A line is the smooth curve through its samples (monotone cubic; a closed contour a smooth closed curve) unless the author says smooth: false: then straight segments.
      const path = drawnPath(series, values);
      geometry.push(curve(series.kind === 'step' ? stepPoints(values) : values, i, { 'data-tutor-plot-series': series.label }, path));
    }
    series.points.forEach((p, j) => {
      const [cx, cy] = values[j];
      if (series.kind === 'stem') geometry.push(h('line', { x1: cx, x2: cx, y1: y(0), y2: cy, stroke: COLORS[i], strokeWidth: 2, 'data-tutor-plot-stem': `${p.x},${p.y}` }));
      if (hasUncertainty && ['scatter', 'stem'].includes(series.kind)) {
        const lo = y(p.low), hi = y(p.high);
        geometry.push(h('path', { d: `M ${cx} ${lo} V ${hi} M ${cx - 4} ${lo} H ${cx + 4} M ${cx - 4} ${hi} H ${cx + 4}`,
          fill: 'none', stroke: COLORS[i], strokeWidth: 1.5, 'data-tutor-plot-errorbar': `${p.low},${p.high}` }));
      }
      // A curve is thinned so its markers do not read as noise: every sample up to 8, every other one from 9 to 19, the line alone from 20 (labelled samples keep theirs).
      const n = series.points.length;
      const marked = series.kind === 'line' && !series.closed
        ? n <= PLOT_MARKER_ALL_MAX_SAMPLES || showPlotMarker(series, j) || Boolean(p.id) : showPlotMarker(series, j);
      const covered = series.kind === 'line' && scatterAt.some(([sx, sy]) => Math.hypot(sx - cx, sy - cy) <= 0.5);
      if (marked && !covered) (series.kind === 'scatter' ? scatterMarks : marks).push(symbol(cx, cy, i, { 'data-tutor-coordinate-point': `${p.x},${p.y}`, 'data-tutor-sample-id': p.id }, `${series.label}: (${p.x}, ${p.y})${p.label ? ` · ${p.label}` : ''}`, MARKER));
      // A single short series prints each value above its marker.
      if (d.series.length === 1 && series.points.length <= PLOT_VALUE_LABEL_MAX_SAMPLES) {
        // Kept clear of the y axis and inside the card, so a sample on the axis does not print over the tick labels.
        const half = textWidth(String(p.y), 15) * 0.55 + 2;
        // A sample on the y axis prints its value to the right of the marker, centred on it (above would sit on the line, below beside the tick labels).
        const onAxis = cx < left + half + 6;
        foreground.push(cloneElement(label(String(p.y), onAxis ? cx + MARKER + 5 + half : Math.min(width - PAD - half, cx), onAxis ? cy : cy - MARKER - 11, { size: 15, weight: 700 }), { 'data-tutor-plot-value': `${p.x},${p.y}` }));
      }
    });
    legend.push({ i, text: `${series.label}${hasUncertainty ? ' · low/high interval' : ''}` });
  }
  if (legend.length) {
    const drawn = legendPills(legend, width, legendY);
    elements.push(...drawn.elements);
    legendY += drawn.height;
  }
  // No numbered note list under the figure: a badge on the chart is the whole note (its text stays in the card's prose). PLOT_NOTES_MAX caps the badges.
  if (legend.length) legendY += 16;
  let nextLabelTop = top;
  for (const { name, value, color, lines, height } of endLabels.labels) {
    const anchor = y(value);
    const rowTop = Math.max(nextLabelTop, Math.min(bottom - remainingLabels, anchor - height / 2));
    const center = rowTop + height / 2;
    foreground.push(h('line', { x1: right + 4, y1: anchor, x2: right + 9, y2: center, stroke: color, strokeWidth: 1.2 }),
      cloneElement(label(lines, right + 12, center, { size: SMALL, anchor: 'start', fill: color }), { 'data-tutor-plot-end-label': name }));
    nextLabelTop = rowTop + height + 4;
    remainingLabels -= height + 4;
  }
  const crowded = Math.max(0, ...xTicks.slice(1).map((tick, i) => tickSpan(xTicks[i])[1] + 4 - tickSpan(tick)[0]));
  return { width, height: legendY, plotBounds: bounds, crowded, elements: [...elements, ...geometry, ...marks, ...scatterMarks, ...foreground] };
}

// BAR-1: the bar chart as the written diagrams draw it: vertical bars, an L-axis in ink (2 px, the value axis on the left and the category baseline at zero, no top or right line, no box),
// dotted gridlines at the value ticks, one fill per category in the palette's series order (a grouped chart: one fill per series, as its legend pills), the value above each bar (not with more than
// 12 bars, or on a bar narrower than the label), square 2 px outlined bars with a gap of 40% of the bar width. A single series has no legend. A plain bars chart is one series of one bar per category.
const BAR_FILLS = [T.blueFill, T.mustardFill, T.tealFill, T.coral, T.olive, T.lavender, T.rose, T.slate];
function verticalBars(d, requested, options) {
  const grouped = d.variant === 'grouped';
  const categories = grouped ? d.categories : d.bars.map(bar => bar.label);
  const series = grouped ? d.series : [{ label: d.title ?? '', values: d.bars.map(bar => bar.value) }];
  const n = categories.length, k = series.length;
  const width = bodyWidth(d, requested);
  const values = series.flatMap(entry => entry.values);
  let min = Math.min(0, ...values), max = Math.max(0, ...values);
  if (min === max) { min = -1; max = 1; }
  const PLOT = 210, top = PAD + 24, bottom = top + PLOT;
  const y = scale({ min, max }, bottom, top);
  const ticks = plotTicks({ min, max }, y, { horizontal: false });
  const tickWidth = Math.ceil(Math.max(...ticks.map(tick => Math.max(...tick.lines.map(line => textWidth(line, TICK))))));
  const left = PAD + tickWidth + 10, right = width - PAD - 10;
  const slot = (right - left) / n, inner = 2; // 2 px between the bars of one cluster
  const barWidth = (slot - inner * (k - 1)) / (k + 0.4);
  const cluster = k * barWidth + (k - 1) * inner;
  const elements = [];
  // Dotted gridlines behind everything, at the value ticks (the baseline stands at zero).
  for (const tick of ticks) {
    elements.push(h('line', { x1: left, x2: right, y1: tick.at, y2: tick.at, stroke: T.outline, strokeOpacity: 0.3, strokeWidth: GRID, strokeDasharray: '1.5 4', strokeLinecap: 'round', 'data-tutor-plot-grid': '' }));
    elements.push(label(tick.lines, left - 8, tick.at, { anchor: 'end', size: TICK }));
  }
  const showValues = n * k <= 12;
  const bars = [], labels = [];
  categories.forEach((category, i) => {
    const start = left + slot * i + (slot - cluster) / 2;
    const name = wrap(category, slot - 4, SMALL + 1);
    labels.push(label(name, left + slot * (i + 0.5), bottom + 10 + name.length * lineHeight(SMALL + 1) / 2, { size: SMALL + 1 }));
    series.forEach((entry, j) => {
      const value = entry.values[i], x = start + j * (barWidth + inner), cx = x + barWidth / 2, zero = y(0), end = y(value);
      const fill = grouped ? COLORS[j] : options?.labelColors?.get(category) ?? BAR_FILLS[i % BAR_FILLS.length];
      const attrs = grouped ? { 'data-tutor-grouped-bar': value, 'data-tutor-bar-category': category, 'data-tutor-bar-series': entry.label, 'data-tutor-stack-from': 0, 'data-tutor-stack-to': value }
        : { 'data-tutor-bar': value };
      if (value !== 0) bars.push(h('rect', { x, y: Math.min(zero, end), width: barWidth, height: Math.abs(zero - end), fill, stroke: T.outline, strokeWidth: 2, ...attrs }));
      else bars.push(h('line', { x1: x, x2: x + barWidth, y1: zero, y2: zero, stroke: T.outline, strokeWidth: 2, ...attrs }));
      const text = amount(value, d.unit);
      if (showValues && textWidth(text, TICK) <= barWidth + inner + 0.4 * barWidth) labels.push(label(text, cx, value < 0 ? end + 12 : end - 12, { size: TICK, weight: 600 }));
    });
  });
  elements.push(...bars);
  // The L-axis over the bars' feet: the value axis, and the category baseline at zero.
  elements.push(h('line', { x1: left, x2: left, y1: top - 6, y2: bottom, stroke: T.outline, strokeWidth: 2, strokeLinecap: 'round', 'data-tutor-bar-axis': '' }),
    h('line', { x1: left, x2: right, y1: y(0), y2: y(0), stroke: T.outline, strokeWidth: 2, strokeLinecap: 'round', 'data-tutor-bar-baseline': '' }), ...labels);
  const labelsHeight = Math.max(1, ...categories.map(category => wrap(category, slot - 4, SMALL + 1).length)) * lineHeight(SMALL + 1);
  let bottomOfLabels = bottom + 10 + labelsHeight + 8;
  if (grouped) {
    const drawn = legendPills(series.map((entry, i) => ({ i, text: entry.label })), width, bottomOfLabels + 4);
    elements.push(...drawn.elements);
    bottomOfLabels += 4 + drawn.height + 8;
  }
  return { width, height: bottomOfLabels + PAD, elements };
}

function barChart(d, requested, options) {
  if (d.variant !== 'stacked') return verticalBars(d, requested, options);
  const width = bodyWidth(d, requested);
  const left = 120, right = width - 86;
  const groups = d.categories.map((category, i) => {
    let positive = 0, negative = 0;
    const segments = d.series.map((series, j) => {
      const value = series.values[i];
      const from = d.variant === 'grouped' ? 0 : value >= 0 ? positive : negative;
      const to = from + value;
      if (d.variant === 'stacked') { if (value >= 0) positive = to; else negative = to; }
      return { label: series.label, index: j, value, from, to };
    });
    return { category, segments, positive, negative };
  });
  const all = groups.flatMap(g => g.segments.flatMap(s => [s.from, s.to]));
  let min = Math.min(0, ...all), max = Math.max(0, ...all);
  if (min === max) { min = -1; max = 1; }
  const x = scale({ min, max }, left, right), zero = x(0);
  const elements = [];
  let top = PAD + 26;
  const chartTop = top;
  const baseline = (y1, y2) => h('line', { x1: zero, x2: zero, y1, y2, stroke: TEACHING_ZERO, strokeWidth: GRID, 'data-tutor-bar-baseline': '' });
  elements.push(label(format(min), left, top - 14, { anchor: 'start', size: SMALL }));
  elements.push(label(format(max), right, top - 14, { anchor: 'end', size: SMALL }));
  for (const group of groups) {
    const name = wrap(group.category, left - PAD - 14);
    const height = d.variant === 'grouped' ? Math.max(group.segments.length * 28, name.length * lineHeight()) : Math.max(30, name.length * lineHeight());
    elements.push(label(name, PAD, top + height / 2, { anchor: 'start' }));
    // A stacked chart's baseline stops at each group's bar row (its value notes sit between the groups); grouped bars share one continuous baseline.
    if (d.variant === 'stacked') elements.push(baseline(top, top + height));
    for (const segment of group.segments) {
      const cy = d.variant === 'grouped' ? top + (segment.index + 0.5) * height / group.segments.length : top + height / 2;
      const attrs = { [`data-tutor-${d.variant}-bar`]: segment.value, 'data-tutor-bar-category': group.category, 'data-tutor-bar-series': segment.label,
        'data-tutor-stack-from': segment.from, 'data-tutor-stack-to': segment.to };
      if (!segment.value) elements.push(h('circle', { cx: x(segment.from), cy, r: 3, fill: COLORS[segment.index], ...attrs }));
      else elements.push(h('rect', { x: Math.min(x(segment.from), x(segment.to)), y: cy - 9, width: Math.abs(x(segment.to) - x(segment.from)), height: 18,
        fill: COLORS[segment.index], stroke: T.outline, strokeWidth: 1.2, ...attrs }));
      if (d.variant === 'grouped') elements.push(label(wrap(amount(segment.value, d.unit), width - right - 16, SMALL), right + 8, cy, { anchor: 'start', size: SMALL }));
    }
    top += height + 6;
    if (d.variant === 'stacked') {
      const totals = `+${group.positive} / ${group.negative}; net ${group.positive + group.negative}${d.unit ? ` ${d.unit}` : ''}`;
      const lines = wrap(`${group.segments.map(s => `${s.label}: ${s.value}`).join('; ')} · ${totals}`, width - 2 * PAD);
      elements.push(label(lines, PAD, top + lines.length * lineHeight(SMALL) / 2, { anchor: 'start', size: SMALL }));
      top += lines.length * lineHeight(SMALL) + 10;
    }
    top += 10;
  }
  // No axis lines: the baseline at zero is one solid muted guide the bars sit on; the ends of the scale get dashed guides. All run behind the bars.
  const chartBottom = top - 10;
  const guides = [min, max].filter(value => value !== 0).map(value => h('line', { x1: x(value), x2: x(value), y1: chartTop - 4, y2: chartBottom, stroke: TEACHING_GRID, strokeWidth: GRID, strokeDasharray: '4 4', 'data-tutor-plot-grid': '' }));
  elements.unshift(...guides, ...(d.variant === 'stacked' ? [] : [baseline(chartTop - 4, chartBottom)]));
  // The legend sits under the bars, 16 px below the last one.
  const drawn = legendPills(d.series.map((series, i) => ({ i, text: series.label })), width, top + 6);
  elements.push(...drawn.elements);
  return { width, height: top + 6 + drawn.height + 16, elements };
}

// One bar split into its parts in the order written, first part on top; a part's height is its share of `total` (or of the parts' sum), so a stated total
// of 1 makes the whole bar one unit tall. Each label stands beside its part, pushed down just enough not to touch the one above, with a leader when moved.
function stackedBar(d, requested, options) {
  const width = Math.max(requested, 220), SIZE = 14, HEIGHT = 200, BAR = 64, top = PAD + 8, left = PAD + 12, textX = left + BAR + 22;
  const sum = d.bars.reduce((all, bar) => all + bar.value, 0), total = d.total ?? sum;
  const elements = [];
  // Every part prints to the decimals of the longest value written (0.10 beside 0.66), the same precision down the whole bar.
  const places = Math.max(...d.bars.map(bar => (String(bar.value).split('.')[1] ?? '').length));
  let before = 0, nextTop = top;
  for (const [i, bar] of d.bars.entries()) {
    const y = top + HEIGHT * before / total, height = HEIGHT * bar.value / total, middle = y + height / 2;
    elements.push(h('rect', { x: left, y, width: BAR, height, fill: options?.labelColors?.get(bar.label) ?? COLORS[i % COLORS.length], stroke: T.outline, strokeWidth: 1.5,
      'data-tutor-stacked-part': bar.value, 'data-tutor-bar-series': bar.label, 'data-tutor-stack-from': before, 'data-tutor-stack-to': before + bar.value }, h('title', null, `${bar.label}: ${bar.value.toFixed(places)}`)));
    const lines = wrap(`${bar.label}: ${bar.value.toFixed(places)}`, width - textX - PAD, SIZE), rows = lines.length * lineHeight(SIZE);
    const centre = Math.max(middle, nextTop + rows / 2);
    if (Math.abs(centre - middle) > 2) elements.push(teachingConnector([[left + BAR, middle], [textX - 6, centre]], { arrow: false }));
    elements.push(label(lines, textX, centre, { anchor: 'start', size: SIZE }));
    nextTop = centre + rows / 2 + 3;
    before += bar.value;
  }
  elements.push(h('rect', { x: left, y: top, width: BAR, height: HEIGHT * sum / total, fill: 'none', stroke: T.ink, strokeWidth: 1.2, 'data-tutor-stacked-total': total }));
  const caption = wrap(`${d.total !== undefined ? 'Whole bar' : 'Sum of the parts'}: ${total}${d.unit ? ` ${d.unit}` : ''}`, width - 2 * PAD, SMALL);
  const captionTop = Math.max(top + HEIGHT, nextTop) + 14;
  elements.push(label(caption, PAD, captionTop + caption.length * lineHeight(SMALL) / 2, { anchor: 'start', size: SMALL, tone: 'muted' }));
  return { width, height: captionTop + caption.length * lineHeight(SMALL) + PAD, elements };
}

export function createLayouts({ legacy }) {
  return {
    // Every coordinate plot, plain or extended, is drawn by this layout: a plain spec gets the theme defaults with no styling field (the legacy plot layout is no longer used).
    'coordinate-plot': (d, width, options) => coordinatePlot(d, width, options),
    'bar-chart': (d, width, options) => isStackedBar(d) ? stackedBar(d, width, options) : d.variant || !options?.compact ? barChart(d, width, options) : legacy['bar-chart'](d, width, options),
  };
}
