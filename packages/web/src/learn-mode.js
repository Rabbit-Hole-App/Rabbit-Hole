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
//   cards  - the stop's card in Focus (the right panel closed, so the canvas frame is the pane);
//   canvas - the free canvas, the stop selected and centred at zoom 1, no Focus;
//   toc, chat - the right panel's own tab, widened to the split (the canvas stays as it was underneath); in Chat the stop is the canvas selection,
//               which is the chat's selected context (chat-canvas-context.js reads api.selection()).
export function learnView(tab) {
  if (tab === 'canvas') return { focus: false, centre: true, select: false, panel: { open: false, tab: null } };
  if (tab === 'toc' || tab === 'chat') return { focus: null, centre: false, select: tab === 'chat', panel: { open: true, tab } };
  return { focus: true, centre: false, select: false, panel: { open: false, tab: null } };
}
export const learnTab = tab => (LEARN_TABS.some(entry => entry.id === tab) ? tab : 'cards');

// The section the Learn side of the pill starts: the first with cards not all done (Start or Continue), else the first.
export function learnSection(sections, labelOf) {
  return (sections || []).find(id => labelOf(id) !== 'Start again') ?? sections?.[0] ?? null;
}
