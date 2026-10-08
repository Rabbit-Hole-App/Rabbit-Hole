import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, BookOpen, Eye, FileText, FolderGit2, Loader2, Lock, MessageCircle, Minus, Play, X } from 'lucide-react';
import { setRemoteAssets, setWorkspaceStore } from './learn-board-assets.js';
import ForkButton from './ForkButton.jsx';
import { Button, toast } from './ui.jsx';
import { wsHeaders } from './api.js';
import { BLANK, rabbitOrigin, requestRabbitHole, resumeHref, takeResume } from './shared-rabbit-hole.js';
import RabbitHoleChoice from './RabbitHoleChoice.jsx';
import { carryStep, keepPendingStep, takePendingStep } from './learn-next-steps.js';
import { useSharedNextSteps } from './LearnNextSteps.jsx';
import { describeBlock } from './LearningBlocks.jsx';
import { PRODUCT } from './flags.js';
import { creatorLabel } from './home/provenance.js';
import ChatComposer from './ChatComposer.jsx';
import { MaterialIcon, Md, NextStepsCard } from './ask.jsx';
import { streamAsk } from './agent/ask-stream.js';
import { askHistory, askPath, loadChat, saveChat, signInForAsk, takeDraft } from './shared-ask.js';
import CommentsPanel from './comments/CommentsPanel.jsx';
import { useCanvasComments } from './comments/useCanvasComments.js';
import { memberBase, publicBase } from './comments/comments-api.js';
import { DiveNavigator, DivePortals } from './Dive.jsx';
import { sharedTree } from './shared-holes.js';

const AdaptiveCanvas = lazy(() => import('./AdaptiveCanvas.jsx'));

// /b/<token>: a Learn board someone shared (docs/features/canvas-sharing.md).
// Always view-only - pan and zoom. A public link needs no sign-in; any other
// sends a signed-out visitor to sign in and back. Fork (top right) is how a
// viewer gets their own editable copy (docs/features/canvas-forking.md), after
// its confirm-and-rename dialog; signed out, it goes through sign-in and comes
// back here, where the dialog opens again (?fork=1).
// The composer at the bottom asks about this canvas (docs/features/shared-canvas-ask.md).
export default function SharedBoardPage({ token }) {
  const [shared, setShared] = useState(null);
  const [problem, setProblem] = useState(null);
  // Read once and dropped from the address, so Back to this page never forks a second time.
  const [forkRequested] = useState(() => {
    const asked = new URLSearchParams(window.location.search).get('fork') === '1';
    if (asked) window.history.replaceState(null, '', window.location.pathname);
    return asked;
  });
  // Back from signing in to send (?ask=1): the kept draft returns to the composer, unsent, and the flag leaves the address.
  const [askDraft] = useState(() => {
    if (new URLSearchParams(window.location.search).get('ask') !== '1') return null;
    window.history.replaceState(null, '', window.location.pathname);
    return takeDraft(token);
  });
  // Back from signing in to start a Rabbit Hole (?rabbit=<card | root>): it finishes from the same origin, with the hook clicked
  // signed out (&hook=<id>, Professor Next Steps contract §1.4) when one came back: { origin, hook }.
  const [rabbitRequested] = useState(() => takeResume(window.location, window.history, { hook: true }));
  // The selected card (a click on a view-only board selects it): where Start Rabbit Hole begins.
  const [card, setCard] = useState(null);
  const onCanvasState = useCallback(state => setCard(state.card || null), []);
  // The selected card's pill above the shared composer (owner, 2026-10-08): the canvas arms it on any selection.
  const [target, setTarget] = useState(null);
  // The card right-click menu starts the same flow from the card it was opened on (owner, 2026-10-07).
  const rabbitStart = useRef(null), rabbitAsk = useRef(null);
  // The card menu asks From this canvas or Blank too (owner, 2026-10-08); a Next Steps hook starts its step directly.
  const startFromCard = useCallback(cardId => rabbitAsk.current?.(cardId), []);
  // Comments (docs/features/canvas-comments.md): a published canvas has the public family, while the owner's public
  // setting is Open or Closed (else it answers 404 and the page shows none); signed out reads, posting needs an account.
  // On a share link the owner and members (member_board_id) get the members panel; other link viewers see no comments.
  const [commentsInfo, setCommentsInfo] = useState(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const canvasApi = useRef(null);
  const openComments = useCallback(() => setCommentsOpen(true), []);
  const memberBoard = shared?.member_board_id || null;
  const commentsBase = memberBoard ? memberBase(memberBoard) : shared?.published ? publicBase(token) : null;
  useEffect(() => {
    if (!commentsBase) return undefined;
    let live = true;
    fetch(commentsBase, { headers: { 'Content-Type': 'application/json' } }).then(response => (response.ok ? response.json() : null)).then(info => { if (live) setCommentsInfo(info); }, () => {});
    return () => { live = false; };
  }, [commentsBase]);
  const comments = useCanvasComments({ base: commentsInfo && commentsBase, canAdd: !!commentsInfo?.can.post, openPanel: openComments, canvasApi, link: memberBoard ? `/c/${memberBoard}` : `/e/${token}` });

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
      })
      .catch(() => setProblem('This board could not be opened. Check your connection and try again.'));
  }, [token]);
  // Its Rabbit Holes Map, read-only (dive-v1.md "Shared map"): only the holes this viewer may open by their own link;
  // a level or a red portal opens that link. No map when there is none to show, or the map cannot be read.
  const [holes, setHoles] = useState(null);
  useEffect(() => {
    if (!shared) return;
    fetch(`/api/learn/boards/shared/${encodeURIComponent(token)}/holes`).then(response => (response.ok ? response.json() : null))
      .then(map => setHoles(sharedTree(map)), () => setHoles(null));
  }, [token, !!shared]); // eslint-disable-line react-hooks/exhaustive-deps
  const goTo = href => window.location.assign(href);

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
        {/* The product, top left (owner, 2026-10-04): the aperture mark and the name, to the site home. */}
        <a href="/" data-shared-brand className="flex shrink-0 items-center gap-2 border-r border-line pr-3 no-underline" aria-label={`${PRODUCT} home`}>
          <img src="/landing/favicon-32-v1.png" alt="" width="20" height="20" className="h-5 w-5 rounded-sm" />
          <span className="text-sm font-semibold text-ink">{PRODUCT}</span>
        </a>
        <span className="text-sm font-semibold text-ink">{shared.title || (shared.board === 'main' ? shared.app : shared.board)}</span>
        <span className="flex items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-xs text-ink-2"><Eye size={11} />View only</span>
        {/* Who made it, by @handle (docs/features/user-handles.md); no handle, no line - never an email. The @handle
            links to the creator's public profile on a publication and a share link alike (owner, 2026-10-08). */}
        {shared.creator && <span data-shared-creator className="truncate text-xs text-ink-3">{shared.published ? 'Published by' : 'Shared by'} {shared.creator.handle
          ? <a data-creator-link href={`/@${shared.creator.handle}`} className="rounded-sm text-ink-2 hover:text-ink hover:underline">{creatorLabel(shared.creator)}</a> : creatorLabel(shared.creator)}</span>}
        <span className="flex-1" />
        {comments.active && <Button type="button" variant="secondary" data-comments-button aria-pressed={commentsOpen} onClick={() => setCommentsOpen(open => !open)}><MessageCircle size={13} strokeWidth={1.8} />Comments</Button>}
        <StartRabbitHole token={token} state={shared.state} card={card} title={shared.title || shared.board} resume={rabbitRequested} startRef={rabbitStart} askRef={rabbitAsk} />
        <ForkButton source={{ token }} title={shared.title} auto={forkRequested} onForked={fork => { window.location.href = fork.url; }} count={shared.fork_count} />
      </header>
      <div className="flex min-h-0 flex-1">
      <div className="relative min-h-0 min-w-0 flex-1" aria-label="Lesson canvas">
        <Suspense fallback={null}><DivePortals.Provider value={holes ? { portals: holes.portals, enter: goTo } : null}>
          <AdaptiveCanvas {...comments.canvasProps} apiRef={canvasApi} exchanges={exchanges} onMove={() => {}} appName={shared.app} boardState={board} readOnly onState={onCanvasState} onStartRabbitHole={startFromCard}
            gutterTop={holes ? <DiveNavigator tree={holes.tree} climb={index => goTo(holes.tree.path[index].href)} enter={goTo} /> : null}
            leftRail={<SharedNextSteps token={token} card={card?.id || null} version={shared.version} signedIn={!!shared.viewer} startRef={rabbitStart} />}
            onAskTarget={setTarget} askTargetId={target?.id ?? null}
            composer={<SharedAsk token={token} viewer={shared.viewer} context={shared.context} draft={askDraft} target={target} onClearTarget={() => { setTarget(null); canvasApi.current?.deselect(); }} />} />
        </DivePortals.Provider></Suspense>
      </div>
      {comments.active && commentsOpen && (
        <aside aria-label="Comments" data-shared-comments className="flex w-[400px] shrink-0 flex-col border-l border-line px-5 pt-3 pb-4 max-md:w-full">
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
  const steps = useSharedNextSteps({ token, card, version, signedIn });
  return <NextStepsCard steps={steps} onPick={(step, hook) => startRef.current?.(card, step, hook.id)} />;
}

const SOURCE_ICON = { video: Play, wiki: BookOpen, paper: FileText };
const SOURCE_PILLS = 4;
const PILL = 'inline-flex max-w-[260px] shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs';

// The shared canvas's composer: Learn's composer shell (ChatComposer dock) in the canvas's composer slot, the
// canvas's context as read-only pills above it, and the answers in a window above that only this viewer sees -
// kept in this tab (shared-ask.js), never on the owner's board and never in a fork (Fork sends only the link). A Q&A
// surface only: no +, attachments, model picker or / commands (the server ignores them too). Anyone may type;
// sending needs an account, so signed out, Send keeps the draft and goes through sign-in. `draft` (back from
// sign-in) is restored, never sent.
// target: the card the viewer selected (AdaptiveCanvas arms it as on the owner's canvas), shown as the one pill above the
// composer with its x; Send carries only its id, and the server words it from the shared board (learn-shared-ask.js).
function SharedAsk({ token, viewer, context, draft, target = null, onClearTarget = null }) {
  const [input, setInput] = useState(draft || '');
  const [turns, setTurns] = useState(() => (viewer ? loadChat(token, viewer) : []));
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);
  const inputRef = useRef(null), flight = useRef(null), box = useRef(null);
  useEffect(() => { if (draft !== null) inputRef.current?.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (viewer && !busy) saveChat(token, viewer, turns);
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [turns, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  const toSignIn = text => { window.location.href = signInForAsk(token, text, undefined, window.location.pathname); };
  const last = patch => setTurns(all => all.map((turn, i) => (i === all.length - 1 ? { ...turn, ...(typeof patch === 'function' ? patch(turn) : patch) } : turn)));
  const send = async raw => {
    const message = raw.trim();
    if (!message || busy) return;
    if (!viewer) return toSignIn(raw);
    const history = askHistory(turns);
    setInput(''); setOpen(true); setBusy(true);
    setTurns(all => [...all, { role: 'user', content: message }, { role: 'assistant', content: '', pending: true }]);
    const controller = new AbortController();
    flight.current = controller;
    let signIn = false, limited = false;
    try {
      await streamAsk({ path: askPath(token), body: { message, history, ...(target ? { selected: target.id } : {}) }, signal: controller.signal, onEvent: (type, data) => {
        if (type === 'chunk') last(turn => ({ content: turn.content + data.text }));
        else if (type === 'progress') last({ status: data.stage });
        else if (type === 'error' && data.signIn) signIn = true;
        else if (type === 'error') { limited = !!data.limited; last({ error: data.error, limited }); }
        // The server could not read the share's repository at its pinned commit: said under the answer.
        else if (type === 'done' && data.notice) last({ notice: data.notice });
      } });
    } catch (error) {
      last({ error: error.name === 'AbortError' ? 'Stopped.' : error.message });
    } finally {
      flight.current = null;
      last(turn => ({ pending: false, ...(turn.content || turn.error ? {} : { error: 'No answer came back. Try again.' }) }));
      setBusy(false);
    }
    // The session ended since the page opened: the question goes back through sign-in as a draft.
    if (signIn) { setTurns(all => all.slice(0, -2)); toSignIn(message); }
    // Over a limit (429): the limit shows in the window and the question goes back into the composer, unless a new one is being typed.
    if (limited) setInput(current => current || raw);
  };
  const sources = context?.sources || [];
  const repository = context?.repository;
  return (
    <div data-shared-ask className="relative flex min-w-0 flex-col">
      {open && turns.length > 0 && (
        <div ref={box} data-shared-chat className="no-scrollbar absolute right-0 bottom-full left-0 z-30 mb-2 max-h-[45vh] overflow-y-auto rounded-xl border border-line bg-white px-3 pb-3 shadow-pop">
          <div className="sticky top-0 z-10 -mx-3 flex items-center gap-1 bg-white px-3 pt-2 pb-1">
            <span className="mr-auto flex items-center gap-1 text-xs text-ink-2"><Lock size={11} />Only you see this chat. Fork to make your own editable copy.</span>
            <button type="button" disabled={busy} onClick={() => setTurns([])} className="flex h-6 cursor-pointer items-center rounded-sm px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-50">Clear</button>
            <button type="button" aria-label="Collapse chat" title="Collapse" onClick={() => setOpen(false)} className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink"><Minus size={14} /></button>
          </div>
          {turns.map((turn, i) => (
            <div key={i} className={`py-1.5 ${turn.role === 'user' ? 'flex justify-end' : ''}`}>
              {turn.role === 'user' ? <div className="max-w-[85%] rounded-lg bg-hover px-3 py-1.5 text-sm">{turn.content}</div>
                : turn.error ? <div role="alert" data-shared-limited={turn.limited || undefined} className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">{turn.error}</div>
                : turn.content ? <div data-shared-answer className="min-w-0 rounded-lg border border-accent/30 p-3">
                  {/* ponytail: no onFile - a shared view cannot open the owner-only repository file viewer, so cited files show as plain pills and there is no Sources dropdown (owner decision E). A share viewer scoped to this share, its pinned commit and the allowed material could make them open. */}
                  <Md text={turn.content} />
                  {turn.notice && <p data-shared-notice className="mt-2 text-xs text-ink-3">{turn.notice}</p>}
                </div>
                : <span className="flex items-center gap-2 text-xs text-ink-2"><Loader2 size={14} className="animate-spin text-ink-3" /><span className="shimmer">{turn.status || 'Thinking…'}</span></span>}
            </div>
          ))}
        </div>
      )}
      {(repository || sources.length > 0) && (
        <div data-shared-context className="mb-1.5 flex flex-wrap gap-1.5">
          {repository && <span data-context-pill="repository" title={`${repository.repo} at ${repository.commit}`} className={`${PILL} border-green-600/45 bg-green-50 text-green-800`}>
            <FolderGit2 size={12} className="shrink-0" /><span className="truncate">{repository.repo} · {repository.commit.slice(0, 7)}</span>
          </span>}
          {sources.slice(0, SOURCE_PILLS).map(source => {
            const Icon = SOURCE_ICON[source.kind] || FileText;
            return <span key={`${source.kind}:${source.id || source.title}`} data-context-pill={source.kind} title={source.title} className={`${PILL} border-line bg-hover text-ink-2`}><Icon size={12} className="shrink-0" /><span className="truncate">{source.title}</span></span>;
          })}
          {sources.length > SOURCE_PILLS && <span data-context-pill="more" title={sources.slice(SOURCE_PILLS).map(source => source.title).join('\n')} className={`${PILL} border-line text-ink-3`}>+{sources.length - SOURCE_PILLS} more</span>}
        </div>
      )}
      {target && <div data-canvas-target data-selected-card={target.id} title={`${target.kind}: ${String(target.title ?? '')}`} className="mb-1.5 inline-flex max-w-full self-start items-center gap-1.5 rounded-full border border-line bg-hover py-1 pr-1.5 pl-2.5 text-xs text-ink-2">
        <MaterialIcon type={target.context?.material_type} />
        <span className="max-w-[260px] truncate">{String(target.title ?? '').replace(/\$([^$]*)\$/g, '$1')}</span>
        <button type="button" aria-label="Remove selected card context" title="Remove selected card context" onClick={onClearTarget} className="shrink-0 rounded-full p-0.5 hover:bg-active hover:text-ink"><X size={12} /></button>
      </div>}
      <ChatComposer dock value={input} onChange={setInput} onSubmit={send} inputRef={inputRef} busy={busy} onStop={() => flight.current?.abort()} maxLength={4000}
        placeholder={viewer ? 'Ask about this canvas…' : 'Ask about this canvas… (sign in to send)'} />
    </div>
  );
}
