// The Progress pane (C:/s/spec/tutor-workflow/draft.md Task 09, "Progress UI and access"): the companion column left of
// Chat (chat-panels.js view 'progress'), opened from the Chat header's Progress icon. One goal, a plain count, the skill
// list, one next step, Why this status and More about this skill in place. Read only: viewing another goal never switches
// the active one (Resume this goal does, as its own action), and nothing here calls a model or assesses anything.
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Circle, CircleAlert, CircleCheck, CircleDashed, CircleHelp, X } from 'lucide-react';
import { api } from './api.js';
import { STATUS_LABEL, fetchProgress, progressModel } from './learn-progress-client.js';
import { NextActivity } from './TutorActivity.jsx';

const ICON = { demonstrated_independently: CircleCheck, demonstrated_with_help: CircleHelp, practising: CircleDashed, needs_review: CircleAlert, not_checked: Circle };
const TONE = { demonstrated_independently: 'text-pass', demonstrated_with_help: 'text-[#b45309] dark:text-[#f5b14c]', needs_review: 'text-fail', practising: 'text-ink-2', not_checked: 'text-ink-3' };
const BUTTON = 'cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium';
const day = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };

// scope { app, board }; coaching: the workspace's controls (use-learn-coaching.jsx); composer: the Chat draft (prepare and
// focus never send); onClose: closes the column (focus goes back to the Progress icon). chat and journey (Task 07): the Chat
// workspace and useJourney's view, for the next step when the read model names none (TutorActivity.jsx NextActivity).
export default function LearnProgress({ scope, coaching, composer, onClose, chat = null, journey = null }) {
  const [viewedGoalId, setViewedGoalId] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [load, setLoad] = useState({ status: 'idle', view: null });
  const [resuming, setResuming] = useState(false);
  const heading = useRef(null);
  const state = coaching.state;
  const model = progressModel({ goals: state?.goals || [], activeGoalId: state?.activeGoalId ?? null, viewedGoalId, load: { ...load, offline: typeof navigator !== 'undefined' && navigator.onLine === false } });
  const goalId = model.viewed?.goalId ?? null;
  const read = () => {
    if (!goalId) return;
    setLoad(previous => ({ status: 'loading', view: previous.view }));
    fetchProgress(api, scope, goalId).then(view => setLoad({ status: 'ready', view }), () => setLoad(previous => ({ status: 'error', view: previous.view })));
  };
  // Read on open, on another viewed goal, and when the saved state moves on (an assessment landed, a goal changed elsewhere).
  useEffect(read, [goalId, state?.revision, scope.app, scope.board]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { heading.current?.focus(); }, []);
  const resume = async () => {
    setResuming(true);
    try { await coaching.act('activate_goal', { goalId }); setViewedGoalId(null); } catch { /* the pane keeps the viewed goal; the controls line shows the save state */ } finally { setResuming(false); }
  };
  return (
    <section aria-labelledby="progress-title" data-progress-pane={model.state} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}
      className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <h2 id="progress-title" ref={heading} tabIndex={-1} className="min-w-0 flex-1 text-sm font-semibold text-ink outline-none">Progress</h2>
        <button type="button" data-progress-close onClick={onClose} aria-label="Close Progress" title="Close Progress"
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink"><X size={15} strokeWidth={1.8} aria-hidden /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {model.state === 'no_goal' && <div data-progress-empty className="flex flex-col items-start gap-3">
          <p className="text-sm text-ink">No learning goal set yet.</p>
          <p className="text-sm text-ink-2">Tell the Tutor what you want to learn, and your progress on it shows here. Ordinary chat works as always.</p>
          <button type="button" onClick={() => { composer.focus(); if (!globalThis.matchMedia?.('(min-width: 64rem)').matches) onClose(); }} className={`${BUTTON} bg-ink text-white`}>Set a goal</button>
        </div>}
        {model.state !== 'no_goal' && <>
          <label className="block text-xs font-medium tracking-wide text-ink-2 uppercase" htmlFor="progress-goal">Learning goal</label>
          <select id="progress-goal" data-progress-goal value={goalId || ''} onChange={event => { setViewedGoalId(event.target.value); setExpanded(null); }}
            className="mt-1.5 h-9 w-full cursor-pointer rounded-lg border border-line bg-white px-2 text-sm text-ink">
            {model.goals.map(goal => <option key={goal.goalId} value={goal.goalId}>{goal.label}{goal.active ? ' (current)' : ''}</option>)}
          </select>
          {model.viewingOther
            ? <div data-progress-viewing className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-2">
              <span>You are viewing this goal. Your current goal is {model.active.label}.</span>
              <button type="button" data-progress-resume disabled={resuming} onClick={resume} className="cursor-pointer font-medium text-ink underline-offset-2 hover:underline disabled:opacity-50">Resume this goal</button>
            </div>
            : <p className="mt-2 text-xs text-ink-2">{model.active ? 'Your current goal' : 'Not your current goal'}</p>}
        </>}
        {model.state === 'loading' && <p role="status" data-progress-loading className="mt-4 text-sm text-ink-2">Loading your progress…</p>}
        {model.state === 'error' && <p role="alert" data-progress-error className="mt-4 flex flex-wrap items-center gap-2 text-sm text-fail">Your progress could not be loaded. Nothing has been lost.
          <button type="button" onClick={read} className="cursor-pointer font-medium text-ink underline-offset-2 hover:underline">Retry</button></p>}
        {model.state === 'ready' && <>
          <div data-progress-count className="mt-4">
            <p className="text-ink"><span className="text-3xl font-semibold">{model.count}</span> <span className="text-sm text-ink-2">of {model.total}</span></p>
            <p className="text-sm text-ink-2">skills demonstrated independently</p>
            {model.total > 0 && <div aria-hidden="true" className="mt-2 flex gap-1">{model.rows.map((row, i) => <span key={row.criterionId} className={`h-1.5 flex-1 rounded-full ${i < model.count ? 'bg-pass' : 'bg-active'}`} />)}</div>}
          </div>
          {model.failed && <p role="alert" className="mt-2 text-xs text-fail">Could not refresh; this is your last saved progress. <button type="button" onClick={read} className="cursor-pointer font-medium text-ink underline-offset-2 hover:underline">Retry</button></p>}
          {model.pending > 0 && <p role="status" data-progress-pending className="mt-2 text-xs text-ink-2">Feedback pending on {model.pending} answer{model.pending === 1 ? '' : 's'}. These counts are your last confirmed ones.</p>}
          <h3 className="mt-5 text-sm font-semibold text-ink">Your skills</h3>
          <ul className="mt-1 divide-y divide-line border-b border-line">
            {model.rows.map(row => { const Icon = ICON[row.status], open = expanded === row.criterionId; return (
              <li key={row.criterionId} data-progress-skill={row.status}>
                <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : row.criterionId)} className="flex w-full cursor-pointer items-start gap-2.5 py-3 text-left">
                  <Icon size={18} strokeWidth={1.8} aria-hidden className={`mt-0.5 shrink-0 ${TONE[row.status]}`} />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-ink">{row.label}</span><span className="block text-xs text-ink-2">{STATUS_LABEL[row.status]}</span></span>
                  <ChevronRight size={16} aria-hidden className={`mt-1 shrink-0 text-ink-3 transition-transform ${open ? 'rotate-90' : ''}`} />
                </button>
                {open && <div data-progress-why className="pb-3 pl-7 text-sm">
                  <p className="font-medium text-ink">Why this status</p>
                  <p className="mt-1 text-ink-2">{row.reason || 'Nothing submitted for this yet.'}</p>
                  <p className="mt-1 text-xs text-ink-3">Based on {row.evidence} saved answer{row.evidence === 1 ? '' : 's'}.</p>
                  <details data-progress-more className="mt-2 text-xs text-ink-2">
                    <summary className="cursor-pointer text-ink">More about this skill</summary>
                    <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                      <dt>Applied to a new case</dt><dd className="text-ink">{row.application ? 'Yes' : 'Not checked yet'}</dd>
                      <dt>Remembered later</dt><dd className="text-ink">{row.retention ? 'Yes' : 'Not checked yet'}</dd>
                    </dl>
                  </details>
                </div>}
              </li>
            ); })}
          </ul>
          {!model.nextAction && chat && model.active && !model.viewingOther && <NextActivity chat={chat} board={scope.board} goal={model.viewed} view={load.view} journey={journey} onClose={onClose} />}
          {model.nextAction && <div data-progress-next className="mt-4 rounded-xl bg-hover p-3">
            <p className="text-sm font-semibold text-ink">Next step</p>
            <p className="mt-1 text-sm text-ink">{model.nextAction.label || model.nextAction.text}</p>
            {(model.nextAction.prompt || model.nextAction.label) && <button type="button" data-progress-try onClick={() => { composer.prepare({ text: model.nextAction.prompt || model.nextAction.label }); if (!globalThis.matchMedia?.('(min-width: 64rem)').matches) onClose(); }}
              className={`${BUTTON} mt-2 bg-ink text-white`}>{model.nextAction.actionLabel || 'Try it'}</button>}
          </div>}
          <p data-progress-saved className="mt-4 text-xs text-ink-3">{model.offline ? 'Offline: this is your last saved progress' : `Based on saved answers${model.savedAt && day(model.savedAt) ? ` · updated ${day(model.savedAt)}` : ''}`}</p>
        </>}
      </div>
    </section>
  );
}
