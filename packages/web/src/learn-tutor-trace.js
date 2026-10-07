// Tutor v2 turn-level tracing (docs/features/tutor-architecture-v2.md "Tracing"). One trace per
// Tutor turn: a trace_id, and per stage its start offset, duration, status (ok / error / timeout)
// and a short result category. No secrets, no learner text: stages record categories and counts.
// Stages: target_resolution, practice_evaluation, claim_selection, evaluate (with the worker's own
// jev / larger timings), evidence_reconciliation, router, planner, action_validation; the UI adds
// reply_ready and canvas_action_complete marks.
import { TRACE_SCHEMA_VERSION, TUTOR_PLANNER_VERSION, goalWords, repeatsLearnerWords } from '../../control-plane/src/agents/learn-tutor.js';
import { STATES } from './learn-tutor-evidence.js';
import { resolveTarget } from './learn-target.js';

const statusOf = error => /timed? ?out|timeout|abort/i.test(`${error?.name || ''} ${error?.message || ''}`) ? 'timeout' : 'error';

// id: the canonical turn id (runTurn's turnId, shared with Voice); a fresh one when none is given.
export function turnTrace(now = () => performance.now(), id = null) {
  const t0 = now();
  const offset = () => +(now() - t0).toFixed(1);
  const trace = { trace_id: id || crypto.randomUUID(), started_at: new Date().toISOString(), stages: [], marks: {} };
  const record = (stage, start, status, result) => trace.stages.push({ stage, start_ms: start, ms: +(offset() - start).toFixed(1), status, result });
  return {
    trace,
    // Runs one stage, sync or async; `category` turns its value into the recorded result. Errors
    // are recorded and rethrown.
    step(stage, run, category = () => null) {
      const start = offset();
      const fail = error => { record(stage, start, statusOf(error), String(error?.message || error).slice(0, 160)); throw error; };
      let value;
      try { value = run(); } catch (error) { fail(error); }
      if (typeof value?.then === 'function') return value.then(done => { record(stage, start, 'ok', category(done)); return done; }, fail);
      record(stage, start, 'ok', category(value));
      return value;
    },
    // A stage timed elsewhere (the worker's JEV and larger evaluator).
    add: (stage, ms, status, result = null) => trace.stages.push({ stage, start_ms: null, ms, status, result }),
    mark: name => { trace.marks[name] = offset(); },
  };
}

// ---------- TutorDecisionEvent v1 (docs/features/professor-next-steps.md §3) ----------
// One structured event per Tutor turn (tutor_decision) and per hook recompute (next_steps_computed): decision metadata, never
// the learner's words, transcripts, chat history, prompts, answer keys, reason_internal or chain-of-thought. Built from a
// finished result only and handed to sinks after it; the product never reads an event. A builder or sink error is swallowed
// and counted (globalThis.__smallTutorTraceErrors), so telemetry never fails or changes a turn or a recompute.

const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
// The Tutor session id: minted once per canvas session store, never sent to a planner.
export const newSessionId = () => `ts_${hex(8)}`;
const count = () => { globalThis.__smallTutorTraceErrors = (globalThis.__smallTutorTraceErrors || 0) + 1; };
export const safely = build => { try { return build(); } catch { count(); return null; } };
// One deep copy per event: a sink that mutates it never reaches the result, its contracts or the live HookSet.
const safe = build => (...args) => safely(() => structuredClone(build(...args)));
const byState = pairs => Object.fromEntries(STATES.map(state => [state, pairs.filter(([, s]) => s === state).map(([id]) => id)]));
const tally = names => { const out = {}; for (const name of names) out[name] = (out[name] || 0) + 1; return out; };
const canvasSummary = (kinds, claimIds) => ({ blocks: kinds.length, kinds: tally(kinds), presented_claim_ids: [...new Set(claimIds)] });
const cap = (text, max = 200) => (text == null ? null : String(text).slice(0, max));
const USAGE = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'];
// Shared provenance: the share's one-way key, its board version and the origin card; never the token, sharer or their state.
const sourceOf = s => (s?.share_key ? { share_key: s.share_key, share_version: s.share_version ?? null, origin_block_id: s.origin_block_id ?? null } : null);
// Each option as its structured identity (owner tenth message): the hook id, its set, its position on screen (1-3, in order),
// the hook, and the goal and ids behind it - so selections can be read by position and aggregated by goal and ids.
const optionsOf = (options, setId = null) => (options || []).map((o, i) => ({ suggestion_id: o.id ?? null, set_id: setId ?? o.selected_next_step?.set_id ?? null, position: i + 1,
  hook: o.hook ?? null, learning_goal: o.selected_next_step?.learning_goal ?? null, concept_ids: o.selected_next_step?.concept_ids ?? [], claim_ids: o.selected_next_step?.claim_ids ?? [] }));
const head = (event, step_id, identity, versions) => ({ trace_schema_version: TRACE_SCHEMA_VERSION, event, decision_id: `td_${hex(8)}`, step_id, generated_at: new Date().toISOString(), identity, versions });

// The route row's generic code: the reason when the planner gives none (reason_source router), and the one added beside a
// lone vary_modality (contract §3.2: never the only reason).
export const ROW_REASON = {
  slash: 'follow_learner_interest', returned: 'resume_context', off_slice: 'respond_to_question', gap: 'fill_prerequisite_gap', gap_inline: 'fill_prerequisite_gap',
  misconception: 'repair_misconception', misconception_explain: 'repair_misconception', uncertain_unsettled: 'check_understanding', uncertain: 'consolidate',
  not_yet_observed: 'advance_goal', understood: 'test_transfer',
};
// No planner codes: a hook click is the learner following an interest (respond_to_question never stands beside it), and
// /deeper or /simplify names its own move; every other turn takes its row's code.
const SLASH_REASON = { deeper: 'deepen_mechanism', simplify: 'reduce_cognitive_load' };
const routerCodes = (turn, routed) => {
  if (!routed) return [];
  const code = SLASH_REASON[turn.slash] ?? ROW_REASON[routed.row] ?? null;
  if (!turn.next_step) return code ? [code] : [];
  return ['follow_learner_interest', ...(code && code !== 'respond_to_question' && code !== 'follow_learner_interest' ? [code] : [])];
};
// The validator's repairs by rule name (learn-tutor-validate.js log lines; never their text).
const REPAIRS = [[/^downgraded /, 'downgraded_navigation'], [/^removed /, 'citations_removed'], [/^shortened /, 'shortened_before_dive'], [/^explicit_request /, 'explicit_request_unquoted'], [/^dropped \S+ learning_goal/, 'learning_goal_dropped']];
// At most 2 sentences and 300 characters; dropped (a repair) when it repeats five words of this turn's message, or holds the
// whole message (two words or more) as whole words in order - normalized as goalWords, so punctuation, case and spacing never
// hide it; a one-word reply ("no", "ok") is not quotable.
// ponytail: only this turn's words are checked; earlier turns rely on the prompt rule (never the learner's words).
const rationale = (reason, raw) => {
  const text = String(reason ?? '').trim().split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').slice(0, 300);
  if (!text) return { summary: null, repair: null };
  const said = goalWords(raw), mine = goalWords(text);
  const quotes = said.length >= 2 && mine.some((_, i) => said.every((word, j) => mine[i + j] === word));
  return repeatsLearnerWords(text, raw) || quotes ? { summary: null, repair: 'rationale_dropped' } : { summary: text, repair: null };
};
// The planner calls behind a turn: the one that answered and, after an escalation, the fast attempt. A count or cost no call
// reported is null (unknown), never 0.
const sumKnown = values => { const known = values.filter(n => typeof n === 'number'); return known.length ? known.reduce((a, b) => a + b, 0) : null; };
const usageOf = telemetry => {
  const calls = [telemetry, telemetry?.fast].filter(Boolean), cost = sumKnown(calls.map(t => t.cost_usd));
  return { ...Object.fromEntries(USAGE.map(k => [k, sumKnown(calls.map(t => t[k]))])), cost_usd: cost == null ? null : +cost.toFixed(6) };
};
// validation.fallback: a low-cardinality category, never upstream error text. The hook planner already names its reason;
// the Tutor's are fastPlanProblem's two problems, planOnce's no-turn error, and anything else from the model call.
const ESCALATIONS = ['no_tool', 'validator', 'ambiguous', 'contradictory', 'invalid_plan', 'no_words', 'model_error'];
const escalation = reason => `escalated:${ESCALATIONS.includes(reason) ? reason : reason === 'no words' ? 'no_words' : reason === 'an action outside the allowed types' ? 'invalid_plan' : reason === 'The tutor returned no turn' ? 'no_tool' : 'model_error'}`;

// A tutor_decision from runTurn's finished result. The actions are the turn's production contracts (result.contracts,
// learn-tutor-actions.js), never recomputed; a turn without contracts (plan: false) gives [] and null.
// identity: { user_id, canvas_version } from the caller; blocks: the canvas blocks; options: the hooks shown with the turn;
// seen: the modality history the planner saw; intent: learnerIntent(turn).kind; selectedAt: the hook click's ISO time (kept
// only on a hook click). evidence_transitions: the turn's claim state changes, ids and states only.
export const decisionEvent = safe(({ result, domain, identity = {}, blocks = [], options = [], seen = [], intent = null, totalMs = null, selectedAt = null }) => {
  const { turn, routed = null, response = {}, decisions = [], log = [], bench = {} } = result;
  const contracts = result.contracts ?? [], record = turn.canvas.dive?.record ?? null, telemetry = response?.telemetry ?? null, claims = bench.claims || [];
  const conceptsOf = ids => [...new Set(ids.map(id => domain?.claims?.[id]?.concept).filter(Boolean))];
  const actions = contracts.map(({ action_type, command, modality, target_concept_ids, target_claim_ids }) => ({ action_type, command, modality, target_concept_ids, target_claim_ids }));
  const planned = result.reason_codes ?? [], router = routerCodes(turn, routed), flags = [];
  let reason_codes = planned, reason_source = planned.length ? 'planner' : null;
  if (!planned.length && router.length) { reason_codes = router; reason_source = 'router'; }
  if (planned.length === 1 && planned[0] === 'vary_modality') { reason_codes = [...router.slice(0, 2), 'vary_modality']; flags.push('vary_modality_alone'); }
  const why = rationale(response?.reason, turn.raw_user_message);
  const presented = blocks.flatMap(block => {
    const t = resolveTarget(block);
    return domain?.targetClaims?.({ block_id: t.block_id, card_id: t.card_id, part_id: t.part_id, selected_object: t.selected_object, concept_ids: t.concept_ids }) || [];
  });
  const seconds = contracts.map(c => c.estimated_learning_seconds).filter(n => typeof n === 'number');
  const dropped = decisions.filter(d => !d.accepted).length;
  const repairs = [...new Set([...log.flatMap(line => REPAIRS.filter(([pattern]) => pattern.test(line)).map(([, name]) => name)), ...(why.repair ? [why.repair] : [])])];
  const sectionId = domain?.sectionId ?? null;
  return {
    ...head('tutor_decision', turn.turn_id, {
      user_id: identity.user_id ?? null, session_id: result.store?.session_id ?? null, canvas_id: turn.canvas.app, board_id: turn.canvas.board ?? null, canvas_version: identity.canvas_version ?? null,
      journey_id: domain?.evidence?.journey_id ?? record?.journey?.journey_id ?? null, section_id: sectionId, dive_id: turn.canvas.dive?.dive_id ?? null,
      source: sourceOf(record?.source && { share_key: record.source.share_key, share_version: record.source.version, origin_block_id: record.origin?.origin_block_id }),
      // Ruling F12: a journey journey, a hole dive, a plain canvas canvas (Task 10's canvas domain), a registered course course.
      scope: 'owned', mode: domain?.evidence?.mode === 'journey' ? 'journey' : record ? 'dive' : domain?.contextKey === 'canvas_context' ? 'canvas' : 'course',
    }, { planner_version: TUTOR_PLANNER_VERSION, prompt_version: telemetry?.prompt_version ?? null, model_role: telemetry ? 'tutor' : null, model_id: telemetry?.served_model ?? null }),
    decision: {
      current_goal: { id: turn.next_step?.suggestion_id ?? null, summary: cap(turn.next_step?.learning_goal ?? domain?.context?.goal) },
      current_section_id: sectionId, target_concept_ids: conceptsOf(claims), target_claim_ids: [...claims],
      evidence_summary: byState((turn.evidence || []).filter(Boolean).map(state => [state.claim, state.state])),
      evidence_transitions: (result.transitions || []).map(({ claim, from, to }) => ({ claim_id: claim, from: from ?? null, to: to ?? null })),
      canvas_summary: canvasSummary(blocks.map(block => block.type), presented),
      recent_modality_history: seen.slice(-8), next_step_options: optionsOf(options), shown_at: null,
      selected_next_step_id: turn.next_step?.suggestion_id ?? null, selected_at: turn.next_step ? selectedAt : null,
      route: routed ? { row: routed.row, strategy: response?.strategy ?? routed.strategy ?? null, intent } : null,
      chosen_action: actions.find(a => a.action_type !== 'respond_text') ?? actions[0] ?? null, actions,
      reason_codes, reason_source, rationale_summary: why.summary,
      expected_evidence: [...new Map(contracts.flatMap(c => c.expected_evidence || []).map(e => [`${e.claim_id}|${e.via}`, e])).values()],
      estimated_learning_seconds: seconds.length ? seconds.reduce((a, b) => a + b, 0) : null,
    },
    runtime: {
      timing: { total_ms: totalMs, planner_ms: bench.ms?.planner ?? null, first_text_ms: bench.ms?.to_first_safe_sentence ?? null },
      model: { tier: telemetry?.tier ?? null, escalated: !!telemetry?.escalated, calls: telemetry ? (telemetry.escalated ? 2 : 1) : 0 },
      usage: usageOf(telemetry),
      validation: { ok: !dropped && !repairs.length, dropped_actions: dropped, repairs,
        fallback: telemetry?.escalated ? escalation(telemetry.escalated) : telemetry?.tail_lost ? 'tail_lost' : reason_source === 'router' ? 'router_reason' : null },
      planner_input: null,
    },
    flags,
  };
});

// The hook planner's input (§2.1) in event terms: claim ids by state, the canvas's block kinds and presented claims, targets.
export function inputSummary(input) {
  const claims = input?.scope?.claims || {}, blocks = input?.canvas?.blocks || [];
  return {
    evidence_summary: byState(Object.entries(claims).map(([id, claim]) => [id, claim?.state])),
    canvas_summary: canvasSummary(blocks.map(block => block.kind), blocks.flatMap(block => block.claim_ids || [])),
    target_concept_ids: [...new Set(Object.values(claims).map(claim => claim?.concept).filter(Boolean))], target_claim_ids: Object.keys(claims),
  };
}

// The hook planner input's trim (nextStepsInput's trim, owner sixth message 4): structured counts only, picked field by field so
// nothing of the input itself can ride along.
const counted = c => ({ block_count: c?.block_count ?? null, claim_count: c?.claim_count ?? null });
const plannerInput = t => (t ? { before: counted(t.before), after: counted(t.after), trimmed: counted(t.trimmed), current_section_claims_kept: t.current_section_claims_kept ?? null, repair_claims_kept: t.repair_claims_kept ?? null } : null);

// A next_steps_computed from a HookSet and the input it was planned from. identity: the viewer's ids (shared: user_id null for
// an anonymous viewer, source the one-way share key); a cached reply keeps the producing call's versions with zero usage.
// trim: nextStepsInput's counts beside that input (runtime.planner_input), null when none were given.
// discarded: the set landed after its basis moved on (recorded anyway: every recomputation is traced), flagged discarded.
// summary: inputSummary of an input the browser never held (a shared canvas's, built by the server: its reply telemetry).
const hooks = (set, { input = null, summary = null, identity = {}, scope = 'owned', mode = 'canvas', trim = null, discarded = false } = {}) => {
  const t = set?.telemetry || {}, s = summary ?? inputSummary(input), ran = t.cached ? null : t.ms ?? null;
  return {
    ...head('next_steps_computed', set?.set_id ?? null, {
      user_id: identity.user_id ?? null, session_id: identity.session_id ?? null, canvas_id: identity.canvas_id ?? null, board_id: identity.board_id ?? null, canvas_version: identity.canvas_version ?? null,
      journey_id: identity.journey_id ?? null, section_id: identity.section_id ?? null, dive_id: identity.dive_id ?? null, source: sourceOf(identity.source), scope, mode,
    }, { planner_version: t.planner_version ?? null, prompt_version: t.prompt_version ?? null, model_role: t.model_role ?? null, model_id: t.model_id ?? null }),
    decision: {
      current_goal: { id: null, summary: cap(input?.goal) }, current_section_id: input?.path?.current?.id ?? identity.section_id ?? null,
      target_concept_ids: s.target_concept_ids, target_claim_ids: s.target_claim_ids, evidence_summary: s.evidence_summary, evidence_transitions: [], canvas_summary: s.canvas_summary,
      recent_modality_history: (input?.recent?.modalities || []).slice(-8), next_step_options: optionsOf(set?.options, set?.set_id ?? null), shown_at: null, selected_next_step_id: null, selected_at: null,
      route: null, chosen_action: null, actions: [], reason_codes: [], reason_source: null, rationale_summary: null, expected_evidence: [], estimated_learning_seconds: null,
    },
    runtime: {
      timing: { total_ms: ran, planner_ms: ran, first_text_ms: null }, model: { tier: t.tier ?? null, escalated: !!t.escalated, calls: t.calls ?? 0 },
      usage: { ...Object.fromEntries(USAGE.map(k => [k, t.usage?.[k] ?? null])), cost_usd: t.cost_usd ?? null },
      validation: { ok: !(t.errors || []).length, dropped_actions: 0, repairs: [...(t.errors || [])], fallback: t.escalated ? escalation(t.escalated) : null },
      planner_input: plannerInput(trim),
    },
    flags: [...(t.cached ? ['cached'] : []), ...(discarded ? ['discarded'] : [])],
  };
};
export const hooksEvent = safe(hooks);
// A next_steps_shown (owner tenth message): the impression of a set the first time it is on screen, beside its
// next_steps_computed, so selections can be read against what was shown and where. Same keys; the set's versions (the
// planner that wrote the hooks) but no model call of its own, so zero usage and cost: never a double count.
export const shownEvent = safe((set, options = {}) => {
  const e = hooks(set, { ...options, discarded: false });
  return {
    ...e, event: 'next_steps_shown', decision: { ...e.decision, shown_at: new Date().toISOString() },
    runtime: { timing: { total_ms: null, planner_ms: null, first_text_ms: null }, model: { tier: null, escalated: false, calls: 0 },
      usage: { ...Object.fromEntries(USAGE.map(k => [k, 0])), cost_usd: 0 }, validation: { ok: true, dropped_actions: 0, repairs: [], fallback: null }, planner_input: null },
    flags: [],
  };
});

// Sinks get each event after the result is final; nothing is sent anywhere in v1.
const sinks = new Set();
export const addSink = sink => { sinks.add(sink); return () => sinks.delete(sink); };
export const tracing = () => sinks.size > 0;
export function emitDecision(event) {
  if (!event) return;
  for (const sink of sinks) { try { Promise.resolve(sink(event)).catch(count); } catch { count(); } }
}
// The evaluation harness's sink: the stable internal user_id from /api/me (fetched only while tracing, never the email),
// the newest 500 events on target.__smallTutorTraces, and a small:tutor-trace event per event.
let me = null;
const meFromServer = () => (me ??= globalThis.fetch('/api/me', { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : null)).catch(() => null));
export function harnessSink({ target = globalThis, me: who = meFromServer } = {}) {
  return async event => {
    const user = await who();
    const stamped = { ...event, identity: { ...event.identity, user_id: user?.user_id ?? event.identity?.user_id ?? null } };
    const list = (target.__smallTutorTraces ||= []);
    list.push(stamped);
    list.splice(0, Math.max(0, list.length - 500));
    target.dispatchEvent?.(new CustomEvent('small:tutor-trace', { detail: stamped }));
  };
}
// v1: one sink, only when an evaluation harness sets the flag before the page loads (e.g. a Playwright init script).
if (globalThis.__SMALL_TUTOR_TRACE__ === true) { globalThis.__smallTutorTraces ??= []; addSink(harnessSink()); }
