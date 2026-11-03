// /animation generation jobs and accepted artifacts in the browser (plan sections 3 and 5, AN-03/AN-05). The server routes
// are lane G's (control-plane animation-job.js); the paths below are the only place the browser names them, so aligning
// with G's hand-back is a change here alone. fetchJson is the app's api() (api.js): (path, options) -> parsed JSON, and it
// throws an Error carrying { status, data } on a refusal.
//
// As with /explain (explain-client.js): the card is placed before the job runs and polling only observes the job.
import { sha256Hex } from '../explain-program/contract.js';
import { artifactIdentity } from './storage.js';
import { ANIMATION_CLIENT_FEATURES } from './capabilities.js';

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
    // features: what this build can draw (capabilities.js), so the scene it is given is one it can draw.
    create: body => post(ANIMATION_ROUTES.jobs, { ...body, features: ANIMATION_CLIENT_FEATURES }),
    get: jobId => fetchJson(`${ANIMATION_ROUTES.jobs}/${q(jobId)}?board=${q(boardId)}`),
    // approve | refine | cancel | retry: one targeted action on this job; expectedAttempt makes a double press one Retry.
    action: (jobId, name, body = {}) => post(`${ANIMATION_ROUTES.jobs}/${q(jobId)}/${q(name)}`, body),
    // An accepted artifact by its immutable id, read independently of the job record (kept when the job is pruned).
    result: (artifactId, { signal } = {}) => fetchJson(`${ANIMATION_ROUTES.results}/${q(artifactId)}?board=${q(boardId)}&features=${q(ANIMATION_CLIENT_FEATURES.join(','))}`, signal ? { signal } : {}),
  };
}

// What a pending card says: the server's stage, never a guess, no ellipses (UI copy rule).
const STAGES = {
  queued: 'Queued', preparing: 'Reading the request', awaiting_approval: 'Review the scene plan above the chat box',
  authoring: 'Building the scene', validating: 'Checking it', rendering: 'Rendering sample views', reviewing: 'Reviewing the render',
  repairing: 'Fixing what the review found', ready: 'Ready', cancelled: 'Stopped',
};
// A stopped build says what became of its credits in the server's own few words (usage.note: "Credits refunded." / "You have not been charged.").
const stopped = job => `${STAGES.cancelled}${job?.usage?.note ? `. ${job.usage.note}` : ''}`;
export const animationStage = job => (job?.stage === 'failed' ? job.failure?.message || 'The scene could not be made.' : job?.choiceOpen ? 'Choose a change to the plan in Chat' : job?.stage === 'cancelled' ? stopped(job) : STAGES[job?.stage] || 'Checking status');
// A request the server asks one question about has not failed in the learner's terms: the card says it plainly, not as an error.
export const animationAsks = job => job?.stopReason === 'needs_clarification';
// What a change offered in Chat does when pressed and what it costs (AnimationChoices.jsx). credits: it needs a plan call, up to that many.
export const choiceAction = alternative => (alternative.credits
  ? { label: 'Plan this', cost: `Uses up to ${alternative.credits} AI credits to write the plan. Nothing is built until you press Generate.` }
  : { label: alternative.id === 'keep' ? 'Keep my plan' : 'Use this plan', cost: 'Uses no AI credits. Nothing is built until you press Generate.' });
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
// A read of a running job failed. -> milliseconds until the next read (a temporary failure: the network, the service busy; backing off
// from the usual 2 s to 30 s), or null when the answer is final (not signed in, not this person's, gone).
const FINAL_READ = new Set([401, 403, 404, 410]);
export const pollRetryDelay = (error, failures) => (FINAL_READ.has(error?.status) ? null : Math.min(30000, 2000 * 2 ** Math.max(0, failures - 1)));

// The status an approved /animation plan shows in Chat: its job's and its card's, never the press's ("Added to the canvas" under a job
// that failed, or a card that is not there, was untrue; owner 2026-11-02). job null: not read yet (null, nothing claimed); unread: the
// read failed. onCanvas false: this canvas has no card for it, so there is nothing to go to, and the words say so.
export function animationProposalStatus({ job, unread = false, onCanvas = true, cardId = null }) {
  if (unread) return { phase: 'unknown', label: null, active: false, spinner: false, detail: 'The status of this scene could not be read.', canStop: false, cardId: onCanvas ? cardId : null };
  if (!job) return null;
  const go = onCanvas ? cardId : null, missing = onCanvas ? '' : ' Its card is not on this canvas. Send the request again to make a new one.';
  if (job.stage === 'ready') return { phase: onCanvas ? 'done' : 'unknown', label: onCanvas ? 'Added to the canvas' : null, active: false, spinner: false, detail: onCanvas ? 'Added to the canvas.' : `The scene was made.${missing}`, canStop: false, cardId: go };
  if (job.stage === 'failed') return { phase: 'failed', label: null, active: false, spinner: false, detail: `${animationStage(job)}${missing}`, canStop: false, cardId: go };
  // Generate found that the edited plan needs a change first (FX-AN-031): nothing is being made, and the choice is in Chat.
  if (job.stage === 'awaiting_approval' && job.choiceOpen) return { phase: 'unknown', label: null, active: false, spinner: false, detail: 'This plan needs a change before it can be made. Choose one in Chat.', canStop: false, cardId: go };
  if (job.stage === 'cancelled') return { phase: 'stopped', label: null, active: false, spinner: false, detail: `${stopped(job)}${job.usage?.note ? '' : '.'}${missing}`, canStop: false, cardId: go };
  return { phase: 'running', label: 'Making the scene', active: true, spinner: true, detail: animationStage(job), canStop: false, cardId: go };
}
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
