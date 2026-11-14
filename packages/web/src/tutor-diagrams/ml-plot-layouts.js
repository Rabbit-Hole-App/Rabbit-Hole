import { cloneElement, createElement as h } from 'react';
import { label, lineHeight, textWidth, widestFormula, wrap } from './primitives.js';
import { closedLinePath, monotoneLinePath, showPlotMarker } from './plot-lines.js';
import { plotTicks } from './plot-ticks.js';
import { TEACHING as T, TEACHING_SERIES, teachingConnector } from './teaching-theme.js';
import { annotationDescription, axisName, isExtendedPlot, isStackedBar, plotNotedPoints, plotSeriesPoints } from './ml-plot-spec.js';

const PAD = 12;
const SMALL = 12;
const COLORS = [...TEACHING_SERIES, T.ink, T.muted];
const SOFT = [T.blueSoft, T.warmSoft, T.greenSoft, T.inset, T.inset];
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
function symbol(x, y, index, attributes = {}, title) {
  const props = { fill: COLORS[index], stroke: T.surface, strokeWidth: 1.1, ...attributes };
  const child = title ? h('title', null, title) : null;
  if (index % 3 === 1) return h('rect', { x: x - 4, y: y - 4, width: 8, height: 8, ...props }, child);
  if (index % 3 === 2) return h('polygon', { points: pointString([[x, y - 5], [x + 5, y], [x, y + 5], [x - 5, y]]), ...props }, child);
  return h('circle', { cx: x, cy: y, r: 4.5, ...props }, child);
}
function curve(points, colorIndex, attributes = {}, path) {
  const geometry = path ? { d: path } : { points: pointString(points) };
  return h(path ? 'path' : 'polyline', { ...geometry, fill: 'none', stroke: COLORS[colorIndex], strokeWidth: 2,
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
  const endSeries = series.flatMap((entry, i) => entry.endLabel ? [{ entry, color: COLORS[i] }] : []);
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

function coordinatePlot(diagram, requested, { sharedLabelSpace } = {}) {
  const d = diagram.series.some(series => series.samples) ? { ...diagram,
    series: diagram.series.map(series => series.samples ? { ...series, points: plotSeriesPoints(series) } : series),
  } : diagram;
  const noted = plotNotedPoints(d.series); // which labelled points keep a badge + list line (ml-plot-spec.js)
  const endLabels = plotEndLabels(d.series);
  const endGutter = Math.max(endLabels.gutter, sharedLabelSpace?.gutter ?? 0);
  let remainingLabels = endLabels.height;
  const width = Math.max(bodyWidth(d, requested), 324 + endGutter);
  const bottomEdge = 66 + Math.max(240, endLabels.height, sharedLabelSpace?.height ?? 0);
  const bounds = { left: 104, right: width - 24 - endGutter, top: 66, bottom: bottomEdge };
  const { left, right, top, bottom } = bounds;
  const x = scale(d.x, left, right), y = scale(d.y, bottom, top);
  const xy = p => [x(p.x), y(p.y)];
  const elements = [h('rect', { x: left, y: top, width: right - left, height: bottom - top,
    fill: T.surface, stroke: T.line, strokeWidth: 1, 'data-tutor-plot-area': '' })];
  const geometry = [], foreground = [], notes = [];
  const yTitle = wrap(axisName(d.y), width - 2 * PAD);
  elements.push(label(yTitle, PAD, PAD + yTitle.length * lineHeight() / 2, { anchor: 'start', weight: 700 }));
  const xTicks = plotTicks(d.x, x, { horizontal: true });
  for (const { at } of xTicks) {
    elements.push(teachingConnector([[at, top], [at, bottom]], { dashed: true }));
  }
  for (const { at, lines, anchor } of plotTicks(d.y, y, { labelWidth: left - PAD - 8 })) {
    elements.push(teachingConnector([[left, at], [right, at]], { dashed: true }));
    elements.push(label(lines, left - 8, at, { anchor, size: SMALL }));
  }
  const tickHeight = Math.max(...xTicks.map(tick => tick.lines.length)) * lineHeight(SMALL);
  for (const { at, lines, anchor } of xTicks) elements.push(label(lines, at, bottom + 8 + tickHeight / 2, { anchor, size: SMALL }));
  const xTitle = wrap(axisName(d.x), right - left);
  let legendY = bottom + tickHeight + 18;
  elements.push(label(xTitle, right, legendY + xTitle.length * lineHeight() / 2, { anchor: 'end', weight: 700 }));
  legendY += xTitle.length * lineHeight() + 16;
  const occupied = [];
  function note(anchor, text) {
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
    foreground.push(h('rect', { ...box, rx: 4, fill: T.surface, stroke: T.wire, strokeWidth: 1, 'data-tutor-plot-badge': number }));
    foreground.push(label(String(number), box.x + size / 2, box.y + 9, { size: SMALL, weight: 700 }));
  }
  for (const [i, a] of (d.annotations ?? []).entries()) {
    const color = COLORS[i % 3], fill = SOFT[i % 3];
    const props = { fill, stroke: color, strokeWidth: 1.5 };
    let anchor;
    if (a.kind === 'point') {
      anchor = xy(a);
      foreground.push(h('circle', { cx: anchor[0], cy: anchor[1], r: 6, fill: T.surface, stroke: color, strokeWidth: 2, 'data-tutor-plot-point': `${a.x},${a.y}` }));
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
  const marks = [];
  for (const [i, series] of d.series.entries()) {
    const hasUncertainty = series.points[0].low !== undefined;
    let band;
    if (hasUncertainty && ['line', 'step'].includes(series.kind)) {
      const high = series.points.map(p => [x(p.x), y(p.high)]);
      const low = series.points.map(p => [x(p.x), y(p.low)]);
      if (series.kind === 'line') band = high.map((point, j) => [point[1], low[j][1]]);
      const project = values => series.kind === 'step' ? stepPoints(values) : values;
      geometry.push(h('polygon', { points: pointString([...project(high), ...project(low).reverse()]), fill: SOFT[i], stroke: COLORS[i], strokeWidth: 0.8,
        'data-tutor-plot-uncertainty': series.label }));
    }
    const values = series.points.map(xy);
    if (series.kind === 'line' || series.kind === 'step') {
      const smooth = series.smooth !== false;
      let path;
      if (series.closed) path = closedLinePath(values, smooth);
      else if (series.kind === 'line' && smooth) path = monotoneLinePath(values, band);
      geometry.push(curve(series.kind === 'step' ? stepPoints(values) : values, i, { 'data-tutor-plot-series': series.label }, path));
    }
    series.points.forEach((p, j) => {
      const [cx, cy] = values[j];
      if (series.kind === 'stem') geometry.push(h('line', { x1: cx, x2: cx, y1: y(0), y2: cy, stroke: COLORS[i], strokeWidth: 1.8, 'data-tutor-plot-stem': `${p.x},${p.y}` }));
      if (hasUncertainty && ['scatter', 'stem'].includes(series.kind)) {
        const lo = y(p.low), hi = y(p.high);
        geometry.push(h('path', { d: `M ${cx} ${lo} V ${hi} M ${cx - 4} ${lo} H ${cx + 4} M ${cx - 4} ${hi} H ${cx + 4}`,
          fill: 'none', stroke: COLORS[i], strokeWidth: 1.5, 'data-tutor-plot-errorbar': `${p.low},${p.high}` }));
      }
      if (showPlotMarker(series, j)) marks.push(symbol(cx, cy, i, { 'data-tutor-coordinate-point': `${p.x},${p.y}`, 'data-tutor-sample-id': p.id }, `${series.label}: (${p.x}, ${p.y})${p.label ? ` · ${p.label}` : ''}`));
      if (p.label && noted.has(`${i}:${j}`)) note([cx, cy], `${p.label}: (${p.x}, ${p.y})`);
    });
    const lines = wrap(`${series.label}${hasUncertainty ? ' · low/high interval' : ''}`, width - 2 * PAD - 36);
    const height = Math.max(24, lines.length * lineHeight());
    if (series.kind !== 'scatter') elements.push(curve([[PAD, legendY + height / 2], [PAD + 24, legendY + height / 2]], i));
    elements.push(symbol(PAD + 12, legendY + height / 2, i));
    elements.push(label(lines, PAD + 36, legendY + height / 2, { anchor: 'start' }));
    legendY += height + 4;
  }
  for (const item of notes) {
    const lines = wrap(`${item.number}. ${item.text}`, width - 2 * PAD);
    const height = lines.length * lineHeight();
    elements.push(label(lines, PAD, legendY + height / 2, { anchor: 'start' }));
    legendY += height + 6;
  }
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
  return { width, height: legendY + PAD, plotBounds: bounds, elements: [...elements, ...geometry, ...marks, ...foreground] };
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
  let top = PAD;
  for (const [i, series] of d.series.entries()) {
    const lines = wrap(series.label, width - 2 * PAD - 28);
    const height = Math.max(22, lines.length * lineHeight());
    elements.push(symbol(PAD + 8, top + height / 2, i));
    elements.push(label(lines, PAD + 26, top + height / 2, { anchor: 'start' }));
    top += height + 2;
  }
  top += 26;
  elements.push(label(format(min), left, top - 14, { anchor: 'start', size: SMALL }));
  elements.push(label(format(max), right, top - 14, { anchor: 'end', size: SMALL }));
  for (const group of groups) {
    const name = wrap(group.category, left - PAD - 14);
    const height = d.variant === 'grouped' ? Math.max(group.segments.length * 28, name.length * lineHeight()) : Math.max(30, name.length * lineHeight());
    elements.push(h('line', { x1: zero, x2: zero, y1: top, y2: top + height, stroke: T.wire, strokeWidth: 1.5, 'data-tutor-bar-baseline': '' }));
    elements.push(label(name, PAD, top + height / 2, { anchor: 'start' }));
    for (const segment of group.segments) {
      const cy = d.variant === 'grouped' ? top + (segment.index + 0.5) * height / group.segments.length : top + height / 2;
      const attrs = { [`data-tutor-${d.variant}-bar`]: segment.value, 'data-tutor-bar-category': group.category, 'data-tutor-bar-series': segment.label,
        'data-tutor-stack-from': segment.from, 'data-tutor-stack-to': segment.to };
      if (!segment.value) elements.push(h('circle', { cx: x(segment.from), cy, r: 3, fill: COLORS[segment.index], ...attrs }));
      else elements.push(h('rect', { x: Math.min(x(segment.from), x(segment.to)), y: cy - 9, width: Math.abs(x(segment.to) - x(segment.from)), height: 18,
        fill: COLORS[segment.index], stroke: T.surface, strokeWidth: 1, ...attrs }));
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
  return { width, height: top + PAD, elements };
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
    elements.push(h('rect', { x: left, y, width: BAR, height, fill: options?.labelColors?.get(bar.label) ?? COLORS[i % COLORS.length], stroke: T.surface, strokeWidth: 1.5,
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
