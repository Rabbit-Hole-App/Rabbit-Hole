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

function tokenMetrics({ source, target }, compact, requested = 0) {
  const count = Math.max(source.length, target.length);
  // In comparison panels, wrap ordinary labels and place row labels outside the grid.
  const measure = compact ? widestFormula : textWidth;
  const preferred = Math.ceil(Math.max(compact ? PANEL_MIN_CELL : MIN_CELL,
    ...[...source, ...target].map(token => measure(token) + 2 * CELL_PAD)));
  const gutter = compact ? 0 : GUTTER;
  const required = 2 * (PAD + INSET) + gutter + count * preferred + (count - 1) * GAP;
  // Past the row budget (the width asked for, at least 720, at most 960) the chip rows wrap at chip boundaries: as many columns as fit, the rest on further rows.
  const budget = Math.min(MAX_WIDTH, Math.max(720, requested));
  let columns = count;
  if (!compact && required > budget) {
    columns = 1;
    while (columns < count && 2 * (PAD + INSET) + gutter + (columns + 1) * preferred + columns * WRAP_GAP <= budget) columns++;
  }
  const wrapped = columns < count;
  const wrappedRequired = 2 * (PAD + INSET) + gutter + columns * preferred + (columns - 1) * WRAP_GAP;
  const minimum = Math.max(MIN_WIDTH, compact ? required : wrapped ? wrappedRequired : Math.min(MAX_WIDTH, required));
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

function weightBadge(from, to, weight) {
  const text = String(weight).length > 6 ? weight.toPrecision(3) : String(weight);
  const x = from[0] + 0.8 * (to[0] - from[0]);
  const y = from[1] + 0.8 * (to[1] - from[1]);
  return h('g', { 'data-tutor-token-largest-weight': weight },
    // 24 px tall, a circle until the weight's digits ("0.45") need more room, then a pill.
    h('rect', { x: x - Math.max(24, textWidth(text, SMALL) + 10) / 2, y: y - 12, width: Math.max(24, textWidth(text, SMALL) + 10), height: 24, rx: 12, fill: TEACHING.surface, stroke: TEACHING.outline, strokeWidth: 1.5 }),
    label(text, x, y, { size: SMALL, weight: 600, fill: TEACHING.ink }));
}

export function layoutTokenLinks(diagram, requestedWidth = 408, { compact = false } = {}) {
  const { source, target, queries } = diagram;
  // A comparison can allocate fractional widths. Rounding down avoids falsely stacking an odd-width pair.
  const requested = Number.isFinite(requestedWidth) ? (compact ? Math.floor(requestedWidth) : Math.round(requestedWidth)) : 408;
  const metrics = tokenMetrics(diagram, compact, requested);
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
  const sourceLabels = source.map(token => wrap(token, innerWidth));
  const targetLabels = target.map(token => wrap(token, innerWidth));
  const cellHeight = Math.max(56, ...[...sourceLabels, ...targetLabels].map(lines => lines.length * lineHeight() + 24)); // token boxes are 56 tall like flow nodes
  const sourceY = INSET + (compact ? 42 : 22);
  const sourceRows = Math.ceil(source.length / slots), targetRows = Math.ceil(target.length / slots);
  const sourceBottom = sourceY + (sourceRows - 1) * (cellHeight + ROW_GAP) + cellHeight; // the bottom of the last row of source chips
  const targetY = sourceBottom + Math.max(86, Math.round(rowWidth * 0.16));
  const sourceTop = index => sourceY + rowOf(index) * (cellHeight + ROW_GAP), targetTop = index => targetY + rowOf(index) * (cellHeight + ROW_GAP);
  const targetBottom = targetY + (targetRows - 1) * (cellHeight + ROW_GAP) + cellHeight;
  const sourceLabelY = compact ? sourceY - 11 : sourceY + cellHeight / 2;
  const targetLabelY = compact ? targetBottom + 11 : targetY + cellHeight / 2;

  function tokenBox(lines, row, index, y, query, strongest) {
    const cx = center(index);
    y = row === 'source' ? sourceTop(index) : targetTop(index);
    const active = row === 'source' && query === index;
    const heavy = row === 'target' && strongest.includes(index);
    const nameY = y + (cellHeight - 13) / 2;
    // Plain text wraps. A single unbreakable formula can still exceed the cell at the 960 px cap.
    const scale = Math.min(1, innerWidth / Math.max(...lines.map(line => textWidth(line))));
    const options = { weight: active || heavy ? 700 : 400 };
    const name = scale === 1 ? label(lines, cx, nameY, options)
      : h('g', { transform: `translate(${cx} ${nameY}) scale(${scale})` }, label(lines, 0, 0, options));
    return h('g', {
      'data-tutor-token': `${row}:${index}`,
      ...(active ? { 'data-tutor-token-query': '' } : {}),
      ...(heavy ? { 'data-tutor-token-strongest': '' } : {}),
    }, box(cx - cellWidth / 2, y, cellWidth, cellHeight, { role: active ? 'process' : heavy ? 'outcome' : 'plain', active }),
    name, label(String(index + 1), cx, y + cellHeight - 10, { size: SMALL, tone: 'muted' }));
  }

  let y = PAD;
  const elements = queries.map(({ index, weights }) => {
    const highest = Math.max(...weights);
    const strongest = weights.flatMap((weight, targetIndex) => weight > 0 && weight === highest ? [targetIndex] : []);
    const note = highest === 0 ? 'All weights are 0' : strongest.length > 1
      ? `Equal largest weights at targets ${strongest.map(position => position + 1).join(', ')}` : '';
    const footer = note ? wrap(note, contentWidth, SMALL) : [];
    const footerHeight = footer.length * lineHeight(SMALL);
    const footerTop = targetBottom + (compact ? 24 : 8);
    const panelHeight = footerTop + footerHeight + INSET;
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
      label(`Query at source position ${index + 1}`, left, INSET + 4, { weight: 700, anchor: 'start' }),
      label('Source', left, sourceLabelY, { size: SMALL, tone: 'muted', anchor: 'start' }),
      label('Target', left, targetLabelY, { size: SMALL, tone: 'muted', anchor: 'start' }),
      ...arrows,
      ...sourceLabels.map((lines, i) => tokenBox(lines, 'source', i, sourceY, index, strongest)),
      ...targetLabels.map((lines, i) => tokenBox(lines, 'target', i, targetY, index, strongest)),
      strongest.length ? weightBadge(badgeFrom(strongest[0]), to(strongest[0]), highest) : null,
      footer.length ? label(footer, left, footerTop + footerHeight / 2, { size: SMALL, weight: 700, anchor: 'start' }) : null);
    y += panelHeight + GAP;
    return panel;
  });
  return { width, height: y - GAP + PAD, elements };
}
