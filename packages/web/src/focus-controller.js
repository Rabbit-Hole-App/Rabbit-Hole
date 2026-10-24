// Focus (docs/features/focus-study.md): one selected card shown temporarily in the whole working pane. The one controller
// contract the card toolbar, the right-click menu, the keyboard and Study > Notebook all go through. Pure: no React, no DOM.
// Focus is presentation state on this page only: entering or leaving it writes no board geometry, adds no undo entry, makes
// no model call and charges no credit. The state holds what is focused and the navigation to put back, never a card's size.

// The working rectangle: the measured pane (surface px, chrome already taken out by the caller) less the inset.
export const FOCUS_INSET = Object.freeze({ desktop: 16, narrow: 12 });
export const NARROW_MAX = 640; // the canvas's own phone breakpoint (@max-[640px])
export function focusFrame({ pane, inset, narrow } = {}) {
  if (!pane) return null;
  const small = narrow ?? pane.width < NARROW_MAX;
  const gap = typeof inset === 'number' && inset >= 0 ? inset : small ? FOCUS_INSET.narrow : FOCUS_INSET.desktop;
  return {
    left: Math.round((pane.left || 0) + gap), top: Math.round((pane.top || 0) + gap),
    width: Math.max(0, Math.round(pane.width - 2 * gap)), height: Math.max(0, Math.round(pane.height - 2 * gap)),
  };
}

// The same rectangle in the canvas world (the world layer is translate(view.x, view.y) scale(view.z)): where the card's own
// host is placed while focused, counter-scaled so text keeps its normal size. The host is restyled in place, never moved.
export function frameInWorld(frame, view) {
  if (!frame || !view || !(view.z > 0)) return null;
  return { x: (frame.left - view.x) / view.z, y: (frame.top - view.y) / view.z, width: frame.width, height: frame.height, scale: 1 / view.z };
}

// Adapters, one per content kind, registered by the lane that owns the kind (none yet):
//   { kind, label, canFocus(block, ctx), enter(host, frame, ctx), update(host, frame, ctx), exit(host, ctx) }
// label: the button's accessible name ('Focus notebook'). host: the card's existing element; enter, update and exit only
// change its temporary presentation (never its parent, never the saved card). ctx: { view, readOnly }.
export const focusAdapters = new Map();
const HOOKS = ['canFocus', 'enter', 'update', 'exit'];
export function registerFocusAdapter(adapter) {
  if (!adapter || typeof adapter.kind !== 'string' || !adapter.kind || typeof adapter.label !== 'string' || /\.\.\.|…/.test(adapter.label)
    || HOOKS.some(hook => typeof adapter[hook] !== 'function')) throw new Error('A Focus adapter needs kind, label, canFocus, enter, update and exit');
  focusAdapters.set(adapter.kind, adapter);
  return adapter;
}
export function adapterFor(block, ctx = {}) {
  if (!block || typeof block !== 'object') return null;
  for (const adapter of focusAdapters.values()) if (adapter.canFocus(block, ctx)) return adapter;
  return null;
}
// No adapter, no Focus control: a button that does nothing never shows.
export const isFocusEligible = (block, ctx = {}) => !!adapterFor(block, ctx);

// Only the fields captureNavigation (AdaptiveCanvas.jsx) returns: owner, view, selection, scroll.
const navOf = saved => (saved && typeof saved === 'object' ? { owner: saved.owner, view: saved.view, selection: saved.selection || [], scroll: saved.scroll || [] } : null);

// State: null (not focusing) or { id, kind, saved, frame }. Actions:
//   enter { id, kind, saved, frame }  saved: captureNavigation() taken before entering. Focusing another card while focused
//                                     keeps the first saved navigation, so Back to canvas returns to where Focus began.
//   workspace-changed { frame }       the pane was measured again (panel, divider, window): the new frame, same card.
//   exit                              Back to canvas, Escape, Study > Canvas.
//   content-gone { id }               the focused card was deleted or became inaccessible: a clean exit.
// When the state goes from a value to null the host restores exitNavigation(previous) and calls the adapter's exit, once.
export function focusReducer(state = null, action = {}) {
  switch (action.type) {
    case 'enter': {
      if (typeof action.id !== 'string' || !action.id || typeof action.kind !== 'string' || !action.kind) return state;
      if (state?.id === action.id) return state;
      return { id: action.id, kind: action.kind, saved: state ? state.saved : navOf(action.saved), frame: action.frame || null };
    }
    case 'workspace-changed': {
      if (!state || !action.frame) return state;
      const same = state.frame && ['left', 'top', 'width', 'height'].every(key => state.frame[key] === action.frame[key]);
      return same ? state : { ...state, frame: action.frame };
    }
    case 'exit': return null;
    case 'content-gone': return state && (action.id == null || action.id === state.id) ? null : state;
    default: return state;
  }
}

// The navigation to put back on exit, minus any scroll position inside the focused card: the reader's latest page and the
// notebook's latest scroll are the learner's work, never reverted to the snapshot taken on entry.
export function exitNavigation(state) {
  if (!state?.saved) return null;
  const inside = node => node?.closest?.('[data-block-id]')?.getAttribute?.('data-block-id') === state.id;
  return { ...state.saved, scroll: state.saved.scroll.filter(entry => !inside(entry.node)) };
}

// The focus snapshot onState reports (no navigation, no element): what the toolbar, menus and Study read.
export const focusSnapshot = state => (state ? { id: state.id, kind: state.kind } : null);

// Escape leaves Focus only when nothing inside used it: not when already handled, not while typing in a field, an editor or
// an embedded frame, and not while a menu, dialog, drag or active viewer is open (ctx says what the canvas knows is open).
const EDITABLE = ['INPUT', 'TEXTAREA', 'SELECT', 'IFRAME'];
export function shouldExitOnEscape(event, ctx = {}) {
  if (!ctx.focusing || event?.key !== 'Escape' || event.defaultPrevented) return false;
  if (ctx.menuOpen || ctx.dialogOpen || ctx.gesture || ctx.viewerActive) return false;
  const target = event.target;
  if (target && (target.isContentEditable || EDITABLE.includes(target.tagName))) return false;
  if (target?.closest?.('[contenteditable=""],[contenteditable="true"],[role="textbox"],[role="dialog"],[role="menu"],[role="listbox"],[data-viewer-active]')) return false;
  return true;
}
