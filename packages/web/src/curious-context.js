// Curious where this goes? (docs/features/professor-next-steps.md 2.8, owner task 2): what the planner reads of a canvas,
// through the shared semantic snapshot (canvas-semantics.js). Its own small module, so the canvas chunk that computes it
// never loads the planner. Pure.
import { cardText, semanticSnapshot } from './canvas-semantics.js';

// What Curious reads of a canvas: lesson cards and native objects through the shared snapshot, in a smaller
// budget, never chat cards (their answers are never hook input, and a streaming answer must not re-plan). board:
// AdaptiveCanvas semanticBoard(), the open editor's words overlaid. focus: recent edits, then the selection.
export const CURIOUS_BUDGET = Object.freeze({ objects: 40, chars: 2500 });
export const curiousSnapshot = (board, focus = []) => semanticSnapshot({ ...board, exchanges: [] }, { budget: CURIOUS_BUDGET, focus: { ids: focus } });

// Recent meaningful edits, newest first: the ids whose words or kind changed, which arrived, or which a new or changed link
// touches, since the last read (previous: the last result; null reads the baseline). A move changes none of these.
const RECENT = 12;
export function recentEdits(previous, board) {
  const sigs = new Map(), words = entity => [entity.kind ?? entity.type, entity.text ?? entity.label ?? entity.latex ?? '', entity.type ? cardText(entity) : ''].join('\u0001');
  for (const entity of [...(board.shapes || []), ...(board.items || []), ...(board.blocks || [])]) sigs.set(entity.id, words(entity));
  const links = new Map((board.links || []).map(link => [link.id, link]));
  for (const link of links.values()) sigs.set(link.id, JSON.stringify([link.from, link.to, link.label ?? '', link.kind ?? '']));
  if (!previous) return { sigs, ids: [] };
  const touched = [...sigs].filter(([id, sig]) => previous.sigs.get(id) !== sig).flatMap(([id]) => (links.has(id) ? [links.get(id).from, links.get(id).to] : [id]));
  return { sigs, ids: [...new Set([...touched, ...previous.ids])].filter(id => sigs.has(id)).slice(0, RECENT) };
}

// The canvas side (AdaptiveCanvas): changed() after any change to the lists, the open editor's words or the selection.
// One read once the canvas has been still for `delay` ms, so a burst of edits or a drag is one read, never one per
// keystroke or frame; the read is focused on recent edits, then the selection. Typed words that differ from the last read
// report settling at once (once per burst), so the shown suggestions go stale before the read; a caret move or opening
// an editor is not a change. board, editor ({ id, text } or null) and selection read the canvas now; report({ fingerprint,
// settling }) tells the page.
export function semanticReader({ board, editor, selection, report, setTimer = setTimeout, clearTimer = clearTimeout, delay = 150 }) {
  let timer = null, recent = null, typed = null, value = null, settling = false, reads = 0;
  const read = () => {
    timer = null;
    const now = board();
    recent = recentEdits(recent, now);
    const snapshot = curiousSnapshot(now, [...recent.ids, ...selection()]);
    value = { snapshot, fingerprint: snapshot.fingerprint };
    typed = editor(); settling = false; reads += 1;
    report({ fingerprint: value.fingerprint, settling: false });
  };
  return {
    changed() {
      const words = editor();
      if (!settling && words && typed?.id === words.id && typed.text !== words.text) {
        settling = true;
        report({ fingerprint: value?.fingerprint ?? null, settling: true });
      }
      clearTimer(timer);
      timer = setTimer(read, delay);
    },
    value: () => value,
    reads: () => reads,
    dispose() { clearTimer(timer); timer = null; },
  };
}
