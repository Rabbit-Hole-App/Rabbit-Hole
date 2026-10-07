// Model ids, per-task Learn model settings and request limits in one place
// (C4 in docs/features/learn-cleanup.md). Every value is today's behavior,
// pinned by test/learn-models.test.js: changing one is a behavior change.
// A leaf module, so ask.js, learn-research.js and the browser-side test can
// all import it without a cycle.
import { sha256 } from './token.js';
import { sha256Hex } from './learn-grade-jev.js'; // learn-grade-jev.js imports nothing, so this module stays a leaf

export const MODEL = 'claude-opus-5';
// Model picker allowlist - "Auto" resolves to the default.
export const ASK_MODELS = { auto: MODEL, 'opus-5': 'claude-opus-5', 'sonnet-5': 'claude-sonnet-5', 'haiku-4.5': 'claude-haiku-4-5-20251001' };

// A picker key to its model id; anything else gets the caller's fallback.
// Own keys only: 'constructor' or '__proto__' would otherwise send a function
// or an object as the model.
export const askModel = (key, fallback = null) => (typeof key === 'string' && Object.hasOwn(ASK_MODELS, key) ? ASK_MODELS[key] : fallback);

// What each Learn task sends. provider: 'anthropic' is ask.js anthropic() (the
// platform key, or the subscription bridge in SUBSCRIPTION_ONLY); 'plan' is
// planModel (OpenAI only with both OPENAI_API_KEY and LEARN_PLAN_MODEL set,
// outside subscription mode; otherwise anthropic()). model null is
// Auto: claude-opus-5 plus the server-side refusal fallback; an explicit id
// gets no fallback. org is null on every task, so per-org AI settings
// (org_ai) never apply to Learn. No task sets thinking, and only the journey
// roles carry an effort, so the model default thinks inside maxTokens.
export const LEARN_TASKS = Object.freeze({
  // Sheet asks, Ask in chat, Continue convo and chat-answered slash commands,
  // on every canvas kind. The picker key resolves through askModel.
  chat: Object.freeze({ provider: 'anthropic', model: null, picker: true, fallback: 'server-side default on Auto only', thinking: 'model default', toolChoice: 'auto; none on the last research step', maxTokens: 2400 }),
  // The visible grade (/api/learn/assess, learn-grade-routes.js): Auto, one
  // call with no tools, a thinking-only turn replayed once.
  grading: Object.freeze({ provider: 'anthropic', model: null, picker: false, fallback: 'server-side default', thinking: 'model default', toolChoice: 'none (no tools)', maxTokens: 2400 }),
  // The Tutor v1 planner (/api/learn/tutor/plan, learn-tutor-routes.js): pinned to Opus 5.5,
  // no fallback, one forced tool call returning the turn's TutorResponse.
  tutor: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (the tutor_response tool; no tool call is an invalid turn)', maxTokens: 2000 }),
  // The Tutor's larger evaluator (/api/learn/tutor/evaluate after an uncertain JEV): pinned to Opus 5.5, no fallback.
  tutor_evaluator: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'none (no tools)', maxTokens: 2400 }),
  // Home answers (/api/learn/home-ask, learn-home-ask.js): pinned to Sonnet 5.5 at effort low, grounded in the user's library.
  home_ask: Object.freeze({ provider: 'anthropic', model: 'claude-sonnet-5-5', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'none (no tools; one JSON reply)', maxTokens: 900 }),
  // The Avatar Director (role AVATAR_DIRECTOR_MODEL) and its fresh blind script reviewer
  // (docs/features/rabbit-hole-avatar-teacher-v1-spec.md §5.1, learn-avatar-brief.js). claude-opus-5-5 is the
  // initial development mapping (owner, 2026-10-04), not a product decision; a faster model is benchmarked once
  // the pipeline works. Opus 5.5 always thinks, inside maxTokens, so the budget leaves room for the tool call.
  avatar_director: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (the avatar_script tool; no tool call is a format failure)', maxTokens: 4000 }),
  avatar_script_reviewer: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (the script_review tool; no tool call is a format failure)', maxTokens: 4000 }),
  // The journey planners (learn-journey-planners.js, adaptive-learning-path-v1-architecture.md §11): one tool each on
  // tool_choice auto; effort is output_config.effort, null the model default.
  // Resolver rule 5: a tray message the deterministic rules missed -> one of the five kinds.
  journey_resolver: Object.freeze({ provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'low', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 300 }),
  // The registry and the probe ladder (+ one background question). Final review A-I1: thinking counts against max_tokens.
  journey_diagnostic: Object.freeze({ provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'low', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 8000 }),
  // The first path draft, and the escalation target of journey_adapt. Final review A-I1: with no diagnostic (fast start, a
  // quick overview) one call returns the path and the whole registry, plus Opus thinking, under this cap.
  journey_path: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', effort: null, picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 12000 }),
  // The current section's SectionPlan.
  journey_section: Object.freeze({ provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'low', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 3000 }),
  // Path revisions and adaptations.
  journey_adapt: Object.freeze({ provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'low', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 4000 }),
  // Professor Next Steps (docs/features/professor-next-steps.md §2.4): the hook planner, one tool (suggest_next_steps) on
  // tool_choice auto; its escalation runs once on a missing tool call, a validator failure or an ambiguous reading.
  tutor_next_steps: Object.freeze({ provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'low', picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 1500 }),
  tutor_next_steps_escalation: Object.freeze({ provider: 'anthropic', model: 'claude-opus-5-5', effort: null, picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'auto (one tool)', maxTokens: 4000 }),
  // Slash-command cards (/api/learn/artifact).
  artifact: Object.freeze({ provider: 'plan', model: ASK_MODELS.auto, picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'any', maxTokens: 4000 }),
  // The whiteboard (/api/learn/board): one model for plan, draft and review.
  // It still honours a request `model` key that no client sends (models-7).
  board: Object.freeze({ provider: 'plan', model: ASK_MODELS.auto, picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'forced tool; any while gathering assets', maxTokens: Object.freeze({ plan: 1200, draft: 3000, review: 1800 }) }),
});

// Cards and the whiteboard go to OpenAI only on an explicit opt-in, and
// subscription mode never leaves the bridge (planModel in ask.js).
export const planUsesOpenAI = env => env.SUBSCRIPTION_ONLY !== 'true' && !!env.OPENAI_API_KEY && !!env.LEARN_PLAN_MODEL;

// One sanitized log line per Learn model call (models-11): what was asked for,
// where it came from and what actually served it. Never the message, the
// context, tool input or a key; the prompt is named by a 12-character hash.
// Wraps a callModel(env, body, model, org) and returns the response untouched.
export function loggedModel(task, callModel) {
  return async (env, body, model, org) => {
    const response = await callModel(env, body, model, org);
    try {
      const result = response.ok ? await response.clone().json() : null;
      const provider = env.SUBSCRIPTION_ONLY === 'true' ? 'subscription' : LEARN_TASKS[task].provider === 'plan' && planUsesOpenAI(env) ? 'openai' : 'anthropic';
      console.log(JSON.stringify({
        event: 'learn_model', task, provider,
        requested: provider === 'openai' ? env.LEARN_PLAN_MODEL : model ?? 'auto',
        source: provider === 'openai' ? 'LEARN_PLAN_MODEL' : model == null ? 'auto' : model === LEARN_TASKS[task].model ? 'task' : 'request',
        fallback: provider === 'anthropic' && model == null ? 'default' : 'none',
        served: result?.model ?? null,
        fellBack: !!result?.usage?.iterations?.some(step => step.type === 'fallback_message'),
        prompt: (await sha256(String(body.system ?? ''))).slice(0, 12),
        status: response.status, stopReason: result?.stop_reason ?? null,
      }));
    } catch { /* a log line is never worth a failed answer */ }
    return response;
  };
}

// USD per MTok [input, output, cache read] (claude-api skill, cached 2026-09-25; the numbers web/e2e/journey-corpus-run.mjs:100
// and web/e2e/tutor-corpus-run.mjs:43 use). A 5-minute cache write is 1.25x input; Opus 5.5 fast mode doubles everything.
// ponytail: the e2e runners keep their own copy; point them here when they are next edited.
export const MODEL_PRICES = Object.freeze({ 'claude-opus-5-5': [4, 20, 0.2], 'claude-sonnet-5-5': [2, 10, 0.2], 'claude-haiku-4-5-20251001': [1, 5, 0.1] });
export function costUsd({ model, input_tokens = 0, output_tokens = 0, cache_creation_input_tokens = 0, cache_read_input_tokens = 0, speed = null }) {
  const p = MODEL_PRICES[model];
  if (!p) return null;
  const usd = ((input_tokens || 0) * p[0] + (output_tokens || 0) * p[1] + (cache_creation_input_tokens || 0) * p[0] * 1.25 + (cache_read_input_tokens || 0) * p[2]) / 1e6;
  return +((speed === 'fast' ? 2 : 1) * usd).toFixed(6);
}
// The decision telemetry's prompt_version: the system text and the tool schemas actually sent (transport flags such as
// cache_control or eager_input_streaming left out), so a prompt or tool change shows and a cache or stream setting does not.
// System blocks join with a newline, as the uncached prompt joins the same texts (plannerRequest), so both hash alike.
export async function promptVersion(system, tools) {
  const text = Array.isArray(system) ? system.map(block => block.text).join('\n') : String(system ?? '');
  return (await sha256Hex(JSON.stringify([text, (tools || []).map(({ name, description, input_schema }) => ({ name, description, input_schema }))]))).slice(0, 12);
}

// Request limits shared by more than one site.
export const MESSAGE_LIMIT = 4000; // characters in the learner's question
export const MENTION_LIMIT = 3; // @-mentioned apps or repositories per ask
export const HISTORY_TURNS = 10; // earlier thread messages sent with an ask
export const PAPERS_PER_ANSWER = 2; // arXiv papers one answer or explanation may read
// Loop limits, deliberately separate: each bounds a different loop.
export const RESEARCH_STEPS = 8; // chat tool steps before the forced text step
export const ARTIFACT_REPAIRS = 1; // validation repairs per slash-command card
export const BOARD_DRAFT_TURNS = 7; // whiteboard draft turns; the last one forces the drawing
export const BOARD_REVIEW_PASSES = 2; // whiteboard reviews: the draft, then one revision
