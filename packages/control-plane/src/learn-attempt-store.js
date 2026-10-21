// packages/control-plane/src/learn-attempt-store.js
// Submitted attempts and their assessment operations on LEARN_DB. Sources: learn-migrations/0026, the Task 05 section and
// "Persistence and access rules" in C:/s/spec/tutor-workflow/draft.md, and owner decision 5a.
//
// Functions:
//   acceptAttempt(env, actor, submission) -> {attemptId, assessmentId, status, replayed}
//   readAttempt(env, actor, attemptId) -> {attempt, assessment, assessments}. It also reconciles stale operations.
//   requestReassessment(env, actor, attemptId, requestKey) -> {attemptId, assessmentId, status, replayed}
//   claimAssessment / commitAssessment: the single dispatch of each operation (used by learn-assessment.js).
//   goalEvidence(env, actor, goalId) -> {observations, pendingAssessments}: the read model input for Task 08.
//
// actor is the server-resolved ActorScope {org, userId, app, board}. userId is users.id and never leaves the server.
//
// Rules:
//   * The attempt and its first operation are saved in one batch, before any evaluator can be dispatched.
//   * A dispatch first claims its operation, and an operation can be claimed once. A double click, a second tab or a
//     retried request therefore dispatches once.
//   * A claim that never commits reads as 'unknown' once it is older than CLAIM_TTL_MS. It is never retried automatically;
//     only an explicit reassessment makes another call.
//   * An attempt row is never updated.
import { validateCoachingRecord } from '../../web/src/learn-coaching-contract.js';
import { CITATION_MAX, REPOSITORY_SOURCE, citationRef, citationsOverlap, isRepositorySource } from '../../web/src/learn-codebase-goals.js';
import { sha256Hex } from './learn-grade-jev.js';

export class AttemptError extends Error {
  constructor(code, status = 409, detail = null) { super(`attempt: ${code}`); this.name = 'AttemptError'; this.code = code; this.status = status; this.detail = detail; }
}

// Size limits:
//   * Text is bounded like the evaluator's message (validateEvaluateBody, journeySpec): 4000 UTF-16 units.
//   * The whole submission is bounded in UTF-8 bytes.
//   * Over a limit, the request is refused with the limit and the actual size. Nothing is truncated; the learner's draft
//     stays where it is.
export const ATTEMPT_LIMITS = Object.freeze({ textChars: 4000, contentBytes: 16384, refs: 20 });
// Comfortably longer than one assessment: an 800 ms JEV call, then an 8 s escalation.
export const CLAIM_TTL_MS = 60000;
const KEY = /^[A-Za-z0-9_-]{8,128}$/; // a submission or reassessment key, like X-RH-Action-Key
const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
const invalid = (code, detail) => new AttemptError(code, 400, detail);

// Canonical JSON: keys sorted at every depth, so one submission always hashes the same way. Only plain JSON is accepted.
export function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObj(value) && Object.getPrototypeOf(value) === Object.prototype) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  throw invalid('invalid_content', 'submittedContent must be plain JSON');
}

function checkSize(content) {
  if (typeof content?.text === 'string' && content.text.length > ATTEMPT_LIMITS.textChars) {
    throw new AttemptError('submission_too_large', 413, { field: 'text', unit: 'characters', max: ATTEMPT_LIMITS.textChars, actual: content.text.length });
  }
  let json;
  try { json = JSON.stringify(content); } catch { throw invalid('invalid_content', 'submittedContent must be plain JSON'); }
  const bytes = new TextEncoder().encode(json ?? '').length;
  if (bytes > ATTEMPT_LIMITS.contentBytes) throw new AttemptError('submission_too_large', 413, { field: 'submittedContent', unit: 'bytes', max: ATTEMPT_LIMITS.contentBytes, actual: bytes });
}

// The fields a submission needs for each response kind. Drawing, code and numeric answers only need to be a JSON object
// within the limits; their assessment is a later capability.
const CONTENT = {
  text: c => typeof c.text === 'string' && c.text.trim().length > 0,
  choice: c => typeof c.optionId === 'string' && c.optionId.length > 0 && c.optionId.length <= 200,
};

// An activity of learn 0025 (Task 02), read only by its owner on this canvas, with its goal's lifecycle and journey.
// Another learner's activity, another canvas's activity or a made-up id all come back as null.
export async function ownActivity(env, actor, activityId) {
  if (typeof activityId !== 'string' || activityId.length > 200) return null;
  return env.LEARN_DB.prepare(`SELECT a.id, a.goal_id, a.revision, a.status, a.response_kind, a.prompt, a.criterion_refs_json, a.source_refs_json,
      a.checkpoint_json, g.lifecycle, g.journey_id, j.archived_at AS journey_archived_at
    FROM learn_activities a JOIN learn_goals g ON g.id = a.goal_id AND g.org = a.org AND g.owner_user_id = a.owner_user_id
    LEFT JOIN learning_journeys j ON j.id = g.journey_id
    WHERE a.id = ? AND a.org = ? AND a.owner_user_id = ? AND g.app = ? AND g.board = ?`)
    .bind(activityId, actor.org, actor.userId, actor.app, actor.board).first();
}

const ATTEMPT_COLS = 'id, goal_id, activity_id, activity_revision, submission_key, response_kind, content_json, content_hash, criterion_refs_json, source_refs_json, assistance, assistance_refs_json, submitted_at';
const byKey = (env, actor, key) => env.LEARN_DB.prepare(`SELECT ${ATTEMPT_COLS} FROM learn_attempts WHERE org = ? AND owner_user_id = ? AND submission_key = ?`)
  .bind(actor.org, actor.userId, key).first();
const operations = async (env, attemptId) => (await env.LEARN_DB.prepare('SELECT * FROM learn_assessments WHERE attempt_id = ? ORDER BY created_at, rowid').bind(attemptId).all()).results;
const handle = (attempt, op, replayed) => ({ attemptId: attempt.id, assessmentId: op.id, status: op.status, replayed });

/** Save one submission before anything evaluates it. @returns {Promise<{attemptId: string, assessmentId: string, status: string, replayed: boolean}>} */
export async function acceptAttempt(env, actor, submission, { now = () => new Date().toISOString() } = {}) {
  const shape = validateCoachingRecord('SubmitAttempt', submission);
  if (!shape.ok) throw invalid('invalid_submission', shape.errors.slice(0, 3));
  const { activityId, activityRevision, submissionKey, submittedContent: content, sourceRefs, assistanceRefs } = submission;
  if (!KEY.test(submissionKey)) throw invalid('invalid_submission', ['submissionKey: 8-128 letters, digits, _ or -']);
  if (sourceRefs.length > ATTEMPT_LIMITS.refs || assistanceRefs.length > ATTEMPT_LIMITS.refs) throw invalid('invalid_submission', [`at most ${ATTEMPT_LIMITS.refs} source and assistance refs`]);
  checkSize(content);
  const contentJson = canonical(content);
  const hash = await sha256Hex(canonical({ activityId, activityRevision, submittedContent: content, sourceRefs, assistanceRefs }));
  // Replay or conflict come first, so a retry still finds its attempt after the activity has moved on.
  const replay = async row => {
    if (row.content_hash !== hash) throw new AttemptError('submission_key_conflict', 409);
    return handle(row, (await operations(env, row.id)).at(-1), true);
  };
  const existing = await byKey(env, actor, submissionKey);
  if (existing) return replay(existing);

  const activity = await ownActivity(env, actor, activityId);
  if (!activity) throw new AttemptError('unknown_activity', 404);
  if (activity.lifecycle !== 'open' || activity.journey_archived_at) throw new AttemptError('goal_closed', 409);
  if (activity.revision !== activityRevision) throw new AttemptError('stale_activity', 409, { activityRevision: activity.revision });
  const kind = activity.response_kind;
  if (!isObj(content) || (CONTENT[kind] && !CONTENT[kind](content))) throw invalid('invalid_content', `a ${kind} answer needs ${kind === 'text' ? 'text' : kind === 'choice' ? 'optionId' : 'a JSON object'}`);
  // The criterion versions the activity names, frozen on the attempt; each must be one of the goal's criteria.
  const criterionRefs = JSON.parse(activity.criterion_refs_json);
  const known = new Set((await env.LEARN_DB.prepare('SELECT criterion_id, version FROM learn_goal_criteria WHERE goal_id = ?').bind(activity.goal_id).all())
    .results.map(r => `${r.criterion_id}@${r.version}`));
  if (criterionRefs.some(r => !known.has(`${r.criterionId}@${r.version}`))) throw new AttemptError('criteria_unavailable', 409);
  // An answer may name only sources the activity was created with. Their access was checked when the activity was made.
  const sourceKey = r => canonical({ kind: r.kind, id: r.id, version: r.version });
  const activityRefs = JSON.parse(activity.source_refs_json);
  const allowed = new Set(activityRefs.map(sourceKey));
  if (sourceRefs.some(r => !allowed.has(sourceKey(r)))) throw invalid('unknown_source');
  // A codebase answer is about the repository files its activity cites, at that commit (owner finding 5B). Those refs are the
  // server's own record, frozen on the attempt whatever the client names, so assessment and Progress read that revision.
  const bound = activityRefs.filter(isRepositorySource);
  // A repository ref the client names is a learner citation (owner brief 2026-10-21 "Selecting evidence"): it must be a file the
  // activity cites, with the same commit, path and whole-file hash, and lines inside the cited ones. The stored ref is built here
  // from the activity's own ref with the learner's narrower lines; nothing else the client sent is kept.
  const cited = [];
  for (const ref of sourceRefs.filter(r => r.kind === REPOSITORY_SOURCE)) {
    const made = citationRef(bound, ref);
    if (!made) throw invalid('invalid_citation');
    if (cited.some(c => citationsOverlap(c, made))) throw invalid('overlapping_citations');
    cited.push(made);
  }
  if (cited.length > CITATION_MAX) throw invalid('too_many_citations', [`at most ${CITATION_MAX} citations`]);
  const frozen = [...bound, ...cited, ...sourceRefs.filter(r => r.kind !== REPOSITORY_SOURCE)];
  // Known help is the help the learner reports plus the help the activity's checkpoint records. The checkpoint is the
  // server's own record, so it cannot be dropped by the client. Any help makes the attempt assisted.
  const checkpoint = activity.checkpoint_json ? JSON.parse(activity.checkpoint_json) : null;
  const recorded = Array.isArray(checkpoint?.assistanceRefs) ? checkpoint.assistanceRefs.filter(r => typeof r === 'string' && r.length > 0 && r.length <= 200) : [];
  const help = [...new Set([...assistanceRefs, ...recorded])];

  const attemptId = `at_${crypto.randomUUID()}`, assessmentId = `as_${crypto.randomUUID()}`, at = now();
  await env.LEARN_DB.batch([
    env.LEARN_DB.prepare(`INSERT INTO learn_attempts (id, org, owner_user_id, app, board, goal_id, activity_id, activity_revision, submission_key, response_kind,
        content_json, content_hash, criterion_refs_json, source_refs_json, assistance, assistance_refs_json, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (org, owner_user_id, submission_key) DO NOTHING`)
      .bind(attemptId, actor.org, actor.userId, actor.app, actor.board, activity.goal_id, activityId, activityRevision, submissionKey, kind,
        contentJson, hash, JSON.stringify(criterionRefs), canonical(frozen), help.length ? 'assisted' : 'none', JSON.stringify(help), at),
    // The operation is written only with the attempt this request inserted.
    env.LEARN_DB.prepare(`INSERT INTO learn_assessments (id, attempt_id, org, owner_user_id, request_key, status, created_at, updated_at)
      SELECT ?, ?, ?, ?, 'submit', 'pending', ?, ? WHERE EXISTS (SELECT 1 FROM learn_attempts WHERE id = ?)`)
      .bind(assessmentId, attemptId, actor.org, actor.userId, at, at, attemptId),
  ]);
  const saved = await byKey(env, actor, submissionKey);
  if (!saved) throw new Error('attempt not saved');
  // A concurrent request with the same key won the insert: replay its attempt, or report a conflict.
  if (saved.id !== attemptId) return replay(saved);
  return { attemptId, assessmentId, status: 'pending', replayed: false };
}

const attemptOf = r => ({
  attemptId: r.id, goalId: r.goal_id, activityId: r.activity_id, activityRevision: r.activity_revision, responseKind: r.response_kind,
  submittedContent: JSON.parse(r.content_json), contentHash: r.content_hash, criterionRefs: JSON.parse(r.criterion_refs_json),
  sourceRefs: JSON.parse(r.source_refs_json), assistance: r.assistance, assistanceRefs: JSON.parse(r.assistance_refs_json), submittedAt: r.submitted_at,
});
// An observation row as the Task 01 contract's Observation. The operation's status and supersedes link are projected onto
// it, so deriveCriterionSummary can drop pending, failed and superseded evidence.
export const observationOf = (r, op) => ({
  observationId: r.id, attemptId: r.attempt_id, assessmentId: r.assessment_id, assessmentStatus: op.status,
  criterionId: r.criterion_id, criterionVersion: r.criterion_version, fit: r.fit, reasoning: r.reasoning, assistance: r.assistance,
  validity: r.validity, conflict: r.conflict === 1, application: r.application,
  ...(r.retention_of ? { retentionOf: r.retention_of } : {}), ...(op.supersedes_assessment_id ? { supersedesAssessmentId: op.supersedes_assessment_id } : {}),
  observedAt: r.observed_at, ...(r.reason ? { reason: r.reason } : {}),
});
const recordOf = (op, rows) => ({
  assessmentId: op.id, attemptId: op.attempt_id, status: op.status, observations: rows.map(r => observationOf(r, op)),
  ...(op.rubric_version ? { rubricVersion: op.rubric_version } : {}), provenance: JSON.parse(op.provenance_json),
  ...(op.supersedes_assessment_id ? { supersedesAssessmentId: op.supersedes_assessment_id } : {}),
  route: op.route ?? null, reason: op.reason ?? null, createdAt: op.created_at, updatedAt: op.updated_at,
});

// Reconciliation: an operation still pending past CLAIM_TTL_MS gets a terminal status, and nothing re-dispatches it.
//   * claimed: a call may have been made, and its completion is unknown;
//   * unclaimed: no call was made, so it failed before dispatch.
async function reconcile(env, ops, nowMs) {
  const stale = ops.filter(op => op.status === 'pending' && Date.parse(op.claimed_at ?? op.created_at) < nowMs - CLAIM_TTL_MS);
  if (!stale.length) return false;
  const at = new Date(nowMs).toISOString();
  await env.LEARN_DB.batch(stale.map(op => op.claim_token
    ? env.LEARN_DB.prepare("UPDATE learn_assessments SET status = 'unknown', reason = 'completion_unknown', updated_at = ? WHERE id = ? AND status = 'pending' AND claim_token = ?").bind(at, op.id, op.claim_token)
    : env.LEARN_DB.prepare("UPDATE learn_assessments SET status = 'failed', reason = 'not_dispatched', updated_at = ? WHERE id = ? AND status = 'pending' AND claim_token IS NULL").bind(at, op.id)));
  return true;
}

/** The learner's own attempt on this canvas with every assessment of it, oldest first; `assessment` is the latest. */
export async function readAttempt(env, actor, attemptId, { now = () => Date.now() } = {}) {
  const row = typeof attemptId === 'string' && attemptId.length <= 200
    ? await env.LEARN_DB.prepare(`SELECT ${ATTEMPT_COLS} FROM learn_attempts WHERE id = ? AND org = ? AND owner_user_id = ? AND app = ? AND board = ?`)
      .bind(attemptId, actor.org, actor.userId, actor.app, actor.board).first()
    : null;
  if (!row) throw new AttemptError('unknown_attempt', 404);
  let ops = await operations(env, row.id);
  if (await reconcile(env, ops, now())) ops = await operations(env, row.id);
  const rows = (await env.LEARN_DB.prepare('SELECT * FROM learn_observations WHERE attempt_id = ? ORDER BY observed_at, rowid').bind(row.id).all()).results;
  const assessments = ops.map(op => recordOf(op, rows.filter(r => r.assessment_id === op.id)));
  return { attempt: attemptOf(row), assessment: assessments.at(-1), assessments };
}

/**
 * A deliberate reassessment: a new operation that supersedes the last completed one. The same requestKey replays it.
 * dispute (Task 10, "Question this feedback"): the learner questions that completed judgment. Its observations keep every
 * finding and are labelled 'disputed' (Progress: Needs review) in the same batch as the new operation, and only with it; the
 * review's completed result then supersedes them, and an unavailable or failed review leaves them disputed.
 */
export async function requestReassessment(env, actor, attemptId, requestKey, { now = () => new Date().toISOString(), dispute = false } = {}) {
  if (typeof requestKey !== 'string' || !KEY.test(requestKey)) throw invalid('invalid_request_key');
  const { attempt, assessments } = await readAttempt(env, actor, attemptId);
  const key = `reassess:${requestKey}`;
  const find = async () => env.LEARN_DB.prepare('SELECT * FROM learn_assessments WHERE attempt_id = ? AND request_key = ?').bind(attempt.attemptId, key).first();
  const mine = await find();
  if (mine) return handle({ id: attempt.attemptId }, mine, true);
  if (assessments.at(-1).status === 'pending') throw new AttemptError('assessment_in_progress', 409);
  const supersedes = assessments.findLast(a => a.status === 'completed')?.assessmentId ?? null;
  const id = `as_${crypto.randomUUID()}`, at = now();
  // Never two pending operations on one attempt: a concurrent reassessment under another key inserts nothing.
  await env.LEARN_DB.batch([
    env.LEARN_DB.prepare(`INSERT INTO learn_assessments (id, attempt_id, org, owner_user_id, request_key, status, supersedes_assessment_id, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, 'pending', ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM learn_assessments WHERE attempt_id = ? AND status = 'pending')
      ON CONFLICT (attempt_id, request_key) DO NOTHING`)
      .bind(id, attempt.attemptId, actor.org, actor.userId, key, supersedes, at, at, attempt.attemptId),
    ...(dispute && supersedes ? [env.LEARN_DB.prepare(`UPDATE learn_observations SET validity = 'disputed'
      WHERE assessment_id = ? AND validity = 'valid' AND EXISTS (SELECT 1 FROM learn_assessments WHERE id = ?)`).bind(supersedes, id)] : []),
  ]);
  const op = await find();
  if (!op) throw new AttemptError('assessment_in_progress', 409);
  return handle({ id: attempt.attemptId }, op, op.id !== id);
}

// The newest operation of this attempt that is pending and unclaimed: the only kind a dispatch may claim.
export async function pendingOperation(env, actor, attemptId) {
  return env.LEARN_DB.prepare(`SELECT o.* FROM learn_assessments o JOIN learn_attempts a ON a.id = o.attempt_id
    WHERE o.attempt_id = ? AND o.org = ? AND o.owner_user_id = ? AND a.app = ? AND a.board = ? AND o.status = 'pending' AND o.claim_token IS NULL
    ORDER BY o.created_at DESC, o.rowid DESC LIMIT 1`).bind(attemptId, actor.org, actor.userId, actor.app, actor.board).first();
}

/** One atomic claim per operation. Only the holder of the returned token may dispatch an evaluator; null means not this caller. */
export async function claimAssessment(env, actor, assessmentId, { now = () => new Date().toISOString() } = {}) {
  const token = crypto.randomUUID(), at = now();
  const result = await env.LEARN_DB.prepare(`UPDATE learn_assessments SET claim_token = ?, claimed_at = ?, updated_at = ?
    WHERE id = ? AND org = ? AND owner_user_id = ? AND status = 'pending' AND claim_token IS NULL`)
    .bind(token, at, at, assessmentId, actor.org, actor.userId).run();
  return result.meta?.changes === 1 ? token : null;
}

const TERMINAL = ['completed', 'unavailable', 'failed', 'unknown'];
/**
 * The result of a claimed operation, in one batch.
 *   * The observations go in first, each guarded by the claim. The status update goes last.
 *   * A claim that was reconciled in the meantime writes nothing.
 *   * Observations are validated against the Task 01 contract first. An invalid set is saved as 'failed'
 *     (invalid_observations) with no observation.
 *   * Only a completed operation carries observations.
 * @returns {Promise<boolean>} whether this commit was saved
 */
export async function commitAssessment(env, actor, { assessmentId, token, attemptId, goalId, status, route = null, reason = null, rubricVersion = null, evaluatorVersion = null, provenance = {}, observations = [] }, { now = () => new Date().toISOString() } = {}) {
  if (!TERMINAL.includes(status)) throw new Error(`commitAssessment: ${status} is not a final status`);
  const at = now();
  let rows = status === 'completed' ? observations.map(o => ({ ...o, observationId: `ob_${crypto.randomUUID()}`, attemptId, assessmentId, assessmentStatus: status, observedAt: at })) : [];
  if (rows.some(o => !validateCoachingRecord('Observation', o).ok)) {
    ({ status, reason, rows } = { status: 'failed', reason: 'invalid_observations', rows: [] });
  }
  const guard = "EXISTS (SELECT 1 FROM learn_assessments WHERE id = ? AND claim_token = ? AND status = 'pending')";
  const statements = rows.map(o => env.LEARN_DB.prepare(`INSERT INTO learn_observations (id, assessment_id, attempt_id, org, owner_user_id, goal_id, criterion_id, criterion_version,
      fit, reasoning, assistance, validity, conflict, application, retention_of, reason, observed_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard}`)
    .bind(o.observationId, assessmentId, attemptId, actor.org, actor.userId, goalId, o.criterionId, o.criterionVersion, o.fit, o.reasoning, o.assistance,
      o.validity, o.conflict ? 1 : 0, o.application ?? 'not_assessed', o.retentionOf ?? null, o.reason ?? null, at, assessmentId, token));
  statements.push(env.LEARN_DB.prepare(`UPDATE learn_assessments SET status = ?, route = ?, reason = ?, rubric_version = ?, evaluator_version = ?, provenance_json = ?, updated_at = ?
    WHERE id = ? AND claim_token = ? AND status = 'pending'`)
    .bind(status, route, reason, rubricVersion, evaluatorVersion, JSON.stringify(provenance), at, assessmentId, token));
  const results = await env.LEARN_DB.batch(statements);
  return results.at(-1).meta?.changes === 1;
}

/**
 * Task 08's input: every observation the learner has for one goal, as contract Observations, plus the ids of the goal's
 * assessments still pending. The goal must be on this canvas.
 *   * Pending, failed, unknown and superseded evidence stay in the list. deriveCriterionSummary drops them.
 *   * The list is not filtered by criterion version. The caller derives per version.
 */
export async function goalEvidence(env, actor, goalId) {
  const scope = [goalId, actor.org, actor.userId, actor.app, actor.board];
  const [rows, ops] = await Promise.all([
    env.LEARN_DB.prepare(`SELECT o.*, s.status AS op_status, s.supersedes_assessment_id AS op_supersedes FROM learn_observations o
      JOIN learn_assessments s ON s.id = o.assessment_id JOIN learn_attempts a ON a.id = o.attempt_id
      WHERE o.goal_id = ? AND o.org = ? AND o.owner_user_id = ? AND a.app = ? AND a.board = ? ORDER BY o.observed_at, o.rowid`).bind(...scope).all(),
    env.LEARN_DB.prepare(`SELECT s.id FROM learn_assessments s JOIN learn_attempts a ON a.id = s.attempt_id
      WHERE a.goal_id = ? AND a.org = ? AND a.owner_user_id = ? AND a.app = ? AND a.board = ? AND s.status = 'pending' ORDER BY s.created_at, s.rowid`).bind(...scope).all(),
  ]);
  return {
    observations: rows.results.map(r => observationOf(r, { status: r.op_status, supersedes_assessment_id: r.op_supersedes })),
    pendingAssessments: ops.results.map(r => r.id),
  };
}

