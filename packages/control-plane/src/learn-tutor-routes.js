// Tutor v1 routes on the dev worker (docs/features/tutor-v1-implementation-map.md §5, §6):
//   POST /api/learn/tutor/evaluate  free text -> evidence events: JEV (800 ms, one batched request),
//                                   then the larger evaluator only when JEV is uncertain (8 s)
//   POST /api/learn/tutor/plan      one forced-tool planner call -> TutorResponse
// Both responses carry `telemetry` (per-rung ms, outcome, requested/served model, usage) for the bench.
// Nothing is stored here: evidence is session-scoped in the browser (§2).
import { authorizedBoardApp } from './learn-board.js';
import { contextDocumentBlocks } from './learn-context-docs.js';
import { JEV_TRANSPORTS, THRESHOLDS, askJev } from './learn-grade-jev.js';
import { anthropic } from './ask.js';
import { modelFailure } from './learn-research.js';
import { LEARN_TASKS, loggedModel } from './learn-models.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { escalation } from './agents/learn-tutor-escalation.js';
import { evaluationFrom, firstSentence, largerInstruction, parseLarger, PLANNER_EFFORTS, plannerRequest, readTutorAnswers, tutorJevRequest, TUTOR_TOOL } from './agents/learn-tutor.js';

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

// One planner call on `model`. effort: output_config.effort, or null for the model default.
// onSentence (v2 checkpoint I): stream the reply and hand over the plan's first sentence as soon as
// firstSentence finds it. Not under SUBSCRIPTION_ONLY, whose bridge replays text only.
// Decision 5A: TUTOR_PLANNER_CACHE=on caches the stable planner prefix (plannerRequest); off by default
// (Baseline A) and never under SUBSCRIPTION_ONLY, whose bridge's handling of a cached system block is
// unverified. Cache writes and reads come back in telemetry; latency gains are claimed only once measured.
// Decision 5B: TUTOR_PLANNER_SPEED=fast runs the Opus 5.5 planner in fast mode (benchmark arm C only;
// off by default). Opus only - a fast-tier model never gets it - and never under SUBSCRIPTION_ONLY.
// telemetry.speed is the API's usage.speed, so a request served at standard speed is visible.
async function planOnce(env, context, model, effort, { callModel = loggedModel('tutor', anthropic), onSentence = null } = {}, documents = []) {
  const started = Date.now();
  const stream = !!onSentence && env.SUBSCRIPTION_ONLY !== 'true';
  const cache = env.TUTOR_PLANNER_CACHE !== 'off' && env.SUBSCRIPTION_ONLY !== 'true'; // F default: on
  const speed = env.TUTOR_PLANNER_SPEED === 'fast' && model === LEARN_TASKS.tutor.model && env.SUBSCRIPTION_ONLY !== 'true' ? 'fast' : null;
  const telemetry = { ms: null, requested_model: model, effort, served_model: null, input_tokens: null, output_tokens: null, ...(cache ? { cache: true, cache_creation_input_tokens: null, cache_read_input_tokens: null } : {}), ...(speed ? { requested_speed: speed, speed: null } : {}), stop_reason: null, outcome: null, ...(stream ? { streamed: true, first_output_ms: null, first_sentence_ms: null } : {}) };
  const done = outcome => ({ ...telemetry, ms: Date.now() - started, outcome });
  let result;
  try {
    // TUTOR_AVATAR=on adds suggest_avatar_clip (Avatar Teacher §4.1); unset or anything else, the request is unchanged.
    const response = await callModel(env, plannerRequest(context, LEARN_TASKS.tutor.maxTokens, documents, { effort, stream, cache, speed, avatar: env.TUTOR_AVATAR === 'on' }), model, null);
    if (!response.ok) throw await modelFailure(response, 'The tutor is unavailable');
    result = stream ? await readPlannerStream(response, input => {
      if (telemetry.first_sentence_ms != null) return;
      const sentence = firstSentence(input);
      if (sentence) { telemetry.first_sentence_ms = Date.now() - started; telemetry.first_sentence_action = sentence.action; onSentence(sentence); }
    }, () => { telemetry.first_output_ms ??= Date.now() - started; }) : await response.json();
  } catch (error) { throw Object.assign(error, { telemetry: done('error') }); }
  Object.assign(telemetry, { served_model: result.model ?? null, input_tokens: result.usage?.input_tokens ?? null, output_tokens: result.usage?.output_tokens ?? null, stop_reason: result.stop_reason ?? null,
    ...(speed ? { speed: result.usage?.speed ?? null } : {}), ...(cache ? { cache_creation_input_tokens: result.usage?.cache_creation_input_tokens ?? null, cache_read_input_tokens: result.usage?.cache_read_input_tokens ?? null } : {}) });
  const call = result.content?.find(block => block.type === 'tool_use' && block.name === TUTOR_TOOL.name);
  if (!call?.input || !Array.isArray(call.input.actions)) throw Object.assign(new Error('The tutor returned no turn'), { telemetry: done('invalid') });
  return { ...call.input, telemetry: done('ok') };
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
// Routine: a question, request, slash or hole opening on a row whose move the router has already fixed.
// Everything else (misconceptions, unsettled or uncertain evidence, a return from a hole, any
// explanation or answer) stays on Opus 5.5.
const ROUTINE_ROWS = ['slash', 'off_slice', 'not_yet_observed', 'understood', 'gap', 'gap_inline'];
const ROUTINE_INTENTS = ['question', 'request', 'slash', 'opening'];
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
// Decision 2: a fast-tier sentence is HELD until the fast plan is complete, parsed and passes
// fastPlanProblem; an invalid or escalated fast plan speaks nothing, and Opus's re-plan streams its own
// sentence. No speculative speech, no rollback. first_sentence_ms on a fast plan is the release time;
// sentence_written_ms is when the fast model had written it.
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
  let first, problem, held = null;
  const hold = deps.onSentence ? { ...deps, onSentence: sentence => { held ??= sentence; } } : deps;
  try { first = await planOnce(env, context, fast, fastEffort, hold, documents); problem = fastPlanProblem(first, context); }
  catch (error) { first = { telemetry: error.telemetry }; problem = error.message; }
  if (!problem) {
    if (held) deps.onSentence(held);
    return tagged(first, { escalated: null, ...(held ? { sentence_written_ms: first.telemetry.first_sentence_ms, first_sentence_ms: first.telemetry.ms } : {}) });
  }
  const escalated = { tier: 'opus', tier_reason: tier.reason, escalated: problem, fast: first.telemetry ?? null };
  let plan;
  try { plan = await opus(); } catch (error) { throw Object.assign(error, { telemetry: { ...error.telemetry, ...escalated } }); }
  return { ...plan, telemetry: { ...plan.telemetry, ...escalated } };
}

export async function tutorRoute(path, req, env, deps = {}) {
  if (path !== '/api/learn/tutor/evaluate' && path !== '/api/learn/tutor/plan') return null;
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const access = await (deps.authorize || authorizedBoardApp)(req, env, body?.app, body?.pending || null);
  if (access instanceof Response) return access;
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  const ownerRefused = subscriptionOwnerRefusal(env, access);
  if (ownerRefused) return ownerRefused;
  if (path === '/api/learn/tutor/evaluate') {
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
