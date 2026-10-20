// Where an excerpt sits on its PDF page (pdf-excerpts contract, "Coordinates"): rects in the page's PDF user space, in points,
// [x1, y1, x2, y2] with x1<x2, y1<y2. They do not change with zoom, panel width or display rotation; a pdf.js viewport maps
// them to its pixels and back (convertToViewportPoint / convertToPdfPoint; this pdf.js has no convertToViewportRectangle).
export const MAX_RECTS = 64, EXCERPT_LIMIT = 8000;
const CONTEXT = 32;

const norm = ([a, b, c, d]) => [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
const union = (a, b) => (a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b);
// Viewport pixels -> PDF points, and back. Two opposite corners are enough: every rotation pdf.js allows is a multiple of 90.
export const toPdfRect = (rect, viewport) => norm([...viewport.convertToPdfPoint(rect[0], rect[1]), ...viewport.convertToPdfPoint(rect[2], rect[3])]);
export const toViewportRect = (rect, viewport) => norm([...viewport.convertToViewportPoint(rect[0], rect[1]), ...viewport.convertToViewportPoint(rect[2], rect[3])]);
// A stored anchor's rects on this viewport, as fractions of the page box, so CSS percentages follow zoom and resize.
export const toViewport = (anchor, viewport) => (anchor?.rects || []).map(rect => {
  const [x1, y1, x2, y2] = toViewportRect(rect, viewport);
  return { left: x1 / viewport.width, top: y1 / viewport.height, width: (x2 - x1) / viewport.width, height: (y2 - y1) / viewport.height };
});
export const regionAnchor = (rect, viewport) => ({ rects: [toPdfRect(rect, viewport)] });

// Line boxes of the selected text pieces (DOM order), in PDF space, and the verbatim text: a new line where a piece leaves the
// previous line's vertical band, a paragraph break (\n\n) where the blank space above a line is over 0.7 line heights.
// Lines join with a space (none after a hyphen or existing whitespace). Pure, so it is tested without a DOM.
export function assemble(pieces) {
  let exact = '', line = null;
  const lines = [];
  for (const { text, rect } of pieces) {
    if (!text) continue;
    const mid = (rect[1] + rect[3]) / 2;
    if (line && mid >= line.rect[1] && mid <= line.rect[3]) { exact += text; line.rect = union(line.rect, rect); line.end = exact.length; continue; }
    if (line) {
      const height = line.rect[3] - line.rect[1], gap = line.rect[1] - rect[3];
      exact += gap > 0.7 * height ? '\n\n' : /[\s-]$/.test(exact) ? '' : ' ';
    }
    line = { start: exact.length, end: exact.length + text.length, rect };
    exact += text;
    lines.push(line);
  }
  return { exact, lines };
}

// At most `max` rects (the server's limit): consecutive line boxes merge in even groups.
export function capRects(rects, max = MAX_RECTS) {
  if (rects.length <= max) return rects;
  const size = Math.ceil(rects.length / max), out = [];
  for (let at = 0; at < rects.length; at += size) out.push(rects.slice(at, at + size).reduce(union, null));
  return out;
}
// The line boxes of characters [start, end) of an assembled selection.
export const rectsFor = (lines, start, end) => capRects(lines.filter(line => line.start < end && line.end > start).map(line => line.rect));

// [start, end) offsets cutting `text` into parts of at most `limit` characters, every character kept in order: at the last
// paragraph break in reach, else the last sentence end, else the last space, else exactly at the limit.
export function splitText(text, limit = EXCERPT_LIMIT) {
  const parts = [];
  for (let start = 0; start < text.length;) {
    if (text.length - start <= limit) { parts.push([start, text.length]); break; }
    const window = text.slice(start, start + limit);
    const cut = [/\n\n+/g, /[.!?]["')\]]*\s+/g, /\s+/g].map(pattern => {
      let end = -1;
      for (const match of window.matchAll(pattern)) if (match.index > 0) end = match.index + match[0].length;
      return end;
    }).find(end => end > limit / 4);
    const end = start + (cut || limit);
    parts.push([start, end]);
    start = end;
  }
  return parts;
}

// The text selected on one page: its line boxes and verbatim quote, or { error } for a selection that leaves the page's text.
// `layer` is the page's text layer, `box` the element the viewport is drawn into (the page canvas).
export function textAnchor(range, layer, viewport, box = layer) {
  if (!range || range.collapsed) return { error: 'empty' };
  if (!layer.contains(range.startContainer) || !layer.contains(range.endContainer)) return { error: 'page' };
  const bounds = box.getBoundingClientRect(), sx = viewport.width / bounds.width, sy = viewport.height / bounds.height;
  const pdfRect = r => toPdfRect([(r.left - bounds.left) * sx, (r.top - bounds.top) * sy, (r.right - bounds.left) * sx, (r.bottom - bounds.top) * sy], viewport);
  const pieces = [], walker = layer.ownerDocument.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!range.intersectsNode(node)) continue;
    const from = node === range.startContainer ? range.startOffset : 0, to = node === range.endContainer ? range.endOffset : node.data.length;
    const text = node.data.slice(from, to);
    if (!text) continue;
    const part = layer.ownerDocument.createRange(); part.setStart(node, from); part.setEnd(node, to);
    const rects = [...part.getClientRects()].filter(r => r.width > 0 && r.height > 0);
    if (rects.length) pieces.push({ text, rect: rects.map(pdfRect).reduce(union, null) });
  }
  const { exact, lines } = assemble(pieces);
  if (!exact.trim()) return { error: 'empty' };
  const before = layer.ownerDocument.createRange(); before.setStart(layer, 0); before.setEnd(range.startContainer, range.startOffset);
  const at = before.toString().length, content = layer.textContent, length = range.toString().length;
  return { exact, lines, rects: capRects(lines.map(line => line.rect)),
    quote: { exact, prefix: content.slice(Math.max(0, at - CONTEXT), at), suffix: content.slice(at + length, at + length + CONTEXT) } };
}
