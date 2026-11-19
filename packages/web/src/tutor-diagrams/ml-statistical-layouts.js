import { cloneElement, createElement as h } from 'react';
import { label, lineHeight, longestWordWidth, textWidth, widestFormula, wrap, wrapShared } from './primitives.js';
import { TEACHING, TEACHING_GRID, TEACHING_SERIES, TEACHING_ZERO, teachingBox, teachingConnector } from './teaching-theme.js';
import { boxSummary, histogramBinLabel, histogramHeights, histogramMeasureLabel, sampleMemberships } from './ml-statistical-spec.js';

const PAD = 12;
const SMALL = 12;
const NOTE = 13, TICK = 15; // readouts and counts 13 px muted; tick labels 15 px / 500 muted (the coordinate plot's sizes)
const scale = (min, max, start, end) => value => start + (value - min) / (max - min) * (end - start);
const axisName = (label, unit) => unit ? `${label} (${unit})` : label;
const formulaWidth = (values, size) => Math.max(0, ...values.filter(Boolean).map(value => widestFormula(value, size)));

function textBlock(elements, text, x, top, width, options = {}) {
  const size = options.size ?? 14;
  const lines = wrap(text, width, size);
  const height = lines.length * lineHeight(size);
  elements.push(label(lines, x, top + height / 2, { anchor: 'start', ...options }));
  return top + height;
}

function heatColor(value, range) {
  const { min, max } = range;
  if (min < 0 && max > 0) return { fill: value < 0 ? TEACHING.coral : TEACHING.blueFill, opacity: value < 0 ? value / min : value / max };
  if (max <= 0) return { fill: TEACHING.coral, opacity: (max - value) / (max - min) };
  return { fill: TEACHING.blueFill, opacity: (value - min) / (max - min) };
}

// kinds-fit: a heatmap takes a box (the rows share the height that is left), sizes (heading: the column title, 14 today; body: headings and cells, 15; small: the range note and the scale ticks, 12)
// and parts.scale (false leaves out the range line and the colour scale; every other value keeps them, as today). It reports its cells; min is its natural size (rows at their text height).
function heatmap(d, requested, options) {
  const { box, sizes, parts, contentHeight, floor } = options ?? {};
  const body = sizes?.body ?? 15, small = sizes?.small ?? SMALL, showScale = parts?.scale !== false, formulaSize = sizes?.body ?? 14; // a formula is measured at 14 px today (widestFormula's default)
  // A fitted call (a box or sizes): no text is drawn smaller than asked, so a column is at least as wide as its longest word at that size; with no options the picture stays as it is today.
  const fitted = Boolean(box || sizes), word = (values, at) => (fitted ? Math.ceil(Math.max(0, ...values.filter(Boolean).map(value => longestWordWidth(String(value), at)))) : 0);
  const build = rowExtra => {
    const rowWidth = Math.max(100, formulaWidth([d.rowLabel, ...d.rows.map(row => row.label)], formulaSize) + 16, word([d.rowLabel, ...d.rows.map(row => row.label)], body) + 16);
    const minimumCell = Math.max(80, formulaWidth(d.columns, formulaSize) + 14, word(d.columns, body) + 14, word(d.rows.flatMap(row => row.cells.map(value => (value === null ? 'Masked' : value))), body) + 12);
    const columnsWidth = Math.max(d.columns.length * minimumCell, formulaWidth([d.columnLabel], formulaSize), word([d.columnLabel], sizes?.heading ?? 14));
    const width = Math.max(requested, PAD * 2 + rowWidth + columnsWidth);
    const cellWidth = (width - PAD * 2 - rowWidth) / d.columns.length;
    const left = PAD + rowWidth;
    const elements = [];
    const geometry = { cells: [], rowHeadings: [], columnHeadings: [], range: { min: d.range.min, max: d.range.max } };
    let top = PAD;
    if (d.columnLabel) top = textBlock(elements, d.columnLabel, left, top, width - left - PAD, { weight: 700, ...(sizes?.heading ? { size: sizes.heading } : {}) }) + 8; // today the title is wrapped at 14 and drawn at the label default 15: kept when no size is asked
    const titleBlock = top - PAD;
    // MAT-F: the column headings and the row label (the header row) share one size, and the row headings share one: the smallest any of them needs.
    const [rowText, ...heads] = wrapShared([d.rowLabel ?? '', ...d.columns], [rowWidth - 16, ...d.columns.map(() => cellWidth - 14)], body);
    const rowHeading = d.rowLabel ? rowText : [];
    const rowTitles = wrapShared(d.rows.map(row => row.label), rowWidth - 16, body);
    const headHeight = Math.max(34, ...[...heads, rowHeading].map(lines => lines.length * lineHeight(body) + 12));
    if (d.rowLabel) elements.push(label(rowHeading, PAD + 6, top + headHeight / 2, { anchor: 'start', weight: 700, size: body }));
    d.columns.forEach((_, column) => {
      elements.push(teachingBox(left + column * cellWidth, top, cellWidth, headHeight, { role: 'process' }));
      elements.push(label(heads[column], left + (column + 0.5) * cellWidth, top + headHeight / 2, { weight: 700, size: body }));
      geometry.columnHeadings.push({ col: column, x: left + column * cellWidth, y: top, width: cellWidth, height: headHeight });
    });
    top += headHeight + 4;
    const highlighted = new Set((d.highlights ?? []).map(cell => `${cell.row}:${cell.column}`));
    let rowsHeight = 0;
    d.rows.forEach((row, rowIndex) => {
      const rowLines = rowTitles[rowIndex];
      const cellLines = row.cells.map(value => wrap(value === null ? 'Masked' : String(value), cellWidth - 12, body));
      const height = Math.max(44, rowLines.length * lineHeight(body) + 12, ...cellLines.map(lines => lines.length * lineHeight(body) + 12)) + rowExtra(rowIndex);
      elements.push(label(rowLines, PAD + 6, top + height / 2, { anchor: 'start', weight: 700, size: body }));
      geometry.rowHeadings.push({ row: rowIndex, x: PAD, y: top, width: rowWidth, height });
      row.cells.forEach((value, column) => {
        const x = left + column * cellWidth;
        const { fill, opacity } = value === null ? { fill: 'none', opacity: 1 } : heatColor(value, d.range);
        const active = highlighted.has(`${rowIndex}:${column}`);
        elements.push(h('rect', { x, y: top, width: cellWidth, height, fill: TEACHING.surface }));
        elements.push(h('rect', {
          x, y: top, width: cellWidth, height, fill, fillOpacity: opacity,
          stroke: active ? TEACHING.blue : TEACHING.outline, strokeWidth: active ? 3 : 1.5,
          strokeDasharray: value === null ? '4 3' : undefined,
          'data-tutor-heatmap-cell': `${rowIndex}:${column}`, 'data-tutor-masked': value === null ? 'true' : undefined,
        }));
        const ink = TEACHING.outline;
        elements.push(cloneElement(label(cellLines[column], x + cellWidth / 2, top + height / 2, { weight: active ? 700 : 400, size: body }), { fill: ink }));
        geometry.cells.push({ row: rowIndex, col: column, x, y: top, width: cellWidth, height, value });
      });
      top += height;
      rowsHeight += height;
    });
    const parts = [{ part: 'top margin', px: PAD }, ...(titleBlock ? [{ part: 'column title', px: titleBlock }] : []), { part: 'column headings', px: headHeight + 4 }, { part: 'rows', px: rowsHeight }];
    const widthCore = [{ part: 'margins', px: 2 * PAD }, { part: 'row label column', px: rowWidth }, { part: 'columns (the widest heading, at least 80 each)', px: columnsWidth }];
    const widthSpare = width - widthCore.reduce((all, item) => all + item.px, 0);
    const widthParts = [...widthCore, ...(widthSpare > 1e-9 ? [{ part: 'spare width', px: widthSpare }] : [])];
    if (!showScale) return { width, height: top + PAD, parts: [...parts, { part: 'bottom margin', px: PAD }], widthParts, elements, geometry };
    const rowsEnd = top;
    top += 16;
    top = textBlock(elements, `Range: ${d.range.min} to ${d.range.max}`, PAD, top, width - PAD * 2, { size: small }) + 8;
    const legendWidth = Math.min(240, width - PAD * 2), segments = 32;
    for (let i = 0; i < segments; i++) {
      const value = d.range.min + (d.range.max - d.range.min) * i / (segments - 1);
      const color = heatColor(value, d.range);
      elements.push(h('rect', { x: PAD + i * legendWidth / segments, y: top, width: legendWidth / segments, height: 10, fill: TEACHING.surface }));
      elements.push(h('rect', { x: PAD + i * legendWidth / segments, y: top, width: legendWidth / segments, height: 10, fill: color.fill, fillOpacity: color.opacity }));
    }
    top += 16;
    const tickLines = [d.range.min, d.range.max].map(value => wrap(String(value), legendWidth / 2 - 12, small));
    const tickHeight = Math.max(...tickLines.map(lines => lines.length)) * lineHeight(small);
    elements.push(label(tickLines[0], PAD, top + tickHeight / 2, { size: small, anchor: 'start' }));
    elements.push(label(tickLines[1], PAD + legendWidth, top + tickHeight / 2, { size: small, anchor: 'end' }));
    if (d.range.min < 0 && d.range.max > 0) {
      const zero = scale(d.range.min, d.range.max, PAD, PAD + legendWidth)(0);
      const startLabel = Math.max(...tickLines[0].map(line => textWidth(line, small)));
      const endLabel = Math.max(...tickLines[1].map(line => textWidth(line, small)));
      if (zero - PAD > startLabel + 16 && PAD + legendWidth - zero > endLabel + 16) elements.push(label('0', zero, top + tickHeight / 2, { size: small }));
    }
    const height = top + tickHeight + PAD;
    return { width, height, parts: [...parts, { part: 'range line and colour scale', px: top + tickHeight - rowsEnd }, { part: 'bottom margin', px: PAD }], widthParts, elements, geometry };
  };
  const first = build(() => 0);
  if (!box || floor || contentHeight === undefined) return first;
  const extra = Math.floor(contentHeight - first.height), n = d.rows.length;
  return extra > 0 ? build(i => Math.floor(extra / n) + (i < extra % n ? 1 : 0)) : first;
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
  // A chip: the letter (the sample id) at 15 px / 600, then its details at 13 px / 500 (stacked under it, or { rest: string } inline after it).
  const cards = (items, minWidth, getChip, getBox) => {
    const chips = items.map(getChip);
    const minimum = Math.max(minWidth, formulaWidth(chips.flatMap(chip => [chip.main, ...[].concat(chip.rest)])) + 16);
    const columns = Math.max(1, Math.floor((width - PAD * 2 + 8) / (minimum + 8)));
    const cellWidth = (width - PAD * 2 - (columns - 1) * 8) / columns;
    for (let start = 0; start < items.length; start += columns) {
      const row = items.slice(start, start + columns);
      const parts = row.map((_, i) => {
        const { main, rest } = chips[start + i];
        const mainLines = wrap(main, cellWidth - 16, 15);
        const restLines = typeof rest === 'string' ? [] : rest.flatMap(text => wrap(text, cellWidth - 16, NOTE));
        return { mainLines, restLines, inline: typeof rest === 'string' ? rest : '' };
      });
      const height = Math.max(34, ...parts.map(part => part.mainLines.length * lineHeight(15) + part.restLines.length * lineHeight(NOTE) + 16));
      row.forEach((item, i) => {
        const x = PAD + i * (cellWidth + 8), { mainLines, restLines, inline } = parts[i];
        const mainHeight = mainLines.length * lineHeight(15), restHeight = restLines.length * lineHeight(NOTE);
        const top = y + (height - mainHeight - restHeight) / 2;
        elements.push(getBox(item, x, y, cellWidth, height));
        elements.push(label(mainLines, x + 8, top + mainHeight / 2, { anchor: 'start', size: 15, weight: 600 }));
        if (inline) elements.push(label(inline.trim(), x + 14 + Math.max(...mainLines.map(line => textWidth(line, 15))), top + mainHeight / 2, { anchor: 'start', size: NOTE, weight: 500 }));
        if (restLines.length) elements.push(label(restLines, x + 8, top + mainHeight + restHeight / 2, { anchor: 'start', size: NOTE, weight: 500 }));
      });
      y += height + 8;
    }
  };
  cards(d.samples, 120, sample => ({
    main: sample.label && sample.label !== sample.id ? `${sample.id}: ${sample.label}` : sample.id,
    rest: [...(sample.class ? [sample.class] : []), ...(sample.weight !== undefined ? [`weight ${sample.weight}`] : [])],
  }), (sample, x, y, w, height) => cloneElement(teachingBox(x, y, w, height, { role: role(sample) }), { 'data-tutor-sample': sample.id }));
  d.groups.forEach(group => {
    y += 10;
    y = textBlock(elements, group.label, PAD, y, width - PAD * 2, { weight: 700 }) + 4;
    const count = group.outOfBagFor ? `${group.members.length} not drawn` : `${group.members.length} draws · ${new Set(group.members).size} unique${group.replacement ? ' · with replacement' : ''}`;
    y = textBlock(elements, count, PAD, y, width - PAD * 2, { size: NOTE, weight: 500, tone: 'muted' }) + 8;
    if (group.outOfBagFor) y = textBlock(elements, `Out of bag for ${d.groups.find(source => source.id === group.outOfBagFor).label}`, PAD, y, width - PAD * 2, { size: NOTE, weight: 500, tone: 'muted' }) + 8;
    const memberships = sampleMemberships(group);
    if (!memberships.length) y = textBlock(elements, 'Empty set', PAD, y, width - PAD * 2, { size: NOTE, weight: 500, tone: 'muted' }) + 8;
    cards(memberships, 86, member => ({ main: member.id, rest: member.text.slice(member.id.length) }), (member, x, y, w, height) =>
      cloneElement(teachingBox(x, y, w, height, { role: role(byId.get(member.id)) }), {
        'data-tutor-sample-member': `${group.id}:${member.id}`, 'data-tutor-multiplicity': member.count,
      }));
    if (group.omitted) y = textBlock(elements, `Omitted: ${group.omitted.join(', ') || 'none'}`, PAD, y, width - PAD * 2, { size: NOTE, weight: 500, tone: 'muted' }) + 8;
  });
  return { width, height: y + PAD, elements };
}

function histogram(d, requested) {
  const width = Math.max(360, requested, formulaWidth([
    d.xLabel, ...d.series.map(series => series.label), ...(d.markers ?? []).map(marker => marker.label),
  ]) + 124), elements = [];
  const seriesHeights = d.series.map(series => histogramHeights(d, series));
  const maximum = Math.max(...seriesHeights.flat());
  // The plot rules of the coordinate plot: no axis lines, a dashed guide at the top value and a solid zero line the bars sit on, tick numerals 15 px / 500 muted,
  // the measure title rotated along the plot when it fits (else above it) and the x title centred under the ticks, bold 16.
  const yTitle = histogramMeasureLabel(d), plotHeight = 132;
  const rotate = widestFormula(yTitle) === 0 && textWidth(yTitle, 16) * 1.1 <= plotHeight;
  const tickWidth = Math.min(88, Math.max(26, textWidth(String(maximum), TICK)));
  const left = PAD + (rotate ? 26 : 0) + tickWidth + 10, right = width - PAD - 10;
  const position = scale(d.binEdges[0], d.binEdges.at(-1), left, right);
  const maxLines = wrap(String(maximum), tickWidth, TICK);
  const tickHeight = maxLines.length * lineHeight(TICK);
  // Bin edges are the x tick labels; an interior edge that would touch the one before it is dropped.
  const edges = [];
  d.binEdges.forEach((edge, i) => {
    const at = position(edge), half = textWidth(String(edge), TICK) / 2;
    const previous = edges.at(-1);
    if (!previous || at - half >= previous.at + previous.half + 8) edges.push({ edge, at, half });
  });
  const last = d.binEdges.at(-1);
  if (edges.at(-1).edge !== last) {
    const at = position(last), half = textWidth(String(last), TICK) / 2;
    while (edges.length > 1 && at - half < edges.at(-1).at + edges.at(-1).half + 8) edges.pop();
    edges.push({ edge: last, at, half });
  }
  const edgeHeight = lineHeight(TICK);
  let y = PAD, tickCenter = y;
  if (!rotate) {
    const lines = wrap(yTitle, width - PAD * 2, 16);
    elements.push(label(lines, width / 2, y + lines.length * lineHeight(16) / 2, { weight: 700, size: 16 }));
    y += lines.length * lineHeight(16) + 10;
  }
  for (const [index, series] of d.series.entries()) {
    y = textBlock(elements, series.label, left, y, right - left, { weight: 700 }) + 6;
    const markerTop = y + 10;
    const top = y + Math.max(12, tickHeight / 2 + 4) + (d.markers?.length || 0) * 20;
    const bottom = top + plotHeight;
    const height = value => value / maximum * (bottom - top);
    elements.push(h('line', { x1: left, x2: right, y1: top, y2: top, stroke: TEACHING_GRID, strokeWidth: 1.5, strokeDasharray: '4 4', 'data-tutor-plot-grid': '' }));
    elements.push(label(maxLines, left - 8, top, { anchor: 'end', size: TICK, fill: TEACHING.muted }));
    elements.push(label('0', left - 8, bottom, { anchor: 'end', size: TICK, fill: TEACHING.muted }));
    if (rotate) {
      const cx = PAD + 10, cy = (top + bottom) / 2;
      elements.push(h('g', { transform: `rotate(-90 ${cx} ${cy})`, 'data-tutor-plot-y-title': '' }, label(yTitle, cx, cy, { size: 16, weight: 700 })));
    }
    series.values.forEach((value, bin) => {
      const x = position(d.binEdges[bin]), barWidth = position(d.binEdges[bin + 1]) - x;
      const barHeight = height(seriesHeights[index][bin]);
      elements.push(h('rect', {
        x, y: bottom - barHeight, width: barWidth, height: barHeight,
        fill: TEACHING_SERIES[index], stroke: TEACHING.outline, strokeWidth: 1.5,
        'data-tutor-histogram-bin': `${index}:${bin}`, 'data-tutor-bin-mass': value, 'data-tutor-bin-height': seriesHeights[index][bin],
      }));
    });
    (d.markers ?? []).forEach((marker, markerIndex) => {
      const x = position(marker.value), my = markerTop + markerIndex * 20;
      elements.push(h('line', { x1: x, x2: x, y1: my + 8, y2: bottom, stroke: TEACHING.outline, strokeWidth: 1.5, strokeDasharray: '4 3', 'data-tutor-histogram-marker': marker.value }));
      elements.push(label(String(markerIndex + 1), x, my, { size: SMALL, weight: 700 }));
    });
    // The zero line, solid, over the bars' feet: the one line a plot keeps.
    elements.push(h('line', { x1: left, x2: right, y1: bottom, y2: bottom, stroke: TEACHING_ZERO, strokeWidth: 1.5, 'data-tutor-plot-zero': '' }));
    tickCenter = bottom + 8 + edgeHeight / 2;
    for (const { edge, at } of edges) elements.push(label(String(edge), at, tickCenter, { size: TICK, fill: TEACHING.muted }));
    y = bottom + 8 + edgeHeight + 10;
    // The bin-by-bin counts line is dropped: the bars and their edge labels carry it, and the written description still lists it.
  }
  const xTitle = wrap(axisName(d.xLabel, d.unit), right - left, 16);
  const xTitleHeight = xTitle.length * lineHeight(16);
  const xTitleCenter = tickCenter + 24;
  elements.push(label(xTitle, (left + right) / 2, xTitleCenter, { weight: 700, size: 16 }));
  y = Math.max(y, xTitleCenter + xTitleHeight / 2) + 8;
  (d.markers ?? []).forEach((marker, i) => {
    y = textBlock(elements, `${i + 1}. ${marker.label}: ${marker.value}`, PAD, y, width - PAD * 2, { size: NOTE, tone: 'muted' }) + 4;
  });
  return { width, height: y + PAD, elements };
}

function boxPlot(d, requested) {
  const width = Math.max(360, requested, formulaWidth([d.x.label, ...d.boxes.flatMap(box => [box.label, ...(box.outliers ?? []).map(point => point.label)])]) + PAD * 2);
  const left = PAD + 10, right = width - PAD - 10;
  // The axis widens (outward, to whole numbers) to hold every drawn value: a computed fence can lie past the author's x.min and x.max.
  const drawn = d.boxes.flatMap(box => [box.whiskerLow, box.q1, box.q3, box.whiskerHigh, ...(box.fences ? [box.fences.lower, box.fences.upper] : []), ...(box.outliers ?? []).map(point => point.value)]);
  const axisMin = Math.min(...drawn) < d.x.min ? Math.floor(Math.min(...drawn)) : d.x.min;
  const axisMax = Math.max(...drawn) > d.x.max ? Math.ceil(Math.max(...drawn)) : d.x.max;
  const x = scale(axisMin, axisMax, left, right), elements = [];
  let top = PAD;
  d.boxes.forEach((box, index) => {
    top = textBlock(elements, box.label, PAD, top, width - PAD * 2, { weight: 700 }) + 10;
    const center = top + 26;
    const color = TEACHING_SERIES[index % TEACHING_SERIES.length];
    // Whiskers 2 px ink, the box and median as before (median 3 px), fences 1.5 px dashed muted brown, outliers a 12 px coral circle with a 2 px ring.
    elements.push(h('line', { x1: x(box.whiskerLow), x2: x(box.whiskerHigh), y1: center, y2: center,
      stroke: TEACHING.outline, strokeWidth: 2, 'data-tutor-box-whisker': index }));
    for (const value of [box.whiskerLow, box.whiskerHigh]) elements.push(h('line', { x1: x(value), x2: x(value), y1: center - 9, y2: center + 9, stroke: TEACHING.outline, strokeWidth: 2 }));
    elements.push(h('rect', { x: x(box.q1), y: center - 14, width: x(box.q3) - x(box.q1), height: 28, fill: color, stroke: TEACHING.outline, strokeWidth: 1.5, 'data-tutor-box': index }));
    elements.push(h('line', { x1: x(box.median), x2: x(box.median), y1: center - 14, y2: center + 14,
      stroke: TEACHING.outline, strokeWidth: 3, 'data-tutor-box-median': box.median }));
    if (box.fences) {
      for (const value of [box.fences.lower, box.fences.upper]) elements.push(h('line', {
        x1: x(value), x2: x(value), y1: center - 24, y2: center + 24,
        stroke: TEACHING_ZERO, strokeWidth: 1.5, strokeDasharray: '4 3', 'data-tutor-box-fence': value,
      }));
    }
    const lanes = [];
    (box.outliers ?? []).forEach(point => {
      const px = x(point.value);
      let row = lanes.findIndex(values => values.every(other => Math.abs(px - other) >= 16));
      if (row < 0) { row = lanes.length; lanes.push([]); }
      lanes[row].push(px);
      elements.push(h('circle', { cx: px, cy: center + row * 16, r: 6, fill: TEACHING.coral,
        stroke: TEACHING.outline, strokeWidth: 2, 'data-tutor-box-outlier': point.value }));
    });
    top = center + Math.max(34, lanes.length * 16 + 8);
    top = textBlock(elements, boxSummary(box), PAD, top, width - PAD * 2, { size: NOTE, tone: 'muted' }) + 6;
    if (box.fences) top = textBlock(elements, `Lower fence: ${box.fences.lower}; Upper fence: ${box.fences.upper}`, PAD, top, width - PAD * 2, { size: NOTE, tone: 'muted' }) + 6;
    (box.outliers ?? []).forEach(point => {
      top = textBlock(elements, `${point.label}: ${point.value}`, PAD, top, width - PAD * 2, { size: NOTE, tone: 'muted' }) + 4;
    });
    top += 18;
  });
  // The reading axis follows the plot rules: no axis line, a dashed guide marks it, tick numerals 15 px / 500 muted, the title centred and bold 16 below.
  elements.push(h('line', { x1: left, x2: right, y1: top, y2: top, stroke: TEACHING_GRID, strokeWidth: 1.5, strokeDasharray: '4 4', 'data-tutor-plot-grid': '' }));
  const edgeLines = [axisMin, axisMax].map(value => wrap(String(value), (right - left) / 2 - 8, TICK));
  const edgeHeight = Math.max(...edgeLines.map(lines => lines.length)) * lineHeight(TICK);
  elements.push(label(edgeLines[0], left, top + 8 + edgeHeight / 2, { size: TICK, anchor: 'start', fill: TEACHING.muted }));
  elements.push(label(edgeLines[1], right, top + 8 + edgeHeight / 2, { size: TICK, anchor: 'end', fill: TEACHING.muted }));
  const xTitle = wrap(axisName(d.x.label, d.x.unit), right - left, 16);
  const titleCenter = top + 8 + edgeHeight / 2 + 24;
  elements.push(label(xTitle, (left + right) / 2, titleCenter, { weight: 700, size: 16 }));
  top = titleCenter + xTitle.length * lineHeight(16) / 2;
  return { width, height: top + PAD, elements };
}

export function createLayouts({ legacy, renderChild } = {}) {
  // New kinds do not replace any legacy layout; the integration owner merges maps.
  return { heatmap, 'sample-set': sampleSet, histogram, 'box-plot': boxPlot };
}
