// The summary rule, with no dependencies so the control plane imports it too (explanation-summary.js): one rule on both sides.
// Owner 2026-11-08: a tile summary is one or two COMPLETE sentences that end in . ! or ? and fit in three lines at the tile's text width (480 px, about 68 characters a
// line at 14 px: 160 characters is 2.4 lines); it is never cut mid-sentence and never ends in an ellipsis. If a text has no whole sentence that fits, its first clause is
// kept (up to the last comma or semicolon before the cap) and closed with a full stop.
export const SUMMARY_CHARS = 160;
const MIN_CLAUSE = 40; // a clause shorter than this is not a summary of anything: cut at a word instead
const SENTENCES = 2;

const plainText = text => String(text ?? '')
  .replace(/```[\s\S]*?```/g, ' ').replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g, ' ')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/^[ \t]{0,3}#{1,6}[ \t].*$/gm, ' ').replace(/^[ \t]{0,3}>[ \t]?/gm, '').replace(/[*`]+/g, '').replace(/\s+/g, ' ').trim()
  .replace(/\s*(?:\.{2,}|…)\s*$/, ''); // a text that already trails off: the dots go, what is left is judged on its own

// Plain words for a collapsed preview: fences, maths and markup out, whitespace collapsed, then the first whole sentence or two that fit in `max`; else the first clause, closed with a full stop.
export function capSummary(text, max = SUMMARY_CHARS) {
  const plain = plainText(text);
  if (!plain) return '';
  const sentences = plain.match(/.+?[.!?](?=\s|$)|.+$/g).map(s => s.trim());
  let out = '';
  for (const s of sentences.slice(0, SENTENCES)) {
    if (!/[.!?]$/.test(s)) break; // an unfinished last sentence is never kept as it is
    const next = out ? `${out} ${s}` : s;
    if (next.length > max) break;
    out = next;
  }
  if (out) return out;
  const head = sentences[0].slice(0, max), at = Math.max(head.lastIndexOf(';'), head.lastIndexOf(','));
  // shortcut: a text with no comma or semicolon inside the cap is cut at a word, so its last clause can read short; the prompt asks for one whole sentence, so this is the rare path
  const clause = at >= MIN_CLAUSE ? head.slice(0, at) : head.slice(0, Math.max(head.lastIndexOf(' '), 0) || head.length);
  return `${clause.replace(/[\s,;:.!?]+$/, '')}.`;
}
