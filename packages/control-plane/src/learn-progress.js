// packages/control-plane/src/learn-progress.js
// A learner's Progress for one goal (C:/s/spec/tutor-workflow/draft.md Task 08 and "How progress is recorded and shown";
// integrator rulings Q1 and Q2, 2026-10-20). A derived read model: every read recomputes each criterion's status from the
// goal's criteria and its confirmed observations with Task 01's deriveCriterionSummary. Nothing is stored or cached, so
// a correction, a revocation or a deletion shows on the next read. No model call is reachable from here.
//   readProgress(env, actor, {goalId, scopeVersion?}, {store, canReadSource}) -> ProgressView
//   GET /api/learn/progress?app=&board=&goalId=&scopeVersion= -> { progress: ProgressView }
//       400 bad request, 404 unknown_goal | unknown_scope | canvas_in_trash, 503 progress_unavailable (never an empty view)
//
// store is the adapter onto the coaching tables (learn 0025, lane T1) and the attempt tables (learn 0026, lane T3). Each
// method reads only the actor's own rows and throws when a read fails:
//   goal(env, actor, goalId)          -> {goalId, org, userId, app, board, scopeVersion, revision, updatedAt} | null
//   criteria(env, actor, goalId, sv)  -> Criterion[] of that scope version in display order ([] without rows).
//                                        A criterion may carry requiresTransfer: true (Q1).
//   evidence(env, actor, goalId)      -> { assessments: [{assessmentId, attemptId, status, updatedAt}],
//                                          observations: Observation[] of this goal (assessmentStatus and
//                                            supersedesAssessmentId come from its assessment),
//                                          attempts: [{attemptId, submittedAt, sourceRefs, excerpt?}] }
// canReadSource(ref) -> boolean is the reader's access to one SourceRef now, asked on every read.
import { CRITERION_STATUS, DERIVATION_VERSION, deriveCriterionSummary, validateCoachingRecord } from '../../web/src/learn-coaching-contract.js';
import { authorizedBoardApp } from './learn-board.js';
import { NO_TRASHED_ANCESTOR, ownerRow } from './learn-boards.js';
import { authorizeFileSource } from './file-access.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { readableVersion } from './repositories.js';
import { REPOSITORY_SOURCE } from '../../web/src/learn-codebase-goals.js';

export class ProgressError extends Error {
  constructor(code, status) { super(`progress: ${code}`); this.name = 'ProgressError'; this.code = code; this.status = status; }
}

// The store on LEARN_DB: learn 0025 goals and criteria (tutor/core) and learn 0026 attempts, assessments and observations
// (tutor/assess, column names as of its 22:39 PT draft). Every read is scoped to the actor; a missing table throws, so the
// route answers 503 until learn 0026 is applied, never an empty history.
const SCOPED = 'org = ? AND owner_user_id = ? AND app = ? AND board = ?';
const scoped = actor => [actor.org, actor.userId, actor.app, actor.board];
const EXCERPT = 280;
export const progressStore = {
  async goal(env, actor, goalId) {
    const g = await env.LEARN_DB.prepare(`SELECT * FROM learn_goals WHERE id = ? AND ${SCOPED}`).bind(goalId, ...scoped(actor)).first();
    return g && { goalId: g.id, org: g.org, userId: g.owner_user_id, app: g.app, board: g.board, scopeVersion: g.scope_version, revision: g.revision, updatedAt: g.updated_at };
  },
  // Every scope version up to the current one exists (0 holds no criteria), so a version with no rows is an empty list.
  async criteria(env, actor, goalId, scopeVersion) {
    const { results } = await env.LEARN_DB.prepare(`SELECT c.* FROM learn_goal_criteria c JOIN learn_goals g ON g.id = c.goal_id
      WHERE c.goal_id = ? AND c.scope_version = ? AND g.org = ? AND g.owner_user_id = ? AND g.app = ? AND g.board = ? ORDER BY c.position`).bind(goalId, scopeVersion, ...scoped(actor)).all();
    return results.map(r => ({
      criterionId: r.criterion_id, version: r.version, label: r.label, requirement: r.requirement, requiresReasoning: r.requires_reasoning === 1,
      requiresTransfer: r.requires_transfer === 1, rubricVersion: r.rubric_version, ...(r.skill_key ? { skillKey: r.skill_key } : {}),
    }));
  },
  async evidence(env, actor, goalId) {
    const at = [goalId, ...scoped(actor)];
    const [attempts, assessments, observations] = await Promise.all([
      env.LEARN_DB.prepare(`SELECT id, response_kind, content_json, source_refs_json, submitted_at FROM learn_attempts WHERE goal_id = ? AND ${SCOPED}`).bind(...at).all(),
      env.LEARN_DB.prepare(`SELECT s.id, s.attempt_id, s.status, s.supersedes_assessment_id, s.updated_at FROM learn_assessments s JOIN learn_attempts a ON a.id = s.attempt_id
        WHERE a.goal_id = ? AND a.org = ? AND a.owner_user_id = ? AND a.app = ? AND a.board = ? ORDER BY s.created_at, s.rowid`).bind(...at).all(),
      // By goal: readProgress keeps only observations whose attempt is in the scoped list above.
      env.LEARN_DB.prepare('SELECT * FROM learn_observations WHERE goal_id = ? AND org = ? AND owner_user_id = ? ORDER BY observed_at, rowid').bind(goalId, actor.org, actor.userId).all(),
    ]);
    const op = new Map(assessments.results.map(s => [s.id, s]));
    return {
      attempts: attempts.results.map(a => {
        const content = JSON.parse(a.content_json);
        return { attemptId: a.id, submittedAt: a.submitted_at, sourceRefs: JSON.parse(a.source_refs_json),
          excerpt: a.response_kind === 'text' && typeof content?.text === 'string' ? content.text.slice(0, EXCERPT) : null };
      }),
      assessments: assessments.results.map(s => ({ assessmentId: s.id, attemptId: s.attempt_id, status: s.status, updatedAt: s.updated_at })),
      observations: observations.results.filter(o => op.has(o.assessment_id)).map(o => ({
        observationId: o.id, attemptId: o.attempt_id, assessmentId: o.assessment_id, assessmentStatus: op.get(o.assessment_id).status,
        criterionId: o.criterion_id, criterionVersion: o.criterion_version, fit: o.fit, reasoning: o.reasoning, assistance: o.assistance,
        validity: o.validity, conflict: o.conflict === 1, application: o.application, observedAt: o.observed_at,
        ...(o.retention_of ? { retentionOf: o.retention_of } : {}), ...(o.reason ? { reason: o.reason } : {}),
        ...(op.get(o.assessment_id).supersedes_assessment_id ? { supersedesAssessmentId: op.get(o.assessment_id).supersedes_assessment_id } : {}),
      })),
    };
  },
};

const PENDING = new Set(['pending', 'unknown']); // unknown completion is still being reconciled: not a result yet
const UNAVAILABLE = new Set(['unavailable', 'failed']);

// Q2: a canvas in Trash, or a Rabbit Hole under one, keeps its evidence but shows none of it until Restore. A purged
// canvas has no row, and its evidence is deleted with it.
const canvasVisible = async (env, actor) => !!(await env.LEARN_DB
  .prepare(`SELECT 1 FROM (SELECT org, name AS app, owner_email FROM canvases WHERE org = ? AND name = ?) b WHERE ${NO_TRASHED_ANCESTOR}`)
  .bind(actor.org, actor.app).first());

// An identity for the summary's inputs (FNV-1a): a progress question names it, and a different value means newer evidence.
const revisionOf = text => { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0; return h; };

/** @returns {Promise<object>} ProgressView: goalRef, summaryRevision, derivationVersion, criteria, counts, pendingAssessments, savedAt */
export async function readProgress(env, actor, { goalId, scopeVersion } = {}, { store = progressStore, canReadSource = async () => false } = {}) {
  if (!validateCoachingRecord('ActorScope', actor).ok) throw new ProgressError('invalid_actor', 400);
  if (typeof goalId !== 'string' || !goalId || goalId.length > 200) throw new ProgressError('goalId_required', 400);
  if (scopeVersion != null && !(Number.isInteger(scopeVersion) && scopeVersion >= 0)) throw new ProgressError('invalid_scopeVersion', 400);
  if (!(await canvasVisible(env, actor))) throw new ProgressError('canvas_in_trash', 404);
  const goal = await store.goal(env, actor, goalId);
  // Another learner's goal, another canvas's or a made-up id all read as missing. The owner is rechecked here, not trusted.
  if (!goal || goal.goalId !== goalId || ['org', 'userId', 'app', 'board'].some(k => goal[k] !== actor[k])) throw new ProgressError('unknown_goal', 404);
  const scope = scopeVersion ?? goal.scopeVersion;
  const criteria = scope <= goal.scopeVersion ? await store.criteria(env, actor, goalId, scope) : null;
  if (!criteria) throw new ProgressError('unknown_scope', 404);
  const { assessments = [], observations = [], attempts = [] } = await store.evidence(env, actor, goalId);

  const attemptOf = new Map(attempts.map(a => [a.attemptId, a]));
  // Confirmed evidence only: completed processing of an attempt that still exists. Pending, unknown, unavailable or failed
  // work never replaces or supersedes it, and a deleted attempt takes its observations with it.
  const confirmed = observations.filter(o => o?.assessmentStatus === 'completed' && attemptOf.has(o.attemptId) && validateCoachingRecord('Observation', o).ok);
  const replaced = new Set(confirmed.map(o => o.supersedesAssessmentId).filter(Boolean));
  const checked = new Map();
  const readable = ref => {
    const key = `${ref?.kind}\n${ref?.id}`;
    if (!checked.has(key)) checked.set(key, Promise.resolve().then(() => canReadSource(ref)).then(ok => ok === true, () => false));
    return checked.get(key);
  };
  const item = async o => {
    const attempt = attemptOf.get(o.attemptId), refs = Array.isArray(attempt.sourceRefs) ? attempt.sourceRefs : [];
    const open = await Promise.all(refs.map(readable)), withheld = open.includes(false);
    return {
      observationId: o.observationId, attemptId: o.attemptId, assessmentId: o.assessmentId, observedAt: o.observedAt, submittedAt: attempt.submittedAt ?? null,
      fit: o.fit, reasoning: o.reasoning, assistance: o.assistance, application: o.application ?? 'not_assessed', retentionOf: o.retentionOf ?? null,
      validity: replaced.has(o.assessmentId) ? 'superseded' : o.validity, conflict: o.conflict === true,
      // A source the learner can no longer read takes its words with it: the observation stays, its content does not.
      sources: refs.map((r, i) => (open[i] ? { kind: r.kind, id: r.id, version: r.version, ...(r.locator ? { locator: r.locator } : {}) } : { kind: String(r?.kind), available: false })),
      excerpt: withheld ? null : attempt.excerpt ?? null, reason: withheld ? null : o.reason ?? null, ...(withheld ? { withheld: 'source_unavailable' } : {}),
    };
  };

  const byStatus = Object.fromEntries(CRITERION_STATUS.map(s => [s, 0]));
  const rows = [];
  for (const criterion of criteria) {
    const s = deriveCriterionSummary({ criterion, observations: confirmed }); // with the contract's Q1 transfer gate
    byStatus[s.status] += 1;
    const seen = new Set();
    const history = confirmed.filter(o => o.criterionId === criterion.criterionId && o.criterionVersion === criterion.version && !seen.has(o.observationId) && seen.add(o.observationId))
      .sort((a, b) => (a.observedAt < b.observedAt ? -1 : a.observedAt > b.observedAt ? 1 : 0));
    rows.push({
      criterionId: criterion.criterionId, version: criterion.version, label: criterion.label, requirement: criterion.requirement,
      requiresReasoning: criterion.requiresReasoning, requiresTransfer: criterion.requiresTransfer === true,
      status: s.status, reason: s.reason, evidenceIds: s.evidenceIds, application: s.application, retention: s.retention,
      evidence: await Promise.all(history.map(item)),
    });
  }
  const live = assessments.filter(a => attemptOf.has(a.attemptId));
  const view = {
    goalRef: { goalId, scopeVersion: scope }, currentScopeVersion: goal.scopeVersion,
    summaryRevision: revisionOf(JSON.stringify([goal.revision, scope, rows.map(r => [r.criterionId, r.version, r.status, r.evidence.map(e => [e.observationId, e.validity])])])),
    derivationVersion: DERIVATION_VERSION, criteria: rows,
    // Each agreed criterion counts once. A goal with no agreed criteria has no denominator, not "0 of 0".
    counts: rows.length ? { total: rows.length, ...byStatus } : {},
    pendingAssessments: live.filter(a => PENDING.has(a.status)).map(a => a.assessmentId),
    unavailableAssessments: live.filter(a => UNAVAILABLE.has(a.status)).map(a => a.assessmentId),
  };
  const savedAt = [goal.updatedAt, ...live.filter(a => a.status === 'completed').map(a => a.updatedAt)].filter(Boolean).sort().at(-1);
  if (savedAt) view.savedAt = savedAt;
  const valid = validateCoachingRecord('ProgressView', view);
  if (!valid.ok) throw new Error(`progress view failed its contract: ${valid.errors.slice(0, 3).join('; ')}`);
  return view;
}

// The reader's current access to a source an attempt was bound to. A card is on this learner's own canvas, which the
// route has just authorized. An imported file reads for its owner, or through this canvas's own board while that board
// still references it (file-access.js). shortcut: every other kind reads as unavailable (its content withheld) until the
// lane that introduces it adds its check here.
export const sourceReader = (req, env, access, actor) => async ref => {
  if (ref?.kind === 'card') return true;
  // A codebase source (Task 12): readable while its repository version is (confirmed public, or the learner's own import).
  if (ref?.kind === REPOSITORY_SOURCE) return !!(await readableVersion(env, { org: access.org, email: access.email }, String(ref.id).split(':')[0], ref.version));
  if (ref?.kind !== 'file') return false;
  if (!((await authorizeFileSource(req, env, ref.id)) instanceof Response)) return true;
  const row = await ownerRow(env, access, actor.app, actor.board);
  return !!row && !((await authorizeFileSource(req, env, ref.id, { row })) instanceof Response);
};

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const BOARD = /^[A-Za-z0-9 _.-]{1,100}$/; // learn-boards.js board names

// Only the signed-in learner's own Progress, resolved as the coaching and journey routes resolve it: an app they may open,
// a canvas, the account's users.id (never an email, never from the query). deps.store replaces the store in tests.
export async function progressRoute(path, req, env, deps = {}) {
  if (path !== '/api/learn/progress') return null;
  if (req.method !== 'GET') return json({ error: 'GET required' }, 405);
  const query = new URL(req.url).searchParams, app = query.get('app'), board = query.get('board');
  const access = await (deps.authorize || authorizedBoardApp)(req, env, app, null);
  if (access instanceof Response) return access;
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  const ownerRefused = subscriptionOwnerRefusal(env, access);
  if (ownerRefused) return ownerRefused;
  if (typeof board !== 'string' || !BOARD.test(board)) return json({ error: 'Board name must be 1-100 letters, digits, spaces, dots, dashes or underscores' }, 400);
  if (access.kind !== 'canvas') return json({ error: 'progress_on_canvases_only' }, 400);
  if (!access.user_id) return json({ error: 'identity_unavailable' }, 401);
  const raw = query.get('scopeVersion');
  const scopeVersion = raw == null || raw === '' ? undefined : /^\d{1,9}$/.test(raw) ? Number(raw) : NaN;
  const actor = { org: access.org, userId: access.user_id, app, board };
  try {
    const progress = await readProgress(env, actor, { goalId: query.get('goalId'), scopeVersion }, { store: deps.store || progressStore, canReadSource: sourceReader(req, env, access, actor) });
    return json({ progress });
  } catch (error) {
    if (error instanceof ProgressError) return json({ error: error.code }, error.status);
    // ids only, never learner text or the account id
    console.error(JSON.stringify({ event: 'learn_progress_error', app, error: error?.name || 'Error', message: String(error?.message || '').slice(0, 120) }));
    return json({ error: 'progress_unavailable' }, 503);
  }
}
