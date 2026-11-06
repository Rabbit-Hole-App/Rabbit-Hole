// Fix C part 3 (T7): a passage of a Markdown file, told apart in two texts that are not the same text.
//   RAW      the file as stored: offsets into it are what the planner, the grounding check and the minted reference name (a quote there carries `##`, `**`, `[a](url)`, pipes).
//   RENDERED what the file card shows (Md.jsx): `textContent` of the drawn nodes, with none of that syntax.
// Matching the raw quote against the rendered text fails on any heading, emphasis, link or table, and guessing around it ("fuzzy replace") would highlight the wrong place. So
// both texts are folded the same canonical way - letters and digits only, lower case, syntax the renderer does not draw taken out of the raw side first - and a passage is the
// run of folded characters, with the folded text either side for context. The fold remembers where each kept character was, so a match maps back to exact offsets in whichever
// text it was found in. Pure: no DOM, no React; the browser (FileDocMarkdown) and the control plane (roadmap-source-refs.js) share it.
//
// Not drawn by the renderer and so taken out of the raw side: link and image destinations, HTML tags and comments, character references, ordered-list numbers, reference
// definitions. Everything else the renderer draws (a code block also draws its language and a Copy button; typeset math draws twice) simply does not match: the passage
// is reported as not found, never found by position.
const WORD = /[\p{L}\p{N}]/u;
const HIDDEN = new RegExp([
  String.raw`\]\((?:[^()\s]|\([^()]*\))*(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\)`, // link and image destination: ](url "title")
  String.raw`<!--[\s\S]*?-->`, // comment
  String.raw`<\/?[A-Za-z][^>\n]*>`, // tag
  String.raw`&(?:[A-Za-z][A-Za-z0-9]*|#\d+|#[xX][0-9a-fA-F]+);`, // character reference
  String.raw`(?<=^[ \t]*)\d+[.)](?=[ \t])`, // ordered-list number (drawn by the list, not as text)
  String.raw`^[ \t]*\[[^\]\n]+\]:[ \t]*\S.*$`, // reference definition line
].join('|'), 'gmu');

// -> { folded, at, ends }: the kept characters, and for each its offset in `text` and the offset just after it. `skip`: [start, end) ranges not to keep.
function fold(text, skip = []) {
  let folded = '';
  const at = [], ends = [];
  let k = 0, offset = 0;
  for (const char of text) {
    while (k < skip.length && skip[k][1] <= offset) k += 1;
    const hidden = k < skip.length && offset >= skip[k][0];
    if (!hidden && WORD.test(char)) for (const unit of char.toLowerCase()) { folded += unit; at.push(offset); ends.push(offset + char.length); }
    offset += char.length;
  }
  return { folded, at, ends };
}
export const foldText = text => fold(String(text));
export function foldMarkdown(raw) {
  const text = String(raw), skip = [...text.matchAll(HIDDEN)].map(m => [m.index, m.index + m[0].length]);
  return fold(text, skip);
}

const CONTEXT = 100;
const lowest = (list, offset) => { let lo = 0, hi = list.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid] < offset) lo = mid + 1; else hi = mid; } return lo; };

// The rendered-side anchor of raw[start, end): the folded passage with the folded text either side - what a card's reference stores beside its raw quote and what the viewer
// matches. null when the passage holds no letter or digit (nothing the viewer could show).
export function anchorOfRange(raw, start, end, context = CONTEXT) {
  const { folded, at } = foldMarkdown(raw);
  const from = lowest(at, start), to = lowest(at, end);
  if (to <= from) return null;
  return { exact: folded.slice(from, to), prefix: folded.slice(Math.max(0, from - context), from), suffix: folded.slice(to, to + context) };
}

// Where `rendered` ({ exact, prefix, suffix }, folded) sits in the text the card shows, only when it can be told apart (the one occurrence, or the one whose context matches).
// -> { status: 'resolved', start, end } (offsets into `text`) | { status: 'ambiguous' | 'missing' }
export function resolveFolded(text, rendered) {
  const exact = rendered?.exact;
  if (typeof text !== 'string' || typeof exact !== 'string' || !exact) return { status: 'missing' };
  const { folded, at, ends } = foldText(text);
  const found = [];
  for (let i = folded.indexOf(exact); i !== -1; i = folded.indexOf(exact, i + 1)) found.push(i);
  if (!found.length) return { status: 'missing' };
  const prefix = typeof rendered.prefix === 'string' ? rendered.prefix : '', suffix = typeof rendered.suffix === 'string' ? rendered.suffix : '';
  const fits = i => folded.slice(Math.max(0, i - prefix.length), i) === prefix && folded.slice(i + exact.length, i + exact.length + suffix.length) === suffix;
  const one = found.length === 1 ? found : found.filter(fits);
  return one.length === 1 ? { status: 'resolved', start: at[one[0]], end: ends[one[0] + exact.length - 1] } : { status: 'ambiguous' };
}
