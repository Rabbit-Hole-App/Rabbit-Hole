import { useEffect, useRef, useState } from 'react';
import { FolderGit2, Lock, Plus, X } from 'lucide-react';
import ChatComposer from './ChatComposer.jsx';
import { ChatMessages } from './ChatMessages.jsx';
import { MaterialIcon } from './ask.jsx';
import { Button } from './ui.jsx';
import { streamAsk } from './agent/ask-stream.js';
import { GUEST, adoptGuestChat, askHistory, askPath, loadChat, readGuestAllowance, saveChat, sendKey, signInForAsk } from './shared-ask.js';

// The shared canvas's Chat (SHARE-03, owner brief 2026-10-22 section 5; C:/s/spec/share/contract-guest-chat.md): the normal
// right-panel Chat's transcript (ChatMessages) and composer (ChatComposer), answering about this canvas only through its link
// (POST askPath). Signed out it is guest Chat: the server's one 10-message trial for this browser, shown unobtrusively under
// the composer; after the last one the next draft stays and "Sign in to continue" keeps the draft, the attached card and the
// conversation through sign-in (signInForAsk, adoptGuestChat). Nothing is ever sent by itself: only the composer's own submit
// calls send. The conversation is this viewer's alone, kept in this tab (sessionStorage), never the owner's and never in a fork.
// No +, attachments, model picker or / commands: every message is a question about the canvas (the server dispatches none).
// target: the card selected or attached by Ask in Chat, Explain in Chat or Ask about selection (one pill; only its id is sent).
// onAllowance(remaining): the guest messages left, for canvas-permissions' ctx.guestChat (S1); null signed in.
export default function SharedChat({ token, viewer, context = null, draft = null, target = null, onClearTarget = null, onAllowance = null }) {
  const who = viewer || GUEST;
  const [input, setInput] = useState(draft || '');
  const [turns, setTurns] = useState(() => { adoptGuestChat(token, viewer); return loadChat(token, who); });
  const [busy, setBusy] = useState(false);
  const [allowance, setAllowance] = useState(null); // guest only: { limit, used, remaining }
  const inputRef = useRef(null), flight = useRef(null);
  useEffect(() => { if (draft) inputRef.current?.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!busy) saveChat(token, who, turns); }, [turns, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  const learned = next => { setAllowance(next); onAllowance?.(next ? next.remaining : null); };
  useEffect(() => { if (!viewer) readGuestAllowance(token).then(learned); else onAllowance?.(null); }, [token, viewer]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ask in Chat / Explain in Chat put their words in the composer and focus it (agent/scope.js askDraft); they never send.
  useEffect(() => {
    const prefill = event => { const text = event.detail?.text; if (text) setInput(current => (current.trim() ? current : text)); inputRef.current?.focus(); };
    window.addEventListener('small:ask-focus', prefill);
    return () => window.removeEventListener('small:ask-focus', prefill);
  }, []);
  const spent = !viewer && allowance?.remaining === 0;
  const toSignIn = text => { window.location.href = signInForAsk(token, text, undefined, window.location.pathname, target); };
  const last = patch => setTurns(all => all.map((turn, i) => (i === all.length - 1 ? { ...turn, ...(typeof patch === 'function' ? patch(turn) : patch) } : turn)));
  const send = async raw => {
    const message = raw.trim();
    if (!message || busy) return;
    if (spent) return toSignIn(raw); // the trial is used: Send is "Sign in to continue", the draft kept, nothing sent
    // Sending the same question again right after it failed is a retry of that Send: the same request id, never a second count.
    const failed = turns.at(-1)?.error && turns.at(-2)?.content === message ? turns.at(-2).key : null;
    const history = askHistory(turns), key = failed || sendKey();
    setInput(''); setBusy(true);
    setTurns(all => [...all, { role: 'user', content: message, key }, { role: 'assistant', content: '', pending: true }]);
    const controller = new AbortController();
    flight.current = controller;
    let signIn = false, refusedGuest = null, limited = false, heard = false;
    const onEvent = (type, data) => {
      heard = true;
      if (type === 'chunk') last(turn => ({ content: turn.content + data.text }));
      else if (type === 'progress') last({ status: data.stage });
      else if (type === 'error' && data.code === 'guest_limit') refusedGuest = data.guest || { limit: 10, used: 10, remaining: 0 };
      else if (type === 'error' && data.signIn) signIn = true;
      else if (type === 'error') { limited = !!data.limited; last({ error: data.error }); }
      else if (type === 'done') { if (data.notice) last({ notice: data.notice }); if (data.guest) learned(data.guest); }
    };
    const ask = () => streamAsk({ path: askPath(token), body: { message, history, ...(target ? { selected: target.id } : {}) }, signal: controller.signal, headers: { 'X-RH-Action-Key': key }, onEvent });
    try {
      // A transport failure before anything came back is retried once with the same request id: the server counts it once.
      try { await ask(); } catch (error) { if (error.name === 'AbortError' || heard) throw error; await ask(); }
    } catch (error) {
      last({ error: error.name === 'AbortError' ? 'Stopped.' : error.message });
    } finally {
      flight.current = null;
      last(turn => ({ pending: false, ...(turn.content || turn.error ? {} : { error: 'No answer came back. Try again.' }) }));
      setBusy(false);
    }
    // Refused before any model call (the trial is used, or the session ended): the question goes back into the composer.
    if (refusedGuest || signIn) { setTurns(all => all.slice(0, -2)); setInput(current => current || raw); }
    if (refusedGuest) learned(refusedGuest);
    if (signIn && viewer) toSignIn(raw);
    // Over a link limit (429): the limit shows in the conversation and the question goes back, unless a new one is being typed.
    if (limited) setInput(current => current || raw);
  };
  // ChatMessages' shapes: a failure is its error row, a pending answer its waiting line.
  const msgs = turns.map(turn => (turn.role === 'user' ? { role: 'user', content: turn.content }
    : turn.error ? { role: 'assistant', content: `✗ ${turn.error}` }
    : { role: 'assistant', content: turn.content && turn.notice ? `${turn.content}\n\n_${turn.notice}_` : turn.content, stage: turn.status, status: turn.pending ? 'streaming' : 'done' }));
  const sources = context?.sources || [], repository = context?.repository;
  return (
    <div data-shared-ask role="tabpanel" aria-label="Chat" className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex h-8 shrink-0 items-center gap-0.5">
        <h2 className="mr-auto min-w-0 flex-1 truncate text-sm font-semibold text-ink">Chat</h2>
        <button type="button" data-chat-new aria-label="New chat" title="New chat" disabled={busy} onClick={() => setTurns([])}
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 text-sm text-ink-2 hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-50"><Plus size={16} strokeWidth={1.8} aria-hidden />New chat</button>
      </div>
      <p className="mb-2 flex shrink-0 items-center gap-1 text-xs text-ink-3"><Lock size={11} aria-hidden />Only you see this chat.</p>
      <div data-shared-chat className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <ChatMessages msgs={msgs} busy={busy} learnChat setMsgs={() => {}} setInput={setInput} inputRef={inputRef} setFilePeek={() => {}} setRunPeek={() => {}} />
      </div>
      {(repository || sources.length > 0) && (
        <div data-shared-context className="mt-2 flex shrink-0 flex-wrap gap-1.5">
          {repository && <span data-context-pill="repository" title={`${repository.repo} at ${repository.commit}`} className="inline-flex max-w-[260px] items-center gap-1.5 rounded-md border border-green-600/45 bg-green-50 px-2 py-1 text-xs text-green-800">
            <FolderGit2 size={12} className="shrink-0" /><span className="truncate">{repository.repo} · {repository.commit.slice(0, 7)}</span></span>}
          {sources.slice(0, 4).map(source => <span key={`${source.kind}:${source.id || source.title}`} data-context-pill={source.kind} title={source.title} className="inline-flex max-w-[200px] items-center rounded-md border border-line bg-hover px-2 py-1 text-xs text-ink-2"><span className="truncate">{source.title}</span></span>)}
          {sources.length > 4 && <span data-context-pill="more" title={sources.slice(4).map(source => source.title).join('\n')} className="inline-flex items-center rounded-md border border-line px-2 py-1 text-xs text-ink-3">+{sources.length - 4} more</span>}
        </div>
      )}
      {target && <div data-canvas-target data-selected-card={target.id} title={`${target.kind}: ${String(target.title ?? '')}`} className="mt-2 inline-flex max-w-full shrink-0 self-start items-center gap-1.5 rounded-full border border-line bg-hover py-1 pr-1.5 pl-2.5 text-xs text-ink-2">
        <MaterialIcon type={target.context?.material_type} />
        <span className="max-w-[260px] truncate">{String(target.title ?? '').replace(/\$([^$]*)\$/g, '$1')}</span>
        <button type="button" aria-label="Remove selected card context" title="Remove selected card context" onClick={onClearTarget} className="shrink-0 rounded-full p-0.5 hover:bg-active hover:text-ink"><X size={12} /></button>
      </div>}
      <div className="mt-2 shrink-0">
        <ChatComposer multiline value={input} onChange={setInput} onSubmit={send} inputRef={inputRef} busy={busy} onStop={() => flight.current?.abort()} maxLength={4000} placeholder="Ask about this canvas" />
      </div>
      {spent ? (
        <div data-guest-spent role="status" className="mt-2 flex shrink-0 flex-wrap items-center gap-2 text-xs text-ink-2">
          <span className="mr-auto">You have used your {allowance.limit} free messages. Your draft is kept.</span>
          <Button type="button" variant="primary" size="sm" data-guest-sign-in onClick={() => toSignIn(input)}>Sign in to continue</Button>
        </div>
      ) : !viewer && allowance && (
        <p data-guest-remaining className="mt-1.5 shrink-0 text-xs text-ink-3">{allowance.remaining} of {allowance.limit} free messages left</p>
      )}
    </div>
  );
}
