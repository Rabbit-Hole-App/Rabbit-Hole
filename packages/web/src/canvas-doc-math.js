// Math in a Document card's Markdown (learn-section-make-spec.md section 4, DECISIONS J): `$$ ... $$` on lines of its own is a math block, `$...$` inside text is inline
// math, both drawn with the installed KaTeX (CanvasDoc.jsx). BlockNote's Markdown parser knows neither, so the math is taken out first: a block splits the Markdown in two,
// and inline math becomes a placeholder word the parser leaves alone, put back as inline content after parsing. Fenced code and code spans are never read as math.
// Pure, so it is tested without a browser.

const TOKEN = /RHMATH(\d+)X/g;
const token = index => `RHMATH${index}X`;
// $...$: not $$, no space just inside either dollar, not an escaped \$, and a closing dollar not followed by a digit (so "$5 and $6" stays text).
const INLINE = /(^|[^\\$])\$(?![\s$])([^$\n]*?[^\s\\$])\$(?![\d$])/g;

// markdown -> { parts: [{ markdown } | { latex }], inline: [latex] } (each part's Markdown carries placeholders for the inline formulas, numbered into `inline`).
export function splitMath(markdown) {
  const parts = [], inline = [], lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  let text = [], fence = null;
  const flush = () => { if (text.join('\n').trim()) parts.push({ markdown: text.join('\n') }); text = []; };
  const inlineOf = line => line.split(/(`+[^`]*`+)/).map(piece => (piece.startsWith('`') ? piece : piece.replace(INLINE, (_, before, latex) => `${before}${token(inline.push(latex) - 1)}`))).join('');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i], trimmed = line.trim();
    const marker = /^(`{3,}|~{3,})/.exec(trimmed)?.[1];
    if (fence) { text.push(line); if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null; continue; }
    if (marker) { fence = marker; text.push(line); continue; }
    if (trimmed.startsWith('$$')) {
      if (trimmed.length > 4 && trimmed.endsWith('$$')) { flush(); parts.push({ latex: trimmed.slice(2, -2).trim() }); continue; }
      const end = lines.findIndex((next, k) => k > i && next.trim().endsWith('$$'));
      if (end !== -1) {
        flush();
        parts.push({ latex: [trimmed.slice(2), ...lines.slice(i + 1, end), lines[end].trim().slice(0, -2)].join('\n').trim() });
        i = end;
        continue;
      }
    }
    text.push(inlineOf(line));
  }
  flush();
  return { parts, inline };
}

// Parsed blocks -> the same blocks with each placeholder put back as inline math ({ type: 'inlineMath', props: { latex } }), inside links, table cells and children too.
export function withInlineMath(blocks, inline) {
  const items = content => content.flatMap(item => {
    if (item?.type === 'text' && typeof item.text === 'string' && item.text.includes('RHMATH')) {
      return item.text.split(TOKEN).map((piece, index) => (index % 2 ? (inline[Number(piece)] !== undefined ? { type: 'inlineMath', props: { latex: inline[Number(piece)] } } : { ...item, text: token(piece) }) : { ...item, text: piece })).filter(part => part.type !== 'text' || part.text);
    }
    if (Array.isArray(item?.content)) return [{ ...item, content: items(item.content) }];
    return [item];
  });
  const content = value => {
    if (Array.isArray(value)) return items(value);
    if (value?.type === 'tableContent' && Array.isArray(value.rows)) return { ...value, rows: value.rows.map(row => ({ ...row, cells: row.cells.map(cell => (Array.isArray(cell) ? items(cell) : Array.isArray(cell?.content) ? { ...cell, content: items(cell.content) } : cell)) })) };
    return value;
  };
  return (blocks || []).map(block => ({ ...block, ...(block.content !== undefined ? { content: content(block.content) } : {}), ...(Array.isArray(block.children) ? { children: withInlineMath(block.children, inline) } : {}) }));
}
