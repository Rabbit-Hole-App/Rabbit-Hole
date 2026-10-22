// The board's save (AdaptiveCanvas.jsx): this browser's copy under the canvas storageKey, then, through onSave, the
// board's server copy (LearnPage pushBoard; docs/features/canvas-persistence.md). Pure: the storage getter and onSave are
// passed in.

import { docIsEmpty } from './canvas-doc.js';

// ponytail: generated images are large data URLs; keep the prompt, drop the bytes so one illustration cannot fill the
// browser's storage quota.
export const lightBlocks = blocks => blocks.map(block => block.src?.startsWith('data:') && block.src.length > 120000 ? { ...block, src: '' } : block);

// canvasApi.persist() (architecture §6.5.5, LP1 Task 15): the board saved now, not in 400 ms, with the debounced save's
// key, shape and stripping, then onSave(saved, { now: true }) awaited. local: the write succeeded (full or blocked
// storage, or no key, is false). remote: onSave's 'ok', or 'skipped' (no onSave, or a review board that is not shared:
// every owned board is saved on the server, canvas-persistence.md); anything else - a
// failed push, a throw, an answer it cannot give - is 'failed'. A journey section is recorded only on ok. onSave runs
// only after a local write: it pushes the stored copy (LearnPage boardSnapshot), which would otherwise be stale.
export async function persistBoard({ state, storageKey, storage, onSave }) {
  const saved = { ...state, blocks: lightBlocks(state.blocks) };
  let local = false, remote = 'skipped';
  if (storageKey) { try { storage().setItem(storageKey, JSON.stringify(saved)); local = true; } catch { /* full or blocked storage */ } }
  if (onSave && local) {
    try { remote = await onSave(saved, { now: true }); } catch { remote = null; }
    if (remote !== 'ok' && remote !== 'skipped') remote = 'failed';
  }
  return { ok: local && remote !== 'failed', local, remote };
}

// Work made on this page while the board was still loading (board-empty-report; owner: edits still in memory are never
// discarded, and conflicting work is preserved, never silently dropped). Per board key, against the board the canvas
// mounted with: objects added (by id, or for an object without one - pen ink - by its exact content), objects changed (by
// id: this page's version and the one it started from) and objects removed (by id).
const WORK_KEYS = ['strokes', 'shapes', 'items', 'links', 'blocks', 'groups', 'areas'];
const keyOf = entry => (entry?.id != null ? `id:${entry.id}` : `json:${JSON.stringify(entry)}`);
// The same object: `fresh` is the canvas's own marker for a just-landed item, never part of what was saved.
const same = (a, b) => JSON.stringify(a, (key, value) => (key === 'fresh' ? undefined : value)) === JSON.stringify(b, (key, value) => (key === 'fresh' ? undefined : value));
export function pendingWork(mounted, live) {
  const work = {};
  for (const key of WORK_KEYS) {
    const before = new Map((mounted?.[key] || []).map(entry => [keyOf(entry), entry]));
    const now = new Map((live?.[key] || []).map(entry => [keyOf(entry), entry]));
    const added = [], changed = [], removed = [];
    for (const [k, entry] of now) {
      if (!before.has(k)) added.push(entry);
      else if (!same(before.get(k), entry)) changed.push({ base: before.get(k), mine: entry });
    }
    for (const [k, entry] of before) if (!now.has(k) && entry?.id != null) removed.push(entry);
    if (added.length || changed.length || removed.length) work[key] = { added, changed, removed };
  }
  return work;
}
// The server's copy with that work on it. Added: after the server's own objects, unless the server holds it already.
// Changed: this page's version when the server's is still the one this page started from; when the server changed it too
// (or removed it), both are kept - the server's in place and this page's as a copy (a new id) - and counted as a conflict.
// Removed: only when the server's is still the one this page started from. count: objects changed in the server's copy,
// so the caller pushes the board when there are any; conflicts: copies kept, so the caller can say so.
export function withPendingWork(state, work, newId = id => `${id}-mine-${Math.random().toString(36).slice(2, 8)}`) {
  let count = 0, conflicts = 0;
  const next = { ...state };
  for (const key of WORK_KEYS) {
    const mine = work?.[key];
    if (!mine) continue;
    let list = [...(state?.[key] || [])];
    const at = k => list.findIndex(entry => keyOf(entry) === k);
    for (const { base, mine: version } of mine.changed || []) {
      const i = at(keyOf(base));
      if (i >= 0 && same(list[i], version)) continue;
      if (i >= 0 && same(list[i], base)) { list[i] = version; count += 1; continue; }
      list.push(i >= 0 ? { ...version, id: newId(version.id) } : version);
      count += 1; conflicts += 1;
    }
    for (const entry of mine.added || []) {
      if (at(keyOf(entry)) >= 0) continue;
      list.push(entry); count += 1;
    }
    for (const base of mine.removed || []) {
      const i = at(keyOf(base));
      if (i >= 0 && same(list[i], base)) { list = [...list.slice(0, i), ...list.slice(i + 1)]; count += 1; }
    }
    next[key] = list;
  }
  return count ? { state: next, count, conflicts } : { state, count: 0, conflicts: 0 };
}

// One at a time (LearnPage board PUTs, review round 1 C-15a): each task starts once the one before it settled, so a PUT
// reads the version the previous PUT wrote. A task that throws rejects its own call only; the queue goes on.
export const serial = () => {
  let last = Promise.resolve();
  return task => (last = last.catch(() => {}).then(task));
};

// A board's sharing: unknown while the page has no answer for it (the board GET has not answered, or failed), when the
// board may be shared. A board published to Explore is live for everyone, so it counts as shared
// (docs/features/explore-publish.md). Only a review board (?board=) still pushes by it.
export const sharingOf = sharing => (!sharing || sharing.unavailable ? 'unknown' : sharing.shared || sharing.published ? 'shared' : 'private');

// What a board holds, to tell whether the server already has this browser's copy (docs/features/canvas-persistence.md):
// its content keys in one order, a missing key read as empty. The canvas writes every key, a copy saved elsewhere may
// not (a Rabbit Hole's anchor-only board), and the two must compare equal, or merely opening a board would save it
// again and move its updated_at.
// doc: the canvas's one document (docs/features/blocknote-canvas.md), an object; a board without one reads as [] like any key.
const BOARD_KEYS = ['strokes', 'shapes', 'items', 'links', 'blocks', 'groups', 'areas', 'exchanges', 'sources', 'doc'];
export const boardText = state => JSON.stringify(BOARD_KEYS.map(key => state?.[key] ?? []));
// The board a boardText holds (a missing document, read as [], is none).
export function boardFromText(text) {
  const values = JSON.parse(text);
  return Object.fromEntries(BOARD_KEYS.map((key, i) => [key, values[i]]).filter(([key, value]) => key !== 'doc' || !Array.isArray(value)));
}
// A 409 (owner 2026-10-22: a conflicting save never loses either device's edits): the board text the server held when this
// browser last saved or loaded, kept in this browser beside its copy, so the edits made since go onto the server's newer
// copy (pendingWork from it, then withPendingWork) - after a reload or a switch to another canvas and back too.
export const conflictBaseKey = storageKey => `${storageKey}:conflict-base`;
// The document after a 409: this browser's when only it changed since the base (it goes up); null when the server's changed
// too, or this one did not (the server's stays; a changed one of this browser's is offered back, docOnServerCopy).
export function conflictDoc({ base, server, mine }) {
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  return mine && !same(mine, base?.doc) && same(server?.doc, base?.doc) ? mine : null;
}
// Any stroke, shape, item, link, card, group, area or chat card, or a document with words in it. Not the sources list: a
// repository's canvas registers its repository there on open, and the list is kept apart from the board (LearnPage :sources).
export const boardHasContent = state => BOARD_KEYS.some(key => key !== 'sources' && (key === 'doc' ? !docIsEmpty(state?.doc) : (state?.[key] ?? []).length > 0));

// Whether a reload now could lose an edit on this board (offline-recovery brief 2026-10-16; lazy-feature.jsx Retry). `live`:
// the board as the canvas holds it this moment, its document's unsaved words included - never only this browser's copy,
// which the canvas writes 400 ms after a change. `copy`: this browser's copy, or null when it cannot outlive the page
// (blocked storage keeps it in memory only). `answered`: the server answered for this board and holds it (a review board
// that is not shared is held only here); `synced`: the boardText the server holds, or null when it holds no board yet.
export function boardPending({ live, copy, answered, synced }) {
  // Only this browser's copy is read again after a reload: everything live must be in a copy that survives one.
  if (!answered) return copy ? boardText(live) !== boardText(copy) : boardHasContent(live);
  // The server holds no board yet: only content is worth a save (LearnPage Load), not the keys the canvas writes on open.
  if (synced === null) return boardHasContent(live);
  return boardText(live) !== synced;
}
