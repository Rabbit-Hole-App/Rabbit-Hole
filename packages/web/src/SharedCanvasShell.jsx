import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, PanelRightClose, PanelRightOpen } from 'lucide-react';
import PanelHeader, { CanvasSearchPanel } from './PanelHeader.jsx';
import ResizableSidePanel from './ResizableSidePanel.jsx';
import TableOfContents from './TableOfContents.jsx';
import CommentsPanel from './comments/CommentsPanel.jsx';
import { slashOpensFind } from './source-finder.js';
import { sharedPanelTabs } from './canvas-permissions.js';

// The shared canvas's shell pieces (SHARE-01, owner brief 2026-10-22 sections 1-2, 6): a share link or publication
// (SharedBoardPage) and a member's canvas (MemberBoardPage) use the normal canvas's right panel - PanelHeader's tabs Chat, Find,
// Table of contents and Comments - and its header toggles, with canvas-permissions.js deciding what shows. No Progress,
// goals or the TOC's Tutor here (panel.progress / toc.tutor are hidden on every shared canvas).

// The panel's state: open (default open on `initial`), the selected tab, Back to Search after a comment opened from it, and
// '/' opening Find as on the owner's canvas.
export function useSharedPanel(initial) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState(initial);
  const [returnToSearch, setReturnToSearch] = useState(false);
  const findInput = useRef(null);
  const show = useCallback(next => { setTab(next); setOpen(true); if (next === 'find') requestAnimationFrame(() => findInput.current?.focus()); }, []);
  useEffect(() => {
    const key = event => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || !slashOpensFind(document.activeElement)) return;
      event.preventDefault(); show('find');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [show]);
  return { open, setOpen, tab, show, findInput, returnToSearch, setReturnToSearch, toggle: () => setOpen(previous => !previous) };
}

// permissions: the contract's ctx. chat: the Chat tab's content, or null where this canvas has no Chat. search: useCanvasSearch;
// comments: useCanvasComments; commentsAttr: the page's data attribute on the shown Comments ('data-shared-comments').
// outline / activeSection: AdaptiveCanvas onState; canvasApi: its api (showSection only - navigation, no request).
export function SharedPanel({ panel, permissions, chat = null, search, onOpenAction, comments, commentsAttr, outline = [], activeSection = null, canvasApi }) {
  const tabs = sharedPanelTabs(permissions, { chat: !!chat });
  const label = { chat: 'Chat', find: 'Search', toc: 'Table of contents', comments: 'Comments' }[panel.tab];
  const commentsShown = panel.open && panel.tab === 'comments' && comments.active;
  return (
    <ResizableSidePanel collapsed={!panel.open} phoneHeight="max-lg:h-[50dvh] max-lg:min-h-64" storageKey="rh.viewer.panel.width" defaultWidth={400} aria-label={label} className="px-5 pt-3 pb-4">
      <PanelHeader tab={panel.tab} tabs={tabs} commentsOn={comments.active} commentsUnread={comments.unread} onClose={() => panel.setOpen(false)}
        onTab={(id, clicked) => { panel.show(id); if (clicked) panel.setReturnToSearch(false); }} />
      {chat && <div role="tabpanel" aria-label="Chat" data-shared-chat-panel className={`${panel.tab === 'chat' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col`}>{chat}</div>}
      <CanvasSearchPanel {...search.panel} hidden={panel.tab !== 'find'} inputRef={panel.findInput} onOpenAction={onOpenAction} />
      {/* The outline only (brief section 6): titles navigate on the canvas; no Tutor composer, plan, assessments or Progress. */}
      <div role="tabpanel" aria-label="Table of contents" data-shared-toc className={`${panel.tab === 'toc' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col`}>
        <TableOfContents outline={outline} canvasApi={canvasApi} readOnly activeId={activeSection} onShow={id => canvasApi.current?.showSection(id)} className="mb-3 flex min-h-0 flex-col overflow-y-auto" />
      </div>
      {commentsShown && panel.returnToSearch && <button type="button" onClick={() => panel.show('find')} className="mb-2 self-start rounded-md px-1 py-1 text-xs text-ink-2 outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/60">Back to Search</button>}
      {commentsShown && <div {...{ [commentsAttr]: '' }} className="flex min-h-0 flex-1 flex-col"><CommentsPanel {...comments.panelProps} /></div>}
    </ResizableSidePanel>
  );
}

// The header's right-panel toggle, as on the owner's canvas.
export function PanelToggle({ panel }) {
  return (
    <button type="button" data-panel-toggle title={panel.open ? 'Hide the right panel' : 'Show the right panel'} aria-label={panel.open ? 'Hide the right panel' : 'Show the right panel'} aria-pressed={panel.open}
      onClick={panel.toggle} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent/60 max-md:h-11 max-md:w-11 ${panel.open ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}>
      {panel.open ? <PanelRightClose size={15} strokeWidth={1.8} /> : <PanelRightOpen size={15} strokeWidth={1.8} />}
    </button>
  );
}

// The header's Comments toggle (the owner canvas's data-comments-header): opens the panel on Comments, or closes it there.
export function CommentsToggle({ panel, comments }) {
  if (!comments.active) return null;
  const shown = panel.open && panel.tab === 'comments';
  return (
    <button type="button" data-comments-header title="Comments" aria-label={comments.unread ? `Comments, ${comments.unread} unread` : 'Comments'} aria-pressed={shown}
      onClick={() => (shown ? panel.setOpen(false) : panel.show('comments'))}
      className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent/60 max-md:h-11 max-md:w-11 ${shown ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'}`}>
      <MessageCircle size={15} strokeWidth={1.8} aria-hidden />{comments.unread > 0 && <span data-unread-dot className="absolute top-1.5 left-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-white" />}
    </button>
  );
}

// The account area: signed in, the viewer's own canvases (an initial, never an email: the shared page shows no address,
// handle-check). Signed out there is no Sign in button in the header: Fork carries the sign-in (owner, 2026-10-22).
export function ViewerAccount({ viewer }) {
  if (!viewer) return null;
  return (
    <a data-viewer-account href="/apps" title="Your canvases" aria-label="Your canvases"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-hover text-sm font-semibold text-ink no-underline hover:bg-active">{viewer.slice(0, 1).toUpperCase()}</a>
  );
}
