// /whiteboard limits, roles and spend policy v1 (roadmap v1 sections 4.2, 6.1 and 6.5). One frozen limit object read by the planner fit,
// the quote and the renderer gate; the two W1 roles as a frozen policy object on their LEARN_TASKS rows; the per-call worst case computed as
// animation-policy.js roleBoundMicros does; and the job's worst case (whiteboardReservation), from which the Generate credit line is printed
// (100 credits = 1 USD). No environment variable sets any of it: changing a number here is a versioned policy change and a candidate.
import { LEARN_TASKS, MODEL_PRICES } from './learn-models.js';
import { priceUsage } from './pricing-registry.js';

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
