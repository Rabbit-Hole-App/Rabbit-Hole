import { useEffect, useMemo, useRef, useState } from 'react';
import { sameRef } from './chat-context.js';

// Sub-lane A3a (composer and modes) owns this file. Contract: chat-workspace-CONTRACT.md A5, A6.
// Shape every other sub-lane relies on:
//   { text, setText(text | fn), command: string | null, setCommand(command), inputRef,
//     prepare({ text?, command?, contextRefs?, mode? }) (never sends; A6 rules), focus(), clear() (after Send only),
//     draft: { text, command, savedAt } (savedAt orders the local copy against the restored one) }
// A changed draft is saved through thread.saveState({ draft: { text, command } | null }) (A2).
// The provider routes prepare's contextRefs and mode to context.attach and thread.setMode.

// The draft lives per canvas and thread (contract A5); a new chat is 'new' until its first done names it.
export const draftKey = (canvas, threadId) => `rh.chat.draft.${canvas}.${threadId || 'new'}`;
const EMPTY = { text: '', command: null, savedAt: 0 };

// Restore precedence (A5): the server's draft only when it is newer or there is no local copy. A server draft without a
// time cannot be shown to be newer, so a local copy wins over it.
export function pickDraft(local, remote) {
  if (!local) return remote ? { ...EMPTY, ...remote } : EMPTY;
  if (!remote) return local;
  return (remote.savedAt || 0) > (local.savedAt || 0) ? { ...EMPTY, ...remote } : local;
}

// prepare's text rule (A6): an empty draft becomes the text; a written draft is kept and the text follows a blank line.
export const appendDraft = (previous, next) => (!next ? previous : previous.trim() ? `${previous.replace(/\s+$/, '')}\n\n${next}` : next);

// The draft and the / slot. The command is its own state, never parsed back out of the text; removing it (null) returns
// the slot to "/" and leaves the text. The mode is not here: it is the thread's (thread.mode), so no slot change moves it.
export function draftSlot(draft, action) {
  const at = action.at ?? Date.now();
  switch (action.type) {
    case 'text': return { ...draft, text: action.text, savedAt: at };
    case 'command': return { ...draft, command: action.command || null, savedAt: at };
    case 'prepare': return { text: appendDraft(draft.text, action.text), command: action.command === undefined ? draft.command : action.command || null, savedAt: at };
    case 'clear': return { text: '', command: null, savedAt: at };
    default: return draft;
  }
}

// context_refs at Send (A4): a card, group, image or media ref carries its text resolved now (a function is read now,
// the way ask.jsx targetText is), cut to the contract's limits; other kinds never carry text.
// target: the selected object's own ref (pdf-materials-refinement.md section 6). Attached as well, it rides once: canvas_target
// carries its text (the deictic grounding reads it there), so the attached copy goes as its name and identity only.
// A PDF excerpt (pdf-excerpt.js) is client text too, on the server's own excerpt caps (chat-modes.js: 12,000 per ref - the full
// 8,000-character quote, its source line and the note - and 96,000 in all, apart from the cards'); a cap that still cuts one
// says so in the text itself, so the model is told it has part of the excerpt.
const TEXT_KINDS = new Set(['card', 'group', 'image', 'media', 'excerpt']);
export const EXCERPT_TEXT = 12000, EXCERPTS_TEXT = 96000;
export function refsForSend(refs = [], { text: perRef = 8000, texts: total = 32000, excerpts = EXCERPTS_TEXT, target = null } = {}) {
  const budgets = { card: total, excerpt: excerpts };
  // open: an excerpt chip's reader ref (pdf-excerpt.js). The server never reads it; it keeps it in the thread's state
  // (chat-modes.js stateRefs), so the chip of a reopened thread still opens its source.
  return refs.map(({ text, ...ref }) => {
    if (!TEXT_KINDS.has(ref.kind) || (target && sameRef(ref, target))) return ref;
    const pool = ref.kind === 'excerpt' ? 'excerpt' : 'card', budget = budgets[pool];
    const full = String((typeof text === 'function' ? text() : text) ?? ''), cap = Math.min(pool === 'excerpt' ? EXCERPT_TEXT : perRef, budget);
    const said = kept => ` [cut: only the first ${kept} of ${full.length} characters of this excerpt were sent]`;
    const kept = Math.max(0, cap - said(full.length).length);
    const value = ref.kind === 'excerpt' && full.length > cap ? `${full.slice(0, kept)}${said(kept)}` : full.slice(0, cap);
    budgets[pool] -= value.length;
    return value ? { ...ref, text: value } : ref;
  });
}

const read = key => { try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; } };
const write = (key, draft) => { try { localStorage.setItem(key, JSON.stringify(draft)); } catch { /* private window: the draft stays in memory */ } };
const drop = key => { try { localStorage.removeItem(key); } catch { /* nothing stored */ } };
const restored = (canvas, thread) => ({ restoreKey: thread.restore?.key, key: draftKey(canvas, thread.id), draft: pickDraft(read(draftKey(canvas, thread.id)), thread.restore?.draft) });

export function useChatDraft(canvas, thread) {
  const [slot, setSlot] = useState(() => restored(canvas, thread));
  const inputRef = useRef(null);
  const key = draftKey(canvas, thread.id);
  // A new restore key (open, New chat, canvas change) loads that thread's draft. The same restore key with a new id is the
  // first done naming a new chat (adopt): the draft moves to the thread's key, so text typed during that send stays.
  let current = slot;
  if (slot.restoreKey !== thread.restore?.key) current = restored(canvas, thread);
  else if (slot.key !== key) current = { ...slot, key };
  if (current !== slot) setSlot(current);
  // Only a touched draft is stored (savedAt), so opening a thread writes nothing. Clearing stores the empty draft with its
  // time, so an older server copy of a sent draft never wins over it.
  // A draft the learner changed (not one just restored) also goes to the thread state (A2's debounced PUT); empty is null.
  const stored = useRef(current);
  useEffect(() => {
    const same = stored.current.restoreKey === current.restoreKey;
    if (same && stored.current.key !== current.key) drop(stored.current.key);
    if (same && stored.current.draft !== current.draft) thread.saveState?.({ draft: current.draft.text || current.draft.command ? { text: current.draft.text, command: current.draft.command } : null });
    stored.current = current;
    if (current.draft.savedAt) write(current.key, current.draft);
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps
  const { draft } = current;
  return useMemo(() => {
    const apply = action => setSlot(previous => ({ ...previous, draft: draftSlot(previous.draft, typeof action === 'function' ? action(previous.draft) : action) }));
    const focus = () => requestAnimationFrame(() => inputRef.current?.focus());
    return {
      text: draft.text, command: draft.command, draft, inputRef, focus,
      setText: next => apply(previous => ({ type: 'text', text: typeof next === 'function' ? next(previous.text) : next })),
      setCommand: command => apply({ type: 'command', command }),
      prepare: ({ text, command } = {}) => { apply({ type: 'prepare', text, command }); focus(); },
      clear: () => apply({ type: 'clear' }),
    };
  }, [draft]);
}
