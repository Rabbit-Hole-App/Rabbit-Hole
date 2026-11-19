// An inline \frac in card prose is squeezed to the line height (KaTeX draws it in text style: tiny numerator and denominator), so the
// softmax sentence is unreadable. Inline maths only (Md.jsx; display maths keeps its stack): a top-level \frac{a}{b}, \dfrac and \tfrac
// are written a/b, an argument that is more than one symbol in brackets, and nested fractions recursively. A fraction inside braces
// (\sqrt{...}, an exponent, \text{...}) or right after ^ or _ stays as KaTeX draws it. Import-free.
const FRAC = /^\\[dt]?frac(?![A-Za-z])/;
// The balanced {...} group starting at i (after spaces): [content, index after it], or null.
function group(tex, i) {
  while (tex[i] === ' ') i++;
  if (tex[i] !== '{') return null;
  for (let depth = 0, j = i; j < tex.length; j++) {
    if (tex[j] === '\\') { j++; continue; }
    if (tex[j] === '{') depth++;
    else if (tex[j] === '}' && --depth === 0) return [tex.slice(i + 1, j), j + 1];
  }
  return null;
}
// One symbol reads without brackets: a number, a letter or \command, optionally with ^/_ groups (e^{z_i}, p_i, x^2), or one function
// call (a \command and one bracketed group with no brackets inside: \max(a, b)).
const ATOM = /^(?:(?:\d+(?:\.\d+)?|[A-Za-z]|\\[A-Za-z]+)(?:[_^](?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|[A-Za-z0-9]))*|\\[A-Za-z]+\([^()]*\))$/;
const arg = s => { const t = slashFractions(s).trim(); return ATOM.test(t) ? t : `(${t})`; };

export function slashFractions(tex) {
  let out = '', depth = 0;
  for (let i = 0; i < tex.length; i++) {
    const c = tex[i];
    if (c === '\\') {
      const head = tex.slice(i).match(FRAC);
      const num = head && depth === 0 && !/[_^]\s*$/.test(out) ? group(tex, i + head[0].length) : null;
      const den = num && group(tex, num[1]);
      if (den) { out += `${arg(num[0])}/${arg(den[0])}`; i = den[1] - 1; continue; }
      out += c + (tex[i + 1] ?? ''); i++; continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    out += c;
  }
  return out;
}
