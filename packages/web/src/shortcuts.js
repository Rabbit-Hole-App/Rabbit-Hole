// Every shortcut Rabbit Hole advertises, in one list (owner brief 2026-11-02, C:/s/spec/shortcuts/owner-brief-2026-11-02.md):
// View > Shortcuts (ShortcutsSheet.jsx) draws it, and the menubar (canvas-menus.js), the right-click and card menus
// (canvas-actions.js) and the selection bar (SelectionActions.jsx) take their hints and aria-keyshortcuts from it, so a hint
// can never name a key the modal does not. The handlers stay where they are (AdaptiveCanvas.jsx, LearnPage.jsx, Shell.jsx,
// shortcut-owner.js); a row here names a key one of them actually handles.
//
// A binding is a string of tokens joined by '+': Mod (Ctrl on Windows and Linux, Cmd on a Mac), Shift, Alt (Option on a Mac),
// then one key (a KeyboardEvent.key name, or Plus, Minus, ArrowKeys) or a pointer gesture (click, drag, scroll). Pure: no React,
// no DOM at import.

export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test([navigator.userAgentData?.platform, navigator.platform, navigator.userAgent].filter(Boolean).join(' '));

const NAMES = { ' ': 'Space', Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ArrowKeys: 'Arrow keys', PageUp: 'Page Up', PageDown: 'Page Down', ContextMenu: 'Menu key' };
const MAC_NAMES = { Enter: 'Return', Backspace: 'Delete ⌫', Alt: 'Option' };
const name = (token, mac) => (mac && MAC_NAMES[token]) || NAMES[token] || token;

// 'Mod+Shift+F' -> 'Ctrl+Shift+F' on Windows, '⌘Shift+F' on a Mac (the owner's spelling: ⌘K, ⌘Shift+F, ⌘Option+C, Shift+S).
export function keyLabel(binding, mac = isMac()) {
  const tokens = binding.split('+');
  const mod = tokens.includes('Mod');
  const rest = tokens.filter(token => token !== 'Mod').map(token => name(token, mac));
  return mac && mod ? `⌘${rest.join('+')}` : [...(mod ? ['Ctrl'] : []), ...rest].join('+');
}

// The aria-keyshortcuts value of one keyboard binding ('Control+Shift+F', 'Meta+K'); null for a pointer gesture.
const GESTURE = /^(click|drag|scroll|Right-click|Two-finger click)$/;
export function ariaKey(binding, mac = isMac()) {
  const tokens = binding.split('+');
  if (tokens.some(token => GESTURE.test(token)) || tokens.includes('ArrowKeys')) return null;
  return tokens.map(token => (token === 'Mod' ? (mac ? 'Meta' : 'Control') : token === ' ' ? 'Space' : token)).join('+');
}

// Rows: id, section, label, keys (bindings, or { win, mac } where the platforms differ), and optionally note (when it
// applies) and text (a row that names no key).
// The window's tabs, in order (owner 2026-11-02: the sections as tabs, like Creator Analytics): each section's full title and
// its short tab label. Menus is its own tab, after the editing keys it was a sub-section of.
export const SECTIONS = ['Essentials', 'Canvas navigation', 'Selection, editing and arrangement', 'Menus', 'Drawing tools', 'Chat and text editing', 'Presenting and interactive cards', 'Mouse and trackpad'];
export const TAB_LABELS = { Essentials: 'Essentials', 'Canvas navigation': 'Navigation', 'Selection, editing and arrangement': 'Editing', Menus: 'Menus', 'Drawing tools': 'Drawing', 'Chat and text editing': 'Chat and text', 'Presenting and interactive cards': 'Presenting', 'Mouse and trackpad': 'Mouse and trackpad' };
// A line under a section's heading: where its keys apply.
export const SECTION_NOTES = { 'Drawing tools': 'Same keys on Windows and Mac, while the canvas has the keyboard', 'Mouse and trackpad': 'On the canvas or the object under the pointer; links and viewers keep their own gestures' };
const TOOLS = [['tool-select', 'Select', 'V'], ['tool-hand', 'Hand (pan)', 'H'], ['tool-rect', 'Rectangle', 'R'], ['tool-ellipse', 'Ellipse', 'O'], ['tool-arrow', 'Arrow', 'A'],
  ['tool-line', 'Line', 'L'], ['tool-pen', 'Pen', 'P'], ['tool-text', 'Text', 'T'], ['tool-eraser', 'Eraser', 'E'], ['tool-sticky', 'Sticky note', 'N']];

// sendKey: the Chat send setting (ui-prefs.js chatSendKey): 'enter' or 'mod'.
export function shortcutRows({ sendKey = 'enter' } = {}) {
  const mod = sendKey === 'mod';
  return [
    // Quick Edit is the first shortcut (owner brief section 1).
    { id: 'quick-edit', section: 'Essentials', label: 'Quick Edit (Edit with AI)', keys: ['Mod+K'] },
    { id: 'add-to-chat', section: 'Essentials', label: 'Add the selection to Chat', keys: ['Mod+L'] },
    { id: 'focus-chat', section: 'Essentials', label: 'Open or focus Chat', keys: ['Mod+J'] },
    { id: 'search', section: 'Essentials', label: 'Search the app', keys: ['Mod+Shift+F'] },
    { id: 'find', section: 'Essentials', label: 'Find on this canvas', keys: ['/'] },
    { id: 'shortcuts', section: 'Essentials', label: 'Open Shortcuts', keys: ['?'] },
    { id: 'slash-commands', section: 'Essentials', label: 'Open Slash Commands', keys: ['Shift+S'] },
    { id: 'escape', section: 'Essentials', label: 'Close the current window or leave an interaction', keys: ['Escape'] },

    { id: 'zoom-in', section: 'Canvas navigation', label: 'Zoom in', keys: ['Mod+Plus'] },
    { id: 'zoom-out', section: 'Canvas navigation', label: 'Zoom out', keys: ['Mod+Minus'] },
    { id: 'zoom-reset', section: 'Canvas navigation', label: 'Zoom to 100%', keys: ['Shift+0'] },
    { id: 'fit-canvas', section: 'Canvas navigation', label: 'Fit canvas', keys: ['Shift+1'] },
    { id: 'fit-selection', section: 'Canvas navigation', label: 'Fit selection', keys: ['Shift+2'] },
    { id: 'sidebar', section: 'Canvas navigation', label: 'Show or hide the left sidebar', keys: ['Mod+\\'], note: 'On pages with the sidebar' },
    { id: 'right-panel', section: 'Canvas navigation', label: 'Show or hide the right panel', keys: ['Shift+P'] },
    { id: 'grid', section: 'Canvas navigation', label: 'Snap to grid on or off', keys: ['Shift+G'] },
    { id: 'open-card', section: 'Canvas navigation', label: 'Open the focused or selected card', keys: ['Enter'] },

    { id: 'undo', section: 'Selection, editing and arrangement', label: 'Undo', keys: ['Mod+Z'] },
    { id: 'redo', section: 'Selection, editing and arrangement', label: 'Redo', keys: { win: ['Mod+Shift+Z', 'Mod+Y'], mac: ['Mod+Shift+Z'] } },
    { id: 'cut', section: 'Selection, editing and arrangement', label: 'Cut', keys: ['Mod+X'] },
    { id: 'copy', section: 'Selection, editing and arrangement', label: 'Copy', keys: ['Mod+C'] },
    { id: 'paste', section: 'Selection, editing and arrangement', label: 'Paste', keys: ['Mod+V'] },
    { id: 'duplicate', section: 'Selection, editing and arrangement', label: 'Duplicate', keys: ['Mod+D'] },
    { id: 'select-all', section: 'Selection, editing and arrangement', label: 'Select all', keys: ['Mod+A'] },
    { id: 'delete', section: 'Selection, editing and arrangement', label: 'Delete the selection', keys: { win: ['Delete', 'Backspace'], mac: ['Backspace'] } },
    { id: 'group', section: 'Selection, editing and arrangement', label: 'Group', keys: ['Mod+G'] },
    { id: 'ungroup', section: 'Selection, editing and arrangement', label: 'Ungroup', keys: ['Mod+Shift+G'] },
    { id: 'lock', section: 'Selection, editing and arrangement', label: 'Lock or unlock', keys: ['Mod+Shift+L'] },
    { id: 'copy-style', section: 'Selection, editing and arrangement', label: 'Copy style', keys: ['Mod+Alt+C'] },
    { id: 'paste-style', section: 'Selection, editing and arrangement', label: 'Paste style', keys: ['Mod+Alt+V'] },
    { id: 'order-forward', section: 'Selection, editing and arrangement', label: 'Bring forward', keys: ['Mod+]'] },
    { id: 'order-backward', section: 'Selection, editing and arrangement', label: 'Send backward', keys: ['Mod+['] },
    { id: 'order-front', section: 'Selection, editing and arrangement', label: 'Bring to front', keys: ['Mod+Shift+]'] },
    { id: 'order-back', section: 'Selection, editing and arrangement', label: 'Send to back', keys: ['Mod+Shift+['] },
    { id: 'nudge', section: 'Selection, editing and arrangement', label: 'Nudge by 1 unit', keys: ['ArrowKeys'] },
    { id: 'nudge-10', section: 'Selection, editing and arrangement', label: 'Nudge by 10 units', keys: ['Shift+ArrowKeys'] },
    { id: 'comment', section: 'Selection, editing and arrangement', label: 'Comment on the selection', keys: ['C'] },
    { id: 'edit-text', section: 'Selection, editing and arrangement', label: 'Edit the selected text, note, shape or line label', keys: ['Enter'] },
    { id: 'select-card', section: 'Selection, editing and arrangement', label: 'Select the keyboard-focused card', keys: [' '] },
    // The canvas menu (CanvasMenu.jsx, WAI-ARIA menu). Shift+F10 and the Menu key are not verified on a Mac, so a Mac shows
    // the pointer ways in (owner brief, message 2 section 3).
    { id: 'menu-open', section: 'Menus', label: 'Open the context menu', keys: { win: ['Shift+F10', 'ContextMenu'], mac: ['Right-click', 'Two-finger click'] } },
    { id: 'menu-move', section: 'Menus', label: 'Move between actions', keys: ['ArrowUp', 'ArrowDown'] },
    { id: 'menu-ends', section: 'Menus', label: 'First or last action', keys: ['Home', 'End'] },
    { id: 'menu-activate', section: 'Menus', label: 'Choose the focused action', keys: ['Enter', ' '] },
    { id: 'menu-close', section: 'Menus', label: 'Close the menu', keys: ['Escape'] },
    { id: 'menu-leave', section: 'Menus', label: 'Leave the menu', keys: ['Tab'] },

    ...TOOLS.map(([id, label, key]) => ({ id, section: 'Drawing tools', label, keys: [key] })),

    // The Chat composer's own setting (composer-keys.js): the rows say what this browser does now.
    { id: 'chat-send', section: 'Chat and text editing', label: 'Send a message', keys: [mod ? 'Mod+Enter' : 'Enter'], note: mod ? 'Your setting: Enter adds a new line' : 'Your setting' },
    { id: 'chat-newline', section: 'Chat and text editing', label: 'New line', keys: [mod ? 'Enter' : 'Shift+Enter'] },
    { id: 'suggest-open', section: 'Chat and text editing', label: 'Command suggestions in a prompt', keys: ['/'] },
    { id: 'suggest-move', section: 'Chat and text editing', label: 'Move through suggestions', keys: ['ArrowUp', 'ArrowDown'] },
    { id: 'suggest-pick', section: 'Chat and text editing', label: 'Choose a suggestion', keys: ['Enter', 'Tab'] },
    { id: 'format', section: 'Chat and text editing', label: 'Bold, italic, underline', keys: ['Mod+B', 'Mod+I', 'Mod+U'] },
    { id: 'finish-edit', section: 'Chat and text editing', label: 'Finish editing canvas text or code', keys: ['Mod+Enter'] },
    { id: 'accept-preview', section: 'Chat and text editing', label: 'Accept a Quick Edit preview', keys: ['Mod+Enter'] },

    { id: 'present-next', section: 'Presenting and interactive cards', label: 'Next presentation step', keys: ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'] },
    { id: 'present-previous', section: 'Presenting and interactive cards', label: 'Previous presentation step', keys: ['ArrowLeft', 'ArrowUp', 'PageUp'] },
    { id: 'laser', section: 'Presenting and interactive cards', label: 'Presentation laser on or off', keys: ['L'] },
    { id: 'present-end', section: 'Presenting and interactive cards', label: 'End the presentation', keys: ['Escape'] },
    { id: 'leave-interact', section: 'Presenting and interactive cards', label: 'Leave Interact', keys: ['Escape'] },
    // A game's own keys come from that scene, never a universal set (owner brief section 1).
    { id: 'game', section: 'Presenting and interactive cards', label: 'Game controls', text: 'Shown by each game' },

    { id: 'area-select', section: 'Mouse and trackpad', label: 'Select an area', text: 'Drag empty canvas' },
    { id: 'shift-click', section: 'Mouse and trackpad', label: 'Add to or remove from the selection', keys: ['Shift+click'] },
    { id: 'group-pick', section: 'Mouse and trackpad', label: 'Select an object inside a group', keys: ['Mod+click'] },
    { id: 'drag-duplicate', section: 'Mouse and trackpad', label: 'Duplicate while dragging', keys: ['Alt+drag'] },
    { id: 'space-pan', section: 'Mouse and trackpad', label: 'Pan while held', keys: ['Space+drag'] },
    { id: 'pointer-zoom', section: 'Mouse and trackpad', label: 'Zoom around the pointer', keys: ['Mod+scroll'] },
    { id: 'constrain', section: 'Mouse and trackpad', label: 'Keep proportions or 45° angles', keys: ['Shift+drag'] },
    { id: 'from-centre', section: 'Mouse and trackpad', label: 'Draw or resize from the centre', keys: ['Alt+drag'] },
    { id: 'object-actions', section: 'Mouse and trackpad', label: 'Open object actions', keys: { win: ['Right-click'], mac: ['Right-click', 'Two-finger click'] } },
  ];
}

const ROWS = shortcutRows();
const ROW = Object.fromEntries(ROWS.map(row => [row.id, row]));

// One row's bindings on this platform.
export const keysOf = (row, mac = isMac()) => (Array.isArray(row?.keys) ? row.keys : row?.keys?.[mac ? 'mac' : 'win']) || [];
// The menu hint for an action (its first binding) and its aria-keyshortcuts (every keyboard binding), from the same row.
export const hintFor = (id, mac = isMac()) => { const first = keysOf(ROW[id], mac)[0]; return first ? keyLabel(first, mac) : null; };
export const ariaFor = (id, mac = isMac()) => keysOf(ROW[id], mac).map(binding => ariaKey(binding, mac)).filter(Boolean).join(' ') || null;

// The rows to show for a search, grouped by section in order. Every word of the query must appear in the row's label,
// section, note, text or its keys as this platform spells them.
export function shortcutSections({ query = '', mac = isMac(), sendKey = 'enter', omit = [] } = {}) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = shortcutRows({ sendKey }).filter(row => !omit.includes(row.id)).map(row => ({ ...row, labels: keysOf(row, mac).map(binding => keyLabel(binding, mac)) }));
  const shown = rows.filter(row => {
    const hay = [row.label, row.section, TAB_LABELS[row.section], row.note, row.text, ...row.labels].filter(Boolean).join(' ').toLowerCase();
    return words.every(word => hay.includes(word));
  });
  return SECTIONS.map(title => ({ title, tab: TAB_LABELS[title], note: SECTION_NOTES[title] || null, rows: shown.filter(row => row.section === title) })).filter(section => section.rows.length);
}
