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
  planned('text', 'Text', 2, ['txt'], 'Context only today'),
  // Shipped as Markdown source in a code card (codeLanguage maps .md; .markdown is not mapped yet); the rendered card is lane 2's.
  { id: 'markdown', label: 'Markdown', lane: 2, status: 'shipped', extensions: ['md'], mime: ['text/markdown'], sniff: null,
    card: 'repo-code', chooser: 'import', route: 'import', can: { store: true, preview: true, edit: false, download: true, context: true }, limits: { bytes: 25 * MiB }, notes: 'shown as source, not rendered' },
  { id: 'notebook', label: 'Notebook', lane: 2, status: 'shipped', extensions: ['ipynb'], mime: ['application/x-ipynb+json'], sniff: null,
    card: 'notebook', chooser: 'import', route: 'import', can: { store: true, preview: true, edit: true, download: true, context: true }, limits: { bytes: 25 * MiB, cardChars: 1_900_000 }, notes: 'nbformat 4' },
  { id: 'python', label: 'Python', lane: 2, status: 'shipped', extensions: ['py'], mime: ['text/x-python'], sniff: null,
    card: 'repo-code', chooser: 'import', route: 'import', can: { store: true, preview: true, edit: true, download: true, context: true }, limits: { bytes: 25 * MiB, cardChars: 1_900_000 }, notes: 'Code card, Notebook or File attachment' },
  // The extensions codeLanguage maps today (code-language.js); lane 2 adds jsonl, ini and kts.
  { id: 'code', label: 'Code', lane: 2, status: 'shipped', extensions: ['js', 'mjs', 'cjs', 'ts', 'mts', 'jsx', 'tsx', 'json', 'sh', 'bash', 'zsh', 'sql', 'html', 'htm', 'css', 'scss', 'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh', 'java', 'kt', 'go', 'rs', 'rb', 'php', 'cs', 'swift', 'scala', 'r', 'jl', 'lua', 'yaml', 'yml', 'toml', 'xml', 'pyi'], mime: [], sniff: null,
    card: 'repo-code', chooser: 'import', route: 'import', can: { store: true, preview: true, edit: false, download: true, context: true }, limits: { bytes: 25 * MiB, cardChars: 1_900_000 }, notes: 'source view only, never executed' },
  planned('delimited', 'Table', 2, ['csv', 'tsv'], 'lane 2'),
  planned('workbook', 'Workbook', 2, ['xlsx', 'xls'], 'lane 2'),
  planned('word', 'Word document', 2, ['docx', 'doc'], 'lane 2'),
  planned('presentation', 'Presentation', 2, ['pptx'], 'lane 2'),
  planned('gltf', 'glTF scene', 4, ['glb', 'gltf'], 'GLB viewer exists (20 MiB), not wired to drop'),
  planned('mesh', 'Mesh model', 4, ['obj', 'fbx', 'stl', '3mf'], 'lane 4'),
  planned('cad', 'CAD model', 4, ['step', 'stp'], 'needs a native converter runtime'),
  planned('ply', 'PLY', 4, ['ply'], 'mesh, point cloud or splat by schema'),
  planned('splat', 'Gaussian splat', 4, ['splat', 'ksplat', 'spz', 'sog'], 'lane 4'),
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
