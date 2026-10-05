// Learning journeys in the Learn composer (docs/features/adaptive-learning-path-v1-architecture.md §6.1, §7; LP1 Task 8):
// useJourney holds the board's journey from /api/learn/journey, TutorPromptTray renders its tray in the LearnSlash slot
// above the one composer, and routeJourneyTurn sends a turn through the shared resolver extension's rules 1-4
// (learner-intent-journey.js, R7), then rule 5 (the route's `resolve`). Punctuation never decides (R1). LP1 Task 12:
// handleText runs at the top of useTutor.turn() (LearnTutor.jsx), so typed and voice turns share it (D6), and a
// free-text probe answer is the Tutor's runTurn({ plan: false }) turn (answerProbe).
// ponytail: tray prompts are not spoken yet: voice.say runs a Tutor turn, not speech alone; a speak-only voice call with
// the LP5 voice parity work. Task 9: after the action that planned the current section (accept, a fast start, a retry),
// or on a load once the canvas is ready, materializeSection draws it on the canvas, once (§6.5, R5, ruling C-3).
import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { apiFetch } from './api.js';
import { materializeSection } from './learn-journey-materialize.js';
import { STARTS, interactionInterpretation, journeyIntent } from '../../control-plane/src/learner-intent-journey.js';

// A start the route refuses as no journey (a question after all, a repository course): the normal responder answers.
const NOT_HERE = new Set(['not_a_learning_journey', 'journeys_on_canvases_only']);
const SETUP = new Set(['intake', 'diagnostic', 'path_review']);
const JOURNEY = '/api/learn/journey';
const BUSY = 'Working on it...';
const UNSAVED = 'This section is on the canvas but could not be saved yet.';
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

// Before the path is accepted the canvas gets no permanent card (controller ruling, LP1): a turn the Tutor answers on a
// journey in setup (off_slice, words only) stays in the chat sheet (ask.jsx).
export const inJourneySetup = journey => SETUP.has(journey?.state);

// One POST with the journey's revision. A 409 `revision` (another tab moved it) carries the re-read journey: the same
// action, answer text included, is replayed once on that revision, and the re-read rides along (`reread`) so a replay
// refused for a step that has moved still leaves the current tray on screen.
export async function journeyRequest(body, revision, send) {
  const first = await send(revision == null ? body : { ...body, revision });
  const reread = first.status === 409 && first.d?.error === 'revision' && first.d.journey ? first.d : null;
  return reread ? { ...(await send({ ...body, revision: reread.journey.revision })), reread } : first;
}

// What the tray slot shows: a local tray over the server's (recomputed by trayFor after every event and reload, so a
// reload never asks twice), with the busy and error lines on top. A busy or failed action with no tray still shows,
// and that status tray can be dismissed.
export function shownTray(server, local, busy, error) {
  const tray = local || server || (busy || error ? { id: 'status', mode: null, options: [], free_text: false, dismissible: true } : null);
  return tray && (busy || error) ? { ...tray, ...(busy ? { busy } : {}), ...(error ? { error } : {}) } : tray;
}

// Rule 5's request: the open tray as the route bounds it (prompt 300, 6 options, id 40, label 120, text 1000).
export const resolveBody = (text, tray) => ({ action: 'resolve', text: String(text).slice(0, 1000), tray: {
  mode: tray?.mode ?? null, prompt: String(tray?.prompt ?? '').slice(0, 300),
  options: (tray?.options || []).slice(0, 6).map(({ id, label }) => ({ id: String(id).slice(0, 40), label: String(label).slice(0, 120) })),
  free_text: !!tray?.free_text } });

// §6.1: a broad intent on a board that already has a live journey asks first; the server never holds two (409). `under`
// is the tray it covers: Continue answers a free-text one with the same words, so an answer that reads like an intent
// ("I want to understand the intuition" on the goal question) is not lost.
export function liveJourneyTray(journey, text, under = null) {
  const topic = journey?.request?.topic || 'this path', next = journeyIntent(text).topic || 'a new path';
  return { id: 'clarification:live', mode: 'clarification', prompt: `Continue ${topic} or start ${next}?`,
    options: [{ id: 'continue', label: `Continue ${topic}` }, { id: 'start_new', label: `Start ${next}` }], free_text: false, dismissible: true, text, under };
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
        {/* Only the status tray (an error with nothing under it): a journey tray must stay to be answered. */}
        {!tray.mode && tray.dismissible && !tray.error.keep && <button type="button" data-tray-dismiss aria-label="Dismiss" onClick={() => onOption('dismiss')} className="shrink-0 rounded p-0.5 text-ink-3 hover:bg-hover hover:text-ink"><X size={12} /></button>}
      </div>}
    </div>
  );
}

const EMPTY = { journey: null, path: null, tray: null, prevPath: null };

// The journey's behaviour, apart from React so node can drive it: fetchJson(path, body?, options?) -> { status, d } (a GET
// without a body; it throws only when the network does), onChange after every state change, canvas() the board's
// canvasApi for the section materializer, read only once the page has called canvasReady() (its board restored, the
// canvas up). Every action resolves to an outcome whose `ok` is false when it failed; handleText and start report that as
// `failed`, and the composer gives the words back.
export function journeyController({ where, fetchJson, onChange = () => {}, canvas = () => null }) {
  const s = { data: EMPTY, local: null, dismissed: null, busy: null, error: null, proposals: [], ready: false, answerProbe: null, waiting: null };
  const set = patch => { Object.assign(s, patch); onChange(); };
  // prevPath: the version of this journey's path shown before the current one, so the rail marks what the new version
  // changed (pathEntries) until the next version replaces it.
  const take = d => {
    const path = d.path ?? null, was = s.data.path, same = d.journey?.id != null && d.journey.id === s.data.journey?.id;
    const prevPath = !path || !same ? null : was && was.version !== path.version ? was : s.data.prevPath;
    set({ data: { journey: d.journey ?? null, path, tray: d.tray ?? null, prevPath } });
  };
  const server = () => (s.data.tray && s.data.tray.id !== s.dismissed ? s.data.tray : null);
  const open = () => s.local || server();

  // No journey here (a refused app, a network error): the Learn chat answers as before. read() says whether it took one.
  const read = () => fetchJson(`${JOURNEY}?app=${encodeURIComponent(where.app)}&board=${encodeURIComponent(where.board)}`)
    .then(({ status, d }) => { if (status !== 200) return false; take(d); return true; }).catch(() => false);
  // A load can find a planned section not drawn yet (a fast start from Home, a reload mid-way): the materializer checks.
  const refresh = async () => { if (await read()) await materialize({ load: true }); };

  // Every action's body and reply. A reply that carries the journey (success, 409, a 502 planner failure) replaces it; a
  // replay that carries none falls back to the re-read.
  const run = async (body, revision = s.data.journey?.revision) => {
    set({ busy: BUSY, error: null });
    try {
      const out = await journeyRequest({ ...where, ...body }, revision, payload => fetchJson(JOURNEY, payload));
      const fresh = out.d && 'journey' in out.d ? out.d : out.reread;
      if (fresh) take(fresh);
      return out;
    } catch { return { status: 0, d: {} }; } finally { set({ busy: null }); }
  };
  // ok is a 200. A failure gets the tray's error line, whose retry re-sends the same action, unless the reply already
  // shows where the journey is: a 409, a replay after a re-read, or a planner failure's own error tray.
  const settle = (out, again) => {
    const ok = out.status === 200;
    if (!ok && out.status !== 409 && !out.reread && !out.d?.tray?.error) set({ error: { message: out.status ? 'That did not go through.' : 'Rabbit Hole could not be reached.', again } });
    return { ...out, ok };
  };
  const act = async (body, again = () => act(body)) => {
    const out = settle(await run(body), again);
    if (out.ok) await materialize();
    else if (out.status === 409) await materialize({ load: true }); // the re-read journey may hold a section to draw
    return out;
  };

  // §6.5, R5, ruling C-3: the current section's plan becomes canvas content once - after the action that planned it
  // (accept, a fast start, a retry), and on a load (refresh, a 409 re-read, the canvas becoming ready) once the canvas is
  // ready, never for another section, never from the rail. A load first reads the journey again and stops if the heading
  // is recorded by then. Done is the server holding its heading (section_materialized, posted only once the board is
  // saved, §6.5.5). `started` is the ref guard while a run is on, and stays once the heading is recorded or while an
  // unsaved section waits for its Retry; a run that ends unrecorded otherwise (a failed step, a refused post, a throw)
  // lifts it, so Try again or the next load picks the section up from the canvas, which the materializer resumes.
  const started = new Set();
  const due = () => {
    const j = s.data.journey, plan = j?.section_plan;
    return j?.state === 'active' && !j.pending && plan && plan.section_id === j.active_section_id && !plan.heading_block_id && plan.generation_state !== 'generated' ? plan : null;
  };
  const artifact = async (path, body, options) => {
    const { status, d } = await fetchJson(path, { ...where, ...body }, options);
    if (status !== 200) throw new Error(d?.error || `HTTP ${status}`);
    return d;
  };
  // A 409 (another tab moved the journey) re-reads it and posts once more with the same heading, while that section is
  // still current and unrecorded.
  const materialized = async (section_id, heading_block_id) => {
    const body = { action: 'section_materialized', section_id, heading_block_id };
    const out = await act(body);
    if (out.status !== 409 || !(await read())) return out;
    const j = s.data.journey;
    return j?.state === 'active' && j.active_section_id === section_id && !j.section_plan?.heading_block_id ? act(body) : out;
  };
  // §6.5.5 (LP1 Task 15): a section whose board did not save is drawn but unrecorded - s.waiting { target, id, heading }
  // until the server holds its heading, with `started` held. Its line cannot be dismissed or typed away (view() shows it
  // whenever no other error does). Retry, or any later run of materialize, is save(): the board saved again, then the
  // section recorded, drawing and requesting nothing. save() takes `waiting` while it runs, so a run started meanwhile (a
  // 409's re-read) finds nothing to do, and puts it back while the section is still unrecorded.
  const waitingLine = () => (s.waiting ? { message: UNSAVED, again: save, keep: true } : null);
  const save = async () => {
    const w = s.waiting;
    if (!w) return { ok: true }; // recorded meanwhile
    set({ waiting: null, busy: BUSY, error: null });
    let saved = null, out = { ok: false };
    try { saved = await w.target.persist(); } catch { /* not saved */ } finally { set({ busy: null }); }
    if (saved?.ok) out = await materialized(w.id, w.heading);
    if (due()?.section_id === w.id) set({ waiting: w });
    return out;
  };
  const materialize = async ({ load = false } = {}) => {
    let plan = due(), held = false;
    if (plan && s.waiting?.id === plan.section_id) return save();
    const target = s.ready ? canvas() : null, id = plan?.section_id;
    if (!target || !plan || started.has(id)) return;
    started.add(id);
    try {
      if (load && (!(await read()) || (plan = due())?.section_id !== id)) return;
      set({ error: null });
      const out = await materializeSection({ canvas: target, journey: { ...s.data.journey, path: s.data.path, materialized }, sectionPlan: plan, post: artifact,
        onProgress: ({ step, of }) => set({ busy: `Preparing step ${step} of ${of}...` }) });
      if (out.proposals.length) set({ proposals: out.proposals, local: proposalTray(out.proposals[0]) });
      if (out.failed_step) set({ error: { message: 'Part of this section could not be made.', again: () => materialize() } });
      else if (out.unsaved) { held = true; set({ waiting: { target, id, heading: out.heading_block_id } }); }
    } catch {
      set({ error: { message: 'This section could not be prepared.', again: () => materialize() } });
    } finally {
      if (!held && !s.data.journey?.section_plan?.heading_block_id) started.delete(id);
      set({ busy: null });
    }
  };
  // The page calls this once the board is restored and the canvas is up, as often as it likes: the first call with a
  // canvas there marks it ready and checks for a section to draw.
  const canvasReady = () => {
    if (s.ready || !canvas()) return;
    s.ready = true;
    return materialize({ load: true });
  };
  // §6.5.4: a paid step's proposal waits in a generation_proposal tray, one at a time, and is never generated on its own.
  const proposalTray = p => (p ? { id: `generation_proposal:${p.step_id}`, mode: 'generation_proposal', prompt: p.message,
    options: [{ id: 'generate', label: 'Generate' }, { id: 'not_now', label: 'Not now' }], free_text: false, dismissible: true } : null);

  const start = async text => {
    set({ local: null, dismissed: null, error: null });
    const out = await run({ action: 'start', text }, null);
    if (out.status === 409) await materialize({ load: true });
    const why = out.d?.error;
    if (NOT_HERE.has(why)) return { handled: false };
    if (why === 'live_journey') set({ local: liveJourneyTray(out.d.journey, text) });
    else if (why === 'topic_required') set({ local: { ...out.d.tray, text } });
    else if (!settle(out, () => start(text)).ok) return { handled: true, failed: true };
    else await materialize(); // a fast start is accepted and planned at once
    return { handled: true };
  };
  const advance = probeId => act({ action: 'probe_advance', probe_id: probeId });
  const edit = text => act({ action: 'path_edit', text: String(text).slice(0, 300) });
  const accept = () => act({ action: 'accept' });
  const retry = () => act({ action: 'retry' });
  // §6.3: the evaluate route stores the probe's evidence, then the walker reads it. An evaluate failure (an evaluator
  // error, a refusal) leaves no evidence, so the walker steps on with none (the conservative path) and nothing retries it.
  const evaluate = async (probeId, body) => {
    set({ busy: BUSY, error: null });
    try { await fetchJson('/api/learn/tutor/evaluate', { ...where, journey_id: s.data.journey?.id, ...body }); } catch { /* evaluator error: no evidence */ }
    return advance(probeId);
  };
  // A typed or spoken answer to an explain-back probe is a Tutor turn without a plan: s.answerProbe(probe, text), handed
  // over by the Tutor's turn (handleText, LearnTutor.jsx), runs runTurn({ plan: false }) with the probe as the open
  // question, which stores its evidence through the same route. The route grades free text on a keyless probe only, so
  // an option-only probe stays open for a pick, like an option-only intake question.
  const answerProbeText = async (t, text) => {
    const probe = s.data.journey?.diagnostic?.probes?.find(p => p.id === t.probe_id);
    if (!t.free_text || !probe || !s.answerProbe) return { ok: true };
    set({ busy: BUSY, error: null });
    try { await s.answerProbe(probe, text); } catch { /* evaluator error: no evidence */ }
    return advance(probe.id);
  };
  // A free-text tray answer goes where the tray asks for it.
  const answerText = async (text, t = open()) => {
    if (t?.id === 'clarification:topic') {
      // ponytail: the topic is joined to the setup-skip the learner typed so journeyIntent reads one fast start
      // ("Teach me SQL. Skip setup and start"); a topic field on `start` if the stored request must stay verbatim.
      const it = journeyIntent(text), topic = STARTS.has(it.kind) && it.topic ? text : `Teach me ${text}`;
      const out = await start(`${topic}. ${t.text}`);
      return { ...out, ok: !out.failed };
    }
    if (t?.mode === 'intent_intake' && t.free_text) return act({ action: 'intake_answer', slot: t.slot, text: text.slice(0, 300) });
    if (t?.mode === 'diagnostic_probe') return answerProbeText(t, text);
    return { ok: true }; // an option-only question stays open for a pick
  };
  // §7.2 clarification_needed, over the tray it covers (`under`), which Answer the question answers with the same words.
  const clarify = text => set({ local: { id: 'clarification:turn', mode: 'clarification', prompt: 'Is that an answer, a change to the path, or a question for the Tutor?', options: CLARIFY, free_text: false, dismissible: true, text, under: open() } });

  const answer = async optionId => {
    const shown = s.error || waitingLine();
    if (optionId === 'retry') return shown?.again ? shown.again() : retry();
    if (optionId === 'dismiss') return set({ error: null });
    const local = s.local;
    if (local?.id === 'clarification:live') {
      if (optionId === 'continue') { set({ local: null }); return local.under?.free_text ? answerText(local.text, local.under) : { ok: true }; }
      // Start the new topic: the live journey is archived first, so the board still holds one. no_journey or archived:
      // another tab archived it already.
      const out = await act({ action: 'archive' }, () => answer('start_new'));
      if (!out.ok && out.d?.error !== 'no_journey' && out.d?.error !== 'archived') return out;
      const started = await start(local.text);
      return { ...started, ok: !started.failed };
    }
    if (local?.id === 'clarification:turn') {
      set({ local: null });
      if (optionId === 'edit') return edit(local.text);
      if (optionId === 'tutor') return { ask: local.text }; // the caller's responder answers the words
      return answerText(local.text, local.under);
    }
    if (local?.mode === 'generation_proposal') {
      // Generate inserts the card confirmed, so it starts once (as a / command's paid proposal, learn-slash.js), right
      // after the card its step would have followed. Not now drops it; a declined paid step is optional.
      const [proposal, ...rest] = s.proposals;
      if (optionId === 'generate' && proposal) canvas()?.insertBlock({ ...proposal.block, confirmedStart: true }, { after: proposal.after });
      set({ proposals: rest, local: proposalTray(rest[0]) });
      return { ok: true };
    }
    const t = server();
    if (t?.mode === 'intent_intake') return act({ action: 'intake_answer', slot: t.slot, option_id: optionId });
    if (t?.mode === 'diagnostic_probe') return optionId === 'skip' ? act({ action: 'diagnostic_skip' }) : evaluate(t.probe_id, { probe_id: t.probe_id, option_id: optionId });
    if (t?.mode === 'path_preview') return optionId === 'start' ? accept() : edit(t.options.find(o => o.id === optionId)?.label || optionId);
    return { ok: true }; // ponytail: next_step and the LP2+ modes have no handler; the LP1 route sends none of them
  };
  // Skip the current step. path_review and active have none (409): the tray is dismissed here instead.
  const cancel = async () => {
    if (s.local?.mode === 'generation_proposal') return answer('not_now');
    if (s.local) { set({ local: null }); return { ok: true }; }
    const out = await act({ action: 'cancel' });
    if (out.status !== 409) return out;
    set({ dismissed: s.data.tray?.id ?? null });
    return { ok: true };
  };
  // Rule 5. An unreachable model or a refused request (400) leaves the learner to say which they meant.
  const resolve = async text => {
    set({ busy: BUSY });
    try {
      const { status, d } = await fetchJson(JOURNEY, { ...where, ...resolveBody(text, open()) });
      return status === 200 && d?.kind ? d : { kind: 'clarification_needed' };
    } catch { return { kind: 'clarification_needed' }; } finally { set({ busy: null }); }
  };
  // Every turn on a board with a journey (or an open tray): the Tutor's typed and voice turns, and the composer's with no
  // Tutor. { handled: false } hands it to the responder (with `text` when the learner chose Ask the Tutor for earlier
  // words); `failed` gives the words back. answerProbe: the Tutor's probe turn, kept for the clarification a turn opens
  // (its Answer the question and Continue answer the probe with the same words). While an action or a materialization
  // runs, a turn is refused (its words come back; a spoken one says nothing): a voice turn has no composer guard, and a
  // second post would answer the same step twice.
  const handleText = async (raw, { answerProbe = null } = {}) => {
    if (s.busy) return { handled: true, failed: true };
    set({ error: null });
    if (answerProbe) s.answerProbe = answerProbe;
    const t = open(), j = s.data.journey, it = journeyIntent(raw);
    if (j && STARTS.has(it.kind) && it.topic) {
      set({ local: liveJourneyTray(j, raw, t?.id === 'clarification:live' ? t.under : t) });
      return { handled: true };
    }
    // A busy or failed tray asks nothing: like no tray, only a rule-4 path edit is the journey's, and only during setup.
    // An active, paused or completed journey takes no path edit until LP2 (journeyStep refuses it), so those words go to
    // the responder, the Tutor.
    let route = routeJourneyTurn(raw, t?.mode ? t : null);
    if (route.kind === 'needs_model') route = await resolve(raw);
    if (route.kind === 'unrelated_question' || (route.kind === 'path_edit' && !t?.mode && !inJourneySetup(j))) return { handled: false };
    let out;
    if (route.kind === 'tray_answer') {
      out = await (route.option_id ? answer(route.option_id) : answerText(raw));
      if (out?.ask) return { handled: false, text: out.ask };
    } else if (route.kind === 'path_edit') out = await edit(route.edit || raw);
    else if (route.kind === 'cancel') out = await cancel();
    else clarify(raw);
    return out?.ok === false ? { handled: true, failed: true } : { handled: true };
  };

  const view = () => {
    const tray = shownTray(server(), s.local, s.busy, s.error || waitingLine());
    return { ...s.data, tray, trayProps: tray ? { tray, onOption: answer } : null, busy: !!s.busy,
      start, handleText, answer, edit, cancel, clarify, resolve, advance, accept, retry, refresh, canvasReady };
  };
  return { state: s, view, refresh };
}

// options: a POST's extra fetch options (the artifact request's timeout signal).
const fetchJson = async (path, body, options = {}) => {
  const r = await apiFetch(path, body ? { ...options, method: 'POST', body: JSON.stringify(body) } : options);
  return { status: r.status, d: await r.json().catch(() => ({})) };
};
const OFF = { ...EMPTY, trayProps: null, busy: false, start: null };

// The board's journey: one controller per app and board. canvasApi (LearnPage's) is the section materializer's canvas.
export function useJourney({ app, board, access, canvasApi = null, enabled = true }) {
  const [, rerender] = useState(0);
  const ref = useRef(null);
  const where = { app: access?.app || app?.name, board }, key = `${where.app}\n${board}`;
  if (enabled && where.app && ref.current?.key !== key) {
    const fresh = Object.assign(journeyController({ where, fetchJson, canvas: () => canvasApi?.current ?? null, onChange: () => { if (ref.current === fresh) rerender(n => n + 1); } }), { key });
    ref.current = fresh;
  }
  const ctl = enabled && where.app ? ref.current : null;
  useEffect(() => { ctl?.refresh(); }, [ctl]);
  // A planner call started elsewhere (another tab, or before a reload) shows the busy tray until the journey moves on.
  // ponytail: a 5 s poll while pending; a push channel if journeys ever get many watchers.
  const pending = !!ctl?.state.data.journey?.pending;
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => ctl.refresh(), 5000);
    return () => clearInterval(timer);
  }, [pending, ctl]);
  return ctl ? ctl.view() : OFF;
}
