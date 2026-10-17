// Where a model card's files live (file-imports Lane 4), through Lane 2's file-source-client.js: one source per file.
//   fileRef.source  the entry file, or the dropped ZIP (then view.entry is the model's path inside it)
//   fileRef.bundle  [{ path, source: { id, rev } }] the card's other files (lead-approved shape, 2026-10-16)
// While a file uploads, its entry carries `local` (this browser's copy, startUpload's key) and `source: null`; the card
// writes each stored source in as its upload finishes (useModelUploads), so the next board save names it. Dependencies
// resolve only to this card's own entries (or the entries inside its one ZIP) - never a URL, never another card's sources.
// Cards made before fileRef (assetKey) still open. The client is the real module; tests and the harness swap it.
import { useEffect, useState } from 'react';
import * as fileSources from './file-source-client.js';
import { cacheAsset } from './learn-asset-cache.js';
import { loadAsset } from './learn-board-assets.js';
import { packBundle, readModelZip } from './model-archive.js';
import { planBundle } from './model-formats.js';
import { addFilesToPackage, checkAddedFiles, partFamily } from './model-import.js';

let client = fileSources, cache = cacheAsset;
// Tests and the harness: a stand-in client (and, in Node, a stand-in local cache).
export const setSourceClient = (next, localCache = null) => { client = next || fileSources; cache = localCache || cacheAsset; };
const localKey = () => `model:${crypto.randomUUID()}`;
const bytesOf = async blob => new Uint8Array(await blob.arrayBuffer());

// A card from model-import.js ({ block, parts, sourcePath }) ready to place: each part cached under its own local key and
// its upload started (startUpload waits for an unsaved board, and resumes after a reload from the local copy).
export async function placeModelCard(card) {
  const { assetKey, ...block } = card.block;
  const parts = [];
  for (const part of card.parts) {
    const local = localKey();
    await cache(local, part.file);
    client.startUpload(local, { family: part.family, file: part.file, name: part.file.name });
    parts.push({ ...part, local });
  }
  const main = parts.find(p => p.path === card.sourcePath) || parts[0];
  return {
    ...block,
    fileRef: {
      v: 1, source: null, local: main.local, family: main.family,
      meta: { name: main.file.name, type: main.file.type || '', size: main.file.size, title: block.label },
      // view.entry: inside the ZIP source, the chosen model (null while the card asks); otherwise the main file's own path.
      view: { entry: main.family === 'model-package' ? block.model.entry : main.path, camera: null },
      ...(parts.length > 1 ? { bundle: parts.filter(p => p !== main).map(p => ({ path: p.path, source: null, local: p.local, family: p.family })) } : {}),
      job: null, doc: null, status: { preview: 'ready', context: 'listed' },
    },
  };
}

// Every upload the card still waits for: [{ key, family, name }] (the main source first).
export const pendingUploads = block => {
  const ref = block.fileRef; if (!ref) return [];
  return [
    ...(!ref.source?.id && ref.local ? [{ key: ref.local, family: ref.family, name: ref.meta?.name }] : []),
    ...(ref.bundle || []).filter(b => !b.source?.id && b.local).map(b => ({ key: b.local, family: b.family || 'model-part', name: b.path.split('/').pop() })),
  ];
};
// A stored upload written into the card: only the entry that still names that local key and has no source.
export function withStored(block, key, source) {
  const ref = block.fileRef; if (!ref) return block;
  const stored = { id: source.id, rev: source.rev };
  if (ref.local === key && !ref.source?.id) { const { local: _local, ...rest } = ref; return { ...block, fileRef: { ...rest, source: stored } }; }
  if (!(ref.bundle || []).some(b => b.local === key && !b.source?.id)) return block;
  const done = ({ local: _local, ...rest }) => ({ ...rest, source: stored });
  return { ...block, fileRef: { ...ref, bundle: ref.bundle.map(b => (b.local === key && !b.source?.id ? done(b) : b)) } };
}

// The card's uploads: watched, started where this page may write, and each stored source written in through `update`.
// Returns { pending, failed: [{ name, error }], retry }.
export function useModelUploads(block, update) {
  const keys = pendingUploads(block);
  const signature = keys.map(k => k.key).join(',');
  const [states, setStates] = useState({});
  useEffect(() => {
    if (!keys.length) { setStates({}); return undefined; }
    const offs = keys.map(({ key, family, name }) => {
      const take = next => {
        setStates(previous => ({ ...previous, [key]: next }));
        if (next?.stage === 'stored') update(current => withStored(current, key, next.source));
      };
      const off = client.watchUpload(key, take);
      if (client.canWrite()) client.startUpload(key, { family, name });
      take(client.uploadState(key));
      return off;
    });
    return () => offs.forEach(off => off());
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  const failed = keys.map(k => ({ name: k.name, ...states[k.key] })).filter(s => s.stage === 'failed');
  const retry = () => { for (const k of keys) if (states[k.key]?.stage === 'failed') client.startUpload(k.key, { family: k.family, name: k.name }); };
  return { pending: keys.length, failed, retry };
}

// The card's files, read back: { files: Map(path -> bytes), plan, download: Blob }. Only this card's own entries are read.
export async function openModelFiles(block) {
  const model = block.model || {};
  const ref = block.fileRef;
  if (!ref) {
    const value = await loadAsset(block.assetKey);
    if (!value) throw new Error('This model is not in this browser or saved with the board yet.');
    const bytes = await bytesOf(value instanceof Blob ? value : new Blob([value]));
    const list = model.package === 'file' ? [{ path: model.entry || block.label, bytes }] : readModelZip(bytes).files;
    return { files: new Map(list.map(f => [f.path, f.bytes])), plan: planBundle(list), download: value instanceof Blob ? value : new Blob([bytes]) };
  }
  const read = async entry => {
    const blob = await client.loadSource({ ...block, fileRef: { ...ref, source: entry.source, local: entry.local } });
    if (!blob) throw new Error('A file of this model is not in this browser or saved to the account yet.');
    return bytesOf(blob);
  };
  const mainBytes = await read(ref);
  let list;
  // The dropped ZIP is one source: view.entry is a path inside it. Otherwise the main source is the entry file itself.
  if (ref.family === 'model-package') list = readModelZip(mainBytes).files;
  else {
    list = [{ path: ref.view?.entry || ref.meta?.name || 'model', bytes: mainBytes }];
    for (const dep of ref.bundle || []) list.push({ path: dep.path, bytes: await read(dep) });
  }
  // One original downloads as itself; a bundle of sources downloads together as a ZIP of the originals.
  const download = ref.family === 'model-package' || list.length === 1 ? new Blob([mainBytes]) : new Blob([packBundle(list)], { type: 'application/zip' });
  return { files: new Map(list.map(f => [f.path, f.bytes])), plan: planBundle(list), download };
}

// Supplying missing files: each added file becomes one more bundle entry (its upload starts now) and the card changes
// through the normal board save. An older asset card repacks its stored ZIP instead.
export async function addModelFiles(block, added, { blob } = {}) {
  checkAddedFiles(added);
  if (!block.fileRef) { const next = await addFilesToPackage(block, blob, added); await cache(next.block.assetKey, next.blob); return next.block; }
  const entry = block.fileRef.view?.entry || '';
  const dir = block.fileRef.family !== 'model-package' && entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/') + 1) : '';
  const bundle = [...(block.fileRef.bundle || [])];
  for (const file of added) {
    const local = localKey(), family = partFamily(file.name);
    await cache(local, file);
    client.startUpload(local, { family, file, name: file.name });
    bundle.push({ path: dir + file.name, source: null, local, family });
  }
  return { ...block, fileRef: { ...block.fileRef, bundle } };
}

// Choosing which model of a package the card shows. In a ZIP source only view.entry moves; with one source per file the
// chosen file becomes the main source and the previous main joins the bundle, so every path keeps its own bytes.
export function chooseModel(block, entry) {
  const model = { ...block.model, entry: entry.path, family: entry.family, format: entry.format, render: entry.render };
  const ref = block.fileRef;
  if (!ref) return { ...block, model };
  if (ref.family === 'model-package') return { ...block, model, fileRef: { ...ref, view: { ...ref.view, entry: entry.path } } };
  const chosen = (ref.bundle || []).find(b => b.path === entry.path);
  if (!chosen) return { ...block, model };
  const previous = { path: ref.view.entry, source: ref.source, ...(ref.local ? { local: ref.local } : {}), family: ref.family };
  const { local: _local, ...base } = ref;
  return { ...block, model, fileRef: { ...base, source: chosen.source, ...(chosen.local ? { local: chosen.local } : {}), family: entry.family, meta: { ...ref.meta, name: entry.path.split('/').pop() }, view: { ...ref.view, entry: entry.path }, bundle: [...ref.bundle.filter(b => b !== chosen), previous] } };
}

// Context cards carry only their stored source. Reconstruct the same view from its parsed bytes, never its name alone.
export function modelFromPlan(block, plan) {
  if (block.model) return block.model;
  const entries = (plan?.entries || []).filter(entry => !entry.error);
  const selected = entries.find(entry => entry.path === block.fileRef?.view?.entry) || (entries.length === 1 ? entries[0] : null);
  return { v: 1, family: selected?.family || block.fileRef?.family, format: selected?.format || null,
    render: selected?.render || null, entry: selected?.path || null,
    package: block.fileRef?.family === 'model-package' ? 'zip' : 'file', download: block.fileRef?.meta?.name || block.label,
    ...(!selected && entries.length > 1 ? { entries: entries.map(({ path, label, format }) => ({ path, label, format })) } : {}) };
}
