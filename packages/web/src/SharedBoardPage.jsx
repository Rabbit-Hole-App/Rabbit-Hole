import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Eye, GitFork } from 'lucide-react';
import { setRemoteAssets, setWorkspaceStore } from './learn-board-assets.js';

const AdaptiveCanvas = lazy(() => import('./AdaptiveCanvas.jsx'));

// /b/<token>: a Learn board someone shared (docs/features/canvas-sharing.md).
// Always view-only - pan and zoom. A public link needs no sign-in; any other
// sends a signed-out visitor to sign in and back. Fork (top right) is how a
// viewer gets their own editable copy.
export default function SharedBoardPage({ token }) {
  const [shared, setShared] = useState(null);
  const [problem, setProblem] = useState(null);
  const [forking, setForking] = useState(false);
  // Fork: the viewer's own Canvas, a copy of this board. Signed out, it goes
  // through sign-in and comes back here to finish (?fork=1).
  const forkBoard = async () => {
    setForking(true);
    try {
      const response = await fetch(`/api/learn/boards/shared/${encodeURIComponent(token)}/fork`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) { window.location.href = `/login?next=${encodeURIComponent(`${window.location.pathname}?fork=1`)}`; return; }
      if (!response.ok) throw new Error(data.error || 'The fork could not be made.');
      window.location.href = data.url;
    } catch (error) { setProblem(error.message); setForking(false); }
  };
  const forkRequested = useRef(new URLSearchParams(window.location.search).get('fork') === '1');

  // The board's files and notebook workspaces come through the same link;
  // notebooks open as the board's latest copy, in a workspace of their own.
  useEffect(() => {
    const fileUrl = key => `/api/learn/boards/shared/${encodeURIComponent(token)}/assets/${encodeURIComponent(key)}`;
    setRemoteAssets(key => fetch(fileUrl(key)));
    setWorkspaceStore({
      load: id => fetch(fileUrl(`notebook:${id}`)).then(response => (response.ok ? response.json() : null)).catch(() => null),
      fresh: true,
      workspaceId: id => `${id}-shared`,
    });
    return () => { setRemoteAssets(null); setWorkspaceStore(null); };
  }, [token]);

  useEffect(() => {
    fetch(`/api/learn/boards/shared/${encodeURIComponent(token)}`, { headers: { 'Content-Type': 'application/json' } })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (response.status === 401 && data.signIn) { window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`; return; }
        if (!response.ok) { setProblem(data.error || 'This board could not be opened.'); return; }
        setShared(data);
        if (forkRequested.current) { forkRequested.current = false; forkBoard(); }
      })
      .catch(() => setProblem('This board could not be opened. Check your connection and try again.'));
  }, [token]);

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
  const { exchanges = [], ...board } = shared.state || {};
  return (
    <main className="flex h-screen flex-col bg-white">
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2">
        <span className="text-sm font-semibold text-ink">{shared.title || (shared.board === 'main' ? shared.app : shared.board)}</span>
        <span className="flex items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-xs text-ink-2"><Eye size={11} />View only</span>
        <span className="truncate text-xs text-ink-3">Shared by {shared.owner}</span>
        <span className="flex-1" />
        <button type="button" onClick={forkBoard} disabled={forking} title="Make your own editable copy, a canvas in your Library"
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-ink hover:bg-hover disabled:opacity-50">
          <GitFork size={14} />{forking ? 'Forking…' : 'Fork'}
        </button>
      </header>
      <div className="relative min-h-0 flex-1" aria-label="Lesson canvas">
        <Suspense fallback={null}>
          <AdaptiveCanvas exchanges={exchanges} onMove={() => {}} appName={shared.app} boardState={board} readOnly />
        </Suspense>
      </div>
    </main>
  );
}
