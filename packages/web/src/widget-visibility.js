// What the canvas actually shows of its View > Show / hide widgets (docs/features/focus-study.md): the one calculation the
// canvas render, its onState checkmarks and the View menu all read. Pure: no React, no DOM.
// Two stores, never mixed: the Canvas preferences (ui-prefs.js, this device, every canvas) and the Study map choices
// (study-state.js maps, this browser, this canvas). Entering or leaving Study writes neither; it only changes which one is read.
import { UI_PREF_DEFAULTS } from './ui-prefs.js';
import { STUDY_MAPS } from './study-state.js';

export const WIDGETS = Object.freeze(['minimap', 'holeMap', 'curious', 'toolbar']);

// mode: 'canvas' | 'study'. canvas: the Canvas preferences in force ({ minimap, holeMap, curious, toolbar }). study: the Study
// arrangement's maps ({ minimap?, holeMap? }); a map with no explicit Study choice is hidden while studying.
export function effectiveWidgets({ mode, canvas, study } = {}) {
  const out = {};
  for (const name of WIDGETS) out[name] = typeof canvas?.[name] === 'boolean' ? canvas[name] : UI_PREF_DEFAULTS[name];
  if (mode === 'study') for (const name of STUDY_MAPS) out[name] = study?.[name] === true;
  return out;
}

// An explicit View > Show / hide toggle, routed to the store that owns it in this mode:
//   { store: 'study', action } - dispatch action to the Study reducer (study-state.js setMap); the Canvas preference is untouched;
//   { store: 'canvas', name, on } - the Canvas preference (AdaptiveCanvas state + saveUiPref); the Study choice is untouched.
// null for a name that is not a widget.
export function widgetToggle({ mode, name, on }) {
  if (!WIDGETS.includes(name) || typeof on !== 'boolean') return null;
  if (mode === 'study' && STUDY_MAPS.includes(name)) return { store: 'study', action: { type: 'setMap', name, on } };
  return { store: 'canvas', name, on };
}

// While a card is focused (focus-controller.js) the canvas draws its content and its toolbar (but see toolbarDrawn), not its maps or Curious. A view of
// what is shown, never written back: the three come back exactly as they were (hidden ones stay hidden) when Focus ends.
export const FOCUS_HIDDEN = Object.freeze(['minimap', 'holeMap', 'curious']);
export function focusWidgets(shown, focused) {
  if (!focused) return shown;
  const out = { ...shown };
  for (const name of FOCUS_HIDDEN) if (name in out) out[name] = false;
  return out;
}

// The drawing toolbar is drawn as View > Toolbar says, except over a pinned Study's notebook in Focus (owner, 2026-10-29): there it
// stands down too. A view, never written back: Canvas or unpinning shows the saved choice again, a hidden toolbar still hidden.
export const toolbarDrawn = (toolbar, { studying = false, pinned = false, focusKind = null } = {}) =>
  !!toolbar && !(studying && pinned && focusKind === 'notebook');
