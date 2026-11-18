// Learn Walk (learn-walk-spec.md §1, owner 2026-11-18 13:03): step through a built section's cards one at a time. Pure, so the unit tests read it; the canvas
// (AdaptiveCanvas canvasApi.walk) holds the state, moves the camera and saves learn.done, the contents show the Start / Continue / Start again button.
//   stops: the section's cards in chip order (cards and its notes card; a lead or follow text item travels with its card and is never a stop).
//   state: { sectionId, stops: [cardId], at } | null.
import { byKey, numbers, union } from './learn-position.js';

const isStop = block => block?.learn?.slot && block.learn.role === 'card';
// -> the card ids of one section, in reading order.
export const walkStops = (blocks, sectionId) => (blocks || []).filter(block => isStop(block) && block.learn.sectionId === sectionId).sort(byKey).map(block => block.id);

// The contents button for a section: Start (no card done), Continue (some), Start again (all); null for a section with no cards (a chapter, an unbuilt section).
export const walkButton = (blocks, sectionId) => walkLabel((blocks || []).filter(block => isStop(block) && block.learn.sectionId === sectionId).map(block => !!block.learn.done));
// The same from the contents' chips (toc-links.js linkedCards: { role, done }): a section's cards and notes card.
export const walkLabelOf = chips => walkLabel((chips || []).filter(chip => chip.role === 'card' || chip.role === 'notes').map(chip => !!chip.done));
function walkLabel(done) {
  if (!done.length) return null;
  const count = done.filter(Boolean).length;
  return count === 0 ? 'Start' : count === done.length ? 'Start again' : 'Continue';
}

// Start or Continue at the first card not done; Start again at the first card.
export function walkStart(blocks, sectionId) {
  const stops = walkStops(blocks, sectionId);
  if (!stops.length) return null;
  const byId = new Map((blocks || []).map(block => [block.id, block])), open = stops.findIndex(id => !byId.get(id)?.learn?.done);
  return { sectionId, stops, at: open < 0 ? 0 : open };
}

// The sections that have cards, in reading order (numbers: "1.2" before "1.10").
export function walkSections(blocks) {
  const ids = [...new Set((blocks || []).filter(isStop).map(block => block.learn.sectionId))];
  return ids.sort((a, b) => { const x = numbers(a), y = numbers(b); for (let k = 0; k < Math.max(x.length, y.length); k += 1) if ((x[k] || 0) !== (y[k] || 0)) return (x[k] || 0) - (y[k] || 0); return 0; });
}

// Next: the current card is done; then the next card, or past the last one the section is done and the walk goes on into the next section with cards (or ends).
// -> { done: cardId, sectionDone: sectionId | null, state: the next state | null (the walk ends) }
export function walkNext(state, blocks) {
  if (!state) return { done: null, sectionDone: null, state: null };
  const done = state.stops[state.at];
  if (state.at + 1 < state.stops.length) return { done, sectionDone: null, state: { ...state, at: state.at + 1 } };
  const marked = (blocks || []).map(block => (block.id === done ? { ...block, learn: { ...block.learn, done: true } } : block));
  const sections = walkSections(marked), next = sections[sections.indexOf(state.sectionId) + 1];
  return { done, sectionDone: state.sectionId, state: next ? walkStart(marked, next) : null };
}
export const walkPrev = state => (state && state.at > 0 ? { ...state, at: state.at - 1 } : state);

// The box a stop shows: its card and the text items of its item (its lead and follow).
export const walkBox = (cardBox, textBoxes = []) => union([cardBox, ...textBoxes]);

// The camera for a stop (owner 2026-11-18 14:15): the stop's box (its card with its lead and follow) whole and centred in the view (area: { left, right, top, bottom } in
// screen pixels, `margin` clear on every side): zoom 1 when it fits, else zoomed out until it does, never in past 1, never below MIN_ZOOM. -> { x, y, z } (screen = world * z + view).
export const MIN_ZOOM = 0.2;
export function walkCamera(box, area, margin) {
  const room = { w: area.right - area.left - 2 * margin, h: area.bottom - area.top - 2 * margin };
  const z = Math.max(MIN_ZOOM, Math.min(1, room.w / box.w, room.h / box.h));
  const x = (area.left + area.right) / 2 - (box.x + box.w / 2) * z, y = (area.top + area.bottom) / 2 - (box.y + box.h / 2) * z;
  return { x: Math.round(x), y: Math.round(y), z: Math.round(z * 1000) / 1000 };
}
