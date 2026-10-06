// Tutor v1 routes on the dev worker (docs/features/tutor-v1-implementation-map.md §5, §6):
//   POST /api/learn/tutor/evaluate  free text -> evidence events: JEV (800 ms, one batched request),
//                                   then the larger evaluator only when JEV is uncertain (8 s)
//   POST /api/learn/tutor/plan      one forced-tool planner call -> TutorResponse
//   POST /api/learn/tutor/next-steps  the hook planner -> HookSet (learn-next-steps-routes.js)
// evaluate and plan carry `telemetry` (per-rung ms, outcome, requested/served model, usage) for the bench; next-steps
// carries the hook planner's (tier, escalation, model, prompt version, usage, cost) for the decision trace.
// Nothing is stored here for a nanoGPT canvas: evidence is session-scoped in the browser (§2). A body with journey_id
// takes the journey path (adaptive-learning-path-v1-architecture.md §5): its evidence is the journey's, on the server.
import { authorizedBoardApp } from './learn-board.js';
import { contextDocumentBlocks } from './learn-context-docs.js';
import { JEV_TRANSPORTS, THRESHOLDS, askJev } from './learn-grade-jev.js';
import { anthropic } from './ask.js';
import { modelFailure } from './learn-research.js';
import { LEARN_TASKS, costUsd, loggedModel, promptVersion } from './learn-models.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { escalation } from './agents/learn-tutor-escalation.js';
import { evaluationFrom, firstSentence, largerInstruction, parseLarger, parsePartial, PLANNER_EFFORTS, plannerRequest, readTutorAnswers, tutorJevRequest, TUTOR_TOOL, tutorTool } from './agents/learn-tutor.js';
import { normalizeToolInput } from './tool-input.js';
import { JourneyConflict, appendJourneyEvidence, loadJourneyById } from './learn-journey-store.js';
import { claimsOfConceptIn } from '../../web/src/learn-tutor-claims.js';
import { JOURNEY_LIMITS } from '../../web/src/learn-journey.js';
import { NEXT_STEPS_BODY_CHARS, ownedNextSteps } from './learn-next-steps-routes.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export const JEV_TIMEOUT_MS = 800;
export const LARGER_TIMEOUT_MS = 8000;
const CONTEXT_LIMIT = 60000; // characters of planner context (about 12k tokens, §9)

const text = (value, max) => typeof value === 'string' && value.length <= max;
export function validateEvaluateBody(body) {
  const { message, spec } = body || {};
  if (typeof message !== 'string' || !message.trim() || message.length > 4000) return { error: 'message must be 1-4000 characters' };
  if (!spec || typeof spec !== 'object' || !Array.isArray(spec.claims) || !Array.isArray(spec.gaps)) return { error: 'spec.claims and spec.gaps are required' };
  if (spec.claims.length > 6 || spec.gaps.length > 4) return { error: 'at most 6 claims and 4 gaps' };
  for (const claim of spec.claims) {
    if (!text(claim?.id, 120) || !text(claim.concept, 60) || !text(claim.statement, 600) || !text(claim.drawn, 300)
      || !Array.isArray(claim.ideas) || claim.ideas.length > 4 || claim.ideas.some(idea => !text(idea, 300) || !idea)
      || !Array.isArray(claim.misconceptions) || claim.misconceptions.length > 5 || claim.misconceptions.some(wrong => !text(wrong?.id, 80) || !text(wrong?.check, 300))
      || (claim.prior_misconceptions != null && (!Array.isArray(claim.prior_misconceptions) || claim.prior_misconceptions.length > 5 || claim.prior_misconceptions.some(id => !text(id, 80))))) return { error: 'invalid claim' };
  }
  for (const gap of spec.gaps) if (!text(gap?.concept, 60) || !text(gap.statement, 600) || !Array.isArray(gap.claims)) return { error: 'invalid gap' };
  if (spec.question != null && !text(spec.question, 1200)) return { error: 'invalid question' };
  return { value: { message, spec: { answering: !!spec.answering, ...(spec.question ? { question: spec.question } : {}), claims: spec.claims, gaps: spec.gaps } } };
}

// The JEV rung. A timeout, a missing key or a bad answer is `error`: the caller stores nothing
// settled and no state changes. No retry: a 429/529 wait would outlast the 800 ms budget.
// `telemetry` is for the route response only; a timeout is askJev's JevError code 'timeout'.
export async function jevRung(env, spec, message, { ask = askJev } = {}) {
  const transport = env.TYPESAFE_API_KEY ? 'direct' : env.VERCEL_TYPESAFE_API_KEY ? 'gateway' : null;
  const telemetry = { called: false, ms: null, outcome: null, claims: spec.claims.length, ideas: spec.claims.reduce((n, claim) => n + claim.ideas.length, 0), questions: 0, error: null };
  if (!transport || env.SUBSCRIPTION_ONLY === 'true') {
    const error = 'Jev is not configured on this worker.';
    return { status: 'error', evaluator: 'jev', events: [], error, telemetry: { ...telemetry, error } };
  }
  const started = Date.now();
  try {
    const request = tutorJevRequest(spec, message, JEV_TRANSPORTS[transport].model);
    Object.assign(telemetry, { called: true, questions: Object.keys(request.questions).length });
    const { body } = await ask(env, request, { transport, timeoutMs: JEV_TIMEOUT_MS, sleep: () => Promise.reject(new Error('Jev busy')) });
    const answers = readTutorAnswers(body, spec);
    const result = { ...evaluationFrom(spec, answers, THRESHOLDS, 'jev'), evaluator: 'jev', escalation: escalation(spec, answers, THRESHOLDS) };
    return { ...result, telemetry: { ...telemetry, ms: Date.now() - started, outcome: result.status } };
  } catch (error) {
    return { status: 'error', evaluator: 'jev', events: [], error: error.message, telemetry: { ...telemetry, ms: Date.now() - started, outcome: error.code === 'timeout' ? 'timeout' : 'error', error: error.message } };
  }
}

// The larger rung: its own frozen task (LEARN_TASKS.tutor_evaluator, pinned model, no fallback)
// with a structured instruction. On error or timeout: `error`, nothing settled. The served model
// and usage come back in `telemetry`, so a model other than the requested one is visible.
export async function largerRung(env, spec, message, { callModel = loggedModel('tutor_evaluator', anthropic), timeoutMs = LARGER_TIMEOUT_MS } = {}) {
  const task = LEARN_TASKS.tutor_evaluator;
  const telemetry = { called: true, ms: null, outcome: null, requested_model: task.model, served_model: null, input_tokens: null, output_tokens: null, error: null };
  const started = Date.now();
  let timer;
  try {
    const call = (async () => {
      const response = await callModel(env, { max_tokens: task.maxTokens, messages: [{ role: 'user', content: largerInstruction(spec, message) }] }, task.model, null);
      if (!response.ok) throw await modelFailure(response, 'Evaluator unavailable');
      const result = await response.json();
      Object.assign(telemetry, { served_model: result.model ?? null, input_tokens: result.usage?.input_tokens ?? null, output_tokens: result.usage?.output_tokens ?? null });
      return result.content?.filter(block => block.type === 'text').map(block => block.text).join('\n') || '';
    })();
    const reply = await Promise.race([call, new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('The evaluator timed out'), { code: 'timeout' })), timeoutMs); })]);
    const result = { ...evaluationFrom(spec, parseLarger(reply, spec), THRESHOLDS, 'larger'), evaluator: 'larger' };
    return { ...result, telemetry: { ...telemetry, ms: Date.now() - started, outcome: result.status } };
  } catch (error) {
    return { status: 'error', evaluator: 'larger', events: [], error: error.message, telemetry: { ...telemetry, ms: Date.now() - started, outcome: error.code === 'timeout' ? 'timeout' : 'error', error: error.message } };
  }
  finally { clearTimeout(timer); }
}

const NOT_CALLED = { called: false, ms: null, outcome: null, reason: null, requested_model: null, served_model: null, input_tokens: null, output_tokens: null, error: null };

// Deterministic -> JEV -> larger (§3). The deterministic rung runs in the browser (the grade is
// already in the card's attemptLog), so this route starts at JEV. The larger evaluator runs only
// when the explicit escalation policy says so (v2 Stage C, agents/learn-tutor-escalation.js); an
// uncertain JEV answer it does not escalate is returned as is, its events unsettled.
export async function evaluateFreeText(env, spec, message, deps = {}) {
  const { telemetry: jevTelemetry, ...jev } = await jevRung(env, spec, message, deps);
  if (jev.status !== 'uncertain') return { ...jev, telemetry: { jev: jevTelemetry, larger: NOT_CALLED } };
  if (!jev.escalation.escalate) return { ...jev, telemetry: { jev: jevTelemetry, larger: { ...NOT_CALLED, reason: jev.escalation.reason } } };
  const { telemetry: largerTelemetry, ...larger } = await largerRung(env, spec, message, deps);
  const telemetry = { jev: jevTelemetry, larger: { ...largerTelemetry, reason: jev.escalation.reason } };
  // An errored larger rung keeps JEV's unsettled events (§3.3: stored unsettled, no state change).
  return larger.status === 'error' ? { ...jev, larger_error: larger.error, telemetry } : { ...larger, escalation: jev.escalation, telemetry };
}

// ---------- The journey evidence path (adaptive-learning-path-v1-architecture.md §5, §9.4, §10.2) ----------

const BOARD = /^[A-Za-z0-9 _.-]{1,100}$/; // learn-boards.js board names

// The free-text spec rebuilt from the journey registry, as the browser's evaluationSpec (web/src/learn-tutor.js) builds
// it: claim content, a gap check per prerequisite concept, and the named misconceptions each claim already has a settled
// event for. Only the claim ids, answering and question come from the body; any claim content it carries is ignored.
function journeySpec(journey, body) {
  const registry = journey.registry.claims;
  if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 4000) return { error: 'message must be 1-4000 characters' };
  if (!Array.isArray(body.claims) || !body.claims.length || body.claims.length > 6) return { error: 'claims must be 1-6 claim ids' };
  if (body.claims.some(id => typeof id !== 'string' || !Object.hasOwn(registry, id))) return { error: 'unknown_claim' };
  if (body.question != null && !text(body.question, 1200)) return { error: 'invalid question' };
  const ids = [...new Set(body.claims)], gaps = [];
  for (const id of ids) for (const concept of registry[id].prerequisites) {
    let gap = gaps.find(entry => entry.concept === concept);
    if (!gap) gaps.push(gap = { concept, statement: claimsOfConceptIn(registry, concept).map(other => registry[other].statement).join(' ').slice(0, 600), claims: [] });
    gap.claims.push(id);
  }
  const claims = ids.map(id => {
    const prior = [...new Set(journey.evidence.events.filter(event => event.claim === id && event.settled && event.misconception_id).map(event => event.misconception_id))];
    const { concept, statement, ideas, misconceptions, drawn } = registry[id];
    return { id, concept, statement, ideas, misconceptions, drawn, ...(prior.length ? { prior_misconceptions: prior } : {}) };
  });
  // Gaps are bounded as validateEvaluateBody bounds a browser spec: at most 4, each statement at most 600 characters.
  return { value: { answering: !!body.answering, ...(body.question ? { question: body.question } : {}), claims, gaps: gaps.slice(0, 4) } };
}

// The probe a body answers, while it is open (§6.3, §9.3): a diagnostic probe only during the diagnostic (never after a
// skip), a section check only while active and only in the current section's plan. The journey state decides which set
// is searched, so a check id equal to a diagnostic id is never graded with the diagnostic key; check ids are unique only
// within one plan, so a check's tag carries its section_id. null: no such probe; { closed: true }: it exists, not open.
function openProbe(journey, id) {
  const plan = journey.section_plan, diagnostic = journey.diagnostic.probes;
  if (journey.state === 'diagnostic' && !journey.diagnostic.skipped) {
    const probe = diagnostic.find(p => p.id === id);
    if (probe) return { probe, tag: { probe_id: id } };
  } else if (journey.state === 'active' && plan && plan.section_id === journey.active_section_id) {
    const probe = plan.checks?.find(p => p.id === id);
    if (probe) return { probe, tag: { probe_id: id, section_id: plan.section_id } };
  }
  return diagnostic.some(p => p.id === id) || plan?.checks?.some(p => p.id === id) ? { closed: true } : null;
}
// A probe's evidence is stored once: an answer to a probe already tagged on the journey (a reload between the answer and
// probe_advance, a double click, a retry) appends nothing, calls no evaluator and returns the stored evidence.
const answered = (journey, tag) => journey.evidence.events.some(e => e.ref?.probe_id === tag.probe_id && (e.ref.section_id ?? null) === (tag.section_id ?? null));
const replay = journey => ({ status: 'duplicate', evaluator: null, events: [], journey: { events: journey.evidence.events, seq: journey.evidence.seq, revision: journey.revision } });
const onCanvas = (journey, scope) => !!journey && journey.scope.app === scope.app && journey.scope.board === scope.board;
const TURN_ID = /^[\w-]{1,80}$/;

// A multiple-choice or prediction answer, graded from the probe's server-only key (§9.4), never by a model: the right
// option is a pass on each of the probe's claims (demonstrated_in_transfer on a transfer probe), a keyed wrong option a
// misconception on the claim that names it (a fail on the others), any other option a fail.
function probeEvaluation(registry, probe, option) {
  const pass = option === probe.key.correct, named = probe.key.misconceptions?.[option];
  const events = probe.claims.map(claim => {
    const own = !pass && !!named && registry.claims[claim].misconceptions.some(wrong => wrong.id === named);
    return {
      concept: registry.claims[claim].concept, claim, result: pass ? 'pass' : own ? 'misconception' : 'fail',
      kind: pass ? (probe.transfer ? 'demonstrated_in_transfer' : 'demonstrated_here') : null,
      settled: true, evaluator: 'deterministic', source: 'journey_probe', ...(own ? { misconception_id: named } : {}),
    };
  });
  return { status: 'settled', evaluator: 'deterministic', events };
}

// Only the journey's owner (access.user_id, §10.2; no id fails closed), on the canvas and board it lives on. The
// evaluation's events are stored only through appendJourneyEvidence; the response is the evaluation plus the journey's
// stored events and seq, which the browser adopts. An evaluator error stores nothing and still returns them.
// option_id set: a multiple-choice answer to a keyed probe. Otherwise free text, which may name the keyless probe it
// answers (probe_id). turn_id (optional, the browser's turn id) is kept on the ref only when it is a plain id.
async function journeyEvaluate(env, access, body, deps) {
  if (!access.user_id) return json({ error: 'identity_unavailable' }, 401);
  if (typeof body.journey_id !== 'string' || typeof body.board !== 'string' || !BOARD.test(body.board)) return json({ error: 'journey_id and board are required' }, 400);
  const scope = { org: access.org, owner_user_id: access.user_id, app: body.app, board: body.board };
  const journey = await loadJourneyById(env, body.journey_id, scope);
  if (!onCanvas(journey, scope)) return json({ error: 'no_journey' }, 404);
  const multiple = body.option_id != null, probing = multiple || body.probe_id != null;
  const open = probing ? openProbe(journey, body.probe_id) : null;
  if (probing && !open) return json({ error: 'unknown_probe' }, 400);
  if (open?.closed) return json({ error: 'probe_closed' }, 409);
  if (multiple && (!open.probe.key || !open.probe.options?.some(option => option.id === body.option_id))) return json({ error: 'unknown_option' }, 400);
  if (!multiple && open?.probe.key) return json({ error: 'unknown_probe' }, 400); // free text answers a keyless probe only
  // Final review A-m4 + C-m2 (ruling): an answer to an open probe is graded on the probe's own claims (all of them, at most
  // JOURNEY_LIMITS.probe_claims, in probe order), never on the claims the browser sent.
  const spec = multiple ? null : journeySpec(journey, open ? { ...body, claims: open.probe.claims.slice(0, JOURNEY_LIMITS.probe_claims) } : body);
  if (spec?.error) return json({ error: spec.error }, 400);
  if (open && answered(journey, open.tag)) return json(replay(journey));
  const evaluation = multiple ? probeEvaluation(journey.registry, open.probe, body.option_id) : await evaluateFreeText(env, spec.value, body.message, deps);
  const turnId = typeof body.turn_id === 'string' && TURN_ID.test(body.turn_id) ? body.turn_id : crypto.randomUUID();
  const ref = { turn_id: turnId, ...open?.tag, canvas: { app: scope.app, board: scope.board } };
  let j = journey;
  for (let attempt = 0; ; attempt++) {
    try {
      // Final review A-m6: with the revision the evidence was saved at, so the browser's probe_advance needs no 409 retry.
      const { journey: saved, events, seq } = await appendJourneyEvidence(env, j, evaluation, ref);
      return json({ ...evaluation, journey: { events, seq, revision: saved.revision } });
    } catch (error) {
      if (!(error instanceof JourneyConflict)) throw error;
      // Another tab moved the journey during the evaluation: reload once and store on the fresh revision, so a (possibly
      // paid) evaluation is not lost. A second conflict, or an archived or missing journey, stores nothing.
      if (error.code !== 'revision' || attempt) return json({ error: error.code }, 409);
      j = await loadJourneyById(env, j.id, scope);
      if (!onCanvas(j, scope)) return json({ error: 'no_journey' }, 409);
      if (open && answered(j, open.tag)) return json(replay(j));
    }
  }
}

// The TutorResponse at top level (the client reads it) plus `telemetry`. A failure throws with
// `error.telemetry`: outcome 'invalid' when the reply has no usable tutor_response, else 'error'.
// A streamed planner reply (Anthropic SSE) -> the same shape as a non-streamed one. The tutor_response
// input is parsed strictly at the end (eager streaming skips the API's own check); `onInput` sees the
// input so far after every fragment.
// onDelta (optional) sees every content delta, thinking included: the first one is the planner's first output.
export async function readPlannerStream(response, onInput, onDelta = null) {
  const message = { model: null, usage: {}, stop_reason: null, content: [] };
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', tool = null, input = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      let event;
      try { event = JSON.parse(line.slice(6)); } catch { continue; }
      if (event.type === 'message_start') Object.assign(message, { model: event.message?.model ?? null, usage: { ...event.message?.usage } });
      else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use' && event.content_block.name === TUTOR_TOOL.name && tool == null) tool = event.index;
      else if (event.type === 'content_block_delta' && event.index === tool && event.delta?.type === 'input_json_delta') { onDelta?.(); input += event.delta.partial_json || ''; onInput?.(input); }
      else if (event.type === 'content_block_delta') onDelta?.();
      else if (event.type === 'message_delta') { message.stop_reason = event.delta?.stop_reason ?? message.stop_reason; Object.assign(message.usage, event.usage || {}); }
    }
  }
  if (tool != null) {
    let parsed;
    try { parsed = JSON.parse(input); } catch { parsed = null; }
    message.content.push({ type: 'tool_use', name: TUTOR_TOOL.name, input: parsed });
  }
  return message;
}

// The streamed plan as written up to the end of its actions, once the actions array has closed (parsePartial keeps a key
// after `actions` only once the array has ended), else null. Everything fastPlanProblem reads is in it: an
// explicit_request written after the actions is left out, which only makes the check stricter.
function streamedActions(input) {
  const { value } = parsePartial(input);
  const keys = value && typeof value === 'object' ? Object.keys(value) : [];
  const at = keys.indexOf('actions');
  return at >= 0 && at < keys.length - 1 && Array.isArray(value.actions) ? Object.fromEntries(keys.slice(0, at + 1).map(key => [key, value[key]])) : null;
}

// One planner call on `model`. effort: output_config.effort, or null for the model default.
// onSentence (v2 checkpoint I): stream the reply and hand over the plan's first sentence as soon as
// firstSentence finds it. Not under SUBSCRIPTION_ONLY, whose bridge replays text only.
// Decision 5A: TUTOR_PLANNER_CACHE=on caches the stable planner prefix (plannerRequest); off by default
// (Baseline A) and never under SUBSCRIPTION_ONLY, whose bridge's handling of a cached system block is
// unverified. Cache writes and reads come back in telemetry; latency gains are claimed only once measured.
// Decision 5B: TUTOR_PLANNER_SPEED=fast runs the Opus 5.5 planner in fast mode (benchmark arm C only;
// off by default). Opus only - a fast-tier model never gets it - and never under SUBSCRIPTION_ONLY.
// telemetry.speed is the API's usage.speed, so a request served at standard speed is visible.
// onActions(head, ms) (the fast tier, Decision 2): called once, when the streamed actions are complete (streamedActions);
// it returns true when the turn has spoken on them. From then on that plan is kept: a remainder (move, reason and
// reason_codes, written last) that is cut, unparsable or lost keeps those actions, with reason and reason_codes null and
// telemetry.tail_lost (no rollback).
async function planOnce(env, context, model, effort, { callModel = loggedModel('tutor', anthropic), onSentence = null, onActions = null } = {}, documents = []) {
  const started = Date.now();
  const stream = !!onSentence && env.SUBSCRIPTION_ONLY !== 'true';
  const cache = env.TUTOR_PLANNER_CACHE !== 'off' && env.SUBSCRIPTION_ONLY !== 'true'; // F default: on
  const speed = env.TUTOR_PLANNER_SPEED === 'fast' && model === LEARN_TASKS.tutor.model && env.SUBSCRIPTION_ONLY !== 'true' ? 'fast' : null;
  // TUTOR_AVATAR=on adds suggest_avatar_clip (Avatar Teacher §4.1); unset or anything else, the request is unchanged.
  const request = plannerRequest(context, LEARN_TASKS.tutor.maxTokens, documents, { effort, stream, cache, speed, avatar: env.TUTOR_AVATAR === 'on' });
  // TutorDecisionEvent versions (professor-next-steps.md §3.1): prompt_version is every system block and the tool sent (a hook
  // turn's NEXT_STEP_SYSTEM included), hashed beside the model call and awaited after it, never in front of it; cost_usd prices
  // the reported usage at the requested model, null without usage.
  const version = promptVersion(request.system, request.tools);
  const telemetry = { ms: null, requested_model: model, effort, served_model: null, input_tokens: null, output_tokens: null, ...(cache ? { cache: true, cache_creation_input_tokens: null, cache_read_input_tokens: null } : {}), ...(speed ? { requested_speed: speed, speed: null } : {}), stop_reason: null, outcome: null, ...(stream ? { streamed: true, first_output_ms: null, first_sentence_ms: null } : {}),
    prompt_version: null, cost_usd: null };
  const done = outcome => ({ ...telemetry, ms: Date.now() - started, outcome });
  const schema = tutorTool(env.TUTOR_AVATAR === 'on').input_schema;
  let result, actionsSeen = false, spoke = null;
  const kept = () => ({ ...normalizeToolInput(schema, spoke), reason: null, reason_codes: null, telemetry: { ...done('ok'), tail_lost: true } });
  try {
    const response = await callModel(env, request, model, null);
    if (!response.ok) throw await modelFailure(response, 'The tutor is unavailable');
    result = stream ? await readPlannerStream(response, input => {
      if (telemetry.first_sentence_ms == null) {
        const sentence = firstSentence(input);
        if (sentence) { telemetry.first_sentence_ms = Date.now() - started; telemetry.first_sentence_action = sentence.action; onSentence(sentence); }
      }
      if (onActions && !actionsSeen) {
        const head = streamedActions(input);
        if (head) { actionsSeen = true; if (onActions(head, Date.now() - started)) spoke = head; }
      }
    }, () => { telemetry.first_output_ms ??= Date.now() - started; }) : await response.json();
  } catch (error) {
    telemetry.prompt_version = await version;
    if (spoke) return kept();
    throw Object.assign(error, { telemetry: done('error') });
  }
  telemetry.prompt_version = await version;
  Object.assign(telemetry, { served_model: result.model ?? null, input_tokens: result.usage?.input_tokens ?? null, output_tokens: result.usage?.output_tokens ?? null, stop_reason: result.stop_reason ?? null,
    ...(speed ? { speed: result.usage?.speed ?? null } : {}), ...(cache ? { cache_creation_input_tokens: result.usage?.cache_creation_input_tokens ?? null, cache_read_input_tokens: result.usage?.cache_read_input_tokens ?? null } : {}),
    cost_usd: result.usage ? costUsd({ model, ...result.usage }) : null });
  const call = result.content?.find(block => block.type === 'tool_use' && block.name === TUTOR_TOOL.name);
  // An array or object sent as a JSON string is parsed once by the tool's schema (tool-input.js); a native plan is
  // returned as it came, so nanoGPT turns are unchanged.
  const input = call?.input && normalizeToolInput(schema, call.input);
  // After a release the spoken head wins: its actions and explicit_request are the ones that were checked (JSON.parse
  // keeps the last of a repeated key, so a later copy never replaces them); the full plan adds only its other fields
  // (move, reason, reason_codes), and a remainder that did not parse adds nothing (kept).
  if (spoke) {
    if (!input || typeof input !== 'object') return kept();
    const { actions, explicit_request, ...rest } = input;
    return { ...rest, ...normalizeToolInput(schema, spoke), telemetry: done('ok') };
  }
  if (!input || !Array.isArray(input.actions)) throw Object.assign(new Error('The tutor returned no turn'), { telemetry: done('invalid') });
  return { ...input, telemetry: done('ok') };
}

// v2 checkpoint H: the tiered planner, off unless TUTOR_PLANNER_FAST_MODEL names one of these exact ids
// (Decision 3, owner 2026-10-01: never substituted; Opus stays LEARN_TASKS.tutor.model, claude-opus-5-5)
// (claude-api skill model table, cached 2026-09-25).
export const FAST_PLANNER_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-5-5'];
// The accepted architecture (owner decision ACCEPT OPTION F, 2026-10-01; benchmark arm F): routine turns
// on Sonnet 5.5 at effort low, Opus 5.5 for everything else and whenever a fast plan fails its check,
// prompt caching on. These are the defaults when the knobs are unset. Opt-outs (benchmark arms, Baseline A
// reproduction): TUTOR_PLANNER_FAST_MODEL=off (Opus only), TUTOR_PLANNER_CACHE=off,
// TUTOR_PLANNER_FAST_EFFORT=default (the fast model's own default effort). Haiku 4.5 takes no effort.
export const PLANNER_DEFAULTS = Object.freeze({ fast_model: 'claude-sonnet-5-5', fast_effort: 'low', cache: 'on' });
// Routine: a question, request, slash, hole opening or hook click on a row whose move the router has already fixed.
// Everything else (misconceptions, unsettled or uncertain evidence, a return from a hole, any
// explanation or answer) stays on Opus 5.5.
const ROUTINE_ROWS = ['slash', 'off_slice', 'not_yet_observed', 'understood', 'gap', 'gap_inline'];
const ROUTINE_INTENTS = ['question', 'request', 'slash', 'opening', 'next_step'];
export function plannerTier(context) {
  const row = context?.route?.row, kind = context?.learner_intent?.kind;
  if (!ROUTINE_ROWS.includes(row)) return { tier: 'opus', reason: `row ${row}` };
  if (!ROUTINE_INTENTS.includes(kind)) return { tier: 'opus', reason: `intent ${kind}` };
  return { tier: 'fast', reason: `${row}/${kind}` };
}
// The fast plan's confidence check: any action outside the allowed types, or no words to say, sends
// the turn to Opus 5.5. The browser's validator still gates whichever plan comes back.
export function fastPlanProblem(plan, context) {
  const allowed = new Set([...(context?.allowed_actions || []), 'no_action', ...(plan.explicit_request ? ['respond_text', 'show_authored_card', 'focus_part'] : [])]);
  if (plan.actions.some(action => !allowed.has(action?.type))) return 'an action outside the allowed types';
  if (!plan.actions.some(action => (action?.type === 'respond_text' || action?.type === 'ask_question') && String(action.text || '').trim())) return 'no words';
  return null;
}

// v2 checkpoint G: TUTOR_PLANNER_EFFORT (one of PLANNER_EFFORTS) sets the Opus planner's effort; unset,
// the model default (Baseline A). H: TUTOR_PLANNER_FAST_MODEL (+ TUTOR_PLANNER_FAST_EFFORT) tiers it.
// The fast model gets the same system prompt, Teaching State, route and allowed actions: it never
// sets policy. A failed or unusable fast plan is re-planned on Opus 5.5 (telemetry.escalated).
// Decision 2: a fast-tier sentence is HELD until the fast plan's actions are complete and pass
// fastPlanProblem; an invalid or escalated fast plan speaks nothing, and Opus's re-plan streams its own
// sentence. No speculative speech, no rollback. Professor Next Steps Task 4: move, reason and reason_codes
// are written after the actions, so the sentence goes out when the actions are complete (planOnce
// onActions), not when the whole plan is; a plan without anything after its actions releases at its end,
// as before. first_sentence_ms on a fast plan is the release time; sentence_written_ms is when the fast
// model had written it.
export async function planTurn(env, context, deps = {}, documents = []) {
  // One first sentence per turn, even when a fast plan is re-planned on Opus.
  if (deps.onSentence) { let sent = false; const hand = deps.onSentence; deps = { ...deps, onSentence: text => { if (!sent) { sent = true; hand(text); } } }; }
  const level = name => PLANNER_EFFORTS.includes(env[name]) ? env[name] : null;
  const fastName = env.TUTOR_PLANNER_FAST_MODEL ?? PLANNER_DEFAULTS.fast_model;
  const fast = FAST_PLANNER_MODELS.includes(fastName) ? fastName : null;
  const fastEffort = env.TUTOR_PLANNER_FAST_EFFORT == null ? (fast === PLANNER_DEFAULTS.fast_model ? PLANNER_DEFAULTS.fast_effort : null) : level('TUTOR_PLANNER_FAST_EFFORT');
  const tier = fast ? plannerTier(context) : null;
  const opus = () => planOnce(env, context, LEARN_TASKS.tutor.model, level('TUTOR_PLANNER_EFFORT'), deps, documents);
  if (!tier) return opus();
  const tagged = (plan, extra) => ({ ...plan, telemetry: { ...plan.telemetry, tier: tier.tier, tier_reason: tier.reason, ...extra } });
  if (tier.tier === 'opus') {
    try { return tagged(await opus()); } catch (error) { throw Object.assign(error, { telemetry: { ...error.telemetry, tier: 'opus', tier_reason: tier.reason } }); }
  }
  let first, problem, held = null, releasedMs = null;
  const hold = deps.onSentence ? { ...deps, onSentence: sentence => { held ??= sentence; }, onActions: (head, ms) => {
    if (!held || fastPlanProblem(head, context)) return false;
    releasedMs = ms;
    deps.onSentence(held);
    return true;
  } } : deps;
  // A released sentence is never taken back: that plan stands (its head already passed the check).
  try { first = await planOnce(env, context, fast, fastEffort, hold, documents); problem = releasedMs != null ? null : fastPlanProblem(first, context); }
  catch (error) { first = { telemetry: error.telemetry }; problem = error.message; }
  if (!problem) {
    if (held && releasedMs == null) deps.onSentence(held);
    return tagged(first, { escalated: null, ...(held ? { sentence_written_ms: first.telemetry.first_sentence_ms, first_sentence_ms: releasedMs ?? first.telemetry.ms } : {}) });
  }
  const escalated = { tier: 'opus', tier_reason: tier.reason, escalated: problem, fast: first.telemetry ?? null };
  let plan;
  try { plan = await opus(); } catch (error) { throw Object.assign(error, { telemetry: { ...error.telemetry, ...escalated } }); }
  return { ...plan, telemetry: { ...plan.telemetry, ...escalated } };
}

export async function tutorRoute(path, req, env, deps = {}) {
  if (path !== '/api/learn/tutor/evaluate' && path !== '/api/learn/tutor/plan' && path !== '/api/learn/tutor/next-steps') return null;
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  let body;
  if (path === '/api/learn/tutor/next-steps') {
    // The raw body is bounded before parsing, so padding outside input is refused too (input itself: 12000, checked later).
    const raw = await req.text();
    if (raw.length > NEXT_STEPS_BODY_CHARS) return json({ error: `the request body must be at most ${NEXT_STEPS_BODY_CHARS} characters` }, 400);
    try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
  } else {
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  }
  const access = await (deps.authorize || authorizedBoardApp)(req, env, body?.app, body?.pending || null);
  if (access instanceof Response) return access;
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  const ownerRefused = subscriptionOwnerRefusal(env, access);
  if (ownerRefused) return ownerRefused;
  // Professor Next Steps (learn-next-steps-routes.js): the same gates, a separate call, never part of a Tutor turn.
  if (path === '/api/learn/tutor/next-steps') return ownedNextSteps(env, access, body, deps);
  if (path === '/api/learn/tutor/evaluate') {
    if (body.journey_id != null) return journeyEvaluate(env, access, body, deps);
    const input = validateEvaluateBody(body);
    if (input.error) return json({ error: input.error }, 400);
    return json(await evaluateFreeText(env, input.value.spec, input.value.message, deps));
  }
  const serialized = JSON.stringify(body?.context ?? null);
  if (!body?.context || typeof body.context !== 'object' || serialized.length > CONTEXT_LIMIT) return json({ error: `context must be an object of at most ${CONTEXT_LIMIT} characters` }, 400);
  // The canvas's switched-on context documents reach the planner (canvas-context-docs.md); JEV is unchanged.
  let documents;
  try { documents = await (deps.documents || contextDocumentBlocks)(env, access); } catch (error) { return json({ error: `Context documents: ${error.message}` }, 502); }
  // v2 checkpoint I: { stream: true } answers in NDJSON - {type:'sentence', text} as soon as the plan's
  // first sentence is written, then {type:'plan', ...TutorResponse} or {type:'error', error, telemetry}.
  // The browser validates the sentence against the route before anything is spoken (speakable).
  if (body.stream === true) {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter(), encoder = new TextEncoder();
    const send = event => writer.write(encoder.encode(`${JSON.stringify(event)}\n`)).catch(() => {});
    (async () => {
      try { await send({ type: 'plan', ...await planTurn(env, body.context, { ...deps, onSentence: sentence => send({ type: 'sentence', ...sentence }) }, documents) }); }
      catch (error) { await send({ type: 'error', error: error.message, telemetry: error.telemetry }); }
      finally { await writer.close().catch(() => {}); }
    })();
    return new Response(readable, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
  }
  try { return json(await planTurn(env, body.context, deps, documents)); } catch (error) { return json({ error: error.message, telemetry: error.telemetry }, 502); }
}
