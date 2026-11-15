import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from './api.js';
import { ChatMessage } from './ChatMessages.jsx';
import { CHOICE, startGoal } from './TutorCodebase.jsx';
import { coachingCanvas } from './learn-coaching-client.js';
import { SOMETHING_ELSE, goalOf, useOf } from './learn-codebase-goals.js';
import { INTAKE_TEXT_EVENT, SOON, routeIntakeText } from './codebase-use-route.js';
import { REHEARSAL_POLL_MS } from './learn-rehearsal-view.js';
import { ensureRehearsalCards, openRehearsalCard } from './rehearsal-cards.js';
import { flowMessages, goalForm, intakeOpen, onlyRoute } from './rehearsal-flow.js';
import { catalogueMessage } from './tutor-rehearsal-text.js';
import { TUTOR_LINE_EVENT } from './tutor-lines.js';
import { toast } from './ui.jsx';

// The initial pipeline as the Tutor's own conversation in the Chat transcript (initial-pipeline-spec.md section 1; owner: everything lives inside the AI tutor's chat as Tutor
// messages, no card above it). Dev builds only (VITE_REHEARSAL_TRIGGER=1, ask.jsx mounts it). The messages are built by rehearsal-flow.js from this component's state; they are
// drawn with the existing ChatMessage (the words), the roadmap's pending row (the shimmer) and the Tutor's chip class (TutorCodebase.jsx CHOICE). Nothing here is saved to the thread:
// a reload reads the same state again from GET /api/learn/rehearsal (the catalogue, the rehearsal of a route that was started).
// Under the indexing shimmer it polls GET (learn-rehearsal-get.json) every REHEARSAL_POLL_MS: the first Tutor line already knows whether the repository can run.

const FAILS = 3; // consecutive failed reads of the state before the Tutor says so
let counter = 0;
const line = (role, text) => ({ key: `line-${++counter}`, role, text });
const INITIAL = { get: null, doc: null, docError: false, use: null, goalChosen: false, elsewhere: false, log: [], lines: [], routeId: null, routeTitle: '', run: null, startError: false };

function Pending({ text }) {
  return <span role="status" data-rehearsal-pending className="flex items-center gap-2 pb-1.5 text-xs text-ink-2"><Loader2 size={16} aria-hidden="true" className="animate-spin text-claude" /><span className="shimmer">{text}</span></span>;
}

function Chips({ chips, onPick }) {
  return <div data-rehearsal-chips className="flex flex-wrap gap-1.5 pt-1 pb-1.5">
    {chips.map(chip => <button key={chip.id} type="button" data-rehearsal-chip={chip.id} disabled={!!chip.disabled} onClick={() => onPick(chip.id)} className={CHOICE}>{chip.label}</button>)}
  </div>;
}

// The 14 uses under their five headings: every one shown, the unbuilt ones disabled with "soon" (never hidden). The headings wrap with the chips, so a narrow Chat keeps them readable.
function Intake({ groups, onPick }) {
  return <div data-rehearsal-intake className="flex flex-col gap-1.5 pb-1.5">
    {groups.map(group => <div key={group.group}>
      <p className="pb-1 text-xs text-ink-2">{group.group}</p>
      <div className="flex flex-wrap gap-1.5">
        {group.uses.map(use => <button key={use.id} type="button" data-codebase-use={use.id} disabled={!use.enabled} onClick={() => onPick(`use:${use.id}`)} className={CHOICE}>
          {use.label}{use.note === SOON && <span className="ml-1 text-ink-3">{SOON}</span>}</button>)}
      </div>
    </div>)}
    <div><button type="button" data-codebase-other onClick={() => onPick('else')} className={CHOICE}>{SOMETHING_ELSE}</button></div>
  </div>;
}

// The goal's own clarifying question (the existing goal flow, unchanged): a text field and Start, as the old menu had.
function GoalForm({ goalId, busy, onSubmit }) {
  const [text, setText] = useState('');
  return <form className="flex flex-col gap-1.5 pb-1.5" onSubmit={event => { event.preventDefault(); if (text.trim()) onSubmit(goalId, text.trim()); }}>
    <input data-codebase-question aria-label="Your answer" value={text} maxLength={500} disabled={busy} onChange={event => setText(event.target.value)} className="w-full rounded-lg border border-line px-2 py-1.5 text-sm text-ink" />
    <div className="flex flex-wrap gap-1.5"><button type="submit" data-codebase-start disabled={busy || !text.trim()} className={CHOICE}>{busy ? 'Reading the source' : 'Start'}</button></div>
  </form>;
}

export default function TutorRehearsalFlow({ chat }) {
  const board = chat.board || 'main', canvas = chat.canvas;
  const [info, setInfo] = useState(null), [s, setS] = useState(INITIAL), [busy, setBusy] = useState(false);
  const live = useRef(true), timer = useRef(null), fails = useRef(0), cards = useRef(new Set()), kicked = useRef(false), choose = useRef(null);
  const st = useRef(s), repoRef = useRef(null), route = useRef(null);
  st.current = s;
  const patch = change => setS(old => ({ ...old, ...(typeof change === 'function' ? change(old) : change) }));
  const append = (...lines) => patch(old => ({ log: [...old.log, ...lines] }));
  const repository = info?.key === canvas ? info.repository : null;
  repoRef.current = repository;
  const eligible = coachingCanvas(canvas) && chat.coaching.status === 'ready';

  // The canvas's repository (repo and commit): the same read the codebase goals use. A canvas with a saved codebase activity does not start the pipeline again.
  useEffect(() => {
    live.current = true; setS(INITIAL); route.current = null; cards.current = new Set(); kicked.current = false;
    if (!eligible) return undefined;
    let on = true;
    api(`/api/learn/codebase?app=${encodeURIComponent(canvas)}&board=${encodeURIComponent(board)}`)
      .then(out => { if (on) setInfo({ key: canvas, ...out }); }, () => { if (on) setInfo({ key: canvas, repository: null, activity: null }); });
    return () => { on = false; live.current = false; clearTimeout(timer.current); };
  }, [canvas, eligible]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = !!repository && !info?.activity;

  const url = routeId => `/api/learn/rehearsal?app=${encodeURIComponent(canvas)}&board=${encodeURIComponent(board)}${routeId ? `&routeId=${encodeURIComponent(routeId)}` : ''}`;
  const post = body => api('/api/learn/rehearsal', { method: 'POST', body: JSON.stringify({ app: canvas, board, ...body }) });
  const runOf = (data, previous) => {
    const mine = (data.routes || []).find(r => r.routeId === route.current);
    return { status: mine && mine.status !== 'none' ? mine.status : previous?.status || 'queued', step: mine?.step ?? previous?.step, attempt: previous?.attempt, error: mine?.error, record: data.record || null };
  };

  // The one poll: the catalogue first (its state, then the document), then the chosen route's rehearsal. It stops when it has what it waits for.
  const poll = async () => {
    if (!live.current) return;
    let again = true;
    try {
      const data = await api(url(route.current));
      fails.current = 0;
      if (!live.current) return;
      patch({ get: data });
      if (route.current) {
        const run = runOf(data, st.current.run);
        patch({ run });
        again = !(run.status === 'failed' || (run.status === 'ready' && run.record));
      } else if (data.indexing === 'failed' || data.catalogue?.status === 'failed') again = false;
      // A catalogue still queued under a ready index is started once from here (the same POST is idempotent: the repository import's trigger may already have run it).
      else if (data.catalogue?.status === 'ready' || (data.indexing === 'ready' && !kicked.current)) { kicked.current = true; again = !(await fetchDoc()); }
    } catch {
      if (++fails.current >= FAILS) {
        again = false;
        if (route.current) patch({ run: { status: 'failed', error: '' } }); else patch({ docError: true });
      }
    }
    if (again && live.current) timer.current = setTimeout(poll, REHEARSAL_POLL_MS);
  };
  // POST action catalogue: starts or returns the cached catalogue; the document comes with it when ready. -> whether the document is in.
  const fetchDoc = async () => {
    try {
      const data = await post({ action: 'catalogue' });
      if (!live.current) return true;
      if (data.catalogueDoc) { patch({ doc: data.catalogueDoc, docError: false }); return true; }
      if (data.catalogue?.status === 'failed') { patch({ docError: true }); return true; }
      return false;
    } catch { patch({ docError: true }); return true; }
  };
  useEffect(() => { if (active) poll(); return () => clearTimeout(timer.current); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const retryCatalogue = () => { patch({ docError: false, get: null }); fails.current = 0; clearTimeout(timer.current); fetchDoc().then(done => { if (!done) poll(); }); };

  // The chosen route's rehearsal: POST start, then the same poll with the route.
  const startRoute = async (routeId, title) => {
    route.current = routeId; fails.current = 0; clearTimeout(timer.current);
    patch({ routeId, routeTitle: title || '', run: { status: 'queued' }, startError: false });
    try { const out = await post({ action: 'start', routeId }); if (live.current) patch({ run: { status: out.status || 'queued', step: out.step, attempt: out.attempt, error: out.error, record: out.record || null } }); }
    catch { if (live.current) patch({ startError: true }); return; }
    poll();
  };
  const routeTitleOf = id => (st.current.doc?.routes || []).find(r => r.routeId === id)?.title || '';

  // "Use the codebase": exactly one practical route goes straight on, more than one asks first (the route question).
  const chooseUse = key => {
    const use = useOf(key);
    if (!use?.enabled) return;
    if (key === 'use_codebase') {
      patch({ use: key });
      const only = onlyRoute(st.current.doc);
      if (only) startRoute(only.routeId, only.title);
      return;
    }
    chooseGoal(use.goalId);
  };
  const chooseGoal = goalId => {
    const goal = goalOf(goalId);
    if (!goal) return;
    patch({ use: goalId });
    if (goal.clarify) append(goalForm(goalId)); else submitGoal(goalId, '');
  };
  const submitGoal = async (goalId, text) => {
    setBusy(true);
    const out = await startGoal({ chat, board, repository: repoRef.current, goalId, text });
    setBusy(false);
    if (out.note) append(line('assistant', out.note)); else patch({ goalChosen: true });
  };

  choose.current = chooseUse;
  const pick = id => {
    if (id.startsWith('use:')) chooseUse(id.slice(4));
    else if (id.startsWith('goal:')) chooseGoal(id.slice(5));
    else if (id.startsWith('route:')) { patch({ use: 'use_codebase' }); startRoute(id.slice(6), routeTitleOf(id.slice(6))); }
    else if (id === 'else') patch({ elsewhere: true });
    else if (id === 'retry:catalogue') retryCatalogue();
    else if (id === 'retry:route') startRoute(route.current, routeTitleOf(route.current) || st.current.routeTitle);
    else if (id === 'show:run' || id === 'show:runbook') {
      const record = st.current.run?.record;
      if (record && !openRehearsalCard(chat.canvasOps, id === 'show:run' ? 'run' : 'runbook', record, { app: canvas, board, repositoryApp: repoRef.current?.app, routeTitle: st.current.routeTitle })) toast('This canvas cannot take a new card here.');
    }
  };

  // The cards are made when the record is ready, once for each (repo, commit, routeId), with no button press.
  const record = s.run?.status === 'ready' ? s.run.record : null;
  useEffect(() => {
    if (!record || !active) return;
    const key = `${record.repo}@${record.commit}#${record.routeId || ''}`;
    if (cards.current.has(key)) return;
    cards.current.add(key);
    ensureRehearsalCards(chat.canvasOps, record, { app: canvas, board, repositoryApp: repoRef.current?.app, routeTitle: st.current.routeTitle })
      .then(made => { if (made === null && live.current) toast('This canvas cannot take a new card here.'); });
  }, [record, active]); // eslint-disable-line react-hooks/exhaustive-deps

  // Typed text while the intake question is open (codebase-use-route.js, why this is a reply to the Tutor's question): the scoped router reads it. The send is taken here.
  useEffect(() => {
    const onText = event => {
      const { canvas: where, text } = event.detail || {};
      const cm = st.current.doc ? catalogueMessage(st.current.doc) : null;
      if (where !== canvas || !intakeOpen(st.current, cm)) return;
      event.preventDefault();
      append(line('user', text));
      routeIntakeText({ post: body => api('/api/learn/chat/route', { method: 'POST', body: JSON.stringify(body) }), app: canvas, text }).then(reply => {
        if (!live.current) return;
        if (reply.kind === 'use') choose.current(reply.use); else append(line('assistant', reply.text));
      });
    };
    window.addEventListener(INTAKE_TEXT_EVENT, onText);
    return () => window.removeEventListener(INTAKE_TEXT_EVENT, onText);
  }, [canvas]); // eslint-disable-line react-hooks/exhaustive-deps

  // A line another part of the page says as the Tutor (the Run card: tutor-lines.js): taken here, shown after everything else.
  useEffect(() => {
    const onLine = event => {
      if (event.detail?.canvas !== canvas) return;
      event.preventDefault();
      patch(old => ({ lines: [...old.lines, line('assistant', event.detail.text)] }));
    };
    window.addEventListener(TUTOR_LINE_EVENT, onLine);
    return () => window.removeEventListener(TUTOR_LINE_EVENT, onLine);
  }, [canvas]); // eslint-disable-line react-hooks/exhaustive-deps

  const messages = [...(active ? flowMessages(s, { repo: repository.repo }) : []), ...s.lines];
  if (!messages.length) return null;
  return <div data-rehearsal-flow className="flex flex-col">
    {messages.map(m => {
      const said = { role: m.role, content: m.text ?? '', status: 'done', clientId: m.key };
      return <div key={m.key} data-rehearsal-message={m.key}>
        {m.text !== undefined && <ChatMessage m={said} i={0} msgs={[said]} learnChat busy={false} setMsgs={() => {}} setFilePeek={() => {}} setRunPeek={() => {}} />}
        {m.pending && <Pending text={m.pending} />}
        {m.groups && <Intake groups={m.groups} onPick={pick} />}
        {m.form && <GoalForm goalId={m.form.goalId} busy={busy} onSubmit={submitGoal} />}
        {m.chips?.length > 0 && <Chips chips={m.chips} onPick={pick} />}
        {m.actions?.length > 0 && <Chips chips={m.actions} onPick={pick} />}
      </div>;
    })}
  </div>;
}
