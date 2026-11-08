import { cloneElement, createElement as h } from 'react';
import { label, lineHeight, textWidth, widestFormula, wrap } from './primitives.js';
import { TEACHING, TEACHING_SERIES, teachingBox, teachingConnector } from './teaching-theme.js';
import { boxSummary, histogramBinLabel, histogramHeights, histogramMeasureLabel, sampleMemberships } from './ml-statistical-spec.js';

const PAD = 12;
const SMALL = 12;
const scale = (min, max, start, end) => value => start + (value - min) / (max - min) * (end - start);
const axisName = (label, unit) => unit ? `${label} (${unit})` : label;
const formulaWidth = values => Math.max(0, ...values.filter(Boolean).map(value => widestFormula(value)));

function textBlock(elements, text, x, top, width, options = {}) {
  const size = options.size ?? 14;
  const lines = wrap(text, width, size);
  const height = lines.length * lineHeight(size);
  elements.push(label(lines, x, top + height / 2, { anchor: 'start', ...options }));
  return top + height;
}

function heatColor(value, range) {
  const { min, max } = range;
  if (min < 0 && max > 0) return { fill: value < 0 ? TEACHING.warm : TEACHING.blue, opacity: value < 0 ? value / min : value / max };
  if (max <= 0) return { fill: TEACHING.warm, opacity: (max - value) / (max - min) };
  return { fill: TEACHING.blue, opacity: (value - min) / (max - min) };
}

function heatmap(d, requested) {
  const rowWidth = Math.max(100, formulaWidth([d.rowLabel, ...d.rows.map(row => row.label)]) + 16);
  const minimumCell = Math.max(80, formulaWidth(d.columns) + 14);
  const width = Math.max(requested, PAD * 2 + rowWidth + Math.max(d.columns.length * minimumCell, formulaWidth([d.columnLabel])));
  const cellWidth = (width - PAD * 2 - rowWidth) / d.columns.length;
  const left = PAD + rowWidth;
  const elements = [];
  let top = PAD;
  if (d.columnLabel) top = textBlock(elements, d.columnLabel, left, top, width - left - PAD, { weight: 700 }) + 8;
  const heads = d.columns.map(text => wrap(text, cellWidth - 14));
  const rowHeading = d.rowLabel ? wrap(d.rowLabel, rowWidth - 16) : [];
  const headHeight = Math.max(34, ...[...heads, rowHeading].map(lines => lines.length * lineHeight() + 12));
  if (d.rowLabel) elements.push(label(rowHeading, PAD + 6, top + headHeight / 2, { anchor: 'start', weight: 700 }));
  d.columns.forEach((_, column) => {
    elements.push(teachingBox(left + column * cellWidth, top, cellWidth, headHeight, { role: 'process' }));
    elements.push(label(heads[column], left + (column + 0.5) * cellWidth, top + headHeight / 2, { weight: 700 }));
  });
  top += headHeight + 4;
  const highlighted = new Set((d.highlights ?? []).map(cell => `${cell.row}:${cell.column}`));
  d.rows.forEach((row, rowIndex) => {
    const rowLines = wrap(row.label, rowWidth - 16);
    const cellLines = row.cells.map(value => wrap(value === null ? 'Masked' : String(value), cellWidth - 12));
    const height = Math.max(44, rowLines.length * lineHeight() + 12, ...cellLines.map(lines => lines.length * lineHeight() + 12));
    elements.push(label(rowLines, PAD + 6, top + height / 2, { anchor: 'start', weight: 700 }));
    row.cells.forEach((value, column) => {
      const x = left + column * cellWidth;
      const { fill, opacity } = value === null ? { fill: TEACHING.inset, opacity: 1 } : heatColor(value, d.range);
      const active = highlighted.has(`${rowIndex}:${column}`);
      elements.push(h('rect', { x, y: top, width: cellWidth, height, fill: TEACHING.surface }));
      elements.push(h('rect', {
        x, y: top, width: cellWidth, height, fill, fillOpacity: opacity,
        stroke: active ? TEACHING.blue : TEACHING.line, strokeWidth: active ? 3 : 1,
        strokeDasharray: value === null ? '4 3' : undefined,
        'data-tutor-heatmap-cell': `${rowIndex}:${column}`, 'data-tutor-masked': value === null ? 'true' : undefined,
      }));
      const ink = value !== null && opacity > 0.6 ? TEACHING.surface : TEACHING.ink;
      elements.push(cloneElement(label(cellLines[column], x + cellWidth / 2, top + height / 2, { weight: active ? 700 : 400 }), { fill: ink }));
    });
    top += height;
  });
  top += 16;
  top = textBlock(elements, `Range: ${d.range.min} to ${d.range.max}`, PAD, top, width - PAD * 2, { size: SMALL }) + 8;
  const legendWidth = Math.min(240, width - PAD * 2), segments = 32;
  for (let i = 0; i < segments; i++) {
    const value = d.range.min + (d.range.max - d.range.min) * i / (segments - 1);
    const color = heatColor(value, d.range);
    elements.push(h('rect', { x: PAD + i * legendWidth / segments, y: top, width: legendWidth / segments, height: 10, fill: TEACHING.surface }));
    elements.push(h('rect', { x: PAD + i * legendWidth / segments, y: top, width: legendWidth / segments, height: 10, fill: color.fill, fillOpacity: color.opacity }));
  }
  top += 16;
  const tickLines = [d.range.min, d.range.max].map(value => wrap(String(value), legendWidth / 2 - 12, SMALL));
  const tickHeight = Math.max(...tickLines.map(lines => lines.length)) * lineHeight(SMALL);
  elements.push(label(tickLines[0], PAD, top + tickHeight / 2, { size: SMALL, anchor: 'start' }));
  elements.push(label(tickLines[1], PAD + legendWidth, top + tickHeight / 2, { size: SMALL, anchor: 'end' }));
  if (d.range.min < 0 && d.range.max > 0) {
    const zero = scale(d.range.min, d.range.max, PAD, PAD + legendWidth)(0);
    const startLabel = Math.max(...tickLines[0].map(line => textWidth(line, SMALL)));
    const endLabel = Math.max(...tickLines[1].map(line => textWidth(line, SMALL)));
    if (zero - PAD > startLabel + 16 && PAD + legendWidth - zero > endLabel + 16) elements.push(label('0', zero, top + tickHeight / 2, { size: SMALL }));
  }
  return { width, height: top + tickHeight + PAD, elements };
}

function sampleSet(d, requested) {
  const width = Math.max(320, requested, formulaWidth([
    ...d.samples.flatMap(sample => [sample.label, sample.class]), ...d.groups.map(group => group.label),
  ]) + PAD * 2 + 16), elements = [];
  const classes = [...new Set(d.samples.map(sample => sample.class))];
  const roles = ['process', 'decision', 'outcome'];
  const role = sample => sample.class ? roles[classes.indexOf(sample.class) % roles.length] : 'plain';
  const byId = new Map(d.samples.map(sample => [sample.id, sample]));
  let y = textBlock(elements, `Samples: ${d.samples.length}`, PAD, PAD, width - PAD * 2, { weight: 700 }) + 8;
  const cards = (items, minWidth, getLines, getBox) => {
    const minimum = Math.max(minWidth, formulaWidth(items.flatMap(getLines)) + 16);
    const columns = Math.max(1, Math.floor((width - PAD * 2 + 8) / (minimum + 8)));
    const cellWidth = (width - PAD * 2 - (columns - 1) * 8) / columns;
    for (let start = 0; start < items.length; start += columns) {
      const row = items.slice(start, start + columns);
      const lines = row.map(item => getLines(item).flatMap(text => wrap(text, cellWidth - 16, SMALL)));
      const height = Math.max(34, ...lines.map(lines => lines.length * lineHeight(SMALL) + 16));
      row.forEach((item, i) => {
        const x = PAD + i * (cellWidth + 8);
        elements.push(getBox(item, x, y, cellWidth, height));
        elements.push(label(lines[i], x + 8, y + height / 2, { anchor: 'start', size: SMALL }));
      });
      y += height + 8;
    }
  };
  cards(d.samples, 120, sample => [
    sample.label && sample.label !== sample.id ? `${sample.id}: ${sample.label}` : sample.id,
    ...(sample.class ? [sample.class] : []), ...(sample.weight !== undefined ? [`weight ${sample.weight}`] : []),
  ], (sample, x, y, w, height) => cloneElement(teachingBox(x, y, w, height, { role: role(sample) }), { 'data-tutor-sample': sample.id }));
  d.groups.forEach(group => {
    y += 10;
    y = textBlock(elements, group.label, PAD, y, width - PAD * 2, { weight: 700 }) + 4;
    const count = `${group.members.length} draws · ${new Set(group.members).size} unique${group.replacement ? ' · with replacement' : ''}`;
    y = textBlock(elements, count, PAD, y, width - PAD * 2, { size: SMALL, tone: 'muted' }) + 8;
    if (group.outOfBagFor) y = textBlock(elements, `Out of bag for ${d.groups.find(source => source.id === group.outOfBagFor).label}`, PAD, y, width - PAD * 2, { size: SMALL }) + 8;
    const memberships = sampleMemberships(group);
    if (!memberships.length) y = textBlock(elements, 'Empty set', PAD, y, width - PAD * 2, { size: SMALL, tone: 'muted' }) + 8;
    cards(memberships, 86, member => [member.text], (member, x, y, w, height) =>
      cloneElement(teachingBox(x, y, w, height, { role: role(byId.get(member.id)) }), {
        'data-tutor-sample-member': `${group.id}:${member.id}`, 'data-tutor-multiplicity': member.count,
      }));
    if (group.omitted) y = textBlock(elements, `Omitted: ${group.omitted.join(', ') || 'none'}`, PAD, y, width - PAD * 2, { size: SMALL, tone: 'muted' }) + 8;
  });
  return { width, height: y + PAD, elements };
}

function histogram(d, requested) {
  const width = Math.max(360, requested, formulaWidth([
    d.xLabel, ...d.series.map(series => series.label), ...(d.markers ?? []).map(marker => marker.label),
  ]) + 124), elements = [];
  const seriesHeights = d.series.map(series => histogramHeights(d, series));
  const maximum = Math.max(...seriesHeights.flat());
  const tickWidth = Math.min(88, Math.max(26, textWidth(String(maximum), SMALL)));
  const left = PAD + tickWidth + 10, right = width - PAD - 10;
  const position = scale(d.binEdges[0], d.binEdges.at(-1), left, right);
  const maxLines = wrap(String(maximum), tickWidth, SMALL);
  const tickHeight = maxLines.length * lineHeight(SMALL);
  const edgeLines = [d.binEdges[0], d.binEdges.at(-1)].map(value => wrap(String(value), (right - left) / 2 - 8, SMALL));
  const edgeHeight = Math.max(...edgeLines.map(lines => lines.length)) * lineHeight(SMALL);
  let y = textBlock(elements, histogramMeasureLabel(d), PAD, PAD, width - PAD * 2, { weight: 700 }) + 10;
  for (const [index, series] of d.series.entries()) {
    y = textBlock(elements, series.label, left, y, right - left, { weight: 700 }) + 6;
    const markerTop = y + 10;
    const top = y + Math.max(12, tickHeight / 2 + 4) + (d.markers?.length || 0) * 20;
    const bottom = top + 132;
    const height = value => value / maximum * (bottom - top);
    elements.push(teachingConnector([[left, top], [right, top]], { dashed: true }));
    elements.push(label(maxLines, left - 8, top, { anchor: 'end', size: SMALL }));
    elements.push(label('0', left - 8, bottom, { anchor: 'end', size: SMALL }));
    series.values.forEach((value, bin) => {
      const x = position(d.binEdges[bin]), barWidth = position(d.binEdges[bin + 1]) - x;
      const barHeight = height(seriesHeights[index][bin]);
      elements.push(h('rect', {
        x, y: bottom - barHeight, width: barWidth, height: barHeight,
        fill: [TEACHING.blueSoft, TEACHING.warmSoft, TEACHING.greenSoft][index], stroke: TEACHING_SERIES[index], strokeWidth: 1.3,
        'data-tutor-histogram-bin': `${index}:${bin}`, 'data-tutor-bin-mass': value, 'data-tutor-bin-height': seriesHeights[index][bin],
      }));
    });
    (d.markers ?? []).forEach((marker, markerIndex) => {
      const x = position(marker.value), my = markerTop + markerIndex * 20;
      elements.push(h('line', { x1: x, x2: x, y1: my + 8, y2: bottom, stroke: TEACHING.warm, strokeWidth: 1.4, strokeDasharray: '4 3', 'data-tutor-histogram-marker': marker.value }));
      elements.push(label(String(markerIndex + 1), x, my, { size: SMALL, weight: 700 }));
    });
    elements.push(teachingConnector([[left, top], [left, bottom], [right, bottom]]));
    elements.push(label(edgeLines[0], left, bottom + 8 + edgeHeight / 2, { size: SMALL, anchor: 'start' }));
    elements.push(label(edgeLines[1], right, bottom + 8 + edgeHeight / 2, { size: SMALL, anchor: 'end' }));
    y = bottom + 18 + edgeHeight;
    const values = series.values.map((value, bin) => `${histogramBinLabel(d, bin)}: ${value}`).join('; ');
    y = textBlock(elements, values, PAD, y, width - PAD * 2, { size: SMALL }) + 18;
  }
  y = textBlock(elements, axisName(d.xLabel, d.unit), PAD, y, width - PAD * 2, { weight: 700 }) + 6;
  (d.markers ?? []).forEach((marker, i) => {
    y = textBlock(elements, `${i + 1}. ${marker.label}: ${marker.value}`, PAD, y, width - PAD * 2, { size: SMALL }) + 4;
  });
  return { width, height: y + PAD, elements };
}

function boxPlot(d, requested) {
  const width = Math.max(360, requested, formulaWidth([d.x.label, ...d.boxes.flatMap(box => [box.label, ...(box.outliers ?? []).map(point => point.label)])]) + PAD * 2);
  const left = PAD + 10, right = width - PAD - 10;
  const x = scale(d.x.min, d.x.max, left, right), elements = [];
  let top = PAD;
  d.boxes.forEach((box, index) => {
    top = textBlock(elements, box.label, PAD, top, width - PAD * 2, { weight: 700 }) + 10;
    const center = top + 26;
    const color = TEACHING_SERIES[index % TEACHING_SERIES.length];
    elements.push(h('line', { x1: x(box.whiskerLow), x2: x(box.whiskerHigh), y1: center, y2: center,
      stroke: color, strokeWidth: 1.8, 'data-tutor-box-whisker': index }));
    for (const value of [box.whiskerLow, box.whiskerHigh]) elements.push(h('line', { x1: x(value), x2: x(value), y1: center - 9, y2: center + 9, stroke: color, strokeWidth: 1.8 }));
    elements.push(h('rect', { x: x(box.q1), y: center - 14, width: x(box.q3) - x(box.q1), height: 28, fill: TEACHING.inset, stroke: color, strokeWidth: 1.8, 'data-tutor-box': index }));
    elements.push(h('line', { x1: x(box.median), x2: x(box.median), y1: center - 14, y2: center + 14,
      stroke: color, strokeWidth: 3, 'data-tutor-box-median': box.median }));
    if (box.fences) {
      for (const value of [box.fences.lower, box.fences.upper]) elements.push(h('line', {
        x1: x(value), x2: x(value), y1: center - 24, y2: center + 24,
        stroke: TEACHING.warm, strokeWidth: 1.5, strokeDasharray: '4 3', 'data-tutor-box-fence': value,
      }));
    }
    const lanes = [];
    (box.outliers ?? []).forEach(point => {
      const px = x(point.value);
      let row = lanes.findIndex(values => values.every(other => Math.abs(px - other) >= 14));
      if (row < 0) { row = lanes.length; lanes.push([]); }
      lanes[row].push(px);
      elements.push(h('circle', { cx: px, cy: center + row * 14, r: 4.5, fill: TEACHING.warmSoft,
        stroke: TEACHING.warm, strokeWidth: 1.5, 'data-tutor-box-outlier': point.value }));
    });
    top = center + Math.max(34, lanes.length * 14 + 6);
    top = textBlock(elements, boxSummary(box), PAD, top, width - PAD * 2, { size: SMALL }) + 6;
    if (box.fences) top = textBlock(elements, `Lower fence: ${box.fences.lower}; Upper fence: ${box.fences.upper}`, PAD, top, width - PAD * 2, { size: SMALL }) + 6;
    (box.outliers ?? []).forEach(point => {
      top = textBlock(elements, `${point.label}: ${point.value}`, PAD, top, width - PAD * 2, { size: SMALL }) + 4;
    });
    top += 18;
  });
  elements.push(teachingConnector([[left, top], [right, top]]));
  for (const value of [d.x.min, d.x.max]) elements.push(teachingConnector([[x(value), top - 4], [x(value), top + 4]]));
  const edgeLines = [d.x.min, d.x.max].map(value => wrap(String(value), (right - left) / 2 - 8, SMALL));
  const edgeHeight = Math.max(...edgeLines.map(lines => lines.length)) * lineHeight(SMALL);
  elements.push(label(edgeLines[0], left, top + 8 + edgeHeight / 2, { size: SMALL, anchor: 'start' }));
  elements.push(label(edgeLines[1], right, top + 8 + edgeHeight / 2, { size: SMALL, anchor: 'end' }));
  top = textBlock(elements, axisName(d.x.label, d.x.unit), PAD, top + 18 + edgeHeight, width - PAD * 2, { weight: 700 });
  return { width, height: top + PAD, elements };
}

export function createLayouts({ legacy, renderChild } = {}) {
  // New kinds do not replace any legacy layout; the integration owner merges maps.
  return { heatmap, 'sample-set': sampleSet, histogram, 'box-plot': boxPlot };
}
