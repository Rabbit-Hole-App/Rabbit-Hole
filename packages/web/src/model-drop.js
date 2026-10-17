// The small part of model import the canvas page loads eagerly (file-imports Lane 4): which dropped names go to the
// lazily imported model importer (model-import.js), and reading a dropped folder's files.
import { FAMILIES, familyOf } from './file-capabilities.js';

// A drop goes to the model importer when it holds a model, a package or a folder (a lone .bin or .mtl does not).
const isEntry = file => { const f = familyOf({ name: file.name }); return f?.route === 'model' && f.card === 'file:model'; };
export const isModelDrop = files => files.some(file => file.bundleRoot || isEntry(file));
// What "Add the missing files" offers: the model families' extensions and the image types a model's textures use.
export const MODEL_ACCEPT = [...FAMILIES.filter(f => f.route === 'model').flatMap(f => f.extensions), 'png', 'jpg', 'jpeg', 'webp'].map(e => `.${e}`).join(',');

// A drop's files, a dropped folder's included: each file from a folder carries `bundleRoot` (the folder) and
// `bundlePath` (its path inside it). The entries are taken now, while the drop event is live; reading them is async.
// Symbolic links are not followed (the File System entries API reports a link's target as a file of that name).
export function droppedFiles(dataTransfer, limit = 512) {
  const items = [...(dataTransfer?.items || [])].filter(item => item.kind === 'file');
  const entries = items.map(item => item.webkitGetAsEntry?.() || null);
  const plain = [...(dataTransfer?.files || [])];
  if (!entries.some(entry => entry?.isDirectory)) return Promise.resolve(plain);
  const out = [];
  const readDir = async (dir, root, prefix) => {
    const reader = dir.createReader();
    for (;;) {
      const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) return;
      for (const entry of batch) {
        if (out.length >= limit) throw new Error(`${root}: a dropped folder may hold at most ${limit} files`);
        if (entry.isDirectory) await readDir(entry, root, `${prefix}${entry.name}/`);
        else { const file = await new Promise((resolve, reject) => entry.file(resolve, reject)); out.push(Object.assign(file, { bundleRoot: root, bundlePath: `${prefix}${entry.name}` })); }
      }
    }
  };
  return (async () => {
    for (const [index, entry] of entries.entries()) {
      if (entry?.isDirectory) await readDir(entry, entry.name, '');
      else if (plain[index]) out.push(plain[index]);
    }
    return out;
  })();
}
