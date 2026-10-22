import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CanvasMenubar from './CanvasMenubar.jsx';
import ShortcutsSheet from './ShortcutsSheet.jsx';
import { canvasEditMenus, localInsertItems } from './canvas-menus.js';
import { can } from './canvas-permissions.js';
import { CommentsToggle, PanelToggle, SharedPanel, ViewerAccount, useSharedPanel } from './SharedCanvasShell.jsx';
import { useCanvasSearch } from './use-canvas-search.jsx';
import { SearchContentProvider } from './canvas-search-content.jsx';
import { docIsEmpty } from './canvas-doc.js';
import { ArrowDownToLine, ChevronDown, Eye, Loader2, Shapes } from 'lucide-react';
import { setRemoteAssets, setWorkspaceStore } from './learn-board-assets.js';
import { setFileScope } from './file-source-client.js';
import { CardSourceScope } from './use-card-source.js';
import ForkButton from './ForkButton.jsx';
import { ProvenanceRow, useProvenance } from './ProvenanceGroup.jsx';
import UsageGauge, { goToUsageSettings } from './UsageGauge.jsx';
import { Button, Menu, MenuItem, toast } from './ui.jsx';
import { wsHeaders } from './api.js';
import { BLANK, rabbitOrigin, requestRabbitHole, resumeHref, takeResume } from './shared-rabbit-hole.js';
import RabbitHoleChoice from './RabbitHoleChoice.jsx';
import { carryStep, keepPendingStep, takePendingStep } from './learn-next-steps.js';
import { markGuidedEntry } from './learn-opening.js';
import { useSharedNextSteps } from './LearnNextSteps.jsx';
import { describeBlock } from './LearningBlocks.jsx';
import { learnPreview, PRODUCT } from './flags.js';
import { creatorLabel } from './home/provenance.js';
import { NextStepsCard } from './ask.jsx';
import SharedChat from './SharedChat.jsx';
import { takeDraft, takeTarget } from './shared-ask.js';
import { useCanvasComments } from './comments/useCanvasComments.js';
import { memberBase, publicBase } from './comments/comments-api.js';
import { DiveNavigator, DivePortals } from './Dive.jsx';
import { sharedTree } from './shared-holes.js';
import { holeRows } from './dive.js';
import { TitleHoles } from './TitleHoles.jsx';
import { uiPrefs } from './ui-prefs.js';
import { useGuestDraft } from './guest-draft.js';

const AdaptiveCanvas = lazy(() => import('./AdaptiveCanvas.jsx'));
// Missing exchanges are valid in older/shared boards. Keep the Search subscription input stable.
const EMPTY_EXCHANGES = Object.freeze([]);

// /b/<token>: a Learn board someone shared (docs/features/canvas-sharing.md).
// Always view-only - pan and zoom. A public link needs no sign-in; any other
// sends a signed-out visitor to sign in and back. Fork (top right) is how a
// viewer gets their own editable copy (docs/features/canvas-forking.md), after
// its confirm-and-rename dialog; signed out, it goes through sign-in and comes
// back here, where the dialog opens again (?fork=1).
// Chat in the right panel asks about this canvas (docs/features/shared-canvas-ask.md; SharedChat.jsx, guest Chat SHARE-03).
export default function SharedBoardPage({ token }) {
  const [shared, setShared] = useState(null);
  // A share link and a publication alike (C:/s/spec/hdr-provenance.md C2), signed out too.
  const provenance = useProvenance(`/api/learn/provenance/link/${encodeURIComponent(token)}`);
  const [problem, setProblem] = useState(null);
  // Read once and dropped from the address, so Back to this page never forks a second time.
  const [forkRequested] = useState(() => {
    const asked = new URLSearchParams(window.location.search).get('fork') === '1';
    if (asked) window.history.replaceState(null, '', window.location.pathname);
    return asked;
  });
  // Back from signing in to send (?ask=1): the kept draft and its card return to Chat, unsent, and the flag leaves the address.
  const [askBack] = useState(() => {
    if (new URLSearchParams(window.location.search).get('ask') !== '1') return null;
    window.history.replaceState(null, '', window.location.pathname);
    return { draft: takeDraft(token), target: takeTarget(token) };
  });
  // Back from signing in to start a Rabbit Hole (?rabbit=<card | root>): it finishes from the same origin, with the hook clicked
  // signed out (&hook=<id>, Professor Next Steps contract §1.4) when one came back: { origin, hook }.
  const [rabbitRequested] = useState(() => takeResume(window.location, window.history, { hook: true }));
  // The canvas's state as AdaptiveCanvas reports it: the selected card (where Start Rabbit Hole begins), the outline the
  // Table of contents shows, and the View menu's switches.
  const [canvasState, setCanvasState] = useState({ minimap: true, holeMap: true, curious: true, outline: [], selected: 0, units: 0 });
  const onCanvasState = useCallback(state => setCanvasState(state), []);
  const card = canvasState.card || null;
  // The selected card's pill above the shared composer (owner, 2026-10-08): the canvas arms it on any selection.
  const [target, setTarget] = useState(() => askBack?.target ?? null);
  // The card right-click menu starts the same flow from the card it was opened on (owner, 2026-10-07).
  const rabbitStart = useRef(null), rabbitAsk = useRef(null);
  // The card menu asks From this canvas or Blank too (owner, 2026-10-08); a Next Steps hook starts its step directly.
  const startFromCard = useCallback(cardId => rabbitAsk.current?.(cardId), []);
  // The normal canvas's right panel (SharedCanvasShell.jsx): Chat first, then Find, Table of contents and Comments.
  const panel = useSharedPanel('chat');
  const { show } = panel;
  // Comments (docs/features/canvas-comments.md): a published canvas has the public family, while the owner's public
  // setting is Open or Closed (else it answers 404 and the page shows none); signed out reads, posting needs an account.
  // On a share link the owner and members (member_board_id) get the members panel; other link viewers see no comments.
  const [commentsInfo, setCommentsInfo] = useState(null);
  // The canvas's document (docs/features/blocknote-canvas.md), read-only here: View > Mode shows it, the canvas first.
  const [docView, setDocView] = useState('canvas');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // The guest Chat allowance SharedChat reports (SHARE-03): ctx.guestChat.remaining in the permission model.
  const [guestRemaining, setGuestRemaining] = useState(null);
  const canvasApi = useRef(null);
  const canvas = () => canvasApi.current;
  const openComments = useCallback(() => show('comments'), [show]);
  // Ask in Chat, Explain in Chat and Ask about selection (agent/scope.js askDraft) open Chat; SharedChat puts the words in.
  useEffect(() => {
    const open = () => show('chat');
    window.addEventListener('small:ask-focus', open);
    return () => window.removeEventListener('small:ask-focus', open);
  }, [show]);
  const memberBoard = shared?.member_board_id || null;
  const commentsBase = memberBoard ? memberBase(memberBoard) : shared?.published ? publicBase(token) : null;
  useEffect(() => {
    if (!commentsBase) return undefined;
    let live = true;
    fetch(commentsBase, { headers: { 'Content-Type': 'application/json' } }).then(response => (response.ok ? response.json() : null)).then(info => { if (live) setCommentsInfo(info); }, () => {});
    return () => { live = false; };
  }, [commentsBase]);
  // Signed out, a visitor drafts where a signed-in visitor could post (public setting Open, comments on); posting goes
  // through sign-in with the draft kept (SHARE-02, CommentsPanel).
  const guestMayDraft = !!commentsInfo && !commentsInfo.signed_in && commentsInfo.public_mode === 'open' && !!commentsInfo.comments_enabled;
  const comments = useCanvasComments({ base: commentsInfo && commentsBase, canAdd: !!commentsInfo?.can.post || guestMayDraft, openPanel: openComments, canvasApi, link: memberBoard ? `/c/${memberBoard}` : `/e/${token}`, shown: panel.open && panel.tab === 'comments' });
  // The one permission model (canvas-permissions.js; contract-permissions.md): the server's role for this visitor on this link.
  const permissions = useMemo(() => ({ role: shared?.access?.role || (shared?.viewer ? 'viewer' : 'guest'), shared: true, shareable: shared?.access?.shareable || null,
    comments: commentsInfo ? { read: true, post: !!commentsInfo.can?.post } : null, guestChat: guestRemaining === null ? null : { remaining: guestRemaining } }),
  [shared?.access, shared?.viewer, commentsInfo, guestRemaining]);
  // The visitor's temporary copy (SHARE-02, C:/s/spec/share/contract-guest-draft.md): anyone who may not write the source edits
  // a copy kept in this tab; Fork carries it into their own canvas. An owner or editor here stays view-only (their own page edits).
  const localCopy = !!shared && !can('source.write', permissions).allowed;
  const guest = useGuestDraft(token, shared?.version, { enabled: localCopy });
  // The menubar's Insert, Edit and Arrange act on that copy.
  const editable = localCopy;
  // Comments name only what is on the canvas itself, never an object of the visitor's copy (the server refuses it too).
  const sourceIds = useMemo(() => new Set(['blocks', 'exchanges', 'items', 'shapes', 'groups'].flatMap(key => (shared?.state?.[key] || []).map(entry => entry?.id))), [shared]);
  const addComment = comments.canvasProps.onAddComment;
  const commentProps = addComment ? { ...comments.canvasProps, onAddComment: anchor => (anchor?.kind === 'object' && !sourceIds.has(anchor.object_id) ? toast("This is only on your copy, so it can't take a comment.") : addComment(anchor)) } : comments.canvasProps;

  // The board's files and notebook workspaces come through the same link;
  // notebooks open as the board's latest copy, in a workspace of their own.
  useEffect(() => {
    const fileUrl = key => `/api/learn/boards/shared/${encodeURIComponent(token)}/assets/${encodeURIComponent(key)}`;
    setRemoteAssets(key => fetch(fileUrl(key)));
    setFileScope({ share: token }); // imported files read through the link (file-source-client.js)
    setWorkspaceStore({
      load: id => fetch(fileUrl(`notebook:${id}`)).then(response => (response.ok ? response.json() : null)).catch(() => null),
      fresh: true,
      workspaceId: id => `${id}-shared`,
    });
    return () => { setRemoteAssets(null); setWorkspaceStore(null); setFileScope(null); };
  }, [token]);

  useEffect(() => {
    fetch(`/api/learn/boards/shared/${encodeURIComponent(token)}`, { headers: { 'Content-Type': 'application/json' } })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (response.status === 401 && data.signIn) { window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`; return; }
        if (!response.ok) { setProblem(data.error || 'This board could not be opened.'); return; }
        setShared(data);
      })
      .catch(() => setProblem('This board could not be opened. Check your connection and try again.'));
  }, [token]);
  // Its Rabbit Holes Map, read-only (dive-v1.md "Shared map"): only the holes this viewer may open by their own link;
  // a level or a hole portal opens that link. No map when there is none to show, or the map cannot be read.
  const [holes, setHoles] = useState(null);
  useEffect(() => {
    if (!shared) return;
    fetch(`/api/learn/boards/shared/${encodeURIComponent(token)}/holes`).then(response => (response.ok ? response.json() : null))
      .then(map => setHoles(sharedTree(map)), () => setHoles(null));
  }, [token, !!shared]); // eslint-disable-line react-hooks/exhaustive-deps
  // Code and graph cards read through this link (follow-up R3 item 5), signed out too; their reads are kept apart per link,
  // viewer and board version (use-card-source.js).
  const cardScope = useMemo(() => ({ token, viewer: shared?.viewer || null, version: shared?.version ?? null }), [token, shared?.viewer, shared?.version]);
  const goTo = href => window.location.assign(href);

  const searchChildren = useMemo(() => Object.entries(holes?.portals || {}).map(([origin_block_id, child]) => ({ ...child, origin_block_id })), [holes]);
  const search = useCanvasSearch({ scopeKey: `shared:${token}:${shared?.viewer || 'anonymous'}`, canvasApi, epoch: !!shared, shown: panel.open && panel.tab === 'find',
    commentsBase: commentsInfo ? commentsBase : null, children: searchChildren,
    onComment: result => { panel.setReturnToSearch(true); comments.openPin(result.target.id); }, revealDocument: () => setDocView('editor') });
  const openSearchAction = (result, action) => {
    if (action.kind === 'rabbit-hole' && searchChildren.some(child => child.name === action.rabbitHole?.name)) goTo(action.rabbitHole.name);
    else toast('This source cannot be opened from this shared view.');
  };

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
  if (!shared) return <main className="grid h-screen place-items-center bg-white text-sm text-ink-2">Opening the board</main>;
  const { exchanges = EMPTY_EXCHANGES, ...board } = shared.state || {};
  const hasDoc = !!board.doc && !docIsEmpty(board.doc);
  // The normal canvas's menubar (canvas-menus.js): View always; Insert's local rows, Edit and Arrange once the canvas is
  // editable here. No Files: a shared canvas's Materials are not shareable (panel.files).
  const menus = [
    ...(editable && can('canvas.local-edit', permissions).allowed ? [{ title: 'Insert', items: localInsertItems(canvas) }] : []),
    ...canvasEditMenus({ canvas, canvasState, comments, docView, setDocView, onShortcuts: () => setShortcutsOpen(true) })
      .filter(menu => editable || menu.title === 'View'),
  ];
  return (
    <main className="flex h-screen bg-white max-lg:flex-col">
      <section aria-label="Shared canvas" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header data-canvas-header className="flex shrink-0 flex-wrap items-center gap-2 gap-y-2 px-4 py-2">
        {/* The product, top left (owner, 2026-10-04): the aperture mark and the name, to the site home. */}
        <a href="/" data-shared-brand className="flex shrink-0 items-center gap-2 border-r border-line pr-3 no-underline" aria-label={`${PRODUCT} home`}>
          <img src="/landing/favicon-32-v1.png" alt="" width="20" height="20" className="h-5 w-5 rounded-sm" />
          <span className="text-sm font-semibold text-ink">{PRODUCT}</span>
        </a>
        {/* One line, the full title on hover; with holes, the chevron opens their tree, each level its own link (owner r35). */}
        <span data-shared-title title={shared.title || (shared.board === 'main' ? shared.app : shared.board)} className="min-w-16 truncate text-sm font-semibold text-ink">{shared.title || (shared.board === 'main' ? shared.app : shared.board)}</span>
        {holes && <TitleHoles rows={holeRows(holes.tree)} onPick={row => goTo(row.app)} />}
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-xs text-ink-2"><Eye size={11} />View only</span>
        <CanvasMenubar menus={menus} />
        {shared.project_canvases?.length > 0 && <ProjectCanvases list={shared.project_canvases} />}
        {/* Who made it, by @handle (docs/features/user-handles.md); no handle, no line - never an email. The @handle
            links to the creator's public profile on a publication and a share link alike (owner, 2026-10-08). */}
        {shared.creator && <span data-shared-creator className="truncate text-xs text-ink-3">{shared.published ? 'Published by' : 'Shared by'} {shared.creator.handle
          ? <a data-creator-link href={`/@${shared.creator.handle}`} className="rounded-sm text-ink-2 hover:text-ink hover:underline">{creatorLabel(shared.creator)}</a> : creatorLabel(shared.creator)}</span>}
        <span className="flex-1" />
        <StartRabbitHole token={token} state={shared.state} card={card} title={shared.title || shared.board} resume={rabbitRequested} startRef={rabbitStart} askRef={rabbitAsk} />
        {/* The viewer's own monthly AI allowance (owner D4 section 2), never the owner's; signed out, no personal allowance. */}
        {learnPreview && <UsageGauge signedIn={!!shared.viewer} onViewUsage={goToUsageSettings} />}
        {guest.edited && <span data-guest-draft-notice role="status" className="shrink-0 text-xs text-ink-2">Changes aren't saved. Fork to keep them.</span>}
        <CommentsToggle panel={panel} comments={comments} />
        <PanelToggle panel={panel} />
        <ViewerAccount viewer={shared.viewer} />
        <ForkButton source={{ token }} title={shared.title} auto={forkRequested} draft={guest.forDraft} onForked={fork => { guest.clear(); window.location.href = fork.url; }} count={shared.fork_count} />
        {/* The canvas's repository and fork origin as this link's viewer may see them (decisions 1A-3A): no details menu here.
            Last, at the row's right edge, and right-aligned on the next row when the header wraps (E2). */}
        <ProvenanceRow provenance={provenance} />
      </header>
      <div className="relative min-h-0 min-w-0 flex-1" aria-label="Lesson canvas">
        <Suspense fallback={null}><SearchContentProvider key={search.scopeKey} registry={search.registry}><CardSourceScope.Provider value={cardScope}><DivePortals.Provider value={holes ? { portals: holes.portals, enter: goTo } : null}>
          <AdaptiveCanvas {...commentProps} apiRef={canvasApi} exchanges={exchanges} onMove={() => {}} appName={shared.app} docView={hasDoc ? docView : 'canvas'} onState={onCanvasState} onStartRabbitHole={startFromCard}
            {...(localCopy ? { localCopy: true, boardState: guest.state || board, onSave: guest.save } : { readOnly: true, boardState: board })}
            gutterTop={holes ? <DiveNavigator tree={holes.tree} climb={index => goTo(holes.tree.path[index].href)} enter={goTo} /> : null}
            hooks={<SharedNextSteps token={token} card={card?.id || null} version={shared.version} signedIn={!!shared.viewer} startRef={rabbitStart} />}
            onAskTarget={setTarget} askTargetId={target?.id ?? null} />
        </DivePortals.Provider></CardSourceScope.Provider></SearchContentProvider></Suspense>
      </div>
      </section>
      <SharedPanel panel={panel} permissions={permissions} search={search} onOpenAction={openSearchAction} comments={comments} commentsAttr="data-shared-comments"
        outline={canvasState.outline} activeSection={canvasState.activeSection ?? null} canvasApi={canvasApi}
        chat={<SharedChat token={token} viewer={shared.viewer} context={shared.context} draft={askBack?.draft ?? null} target={target} onClearTarget={() => { setTarget(null); canvasApi.current?.deselect(); }} onAllowance={setGuestRemaining} />} />
      {shortcutsOpen && <ShortcutsSheet onClose={() => setShortcutsOpen(false)} />}
    </main>
  );
}

// Start Rabbit Hole (docs/features/shared-canvas-rabbit-hole.md): the viewer's own private Rabbit Hole from this
// canvas - from the selected card, else from the canvas itself. Never a fork and never a change to this board; Fork
// stays beside it. Signed out, it goes through the existing sign-in and finishes on return (`resume`).
// A Professor Next Steps hook (contract §1.4) starts the same hole, carrying the clicked step: the server checks it and echoes
// it, and the new hole's first Tutor turn opens on it once (carryStep, by the hole's name). A stale step (the board changed or
// was renamed) starts the hole without it. Signed out, the step waits through sign-in for this link and hook (keepPendingStep).
function StartRabbitHole({ token, state, card, title, resume, startRef, askRef }) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(null); // { card } while the choice is open
  const flight = useRef(false);
  const run = async (cardId, step = null, hookId = null) => {
    if (flight.current) return; // a double click is one start
    flight.current = true; setBusy(true);
    try {
      // The card names the hole as every canvas surface describes it (describeBlock), kind first: "Quiz: ...".
      const origin = cardId === BLANK ? BLANK : rabbitOrigin(state, cardId, describeBlock);
      let made = await requestRabbitHole(token, origin, { headers: wsHeaders(), step });
      if (made.stale) made = await requestRabbitHole(token, origin, { headers: wsHeaders() });
      if (made.signIn) {
        if (step) keepPendingStep(sessionStorage, token, step);
        window.location.href = resumeHref(window.location.pathname, cardId, step ? hookId : null);
        return;
      }
      if (made.next_step) carryStep(sessionStorage, made.name, made.next_step);
      markGuidedEntry(sessionStorage, made.name); // owner 4a: the learner started this hole (no controls of theirs here)
      window.location.href = made.url;
    } catch (error) {
      toast(error.message, { tone: 'error' });
      flight.current = false; setBusy(false);
    }
  };
  // Back from sign-in: the kept step only for this link and the hook id that came back; none (or a stale reply) starts plain.
  useEffect(() => { if (resume !== undefined) run(resume.origin, resume.hook ? takePendingStep(sessionStorage, token, resume.hook) : null, resume.hook); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (startRef) startRef.current = run; // a Next Steps hook's way in: the same run, the same one-start guard
  // A click asks first: From this canvas (the selected card, else the canvas) or Blank (RabbitHoleChoice). Back from sign-in
  // the choice was already made, so `resume` starts straight away.
  const ask = (cardId) => { if (!flight.current) setAsking({ card: cardId ? describedCard(state, cardId) : null }); };
  if (askRef) askRef.current = ask;
  return (
    <>
      <Button type="button" variant="primary" data-start-rabbit-hole data-origin={card?.id || 'root'} aria-busy={busy} onClick={() => ask(card?.id || null)}
        title={card ? `Start your own private Rabbit Hole from "${card.title}", or a blank canvas. This canvas stays as it is.` : 'Start your own private Rabbit Hole from this canvas, or a blank canvas. This canvas stays as it is.'}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <ArrowDownToLine size={13} strokeWidth={1.8} />}Start Rabbit Hole
      </Button>
      {asking && <RabbitHoleChoice title={title} card={asking.card} onCancel={() => setAsking(null)} onPick={(origin) => { setAsking(null); run(origin); }} />}
    </>
  );
}

// The card the choice names: its id and title as every canvas surface describes it.
const describedCard = (state, cardId) => {
  const entry = [...(state?.blocks || []), ...(state?.exchanges || [])].find(item => item?.id === cardId);
  let named = null;
  try { named = entry && describeBlock(entry); } catch { /* a card describeBlock does not know */ }
  return { id: cardId, title: named?.title || entry?.title || entry?.question || 'this card' };
};

// Professor Next Steps on a shared canvas (contract §1.3, §1.7): the hooks for the selected card (null: the canvas itself), in
// the canvas's lower-left stack. A click starts the viewer's own private hole from that card through Start Rabbit Hole's run.
function SharedNextSteps({ token, card, version, signedIn, startRef }) {
  // Curious hidden on this device (View menu, ui-prefs.js; owner brief 2026-10-21 message 25 item 2): nothing is asked. This page
  // has no View menu, so the choice is read once per page load.
  const [curious] = useState(() => uiPrefs().curious);
  const steps = useSharedNextSteps({ token: curious ? token : null, card, version, signedIn });
  return <NextStepsCard steps={steps} onPick={(step, hook) => startRef.current?.(card, step, hook.id)} />;
}

// A project's link (visibility-menu.md "Projects", owner 2026-10-09) is its Main canvas's: beside it, the project's canvases
// this viewer may open by their own links (learn-boards.js projectCanvasLinks) - a title and a link each, never a private one.
function ProjectCanvases({ list }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button type="button" size="sm" variant="secondary" data-project-canvases aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Shapes size={13} strokeWidth={1.8} />{list.length} {list.length === 1 ? 'canvas' : 'canvases'} in this project<ChevronDown size={13} className="text-ink-3" />
      </Button>
      <Menu open={open} onClose={() => setOpen(false)} className="top-9 left-0 w-64">
        {list.map(c => <MenuItem key={c.href} icon={Shapes} data-project-canvas={c.href} onClick={() => window.location.assign(c.href)}>{c.title}</MenuItem>)}
      </Menu>
    </div>
  );
}
