import { cloneElement, createElement as h } from 'react';
import { label, lineHeight, textWidth, widestFormula, wrap } from './primitives.js';
import { TEACHING, teachingBox as box, teachingConnector as connector } from './teaching-theme.js';

const PAD = 12;
const INSET = 12;
const GUTTER = 68;
const GAP = 10;
const CELL_PAD = 8;
const MIN_CELL = 58;
const PANEL_MIN_CELL = 56;
const MIN_WIDTH = 320;
const MAX_WIDTH = 960;
const SMALL = 12;

function tokenMetrics({ source, target }, compact) {
  const count = Math.max(source.length, target.length);
  // In comparison panels, wrap ordinary labels and place row labels outside the grid.
  const measure = compact ? widestFormula : textWidth;
  const preferred = Math.ceil(Math.max(compact ? PANEL_MIN_CELL : MIN_CELL,
    ...[...source, ...target].map(token => measure(token) + 2 * CELL_PAD)));
  const gutter = compact ? 0 : GUTTER;
  const required = 2 * (PAD + INSET) + gutter + count * preferred + (count - 1) * GAP;
  const minimum = Math.max(MIN_WIDTH, compact ? required : Math.min(MAX_WIDTH, required));
  return { count, preferred, gutter, minimum };
}

export function tokenLinksNaturalWidth(diagram, { compact = false } = {}) {
  return tokenMetrics(diagram, compact).minimum;
}

function weightedArrow(from, to, queryIndex, targetIndex, weight, description) {
  const arrow = connector([from, to], { active: true, arrow: true, dashed: weight === 0 });
  const [wire, head] = arrow.props.children;
  return h('g', {
    'data-tutor-token-link': `${queryIndex}:${targetIndex}`, 'data-tutor-token-weight': weight, opacity: 0.18 + 0.82 * weight,
  }, h('title', null, description), cloneElement(wire, { strokeWidth: 1 + 4.5 * weight }), head);
}

function weightBadge(from, to, weight) {
  const text = String(weight).length > 6 ? weight.toPrecision(3) : String(weight);
  const x = from[0] + 0.8 * (to[0] - from[0]);
  const y = from[1] + 0.8 * (to[1] - from[1]);
  const width = textWidth(text, SMALL) + 14;
  return h('g', { 'data-tutor-token-largest-weight': weight },
    box(x - width / 2, y - 10, width, 20, { role: 'process', active: true }),
    label(text, x, y, { size: SMALL, weight: 700, fill: TEACHING.blue }));
}

export function layoutTokenLinks(diagram, requestedWidth = 408, { compact = false } = {}) {
  const { source, target, queries } = diagram;
  const metrics = tokenMetrics(diagram, compact);
  // A comparison can allocate fractional widths. Rounding down avoids falsely stacking an odd-width pair.
  const requested = Number.isFinite(requestedWidth) ? (compact ? Math.floor(requestedWidth) : Math.round(requestedWidth)) : 408;
  const width = Math.max(metrics.minimum, Math.min(MAX_WIDTH, requested));
  const contentWidth = width - 2 * (PAD + INSET);
  const rowWidth = contentWidth - metrics.gutter;
  const slotWidth = Math.floor((rowWidth - (metrics.count - 1) * GAP) / metrics.count);
  const cellWidth = Math.min(slotWidth, Math.max(metrics.preferred, 112));
  const left = PAD + INSET;
  const rowStart = left + metrics.gutter + (rowWidth - metrics.count * slotWidth - (metrics.count - 1) * GAP) / 2;
  const center = index => rowStart + index * (slotWidth + GAP) + slotWidth / 2;
  const innerWidth = cellWidth - 2 * CELL_PAD;
  const sourceLabels = source.map(token => wrap(token, innerWidth));
  const targetLabels = target.map(token => wrap(token, innerWidth));
  const cellHeight = Math.max(...[...sourceLabels, ...targetLabels].map(lines => lines.length * lineHeight() + 24));
  const sourceY = INSET + (compact ? 42 : 22);
  const targetY = sourceY + cellHeight + Math.max(86, Math.round(rowWidth * 0.16));
  const sourceLabelY = compact ? sourceY - 11 : sourceY + cellHeight / 2;
  const targetLabelY = compact ? targetY + cellHeight + 11 : targetY + cellHeight / 2;

  function tokenBox(lines, row, index, y, query, strongest) {
    const cx = center(index);
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
    const footerTop = targetY + cellHeight + (compact ? 24 : 8);
    const panelHeight = footerTop + footerHeight + INSET;
    const from = [center(index), sourceY + cellHeight + 3];
    const to = targetIndex => [center(targetIndex), targetY - 3];
    // Paint higher weights last to keep strong paths visible where they leave the same query.
    const arrows = weights.map((weight, targetIndex) => ({ weight, targetIndex }))
      .sort((a, b) => a.weight - b.weight)
      .map(({ weight, targetIndex }) => weightedArrow(from, to(targetIndex),
        index, targetIndex, weight, `${source[index]} at source position ${index + 1} → ${target[targetIndex]} at target position ${targetIndex + 1} · weight ${weight}`));
    const panel = h('g', { transform: `translate(0 ${y})`, 'data-tutor-token-panel': index },
      box(PAD, 0, width - 2 * PAD, panelHeight),
      label(`Query at source position ${index + 1}`, left, INSET + 4, { weight: 700, anchor: 'start' }),
      label('Source', left, sourceLabelY, { size: SMALL, tone: 'muted', anchor: 'start' }),
      label('Target', left, targetLabelY, { size: SMALL, tone: 'muted', anchor: 'start' }),
      ...arrows,
      ...sourceLabels.map((lines, i) => tokenBox(lines, 'source', i, sourceY, index, strongest)),
      ...targetLabels.map((lines, i) => tokenBox(lines, 'target', i, targetY, index, strongest)),
      strongest.length ? weightBadge(from, to(strongest[0]), highest) : null,
      footer.length ? label(footer, left, footerTop + footerHeight / 2, { size: SMALL, weight: 700, anchor: 'start' }) : null);
    y += panelHeight + GAP;
    return panel;
  });
  return { width, height: y - GAP + PAD, elements };
}
