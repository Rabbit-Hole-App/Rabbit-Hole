// Model ids, per-task Learn model settings and request limits in one place
// (C4 in docs/features/learn-cleanup.md). Every value is today's behavior,
// pinned by test/learn-models.test.js: changing one is a behavior change.
// A leaf module, so ask.js, learn-research.js and the browser-side test can
// all import it without a cycle.

export const MODEL = 'claude-opus-5';
// Model picker allowlist - "Auto" resolves to the default.
export const ASK_MODELS = { auto: MODEL, 'opus-5': 'claude-opus-5', 'sonnet-5': 'claude-sonnet-5', 'haiku-4.5': 'claude-haiku-4-5-20251001' };
// The cards and whiteboard OpenAI model when planModel takes that branch.
export const PLAN_MODEL = 'gpt-4.1-mini';

// A picker key to its model id; anything else gets the caller's fallback.
// Own keys only: 'constructor' or '__proto__' would otherwise send a function
// or an object as the model.
export const askModel = (key, fallback = null) => (typeof key === 'string' && Object.hasOwn(ASK_MODELS, key) ? ASK_MODELS[key] : fallback);

// What each Learn task sends. provider: 'anthropic' is ask.js anthropic() (the
// platform key, or the subscription bridge in SUBSCRIPTION_ONLY); 'plan' is
// planModel (OpenAI when configured, otherwise anthropic()). model null is
// Auto: claude-opus-5 plus the server-side refusal fallback; an explicit id
// gets no fallback. org is null on every task, so per-org AI settings
// (org_ai) never apply to Learn. No task sets thinking or effort, so the
// model default thinks inside maxTokens.
export const LEARN_TASKS = Object.freeze({
  // Sheet asks, Ask in chat, Continue convo and chat-answered slash commands,
  // on every canvas kind. The picker key resolves through askModel.
  chat: Object.freeze({ provider: 'anthropic', model: null, picker: true, fallback: 'server-side default on Auto only', thinking: 'model default', toolChoice: 'auto; none on the last research step', maxTokens: 2400 }),
  // The grader posts to the chat route with no model key, so it runs Auto.
  grading: Object.freeze({ provider: 'anthropic', model: null, picker: false, fallback: 'server-side default', thinking: 'model default', toolChoice: 'auto; none on the last research step', maxTokens: 2400 }),
  // Slash-command cards (/api/learn/artifact).
  artifact: Object.freeze({ provider: 'plan', model: ASK_MODELS.auto, picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'any', maxTokens: 4000 }),
  // The whiteboard (/api/learn/board): one model for plan, draft and review.
  // It still honours a request `model` key that no client sends (models-7).
  board: Object.freeze({ provider: 'plan', model: ASK_MODELS.auto, picker: false, fallback: 'none', thinking: 'model default', toolChoice: 'forced tool; any while gathering assets', maxTokens: Object.freeze({ plan: 1200, draft: 3000, review: 1800 }) }),
});

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
