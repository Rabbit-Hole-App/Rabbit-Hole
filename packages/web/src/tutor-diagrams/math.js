import katex from 'katex';
import { tokenizeMath } from '../math-tokens.js';

// Maths in a diagram label: the card prose's delimiters ($...$, \(...\), $$...$$, \[...\]; tokenizeMath) typeset by KaTeX with MathText's
// options, HTML only (the svg is one image whose accessible name keeps the TeX, describeTutorDiagram). A formula KaTeX cannot parse
// throws here, so the label keeps its source text instead of KaTeX's red error.
const OPTIONS = { throwOnError: true, trust: false, maxSize: 10, maxExpand: 1000, strict: 'ignore', output: 'html' };
const KATEX_EM = 1.21; // katex.min.css: .katex { font-size: 1.21em }
const typeset = new Map();

// -> { html, width, height } in units of the label's font size, or null for TeX KaTeX refuses.
function set(tex) {
  if (!typeset.has(tex)) {
    if (typeset.size > 500) typeset.clear();
    let value = null;
    try {
      const html = katex.renderToString(tex, OPTIONS);
      // KaTeX writes each part's height + depth on its strut, and the depth as a negative vertical-align.
      let up = 0, down = 0;
      for (const [, total, depth = 0] of html.matchAll(/class="strut" style="height:([\d.]+)em;(?:vertical-align:-([\d.]+)em;)?/g)) {
        up = Math.max(up, total - depth);
        down = Math.max(down, Number(depth));
      }
      // One object per formula: React rewrites dangerouslySetInnerHTML whenever the object changes (MathText.jsx).
      value = { inner: { __html: html }, width: texWidth(tex) * KATEX_EM, height: (up + down) * KATEX_EM };
    } catch { /* not TeX KaTeX can set */ }
    typeset.set(tex, value);
  }
  return typeset.get(tex);
}

// A label with each formula replaced by a placeholder (\uE000n\uE001, as tokenizeMath writes them), so a formula is measured whole and
// never split. math[n]: { raw, set } where raw is the formula as written and set is null when KaTeX refuses it (drawn as raw text).
export function mathLabel(text) {
  const { source, math } = tokenizeMath(text);
  if (!math.length) return { source: String(text), math };
  // Labels are single-line (spec.js); a display formula's token comes wrapped in newlines.
  return { source: source.replace(/\n/g, ''), math: math.map(({ expression, raw }) => ({ raw, set: set(expression) })) };
}
export const SLOT = /\uE000(\d+)\uE001/u;

const GREEK = /^(?:var)?(?:alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega)$/i;
const NAMED = /^(?:sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|log|ln|lg|exp|lim|max|min|sup|inf|det|dim|deg|gcd|ker|arg|Pr)$/;
const LARGE = /^(?:sum|prod|coprod|int|iint|oint|bigcup|bigcap|bigoplus|bigotimes)$/;
const TEXT = /^(?:text(?:rm|bf|it|sf|tt)?|mbox|operatorname|mathrm|mathbf|mathit|mathsf|mathtt)$/;
const ZERO = /^(?:mathbb|mathcal|mathfrak|mathscr|boldsymbol|bm|hat|bar|vec|tilde|dot|ddot|check|breve|acute|grave|overline|underline|widehat|widetilde|overrightarrow|overleftarrow|displaystyle|textstyle|scriptstyle|scriptscriptstyle|limits|nolimits|big|Big|bigg|Bigg|bigl|bigr|Bigl|Bigr|middle)$/;
const SPACE = { ',': 0.17, ':': 0.22, '>': 0.22, ';': 0.28, ' ': 0.33, '!': 0, quad: 1, qquad: 2, '\\': 0 };

function glyph(char, text) {
  if (/\s/u.test(char)) return text ? 0.33 : 0;
  if (/[MW]/.test(char)) return 1.1;
  if (/[A-Z]/.test(char)) return 0.85;
  if (/[mw]/.test(char)) return 0.9;
  if (/[a-z]/.test(char)) return 0.62;
  if (/[0-9]/.test(char)) return 0.5;
  if (/[+\-=<>*]/.test(char)) return 1.35; // a binary operator or relation with its spacing
  if (/[()[\]|]/.test(char)) return 0.4;
  if (/[,;:]/.test(char)) return 0.85;
  if (/[.!'`]/.test(char)) return 0.3;
  if (char === '&') return 1;
  return char.codePointAt(0) > 0x7f ? 1.35 : 0.8;
}

// A generous width in KaTeX ems from the TeX source: the layout sizes boxes before a browser draws the formula, so the real width must
// never exceed it. A fraction takes its wider part, scripts are smaller, a command is one symbol.
function texWidth(tex) {
  let at = 0;
  const arg = text => {
    while (tex[at] === ' ') at += 1;
    return item(text);
  };
  function group(text) {
    let width = 0;
    while (at < tex.length && tex[at] !== '}') width += item(text);
    at += 1;
    return width;
  }
  function item(text) {
    const char = tex[at];
    at += 1;
    if (char === undefined || char === '}') return 0;
    if (char === '{') return group(text);
    if (char === '^' || char === '_') return 0.75 * arg(text);
    if (char !== '\\') return glyph(char, text);
    const name = tex.slice(at).match(/^(?:[A-Za-z]+|[\s\S])/)?.[0] ?? '';
    at += name.length;
    if (/^[dtc]?frac$|^[dt]?binom$/.test(name)) {
      const scale = name.startsWith('d') ? 1 : 0.75;
      return Math.max(arg(text), arg(text)) * scale + (name.endsWith('binom') ? 0.9 : 0.3);
    }
    if (name === 'sqrt') {
      let index = 0;
      if (tex[at] === '[') {
        const end = tex.indexOf(']', at);
        index = end < 0 ? 0 : 0.6 * texWidth(tex.slice(at + 1, end));
        at = end < 0 ? tex.length : end + 1;
      }
      return arg(text) + 1 + index;
    }
    if (name === 'begin' || name === 'end') {
      at = tex.includes('}', at) ? tex.indexOf('}', at) + 1 : tex.length;
      return 0;
    }
    if (name === 'left' || name === 'right') return 0.2;
    if (TEXT.test(name)) return arg(true);
    if (ZERO.test(name)) return 0;
    if (name in SPACE) return SPACE[name];
    if (GREEK.test(name)) return 0.85;
    if (NAMED.test(name)) return 0.55 * name.length + 0.35;
    if (LARGE.test(name)) return 1.4;
    return name.length === 1 ? 0.8 : 1.6; // an escaped character, or a symbol such as \to, \cdot or \infty with its spacing
  }
  let width = 0;
  while (at < tex.length) width += item(false);
  return width;
}
