import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, BookOpen, Eye, FileText, FolderGit2, Loader2, Lock, Minus, Play } from 'lucide-react';
import { setRemoteAssets, setWorkspaceStore } from './learn-board-assets.js';
import ForkButton from './ForkButton.jsx';
import { Button, toast } from './ui.jsx';
import { wsHeaders } from './api.js';
import { rabbitOrigin, requestRabbitHole, resumeHref, takeResume } from './shared-rabbit-hole.js';
import { describeBlock } from './LearningBlocks.jsx';
import { PRODUCT } from './flags.js';
import { creatorLabel } from './home/provenance.js';
import ChatComposer from './ChatComposer.jsx';
import { Md } from './ask.jsx';
import { streamAsk } from './agent/ask-stream.js';
import { askHistory, askPath, loadChat, saveChat, signInForAsk, takeDraft } from './shared-ask.js';

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
  // Back from signing in to start a Rabbit Hole (?rabbit=<card | root>): it finishes from the same origin.
  const [rabbitRequested] = useState(() => takeResume(window.location, window.history));
  // The selected card (a click on a view-only board selects it): where Start Rabbit Hole begins.
  const [card, setCard] = useState(null);
  const onCanvasState = useCallback(state => setCard(state.card || null), []);
  // The card right-click menu starts the same flow from the card it was opened on (owner, 2026-10-07).
  const rabbitStart = useRef(null);
  const startFromCard = useCallback(cardId => rabbitStart.current?.(cardId), []);

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
        <StartRabbitHole token={token} state={shared.state} card={card} resume={rabbitRequested} startRef={rabbitStart} />
        <ForkButton source={{ token }} title={shared.title} auto={forkRequested} onForked={fork => { window.location.href = fork.url; }} count={shared.fork_count} />
      </header>
      <div className="relative min-h-0 flex-1" aria-label="Lesson canvas">
        <Suspense fallback={null}>
          <AdaptiveCanvas exchanges={exchanges} onMove={() => {}} appName={shared.app} boardState={board} readOnly onState={onCanvasState} onStartRabbitHole={startFromCard}
            composer={<SharedAsk token={token} viewer={shared.viewer} context={shared.context} draft={askDraft} />} />
        </Suspense>
      </div>
    </main>
  );
}

// Start Rabbit Hole (docs/features/shared-canvas-rabbit-hole.md): the viewer's own private Rabbit Hole from this
// canvas - from the selected card, else from the canvas itself. Never a fork and never a change to this board; Fork
// stays beside it. Signed out, it goes through the existing sign-in and finishes on return (`resume`).
function StartRabbitHole({ token, state, card, resume, startRef }) {
  const [busy, setBusy] = useState(false);
  const flight = useRef(false);
  const run = async cardId => {
    if (flight.current) return; // a double click is one start
    flight.current = true; setBusy(true);
    try {
      // The card names the hole as every canvas surface describes it (describeBlock), kind first: "Quiz: ...".
      const made = await requestRabbitHole(token, rabbitOrigin(state, cardId, describeBlock), { headers: wsHeaders() });
      window.location.href = made.signIn ? resumeHref(window.location.pathname, cardId) : made.url;
    } catch (error) {
      toast(error.message, { tone: 'error' });
      flight.current = false; setBusy(false);
    }
  };
  useEffect(() => { if (resume !== undefined) run(resume); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (startRef) startRef.current = run; // the card menu's way in: the same run, the same one-start guard
  return (
    <Button type="button" variant="primary" data-start-rabbit-hole data-origin={card?.id || 'root'} aria-busy={busy} onClick={() => run(card?.id || null)}
      title={card ? `Start your own private Rabbit Hole from "${card.title}". This canvas stays as it is.` : 'Start your own private Rabbit Hole from this canvas. This canvas stays as it is.'}>
      {busy ? <Loader2 size={13} className="animate-spin" /> : <ArrowDownToLine size={13} strokeWidth={1.8} />}Start Rabbit Hole
    </Button>
  );
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
function SharedAsk({ token, viewer, context, draft }) {
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
      await streamAsk({ path: askPath(token), body: { message, history }, signal: controller.signal, onEvent: (type, data) => {
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
      <ChatComposer dock value={input} onChange={setInput} onSubmit={send} inputRef={inputRef} busy={busy} onStop={() => flight.current?.abort()} maxLength={4000}
        placeholder={viewer ? 'Ask about this canvas…' : 'Ask about this canvas… (sign in to send)'} />
    </div>
  );
}
