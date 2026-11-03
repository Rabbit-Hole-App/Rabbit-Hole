// Who owns Ctrl/Cmd+K, Ctrl/Cmd+L and Ctrl/Cmd+Shift+F (owner brief 2026-10-13, selection action bar and Search). Three places
// used to take Ctrl+K on their own (Search, Dive, the canvas's inline editor), ordered only by when their listeners happened
// to be added. Now one capture listener asks the claimants of a chord in priority order and the first that takes it ends the
// event, so one keypress can never open two interfaces.
//   quick-edit  Ctrl/Cmd+K          the canvas's Quick Edit (inline editor); Dive when the canvas has no inline editor.
//   add-to-chat Ctrl/Cmd+L          the canvas, with a selection; Ctrl+Shift+L (lock) and plain L (laser) are not this chord.
//   search      Ctrl/Cmd+Shift+F    Search.jsx.
// Inside text inputs, code editors and dialogs the claimant decides from `field` (fieldKind); by default it keeps the
// browser's and the field's own behaviour. Pure where it can be, so it is tested without a browser.
import { isMac, keyLabel } from './shortcuts.js';

export const CHORDS = { 'quick-edit': { key: 'k', shift: false }, 'add-to-chat': { key: 'l', shift: false }, search: { key: 'f', shift: true } };

export { isMac };
// The chord as a binding (shortcuts.js): 'Ctrl+L' on Windows and Linux, '⌘L' on a Mac (owner brief 2026-11-02: one spelling
// for the modal, menus and tooltips).
export const chordBinding = chord => `Mod${CHORDS[chord].shift ? '+Shift' : ''}+${CHORDS[chord].key.toUpperCase()}`;
export const chordLabel = (chord, mac = isMac()) => keyLabel(chordBinding(chord), mac);

// The chord a keydown is, or null: Ctrl or Cmd held, never Alt, Shift exactly as the chord says, not during IME composition.
export function chordOf(event) {
  if (!event || event.isComposing || event.keyCode === 229) return null;
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = String(event.key || '').toLowerCase();
  for (const [name, chord] of Object.entries(CHORDS)) if (chord.key === key && chord.shift === !!event.shiftKey) return name;
  return null;
}

// Where the focus is, when it is somewhere a chord should keep its normal meaning: a dialog, an open menu (its target is the
// menu's, never an older selection: owner brief 2026-11-02), a code editor or embedded page, or a text field. null for the page
// itself (body) and for plain controls.
export function fieldKind(element) {
  if (!element || element.nodeType !== 1 || (typeof document !== 'undefined' && (element === document.body || element === document.documentElement))) return null;
  if (element.closest?.('[role="dialog"],[aria-modal="true"]')) return 'dialog';
  if (element.closest?.('[role="menu"]')) return 'menu';
  if (element.tagName === 'IFRAME' || element.closest?.('.cm-editor,.monaco-editor,[data-code-editor]')) return 'code';
  if (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)) return 'text';
  return null;
}

export const modalOpen = (doc = typeof document !== 'undefined' ? document : null) => !!doc?.querySelector?.('[role="dialog"][aria-modal="true"]');

// A plain or Shift key the page owns (Shift+S Slash Commands, Shift+P the right panel; owner brief 2026-11-02 section 3) is
// taken only with the focus on the page, a canvas card or a plain control: never while typing, in a code editor, notebook,
// embedded page, dialog, menu, the composer or a card's own widget or active viewer, never with a modal open, never during
// IME composition and never from a held key's repeats. The caller adds its own conditions (presenting, the action's own rules).
export function pageKeyAllowed(event, active = typeof document !== 'undefined' ? document.activeElement : null) {
  if (!event || event.isComposing || event.keyCode === 229 || event.repeat || modalOpen()) return false;
  if (!active || active.nodeType !== 1 || (typeof document !== 'undefined' && (active === document.body || active === document.documentElement))) return true;
  if (fieldKind(active) || active.tagName === 'SELECT') return false;
  if (active.closest?.('[data-block-id]') && !active.matches?.('[data-block-id]')) return false;
  return !active.closest?.('[data-chat-composer],[data-toc-composer],[data-comments-panel],[data-study-pane],[data-study-work],[role="menu"],[data-canvas-doc],[data-viewer-active],[data-companion],[data-graph-card]');
}

// Ctrl/Cmd+L adds the canvas selection to the chat: only with a selection and the focus on the page, never in a field,
// while the editor is open, presenting, or on a view-only board - everywhere else the browser keeps its own Ctrl+L.
export const addToChatAllowed = ({ hasSelection, field = null, inlineOpen = false, presenting = false, readOnly = false }) => !!hasSelection && !field && !inlineOpen && !presenting && !readOnly;
// Ctrl/Cmd+K is the canvas's Quick Edit wherever the canvas has the focus, with a selection or not; in a foreign field or
// dialog it is left alone. ownField: the focus is in a field the canvas owns (its open text editor, the inline editor).
export const quickEditAllowed = ({ field = null, ownField = false }) => !field || ownField;

const claims = { 'quick-edit': [], 'add-to-chat': [], search: [] };
let installed = false;

// Offers the chord to its claimants, highest priority first; the first that returns true owns it, the event stops there.
// Returns the owner's name, or null when nobody took it (the browser and the focused field then keep the key).
export function routeShortcut(event, field) {
  const chord = chordOf(event);
  if (!chord) return null;
  // An open modal window (Shortcuts, Slash Commands, Settings) owns the keyboard: nothing behind it takes a chord.
  const where = field === undefined && typeof document !== 'undefined' ? (modalOpen() ? 'dialog' : fieldKind(document.activeElement)) : field ?? null;
  for (const claim of claims[chord]) {
    if (!claim.run(event, where)) continue;
    event.preventDefault();
    event.stopImmediatePropagation?.();
    return claim.owner;
  }
  return null;
}

// run(event, field) returns true when it took the chord. Returns the function that withdraws the claim.
export function claimChord(chord, owner, priority, run) {
  const claim = { owner, priority, run };
  claims[chord] = [...claims[chord], claim].sort((a, b) => b.priority - a.priority);
  if (!installed && typeof window !== 'undefined') { installed = true; window.addEventListener('keydown', event => routeShortcut(event), true); }
  return () => { claims[chord] = claims[chord].filter(entry => entry !== claim); };
}
