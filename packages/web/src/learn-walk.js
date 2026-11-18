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

// The camera for a stop (owner 2026-11-18 14:15, 14:40): the stop's box (its card with its lead and follow) centred on `centreX` (the chat composer's middle; else the view's)
// in the view (area: { left, right, top, bottom } in screen pixels, `margin` clear on every side). Zoom 1 when it fits; else zoomed out until it does, but never below READ_ZOOM,
// the smallest size its words still read at. A box taller than that has two views (owner 2026-11-18 14:50, option A): part 0 top-aligned (its lead and the top of its card),
// part 1 bottom-aligned (the end of its card and its follow); Next shows part 1 before the next card. Never in past 1; a box wider than the view at READ_ZOOM is fitted to the
// width. -> { x, y, z } (screen = world * z + view).
export const MIN_ZOOM = 0.2, READ_ZOOM = 0.85;
const zoomFor = (box, room) => Math.max(MIN_ZOOM, Math.min(1, room.w / box.w, Math.max(READ_ZOOM, room.h / box.h)));
const roomOf = (area, margin) => ({ w: area.right - area.left - 2 * margin, h: area.bottom - area.top - 2 * margin });
// How many views a stop takes: 1, or 2 when its box is taller than the view at the reading size.
export const walkParts = (box, area, margin) => { const room = roomOf(area, margin); return box.h * zoomFor(box, room) > room.h + 1 ? 2 : 1; };
export function walkCamera(box, area, margin, centreX = null, part = 0) {
  const room = roomOf(area, margin), z = zoomFor(box, room);
  const x = (centreX ?? (area.left + area.right) / 2) - (box.x + box.w / 2) * z;
  const y = box.h * z <= room.h + 1 ? (area.top + area.bottom) / 2 - (box.y + box.h / 2) * z : part ? area.bottom - margin - (box.y + box.h) * z : area.top + margin - box.y * z;
  return { x: Math.round(x), y: Math.round(y), z: Math.round(z * 1000) / 1000 };
}
// The green bar (0..1): the cards before this one, and this card's views seen so far.
export const walkProgress = state => (state ? Math.min(1, (state.at + ((state.part || 0) + 1) / (state.parts || 1)) / state.stops.length) : 0);
