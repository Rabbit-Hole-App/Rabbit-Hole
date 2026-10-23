import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye } from 'lucide-react';
import CanvasMenubar from '../CanvasMenubar.jsx';
import ShortcutsSheet from '../ShortcutsSheet.jsx';
import { canvasEditMenus } from '../canvas-menus.js';
import { typingIn } from '../canvas-equation.js';
import { CommentsToggle, PanelToggle, SharedPanel, useSharedPanel } from '../SharedCanvasShell.jsx';
import { useCanvasSearch } from '../use-canvas-search.jsx';
import { SearchContentProvider } from '../canvas-search-content.jsx';
import { docIsEmpty } from '../canvas-doc.js';
import { setRemoteAssets, setWorkspaceStore } from '../learn-board-assets.js';
import { setFileScope } from '../file-source-client.js';
import { toast } from '../ui.jsx';
import { CARD_GONE, cardParam, withoutCardParam } from '../canvas-refs-model.js';
import { PRODUCT } from '../flags.js';
import UsageGauge, { goToUsageSettings } from '../UsageGauge.jsx';
import { useCanvasComments } from './useCanvasComments.js';
import { displayName, memberBase } from './comments-api.js';
import { useCanvasLinks } from '../LinksPanel.jsx';
import { ProvenanceRow, useProvenance } from '../ProvenanceGroup.jsx';
import { CanvasChromeLoading, MEMBER_BODY, MEMBER_HEADER, MEMBER_MAIN, MemberBrand, MemberCanvasLoading, VIEWER_CANVAS } from '../CanvasLoading.jsx';

const AdaptiveCanvas = lazy(() => import('../AdaptiveCanvas.jsx'));
// Missing exchanges are valid in older/shared boards. Keep the Search subscription input stable.
const EMPTY_EXCHANGES = Object.freeze([]);

// /c/<board id>: a canvas shared with you as a member (docs/features/canvas-comments.md section 5, board 7). View and
// comment: the canvas read-only, and the Comments panel on the member family. The owner is sent to their own page.
// ponytail: Start Rabbit Hole and Fork are not offered here yet; they need member-family routes beside the share-link ones.
export default function MemberBoardPage({ boardId }) {
  const base = memberBase(boardId);
  const [board, setBoard] = useState(null);
  const [problem, setProblem] = useState(null);
  // The normal canvas's right panel (SharedCanvasShell.jsx), on Comments: no Chat here (members ask on their own canvases).
  const panel = useSharedPanel('comments');
  const { show } = panel;
  // The canvas's document (docs/features/blocknote-canvas.md), read-only here as on a share link: shown on request.
  const [docView, setDocView] = useState('canvas');
  const [canvasState, setCanvasState] = useState({ minimap: true, holeMap: true, curious: true, outline: [] });
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // ? opens the shortcuts (the menubar no longer lists them): not while typing, in a field, or with a modifier held.
  useEffect(() => {
    const key = event => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return;
      const active = window.document.activeElement;
      if (typingIn(active) || active?.tagName === 'SELECT') return;
      event.preventDefault();
      setShortcutsOpen(open => !open);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const [about, setAbout] = useState(null);
  const canvasApi = useRef(null);
  // Canvas references, read-only here (C:/s/spec/references-plan.md, lead answer C): chips resolved by the server's
  // filtered links, no Remove and no Link to canvas; this page has no panel tabs, so no Links tab.
  const links = useCanvasLinks({ boardId, shown: false });
  // A full load: Root picks this page once from the path, so a pushState to another board would keep showing this one.
  const refLinks = useMemo(() => ({ resolve: links.resolve, go: href => window.location.assign(href) }), [links.resolve]);
  const openComments = useCallback(() => show('comments'), [show]);
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
      setDocView('canvas');
      requestAnimationFrame(() => requestAnimationFrame(() => canvasApi.current?.focusBlock(id)));
    }, 50);
    return () => clearInterval(timer);
  }, [board]);
  const comments = useCanvasComments({ base: board && base, canAdd: !!about?.can.post, openPanel: openComments, canvasApi, link: `/c/${boardId}`, shown: panel.open && panel.tab === 'comments' });

  const search = useCanvasSearch({ scopeKey: `member:${boardId}`, canvasApi, epoch: !!board, shown: panel.open && panel.tab === 'find',
    commentsBase: board ? base : null, links, onComment: result => { panel.setReturnToSearch(true); comments.openPin(result.target.id); }, revealDocument: () => setDocView('editor') });
  const openSearchAction = (result, action) => {
    const reference = action.reference;
    if (action.kind === 'reference' && !reference?.unavailable && reference?.href) refLinks.go(reference.href);
    else toast('This source cannot be opened from this shared view.');
  };
  if (problem) return <main className="grid h-screen place-items-center bg-white p-6"><div className="max-w-sm text-center"><h1 className="text-lg font-semibold text-ink">{problem}</h1><a href="/" className="mt-3 inline-block text-sm text-ink-2 underline">Go to {PRODUCT}</a></div></main>;
  if (!board) return <MemberCanvasLoading />; // this page's own shell while the board loads (CanvasLoading.jsx, owner brief 2026-10-23)
  const { exchanges = EMPTY_EXCHANGES, ...state } = board.state || {};
  const owner = board.owner;
  // A member's role in the one permission model (canvas-permissions.js): commenter, view-only.
  const permissions = { role: 'commenter', shared: true, comments: about ? { read: true, post: !!about.can?.post } : null };
  const menus = canvasEditMenus({ canvas: () => canvasApi.current, canvasState, comments, docView: state.doc && !docIsEmpty(state.doc) ? docView : 'canvas', setDocView, drawing: false }).filter(menu => menu.title === 'View');
  return (
    <main data-member-board className={MEMBER_MAIN}>
      <header data-canvas-header className={MEMBER_HEADER}>
        <MemberBrand />
        <span className="truncate text-sm font-semibold text-ink">{board.title}</span>
        <CanvasMenubar menus={menus} />
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-xs text-ink-2"><Eye size={11} />{about?.comments_enabled === false ? 'View only' : 'View and comment'}</span>
        <span data-member-owner className="truncate text-xs text-ink-3">Shared with you by {owner?.name || displayName(owner)}{owner?.name && owner?.handle ? ` · @${owner.handle}` : ''}</span>
        <span className="flex-1" />
        <CommentsToggle panel={panel} comments={comments} />
        <PanelToggle panel={panel} />
        {/* The member's own monthly AI allowance (owner D4 section 2), never the owner's. */}
        <UsageGauge onViewUsage={goToUsageSettings} />
        {/* The canvas's repository and fork origin as this member may see them (decisions 1A-3A): no details menu here. Last, at
            the row's right edge, and right-aligned on the next row when the header wraps (E2). */}
        <ProvenanceRow provenance={provenance} />
      </header>
      <div className={MEMBER_BODY}>
        <div className={VIEWER_CANVAS} aria-label="Lesson canvas">
          <Suspense fallback={<CanvasChromeLoading tools={false} />}><SearchContentProvider key={search.scopeKey} registry={search.registry}>
            <AdaptiveCanvas {...comments.canvasProps} apiRef={canvasApi} refLinks={refLinks} exchanges={exchanges} onMove={() => {}} boardState={state} docView={state.doc && !docIsEmpty(state.doc) ? docView : 'canvas'} onState={setCanvasState} readOnly />
          </SearchContentProvider></Suspense>
        </div>
        <SharedPanel panel={panel} permissions={permissions} search={search} onOpenAction={openSearchAction} comments={comments} commentsAttr="data-member-comments"
          outline={canvasState.outline} activeSection={canvasState.activeSection ?? null} canvasApi={canvasApi} />
      </div>
      {shortcutsOpen && <ShortcutsSheet onClose={() => setShortcutsOpen(false)} />}
    </main>
  );
}
