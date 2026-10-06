// The Tutor session event stream (docs/features/tutor-decision-eval.md): append-only events shaped like the
// production telemetry the product will later collect from real users, the fold that turns them into one record
// per Tutor decision, and the timing derived from them. The simulator writes these events; real sessions will too,
// and the metrics read only folded events, never the simulator.
// Events are append-only but NOT serial: background work (hooks generated while the learner reads) overlaps
// learner activity, so an event may be appended after one with a later t_ms. The fold orders by (t_ms, seq).
// PROVISIONAL: the payloads of next_steps_ready (hook options) and tutor_action_ready (decision) are the eval's
// normalized view until the Learning agent's HookSet / TutorDecisionTrace land; the envelope and event types are
// the owner's.

export const TRACE_SCHEMA_VERSION = 'tutor-trace-eval-0';

// Fields an event must carry besides the envelope. Learner words, material text and other free text live only
// under `debug`, which analytics never need.
export const EVENT_TYPES = {
  session_started: [],
  canvas_context_changed: [],
  next_steps_generation_started: ['hook_set_id'],
  next_steps_ready: ['hook_set_id', 'options'],
  next_step_selected: ['hook_set_id', 'option_id', 'position'],
  learner_message: ['kind', 'input'],
  learner_consumption_started: ['decision_id', 'timing_source'],
  learner_consumption_finished: ['decision_id', 'timing_source'],
  tutor_decision_started: ['decision_id', 'trigger'],
  tutor_action_ready: ['decision_id', 'decision'],
  material_generation_started: ['decision_id'],
  material_first_ready: ['decision_id'],
  material_complete: ['decision_id', 'timing_source', 'cache_status'],
  material_failed: ['decision_id'],
  asset_ready: ['decision_id'],
  evidence_updated: ['claims'],
  rabbit_hole_entered: ['dive_id'],
  rabbit_hole_left: ['dive_id'],
  session_ended: ['reason'],
};
const ENVELOPE = ['trace_schema_version', 'event_id', 'seq', 'type', 't_ms', 'session_id', 'user_id', 'canvas_id'];
const CONTEXT = ['board_id', 'canvas_version', 'journey_id', 'section_id', 'dive_id', 'source_resource_id'];
const IDS = ['session_id', 'user_id', 'canvas_id', 'board_id'];
// Never in an event, at any depth: credentials, hidden model reasoning, and email (never an analytics identity).
const FORBIDDEN_KEY = /token|api_?key|secret|password|authorization|cookie|thinking|chain_of_thought|e_?mail/i;
const ALLOWED_TOKEN_KEYS = new Set(['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']);

export function validateEvent(event) {
  const problems = [];
  for (const key of ENVELOPE) if (event[key] == null) problems.push(`missing ${key}`);
  if (event.trace_schema_version && event.trace_schema_version !== TRACE_SCHEMA_VERSION) problems.push(`trace_schema_version ${event.trace_schema_version}`);
  for (const key of IDS) if (typeof event[key] === 'string' && event[key].includes('@')) problems.push(`${key} looks like an email; use the internal id`);
  const required = EVENT_TYPES[event.type];
  if (!required) problems.push(`unknown type ${event.type}`);
  else for (const key of required) if (event[key] == null) problems.push(`${event.type} needs ${key}`);
  if (event.type === 'learner_message' && 'text' in event) problems.push('learner text belongs under debug');
  const walk = (value, path) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, inner] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key) && !ALLOWED_TOKEN_KEYS.has(key)) problems.push(`forbidden field ${path}${key}`);
      walk(inner, `${path}${key}.`);
    }
  };
  walk(event, '');
  return problems;
}

// One emitter per session: stamps the envelope, keeps seq monotonic, validates every event as it is written.
// clock(): the session's timeline in ms. emit(type, fields, at) places an event at an explicit time on it (work that
// ran in the background); without `at` it is now. context(): the ids that change during a session.
export function createEmitter({ session_id, user_id, canvas_id, clock, context = () => ({}) }) {
  const events = [];
  const origin = clock();
  const emit = (type, fields = {}, at = clock()) => {
    const seq = events.length + 1;
    const extra = Object.fromEntries(Object.entries(context()).filter(([key, value]) => CONTEXT.includes(key) && value != null));
    const event = { trace_schema_version: TRACE_SCHEMA_VERSION, event_id: `${session_id}:${seq}`, seq, type, t_ms: Math.round((at - origin) * 10) / 10, session_id, user_id, canvas_id, ...extra, ...fields };
    const problems = validateEvent(event);
    if (problems.length) throw Error(`event ${type}: ${problems.join('; ')}`);
    events.push(event);
    return event;
  };
  return { events, emit };
}

// ---------- Timing ----------

export const TIMING_SOURCES = ['measured', 'cached', 'estimated', 'not_run'];
export const CACHE_STATUSES = ['miss', 'hit', 'partial', 'not_applicable'];
export const CACHE_ORIGINS = ['fresh', 'product_cache', 'canonical_asset', 'session_asset'];
const span = (from, to) => (from == null || to == null ? null : Math.round((to - from) * 10) / 10);
const overlap = (a1, a2, b1, b2) => ([a1, a2, b1, b2].some(x => x == null) ? null : Math.max(0, Math.round((Math.min(a2, b2) - Math.max(a1, b1)) * 10) / 10));
const nonNegative = ms => (ms == null ? null : Math.max(0, ms));

// The step's timeline (ms on the session timeline) -> backend latencies and what the learner perceived.
//   t_learner_ready: when the learner finished the previous material (or sent the message this decision answers);
//   t_prev_consumption_started: when they started it. t0..t9 as in the brief.
// Backend time and perceived wait are different numbers: hooks generated while the learner reads cost backend time
// but no wait. A phase timed on the timeline is `measured`; the material reports its own source, and cached or
// estimated material carries durations instead of timestamps; not_run leaves them null - nothing is fabricated. A
// latency built on an estimated part carries `estimated`.
export function deriveTiming(tl, material = null) {
  const source = material?.timing_source ?? 'not_run';
  const durations = source === 'cached' || source === 'estimated' ? material.durations || {} : null;
  const pick = (key, measuredValue) => (source === 'measured' ? measuredValue : durations ? durations[key] ?? null : null);
  const first = pick('first_ms', span(tl.t6_material_generation_start, tl.t7_first_material_ready ?? tl.t8_material_complete));
  const complete = pick('complete_ms', span(tl.t6_material_generation_start, tl.t8_material_complete));
  const asset = material?.asset_applicable ? pick('asset_ms', span(tl.t6_material_generation_start, tl.t9_asset_ready)) : null;
  // The click: a hook selection; without one, the moment the learner was ready (their message, or the end of the material).
  const anchor = tl.t3_hook_selected ?? tl.t_learner_ready ?? tl.t0_state_ready;
  const start = (source === 'measured' ? tl.t6_material_generation_start : null) ?? tl.t5_tutor_action_ready;
  const after = from => ms => (ms == null || start == null ? null : Math.round((span(from, start) + ms) * 10) / 10);
  const sinceAnchor = after(anchor), sinceDecision = after(tl.t4_tutor_plan_start);
  const hooks = tl.t1_hooks_start != null && tl.t2_hooks_ready != null;
  const ready = tl.t_learner_ready;
  // A perceived hook wait that depends on simulated reading time (hooks overlapped an estimated consumption) is estimated.
  const overlapped = hooks && ready != null && tl.t1_hooks_start < ready;
  const hookWaitSource = !hooks ? null : overlapped && tl.prev_consumption_source && tl.prev_consumption_source !== 'measured' ? tl.prev_consumption_source : 'measured';
  const backendParts = [span(tl.t1_hooks_start, tl.t2_hooks_ready), span(tl.t4_tutor_plan_start, tl.t5_tutor_action_ready), source === 'measured' ? complete : null, tl.evaluation_ms ?? null, source === 'measured' ? asset : null];
  return {
    hook_backend_generation_ms: hooks ? span(tl.t1_hooks_start, tl.t2_hooks_ready) : null,
    hook_perceived_wait_ms: hooks && ready != null ? nonNegative(span(Math.max(ready, tl.t1_hooks_start), tl.t2_hooks_ready)) : null,
    hook_background_overlap_ms: hooks ? overlap(tl.t1_hooks_start, tl.t2_hooks_ready, tl.t_prev_consumption_started, ready) : null,
    // Before hooks could even start: the learner's last answer being evaluated and committed.
    state_wait_before_options_ms: hooks && ready != null ? nonNegative(span(ready, Math.min(tl.t1_hooks_start, tl.t2_hooks_ready))) : null,
    options_blocking_ms: hooks && ready != null ? nonNegative(span(ready, tl.t2_hooks_ready)) : null,
    hook_to_tutor_start_ms: span(tl.t3_hook_selected, tl.t4_tutor_plan_start),
    tutor_decision_ms: span(tl.t4_tutor_plan_start, tl.t5_tutor_action_ready),
    material_first_ready_ms: first,
    material_complete_ms: complete,
    decision_to_first_material_ms: sinceDecision(first),
    decision_to_complete_material_ms: sinceDecision(complete),
    click_to_first_material_ms: sinceAnchor(first),
    click_to_complete_material_ms: sinceAnchor(complete),
    asset_generation_ms: asset,
    click_to_asset_ready_ms: sinceAnchor(asset),
    evaluation_ms: tl.evaluation_ms ?? null,
    backend_generation_ms: Math.round(backendParts.reduce((n, ms) => n + (ms || 0), 0) * 10) / 10,
    timing_source: source,
    cache_status: material?.cache_status ?? 'not_applicable',
    cache_origin: material?.cache_origin ?? null,
    sources: {
      hooks: hooks ? 'measured' : null,
      hook_wait: hookWaitSource,
      tutor_decision: tl.t5_tutor_action_ready == null ? 'not_run' : 'measured',
      material: source,
      ...(material?.asset_applicable ? { asset: source === 'measured' && tl.t9_asset_ready == null ? 'not_run' : source } : {}),
    },
  };
}

// The learner's blocking waits in one step, each one entry in the wait histogram:
//   before_options: learner ready -> next-step options visible (state commit + the part of hook generation that did
//     not overlap their reading). 0 when background hooks were ready first.
//   after_click: click (or learner ready) -> first learner-facing material. Without material, click -> validated
//     action is only a lower bound and is flagged as one.
export function stepWaits(timing, tl) {
  const waits = [];
  if (timing.options_blocking_ms != null) waits.push({ kind: 'before_options', ms: timing.options_blocking_ms, hook_ms: timing.hook_perceived_wait_ms, state_ms: timing.state_wait_before_options_ms, source: timing.sources.hook_wait });
  if (timing.click_to_first_material_ms != null) waits.push({ kind: 'after_click', ms: timing.click_to_first_material_ms, lower_bound: false, source: timing.timing_source });
  else if (tl.t5_tutor_action_ready != null) waits.push({ kind: 'after_click', ms: span(tl.t3_hook_selected ?? tl.t_learner_ready ?? tl.t0_state_ready, tl.t5_tutor_action_ready), lower_bound: true, source: timing.timing_source });
  return waits;
}

// ---------- Fold: events -> one record per Tutor decision ----------

// events of ANY number of sessions (real or simulated, any arrival order) -> [{ meta, steps }], one per session_id.
export function foldSessions(events) {
  return Object.values(Object.groupBy(events, event => event.session_id)).map(foldSession);
}

const claimKey = claims => JSON.stringify((Array.isArray(claims) ? claims : Object.entries(claims || {}).map(([claim, s]) => ({ claim, ...s }))).map(entry => [entry.claim, entry.state]).sort());

export function foldSession(input) {
  const events = input.toSorted((a, b) => a.t_ms - b.t_ms || a.seq - b.seq);
  const first = events[0];
  const meta = { session_id: first.session_id, user_id: first.user_id, canvas_id: first.canvas_id, board_id: first.board_id ?? null, started_t_ms: first.t_ms, end: null, journey_ids: [], section_ids: [], incomplete_decisions: [] };
  const steps = [], open = {}; // open: decision_id -> its step, until its evidence and consumption are in
  let evidence = null, ready = first.t_ms, hooks = null, current = null, elapsed = 0;
  let learnerReady = null, consumptionStart = null, consumptionSource = null;
  const finish = step => {
    step.timing = deriveTiming(step.timeline, step.material);
    step.waits = stepWaits(step.timing, step.timeline);
    delete step.material;
  };
  const close = () => {
    if (!current) return;
    // A decision that never produced a validated action (planner error, cost stop) is not a step: it is listed apart.
    if (!current.tutor_decision) { meta.incomplete_decisions.push({ decision_id: current.decision_id, t_ms: current.timeline.t4_tutor_plan_start }); current = null; return; }
    current.evidence_after = evidence;
    elapsed += current.estimated_learning_seconds || 0;
    steps.push(current);
    current = null;
  };
  for (const event of events) {
    for (const [key, list] of [['journey_id', meta.journey_ids], ['section_id', meta.section_ids]]) if (event[key] && !list.includes(event[key])) list.push(event[key]);
    const step = event.decision_id ? open[event.decision_id] : null;
    switch (event.type) {
      case 'canvas_context_changed': ready = event.t_ms; break;
      case 'evidence_updated':
        if (hooks?.t1 != null && hooks.evidence_at_start !== claimKey(event.claims)) hooks.state_changed_after_start = true;
        evidence = event.claims;
        ready = event.t_ms;
        if (event.cause === 'learner_message' && current?.response_t != null && current.timeline.evaluation_ms == null) current.timeline.evaluation_ms = span(current.response_t, event.t_ms);
        break;
      case 'next_steps_generation_started': hooks = { id: event.hook_set_id, t0: ready, t1: event.t_ms, evidence_at_start: claimKey(evidence) }; break;
      case 'next_steps_ready': if (hooks?.id === event.hook_set_id) Object.assign(hooks, { t2: event.t_ms, options: event.options }); break;
      case 'next_step_selected': if (hooks?.id === event.hook_set_id) Object.assign(hooks, { t3: event.t_ms, selected: { id: event.option_id, position: event.position } }); break;
      case 'learner_consumption_started': if (step) { step.consumption.started = event.t_ms; step.consumption.source = event.timing_source; consumptionStart = event.t_ms; consumptionSource = event.timing_source; } break;
      case 'learner_consumption_finished': if (step) step.consumption.finished = event.t_ms; learnerReady = event.t_ms; break;
      case 'learner_message':
        learnerReady = event.t_ms;
        if (step && !step.learner_response) { step.learner_response = { kind: event.kind, input: event.input, ...(event.debug?.text != null ? { text: event.debug.text } : {}) }; step.response_t = event.t_ms; }
        break;
      case 'tutor_decision_started': {
        close();
        const shown = hooks?.options ? hooks : null;
        current = {
          step: steps.length + 1, decision_id: event.decision_id, trigger: event.trigger, elapsed_learning_seconds: elapsed,
          session_id: event.session_id, user_id: event.user_id, canvas_id: event.canvas_id, board_id: event.board_id ?? null,
          journey_id: event.journey_id ?? null, section_id: event.section_id ?? null, dive_id: event.dive_id ?? null,
          source_resource_id: event.source_resource_id ?? null, canvas_version: event.canvas_version ?? null,
          evidence_before: evidence, consumption: {},
          ...(shown ? {
            hook_set_id: shown.id, next_step_options: shown.options, learner_selected_option: shown.selected ?? null,
            hooks_overridden: !shown.selected && event.trigger === 'typed', hook_state_changed_after_start: !!shown.state_changed_after_start,
          } : {}),
          timeline: {
            t0_state_ready: shown?.t0 ?? ready,
            ...(learnerReady != null ? { t_learner_ready: learnerReady } : {}),
            ...(consumptionStart != null ? { t_prev_consumption_started: consumptionStart, prev_consumption_source: consumptionSource } : {}),
            ...(shown ? { t1_hooks_start: shown.t1, t2_hooks_ready: shown.t2, ...(shown.t3 != null ? { t3_hook_selected: shown.t3 } : {}) } : {}),
            t4_tutor_plan_start: event.t_ms,
          },
        };
        open[event.decision_id] = current;
        hooks = null; consumptionStart = null; consumptionSource = null;
        break;
      }
      case 'tutor_action_ready':
        if (!step) break;
        step.timeline.t5_tutor_action_ready = event.t_ms;
        Object.assign(step, { tutor_decision: event.decision, estimated_learning_seconds: event.estimated_learning_seconds ?? null, available_modalities: event.available_modalities ?? null, planner: event.planner ?? null, planner_version: event.planner_version ?? null, canvas_summary: event.debug?.material_summary ?? null });
        break;
      case 'material_generation_started': if (step) step.timeline.t6_material_generation_start = event.t_ms; break;
      case 'material_first_ready': if (step) step.timeline.t7_first_material_ready = event.t_ms; break;
      case 'material_complete':
        if (!step) break;
        step.timeline.t8_material_complete = event.t_ms;
        step.material = { timing_source: event.timing_source, cache_status: event.cache_status, cache_origin: event.cache_origin ?? null, asset_applicable: !!event.asset_applicable, durations: event.durations ?? null };
        if (event.material_signature) step.material_signature = event.material_signature;
        break;
      case 'material_failed': if (step) step.material_failed = event.error_code ?? true; break;
      case 'asset_ready': if (step) step.timeline.t9_asset_ready = event.t_ms; break;
      case 'session_ended': meta.end = { reason: event.reason, t_ms: event.t_ms }; break;
      default: break;
    }
  }
  close();
  for (const step of steps) { finish(step); delete step.response_t; }
  meta.decisions = steps.length;
  meta.learning_seconds = elapsed;
  return { meta, steps };
}

// ---------- Grouping (sessions -> segments per key) ----------

// Session-level keys are constant within a session; step-level keys (journey, section, resource, planner) split a
// session into contiguous segments, so a run or a switch never spans two segments.
export const GROUP_KEYS = {
  session: step => step.session_id,
  user: step => step.user_id,
  canvas: step => step.canvas_id,
  board: step => (step.board_id ? `${step.canvas_id}|${step.board_id}` : null),
  user_canvas: step => `${step.user_id}|${step.canvas_id}`,
  journey: step => step.journey_id,
  section: step => (step.section_id ? `${step.journey_id ?? ''}|${step.section_id}` : null),
  source_resource: step => step.source_resource_id,
  planner: step => step.planner_version,
};
export function segmentsBy(sessions, keyOf) {
  const groups = {};
  for (const { steps } of sessions) {
    let previous, segment = null;
    for (const step of steps) {
      const key = keyOf(step);
      if (key == null) { previous = undefined; segment = null; continue; }
      if (key !== previous || !segment) (groups[key] ||= []).push(segment = []);
      segment.push(step);
      previous = key;
    }
  }
  return groups;
}
