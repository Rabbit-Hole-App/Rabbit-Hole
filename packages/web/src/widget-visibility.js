// What the canvas actually shows of its View > Show / hide widgets (docs/features/focus-study.md): the one calculation the
// canvas render, its onState checkmarks and the View menu all read. Pure: no React, no DOM.
// Two stores, never mixed: the Canvas preferences (ui-prefs.js, this device, every canvas) and the Study map choices
// (study-state.js maps, this browser, this canvas). Entering or leaving Study writes neither; it only changes which one is read.
import { UI_PREF_DEFAULTS } from './ui-prefs.js';
import { STUDY_MAPS } from './study-state.js';

export const WIDGETS = Object.freeze(['minimap', 'holeMap', 'curious', 'toolbar']);

// A repository canvas in Study (pinned-study-codebase-spec.md 2d): the work and reference panes are the whole screen, so the toolbar, the minimap and the
// Rabbit Hole map are hidden whatever the saved choices, the Study map choice included. Release 1 canvases (no repository) keep the rule below.
export const STUDY_HIDDEN = Object.freeze(['toolbar', 'minimap', 'holeMap']);
export const HIDDEN_IN_STUDY = 'Hidden in Study';
export const studyHides = ({ mode, repository = false } = {}) => mode === 'study' && !!repository;
// View > Show / hide's rows that cannot be changed now (greyed, tooltip HIDDEN_IN_STUDY). Nothing is written to the Canvas preferences.
export const widgetLocked = ({ mode, repository = false, name } = {}) => studyHides({ mode, repository }) && STUDY_HIDDEN.includes(name);

// mode: 'canvas' | 'study'. canvas: the Canvas preferences in force ({ minimap, holeMap, curious, toolbar }). study: the Study
// arrangement's maps ({ minimap?, holeMap? }); a map with no explicit Study choice is hidden while studying.
export function effectiveWidgets({ mode, canvas, study, repository = false } = {}) {
  const out = {};
  for (const name of WIDGETS) out[name] = typeof canvas?.[name] === 'boolean' ? canvas[name] : UI_PREF_DEFAULTS[name];
  if (mode === 'study') for (const name of STUDY_MAPS) out[name] = !repository && study?.[name] === true;
  return out;
}

// An explicit View > Show / hide toggle, routed to the store that owns it in this mode:
//   { store: 'study', action } - dispatch action to the Study reducer (study-state.js setMap); the Canvas preference is untouched;
//   { store: 'canvas', name, on } - the Canvas preference (AdaptiveCanvas state + saveUiPref); the Study choice is untouched.
// null for a name that is not a widget.
export function widgetToggle({ mode, name, on, repository = false }) {
  if (!WIDGETS.includes(name) || typeof on !== 'boolean' || widgetLocked({ mode, repository, name })) return null;
  if (mode === 'study' && STUDY_MAPS.includes(name)) return { store: 'study', action: { type: 'setMap', name, on } };
  return { store: 'canvas', name, on };
}

// While a card is focused (focus-controller.js) the canvas draws its content and its toolbar (but see toolbarDrawn), not its maps or Curious. A view of
// what is shown, never written back: the three come back exactly as they were (hidden ones stay hidden) when Focus ends.
// keepCurious: a repository canvas in Study (owner 2026-11-15): its Focus is the working view, so the Show suggestions toggle keeps working there.
export const FOCUS_HIDDEN = Object.freeze(['minimap', 'holeMap', 'curious']);
export function focusWidgets(shown, focused, { keepCurious = false } = {}) {
  if (!focused) return shown;
  const out = { ...shown };
  for (const name of FOCUS_HIDDEN) if (name in out && !(keepCurious && name === 'curious')) out[name] = false;
  return out;
}

// Run or Runbook as the work of a repository canvas in Study (owner 2026-11-15): the card alone fills the right pane. The canvas surface, the other cards, the
// zoom controls and the page's lower-left button are not drawn, and Focus's own header strip (title, Back to canvas) is left out: the work tabs are the way back.
// A view only (CSS and what AdaptiveCanvas renders): the card's host stays mounted in place, so a Run card's session and the Runbook editor live on.
export const studyCardOnly = ({ mode, repository = false, work } = {}) => studyHides({ mode, repository }) && (work === 'run' || work === 'runbook');

// Study's Canvas work (and Run, Runbook) on a repository canvas draws no zoom controls and no lower-left feedback button (owner 2026-11-15). The notebook work keeps them.
export const studyChromeOff = ({ mode, repository = false, work } = {}) => studyHides({ mode, repository }) && work !== 'notebook';

// The drawing toolbar is drawn as View > Toolbar says, except over a pinned Study's notebook in Focus (owner, 2026-10-29): there it
// stands down too. A view, never written back: Canvas or unpinning shows the saved choice again, a hidden toolbar still hidden.
// On a repository canvas the toolbar is not drawn in Study at all: for every focusKind, and for work 'canvas' (owner, 2026-11-15).
export const toolbarDrawn = (toolbar, { studying = false, pinned = false, focusKind = null, repository = false } = {}) =>
  !!toolbar && !(studying && repository) && !(studying && pinned && focusKind === 'notebook');
