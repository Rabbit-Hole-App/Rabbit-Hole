// The one capability and limit registry for files on the canvas (docs/features/canvas-file-imports.md section 2). Pure: the
// web app and the control plane (../../web/src/file-capabilities.js) both import it, so the picker, the drop classifier and
// the server's upload cap read the same numbers. `can` says what is true now; a lane changes it with the behavior.
export const MiB = 1024 * 1024;
export const formatBytes = n => `${Number.isInteger(n / MiB) ? n / MiB : (n / MiB).toFixed(1)} MiB`;

const ascii = (bytes, offset, text) => bytes.length >= offset + text.length && [...text].every((c, i) => bytes[offset + i] === c.charCodeAt(0));
const SNIFF = {
  image: b => (b[0] === 0x89 && ascii(b, 1, 'PNG')) || (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) || (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')),
  gif: b => ascii(b, 0, 'GIF8'),
  // MP4/ISO-BMFF: a box size, then 'ftyp'. WebM/Matroska: the EBML header id.
  video: b => ascii(b, 4, 'ftyp') || (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3),
  pdf: b => ascii(b, 0, '%PDF-'),
};

const NONE = { store: false, preview: false, edit: false, download: false, context: false };
const planned = (id, label, lane, extensions, notes) => ({ id, label, lane, status: 'planned', extensions, mime: [], sniff: null, card: null, chooser: null, route: null, can: NONE, limits: {}, notes });

const MODEL_CAN = { store: true, preview: true, edit: false, download: true, context: false };
const MODEL_LIMITS = { bytes: 25 * MiB, preview: { triangles: 1_000_000, vertices: 1_500_000, points: 1_600_000, splats: 1_500_000, textureBytes: 256 * MiB, nodes: 5000, accessorElements: 5_000_000 }, archiveEntries: 512, archiveBytes: 200 * MiB, archiveRatio: 200 };
export const FAMILIES = [
  { id: 'image', label: 'Image', lane: 3, status: 'shipped', extensions: ['png', 'jpg', 'jpeg', 'webp'], mime: ['image/png', 'image/jpeg', 'image/webp'], sniff: SNIFF.image,
    card: 'file:image', chooser: null, route: 'drop', can: { store: true, preview: true, edit: false, download: false, context: true }, limits: { bytes: 5 * MiB },
    notes: 'the tutor sees it through /api/learn/media (5 MiB, PNG/JPEG/WebP)' },
  { id: 'gif', label: 'GIF', lane: 3, status: 'shipped', extensions: ['gif'], mime: ['image/gif'], sniff: SNIFF.gif,
    card: 'file:image', chooser: null, route: 'drop', can: { store: true, preview: true, edit: false, download: false, context: false }, limits: { bytes: 10 * MiB }, notes: '' },
  planned('svg', 'SVG', 3, ['svg'], 'sanitized preview, lane 3'),
  { id: 'video', label: 'Video', lane: 3, status: 'shipped', extensions: ['mp4', 'webm'], mime: ['video/mp4', 'video/webm'], sniff: SNIFF.video,
    card: 'file:clip', chooser: null, route: 'drop', can: { store: true, preview: true, edit: false, download: false, context: false }, limits: { bytes: 50 * MiB },
    notes: 'browser playback of the original; no conversion yet' },
  planned('audio', 'Audio', 3, ['mp3', 'wav', 'ogg', 'm4a', 'flac'], 'lane 3'),
  { id: 'pdf', label: 'PDF', lane: 2, status: 'shipped', extensions: ['pdf'], mime: ['application/pdf'], sniff: SNIFF.pdf,
    card: 'pdf', chooser: 'pdf', route: 'pdf', can: { store: true, preview: true, edit: false, download: true, context: true }, limits: { bytes: 5 * MiB, pages: 100 },
    notes: 'download is the browser PDF viewer\'s own control; the tutor reads up to 100 pages' },
  // Lane 2 (FileDocCard.jsx): text and Markdown read from their original asset; the decode is the structure check (a BOM or strict
  // UTF-8, else an encoding choice; NUL bytes refuse a binary file). preview.chars: drawn in 64 KiB chunks up to this many;
  // context.chars: what a chat question reads (the excerpt says when it is partial).
  { id: 'text', label: 'Text', lane: 2, status: 'shipped', extensions: ['txt'], mime: ['text/plain'], sniff: null,
    card: 'file:text', chooser: 'import', route: 'import', can: { store: true, preview: true, edit: false, download: true, context: true },
    limits: { bytes: 25 * MiB, preview: { chars: 2 * MiB }, context: { chars: 6000 } }, notes: 'UTF-8 (BOM or not), UTF-16 by BOM, Windows-1252 by choice; Text card or File attachment' },
  { id: 'markdown', label: 'Markdown', lane: 2, status: 'shipped', extensions: ['md', 'markdown'], mime: ['text/markdown'], sniff: null,
    card: 'file:markdown', chooser: 'import', route: 'import', can: { store: true, preview: true, edit: false, download: true, context: true },
    limits: { bytes: 25 * MiB, preview: { chars: 2 * MiB }, context: { chars: 6000 } }, notes: 'rendered with the safe Markdown renderer (headings, lists, code, math; https links only); linked images not shown; or its source as a Code card' },
  { id: 'notebook', label: 'Notebook', lane: 2, status: 'shipped', extensions: ['ipynb'], mime: ['application/x-ipynb+json'], sniff: null,
    card: 'notebook', chooser: 'import', route: 'import', can: { store: true, preview: true, edit: true, download: true, context: true }, limits: { bytes: 25 * MiB, cardChars: 1_900_000 }, notes: 'nbformat 4' },
  { id: 'python', label: 'Python', lane: 2, status: 'shipped', extensions: ['py'], mime: ['text/x-python'], sniff: null,
    card: 'repo-code', chooser: 'import', route: 'import', can: { store: true, preview: true, edit: true, download: true, context: true }, limits: { bytes: 25 * MiB, cardChars: 1_900_000 }, notes: 'Code card, Notebook or File attachment' },
  // The extensions codeLanguage maps (code-language.js), the spec's list included (jsonl, ini and kts added by lane 2).
  { id: 'code', label: 'Code', lane: 2, status: 'shipped', extensions: ['js', 'mjs', 'cjs', 'ts', 'mts', 'jsx', 'tsx', 'json', 'jsonl', 'sh', 'bash', 'zsh', 'sql', 'html', 'htm', 'css', 'scss', 'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh', 'java', 'kt', 'kts', 'go', 'rs', 'rb', 'php', 'cs', 'swift', 'scala', 'r', 'jl', 'lua', 'yaml', 'yml', 'toml', 'ini', 'xml', 'pyi'], mime: [], sniff: null,
    card: 'repo-code', chooser: 'import', route: 'import', can: { store: true, preview: true, edit: false, download: true, context: true }, limits: { bytes: 25 * MiB, cardChars: 1_900_000 }, notes: 'source view only, never executed' },
  // Lane 2 office and table files (DocImport.jsx, route 'doc'): checked by structure before any parser (file-doc-import.js
  // checkDocFile: ZIP part names, OLE stream names, binary bytes), parsed in a worker, previews bounded and said so.
  // Measured on real files (Microsoft 365-saved fixtures, Chromium via Playwright, Windows 11 laptop, 2026-10-16): an 8 MiB,
  // 200,001-row CSV to first rows in about 2.6-4.2 s; a 1 MiB, 20,001 x 8 xlsx in about 3.3-5.6 s.
  { id: 'delimited', label: 'Table', lane: 2, status: 'shipped', extensions: ['csv', 'tsv'], mime: ['text/csv', 'text/tab-separated-values'], sniff: null,
    card: 'file:table', chooser: null, route: 'doc', can: { store: true, preview: true, edit: false, download: true, context: true },
    limits: { bytes: 25 * MiB, preview: { rows: 10000, cols: 200 }, context: { chars: 6000 } }, notes: 'RFC 4180 quoting, delimiter detected (comma, tab, semicolon, pipe) or chosen, encoding chosen when not UTF-8; values kept as text' },
  { id: 'workbook', label: 'Workbook', lane: 2, status: 'shipped', extensions: ['xlsx', 'xls'], mime: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'], sniff: null,
    card: 'file:workbook', chooser: 'workbook', route: 'doc', can: { store: true, preview: true, edit: false, download: true, context: true },
    limits: { bytes: 25 * MiB, preview: { rows: 10000, cols: 200 }, context: { chars: 6000 } }, notes: 'SheetJS CE 0.20.3; values as the file formats them, formula text beside the cached value, never recalculated; macros and external links not read; no password-protected files' },
  { id: 'word', label: 'Word document', lane: 2, status: 'shipped', extensions: ['docx'], mime: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], sniff: null,
    card: 'file:document', chooser: null, route: 'doc', can: { store: true, preview: true, edit: false, download: true, context: true },
    limits: { bytes: 25 * MiB, preview: { nodes: 50000, images: 60, imageBytes: 20 * MiB }, context: { chars: 6000 } }, notes: 'mammoth 1.13.0 structure preview (headings, lists, tables, emphasis, hyperlinks and embedded images); no page layout; conversion notes shown' },
  planned('word-legacy', 'Word 97-2003 document', 2, ['doc'], 'awaiting converter: office-pdf job (file-job.js); refused on drop with that reason'),
  { id: 'presentation', label: 'Presentation', lane: 2, status: 'shipped', extensions: ['pptx'], mime: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'], sniff: null,
    card: 'file:presentation', chooser: 'pptx', route: 'doc', can: { store: true, preview: false, edit: false, download: true, context: true },
    limits: { bytes: 25 * MiB, slides: 500, context: { chars: 6000 } }, notes: 'slide text, titles, notes and hidden flags read here (SheetJS CE CFB); slide images await the converter (slides job), so preview is false' },
  // Lane 4 (model-import.js, ModelCard.jsx): route 'model' is the lazily loaded model importer (model-drop.js picks the
  // drop). Structure is sniffed per extension client-side (model-formats.js); the server has no magic for these, so no
  // family here is over the general cap. `context` is false: Ask lists a model card's name and declared counts only.
  // Viewer budgets are the largest sizes measured at 60 fps on Intel integrated graphics (model-budget-measure.mjs).
  { id: 'gltf', label: 'glTF scene', lane: 4, status: 'shipped', extensions: ['glb', 'gltf'], mime: ['model/gltf-binary', 'model/gltf+json'], sniff: null,
    card: 'file:model', chooser: null, route: 'model', can: MODEL_CAN, limits: MODEL_LIMITS, notes: 'glTF 2.0; .gltf with its .bin and textures as one card; meshopt decoded; Draco and KTX2 not decoded (shown as a preview limitation)' },
  { id: 'mesh', label: 'Mesh model', lane: 4, status: 'shipped', extensions: ['obj', 'fbx', 'stl', '3mf'], mime: ['model/obj', 'model/stl', 'model/3mf'], sniff: null,
    card: 'file:model', chooser: null, route: 'model', can: MODEL_CAN, limits: MODEL_LIMITS, notes: 'OBJ+MTL+textures, FBX 7.x binary and ASCII, STL binary and ASCII, 3MF core (its unit shown); STL and 3MF turned Z-up' },
  { id: 'cad', label: 'CAD model', lane: 4, status: 'shipped', extensions: ['step', 'stp'], mime: ['model/step'], sniff: null,
    card: 'file:model', chooser: null, route: 'model', can: { ...MODEL_CAN, preview: false }, limits: MODEL_LIMITS, notes: 'original kept; preview mesh awaits the step-glb converter job' },
  { id: 'ply', label: 'PLY', lane: 4, status: 'shipped', extensions: ['ply'], mime: [], sniff: null,
    card: 'file:model', chooser: null, route: 'model', can: MODEL_CAN, limits: MODEL_LIMITS, notes: 'header decides mesh, point cloud or Gaussian splat; inconsistent schemas refused' },
  { id: 'splat', label: 'Gaussian splat', lane: 4, status: 'shipped', extensions: ['splat', 'ksplat', 'spz', 'sog'], mime: [], sniff: null,
    card: 'file:model', chooser: null, route: 'model', can: MODEL_CAN, limits: MODEL_LIMITS, notes: 'Spark 2.3.1: .splat, .ksplat, .spz v1-3, .sog (and an unpacked SOG folder), splat PLY' },
  // A model's own files (lead ruling 2026-10-16): buffers, material libraries and textures inside a model bundle, 25 MiB
  // each like the package; never a card alone. Textures share the image extensions but not the image family's 5 MiB cap:
  // familyOf() still answers 'image' for a standalone picture (image comes first). The GPU budget holds at decode
  // (textureBytes, measured: DamagedHelmet's 5 textures, 80 MiB decoded, at 60 fps). KTX2 is not offered (no transcoder).
  { id: 'model-part', label: 'Model file', lane: 4, status: 'shipped', extensions: ['bin', 'mtl', 'png', 'jpg', 'jpeg', 'webp'], mime: [], sniff: null,
    card: null, chooser: null, route: 'model-part', can: { store: true, preview: false, edit: false, download: true, context: false }, limits: { bytes: MODEL_LIMITS.bytes, preview: { textureBytes: MODEL_LIMITS.preview.textureBytes } }, notes: 'a glTF buffer, an OBJ material library or a texture, stored with its model' },
  // Its head sniff is the ZIP signature; the whole-archive check (guards plus a model or splat entry point) is
  // model-formats.js modelPackageCheck, which the upload route can run on the full body.
  { id: 'model-package', label: 'Model package', lane: 4, status: 'shipped', extensions: ['zip'], mime: ['application/zip'], sniff: b => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
    card: 'file:model', chooser: null, route: 'model', can: MODEL_CAN, limits: MODEL_LIMITS, notes: 'a ZIP is opened only as a model or splat package: guarded (traversal, symlinks, bombs), a choice when it holds several models' },
];
export const family = id => FAMILIES.find(f => f.id === id) || null;

const extensionOf = name => { const base = String(name || '').split(/[/\\]/).pop().toLowerCase(); return base.includes('.') ? base.split('.').pop() : ''; };
// The shipped family a file is offered as: by extension, else by declared type. A name is a hint; sniff checks structure.
export function familyOf({ name, type } = {}) {
  const shipped = FAMILIES.filter(f => f.status === 'shipped');
  const ext = extensionOf(name);
  return shipped.find(f => ext && f.extensions.includes(ext)) || shipped.find(f => type && f.mime.includes(String(type).toLowerCase())) || null;
}
// The picker's accept list: what canvas drop takes, so Upload/Insert and drop offer the same files.
export const acceptList = () => FAMILIES.filter(f => f.status === 'shipped').flatMap(f => f.extensions.map(e => `.${e}`)).join(',');

// A board file PUT (learn-boards.js): the general 25 MiB cap, or a larger family's own when the declared type names it.
// A family over the general cap must sniff, so a mislabelled body cannot claim its room.
export const BOARD_FILE_LIMIT = 25 * MiB;
export function boardFileLimit(contentType) {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  const larger = FAMILIES.find(f => f.status === 'shipped' && f.sniff && f.limits.bytes > BOARD_FILE_LIMIT && f.mime.includes(type));
  return larger ? { bytes: larger.limits.bytes, family: larger.id, sniff: larger.sniff } : { bytes: BOARD_FILE_LIMIT, family: null, sniff: null };
}
