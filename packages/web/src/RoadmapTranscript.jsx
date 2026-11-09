import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ChatMessage } from './ChatMessages.jsx';
import RoadmapPlan from './RoadmapPlan.jsx';
import { PRIMARY, SECONDARY } from './RoadmapInvitation.jsx';
import { Button } from './ui.jsx';
import { useStepExcerpt } from './SourceRefChip.jsx';
import { STRINGS } from './roadmap-strings.js';
import { chatOf, invitationOf } from './roadmap-client.js';
import { newThreadId, saveMessage, saveTutorEntry } from './chat-persist.js';
import { ensureTutorThread, entriesOf, invitationThreadId, occupied, outcomeOf, roadmapEditTarget, roadmapInvitationOf, roadmapThreadClientId, routeClientId, routeFromSaved, toSave } from './roadmap-transcript.js';

// The Tutor inside the real Chat transcript (BRIEF contract 6; checklist UI.01, UI.03, UI.08). Every Tutor entry is an ordinary saved Chat
// message in its bound thread (entriesOf + saveTutorEntry), drawn by the existing ChatMessage with the roadmap's own controls under it:
// - stored entries already in the thread render in place (TutorMessage, from ChatMessages), resolved against the live state; one with no
//   live counterpart is history, its actions disabled;
// - live entries not yet in the thread's restored messages render after them (RoadmapTranscript), and are saved;
// - an invitation is routed once: an occupied Chat (messages or an unsent draft) first asks Start new chat / Stay here (UI.01).
// roadmap: useRoadmap; chat: the Chat workspace; msgs: the open thread's messages.
const LEGACY = canvas => `rh.roadmap.thread.${canvas}`; // Fix B's per-browser binding: read once to record it on the roadmap, never written again
const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode: this tab still routes once (refs) */ } };
const readJson = key => { try { return JSON.parse(read(key) || 'null'); } catch { return null; } };
const SESSION = { get: key => { try { return sessionStorage.getItem(key); } catch { return null; } }, set: (key, value) => { try { sessionStorage.setItem(key, value); } catch { /* private mode */ } } };
// Where an invitation's entries live: its route record (the occupied thread and the choice made there) and the thread its invitation went to.
const ROUTE = id => `rh.roadmap.route.${id}`, IV_THREAD = id => `rh.roadmap.ivthread.${id}`;
const ATTR = { explain_on_canvas: 'data-roadmap-explain', keep_here: 'data-roadmap-keep', accept: 'data-roadmap-accept', cancel: 'data-roadmap-cancel', accept_roadmap: 'data-roadmap-accept-plan',
  edit_roadmap: 'data-roadmap-edit-plan', end: 'data-roadmap-end', propose_next: 'data-roadmap-propose-next', open_toc: 'data-roadmap-review', edit_card: 'data-roadmap-edit', route_new: 'data-roadmap-route-new',
  route_stay: 'data-roadmap-route-stay', go_card: 'data-roadmap-go-card', go_text: 'data-roadmap-go-text', answer: 'data-roadmap-option', recover: 'data-roadmap-recover' };
// The approved green affirmative (file 02/03) on the existing success token; everything else the roadmap's existing secondary button.
const GREEN = 'h-8 rounded-md border border-success/40 bg-success/15 px-3 text-xs font-medium text-ink outline-none hover:bg-success/25 focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-default disabled:opacity-45';
const SECOND = `${SECONDARY} disabled:cursor-default disabled:opacity-45`;
// Cancel is the plain text control after the buttons (owner 2026-11-07: Generate/Accept, Edit, then Cancel as text with a hover fill).
const TEXT = 'h-8 rounded-md px-3 text-xs text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-default disabled:opacity-45';

// The live context entriesOf needs: the shown invitation (or the one this route record names), its route and the second-source boundary.
function contextOf(roadmap) {
  const iv = roadmap.invitation ?? invitationOf(roadmap.state);
  return { invitation: iv, route: iv ? (() => { const r = readJson(ROUTE(iv.id)); return r ? { invitationId: iv.id, ...r } : null; })() : null, boundary: roadmap.state.boundary };
}
const useEntries = (roadmap, tick = 0) => useMemo(() => entriesOf(roadmap.state, contextOf(roadmap)), [roadmap.state, roadmap.invitation, tick]); // eslint-disable-line react-hooks/exhaustive-deps

// The thread an entry belongs to (never simply the visible one): the route's occupied thread, the invitation's thread, else the roadmap's bound one.
function targetOf(entry, { bound, threadId, route }) {
  if (entry.kind === 'route') return route?.threadId || null;
  if (entry.kind === 'invitation') return read(IV_THREAD(entry.tutor.invitationId));
  if (entry.kind === 'boundary') return bound || threadId || null;
  return bound;
}

// One entry: the existing ChatMessage for its words (or its waiting row while generating), the draft containers, an activity spinner, actions.
export function EntryView({ entry, live, run, app = null, busy = false, invitation = null, acceptedPlanVersion = null }) {
  // UI.04 / roadmap 3.8: the same exact passage the canvas slot shows (SourceRefChip useStepExcerpt); a step with no reference shows none, an unreadable
  // one says so, and no quote is ever invented.
  const found = useStepExcerpt(live ? entry.sourceRef : null, app);
  const draftIntro = entry.draft ? entry.content.split('\n\n')[0] : null;
  const m = entry.activity && entry.kind === 'draft'
    ? { role: 'assistant', content: '', status: entry.activity, clientId: entry.clientId, meta: { roadmap: entry.clientId } }
    : { role: 'assistant', content: draftIntro ?? entry.content, status: 'done', clientId: entry.clientId, meta: { roadmap: entry.clientId } };
  // The invitation message while its roadmap is made (or once made): one Generating roadmap shimmer where the buttons were, then no buttons.
  const resolved = entry.kind === 'invitation' && !!invitation && invitation.invitationId === entry.tutor?.invitationId; // its roadmap exists
  const generating = entry.kind === 'invitation' && (entry.creating === true || (resolved && invitation.first));
  // A decided or stored entry keeps no button (a dead, greyed control reads as broken and hides what happened): history shows a one-line outcome instead.
  const decided = !live || (entry.kind === 'invitation' && (entry.creating === true || resolved)) || (entry.kind === 'route' && !!entry.tutor?.choice);
  const actions = decided ? [] : entry.actions;
  const outcome = outcomeOf(entry, { live, acceptedPlanVersion });
  if (entry.kind === 'draft' && entry.activity && invitation?.first) return null; // the invitation's shimmer stands for this draft until it arrives
  return (
    <div data-roadmap-item={entry.clientId} data-roadmap-kind={entry.kind} data-roadmap-stale={live ? undefined : ''} {...(entry.kind === 'invitation' ? { 'data-roadmap-invitation': entry.tutor.invitationId } : {})}>
      <ChatMessage m={m} i={0} msgs={[m]} learnChat busy={false} setMsgs={() => {}} setFilePeek={() => {}} setRunPeek={() => {}} />
      {found.state === 'ready' && found.text && <blockquote data-roadmap-excerpt className="mb-1.5 max-h-24 overflow-auto border-l-2 border-accent/40 pl-2 text-xs break-words text-ink-2">{found.text}</blockquote>}
      {found.state === 'unavailable' && <p data-roadmap-excerpt-unavailable className="mb-1.5 text-xs text-ink-3">{STRINGS.excerptUnavailable}</p>}
      {entry.draft && <RoadmapPlan draft={entry.draft} disabled={!live || busy} onDepth={depth => run({ kind: 'depth', depth })} />}
      {live && entry.activity && entry.kind !== 'draft' && <span role="status" className="flex items-center gap-2 pb-1.5 text-xs text-ink-2"><Loader2 size={16} aria-hidden="true" className="animate-spin text-claude" /><span className="shimmer">{entry.activity}</span></span>}
      {generating && <span role="status" data-roadmap-generating className="flex items-center gap-2 pb-1.5 text-xs text-ink-2"><Loader2 size={16} aria-hidden="true" className="animate-spin text-claude" /><span className="shimmer">{STRINGS.generatingRoadmap}</span></span>}
      {outcome && <p data-roadmap-outcome className="pb-1.5 text-xs text-ink-2">{outcome}</p>}
      {actions.length > 0 && (
        <div data-roadmap-actions className={entry.draft ? 'flex flex-wrap gap-2 pt-3 pb-1.5' : 'flex flex-wrap gap-1.5 pt-1 pb-1.5'}>
          {actions.map(action => {
            const attr = ATTR[action.id], marks = attr ? { [attr]: action.key || true } : {}, off = !live || !!action.disabled;
            if (action.blue) return <Button key={action.id} type="button" variant="primary" size="sm" {...marks} disabled={off} onClick={() => run(action.run)}>{action.label}</Button>;
            return <button key={action.key || action.id} type="button" {...marks} disabled={off} onClick={() => run(action.run)} className={action.id === 'cancel' ? TEXT : action.green ? GREEN : action.primary && action.id === 'explain_on_canvas' ? PRIMARY : SECOND}>{action.label}</button>;
          })}
        </div>
      )}
    </div>
  );
}

// The actions every entry dispatches: the shared controller's (BRIEF contract 2), the Chat workspace's edit target and panel tabs, navigation.
function runner(roadmap, chat, choose) {
  const c = roadmap.controller;
  return r => {
    switch (r.kind) {
      case 'route_new': return choose('new');
      case 'route_stay': return choose('stay');
      case 'explain_on_canvas': return c.explain({ depth: chat.settings?.depth || 'standard', instruction: '' });
      case 'keep_here': return c.dismiss();
      case 'accept_roadmap': return roadmap.acceptPlan();
      case 'depth': return c.revise({ settings: { depth: r.depth } });
      case 'edit_roadmap': {
        const rm = roadmap.state.view?.roadmap;
        if (!rm) return null;
        chat.editing?.set(roadmapEditTarget({ roadmapId: rm.id, planVersion: r.planVersion ?? rm.planVersion, threadId: chat.thread.id, canvas: chat.canvas, draft: chat.composer.draft }));
        chat.composer.setText(''); chat.composer.setCommand(null); chat.composer.focus();
        return null;
      }
      case 'open_toc': chat.panels.setTab('toc'); chat.panels.setOpen(true); return null; // navigation only, on this click
      case 'propose_next': return c.proposeNext();
      case 'recover': return c.recoverOffer({ choice: r.choice });
      case 'end': return c.end();
      case 'accept': return c.acceptProposal();
      case 'cancel': return c.cancelProposal();
      case 'edit_card': return c.openEditor();
      case 'go_card': return roadmap.go(r.cardId ? { kind: 'card', cardId: r.cardId } : { kind: 'proposal' });
      case 'go_text': return roadmap.go({ kind: 'source' });
      case 'answer': return c.answer({ optionId: r.optionId });
      case 'part': return c.explainPart(r.choice);
      default: return null;
    }
  };
}

// A saved Tutor message in the transcript (ChatMessages renderTutor): drawn with its live entry when that is still current, else as history.
export function TutorMessage({ m, roadmap, chat }) {
  const entries = useEntries(roadmap);
  const live = entries.find(e => e.clientId === m.clientId) || null;
  const entry = live || { clientId: m.clientId, kind: m.meta.tutor.kind, content: m.content, tutor: m.meta.tutor, actions: [] };
  return <EntryView entry={entry} live={!!live} app={chat.canvas} run={runner(roadmap, chat, () => {})} busy={roadmap.state.view?.revisionPending === true} invitation={roadmapInvitationOf(roadmap.state)} acceptedPlanVersion={roadmap.state.view?.roadmap?.acceptedPlanVersion ?? null} />;
}

export default function RoadmapTranscript({ roadmap, chat, msgs }) {
  const c = roadmap.controller, thread = chat.thread, iv = roadmap.invitation ?? null;
  const [tick, setTick] = useState(0), saved = useRef(new Map()), routing = useRef(new Set()), attempted = useRef(null), lastBound = useRef(null);
  const entries = useEntries(roadmap, tick);
  const rm = roadmap.state.view?.roadmap ?? null, bound = rm?.threadId ?? null;
  const route = iv ? readJson(ROUTE(iv.id)) : null;
  const where = { bound: bound || (rm?.invitationId ? read(IV_THREAD(rm.invitationId)) : null), threadId: thread.id, route };

  // UI.01: route a new invitation once. Chat opens once for the drop (never again on a poll; focus and draft stay). An occupied Chat (its
  // messages, a nonempty unsent draft, or a conversation not yet loaded) is asked Start new chat / Stay here first, in that thread; an unsaved
  // new chat with a draft is saved first under its own thread id (adopt carries the draft to it), so nothing is lost when switching.
  useEffect(() => {
    if (!iv || thread.status === 'loading' || routing.current.has(iv.id) || read(ROUTE(iv.id)) || read(IV_THREAD(iv.id))) return;
    // A saved route message in this thread with no record in this browser (a reload elsewhere): rebuild the record, never route a second time.
    const revived = routeFromSaved(msgs, iv.id, thread.id);
    if (revived) { write(ROUTE(iv.id), JSON.stringify(revived)); if (revived.choice === 'stay') write(IV_THREAD(iv.id), revived.threadId); setTick(n => n + 1); return; }
    routing.current.add(iv.id);
    chat.panels.openChat();
    const entry = entriesOf(roadmap.state, { invitation: iv, route: { invitationId: iv.id } })[0];
    (async () => {
      if (occupied({ status: thread.status, messages: msgs, draft: chat.composer.draft })) {
        const threadId = thread.id || newThreadId();
        write(ROUTE(iv.id), JSON.stringify({ threadId }));
        await saveTutorEntry({ app: chat.canvas, threadId, clientId: routeClientId(iv.id), content: entry.content, tutor: entry.tutor, title: iv.title });
        saved.current.set(entry.clientId, `${entry.seq}|${entry.content}`);
        if (!thread.id) thread.adopt(threadId, iv.title);
      } else {
        const threadId = await invitationThreadId(iv.id);
        write(IV_THREAD(iv.id), threadId);
        const inv = entriesOf(roadmap.state, { invitation: iv })[0];
        await saveTutorEntry({ app: chat.canvas, threadId, clientId: inv.clientId, content: inv.content, tutor: inv.tutor, title: iv.title });
        saved.current.set(inv.clientId, `${inv.seq}|${inv.content}`);
        await thread.open(threadId);
      }
    })().catch(() => {}).finally(() => setTick(n => n + 1)); // a failed save leaves the entry live in the open thread; the sync below retries it
  }, [iv?.id, thread.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start new chat / Stay here: one guarded choice per invitation (a double click or a second tab reads the stored choice and does nothing).
  const choosing = useRef(false);
  const choose = async choice => {
    const held = iv && readJson(ROUTE(iv.id));
    if (!held || held.choice || choosing.current) return;
    choosing.current = true;
    try {
      if (choice === 'new') {
        const threadId = await invitationThreadId(iv.id);
        write(ROUTE(iv.id), JSON.stringify({ ...held, choice })); write(IV_THREAD(iv.id), threadId);
        const inv = entriesOf(roadmap.state, { invitation: iv, route: { invitationId: iv.id, ...held, choice } }).find(e => e.kind === 'invitation');
        await saveTutorEntry({ app: chat.canvas, threadId, clientId: inv.clientId, content: inv.content, tutor: inv.tutor, title: iv.title });
        saved.current.set(inv.clientId, `${inv.seq}|${inv.content}`);
        await thread.open(threadId); // open() saves the previous thread's draft first: the old conversation and its draft stay as they were
      } else { write(ROUTE(iv.id), JSON.stringify({ ...held, choice })); write(IV_THREAD(iv.id), held.threadId); }
    } finally { choosing.current = false; setTick(n => n + 1); }
  };

  // Durable entries (BRIEF contract 6): save each changed entry to ITS thread (bound, routed, or the invitation's), whichever thread is open.
  useEffect(() => {
    for (const entry of toSave(entries, saved.current)) {
      const threadId = targetOf(entry, where);
      if (!threadId || (entry.kind === 'route' && !route)) continue;
      const mark = `${entry.seq}|${entry.content}`;
      saved.current.set(entry.clientId, mark);
      saveTutorEntry({ app: chat.canvas, threadId, clientId: entry.clientId, content: entry.content, tutor: entry.tutor })
        .catch(() => { if (saved.current.get(entry.clientId) === mark) saved.current.delete(entry.clientId); });
    }
  }, [entries, bound, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // The roadmap's one Tutor thread is kept on the server (view.roadmap.threadId). With none bound one device records it silently: the thread its
  // invitation went to, else the invitation's derived thread, else at most one fresh thread per session. It never opens a thread.
  if (bound) lastBound.current = bound;
  useEffect(() => {
    if (!rm || bound || thread.status !== 'ready') return;
    const attempt = `${rm.id}:${lastBound.current || 'none'}`;
    if (attempted.current === attempt) return;
    attempted.current = attempt;
    const text = STRINGS.invite(rm.scope?.source?.name || '');
    const legacy = lastBound.current ? null : (rm.invitationId && read(IV_THREAD(rm.invitationId))) || read(LEGACY(chat.canvas));
    ensureTutorThread(rm, { legacy, openId: thread.id, msgs }, {
      session: SESSION, newId: newThreadId, bindThread: c.bindThread,
      saveFresh: threadId => saveMessage({ threadId, app: chat.canvas, client_id: roadmapThreadClientId(rm.id), role: 'assistant', content: text, mode: thread.mode, title: text }),
    }).catch(() => {}); // a failed save or bind keeps the lines in the open thread
  }, [rm?.id, bound, thread.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live entries not yet in this thread's restored messages, shown only in their own thread (or the open one while none is known).
  const have = new Set(msgs.map(m => m.clientId).filter(Boolean));
  const run = runner(roadmap, chat, choose);
  const shown = entries.filter(e => !have.has(e.clientId) && (() => { const t = targetOf(e, where); return !t || !thread.id || t === thread.id; })());
  const notes = chatOf(roadmap.state).filter(line => line.kind === 'notice' || line.kind === 'coverage'); // transient, never saved
  if (!shown.length && !notes.length) return null;
  return (
    <div data-roadmap-chat>
      {notes.map(line => {
        const m = { role: 'assistant', content: line.kind === 'coverage' && line.notes?.length ? `${line.text}\n\n${line.notes.join('\n\n')}` : line.text, status: 'done', meta: { roadmap: line.id } };
        return <div key={line.id} data-roadmap-item={line.id}><ChatMessage m={m} i={0} msgs={[m]} learnChat busy={false} setMsgs={() => {}} setFilePeek={() => {}} setRunPeek={() => {}} />
          {line.kind === 'coverage' && <div className="flex flex-wrap gap-1.5 pb-1.5">{line.choices.map(choice => <button key={`${choice.locationId}:${choice.part}`} type="button" data-roadmap-choice={`${choice.locationId}:${choice.part}`} onClick={() => run({ kind: 'part', choice })} className={SECOND}>{choice.label}</button>)}</div>}</div>;
      })}
      {shown.map(entry => <EntryView key={entry.clientId} entry={entry} live app={chat.canvas} run={run} busy={roadmap.state.view?.revisionPending === true} invitation={roadmapInvitationOf(roadmap.state)} acceptedPlanVersion={roadmap.state.view?.roadmap?.acceptedPlanVersion ?? null} />)}
    </div>
  );
}
