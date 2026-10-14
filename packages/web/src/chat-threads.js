import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';

// Sub-lane A2 (threads and History) owns this file. Contract: chat-workspace-CONTRACT.md A1-A5.
// Shape every other sub-lane relies on:
//   { id: string | null, title, mode: 'auto' | 'ask' | 'tutor', setMode(mode),
//     historyOpen, setHistoryOpen(open), newChat(), open(id) (a Promise; it rejects with the server's error), adopt(id, title) (the first send's done event names the new thread),
//     restore: { key, mode, contextRefs, draft, messages } (a new key resets the draft and the attached refs; messages is the transcript to show),
//     turnKey: string (changes whenever the open thread changes; a stream started under another key is dropped, contract A5),
//     saveState({ mode?, contextRefs?, draft? }) (debounced PUT of the open thread's state; chat-draft.js and chat-context.js call it),
//     rename(title), remove() (the open thread; the Chat header's overflow menu) }
// Threads live on the server (LEARN_DB threads/messages, contract A1): History, restore and the state PUT never depend on
// this browser. A new chat has no thread until its first turn's `done`.
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

export function useChatThread(canvas) {
  const [id, setId] = useState(null), [title, setTitle] = useState(''), [mode, setModeState] = useState('auto'), [historyOpen, setHistoryOpen] = useState(false);
  const [restore, setRestore] = useState(() => blank(`${canvas}:new:0`));
  const idRef = useRef(null), pending = useRef(null), timer = useRef(null), request = useRef(0), shownCanvas = useRef(canvas);
  const select = next => { idRef.current = next; setId(next); };
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
    select(null); setTitle(''); setModeState('auto'); setHistoryOpen(false);
    setRestore(blank(`${canvas}:new:${turn}`));
  }, [canvas, flush]);
  const open = useCallback(async threadId => {
    flush();
    const turn = ++request.current;
    const thread = await api(`/api/ask/threads/${encodeURIComponent(threadId)}`);
    if (turn !== request.current) return; // a later open or New chat won
    select(thread.id); setTitle(thread.title || ''); setModeState(thread.mode || 'auto'); setHistoryOpen(false);
    setRestore({ key: `${canvas}:${thread.id}:${turn}`, mode: thread.mode || 'auto', contextRefs: thread.contextRefs || [], draft: thread.draft ?? null, messages: thread.messages || [] });
  }, [canvas, flush]);
  // The first turn of a new chat names its thread. The open thread and its restore key stay, so nothing resets mid-turn.
  const adopt = useCallback((threadId, nextTitle) => {
    if (!threadId || idRef.current === threadId) return;
    select(threadId); setTitle(previous => previous || nextTitle || '');
  }, []);
  const setMode = useCallback(next => { setModeState(next); saveState({ mode: next }); }, [saveState]);
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

  // Opening a canvas resumes its latest conversation (what the Learn panel did before), unless the learner already chose.
  useEffect(() => {
    if (shownCanvas.current !== canvas) { shownCanvas.current = canvas; newChat(); }
    const turn = request.current;
    api(threadsUrl(canvas, '', 1)).then(d => { if (d.threads?.[0] && turn === request.current) return open(d.threads[0].id); }).catch(() => {});
  }, [canvas]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => ({
    id, title, mode, setMode, historyOpen, setHistoryOpen, restore, turnKey: restore.key, newChat, open, adopt, saveState, rename, remove,
  }), [id, title, mode, setMode, historyOpen, restore, newChat, open, adopt, saveState, rename, remove]);
}
