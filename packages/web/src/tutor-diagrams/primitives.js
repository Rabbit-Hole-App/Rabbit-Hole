import { createElement as h } from 'react';
import { mathLabel, SLOT } from './math.js';

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
// E3: the one fixed style of a highlighted worked route (a diagram author picks no colour): a blue wire and a blue ring, the approved card 07 look.
export const PATH = '#2F80D8';
export const SURFACE = 'var(--viz-surface, #fbfbfa)';
export const INK = 'var(--color-ink, #32211c)';
export const MUTED = 'var(--color-ink-2, #665951)';
const FILLED_INK = '#32211c';

export const lineHeight = (size = 14) => Math.ceil(size * 1.25);

function plainWidth(text, size) {
  let width = 0;
  for (const char of text) {
    if (/^[ .,:;!ilI'|’]$/u.test(char)) width += 0.38;
    else if (/^[MW@%&#mw]$/u.test(char)) width += 0.94;
    else if (char.codePointAt(0) > 0x2ff) width += 1.03;
    else width += 0.68;
  }
  return width * size;
}

// A formula is drawn no taller than the line it sits on (so no layout's line count changes), and is measured at that scale.
const mathScale = (set, size) => Math.min(1, lineHeight(size) / (set.height * size));
const runWidth = ({ raw, set }, size) => set ? set.width * size * mathScale(set, size) : plainWidth(raw, size);
const measure = ({ source, math }, size) => source.split(SLOT)
  .reduce((width, part, index) => width + (index % 2 ? runWidth(math[part], size) : plainWidth(part, size)), 0);

export function textWidth(text, size = 14) {
  return measure(mathLabel(text), size);
}

// The widest formula in a label (0 without one): the narrowest a box can be, since a formula never wraps.
export function widestFormula(text, size = 14) {
  return Math.max(0, ...mathLabel(text).math.filter(run => run.set).map(run => runWidth(run, size)));
}

function wordParts(word) {
  return word.split(/(?<=[\p{L}\p{N}][-‐])(?=[\p{L}\p{N}])/u);
}

// The words of a label, split at whitespace outside its formulas.
export function words(text) {
  const { source, math } = mathLabel(text);
  return source.split(/\s+/u).map(word => restore(word, math));
}
const restore = (value, math) => value.replace(new RegExp(SLOT, 'gu'), (_, index) => math[index].raw);

export function longestWordWidth(text, size = 14) {
  const { source, math } = mathLabel(text);
  return Math.max(...source.trim().split(/\s+/u).flatMap(wordParts).map(part => measure({ source: part, math }, size)));
}

export function wrap(text, width, size = 14) {
  const { source, math } = mathLabel(text);
  const fits = value => measure({ source: value, math }, size) <= width;
  const lines = [];
  let line = '';
  for (const word of source.trim().split(/\s+/u)) {
    const joined = line ? `${line} ${word}` : word;
    if (fits(joined)) {
      line = joined;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const part of wordParts(word)) {
      if (line && !fits(line + part)) {
        lines.push(line);
        line = '';
      }
      // Long identifiers and unspaced scripts still need a bounded line; a formula is one unit.
      for (const char of part.match(/\uE000\d+\uE001|[\s\S]/gu)) {
        if (line && !fits(line + char)) {
          lines.push(line);
          line = '';
        }
        line += char;
      }
    }
  }
  if (line) lines.push(line);
  return lines.map(value => restore(value, math));
}

const JUSTIFY = { start: 'flex-start', middle: 'center', end: 'flex-end' };

// A line holding a formula is HTML in a foreignObject as wide as the line was measured, centred on the line like a tspan: the text keeps
// the label's font, each formula is KaTeX's markup at the line's scale. data-tutor-tex keeps the formula as written for the card's text
// alignment (explanation-interactions.js).
function mathLine({ source, math }, x, y, { size, weight, anchor, fill, step }) {
  const width = Math.ceil(measure({ source, math }, size)) + 2;
  const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
  const runs = source.split(SLOT).map((part, index) => {
    if (!(index % 2)) return part;
    const { raw, set } = math[part];
    return set ? h('span', { 'data-tutor-tex': raw, style: { fontSize: size * mathScale(set, size), lineHeight: 'normal' }, dangerouslySetInnerHTML: set.inner }) : raw;
  });
  return h('foreignObject', { x: left, y: y - step / 2, width, height: step, overflow: 'visible' },
    h('div', { style: {
      display: 'flex', alignItems: 'center', justifyContent: JUSTIFY[anchor], height: '100%', whiteSpace: 'pre',
      color: fill, fontSize: size, fontWeight: weight, lineHeight: `${step}px`,
    } }, ...runs));
}

export function label(lines, x, y, { size = 14, weight = 400, anchor = 'middle', tone = 'ink',
  fill = tone === 'onFill' ? FILLED_INK : tone === 'muted' ? MUTED : INK } = {}) {
  const values = Array.isArray(lines) ? lines : [lines];
  const step = lineHeight(size);
  const center = index => y + (index - (values.length - 1) / 2) * step;
  const typeset = values.map(value => mathLabel(value)).map(parsed => parsed.math.some(run => run.set) ? parsed : null);
  const plain = values.flatMap((value, index) => typeset[index] ? [] : [h('tspan', { x, y: center(index) + size * 0.34 }, value)]);
  const text = h('text', { x, y, fill, fontSize: size, fontWeight: weight, textAnchor: anchor }, ...plain);
  if (!typeset.some(Boolean)) return text;
  return h('g', null, plain.length ? text : null,
    ...typeset.flatMap((parsed, index) => parsed ? [mathLine(parsed, x, center(index), { size, weight, anchor, fill, step })] : []));
}

export function box(x, y, width, height, { role = 'plain', radius = 7, active = false } = {}) {
  return h('rect', {
    x, y, width, height, rx: radius,
    fill: PALETTE[role] ?? SURFACE,
    stroke: active ? PATH : role === 'plain' ? INK : FILLED_INK, strokeWidth: active ? 3.5 : 1.5,
  });
}

export function diamond(x, y, width, height, { active = false } = {}) {
  const points = [[x + width / 2, y], [x + width, y + height / 2],
    [x + width / 2, y + height], [x, y + height / 2]];
  return h('polygon', {
    points: points.map(point => point.join(',')).join(' '),
    fill: PALETTE.decision, stroke: active ? PATH : FILLED_INK, strokeWidth: active ? 3.5 : 1.5, strokeLinejoin: 'round',
  });
}

export function dot(x, y, r, role = 'outcome') {
  return h('circle', { cx: x, cy: y, r, fill: PALETTE[role] ?? SURFACE, stroke: FILLED_INK, strokeWidth: 1.3 });
}

export function connector(points, { arrow = true, dashed = false, path = false } = {}) {
  const wire = h('polyline', {
    points: points.map(point => point.join(',')).join(' '), fill: 'none', stroke: path ? PATH : dashed ? MUTED : INK,
    strokeWidth: path ? 3 : dashed ? 1 : 1.5, strokeDasharray: dashed ? '4 4' : undefined,
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
    points: head.map(point => point.join(',')).join(' '), fill: path ? PATH : INK, 'data-tutor-arrowhead': '',
  }));
}
