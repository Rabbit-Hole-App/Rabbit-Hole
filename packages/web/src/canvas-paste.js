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
  // The source is returned exactly as copied (no trim, no line-ending change); only a ```mermaid fence around it is dropped.
  const raw = String(text || '');
  const fence = raw.trim().match(/^```\s*mermaid\s*\r?\n([\s\S]*?)\r?\n?```$/i);
  const body = fence ? fence[1] : raw;
  const lines = body.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('%%'));
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

// Where the canvas's own copied cards land when pasted at a pointer point `at` (world coordinates; owner 2026-11-14): the copies' top-left corner on the point,
// their layout kept. `move`: the distance notes, text, equations and marks move. Cards sit in a column, so they go in at `index` (the slot at that height) with
// `shift` added to their offsets: the slot is where the card now at that index is drawn less its own offset (else just below the last card), and the first copy is
// drawn where its source sat in the selection, measured from its top-left corner. `shift` is null when no slot is measured (the caller keeps its step).
// `bounds`: drawn boxes by id. Returns null when nothing copied has a position.
export function pasteTarget({ at, blocks = [], chats = [], items = [], shapes = [], list = [], bounds = {}, index = 0 }) {
  const boxes = [...blocks, ...chats].map(node => bounds[node.id]).filter(Boolean);
  const xs = [...boxes.map(box => box.x), ...items.map(item => item.x), ...shapes.map(shape => Math.min(shape.x1, shape.x2))];
  const ys = [...boxes.map(box => box.y), ...items.map(item => item.y), ...shapes.map(shape => Math.min(shape.y1, shape.y2))];
  if (!xs.length) return null;
  const left = Math.min(...xs), top = Math.min(...ys), move = { x: at.x - left, y: at.y - top };
  const first = blocks[0], next = list[index], last = list[list.length - 1];
  const box = next && bounds[next.id], tail = !next && last && bounds[last.id];
  const slot = box ? { x: box.x - (next.dx || 0), y: box.y - (next.dy || 0) } : tail ? { x: tail.x - (last.dx || 0), y: tail.y + tail.h - (last.dy || 0) + 24 } : null;
  const firstBox = first && bounds[first.id];
  const shift = firstBox && slot ? { x: at.x + (firstBox.x - left) - slot.x - (first.dx || 0), y: at.y + (firstBox.y - top) - slot.y - (first.dy || 0) } : null;
  return { move, index, shift };
}
