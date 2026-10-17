// Board-owned file provenance, separate from the bounded Chat identity. No bytes or download URLs.
import { FILE_SOURCE } from './file-chat-ref.js';
import { bundlePath, MODEL_LIMITS } from './model-formats.js';
const stored = source => FILE_SOURCE.test('file:' + source?.id + '@' + source?.rev);
export function fileContextManifest(ref) {
  if (!stored(ref?.source)) return null;
  const bundle = ref.bundle;
  if (bundle != null && (!Array.isArray(bundle) || bundle.length > MODEL_LIMITS.archiveEntries || bundle.some(part => !stored(part?.source) || !bundlePath(part?.path)))) return null;
  return { v: 1, source: { id: ref.source.id, rev: ref.source.rev }, family: ref.family,
    ...(ref.view?.entry && bundlePath(ref.view.entry) ? { view: { entry: ref.view.entry } } : {}),
    ...(bundle?.length ? { bundle: bundle.map(part => ({ path: bundlePath(part.path), source: { id: part.source.id, rev: part.source.rev } })) } : {}) };
}
export function retainedFileSources(state) {
  return (Array.isArray(state?.sources) ? state.sources : []).flatMap(source => {
    const fileRef = source?.kind === 'file' && fileContextManifest(source.fileRef);
    return fileRef && source.id === 'file:' + fileRef.source.id + '@' + fileRef.source.rev
      ? [{ id: source.id, kind: 'file', label: String(source.label || 'File').slice(0, 200), attached: false, fileRef }] : [];
  });
}
