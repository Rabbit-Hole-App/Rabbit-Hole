// The one source finder opener (Release B lane B3, C:/s/spec/rel-b.md B3; owner decision 4A, 2026-10-16): Chat's
// /youtube /arxiv /wikipedia, Ctrl+K's and the Insert menu's entries all open the same finder (SearchBar.jsx) through
// openSourceFinder. The page that renders the finder registers itself as the host (LearnPage); nothing else draws one.
//
//   openSourceFinder({ source: 'youtube' | 'arxiv' | 'wikipedia', query = '', origin = {} }) -> Promise<{ added: boolean }>
//
// - A nonempty query searches at once; an empty one opens the finder and waits for input.
// - Results preview in the finder; nothing is added until the learner presses Add to canvas.
// - origin: { into?, returnFocus? }. into: a reserved canvas slot (canvas-slots.js) the added card takes, else it lands where
//   the learner is looking on the page's canvas. returnFocus: the element (or a function) focus goes back to when the finder
//   closes; by default the element focused when it opened.
// - The promise settles once, when the finder closes: { added: true, blockId } only after Add to canvas put a card on the canvas
//   (blockId: that card, so a Chat command keeps it as its output, chat-output-refs.js).
// No model routes or interprets the command; the finder's own search is the only request.
export const FINDER_SOURCES = ['youtube', 'arxiv', 'wikipedia'];

let host = null;

// The page that draws the finder: host({ source, query, origin }) -> Promise<{ added }>. Returns the unregister function.
export function setSourceFinderHost(open) {
  host = open;
  return () => { if (host === open) host = null; };
}

export function openSourceFinder({ source, query = '', origin = {} } = {}) {
  if (!FINDER_SOURCES.includes(source)) return Promise.reject(new Error(`unknown finder source: ${source}`));
  if (!host) return Promise.resolve({ added: false });
  return Promise.resolve(host({ source, query: String(query ?? '').trim(), origin: origin || {} })).then(done => ({ added: !!done?.added, ...(typeof done?.blockId === 'string' ? { blockId: done.blockId } : {}) }));
}

// Where focus goes back to on close: the origin's returnFocus (an element or a function), else what was focused at opening.
export function returnFocus(origin, openedFrom) {
  const target = origin?.returnFocus ?? openedFrom;
  if (typeof target === 'function') { target(); return; }
  if (target?.isConnected && typeof target.focus === 'function') target.focus();
}

// The "/" shortcut (owner decision 5A, B5): outside editable fields "/" opens and focuses the right panel's canvas Find;
// inside Chat, Ctrl+K, inputs, textareas, selects, contenteditable (BlockNote, CodeMirror), Monaco, a math field, or while a
// modal dialog is open, "/" keeps doing what it did there.
export const EDITABLE = 'input, textarea, select, math-field, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"], [role="combobox"], .cm-editor, .monaco-editor, .bn-editor, [data-chat-composer], [data-inline-ai]';
export function slashOpensFind(active, doc = globalThis.document) {
  if (active?.isContentEditable) return false;
  if (active?.closest?.(EDITABLE)) return false;
  if (doc?.querySelector?.('[aria-modal="true"]')) return false;
  return true;
}
