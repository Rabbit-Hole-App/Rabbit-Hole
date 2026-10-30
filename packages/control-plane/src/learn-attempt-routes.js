// packages/control-plane/src/learn-attempt-routes.js
// Submitted attempts (C:/s/spec/tutor-workflow/draft.md Tasks 05 and 06).
//
// Endpoints:
//   POST /api/learn/tutor/attempts {app, board, activityId, activityRevision, submissionKey, submittedContent, sourceRefs?, assistanceRefs?, snapshots?}
//        snapshots (Explain-back): snapshotOf(entry, scope) of each connected card, note or Notebook selection; only those whose
//        canonical hash the answer names are kept, privately, for the frozen-evidence resolver. Not part of the content hash.
//        -> {attempt, assessment, assessments, replayed}
//        The attempt is saved first. Its one assessment is then dispatched. A retry with the same key and content replays
//        the attempt, and never dispatches a second time.
//        The activity steps to awaiting_feedback, then to feedback_ready once the assessment is final (coaching store).
//   GET  /api/learn/tutor/attempts/:id?app=&board= -> {attempt, assessment, assessments}
//        Reconciles stale operations. It makes no model call.
//   GET  /api/learn/tutor/attempts?app=&board=&cardId= -> {attempts}: the learner's own attempts at one Explain-back card,
//        newest first, each with its latest operation and stored rating. No model call.
//   POST /api/learn/tutor/attempts/bind {app, board, cardId, prompt, expects?} -> {goalId, activityId, activityRevision,
//        criterionRefs, rubricVersion}: the card's server-owned activity and criteria (Explain-back, EB-02). Idempotent.
//   PUT  /api/learn/tutor/attempts/assets?app=&board=&kind=audio|image|timeline&sha256=&durationMs= <raw bytes> -> {asset} (201; 200 when
//        the same bytes were stored before). Audio WebM/Ogg/MP4 or a PNG Sketch snapshot, checked by bytes and by sha256.
//   GET  /api/learn/tutor/attempts/assets/:aa_id?app=&board= -> the bytes (Range supported). Owner only: 404 for anyone else.
//   PUT  /api/learn/tutor/attempts/assets/:aa_id {app, board, marks, text} -> {meta}: a Sketch snapshot's capture data, set once.
//   GET  /api/learn/tutor/attempts/assets/:aa_id/meta?app=&board= -> {marks, text} (null each when unset). Owner only: 404 otherwise.
//   GET  /api/learn/tutor/attempts/drafts?app=&board=&cardId= -> {draft|null}
//   PUT  /api/learn/tutor/attempts/drafts {app, board, cardId, expectedRevision, answer|null} -> {draft|null}; 409
//        draft_conflict {draft} when another tab saved first (nothing is overwritten). answer null clears the draft.
//   POST /api/learn/tutor/attempts/:id/reassess {app, board, requestKey, dispute?} -> {attempt, assessment, assessments, replayed}
//        A deliberate review. It supersedes the last completed assessment; the original attempt and result are kept.
//        dispute: true is the learner's "Question this feedback" (Task 10): the questioned result is labelled disputed.
//
// Errors:
//   400 invalid_submission, invalid_content, unknown_source, invalid_request_key
//   404 unknown_activity, unknown_attempt (also for another learner's ids)
//   409 submission_key_conflict, stale_activity {activityRevision}, goal_closed, criteria_unavailable, assessment_in_progress
//   413 submission_too_large {field, unit, max, actual}. Nothing is truncated.
//   Explain-back: 400 invalid_card, self_reference, empty_answer, upload_in_progress, evidence_unavailable, text_too_long;
//   403 cross_scope_evidence; 404 baseline_not_found, unknown_asset; 409 stale_baseline {parentAssessmentId}, card_busy.
//   503 attempts_unavailable. The response never claims a save that did not happen.
//   After a save, a failure later in the request still answers with the saved attempt (202 when it cannot be read back).
//
// Access: only the signed-in learner's own records, resolved as the coaching route resolves them. That is an app they may
// open, a canvas, and the account's users.id (never an email, never taken from the body).
import { authorizedBoardApp } from './learn-board.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { AttemptError, acceptAttempt, bindExplainBackCard, listAttempts, readAttempt, readDraft, requestReassessment, saveDraft } from './learn-attempt-store.js';
import { SNAPSHOT_LIMITS, readAssetMeta, serveAttemptAsset, setAssetMeta, uploadAttemptAsset } from './learn-attempt-assets.js';
import { assessAttempt } from './learn-assessment.js';
import { advanceActivity } from './learn-coaching-store.js';

// Learners see AI credits only (CLAUDE.md): dollar amounts, provider prices and other cost fields stay in the stored
// provenance for the spend ledger and telemetry, and are dropped from every response these routes send to the browser.
const PRICED = /usd|cost|price|micros|margin/i;
export const learnerSafe = value => (Array.isArray(value) ? value.map(learnerSafe)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([k]) => !PRICED.test(k)).map(([k, v]) => [k, learnerSafe(v)])) : value);
const json = (body, status = 200) => Response.json(learnerSafe(body), { status, headers: { 'Cache-Control': 'no-store' } });
const BOARD = /^[A-Za-z0-9 _.-]{1,100}$/; // learn-boards.js board names
const PATH = /^\/api\/learn\/tutor\/attempts(?:\/(bind|drafts|assets)(?:\/(aa_[A-Za-z0-9_-]{8,80})(\/meta)?)?|\/([A-Za-z0-9_-]{1,100})(\/reassess)?)?$/;
// The raw body is bounded before parsing. It holds the 16 KB submission plus its refs, and an Explain-back answer's frozen
// board-held inputs (snapshots), bounded separately by SNAPSHOT_LIMITS.totalChars.
export const ATTEMPT_BODY_CHARS = 65536;
const tooLarge = (max, actual) => json({ error: 'submission_too_large', detail: { field: 'body', unit: 'characters', max, actual } }, 413);
const log = (event, error) => console.error(JSON.stringify({ event, error: error?.name || 'Error', message: String(error?.message || '').slice(0, 120) }));

export async function attemptRoute(path, req, env, deps = {}) {
  const match = PATH.exec(path);
  if (!match) return null;
  const [, named, assetId, meta, id, reassess] = match;
  if (assetId && named !== 'assets') return null;
  const query = new URL(req.url).searchParams;
  const list = !named && !id && req.method === 'GET' && query.has('cardId');
  const allowed = named === 'assets' ? (meta ? ['GET'] : assetId ? ['GET', 'HEAD', 'PUT'] : ['PUT']) : named === 'drafts' ? ['GET', 'PUT']
    : list || (id && !reassess) ? ['GET'] : ['POST'];
  if (!allowed.includes(req.method)) return json({ error: `${allowed.join(' or ')} required` }, 405);
  const method = req.method;
  let body;
  // GET and HEAD, and an asset upload (raw bytes), name the canvas in the query.
  if (method === 'GET' || method === 'HEAD' || (named === 'assets' && !assetId)) {
    body = { app: query.get('app'), board: query.get('board'), cardId: query.get('cardId') };
  } else {
    // A declared length that cannot fit (UTF-8 is at most 3 bytes per UTF-16 unit) is refused before anything is read.
    const declared = Number(req.headers.get('content-length'));
    if (declared > 3 * (ATTEMPT_BODY_CHARS + SNAPSHOT_LIMITS.totalChars)) return tooLarge(ATTEMPT_BODY_CHARS, declared);
    const raw = await req.text();
    if (raw.length > ATTEMPT_BODY_CHARS + SNAPSHOT_LIMITS.totalChars) return tooLarge(ATTEMPT_BODY_CHARS, raw.length);
    try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid JSON' }, 400);
    // Everything but the snapshots keeps the original bound; the snapshots have their own.
    const { snapshots, ...rest } = body;
    const restChars = JSON.stringify(rest).length, snapChars = snapshots === undefined ? 0 : JSON.stringify(snapshots).length;
    if (restChars > ATTEMPT_BODY_CHARS) return tooLarge(ATTEMPT_BODY_CHARS, restChars);
    if (snapChars > SNAPSHOT_LIMITS.totalChars) return json({ error: 'submission_too_large', detail: { field: 'snapshots', unit: 'characters', max: SNAPSHOT_LIMITS.totalChars, actual: snapChars } }, 413);
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
    if (meta) {
      const got = await readAssetMeta(env, actor, assetId);
      return got ? json(got) : json({ error: 'unknown_asset' }, 404);
    }
    if (named === 'assets' && assetId && method === 'PUT') {
      const meta = await setAssetMeta(env, actor, assetId, body).catch(error => { if (error instanceof TypeError) throw new AttemptError('invalid_asset_meta', 400, error.message); throw error; });
      return meta ? json({ meta }) : json({ error: 'unknown_asset' }, 404);
    }
    if (named === 'assets') return assetId ? await serveAttemptAsset(env, actor, req, assetId)
      : await uploadAttemptAsset(env, actor, req, { kind: query.get('kind'), sha256: query.get('sha256'), durationMs: query.get('durationMs') });
    if (named === 'drafts') return json({ draft: method === 'GET' ? await readDraft(env, actor, body.cardId) : await saveDraft(env, actor, body) });
    if (list) return json({ attempts: await listAttempts(env, actor, body.cardId) });
    if (method === 'GET') return json(await readAttempt(env, actor, id));
    if (named === 'bind') return json(await bindExplainBackCard(env, actor, { cardId: body.cardId, prompt: body.prompt, expects: body.expects ?? [] }, { email: access.email ?? null }));
    handle = reassess
      ? await requestReassessment(env, actor, id, body.requestKey, { dispute: body.dispute === true })
      : await acceptAttempt(env, actor, {
        activityId: body.activityId, activityRevision: body.activityRevision, submissionKey: body.submissionKey,
        submittedContent: body.submittedContent, sourceRefs: body.sourceRefs ?? [], assistanceRefs: body.assistanceRefs ?? [],
      }, { snapshots: body.snapshots ?? null });
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
