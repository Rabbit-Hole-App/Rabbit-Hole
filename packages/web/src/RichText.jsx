import { useLayoutEffect, useRef } from 'react';
import { FONTS, FONT_KEYS, formatRuns, hexColor, plainOf, runStyle, runsOf, sliceRuns, spliceRuns, toggleValue } from './learn-rich-text.js';

// The one text editor on the canvas (docs/features/canvas-editing.md): text boxes, sticky notes, shape text and
// connector labels all edit through it, so each behaves the same. React renders no children here - the words are painted
// from runs (learn-rich-text.js) and read back from the DOM - so no re-render can wipe what is being typed or move the
// caret. Enter breaks the line; Esc or Ctrl/Cmd+Enter commits; a press outside commits. Undo, redo, clipboard and the
// arrow keys belong to the editor while it is open. Pasted text arrives as plain text only; no HTML is ever kept.

const BLOCK = new Set(['DIV', 'P', 'LI', 'PRE', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const ATTR_KEYS = ['b', 'i', 'u', 'c', 'f', 's'];
const attrsOf = run => Object.fromEntries(ATTR_KEYS.filter(key => run[key] != null).map(key => [key, run[key]]));

// The editor's DOM as a line of characters: text nodes, <br> and block starts as '\n'. A trailing <br> is a
// placeholder for an empty last line, never a character. startOf/endOf map nodes to offsets (for the caret).
function linear(root) {
  const parts = [], startOf = new Map(), endOf = new Map();
  let count = 0;
  const atLineStart = () => { const last = parts[parts.length - 1]; return !last || last.kind === 'nl' || last.text.endsWith('\n'); };
  const visit = node => {
    if (node.nodeType === 3) {
      startOf.set(node, count);
      if (node.data) { parts.push({ kind: 'text', node, text: node.data, start: count }); count += node.data.length; }
      endOf.set(node, count);
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.tagName === 'BR') { startOf.set(node, count); parts.push({ kind: 'nl', node, start: count }); count += 1; endOf.set(node, count); return; }
    if (BLOCK.has(node.tagName) && count > 0 && !atLineStart()) { parts.push({ kind: 'nl', node, start: count, block: true }); count += 1; }
    startOf.set(node, count);
    for (const child of node.childNodes) visit(child);
    endOf.set(node, count);
  };
  for (const child of root.childNodes) visit(child);
  const last = parts[parts.length - 1];
  if (last?.kind === 'nl' && !last.block) { parts.pop(); count -= 1; for (const [node, at] of endOf) if (at > count) endOf.set(node, count); }
  return { parts, startOf, endOf, length: count };
}

const rgbHex = value => {
  const parts = String(value).match(/[\d.]+/g);
  return parts && parts.length >= 3 ? `#${parts.slice(0, 3).map(n => Math.round(Number(n)).toString(16).padStart(2, '0')).join('')}` : null;
};
const firstFamily = value => String(value).split(',')[0].trim().replace(/['"]/g, '').toLowerCase();
const familyKey = value => FONT_KEYS.find(key => firstFamily(FONTS[key].stack) === firstFamily(value)) || null;

// A character's formatting: the run it was painted with (data-run), then anything the browser wrapped inside that run
// on its own (a styled span left by a delete), read from computed style against the run's element.
function formatAt(element, root, cache) {
  if (cache.has(element)) return cache.get(element);
  let ours = element;
  while (ours && ours !== root && !ours.dataset?.run) ours = ours.parentElement;
  const attrs = ours && ours !== root ? JSON.parse(ours.dataset.run) : {};
  if (element !== (ours || root) && element !== root) {
    const own = getComputedStyle(element), around = getComputedStyle(ours && ours !== root ? ours : root);
    const bold = Number(own.fontWeight) >= 600;
    if (bold !== Number(around.fontWeight) >= 600) attrs.b = bold;
    const italic = own.fontStyle !== 'normal';
    if (italic !== (around.fontStyle !== 'normal')) attrs.i = italic;
    const color = rgbHex(own.color);
    if (color && color !== rgbHex(around.color)) attrs.c = hexColor(color);
    if (own.fontFamily !== around.fontFamily && familyKey(own.fontFamily)) attrs.f = familyKey(own.fontFamily);
    if (Math.abs(parseFloat(own.fontSize) - parseFloat(around.fontSize)) > 0.1) attrs.s = parseFloat(own.fontSize);
    for (let node = element; node && node !== ours && node !== root; node = node.parentElement) {
      if (getComputedStyle(node).textDecorationLine.includes('underline')) attrs.u = true;
    }
  }
  cache.set(element, attrs);
  return attrs;
}

export function readRuns(root) {
  const { parts } = linear(root);
  const cache = new Map(), runs = [];
  let last = {};
  for (const part of parts) {
    if (part.kind === 'nl') { runs.push({ ...last, t: '\n' }); continue; }
    last = formatAt(part.node.parentElement, root, cache);
    runs.push({ ...last, t: part.text });
  }
  return runs;
}

export function paint(root, runs, base, colorOf) {
  root.replaceChildren(...runs.map(run => {
    const span = document.createElement('span');
    span.dataset.run = JSON.stringify(attrsOf(run));
    Object.assign(span.style, runStyle(run, base, colorOf));
    span.textContent = run.t;
    return span;
  }));
  // A last empty line needs something to stand on, or the caret has nowhere to go after a final line break.
  if (plainOf(runs).endsWith('\n')) root.append(document.createElement('br'));
}

export function offsetsOf(root) {
  const selection = document.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const line = linear(root);
  const at = (node, offset) => {
    if (node.nodeType === 3) return Math.min(line.length, (line.startOf.get(node) ?? 0) + Math.min(offset, node.data.length));
    const child = node.childNodes[offset];
    if (child) return Math.min(line.length, line.startOf.get(child) ?? line.length);
    return node === root ? line.length : Math.min(line.length, line.endOf.get(node) ?? line.length);
  };
  const from = at(range.startContainer, range.startOffset), to = at(range.endContainer, range.endOffset);
  return { from: Math.min(from, to), to: Math.max(from, to) };
}

function pointAt(root, line, offset) {
  for (const part of line.parts) {
    if (part.kind === 'text' && offset >= part.start && offset <= part.start + part.text.length) return [part.node, offset - part.start];
    if (part.kind === 'nl' && offset === part.start + 1 && part.node.tagName === 'BR') return [part.node.parentNode, [...part.node.parentNode.childNodes].indexOf(part.node) + 1];
  }
  return [root, root.childNodes.length];
}

export function setOffsets(root, from, to = from) {
  const line = linear(root);
  const [a, aOffset] = pointAt(root, line, Math.max(0, Math.min(from, line.length)));
  const [b, bOffset] = pointAt(root, line, Math.max(0, Math.min(to, line.length)));
  document.getSelection()?.setBaseAndExtent(a, aOffset, b, bOffset);
}

// The range a typed or composed input added: what differs between the words before and after.
function inserted(before, after) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end += 1;
  return [start, after.length - end];
}

// The caret where a double-click landed, if that point is in the editor.
function caretFrom(root, point) {
  if (!point) return false;
  let node = null, offset = 0;
  if (document.caretPositionFromPoint) { const at = document.caretPositionFromPoint(point.x, point.y); if (at) ({ offsetNode: node, offset } = at); }
  else if (document.caretRangeFromPoint) { const at = document.caretRangeFromPoint(point.x, point.y); if (at) { node = at.startContainer; offset = at.startOffset; } }
  if (!node || !root.contains(node)) return false;
  document.getSelection()?.setBaseAndExtent(node, offset, node, offset);
  return true;
}

// The height runs need at a width, measured off screen with the same styles (a shape's text floor while resizing).
let ruler = null;
export function measureHeight(runs, base, colorOf, style, width) {
  if (typeof document === 'undefined') return 0;
  if (!ruler) { ruler = document.createElement('div'); ruler.setAttribute('aria-hidden', 'true'); Object.assign(ruler.style, { position: 'absolute', left: '-99999px', top: '0', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }); document.body.append(ruler); }
  Object.assign(ruler.style, style, { width: `${Math.max(1, width)}px` });
  paint(ruler, runs.length ? runs : [{ t: 'M' }], base, colorOf);
  return ruler.offsetHeight;
}

// entry: { text, runs }. base: the object's formatting (baseOf), code-adjusted by the caller. editing: open for typing.
// point: where a double-click landed (the caret goes there). onCommit(runs, how): how is 'blur', 'esc' or 'enter'.
// onApi: the open editor's handle for the style panel (format, toggle, state, refocus, commit, subscribe), null on close.
export default function RichText({ entry, base, colorOf = color => color, code = false, editing = false, point = null, placeholder = '', className = '', style = null, onCommit, onApi = null, rootRef = null, ...rest }) {
  const root = useRef(null);
  const live = useRef({ runs: [], sel: null, pending: null, pendingAt: null, undo: [], redo: [], lastType: 0, composing: false, done: false, listeners: new Set() });
  const latest = useRef(null);
  latest.current = { base, colorOf, code, onCommit, onApi, editing };
  const shown = code ? (entry.text ? [{ t: String(entry.text) }] : []) : runsOf(entry);
  const shownKey = JSON.stringify([shown, base, code]);
  // Closed: drawn from the saved runs. Open: never repainted from props, only by the editor's own edits.
  useLayoutEffect(() => { if (!editing) paint(root.current, shown, base, colorOf); }, [shownKey, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const api = useRef(null);
  if (!api.current) {
    const state = live.current;
    const el = () => root.current;
    const notify = () => { for (const listener of state.listeners) listener(); };
    const draw = runs => paint(el(), runs, latest.current.base, latest.current.colorOf);
    const selection = () => (document.activeElement === el() ? offsetsOf(el()) : null) || state.sel || { from: plainOf(state.runs).length, to: plainOf(state.runs).length };
    const remember = (entry, typing = false) => {
      const now = Date.now();
      // Typing coalesces into one undo step per pause; every other edit is its own step.
      if (typing && now - state.lastType < 800) return;
      state.lastType = typing ? now : 0;
      state.undo.push(entry);
      if (state.undo.length > 200) state.undo.shift();
      state.redo = [];
    };
    const apply = (runs, sel) => {
      state.runs = runs;
      draw(runs);
      state.sel = sel;
      if (document.activeElement === el()) setOffsets(el(), sel.from, sel.to);
      notify();
    };
    const edit = change => {
      const sel = selection(), runs = readRuns(el());
      remember({ runs, sel });
      const next = change(runs, sel);
      apply(next.runs, next.sel);
    };
    const insert = text => {
      const sel = selection(), runs = readRuns(el());
      const at = Math.max(0, sel.from - 1);
      const attrs = state.pending ? { ...attrsOf(sliceRuns(runs, at, at + 1)[0] || {}), ...state.pending } : attrsOf(sliceRuns(runs, at, Math.max(at + 1, 1))[0] || {});
      remember({ runs, sel });
      const caret = sel.from + text.length;
      if (state.pending) state.pendingAt = caret;
      apply(spliceRuns(runs, sel.from, sel.to, text, attrs), { from: caret, to: caret });
    };
    const format = (key, value) => {
      if (latest.current.code) return;
      const sel = selection();
      if (sel.from === sel.to) {
        // A caret with no range: the next typing takes this, until the caret moves elsewhere.
        state.pending = { ...state.pending, [key]: value };
        state.pendingAt = sel.from;
        notify();
        return;
      }
      edit(runs => ({ runs: formatRuns(runs, sel.from, sel.to, key, value), sel }));
    };
    const step = (from, to) => {
      const entry = from.pop();
      if (!entry) return;
      to.push({ runs: readRuns(el()), sel: selection() });
      apply(entry.runs, entry.sel);
    };
    const commit = how => {
      if (state.done || !latest.current.editing) return;
      state.done = true;
      const runs = readRuns(el());
      if (document.activeElement === el()) el().blur();
      latest.current.onCommit?.(runs, how);
    };
    api.current = {
      get root() { return el(); },
      format,
      toggle: key => format(key, toggleValue(state.runs, selection().from, selection().to, key, latest.current.base, state.pending)),
      // A preset (H1 to Text) or an object-wide size: the runs let go of those keys, so the whole text follows it.
      strip: keys => edit(runs => ({ runs: runs.map(run => { const next = { ...run }; for (const key of keys) delete next[key]; return next; }), sel: selection() })),
      state: () => ({ runs: state.runs, ...selection(), pending: state.pending, base: latest.current.base, code: latest.current.code }),
      refocus: () => { el().focus({ preventScroll: true }); if (state.sel) setOffsets(el(), state.sel.from, state.sel.to); },
      commit,
      subscribe: listener => { state.listeners.add(listener); return () => state.listeners.delete(listener); },
      // handlers, used by the element below
      insert, undo: () => step(state.undo, state.redo), redo: () => step(state.redo, state.undo), notify,
      input: () => {
        if (state.composing) return;
        const before = state.runs;
        let runs = readRuns(el());
        if (state.pending && Object.keys(state.pending).length) {
          const [from, to] = inserted(plainOf(before), plainOf(runs));
          if (to > from) {
            for (const [key, value] of Object.entries(state.pending)) runs = formatRuns(runs, from, to, key, value);
            const sel = offsetsOf(el()) || { from: to, to };
            draw(runs);
            setOffsets(el(), sel.from, sel.to);
            state.pendingAt = sel.to;
          }
        }
        remember({ runs: before, sel: state.sel || { from: 0, to: 0 } }, true);
        state.runs = runs;
        notify();
      },
    };
  }

  // Opening: paint, focus, caret where the double-click landed (else at the end), and hand the panel its handle.
  useLayoutEffect(() => {
    if (!editing) return undefined;
    const element = root.current, state = live.current, handle = api.current;
    Object.assign(state, { runs: shown, undo: [], redo: [], pending: null, pendingAt: null, done: false, composing: false, lastType: 0 });
    paint(element, shown, base, colorOf);
    element.focus({ preventScroll: true });
    if (!caretFrom(element, point)) { const end = plainOf(shown).length; setOffsets(element, end, end); }
    state.sel = offsetsOf(element);
    const selectionChange = () => {
      if (document.activeElement !== element) return;
      const sel = offsetsOf(element);
      if (!sel) return;
      if (state.pending && (sel.from !== state.pendingAt || sel.to !== state.pendingAt)) state.pending = null;
      state.sel = sel;
      handle.notify();
    };
    const beforeInput = event => {
      if (event.isComposing) return;
      const type = event.inputType;
      if (type === 'insertParagraph' || type === 'insertLineBreak') { event.preventDefault(); handle.insert('\n'); }
      else if (type === 'formatBold' || type === 'formatItalic' || type === 'formatUnderline') { event.preventDefault(); if (!latest.current.code) handle.toggle({ formatBold: 'b', formatItalic: 'i', formatUnderline: 'u' }[type]); }
      else if (type === 'historyUndo') { event.preventDefault(); handle.undo(); }
      else if (type === 'historyRedo') { event.preventDefault(); handle.redo(); }
      else if (type === 'insertFromPaste' || type === 'insertFromDrop' || type.startsWith('format')) event.preventDefault();
    };
    const input = () => handle.input();
    const compositionStart = () => { state.composing = true; };
    const compositionEnd = () => { state.composing = false; handle.input(); };
    document.addEventListener('selectionchange', selectionChange);
    element.addEventListener('beforeinput', beforeInput);
    element.addEventListener('input', input);
    element.addEventListener('compositionstart', compositionStart);
    element.addEventListener('compositionend', compositionEnd);
    latest.current.onApi?.(handle);
    return () => {
      document.removeEventListener('selectionchange', selectionChange);
      element.removeEventListener('beforeinput', beforeInput);
      element.removeEventListener('input', input);
      element.removeEventListener('compositionstart', compositionStart);
      element.removeEventListener('compositionend', compositionEnd);
      latest.current.onApi?.(null);
    };
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const keyDown = event => {
    if (!editing || event.nativeEvent.isComposing || event.keyCode === 229) return;
    const handle = api.current, mod = event.ctrlKey || event.metaKey;
    if (event.key === 'Escape' || (event.key === 'Enter' && mod)) { event.preventDefault(); handle.commit(event.key === 'Escape' ? 'esc' : 'enter'); return; }
    if (event.key === 'Enter') { event.preventDefault(); handle.insert('\n'); return; }
    if (event.key === 'Tab' && code && !event.shiftKey) { event.preventDefault(); handle.insert('  '); return; }
    if (mod && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === 'z') { event.preventDefault(); if (event.shiftKey) handle.redo(); else handle.undo(); return; }
      if (key === 'y') { event.preventDefault(); handle.redo(); return; }
      if (['b', 'i', 'u'].includes(key)) { event.preventDefault(); if (!code) handle.toggle(key); }
    }
  };
  return (
    <div ref={node => { root.current = node; if (rootRef) rootRef.current = node; }} {...rest} contentEditable={editing} suppressContentEditableWarning spellCheck={editing}
      role={editing ? 'textbox' : undefined} aria-multiline={editing || undefined} aria-label={rest['aria-label'] || placeholder || 'Text'}
      data-rich-editor={editing ? '' : undefined} data-placeholder={placeholder} data-code={code ? '' : undefined}
      style={{ whiteSpace: code ? 'pre' : 'pre-wrap', overflowWrap: code ? undefined : 'break-word', tabSize: 2, ...style }}
      onKeyDown={keyDown}
      onPaste={editing ? event => { event.preventDefault(); const text = event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n'); if (text) api.current.insert(text); } : undefined}
      onDrop={editing ? event => { event.preventDefault(); const text = event.dataTransfer.getData('text/plain').replace(/\r\n?/g, '\n'); if (text) api.current.insert(text); } : undefined}
      onBlur={editing ? event => {
        // A field in the style panel (a hex colour, a size) takes the focus for a moment: the edit stays open, and the
        // panel hands focus back. Anything else ends the edit.
        if (event.relatedTarget?.closest?.('[data-keep-focus]')) return;
        api.current.commit('blur');
      } : undefined}
      className={`${editing ? 'cursor-text' : ''} outline-none ${className}`} />
  );
}
