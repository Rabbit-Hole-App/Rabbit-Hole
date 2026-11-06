// The Tutor evidence sink (telemetry brief Task 12; docs/features/telemetry.md "Tutor evidence"). It maps the finished
// TutorDecisionEvent v1 events (learn-tutor-trace.js: tutor_decision, next_steps_computed, next_steps_shown) into the registered
// tutor.* telemetry events (control-plane/src/telemetry-events/tutor.js) and posts them to POST /api/telemetry/tutor. Built from
// finished results only, after them, with every failure swallowed: a Tutor turn never waits for, reads or changes with telemetry.
//
// Allowlist by construction: each payload is assembled field by field from ids, enums, counts, versions and timings. The goal
// and hook text, the rationale, the canvas summary, the modality history and every other free field of the v1 event are simply
// never read here. Ids that do not look like ids are dropped, never sent.
import { makeEvent, usageSnapshot, validateEvent } from '../../control-plane/src/telemetry-contract.js';

export const TUTOR_ENDPOINT = '/api/telemetry/tutor';
export const ASSISTANCE_MAP_VERSION = 'assist-v1';

const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const TOKEN = /^[a-z0-9][a-z0-9_.:-]{0,63}$/i;
const id = value => (typeof value === 'string' && ID.test(value) ? value : undefined);
const token = value => (typeof value === 'string' && TOKEN.test(value) ? value : undefined);
const count = value => (Number.isSafeInteger(value) && value >= 0 ? value : undefined);
const ms = value => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined);
const ids = (list, max = 5) => { const kept = (Array.isArray(list) ? list : []).map(id).filter(Boolean).slice(0, max); return kept.length ? kept : undefined; };
const oneOf = (list, value) => (list.includes(value) ? value : undefined);
const bool = value => (typeof value === 'boolean' ? value : undefined);
const clean = object => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null));

// assistance-map-v1: what help a Tutor turn OFFERED, from the accepted actions alone. Offered is not displayed and not used: whether
// the learner saw or took the help is read from the hook events and from the assessed attempt (learning_attempts.assistance), never
// inferred here. Reviewed against the action vocabulary (learn-tutor.js ACTION_TYPES and the handoff, avatar and next-section
// actions) and what each does (learn-tutor-actions.js):
//   explanation: the Tutor's own words (respond_text), a repository answer (handoff), a depth rung (suggest_depth), a clip (suggest_avatar_clip)
//   material:    a card shown, focused or made that the learner reads or watches (explanation, table, snippet, flow, image, video, ...)
//   scaffold:    a card shown, focused or made that the learner acts on (the INTERACTIVE modalities)
//   none:        a question, a practice invitation, navigation or an offer to explore: ask_question, suggest_practice, suggest_dive,
//                open_dive, return_from_dive, suggest_journey, suggest_research, next_section, no_action
//   unknown:     an action type this map does not know, or a card with no known modality
// A turn is the strongest of its actions: explanation, then material, then scaffold, then none; unknown only when nothing known
// outranks none. Strategy (socrates or feynman) is not read.
export const INTERACTIVE = ['challenge', 'quiz', 'flashcards', 'code', 'notebook', 'graph', 'scene', 'animation', 'whiteboard', 'model3d'];
const EXPLAIN = ['respond_text', 'handoff', 'suggest_depth', 'suggest_avatar_clip'];
const NOTHING = ['ask_question', 'suggest_practice', 'suggest_dive', 'open_dive', 'return_from_dive', 'suggest_journey', 'suggest_research', 'next_section', 'no_action'];
const CARDS = ['show_authored_card', 'focus_part', 'create_material'];
export function assistanceOfAction({ action_type: type, modality = null } = {}) {
  if (EXPLAIN.includes(type)) return 'explanation';
  if (NOTHING.includes(type)) return 'none';
  if (CARDS.includes(type)) return modality == null ? 'unknown' : INTERACTIVE.includes(modality) ? 'scaffold' : 'material';
  return 'unknown';
}
const RANK = { explanation: 3, material: 2, scaffold: 1, none: 0 };
export function assistanceOf(actions = []) {
  const values = actions.map(assistanceOfAction);
  const known = values.filter(value => value in RANK);
  if (!known.length) return values.length ? 'unknown' : 'none';
  const top = known.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
  return top === 'none' && values.includes('unknown') ? 'unknown' : top;
}

const evidence = summary => ({
  evidence_understood: count(summary?.understood?.length), evidence_uncertain: count(summary?.uncertain?.length), evidence_misconception: count(summary?.misconception?.length),
  evidence_prerequisite_gap: count(summary?.prerequisite_gap?.length), evidence_not_observed: count(summary?.not_yet_observed?.length),
});
// Where the event belongs. The learner's own canvas (app id) only for an owned scope; a shared canvas is only its one-way key.
// The server confirms ownership before it keeps canvas_ref.
const where = identity => {
  const scope = oneOf(['owned', 'shared'], identity?.scope);
  return {
    session_id: id(identity?.session_id), scope, mode: oneOf(['journey', 'dive', 'course', 'canvas', 'shared'], identity?.mode),
    canvas_ref: scope === 'owned' ? id(identity?.canvas_id) : undefined, board: token(identity?.board_id), share_key: id(identity?.source?.share_key),
    journey_id: id(identity?.journey_id), section_id: id(identity?.section_id), dive_id: id(identity?.dive_id),
  };
};
const usageOf = usage => usageSnapshot({ input_tokens: usage?.input_tokens ?? undefined, output_tokens: usage?.output_tokens ?? undefined,
  cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? undefined, cache_read_input_tokens: usage?.cache_read_input_tokens ?? undefined }) ?? undefined;

// One v1 event to { name, event_id, turn_id, versions, payload } or null for an event this sink does not carry.
export function mapTutorEvent(event) {
  if (!event || event.trace_schema_version !== 1) return null;
  const { identity = {}, versions = {}, decision = {}, runtime = {} } = event;
  const base = { event_id: id(`tev-${event.decision_id}`), versions: clean({ planner: token(versions.planner_version), prompt: token(versions.prompt_version), model: token(versions.model_id) }) };
  if (!base.event_id) return null;
  if (event.event === 'tutor_decision') {
    const actions = (decision.actions || []).map(({ action_type, modality }) => ({ action_type, modality }));
    const chosen = decision.chosen_action || {}, transitions = decision.evidence_transitions || [], validation = runtime.validation || {}, timing = runtime.timing || {};
    return { ...base, name: 'tutor.decision', turn_id: id(event.step_id), versions: { ...base.versions, mapping: ASSISTANCE_MAP_VERSION }, payload: clean({
      ...where(identity), ...evidence(decision.evidence_summary), target_claims: ids(decision.target_claim_ids, 3),
      transitions: count(transitions.length), to_misconception: count(transitions.filter(t => t?.to === 'misconception').length), to_understood: count(transitions.filter(t => t?.to === 'understood').length),
      intent_mode: oneOf(['auto', 'explicit_slash'], decision.intent_mode), inferred_intent: oneOf(['ask', 'teach', 'research', 'do'], decision.inferred_intent), intent_status: oneOf(['declared', 'missing', 'explicit'], decision.intent_status),
      action_type: token(chosen.action_type), modality: token(chosen.modality), cost_tier: oneOf(['none', 'model', 'paid'], chosen.cost_tier), capability: token(chosen.capability),
      actions: ids(actions.map(a => a.action_type), 3), reason_codes: ids(decision.reason_codes, 3), reason_source: oneOf(['planner', 'router'], decision.reason_source),
      selected_hook: id(decision.selected_next_step_id), clarification: bool(decision.clarification_requested),
      grounding: oneOf(['grounded', 'partially_grounded', 'insufficient_evidence', 'retrieval_failed'], decision.grounding_status),
      assistance_offered: assistanceOf(actions),
      model_escalated: bool(runtime.model?.escalated), model_calls: count(runtime.model?.calls),
      validation_ok: bool(validation.ok), dropped_actions: count(validation.dropped_actions), repairs: count((validation.repairs || []).length), repair_rules: ids(validation.repairs), fallback: token(validation.fallback),
      planner_ms: ms(timing.planner_ms), first_text_ms: ms(timing.first_text_ms), total_ms: ms(timing.total_ms), handoff_ms: ms(timing.handoff_ms), blocking_ms: ms(timing.blocking_wait_ms),
      usage: usageOf(runtime.usage), flags: ids(event.flags),
    }) };
  }
  const options = decision.next_step_options || [];
  if (event.event === 'next_steps_computed') {
    const flags = event.flags || [];
    return { ...base, name: 'tutor.hooks_computed', payload: clean({
      ...where(identity), set_id: id(event.step_id), suggestion_ids: ids(options.map(o => o.suggestion_id), 3),
      tier: token(runtime.model?.tier), escalated: bool(runtime.model?.escalated), cached: flags.includes('cached'), discarded: flags.includes('discarded'), calls: count(runtime.model?.calls),
      validation_ok: bool(runtime.validation?.ok), fallback: token(runtime.validation?.fallback), ...evidence(decision.evidence_summary),
      claim_count: count((decision.target_claim_ids || []).length), concept_count: count((decision.target_concept_ids || []).length),
      planner_ms: ms(runtime.timing?.planner_ms), usage: usageOf(runtime.usage),
    }) };
  }
  if (event.event === 'next_steps_shown') {
    const { session_id, scope, mode, canvas_ref, board, share_key } = where(identity);
    return { ...base, name: 'tutor.hooks_shown', payload: clean({ session_id, scope, mode, canvas_ref, board, share_key, set_id: id(event.step_id), suggestion_ids: ids(options.map(o => o.suggestion_id), 3) }) };
  }
  return null;
}

// The browser event as the contract's envelope, validated here against the same contract the server enforces. null when invalid.
export function tutorEnvelope(event) {
  const mapped = mapTutorEvent(event);
  if (!mapped || (mapped.name !== 'tutor.decision' && !mapped.payload.set_id)) return null;
  const envelope = makeEvent(mapped.name, { event_id: mapped.event_id, feature: 'tutor', ...(mapped.turn_id ? { turn_id: mapped.turn_id } : {}),
    ...(Object.keys(mapped.versions).length ? { versions: mapped.versions } : {}), payload: mapped.payload }, { environment: 'production', service: 'web' });
  const checked = validateEvent(envelope);
  return checked.ok ? checked.event : null;
}

export const FLUSH_MS = 5000, MAX_BATCH = 20, MAX_QUEUE = 100;
// The sink: queue, flush on a timer or when the page is hidden, never retry. A 401, 403 or 404 means no signed-in session (or no
// telemetry here): the sink stops for this page. Returns { sink, flush, stats }.
export function createTutorSink({ send, schedule = (fn, wait) => setTimeout(fn, wait) } = {}) {
  const queue = [];
  let timer = null, stopped = false, sent = 0, dropped = 0;
  async function flush({ beacon = false } = {}) {
    timer = null;
    if (!queue.length) return;
    const events = queue.splice(0, MAX_BATCH);
    try {
      const status = await send(JSON.stringify({ events }), { beacon });
      if ([401, 403, 404].includes(status)) stopped = true;
      if (status >= 200 && status < 300) sent += events.length; else dropped += events.length;
    } catch { dropped += events.length; }
    if (queue.length && !stopped) timer = schedule(() => flush(), FLUSH_MS);
  }
  const sink = event => {
    if (stopped) return;
    const envelope = tutorEnvelope(event);
    if (!envelope) { dropped++; return; }
    if (queue.length >= MAX_QUEUE) { dropped++; return; }
    queue.push(envelope);
    if (!timer) timer = schedule(() => flush(), FLUSH_MS);
  };
  return { sink, flush, stats: () => ({ sent, dropped, queued: queue.length, stopped }) };
}

// The page's sink: fetch with keepalive, or sendBeacon while the page is going away.
export function browserTutorSink(target = globalThis) {
  const original = target.fetch?.bind(target);
  const made = createTutorSink({ send: async (body, { beacon }) => {
    if (beacon && target.navigator?.sendBeacon?.(TUTOR_ENDPOINT, new Blob([body], { type: 'application/json' }))) return 202;
    return (await original(TUTOR_ENDPOINT, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true, credentials: 'same-origin' })).status;
  } });
  target.addEventListener?.('pagehide', () => { made.flush({ beacon: true }); });
  return made.sink;
}
