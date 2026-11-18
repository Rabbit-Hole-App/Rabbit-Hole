import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from './api.js';
import { ChatMessage } from './ChatMessages.jsx';
import { CHOICE, codebasePost, startGoal } from './TutorCodebase.jsx';
import { coachingCanvas } from './learn-coaching-client.js';
import { goalOf, useOf } from './learn-codebase-goals.js';
import { CODEBASE_OPTIONS_EVENT, INTAKE_TEXT_EVENT, routeIntakeText, routeLearnText } from './codebase-use-route.js';
import { REHEARSAL_POLL_MS } from './learn-rehearsal-view.js';
import { ensureRehearsalCards, openRehearsalCard } from './rehearsal-cards.js';
import { firstSourceFile } from './study-work.js';
import { flowMessages, goalForm, intakeOpen, learnOpen, onlyRoute } from './rehearsal-flow.js';
import { fitReply, learnOf, learnReply } from './learn-intake.js';
import { chapterCount, cleanOps, planRows, planTree, sectionEntries, storedLearn } from './learn-plan.js';
import { SENTENCES, catalogueMessage, internal } from './tutor-rehearsal-text.js';
import { depthOf } from './learn-settings.js';
import { TUTOR_LINE_EVENT } from './tutor-lines.js';
import ChoiceList from './ChoiceList.jsx';
import { toast } from './ui.jsx';
import { performItem, placeChapter } from './learn-section-perform.js';
import { briefAndCompose, compositionForMake, stallDump, withinTime } from './learn-section-load.js';
import { SPACING_SCALES } from './learn-position.js';
import { LEARN_HIGHLIGHT_EVENT } from './learn-wiki-highlights.js';

// The initial pipeline as the Tutor's own conversation in the Chat transcript (initial-pipeline-spec.md section 1; owner: everything lives inside the AI tutor's chat as Tutor
// messages, no card above it). Dev builds only (VITE_REHEARSAL_TRIGGER=1, ask.jsx mounts it). The messages are built by rehearsal-flow.js from this component's state; they are
// drawn with the existing ChatMessage (the words), the roadmap's pending row (the shimmer) and the Tutor's chip class (TutorCodebase.jsx CHOICE). Nothing here is saved to the thread:
// a reload reads the same state again from GET /api/learn/rehearsal (the catalogue, the rehearsal of a route that was started).
// Under the indexing shimmer it polls GET (learn-rehearsal-get.json) every REHEARSAL_POLL_MS: the first Tutor line already knows whether the repository can run.

const FAILS = 3; // consecutive failed reads of the state before the Tutor says so
let counter = 0;
const line = (role, text) => ({ key: `line-${++counter}`, role, text });
const INITIAL = { intakeDone: false, get: null, doc: null, docError: false, use: null, mode: null, learn: null, learnIntro: null, depthAsk: false, plan: null, planLog: [], section: null, focus: null, goalChosen: false, elsewhere: false, log: [], lines: [], routeId: null, routeTitle: '', run: null, startError: false };

function Pending({ text }) {
  return <span role="status" data-rehearsal-pending className="flex items-center gap-2 pb-1.5 text-xs text-ink-2"><Loader2 size={16} aria-hidden="true" className="animate-spin text-claude" /><span className="shimmer">{text}</span></span>;
}

function Chips({ chips, onPick }) {
  return <div data-rehearsal-chips className="flex flex-wrap gap-1.5 pt-1 pb-1.5">
    {chips.map(chip => <button key={chip.id} type="button" data-rehearsal-chip={chip.id} disabled={!!chip.disabled} onClick={() => onPick(chip.id)} className={CHOICE}>{chip.label}</button>)}
  </div>;
}

// Asked once: once a canvas's intake has been answered (a use chosen, or something else), a reload does not ask again. This device's memory, per canvas.
const intakeKey = canvas => `rh-intake-done:${canvas}`;
export const intakeDone = canvas => { try { return localStorage.getItem(intakeKey(canvas)) === '1'; } catch { return false; } };
export const forgetIntake = canvas => { try { localStorage.removeItem(intakeKey(canvas)); } catch { /* nothing to forget */ } };
export const rememberIntake = canvas => { try { localStorage.setItem(intakeKey(canvas), '1'); } catch { /* storage off: it is asked again next visit */ } };

// The goal's own clarifying question (the existing goal flow, unchanged): a text field and Start, as the old menu had.
function GoalForm({ goalId, busy, onSubmit }) {
  const [text, setText] = useState('');
  return <form className="flex flex-col gap-1.5 pb-1.5" onSubmit={event => { event.preventDefault(); if (text.trim()) onSubmit(goalId, text.trim()); }}>
    <input data-codebase-question aria-label="Your answer" value={text} maxLength={500} disabled={busy} onChange={event => setText(event.target.value)} className="w-full rounded-lg border border-line px-2 py-1.5 text-sm text-ink" />
    <div className="flex flex-wrap gap-1.5"><button type="submit" data-codebase-start disabled={busy || !text.trim()} className={CHOICE}>{busy ? 'Reading the source' : 'Start'}</button></div>
  </form>;
}

// Learn sections (docs/features/learn-sections, dev build): the current section's beats and items for the owner's read, under a disclosure (the Source details pattern, TutorCodebase.jsx).
function SectionDetails({ section }) {
  const beats = section.brief?.beats || [], items = section.composition?.items || [];
  if (!beats.length && !items.length) return null;
  return <details data-learn-section-dev={section.id} className="min-w-0 pb-1.5 text-xs text-ink-2">
    <summary className="cursor-pointer font-medium text-ink">Section {section.id}: {beats.length} beats, {items.length} items</summary>
    <ol className="mt-1.5 flex flex-col gap-1 break-words">{beats.map(beat => <li key={beat.id}><span className="font-mono">{beat.id}</span> {beat.idea} · {beat.shows}{beat.background ? ' · background' : ''}{beat.anchors?.length ? ` · ${beat.anchors.join(', ')}` : ''}{beat.material ? ` · ${beat.material.kind}: ${beat.material.query}` : ''}</li>)}</ol>
    <ol className="mt-1.5 flex flex-col gap-1 break-words">{items.map(item => <li key={item.id}><span className="font-mono">{item.id} /{item.command}</span> {item.beatId} · {item.request}{item.source ? ` · ${item.source}` : ''}{item.content ? ` · ${item.content}` : ''}{item.after ? ` · after ${item.after}` : ''}</li>)}</ol>
  </details>;
}
// The first section of an accepted plan: sections are numbered n.m in the plan's order (BLOCKERS.md, decision taken alone); later ones come back from learn_section_next.
export const FIRST_SECTION = '1.1';

export default function TutorRehearsalFlow({ chat, slash = null }) {
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
    live.current = true; setS({ ...INITIAL, intakeDone: intakeDone(canvas) }); route.current = null; cards.current = new Set(); kicked.current = false;
    if (!eligible) return undefined;
    let on = true;
    api(`/api/learn/codebase?app=${encodeURIComponent(canvas)}&board=${encodeURIComponent(board)}`)
      .then(out => { if (on) setInfo({ key: canvas, ...out }); }, () => { if (on) setInfo({ key: canvas, repository: null, activity: null }); });
    return () => { on = false; live.current = false; clearTimeout(timer.current); };
  }, [canvas, eligible]); // eslint-disable-line react-hooks/exhaustive-deps
  // A saved Learn goal keeps the flow on screen (its plan draft, or the accepted plan) after a reload; any other saved activity hands the Chat to the activity card.
  const stored = storedLearn(chat.coaching.state);
  const active = !!repository && (!info?.activity || !!stored);

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

  // Learn from it before the document has its `learn` section (an older stored catalogue): the additive call is running on the server, so the document is read again every few seconds until it arrives or fails.
  const waiting = s.mode === 'learn' && !!s.doc && !s.doc.learn && s.get?.learn?.status === 'queued';
  useEffect(() => {
    if (!waiting) return undefined;
    let inFlight = false;
    const tick = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      fetchDoc().then(() => api(url(route.current)).then(data => live.current && patch({ get: data }), () => {})).finally(() => { inFlight = false; });
    }, 4000);
    return () => clearInterval(tick);
  }, [waiting]); // eslint-disable-line react-hooks/exhaustive-deps
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
      patch({ use: key, mode: 'run' });
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

  // Learn from it, a topic chosen (Intake v2): the goal is saved through the existing goal path with the option itself (no clarifying form), then the Tutor opens the topic in one paragraph.
  const chooseLearn = picked => {
    const kept = st.current.focus, option = kept && kept.id === picked.id ? { ...picked, focus: kept.text } : picked; // a line narrower than the option keeps the learner's words as the focus
    restored.current = true; // a fresh pick is not a reload: the restore effect must not draft a second plan
    patch({ learn: option, depthAsk: true, learnIntro: null, focus: null }); // the depth is asked before anything is saved or drafted
  };
  // The depth answered (or the question left alone: the board's current depth): saved for this board through the Chat's own setting, copied into the goal, then the goal, the opening paragraph and the plan.
  const beginLearn = async (picked, depth) => {
    const option = { ...picked, depth };
    try { chat.settings?.set?.({ depth }); } catch { /* the goal still carries it */ }
    patch({ learn: option, depthAsk: false, learnIntro: { status: 'loading' } });
    const out = await startGoal({ chat, board, repository: repoRef.current, goalId: 'learn_concept', text: '', learn: option });
    if (!live.current) return;
    if (out.note) { patch({ learn: null, learnIntro: null }); append(line('assistant', out.note)); return; }
    patch({ goalChosen: true });
    openLearnIntro(option);
    requestPlan(option);
  };
  const openLearnIntro = async option => {
    patch({ learnIntro: { status: 'loading' } });
    try {
      const out = await codebasePost(chat, board, { action: 'learn_intro', learn: option });
      if (live.current) patch({ learnIntro: out?.text && !internal(out.text) ? { status: 'done', text: out.text } : { status: 'failed' } });
    } catch { if (live.current) patch({ learnIntro: { status: 'failed' } }); }
  };
  // The plan (learn-plan-toc-spec.md): the server drafts the table of contents for the chosen option (action learn_plan); an edit sends the draft and the learner's words and gets a whole new draft back.
  const planOptions = () => learnOf(st.current.doc).options;
  const canvasOutline = () => chat.canvasOps?.outlineNow?.() || { outline: [], revision: '' };
  const savePlan = plan => codebasePost(chat, board, { action: 'learn_plan_save', plan });
  const planSeq = useRef(0);
  const requestPlan = async (option, { edit = null, draft = null } = {}) => {
    const mine = ++planSeq.current, stale = () => !live.current || mine !== planSeq.current || st.current.plan?.status === 'accepted'; // a late answer never overwrites a newer request or an accepted plan
    const before = st.current.plan, previous = before?.status === 'draft' ? before : before?.previous || null, current = canvasOutline(), editing = !!edit && before?.status === 'draft';
    const keepDraft = () => patch({ plan: { ...before, busy: false }, planLog: [...st.current.planLog, line('assistant', SENTENCES.planInvalid)] }); // a failed edit leaves the draft as it was
    patch({ plan: editing ? { ...before, busy: true } : { status: 'loading', previous } });
    let out;
    try { out = await codebasePost(chat, board, { action: 'learn_plan', depth: option.depth, learn: { ...option, options: planOptions() }, outline: current.outline, outlineRevision: current.revision, draft, edit: edit ? edit.slice(0, 500) : null }); }
    catch { if (stale()) return; if (editing) keepDraft(); else patch({ plan: { status: 'invalid', rows: planRows(['try_again', 'start_plain']), previous, retry: { option, edit, draft } } }); return; }
    if (stale()) return;
    const learn = { options: planOptions() };
    if (out.error === 'invalid_plan' || !out.proposal?.ops?.length) {
      if (editing) { keepDraft(); return; }
      patch({ plan: { status: 'invalid', rows: planRows(out.rows?.length ? out.rows : ['try_again', 'start_plain'], { learn }), previous, retry: { option, edit, draft } } });
      return;
    }
    if (out.off_plan && before?.status === 'draft') { // a line that is not about the plan: one sentence, the draft is shown again unchanged
      // The answer's own rows (a nearest topic, a background section) ride under the sentence; Accept and Change something stay on the draft.
      const extra = planRows(out.rows, { ops: before.ops, learn }).filter(row => row.id.startsWith('learn:') || row.id.startsWith('plan:background:') || row.id === 'plan:plain');
      const words = internal(out.text) ? SENTENCES.planInvalid : out.text;
      patch({ plan: { ...before, busy: false }, planLog: [...st.current.planLog, { ...line('assistant', words), ...(extra.length ? { choices: extra } : {}) }] });
      return;
    }
    const proposal = { ops: cleanOps(out.proposal.ops), base: out.proposal.base, source: 'learn-plan' }; // the model's own numbers in titles are dropped: the list and the contents number them
    const rows = planRows(out.rows, { ops: proposal.ops, learn }).filter(row => row.id !== 'plan:keep' || previous); // Keep needs a previous draft
    patch({ plan: { status: 'draft', text: out.text, ops: proposal.ops, base: proposal.base, rows, count: chapterCount(proposal.ops), previous, option } });
    chat.canvasOps?.proposeOutline?.(proposal); // the same proposal in the contents panel: Apply there is Accept here
    savePlan({ ops: proposal.ops, revision: proposal.base, acceptedAt: null, text: out.text }).catch(() => {});
  };
  // Accepted, whether by the Tutor's Accept row or by Apply in the contents panel: one result either way.
  const accepted = plan => {
    planSeq.current += 1; // nothing in flight may replace it
    patch({ plan: { status: 'accepted', count: plan.count, ops: plan.ops } });
    // The brief reads the accepted plan on the server, so section 1.1 starts once the save has landed.
    savePlan({ ops: plan.ops, revision: plan.base, acceptedAt: new Date().toISOString(), text: plan.text }).then(() => live.current && loadSection(FIRST_SECTION), () => patch({ planLog: [...st.current.planLog, line('assistant', SENTENCES.planNotSaved)] }));
    chat.canvasOps?.planAccepted?.(); // the contents go read-only and 1.1 is the current section
  };
  const acceptPlan = () => {
    const plan = st.current.plan;
    if (plan?.status !== 'draft') return;
    const result = chat.canvasOps?.applyLearnPlan?.(plan.ops, plan.base);
    if (!result?.ok) { patch({ planLog: [...st.current.planLog, line('assistant', result?.message || SENTENCES.planInvalid)] }); return; }
    accepted(plan);
  };
  // Apply on the plan's own proposal in the contents panel is Accept here (learn-plan-toc-spec.md section 1.3).
  useEffect(() => {
    const onApplied = () => { const plan = st.current.plan; if (plan?.status === 'draft') accepted(plan); };
    window.addEventListener('rh:learn-plan-applied', onApplied);
    return () => window.removeEventListener('rh:learn-plan-applied', onApplied);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const learnOption = id => learnOf(st.current.doc).options.find(option => option.id === id);

  // Learn sections (CONTRACT.md server actions): brief then compose for the current section, Next section, and the Make loop. Errors come back as { error, words } or as a refused request.
  const sectionPost = async body => { try { return await codebasePost(chatRef.current, board, body); } catch (error) { return error?.data || {}; } };
  const sectionPatch = change => patch(old => ({ section: { ...old.section, ...change } }));
  const failSection = (failed, out) => sectionPatch({ stage: 'failed', failed, words: out?.words && !internal(out.words) ? out.words : null });
  const loadSection = async (sectionId, from = 'brief') => {
    patch(old => ({ section: { ...(old.section?.id === sectionId ? old.section : { cards: {} }), id: sectionId, stage: from, failed: null, words: null } }));
    const alive = () => live.current && st.current.section?.id === sectionId;
    const got = await briefAndCompose(sectionPost, sectionId, { from, onBrief: brief => { if (alive()) sectionPatch({ brief, stage: 'compose' }); } });
    if (!alive()) return;
    if (got.failed) { failSection(got.failed, got.out); return; }
    sectionPatch({ composition: got.composition, stage: 'ready', next: null });
  };
  // The dev row Next section, and Skip this section: the server moves the current section on; then its brief and composition.
  const nextSection = async () => {
    const id = st.current.section?.id;
    if (!id) return;
    sectionPatch({ stage: 'brief', failed: null, words: null });
    const out = await sectionPost({ action: 'learn_section_next', sectionId: id });
    if (!live.current) return;
    if (typeof out?.currentSectionId !== 'string') { failSection('next', out); return; }
    loadSection(out.currentSectionId);
  };
  // The dev row Make section: one item at a time in composition order (next item, perform, learn_section_made) until next is null. A failure keeps the item for Try again.
  const makeSection = async () => {
    const sec = st.current.section;
    if (!sec?.id || sec.stage === 'making') return;
    const sectionId = sec.id, alive = () => live.current && st.current.section?.id === sectionId;
    sectionPatch({ stage: 'making', failed: null, words: null });
    let composition = sec.composition;
    if (!composition) { // after a reload: the stored composition; a section with no brief gets its brief and composition first (learn-section-load.js)
      const got = await compositionForMake(sectionPost, sectionId, { onLoading: () => { if (alive()) sectionPatch({ stage: 'brief' }); }, onBrief: brief => { if (alive()) sectionPatch({ brief, stage: 'compose' }); } });
      if (!alive()) return;
      if (got.failed) { failSection(got.failed, got.out); return; }
      composition = got.composition;
      sectionPatch({ composition, stage: 'making' });
    }
    // ponytail: a Make press after a reload starts again at the first item (the browser does not read made[] back); the server's next order is kept from there.
    let itemId = sec.next || composition?.items?.[0]?.id || null;
    if (!itemId) { failSection('make', null); return; }
    // Position (learn-position-spec.md): the section's contents entry each card it makes is tied to, and the chapter's heading card before its first section's first card.
    const canvasApi = chatRef.current.canvasOps?.tutorCanvas?.() || null, ops = st.current.plan?.ops || [];
    const entries = sectionEntries(ops, chatRef.current.canvasOps?.outlineNow?.()?.outline), chapter = sectionId.split('.')[0];
    const items = composition?.items || [], orderOf = id => { const k = items.findIndex(entry => entry.id === id); return k < 0 ? items.length : k; }; // notes come after every item
    let first = true, previous = st.current.section.last || null;
    if (canvasApi && !(canvasApi.blocks?.() || []).some(block => block.learn?.role === 'chapter' && block.learn.sectionId === chapter)) {
      const title = planTree(ops)[Number(chapter) - 1]?.title;
      if (title) { const id = await placeChapter(canvasApi, { chapter, title }); if (id) { previous = id; sectionPatch({ last: id }); } }
      if (!alive()) return;
    }
    while (itemId) {
      sectionPatch({ next: itemId });
      const out = await sectionPost({ action: 'learn_section_make', sectionId, itemId });
      if (!alive()) return;
      if (out?.skipped) { itemId = out.next ?? null; continue; }
      if (!out?.perform) { failSection('make', out); return; }
      const composed = (composition?.items || []).find(entry => entry.id === itemId) || {}, cards = st.current.section.cards || {};
      let done;
      let reached = 'start';
      try {
        const itemCanvas = chatRef.current.canvasOps?.tutorCanvas?.() || null;
        const raced = await withinTime(performItem({ canvasApi: itemCanvas, slash, perform: out.perform, item: out.item,
          ctx: { sectionId, itemId, board, depth: depthOf(chatRef.current.settings?.depth) || null, ops: chatRef.current.canvasOps, after: composed.after ? cards[composed.after] || null : null, previous: st.current.section.last || previous, repository: repoRef.current,
            order: orderOf(itemId), afterItem: composed.after || null, entry: entries[sectionId] || null, first, onStage: name => { reached = name; } } }));
        if (raced.timedOut) { // §7.2: never a silent stop; the console line is what the run reports
          const dump = await stallDump(itemCanvas);
          console.warn(JSON.stringify({ event: 'learn_section_perform_timeout', sectionId, itemId, op: out.perform?.op || null, stage: reached, ...dump }));
          if (alive()) failSection('make', { words: SENTENCES.sectionCardLate });
          return;
        }
        done = raced.value;
        first = false;
      } catch { if (alive()) failSection('make', null); return; }
      if (!alive()) return;
      sectionPatch({ cards: { ...cards, ...(done.cardId ? { [itemId]: done.cardId } : {}) }, last: done.last || done.cardId || st.current.section.last || null });
      await sectionPost({ action: 'learn_section_made', sectionId, itemId, ...(done.cardId ? { cardId: done.cardId } : {}), ...(done.jobId ? { jobId: done.jobId } : {}), ...(done.highlight ? { highlight: done.highlight } : {}) });
      if (!alive()) return;
      itemId = out.next ?? null;
    }
    sectionPatch({ stage: 'ready', next: null });
  };
  // A quote of a made card that was not on its page or article when the learner opened it (LearnPaper, LearnWiki, WebpageCard): recorded on the item (DECISIONS S).
  useEffect(() => {
    const onMissed = event => { const { sectionId, itemId, cardId, highlight } = event.detail || {}; if (sectionId && itemId && highlight) sectionPost({ action: 'learn_section_made', sectionId, itemId, ...(cardId ? { cardId } : {}), highlight }); };
    window.addEventListener(LEARN_HIGHLIGHT_EVENT, onMissed);
    return () => window.removeEventListener(LEARN_HIGHLIGHT_EVENT, onMissed);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const retrySection = () => {
    const sec = st.current.section;
    if (!sec?.id) return;
    if (sec.failed === 'make') makeSection();
    else if (sec.failed === 'next') nextSection();
    else loadSection(sec.id, sec.failed === 'compose' ? 'compose' : 'brief');
  };

  choose.current = chooseUse;
  // The typed-line listener lives across renders: it reaches the latest requestPlan and chat through these (a first render can precede LearnPage's canvasOps).
  const planRef = useRef(null), chatRef = useRef(chat);
  planRef.current = requestPlan; chatRef.current = chat;
  // The router decided the learner asked what they can do here (ask.jsx): the intake is offered again, whatever was chosen before.
  useEffect(() => {
    const again = event => { if (event.detail?.canvas !== canvas) return; event.detail.handled = true; planSeq.current += 1; forgetIntake(canvas); patch({ intakeDone: false, use: null, mode: null, learn: null, learnIntro: null, depthAsk: false, plan: null, planLog: [], focus: null, goalChosen: false, elsewhere: false, form: null }); };
    window.addEventListener(CODEBASE_OPTIONS_EVENT, again);
    return () => window.removeEventListener(CODEBASE_OPTIONS_EVENT, again);
  }, [canvas]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = id => {
    if (/^(use|route|goal|learn):/.test(id) || id === 'mode:run' || id === 'else') rememberIntake(canvas); // asked once: a way is the answer
    if (id.startsWith('depth:')) { const l = st.current.learn; if (l && st.current.depthAsk) beginLearn(l, id.slice(6)); }
    else if (id === 'plan:accept') acceptPlan();
    else if (id === 'section:retry') retrySection();
    else if (id === 'section:skip' || id === 'section:next') nextSection();
    else if (id === 'section:make') makeSection();
    else if (id === 'section:arrange') { const sec = st.current.section; if (sec?.id && !chat.canvasOps?.tutorCanvas?.()?.arrangeLearn?.(sec.id)) toast('No cards of this section to arrange.'); }
    else if (id.startsWith('spacing:') && SPACING_SCALES[id.slice(8)]) chat.canvasOps?.tutorCanvas?.()?.learnSpacing?.(SPACING_SCALES[id.slice(8)]);
    else if (id === 'plan:change') { if (st.current.planLog.at(-1)?.text !== SENTENCES.planEditPlaceholder) patch({ planLog: [...st.current.planLog, line('assistant', SENTENCES.planEditPlaceholder)] }); chat.composer?.focus?.(); }
    else if (id === 'plan:keep') { const previous = st.current.plan?.previous; if (previous) { patch({ plan: { ...previous, previous: null, busy: false } }); chat.canvasOps?.proposeOutline?.({ ops: previous.ops, base: previous.base, source: 'learn-plan' }); savePlan({ ops: previous.ops, revision: previous.base, acceptedAt: null, text: previous.text }); } }
    else if (id === 'plan:plain') { planSeq.current += 1; patch({ plan: { status: 'plain' } }); chat.canvasOps?.proposeOutline?.(null); }
    else if (id === 'plan:retry') { const retry = st.current.plan?.retry; if (retry) requestPlan(retry.option, retry); }
    else if (id.startsWith('plan:background:')) { const plan = st.current.plan; if (plan?.status === 'draft') { const label = [...plan.rows, ...st.current.planLog.flatMap(l => l.choices || [])].find(row => row.id === id)?.label; if (label) requestPlan(plan.option, { edit: label, draft: plan.ops }); } }
    else if (id === 'mode:run') chooseUse('use_codebase');
    else if (id === 'mode:learn') patch({ mode: 'learn' });
    else if (id.startsWith('learn:')) {
      const option = learnOption(id.slice(6)), swap = st.current.plan?.status === 'draft' && st.current.learn?.id !== id.slice(6); // another topic offered beside a draft that cannot teach what was asked
      if (option && swap) { planSeq.current += 1; patch({ learn: null, plan: null, planLog: [], learnIntro: null, depthAsk: false }); chooseLearn(option); }
      else if (option && learnOpen(st.current)) chooseLearn(option);
    }
    else if (id === 'retry:learn') { if (st.current.learn) { openLearnIntro(st.current.learn); if (!st.current.plan) requestPlan(st.current.learn); } }
    else if (id.startsWith('use:')) chooseUse(id.slice(4));
    else if (id.startsWith('goal:')) chooseGoal(id.slice(5));
    else if (id.startsWith('route:')) { patch({ use: 'use_codebase' }); startRoute(id.slice(6), routeTitleOf(id.slice(6))); }
    else if (id === 'else') patch({ elsewhere: true });
    else if (id === 'retry:catalogue') retryCatalogue();
    else if (id === 'retry:route') startRoute(route.current, routeTitleOf(route.current) || st.current.routeTitle);
    else if (id === 'show:run' || id === 'show:runbook') {
      const record = st.current.run?.record;
      if (record && !openRehearsalCard(chat.canvasOps, id === 'show:run' ? 'run' : 'runbook', record, { app: canvas, board, repositoryApp: repoRef.current?.app, routeTitle: st.current.routeTitle })) toast('This canvas cannot take a new card here.');
    }
    // Study these (pinned-study-codebase-spec.md 2g): Files at the route's first source file, the Run card as the work, Study open; the page does the three actions.
    else if (id === 'study:these') chat.canvasOps?.studyThese?.(firstSourceFile(st.current.run?.record));
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
      if (where !== canvas) return;
      // The depth question left alone: the board's current depth is used and the line goes on to Chat as it would.
      if (st.current.depthAsk && st.current.learn) { beginLearn(st.current.learn, depthOf(chatRef.current.settings?.depth) || 'balanced'); return; }
      // While a plan draft waits for Accept the line is a reply to the Tutor's open question (no router): a whole new draft comes back (learn-plan-toc-spec.md section 1.5).
      if (st.current.plan?.status === 'draft' && !st.current.plan.busy) {
        event.preventDefault();
        patch({ planLog: [...st.current.planLog, line('user', text)] });
        planRef.current(st.current.plan.option, { edit: text, draft: st.current.plan.ops });
        return;
      }
      // While the Learn options are open the line is a reply to them: the scoped router reads it against the options (and what this codebase cannot teach).
      if (learnOpen(st.current) && st.current.doc) {
        event.preventDefault();
        const learn = learnOf(st.current.doc), full = st.current.doc.learn;
        append(line('user', text));
        routeLearnText({ post: body => api('/api/learn/chat/route', { method: 'POST', body: JSON.stringify(body) }), app: canvas, text, learn: { options: learn.options, cannot: full?.cannot || [] } }).then(async outcome => {
          if (!live.current) return;
          let reply;
          // A hit (a confirmed option, or something this codebase lacks) is answered with no model turn. A miss is one Tutor turn that says whether it can be learned here and why (learn_fit); every typed line gets an answer.
          if (outcome.kind === 'confirmed' || outcome.kind === 'cannot') reply = learnReply(outcome, learn);
          else {
            try { reply = fitReply(await codebasePost(chatRef.current, board, { action: 'learn_fit', text, learn: { options: learn.options, cannot: full?.cannot || [] } }), learn); }
            catch { reply = learnReply({ kind: 'none' }, learn); }
          }
          if (!live.current) return;
          patch({ focus: reply.focus || null });
          append({ key: `line-${++counter}`, role: 'assistant', text: reply.text, choices: reply.choices, learnRows: true });
        });
        return;
      }
      if (!intakeOpen(st.current, cm)) return;
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

  // A reload on a canvas with a saved Learn goal: the flow comes back at its plan (the pending draft, or the accepted plan), not at the intake.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || st.current.learn || !stored || !s.doc || !repository) return;
    const option = learnOf(s.doc).options.find(o => o.id === stored.id);
    if (!option) { patch({ intakeDone: false }); return; } // the catalogue was made again and no longer has that topic: the intake is offered
    restored.current = true;
    const picked = { ...option, ...(stored.focus ? { focus: stored.focus } : {}), ...(stored.depth ? { depth: stored.depth } : {}) }, plan = stored.plan;
    patch({ mode: 'learn', learn: picked, learnIntro: { status: 'skipped' }, goalChosen: true, intakeDone: true,
      section: plan?.acceptedAt ? { id: stored.currentSectionId || FIRST_SECTION, stage: 'ready', cards: {} } : null, // a reload runs nothing: the dev rows act on the stored section
      plan: plan ? { status: plan.acceptedAt ? 'accepted' : 'draft', text: plan.text || '', ops: plan.ops, base: plan.revision, count: chapterCount(plan.ops), rows: planRows(['accept', 'change'], { ops: plan.ops, learn: { options: learnOf(s.doc).options } }), option: picked, previous: null } : null });
    if (!plan) requestPlan(picked);
    else if (!plan.acceptedAt) chat.canvasOps?.proposeOutline?.({ ops: plan.ops, base: plan.revision, source: 'learn-plan' });
  }, [stored?.id, !!s.doc, !!repository]); // eslint-disable-line react-hooks/exhaustive-deps
  const messages = [...(active ? flowMessages(s, { repo: repository.repo }) : []), ...s.lines];
  if (!messages.length) return null;
  return <div data-rehearsal-flow aria-live="polite" className="flex flex-col">
    {messages.map(m => {
      const said = { role: m.role, content: m.text ?? '', status: 'done', clientId: m.key };
      return <div key={m.key} data-rehearsal-message={m.key}>
        {m.text !== undefined && <ChatMessage m={said} i={0} msgs={[said]} learnChat busy={false} setMsgs={() => {}} setFilePeek={() => {}} setRunPeek={() => {}} />}
        {m.pending && <Pending text={m.pending} />}
        {m.section && <SectionDetails section={m.section} />}
        {m.form && <GoalForm goalId={m.form.goalId} busy={busy} onSubmit={submitGoal} />}
        {m.choices?.length > 0 && <ChoiceList items={m.choices} onPick={item => pick(item.id)} label={m.text ? undefined : 'Choices'} className="pt-0.5 pb-1.5" />}
        {m.chips?.length > 0 && <Chips chips={m.chips} onPick={pick} />}
        {m.actions?.length > 0 && <Chips chips={m.actions} onPick={pick} />}
      </div>;
    })}
  </div>;
}
