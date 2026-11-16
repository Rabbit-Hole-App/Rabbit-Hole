import { cloneElement, createElement as h } from 'react';
import { label, lineHeight, textWidth, widestFormula, wrap } from './primitives.js';
import { closedLinePath, monotoneLinePath, showPlotMarker } from './plot-lines.js';
import { plotTicks } from './plot-ticks.js';
import { TEACHING as T, TEACHING_GRID, TEACHING_SERIES, TEACHING_SERIES_INK, teachingConnector } from './teaching-theme.js';
import { annotationDescription, axisName, isExtendedPlot, isStackedBar, plotSeriesPoints } from './ml-plot-spec.js';

const PAD = 12;
const SMALL = 12;
const COLORS = [...TEACHING_SERIES, T.ink, T.muted];
const INKS = [...TEACHING_SERIES_INK, T.ink, T.muted]; // strokes and text of a series: its darker weight
const TICK = 15, MARKER = 6, LINE = 3.5, GRID = 1.5;
// The caps of a coordinate plot (the author's constraints sheet reads these): value labels only on a plot of ONE series with at most this many samples;
// a marker on every sample of a line series up to this many (above it the line stands alone; labelled samples keep theirs); at most this many numbered notes.
// A note never restates a sample's own coordinates (PL-1): a labelled sample draws no badge and no list line.
export const PLOT_VALUE_LABEL_MAX_SAMPLES = 8, PLOT_MARKER_MAX_SAMPLES = 20, PLOT_NOTES_MAX = 6;
export const PLOT_CAPS = Object.freeze({ valueLabelMaxSamples: PLOT_VALUE_LABEL_MAX_SAMPLES, markerMaxSamples: PLOT_MARKER_MAX_SAMPLES, notesMax: PLOT_NOTES_MAX });
const SOFT = TEACHING_SERIES; // the saturated series fills (the pale soft tokens stay defined, unused)
const DASH = [undefined, '7 4', '2 4', '12 5', '6 3 1 3'];
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
  const props = { fill: COLORS[index], stroke: T.outline, strokeWidth: r > 5 ? 1.5 : 1.2, ...attributes };
  const child = title ? h('title', null, title) : null;
  if (index % 3 === 1) return h('rect', { x: x - r * 0.9, y: y - r * 0.9, width: r * 1.8, height: r * 1.8, ...props }, child);
  if (index % 3 === 2) return h('polygon', { points: pointString([[x, y - r * 1.1], [x + r * 1.1, y], [x, y + r * 1.1], [x - r * 1.1, y]]), ...props }, child);
  return h('circle', { cx: x, cy: y, r, ...props }, child);
}
function curve(points, colorIndex, attributes = {}, path) {
  const geometry = path ? { d: path } : { points: pointString(points) };
  return h(path ? 'path' : 'polyline', { ...geometry, fill: 'none', stroke: INKS[colorIndex], strokeWidth: LINE,
    strokeDasharray: DASH[colorIndex], strokeLinejoin: 'round', strokeLinecap: 'round', ...attributes });
}
function stepPoints(points) {
  return points.flatMap((p, i) => i ? [[p[0], points[i - 1][1]], p] : [p]);
}
function bodyWidth(d, requested) {
  const text = [d.x?.label, d.y?.label, ...(d.series ?? []).map(s => s.label),
    ...(d.annotations ?? []).map(a => a.label), ...(d.categories ?? [])];
  return Math.max(requested, 420, ...text.filter(Boolean).map(t => widestFormula(t) + 150));
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

// The legend of a plot or a bar chart: one pill per series (26 px tall, a 10 px marker and the name at 13 px inside a rounded outline), 12 px apart, centred in
// one row, a second row only when they do not fit. Returns the elements and the height it takes, with the 12 px gap that follows a row.
function legendPills(items, width, top) {
  const pills = items.map(({ i, text }) => {
    const lines = wrap(text, width - 2 * PAD - 52, 13);
    const text13 = Math.ceil(Math.max(...lines.map(line => textWidth(line, 13)), widestFormula(lines.join(' '), 13)));
    return { i, lines, height: Math.max(26, lines.length * lineHeight(13) + 8), width: 12 + 10 + 6 + text13 + 12 };
  });
  const elements = [];
  let y = top;
  for (let start = 0; start < pills.length;) {
    let end = start + 1, total = pills[start].width;
    while (end < pills.length && total + 12 + pills[end].width <= width - 2 * PAD) total += 12 + pills[end++].width;
    const row = pills.slice(start, end), rowHeight = Math.max(...row.map(pill => pill.height));
    let px = (width - total) / 2;
    for (const pill of row) {
      const cy = y + rowHeight / 2;
      elements.push(h('rect', { x: px, y: cy - pill.height / 2, width: pill.width, height: pill.height, rx: Math.min(13, pill.height / 2), fill: T.surface, stroke: T.outline, strokeWidth: 1.5, 'data-tutor-plot-legend': '' }));
      elements.push(symbol(px + 12 + 5, cy, pill.i, {}, undefined, 5));
      elements.push(label(pill.lines, px + 12 + 10 + 6, cy, { anchor: 'start', size: 13, weight: 500 }));
      px += pill.width + 12;
    }
    y += rowHeight + (end < pills.length ? 8 : 0);
    start = end;
  }
  return { elements, height: y - top };
}

function coordinatePlot(diagram, requested, { sharedLabelSpace } = {}) {
  const d = diagram.series.some(series => series.samples) ? { ...diagram,
    series: diagram.series.map(series => series.samples ? { ...series, points: plotSeriesPoints(series) } : series),
  } : diagram;
  const endLabels = plotEndLabels(d.series);
  const endGutter = Math.max(endLabels.gutter, sharedLabelSpace?.gutter ?? 0);
  let remainingLabels = endLabels.height;
  const width = Math.max(bodyWidth(d, requested), 324 + endGutter);
  // The y title runs along the axis when it is plain text that fits the plot's height; otherwise it stays above the plot, bold 16.
  const yName = axisName(d.y);
  const rotateY = widestFormula(yName) === 0 && textWidth(yName, 16) * 1.1 <= 232;
  const top0 = rotateY ? 40 : 66;
  const bottomEdge = top0 + Math.max(240, endLabels.height, sharedLabelSpace?.height ?? 0);
  const bounds = { left: 104, right: width - 24 - endGutter, top: top0, bottom: bottomEdge };
  const { left, right, top, bottom } = bounds;
  const x = scale(d.x, left, right), y = scale(d.y, bottom, top);
  const xy = p => [x(p.x), y(p.y)];
  const elements = [h('rect', { x: left, y: top, width: right - left, height: bottom - top,
    fill: T.surface, 'data-tutor-plot-area': '' })];
  const geometry = [], foreground = [], notes = [];
  if (rotateY) {
    const cx = PAD + 10, cy = (top + bottom) / 2;
    elements.push(h('g', { transform: `rotate(-90 ${cx} ${cy})`, 'data-tutor-plot-y-title': '' }, label(yName, cx, cy, { size: 16, weight: 700 })));
  } else {
    const yTitle = wrap(yName, width - 2 * PAD, 16);
    elements.push(label(yTitle, PAD, PAD + yTitle.length * lineHeight(16) / 2, { anchor: 'start', weight: 700, size: 16 }));
  }
  let xTicks = plotTicks(d.x, x, { horizontal: true });
  // A log axis labels every sampled x; a decade label that would touch one of them is dropped.
  if (d.x.scale === 'log' && d.series.every(s => s.points.length <= 8)) {
    const wide = lines => Math.max(...lines.map(line => textWidth(line, TICK)));
    const sampled = [...new Set(d.series.flatMap(s => s.points.map(p => p.x)))].sort((a, b) => a - b)
      .map(value => ({ at: x(value), lines: [String(value)], anchor: value <= d.x.min ? 'start' : value >= d.x.max ? 'end' : 'middle' }));
    xTicks = [...sampled, ...xTicks.filter(tick => !sampled.some(s => s.at === tick.at)
      && sampled.every(s => Math.abs(s.at - tick.at) >= (wide(tick.lines) + wide(s.lines)) / 2 + 8))].sort((a, b) => a.at - b.at);
  }
  // Horizontal guides only; the two axes are the plot's whole frame.
  for (const { at, lines, anchor } of plotTicks(d.y, y, { labelWidth: left - PAD - 8 })) {
    elements.push(h('line', { x1: left, x2: right, y1: at, y2: at, stroke: TEACHING_GRID, strokeWidth: GRID, strokeDasharray: '4 4', 'data-tutor-plot-grid': '' }));
    elements.push(label(lines, left - 8, at, { anchor, size: TICK, fill: T.muted }));
  }
  elements.push(h('polyline', { points: `${left},${top} ${left},${bottom} ${right},${bottom}`, fill: 'none', stroke: T.outline, strokeWidth: 1.5,
    strokeLinejoin: 'round', strokeLinecap: 'round', 'data-tutor-plot-axes': '' }));
  const tickHeight = Math.max(...xTicks.map(tick => tick.lines.length)) * lineHeight(TICK);
  for (const { at, lines, anchor } of xTicks) elements.push(label(lines, at, bottom + 8 + tickHeight / 2, { anchor, size: TICK, fill: T.muted }));
  const xTitle = wrap(axisName(d.x), right - left, 16);
  let legendY = bottom + tickHeight + 18;
  elements.push(label(xTitle, right, legendY + xTitle.length * lineHeight(16) / 2, { anchor: 'end', weight: 700, size: 16 }));
  legendY += xTitle.length * lineHeight(16) + 16;
  const occupied = [];
  function note(anchor, text) {
    if (notes.length >= PLOT_NOTES_MAX) return;
    const number = notes.length + 1;
    notes.push({ number, text });
    const size = number > 9 ? 22 : 18;
    let box;
    for (let radius = 0; radius <= 7 && !box; radius++) {
      for (const [dx, dy] of [[10 + 22 * radius, -24], [-size - 10 - 22 * radius, -24], [10, 10 + 22 * radius], [-size - 10, 10 + 22 * radius], [10, -24 - 22 * radius]]) {
        const candidate = { x: Math.max(left + 2, Math.min(right - size - 2, anchor[0] + dx)),
          y: Math.max(top + 2, Math.min(bottom - 20, anchor[1] + dy)), width: size, height: 18 };
        if (occupied.every(other => candidate.x + size + 3 < other.x || other.x + other.width + 3 < candidate.x ||
            candidate.y + 21 < other.y || other.y + 21 < candidate.y)) { box = candidate; break; }
      }
    }
    // Dense repeated coordinates use a free row in the chart; their data marks
    // remain exact and a leader preserves the relationship to the label.
    if (!box) {
      for (let row = top + 2; row < bottom - 18 && !box; row += 22) {
        for (let col = left + 2; col < right - size - 2; col += 26) {
          if (occupied.every(other => col + size + 3 < other.x || other.x + other.width + 3 < col || row + 21 < other.y || other.y + 21 < row)) {
            box = { x: col, y: row, width: size, height: 18 }; break;
          }
        }
      }
    }
    if (!box) return; // Schema-bounded marks fit the chart's available badge cells.
    occupied.push(box);
    foreground.push(teachingConnector([anchor, [box.x + size / 2, box.y + 9]]));
    foreground.push(h('rect', { ...box, rx: 4, fill: T.surface, stroke: T.outline, strokeWidth: 1.5, 'data-tutor-plot-badge': number }));
    foreground.push(label(String(number), box.x + size / 2, box.y + 9, { size: SMALL, weight: 700 }));
  }
  for (const [i, a] of (d.annotations ?? []).entries()) {
    const color = INKS[i % 3], fill = SOFT[i % 3];
    const props = { fill, stroke: T.outline, strokeWidth: 1.5 };
    let anchor;
    if (a.kind === 'point') {
      anchor = xy(a);
      foreground.push(h('circle', { cx: anchor[0], cy: anchor[1], r: 6, fill: T.surface, stroke: T.outline, strokeWidth: 2, 'data-tutor-plot-point': `${a.x},${a.y}` }));
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
      geometry.push(h('rect', { x: x(xMin), y: y(yMax), width: x(xMax) - x(xMin), height: y(yMin) - y(yMax),
        ...props, [`data-tutor-plot-${a.kind}`]: a.label }));
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
    note(anchor, annotationDescription(a));
  }
  const marks = [], legend = [];
  for (const [i, series] of d.series.entries()) {
    const hasUncertainty = series.points[0].low !== undefined;
    let band;
    if (hasUncertainty && ['line', 'step'].includes(series.kind)) {
      const high = series.points.map(p => [x(p.x), y(p.high)]);
      const low = series.points.map(p => [x(p.x), y(p.low)]);
      if (series.kind === 'line') band = high.map((point, j) => [point[1], low[j][1]]);
      const project = values => series.kind === 'step' ? stepPoints(values) : values;
      geometry.push(h('polygon', { points: pointString([...project(high), ...project(low).reverse()]), fill: SOFT[i], fillOpacity: 0.4, stroke: INKS[i], strokeWidth: 0.8,
        'data-tutor-plot-uncertainty': series.label }));
    }
    const values = series.points.map(xy);
    if (series.kind === 'line' || series.kind === 'step') {
      // Straight segments between samples; the smooth curve only for a dense series (20 samples or more) or when the author asks for it.
      const smooth = series.smooth ?? series.points.length >= 20;
      let path;
      if (series.closed) path = closedLinePath(values, smooth);
      else if (series.kind === 'line' && smooth) path = monotoneLinePath(values, band);
      geometry.push(curve(series.kind === 'step' ? stepPoints(values) : values, i, { 'data-tutor-plot-series': series.label }, path));
    }
    series.points.forEach((p, j) => {
      const [cx, cy] = values[j];
      if (series.kind === 'stem') geometry.push(h('line', { x1: cx, x2: cx, y1: y(0), y2: cy, stroke: INKS[i], strokeWidth: 2, 'data-tutor-plot-stem': `${p.x},${p.y}` }));
      if (hasUncertainty && ['scatter', 'stem'].includes(series.kind)) {
        const lo = y(p.low), hi = y(p.high);
        geometry.push(h('path', { d: `M ${cx} ${lo} V ${hi} M ${cx - 4} ${lo} H ${cx + 4} M ${cx - 4} ${hi} H ${cx + 4}`,
          fill: 'none', stroke: INKS[i], strokeWidth: 1.5, 'data-tutor-plot-errorbar': `${p.low},${p.high}` }));
      }
      // Every sample of a line series up to the cap gets its marker (a 12 px circle); a longer one is the line alone, its labelled samples apart.
      const marked = series.kind === 'line' && !series.closed ? series.points.length <= PLOT_MARKER_MAX_SAMPLES || Boolean(p.label || p.id) : showPlotMarker(series, j);
      if (marked) marks.push(symbol(cx, cy, i, { 'data-tutor-coordinate-point': `${p.x},${p.y}`, 'data-tutor-sample-id': p.id }, `${series.label}: (${p.x}, ${p.y})${p.label ? ` · ${p.label}` : ''}`, MARKER));
      // A single short series prints each value above its marker.
      if (d.series.length === 1 && series.points.length <= PLOT_VALUE_LABEL_MAX_SAMPLES) {
        // Kept clear of the y axis and inside the card, so a sample on the axis does not print over the tick labels.
        const half = textWidth(String(p.y), 15) * 0.55 + 2;
        // A sample on the axis prints its value below the marker: the line leaves it upward, so above would sit on the line.
        const onAxis = cx < left + half + 6;
        foreground.push(cloneElement(label(String(p.y), Math.max(left + half + 6, Math.min(width - PAD - half, cx)), onAxis ? cy + MARKER + 12 : cy - MARKER - 11, { size: 15, weight: 700 }), { 'data-tutor-plot-value': `${p.x},${p.y}` }));
      }
    });
    legend.push({ i, text: `${series.label}${hasUncertainty ? ' · low/high interval' : ''}` });
  }
  if (legend.length) {
    const drawn = legendPills(legend, width, legendY);
    elements.push(...drawn.elements);
    legendY += drawn.height;
  }
  // The notes under the legend: one line each, 13 px muted, the number in the same small outlined badge as on the chart.
  const listed = notes;
  if (listed.length) {
    legendY += 12;
    for (const item of listed) {
      const lines = wrap(item.text.replace(/^([^:]+): /, '$1 '), width - 2 * PAD - 30, 13);
      const height = Math.max(20, lines.length * lineHeight(13));
      elements.push(h('rect', { x: PAD, y: legendY + height / 2 - 9, width: item.number > 9 ? 22 : 18, height: 18, rx: 4, fill: T.surface, stroke: T.outline, strokeWidth: 1.5, 'data-tutor-plot-note-badge': item.number }));
      elements.push(label(String(item.number), PAD + (item.number > 9 ? 11 : 9), legendY + height / 2, { size: SMALL, weight: 700 }));
      elements.push(label(lines, PAD + (item.number > 9 ? 22 : 18) + 8, legendY + height / 2, { anchor: 'start', size: 13, weight: 400, fill: T.muted }));
      legendY += height + 6;
    }
    legendY += 10;
  } else if (legend.length) legendY += 16;
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
  return { width, height: legendY, plotBounds: bounds, elements: [...elements, ...geometry, ...marks, ...foreground] };
}

function barChart(d, requested) {
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
  elements.push(label(format(min), left, top - 14, { anchor: 'start', size: SMALL }));
  elements.push(label(format(max), right, top - 14, { anchor: 'end', size: SMALL }));
  for (const group of groups) {
    const name = wrap(group.category, left - PAD - 14);
    const height = d.variant === 'grouped' ? Math.max(group.segments.length * 28, name.length * lineHeight()) : Math.max(30, name.length * lineHeight());
    elements.push(h('line', { x1: zero, x2: zero, y1: top, y2: top + height, stroke: T.outline, strokeWidth: 1.5, 'data-tutor-bar-baseline': '' }));
    elements.push(label(name, PAD, top + height / 2, { anchor: 'start' }));
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
    'coordinate-plot': (d, width, options) => isExtendedPlot(d) ? coordinatePlot(d, width, options) : legacy['coordinate-plot'](d, width),
    'bar-chart': (d, width, options) => isStackedBar(d) ? stackedBar(d, width, options) : d.variant ? barChart(d, width) : legacy['bar-chart'](d, width, options),
  };
}
