import { createElement as h } from 'react';
import { mathLabel, SLOT } from './math.js';
import { tokenizeMath } from '../math-tokens.js';

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

const MIN_SIZE = 9;
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;

function wordParts(word) {
  return word.split(/(?<=[\p{L}\p{N}][-‐])(?=[\p{L}\p{N}])|(?<=\p{L}:)(?=\p{L})/u);
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

// Lines wrap at whitespace only (and after a hyphen or colon); a word is never split across lines (owner rule 2026-11-12, "Predicte / d").
// A single word wider than its box first costs the label one font step: the lines come back wrapped at size - 1 with fontSize set, and label()
// draws them at that size. Only a word that still does not fit overflows its box, whole.
function fitLines(parsed, width, size) {
  // A formula line is one unit and already scaled to its line: only plain-text lines that are too wide cost the font a step.
  const tooWide = (value, at) => { const line = mathLabel(value); return !line.math.length && measure(line, at) > width; };
  let at = size, lines = wrapLabel(parsed, width, at);
  while (at > MIN_SIZE && lines.some(value => tooWide(value, at))) lines = wrapLabel(parsed, width, --at);
  if (at !== size) lines.fontSize = at;
  return lines;
}

export function wrap(text, width, size = 14) {
  return fitLines(mathLabel(text), width, size);
}

function wrapLabel({ source, math }, width, size) {
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
      // Only scripts written without spaces, and tokens with no letters (long numbers), break between characters; every other word stays whole (a formula is one unit).
      if (/\p{L}/u.test(part) && !UNSPACED.test(part) && !part.includes('')) { line += part; continue; }
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
const XHTML = 'http://www.w3.org/1999/xhtml';

// A line holding a formula is HTML in a foreignObject as wide as the line was measured, centred on the line like a tspan: the text keeps
// the label's font, each formula is KaTeX's markup at the line's scale. data-tutor-tex keeps the formula as written for the card's text
// alignment (explanation-interactions.js).
function mathLine({ source, math }, x, y, { size, weight, anchor, fill, step, xhtml }) {
  const width = Math.ceil(measure({ source, math }, size)) + 2;
  const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
  const runs = source.split(SLOT).map((part, index) => {
    if (!(index % 2)) return part;
    const { raw, set } = math[part];
    return set ? h('span', { 'data-tutor-tex': raw, style: { fontSize: size * mathScale(set, size), lineHeight: 'normal' }, dangerouslySetInnerHTML: set.inner }) : raw;
  });
  return h('foreignObject', { x: left, y: y - step / 2, width, height: step, overflow: 'visible' },
    h('div', { ...(xhtml ? { xmlns: XHTML } : {}), style: {
      display: 'flex', alignItems: 'center', justifyContent: JUSTIFY[anchor], height: '100%', whiteSpace: 'pre',
      color: fill, fontSize: size, fontWeight: weight, lineHeight: `${step}px`,
    } }, ...runs));
}

function svgLabel(values, x, y, { size, weight, anchor, fill }) {
  const step = lineHeight(size);
  const plain = values.flatMap((value, index) => value === null ? []
    : [h('tspan', { x, y: y + (index - (values.length - 1) / 2) * step + size * 0.34 }, value)]);
  return h('text', { x, y, fill, fontSize: size, fontWeight: weight, textAnchor: anchor }, ...plain);
}

export function label(lines, x, y, { size: requested = 14, weight = 400, anchor = 'middle', tone = 'ink',
  fill = tone === 'onFill' ? FILLED_INK : tone === 'muted' ? MUTED : INK, xhtml = false, fallback = true } = {}) {
  const size = lines?.fontSize ?? requested; // wrap() sets fontSize when a word needed the font one step smaller
  const values = Array.isArray(lines) ? lines : [lines];
  const step = lineHeight(size);
  const center = index => y + (index - (values.length - 1) / 2) * step;
  const typeset = values.map(value => mathLabel(value)).map(parsed => parsed.math.some(run => run.set) ? parsed : null);
  if (!typeset.some(Boolean)) return svgLabel(values, x, y, { size, weight, anchor, fill });
  const plain = values.map((value, index) => typeset[index] ? null : value);
  const typesetGroup = h('g', null, plain.some(value => value !== null) ? svgLabel(plain, x, y, { size, weight, anchor, fill }) : null,
    ...typeset.flatMap((parsed, index) => parsed ? [mathLine(parsed, x, center(index), { size, weight, anchor, fill, step, xhtml })] : []));
  if (!fallback) return typesetGroup;
  // A viewer that cannot draw the XHTML formula (a standalone SVG, a raster preview) shows the label as readable text instead of dropping it.
  return h('switch', null, h('g', { requiredExtensions: XHTML }, typesetGroup),
    h('g', { 'data-explanation-skip': '' }, svgLabel(values.map(nativeLine), x, y, { size, weight, anchor, fill })));
}

// A formula is one unbreakable run. Reserve its width before wrapping the caption.
export function fitCaption(scene, caption, gutter, size) {
  if (!caption) return scene;
  const width = Math.ceil(widestFormula(caption, size)) + gutter;
  if (width <= scene.width) return scene;
  return { ...scene, width, elements: [h('g', { transform: `translate(${(width - scene.width) / 2} 0)` }, ...scene.elements)] };
}

const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', x: 'ₓ' };
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ' };
const SYMBOLS = { le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', equiv: '≡', sim: '∼', propto: '∝', ll: '≪', gg: '≫', pm: '±', mp: '∓',
  times: '×', div: '÷', cdot: '·', circ: '∘', cdots: '⋯', ldots: '⋯', quad: ' ', qquad: ' ', in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', cup: '∪', cap: '∩', emptyset: '∅',
  forall: '∀', exists: '∃', neg: '¬', land: '∧', lor: '∨', mid: '|', perp: '⊥', top: '⊤', angle: '∠', langle: '⟨', rangle: '⟩', lbrace: '{', rbrace: '}', left: '', right: '',
  sum: 'Σ', prod: '∏', int: '∫', infty: '∞', partial: '∂', nabla: '∇', to: '→', rightarrow: '→', leftarrow: '←', gets: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', mapsto: '↦',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω', ell: 'ℓ', hat: '', bar: '' };
// Operator names stay as words, set apart from what precedes them like the typeset form: p\log_2 p reads "p log₂ p".
const OPERATORS = new Set(['log', 'ln', 'lg', 'exp', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh', 'max', 'min', 'argmax', 'argmin', 'sup', 'inf', 'lim', 'det', 'gcd', 'Pr']);
// Unicode forms only when every character has one and no two letters touch: n+1 and 2 become ⁿ⁺¹ forms, but a word stays _parent (small letters in a row do not read).
const script = (text, table) => text && !/\p{L}{2}/u.test(text) && [...text].every(char => table[char]) ? [...text].map(char => table[char]).join('') : null;

// Readable plain text for a formula where the typeset HTML cannot be drawn (a standalone SVG viewer, a raster preview): no backslashes, braces or
// markup are left in it. Subscripts and exponents use Unicode forms when every character has one, otherwise a plain _x / ^x.
export function plainMath(expression) {
  let text = expression;
  const group = '(?:\\{([^{}]*)\\}|([A-Za-z0-9]))';
  text = text.replace(/\\(?:mathrm|text|mathbf|operatorname)\{([^{}]*)\}/gu, '$1');
  text = text.replace(/\\bar\s*\{?([A-Za-z])\}?/gu, '$1\u0305').replace(/\\hat\s*\{?([A-Za-z])\}?/gu, '$1\u0302');
  text = text.replace(new RegExp('_' + group, 'gu'), (_, braced, single) => { const value = braced ?? single; return script(value, SUB) ?? '_' + value; });
  text = text.replace(new RegExp('\\^' + group, 'gu'), (_, braced, single) => { const value = braced ?? single; return script(value, SUP) ?? (value.length > 1 ? `^(${value})` : '^' + value); });
  const part = value => /^[\p{L}\p{N}.\u0300-\u036f]+$/u.test(value) ? value : `(${value})`;
  for (let pass = 0; pass < 3; pass++) text = text.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/gu, (_, top, bottom) => `${part(top.trim())}/${part(bottom.trim())}`);
  text = text.replace(/\\sqrt\s*\{([^{}]*)\}/gu, '√($1)');
  text = text.replace(/\\([A-Za-z]+)/gu, (_, name, at, whole) => SYMBOLS[name] ?? (OPERATORS.has(name) && at > 0 && !/[\s([]/u.test(whole[at - 1]) ? ' ' + name : name));
  return text.replace(/[{}]/gu, '').replace(/\\,|\\;|\\!/gu, ' ').replace(/\s+/gu, ' ').trim();
}

// The label's text with each formula written out by plainMath, one string per line.
function nativeLine(value) {
  const parsed = mathLabel(value), { math } = tokenizeMath(value);
  return parsed.source.replace(new RegExp(SLOT, 'gu'), (_, index) => parsed.math[index].set ? plainMath(math[index].expression) : parsed.math[index].raw);
}

export function layoutCaption(text, width, size = 13) {
  if (!text) return { height: 0 };
  const parsed = mathLabel(text);
  const lines = fitLines(parsed, width, size);
  const hasMath = parsed.math.some(run => run.set);
  let fallback = [];
  if (hasMath) {
    const { math } = tokenizeMath(text);
    const source = parsed.source.replace(new RegExp(SLOT, 'gu'), (_, index) =>
      parsed.math[index].set ? plainMath(math[index].expression) : math[index].raw);
    fallback = wrapLabel({ source, math: [] }, width, size);
  }
  return {
    height: Math.max(lines.length, fallback.length) * lineHeight(size),
    draw(x, y) {
      const primary = label(lines, x, y, { size, tone: 'muted', xhtml: hasMath, fallback: false });
      if (!hasMath) return primary;
      // Standalone SVG viewers without XHTML can show the entire caption as native text.
      return h('switch', null, h('g', { requiredExtensions: XHTML }, primary),
        h('g', { 'data-explanation-skip': '' }, svgLabel(fallback, x, y, { size, weight: 400, anchor: 'middle', fill: MUTED })));
    },
  };
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
