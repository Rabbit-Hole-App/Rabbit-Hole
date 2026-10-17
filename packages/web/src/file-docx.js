// Word documents (.docx) on the canvas (docs/features/canvas-file-imports.md, lane 2), converted with mammoth (passed in, so
// this module stays pure). mammoth reads only the document's own parts: externalFileAccess is off, so a linked image or file
// outside the .docx is never fetched. Its HTML is never injected: htmlTree turns it into a small tree of allowed elements,
// which the card renders as React elements. Images stay in the original file and are drawn from it by object URL.

// Tags kept; anything else is dropped and its text kept. Attributes kept: a link's http(s)/mailto href, a table cell's spans,
// an image's reference to one of this document's own images.
const TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'a', 'br', 'img', 'blockquote', 'pre', 'code']);
const VOID = new Set(['br', 'img', 'hr']);
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp']);
export const DOC_LIMITS = { images: 60, imageBytes: 20 * 1024 * 1024, nodes: 50000 };

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = text => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? all));
const safeHref = href => (/^(https?:|mailto:)/i.test(href.trim()) ? href.trim() : null);

// htmlTree(html) -> [node]; node = string | { t: tag, a?: { href | colspan | rowspan | img }, c: [node] }.
// A tolerant tokenizer for mammoth's well-formed output; anything unexpected becomes text or is dropped, never markup.
export function htmlTree(html, { maxNodes = DOC_LIMITS.nodes } = {}) {
  const root = { t: 'root', c: [] };
  const stack = [{ node: root, tag: 'root' }]; // the tag as written, so a link kept as a span still closes on </a>
  let count = 0, cut = false;
  const push = node => { if (count >= maxNodes) { cut = true; return false; } count++; stack[stack.length - 1].node.c.push(node); return true; };
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z_:][-a-zA-Z0-9_:.]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>|<!--[\s\S]*?-->|<[^>]*>|([^<]+)/g;
  for (const m of html.matchAll(re)) {
    const [, closing, rawTag, rawAttrs = '', selfClose, text] = m;
    if (text != null) { push(decode(text)); continue; }
    if (!rawTag) continue; // a comment or a malformed tag: dropped
    const tag = rawTag.toLowerCase();
    if (!TAGS.has(tag)) continue;
    if (closing) {
      const at = stack.findLastIndex(entry => entry.tag === tag);
      if (at > 0) stack.length = at;
      continue;
    }
    const attrs = Object.fromEntries([...rawAttrs.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)].map(a => [a[1].toLowerCase(), decode(a[3] ?? a[4] ?? a[5] ?? '')]));
    const node = { t: tag === 'b' ? 'strong' : tag === 'i' ? 'em' : tag, c: [] };
    if (tag === 'a') { const href = attrs.href && safeHref(attrs.href); if (href) node.a = { href }; else node.t = 'span'; }
    if ((tag === 'td' || tag === 'th')) for (const key of ['colspan', 'rowspan']) { const n = Number(attrs[key]); if (Number.isInteger(n) && n > 1 && n <= 1000) (node.a ||= {})[key] = n; }
    if (tag === 'img') { const image = /^rh-image:(\d+)$/.exec(attrs.src || ''); node.a = image ? { img: Number(image[1]) } : { missing: attrs.alt || 'image' }; if (attrs.alt) node.a.alt = attrs.alt.slice(0, 200); }
    if (push(node) && !VOID.has(tag) && !selfClose) stack.push({ node, tag });
  }
  return { nodes: root.c, truncated: cut, count };
}

// The text of a tree, paragraphs and list items on their own lines, for an excerpt and a search.
const flat = node => (typeof node === 'string' ? node : node.t === 'br' ? ' ' : node.c.map(flat).join(' ').replace(/\s+/g, ' '));
export function treeText(nodes) {
  const out = [];
  const walk = (list, line) => {
    for (const node of list) {
      if (typeof node === 'string') { line.push(node); continue; }
      if (node.t === 'tr') { const cells = node.c.filter(cell => typeof cell === 'object' && (cell.t === 'td' || cell.t === 'th')).map(cell => flat(cell).trim()); if (cells.some(Boolean)) out.push(cells.join(' | ')); continue; }
      if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre'].includes(node.t)) {
        const inner = [];
        walk(node.c, inner);
        const text = inner.join('').trim();
        if (text) out.push(node.t[0] === 'h' && node.t.length === 2 ? `${'#'.repeat(Number(node.t[1]))} ${text}` : node.t === 'li' ? `- ${text}` : text);
      } else if (node.t === 'td' || node.t === 'th') { walk(node.c, line); line.push(' | '); } else if (node.t === 'br') line.push('\n'); else walk(node.c, line);
    }
  };
  const line = [];
  walk(nodes, line);
  if (line.join('').trim()) out.push(line.join('').trim());
  return out.join('\n');
}

// readDocx(mammoth, bytes, { name }) -> { nodes, truncated, images: [{ id, type, bytes }], skippedImages, messages, text }.
// messages: mammoth's own notes on what it could not convert, said on the card as conversion losses.
export async function readDocx(mammoth, input, { name = 'That document' } = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const images = [];
  let imageBytes = 0, skippedImages = 0;
  const convertImage = mammoth.images.imgElement(async image => {
    const type = String(image.contentType || '').toLowerCase();
    if (!IMAGE_TYPES.has(type) || images.length >= DOC_LIMITS.images) { skippedImages++; return { src: '', alt: IMAGE_TYPES.has(type) ? 'image over the preview limit' : `${type || 'unknown'} image not shown` }; }
    const data = new Uint8Array(await image.readAsArrayBuffer()); // read() makes a Node Buffer, which a browser lacks
    if (imageBytes + data.length > DOC_LIMITS.imageBytes) { skippedImages++; return { src: '', alt: 'image over the preview limit' }; }
    imageBytes += data.length;
    images.push({ id: images.length + 1, type, bytes: data });
    return { src: `rh-image:${images.length}`, ...(image.altText ? { alt: image.altText } : {}) };
  });
  let result;
  // arrayBuffer for mammoth's browser build, buffer for its Node build (the unit tests).
  try { result = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), buffer: bytes }, { externalFileAccess: false, convertImage }); } catch (error) {
    throw Error(`${name} could not be read as a Word document (${String(error?.message || error).slice(0, 120)}). Add it as a File attachment to keep it as it is.`);
  }
  const tree = htmlTree(result.value || '');
  const messages = [...new Set((result.messages || []).map(message => message.message.replace(/^An unrecognised element was ignored: /, 'Not converted: ')))].slice(0, 20);
  return { nodes: tree.nodes, truncated: tree.truncated, images, skippedImages, messages, text: treeText(tree.nodes) };
}
