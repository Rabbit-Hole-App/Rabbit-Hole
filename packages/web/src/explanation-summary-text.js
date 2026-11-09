// The summary cap, with no dependencies so the control plane imports it too (explanation-summary.js): one rule on both sides.
export const SUMMARY_CHARS = 220;
const MIN_SENTENCE = 40; // a first sentence shorter than this is not a summary of anything: cut at a word instead

// Plain words for a collapsed preview: fences, maths and markup out, whitespace collapsed, then cut to `max` at the last sentence end inside it, else at a word.
export function capSummary(text, max = SUMMARY_CHARS) {
  const plain = String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ').replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]{0,3}#{1,6}[ \t].*$/gm, ' ').replace(/^[ \t]{0,3}>[ \t]?/gm, '').replace(/[*`]+/g, '').replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  let cut = -1;
  for (const stop of plain.slice(0, max + 1).matchAll(/[.!?](?=\s|$)/g)) cut = stop.index + 1;
  if (cut >= MIN_SENTENCE) return plain.slice(0, cut);
  const head = plain.slice(0, max), space = head.lastIndexOf(' ');
  return (space > 0 ? head.slice(0, space) : head).replace(/[\s,;:]+$/, '');
}
