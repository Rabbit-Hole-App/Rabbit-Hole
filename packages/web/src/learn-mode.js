// Learn mode (learn-mode-spec.md, owner 2026-11-18 15:19-15:38): the walk as a layout. On from the contents' Start / Continue (or the Learn side of
// the Learn | Canvas pill), off from its Canvas side, Escape or the walk ending: Learn mode is exactly "a walk is running" (AdaptiveCanvas walk state).
// Left: the guide (section title, lead, rule, follow). Right: tabs Cards | Canvas | TOC | Chat. Pure, so the unit tests read it; LearnPage applies it.
export const LEARN_TABS = Object.freeze([
  { id: 'cards', label: 'Cards' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'toc', label: 'TOC' },
  { id: 'chat', label: 'Chat' },
]);
// The top row's height: the walk pill and the Learn | Canvas pill, with the page header hidden.
export const LEARN_TOP = 56;
// The guide's text column (body size), however wide the split.
export const GUIDE_MAX = 720;

// Entering: the right panel as it was (open and tab), held until Learn mode ends; Learn mode opens on Cards.
export const learnEnter = panel => ({ panelWas: { open: !!panel?.open, tab: panel?.tab ?? null }, tab: 'cards' });
// Leaving: the right panel put back as it was when Learn mode began (null: nothing held, leave it).
export const learnLeave = held => held?.panelWas ?? null;

// What a tab shows for the current stop:
//   cards  - the stop's own card component drawn in the pane at its width (AdaptiveCanvas learnCards; owner 2026-11-18 16:13: no Focus), the right panel closed;
//   canvas - the free canvas, the stop centred at zoom 1, nothing selected (owner 2026-11-18);
//   toc, chat - the right panel's own tab, widened to the split (the canvas stays as it was underneath); in Chat the stop is the canvas selection,
//               which is the chat's selected context (chat-canvas-context.js reads api.selection()).
export function learnView(tab) {
  if (tab === 'canvas') return { cards: false, centre: true, select: false, panel: { open: false, tab: null } };
  if (tab === 'toc' || tab === 'chat') return { cards: false, centre: false, select: tab === 'chat', panel: { open: true, tab } };
  return { cards: true, centre: false, select: false, panel: { open: false, tab: null } };
}
export const learnTab = tab => (LEARN_TABS.some(entry => entry.id === tab) ? tab : 'cards');

// Cards tab zoom (owner 2026-11-18: the card shown whole, zoom in and out from there; LearnCardView.jsx).
export const ZOOM_STEPS = Object.freeze([0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2]);
// The pane's room around the card: side padding, the top gap, and the composer's dock at the bottom (LearnPane data-learn-dock).
export const CARD_ROOM = Object.freeze({ side: 24, top: 16, dock: 150 });
// The scale that shows a card of size `card` whole in a pane of size `pane`: at most 1, at least the smallest step.
export const fitScale = (card, pane) => (card.w > 0 && card.h > 0 ? Math.max(ZOOM_STEPS[0], Math.min(1, (pane.w - 2 * CARD_ROOM.side) / card.w, (pane.h - CARD_ROOM.top - CARD_ROOM.dock) / card.h)) : 1);
// The next zoom step from `scale` (dir 1: in, -1: out), staying inside the steps.
export const zoomStep = (scale, dir) => (dir > 0 ? ZOOM_STEPS.find(step => step > scale + 0.001) ?? ZOOM_STEPS.at(-1) : [...ZOOM_STEPS].reverse().find(step => step < scale - 0.001) ?? ZOOM_STEPS[0]);

// The section the Learn side of the pill starts: the first with cards not all done (Start or Continue), else the first.
export function learnSection(sections, labelOf) {
  return (sections || []).find(id => labelOf(id) !== 'Start again') ?? sections?.[0] ?? null;
}
