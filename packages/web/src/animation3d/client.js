// /animation generation jobs and accepted artifacts in the browser (plan sections 3 and 5, AN-03/AN-05). The server routes
// are lane G's (control-plane animation-job.js); the paths below are the only place the browser names them, so aligning
// with G's hand-back is a change here alone. fetchJson is the app's api() (api.js): (path, options) -> parsed JSON, and it
// throws an Error carrying { status, data } on a refusal.
//
// As with /explain (explain-client.js): the card is placed before the job runs and polling only observes the job.
// Lane G's route table (control-plane animation-job.js): jobs, their actions, and results under the jobs root.
export const ANIMATION_ROUTES = Object.freeze({
  jobs: '/api/learn/animation/jobs',
  results: '/api/learn/animation/jobs/results',
});
const q = value => encodeURIComponent(value);

export function animationClient(fetchJson, boardId) {
  const post = (path, body = {}) => fetchJson(path, { method: 'POST', body: JSON.stringify({ boardId, ...body }) });
  return {
    // One /animation request starts one job (its plan is then reviewed); requestId makes a repeat return that same job.
    create: ({ requestId, cardId, prompt, context = null, threadId = null }) => post(ANIMATION_ROUTES.jobs, { requestId, cardId, prompt, ...(context ? { context } : {}), ...(threadId ? { threadId } : {}) }),
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
// The one retry the job offers now (the server's recovery list), or null.
export const animationRetry = job => job?.recovery?.find(action => action === 'retry_render' || action === 'new_attempt') ?? (job?.stage === 'failed' ? 'new_attempt' : null);
// A job's result lands through storage.js (withJob, settleAnimationJob): bound to its card, board, request, source set and base revision.
