// The Tutor session event stream (docs/features/tutor-decision-eval.md): append-only events shaped like the
// production telemetry the product will later collect from real users, the fold that turns them into one record
// per Tutor decision, and the timing derived from them. The simulator writes these events; real sessions will too,
// and the metrics read only folded events, never the simulator.
// PROVISIONAL: the payloads of next_steps_ready (hook options) and tutor_action_ready (decision) are the eval's
// normalized view until the Learning agent's HookSet / TutorDecisionTrace land; the envelope and event types are
// the owner's.

export const TRACE_SCHEMA_VERSION = 'tutor-trace-eval-0';

// Fields an event may carry besides the envelope; required ones first. Learner words, material text and other
// free text live only under `debug`, which analytics never need.
export const EVENT_TYPES = {
  session_started: [],
  canvas_context_changed: [],
  next_steps_generation_started: ['hook_set_id'],
  next_steps_ready: ['hook_set_id', 'options'],
  next_step_selected: ['hook_set_id', 'option_id', 'position'],
  learner_message: ['kind', 'input'],
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
const CONTEXT = ['canvas_version', 'journey_id', 'section_id', 'dive_id'];
// Never in an event, at any depth: credentials and hidden model reasoning.
const FORBIDDEN_KEY = /token|api_?key|secret|password|authorization|cookie|thinking|chain_of_thought/i;
const ALLOWED_TOKEN_KEYS = new Set(['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']);

export function validateEvent(event) {
  const problems = [];
  for (const key of ENVELOPE) if (event[key] == null) problems.push(`missing ${key}`);
  if (event.trace_schema_version && event.trace_schema_version !== TRACE_SCHEMA_VERSION) problems.push(`trace_schema_version ${event.trace_schema_version}`);
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
// context(): the ids that change during a session (canvas_version, journey_id, section_id, dive_id).
export function createEmitter({ session_id, user_id, canvas_id, clock, context = () => ({}) }) {
  const events = [];
  const origin = clock();
  const emit = (type, fields = {}) => {
    const seq = events.length + 1;
    const extra = Object.fromEntries(Object.entries(context()).filter(([key, value]) => CONTEXT.includes(key) && value != null));
    const event = { trace_schema_version: TRACE_SCHEMA_VERSION, event_id: `${session_id}:${seq}`, seq, type, t_ms: Math.round((clock() - origin) * 10) / 10, session_id, user_id, canvas_id, ...extra, ...fields };
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

// The step's timeline (t0..t9, ms from session start) -> the derived latencies. A phase timed by the event clock
// is `measured`; the material reports its own source. Cached or estimated material carries durations instead of
// timestamps, and material that was not run leaves them null - nothing is fabricated. A click-to-material latency
// adds the measured click -> generation start to the material duration, so it carries the material's source.
// timing_source: the material phase's source (the one that varies between cards, Motion, Avatar).
export function deriveTiming(tl, material = null) {
  const source = material?.timing_source ?? 'not_run';
  const durations = source === 'cached' || source === 'estimated' ? material.durations || {} : null;
  const pick = (key, measuredValue) => (source === 'measured' ? measuredValue : durations ? durations[key] ?? null : null);
  const first = pick('first_ms', span(tl.t6_material_generation_start, tl.t7_first_material_ready ?? tl.t8_material_complete));
  const complete = pick('complete_ms', span(tl.t6_material_generation_start, tl.t8_material_complete));
  const asset = material?.asset_applicable ? pick('asset_ms', span(tl.t6_material_generation_start, tl.t9_asset_ready)) : null;
  // A click is the hook selection; a step without one starts when its state was ready (an opening or typed message).
  const anchor = tl.t3_hook_selected ?? tl.t0_state_ready;
  const start = (source === 'measured' ? tl.t6_material_generation_start : null) ?? tl.t5_tutor_action_ready;
  const after = from => ms => (ms == null || start == null ? null : Math.round((span(from, start) + ms) * 10) / 10);
  const sinceAnchor = after(anchor), sinceDecision = after(tl.t4_tutor_plan_start);
  return {
    hooks_ms: span(tl.t1_hooks_start, tl.t2_hooks_ready),
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
    timing_source: source,
    cache_status: material?.cache_status ?? 'not_applicable',
    cache_origin: material?.cache_origin ?? null,
    sources: {
      hooks: tl.t1_hooks_start == null ? null : 'measured',
      tutor_decision: tl.t5_tutor_action_ready == null ? 'not_run' : 'measured',
      material: source,
      ...(material?.asset_applicable ? { asset: source === 'measured' && tl.t9_asset_ready == null ? 'not_run' : source } : {}),
    },
  };
}

// What the learner sits through in one step, as separate waits (each one entry in the wait histogram):
//   before_hooks: the previous response's evaluation plus hook generation (counted as blocking).
//   for_material: click -> first learner-facing material. Without material, click -> validated action is only a
//   lower bound and is flagged as one.
// ponytail: hooks count as blocking; if the Learning contract computes them while the learner reads, drop them.
export function stepWaits(timing, previousEvaluationMs = null) {
  const waits = [];
  if (timing.hooks_ms != null || previousEvaluationMs != null) waits.push({ kind: 'before_hooks', ms: (previousEvaluationMs || 0) + (timing.hooks_ms || 0), lower_bound: false });
  if (timing.click_to_first_material_ms != null) waits.push({ kind: 'for_material', ms: timing.click_to_first_material_ms, lower_bound: false, source: timing.timing_source });
  else if (timing.tutor_decision_ms != null) waits.push({ kind: 'for_material', ms: (timing.hook_to_tutor_start_ms || 0) + timing.tutor_decision_ms, lower_bound: true, source: timing.timing_source });
  return waits;
}

// ---------- Fold: events -> one record per Tutor decision ----------

// events of ANY number of sessions (real or simulated) -> [{ meta, steps }], one per session_id, in seq order.
export function foldSessions(events) {
  const bySession = Object.groupBy(events, event => event.session_id);
  return Object.values(bySession).map(list => foldSession(list.toSorted((a, b) => a.seq - b.seq)));
}

export function foldSession(events) {
  const first = events[0];
  const meta = { session_id: first.session_id, user_id: first.user_id, canvas_id: first.canvas_id, started_t_ms: first.t_ms, end: null, journey_ids: [], section_ids: [], incomplete_decisions: [] };
  const steps = [];
  let evidence = null, ready = first.t_ms, hooks = null, current = null, elapsed = 0;
  let lastMessage = null, evaluationMs = null, previousEvaluationMs = null;
  const close = () => {
    if (!current) return;
    // A decision that never produced a validated action (planner error, cost stop) is not a step: it is listed apart.
    if (!current.tutor_decision) { meta.incomplete_decisions.push({ decision_id: current.decision_id, t_ms: current.timeline.t4_tutor_plan_start }); current = null; return; }
    current.evidence_after = evidence;
    current.timeline.evaluation_ms = evaluationMs;
    current.timing = deriveTiming(current.timeline, current.material);
    current.waits = stepWaits(current.timing, previousEvaluationMs);
    elapsed += current.estimated_learning_seconds || 0;
    previousEvaluationMs = evaluationMs;
    evaluationMs = null;
    delete current.material;
    steps.push(current);
    current = null;
  };
  for (const event of events) {
    for (const [key, list] of [['journey_id', meta.journey_ids], ['section_id', meta.section_ids]]) if (event[key] && !list.includes(event[key])) list.push(event[key]);
    const mine = current && event.decision_id === current.decision_id;
    switch (event.type) {
      case 'canvas_context_changed': ready = event.t_ms; break;
      case 'evidence_updated':
        evidence = event.claims;
        ready = event.t_ms;
        if (event.cause === 'learner_message' && lastMessage != null) evaluationMs = Math.round((event.t_ms - lastMessage) * 10) / 10;
        break;
      case 'next_steps_generation_started': hooks = { id: event.hook_set_id, t0: ready, t1: event.t_ms }; break;
      case 'next_steps_ready': if (hooks?.id === event.hook_set_id) Object.assign(hooks, { t2: event.t_ms, options: event.options }); break;
      case 'next_step_selected':
        if (hooks?.id === event.hook_set_id) Object.assign(hooks, { t3: event.t_ms, selected: { id: event.option_id, position: event.position } });
        break;
      case 'learner_message':
        lastMessage = event.t_ms;
        if (current && !current.learner_response) current.learner_response = { kind: event.kind, input: event.input, ...(event.debug?.text != null ? { text: event.debug.text } : {}) };
        if (hooks?.options && !hooks.selected && event.input === 'typed') hooks.typed_instead = true;
        break;
      case 'tutor_decision_started': {
        close();
        const shown = hooks?.options ? hooks : null;
        current = {
          step: steps.length + 1, decision_id: event.decision_id, trigger: event.trigger, elapsed_learning_seconds: elapsed,
          session_id: event.session_id, user_id: event.user_id, canvas_id: event.canvas_id,
          journey_id: event.journey_id ?? null, section_id: event.section_id ?? null, dive_id: event.dive_id ?? null, canvas_version: event.canvas_version ?? null,
          evidence_before: evidence,
          ...(shown ? { hook_set_id: shown.id, next_step_options: shown.options, learner_selected_option: shown.selected ?? null, hooks_overridden: !!shown.typed_instead && !shown.selected } : {}),
          timeline: { t0_state_ready: shown?.t0 ?? ready, ...(shown ? { t1_hooks_start: shown.t1, t2_hooks_ready: shown.t2, ...(shown.t3 != null ? { t3_hook_selected: shown.t3 } : {}) } : {}), t4_tutor_plan_start: event.t_ms },
        };
        hooks = null;
        break;
      }
      case 'tutor_action_ready':
        if (!mine) break;
        current.timeline.t5_tutor_action_ready = event.t_ms;
        Object.assign(current, { tutor_decision: event.decision, estimated_learning_seconds: event.estimated_learning_seconds ?? null, available_modalities: event.available_modalities ?? null, planner: event.planner ?? null, canvas_summary: event.debug?.material_summary ?? null });
        break;
      case 'material_generation_started': if (mine) current.timeline.t6_material_generation_start = event.t_ms; break;
      case 'material_first_ready': if (mine) current.timeline.t7_first_material_ready = event.t_ms; break;
      case 'material_complete':
        if (!mine) break;
        current.timeline.t8_material_complete = event.t_ms;
        current.material = { timing_source: event.timing_source, cache_status: event.cache_status, cache_origin: event.cache_origin ?? null, asset_applicable: !!event.asset_applicable, durations: event.durations ?? null };
        if (event.material_signature) current.material_signature = event.material_signature;
        break;
      case 'material_failed': if (mine) current.material_failed = event.error_code ?? true; break;
      case 'asset_ready': if (mine) current.timeline.t9_asset_ready = event.t_ms; break;
      case 'session_ended': meta.end = { reason: event.reason, t_ms: event.t_ms }; break;
      default: break;
    }
  }
  close();
  meta.decisions = steps.length;
  meta.learning_seconds = elapsed;
  return { meta, steps };
}

// ---------- Grouping (sessions -> segments per key) ----------

// Session-level keys are constant within a session; step-level keys (journey, section, dive) split a session into
// contiguous segments, so a run or a switch never spans two segments.
export const GROUP_KEYS = {
  session: step => step.session_id,
  user: step => step.user_id,
  canvas: step => step.canvas_id,
  user_canvas: step => `${step.user_id}|${step.canvas_id}`,
  journey: step => step.journey_id,
  section: step => (step.section_id ? `${step.journey_id ?? ''}|${step.section_id}` : null),
  planner: step => (step.planner ? [step.planner.model, step.planner.version].filter(Boolean).join('@') || null : null),
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
