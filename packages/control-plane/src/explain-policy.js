// /explain v2 model, limit and timing policy (EXP-T12 slice 1; plan v2.1 sections 3.2, 3.4, 3.6).
// One versioned policy: the four Opus 5.5 roles (learn-models.js LEARN_TASKS.explain_*), their finite per-call and per-job
// limits, worst-case prices from MODEL_PRICES, the request/reply checks every role call passes, and the stage-timing record.
// No route reaches this module yet: callExplainRole needs an injected callModel (the job supplies an admitted one, slice 2).
import { LEARN_TASKS, MODEL_PRICES, loggedModel } from './learn-models.js';
import { providerUnavailable, requestSpendBound } from './learn-spend.js';
import { modelFailure } from './learn-research.js';
import { normalizeToolInput } from './tool-input.js';

export const EXPLAIN_POLICY_VERSION = 1;
export const EXPLAIN_MODEL = 'claude-opus-5-5';
// requestSpendBound's reservation per base64 image for Opus (learn-spend.js), so the prior price and the per-call bound agree.
const IMAGE_TOKENS = 4784;

// Per role: the LEARN_TASKS entry, the largest input it may send and how many images. maxInputTokens is checked against
// requestSpendBound, which counts request bytes as tokens (conservative), so it is a byte budget for the request JSON.
// brief/author: up to 4 learner reference images (T15). review: one request per round carrying that round's captures.
// repair: the failing captures only.
export const EXPLAIN_ROLES = Object.freeze({
  brief: Object.freeze({ task: 'explain_brief', maxInputTokens: 40000, maxImages: 4 }),
  author: Object.freeze({ task: 'explain_author', maxInputTokens: 60000, maxImages: 4 }),
  review: Object.freeze({ task: 'explain_review', maxInputTokens: 40000, maxImages: 6 }),
  repair: Object.freeze({ task: 'explain_repair', maxInputTokens: 40000, maxImages: 2 }),
});

const ROUNDS = 3; // an initial candidate plus at most three correction rounds across all gates (section 3.4)
export const EXPLAIN_LIMITS = Object.freeze({
  correctionRounds: ROUNDS,
  // Preparation (one brief call per admitted preparation) and generation (author once, review each candidate, repair each round).
  calls: Object.freeze({ brief: 1, author: 1, review: 1 + ROUNDS, repair: ROUNDS }),
  refinements: 5, // admitted brief revisions per proposal; a sixth asks for a new request
  preparation: Object.freeze({ searches: 2, fetches: 4, toolSteps: 8 }),
  // Q3 default: one browser per job, sequential captures, one review's worth of captures per candidate. Platform-paid.
  render: Object.freeze({ browsersPerJob: 1, capturesPerRound: EXPLAIN_ROLES.review.maxImages, rounds: 1 + ROUNDS }),
  deadlines: Object.freeze({ callMs: 120000, preparationMs: 180000, jobMs: 600000 }),
});

// What the learner reads while the provider is unavailable (no ellipsis, no dollars).
export const PROVIDER_UNAVAILABLE = 'Explanations are temporarily unavailable. Your request is saved. Try again in a few minutes.';

export class ExplainPolicyError extends Error {
  constructor(code, message, extra = {}) { super(message); this.name = 'ExplainPolicyError'; this.code = code; Object.assign(this, extra); }
}

const roleOf = role => {
  const spec = EXPLAIN_ROLES[role];
  if (!spec) throw new ExplainPolicyError('unknown_role', `No /explain role ${role}.`);
  return { ...spec, ...LEARN_TASKS[spec.task] };
};

// The pinned model of a role. A picker key, Auto, a request `model` or a default can never stand in: anything else asked
// for is refused, never substituted.
export function explainModel(role, requested = undefined) {
  const { model } = roleOf(role);
  if (requested !== undefined && requested !== model) throw new ExplainPolicyError('model_override', `/explain ${role} runs only on ${model}.`);
  return model;
}

// Worst case of one call in integer micro-USD: (input + images) at the 5-minute cache-write price (the system block is
// cached, and requestSpendBound reserves the whole input at 1.25x then) plus max_tokens at the output price.
// Tokens x USD-per-MTok is micro-USD.
const CACHE_WRITE = 1.25;
export function roleBoundMicros(role) {
  const r = roleOf(role), [input, output] = MODEL_PRICES[r.model];
  return Math.ceil((r.maxInputTokens + r.maxImages * IMAGE_TOKENS) * input * CACHE_WRITE + r.maxTokens * output);
}
const sum = (calls, roles) => roles.reduce((total, role) => total + calls[role] * roleBoundMicros(role), 0);
// The prior price disclosed and pre-checked before work starts: preparation and generation are admitted separately.
export const explainReservation = () => ({
  version: EXPLAIN_POLICY_VERSION,
  preparationMicros: sum(EXPLAIN_LIMITS.calls, ['brief']),
  generationMicros: sum(EXPLAIN_LIMITS.calls, ['author', 'review', 'repair']),
});

// Transport capabilities: structured output is one tool call (no JSON mode), never a forced tool; images go as base64
// blocks with no beta header. The subscription bridge's image handling is unverified, so it cannot carry an image review.
export function explainTransport(env) {
  if (env.SUBSCRIPTION_ONLY === 'true') return { provider: 'subscription', structured: 'tool_call', toolChoice: 'auto', images: false };
  return { provider: 'anthropic', structured: 'tool_call', toolChoice: 'auto', images: true };
}

// The request body for one role call: its model's max_tokens, one tool on auto, no thinking, effort, fallbacks or betas.
// content is the user turn's blocks (text and base64 images). The system prompt goes as one cacheable block, as callRole's
// does (learn-journey-planners.js), except under SUBSCRIPTION_ONLY.
export function explainRequest(env, role, { system, tool, content }) {
  const r = roleOf(role);
  if (!tool?.name || !tool.input_schema) throw new ExplainPolicyError('tool_required', `/explain ${role} needs one tool.`);
  const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : content;
  const body = {
    max_tokens: r.maxTokens,
    system: env.SUBSCRIPTION_ONLY === 'true' ? system : [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    tools: [tool],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: blocks }],
  };
  checkExplainRequest(env, role, body);
  return body;
}

// Every role call passes here before it can be sent: the image count, the transport's image support, and the per-call
// bound (requestSpendBound, what admission will reserve) within the role's prior price.
export function checkExplainRequest(env, role, body) {
  const r = roleOf(role);
  if (body.tool_choice?.type !== 'auto' || body.tools?.length !== 1) throw new ExplainPolicyError('tool_choice', 'An /explain call offers one tool on auto.');
  if ('fallbacks' in body || 'thinking' in body || 'model' in body) throw new ExplainPolicyError('request_shape', 'An /explain call carries no model, fallback or thinking of its own.');
  let images = 0;
  for (const message of body.messages || []) for (const block of Array.isArray(message.content) ? message.content : []) if (block?.type === 'image') images++;
  if (images > r.maxImages) throw new ExplainPolicyError('images', `/explain ${role} sends at most ${r.maxImages} images.`, { images });
  if (images && !explainTransport(env).images) throw new ExplainPolicyError('transport_images', 'This connection cannot send images to the model.');
  const bound = requestSpendBound(body, r.model, 'anthropic');
  const boundMicros = bound == null ? null : Math.round(bound * 1e6);
  if (boundMicros == null || boundMicros > roleBoundMicros(role)) throw new ExplainPolicyError('input_too_large', `This /explain ${role} request is larger than its limit.`, { boundMicros });
  return { images, boundMicros };
}

// Requested versus served. A missing served id stays unknown (null), never assumed; a different served model is refused.
// Dated snapshots of the pinned id (claude-opus-5-5-YYYYMMDD) are the same model.
export function servedIdentity(role, result) {
  const requested = explainModel(role), served = typeof result?.model === 'string' ? result.model : null;
  const matches = served == null ? null : served === requested || served.startsWith(`${requested}-`);
  if (matches === false) throw new ExplainPolicyError('model_substituted', `/explain ${role} was answered by ${served}, not ${requested}.`, { requested, served });
  return { requested, served, matches };
}

// Exactly one call of the offered tool, as an object; anything else is an invalid turn.
export function explainToolInput(role, result, tool) {
  const calls = Array.isArray(result?.content) ? result.content.filter(block => block?.type === 'tool_use') : [];
  if (calls.length !== 1 || calls[0].name !== tool.name) throw new ExplainPolicyError('invalid_turn', `/explain ${role} must return exactly one ${tool.name} call (got ${calls.length}).`, { calls: calls.length });
  const input = normalizeToolInput(tool.input_schema, calls[0].input);
  if (input == null || typeof input !== 'object' || Array.isArray(input)) throw new ExplainPolicyError('invalid_turn', `/explain ${role} returned a ${tool.name} call without an object input.`);
  return input;
}

// A model the provider says it does not have is explicit, never retried on another model.
async function roleFailure(role, response) {
  // Spend admission refused the call (the learner's allowance or the platform cap): nothing was sent; say why, as budget.
  if ([429, 503].includes(response.status)) {
    const body = await response.clone().json().catch(() => null);
    if (['allowance_limited', 'spend_limited'].includes(body?.code)) return new ExplainPolicyError('spend_refused', body.error || 'AI is not available right now.', { status: response.status, reason: body.reason ?? null });
  }
  // The provider's spend cap, usage limit, rate limit or overload: temporary, nothing ran or was billed. The job pauses with
  // its completed stages and the learner retries once access returns (explain-job.js); never another model.
  if (await providerUnavailable(response)) return new ExplainPolicyError('provider_unavailable', PROVIDER_UNAVAILABLE, { providerStatus: response.status });
  if (response.status === 404) {
    const body = await response.clone().json().catch(() => null);
    if (body?.error?.type === 'not_found_error') return new ExplainPolicyError('model_unavailable', `${explainModel(role)} is not available for /explain right now. Nothing else was used.`);
  }
  return modelFailure(response, `/explain ${role} is unavailable`);
}

// One role call: build and check the request, send it through the injected (admitted) callModel, check the served model
// and the single tool call. callModel(env, body, model, org) is required: there is no default transport, so nothing here is
// an executable paid path until the job (slice 2) provides an admitted one. org is always null (no per-org AI settings).
export async function callExplainRole(env, role, { system, tool, content }, { callModel }) {
  if (typeof callModel !== 'function') throw new ExplainPolicyError('no_transport', '/explain has no admitted model transport.');
  const body = explainRequest(env, role, { system, tool, content });
  const response = await loggedModel(roleOf(role).task, callModel)(env, body, explainModel(role), null);
  if (!response.ok) throw await roleFailure(role, response);
  const result = await response.json().catch(() => null);
  const identity = servedIdentity(role, result);
  return { input: explainToolInput(role, result, tool), identity, usage: result?.usage ?? null, stopReason: result?.stop_reason ?? null };
}

// ---- Stage timing (section 3.6) ----
export const REQUEST_CLASSES = Object.freeze(['simple', 'researched', 'edit']);
export const EXPLAIN_STAGES = Object.freeze(['queued', 'preparing', 'awaiting_approval', 'authoring', 'validating', 'rendering', 'reviewing', 'repairing']);
// Targets come from T02 baseline and early M3 runs, recorded with their rationale; none are measured yet, so none are set.
export const EXPLAIN_TARGETS = Object.freeze(Object.fromEntries(REQUEST_CLASSES.map(c => [c, Object.freeze({ firstFeedbackMs: null, proposalMs: null, resultMs: null, basis: 'unmeasured' })])));

// A timing record, stored on the job. Marks: submitted, firstFeedback, proposalReady, generate, result (accepted result or,
// for Edit, an Apply-ready candidate). Stages: one entry per entered stage with its counters.
export const newTiming = (requestClass, now = Date.now(), cache = null) => {
  if (!REQUEST_CLASSES.includes(requestClass)) throw new ExplainPolicyError('request_class', `Unknown request class ${requestClass}.`);
  return { requestClass, cache, marks: { submitted: now }, stages: [] };
};
export function markTiming(timing, mark, now = Date.now()) {
  if (!['firstFeedback', 'proposalReady', 'generate', 'result'].includes(mark)) throw new ExplainPolicyError('timing_mark', `Unknown mark ${mark}.`);
  timing.marks[mark] ??= now; // the first time counts
  return timing;
}
export function beginStage(timing, stage, now = Date.now()) {
  if (!EXPLAIN_STAGES.includes(stage)) throw new ExplainPolicyError('timing_stage', `Unknown stage ${stage}.`);
  const open = timing.stages.at(-1);
  if (open && open.endedAt == null) open.endedAt = now;
  timing.stages.push({ stage, startedAt: now, endedAt: null, calls: 0, inputTokens: 0, outputTokens: 0, images: 0, captures: 0, outcome: null });
  return timing;
}
export function countStage(timing, { calls = 0, inputTokens = 0, outputTokens = 0, images = 0, captures = 0 } = {}) {
  const open = timing.stages.at(-1);
  if (!open || open.endedAt != null) return timing;
  open.calls += calls; open.inputTokens += inputTokens || 0; open.outputTokens += outputTokens || 0; open.images += images; open.captures += captures;
  return timing;
}
export function endStage(timing, outcome, now = Date.now()) {
  const open = timing.stages.at(-1);
  if (open && open.endedAt == null) Object.assign(open, { endedAt: now, outcome });
  return timing;
}
// Processing time excludes the learner's approval wait; an open stage has no duration yet (null, not a guess).
export function timingSummary(timing) {
  const { submitted, firstFeedback, proposalReady, generate, result } = timing.marks;
  const ms = (from, to) => (from != null && to != null ? to - from : null);
  const stages = timing.stages.map(s => ({ stage: s.stage, ms: ms(s.startedAt, s.endedAt), calls: s.calls, inputTokens: s.inputTokens, outputTokens: s.outputTokens, images: s.images, captures: s.captures, outcome: s.outcome }));
  const waiting = stages.filter(s => s.stage === 'awaiting_approval').reduce((t, s) => t + (s.ms ?? 0), 0);
  const done = stages.filter(s => s.stage !== 'awaiting_approval');
  return {
    requestClass: timing.requestClass, cache: timing.cache,
    firstFeedbackMs: ms(submitted, firstFeedback), proposalMs: ms(submitted, proposalReady), generateToResultMs: ms(generate, result),
    processingMs: done.some(s => s.ms == null) ? null : done.reduce((t, s) => t + s.ms, 0), approvalWaitMs: waiting,
    calls: stages.reduce((t, s) => t + s.calls, 0), repairs: stages.filter(s => s.stage === 'repairing').length, stages,
  };
}
