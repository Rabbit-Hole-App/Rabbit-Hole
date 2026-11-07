// The Tutor's codebase route in the Chat (C:/s/spec/tutor-workflow/draft.md "Starting from a codebase", Task 12). On a
// project canvas, selected, enabled, unpaused Tutor with no goal yet shows "What would you like to do with this codebase?"
// with the five goals, Learn something else, and the composer for anything typed: typing skips the menu. A chosen goal saves
// the goal and its first activity through POST /api/learn/codebase (no model, no execution) and places the first two cited
// source cards on the canvas. Under a codebase activity's question (CodebaseSources, owner brief 2026-10-21 "Sources"): Start
// here, the most relevant source, and More relevant code, as chips that focus a code card already on the canvas or open the
// code reader at the cited lines; the commit, hashes, execution status, the full source list, the inferred links and what was
// left out stay in a collapsed Source details. When the repository moved on, the cited files that changed are marked and the
// learner chooses the saved revision or an updated activity.
import { useEffect, useState } from 'react';
import { FileCode } from 'lucide-react';
import { api } from './api.js';
import { codeRef } from './chat-sources.js';
import { coachingCanvas } from './learn-coaching-client.js';
import { CODEBASE_GOALS, CODEBASE_PROMPT, EVIDENCE_LABEL, NOT_RUN_NOTE, OMISSION_TEXT, QUESTION_LABEL, SOMETHING_ELSE, goalOf, isCitation, isRepositorySource, linesText, showCodebaseMenu, sourceLabel, startSource } from './learn-codebase-goals.js';

const CHOICE = 'cursor-pointer rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-ink hover:bg-hover disabled:cursor-default disabled:opacity-50';
const CHIP = 'inline-flex max-w-full cursor-pointer items-center gap-1 rounded-full border border-line bg-white px-2 py-0.5 text-xs font-medium text-ink hover:bg-hover';
const LINK = 'cursor-pointer font-medium text-ink underline-offset-2 hover:underline disabled:cursor-default disabled:opacity-50';
const OMITTED = { ...OMISSION_TEXT, not_indexed: 'not indexed', outside_snapshot: 'outside this repository snapshot: not inspected', not_shown: 'related, not shown yet', other_commit: 'selected at another commit', other_repository: 'not from this repository', not_in_snapshot: 'not in this snapshot', deleted: 'deleted', not_read: 'could not be read', path_too_long: 'path too long' };
const short = commit => String(commit || '').slice(0, 7);
const newId = () => `cb-${crypto.randomUUID()}`;

// One write to POST /api/learn/codebase on the confirmed revision; a revision another tab moved on is retried once on the newer one.
export async function codebasePost(chat, board, body) {
  const send = revision => api('/api/learn/codebase', { method: 'POST', body: JSON.stringify({ app: chat.canvas, board, actionId: newId(), expectedRevision: revision, ...body }) });
  try { return await send(chat.coaching.state?.revision ?? 0); } catch (error) { if (error?.status === 409 && error.data?.state) return send(error.data.state.revision); throw error; }
}

// A code card already on the canvas showing these lines of this file at this commit: a Tutor- or Files-placed snippet
// (learn-file-import.js pasteBlock sources) or a repository code card (code-card.js).
const showsLines = (block, repo, commit, path, start, end) => {
  const overlap = (from, to) => from <= end && start <= to;
  if (block.type === 'repo-code') { const s = block.source || {}; return s.kind === 'repository' && s.repo === repo && s.commit === commit && s.path === path && (!s.start || overlap(s.start, s.end || s.start)); }
  return (block.sources || []).some(s => s.kind === 'code' && s.repo === repo && s.revision === commit && s.path === path && Array.isArray(s.lines) && overlap(s.lines[0], s.lines[1]));
};
// A source chip: focus the code card that shows it, else the code reader at the cited lines; never a new card. A citation pill
// (reader: true) always reopens its exact lines in the reader.
export function openCited(chat, repo, ref, { reader = false } = {}) {
  const { path, start, end } = ref.locator;
  const card = !reader && (chat.canvasOps?.tutorCanvas?.()?.blocks?.() || []).find(block => showsLines(block, repo, ref.version, path, start, end));
  if (card) chat.canvasOps.locate(card.id);
  else chat.openSource?.(codeRef({ repo, commit: ref.version, path, start, end }));
}

// useTutorCodebase({ chat, entry, typing }) -> { menu, view }. menu: the codebase menu stands in for the general welcome.
export function useTutorCodebase({ chat, entry, typing = false }) {
  const { coaching } = chat, board = chat.board || 'main';
  // Read only when it can matter: the Tutor would offer something with no goal.
  const wanted = coachingCanvas(chat.canvas) && coaching.status === 'ready' && ['welcome', 'existing_work'].includes(entry.kind);
  const [info, setInfo] = useState(null);
  const [dismissed, setDismissed] = useState(null); // the canvas whose menu the learner set aside (Learn something else)
  const [pending, setPending] = useState(null), [question, setQuestion] = useState(''), [busy, setBusy] = useState(false), [note, setNote] = useState(null);
  useEffect(() => {
    if (!wanted) return undefined;
    let live = true;
    api(`/api/learn/codebase?app=${encodeURIComponent(chat.canvas)}&board=${encodeURIComponent(board)}`)
      .then(out => { if (live) setInfo({ key: chat.canvas, ...out }); }, () => { if (live) setInfo({ key: chat.canvas, repository: null, activity: null }); });
    return () => { live = false; };
  }, [chat.canvas, wanted]); // eslint-disable-line react-hooks/exhaustive-deps
  const repository = info?.key === chat.canvas ? info.repository : null;
  const menu = showCodebaseMenu({ entry, repository, dismissed: dismissed === chat.canvas, typing });

  const start = async (goalId, text) => {
    setBusy(true); setNote(null);
    try {
      const out = await codebasePost(chat, board, { action: 'start', goal: goalId, question: text });
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

  const goal = pending ? goalOf(pending) : null;
  const view = menu && <section data-codebase-menu aria-label="Tutor" className="mb-2 flex flex-col gap-2 rounded-xl border border-line bg-white p-3">
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
        <button type="submit" data-codebase-start disabled={busy || !question.trim()} className={CHOICE}>{busy ? 'Reading the source' : 'Start'}</button>
        <button type="button" onClick={() => { setPending(null); setNote(null); }} disabled={busy} className={CHOICE}>Back</button>
      </div>
    </form>}
    <p className="text-xs text-ink-2">Or type any question below; it does not need to be about this code.</p>
    {note && <p role="alert" data-codebase-note className="text-xs text-fail">{note}</p>}
  </section>;
  return { menu, view };
}

// Under a codebase activity's question (TutorActivity.jsx): its sources, Source details and, when the repository moved on, the
// drift choice. Reads GET /api/learn/codebase for drift only; nothing here calls a model or runs code.
export function CodebaseSources({ chat, board, activity }) {
  const cb = activity.checkpoint.codebase;
  const [drift, setDrift] = useState(null);
  const [kept, setKept] = useState(null); // the activity kept at its saved revision
  const [busy, setBusy] = useState(false), [note, setNote] = useState(null), [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    api(`/api/learn/codebase?app=${encodeURIComponent(chat.canvas)}&board=${encodeURIComponent(board)}`)
      .then(out => { if (live) setDrift(out.activity?.activityId === activity.activityId ? out.activity : null); }, () => { if (live) setDrift(null); });
    return () => { live = false; };
  }, [chat.canvas, activity.activityId, reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = async () => {
    setBusy(true); setNote(null);
    try { await codebasePost(chat, board, { action: 'refresh', activityId: activity.activityId }); await chat.coaching.reload?.(); setReload(n => n + 1); }
    catch { setNote('The activity could not be updated. Your saved revision and your answer are unchanged.'); }
    finally { setBusy(false); }
  };
  const status = new Map((drift?.items || []).map(item => [item.path, item.status]));
  const stale = (drift?.stale || []).length > 0 && kept !== activity.activityId;
  // Files at this commit, else GitHub at that exact commit (Files shows the current commit only).
  const openFiles = ref => {
    const { path, start: from, end } = ref.locator;
    const event = new CustomEvent('small:open-code', { detail: { app: cb.app, commit: ref.version, path, start: from, end }, cancelable: true });
    window.dispatchEvent(event);
    if (!event.defaultPrevented) window.open(`https://github.com/${cb.repo}/blob/${ref.version}/${path.split('/').map(encodeURIComponent).join('/')}#L${from}-L${end}`, '_blank', 'noopener');
  };
  const counts = Object.entries(cb.omissionCounts || {});
  const cited = activity.sourceRefs.filter(ref => isRepositorySource(ref) && !isCitation(ref));
  const first = startSource(cited, cb.goal), more = cited.filter(ref => ref !== first);
  const chip = ref => <button key={ref.id} type="button" data-codebase-chip={ref.locator.path} data-codebase-chip-lines={`${ref.locator.start}-${ref.locator.end}`}
    title={`${ref.locator.path}, ${linesText(ref.locator.start, ref.locator.end)}`} onClick={() => openCited(chat, cb.repo, ref)} className={CHIP}>
    <FileCode size={12} aria-hidden className="shrink-0 text-ink-3" /><span className="truncate">{sourceLabel(ref)}</span></button>;
  return <div data-codebase-sources className="flex min-w-0 flex-col gap-1.5 text-xs text-ink-2">
    {first && <div data-codebase-start-here className="flex min-w-0 flex-wrap items-center gap-1.5"><span>Start here:</span>{chip(first)}</div>}
    {more.length > 0 && <details data-codebase-more className="min-w-0">
      <summary className="cursor-pointer font-medium text-ink">More relevant code ({more.length})</summary>
      <div className="mt-1.5 flex min-w-0 flex-wrap gap-1.5">{more.map(chip)}</div>
    </details>}
    <details data-codebase-map className="min-w-0">
      <summary className="cursor-pointer font-medium text-ink" data-codebase-question-kind={cb.question}>Source details</summary>
      <div className="mt-1.5 flex min-w-0 flex-col gap-1.5 break-words">
        <p data-codebase-revision={cb.commit}>{QUESTION_LABEL[cb.question]} · {cb.repo} at commit <span className="font-mono break-all">{cb.commit}</span> · {cited.length} source{cited.length === 1 ? '' : 's'} · <span data-codebase-execution={cb.execution}>{EVIDENCE_LABEL.execution}</span></p>
        <ul className="flex flex-col gap-1">
          {cited.map(ref => <li key={ref.id} data-codebase-source={ref.locator.path} data-codebase-status={status.get(ref.locator.path) || 'unknown'} className="flex min-w-0 flex-wrap items-center gap-x-2">
            <button type="button" data-codebase-open onClick={() => openFiles(ref)} className={`${LINK} font-mono break-all`}>{ref.locator.path}:{ref.locator.start}-{ref.locator.end}</button>
            <span>{ref.locator.role}</span>
            <span data-codebase-hash={ref.hash} title={`SHA-256 of the whole file at ${short(ref.version)}: ${ref.hash}`} className="font-mono text-ink-3">sha256 {String(ref.hash).slice(0, 12)}</span>
            {['changed', 'deleted'].includes(status.get(ref.locator.path)) && <span className="text-fail">{status.get(ref.locator.path)} since {short(ref.version)}</span>}
            <button type="button" data-codebase-ask onClick={() => chat.addToChat?.(codeRef({ repo: cb.repo, commit: ref.version, path: ref.locator.path, start: ref.locator.start, end: ref.locator.end }))} className={LINK}>Ask about this</button>
          </li>)}
        </ul>
        {cb.edges?.length > 0 && <ul aria-label="Links between these files" className="flex flex-col gap-0.5">
          {cb.edges.map(edge => <li key={`${edge.from}>${edge.to}>${edge.relation}`} data-codebase-edge={edge.status} className="break-all">{edge.from} → {edge.to} · {edge.status === 'supported' ? 'read from the code' : 'tentative: inferred, not confirmed'}</li>)}
        </ul>}
        {counts.length > 0 && <details data-codebase-omissions>
          <summary className="cursor-pointer">Not included: {counts.map(([reason, n]) => `${n} ${OMITTED[reason] || reason}`).join('; ')}</summary>
          <ul className="mt-1 flex flex-col gap-0.5">{(cb.omissions || []).map(o => <li key={`${o.path}|${o.reason}`} className="break-all">{o.path}: {OMITTED[o.reason] || o.reason}{o.detail ? ` (${o.detail})` : ''}</li>)}</ul>
        </details>}
        <p data-codebase-evidence>{EVIDENCE_LABEL.inspection} at {short(cb.commit)}. {NOT_RUN_NOTE}</p>
      </div>
    </details>
    {stale && <div role="status" data-codebase-drift className="flex flex-col gap-1.5 rounded-lg bg-hover p-2 text-ink">
      <p>The repository changed since this activity ({short(cb.commit)} → {short(drift.commit)}): {drift.stale.join(', ')}. Your submitted answers stay with {short(cb.commit)}.</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" data-codebase-keep onClick={() => setKept(activity.activityId)} className={CHOICE}>Continue with the saved revision</button>
        <button type="button" data-codebase-refresh disabled={busy} onClick={refresh} className={CHOICE}>Update the activity</button>
      </div>
    </div>}
    {note && <p role="alert" data-codebase-note className="text-fail">{note}</p>}
  </div>;
}
