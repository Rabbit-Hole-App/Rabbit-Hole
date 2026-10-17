// Dropped or uploaded 3D files become model cards (file-imports Lane 4). Imported lazily by the canvas page when a drop
// holds a model name, a ZIP or a folder (model-drop.js). Deterministic: no model call, no network, nothing executed.
//
// One logical card per model: a .gltf with its .bin and textures, or an .obj with its .mtl and textures, is one card
// whose original is one stored ZIP of exactly those files (packBundle), so the board holds one asset and Download gives
// the learner their files back. A dropped ZIP or folder is one package: one card, and when it holds several independent
// models the card asks which one to show. Loose files nobody references (a photo dropped alongside) go back to the
// ordinary drop path.
import { MODEL_LIMITS, ENTRY_FORMATS, baseName, extensionOf, headerCounts, isContainerName, isDependencyName, isModelEntryName, planBundle, threeMfUnit } from './model-formats.js';
import { packBundle, readModelZip, zipEntries, zipEntryBytes } from './model-archive.js';
import { familyOf } from './file-capabilities.js';

const MiB = 1048576;
const tooBig = (name, bytes) => `${name}: 3D files up to ${MODEL_LIMITS.bytes / MiB} MiB (this one is ${(bytes / MiB).toFixed(1)} MiB)`;
const bytesOf = async file => new Uint8Array(await file.arrayBuffer());
const MAX_ENTRIES_LISTED = 20;

export const CARD_SIZE = { w: 560, h: 460 };

// The registry family each stored file of a bundle is uploaded as, so the server checks it as what it is: a texture as an
// image, a SOG meta.json as JSON, another model by its own family, a .bin / .mtl as a model part.
export const partFamily = path => { const f = familyOf({ name: path }); return f && f.id !== 'model-package' ? f.id : 'model-part'; };

// The card's compact record (no bytes, no dependency lists: those are re-read from the stored original when it opens).
export function modelBlock({ assetKey, label, size, entry, entries = null, packageKind, download, counts = {}, units = null }) {
  return {
    id: crypto.randomUUID(), type: 'file', kind: 'model', dx: 0, dy: 0, assetKey, label, size,
    model: {
      v: 1, family: entry?.family ?? null, format: entry?.format ?? null, render: entry?.render ?? null,
      package: packageKind, entry: entry?.path ?? null, download,
      ...(entries ? { entries: entries.slice(0, MAX_ENTRIES_LISTED).map(e => ({ path: e.path, label: e.label, format: e.format })) } : {}),
      ...(Object.keys(counts).length ? { counts } : {}), ...(units ? { units } : {}),
    },
    camera: {},
  };
}

// 3MF: the archive guards and its declared unit, before three's own unzip ever sees it.
function threeMfInfo(bytes) {
  const model = zipEntries(bytes).find(e => /\.model$/i.test(e.path));
  if (!model) throw new Error('this 3MF has no 3D model part');
  return { units: threeMfUnit(new TextDecoder().decode(zipEntryBytes(bytes, model))) };
}
// SOG: a ZIP that must hold a SOG meta.json (checked with the same guards).
function checkSog(bytes) {
  const meta = zipEntries(bytes).find(e => baseName(e.path).toLowerCase() === 'meta.json');
  if (!meta) throw new Error('this .sog has no meta.json');
}

// Extra facts a card shows from the original alone.
function entryFacts(entry, bytes) {
  const facts = { counts: headerCounts(entry, bytes), units: entry.units || null };
  if (entry.format === '3mf') facts.units = threeMfInfo(bytes).units;
  if (entry.format === 'sog' && !entry.packed) checkSog(bytes);
  return facts;
}

// Files in -> { cards: [{ block, blob }], leftovers: [File], errors: [string] }. The caller caches each blob under its
// block's assetKey and places the cards in input order.
export async function importModelFiles(files) {
  const cards = [], leftovers = [], errors = [];
  const containers = files.filter(f => !f.bundleRoot && isContainerName(f.name));
  const folders = new Map();
  for (const f of files) if (f.bundleRoot) folders.set(f.bundleRoot, [...(folders.get(f.bundleRoot) || []), f]);
  const loose = files.filter(f => !f.bundleRoot && !isContainerName(f.name));

  // Loose files: each model is its own card with the files it names.
  const candidates = loose.filter(f => isModelEntryName(f.name) || isDependencyName(f.name));
  for (const f of loose) if (!candidates.includes(f)) leftovers.push(f);
  if (candidates.some(f => isModelEntryName(f.name))) {
    const read = [];
    for (const f of candidates) {
      if (f.size > MODEL_LIMITS.bytes) { errors.push(tooBig(f.name, f.size)); continue; }
      read.push({ path: f.name, bytes: await bytesOf(f), file: f });
    }
    const plan = planBundle(read);
    for (const entry of plan.entries) {
      try {
        if (entry.error) throw new Error(entry.error);
        const own = read.find(r => r.path === entry.path);
        const facts = entryFacts(entry, own.bytes);
        const group = [own, ...entry.deps.map(d => read.find(r => r.path === d))];
        const total = group.reduce((n, r) => n + r.bytes.length, 0);
        if (total > MODEL_LIMITS.bytes) throw new Error(tooBig(entry.path, total));
        const packed = group.length > 1;
        const blob = packed ? new Blob([packBundle(group)], { type: 'application/zip' }) : own.file;
        const name = packed ? `${entry.path.replace(/\.[^.]+$/, '')}.zip` : entry.path;
        // parts: the files as dropped, one source each once file-source-client.js stores them (model-storage.js).
        const parts = group.map((r, i) => ({ path: r.path, file: r.file, family: i ? partFamily(r.path) : entry.family }));
        cards.push({ block: modelBlock({ assetKey: `model:${crypto.randomUUID()}`, label: entry.path, size: blob.size, entry, packageKind: packed ? 'zip' : 'file', download: name, ...facts }), blob, parts, sourcePath: entry.path });
      } catch (problem) { errors.push(problem.message.startsWith(baseName(entry.path)) ? problem.message : `${baseName(entry.path)}: ${problem.message}`); }
    }
    // A texture no model named goes back to the ordinary drop path (an image becomes an image card); a .bin, .mtl or
    // .json nobody named is said so here, since it is no card on its own.
    for (const path of plan.unused) { const f = read.find(r => r.path === path).file; if (partFamily(path) === 'model-part' || /\.json$/i.test(path)) errors.push(`${f.name}: no model in this drop uses this file`); else leftovers.push(f); }
  } else leftovers.push(...candidates);

  // A ZIP or a folder is one package: one card.
  const packages = [
    ...containers.map(f => ({ name: f.name, size: f.size, read: async () => readModelZip(await bytesOf(f)).files, original: () => f })),
    ...[...folders.entries()].map(([root, list]) => ({ name: root, size: list.reduce((n, f) => n + f.size, 0), list })),
  ];
  for (const pack of packages) {
    try {
      if (pack.size > MODEL_LIMITS.bytes) throw new Error(tooBig(pack.name, pack.size));
      let inner, blob;
      if (pack.list) {
        const relevant = pack.list.filter(f => isModelEntryName(f.bundlePath) || isDependencyName(f.bundlePath) || /\.webp$/i.test(f.bundlePath));
        inner = await Promise.all(relevant.map(async f => ({ path: f.bundlePath, bytes: await bytesOf(f), file: f })));
        blob = new Blob([packBundle(inner)], { type: 'application/zip' });
      } else { inner = await pack.read(); blob = pack.original(); }
      const plan = planBundle(inner);
      const valid = plan.entries.filter(e => !e.error);
      if (!valid.length) throw new Error(plan.entries[0]?.error || `${pack.name}: holds no 3D model or splat package (a ZIP is opened only as a model package)`);
      const only = valid.length === 1 ? valid[0] : null;
      const facts = only ? entryFacts(only, inner.find(f => f.path === only.path).bytes) : {};
      const download = pack.list ? `${pack.name}.zip` : pack.name;
      // A ZIP stays one source (the original); a folder is one source per file, its entry (or first model) the main one.
      const main = (only || valid[0]).path;
      const parts = pack.list ? inner.map(f => ({ path: f.path, file: f.file, family: f.path === main ? (only || valid[0]).family : partFamily(f.path) })) : [{ path: pack.name, file: blob, family: 'model-package' }];
      const block = modelBlock({ assetKey: `model:${crypto.randomUUID()}`, label: pack.name, size: blob.size, entry: only, entries: only ? null : valid, packageKind: 'zip', download, ...facts });
      if (pack.list) block.model.package = 'folder';
      cards.push({ block, blob, parts, sourcePath: pack.list ? main : pack.name });
    } catch (problem) { errors.push(problem.message.includes(pack.name) ? problem.message : `${pack.name}: ${problem.message}`); }
  }
  return { cards, leftovers, errors };
}

// What a card's original holds, re-read when it opens: { files: Map(path -> bytes), plan }.
export async function openModelPackage(block, blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const list = ['zip', 'folder'].includes(block.model.package) ? readModelZip(bytes).files : [{ path: block.model.entry || block.label, bytes }];
  return { files: new Map(list.map(f => [f.path, f.bytes])), plan: planBundle(list) };
}

// Supplying missing files to a card: the stored files plus the new ones, as one ZIP, re-planned.
export const checkAddedFiles = added => { for (const f of added) if (!isDependencyName(f.name) && !isModelEntryName(f.name)) throw new Error(`${f.name}: add the model's own files (.bin, .mtl, textures)`); };
export async function addFilesToPackage(block, blob, added) {
  checkAddedFiles(added);
  const { files } = await openModelPackage(block, blob);
  const entryDir = (block.model.entry || '').includes('/') ? block.model.entry.slice(0, block.model.entry.lastIndexOf('/') + 1) : '';
  for (const f of added) {
    files.set(entryDir + f.name, await bytesOf(f));
  }
  const list = [...files.entries()].map(([path, bytes]) => ({ path, bytes }));
  const packed = new Blob([packBundle(list)], { type: 'application/zip' });
  if (packed.size > MODEL_LIMITS.bytes) throw new Error(tooBig(block.label, packed.size));
  return { blob: packed, block: { ...block, assetKey: `model:${crypto.randomUUID()}`, size: packed.size, model: { ...block.model, package: block.model.package === 'folder' ? 'folder' : 'zip', download: block.model.package !== 'file' ? block.model.download : `${(block.model.entry || block.label).replace(/\.[^.]+$/, '')}.zip` } } };
}

export const modelKindLabel = model => (model?.render === 'splat' ? 'Gaussian splat' : model?.render === 'points' ? 'Point cloud' : model?.render === 'cad' ? 'CAD model' : '3D model');
export const formatLabel = format => (format ? `${ENTRY_FORMATS[format]?.label || format.toUpperCase()} (.${format})` : '');
export { extensionOf };
