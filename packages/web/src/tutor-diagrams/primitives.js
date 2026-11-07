import { createElement as h } from 'react';

export const PALETTE = Object.freeze({
  process: '#8DBFEF',
  decision: '#E5AA46',
  outcome: '#67B9A0',
  olive: '#95A448',
  coral: '#F58371',
  lavender: '#B9A4E8',
  rose: '#E8A3B7',
  slate: '#A8BBD0',
});
export const SURFACE = 'var(--viz-surface, #fbfbfa)';
export const INK = 'var(--color-ink, #32211c)';
export const MUTED = 'var(--color-ink-2, #665951)';
const FILLED_INK = '#32211c';

export const lineHeight = (size = 14) => Math.ceil(size * 1.25);

export function textWidth(text, size = 14) {
  let width = 0;
  for (const char of text) {
    if (/^[ .,:;!ilI'|’]$/u.test(char)) width += 0.38;
    else if (/^[MW@%&#mw]$/u.test(char)) width += 0.94;
    else if (char.codePointAt(0) > 0x2ff) width += 1.03;
    else width += 0.68;
  }
  return width * size;
}

export function wrap(text, width, size = 14) {
  const lines = [];
  let line = '';
  for (const word of text.trim().split(/\s+/u)) {
    const joined = line ? `${line} ${word}` : word;
    if (textWidth(joined, size) <= width) {
      line = joined;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    // Long identifiers and unspaced scripts still need a bounded line.
    for (const char of word) {
      if (line && textWidth(line + char, size) > width) {
        lines.push(line);
        line = '';
      }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function label(lines, x, y, { size = 14, weight = 400, anchor = 'middle', tone = 'ink' } = {}) {
  const values = Array.isArray(lines) ? lines : [lines];
  const step = lineHeight(size);
  const fill = tone === 'onFill' ? FILLED_INK : tone === 'muted' ? MUTED : INK;
  return h('text', { x, y, fill, fontSize: size, fontWeight: weight, textAnchor: anchor },
    ...values.map((value, index) => h('tspan', { x, y: y + (index - (values.length - 1) / 2) * step + size * 0.34 }, value)));
}

export function box(x, y, width, height, { role = 'plain', radius = 7 } = {}) {
  return h('rect', {
    x, y, width, height, rx: radius,
    fill: PALETTE[role] ?? SURFACE,
    stroke: role === 'plain' ? INK : FILLED_INK, strokeWidth: 1.5,
  });
}

export function diamond(x, y, width, height) {
  const points = [[x + width / 2, y], [x + width, y + height / 2],
    [x + width / 2, y + height], [x, y + height / 2]];
  return h('polygon', {
    points: points.map(point => point.join(',')).join(' '),
    fill: PALETTE.decision, stroke: FILLED_INK, strokeWidth: 1.5, strokeLinejoin: 'round',
  });
}

export function dot(x, y, r, role = 'outcome') {
  return h('circle', { cx: x, cy: y, r, fill: PALETTE[role] ?? SURFACE, stroke: FILLED_INK, strokeWidth: 1.3 });
}

export function connector(points, { arrow = true, dashed = false } = {}) {
  const wire = h('polyline', {
    points: points.map(point => point.join(',')).join(' '), fill: 'none', stroke: dashed ? MUTED : INK,
    strokeWidth: dashed ? 1 : 1.5, strokeDasharray: dashed ? '4 4' : undefined,
    strokeLinecap: 'round', strokeLinejoin: 'round',
  });
  if (!arrow) return wire;
  const [x, y] = points.at(-1);
  const [prevX, prevY] = points.at(-2);
  const length = Math.hypot(x - prevX, y - prevY);
  if (!length) return wire;
  const dx = (x - prevX) / length, dy = (y - prevY) / length;
  const tip = Math.min(7, length);
  const baseX = x - dx * tip, baseY = y - dy * tip;
  const head = [[x, y], [baseX - dy * 3.4, baseY + dx * 3.4], [baseX + dy * 3.4, baseY - dx * 3.4]];
  return h('g', null, wire, h('polygon', {
    points: head.map(point => point.join(',')).join(' '), fill: INK, 'data-tutor-arrowhead': '',
  }));
}
