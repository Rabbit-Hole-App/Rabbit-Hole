// Office files on the canvas (docs/features/canvas-file-imports.md, lane 2): which one a file really is, from its structure,
// and a presentation's slides read as text. Pure; the ZIP/OLE reader (SheetJS CE's CFB, XLSX.CFB) is passed in, so nothing
// loads until a presentation is opened. No macro, embedded object, external link or media is read or run.
import { isOle, isZip } from './file-workbook.js';

const ascii = text => [...text].map(c => c.charCodeAt(0));
const utf16 = text => [...text].flatMap(c => [c.charCodeAt(0), 0]);
function contains(bytes, needle, from = 0, to = bytes.length) {
  const first = needle[0], end = Math.min(to, bytes.length) - needle.length;
  outer: for (let i = Math.max(0, from); i <= end; i++) {
    if (bytes[i] !== first) continue;
    for (let j = 1; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}
const ZIP_PARTS = [['docx', 'word/document.xml'], ['xlsx', 'xl/workbook.xml'], ['xlsb', 'xl/workbook.bin'], ['pptx', 'ppt/presentation.xml']];
const OLE_STREAMS = [['doc', 'WordDocument'], ['xls', 'Workbook'], ['xls', 'Book'], ['ppt', 'PowerPoint Document']];

// officeKind(bytes) -> 'docx' | 'xlsx' | 'xlsb' | 'pptx' | 'doc' | 'xls' | 'ppt' | 'zip' | 'ole' | null.
// A ZIP names its parts in its central directory (the end of the file) and in each local header; an OLE compound file names
// its streams in UTF-16 in its directory sectors. Either way the part or stream name decides, never the file's extension.
export function officeKind(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (isZip(bytes)) {
    for (const [kind, part] of ZIP_PARTS) if (contains(bytes, ascii(part))) return kind;
    return 'zip';
  }
  if (isOle(bytes)) {
    for (const [kind, stream] of OLE_STREAMS) if (contains(bytes, utf16(stream))) return kind;
    return 'ole';
  }
  return null;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const unescapeXml = text => text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()]));

// A DrawingML text body's paragraphs: each <a:p> one line, its <a:t> runs joined, <a:br/> a line break inside it.
export function paragraphsOf(xml) {
  const out = [];
  for (const [, body] of xml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g)) {
    const line = [...body.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br(?:\s[^>]*)?\/>/g)]
      .map(m => (m[0].startsWith('<a:br') ? '\n' : unescapeXml(m[1] ?? ''))).join('');
    if (line.trim()) out.push(line);
  }
  return out;
}

const read = (CFB, zip, path) => { const entry = CFB.find(zip, path); return entry?.content ? new TextDecoder('utf-8').decode(entry.content) : null; };
const relsOf = xml => Object.fromEntries([...(xml || '').matchAll(/<Relationship\b([^>]*)\/?>/g)].map(([, attrs]) => [attrs.match(/\bId="([^"]+)"/)?.[1], { target: attrs.match(/\bTarget="([^"]+)"/)?.[1], type: attrs.match(/\bType="([^"]+)"/)?.[1] || '' }]));
const resolve = (base, target) => {
  if (target.startsWith('/')) return target;
  const parts = base.split('/').slice(0, -1);
  for (const part of target.split('/')) { if (part === '..') parts.pop(); else if (part !== '.') parts.push(part); }
  return parts.join('/');
};

// readPresentation(CFB, bytes, { name, maxSlides }) -> { size: { cx, cy, ratio }, count, slides: [{ number, title, text, notes,
// hidden }] } in the presentation's own order. number is the slide's position in the deck (1-based, hidden slides counted),
// the number PowerPoint shows. title: the title placeholder's text, else the first paragraph.
export const MAX_SLIDES = 500;
export function readPresentation(CFB, input, { name = 'That presentation', maxSlides = MAX_SLIDES } = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (officeKind(bytes) !== 'pptx') throw Error(`${name} is not a PowerPoint presentation (.pptx). Add it as a File attachment to keep it as it is.`);
  let zip;
  try { zip = CFB.read(bytes, { type: 'array' }); } catch { throw Error(`${name} could not be read. Add it as a File attachment to keep it as it is.`); }
  const presentation = read(CFB, zip, '/ppt/presentation.xml');
  if (!presentation) throw Error(`${name} has no slide list. Add it as a File attachment to keep it as it is.`);
  if (/<p:extLst>[\s\S]*?encrypt/i.test(presentation)) throw Error(`${name} is password-protected.`);
  const rels = relsOf(read(CFB, zip, '/ppt/_rels/presentation.xml.rels'));
  const size = presentation.match(/<p:sldSz\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
  const cx = size ? Number(size[1]) : 12192000, cy = size ? Number(size[2]) : 6858000;
  const ids = [...presentation.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)].map(m => m[1]);
  const slides = ids.slice(0, maxSlides).map((rid, index) => {
    const path = rels[rid]?.target ? `/${resolve('ppt/presentation.xml', rels[rid].target).replace(/^\//, '')}` : null;
    const xml = path ? read(CFB, zip, path) || '' : '';
    const hidden = /<p:sld\b[^>]*\bshow="0"/.test(xml);
    const shapes = [...xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)].map(m => m[1]);
    const titleShape = shapes.find(shape => /<p:ph\b[^>]*type="(ctrTitle|title)"/.test(shape));
    const paragraphs = paragraphsOf(xml); // every text body in document order: shapes, groups and table cells
    const title = titleShape ? paragraphsOf(titleShape).join(' ') : paragraphs[0] || '';
    const slideRels = path ? relsOf(read(CFB, zip, path.replace(/([^/]+)$/, '_rels/$1.rels'))) : {};
    const notesRel = Object.values(slideRels).find(rel => rel.type.endsWith('/notesSlide'));
    const notesXml = notesRel?.target ? read(CFB, zip, `/${resolve(path.slice(1), notesRel.target)}`) : null;
    // A notes page holds the slide image placeholder, the notes body and the slide number; only the body is the notes.
    const notes = notesXml ? [...notesXml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)].map(m => m[1]).filter(shape => /<p:ph\b[^>]*type="body"/.test(shape)).flatMap(paragraphsOf).join('\n') : '';
    return { number: index + 1, title, text: paragraphs.join('\n'), notes, hidden };
  });
  return { size: { cx, cy, ratio: cx / cy }, count: ids.length, slides, truncated: ids.length > slides.length };
}

// What a chat question about slides reads: each slide's number, title and text, notes labelled as notes, bounded.
export const EXCERPT_CHARS = 6000;
export function slidesExcerpt(slides, { limit = EXCERPT_CHARS } = {}) {
  let used = 0, count = 0;
  const parts = [];
  for (const slide of slides) {
    const part = [`[Slide ${slide.number}${slide.hidden ? ', hidden' : ''}]`, slide.text || '(no text on this slide)', slide.notes ? `Speaker notes: ${slide.notes}` : ''].filter(Boolean).join('\n');
    if (used + part.length > limit && count) break;
    parts.push(part); used += part.length + 2; count++;
  }
  return { text: parts.join('\n\n'), coverage: count < slides.length ? 'partial' : 'extracted', note: count < slides.length ? `text of slides ${slides[0].number}-${slides[count - 1].number} of ${slides.length}` : '' };
}
