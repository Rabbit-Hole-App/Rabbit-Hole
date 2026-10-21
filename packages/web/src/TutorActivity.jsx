// The learner's current Tutor activity (C:/s/spec/tutor-workflow/draft.md Tasks 05 and 07): the next step in Progress, and the
// activity card above the Chat composer with its one explicit "Check my answer". Nothing here runs on open or restore: the
// next step is chosen without a model (chooseNextActivity with no planner), an activity starts only when the learner presses
// it, and an answer is submitted only by Check my answer. Typing, autosave and reading Progress submit nothing.
import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { materialCommands } from './learn-slash.js';
import { OFFER_LABEL, applyTutorAction, assessmentText, chooseNextActivity } from './learn-coaching-materials.js';

const BUTTON = 'cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium disabled:cursor-default disabled:opacity-50';
const CHOICE = 'cursor-pointer rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-ink hover:bg-hover disabled:cursor-default disabled:opacity-50';
const newKey = () => `sub-${crypto.randomUUID()}`;

// What the Tutor knows about the context now, read when a check runs (applyTutorAction rechecks it as the card arrives).
const contextOf = (chat, board) => ({
  app: chat.canvas, board, goalId: chat.coaching.state?.activeGoalId ?? null, coachingRevision: chat.coaching.state?.revision ?? null,
  controls: chat.coaching.controls, chat: { chatOpen: true, ready: chat.coaching.status === 'ready' }, canEdit: chat.canvasOps?.canEdit?.() === true,
});

// Start (or resume) an activity the learner chose: one Tutor action, saved and made once.
export function startActivity(chat, board, choice, actionId = crypto.randomUUID()) {
  const now = contextOf(chat, board);
  return applyTutorAction({
    actionId, kind: 'start_activity', originContext: { app: now.app, board, goalId: now.goalId }, expectedRevisions: { coaching: now.coachingRevision },
    payload: { proposal: choice.proposal, ...(choice.source === 'saved' ? { activityId: choice.activityId } : {}), activity: choice.activity || {}, requested: true },
  }, () => contextOf(chat, board), {
    coaching: (kind, payload, meta) => chat.coaching.act(kind, payload, meta),
    canvas: chat.canvasOps?.tutorCanvas?.() || {},
    makeMaterial: chat.canvasOps?.makeTutorMaterial || (async () => { throw new Error('no canvas'); }),
  });
}

// Progress's next step for the learner's current goal, when the read model names none (view.nextAction). Only for the
// active goal: viewing another goal is read only. view: the ProgressView just read; journey: useJourney's { journey, path }.
export function NextActivity({ chat, board, goal, view, journey, onClose }) {
  const [choice, setChoice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const state = chat.coaching.state;
  const activity = state?.activities?.find(a => a.goalId === goal.goalId && a.activityId === goal.activityId) || null;
  const statuses = Object.fromEntries((view?.criteria || []).map(row => [row.criterionId, row.status]));
  const evidence = Object.fromEntries((view?.criteria || []).map(row => [row.criterionId, row.evidence || []]));
  const own = journey?.journey?.id && journey.journey.id === goal.journeyId ? journey : null;
  const input = request => ({ goal, statuses, evidence, activity, journey: own?.journey ?? null, path: own?.path ?? null, request,
    capabilities: { materials: materialCommands(), blocks: chat.canvasOps?.tutorCanvas?.()?.blocks?.() || [] } });
  useEffect(() => {
    let live = true;
    chooseNextActivity(input({})).then(next => { if (live) setChoice(next); }, () => { if (live) setChoice(null); });
    return () => { live = false; };
  }, [view, state?.revision, own?.journey?.revision]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!choice) return null;
  const run = async fn => { setBusy(true); setNote(null); try { await fn(); } catch (error) { setNote(error?.data?.error === 'revision' ? 'Your Tutor state changed meanwhile; try again.' : 'That could not be saved. Nothing was lost; try again.'); } finally { setBusy(false); } };
  const start = next => run(async () => {
    const out = await startActivity(chat, board, next);
    if (out.status !== 'applied' && out.status !== 'duplicate') throw Object.assign(new Error(out.reason), { data: { error: out.reason } });
    chat.composer.focus();
    if (!globalThis.matchMedia?.('(min-width: 64rem)').matches) onClose?.();
  });
  const current = choice.source === 'saved' && activity && choice.activityId === state?.activeActivityId;
  const box = (body, actions) => <div data-progress-next data-progress-activity={choice.reason} className="mt-4 rounded-xl bg-hover p-3">
    <p className="text-sm font-semibold text-ink">Next step</p>{body}
    {actions && <div className="mt-2 flex flex-wrap gap-1.5">{actions}</div>}
    {note && <p role="alert" className="mt-2 text-xs text-fail">{note}</p>}
  </div>;
  if (choice.reason === 'accept_scope') return box(<>
    <p className="mt-1 text-sm text-ink">Track your progress on this goal by these skills:</p>
    <ul className="mt-1 list-disc pl-5 text-sm text-ink-2">{choice.scope.map(c => <li key={c.criterionId}>{c.label}</li>)}</ul>
  </>, <button type="button" data-progress-accept-scope disabled={busy} onClick={() => run(() => chat.coaching.act('change_scope', { goalId: goal.goalId, criteria: choice.scope }))} className={`${BUTTON} bg-ink text-white`}>Track these skills</button>);
  if (choice.reason === 'awaiting_feedback') return box(<p className="mt-1 text-sm text-ink-2">Your answer is being checked.</p>);
  if (choice.reason === 'goal_demonstrated') return box(<p className="mt-1 text-sm text-ink">Every skill of this goal is demonstrated independently.</p>,
    <button type="button" onClick={() => chat.composer.prepare({ text: 'Help me choose my next goal.' })} className={CHOICE}>Choose a next goal</button>);
  if (choice.offers) return box(<p className="mt-1 text-sm text-ink">This one has been hard twice in a row. What would help?</p>, choice.offers.map(offer => (
    <button key={offer} type="button" data-progress-offer={offer} disabled={busy} className={CHOICE} onClick={() => {
      if (offer === 'worked_answer' || offer === 'simpler_task') return chooseNextActivity(input({ kind: offer })).then(next => next.proposal && start(next));
      if (offer === 'change_goal') return chat.composer.prepare({ text: 'Help me choose a different goal.' });
      if (state?.activeActivityId) return run(() => chat.coaching.act('pause_activity', { activityId: state.activeActivityId }));
      return chat.coaching.dispatch({ type: 'not_now' });
    }}>{OFFER_LABEL[offer]}</button>)));
  if (!choice.proposal || current) return current ? box(<p className="mt-1 text-sm text-ink-2">Your current activity is open above the Chat composer.</p>) : null;
  return box(<>
    <p className="mt-1 text-sm text-ink">{choice.proposal.objective}</p>
    <p className="mt-1 text-xs text-ink-2">{choice.source === 'journey_check' ? 'A check from your learning path.' : choice.source === 'saved' ? 'Where you left off.' : 'A question on this skill.'}</p>
  </>, <button type="button" data-progress-try-activity disabled={busy} onClick={() => start(choice)} className={`${BUTTON} bg-ink text-white`}>{choice.source === 'saved' ? 'Continue' : choice.source === 'journey_check' ? 'Try the check' : 'Try it'}</button>);
}

// The active activity above the composer: its prompt, an answer field (options for a keyed check), and Check my answer. One
// submission key per answer: a retry after a lost response reuses it, so the server replays one attempt; a changed answer
// gets a new one. A failed save keeps the answer here and says so; nothing is cleared.
export function TutorActivity({ chat, board }) {
  const state = chat.coaching.state;
  const activity = state?.activities?.find(a => a.activityId === state.activeActivityId && a.goalId === state.activeGoalId) || null;
  const [answer, setAnswer] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // { text, tone }
  const key = useRef({ for: null, value: null });
  const shown = activity && ['in_progress', 'awaiting_feedback', 'feedback_ready'].includes(activity.status);
  const id = activity ? `${activity.activityId}@${activity.revision}` : null;
  useEffect(() => { setAnswer(''); setResult(null); key.current = { for: null, value: null }; }, [id]);
  // Feedback saved earlier (a reload, another device): read the attempt once, without any model call, and show the accepted
  // submission with it (draft Task 05).
  const saved = activity?.checkpoint?.assessment;
  useEffect(() => {
    if (!saved?.attemptId || result) return;
    let live = true;
    api(`/api/learn/tutor/attempts/${encodeURIComponent(saved.attemptId)}?app=${encodeURIComponent(chat.canvas)}&board=${encodeURIComponent(board)}`)
      .then(view => { if (!live) return; const sent = view.attempt?.submittedContent; setAnswer(sent?.optionId ?? sent?.text ?? ''); setResult({ text: assessmentText(view.assessment), tone: 'info' }); },
        () => { if (live) setResult({ text: assessmentText(saved), tone: 'info' }); });
    return () => { live = false; };
  }, [saved?.attemptId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown) return null;
  const choice = activity.responseKind === 'choice', options = activity.checkpoint?.options || [];
  const content = choice ? { optionId: answer } : { text: answer };
  const submit = async () => {
    const draft = JSON.stringify(content);
    if (key.current.for !== draft) key.current = { for: draft, value: newKey() };
    setSending(true); setResult({ text: 'Saving your answer…', tone: 'info' });
    try {
      const out = await api('/api/learn/tutor/attempts', { method: 'POST', body: JSON.stringify({ app: chat.canvas, board, activityId: activity.activityId, activityRevision: activity.revision, submissionKey: key.current.value, submittedContent: content, sourceRefs: [], assistanceRefs: [] }) });
      setResult({ text: assessmentText(out.assessment), tone: 'info' });
      chat.coaching.reload?.();
    } catch (error) {
      const limit = error?.data?.detail;
      setResult({ tone: 'error', text: error?.status === 413 && limit ? `Your answer is ${limit.actual} ${limit.unit} long; the limit is ${limit.max}. Shorten it and check again.`
        : error?.data?.error === 'stale_activity' ? 'This question has changed since you started. Your answer is still here.'
          : 'Your answer was not saved. It is still here; check again when you are ready.' });
    } finally { setSending(false); }
  };
  const done = activity.status !== 'in_progress' && result;
  return (
    <section data-tutor-activity-card={activity.status} aria-label="Your activity" className="mb-2 flex flex-col gap-2 rounded-xl border border-line bg-white p-3">
      <p className="text-xs font-medium tracking-wide text-ink-2 uppercase">{activity.objective}</p>
      <p className="text-sm text-ink">{activity.prompt}</p>
      {choice
        ? <fieldset className="flex flex-col gap-1" disabled={sending}>
          <legend className="sr-only">Your answer</legend>
          {options.map(option => <label key={option.id} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input type="radio" name={`answer-${activity.activityId}`} value={option.id} checked={answer === option.id} onChange={() => setAnswer(option.id)} />{option.label}</label>)}
        </fieldset>
        : <textarea aria-label="Your answer" value={answer} disabled={sending} onChange={event => setAnswer(event.target.value)} rows={3} className="w-full resize-y rounded-lg border border-line px-2 py-1.5 text-sm text-ink" />}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-tutor-check disabled={sending || !answer.trim()} onClick={submit} className={`${BUTTON} bg-ink text-white`}>{done ? 'Check another answer' : 'Check my answer'}</button>
      </div>
      {result && <p role={result.tone === 'error' ? 'alert' : 'status'} data-tutor-feedback className={`text-sm ${result.tone === 'error' ? 'text-fail' : 'text-ink-2'}`}>{result.text}</p>}
    </section>
  );
}
