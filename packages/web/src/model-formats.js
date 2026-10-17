// 3D models, CAD, PLY and Gaussian splats on the canvas (file-imports Lane 4; docs/features/canvas-file-imports.md section
// 10). Pure: no three.js, no DOM. It recognises a model by its structure (an extension is only a hint), reads a PLY
// header to decide mesh / point cloud / splat, and resolves a model's dependencies only from files in the submitted
// bundle - never a network URL or a local filesystem path. The viewer modules (model-loaders.js, three-d-renderer.js)
// are imported lazily and never from here.
// ponytail: the byte and complexity limits below move into file-capabilities.js (Lane 1's registry) when it lands.

export const MiB = 1024 * 1024;

// Source cap: the general board-file cap (25 MiB) until Lane 1's registry gives models their own. Complexity budgets
// are the largest sizes measured to orbit at 60 fps (16.5 ms mean frame) on Intel integrated graphics (D3D11, headless
// Chromium; e2e/model-budget-measure.mjs, 2026-10-16); above them the card keeps the original and says why it does not
// render. At the 25 MiB cap an uncompressed file stays inside them; they bind for meshopt glTF and compressed splats.
export const MODEL_LIMITS = {
  bytes: 25 * MiB,
  triangles: 1_000_000, // glTF grid, 999,698 triangles
  vertices: 1_500_000, // binary STL, 500,000 triangles = 1,500,000 unindexed vertices
  points: 1_600_000, // binary PLY with colours
  splats: 1_500_000, // .spz; a 780,000-splat .splat also measured
  textureBytes: 256 * MiB, // decoded RGBA, all textures of one model (DamagedHelmet: 5 textures, 80 MiB)
  nodes: 5000,
  accessorElements: 5_000_000, // the existing GLB viewer's bound (three-d-asset.js)
  archiveEntries: 512,
  archiveBytes: 200 * MiB, // expanded, all entries
  archiveRatio: 200, // expanded / compressed, per entry
  headerBytes: 64 * 1024, // PLY / glTF JSON / OBJ text read for planning
};

// What each extension can be. `family` is the registry family id (file-capabilities.js).
export const ENTRY_FORMATS = {
  glb: { family: 'gltf', render: 'mesh', label: 'glTF scene' },
  gltf: { family: 'gltf', render: 'mesh', label: 'glTF scene' },
  obj: { family: 'mesh', render: 'mesh', label: 'OBJ model' },
  fbx: { family: 'mesh', render: 'mesh', label: 'FBX model' },
  stl: { family: 'mesh', render: 'mesh', label: 'STL model' },
  '3mf': { family: 'mesh', render: 'mesh', label: '3MF model' },
  step: { family: 'cad', render: 'cad', label: 'STEP CAD model' },
  stp: { family: 'cad', render: 'cad', label: 'STEP CAD model' },
  ply: { family: 'ply', render: null, label: 'PLY' }, // mesh, points or splat: decided by inspectPly
  splat: { family: 'splat', render: 'splat', label: 'Gaussian splat' },
  ksplat: { family: 'splat', render: 'splat', label: 'Gaussian splat' },
  spz: { family: 'splat', render: 'splat', label: 'Gaussian splat' },
  sog: { family: 'splat', render: 'splat', label: 'Gaussian splat' },
};
// Files a model may depend on. A texture alone is an image, not a model.
export const DEPENDENCY_EXTENSIONS = ['bin', 'mtl', 'png', 'jpg', 'jpeg', 'webp', 'json'];
export const CONTAINER_EXTENSIONS = ['zip'];

export const extensionOf = name => { const base = String(name || '').split(/[/\\]/).pop().toLowerCase(); return base.includes('.') ? base.split('.').pop() : ''; };
export const baseName = path => String(path || '').split(/[/\\]/).pop();
export const isModelEntryName = name => Object.hasOwn(ENTRY_FORMATS, extensionOf(name));
export const isContainerName = name => CONTAINER_EXTENSIONS.includes(extensionOf(name));
export const isDependencyName = name => DEPENDENCY_EXTENSIONS.includes(extensionOf(name));

const ascii = (bytes, offset, text) => bytes.length >= offset + text.length && [...text].every((c, i) => bytes[offset + i] === c.charCodeAt(0));
const u32 = (bytes, offset) => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
const headText = (bytes, n = MODEL_LIMITS.headerBytes) => new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, Math.min(bytes.length, n)));
const isText = bytes => { const n = Math.min(bytes.length, 4096); for (let i = 0; i < n; i++) if (bytes[i] === 0) return false; return true; };
const stripBom = text => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
export const isZip = bytes => bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
export const isGzip = bytes => bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

// Structure checks: true when the bytes are that format. `bytes` is the whole file or at least its first 64 KiB, and
// `size` the whole file's length.
export const SNIFF = {
  glb: bytes => ascii(bytes, 0, 'glTF') && u32(bytes, 4) === 2,
  gltf: bytes => { try { const json = JSON.parse(stripBom(headText(bytes, bytes.length))); return /^2\./.test(String(json?.asset?.version || '')); } catch { return false; } },
  stl: (bytes, size = bytes.length) => (size >= 84 && 84 + u32(bytes, 80) * 50 === size) || (isText(bytes) && /^\s*solid\b/i.test(headText(bytes, 512)) && /\bfacet\b/i.test(headText(bytes))),
  obj: bytes => isText(bytes) && /^\s*(v|f|o|g|mtllib|usemtl)\s/m.test(headText(bytes)) && /^\s*v\s+[-+.\d]/m.test(headText(bytes)),
  fbx: bytes => ascii(bytes, 0, 'Kaydara FBX Binary') || (isText(bytes) && /FBXHeaderExtension\s*:/.test(headText(bytes))),
  '3mf': bytes => isZip(bytes),
  step: bytes => /^\s*ISO-10303-21\s*;/.test(stripBom(headText(bytes, 256))),
  stp: bytes => SNIFF.step(bytes),
  ply: bytes => /^ply\r?\n/.test(headText(bytes, 8)),
  // A .splat has no magic: 32-byte records (position, scale float32x3, RGBA, quaternion u8x4). Checked by size and by
  // the first records holding finite numbers.
  splat: (bytes, size = bytes.length) => {
    if (size < 32 || size % 32 !== 0 || isZip(bytes) || isGzip(bytes) || /^ply\r?\n/.test(headText(bytes, 8))) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let r = 0; r < Math.min(8, Math.floor(bytes.length / 32)); r++) for (let k = 0; k < 6; k++) { const v = view.getFloat32(r * 32 + k * 4, true); if (!Number.isFinite(v) || Math.abs(v) > 1e7) return false; }
    return true;
  },
  // KSPLAT (GaussianSplats3D): a 4096-byte header, version 0.1+, at most three compression levels.
  ksplat: bytes => bytes.length >= 4096 && bytes[0] === 0 && bytes[1] >= 1 && (bytes[20] | (bytes[21] << 8)) <= 2 && u32(bytes, 4) > 0 && u32(bytes, 4) < 1_000_000,
  // SPZ (Niantic): gzip around an 'NGSP' header (v1-3), or the raw 'NGSP' v4 container.
  spz: bytes => isGzip(bytes) || u32(bytes, 0) === 0x5053474e,
  sog: bytes => isZip(bytes),
};

// Which format a named file is, by structure: { format } or { error }. The extension picks the candidate; the bytes
// must agree. A .ply is further inspected by inspectPly.
export function sniffModel(name, bytes, size = bytes.length) {
  const ext = extensionOf(name);
  const spec = ENTRY_FORMATS[ext];
  if (!spec) return { error: `${baseName(name)}: not a 3D model format` };
  if (!size) return { error: `${baseName(name)}: the file is empty` };
  if (!SNIFF[ext](bytes, size)) return { error: `${baseName(name)}: this does not look like a valid .${ext} file` };
  return { format: ext, ...spec };
}

// ---- PLY -------------------------------------------------------------------------------------------------------------

const PLY_TYPES = { char: 1, uchar: 1, int8: 1, uint8: 1, short: 2, ushort: 2, int16: 2, uint16: 2, int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
const SPLAT_REQUIRED = ['x', 'y', 'z', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3', 'opacity', 'f_dc_0', 'f_dc_1', 'f_dc_2'];
const SPLAT_MARKERS = ['scale_0', 'rot_0', 'opacity', 'f_dc_0'];
const SH_REST = [0, 9, 24, 45];
// PlayCanvas compressed splat PLY: per-chunk bounds plus packed vertex words.
const COMPRESSED_SPLAT = ['packed_position', 'packed_rotation', 'packed_scale', 'packed_color'];

// The header of a PLY: { format, elements: [{ name, count, properties: [{ name, type, list?: { count, item } }] }],
// headerBytes } or { error }.
export function parsePlyHeader(bytes) {
  const text = headText(bytes);
  const end = text.search(/end_header\r?\n/);
  if (!/^ply\r?\n/.test(text) || end < 0) return { error: 'PLY header is missing or longer than 64 KiB' };
  const headerBytes = new TextEncoder().encode(text.slice(0, end) + text.slice(end).match(/^end_header\r?\n/)[0]).length;
  const lines = text.slice(0, end).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let format = null; const elements = [];
  for (const line of lines.slice(1)) {
    const [word, ...rest] = line.split(/\s+/);
    if (word === 'comment' || word === 'obj_info') continue;
    if (word === 'format') {
      if (!['ascii', 'binary_little_endian', 'binary_big_endian'].includes(rest[0]) || rest[1] !== '1.0') return { error: `PLY format "${rest.join(' ')}" is not supported` };
      format = rest[0];
    } else if (word === 'element') {
      const count = Number(rest[1]);
      if (!rest[0] || !Number.isInteger(count) || count < 0) return { error: `PLY element "${line}" has no valid count` };
      elements.push({ name: rest[0], count, properties: [] });
    } else if (word === 'property') {
      const element = elements.at(-1);
      if (!element) return { error: 'PLY property before any element' };
      if (rest[0] === 'list') {
        if (!PLY_TYPES[rest[1]] || !PLY_TYPES[rest[2]] || !rest[3]) return { error: `PLY list property "${line}" is invalid` };
        element.properties.push({ name: rest[3], type: 'list', list: { count: rest[1], item: rest[2] } });
      } else {
        if (!PLY_TYPES[rest[0]] || !rest[1]) return { error: `PLY property "${line}" has an unknown type` };
        element.properties.push({ name: rest[1], type: rest[0] });
      }
    } else return { error: `PLY header line "${line}" is not understood` };
  }
  if (!format) return { error: 'PLY header has no format line' };
  return { format, elements, headerBytes };
}

// Mesh, point cloud or Gaussian splat, from the header alone; inconsistent schemas are refused with the reason.
// { kind: 'mesh' | 'points' | 'splat', encoding, vertices, faces, splats, shDegree, format } or { error }.
export function inspectPly(bytes, size = bytes.length) {
  const header = parsePlyHeader(bytes);
  if (header.error) return header;
  const schema = plySchema(header);
  if (schema.error || header.format === 'ascii') return schema;
  // Fixed-size elements must fit in the file; list elements add at least their count bytes per row.
  let need = header.headerBytes;
  for (const e of header.elements) for (const p of e.properties) need += e.count * (p.type === 'list' ? PLY_TYPES[p.list.count] : PLY_TYPES[p.type]);
  if (need > size) return { error: `PLY is truncated: its header declares at least ${need} bytes, the file has ${size}` };
  return schema;
}

function plySchema({ format, elements }) {
  const vertex = elements.find(e => e.name === 'vertex');
  const face = elements.find(e => e.name === 'face');
  if (!vertex) return { error: 'PLY has no vertex element' };
  const names = new Set(vertex.properties.map(p => p.name));
  const listInVertex = vertex.properties.find(p => p.type === 'list');
  if (listInVertex) return { error: `PLY vertex element has a list property (${listInVertex.name})` };
  const chunk = elements.find(e => e.name === 'chunk');
  if (COMPRESSED_SPLAT.every(n => names.has(n))) {
    if (!chunk) return { error: 'Compressed splat PLY has packed vertices but no chunk element' };
    return { kind: 'splat', encoding: 'compressed-ply', format, vertices: vertex.count, faces: 0, splats: vertex.count, shDegree: 0 };
  }
  if (COMPRESSED_SPLAT.some(n => names.has(n))) return { error: `PLY declares some compressed-splat properties but not all: missing ${COMPRESSED_SPLAT.filter(n => !names.has(n)).join(', ')}` };
  for (const axis of ['x', 'y', 'z']) if (!names.has(axis)) return { error: `PLY vertices have no ${axis} coordinate` };
  if (SPLAT_MARKERS.some(n => names.has(n))) {
    const missing = SPLAT_REQUIRED.filter(n => !names.has(n));
    if (missing.length) return { error: `PLY declares Gaussian-splat properties but is missing ${missing.join(', ')}` };
    const rest = [...names].filter(n => /^f_rest_\d+$/.test(n)).length;
    const shDegree = SH_REST.indexOf(rest);
    if (shDegree < 0) return { error: `PLY has ${rest} f_rest coefficients; a Gaussian splat has 0, 9, 24 or 45` };
    if (face?.count) return { error: 'PLY declares Gaussian-splat vertices and faces; a splat file has no faces' };
    return { kind: 'splat', encoding: 'ply', format, vertices: vertex.count, faces: 0, splats: vertex.count, shDegree };
  }
  if (face && face.count > 0) {
    const indices = face.properties.find(p => p.type === 'list' && /^vertex_ind(ex|ices)$/.test(p.name));
    if (!indices) return { error: 'PLY has faces but no vertex_indices list' };
    if (!vertex.count) return { error: 'PLY has faces but no vertices' };
    return { kind: 'mesh', encoding: 'ply', format, vertices: vertex.count, faces: face.count, splats: 0, shDegree: 0 };
  }
  if (!vertex.count) return { error: 'PLY has no vertices' };
  return { kind: 'points', encoding: 'ply', format, vertices: vertex.count, faces: 0, splats: 0, shDegree: 0, colored: names.has('red') || names.has('r') };
}

// ---- bundle paths ------------------------------------------------------------------------------------------------------

// A path inside a bundle, normalised ('a/b/c.png'), or null when it would leave the bundle: absolute, a drive or UNC
// path, '..' above the root, a NUL, or empty.
export function bundlePath(path) {
  const raw = String(path ?? '');
  if (!raw || raw.includes('\0')) return null;
  const slashed = raw.replace(/\\/g, '/');
  if (slashed.startsWith('/') || /^[a-z]:/i.test(slashed) || /^[a-z][a-z0-9+.-]*:/i.test(slashed)) return null;
  const parts = [];
  for (const part of slashed.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) return null; parts.pop(); continue; }
    parts.push(part);
  }
  return parts.length ? parts.join('/') : null;
}

// What a model's reference names: { embedded } for a data: URI, { blocked } for any other scheme (http, https, file,
// blob, ...), { path } for a relative path inside the bundle, or { name } for an absolute filesystem path, which is
// only ever matched by its file name among the bundle's files, never read from disk.
export function referenceOf(fromPath, uri) {
  const raw = String(uri ?? '').trim();
  if (!raw) return { blocked: raw };
  if (/^data:/i.test(raw)) return { embedded: true };
  let decoded = raw; try { decoded = decodeURIComponent(raw); } catch { /* keep the raw spelling */ }
  if (/^[a-z]:[\\/]/i.test(decoded) || decoded.startsWith('/') || decoded.startsWith('\\\\') || /^file:/i.test(decoded)) return { name: baseName(decoded.replace(/^file:\/*/i, '')) };
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) return { blocked: raw };
  const dir = String(fromPath || '').includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/') + 1) : '';
  const path = bundlePath(dir + decoded);
  return path ? { path } : { name: baseName(decoded) };
}

// Finds a referenced file among the bundle's paths: exact, then case-insensitive, then a unique file name anywhere in
// the bundle (exporters often write the author's absolute texture path).
export function findInBundle(paths, ref) {
  if (ref.path) {
    if (paths.includes(ref.path)) return ref.path;
    const lower = paths.find(p => p.toLowerCase() === ref.path.toLowerCase());
    if (lower) return lower;
  }
  const name = (ref.name || baseName(ref.path)).toLowerCase();
  const named = paths.filter(p => baseName(p).toLowerCase() === name);
  return named.length === 1 ? named[0] : null;
}

// ---- dependencies ------------------------------------------------------------------------------------------------------

const text = bytes => stripBom(new TextDecoder().decode(bytes));
// glTF extensions the viewer cannot decode (no transcoder or decoder is bundled).
const UNSUPPORTED_GLTF = { KHR_draco_mesh_compression: 'Draco-compressed meshes', KHR_texture_basisu: 'Basis Universal (KTX2) textures', EXT_texture_webp: null, EXT_meshopt_compression: null };

// The JSON of a .glb or .gltf.
export function gltfJson(format, bytes) {
  if (format === 'gltf') return JSON.parse(text(bytes));
  if (!SNIFF.glb(bytes) || bytes.length < 20 || u32(bytes, 16) !== 0x4e4f534a) throw new Error('Use a valid binary glTF 2.0 (.glb) model');
  const length = u32(bytes, 12);
  if (20 + length > bytes.length) throw new Error('Invalid GLB header');
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
}

// Every external file a glTF names: buffers and images with a uri. Also the up-front refusals: required extensions
// we cannot decode, and the existing node / accessor bounds.
export function gltfDependencies(path, format, bytes) {
  const json = gltfJson(format, bytes);
  const uris = [...(json.buffers || []).map(b => b.uri), ...(json.images || []).map(i => i.uri)].filter(u => u != null);
  const unsupported = (json.extensionsRequired || []).filter(name => UNSUPPORTED_GLTF[name]).map(name => UNSUPPORTED_GLTF[name]);
  const elements = (json.accessors || []).reduce((n, a) => n + (a.count || 0), 0);
  const tooComplex = (json.nodes?.length || 0) > MODEL_LIMITS.nodes || elements > MODEL_LIMITS.accessorElements;
  return { uris, unsupported, tooComplex, animations: (json.animations || []).length, units: 'm' };
}

// mtllib names in an OBJ; the rest of the line is one name when no space-split part exists (names may hold spaces).
export function objDependencies(bytes) {
  const names = [];
  for (const match of text(bytes).matchAll(/^\s*mtllib\s+(.+?)\s*$/gm)) names.push(match[1]);
  return { uris: names };
}
// Texture maps in an MTL: the file name is the last token after any -options.
export function mtlDependencies(bytes) {
  const uris = [];
  for (const match of text(bytes).matchAll(/^\s*(map_\w+|bump|disp|decal|refl|norm)\s+(.+?)\s*$/gim)) {
    const tokens = match[2].split(/\s+/); uris.push(tokens.at(-1));
  }
  return { uris: [...new Set(uris)] };
}

// The SOG (PlayCanvas) meta.json of an unpacked splat folder names its WebP planes.
export function sogFiles(json) {
  if (!json || typeof json !== 'object') return null;
  if (!['means', 'scales', 'quats', 'sh0'].every(k => json[k]?.files?.length)) return null;
  return Object.values(json).flatMap(v => v?.files || []).filter(f => typeof f === 'string');
}

// The 3MF unit (3D/3dmodel.model, default millimetre: 3MF Core spec 2.1).
export function threeMfUnit(modelXml) {
  const match = /<model\b[^>]*\bunit\s*=\s*"([a-z]+)"/i.exec(modelXml);
  return { micron: 'µm', millimeter: 'mm', centimeter: 'cm', inch: 'in', foot: 'ft', meter: 'm' }[(match?.[1] || 'millimeter').toLowerCase()] || null;
}

// ---- planning a bundle -------------------------------------------------------------------------------------------------

// Every model in a set of files and what each needs. `files` is [{ path, bytes }] (bytes: the whole file - bundles are
// small and already bounded). A dependency is resolved only to a path in `files`; a network URL is blocked and listed;
// a missing file is listed by name. Returns { entries: [{ path, format, family, render, label, deps, missing, blocked,
// unsupported, ply?, units, error?, limitation? }], unused: [paths] }. `error`: not a valid model (refused); `limitation`:
// a valid model the viewer will not render (the card keeps the original and says why).
export function planBundle(files) {
  const paths = files.map(f => f.path);
  const byPath = new Map(files.map(f => [f.path, f]));
  const used = new Set();
  const entries = [];
  // An unpacked SOG folder: a meta.json naming its planes.
  for (const f of files) {
    if (baseName(f.path).toLowerCase() !== 'meta.json') continue;
    let names = null; try { names = sogFiles(JSON.parse(text(f.bytes))); } catch { /* not a SOG meta */ }
    if (!names) continue;
    const deps = [], missing = [];
    for (const name of names) { const hit = findInBundle(paths, referenceOf(f.path, name)); if (hit) deps.push(hit); else missing.push(name); }
    used.add(f.path); deps.forEach(d => used.add(d));
    entries.push({ path: f.path, format: 'sog', family: 'splat', render: 'splat', label: 'Gaussian splat', packed: 'sog-folder', deps, missing, blocked: [], unsupported: [], units: null });
  }
  for (const f of files) {
    if (!isModelEntryName(f.path)) continue;
    const entry = { path: f.path, deps: [], missing: [], blocked: [], unsupported: [], units: null };
    const sniffed = sniffModel(f.path, f.bytes);
    if (sniffed.error) { entries.push({ ...entry, format: extensionOf(f.path), error: sniffed.error }); continue; }
    Object.assign(entry, { format: sniffed.format, family: sniffed.family, render: sniffed.render, label: sniffed.label });
    const resolve = (from, uris) => {
      const found = [];
      for (const uri of uris) {
        const ref = referenceOf(from, uri);
        if (ref.embedded) continue;
        if (ref.blocked !== undefined) { entry.blocked.push(String(uri)); continue; }
        const hit = findInBundle(paths, ref);
        if (hit) { if (!entry.deps.includes(hit)) { entry.deps.push(hit); found.push(hit); } } else entry.missing.push(ref.name || baseName(ref.path));
      }
      return found;
    };
    try {
      if (entry.family === 'gltf') {
        const deps = gltfDependencies(f.path, entry.format, f.bytes);
        entry.units = deps.units; entry.unsupported = deps.unsupported; entry.animations = deps.animations;
        if (deps.tooComplex) entry.limitation = `the model is too complex for the viewer (over ${MODEL_LIMITS.nodes} nodes or ${MODEL_LIMITS.accessorElements.toLocaleString('en-US')} vertex elements)`;
        resolve(f.path, deps.uris);
      } else if (entry.format === 'obj') {
        for (const mtl of resolve(f.path, objDependencies(f.bytes).uris)) resolve(mtl, mtlDependencies(byPath.get(mtl).bytes).uris);
      } else if (entry.format === 'ply') {
        const ply = inspectPly(f.bytes);
        if (ply.error) entry.error = `${baseName(f.path)}: ${ply.error}`;
        else { entry.ply = ply; entry.render = ply.kind; entry.family = ply.kind === 'splat' ? 'splat' : 'ply'; entry.label = { mesh: 'PLY mesh', points: 'Point cloud', splat: 'Gaussian splat' }[ply.kind]; }
      }
    } catch (problem) { entry.error = `${baseName(f.path)}: ${problem.message}`; }
    if (entry.unsupported.length) entry.limitation = `it uses ${entry.unsupported.join(' and ')}, which this viewer cannot decode`;
    used.add(f.path); entry.deps.forEach(d => used.add(d));
    entries.push(entry);
  }
  return { entries, unused: paths.filter(p => !used.has(p)) };
}

// Short counts for a card: PLY and binary STL counts are known from their headers; others come from the loaded model.
export function headerCounts(entry, bytes) {
  if (entry.ply) return entry.ply.kind === 'splat' ? { splats: entry.ply.splats } : entry.ply.kind === 'points' ? { points: entry.ply.vertices } : { vertices: entry.ply.vertices, faces: entry.ply.faces };
  if (entry.format === 'stl' && bytes.length >= 84 && 84 + u32(bytes, 80) * 50 === bytes.length) return { triangles: u32(bytes, 80) };
  if (entry.format === 'splat') return { splats: bytes.length / 32 };
  if (entry.format === 'ksplat' && bytes.length >= 20) return { splats: u32(bytes, 16) };
  return {};
}

// A budget check on counts (header or loaded). Returns the visible reason or null.
export function overBudget(counts = {}) {
  const rows = [['triangles', 'triangles'], ['vertices', 'vertices'], ['points', 'points'], ['splats', 'splats'], ['faces', 'triangles']];
  for (const [key, limit] of rows) if (counts[key] > MODEL_LIMITS[limit]) return `${counts[key].toLocaleString('en-US')} ${key} is above the ${MODEL_LIMITS[limit].toLocaleString('en-US')} this viewer renders`;
  if (counts.textureBytes > MODEL_LIMITS.textureBytes) return `its textures need ${Math.round(counts.textureBytes / MiB)} MiB decoded, above the ${MODEL_LIMITS.textureBytes / MiB} MiB this viewer renders`;
  return null;
}

// A size line only when the source unit is known (glTF metres, 3MF's declared unit, STEP's converter-reported unit).
export function sizeLabel(size, units) {
  if (!units || !size?.every?.(Number.isFinite)) return null;
  const fmt = n => (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2));
  return `${size.map(fmt).join(' × ')} ${units}`;
}
