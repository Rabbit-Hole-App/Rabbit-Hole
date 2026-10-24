// Focus (docs/features/focus-study.md): the adapter index and the canvas seam's one DOM step. AdaptiveCanvas imports this file
// once. Each content lane adds ONE side-effect import line below for its adapter (registerFocusAdapter at import); a card no
// adapter claims shows no Focus control. Adapter files are plain JS (no JSX), so this index stays importable by unit tests.
import './focus-adapter-notebook.js';
import './focus-adapter-pdf.js';
import './focus-adapter-explanation.js';
import './focus-adapter-table.js';
import './focus-adapter-note.js';
import './focus-adapter-image.js';
import './focus-adapter-video.js';
import './focus-adapter-model.js';
import { exitNavigation, focusAdapters, focusFrame } from './focus-controller.js';

// FocusFrame's header row (44 px) and the gap under it (8 px), taken off the top of the working rectangle.
export const FOCUS_BAR = 52;
// The working rectangle for the focused content (surface px): the free area (chrome already out: { left, top, right, bottom })
// less the controller's inset, less the header row above the content.
export function workspaceFrame(area) {
  if (!area) return null;
  const frame = focusFrame({ pane: { left: area.left, top: area.top, width: area.right - area.left, height: area.bottom - area.top } });
  return frame && { ...frame, top: frame.top + FOCUS_BAR, height: Math.max(0, frame.height - FOCUS_BAR) };
}

// Run after each commit with the focus state and the camera: enters, updates or exits the adapter of the focused card. The
// adapter restyles its host (the card's own [data-block-id] element) in place; this only calls its hooks.
// shown: what the previous call returned (null when nothing is focused). Exiting (state null) calls the adapter's exit, then
// restore(exitNavigation(previous)) once. A switch to another card exits the old adapter and enters the new one, restoring
// nothing (the first saved navigation stays). A new frame or a camera move calls update. A focused card with no host or no
// adapter calls gone(id). Nothing here saves, snapshots or calls a model.
export function syncFocus(shown, state, { find, view, readOnly = false, restore = () => {}, gone = () => {} }) {
  const ctx = { view, readOnly };
  if (shown && shown.id !== state?.id) {
    shown.adapter.exit(shown.host, ctx);
    if (!state) {
      restore(exitNavigation(shown.state));
      // A keyboard user whose focus went with the frame lands back on the card.
      if (typeof document !== 'undefined' && (!document.activeElement || document.activeElement === document.body)) shown.host.focus?.({ preventScroll: true });
    }
    shown = null;
  }
  if (!state) return null;
  if (shown) {
    if (shown.state.frame !== state.frame || shown.view !== view) shown.adapter.update(shown.host, state.frame, ctx);
    return { ...shown, state, view };
  }
  const host = find(state.id), adapter = focusAdapters.get(state.kind);
  if (!host || !adapter || !state.frame) { gone(state.id); return null; }
  adapter.enter(host, state.frame, ctx);
  return { id: state.id, adapter, host, state, view };
}
