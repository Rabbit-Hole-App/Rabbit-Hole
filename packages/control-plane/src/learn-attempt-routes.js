// packages/control-plane/src/learn-attempt-routes.js
// Submitted attempts (C:/s/spec/tutor-workflow/draft.md Tasks 05 and 06).
//
// Endpoints:
//   POST /api/learn/tutor/attempts {app, board, activityId, activityRevision, submissionKey, submittedContent, sourceRefs?, assistanceRefs?}
//        -> {attempt, assessment, assessments, replayed}
//        The attempt is saved first. Its one assessment is then dispatched. A retry with the same key and content replays
//        the attempt, and never dispatches a second time.
//        The activity steps to awaiting_feedback, then to feedback_ready once the assessment is final (coaching store).
//   GET  /api/learn/tutor/attempts/:id?app=&board= -> {attempt, assessment, assessments}
//        Reconciles stale operations. It makes no model call.
//   POST /api/learn/tutor/attempts/:id/reassess {app, board, requestKey, dispute?} -> {attempt, assessment, assessments, replayed}
//        A deliberate review. It supersedes the last completed assessment; the original attempt and result are kept.
//        dispute: true is the learner's "Question this feedback" (Task 10): the questioned result is labelled disputed.
//
// Errors:
//   400 invalid_submission, invalid_content, unknown_source, invalid_request_key
//   404 unknown_activity, unknown_attempt (also for another learner's ids)
//   409 submission_key_conflict, stale_activity {activityRevision}, goal_closed, criteria_unavailable, assessment_in_progress
//   413 submission_too_large {field, unit, max, actual}. Nothing is truncated.
//   503 attempts_unavailable. The response never claims a save that did not happen.
//   After a save, a failure later in the request still answers with the saved attempt (202 when it cannot be read back).
//
// Access: only the signed-in learner's own records, resolved as the coaching route resolves them. That is an app they may
// open, a canvas, and the account's users.id (never an email, never taken from the body).
import { authorizedBoardApp } from './learn-board.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { AttemptError, acceptAttempt, readAttempt, requestReassessment } from './learn-attempt-store.js';
import { assessAttempt } from './learn-assessment.js';
import { advanceActivity } from './learn-coaching-store.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const BOARD = /^[A-Za-z0-9 _.-]{1,100}$/; // learn-boards.js board names
const PATH = /^\/api\/learn\/tutor\/attempts(?:\/([A-Za-z0-9_-]{1,100})(\/reassess)?)?$/;
// The raw body is bounded before parsing. It holds the 16 KB submission plus its refs.
export const ATTEMPT_BODY_CHARS = 65536;
const log = (event, error) => console.error(JSON.stringify({ event, error: error?.name || 'Error', message: String(error?.message || '').slice(0, 120) }));

export async function attemptRoute(path, req, env, deps = {}) {
  const match = PATH.exec(path);
  if (!match) return null;
  const [, id, reassess] = match;
  const method = id && !reassess ? 'GET' : 'POST';
  if (req.method !== method) return json({ error: `${method} required` }, 405);
  let body;
  if (method === 'GET') {
    const query = new URL(req.url).searchParams;
    body = { app: query.get('app'), board: query.get('board') };
  } else {
    const raw = await req.text();
    if (raw.length > ATTEMPT_BODY_CHARS) return json({ error: 'submission_too_large', detail: { field: 'body', unit: 'characters', max: ATTEMPT_BODY_CHARS, actual: raw.length } }, 413);
    try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid JSON' }, 400);
  }
  const access = await (deps.authorize || authorizedBoardApp)(req, env, body.app, null);
  if (access instanceof Response) return access;
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  const ownerRefused = subscriptionOwnerRefusal(env, access);
  if (ownerRefused) return ownerRefused;
  if (typeof body.board !== 'string' || !BOARD.test(body.board)) return json({ error: 'Board name must be 1-100 letters, digits, spaces, dots, dashes or underscores' }, 400);
  if (access.kind !== 'canvas') return json({ error: 'attempts_on_canvases_only' }, 400);
  if (!access.user_id) return json({ error: 'identity_unavailable' }, 401);
  const actor = { org: access.org, userId: access.user_id, app: body.app, board: body.board };
  let handle;
  try {
    if (method === 'GET') return json(await readAttempt(env, actor, id));
    handle = reassess
      ? await requestReassessment(env, actor, id, body.requestKey, { dispute: body.dispute === true })
      : await acceptAttempt(env, actor, {
        activityId: body.activityId, activityRevision: body.activityRevision, submissionKey: body.submissionKey,
        submittedContent: body.submittedContent, sourceRefs: body.sourceRefs ?? [], assistanceRefs: body.assistanceRefs ?? [],
      });
  } catch (error) {
    if (error instanceof AttemptError) return json({ error: error.code, ...(error.detail != null ? { detail: error.detail } : {}) }, error.status);
    log('learn_attempt_error', error);
    return json({ error: 'attempts_unavailable' }, 503);
  }
  // Saved. From here on, every answer reports the saved attempt. The activity's status follows it through the coaching store
  // (Slice A gap a): awaiting_feedback now, feedback_ready once the assessment is final. A failed step is logged; the saved
  // attempt and its assessment stand, and a replay never moves the activity back.
  const step = (activityId, to, note) => advanceActivity(env, actor, activityId, to, note).catch(error => log('learn_activity_step_error', error));
  const activityId = reassess ? (await readAttempt(env, actor, handle.attemptId).catch(() => null))?.attempt.activityId : body.activityId;
  // shortcut: a replay of a request that died before this step leaves the activity in_progress; step it on replay too if that shows up.
  if (activityId && !handle.replayed) await step(activityId, 'awaiting_feedback');
  // access lets the rubric and visual routes read the learner's own sources and image under this request's identity.
  try { await assessAttempt(env, actor, handle.attemptId, { ...deps, access }); } catch (error) { log('learn_assessment_dispatch_error', error); }
  const view = await readAttempt(env, actor, handle.attemptId).catch(() => null);
  const latest = view?.assessment;
  if (activityId && latest && latest.status !== 'pending') await step(activityId, 'feedback_ready', { attemptId: handle.attemptId, status: latest.status, reason: latest.reason ?? null });
  if (view) return json({ ...view, replayed: handle.replayed });
  return json({ attempt: { attemptId: handle.attemptId }, assessment: { assessmentId: handle.assessmentId, status: handle.status }, replayed: handle.replayed, saved: true }, 202);
}
