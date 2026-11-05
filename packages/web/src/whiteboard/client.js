// /whiteboard (id whiteboard-video) jobs in the browser (roadmap rabbit-hole-whiteboard-roadmap-v1.md 5.1 steps 3-8). The server
// routes are lane wb-server's (control-plane whiteboard-routes.js); the paths and the job's shape are named here only, so aligning with
// that lane's hand-back is a change in this file alone. fetchJson is the app's api() (api.js): (path, options) -> parsed JSON, and it
// throws an Error carrying { status, data } on a refusal. Same shape as animation3d/client.js, so LearnPage's jobRoute and the shared
// proposal actions (approve, refine, cancel) drive it unchanged.
import { getWs } from '../api.js';

export const WHITEBOARD_ROUTES = Object.freeze({
  jobs: '/api/learn/whiteboard/jobs',
  results: '/api/learn/whiteboard/results',
  assets: '/api/learn/whiteboard/assets',
});
const q = value => encodeURIComponent(value);

export function whiteboardClient(fetchJson, boardId) {
  const post = (path, body = {}) => fetchJson(path, { method: 'POST', body: JSON.stringify({ boardId, ...body }) });
  return {
    // One /whiteboard request starts one job (its plan is then reviewed in Chat): { requestId, cardId, prompt, context? (text),
    // durationSeconds?, threadId? } (wb-server whiteboard-routes.js); requestId makes a repeat return that same job.
    create: body => post(WHITEBOARD_ROUTES.jobs, body),
    // The job's status (the card polls it).
    get: jobId => fetchJson(`${WHITEBOARD_ROUTES.jobs}/${q(jobId)}?board=${q(boardId)}`),
    // approve | refine | cancel: one action on this job (the shared proposal actions call it by name).
    action: (jobId, name, body = {}) => post(`${WHITEBOARD_ROUTES.jobs}/${q(jobId)}/${q(name)}`, body),
    // A finished video's record by its artifact id, independent of the job record.
    result: artifactId => fetchJson(`${WHITEBOARD_ROUTES.results}/${q(artifactId)}?board=${q(boardId)}`),
  };
}

// A finished video's files (owner only): final (the MP4), poster or captions; download asks for an attachment.
export const whiteboardAssetUrl = (app, artifactId, kind, { download = false } = {}) =>
  `${WHITEBOARD_ROUTES.assets}?app=${q(app)}&workspace=${q(getWs())}&artifact=${q(artifactId)}&kind=${q(kind)}${download ? '&download=1' : ''}`;

// The server's refusals the learner may read, by code (owner-approved words, 2026-11-04; wb-server whiteboard-job.js). Any other code
// is said by the caller's own line, never the server's text.
const INVALID = 'Invalid whiteboard request.';
export const WHITEBOARD_REFUSALS = Object.freeze({
  invalid_request: INVALID, prompt_too_long: INVALID, invalid_context: INVALID, duration_invalid: INVALID, invalid_thread: INVALID, request_conflict: INVALID,
  prompt_required: 'Say what to explain.', message_required: 'Say what to change.',
  card_busy: 'This card already has a whiteboard video in progress.', canvas_busy: 'Another whiteboard video is being made on this canvas.',
  proposal_used: 'This proposal already made a whiteboard video. Ask for a new version in chat to make another.',
  plan_stale: 'This plan changed. Review it again before generating.', plan_limit: 'This plan reached its change limit. Start a new request.',
  whiteboard_killed: 'AI is paused.',
});
export const whiteboardRefusal = error => WHITEBOARD_REFUSALS[error?.data?.code] ?? null;

// W1 offers no recovery action (W3 adds them).
export const RETRY_LABELS = Object.freeze({});
// A job changed from outside its card (Generate approved its plan, Chat refined it): its card reads it again.
export const WHITEBOARD_JOB_EVENT = 'rh-whiteboard-job';
// Read while the server works on it; a plan awaiting review waits on the learner, not a timer.
export const whiteboardRunning = job => !!job && !['awaiting_approval', 'ready', 'failed', 'cancelled'].includes(job.stage);
// The next read of a running job (roadmap 5.1 step 7): every 10 s, backing off to 60 s after failed reads; null when the answer is final
// (not signed in, not this person's, gone).
const FINAL_READ = new Set([401, 403, 404, 410]);
export const whiteboardPollDelay = (error = null, failures = 0) => (FINAL_READ.has(error?.status) ? null : Math.min(60000, 10000 * 2 ** Math.max(0, failures - 1)));
