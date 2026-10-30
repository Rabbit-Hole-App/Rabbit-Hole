// /animation model, limit and spend policy (AN-05; plan sections 3, 5 and 7 "Dependency and model policy"). One versioned policy:
// the four Opus 5.5 roles (learn-models.js LEARN_TASKS.animation_*, the same model and token ceilings as /explain's), their finite
// per-call and per-build limits, worst-case prices from MODEL_PRICES, and the request/reply checks every role call passes.
//
// The bounded build graph (plan section 7): one author result, at most two reviews and at most one repair per confirmed build:
// author -> validate/render/review -> optional repair -> validate/render/final review. The worst case of that graph is the
// admission check (animationReservation().generationMicros). It is a CHECK, not a parent reservation: each call is admitted and
// charged on its own through the existing ledger (learn-spend.js spendTransport), and the job enforces its own combined bound
// (calls per role and the summed per-call bounds, animation-job.js paidCall). shortcut: a strict parent hold needs the ledger to
// admit child calls against it (the same gap explain-job.js names); until then the worst case is checked, never shown as held.
//
// Stage timing reuses explain-policy.js's record (same stages, same summary), so both features report alike.
import { LEARN_TASKS, MODEL_NOT_CONFIGURED, MODEL_PRICES, loggedModel, notConfiguredMessage } from './learn-models.js';
import { providerUnavailable, requestSpendBound } from './learn-spend.js';
import { modelFailure } from './learn-research.js';
import { normalizeToolInput } from './tool-input.js';
import { explainTransport } from './explain-policy.js';

export const ANIMATION_POLICY_VERSION = 1;
export const ANIMATION_MODEL = 'claude-opus-5-5';
const IMAGE_TOKENS = 4784; // requestSpendBound's reservation per base64 image for Opus (as explain-policy.js)

// Per role: its LEARN_TASKS key, the largest request it may send (a byte budget: requestSpendBound counts request bytes as tokens)
// and how many images. MVP briefs and authors read no images (image references are AN-08); a review round carries at most
// 2 views x 3 states = 6 captures; a repair the failing captures only.
export const ANIMATION_ROLES = Object.freeze({
  brief: Object.freeze({ task: 'animation_brief', maxInputTokens: 40000, maxImages: 0 }),
  author: Object.freeze({ task: 'animation_author', maxInputTokens: 60000, maxImages: 0 }),
  review: Object.freeze({ task: 'animation_review', maxInputTokens: 40000, maxImages: 6 }),
  repair: Object.freeze({ task: 'animation_repair', maxInputTokens: 40000, maxImages: 2 }),
});

export const ANIMATION_LIMITS = Object.freeze({
  repairs: 1, // at most one repair per confirmed build, whatever failed (validation, render or review)
  // Preparation: one brief call per admitted preparation, at most `refinements` more (each a learner's own edit). Generation: the graph above.
  calls: Object.freeze({ brief: 1, author: 1, review: 2, repair: 1 }),
  refinements: 5,
  // A plan the contract refuses gets ONE correction call carrying the validator's issues (accept-6: step with an analytical behavior).
  planCorrections: 1,
  // Review captures: up to 2 declared views at up to 3 parameter/time states per round, one browser per job, platform-paid.
  render: Object.freeze({ views: 2, states: 3, capturesPerRound: 6, rounds: 2 }),
  deadlines: Object.freeze({ callMs: 120000, preparationMs: 180000, jobMs: 600000 }),
});

export const PROVIDER_UNAVAILABLE = 'Animations are temporarily unavailable. Your request is saved. Try again in a few minutes.';

export class AnimationPolicyError extends Error {
  constructor(code, message, extra = {}) { super(message); this.name = 'AnimationPolicyError'; this.code = code; Object.assign(this, extra); }
}

// A role's settings: the policy row plus its LEARN_TASKS entry. A task key that is not configured is refused, never substituted:
// there is no default model here. tasks: the task table (LEARN_TASKS; a test may pass the table it runs against).
export function animationRole(role, tasks = LEARN_TASKS) {
  const spec = ANIMATION_ROLES[role];
  if (!spec) throw new AnimationPolicyError('unknown_role', `No /animation role ${role}.`);
  const task = tasks[spec.task];
  if (!task?.model || !Number.isSafeInteger(task.maxTokens)) throw new AnimationPolicyError('task_unconfigured', `/animation ${role} has no configured model (${spec.task}).`);
  return { ...spec, ...task };
}

// The pinned model of a role; anything else asked for is refused, never substituted.
export function animationModel(role, requested = undefined, tasks = LEARN_TASKS) {
  const { model } = animationRole(role, tasks);
  if (requested !== undefined && requested !== model) throw new AnimationPolicyError('model_override', `/animation ${role} runs only on ${model}.`);
  return model;
}

// Worst case of one call in integer micro-USD: (input + images) at the 5-minute cache-write price plus max_tokens at the output price.
const CACHE_WRITE = 1.25;
export function roleBoundMicros(role, tasks = LEARN_TASKS) {
  const r = animationRole(role, tasks), prices = MODEL_PRICES[r.model];
  if (!prices) throw new AnimationPolicyError('unpriced_model', `/animation ${role} model ${r.model} has no price.`);
  const [input, output] = prices;
  return Math.ceil((r.maxInputTokens + r.maxImages * IMAGE_TOKENS) * input * CACHE_WRITE + r.maxTokens * output);
}
const sum = (calls, roles, tasks) => roles.reduce((total, role) => total + calls[role] * roleBoundMicros(role, tasks), 0);
// The prior price: one preparation (a brief call), and the full generation graph, checked before Generate and each paid Retry.
export const animationReservation = (tasks = LEARN_TASKS) => ({
  version: ANIMATION_POLICY_VERSION,
  preparationMicros: sum(ANIMATION_LIMITS.calls, ['brief'], tasks) * (1 + ANIMATION_LIMITS.planCorrections), // a plan call and its one correction
  generationMicros: sum(ANIMATION_LIMITS.calls, ['author', 'review', 'repair'], tasks),
  calls: { ...ANIMATION_LIMITS.calls },
});

// The request body for one role call: its model's max_tokens, one tool on auto, no thinking, effort, fallbacks or betas. The
// system prompt goes as one cacheable block except under SUBSCRIPTION_ONLY.
export function animationRequest(env, role, { system, tool, content }, tasks = LEARN_TASKS) {
  const r = animationRole(role, tasks);
  if (!tool?.name || !tool.input_schema) throw new AnimationPolicyError('tool_required', `/animation ${role} needs one tool.`);
  const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : content;
  const body = {
    max_tokens: r.maxTokens,
    system: env.SUBSCRIPTION_ONLY === 'true' ? system : [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    tools: [tool],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: blocks }],
  };
  checkAnimationRequest(env, role, body, tasks);
  return body;
}

// Every role call passes here before it can be sent: shape, image count and support, and the per-call bound within the role's price.
export function checkAnimationRequest(env, role, body, tasks = LEARN_TASKS) {
  const r = animationRole(role, tasks);
  if (body.tool_choice?.type !== 'auto' || body.tools?.length !== 1) throw new AnimationPolicyError('tool_choice', 'An /animation call offers one tool on auto.');
  if ('fallbacks' in body || 'thinking' in body || 'model' in body) throw new AnimationPolicyError('request_shape', 'An /animation call carries no model, fallback or thinking of its own.');
  let images = 0;
  for (const message of body.messages || []) for (const block of Array.isArray(message.content) ? message.content : []) if (block?.type === 'image') images++;
  if (images > r.maxImages) throw new AnimationPolicyError('images', `/animation ${role} sends at most ${r.maxImages} images.`, { images });
  if (images && !explainTransport(env).images) throw new AnimationPolicyError('transport_images', 'This connection cannot send images to the model.');
  const bound = requestSpendBound(body, r.model, 'anthropic');
  const boundMicros = bound == null ? null : Math.round(bound * 1e6);
  if (boundMicros == null || boundMicros > roleBoundMicros(role, tasks)) throw new AnimationPolicyError('input_too_large', `This /animation ${role} request is larger than its limit.`, { boundMicros });
  return { images, boundMicros };
}

// Requested versus served: a different served model is refused; a dated snapshot of the pinned id is the same model.
export function servedIdentity(role, result, tasks = LEARN_TASKS) {
  const requested = animationModel(role, undefined, tasks), served = typeof result?.model === 'string' ? result.model : null;
  const matches = served == null ? null : served === requested || served.startsWith(`${requested}-`);
  if (matches === false) throw new AnimationPolicyError('model_substituted', `/animation ${role} was answered by ${served}, not ${requested}.`, { requested, served });
  return { requested, served, matches };
}

// Exactly one call of the offered tool, as an object; anything else is an invalid turn.
export function animationToolInput(role, result, tool) {
  const calls = Array.isArray(result?.content) ? result.content.filter(block => block?.type === 'tool_use') : [];
  if (calls.length !== 1 || calls[0].name !== tool.name) throw new AnimationPolicyError('invalid_turn', `/animation ${role} must return exactly one ${tool.name} call (got ${calls.length}).`, { calls: calls.length });
  const input = normalizeToolInput(tool.input_schema, calls[0].input);
  if (input == null || typeof input !== 'object' || Array.isArray(input)) throw new AnimationPolicyError('invalid_turn', `/animation ${role} returned a ${tool.name} call without an object input.`);
  return input;
}

// No provider key on this deployment (ask.js anthropic() answers its not-configured 503 and sends nothing): a named refusal, so the job
// says so instead of an anonymous error. Checked again before admission (animationModelConfigured), so no ledger row is made for it.
export const animationModelConfigured = env => env.SUBSCRIPTION_ONLY === 'true' || !!env.ANTHROPIC_API_KEY;
export const modelNotConfigured = () => new AnimationPolicyError('model_not_configured', MODEL_NOT_CONFIGURED, { status: 503 });

async function roleFailure(role, response, tasks) {
  if (await notConfiguredMessage(response)) return modelNotConfigured();
  if ([429, 503].includes(response.status)) {
    const body = await response.clone().json().catch(() => null);
    if (['allowance_limited', 'spend_limited'].includes(body?.code)) return new AnimationPolicyError('spend_refused', body.error || 'AI is not available right now.', { status: response.status, reason: body.reason ?? null });
  }
  if (await providerUnavailable(response)) return new AnimationPolicyError('provider_unavailable', PROVIDER_UNAVAILABLE, { providerStatus: response.status });
  if (response.status === 404) {
    const body = await response.clone().json().catch(() => null);
    if (body?.error?.type === 'not_found_error') return new AnimationPolicyError('model_unavailable', `${animationModel(role, undefined, tasks)} is not available for /animation right now. Nothing else was used.`);
  }
  // Any other HTTP failure keeps the provider's own reason (modelFailure) and gets a code naming the status.
  return Object.assign(await modelFailure(response, `/animation ${role} is unavailable`), { code: `model_http_${response.status}` });
}

// One role call: build and check the request, send it through the injected (admitted) callModel, check the served model and the
// single tool call. There is no default transport: only the job's admitted one makes this a paid path.
export async function callAnimationRole(env, role, { system, tool, content }, { callModel, tasks = LEARN_TASKS }) {
  if (typeof callModel !== 'function') throw new AnimationPolicyError('no_transport', '/animation has no admitted model transport.');
  const body = animationRequest(env, role, { system, tool, content }, tasks);
  const response = await loggedModel(animationRole(role, tasks).task, callModel)(env, body, animationModel(role, undefined, tasks), null);
  if (!response.ok) throw await roleFailure(role, response, tasks);
  const result = await response.json().catch(() => null);
  // The provider answered, so it billed: a reply refused below still carries its usage, which the job records (cost and tokens).
  const billed = { usage: result?.usage ?? null, stopReason: result?.stop_reason ?? null, served: typeof result?.model === 'string' ? result.model : null };
  try {
    const identity = servedIdentity(role, result, tasks);
    // accept-5: the author spent all 10,000 output tokens and never finished its tool call. That is the output limit, not a malformed turn.
    if (result?.stop_reason === 'max_tokens') throw new AnimationPolicyError('output_limit', `/animation ${role} reached its output limit (${animationRole(role, tasks).maxTokens} tokens) before finishing its ${tool.name} call.`);
    return { input: animationToolInput(role, result, tool), identity, ...billed };
  } catch (error) { throw Object.assign(error, { billed }); }
}
