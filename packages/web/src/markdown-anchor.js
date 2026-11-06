// Fix C (T7): a quote the roadmap minted from the plan's passage is RAW Markdown (`## `, `**`, `[a](url)`, list bullets, table pipes), and the Markdown card shows RENDERED
// text (Md.jsx), which has none of that syntax, so the exact quote is never in it. This finds such a quote in the rendered text without guessing: both sides are folded the
// same canonical way and the match must be exact on the folded form, on word boundaries, with its context.
//   kept       letters and digits (lower case); the operators < > = + % and the like as themselves; a `-` before a digit; `.`, `,`, `:`, `/` between two digits (so `x > 50`
//              is not `x < 50`, and `1.5` is not `15`).
//   separator  every other character, collapsed to one: word and block boundaries survive, so `cat` is never found inside `concatenate`.
//   raw only   syntax Md.jsx does not draw is taken out first: link and image destinations `](...)`, ordered-list numbers, list bullets and blockquote markers at line start.
//              Anything else Md.jsx draws as text (an HTML tag, an entity, a code block's language and its Copy label) stays, and a passage that differs is reported missing.
// The rendered side is read as text segments with their block (rendered text concatenates adjacent blocks and table cells; the block change is the separator there).
// Pure: no DOM except textSegments, which only reads one.
const WORD = /[\p{L}\p{N}]/u;
const KEEP = new Set(['<', '>', '=', '+', '%', '±', '≤', '≥', '≠', '×', '÷', '−', '^']);
const BETWEEN_DIGITS = new Set(['.', ',', ':', '/']);
const DIGIT = /\p{N}/u;
const HIDDEN = new RegExp([
  String.raw`\]\((?:[^()\s]|\([^()]*\))*(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\)`, // link and image destination: ](url "title")
  String.raw`(?<=^[ \t]*)\d+[.)](?=[ \t])`, // ordered-list number (drawn by the list, not as text)
  String.raw`^(?:[ \t]*>)+`, // blockquote markers
  String.raw`(?<=^[ \t]*)[-*+](?=[ \t])`, // list bullet
].join('|'), 'gmu');

// -> { folded, at, ends }: one entry per UTF-16 unit of `folded`, with the offset (UTF-16 units) in the source text of the character it came from and the offset after it.
function fold(segments) {
  let folded = '';
  const at = [], ends = [];
  const separate = offset => { if (folded && !folded.endsWith(' ')) { folded += ' '; at.push(offset); ends.push(offset); } };
  let block;
  for (const { text, offset: base = 0, block: owner = null, skip = [] } of segments) {
    if (folded && owner !== block) separate(base);
    block = owner;
    let k = 0, offset = 0;
    const chars = [...text];
    chars.forEach((char, n) => {
      while (k < skip.length && skip[k][1] <= offset) k += 1;
      const hidden = k < skip.length && offset >= skip[k][0];
      const from = base + offset, to = from + char.length;
      if (!hidden) {
        const before = chars[n - 1] ?? '', after = chars[n + 1] ?? '';
        const kept = WORD.test(char) ? char.toLowerCase() : KEEP.has(char) || (char === '-' && DIGIT.test(after)) || (BETWEEN_DIGITS.has(char) && DIGIT.test(before) && DIGIT.test(after)) ? char : null;
        if (kept === null) separate(from);
        else for (let i = 0; i < kept.length; i += 1) { folded += kept[i]; at.push(from); ends.push(to); }
      }
      offset += char.length;
    });
  }
  return { folded, at, ends };
}
const trim = value => value.replace(/^ +| +$/g, '');
export const foldText = text => fold([{ text: String(text) }]);
export const foldMarkdown = raw => { const text = String(raw); return fold([{ text, skip: [...text.matchAll(HIDDEN)].map(m => [m.index, m.index + m[0].length]) }]); };

// A stored raw quote as the viewer matches it: each part folded with the raw rules, trimmed of separators at its edges.
export const foldedQuote = quote => (quote && typeof quote.exact === 'string'
  ? { exact: trim(foldMarkdown(quote.exact).folded), prefix: trim(foldMarkdown(quote.prefix || '').folded), suffix: trim(foldMarkdown(quote.suffix || '').folded) } : null);

// The text nodes of a drawn Markdown card, with their offsets in its textContent and the block each belongs to (browser only).
const BLOCKS = 'p,li,td,th,tr,h1,h2,h3,h4,h5,h6,pre,blockquote,dt,dd,figcaption,div';
export function textSegments(root) {
  const out = [], walker = root.ownerDocument.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  let offset = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) { out.push({ text: node.data, offset, block: node.parentElement?.closest(BLOCKS) || root }); offset += node.data.length; }
  return out;
}

// How much of the context next to a match must agree: the near part only (a quote's far context can begin inside syntax the fold cannot read whole).
const NEAR = 24;
// Where a folded quote sits in the drawn text (segments from textSegments, or a plain string): an exact folded match on word boundaries, and, whenever the quote has context,
// one whose near context agrees too - even when it is the only match. -> { status: 'resolved', start, end } (textContent offsets) | { status: 'ambiguous' | 'missing' }
export function resolveFolded(drawn, quote) {
  const exact = quote?.exact;
  if (typeof exact !== 'string' || !exact) return { status: 'missing' };
  const { folded, at, ends } = fold(typeof drawn === 'string' ? [{ text: drawn }] : drawn || []);
  const prefix = (quote.prefix || '').slice(-NEAR), suffix = (quote.suffix || '').slice(0, NEAR);
  const bounded = i => (i === 0 || folded[i - 1] === ' ') && (i + exact.length === folded.length || folded[i + exact.length] === ' ');
  const fits = i => (!prefix || trim(folded.slice(0, i)).endsWith(prefix)) && (!suffix || trim(folded.slice(i + exact.length)).startsWith(suffix));
  const found = [];
  for (let i = folded.indexOf(exact); i !== -1; i = folded.indexOf(exact, i + 1)) if (bounded(i)) found.push(i);
  if (!found.length) return { status: 'missing' };
  const one = found.filter(fits);
  if (one.length === 1) return { status: 'resolved', start: at[one[0]], end: ends[one[0] + exact.length - 1] };
  return { status: one.length > 1 || found.length > 1 ? 'ambiguous' : 'missing' };
}
