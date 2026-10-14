import { useMemo, useState } from 'react';

// Sub-lane A2 (threads and History) owns this file. Contract: chat-workspace-CONTRACT.md A1-A5.
// Shape every other sub-lane relies on:
//   { id: string | null, title, mode: 'auto' | 'ask' | 'tutor', setMode(mode),
//     historyOpen, setHistoryOpen(open), newChat(), open(id), adopt(id, title) (the first send's done event names the new thread),
//     restore: { key, mode, contextRefs, draft } (a new key resets the draft and the attached refs),
//     turnKey: string (changes whenever the open thread changes; a stream started under another key is dropped, contract A5) }
// STUB: A2 replaces the body (server list/detail, state PUT, restore); keep the returned names.
export function useChatThread(canvas) {
  const [id, setId] = useState(null), [title, setTitle] = useState(''), [mode, setMode] = useState('auto'), [historyOpen, setHistoryOpen] = useState(false);
  const [restore, setRestore] = useState(() => ({ key: `new:${canvas}`, mode: 'auto', contextRefs: [], draft: null }));
  return useMemo(() => ({
    id, title, mode, setMode, historyOpen, setHistoryOpen, restore, turnKey: restore.key,
    newChat: () => { setId(null); setTitle(''); setMode('auto'); setRestore({ key: `new:${canvas}:${Date.now()}`, mode: 'auto', contextRefs: [], draft: null }); },
    open: () => {}, adopt: (next, nextTitle) => { setId(next); setTitle(nextTitle || ''); },
  }), [canvas, id, title, mode, historyOpen, restore]);
}
