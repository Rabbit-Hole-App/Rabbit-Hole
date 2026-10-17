// Structure checks for an uploaded file's first bytes, per extension, so the server refuses a body that is not the format its
// name and family claim (owner spec 2026-10-16 section 3: recognition uses structure as well as extension/MIME; a JSON file is
// not a notebook because it is JSON). Pure: the caller reads the first HEAD_BYTES of the body (and knows its total size) and
// asks sniffUpload({ family, name, head, size }). The family list itself stays in file-capabilities.js; this module only knows
// what each extension's bytes look like. Wired into PUT /api/learn/files by Lane 1 / the integrator.
import { family as familyById } from '../../web/src/file-capabilities.js';
import { modelPackageCheck } from '../../web/src/model-formats.js';

export const HEAD_BYTES = 4096;

const ascii = (b, at, text) => b.length >= at + text.length && [...text].every((c, i) => b[at + i] === c.charCodeAt(0));
const u32 = (b, at) => (b.length >= at + 4 ? (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0 : -1);
const u16 = (b, at) => (b.length >= at + 2 ? b[at] | (b[at + 1] << 8) : -1);
const latin1 = b => String.fromCharCode(...b.subarray(0, HEAD_BYTES));
const has = (b, text) => latin1(b).includes(text);

// Text: no NUL byte in the head, and not a known binary signature. UTF-16 with a BOM is text too (it has NULs by design).
const utf16 = b => (b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff);
const text = b => utf16(b) || !b.subarray(0, HEAD_BYTES).includes(0);
// The text with a UTF-8 BOM, leading whitespace, an XML declaration, comments and a doctype skipped.
const lead = b => latin1(b).replace(/^\xef\xbb\xbf/, '').replace(/^(\s|<\?xml[^>]*\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*/i, '');

const ZIP = b => ascii(b, 0, 'PK\x03\x04') || ascii(b, 0, 'PK\x05\x06');
const OLE2 = b => [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((v, i) => b[i] === v);
const FTYP = b => ascii(b, 4, 'ftyp');
// An MPEG audio frame header: 11 sync bits, a layer (not the reserved 00, which is AAC ADTS), a bitrate index that is not 1111.
const MPEG_AUDIO = (b, at = 0) => b[at] === 0xff && (b[at + 1] & 0xe0) === 0xe0 && (b[at + 1] & 0x06) !== 0 && (b[at + 2] & 0xf0) !== 0xf0;
const EBML = b => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
const OOXML = b => ZIP(b) && has(b, '[Content_Types].xml');
const JSON_OBJECT = b => text(b) && /^\s*\{/.test(lead(b));

// Each extension: (head, size) => true when the bytes are that format. null means no structure to check beyond "is text".
export const FORMATS = {
  png: b => b[0] === 0x89 && ascii(b, 1, 'PNG\r\n\x1a\n'),
  jpg: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: b => FORMATS.jpg(b),
  webp: b => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP'),
  gif: b => ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a'),
  svg: b => text(b) && /^<svg[\s>]/i.test(lead(b)),
  mp4: FTYP,
  m4a: FTYP,
  webm: EBML,
  mp3: b => ascii(b, 0, 'ID3') || MPEG_AUDIO(b),
  wav: b => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WAVE'),
  ogg: b => ascii(b, 0, 'OggS'),
  flac: b => ascii(b, 0, 'fLaC') || (ascii(b, 0, 'ID3') && has(b, 'fLaC')),
  // PDF readers accept the header within the first 1024 bytes.
  pdf: b => latin1(b.subarray(0, 1024)).includes('%PDF-'),
  docx: OOXML, xlsx: OOXML, pptx: OOXML,
  doc: OLE2, xls: OLE2,
  ipynb: JSON_OBJECT,
  glb: b => ascii(b, 0, 'glTF') && u32(b, 4) === 2,
  gltf: b => JSON_OBJECT(b) && has(b, '"asset"'),
  obj: text,
  // Binary STL has no magic: an 80-byte header, then a triangle count that must account for the whole file.
  stl: (b, size) => (text(b) && /^\s*solid\b/.test(latin1(b))) || (size >= 84 && u32(b, 80) >= 0 && size === 84 + 50 * u32(b, 80)),
  '3mf': b => ZIP(b) && (has(b, '[Content_Types].xml') || has(b, '3D/')),
  fbx: b => ascii(b, 0, 'Kaydara FBX Binary  \x00') || (text(b) && /^\s*; FBX/.test(latin1(b))),
  step: b => text(b) && /^\s*ISO-10303-21;/.test(latin1(b)),
  stp: b => FORMATS.step(b),
  ply: b => /^ply\r?\nformat (ascii|binary_little_endian|binary_big_endian) 1\.0/.test(latin1(b)),
  // .splat (antimatter15) has no header: 32 bytes per splat.
  splat: (b, size) => size > 0 && size % 32 === 0,
  // .ksplat (GaussianSplats3D SplatBuffer): version 0.x, a section count within its maximum, compression level 0-2.
  ksplat: (b, size) => size >= 4096 && b[0] === 0 && b[1] >= 1 && u32(b, 4) >= 1 && u32(b, 8) <= u32(b, 4) && u16(b, 20) >= 0 && u16(b, 20) <= 2,
  // .spz is gzip (the NGSP magic is inside the compressed stream).
  spz: b => b[0] === 0x1f && b[1] === 0x8b && b[2] === 0x08,
  // .sog (PlayCanvas SOG v2) is a zip whose files include meta.json.
  sog: b => ZIP(b) && has(b, 'meta.json'),
  zip: ZIP,
};
// A model's own files (family model-part, Lane 4): only the extensions the registry lists for it are taken.
const KTX2 = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
export const PART_FORMATS = {
  bin: (b, size) => size > 0,
  mtl: b => text(b),
  png: FORMATS.png, jpg: FORMATS.jpg, jpeg: FORMATS.jpeg, webp: FORMATS.webp,
  ktx2: b => KTX2.every((v, i) => b[i] === v),
};
// Text families: every name the registry lists for text, Markdown, notebooks' Python, code and delimited data is checked as text.
const TEXT_FAMILIES = new Set(['text', 'markdown', 'python', 'code', 'delimited']);

// The verdict for one upload: { ok, format, reason }. ok is false when the bytes are not what the name says, or the name is not one
// the family takes; true when they are; ok is true with checked:false only for a text family's name (no structure beyond text).
// A model package (.zip, family model-package) is judged on the whole archive: pass `body`, all its bytes (the family's cap is
// 25 MiB). Lane 4's modelPackageCheck reads its central directory and refuses traversal, symlinks, bombs and archives
// with no model or splat entry point; nothing is inflated.
export function sniffUpload({ family, name, head, size = head?.length ?? 0, body = null }) {
  const fam = familyById(family);
  const base = String(name || '').split(/[/\\]/).pop().toLowerCase();
  const ext = base.includes('.') ? base.split('.').pop() : '';
  if (!fam) return { ok: false, format: ext, reason: `unknown family ${family}` };
  // A Gaussian splat may come as a .ply with the 3DGS schema (the registry's "splat-schema ply").
  if (fam.id === 'splat' && ext === 'ply') {
    const bytes = head instanceof Uint8Array ? head : new Uint8Array(head || []);
    return FORMATS.ply(bytes) && ['f_dc_0', 'opacity', 'scale_0', 'rot_0'].every(p => has(bytes, `property float ${p}`))
      ? { ok: true, format: 'ply', checked: true } : { ok: false, format: 'ply', reason: 'this .ply has no Gaussian splat properties' };
  }
  if (!fam.extensions.includes(ext)) return { ok: false, format: ext, reason: `${fam.label} does not take .${ext || '(no extension)'}` };
  const bytes = head instanceof Uint8Array ? head : new Uint8Array(head || []);
  if (fam.id === 'model-package') {
    if (!FORMATS.zip(bytes)) return { ok: false, format: ext, reason: 'this is not a .zip file' };
    if (!body) return { ok: false, format: ext, reason: 'a model package is checked on the whole archive' };
    const verdict = modelPackageCheck(body instanceof Uint8Array ? body : new Uint8Array(body));
    return verdict.ok ? { ok: true, format: ext, checked: true, entries: verdict.entries } : { ok: false, format: ext, reason: verdict.reason };
  }
  if (fam.id === 'model-part') {
    const part = PART_FORMATS[ext];
    if (!part) return { ok: false, format: ext, reason: `no structure check for .${ext}` };
    return part(bytes, size) ? { ok: true, format: ext, checked: true } : { ok: false, format: ext, reason: `this is not a .${ext} model file` };
  }
  const check = FORMATS[ext];
  if (check) return check(bytes, size) ? { ok: true, format: ext, checked: true } : { ok: false, format: ext, reason: `this is not a .${ext} file` };
  if (TEXT_FAMILIES.has(fam.id)) return text(bytes) ? { ok: true, format: ext, checked: false } : { ok: false, format: ext, reason: `a .${ext} file is text; this one is binary` };
  // ponytail: an extension with neither a structure check nor a text family is refused until one is written here.
  return { ok: false, format: ext, reason: `no structure check for .${ext}` };
}
