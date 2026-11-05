// /whiteboard limits, roles and spend policy v1 (roadmap v1 sections 4.2, 6.1 and 6.5). One frozen limit object read by the planner fit,
// the quote and the renderer gate; the two W1 roles as a frozen policy object on their LEARN_TASKS rows; the per-call worst case computed as
// animation-policy.js roleBoundMicros does; and the job's worst case (whiteboardReservation), from which the Generate credit line is printed
// (100 credits = 1 USD). No environment variable sets any of it: changing a number here is a versioned policy change and a candidate.
import { LEARN_TASKS, MODEL_PRICES, loggedModel, notConfiguredMessage } from './learn-models.js';
import { priceUsage } from './pricing-registry.js';
import { providerUnavailable, requestSpendBound } from './learn-spend.js';
import { modelFailure } from './learn-research.js';
import { normalizeToolInput } from './tool-input.js';

export const WHITEBOARD_POLICY_VERSION = 1;
// What the renderer's /health reports as `whiteboard` and the job requires before it posts (a mismatch fails closed). Bumped with the
// composition, its fonts or the whiteboard-render request contract.
export const RENDERER_VERSION = 'whiteboard-renderer-1';

export const WHITEBOARD_LIMITS = Object.freeze({
  durations: Object.freeze([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]), // every one valid in the contract
  defaultSeconds: 60,
  servedMaxSeconds: 60, // W1 serves up to 60 s; W2 serves all twelve
  fps: 30,
  maxScenes: 8, secondsPerScene: 15, // scenes 1..min(8, ceil(d / 15))
  minWindowFrames: 150, windowStepFrames: 30, // windows contiguous, multiples of 30 frames, summing to d x 30
  beatsPerScene: 4, beatsPerVideo: 32,
  narrationWords: 400, narrationChars: 4000, beatChars: 600,
  pauseFrames: 90, // a beat with empty narration is a drawing pause of at most this many frames
  illustrationsPerScene: 1, regionsPerScene: 12,
  // ponytail: 80 x 8 scenes is 640, over the 400 per video; both numbers are the roadmap's (6.5), reported in the W1.1 hand-back.
  primitivesPerScene: 80, primitivesPerVideo: 400,
  pointsPerPath: 1000, pointsPerVideo: 12000,
  graphPoints: 64, // a sampled function (roadmap 6.3)
  manifestBytes: 256 * 1024,
  imagePixels: 8_000_000, imageBytes: 12 * 1024 * 1024,
  beatAudioBytes: 8 * 1024 * 1024,
  segmentRequestBytes: 16 * 1024 * 1024, segmentMp4Bytes: 25 * 1024 * 1024, finalMp4Bytes: 64 * 1024 * 1024,
  renderChildren: 1, segmentDeadlineMs: 420_000, jobDeadlineMs: 30 * 60_000,
  jobsPerCard: 1, generatingJobsPerCanvas: 1, providerCallsPerJob: 2,
  promptCodePoints: 4000, contextChars: 8000, evidenceCodePoints: 12000,
  planRevisions: 3, // Edit, duration (W-D7), W3 clarification answer: each one more planner call
  authorCorrections: 2, // shared by the job: schema repairs and timing rewrites
  utf8BytesPerChar: 4, // the narration's byte worst case per character (roadmap 6.1)
});

// The scene cap for a duration: min(8, ceil(d / 15)).
export const maxScenesFor = seconds => Math.min(WHITEBOARD_LIMITS.maxScenes, Math.ceil(seconds / WHITEBOARD_LIMITS.secondsPerScene));

// The W1 roles (roadmap 4.2): LEARN_TASKS key, the largest input it may send and how many images. W2 adds regions, review and repair.
export const WHITEBOARD_ROLES = Object.freeze({
  plan: Object.freeze({ task: 'whiteboard_plan', maxInputTokens: 24000, maxImages: 0 }),
  author: Object.freeze({ task: 'whiteboard_author', maxInputTokens: 32000, maxImages: 0 }),
});

export class WhiteboardPolicyError extends Error {
  constructor(code, message) { super(message); this.name = 'WhiteboardPolicyError'; this.code = code; }
}

// A role's settings: the policy row plus its LEARN_TASKS entry; an unconfigured task is refused, never substituted.
export function whiteboardRole(role, tasks = LEARN_TASKS) {
  const spec = WHITEBOARD_ROLES[role];
  if (!spec) throw new WhiteboardPolicyError('unknown_role', `No /whiteboard role ${role}.`);
  const task = tasks[spec.task];
  if (!task?.model || !Number.isSafeInteger(task.maxTokens)) throw new WhiteboardPolicyError('task_unconfigured', `/whiteboard ${role} has no configured model (${spec.task}).`);
  return { ...spec, ...task };
}

// Worst case of one call in integer micro-USD, as animation-policy.js roleBoundMicros: (input + images) at the 5-minute cache-write price
// plus max_tokens at the output price.
const IMAGE_TOKENS = 4784, CACHE_WRITE = 1.25;
export function whiteboardRoleBoundMicros(role, tasks = LEARN_TASKS) {
  const r = whiteboardRole(role, tasks), prices = MODEL_PRICES[r.model];
  if (!prices) throw new WhiteboardPolicyError('unpriced_model', `/whiteboard ${role} model ${r.model} has no price.`);
  const [input, output] = prices;
  return Math.ceil((r.maxInputTokens + r.maxImages * IMAGE_TOKENS) * input * CACHE_WRITE + r.maxTokens * output);
}

const fishMicros = bytes => priceUsage({ provider: 'fish', model: 's1', quantities: { input_bytes: bytes } }).micros;

// The job's prices for a plan of N scenes (roadmap 6.1), integer micro-USD.
// maximum: plan phase = the planner and its 3 revisions; generation = N author calls + 2 corrections + Fish on the narration at 4 bytes a
// character, plus the re-narration a timing rewrite causes (each correction may rewrite one scene's narration once: at most 2 scenes).
// estimate: the path with no revision, correction or rewrite, every call at its bound and the narration one byte a character.
// shortcut: the estimate is the policy's no-correction path, not measured usage; replace with W1 acceptance jobs' usage rows.
export function whiteboardReservation(plan, tasks = LEARN_TASKS) {
  const L = WHITEBOARD_LIMITS, n = plan?.scenes?.length;
  if (!Number.isSafeInteger(n) || n < 1 || n > L.maxScenes) throw new WhiteboardPolicyError('bad_plan', 'A /whiteboard plan has 1 to 8 scenes.');
  const planCall = whiteboardRoleBoundMicros('plan', tasks), authorCall = whiteboardRoleBoundMicros('author', tasks);
  const sceneChars = L.beatsPerScene * L.beatChars;
  const narrationChars = Math.min(n * sceneChars, L.narrationChars);
  const rewriteChars = Math.min(Math.min(L.authorCorrections, n) * sceneChars, L.narrationChars);
  const calls = { plan: 1 + L.planRevisions, author: n + L.authorCorrections };
  return {
    version: WHITEBOARD_POLICY_VERSION,
    scenes: n,
    calls,
    planMicros: calls.plan * planCall,
    generationMicros: calls.author * authorCall + fishMicros((narrationChars + rewriteChars) * L.utf8BytesPerChar),
    estimate: { planMicros: planCall, generationMicros: n * authorCall + fishMicros(narrationChars) },
  };
}

// How a role's call is sent (roadmap 4.2, as animationStreaming): the author streams with a 300 s deadline, the planner answers whole within
// 120 s. WHITEBOARD_STREAMING=false is the recovery switch: one non-streaming request with no deadline. Handed to ask.js as env.MODEL_STREAM.
export const WHITEBOARD_CALL_MS = Object.freeze({ plan: 120_000, author: 300_000 });
export function whiteboardStreaming(env, role) {
  if (env.WHITEBOARD_STREAMING === 'false') return null;
  return { stream: role === 'author', deadlineMs: WHITEBOARD_CALL_MS[role] };
}

// The request body for one role call, as animation-policy.js animationRequest: max_tokens, the pinned effort, one cached system block, one
// tool on auto, no model, thinking or fallback of its own; refused when it is larger than the role's bound.
export function whiteboardRequest(env, role, { system, tool, content }, tasks = LEARN_TASKS) {
  const r = whiteboardRole(role, tasks);
  if (!tool?.name || !tool.input_schema) throw new WhiteboardPolicyError('tool_required', `/whiteboard ${role} needs one tool.`);
  const body = {
    max_tokens: r.maxTokens,
    ...(r.effort ? { output_config: { effort: r.effort } } : {}),
    system: env.SUBSCRIPTION_ONLY === 'true' ? system : [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    tools: [tool],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: typeof content === 'string' ? [{ type: 'text', text: content }] : content }],
  };
  const bound = requestSpendBound(body, r.model, 'anthropic');
  const boundMicros = bound == null ? null : Math.round(bound * 1e6);
  if (boundMicros == null || boundMicros > whiteboardRoleBoundMicros(role, tasks)) throw new WhiteboardPolicyError('input_too_large', `This /whiteboard ${role} request is larger than its limit.`);
  return { body, boundMicros };
}

// One role call through the injected (admitted) callModel: the served model must be the pinned one, the reply must not be cut at its output
// limit, and it must hold exactly one call of the offered tool, as an object. -> { input, served, usage, stopReason }
const NOT_ANSWERING = new Set([502, 503, 504, 524]);
export async function callWhiteboardRole(env, role, spec, { callModel, tasks = LEARN_TASKS }) {
  if (typeof callModel !== 'function') throw new WhiteboardPolicyError('no_transport', '/whiteboard has no admitted model transport.');
  const r = whiteboardRole(role, tasks), { body } = whiteboardRequest(env, role, spec, tasks);
  const response = await loggedModel(r.task, callModel)(env, body, r.model, null);
  if (!response.ok) {
    if (await notConfiguredMessage(response)) throw new WhiteboardPolicyError('model_not_configured', 'The model is not configured here.');
    const refused = [429, 503].includes(response.status) ? await response.clone().json().catch(() => null) : null;
    if (['allowance_limited', 'spend_limited'].includes(refused?.code)) throw Object.assign(new WhiteboardPolicyError('spend_refused', refused.error || 'AI is not available right now.'), { refusal: refused });
    if (await providerUnavailable(response) || NOT_ANSWERING.has(response.status)) throw new WhiteboardPolicyError('provider_unavailable', `The provider did not answer (${response.status}).`);
    throw Object.assign(await modelFailure(response, `/whiteboard ${role} is unavailable`), { code: `model_http_${response.status}` });
  }
  const result = await response.json().catch(() => null);
  const billed = { usage: result?.usage ?? null, stopReason: result?.stop_reason ?? null, served: typeof result?.model === 'string' ? result.model : null };
  const fail = (code, message) => Object.assign(new WhiteboardPolicyError(code, message), { billed });
  if (billed.served && billed.served !== r.model && !billed.served.startsWith(`${r.model}-`)) throw fail('model_substituted', `/whiteboard ${role} was answered by ${billed.served}.`);
  if (billed.stopReason === 'max_tokens') throw fail('output_limit', `/whiteboard ${role} reached its output limit.`);
  const calls = Array.isArray(result?.content) ? result.content.filter(block => block?.type === 'tool_use') : [];
  if (calls.length !== 1 || calls[0].name !== spec.tool.name) throw fail('invalid_turn', `/whiteboard ${role} must return exactly one ${spec.tool.name} call (got ${calls.length}).`);
  const input = normalizeToolInput(spec.tool.input_schema, calls[0].input, role === 'author' ? { dropNull: true, lenient: true } : {});
  if (input == null || typeof input !== 'object' || Array.isArray(input)) throw fail('invalid_turn', `/whiteboard ${role} returned a call without an object input.`);
  return { input, ...billed };
}
