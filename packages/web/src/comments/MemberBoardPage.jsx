import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, FileText, MessageCircle, X } from 'lucide-react';
import { docIsEmpty } from '../canvas-doc.js';
import { setRemoteAssets, setWorkspaceStore } from '../learn-board-assets.js';
import { setFileScope } from '../file-source-client.js';
import { Button, toast } from '../ui.jsx';
import { CARD_GONE, cardParam, withoutCardParam } from '../canvas-refs-model.js';
import { PRODUCT } from '../flags.js';
import UsageGauge, { goToUsageSettings } from '../UsageGauge.jsx';
import CommentsPanel from './CommentsPanel.jsx';
import { useCanvasComments } from './useCanvasComments.js';
import { displayName, memberBase } from './comments-api.js';
import { useCanvasLinks } from '../LinksPanel.jsx';
import { ProvenanceRow, useProvenance } from '../ProvenanceGroup.jsx';

const AdaptiveCanvas = lazy(() => import('../AdaptiveCanvas.jsx'));

// /c/<board id>: a canvas shared with you as a member (docs/features/canvas-comments.md section 5, board 7). View and
// comment: the canvas read-only, and the Comments panel on the member family. The owner is sent to their own page.
// ponytail: Start Rabbit Hole and Fork are not offered here yet; they need member-family routes beside the share-link ones.
export default function MemberBoardPage({ boardId }) {
  const base = memberBase(boardId);
  const [board, setBoard] = useState(null);
  const [problem, setProblem] = useState(null);
  const [commentsOpen, setCommentsOpen] = useState(true);
  // The canvas's document (docs/features/blocknote-canvas.md), read-only here as on a share link: shown on request.
  const [docShown, setDocShown] = useState(false);
  const [about, setAbout] = useState(null);
  const canvasApi = useRef(null);
  // Canvas references, read-only here (C:/s/spec/references-plan.md, lead answer C): chips resolved by the server's
  // filtered links, no Remove and no Link to canvas; this page has no panel tabs, so no Links tab.
  const links = useCanvasLinks({ boardId, shown: false });
  // A full load: Root picks this page once from the path, so a pushState to another board would keep showing this one.
  const refLinks = useMemo(() => ({ resolve: links.resolve, go: href => window.location.assign(href) }), [links.resolve]);
  const openComments = useCallback(() => setCommentsOpen(true), []);
  const provenance = useProvenance(`/api/learn/provenance/c/${encodeURIComponent(boardId)}`);
  useEffect(() => {
    const fileUrl = key => `${base}/assets/${encodeURIComponent(key)}`;
    setRemoteAssets(key => fetch(fileUrl(key)));
    setFileScope({ member: boardId }); // imported files read as a canvas member (file-source-client.js)
    setWorkspaceStore({ load: id => fetch(fileUrl(`notebook:${id}`)).then(response => (response.ok ? response.json() : null)).catch(() => null), fresh: true, workspaceId: id => `${id}-member` });
    return () => { setRemoteAssets(null); setWorkspaceStore(null); setFileScope(null); };
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
  // card=<objectId>, a backlink's origin card (C:/s/spec/references-plan.md, URLs): once the board's canvas is up, that card
  // is shown - the document hidden, never dropped - or, gone, a toast and nothing selected; the param is dropped either way.
  // ponytail: polls for the lazy canvas's api (no state callback here); stops on unmount.
  const cardFocus = useRef(cardParam(window.location.search));
  useEffect(() => {
    const id = cardFocus.current;
    if (!board || !id) return undefined;
    const timer = setInterval(() => {
      const api = canvasApi.current;
      if (!api) return;
      clearInterval(timer);
      cardFocus.current = null;
      window.history.replaceState(window.history.state, '', withoutCardParam(window.location.href));
      if (!api.blocks().some(block => block.id === id)) { api.deselect(); toast(CARD_GONE); return; }
      setDocShown(false);
      requestAnimationFrame(() => requestAnimationFrame(() => canvasApi.current?.focusBlock(id)));
    }, 50);
    return () => clearInterval(timer);
  }, [board]);
  const comments = useCanvasComments({ base: board && base, canAdd: !!about?.can.post, openPanel: openComments, canvasApi, link: `/c/${boardId}`, shown: commentsOpen });

  if (problem) return <main className="grid h-screen place-items-center bg-white p-6"><div className="max-w-sm text-center"><h1 className="text-lg font-semibold text-ink">{problem}</h1><a href="/" className="mt-3 inline-block text-sm text-ink-2 underline">Go to {PRODUCT}</a></div></main>;
  if (!board) return <main className="grid h-screen place-items-center bg-white text-sm text-ink-2">Opening the canvas…</main>;
  const { exchanges = [], ...state } = board.state || {};
  const owner = board.owner;
  return (
    <main data-member-board className="flex h-screen flex-col bg-white">
      <header className="flex shrink-0 flex-wrap items-center gap-3 gap-y-2 border-b border-line px-4 py-2">
        <a href="/" className="flex shrink-0 items-center gap-2 border-r border-line pr-3 no-underline" aria-label={`${PRODUCT} home`}>
          <img src="/landing/favicon-32-v1.png" alt="" width="20" height="20" className="h-5 w-5 rounded-sm" /><span className="text-sm font-semibold text-ink">{PRODUCT}</span>
        </a>
        <span className="truncate text-sm font-semibold text-ink">{board.title}</span>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-xs text-ink-2"><Eye size={11} />{about?.comments_enabled === false ? 'View only' : 'View and comment'}</span>
        <span data-member-owner className="truncate text-xs text-ink-3">Shared with you by {owner?.name || displayName(owner)}{owner?.name && owner?.handle ? ` · @${owner.handle}` : ''}</span>
        <span className="flex-1" />
        {state.doc && !docIsEmpty(state.doc) && <Button type="button" variant="secondary" data-doc-toggle aria-pressed={docShown} onClick={() => setDocShown(shown => !shown)}><FileText size={13} strokeWidth={1.8} />{docShown ? 'Hide document' : 'Show document'}</Button>}
        <Button type="button" variant="secondary" data-comments-button aria-pressed={commentsOpen} onClick={() => setCommentsOpen(open => !open)}><MessageCircle size={13} strokeWidth={1.8} />Comments</Button>
        {/* The member's own monthly AI allowance (owner D4 section 2), never the owner's. */}
        <UsageGauge onViewUsage={goToUsageSettings} />
        {/* The canvas's repository and fork origin as this member may see them (decisions 1A-3A): no details menu here. Last, at
            the row's right edge, and right-aligned on the next row when the header wraps (E2). */}
        <ProvenanceRow provenance={provenance} />
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1" aria-label="Lesson canvas">
          <Suspense fallback={null}>
            <AdaptiveCanvas {...comments.canvasProps} apiRef={canvasApi} refLinks={refLinks} exchanges={exchanges} onMove={() => {}} boardState={state} docView={docShown ? 'editor' : 'canvas'} readOnly />
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
