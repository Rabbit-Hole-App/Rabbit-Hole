// ZIP containers for multi-file models and splat packages (file-imports Lane 4). A ZIP is only ever read as a model
// package: its central directory is checked before anything is inflated - no traversal ('..', absolute, drive or UNC
// paths), no symlinks, no encryption, no ZIP64, bounded entry count, bounded expanded size and ratio - and each entry is
// inflated in small slices with its output counted, so a lying header cannot expand past its declared size.
// fflate is the copy three.js ships (three/addons/libs), already used by its 3MF and FBX loaders.
import { Inflate, zipSync } from 'three/addons/libs/fflate.module.js';
import { MODEL_LIMITS, bundlePath, isModelEntryName, isDependencyName, isContainerName } from './model-formats.js';

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

// The archive's entries from its central directory: [{ name, path, method, compressed, size, offset }]. Throws the
// visible reason when the archive is unsafe or unsupported.
export function zipEntries(bytes, limits = MODEL_LIMITS) {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This ZIP has no central directory (damaged or not a ZIP)');
  const count = u16(bytes, eocd + 10), dirSize = u32(bytes, eocd + 12), dirOffset = u32(bytes, eocd + 16);
  if (count === 0xffff || dirOffset === 0xffffffff || dirSize === 0xffffffff) throw new Error('ZIP64 archives are not supported');
  if (count > limits.archiveEntries) throw new Error(`This ZIP has ${count} entries; a model package may have at most ${limits.archiveEntries}`);
  if (dirOffset + dirSize > bytes.length) throw new Error('This ZIP is truncated');
  const entries = [], seen = new Set();
  let at = dirOffset, total = 0;
  for (let n = 0; n < count; n++) {
    if (u32(bytes, at) !== 0x02014b50) throw new Error('This ZIP has a damaged central directory');
    const madeBy = u16(bytes, at + 4) >> 8, flags = u16(bytes, at + 8), method = u16(bytes, at + 10);
    const compressed = u32(bytes, at + 20), size = u32(bytes, at + 24);
    const nameLength = u16(bytes, at + 28), extraLength = u16(bytes, at + 30), commentLength = u16(bytes, at + 32);
    const external = u32(bytes, at + 38), offset = u32(bytes, at + 42);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/') || name.endsWith('\\')) continue; // a directory
    const path = bundlePath(name);
    if (!path) throw new Error(`This ZIP has an entry outside the package (${name}); it was not opened`);
    if ((madeBy === 3 || madeBy === 19) && ((external >>> 16) & 0xf000) === 0xa000) throw new Error(`This ZIP has a symbolic link (${name}); it was not opened`);
    if (flags & 1) throw new Error('Encrypted ZIP entries are not supported');
    if (method !== 0 && method !== 8) throw new Error(`${name}: ZIP compression method ${method} is not supported`);
    if (seen.has(path.toLowerCase())) throw new Error(`This ZIP has two entries named ${path}`);
    seen.add(path.toLowerCase());
    if (path.split('/').some(part => part === '__MACOSX') || path.split('/').pop().startsWith('._')) continue; // Finder metadata
    total += size;
    if (total > limits.archiveBytes) throw new Error(`This ZIP expands past ${Math.round(limits.archiveBytes / 1048576)} MiB; a model package must be smaller`);
    if (compressed && size / compressed > limits.archiveRatio && size > 1048576) throw new Error(`${name} expands ${Math.round(size / compressed)}x; that looks like a decompression bomb`);
    entries.push({ name, path, method, compressed, size, offset });
  }
  return entries;
}

// One entry's bytes, inflated in 16 KiB slices with its output bounded by the declared size.
export function zipEntryBytes(bytes, entry) {
  if (u32(bytes, entry.offset) !== 0x04034b50) throw new Error(`${entry.name}: damaged ZIP entry`);
  const start = entry.offset + 30 + u16(bytes, entry.offset + 26) + u16(bytes, entry.offset + 28);
  const data = bytes.subarray(start, start + entry.compressed);
  if (data.length !== entry.compressed) throw new Error(`${entry.name}: truncated ZIP entry`);
  if (entry.method === 0) { if (entry.compressed !== entry.size) throw new Error(`${entry.name}: damaged ZIP entry`); return data.slice(); }
  const out = new Uint8Array(entry.size); let written = 0;
  const inflate = new Inflate();
  inflate.ondata = chunk => {
    if (written + chunk.length > entry.size) throw new Error(`${entry.name} expands past its declared size; it was not opened`);
    out.set(chunk, written); written += chunk.length;
  };
  for (let i = 0; i < data.length; i += 16384) inflate.push(data.subarray(i, i + 16384), i + 16384 >= data.length);
  if (!data.length) inflate.push(new Uint8Array(0), true);
  if (written !== entry.size) throw new Error(`${entry.name}: expanded to ${written} bytes, not the declared ${entry.size}`);
  return out;
}

// The files of a model package: entries a model can be or depend on, plus every name (so a missing-file message can
// tell the learner what the ZIP did hold). Nested ZIPs are listed, never expanded.
export function readModelZip(bytes, limits = MODEL_LIMITS) {
  const entries = zipEntries(bytes, limits);
  const files = [], skipped = [];
  for (const entry of entries) {
    if (isContainerName(entry.path)) { skipped.push(entry.path); continue; }
    if (!isModelEntryName(entry.path) && !isDependencyName(entry.path) && !/\.(webp|model|rels|xml)$/i.test(entry.path)) { skipped.push(entry.path); continue; }
    files.push({ path: entry.path, bytes: zipEntryBytes(bytes, entry) });
  }
  return { files, skipped };
}

// Loose files dropped together (a .gltf with its .bin and textures) kept as one stored ZIP, so the card has one original
// and the board one asset. Stored, not deflated: the originals are already compressed formats or small text. A fixed
// date keeps the same files the same bytes.
export function packBundle(files) {
  const tree = {};
  for (const { path, bytes } of files) tree[path] = [bytes, { level: 0, mtime: new Date('2020-01-01T00:00:00Z') }];
  return zipSync(tree);
}
