import { createElement as h } from 'react';
import { label, lineHeight, textWidth, widestFormula, wire, wrap } from './primitives.js';
import { TEACHING, TEACHING_SERIES_INK, teachingBox as box } from './teaching-theme.js';

const PAD = 12;
const INSET = 12;
const GUTTER = 68;
const GAP = 10;
const WRAP_GAP = 28; // the gap between chips of a wrapped row: a link to a lower row runs down it
const ROW_GAP = 44; // between two rows of chips
const CELL_PAD = 8;
const MIN_CELL = 58;
const PANEL_MIN_CELL = 56;
const MIN_WIDTH = 320;
const MAX_WIDTH = 960;
const SMALL = 13;
const ROW_GAP_FLOOR = 48; // with a box: the gap between the two chip rows is at least this (a 24 px weight badge and its arrowheads), the rest of the box height is added to it

function tokenMetrics({ source, target }, compact, requested = 0, { boxed = false, body = 15 } = {}) {
  const count = Math.max(source.length, target.length);
  // In comparison panels, wrap ordinary labels and place row labels outside the grid.
  const measure = compact ? widestFormula : token => textWidth(token, body);
  const preferred = Math.ceil(Math.max(compact ? PANEL_MIN_CELL : MIN_CELL,
    ...[...source, ...target].map(token => measure(token) + 2 * CELL_PAD)));
  const gutter = compact ? 0 : GUTTER;
  const required = 2 * (PAD + INSET) + gutter + count * preferred + (count - 1) * GAP;
  // Past the row budget (the width asked for, at least 720, at most 960) the chip rows wrap at chip boundaries: as many columns as fit, the rest on further rows.
  const budget = Math.min(MAX_WIDTH, Math.max(boxed ? 1 : 720, requested));
  let columns = count;
  if (!compact && required > budget) {
    columns = 1;
    while (columns < count && 2 * (PAD + INSET) + gutter + (columns + 1) * preferred + columns * WRAP_GAP <= budget) columns++;
  }
  const wrapped = columns < count;
  const wrappedRequired = 2 * (PAD + INSET) + gutter + columns * preferred + (columns - 1) * WRAP_GAP;
  const minimum = Math.max(boxed ? 0 : MIN_WIDTH, compact ? required : wrapped ? wrappedRequired : Math.min(MAX_WIDTH, required));
  return { count, preferred, gutter, minimum, columns, wrapped };
}

export function tokenLinksNaturalWidth(diagram, { compact = false } = {}) {
  return tokenMetrics(diagram, compact, 0).minimum;
}

function weightedArrow(from, to, queryIndex, targetIndex, weight, description, via = null) {
  // 1.5 px to 6 px and 35% to 100% opacity by weight, in the blue ink; the head is the shared 12 x 8 one. A link across wrapped rows runs along the gaps (via: its points).
  return h('g', {
    'data-tutor-token-link': `${queryIndex}:${targetIndex}`, 'data-tutor-token-weight': weight, opacity: 0.35 + 0.65 * weight,
  }, h('title', null, description), wire(via ?? [from, to], { color: TEACHING_SERIES_INK[0], width: 1.5 + 4.5 * weight, corner: via ? 6 : 0 }));
}

function weightBadge(from, to, weight, small = SMALL) {
  const text = String(weight).length > 6 ? weight.toPrecision(3) : String(weight);
  const x = from[0] + 0.8 * (to[0] - from[0]);
  const y = from[1] + 0.8 * (to[1] - from[1]);
  return h('g', { 'data-tutor-token-largest-weight': weight },
    // 24 px tall, a circle until the weight's digits ("0.45") need more room, then a pill.
    h('rect', { x: x - Math.max(24, textWidth(text, small) + 10) / 2, y: y - 12, width: Math.max(24, textWidth(text, small) + 10), height: 24, rx: 12, fill: TEACHING.surface, stroke: TEACHING.outline, strokeWidth: 1.5 }),
    label(text, x, y, { size: small, weight: 600, fill: TEACHING.ink }));
}

// kinds-fit: with a box, the chip rows sit ROW_GAP_FLOOR apart and the rest of the box height (contentHeight, set by the entry point) is added to that gap, shared by the panels.
export function layoutTokenLinks(diagram, requestedWidth = 408, options = {}) {
  const { box: boxOption, contentHeight, floor } = options;
  const first = tokenLinksCore(diagram, requestedWidth, options, () => 0);
  if (!boxOption || floor || contentHeight === undefined) return first;
  const extra = Math.floor(contentHeight - first.height), n = diagram.queries.length;
  return extra > 0 ? tokenLinksCore(diagram, requestedWidth, options, i => Math.floor(extra / n) + (i < extra % n ? 1 : 0)) : first;
}

function tokenLinksCore(diagram, requestedWidth, options, extraGap) {
  const { compact = false, box: boxOption, sizes } = options;
  const boxed = Boolean(boxOption), body = sizes?.body ?? 15, small = sizes?.small ?? SMALL, heading = sizes?.heading ?? 15;
  const { source, target, queries } = diagram;
  // A comparison can allocate fractional widths. Rounding down avoids falsely stacking an odd-width pair.
  const requested = Number.isFinite(requestedWidth) ? (compact ? Math.floor(requestedWidth) : Math.round(requestedWidth)) : 408;
  const metrics = tokenMetrics(diagram, compact, requested, { boxed, body });
  const { columns, wrapped } = metrics;
  const gap = wrapped ? WRAP_GAP : GAP;
  const width = Math.max(metrics.minimum, Math.min(MAX_WIDTH, requested));
  const contentWidth = width - 2 * (PAD + INSET);
  const rowWidth = contentWidth - metrics.gutter;
  const slots = wrapped ? columns : metrics.count;
  const slotWidth = Math.floor((rowWidth - (slots - 1) * gap) / slots);
  const cellWidth = Math.min(slotWidth, Math.max(metrics.preferred, 112));
  const left = PAD + INSET;
  const rowStart = left + metrics.gutter + (rowWidth - slots * slotWidth - (slots - 1) * gap) / 2;
  const center = index => rowStart + (index % slots) * (slotWidth + gap) + slotWidth / 2;
  const rowOf = index => Math.floor(index / slots);
  const gapX = index => center(index) + slotWidth / 2 + (index % slots === slots - 1 ? 8 : gap / 2); // the gap to the right of a chip's column
  const innerWidth = cellWidth - 2 * CELL_PAD;
  const sourceLabels = source.map(token => wrap(token, innerWidth, body));
  const targetLabels = target.map(token => wrap(token, innerWidth, body));
  const cellHeight = Math.max(56, ...[...sourceLabels, ...targetLabels].map(lines => lines.length * lineHeight(body) + 24)); // token boxes are 56 tall like flow nodes
  const sourceY = INSET + (compact ? 42 : 22);
  const sourceRows = Math.ceil(source.length / slots), targetRows = Math.ceil(target.length / slots);
  const sourceBottom = sourceY + (sourceRows - 1) * (cellHeight + ROW_GAP) + cellHeight; // the bottom of the last row of source chips
  const rowGapFor = panel => (boxed ? ROW_GAP_FLOOR + extraGap(panel) : Math.max(86, Math.round(rowWidth * 0.16)));
  const sourceTop = index => sourceY + rowOf(index) * (cellHeight + ROW_GAP);
  const sourceLabelY = compact ? sourceY - 11 : sourceY + cellHeight / 2;
  const panels = [];

  function tokenBox(lines, row, index, y, query, strongest, targetTop) {
    const cx = center(index);
    y = row === 'source' ? sourceTop(index) : targetTop(index);
    const active = row === 'source' && query === index;
    const heavy = row === 'target' && strongest.includes(index);
    const nameY = y + (cellHeight - small) / 2;
    // Plain text wraps. A single unbreakable formula can still exceed the cell at the 960 px cap.
    const scale = Math.min(1, innerWidth / Math.max(...lines.map(line => textWidth(line, body))));
    const options = { weight: active || heavy ? 700 : 400, size: body };
    const name = scale === 1 ? label(lines, cx, nameY, options)
      : h('g', { transform: `translate(${cx} ${nameY}) scale(${scale})` }, label(lines, 0, 0, options));
    return h('g', {
      'data-tutor-token': `${row}:${index}`,
      ...(active ? { 'data-tutor-token-query': '' } : {}),
      ...(heavy ? { 'data-tutor-token-strongest': '' } : {}),
    }, box(cx - cellWidth / 2, y, cellWidth, cellHeight, { role: active ? 'process' : heavy ? 'outcome' : 'plain', active }),
    name, label(String(index + 1), cx, y + cellHeight - 10, { size: small, tone: 'muted' }));
  }

  let y = PAD;
  // kinds-fit: what the height is made of, summed over the panels (min.parts of the entry point lists these).
  const tally = { heading: 0, source: 0, gap: 0, target: 0, footer: 0 };
  const elements = queries.map(({ index, weights }, panelIndex) => {
    const top = y;
    const targetY = sourceBottom + rowGapFor(panelIndex);
    const targetTop = i => targetY + rowOf(i) * (cellHeight + ROW_GAP);
    const targetBottom = targetY + (targetRows - 1) * (cellHeight + ROW_GAP) + cellHeight;
    const targetLabelY = compact ? targetBottom + 11 : targetY + cellHeight / 2;
    const highest = Math.max(...weights);
    const strongest = weights.flatMap((weight, targetIndex) => weight > 0 && weight === highest ? [targetIndex] : []);
    const note = highest === 0 ? 'All weights are 0' : strongest.length > 1
      ? `Equal largest weights at targets ${strongest.map(position => position + 1).join(', ')}` : '';
    const footer = note ? wrap(note, contentWidth, small) : [];
    const footerHeight = footer.length * lineHeight(small);
    const footerTop = targetBottom + (compact ? 24 : 8);
    const panelHeight = footerTop + footerHeight + INSET;
    tally.heading += sourceY; tally.source += sourceRows * cellHeight + (sourceRows - 1) * ROW_GAP; tally.gap += rowGapFor(panelIndex);
    tally.target += targetRows * cellHeight + (targetRows - 1) * ROW_GAP; tally.footer += (compact ? 24 : 8) + footerHeight + INSET;
    const from = [center(index), sourceTop(index) + cellHeight + 3];
    const to = targetIndex => [center(targetIndex), targetTop(targetIndex) - 3];
    // Links across wrapped rows: down to a lane, along it to the gap right of the target's column, down that gap to the lane above the target's row, along it, down into the chip. A source chip on
    // an upper source row first goes down its own gap, to the lane below the last source row.
    const lowerTargets = weights.map((_, targetIndex) => targetIndex).filter(targetIndex => rowOf(targetIndex) > 0);
    const lanePoints = targetIndex => {
      const through = [from];
      if (rowOf(index) < sourceRows - 1) {
        const lane = sourceTop(index) + cellHeight + 14;
        through.push([from[0], lane], [gapX(index), lane], [gapX(index), sourceBottom + 10]);
      }
      const row = rowOf(targetIndex);
      if (row === 0 && through.length === 1) return null;
      const target = to(targetIndex);
      if (row === 0) return [...through, target];
      const laneA = sourceBottom + 22 + 8 * lowerTargets.indexOf(targetIndex), laneB = targetTop(targetIndex) - 22;
      return [...through, [through.at(-1)[0], laneA], [gapX(targetIndex), laneA], [gapX(targetIndex), laneB], [target[0], laneB], target];
    };
    const badgeFrom = targetIndex => { const via = wrapped ? lanePoints(targetIndex) : null; return via && via.length > 2 ? via.at(-2) : from; };
    // Paint higher weights last to keep strong paths visible where they leave the same query.
    const arrows = weights.map((weight, targetIndex) => ({ weight, targetIndex }))
      .sort((a, b) => a.weight - b.weight)
      .map(({ weight, targetIndex }) => weightedArrow(from, to(targetIndex),
        index, targetIndex, weight, `${source[index]} at source position ${index + 1} → ${target[targetIndex]} at target position ${targetIndex + 1} · weight ${weight}`, wrapped ? lanePoints(targetIndex) : null));
    const panel = h('g', { transform: `translate(0 ${y})`, 'data-tutor-token-panel': index },
      box(PAD, 0, width - 2 * PAD, panelHeight),
      label(`Query at source position ${index + 1}`, left, INSET + 4, { weight: 700, anchor: 'start', size: heading }),
      label('Source', left, sourceLabelY, { size: small, tone: 'muted', anchor: 'start' }),
      label('Target', left, targetLabelY, { size: small, tone: 'muted', anchor: 'start' }),
      ...arrows,
      ...sourceLabels.map((lines, i) => tokenBox(lines, 'source', i, sourceY, index, strongest, targetTop)),
      ...targetLabels.map((lines, i) => tokenBox(lines, 'target', i, targetY, index, strongest, targetTop)),
      strongest.length ? weightBadge(badgeFrom(strongest[0]), to(strongest[0]), highest, small) : null,
      footer.length ? label(footer, left, footerTop + footerHeight / 2, { size: small, weight: 700, anchor: 'start' }) : null);
    const chip = (i, at) => ({ index: i, x: center(i) - cellWidth / 2, y: top + at(i), width: cellWidth, height: cellHeight });
    panels.push({ query: index, sources: source.map((_, i) => chip(i, sourceTop)), targets: target.map((_, i) => chip(i, targetTop)),
      links: weights.map((weight, t) => ({ target: t, weight, from: [from[0], top + from[1]], to: [to(t)[0], top + to(t)[1]] })) });
    y += panelHeight + GAP;
    return panel;
  });
  const parts = [{ part: 'outer margins', px: 2 * PAD }, { part: 'query heading', px: tally.heading }, { part: 'source chips', px: tally.source }, { part: 'gap between the chip rows', px: tally.gap },
    { part: 'target chips', px: tally.target }, { part: 'footer notes and panel padding', px: tally.footer }, ...(queries.length > 1 ? [{ part: 'space between panels', px: (queries.length - 1) * GAP }] : [])];
  const widthCore = [{ part: 'margins', px: 2 * (PAD + INSET) }, ...(metrics.gutter ? [{ part: 'row label gutter', px: metrics.gutter }] : []), { part: 'token chips', px: columns * metrics.preferred }, { part: 'gaps between chips', px: (columns - 1) * gap }];
  const spare = width - widthCore.reduce((all, item) => all + item.px, 0);
  const widthParts = [...widthCore, ...(spare > 1e-9 ? [{ part: 'spare width', px: spare }] : [])];
  return { width, height: y - GAP + PAD, parts, widthParts, elements, geometry: { panels } };
}
