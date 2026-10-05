// Learning journeys in the Learn composer (docs/features/adaptive-learning-path-v1-architecture.md §6.1, §7; LP1 Task 8):
// useJourney holds the board's journey from /api/learn/journey, TutorPromptTray renders its tray in the LearnSlash slot
// above the one composer, and routeJourneyTurn sends a typed turn through the shared resolver extension's rules 1-4
// (learner-intent-journey.js, R7), then rule 5 (the route's `resolve`). Punctuation never decides (R1).
// ponytail: the tray path only. Task 12 moves the resolver to the top of useTutor.turn() (typed and voice turns), swaps
// answerProbeText for a runTurn({ plan: false }) turn and speaks the prompt; Task 9 materializes the current section.
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, apiFetch } from './api.js';
import { interactionInterpretation, journeyIntent } from '../../control-plane/src/learner-intent-journey.js';

const STARTS = new Set(['learning_journey', 'focused_skill', 'quick_overview', 'fast_start']);
// A start the route refuses as no journey (a question after all, a repository course): the normal responder answers.
const NOT_HERE = new Set(['not_a_learning_journey', 'journeys_on_canvases_only']);
const BUSY = 'Working on it...';
const CLARIFY = [{ id: 'answer', label: 'Answer the question' }, { id: 'edit', label: 'Change the path' }, { id: 'tutor', label: 'Ask the Tutor' }];
// The composer's suggestion pills (ask.jsx), dimmed while the tray works.
const PILL = 'cursor-pointer rounded-full border border-line bg-white px-3 py-1 text-left text-[13px] text-ink-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-line-strong hover:text-ink disabled:cursor-default disabled:opacity-50';

// §7.2: rules 1-4 decide when they match; otherwise an open tray needs the model (rule 5) and no tray means the turn is
// the normal responder's.
export function routeJourneyTurn(raw, tray, resolveRules = interactionInterpretation) {
  return resolveRules(raw, tray) || { kind: tray ? 'needs_model' : 'unrelated_question' };
}

// The Learn composer starts a journey (§6.1) only on a canvas with no live journey (no journeyStarter) and no Tutor.
export const journeyStartsHere = (raw, { tutor = null, journeyStarter = null } = {}) => !tutor && !!journeyStarter && STARTS.has(journeyIntent(raw).kind);

// One POST with the journey's revision. A 409 `revision` (another tab moved it) carries the re-read journey: the same
// action, answer text included, is replayed once on that revision; whatever the replay gets is final.
export async function journeyRequest(body, revision, send) {
  const first = await send(revision == null ? body : { ...body, revision });
  const reread = first.status === 409 && first.d?.error === 'revision' ? first.d.journey?.revision : null;
  return reread == null ? first : send({ ...body, revision: reread });
}

// What the tray slot shows: a local tray over the server's (recomputed by trayFor after every event and reload, so a
// reload never asks twice), with the busy and error lines on top. A busy or failed action with no tray still shows.
export function shownTray(server, local, busy, error) {
  const tray = local || server || (busy || error ? { id: 'status', mode: null, options: [], free_text: false, dismissible: false } : null);
  return tray && (busy || error) ? { ...tray, ...(busy ? { busy } : {}), ...(error ? { error } : {}) } : tray;
}

// Rule 5's request: the open tray as the route bounds it (prompt 300, 6 options, id 40, label 120, text 1000) and no
// other field.
export const resolveBody = (text, tray) => ({ action: 'resolve', text: String(text).slice(0, 1000), tray: {
  mode: tray?.mode ?? null, prompt: String(tray?.prompt ?? '').slice(0, 300),
  options: (tray?.options || []).slice(0, 6).map(({ id, label }) => ({ id: String(id).slice(0, 40), label: String(label).slice(0, 120) })) } });

// §6.1: a broad intent on a board that already has a live journey asks first; the server never holds two (409).
export function liveJourneyTray(journey, text) {
  const topic = journey?.request?.topic || 'this path', next = journeyIntent(text).topic || 'a new path';
  return { id: 'clarification:live', mode: 'clarification', prompt: `Continue ${topic} or start ${next}?`,
    options: [{ id: 'continue', label: `Continue ${topic}` }, { id: 'start_new', label: `Start ${next}` }], free_text: false, dismissible: true, text };
}

// §7.1. Free text always comes from the composer below, so the tray never holds an input.
export function TutorPromptTray({ tray, onOption }) {
  if (!tray) return null;
  const busy = !!tray.busy;
  // A failed tray's retry is the error line's button, shown once.
  const options = tray.error ? tray.options.filter(option => option.id !== 'retry') : tray.options;
  return (
    <div data-tutor-prompt-tray="" data-mode={tray.mode || undefined} role="group" aria-label={tray.prompt || tray.busy || tray.error?.message}
      className="mb-1.5 flex w-fit max-w-full flex-col items-start gap-2 rounded-lg border border-[#2383e2]/30 bg-[#2383e2]/[0.07] px-3 py-2 text-sm">
      {tray.prompt && <p className="text-ink">{tray.prompt}</p>}
      {options.length > 0 && <div className="flex flex-wrap gap-1.5">
        {options.map(option => <button key={option.id} type="button" data-tray-option={option.id} disabled={busy} onClick={() => onOption(option.id)} className={PILL}>{option.label}</button>)}
      </div>}
      {busy && <p data-tray-busy role="status" className="flex items-center gap-2 text-ink-2"><Loader2 size={14} className="shrink-0 animate-spin text-accent" />{tray.busy}</p>}
      {tray.error && !busy && <div data-tray-error role="alert" className="flex flex-wrap items-center gap-2 text-red-700">
        <span className="min-w-0">{tray.error.message}</span>
        <button type="button" data-tray-retry onClick={() => onOption('retry')} className={PILL}>Try again</button>
      </div>}
    </div>
  );
}

const EMPTY = { journey: null, path: null, tray: null };
const OFF = { ...EMPTY, trayProps: null, busy: false, start: null };

// The board's journey. canvasApi (passed by LearnPage) is Task 9's, for the section materializer.
export function useJourney({ app, board, access, enabled = true }) {
  const [data, setData] = useState(EMPTY);
  const latest = useRef(EMPTY); // the newest revision for a request sent after an await
  const [local, setLocal] = useState(null); // a client-only tray: clarification, continue-or-start, the start's topic
  const [dismissed, setDismissed] = useState(null); // a server tray cancelled where the journey has no step to skip
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null); // { message, again }
  const where = { app: access?.app || app?.name, board };
  const take = d => { latest.current = { journey: d.journey ?? null, path: d.path ?? null, tray: d.tray ?? null }; setData(latest.current); };
  const refresh = (live = () => true) => api(`/api/learn/journey?app=${encodeURIComponent(where.app)}&board=${encodeURIComponent(board)}`)
    .then(d => live() && take(d)).catch(() => {}); // no journey here (a refused app, a pending hole): the Learn chat answers as before

  useEffect(() => {
    if (!enabled || !where.app) return;
    let live = true;
    take(EMPTY); setLocal(null); setDismissed(null); setError(null);
    refresh(() => live);
    return () => { live = false; };
  }, [enabled, where.app, board]); // eslint-disable-line react-hooks/exhaustive-deps
  // A planner call started elsewhere (another tab, or before a reload) shows the busy tray until the journey moves on.
  // ponytail: a 5 s poll while pending; a push channel if journeys ever get many watchers.
  const pending = enabled && data.journey?.pending;
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => refresh(), 5000);
    return () => clearInterval(timer);
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  const server = data.tray && data.tray.id !== dismissed ? data.tray : null;
  const tray = shownTray(server, local, busy, error);

  // Every action's body and reply. A reply that carries the journey (success, 409, a 502 planner failure) replaces it.
  const run = async (body, { revision = latest.current.journey?.revision } = {}) => {
    setBusy(BUSY); setError(null);
    try {
      const out = await journeyRequest({ ...where, ...body }, revision, async payload => {
        const r = await apiFetch('/api/learn/journey', { method: 'POST', body: JSON.stringify(payload) });
        return { status: r.status, d: await r.json().catch(() => ({})) };
      });
      if (out.d && 'journey' in out.d) take(out.d);
      return out;
    } catch { return { status: 0, d: {} }; } finally { setBusy(null); }
  };
  // The tray's error line with a retry that re-sends the same action. Not for a 409, whose reply already shows where
  // the journey is now, nor for a planner failure, whose server tray has its own error and retry.
  const failed = (out, again) => {
    if (out.status !== 200 && out.status !== 409 && !out.d?.tray?.error) setError({ message: out.status ? 'That did not go through.' : 'Rabbit Hole could not be reached.', again });
    return out;
  };
  const act = async (body, again = () => act(body)) => failed(await run(body), again);

  const start = async text => {
    setLocal(null); setDismissed(null);
    const out = await run({ action: 'start', text }, { revision: null });
    const why = out.d?.error;
    if (NOT_HERE.has(why)) return { handled: false };
    if (why === 'live_journey') setLocal(liveJourneyTray(out.d.journey, text));
    else if (why === 'topic_required') setLocal({ ...out.d.tray, text });
    else failed(out, () => start(text));
    return { handled: true };
  };
  const advance = probeId => act({ action: 'probe_advance', probe_id: probeId });
  const edit = text => act({ action: 'path_edit', text });
  const accept = () => act({ action: 'accept' });
  const retry = () => act({ action: 'retry' });
  // §6.3: the evaluate route stores the probe's evidence, then the walker reads it. Until Task 7 that route refuses the
  // journey contract (400): an evaluator error, so the walker steps on with no evidence (the conservative path) and
  // nothing retries it.
  const evaluate = async (probeId, body) => {
    setBusy(BUSY);
    try { await api('/api/learn/tutor/evaluate', { method: 'POST', body: JSON.stringify({ ...where, journey_id: latest.current.journey?.id, ...body }) }); }
    catch { /* evaluator error: no evidence */ }
    return advance(probeId);
  };
  const answerProbeText = (probeId, text) => {
    const probe = latest.current.journey?.diagnostic?.probes?.find(p => p.id === probeId);
    return evaluate(probeId, { claims: probe?.claims || [], answering: true, question: probe?.prompt || '', message: text });
  };
  // A free-text tray answer goes where the tray asks for it.
  const answerText = (text, t = local || server) => {
    // ponytail: the topic is joined to the setup-skip the learner typed so journeyIntent reads one fast start
    // ("Teach me SQL. Skip setup and start"); a topic field on `start` if the stored request must stay verbatim.
    if (t?.id === 'clarification:topic') return start(`Teach me ${text}. ${t.text}`);
    if (t?.mode === 'intent_intake' && t.free_text) return act({ action: 'intake_answer', slot: t.slot, text });
    if (t?.mode === 'diagnostic_probe') return answerProbeText(t.probe_id, text);
  };
  // §7.2 clarification_needed, over the tray it covers (`under`), which Answer the question answers with the same words.
  const clarify = text => setLocal({ id: 'clarification:turn', mode: 'clarification', prompt: 'Is that an answer, a change to the path, or a question for the Tutor?', options: CLARIFY, free_text: false, dismissible: true, text, under: local || server });

  const answer = async optionId => {
    if (optionId === 'retry') return error?.again ? error.again() : retry();
    if (local?.id === 'clarification:live') {
      if (optionId === 'continue') return setLocal(null);
      // Start the new topic: the live journey is archived first, so the board still holds one.
      const out = await act({ action: 'archive' }, () => answer('start_new'));
      return out.status === 200 || out.d?.error === 'no_journey' ? start(local.text) : out; // no_journey: another tab archived it
    }
    if (local?.id === 'clarification:turn') {
      setLocal(null);
      if (optionId === 'edit') return edit(local.text);
      if (optionId === 'tutor') return { ask: local.text }; // the caller's responder answers the words
      return answerText(local.text, local.under); // an option-only question shows again for a pick
    }
    const t = server;
    if (t?.mode === 'intent_intake') return act({ action: 'intake_answer', slot: t.slot, option_id: optionId });
    if (t?.mode === 'diagnostic_probe') return optionId === 'skip' ? act({ action: 'diagnostic_skip' }) : evaluate(t.probe_id, { probe_id: t.probe_id, option_id: optionId });
    if (t?.mode === 'path_preview') return optionId === 'start' ? accept() : edit(t.options.find(o => o.id === optionId)?.label || optionId);
    // ponytail: next_step and the LP2+ modes have no handler; the LP1 route sends none of them.
  };
  // Skip the current step. path_review and active have none (409): the tray is dismissed here instead.
  const cancel = async () => {
    if (local) return setLocal(null);
    const out = await act({ action: 'cancel' });
    if (out.status === 409) setDismissed(latest.current.tray?.id ?? null);
  };
  // Rule 5. An unreachable model or a refused request (400) leaves the learner to say which they meant.
  const resolve = async text => {
    setBusy(BUSY);
    try { return await api('/api/learn/journey', { method: 'POST', body: JSON.stringify({ ...where, ...resolveBody(text, local || server) }) }); }
    catch { return { kind: 'clarification_needed' }; } finally { setBusy(null); }
  };
  // A composer turn while the tray is open. { handled: false } hands it to the composer's responder (with `text` when
  // the learner chose Ask the Tutor for earlier words).
  const handleText = async raw => {
    const t = local || server;
    if (!t?.mode) return { handled: false }; // a busy or failed tray asks nothing
    let route = routeJourneyTurn(raw, t);
    if (route.kind === 'needs_model') route = await resolve(raw);
    if (route.kind === 'unrelated_question') return { handled: false };
    if (route.kind === 'tray_answer') {
      const out = await (route.option_id ? answer(route.option_id) : answerText(raw));
      return out?.ask ? { handled: false, text: out.ask } : { handled: true };
    }
    if (route.kind === 'path_edit') await edit(route.edit || raw);
    else if (route.kind === 'cancel') await cancel();
    else clarify(raw);
    return { handled: true };
  };

  if (!enabled) return OFF;
  return { ...data, tray, trayProps: tray ? { tray, onOption: answer } : null, busy: !!busy, start, handleText, answer, answerProbeText, edit, cancel, clarify, resolve, advance, accept, retry, refresh };
}
