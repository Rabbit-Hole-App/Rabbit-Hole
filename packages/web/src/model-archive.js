// ZIP containers for multi-file models and splat packages (file-imports Lane 4). A ZIP is only ever read as a model
// package: its central directory is checked before anything is inflated - no traversal ('..', absolute, drive or UNC
// paths), no symlinks, no encryption, no ZIP64, bounded entry count, bounded expanded size and ratio - and each entry is
// inflated in small slices with its output counted, so a lying header cannot expand past its declared size.
// fflate is the copy three.js ships (three/addons/libs), already used by its 3MF and FBX loaders.
import { Inflate, zipSync } from 'three/addons/libs/fflate.module.js';
import { MODEL_LIMITS, isModelEntryName, isDependencyName, isContainerName, zipEntries } from './model-formats.js';

export { zipEntries };
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

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
