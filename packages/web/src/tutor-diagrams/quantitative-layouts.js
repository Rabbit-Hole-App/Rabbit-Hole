import { createElement as h } from 'react';
import { monotoneLinePath, showPlotMarker } from './plot-lines.js';
import { plotTicks } from './plot-ticks.js';
import { connector, label, lineHeight, textWidth, wrap, INK, PALETTE, SURFACE } from './primitives.js';

const PAD = 12;
const SMALL = 12;
const SERIES = [
  { role: 'process', shape: 'circle', radius: 5, dash: undefined },
  { role: 'lavender', shape: 'square', radius: 3.6, dash: '7 4' },
  { role: 'outcome', shape: 'diamond', radius: 6, dash: '2 4' },
];
const INTERVAL_ROLES = ['process', 'decision', 'lavender'];

function scale(min, max, start, end) {
  const span = max - min;
  return value => {
    // Dividing first keeps a finite difference when the domain spans both numeric extremes.
    const ratio = Number.isFinite(span)
      ? (value - min) / span
      : (value / 2 - min / 2) / (max / 2 - min / 2);
    return start + (end - start) * ratio;
  };
}

function ticks(min, max, position, clearance) {
  const zeroFits = min < 0 && max > 0
    && Math.min(Math.abs(position(0) - position(min)), Math.abs(position(0) - position(max))) >= clearance;
  return zeroFits ? [min, 0, max] : [min, max];
}

function xTickLabels(ticks, axisY) {
  const elements = [];
  const height = Math.max(...ticks.map(tick => tick.lines.length)) * lineHeight(SMALL);
  for (const { at, lines, anchor } of ticks) {
    elements.push(connector([[at, axisY], [at, axisY + 5]], { arrow: false }));
    elements.push(label(lines, at, axisY + 9 + height / 2, { anchor, size: SMALL }));
  }
  return { elements, height: 9 + height };
}

function markerPositions(markers, position) {
  const lanes = [];
  return markers.map((marker, index) => {
    const x = position(marker.value);
    const lane = lanes.findIndex(positions => positions.every(other => Math.abs(other - x) >= 23));
    const row = lane < 0 ? lanes.length : lane;
    if (lane < 0) lanes.push([]);
    lanes[row].push(x);
    return { ...marker, x, y: PAD + 10 + row * 23, badge: String(index + 1) };
  });
}

function circle(x, y, radius, fill, attributes = {}, child) {
  return h('circle', { cx: x, cy: y, r: radius, fill, stroke: INK, strokeWidth: 1.3, ...attributes }, child);
}

function intervalEnd(x, y, closed, color) {
  return circle(x, y, 4.5, closed ? color : SURFACE, { 'data-tutor-endpoint': closed ? 'closed' : 'open' });
}

function intervalNotation({ from, to, startClosed, endClosed }) {
  return `${startClosed ? '[' : '('}${from}, ${to}${endClosed ? ']' : ')'}`;
}

function numberLine(diagram, width) {
  const { min, max, markers, intervals = [] } = diagram;
  const left = PAD + 5;
  const right = width - PAD - 5;
  const position = scale(min, max, left, right);
  const marks = markerPositions(markers, position);
  const axisY = Math.max(PAD, ...marks.map(marker => marker.y + 22));
  const tickWidth = (right - left) / 3 - 3;
  const values = ticks(min, max, position, tickWidth + 6);
  const axisTicks = xTickLabels(values.map((value, i) => ({ at: position(value), lines: wrap(String(value), tickWidth, SMALL),
    anchor: i === 0 ? 'start' : i === values.length - 1 ? 'end' : 'middle' })), axisY);
  const elements = marks.map(marker => connector([[marker.x, marker.y + 9], [marker.x, axisY]], { arrow: false, dashed: true }));
  elements.push(connector([[left, axisY], [right, axisY]], { arrow: false }), ...axisTicks.elements);
  for (const { x, y, badge, value } of marks) {
    elements.push(circle(x, y, 9, PALETTE.outcome, { 'data-tutor-number-marker': value }));
    elements.push(label(badge, x, y, { size: SMALL, weight: 700, tone: 'onFill' }));
  }
  let y = axisY + axisTicks.height + 12;
  for (const [index, interval] of intervals.entries()) {
    const color = PALETTE[INTERVAL_ROLES[index]];
    const lines = wrap(`${interval.label}: ${intervalNotation(interval)}`, right - left);
    const height = lines.length * lineHeight();
    elements.push(label(lines, left, y + height / 2, { anchor: 'start' }));
    const x1 = position(interval.from), x2 = position(interval.to);
    const track = y + height + 13;
    // Close endpoints keep their exact horizontal position and use different vertical levels.
    const offset = Math.abs(x2 - x1) < 11 ? 6 : 0;
    const y1 = track - offset, y2 = track + offset;
    elements.push(h('line', { x1, x2, y1, y2, stroke: INK, strokeWidth: 4, strokeLinecap: 'round' }));
    elements.push(h('line', { x1, x2, y1, y2, stroke: color, strokeWidth: 2, strokeLinecap: 'round' }));
    elements.push(intervalEnd(x1, y1, interval.startClosed, color), intervalEnd(x2, y2, interval.endClosed, color));
    y = track + 20;
  }
  for (const { badge, label: name, value } of marks) {
    const lines = wrap(`${name}: ${value}`, right - left - 27);
    const height = Math.max(23, lines.length * lineHeight());
    const center = y + height / 2;
    elements.push(circle(left + 9, center, 9, PALETTE.outcome));
    elements.push(label(badge, left + 9, center, { size: SMALL, weight: 700, tone: 'onFill' }));
    elements.push(label(lines, left + 24, center, { anchor: 'start' }));
    y += height + 4;
  }
  return { width, height: y + PAD, elements };
}

function plotMarker(x, y, style, title, value) {
  const { radius, role, shape } = style;
  const attributes = { fill: PALETTE[role], stroke: INK, strokeWidth: 1.3, 'data-tutor-coordinate-point': value };
  const annotation = title ? h('title', null, title) : null;
  if (shape === 'square') {
    return h('rect', { x: x - radius, y: y - radius, width: radius * 2, height: radius * 2, ...attributes }, annotation);
  }
  if (shape === 'diamond') {
    const points = [[x, y - radius], [x + radius, y], [x, y + radius], [x - radius, y]];
    return h('polygon', { points: points.map(point => point.join(',')).join(' '), ...attributes }, annotation);
  }
  return h('circle', { cx: x, cy: y, r: radius, ...attributes }, annotation);
}

function seriesLine(points, style, smooth = false) {
  const tag = smooth ? 'path' : 'polyline';
  const geometry = smooth ? { d: monotoneLinePath(points) } : { points: points.join(' ') };
  const attributes = { ...geometry, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', strokeDasharray: style.dash };
  return h('g', null,
    h(tag, { ...attributes, stroke: INK, strokeWidth: 3.6 }),
    h(tag, { ...attributes, stroke: PALETTE[style.role], strokeWidth: 1.7 }));
}

const axisName = axis => axis.unit ? `${axis.label} (${axis.unit})` : axis.label;

function coordinatePlot(diagram, width) {
  const { x: xAxis, y: yAxis, series } = diagram;
  const yTickWidth = Math.min(86, Math.max(22, ...[yAxis.min, yAxis.max].map(value => textWidth(String(value), SMALL))));
  const left = PAD + yTickWidth + 8, right = width - PAD - 8;
  const yTitle = wrap(axisName(yAxis), width - PAD * 2);
  const titleHeight = yTitle.length * lineHeight();
  const labelHeight = Math.max(...[yAxis.min, yAxis.max].map(value => wrap(String(value), yTickWidth, SMALL).length)) * lineHeight(SMALL);
  const top = PAD + titleHeight + Math.max(12, labelHeight / 2 + 5);
  const bottom = top + Math.min(248, Math.max(150, Math.round(width * 0.44)));
  const x = scale(xAxis.min, xAxis.max, left, right), y = scale(yAxis.min, yAxis.max, bottom, top);
  const xTicks = plotTicks(xAxis, x, { horizontal: true });
  const yTicks = plotTicks(yAxis, y, { labelWidth: yTickWidth + 6 });
  const xLabels = xTickLabels(xTicks, bottom);
  const elements = [label(yTitle, PAD, PAD + titleHeight / 2, { anchor: 'start', weight: 700 })];
  for (const { at } of xTicks) elements.push(connector([[at, top], [at, bottom]], { arrow: false, dashed: true }));
  for (const { at, lines, anchor } of yTicks) {
    elements.push(connector([[left, at], [right, at]], { arrow: false, dashed: true }));
    elements.push(connector([[left - 4, at], [left, at]], { arrow: false }));
    elements.push(label(lines, left - 8, at, { anchor, size: SMALL }));
  }
  elements.push(connector([[left, top], [left, bottom], [right, bottom]], { arrow: false }), ...xLabels.elements);
  const xTitle = wrap(axisName(xAxis), right - PAD);
  const xTitleHeight = xTitle.length * lineHeight();
  let legendY = bottom + xLabels.height + 12;
  elements.push(label(xTitle, right, legendY + xTitleHeight / 2, { anchor: 'end', weight: 700 }));
  legendY += xTitleHeight + 12;
  const markers = [];
  for (const [index, entry] of series.entries()) {
    const style = SERIES[index];
    const positions = entry.points.map(point => [x(point.x), y(point.y)]);
    if (entry.kind === 'line') elements.push(seriesLine(positions, style, entry.smooth !== false));
    for (const [i, point] of entry.points.entries()) {
      if (!showPlotMarker(entry, i)) continue;
      const coordinates = `${point.x},${point.y}`;
      markers.push(plotMarker(...positions[i], style, `${entry.label}: (${point.x}, ${point.y})`, coordinates));
    }
    const lines = wrap(entry.label, width - PAD * 2 - 36);
    const height = Math.max(24, lines.length * lineHeight());
    const middle = legendY + height / 2;
    if (entry.kind === 'line') elements.push(seriesLine([[PAD, middle], [PAD + 25, middle]], style));
    elements.push(plotMarker(PAD + 12, middle, style));
    elements.push(label(lines, PAD + 36, middle, { anchor: 'start' }));
    legendY += height + 2;
  }
  return { width, height: legendY + PAD, elements: [...elements, ...markers] };
}

function barChart(diagram, width, options) {
  const { bars, unit } = diagram;
  // Inside a narrow panel (options.compact) the columns shrink to their text, so a short label such as "Class 0" is not broken at its space.
  const fit = (texts, size) => Math.ceil(Math.max(...texts.map(text => textWidth(text, size)))) + 4;
  const labelWidth = options?.compact ? Math.min(Math.round(width * 0.4), fit(bars.map(bar => bar.label), 14)) : Math.min(134, Math.round(width * 0.27));
  // The same panel setting prints every value to the decimals of the longest one (3.00 beside 20.09, not 3), so a column of figures reads at one precision.
  const places = Math.max(...bars.map(bar => (String(bar.value).split('.')[1] ?? '').length));
  const shown = bar => options?.compact ? bar.value.toFixed(places) : String(bar.value);
  const valueText = bar => unit ? `${shown(bar)} ${unit}` : shown(bar);
  const valueWidth = options?.compact ? Math.min(Math.round(width * 0.3), fit(bars.map(valueText), SMALL)) : Math.min(110, Math.round(width * 0.25));
  const left = PAD + labelWidth + 10, right = width - PAD - valueWidth - 10;
  const min = Math.min(0, ...bars.map(bar => bar.value));
  const max = Math.max(0, ...bars.map(bar => bar.value));
  const position = min === max ? () => (left + right) / 2 : scale(min, max, left, right);
  const zero = position(0);
  const elements = [label('0', zero, PAD + 6, { size: SMALL })];
  let y = PAD + 22;
  for (const bar of bars) {
    const name = wrap(bar.label, labelWidth);
    const value = wrap(valueText(bar), valueWidth, SMALL);
    const height = Math.max(36, name.length * lineHeight() + 10, value.length * lineHeight(SMALL) + 10);
    const center = y + height / 2;
    const end = position(bar.value);
    if (bar.value === 0) {
      elements.push(circle(zero, center, 4, PALETTE.slate, { 'data-tutor-bar': 0 }));
    } else {
      elements.push(h('rect', {
        x: Math.min(zero, end), y: center - 10, width: Math.abs(end - zero), height: 20, rx: 2,
        fill: options?.labelColors?.get(bar.label) ?? (bar.value < 0 ? PALETTE.rose : PALETTE.process), stroke: INK, strokeWidth: 1.3, 'data-tutor-bar': bar.value,
      }));
    }
    elements.push(label(name, PAD, center, { anchor: 'start' }));
    elements.push(label(value, right + 10, center, { anchor: 'start', size: SMALL }));
    y += height;
  }
  const baseline = h('line', { x1: zero, x2: zero, y1: PAD + 16, y2: y, stroke: INK, strokeWidth: 1.5, 'data-tutor-bar-baseline': '' });
  return { width, height: y + PAD, elements: [baseline, ...elements] };
}

export const quantitativeLayouts = Object.freeze({
  'number-line': numberLine,
  'coordinate-plot': coordinatePlot,
  'bar-chart': barChart,
});
