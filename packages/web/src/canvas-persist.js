// The board's save (AdaptiveCanvas.jsx): this browser's copy under the canvas storageKey, then, through onSave, a shared
// board's server copy (LearnPage pushBoard). Pure: the storage getter and onSave are passed in.

// ponytail: generated images are large data URLs; keep the prompt, drop the bytes so one illustration cannot fill the
// browser's storage quota.
export const lightBlocks = blocks => blocks.map(block => block.src?.startsWith('data:') && block.src.length > 120000 ? { ...block, src: '' } : block);

// canvasApi.persist() (architecture §6.5.5, LP1 Task 15): the board saved now, not in 400 ms, with the debounced save's
// key, shape and stripping, then onSave(saved, { now: true }) awaited. local: the write succeeded (full or blocked
// storage, or no key, is false). remote: onSave's 'ok', or 'skipped' (not shared, or no onSave); anything else - a
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

// One at a time (LearnPage board PUTs, review round 1 C-15a): each task starts once the one before it settled, so a PUT
// reads the version the previous PUT wrote. A task that throws rejects its own call only; the queue goes on.
export const serial = () => {
  let last = Promise.resolve();
  return task => (last = last.catch(() => {}).then(task));
};

// A board's sharing for its server push: unknown while the page has no answer for it (the board GET has not answered,
// or failed), when the board may be shared.
export const sharingOf = sharing => (!sharing || sharing.unavailable ? 'unknown' : sharing.shared ? 'shared' : 'private');
