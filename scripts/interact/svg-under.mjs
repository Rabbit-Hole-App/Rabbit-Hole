// Brief 36: what a rectangle lies over in a picture the written renderer drew. Reads the picture's SVG markup (renderToStaticMarkup of renderTutorDiagram's element), follows the groups' translate(), and returns
// every text, rectangle, line, path, polygon and circle whose bounding box meets the region, with its kind and box. Texts are measured with the renderer's own width model (textWidth, passed in).
// shortcut: a path is boxed by every number pair in its d (a curve's control points count), enough to say "something is there"; upgrade to a real path bounds when a decision turns on the last pixel.
const num = (attrs, name) => { const m = attrs.match(new RegExp(`(?:^|\\s)${name}="(-?[\\d.]+)"`)); return m ? Number(m[1]) : null; };
const translateOf = attrs => { const m = attrs.match(/transform="translate\((-?[\d.]+)[ ,]+(-?[\d.]+)\)"/); return m ? [Number(m[1]), Number(m[2])] : [0, 0]; };
const pairs = text => { const n = (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number), out = []; for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]); return out; };

export function marksIn(markup, region, textWidth) {
  const [rx0, ry0, rx1, ry1] = region, found = [], stack = [[0, 0]];
  const meets = (x0, y0, x1, y1) => x0 < rx1 && x1 > rx0 && y0 < ry1 && y1 > ry0;
  const note = (kind, label, [x0, y0, x1, y1]) => { if (meets(x0, y0, x1, y1)) found.push(`${kind}${label ? ` "${label}"` : ''} [${[x0, y0, x1, y1].map(v => Math.round(v * 10) / 10).join(', ')}]`); };
  const tokens = [...markup.matchAll(/<(\/?)([a-zA-Z]+)([^>]*)>|([^<]+)/g)];
  let text = null;
  for (const [, close, tag, attrs = '', content] of tokens) {
    const [tx, ty] = stack.at(-1);
    if (content !== undefined) { if (text) (text.open ?? text).content += content; continue; }
    if (close) {
      if (tag === 'tspan' && text?.open) { text.parts.push(text.open); text.open = null; }
      else if (tag === 'text' && text) {
        for (const part of text.parts.length ? text.parts : [text]) { const label = part.content, w = textWidth(label, text.size), left = text.anchor === 'middle' ? part.x - w / 2 : text.anchor === 'end' ? part.x - w : part.x; note('text', label, [left + tx, part.y + ty - text.size * 0.75, left + tx + w, part.y + ty + text.size * 0.3]); }
        text = null;
      }
      if (tag === 'g' || tag === 'svg') stack.pop();
      continue;
    }
    if (tag === 'g' || tag === 'svg') { const [dx, dy] = translateOf(attrs); stack.push([tx + dx, ty + dy]); continue; }
    if (tag === 'text') { text = { x: num(attrs, 'x') ?? 0, y: num(attrs, 'y') ?? 0, size: num(attrs, 'font-size') ?? 14, anchor: attrs.match(/text-anchor="(\w+)"/)?.[1] ?? 'start', content: '', parts: [], open: null }; continue; }
    if (tag === 'tspan' && text) { text.open = { x: num(attrs, 'x') ?? text.x, y: num(attrs, 'y') ?? text.y, content: '' }; continue; }
    if (tag === 'rect') { const x = num(attrs, 'x') ?? 0, y = num(attrs, 'y') ?? 0, w = num(attrs, 'width') ?? 0, h = num(attrs, 'height') ?? 0; const X0 = x + tx, Y0 = y + ty, X1 = X0 + w, Y1 = Y0 + h;
      // a rectangle larger than the region is judged by its border (its fill is the picture's background, not a mark); a smaller one by its box
      if (w > rx1 - rx0 && h > ry1 - ry0) { for (const edge of [[X0 - 1, Y0 - 1, X1 + 1, Y0 + 1], [X0 - 1, Y1 - 1, X1 + 1, Y1 + 1], [X0 - 1, Y0 - 1, X0 + 1, Y1 + 1], [X1 - 1, Y0 - 1, X1 + 1, Y1 + 1]]) if (meets(...edge)) { found.push(`rect border [${[X0, Y0, X1, Y1].map(v => Math.round(v * 10) / 10).join(', ')}]`); break; } }
      else note('rect', '', [X0, Y0, X1, Y1]); }
    else if (tag === 'line') note('line', '', [Math.min(num(attrs, 'x1'), num(attrs, 'x2')) + tx, Math.min(num(attrs, 'y1'), num(attrs, 'y2')) + ty, Math.max(num(attrs, 'x1'), num(attrs, 'x2')) + tx, Math.max(num(attrs, 'y1'), num(attrs, 'y2')) + ty]);
    else if (tag === 'circle') { const r = num(attrs, 'r') ?? 0; note('circle', '', [num(attrs, 'cx') - r + tx, num(attrs, 'cy') - r + ty, num(attrs, 'cx') + r + tx, num(attrs, 'cy') + r + ty]); }
    else if (['path', 'polygon', 'polyline'].includes(tag)) { const list = pairs(attrs.match(/(?:^|\s)(?:d|points)="([^"]*)"/)?.[1] ?? ''); if (list.length) note(tag, '', [Math.min(...list.map(p => p[0])) + tx, Math.min(...list.map(p => p[1])) + ty, Math.max(...list.map(p => p[0])) + tx, Math.max(...list.map(p => p[1])) + ty]); }
  }
  return found;
}
