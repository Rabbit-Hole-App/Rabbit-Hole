// The board's save (AdaptiveCanvas.jsx): this browser's copy under the canvas storageKey, then, through onSave, a shared
// board's server copy (LearnPage pushBoard). Pure: the storage getter and onSave are passed in.

// ponytail: generated images are large data URLs; keep the prompt, drop the bytes so one illustration cannot fill the
// browser's storage quota.
export const lightBlocks = blocks => blocks.map(block => block.src?.startsWith('data:') && block.src.length > 120000 ? { ...block, src: '' } : block);

// canvasApi.persist() (architecture §6.5.5, LP1 Task 15): the board saved now, not in 400 ms, with the debounced save's
// key, shape and stripping, then onSave(saved, { now: true }) awaited. local: the write succeeded (full or blocked
// storage, or no key, is false). remote: onSave's 'ok', or 'skipped' (not shared, or no onSave); anything else - a
// failed push, a throw, an answer it cannot give - is 'failed'. A journey section is recorded only on ok.
export async function persistBoard({ state, storageKey, storage, onSave }) {
  const saved = { ...state, blocks: lightBlocks(state.blocks) };
  let local = false, remote = 'skipped';
  if (storageKey) { try { storage().setItem(storageKey, JSON.stringify(saved)); local = true; } catch { /* full or blocked storage */ } }
  if (onSave) {
    try { remote = await onSave(saved, { now: true }); } catch { remote = null; }
    if (remote !== 'ok' && remote !== 'skipped') remote = 'failed';
  }
  return { ok: local && remote !== 'failed', local, remote };
}
