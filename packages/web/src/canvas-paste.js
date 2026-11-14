// What Ctrl+V on the canvas pastes (AdaptiveCanvas.jsx paste handler). An image from anywhere becomes an image card;
// the canvas's own copied cards paste only while the clipboard still holds their marker, so text copied elsewhere
// afterwards wins; code (`code`: copied from a Files reader, or looksLikeCode) asks Code card or Jupyter notebook first
// (docs/features/repository-browser.md "Files in Learn"); other text becomes a text card. `marker` is CARDS_COPIED, `copying` the in-flight marker write.
// `url` (the canvas offers webpage cards): text that is one http(s) URL asks Paste as text or Add webpage card first.
export function pasteKind({ images = 0, text = '', marker, copying = false, cards = 0, code = false, url = false, rich = false }) {
  const ours = text === marker;
  if (images && !copying && !ours) return 'image';
  if (cards && (ours || copying || !text.trim())) return 'cards';
  if (url && isWebUrl(text)) return 'url';
  // `rich` (an editable canvas): Mermaid source becomes a Mermaid card, one $$...$$ equation an equation card (owner 2026-11-14).
  if (text.trim() && !ours) return rich && mermaidOf(text) ? 'mermaid' : rich && equationOf(text) ? 'equation' : code ? 'code' : 'text';
  return null;
}

// Mermaid source: the first real line is a diagram header and there are at least two lines, so one English line ("Timeline of events")
// is never a diagram. A ```mermaid fence around it is dropped. Returns the source, or null.
// ponytail: header words only, no parse; a diagram Mermaid cannot draw shows its own error in the card.
const MERMAID_HEAD = /^(?:(?:graph|flowchart)\s+(?:TD|TB|BT|RL|LR)\b.*|sequenceDiagram|classDiagram(?:-v2)?|stateDiagram(?:-v2)?|erDiagram|gitGraph.*|quadrantChart|requirementDiagram|(?:pie|journey|mindmap|timeline|gantt)(?:\s+(?:showData|title\b.*|dateFormat\b.*))?)$/;
export function mermaidOf(text) {
  let body = String(text || '').replace(/\r\n?/g, '\n').trim();
  const fence = body.match(/^```\s*mermaid\s*\n([\s\S]*?)\n?```$/i);
  if (fence) body = fence[1].trim();
  const lines = body.split('\n').filter(line => line.trim() && !line.trim().startsWith('%%'));
  return lines.length >= 2 && MERMAID_HEAD.test(lines[0].trim()) ? body : null;
}

// Exactly one display equation, $$...$$ or \[...\] (what an equation's Copy button writes): its LaTeX, or null.
export function equationOf(text) {
  const found = String(text || '').trim().match(/^\$\$([\s\S]+?)\$\$$|^\\\[([\s\S]+?)\\\]$/);
  const latex = ((found && (found[1] ?? found[2])) || '').trim();
  return latex && !latex.includes('$$') ? latex : null;
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

// One http(s) URL and nothing else (no whitespace inside once trimmed): the only paste that offers a webpage card.
export function isWebUrl(text) {
  const value = String(text || '').trim();
  if (!value || /\s/.test(value) || !/^https?:\/\//i.test(value)) return false;
  try { const url = new URL(value); return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname; } catch { return false; }
}
