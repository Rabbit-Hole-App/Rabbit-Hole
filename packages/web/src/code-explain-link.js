// What the code-explain primary and its satellite cards say to each other (code-explain-card-spec.md section 3 steps 5 and 8): they are separate canvas cards, so the two ends
// meet in this module, keyed by the PRIMARY card's id (a satellite names it in `from`). Nothing here is saved.
import { useSyncExternalStore } from 'react';

const listeners = new Set(), reveals = new Set();
let active = null; // { primary, rangeId }: the range a hovered sentence lights, on the primary or on a satellite
const emit = () => listeners.forEach(listener => listener());

// A sentence hovered: its range lights on the card that holds it. null (or nothing) clears.
export function highlightRange(primary, rangeId) {
  const next = rangeId ? { primary, rangeId } : null;
  if (active?.primary === next?.primary && active?.rangeId === next?.rangeId) return;
  active = next;
  emit();
}
// The range of this primary that is lit now, or null. Both the primary's pane and each satellite read it, and light a range only when they hold it.
export const useLitRange = primary => useSyncExternalStore(callback => { listeners.add(callback); return () => listeners.delete(callback); }, () => (primary && active?.primary === primary ? active.rangeId : null), () => null);

// A range clicked (on the primary or a satellite): the primary scrolls its prose to that range's sentence.
export const revealSentence = (primary, rangeId) => reveals.forEach(listen => listen(primary, rangeId));
export function onReveal(listen) { reveals.add(listen); return () => reveals.delete(listen); }

// A suggestion asked from a card: the next card made for that question stands beside this one (spec 3 step 5), not beside whatever is selected then. Consumed once, and only by
// the answer to that very question.
let asked = null;
export const askedFrom = (cardId, question) => { asked = cardId && question ? { cardId, question: String(question).trim() } : null; };
export function takeAskedFrom(question, exists = () => true) {
  const held = asked;
  if (!held || held.question !== String(question ?? '').trim()) return null;
  asked = null;
  return exists(held.cardId) ? held.cardId : null;
}
