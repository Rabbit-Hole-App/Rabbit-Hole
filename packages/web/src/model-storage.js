// Where a model card's files live (file-imports Lane 4). Two shapes, one reader:
//   fileRef (contract section 3; lead 2026-10-16): one source per file through Lane 2's file-source-client.js -
//     fileRef.source is the entry file (or the dropped ZIP), view.entry its path (inside the ZIP when it is one), and
//     fileRef.bundle = [{ path, source: { id, rev } }] the card's other files. Dependencies resolve only to these.
//   board asset (before the client): assetKey names one stored blob - the original, or a stored ZIP of loose files.
// The client is injected (setSourceClient) so this module codes against its signature before it lands:
//   uploadSource(file, { app, board, family }) -> { id, rev } (or { source: { id, rev } }); loadSource(block) -> Blob
// ponytail: LearnPage calls setSourceClient(await import('./file-source-client.js')) once Lane 2 commits it.
import { cacheAsset } from './learn-asset-cache.js';
import { loadAsset } from './learn-board-assets.js';
import { packBundle, readModelZip } from './model-archive.js';
import { addFilesToPackage, checkAddedFiles, partFamily } from './model-import.js';
import { planBundle } from './model-formats.js';

let client = null, where = {};
// `context`: { app, board } of the open canvas, for uploads a card makes itself (Add the missing files).
export const setSourceClient = (next, context = {}) => { client = next; where = context; };
export const sourceClient = () => client;

const sourceOf = result => { const source = result?.source || result; if (!source?.id || !source?.rev) throw new Error('The file could not be stored'); return { id: source.id, rev: source.rev }; };
const bytesOf = async blob => new Uint8Array(await blob.arrayBuffer());

// A card from model-import.js ({ block, blob, parts }) stored and ready to place: with the client, every part becomes its
// own source and the card a fileRef card; without it, the blob is cached under the card's asset key (synced with the board).
export async function storeModelCard(card, { app, board } = where) {
  if (!client) { await cacheAsset(card.block.assetKey, card.blob); return card.block; }
  const { assetKey, ...block } = card.block;
  const stored = [];
  for (const part of card.parts) stored.push({ path: part.path, source: sourceOf(await client.uploadSource(part.file, { app, board, family: part.family })), part });
  const main = stored.find(s => s.path === card.sourcePath) || stored[0];
  return {
    ...block,
    fileRef: {
      v: 1, source: main.source, family: main.part.family,
      meta: { name: main.part.file.name, type: main.part.file.type || '', size: main.part.file.size, title: block.label },
      // view.entry: inside the ZIP source, the chosen model (null while the card asks); otherwise the main file's own path.
      view: { entry: main.part.family === 'model-package' ? block.model.entry : main.path, camera: null },
      ...(stored.length > 1 ? { bundle: stored.filter(s => s !== main).map(s => ({ path: s.path, source: s.source })) } : {}),
      derivatives: {}, job: null, doc: null, status: { preview: 'ready', context: 'listed' },
    },
  };
}

// The card's files, read back: { files: Map(path -> bytes), plan, download: Blob }. Only this card's own
// sources (fileRef.source and fileRef.bundle) or the entries inside its one ZIP are read - never a URL, never another card's.
export async function openModelFiles(block) {
  const model = block.model || {};
  let list, mainBytes;
  if (block.fileRef) {
    if (!client) throw new Error('This model is stored with the board, and the file reader has not loaded yet.');
    const read = async source => { const blob = await client.loadSource({ ...block, fileRef: { ...block.fileRef, source } }); if (!blob) throw new Error('A file of this model could not be read.'); return bytesOf(blob); };
    mainBytes = await read(block.fileRef.source);
    // The dropped ZIP is one source: view.entry is a path inside it. Otherwise the main source is the entry file itself.
    if (block.fileRef.family === 'model-package') list = readModelZip(mainBytes).files;
    else {
      list = [{ path: block.fileRef.view?.entry || block.fileRef.meta?.name || 'model', bytes: mainBytes }];
      for (const dep of block.fileRef.bundle || []) list.push({ path: dep.path, bytes: await read(dep.source) });
    }
  } else {
    const value = await loadAsset(block.assetKey);
    if (!value) throw new Error('This model is not in this browser or saved with the board yet.');
    const bytes = await bytesOf(value instanceof Blob ? value : new Blob([value]));
    list = model.package === 'file' ? [{ path: model.entry || block.label, bytes }] : readModelZip(bytes).files;
    return { files: new Map(list.map(f => [f.path, f.bytes])), plan: planBundle(list), download: value instanceof Blob ? value : new Blob([bytes]) };
  }
  // A one-file card downloads its original; a bundle of sources downloads them together as a ZIP of the originals.
  const download = block.fileRef.family === 'model-package' || list.length === 1 ? new Blob([mainBytes]) : new Blob([packBundle(list)], { type: 'application/zip' });
  return { files: new Map(list.map(f => [f.path, f.bytes])), plan: planBundle(list), download };
}

// Supplying missing files: each added file becomes one more bundle source (fileRef) or is packed into the stored ZIP
// (board asset); either way the card changes through the normal board save (the caller's onChange).
export async function addModelFiles(block, added, { blob, app = where.app, board = where.board } = {}) {
  checkAddedFiles(added);
  if (!block.fileRef) { const next = await addFilesToPackage(block, blob, added); await cacheAsset(next.block.assetKey, next.blob); return next.block; }
  if (!client) throw new Error('The file reader has not loaded yet.');
  const entry = block.fileRef.view?.entry || block.model?.entry || '';
  const dir = entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/') + 1) : '';
  const bundle = [...(block.fileRef.bundle || [])];
  for (const file of added) bundle.push({ path: dir + file.name, source: sourceOf(await client.uploadSource(file, { app, board, family: partFamily(file.name) })) });
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
  const bundle = [...ref.bundle.filter(b => b !== chosen), { path: ref.view.entry, source: ref.source }];
  return { ...block, model, fileRef: { ...ref, source: chosen.source, family: entry.family, meta: { ...ref.meta, name: entry.path.split('/').pop() }, view: { ...ref.view, entry: entry.path }, bundle } };
}
