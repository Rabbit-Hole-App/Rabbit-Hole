import { transformImage } from './inline-image-transforms.js';
import { fileContextManifest } from './file-context-manifest.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = value => structuredClone(value);
const ownerScope = at => at?.app && at?.board && !at.share && !at.member;
const imageBlock = block => block?.type === 'image' || (block?.type === 'file' && block.kind === 'image');
const digest = async blob => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('');

// Prepare immutable derivative bytes, never mutate a canvas or its original asset.
// Accept returns a transaction for the caller to apply together with retainedSource.
export async function prepareImageRevision({ block, scope, operation, signal, current,
  headers = {}, fetchImpl = globalThis.fetch, upload, transform = transformImage,
  objectURLs = URL }) {
  const before = clone(block), at = clone(scope);
  let disposed = false, previewURL = null, accepted = false, accepting = false;
  const check = () => {
    if (disposed || signal?.aborted) throw Error('Image edit cancelled.');
    const now = current();
    if (!ownerScope(at) || !same(now.scope, at) || now.readOnly || now.locked || !same(now.block, before)) {
      throw Error('The image or its permissions changed. Prepare a new preview.');
    }
  };
  check();
  if (!imageBlock(before) || before.locked || before.sources?.length || before.citations?.length || before.references?.length) {
    throw Error('Choose an editable image without attached citations.');
  }
  if (typeof upload !== 'function') throw Error('Image storage is unavailable.');
  const source = before.fileRef?.source;
  const originalManifest = source ? fileContextManifest(before.fileRef) : null;
  if (source && !originalManifest) throw Error('The original image identity is invalid.');
  const query = `?app=${encodeURIComponent(at.app)}&board=${encodeURIComponent(at.board)}`;
  const path = source?.id && source?.rev
    ? `/api/learn/files/${encodeURIComponent(source.id)}${query}`
    : before.assetKey ? `/api/learn/boards/${encodeURIComponent(at.app)}/${encodeURIComponent(at.board)}/assets/${encodeURIComponent(before.assetKey)}` : null;
  if (!path) throw Error('Save the original image before editing it.');
  const read = async method => {
    const response = await fetchImpl(path, { method, headers, signal, cache: 'no-store' });
    if (!response.ok) throw Error('The original image is no longer accessible.');
    if (source && response.headers.get('x-source-rev') !== source.rev) throw Error('The original image revision changed.');
    return response;
  };
  const response = await read('GET');
  check();
  const originalBlob = await response.blob();
  const originalDigest = source ? null : await digest(originalBlob);
  const result = await transform(originalBlob, clone(operation));
  if (!result.ok) throw Error(result.reason || 'Image transformation failed.');
  check();
  const file = new File([result.blob], 'image-revision.png', { type: 'image/png' });
  const stored = await upload(file, { app: at.app, board: at.board, family: 'image' });
  // Uploads may deduplicate an existing source, so cancellation never deletes it.
  check();
  if (!fileContextManifest({ source: stored?.source, family: 'image' })) throw Error('The image revision was not saved with a valid identity.');
  const saved = stored.source;
  const after = { ...clone(before), type: 'file', kind: 'image', format: 'png',
    fileRef: { v: 1, source: { id: saved.id, rev: saved.rev }, family: 'image',
      meta: { name: saved.name || file.name, type: 'image/png', size: saved.size ?? file.size,
        title: before.title || before.label || 'Image' },
      view: {}, derivatives: {}, job: null, doc: null, status: { preview: 'pending', context: 'none' } } };
  const retainedSource = source ? {
    id: `file:${source.id}@${source.rev}`, kind: 'file', attached: false,
    label: before.fileRef.meta?.name || before.title || before.label || 'Original image',
    fileRef: originalManifest,
  } : null;
  previewURL = objectURLs.createObjectURL(result.blob);
  return {
    before: clone(before), after: clone(after), retainedSource: clone(retainedSource), previewURL, width: result.width, height: result.height,
    async accept() {
      if (accepted || accepting) throw Error('This image revision is already being accepted or was accepted.');
      accepting = true;
      try {
        check();
        const latest = await read(source ? 'HEAD' : 'GET');
        if (!source && await digest(await latest.blob()) !== originalDigest) throw Error('The original image bytes changed.');
        check();
        accepted = true;
        return { before: clone(before), after: clone(after), retainedSource: clone(retainedSource) };
      } finally { accepting = false; }
    },
    dispose() { if (!disposed) objectURLs.revokeObjectURL(previewURL); disposed = true; },
  };
}
