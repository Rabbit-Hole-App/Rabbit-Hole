import { useCallback, useEffect, useRef, useState } from 'react';
import { loadLinks } from './canvas-refs.js';

// Canvas references (C:/s/spec/references-plan.md, brief sections 6 and 9): the board's links, read from the server
// (loadLinks), which filters what this viewer may see. One request per board serves Search's Links results and the chips.
// The picker's choices are cached by target so a link not yet saved and indexed still shows its title; the server's
// answer wins once it has the target. A target the server leaves out after a good answer resolves as Unavailable
// (a ref the saver could not read is never indexed). Refreshes: board change, panel reopen, the browser tab coming
// back, and refresh() after a save that changed the links. An answer for another board is dropped.
export function useCanvasLinks({ boardId, shown }) {
  const [links, setLinks] = useState({ status: 'loading', board: boardId, from: [], to: [] });
  const cache = useRef(new Map()), cacheBoard = useRef(boardId), request = useRef(null), wasShown = useRef(shown);
  if (cacheBoard.current !== boardId) { cache.current = new Map(); cacheBoard.current = boardId; }
  const refresh = useCallback(() => {
    request.current?.abort();
    if (!boardId) { setLinks({ status: 'none', board: null, from: [], to: [] }); return; }
    const control = new AbortController();
    request.current = control;
    setLinks(previous => (previous.board === boardId && previous.status === 'ready' ? previous : { status: 'loading', board: boardId, from: [], to: [] }));
    loadLinks(boardId, control.signal).then(data => {
      if (control.signal.aborted || data?.board !== boardId) return;
      setLinks({ status: 'ready', board: boardId, from: data.from || [], to: data.to || [] });
    }).catch(() => { if (!control.signal.aborted) setLinks({ status: 'error', board: boardId, from: [], to: [] }); });
  }, [boardId]);
  useEffect(() => { refresh(); return () => request.current?.abort(); }, [refresh]);
  useEffect(() => { if (shown && !wasShown.current) refresh(); wasShown.current = shown; }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [refresh]);
  const current = links.board === boardId;
  const status = current ? links.status : 'loading';
  const resolve = useCallback(target => {
    if (!current) return null;
    const group = current && links.from.find(entry => entry.target === target);
    if (group) return group.unavailable ? { unavailable: true } : group;
    return cache.current.get(target) || (status === 'ready' ? { unavailable: true } : null);
  }, [links, current, status]);
  const remember = useCallback(canvas => { cache.current.set(canvas.id, canvas); }, []);
  return { status, from: current ? links.from : [], to: current ? links.to : [], refresh, resolve, remember };
}

// A plain left click stays in this tab through go() (it saves first); modifier, middle and right clicks stay native.
export const plainClick = event => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
export const openInNewTab = href => window.open(href, '_blank', 'noopener');

