// What Ctrl+V on the canvas pastes (AdaptiveCanvas.jsx paste handler). An image from anywhere becomes an image card;
// the canvas's own copied cards paste only while the clipboard still holds their marker, so text copied elsewhere
// afterwards wins; code (`code`: copied from a Files reader, or looksLikeCode) asks Code card or Jupyter notebook first
// (docs/features/repository-browser.md "Files in Learn"); other text becomes a text card. `marker` is CARDS_COPIED, `copying` the in-flight marker write.
export function pasteKind({ images = 0, text = '', marker, copying = false, cards = 0, code = false }) {
  const ours = text === marker;
  if (images && !copying && !ours) return 'image';
  if (cards && (ours || copying || !text.trim())) return 'cards';
  if (text.trim() && !ours) return code ? 'code' : 'text';
  return null;
}

// Whether pasted text is code, when it did not come from a Files reader (those always are). Conservative: two or more
// non-blank lines, and at least 60% of them read as code - a keyword opening a statement, a decorator, a brace, or a line
// ending in ; { } or ): - so prose, lists and a single line paste as text, as before.
// ponytail: a line-shape heuristic, no parser and no model; tune CODE_LINE or the 60% share if real pastes misfile.
const CODE_LINE = /^\s*(def |class |import |from [\w.]+ import |return\b|elif\b|else\s*[:{]|try\s*[:{]|except\b|finally\s*:|with .*:\s*$|for .*[:{]\s*$|while .*[:{]\s*$|if .*[:{]\s*$|function\b|const |let |var |export |#include|@\w|[{}])|[;{}]\s*$|\)\s*:\s*$/;
export function looksLikeCode(text) {
  const lines = String(text || '').split('\n').filter(line => line.trim());
  if (lines.length < 2) return false;
  return lines.filter(line => CODE_LINE.test(line)).length / lines.length >= 0.6;
}
