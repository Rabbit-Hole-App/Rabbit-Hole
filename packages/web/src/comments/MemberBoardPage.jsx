import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Eye, MessageCircle, X } from 'lucide-react';
import { setRemoteAssets, setWorkspaceStore } from '../learn-board-assets.js';
import { Button } from '../ui.jsx';
import { PRODUCT } from '../flags.js';
import CommentsPanel from './CommentsPanel.jsx';
import { useCanvasComments } from './useCanvasComments.js';
import { displayName, memberBase } from './comments-api.js';

const AdaptiveCanvas = lazy(() => import('../AdaptiveCanvas.jsx'));

// /c/<board id>: a canvas shared with you as a member (docs/features/canvas-comments.md section 5, board 7). View and
// comment: the canvas read-only, and the Comments panel on the member family. The owner is sent to their own page.
// ponytail: Start Rabbit Hole and Fork are not offered here yet; they need member-family routes beside the share-link ones.
export default function MemberBoardPage({ boardId }) {
  const base = memberBase(boardId);
  const [board, setBoard] = useState(null);
  const [problem, setProblem] = useState(null);
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [about, setAbout] = useState(null);
  const canvasApi = useRef(null);
  const openComments = useCallback(() => setCommentsOpen(true), []);
  useEffect(() => {
    const fileUrl = key => `${base}/assets/${encodeURIComponent(key)}`;
    setRemoteAssets(key => fetch(fileUrl(key)));
    setWorkspaceStore({ load: id => fetch(fileUrl(`notebook:${id}`)).then(response => (response.ok ? response.json() : null)).catch(() => null), fresh: true, workspaceId: id => `${id}-member` });
    return () => { setRemoteAssets(null); setWorkspaceStore(null); };
  }, [base]);
  useEffect(() => {
    const get = path => fetch(path, { headers: { 'Content-Type': 'application/json' } }).then(async response => ({ status: response.status, body: await response.json().catch(() => ({})) }));
    Promise.all([get(`${base}/board`), get(base)]).then(([read, info]) => {
      if (read.status === 401) { window.location.href = `/sign-in?next=${encodeURIComponent(window.location.pathname)}`; return; }
      if (read.status !== 200) { setProblem("This canvas isn't available to you."); return; }
      if (read.body.role === 'owner' && read.body.canvas) { window.location.replace(`/apps/${read.body.canvas}${window.location.search}`); return; }
      setBoard(read.body); setAbout(info.status === 200 ? info.body : null);
    }, () => setProblem('This canvas could not be opened. Check your connection and try again.'));
  }, [base]);
  const comments = useCanvasComments({ base: board && base, canAdd: !!about?.can.post, openPanel: openComments, canvasApi, link: `/c/${boardId}` });

  if (problem) return <main className="grid h-screen place-items-center bg-white p-6"><div className="max-w-sm text-center"><h1 className="text-lg font-semibold text-ink">{problem}</h1><a href="/" className="mt-3 inline-block text-sm text-ink-2 underline">Go to {PRODUCT}</a></div></main>;
  if (!board) return <main className="grid h-screen place-items-center bg-white text-sm text-ink-2">Opening the canvas…</main>;
  const { exchanges = [], ...state } = board.state || {};
  const owner = board.owner;
  return (
    <main data-member-board className="flex h-screen flex-col bg-white">
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2">
        <a href="/" className="flex shrink-0 items-center gap-2 border-r border-line pr-3 no-underline" aria-label={`${PRODUCT} home`}>
          <img src="/landing/favicon-32-v1.png" alt="" width="20" height="20" className="h-5 w-5 rounded-sm" /><span className="text-sm font-semibold text-ink">{PRODUCT}</span>
        </a>
        <span className="truncate text-sm font-semibold text-ink">{board.title}</span>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-xs text-ink-2"><Eye size={11} />{about?.comments_enabled === false ? 'View only' : 'View and comment'}</span>
        <span data-member-owner className="truncate text-xs text-ink-3">Shared with you by {owner?.name || displayName(owner)}{owner?.name && owner?.handle ? ` · @${owner.handle}` : ''}</span>
        <span className="flex-1" />
        <Button type="button" variant="secondary" data-comments-button aria-pressed={commentsOpen} onClick={() => setCommentsOpen(open => !open)}><MessageCircle size={13} strokeWidth={1.8} />Comments</Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1" aria-label="Lesson canvas">
          <Suspense fallback={null}>
            <AdaptiveCanvas {...comments.canvasProps} apiRef={canvasApi} exchanges={exchanges} onMove={() => {}} boardState={state} readOnly />
          </Suspense>
        </div>
        {comments.active && commentsOpen && (
          <aside aria-label="Comments" data-member-comments className="flex w-[400px] shrink-0 flex-col border-l border-line px-5 pt-3 pb-4 max-md:w-full">
            <div className="-mx-5 mb-3 flex items-center justify-between border-b border-line px-5 pb-2.5">
              <h2 className="text-sm font-semibold text-ink">Comments</h2>
              <button type="button" aria-label="Close comments" onClick={() => setCommentsOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink"><X size={15} aria-hidden /></button>
            </div>
            <CommentsPanel {...comments.panelProps} />
          </aside>
        )}
      </div>
    </main>
  );
}
