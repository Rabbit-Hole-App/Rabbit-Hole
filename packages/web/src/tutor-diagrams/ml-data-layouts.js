import { cloneElement, createElement as h } from 'react';
import { label, lineHeight, textWidth, widestFormula, wrap } from './primitives.js';
import { TEACHING, teachingBox as box, teachingConnector as connector } from './teaching-theme.js';

const PAD = 12;
const SMALL = 13;
const COLORS = {
  train: [TEACHING.blueSoft, TEACHING.blue], validation: [TEACHING.warmSoft, TEACHING.warm],
  test: [TEACHING.greenSoft, TEACHING.green], gap: [TEACHING.inset, TEACHING.muted],
  window: [TEACHING.blueSoft, TEACHING.blue], available: [TEACHING.greenSoft, TEACHING.green],
  excluded: [TEACHING.warmSoft, TEACHING.warm],
};

function scale(min, max, start, end) {
  return value => start + (value - min) / (max - min) * (end - start);
}

function annotation(entry, position, left, right, cutoff = false) {
  const interval = entry.start !== undefined;
  const start = position(interval ? entry.start : entry.time);
  const end = position(interval ? entry.end : entry.time);
  const time = interval ? `${entry.start}–${entry.end}` : String(entry.time);
  const maxWidth = Math.min(right - left - 4, Math.max(184, widestFormula(entry.label, SMALL), entry.detail ? widestFormula(entry.detail, SMALL) : 0));
  const title = wrap(`${entry.label}: ${time}`, maxWidth, SMALL);
  const detail = entry.detail ? wrap(entry.detail, maxWidth, SMALL) : [];
  const labelWidth = Math.max(24, ...[...title, ...detail].map(line => textWidth(line, SMALL))) + 2;
  const labelX = Math.max(left, Math.min(right - labelWidth, (start + end - labelWidth) / 2));
  const labelHeight = (title.length + detail.length) * lineHeight(SMALL) + (detail.length ? 4 : 0);
  return {
    entry, interval, start, end, title, detail, labelX, labelWidth, labelHeight,
    left: Math.min(start - (interval ? 0 : 5), labelX),
    right: Math.max(end + (interval ? 0 : 5), labelX + labelWidth),
    height: labelHeight + (cutoff ? 9 : 30),
  };
}

// Rows reserve both the data mark and its wrapped label. Horizontal positions never move.
function allocate(items) {
  const rows = [];
  for (const item of items) {
    let row = rows.findIndex(candidate => candidate.items.every(other => item.left > other.right + 10 || item.right < other.left - 10));
    if (row < 0) { row = rows.length; rows.push({ items: [], height: 0 }); }
    rows[row].items.push(item);
    rows[row].height = Math.max(rows[row].height, item.height);
    item.row = row;
  }
  return rows;
}

function drawAnnotation(item, top, elements) {
  const { labelX: x, labelWidth: width, title, detail } = item;
  const titleHeight = title.length * lineHeight(SMALL);
  // A surface behind labels keeps cutoff guides from crossing the words.
  elements.push(h('rect', {
    x: x - 1, y: top - 1, width: width + 2, height: item.labelHeight + 2,
    fill: TEACHING.surface, 'data-tutor-time-label': item.entry.id,
  }));
  elements.push(label(title, x, top + titleHeight / 2, { size: SMALL, anchor: 'start', weight: 600 }));
  if (detail.length) elements.push(label(detail, x, top + titleHeight + 4 + detail.length * lineHeight(SMALL) / 2, { size: SMALL, anchor: 'start', tone: 'muted' }));
}

function timeline(d, requestedWidth) {
  const formulaWidth = Math.max(
    widestFormula(d.domain.label ?? 'Time'), widestFormula(d.domain.unit),
    ...d.lanes.flatMap(lane => [widestFormula(lane.label), ...[...(lane.intervals ?? []), ...(lane.events ?? [])]
      .flatMap(entry => [widestFormula(entry.label, SMALL), entry.detail ? widestFormula(entry.detail, SMALL) : 0])]),
    ...(d.cutoffs ?? []).map(entry => widestFormula(entry.label, SMALL)),
  );
  const width = Math.max(360, requestedWidth, Math.ceil(formulaWidth + PAD * 2 + 24));
  const left = PAD + 8, right = width - PAD - 8;
  const position = scale(d.domain.min, d.domain.max, left, right);
  const elements = [];
  const axisTitle = wrap(`${d.domain.label ?? 'Time'} (${d.domain.unit})`, width - PAD * 2);
  const titleHeight = axisTitle.length * lineHeight();
  elements.push(label(axisTitle, PAD, PAD + titleHeight / 2, { anchor: 'start', weight: 700 }));
  let y = PAD + titleHeight + 10;
  const cutoffs = (d.cutoffs ?? []).map(entry => annotation(entry, position, left, right, true));
  for (const row of allocate(cutoffs)) {
    row.top = y;
    row.items.forEach(item => { item.top = y; });
    y += row.height;
  }
  const axisY = y + 5;
  elements.push(connector([[left, axisY], [right, axisY]]));
  const ticks = [d.domain.min, (d.domain.min + d.domain.max) / 2, d.domain.max];
  const tickRows = ticks.map(value => wrap(String(value), (right - left) / 3 - 8, SMALL));
  const tickHeight = Math.max(...tickRows.map(lines => lines.length)) * lineHeight(SMALL);
  ticks.forEach((value, i) => {
    const x = position(value);
    elements.push(connector([[x, axisY], [x, axisY + 5]]));
    elements.push(label(tickRows[i], x, axisY + 10 + tickHeight / 2,
      { size: SMALL, anchor: i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle' }));
  });
  y = axisY + tickHeight + 25;
  for (const lane of d.lanes) {
    const laneHeading = wrap(lane.label, right - left);
    const headingHeight = laneHeading.length * lineHeight();
    elements.push(h('rect', { x: left - 1, y: y - 1, width: right - left + 2, height: headingHeight + 2, fill: TEACHING.surface }));
    elements.push(label(laneHeading, left, y + headingHeight / 2, { anchor: 'start', weight: 700 }));
    y += headingHeight + 9;
    const items = [...(lane.intervals ?? []), ...(lane.events ?? [])].map(entry => annotation(entry, position, left, right));
    const rows = allocate(items);
    for (const row of rows) {
      row.top = y;
      row.items.forEach(item => { item.top = y; item.markerY = y + row.height - 12; });
      y += row.height + 5;
    }
    for (const item of items) {
      const { entry, start, end, markerY } = item;
      drawAnnotation(item, item.top, elements);
      const center = (start + end) / 2;
      elements.push(connector([[center, item.top + item.labelHeight + 2], [center, markerY - 7]]));
      if (item.interval) {
        const [fill, stroke] = COLORS[entry.role ?? 'window'];
        elements.push(h('rect', {
          x: start, y: markerY - 6, width: end - start, height: 12, fill, stroke, strokeWidth: 1.5,
          strokeDasharray: ['gap', 'excluded'].includes(entry.role) ? '3 2' : undefined,
          'data-tutor-timeline-interval': entry.id,
        }));
      } else {
        elements.push(h('circle', {
          cx: start, cy: markerY, r: 5, fill: TEACHING.blueSoft, stroke: TEACHING.blue, strokeWidth: 1.5,
          'data-tutor-timeline-event': entry.id,
        }));
      }
    }
    elements.push(connector([[left, y + 2], [right, y + 2]], { dashed: true }));
    y += 17;
  }
  const guides = cutoffs.map(item => h('line', {
    x1: item.start, x2: item.start, y1: item.top + item.labelHeight + 3, y2: y - 12,
    stroke: TEACHING.warm, strokeWidth: 1.5, strokeDasharray: '4 4', 'data-tutor-timeline-cutoff': item.entry.id,
  }));
  for (const item of cutoffs) drawAnnotation(item, item.top, elements);
  return { width, height: y + PAD, elements: [...guides, ...elements] };
}

function matrix(d, requestedWidth) {
  const count = d.columns.length + 1, gap = 7;
  const minimumCell = Math.ceil(Math.max(84, ...[...d.columns, ...d.rows.flatMap(row => [row.heading, ...row.cells])].map(value => widestFormula(value) + 18)));
  const width = Math.max(requestedWidth, PAD * 2 + count * minimumCell + (count - 1) * gap);
  const cellWidth = (width - PAD * 2 - (count - 1) * gap) / count;
  const xAt = index => PAD + index * (cellWidth + gap);
  const emphasis = d.emphasis ?? {};
  const selectedRows = new Set(emphasis.rows ?? []), selectedColumns = new Set(emphasis.columns ?? []);
  const selectedCells = new Set((emphasis.cells ?? []).map(entry => `${entry.row}:${entry.column}`));
  const states = new Map((d.states ?? []).map(entry => [`${entry.row}:${entry.column}`, entry.state]));
  const elements = [];
  const headings = d.columns.map(name => wrap(name, cellWidth - 14));
  const headerHeight = Math.max(36, ...headings.map(lines => lines.length * lineHeight() + 14));
  headings.forEach((lines, i) => {
    elements.push(cloneElement(box(xAt(i + 1), PAD, cellWidth, headerHeight, { role: 'process', active: selectedColumns.has(i) }), { 'data-tutor-matrix-column': i }));
    elements.push(label(lines, xAt(i + 1) + cellWidth / 2, PAD + headerHeight / 2, { weight: 700 }));
  });
  let y = PAD + headerHeight + gap;
  for (const row of d.rows) {
    const lines = [row.heading, ...row.cells].map(cell => wrap(cell, cellWidth - 14));
    const contentHeights = lines.map((cell, i) => cell.length * lineHeight() + (i && states.has(`${row.id}:${i - 1}`) ? lineHeight(SMALL) + 5 : 0));
    const height = Math.max(36, ...contentHeights.map(value => value + 14));
    lines.forEach((cell, i) => {
      const x = xAt(i), isHeading = i === 0, key = `${row.id}:${i - 1}`, state = isHeading ? undefined : states.get(key);
      const active = selectedRows.has(row.id) || !isHeading && (selectedColumns.has(i - 1) || selectedCells.has(key));
      const rect = box(x, y, cellWidth, height, { role: isHeading ? 'outcome' : state === 'changed' ? 'decision' : 'plain', active });
      const attrs = isHeading ? { 'data-tutor-matrix-row': row.id } : { 'data-tutor-matrix-cell': key, 'data-state': state };
      if (state === 'missing') { attrs.fill = TEACHING.inset; attrs.strokeDasharray = '3 2'; }
      elements.push(cloneElement(rect, { ...attrs, 'data-emphasis': active || undefined }));
      const contentTop = y + (height - contentHeights[i]) / 2;
      elements.push(label(cell, x + cellWidth / 2, contentTop + cell.length * lineHeight() / 2, { weight: isHeading ? 700 : 400 }));
      if (state) elements.push(label(state === 'missing' ? 'Missing' : 'Changed', x + cellWidth / 2,
        contentTop + cell.length * lineHeight() + 5 + lineHeight(SMALL) / 2, { size: SMALL, tone: 'muted' }));
    });
    y += height + gap;
  }
  return { width, height: y - gap + PAD, elements };
}

export function createLayouts({ legacy }) {
  return {
    timeline: (diagram, width) => diagram.layout === 'scaled-lanes' ? timeline(diagram, width) : legacy.timeline(diagram, width),
    matrix: (diagram, width) => diagram.layout === 'teaching' ? matrix(diagram, width) : legacy.matrix(diagram, width),
  };
}
