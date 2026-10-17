import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { activeThread, rememberThread } from './chat-persist.js';

// Sub-lane A2 (threads and History) owns this file. Contract: chat-workspace-CONTRACT.md A1-A5.
// Shape every other sub-lane relies on:
//   { id: string | null, title, mode: 'auto' | 'ask' | 'tutor', setMode(mode), holdMode(mode | null),
//     historyOpen, setHistoryOpen(open), newChat(), open(id) (a Promise; it rejects with the server's error), adopt(id, title) (the first send's done event names the new thread),
//     restore: { key, mode, contextRefs, draft, messages } (a new key resets the draft and the attached refs; messages is the transcript to show),
//     turnKey: string (changes whenever the open thread changes; a stream started under another key is dropped, contract A5),
//     liveKey() (turnKey read now; null once this canvas's Chat is gone, so a turn sent before is late wherever it lands),
//     status: 'loading' | 'ready' | 'error' (restoring this canvas's conversation; never shown as an empty New chat while it
//     loads or after it failed), retry() (a failed restore again), claim() (the learner sent a turn: a restore still on its
//     way stands down, so it never replaces what they now see),
//     saveState({ mode?, contextRefs?, draft? }) (debounced PUT of the open thread's state; chat-draft.js and chat-context.js call it),
//     rename(title), remove() (the open thread; the Chat header's overflow menu) }
// Threads live on the server (LEARN_DB threads/messages, contract A1): History, restore and the state PUT never depend on
// this browser. A new chat has no thread until its first turn (`done` for Ask and Tutor; the saved question for an Auto
// turn, chat-persist.js). Each canvas keeps its own active thread (chat-persist.js): the one opened, adopted or restored last.
const SAVE_DELAY = 800;
const blank = key => ({ key, mode: 'auto', contextRefs: [], draft: null, messages: [] });
export const threadsUrl = (canvas, q = '', limit = 30) => `/api/ask/threads?scope=learn&ref=${encodeURIComponent(canvas)}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}&limit=${limit}`;

// The late-response guard (contract A5): an SSE event of a turn sent under another turnKey is dropped, never drawn here.
// The server still saves it into its own thread, so it shows when that thread is opened again.
export const lateEvent = (sentKey, currentKey) => sentKey !== currentKey;
// answer_meta (contract B1, B2; kind and syllabus 12:35 AM): kind on the reply, the rest beside its meta, as received.
export const withAnswerMeta = (messages, replyId, { messageId, kind, ...meta }) => messages.map(m => (m.id === replyId ? { ...m, kind, meta: { ...m.meta, ...meta } } : m)); // eslint-disable-line no-unused-vars
// done: the server's ids replace the turn's local ones, and its reply is done.
export const withDone = (messages, replyId, { userMessageId, messageId }) => messages.map(m => (
  m.id === replyId ? { ...m, ...(messageId != null ? { messageId: String(messageId) } : {}), status: m.status === 'streaming' ? 'done' : m.status }
    : m.messageId === `local-q-${replyId}` && userMessageId != null ? { ...m, messageId: String(userMessageId) } : m));
// The end of a turn: a reply still streaming becomes `status` (done, stopped or error). A Stop keeps the partial text.
export const settle = (messages, replyId, status) => messages.map(m => (m.id === replyId && m.status === 'streaming' ? { ...m, status } : m));
// A saved interrupted or stopped reply (a Stop, chat-persist.js) reads as the stopped reply it was, never as a spinner.
export const restoredMessages = (messages = []) => messages.map(m => (['interrupted', 'stopped'].includes(m.status) ? { ...m, status: 'stopped', content: m.content || 'Stopped.' } : m));
// The mode a restored thread shows: a held mode (holdMode) over the thread's saved one, which wins once the hold is released.
export const restoredMode = (held, saved) => held || saved || 'auto';
// The Chat header's title (owner brief section 6): never "New chat" while the conversation is loading or failed to load.
export const chatTitle = ({ status, title }) => (status === 'loading' ? 'Loading chat…' : status === 'error' ? 'Chat not loaded' : title || 'New chat');

// slot 'toc' (owner brief 2026-10-16 item 7): the Table of contents' own conversation. It restores only its own open thread;
// Chat, with none of its own, falls back to the canvas's latest thread that is not the TOC's (History leaves it out too).
export function useChatThread(canvas, { slot = null } = {}) {
  const [id, setId] = useState(null), [title, setTitle] = useState(''), [mode, setModeState] = useState('auto'), [historyOpen, setHistoryOpen] = useState(false);
  const [restore, setRestore] = useState(() => blank(`${canvas}:new:0`)), [status, setStatus] = useState('loading');
  const idRef = useRef(null), held = useRef(null), pending = useRef(null), timer = useRef(null), request = useRef(0), shownCanvas = useRef(canvas), keyRef = useRef(restore.key);
  const select = next => { idRef.current = next; setId(next); };
  const show = next => { keyRef.current = next.key; setRestore(next); };
  useEffect(() => { keyRef.current = restore.key; return () => { keyRef.current = null; }; }, [restore.key]);
  const liveKey = useCallback(() => keyRef.current, []);
  const remember = useCallback(threadId => { rememberThread(canvas, threadId, api, slot).catch(() => {}); }, [canvas, slot]);
  // One PUT per quiet spell, to the thread the changes were made in. Best effort: the local draft copy (chat-draft.js) and
  // the next turn (apiAsk records mode and refs) keep what a failed save loses.
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const save = pending.current;
    pending.current = null;
    if (save) api(`/api/learn/chat/threads/${save.id}/state`, { method: 'PUT', body: JSON.stringify(save.state), keepalive: true }).catch(() => {});
  }, []);
  const saveState = useCallback(partial => {
    const threadId = idRef.current;
    if (!threadId) return; // a new chat has no row yet; its first turn records its mode and refs
    if (pending.current && pending.current.id !== threadId) flush();
    pending.current = { id: threadId, state: { ...pending.current?.state, ...partial } };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  }, [flush]);
  useEffect(() => flush, [flush]); // leaving the canvas still saves the last change

  const newChat = useCallback(() => {
    flush();
    const turn = ++request.current;
    select(null); setTitle(''); setModeState(held.current || 'auto'); setHistoryOpen(false); setStatus('ready');
    show(blank(`${canvas}:new:${turn}`));
  }, [canvas, flush]);
  // Shows a saved thread, unless a later open, New chat or the learner's own turn (claim) came first.
  const load = useCallback(async (threadId, turn) => {
    const thread = await api(`/api/ask/threads/${encodeURIComponent(threadId)}`);
    if (turn !== request.current) return false;
    const mode = restoredMode(held.current, thread.mode);
    select(thread.id); setTitle(thread.title || ''); setModeState(mode); setHistoryOpen(false); setStatus('ready');
    show({ key: `${canvas}:${thread.id}:${turn}`, mode, contextRefs: thread.contextRefs || [], draft: thread.draft ?? null, messages: restoredMessages(thread.messages) });
    return true;
  }, [canvas]);
  // History's open: the thread shown becomes this canvas's active one.
  const open = useCallback(async threadId => {
    flush();
    if (await load(threadId, ++request.current)) remember(threadId);
  }, [flush, load, remember]);
  // The first turn of a new chat names its thread, and a turn's thread becomes this canvas's active one (remember: false
  // while that thread is not saved yet). The open thread and its restore key stay, so nothing resets mid-turn.
  const adopt = useCallback((threadId, nextTitle, { remember: keep = true } = {}) => {
    if (!threadId) return;
    if (keep) remember(threadId);
    if (idRef.current === threadId) return;
    select(threadId); setTitle(previous => previous || nextTitle || '');
  }, [remember]);
  // A mode the learner picks is saved, and ends any hold.
  const setMode = useCallback(next => { held.current = null; setModeState(next); saveState({ mode: next }); }, [saveState]);
  // holdMode(mode): shown and not saved (the Table of contents selects Tutor on entry, LearnPage.jsx), so opening a tab sends
  // no request, and a restore arriving later keeps it; the next turn records it. holdMode(null) releases the hold.
  const holdMode = useCallback(next => { held.current = next; if (next) setModeState(next); }, []);
  const rename = useCallback(async nextTitle => {
    const threadId = idRef.current, clean = String(nextTitle ?? '').trim().slice(0, 120);
    if (!threadId || !clean) return;
    await api(`/api/ask/threads/${threadId}/rename`, { method: 'POST', body: JSON.stringify({ title: clean }) });
    if (idRef.current === threadId) setTitle(clean);
  }, []);
  const remove = useCallback(async () => {
    const threadId = idRef.current;
    if (!threadId) return;
    if (pending.current?.id === threadId) { clearTimeout(timer.current); pending.current = null; }
    await api(`/api/ask/threads/${threadId}/delete`, { method: 'POST' });
    if (idRef.current === threadId) newChat();
  }, [newChat]);

  // Opening a canvas (a Rabbit Hole, a return, a reload) resumes its ACTIVE thread; with none set, its latest (what the
  // Learn panel did before), which then becomes the active one. A failure is status 'error' with retry, never a New chat.
  const restoreActive = useCallback(async () => {
    const turn = ++request.current;
    setStatus('loading');
    try {
      const active = await activeThread(canvas, api, slot);
      let threadId = active;
      if (!threadId && !slot) {
        const toc = await activeThread(canvas, api, 'toc');
        threadId = (await api(threadsUrl(canvas, '', 2))).threads?.find(thread => thread.id !== toc)?.id ?? null;
      }
      if (turn !== request.current) return;
      if (!threadId) { setStatus('ready'); return; }
      if (await load(threadId, turn) && !active) remember(threadId);
    } catch { if (turn === request.current) setStatus('error'); }
  }, [canvas, slot, load, remember]);
  const claim = useCallback(() => { request.current++; setStatus('ready'); }, []);
  useEffect(() => {
    if (shownCanvas.current !== canvas) { shownCanvas.current = canvas; newChat(); }
    restoreActive();
  }, [canvas]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => ({
    id, title, mode, setMode, holdMode, historyOpen, setHistoryOpen, restore, turnKey: restore.key, liveKey, status, retry: restoreActive, claim, newChat, open, adopt, saveState, rename, remove,
  }), [id, title, mode, setMode, holdMode, historyOpen, restore, liveKey, status, restoreActive, claim, newChat, open, adopt, saveState, rename, remove]);
}
