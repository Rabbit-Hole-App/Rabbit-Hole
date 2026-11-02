// /animation generation jobs and accepted artifacts in the browser (plan sections 3 and 5, AN-03/AN-05). The server routes
// are lane G's (control-plane animation-job.js); the paths below are the only place the browser names them, so aligning
// with G's hand-back is a change here alone. fetchJson is the app's api() (api.js): (path, options) -> parsed JSON, and it
// throws an Error carrying { status, data } on a refusal.
//
// As with /explain (explain-client.js): the card is placed before the job runs and polling only observes the job.
import { sha256Hex } from '../explain-program/contract.js';
import { artifactIdentity } from './storage.js';

// Lane G's route table (control-plane animation-job.js): jobs, their actions, and results under the jobs root.
export const ANIMATION_ROUTES = Object.freeze({
  jobs: '/api/learn/animation/jobs',
  results: '/api/learn/animation/jobs/results',
});
const q = value => encodeURIComponent(value);

export function animationClient(fetchJson, boardId) {
  const post = (path, body = {}) => fetchJson(path, { method: 'POST', body: JSON.stringify({ boardId, ...body }) });
  return {
    // One /animation request starts one job (its plan is then reviewed): { requestId, cardId, prompt, context?, context_refs?,
    // threadId?, source? }; requestId makes a repeat return that same job.
    create: body => post(ANIMATION_ROUTES.jobs, body),
    get: jobId => fetchJson(`${ANIMATION_ROUTES.jobs}/${q(jobId)}?board=${q(boardId)}`),
    // approve | refine | cancel | retry: one targeted action on this job; expectedAttempt makes a double press one Retry.
    action: (jobId, name, body = {}) => post(`${ANIMATION_ROUTES.jobs}/${q(jobId)}/${q(name)}`, body),
    // An accepted artifact by its immutable id, read independently of the job record (kept when the job is pruned).
    result: (artifactId, { signal } = {}) => fetchJson(`${ANIMATION_ROUTES.results}/${q(artifactId)}?board=${q(boardId)}`, signal ? { signal } : {}),
  };
}

// What a pending card says: the server's stage, never a guess, no ellipses (UI copy rule).
const STAGES = {
  queued: 'Queued', preparing: 'Reading the request', awaiting_approval: 'Review the scene plan above the chat box',
  authoring: 'Building the scene', validating: 'Checking it', rendering: 'Rendering sample views', reviewing: 'Reviewing the render',
  repairing: 'Fixing what the review found', ready: 'Ready', cancelled: 'Stopped',
};
export const animationStage = job => (job?.stage === 'failed' ? job.failure?.message || 'The scene could not be made.' : STAGES[job?.stage] || 'Checking status');
// Polled while the server works on it; a plan awaiting review waits on the learner, not a timer.
export const animationRunning = job => !!job && !job.terminal && !['awaiting_approval', 'ready', 'failed', 'cancelled'].includes(job.stage);
// The bar a pending card shows once the plan is approved and the scene is being made: Generate is behind it, these four are ahead.
// -> null (keep the spinner: queued, preparing, awaiting_approval and every stage that is not running) or { steps, current, correcting }.
// repairing is a correction under way: the job then goes back through checking, rendering and reviewing, so the bar starts over at
// Build and says so; it never reads as progress past Review. No percentages, no time guesses.
export const ANIMATION_PROGRESS_STEPS = Object.freeze(['Build', 'Check', 'Render', 'Review']);
const PROGRESS_STAGES = ['authoring', 'validating', 'rendering', 'reviewing'];
export function animationProgress(job) {
  if (!animationRunning(job)) return null;
  if (job.stage === 'repairing') return { steps: ANIMATION_PROGRESS_STEPS, current: 0, correcting: true };
  const current = PROGRESS_STAGES.indexOf(job.stage);
  return current < 0 ? null : { steps: ANIMATION_PROGRESS_STEPS, current, correcting: false };
}
// The one recovery the job offers now, from the server's own list only (a job read before the list arrived, or one offering only
// edit_request, offers none): retry_render, new_attempt or revise_plan, or null. Never assumed from the stage.
const RECOVERIES = ['retry_render', 'new_attempt', 'revise_plan'];
export const animationRetry = job => job?.recovery?.find(action => RECOVERIES.includes(action)) ?? null;
export const RETRY_LABELS = Object.freeze({ retry_render: 'Render again', new_attempt: 'Try again', revise_plan: 'Revise plan' });
// A job's result lands through storage.js (withJob, settleAnimationJob): bound to its card, board, request, source set and base revision.

// A job changed from outside its card (Generate approved its plan, Chat refined it, Stop): its card polls again.
export const ANIMATION_JOB_EVENT = 'rh-animation-job';

// The request a card made, as lane G's result names it (animation-job.js accept: requestRef over the request id and the trimmed
// words). The card's job binding keeps it as its sourceKey, so a result for another request never lands.
export const requestRef = async (requestId, prompt) => (await sha256Hex(`${requestId}|${String(prompt).trim()}`)).slice(0, 16);

// G's ready job names its result (resultId, planHash, card, board, requestRef); the board keeps the artifact's own identity
// (storage.js ref: artifactId = resultId, revision, planHash, sourceHash, stamps). The artifact is read once through the result
// route and must be the one the job names. -> the job with its result in storage.js's shape, or null (not ready, or not that result).
export async function readyResult(job, read) {
  const named = job?.stage === 'ready' ? job.result : null;
  if (!named?.resultId) return null;
  const artifact = (await read(named.resultId))?.artifact;
  if (!artifact || artifact.artifactId !== named.resultId || artifact.planHash !== named.planHash) return null;
  return { ...job, result: { ...artifactIdentity(artifact), cardId: named.cardId, canvas: named.canvas, sourceKey: named.requestRef, baseRevision: null } };
}
