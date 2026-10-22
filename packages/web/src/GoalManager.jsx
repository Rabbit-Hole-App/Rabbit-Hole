// Goal management in Progress (/goal and Set a goal; owner, 2026-10-21): the learner's goals on this canvas, to add, edit,
// delete or make current. Every save is one coaching action (learn-goals.js); none calls a model. A save in flight disables
// its control (a second press does nothing), a failed save keeps the learner's words with the reason, and a goal changed
// elsewhere shows its saved version beside the learner's kept edit. Delete asks once, inline. Deleting the current goal
// leaves no current goal: the others are offered to choose from, or the empty state. Drafts outlive the pane per canvas:
// Back unmounts this, and neither Back nor Close saves or discards a draft (owner 2026-10-22).
// Add goal and Save changes are the house primary Button (ui.jsx: blue, white text, hover, focus-visible and disabled).
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from './ui.jsx';
import { LABEL_MAX, OUTCOME_MAX, createGoalOps, goalWords, goalsView, listedGoals, refsToGoal } from './learn-goals.js';

const BUTTON = 'cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium disabled:cursor-default disabled:opacity-50';
const QUIET = `${BUTTON} border border-line text-ink hover:bg-hover`;
const ICON = 'flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-50';
const FIELD = 'w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-ink-3';
const drafts = new Map(); // canvas -> { add: {label, outcome}, edits: {goalId: {label, outcome, revision}}, seeded }

// scope { app, board }; coaching: the workspace's (use-learn-coaching.jsx); chat: the workspace, for the attachments a delete
// clears; seed { seq, draft }: the request that opened this (goals.open), its words put in the new goal's field once. onBack:
// returns to the Progress overview; titleRef: the pane's heading, focused after a delete.
export default function GoalManager({ scope, coaching, chat = null, seed = null, onBack, titleRef }) {
  const keep = `${scope.app}\n${scope.board}`;
  if (!drafts.has(keep)) drafts.set(keep, { add: { label: '', outcome: '' }, edits: {}, seeded: 0 });
  const saved = drafts.get(keep);
  const [add, setAdd] = useState(saved.add), [edits, setEdits] = useState(saved.edits);
  const [confirming, setConfirming] = useState(null), [pending, setPending] = useState(null);
  const [error, setError] = useState(null); // { key, message }
  useEffect(() => { drafts.set(keep, { ...drafts.get(keep), add, edits }); }, [keep, add, edits]);
  const ops = useMemo(() => createGoalOps({ act: coaching.act }), [coaching.act]);
  const addField = useRef(null);
  const view = goalsView(coaching), ready = view === 'list' || view === 'empty';
  const goals = ready ? listedGoals(coaching.state) : [], activeId = coaching.state?.activeGoalId ?? null;
  // /goal <words>: the words fill the new goal's field (not saved); /goal alone or Set a goal keeps any draft. Focus goes to
  // the field once the pane has taken its own focus.
  useEffect(() => {
    if (!seed || seed.seq <= drafts.get(keep).seeded) return;
    drafts.get(keep).seeded = seed.seq;
    if (seed.draft) setAdd(previous => ({ ...previous, label: seed.draft }));
    requestAnimationFrame(() => addField.current?.focus());
  }, [seed?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (key, action, payload) => {
    setPending(key); setError(null);
    const out = await ops.run(key, action, payload);
    setPending(current => (current === key ? null : current));
    if (!out.ok && !out.skipped) setError({ key, message: out.message, code: out.code, state: out.state });
    return out;
  };
  const submitAdd = async event => {
    event.preventDefault();
    if (!ready) return; // Enter while the saved goals load: the words stay, nothing is sent
    const { words, error: invalid } = goalWords(add);
    if (invalid) { setError({ key: 'add', message: invalid }); addField.current?.focus(); return; }
    const out = await run('add', 'create_goal', words.outcome ? words : { label: words.label });
    if (out.ok) { setAdd({ label: '', outcome: '' }); addField.current?.focus(); }
  };
  const startEdit = goal => setEdits(previous => ({ ...previous, [goal.goalId]: { label: goal.label, outcome: goal.outcome || '', revision: goal.revision } }));
  const stopEdit = goalId => setEdits(({ [goalId]: _dropped, ...rest }) => rest);
  const saveEdit = async (event, goal) => {
    event.preventDefault();
    const edit = edits[goal.goalId];
    const { words, error: invalid } = goalWords(edit);
    if (invalid) { setError({ key: `edit:${goal.goalId}`, message: invalid }); return; }
    const out = await run(`edit:${goal.goalId}`, 'edit_goal', { goalId: goal.goalId, revision: edit.revision, ...words });
    if (out.ok) return stopEdit(goal.goalId);
    // Changed elsewhere: the newer version is shown above the kept edit, and Save again saves the edit over it on purpose.
    const newer = out.code === 'goal_changed' ? listedGoals(out.state).find(g => g.goalId === goal.goalId) : null;
    if (newer) setEdits(previous => ({ ...previous, [goal.goalId]: { ...previous[goal.goalId], revision: newer.revision, newer: { label: newer.label, outcome: newer.outcome || '' } } }));
  };
  const remove = async goal => {
    const out = await run(`delete:${goal.goalId}`, 'delete_goal', { goalId: goal.goalId, revision: goal.revision });
    if (!out.ok) return;
    setConfirming(null); stopEdit(goal.goalId);
    // No attachment keeps naming the deleted goal: its Ask tutor about this chips leave the Chat and the Table of contents.
    for (const context of [chat?.context, chat?.toc?.context]) for (const ref of refsToGoal(context?.attached, goal.goalId)) context.detach(ref);
    requestAnimationFrame(() => titleRef?.current?.focus());
  };
  const errorFor = key => error?.key === key && <p role="alert" data-goal-error className="mt-1.5 text-xs text-fail">{error.message}</p>;
  const busy = key => pending === key;
  // A refusal about a goal no longer listed (deleted elsewhere) is said here, since its row is gone.
  const orphan = error && error.key !== 'add' && !goals.some(goal => error.key.endsWith(`:${goal.goalId}`));

  return (
    <div data-goal-manager className="flex flex-col gap-3">
      <Button type="button" size="sm" data-goal-back onClick={onBack} className="-ml-2 self-start"><ArrowLeft size={15} strokeWidth={1.8} aria-hidden />Back</Button>
      {orphan && <p role="alert" data-goal-error className="text-xs text-fail">{error.message}</p>}
      {goals.length > 0 && !activeId && <p role="status" data-goal-choose className="text-sm text-ink-2">No current goal. Choose one below, or add a new one.</p>}
      {view === 'loading' && <p role="status" data-goal-loading className="text-sm text-ink-2">Loading your goals</p>}
      {view === 'error' && <p role="alert" data-goal-load-error className="flex flex-wrap items-center gap-2 text-sm text-fail">Your goals could not be loaded. Nothing has been lost.
        <button type="button" onClick={coaching.retry} className="cursor-pointer font-medium text-ink underline-offset-2 hover:underline">Retry</button></p>}
      {view === 'empty' && <p data-goal-empty className="text-sm text-ink-2">No learning goals yet. Add one: what do you want to be able to do?</p>}
      {goals.length > 0 && <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
        {goals.map(goal => {
          const current = goal.goalId === activeId, edit = edits[goal.goalId];
          return (
            <li key={goal.goalId} data-goal-item={goal.goalId} data-goal-current={current || undefined} className="px-3 py-2.5">
              {edit
                ? <form onSubmit={event => saveEdit(event, goal)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); stopEdit(goal.goalId); } }} className="flex flex-col gap-1.5">
                  {edit.newer && <p role="status" data-goal-conflict className="rounded-md bg-hover px-2 py-1.5 text-xs text-ink-2">Saved elsewhere as “{edit.newer.label}”. Save to replace it with your edit, or Cancel to keep it.</p>}
                  <label className="text-xs font-medium text-ink-2" htmlFor={`goal-label-${goal.goalId}`}>Goal</label>
                  <input id={`goal-label-${goal.goalId}`} data-goal-edit-label autoFocus maxLength={LABEL_MAX} value={edit.label} onChange={event => setEdits(previous => ({ ...previous, [goal.goalId]: { ...previous[goal.goalId], label: event.target.value } }))} className={FIELD} />
                  <label className="text-xs font-medium text-ink-2" htmlFor={`goal-outcome-${goal.goalId}`}>What would success look like? (optional)</label>
                  <textarea id={`goal-outcome-${goal.goalId}`} rows={2} maxLength={OUTCOME_MAX} value={edit.outcome} onChange={event => setEdits(previous => ({ ...previous, [goal.goalId]: { ...previous[goal.goalId], outcome: event.target.value } }))} className={`${FIELD} resize-none`} />
                  <div className="flex gap-2">
                    <Button type="submit" variant="primary" data-goal-save disabled={busy(`edit:${goal.goalId}`)} aria-busy={busy(`edit:${goal.goalId}`) || undefined}>{busy(`edit:${goal.goalId}`) ? 'Saving' : 'Save changes'}</Button>
                    <button type="button" onClick={() => stopEdit(goal.goalId)} className={QUIET}>Cancel</button>
                  </div>
                  {errorFor(`edit:${goal.goalId}`)}
                </form>
                : <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words text-ink">{goal.label}</p>
                    {goal.outcome && <p className="mt-0.5 text-xs break-words text-ink-2">{goal.outcome}</p>}
                    {current
                      ? <p className="mt-1 flex items-center gap-1 text-xs font-medium text-pass"><Check size={13} aria-hidden />Current goal</p>
                      : <button type="button" data-goal-switch disabled={busy(`switch:${goal.goalId}`)} onClick={() => run(`switch:${goal.goalId}`, 'activate_goal', { goalId: goal.goalId })}
                        className="mt-1 cursor-pointer text-xs font-medium text-ink underline-offset-2 hover:underline disabled:opacity-50">{busy(`switch:${goal.goalId}`) ? 'Switching' : 'Make this my current goal'}</button>}
                  </div>
                  <button type="button" data-goal-edit aria-label={`Edit ${goal.label}`} title="Edit" onClick={() => { setConfirming(null); startEdit(goal); }} className={ICON}><Pencil size={15} strokeWidth={1.8} aria-hidden /></button>
                  <button type="button" data-goal-delete aria-label={`Delete ${goal.label}`} title="Delete" onClick={() => setConfirming(goal.goalId)} className={ICON}><Trash2 size={15} strokeWidth={1.8} aria-hidden /></button>
                </div>}
              {!edit && confirming === goal.goalId && <div role="group" aria-label={`Delete ${goal.label}?`} data-goal-confirm onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setConfirming(null); } }}
                className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-hover px-2 py-1.5">
                <span className="min-w-0 flex-1 text-xs text-ink">Delete this goal? Its saved answers stay recorded.</span>
                <button type="button" data-goal-confirm-delete autoFocus disabled={busy(`delete:${goal.goalId}`)} onClick={() => remove(goal)} className={`${BUTTON} border border-fail text-fail hover:bg-fail/10`}>{busy(`delete:${goal.goalId}`) ? 'Deleting' : 'Delete'}</button>
                <button type="button" onClick={() => setConfirming(null)} className={QUIET}>Cancel</button>
              </div>}
              {!edit && (errorFor(`switch:${goal.goalId}`) || errorFor(`delete:${goal.goalId}`))}
            </li>
          );
        })}
      </ul>}
      <form data-goal-add onSubmit={submitAdd} className="flex flex-col gap-1.5">
        <label className="text-xs font-medium tracking-wide text-ink-2 uppercase" htmlFor="goal-new">New goal</label>
        <input id="goal-new" ref={addField} data-goal-new maxLength={LABEL_MAX} placeholder="Learn logistic regression" value={add.label} onChange={event => setAdd(previous => ({ ...previous, label: event.target.value }))} className={FIELD} />
        <label className="mt-1 text-xs font-medium text-ink-2" htmlFor="goal-new-outcome">What would success look like? (optional)</label>
        <textarea id="goal-new-outcome" data-goal-new-outcome rows={2} maxLength={OUTCOME_MAX} value={add.outcome} onChange={event => setAdd(previous => ({ ...previous, outcome: event.target.value }))} className={`${FIELD} resize-none`} />
        <div><Button type="submit" variant="primary" data-goal-add-save disabled={busy('add') || !ready} aria-busy={busy('add') || undefined}><Plus size={15} aria-hidden />{busy('add') ? 'Saving' : 'Add goal'}</Button></div>
        <p className="text-xs text-ink-3">A new goal becomes your current goal.</p>
        {errorFor('add')}
      </form>
    </div>
  );
}
