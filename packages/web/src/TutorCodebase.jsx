// The Tutor's codebase route in the Chat (C:/s/spec/tutor-workflow/draft.md "Starting from a codebase", Task 12). On a
// project canvas, selected, enabled, unpaused Tutor with no goal yet shows "What would you like to do with this codebase?"
// with the five goals, Learn something else, and the composer for anything typed: typing skips the menu. A chosen goal saves
// the goal and its first activity through POST /api/learn/codebase (no model, no execution) and places the first two cited
// source cards on the canvas. While a codebase activity is current, its sources stay listed with their commit, what each
// question is about, the inferred links marked tentative, what was left out, and "Not run here"; when the repository moved
// on, the cited files that changed are marked and the learner chooses the saved revision or an updated activity.
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { codeRef } from './chat-sources.js';
import { coachingCanvas } from './learn-coaching-client.js';
import { CODEBASE_GOALS, CODEBASE_PROMPT, EVIDENCE_LABEL, NOT_RUN_NOTE, OMISSION_TEXT, QUESTION_LABEL, SOMETHING_ELSE, goalOf, isRepositorySource, showCodebaseMenu } from './learn-codebase-goals.js';

const CHOICE = 'cursor-pointer rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-ink hover:bg-hover disabled:cursor-default disabled:opacity-50';
const LINK = 'cursor-pointer font-medium text-ink underline-offset-2 hover:underline disabled:cursor-default disabled:opacity-50';
const OMITTED = { ...OMISSION_TEXT, not_indexed: 'not indexed', outside_snapshot: 'outside this repository snapshot: not inspected', not_shown: 'related, not shown yet', other_commit: 'selected at another commit', other_repository: 'not from this repository', not_in_snapshot: 'not in this snapshot', deleted: 'deleted', not_read: 'could not be read', path_too_long: 'path too long' };
const short = commit => String(commit || '').slice(0, 7);
const newId = () => `cb-${crypto.randomUUID()}`;

// useTutorCodebase({ chat, entry, typing }) -> { menu, view }. menu: the codebase menu stands in for the general welcome.
export function useTutorCodebase({ chat, entry, typing = false }) {
  const { coaching } = chat, board = chat.board || 'main', state = coaching.state;
  const activity = state?.activities?.find(a => a.activityId === state.activeActivityId && a.goalId === state.activeGoalId && a.checkpoint?.codebase) || null;
  // Read only when it can matter: the Tutor would offer something with no goal, or a codebase activity is current.
  const wanted = coachingCanvas(chat.canvas) && coaching.status === 'ready' && (['welcome', 'existing_work'].includes(entry.kind) || !!activity);
  const key = `${chat.canvas}|${activity?.activityId || ''}`;
  const [info, setInfo] = useState(null);
  const [dismissed, setDismissed] = useState(null); // the canvas whose menu the learner set aside (Learn something else)
  const [kept, setKept] = useState(null); // the activity kept at its saved revision
  const [pending, setPending] = useState(null), [question, setQuestion] = useState(''), [busy, setBusy] = useState(false), [note, setNote] = useState(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!wanted) return undefined;
    let live = true;
    api(`/api/learn/codebase?app=${encodeURIComponent(chat.canvas)}&board=${encodeURIComponent(board)}`)
      .then(out => { if (live) setInfo({ key, ...out }); }, () => { if (live) setInfo({ key, repository: null, activity: null }); });
    return () => { live = false; };
  }, [key, wanted, reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = info?.key === key ? info : null, repository = current?.repository || null;
  const menu = showCodebaseMenu({ entry, repository, dismissed: dismissed === chat.canvas, typing });

  // One write on the confirmed revision; a revision another tab moved on is retried once on the newer one.
  const post = async body => {
    const send = revision => api('/api/learn/codebase', { method: 'POST', body: JSON.stringify({ app: chat.canvas, board, actionId: newId(), expectedRevision: revision, ...body }) });
    try { return await send(state?.revision ?? 0); } catch (error) { if (error?.status === 409 && error.data?.state) return send(error.data.state.revision); throw error; }
  };
  const start = async (goalId, text) => {
    setBusy(true); setNote(null);
    try {
      const out = await post({ action: 'start', goal: goalId, question: text });
      if (out.route === 'not_found') { setNote(`I couldn't find that in ${repository.repo} at ${short(repository.commit)}. Try other words, or open Files and pick the code.`); return; }
      setPending(null); setQuestion('');
      // The first two cited source files go on the canvas as code cards at this commit (LearnPage small:code-card); nothing is sent.
      for (const citation of out.map.citations.filter(c => out.map.nodes.find(n => n.path === c.path)?.role === 'source').slice(0, 2)) {
        window.dispatchEvent(new CustomEvent('small:code-card', { detail: { text: citation.text, path: citation.path, start: citation.start, end: citation.end, commit: citation.commit, repo: out.map.repository.repo } }));
      }
      await coaching.reload?.();
      chat.composer?.focus?.();
    } catch (error) {
      setNote(error?.data?.error === 'question_required' ? error.data.clarify : 'That could not be started. Nothing was saved; try again.');
    } finally { setBusy(false); }
  };
  const refresh = async () => {
    setBusy(true); setNote(null);
    try { await post({ action: 'refresh', activityId: activity.activityId }); await coaching.reload?.(); setReload(n => n + 1); }
    catch { setNote('The activity could not be updated. Your saved revision and your answer are unchanged.'); }
    finally { setBusy(false); }
  };

  const goal = pending ? goalOf(pending) : null;
  const menuView = menu && <section data-codebase-menu aria-label="Tutor" className="mb-2 flex flex-col gap-2 rounded-xl border border-line bg-white p-3">
    <p className="text-sm text-ink">{CODEBASE_PROMPT}</p>
    {!goal && <div className="flex flex-wrap gap-1.5">
      {CODEBASE_GOALS.map(g => <button key={g.id} type="button" data-codebase-goal={g.id} disabled={busy} onClick={() => (g.clarify ? setPending(g.id) : start(g.id, ''))} className={CHOICE}>{g.label}</button>)}
      <button type="button" data-codebase-other onClick={() => setDismissed(chat.canvas)} className={CHOICE}>{SOMETHING_ELSE}</button>
      <button type="button" data-tutor-own-work onClick={() => { setDismissed(chat.canvas); coaching.dispatch({ type: 'continue_own_work' }); }} className={CHOICE}>Continue my own work</button>
      <button type="button" data-tutor-not-now onClick={() => coaching.dispatch({ type: 'not_now' })} className={CHOICE}>Not now</button>
    </div>}
    {goal && <form className="flex flex-col gap-1.5" onSubmit={event => { event.preventDefault(); if (question.trim()) start(goal.id, question.trim()); }}>
      <label className="text-sm text-ink" htmlFor="codebase-focus">{goal.clarify}</label>
      <input id="codebase-focus" data-codebase-question value={question} maxLength={500} disabled={busy} onChange={event => setQuestion(event.target.value)} className="w-full rounded-lg border border-line px-2 py-1.5 text-sm text-ink" />
      <div className="flex flex-wrap gap-1.5">
        <button type="submit" data-codebase-start disabled={busy || !question.trim()} className={CHOICE}>{busy ? 'Reading the source…' : 'Start'}</button>
        <button type="button" onClick={() => { setPending(null); setNote(null); }} disabled={busy} className={CHOICE}>Back</button>
      </div>
    </form>}
    <p className="text-xs text-ink-2">Or type any question below; it does not need to be about this code.</p>
    {note && <p role="alert" data-codebase-note className="text-xs text-fail">{note}</p>}
  </section>;

  const cb = activity?.checkpoint?.codebase, drift = current?.activity?.activityId === activity?.activityId ? current.activity : null;
  const status = new Map((drift?.items || []).map(item => [item.path, item.status]));
  const stale = (drift?.stale || []).length > 0 && kept !== activity?.activityId;
  const open = ref => {
    const { path, start: from, end } = ref.locator;
    const event = new CustomEvent('small:open-code', { detail: { app: cb.app, commit: ref.version, path, start: from, end }, cancelable: true });
    window.dispatchEvent(event);
    // Files shows the current commit only; an older recorded version opens on GitHub at that exact commit.
    if (!event.defaultPrevented) window.open(`https://github.com/${cb.repo}/blob/${ref.version}/${path.split('/').map(encodeURIComponent).join('/')}#L${from}-L${end}`, '_blank', 'noopener');
  };
  const counts = Object.entries(cb?.omissionCounts || {});
  const sourcesView = cb && <section data-codebase-sources aria-label="Sources for this activity" className="mb-2 flex flex-col gap-1.5 rounded-xl border border-line bg-white p-3 text-xs text-ink-2">
    <p className="font-medium text-ink" data-codebase-question-kind={cb.question}>{QUESTION_LABEL[cb.question]} · {cb.repo} at {short(cb.commit)}</p>
    <ul className="flex flex-col gap-1">
      {activity.sourceRefs.filter(isRepositorySource).map(ref => <li key={ref.id} data-codebase-source={ref.locator.path} data-codebase-status={status.get(ref.locator.path) || 'unknown'} className="flex flex-wrap items-center gap-x-2">
        <button type="button" onClick={() => open(ref)} className={`${LINK} font-mono`}>{ref.locator.path}:{ref.locator.start}-{ref.locator.end}</button>
        <span>{ref.locator.role}</span>
        {['changed', 'deleted'].includes(status.get(ref.locator.path)) && <span className="text-fail">{status.get(ref.locator.path)} since {short(ref.version)}</span>}
        <button type="button" data-codebase-ask onClick={() => chat.addToChat?.(codeRef({ repo: cb.repo, commit: ref.version, path: ref.locator.path, start: ref.locator.start, end: ref.locator.end }))} className={LINK}>Ask about this</button>
      </li>)}
    </ul>
    {cb.edges?.length > 0 && <ul aria-label="Links between these files" className="flex flex-col gap-0.5">
      {cb.edges.map(edge => <li key={`${edge.from}>${edge.to}>${edge.relation}`} data-codebase-edge={edge.status}>{edge.from} → {edge.to} · {edge.status === 'supported' ? 'read from the code' : 'tentative: inferred, not confirmed'}</li>)}
    </ul>}
    {counts.length > 0 && <details data-codebase-omissions>
      <summary className="cursor-pointer">Not included: {counts.map(([reason, n]) => `${n} ${OMITTED[reason] || reason}`).join('; ')}</summary>
      <ul className="mt-1 flex flex-col gap-0.5">{(cb.omissions || []).map(o => <li key={`${o.path}|${o.reason}`}>{o.path}: {OMITTED[o.reason] || o.reason}{o.detail ? ` (${o.detail})` : ''}</li>)}</ul>
    </details>}
    <p data-codebase-evidence>{EVIDENCE_LABEL.inspection} at {short(cb.commit)}. {NOT_RUN_NOTE}</p>
    {stale && <div role="status" data-codebase-drift className="flex flex-col gap-1.5 rounded-lg bg-hover p-2 text-ink">
      <p>The repository changed since this activity ({short(cb.commit)} → {short(drift.commit)}): {drift.stale.join(', ')}. Your submitted answers stay with {short(cb.commit)}.</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" data-codebase-keep onClick={() => setKept(activity.activityId)} className={CHOICE}>Continue with the saved revision</button>
        <button type="button" data-codebase-refresh disabled={busy} onClick={refresh} className={CHOICE}>Update the activity</button>
      </div>
    </div>}
    {!menu && note && <p role="alert" data-codebase-note className="text-fail">{note}</p>}
  </section>;
  return { menu, view: <>{menuView}{sourcesView}</> };
}
