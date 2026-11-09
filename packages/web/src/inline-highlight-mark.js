// Owner 2026-11-09: the highlighted words of a card are marked (the Highlight colour, ::highlight(inline-target) in index.css) while Ctrl+K is open over them and, when Ctrl+K sent a slash command to the Chat, until the learner
// presses the x of the highlighted-words chip in the Chat. A mark for this request only, never a saved Highlight. One mark at a time; a new Ctrl+K replaces it. The live Range keeps painting after focus moves.
import { useSyncExternalStore } from 'react';

let current = null;
const subscribers = new Set();
const paint = () => {
  try {
    if (typeof CSS === 'undefined' || !CSS.highlights) return;
    if (current?.live && typeof Highlight !== 'undefined') CSS.highlights.set('inline-target', new Highlight(current.live));
    else CSS.highlights.delete('inline-target');
  } catch { /* a detached range paints nothing */ }
};
export const markSet = highlight => { current = highlight || null; paint(); subscribers.forEach(notify => notify()); };
export const markClear = () => markSet(null);
export const markGet = () => current;
export const useMark = () => useSyncExternalStore(notify => { subscribers.add(notify); return () => subscribers.delete(notify); }, markGet, () => null);
