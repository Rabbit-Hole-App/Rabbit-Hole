// Add to canvas from a Context row for an imported file (owner spec section 4 "Entry points"; canvas-file-imports.md section 3;
// lead ruling 2026-10-16): the card reuses the stored source - its id and revision, nothing uploaded again - and lands through
// the canvas's ordinary insert, so the next board save writes its file_source_refs row like any other card. Chat and Context
// attachment are left exactly as they were: adding a card never attaches or detaches anything.
import { familyOf } from './file-capabilities.js';
import { FILE_SOURCE } from './file-chat-ref.js';

// The family a row's file can become a card of: a shipped family whose card is a fileRef card (`file:<kind>`, rendered by
// its lane's adapter). Families with their own import routes (PDF, notebook, code) keep their own Add to canvas.
export function canvasFamilyOf(ref) {
  if (ref?.kind !== 'file' || !FILE_SOURCE.test(String(ref.sourceId))) return null;
  const fam = familyOf({ name: ref.name });
  return fam && fam.status === 'shipped' && typeof fam.card === 'string' && fam.card.startsWith('file:') ? fam : null;
}

// The stored source as its download answers a HEAD (learn-files.js): revision, name, type and size. null when the revision is
// not the one the ref names (a ref never silently moves to other bytes).
export function sourceFromHead(headers, ref) {
  const [, id, rev] = FILE_SOURCE.exec(String(ref.sourceId)) || [];
  if (!id || headers.get('x-source-rev') !== rev) return null;
  const named = /filename\*=UTF-8''([^;]+)/i.exec(headers.get('content-disposition') || '');
  let name = ref.name;
  try { if (named) name = decodeURIComponent(named[1]); } catch { /* keep the ref's name */ }
  const size = Number(headers.get('content-length'));
  return { id, rev, name: String(name).slice(0, 200), type: headers.get('content-type') || '', size: Number.isInteger(size) && size >= 0 ? size : null };
}

// The card: the family's card type and kind, and one compact fileRef (contract section 3). No bytes, URLs or text.
export function fileCardFromSource(source, fam, view = {}) {
  if (!source || !fam?.card?.startsWith('file:')) return null;
  const [type, kind] = fam.card.split(':');
  const title = source.name.replace(/\.[^.]+$/, '');
  return {
    type, kind, label: title, format: source.name.split('.').pop().toLowerCase(),
    fileRef: { v: 1, source: { id: source.id, rev: source.rev }, family: fam.id, meta: { name: source.name, type: source.type, ...(source.size != null ? { size: source.size } : {}), title },
      view, derivatives: {}, job: null, doc: null, status: { preview: 'pending', context: 'none' } },
  };
}
// A card of the same source revision already on the canvas: revealed, never added twice.
export const sameFileCard = (id, rev) => block => block?.fileRef?.source?.id === id && block.fileRef.source.rev === rev;

// ops: the chat workspace's canvasOps (insertCard reveals an equivalent card or inserts one, one undo step). app: the canvas.
// Returns { id, existed }. Throws a plain reason the row shows.
export async function addFileToCanvas({ ref, app, ops, call = fetch, headers = {} }) {
  const fam = canvasFamilyOf(ref);
  if (!fam || !ops?.insertCard) throw Error('this file cannot be added to the canvas yet');
  const [, id] = FILE_SOURCE.exec(ref.sourceId);
  // The source's owner reads it directly; anyone else (a fork's owner) through this canvas's own board reference.
  let response = await call(`/api/learn/files/${id}`, { method: 'HEAD', headers });
  if (response.status === 404) response = await call(`/api/learn/files/${id}?app=${encodeURIComponent(app)}&board=main`, { method: 'HEAD', headers });
  if (!response.ok) throw Error(response.status === 404 ? 'the file is not available' : `the server answered ${response.status}`);
  const source = sourceFromHead(response.headers, ref);
  if (!source) throw Error('the stored file is a different version');
  const saved = ops.fileForContext?.(ref);
  const manifest = saved?.source?.id === source.id && saved.source.rev === source.rev ? saved : null;
  const view = ref.range?.page ? { pages: [ref.range.page] } : ref.range?.sheet ? { sheet: ref.range.sheet } : ref.range?.slide ? { slide: ref.range.slide } : (manifest?.view || {});
  const card = fileCardFromSource(source, fam, view);
  if (Array.isArray(manifest?.bundle)) card.fileRef.bundle = structuredClone(manifest.bundle);
  return ops.insertCard(card, { same: sameFileCard(source.id, source.rev) });
}
