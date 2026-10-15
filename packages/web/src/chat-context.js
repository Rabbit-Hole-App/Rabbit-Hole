import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { repositoryUrl } from './card-sources.js';
import { removeContextDoc, uploadContextDoc, useContextDocs } from './context-docs.js';
// ui.jsx's toast, by its event: importing the JSX kit would keep this module out of plain-node tests (selection-ref.test.mjs).
const toast = message => window.dispatchEvent(new CustomEvent('small:toast', { detail: { message: String(message) } }));

// Sub-lane A4a (Sources pane and shared context) owns this file. Contract: chat-workspace-CONTRACT.md A2 (ContextRef), A5.
// Shape every other sub-lane relies on:
//   { items: [{ ref: ContextRef, state: 'uploading' | 'processing' | 'ready' | 'failed', error?, retry?, dismiss?, doc?, attached }]
//       (everything this canvas offers: its context docs as doc:<id> refs, every ref this conversation attached, uploads in
//        flight; doc is the context-docs row { id, name, kind: 'pdf' | 'text', size, created_at } behind a doc:<id> ref),
//     attached: ContextRef[] (this conversation's; sent as context_refs), attach(ref), detach(ref), isAttached(ref), upload(file),
//     remove(doc) (Remove from canvas context, materials-remove.md: throws the server's reason) }
// One store: the canvas context documents behind /api/learn/context (context-docs.js). attached is per conversation:
// a restored thread keeps its own thread.restore.contextRefs; a New chat (thread id null) starts from the docs switched on
// in the Files panel, the current canvas context (lead, 2026-10-14), and nothing else of the previous thread. Detaching
// never deletes a doc or a canvas object, and the canvas-level switch on a context doc is left alone.
const rangeKey = range => JSON.stringify(range ?? null, range ? Object.keys(range).sort() : undefined);
export const sameRef = (a, b) => a.sourceId === b.sourceId && rangeKey(a.range) === rangeKey(b.range);
export const refKey = ref => `${ref.sourceId}|${rangeKey(ref.range)}`; // a React key that sameRef refs share
export const MAX_REFS = 20; // the server's per-request limit (contract A2)

// Where a context doc's bytes are read (GET /api/learn/context/<id>, owner only), for A4b's reader.
export const docUrl = (canvas, id) => `/api/learn/context/${encodeURIComponent(id)}?app=${encodeURIComponent(canvas)}`;
export const docRef = doc => ({ sourceId: `doc:${doc.id}`, kind: 'doc', name: String(doc.name || 'Document').slice(0, 120), version: String(doc.created_at ?? ''), range: null });
const validRefs = refs => (Array.isArray(refs) ? refs.filter(ref => ref && typeof ref.sourceId === 'string' && typeof ref.kind === 'string') : []);

// The conversation's attached refs. restore replaces them (History open; New chat restores []); attach de-duplicates by
// sourceId + range and stops at MAX_REFS; detach removes that one ref only.
export function attachedReducer(refs, action) {
  if (action.type === 'restore') return validRefs(action.refs);
  if (action.type === 'attach') return refs.length >= MAX_REFS || refs.some(ref => sameRef(ref, action.ref)) ? refs : [...refs, action.ref];
  if (action.type === 'detach') return refs.filter(ref => !sameRef(ref, action.ref));
  return refs;
}

// What a new conversation gains from the canvas: its switched-on docs, each offered once per conversation (offered: the
// sourceIds already offered), so a doc the user detached stays detached and one switched on later still arrives.
// A whole-document chip of a document removed from the canvas context (materials-remove.md) would keep sending it: drop it.
// A ref at one page of it stays (a PDF page on the canvas still asks about that page).
export const staleRef = (ref, removed) => ref.kind === 'doc' && !ref.range && removed.includes(ref.sourceId.slice('doc:'.length));
export const canvasDocRefs = (docs, offered) => docs.filter(doc => doc.attached && !offered.has(`doc:${doc.id}`)).map(docRef);

// The one collection both panes show: uploads in flight first, then the canvas's docs, then any other attached ref
// (cards, groups, code, web, a doc passage). A ref already listed is not listed twice.
// ponytail: a restored doc ref whose file was since deleted still reads ready; a 'missing' state needs useContextDocs to say when its list has loaded.
export function contextItems(docs, attached, uploads = []) {
  const byId = new Map(docs.map(doc => [`doc:${doc.id}`, doc]));
  const items = docs.map(doc => ({ ref: docRef(doc), state: 'ready' }));
  for (const ref of attached) if (!items.some(item => sameRef(item.ref, ref))) items.push({ ref, state: 'ready' });
  return [...uploads, ...items].map(item => ({ ...item, ...(byId.has(item.ref.sourceId) ? { doc: byId.get(item.ref.sourceId) } : {}), attached: attached.some(ref => sameRef(ref, item.ref)) }));
}

// The Sources pane's sections: one per item, the active source marked on its own item (same range first, else the same
// source, where the reader opens at the active range), or listed first when the collection does not hold it (a cited
// paper never attached). Viewing never attaches, so that extra section reads not attached.
export function paneSections(items, active) {
  const sections = items.map(item => ({ key: item.id || refKey(item.ref), item, ref: item.ref, active: false }));
  if (!active) return sections;
  let at = items.findIndex(item => sameRef(item.ref, active));
  if (at < 0) at = items.findIndex(item => item.state === 'ready' && item.ref.sourceId === active.sourceId);
  if (at < 0) return [{ key: `active:${refKey(active)}`, item: { ref: active, state: 'ready', attached: false }, ref: active, active: true }, ...sections];
  sections[at] = { ...sections[at], ref: active, active: true };
  return sections;
}

const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
// The chip's range label: "p. 3", "L10-42", "0:12-0:40", "3 cards", or a short quote; '' for the whole source.
export function rangeLabel(range) {
  if (!range) return '';
  if (range.page != null) return `p. ${range.page}`;
  if (range.start != null) return range.end > range.start ? `L${range.start}-${range.end}` : `L${range.start}`;
  if (range.startSec != null) return range.endSec > range.startSec ? `${clock(range.startSec)}-${clock(range.endSec)}` : clock(range.startSec);
  if (Array.isArray(range.cardIds)) return `${range.cardIds.length} card${range.cardIds.length === 1 ? '' : 's'}`;
  if (range.quote) return `“${range.quote.length > 24 ? `${range.quote.slice(0, 24).trimEnd()}…` : range.quote}”`;
  return '';
}

// Where Open externally goes, or null when the source has no public address (uploads, canvas objects).
export function externalUrl(ref) {
  const at = ref.sourceId.indexOf(':'), kind = ref.sourceId.slice(0, at), id = ref.sourceId.slice(at + 1);
  if (kind === 'wiki' && id) return `https://en.wikipedia.org/wiki/${encodeURIComponent(id)}`;
  if (kind === 'paper' && id && !id.startsWith('upload:')) return `https://arxiv.org/abs/${id}${ref.range?.page ? `#page=${ref.range.page}` : ''}`;
  const code = kind === 'code' && id.match(/^([^@]+)@([^:]+):(.+)$/);
  if (code) return repositoryUrl({ repo: code[1], commit: code[2], path: code[3], line: ref.range?.start, lineEnd: ref.range?.end });
  return null;
}

// "Ask about this" on a selected passage or code range (A4b's readers): Add to Chat with that range (contract A5).
export const askAboutThis = (chat, ref) => chat.addToChat(ref);

export function useChatContext(canvas, thread) {
  const { docs, removed } = useContextDocs(canvas);
  const restore = thread?.restore;
  const [attached, dispatch] = useReducer(attachedReducer, restore?.contextRefs, validRefs);
  const key = useRef(restore?.key);
  key.current = restore?.key;
  const offered = useRef(new Set()), known = useRef(JSON.stringify(attached));
  useEffect(() => {
    offered.current = new Set();
    known.current = JSON.stringify(validRefs(restore?.contextRefs)); // what the thread already holds: restoring never saves
    dispatch({ type: 'restore', refs: restore?.contextRefs });
  }, [restore?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  // A change the user made saves to the open thread (A2's debounced state PUT; a no-op before the thread has an id).
  useEffect(() => {
    const json = JSON.stringify(attached);
    if (json === known.current) return;
    known.current = json;
    thread?.saveState?.({ contextRefs: attached });
  }, [attached]); // eslint-disable-line react-hooks/exhaustive-deps
  // A new conversation follows the canvas's switched-on docs until it has an id (its first send); the list arrives async.
  const fresh = thread != null && thread.id == null;
  useEffect(() => {
    if (!fresh) return;
    for (const ref of canvasDocRefs(docs, offered.current)) { offered.current.add(ref.sourceId); dispatch({ type: 'attach', ref }); }
  }, [fresh, docs, restore?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  // Any conversation, open now or restored later, lets go of its stale chips (saved as a change, never a message rewrite).
  useEffect(() => {
    for (const ref of attached) if (staleRef(ref, removed)) dispatch({ type: 'detach', ref });
  }, [removed, attached]);
  const [uploads, setUploads] = useState([]);
  const attach = useCallback(ref => dispatch({ type: 'attach', ref }), []);
  const detach = useCallback(ref => dispatch({ type: 'detach', ref }), []);
  const remove = useCallback(async doc => { await removeContextDoc(canvas, doc.id); dispatch({ type: 'detach', ref: docRef(doc) }); }, [canvas]);
  const send = useCallback(async (file, id) => {
    const startedIn = key.current;
    const patch = change => setUploads(previous => previous.map(item => (item.id === id ? { ...item, ...change } : item)));
    patch({ state: 'uploading', error: undefined });
    try {
      const doc = await uploadContextDoc(canvas, file);
      setUploads(previous => previous.filter(item => item.id !== id));
      // Uploaded from this chat, so it rides this chat - unless the user has moved to another conversation meanwhile.
      if (doc && key.current === startedIn) { offered.current.add(`doc:${doc.id}`); dispatch({ type: 'attach', ref: docRef(doc) }); }
    } catch (error) { patch({ state: 'failed', error: error.message }); }
  }, [canvas]);
  const upload = useCallback(async file => {
    if (!file) return;
    const id = `upload:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const ref = { sourceId: id, kind: 'doc', name: file.name.slice(0, 120), version: '', range: null };
    const dismiss = () => setUploads(previous => previous.filter(item => item.id !== id));
    setUploads(previous => [{ id, ref, state: 'uploading', retry: () => send(file, id), dismiss }, ...previous]);
    await send(file, id);
  }, [send]);
  return useMemo(() => ({
    items: contextItems(docs, attached, uploads), attached, detach, upload, remove,
    attach: ref => { if (attached.length >= MAX_REFS && !attached.some(item => sameRef(item, ref))) toast(`✗ A chat holds up to ${MAX_REFS} attachments. Remove one first.`); else attach(ref); },
    isAttached: ref => attached.some(item => sameRef(item, ref)),
  }), [docs, attached, uploads, attach, detach, upload, remove]);
}
