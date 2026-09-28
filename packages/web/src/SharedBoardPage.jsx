import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Eye, Pencil, RotateCcw } from 'lucide-react';
import { setRemoteAssets, setWorkspaceStore } from './learn-board-assets.js';

const AdaptiveCanvas = lazy(() => import('./AdaptiveCanvas.jsx'));

// /b/<token>: a Learn board someone shared (docs/features/canvas-sharing.md).
// A view link opens it read-only - pan and zoom; an edit link opens it
// editable and saves back. A public view link needs no sign-in; any other
// link sends a signed-out visitor to sign in and back.
export default function SharedBoardPage({ token }) {
  const [shared, setShared] = useState(null);
  const [problem, setProblem] = useState(null);
  const [conflict, setConflict] = useState(false);
  const [exchanges, setExchanges] = useState([]);
  const version = useRef(null);
  const canvasState = useRef(null);

  // The board's files come through the same link.
  useEffect(() => {
    const fileUrl = key => `/api/learn/boards/shared/${encodeURIComponent(token)}/assets/${encodeURIComponent(key)}`;
    setRemoteAssets(key => fetch(fileUrl(key)));
    // Notebook workspaces open as the board's latest copy, in a workspace of
    // their own; an edit link saves file changes back.
    setWorkspaceStore({
      load: id => fetch(fileUrl(`notebook:${id}`)).then(response => (response.ok ? response.json() : null)).catch(() => null),
      save: (id, files) => (roleRef.current === 'edit'
        ? fetch(fileUrl(`notebook:${id}`), { method: 'PUT', body: JSON.stringify(files), headers: { 'Content-Type': 'text/x-cached-string', 'X-Asset-Kind': 'string' } }).catch(() => null)
        : null),
      fresh: true,
      workspaceId: id => `${id}-shared`,
    });
    return () => { setRemoteAssets(null); setWorkspaceStore(null); };
  }, [token]);
  const roleRef = useRef(null);

  useEffect(() => {
    fetch(`/api/learn/boards/shared/${encodeURIComponent(token)}`, { headers: { 'Content-Type': 'application/json' } })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (response.status === 401 && data.signIn) { window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`; return; }
        if (!response.ok) { setProblem(data.error || 'This board could not be opened.'); return; }
        version.current = data.version;
        const { exchanges: chats = [], ...board } = data.state || {};
        canvasState.current = board;
        setExchanges(chats);
        roleRef.current = data.role;
        setShared(data);
      })
      .catch(() => setProblem('This board could not be opened. Check your connection and try again.'));
  }, [token]);

  const editing = shared?.role === 'edit';
  // Saves go one at a time; a newer version on the server stops them until
  // the editor reloads, so nobody's changes are overwritten.
  const saving = useRef(Promise.resolve());
  const save = useCallback(() => {
    if (!editing || conflict || !canvasState.current) return;
    saving.current = saving.current.then(async () => {
      const response = await fetch(`/api/learn/boards/shared/${encodeURIComponent(token)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: { ...canvasState.current, exchanges: exchangesRef.current }, version: version.current }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) version.current = data.version;
      else if (response.status === 409) setConflict(true);
    }).catch(() => {});
  }, [editing, conflict, token]);
  const exchangesRef = useRef(exchanges);
  exchangesRef.current = exchanges;
  const onCanvasSave = useCallback(state => { canvasState.current = state; save(); }, [save]);
  const moveExchange = (id, dx, dy) => { if (!editing) return; setExchanges(previous => previous.map(exchange => exchange.id === id ? { ...exchange, dx, dy } : exchange)); };
  const movedOnce = useRef(false);
  useEffect(() => { if (!movedOnce.current) { movedOnce.current = true; return; } save(); }, [exchanges, save]);

  if (problem) {
    return (
      <main className="grid h-screen place-items-center bg-white p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold text-ink">Shared board</h1>
          <p className="mt-2 text-sm text-ink-2">{problem}</p>
        </div>
      </main>
    );
  }
  if (!shared) return <main className="grid h-screen place-items-center bg-white text-sm text-ink-2">Opening the board…</main>;
  return (
    <main className="flex h-screen flex-col bg-white">
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2">
        <span className="text-sm font-semibold text-ink">{shared.board === 'main' ? shared.app : shared.board}</span>
        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${editing ? 'bg-[#2383e2]/10 text-[#2383e2]' : 'bg-hover text-ink-2'}`}>
          {editing ? <><Pencil size={11} />Can edit</> : <><Eye size={11} />View only</>}
        </span>
        <span className="truncate text-xs text-ink-3">Shared by {shared.owner}</span>
        {conflict && (
          <span role="alert" className="ml-auto flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-1 text-xs text-amber-900">
            Someone else saved this board since you opened it. Your later changes are not saved.
            <button type="button" onClick={() => window.location.reload()} className="flex items-center gap-1 font-medium underline"><RotateCcw size={11} />Reload</button>
          </span>
        )}
      </header>
      <div className="relative min-h-0 flex-1" aria-label="Lesson canvas">
        <Suspense fallback={null}>
          <AdaptiveCanvas exchanges={exchanges} onMove={moveExchange} appName={shared.app}
            boardState={canvasState.current} onSave={editing ? onCanvasSave : null} readOnly={!editing} />
        </Suspense>
      </div>
    </main>
  );
}
