// R4 State (checklist R4.02, R4.07, R4.11, R4.12 backend): durable roadmap records and replay-safe actions over learn-migrations/0039-roadmap-core.sql.
// Every mutation is one guarded D1 batch: the winning action writes a receipt row (learn_roadmap_actions) and every other statement in the batch
// is guarded by that receipt, so a stale or losing action writes nothing. A repeat of a recorded action returns its recorded outcome; the same
// key with a different payload, or a stale revision, is a 409 carrying the current state. Server ids only: a client id is never proof of access.
import { BLIND_RETRY_FORBIDDEN, DEPTHS, StateError, canAcceptProposal, canDeliver, canTransition, conflictReply, entitledRoadmapResult, resolveAction, validateAccess, isUnfinishedRoadmap } from './roadmap-contract.js';
import { ROADMAP_LIMITS, ROADMAP_POLICY_VERSION, ceilingFor } from './roadmap-policy.js';
import { admitStepAuthorization, newId, refundCardStatements, releaseStepAllocation, sha256, failureWillRetry } from './roadmap-money.js';

const nowSeconds = () => Math.floor(Date.now() / 1000);
const KEY = /^[A-Za-z0-9_-]{8,128}$/;
const scopeOf = access => [access.org, access.actorUserId, access.boardId];
const SCOPE_SQL = 'org = ? AND owner_user_id = ? AND board_id = ?';

export function requireAccess(access) {
  const ok = validateAccess(access);
  if (!ok.ok) throw new StateError('forbidden', 'Not available', 403);
  return access;
}
export function requireKey(actionKey) {
  if (typeof actionKey !== 'string' || !KEY.test(actionKey)) throw new StateError('invalid_request', 'actionKey is required', 400);
  return actionKey;
}

// Access is rechecked at accept, generation, delivery and resume (v1.4 4.1): the board must still belong to the actor. A revoked owner stops new work
// and charges and keeps the audit rows. R14 replaces this owner test with a membership check.
export async function accessStillValid(db, access) {
  if (!validateAccess(access).ok) return false;
  return !!(await db.prepare("SELECT 1 AS ok FROM learn_boards WHERE id = ? AND org = ? AND owner_email = ?").bind(access.boardId, access.org, access.boardOwnerEmail).first());
}

// --- reads (always scoped: org, owner, board) ----------------------------------------------------------------------------------------
export const readRoadmap = (db, access, roadmapId) => db.prepare(`SELECT * FROM learn_roadmaps WHERE id = ? AND ${SCOPE_SQL}`).bind(roadmapId, ...scopeOf(access)).first();
export const readUnfinishedRoadmap = (db, access) => db.prepare(`SELECT * FROM learn_roadmaps WHERE ${SCOPE_SQL} AND state IN ('draft', 'questioning', 'proposed', 'active', 'paused') ORDER BY created_at DESC LIMIT 1`).bind(...scopeOf(access)).first();
const readProposal = (db, access, proposalId) => db.prepare(`SELECT * FROM learn_step_proposals WHERE id = ? AND ${SCOPE_SQL}`).bind(proposalId, ...scopeOf(access)).first();
const readResult = (db, access, resultId) => db.prepare(`SELECT * FROM learn_step_results WHERE id = ? AND ${SCOPE_SQL}`).bind(resultId, ...scopeOf(access)).first();

// The conflict reply of a stale action (api.md 8): the current revision and the current offered proposal's version.
async function currentConflict(db, access, roadmapId, code = 'stale_revision') {
  const roadmap = roadmapId ? await readRoadmap(db, access, roadmapId) : null;
  const offered = roadmap ? await db.prepare("SELECT version FROM learn_step_proposals WHERE roadmap_id = ? AND state IN ('checking', 'held', 'pending', 'accepted') ORDER BY created_at DESC LIMIT 1").bind(roadmapId).first() : null;
  return Object.assign(new StateError(code, 'This changed since you last looked.', 409), { reply: conflictReply({ code, currentRevision: roadmap?.revision ?? null, currentProposalVersion: offered?.version ?? null }) });
}

// --- R4.02: applyRoadmapAction ------------------------------------------------------------------------------------------------------
// operation: the action name. parts: ids and versions that identify the target (part of the fingerprint). guard: extra receipt conditions
// { sql, binds }. statements(r): the writes, each ending `AND ${r.and}` with `...r.binds`. outcome: { status, body } recorded for replays.
// bump: false for actions that do not change the roadmap row (default: revision + 1 when a roadmapId is given).
// -> { status, body, replayed }. Throws StateError (409 carries .reply).
export async function applyRoadmapAction(db, access, { operation, actionKey, roadmapId = null, expectedRevision = null, parts = [], guard = null, statements, outcome, bump = true, uniqueCode = null, now = nowSeconds() }) {
  requireAccess(access); requireKey(actionKey);
  const fingerprint = await sha256([access.actorUserId, operation, roadmapId, ...parts].join('|'));
  const recordedRow = () => db.prepare('SELECT fingerprint, outcome_status, outcome_json FROM learn_roadmap_actions WHERE org = ? AND owner_user_id = ? AND action_key = ?').bind(access.org, access.actorUserId, actionKey).first();
  const replay = row => ({ status: row.outcome_status, body: JSON.parse(row.outcome_json), replayed: true });
  let current = null;
  if (roadmapId) {
    current = await readRoadmap(db, access, roadmapId);
    if (!current) throw new StateError('not_found', 'Not available', 404);
  }
  const recorded = await recordedRow();
  const decided = resolveAction({ recorded: recorded && { fingerprint: recorded.fingerprint, outcome: recorded }, fingerprint, expectedRevision: roadmapId ? expectedRevision : 0, currentRevision: roadmapId ? current.revision : 0 });
  if (decided.kind === 'replay') return replay(recorded);
  if (decided.kind === 'conflict') throw await currentConflict(db, access, roadmapId, decided.code);

  const token = crypto.randomUUID();
  const r = { and: 'EXISTS (SELECT 1 FROM learn_roadmap_actions WHERE org = ? AND owner_user_id = ? AND action_key = ? AND token = ?)', binds: [access.org, access.actorUserId, actionKey, token] };
  const where = [];
  const binds = [];
  if (roadmapId) { where.push(`(SELECT revision FROM learn_roadmaps WHERE id = ? AND ${SCOPE_SQL}) = ?`); binds.push(roadmapId, ...scopeOf(access), expectedRevision); }
  if (guard) { where.push(guard.sql); binds.push(...guard.binds); }
  const receipt = db.prepare(`INSERT INTO learn_roadmap_actions (org, owner_user_id, action_key, roadmap_id, operation, fingerprint, token, expected_versions_json, outcome_status, outcome_json, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`)
    .bind(access.org, access.actorUserId, actionKey, roadmapId, operation, fingerprint, token, JSON.stringify({ revision: expectedRevision, parts }), outcome.status, JSON.stringify(outcome.body), now, ...binds);
  const bumpStatement = roadmapId && bump ? [db.prepare(`UPDATE learn_roadmaps SET revision = revision + 1, updated_at = ? WHERE id = ? AND ${SCOPE_SQL} AND ${r.and}`).bind(now, roadmapId, ...scopeOf(access), ...r.binds)] : [];
  try {
    await db.batch([receipt, ...statements(r), ...bumpStatement]);
  } catch (error) {
    // A concurrent identical action committed first: its recorded outcome is the answer. Otherwise a unique index refused (second unfinished roadmap).
    const winner = await recordedRow();
    if (winner && winner.fingerprint === fingerprint) return replay(winner);
    if (winner) throw await currentConflict(db, access, roadmapId, 'action_key_reused');
    if (uniqueCode && /UNIQUE/i.test(String(error?.message))) throw Object.assign(new StateError(uniqueCode, 'This already exists.', 409), { reply: conflictReply({ code: uniqueCode, currentRevision: null }) });
    throw error;
  }
  const won = await db.prepare('SELECT 1 AS ok FROM learn_roadmap_actions WHERE org = ? AND owner_user_id = ? AND action_key = ? AND token = ?').bind(access.org, access.actorUserId, actionKey, token).first();
  if (won) return { status: outcome.status, body: outcome.body, replayed: false };
  // The receipt guard failed: stale revision or a precondition that changed. Report the current state.
  const winner = await recordedRow();
  if (winner && winner.fingerprint === fingerprint) return replay(winner);
  throw await currentConflict(db, access, roadmapId);
}

// R5: the recorded outcome of an identical earlier action, or null. For a caller that must not do platform work (a model call) before a replay.
// The same key with a different payload is the usual 409. Same fingerprint as applyRoadmapAction.
export async function recordedReplay(db, access, { operation, actionKey, roadmapId = null, parts = [] }) {
  requireAccess(access); requireKey(actionKey);
  const fingerprint = await sha256([access.actorUserId, operation, roadmapId, ...parts].join('|'));
  const row = await db.prepare('SELECT fingerprint, outcome_status, outcome_json FROM learn_roadmap_actions WHERE org = ? AND owner_user_id = ? AND action_key = ?').bind(access.org, access.actorUserId, actionKey).first();
  if (!row) return null;
  if (row.fingerprint !== fingerprint) throw await currentConflict(db, access, roadmapId, 'action_key_reused');
  return { status: row.outcome_status, body: JSON.parse(row.outcome_json), replayed: true };
}

// --- create ---------------------------------------------------------------------------------------------------------------------------
// instruction is the learner's original words, stored verbatim as version 1 and never replaced by an inferred topic (v1.4 3.5).
// allowEmpty: the Explain-on-canvas choice of an invitation carries no typed words; the planner then asks one focused question when the source covers several topics (v1.4 3.5).
export async function createRoadmap(db, access, { actionKey, app, instruction, source, scope, scopeFingerprint, depth = 'standard', language = null, mode = 'tutor', allowEmpty = false, practiceMode = null, now = nowSeconds(), roadmapId = newId('rm_') }) {
  requireAccess(access);
  // UI.03: Explanations + practice needs R9; refused here, never silently made an explanations-only roadmap.
  if (practiceMode != null && practiceMode !== 'explanations') throw new StateError('practice_unavailable', 'Explanations + practice is not available yet.', 422);
  if (typeof instruction !== 'string' || (!instruction.trim() && !allowEmpty) || instruction.length > ROADMAP_LIMITS.source.instructionChars) throw new StateError('invalid_request', 'instruction is required', 400);
  if (!source?.key || !source?.rev || !scopeFingerprint) throw new StateError('invalid_request', 'source is required', 400);
  if (!DEPTHS.includes(depth)) throw new StateError('invalid_request', 'depth', 400); // the learner's R2 Depth; the column CHECK would otherwise 500
  const ceiling = ceilingFor(depth);
  const view = { roadmapId };
  return applyRoadmapAction(db, access, {
    operation: 'create_roadmap', actionKey, parts: [source.key, source.rev, scopeFingerprint, depth], uniqueCode: 'roadmap_unfinished_exists', now,
    outcome: { status: 202, body: view }, bump: false,
    statements: r => [
      db.prepare(`INSERT INTO learn_roadmaps (id, org, owner_user_id, owner_email, board_id, app, state, revision, plan_version, depth, practice_mode, source_key, source_rev, scope_json, scope_fingerprint,
        language, ceiling, mode, policy_version, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, 'draft', 1, 0, ?, 'explanations', ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${r.and}`)
        .bind(roadmapId, ...scopeOf(access).slice(0, 2), access.actorEmail, access.boardId, app, depth, source.key, source.rev, JSON.stringify(scope ?? { kind: 'whole' }), scopeFingerprint, language, ceiling, mode, ROADMAP_POLICY_VERSION, now, now, ...r.binds),
      db.prepare(`INSERT INTO learn_roadmap_instructions (roadmap_id, version, org, owner_user_id, board_id, text, origin, created_at) SELECT ?, 1, ?, ?, ?, ?, 'create', ? WHERE ${r.and}`)
        .bind(roadmapId, ...scopeOf(access), instruction, now, ...r.binds),
      // The planner runs from this event (roadmap-planning.js), so a crash between create and planning loses nothing.
      eventStatement(db, access, { roadmapId, kind: 'plan_requested', factId: roadmapId, factRevision: 1, payload: { kind: 'draft', instructionVersion: 1 }, now }, r),
    ],
  });
}

// --- plan and proposals: the writers the Tools lane's planner and composer call with their validated output ----------------------------------
// plan: { outcome, assumptions[], formats[], steps:[{title, goal, format, passage:{start,end}}], stoppingPoint, question?, limitation? }
export async function recordPlan(db, access, { roadmapId, actionKey, expectedRevision, plan, promptVersion, model = null, kind = 'draft', now = nowSeconds() }) {
  const roadmap = await readRoadmap(db, access, roadmapId);
  if (!roadmap) throw new StateError('not_found', 'Not available', 404);
  // A focused question or a limitation is a plan version with no steps (the roadmap waits in `questioning`); anything else needs 1..ceiling steps.
  const waiting = !!(plan?.question || plan?.limitation);
  if (!plan || !Array.isArray(plan.steps) || (waiting ? plan.steps.length : !plan.steps.length) || plan.steps.length > roadmap.ceiling) throw new StateError('invalid_request', 'plan steps must be within the ceiling', 400);
  const version = roadmap.plan_version + 1;
  const planJson = JSON.stringify(plan);
  const planHash = await sha256(planJson);
  const stepIds = plan.steps.map(() => newId('st_'));
  // UI.03: a draft of an accepted roadmap keeps its first keptSteps steps as the accepted rows themselves (moved at reacceptance), so only future steps get rows.
  const kept = Number.isInteger(plan.keptSteps) && plan.keptSteps > 0 ? plan.keptSteps : 0;
  const instruction = await db.prepare('SELECT MAX(version) AS v FROM learn_roadmap_instructions WHERE roadmap_id = ?').bind(roadmapId).first();
  return applyRoadmapAction(db, access, {
    operation: 'record_plan', actionKey, roadmapId, expectedRevision, parts: [planHash], now, // minted values (the next version) stay out of the fingerprint so a replay still matches
    guard: { sql: "(SELECT state FROM learn_roadmaps WHERE id = ?) IN ('draft', 'questioning', 'proposed', 'active', 'paused', 'completed')", binds: [roadmapId] },
    outcome: { status: 200, body: { roadmapId, planVersion: version } },
    statements: r => [
      db.prepare(`INSERT INTO learn_roadmap_plan_versions (roadmap_id, version, org, owner_user_id, board_id, kind, instruction_version, plan_json, plan_hash, prompt_version, model, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${r.and}`).bind(roadmapId, version, ...scopeOf(access), kind, instruction?.v || 1, planJson, planHash, promptVersion, model, now, ...r.binds),
      ...plan.steps.map((s, i) => ({ s, i })).slice(kept).map(({ s, i }) => db.prepare(`INSERT INTO learn_roadmap_steps (id, roadmap_id, org, owner_user_id, board_id, position, plan_version, state, title, goal, format, passage_start, passage_end, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, 'planned', ?, ?, ?, ?, ?, ?, ? WHERE ${r.and}`)
        .bind(stepIds[i], roadmapId, ...scopeOf(access), i + 1, version, s.title, s.goal, s.format, s.passage?.start ?? 0, s.passage?.end ?? 0, now, now, ...r.binds)),
      db.prepare(`UPDATE learn_roadmaps SET plan_version = ?, state = CASE WHEN state IN ('draft', 'questioning', 'proposed') THEN ? ELSE state END, language = COALESCE(language, ?) WHERE id = ? AND ${r.and}`)
        .bind(version, waiting ? 'questioning' : 'proposed', plan.language ?? null, roadmapId, ...r.binds),
    ],
  });
}

// Accept plan: the displayed latest draft version -> active, recording the plan revision only. It authorizes no generation and charges nothing.
// UI.03: only the newest draft, with no revision still being planned (409 stale_draft); on an accepted roadmap reacceptance freezes the draft's
// settings, supersedes the pending unaccepted proposal, and moves the steps that already happened (same ids, results, references, charges) into it.
const KEPT = "state NOT IN ('planned', 'proposed')";
export async function acceptPlan(db, access, { roadmapId, expectedRevision, planVersion, actionKey, now = nowSeconds() }) {
  const roadmap = await readRoadmap(db, access, roadmapId);
  if (!roadmap) throw new StateError('not_found', 'Not available', 404);
  const row = await db.prepare('SELECT plan_json, instruction_version FROM learn_roadmap_plan_versions WHERE roadmap_id = ? AND version = ?').bind(roadmapId, planVersion ?? -1).first();
  let plan = null; try { plan = row ? JSON.parse(row.plan_json) : null; } catch { plan = null; }
  const prior = roadmap.accepted_plan_version, reaccept = ['active', 'paused'].includes(roadmap.state);
  const stale = () => Object.assign(new StateError('stale_draft', 'This roadmap draft is out of date.', 409), { reply: conflictReply({ code: 'stale_draft', currentRevision: roadmap.revision }) });
  const recorded = await recordedReplay(db, access, { operation: 'accept_plan', actionKey, roadmapId, parts: [planVersion] });
  if (recorded) return recorded;
  if (row && reaccept) {
    const latestInstruction = (await db.prepare('SELECT MAX(version) AS v FROM learn_roadmap_instructions WHERE roadmap_id = ?').bind(roadmapId).first())?.v;
    const keptNow = (await db.prepare(`SELECT COUNT(*) AS n FROM learn_roadmap_steps WHERE roadmap_id = ? AND plan_version = ? AND ${KEPT}`).bind(roadmapId, prior).first()).n;
    if (planVersion <= prior || row.instruction_version !== latestInstruction || (plan?.keptSteps ?? 0) !== keptNow) throw stale();
  } else if (row && planVersion === roadmap.plan_version && row.instruction_version !== (await db.prepare('SELECT MAX(version) AS v FROM learn_roadmap_instructions WHERE roadmap_id = ?').bind(roadmapId).first())?.v) throw stale();
  const depth = DEPTHS.includes(plan?.settings?.depth) ? plan.settings.depth : roadmap.depth;
  return applyRoadmapAction(db, access, {
    operation: 'accept_plan', actionKey, roadmapId, expectedRevision, parts: [planVersion], now,
    guard: { sql: `(SELECT state FROM learn_roadmaps WHERE id = ?) IN (${reaccept ? "'active', 'paused'" : "'proposed'"}) AND (SELECT plan_version FROM learn_roadmaps WHERE id = ?) = ?`
      + (!reaccept ? ' AND EXISTS (SELECT 1 FROM learn_roadmap_steps WHERE roadmap_id = ? AND plan_version = ?)' : '') // a reaccepted draft may keep exactly the steps that already happened
      + (reaccept ? ` AND (SELECT COUNT(*) FROM learn_roadmap_steps WHERE roadmap_id = ? AND plan_version = ? AND ${KEPT}) = ?` : ''),
      binds: [roadmapId, roadmapId, planVersion, ...(reaccept ? [roadmapId, prior, plan?.keptSteps ?? 0] : [roadmapId, planVersion])] },
    outcome: { status: 200, body: { roadmapId, acceptedPlanVersion: planVersion } },
    statements: r => [
      db.prepare(`UPDATE learn_roadmap_plan_versions SET accepted_at = ? WHERE roadmap_id = ? AND version = ? AND ${r.and}`).bind(now, roadmapId, planVersion, ...r.binds),
      ...(reaccept ? [
        db.prepare(`UPDATE learn_roadmap_plan_versions SET superseded_at = ? WHERE roadmap_id = ? AND version = ? AND ${r.and}`).bind(now, roadmapId, prior, ...r.binds),
        db.prepare(`UPDATE learn_step_proposals SET state = 'superseded', decided_at = ? WHERE roadmap_id = ? AND state IN ('checking', 'held', 'pending') AND ${r.and}`).bind(now, roadmapId, ...r.binds),
        db.prepare(`UPDATE learn_roadmap_steps SET plan_version = ?, updated_at = ? WHERE roadmap_id = ? AND plan_version = ? AND ${KEPT} AND ${r.and}`).bind(planVersion, now, roadmapId, prior, ...r.binds),
        db.prepare(`UPDATE learn_roadmap_steps SET state = 'cancelled', updated_at = ? WHERE roadmap_id = ? AND plan_version = ? AND state = 'proposed' AND ${r.and}`).bind(now, roadmapId, prior, ...r.binds),
      ] : []),
      db.prepare(`UPDATE learn_roadmaps SET state = 'active', paused_reason = NULL, accepted_plan_version = ?, depth = ?, ceiling = ? WHERE id = ? AND ${r.and}`).bind(planVersion, depth, ceilingFor(depth), roadmapId, ...r.binds),
    ],
  });
}

// Offers one checked proposal for the next planned step. checked: the validators' result (Tools). One offered step occupies the roadmap's proposal
// position (the partial unique index), so a second offer while one is checking, held or pending fails with proposal_not_pending.
export async function offerProposal(db, access, { roadmapId, expectedRevision, actionKey, stepId, format, title, description, contentHash, state = 'pending', now = nowSeconds() }) {
  if (!['pending', 'held', 'checking'].includes(state)) throw new StateError('invalid_request', 'state', 400);
  const step = await db.prepare(`SELECT * FROM learn_roadmap_steps WHERE id = ? AND roadmap_id = ? AND ${SCOPE_SQL}`).bind(stepId, roadmapId, ...scopeOf(access)).first();
  if (!step) throw new StateError('not_found', 'Not available', 404);
  const last = await db.prepare('SELECT MAX(version) AS v FROM learn_step_proposals WHERE step_id = ?').bind(stepId).first();
  const version = (last?.v || 0) + 1, proposalId = newId('pr_');
  return applyRoadmapAction(db, access, {
    operation: 'offer_proposal', actionKey, roadmapId, expectedRevision, parts: [stepId, contentHash], uniqueCode: 'proposal_not_pending', now,
    guard: { sql: "(SELECT state FROM learn_roadmaps WHERE id = ?) IN ('active', 'paused') AND (SELECT state FROM learn_roadmap_steps WHERE id = ?) IN ('planned', 'cancelled', 'incomplete')", binds: [roadmapId, stepId] },
    outcome: { status: 200, body: { proposalId, version } },
    statements: r => [
      db.prepare(`INSERT INTO learn_step_proposals (id, roadmap_id, step_id, org, owner_user_id, board_id, version, state, format, title, description, content_hash, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${r.and}`).bind(proposalId, roadmapId, stepId, ...scopeOf(access), version, state, format, title, description, contentHash, now, ...r.binds),
      db.prepare(`UPDATE learn_roadmap_steps SET state = 'proposed', updated_at = ? WHERE id = ? AND ${r.and}`).bind(now, stepId, ...r.binds),
      db.prepare(`UPDATE learn_roadmaps SET state = 'active' WHERE id = ? AND state = 'paused' AND ${r.and}`).bind(roadmapId, ...r.binds), // a manual next step resumes a Cancel pause
      db.prepare(`UPDATE learn_roadmaps SET scope_json = json_remove(scope_json, '$.offerRecovery') WHERE id = ? AND ${r.and}`).bind(roadmapId, ...r.binds), // a real offer ends any recovery for the step
    ],
  });
}

// --- R4.07: accept the offered step -------------------------------------------------------------------------------------------------
// acceptRoadmapStep(env, access, {roadmapId, revision, proposalId, proposalVersion, actionKey}). One batch: the winning receipt (guarded by the
// revision, a pending checked proposal on an active roadmap, and the allowance for the WHOLE step), the hold, the authorization, the per-card
// allocations, the result slots with minted card ids, the accepted decision and the step's move to generating. Insufficient allowance writes
// nothing: the proposal stays pending and the action key stays unconsumed. First valid action wins; a second device's different key is a 409.
// quote(roadmap, proposal) (CORE.05, roadmap-run.js quoteStepAcceptance): the snapshot and the exact one-call bound; legacy callers pass callMicros instead.
// BE.12: a learner call that may have reached the provider (admitted, dispatched, unknown, reconciling) has no settled outcome yet. While one exists on the
// roadmap, no successor is offered and no new step is dispatched: the outcome is reconciled first (the call is never resent blindly either).
export async function outcomeUnresolved(db, roadmapId) {
  const marks = BLIND_RETRY_FORBIDDEN.map(() => '?').join(',');
  return !!(await db.prepare(`SELECT 1 AS n FROM learn_roadmap_calls WHERE roadmap_id = ? AND payer = 'learner' AND checkpoint IN (${marks}) LIMIT 1`).bind(roadmapId, ...BLIND_RETRY_FORBIDDEN).first());
}

export async function acceptRoadmapStep(env, access, { roadmapId, revision, proposalId, proposalVersion, actionKey, callMicros, quote = null, now = nowSeconds() }) {
  requireAccess(access); requireKey(actionKey);
  const db = env.LEARN_DB;
  if (!(await accessStillValid(db, access))) throw new StateError('not_found', 'Not available', 404); // revoked access: no new charge
  const roadmap = await readRoadmap(db, access, roadmapId);
  const proposal = await readProposal(db, access, proposalId);
  if (!roadmap || !proposal || proposal.roadmap_id !== roadmapId) throw new StateError('not_found', 'Not available', 404);
  // Replay first: an identical repeat returns the recorded outcome without reading the balance or touching any record.
  const earlier = await db.prepare('SELECT fingerprint FROM learn_roadmap_actions WHERE org = ? AND owner_user_id = ? AND action_key = ?').bind(access.org, access.actorUserId, actionKey).first();
  const verdict = canAcceptProposal({ roadmap: roadmap.state, proposal: proposal.state, validation: proposal.stale ? 'pending' : 'passed', stale: !!proposal.stale });
  if (!earlier) {
    if (proposal.version !== proposalVersion) throw await currentConflict(db, access, roadmapId);
    if (!verdict.ok) throw Object.assign(await currentConflict(db, access, roadmapId, verdict.code));
    if (await outcomeUnresolved(db, roadmapId)) throw new StateError('outcome_unresolved', 'The previous card is still being settled.', 409); // BE.12: reconcile before any new dispatch
  }
  const slots = Array.from({ length: ROADMAP_LIMITS.cardsPerStep.r4Default }, (_, i) => ({ index: i, resultId: newId('rs_'), cardId: newId('cd_') }));
  // A replay never re-quotes: its recorded receipt is the answer.
  const quoted = !earlier && quote ? await quote({ roadmap, proposal }) : null;
  const auth = await admitStepAuthorization(env, access, { roadmapId, proposalId, proposalVersion, slots, callMicros, cardBoundMicros: quoted?.boundMicros, contentFingerprint: quoted?.contentFingerprint, now });
  if (auth.refusal) return { refusal: auth.refusal };
  const body = { roadmapId, proposalId, proposalVersion, authorizationId: auth.authorizationId, slots: slots.map(s => ({ index: s.index, resultId: s.resultId, cardId: s.cardId })) };
  const pending = "EXISTS (SELECT 1 FROM learn_step_proposals WHERE id = ? AND version = ? AND roadmap_id = ? AND state = 'pending' AND stale = 0) AND (SELECT state FROM learn_roadmaps WHERE id = ?) = 'active'";
  const guard = { sql: `${pending} AND ${auth.guard.sql}`, binds: [proposalId, proposalVersion, roadmapId, roadmapId, ...auth.guard.binds] };
  let done;
  try {
    done = await applyRoadmapAction(db, access, {
      operation: 'accept_proposal', actionKey, roadmapId, expectedRevision: revision, parts: [proposalId, proposalVersion, proposal.content_hash], guard, now,
      outcome: { status: 202, body },
      statements: r => [
        // Results first: the authorization's allocations reference them, and they carry the minted card ids before any generator can write output.
        ...slots.map(s => db.prepare(`INSERT INTO learn_step_results (id, roadmap_id, step_id, proposal_id, proposal_version, org, owner_user_id, board_id, slot_index, card_id, generation, validation, decision, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', 'accepted', ?, ? WHERE ${r.and}`).bind(s.resultId, roadmapId, proposal.step_id, proposalId, proposalVersion, ...scopeOf(access), s.index, s.cardId, now, now, ...r.binds)),
        ...auth.statements()(r),
        db.prepare(`UPDATE learn_step_proposals SET state = 'accepted', accepted_at = ?, decided_at = ? WHERE id = ? AND version = ? AND state = 'pending' AND ${r.and}`).bind(now, now, proposalId, proposalVersion, ...r.binds),
        db.prepare(`UPDATE learn_roadmap_steps SET state = 'generating', updated_at = ? WHERE id = ? AND ${r.and}`).bind(now, proposal.step_id, ...r.binds),
        eventStatement(db, access, { roadmapId, kind: 'step_accepted', factId: proposalId, factRevision: proposalVersion, payload: { proposalId, proposalVersion, authorizationId: auth.authorizationId, ...(quoted ? { snapshot: quoted.snapshot } : {}) }, now }, r),
      ],
    });
  } catch (error) {
    if (error instanceof StateError && error.code === 'stale_revision') {
      // Distinguish a shortage from a lost race: the proposal is still pending at the same revision only when the allowance refused.
      const again = await readRoadmap(db, access, roadmapId), same = await readProposal(db, access, proposalId);
      if (again.revision === revision && same.state === 'pending' && auth.allowance != null) return { refusal: await shortage(db, env, auth, now) };
    }
    throw error;
  }
  return done;
}

async function shortage(db, env, auth, now) {
  const { explainAllowance } = await import('../learn-spend-ledger.js');
  const reason = await explainAllowance(db, { userId: auth.payerUserId, period: auth.period, allowance: auth.allowance }, auth.aggregateMicros, now);
  return { reason: reason === 'daily_cap_reached' ? 'allowance_insufficient' : reason, period: auth.period };
}

// --- outbox ---------------------------------------------------------------------------------------------------------------------------
// R4.05: an event commits with the fact it reports. The statement is guarded by the caller's receipt, so a stale action writes no event.
export function eventStatement(db, access, { roadmapId, kind, factId, factRevision, payload, now = nowSeconds(), deadlineSeconds = 300 }, r) {
  return db.prepare(`INSERT OR IGNORE INTO learn_roadmap_outbox (event_id, org, owner_user_id, scope, board_id, roadmap_id, kind, fact_id, fact_revision, payload_json, next_at, attempts, deadline_at, created_at)
    SELECT ?, ?, ?, 'roadmap', ?, ?, ?, ?, ?, ?, ?, 0, ?, ? WHERE ${r.and}`)
    .bind(newId('ev_'), access.org, access.actorUserId, access.boardId, roadmapId, kind, factId, factRevision, JSON.stringify(payload), now, now + deadlineSeconds, now, ...r.binds);
}

// --- results: generation outcome, entitlement, delivery ----------------------------------------------------------------------------------
const resultView = row => row && { id: row.id, org: row.org, ownerUserId: row.owner_user_id, boardId: row.board_id, decision: row.decision, generation: row.generation, validation: row.validation, stale: !!row.stale,
  billing: row.billing, delivery: row.delivery, reconciliation: row.reconciliation };

// The generator's successful output (Tools adapter) and its checks' verdict. validation is 'passed', 'held' or 'blocked'. A held card keeps its charge
// while the bounded checking retry runs (R4.11); a passed one releases the allocation it did not use. Replay-safe: only a pending/generating row changes.
export async function recordGenerated(db, access, { resultId, primitive, body, validation, checkJson = null, now = nowSeconds() }) {
  if (!['passed', 'held', 'blocked'].includes(validation)) throw new StateError('invalid_request', 'validation', 400);
  const bodyJson = JSON.stringify(body);
  const bodyHash = await sha256(bodyJson);
  const done = await db.prepare(`UPDATE learn_step_results SET generation = 'generated', validation = ?, primitive = ?, body_json = ?, body_hash = ?, check_json = ?, billing = 'settled', updated_at = ?
    WHERE id = ? AND ${SCOPE_SQL} AND decision = 'accepted' AND generation IN ('pending', 'generating') AND billing = 'pending'`).bind(validation, primitive, bodyJson, bodyHash, checkJson ? JSON.stringify(checkJson) : null, now, resultId, ...scopeOf(access)).run();
  if (done.meta?.changes === 1 && validation === 'passed') await releaseStepAllocation(db, { resultId, now });
  return done.meta?.changes === 1;
}

// entitledRoadmapResult(access, result) is the contract's predicate; this reads the row and returns the body only when it passes (the same call
// serves polling-adjacent routes and any asset route). null = not entitled, which every route answers as 404 not_found.
export async function readEntitledResult(db, access, { roadmapId, resultId }) {
  const row = await readResult(db, access, resultId);
  if (!row || row.roadmap_id !== roadmapId || !entitledRoadmapResult(access, resultView(row))) return null;
  return { id: row.id, cardId: row.card_id, primitive: row.primitive, block: JSON.parse(row.body_json), proposalVersion: row.proposal_version, delivery: row.delivery };
}

// The authorized result's own fields (never layout: position, size, rename, canvas bookkeeping) must all be present and equal in the saved block. A saved
// block may carry extra keys; it may not differ in, drop or empty anything the result authorized. A result with no stored body has nothing to compare.
const COVERS = (saved, wanted) => Array.isArray(wanted) ? Array.isArray(saved) && saved.length === wanted.length && wanted.every((item, i) => COVERS(saved[i], item))
  : wanted && typeof wanted === 'object' ? !!saved && typeof saved === 'object' && Object.keys(wanted).every(key => COVERS(saved[key], wanted[key])) : saved === wanted;
const CONTENT_KEYS = ['type', 'title', 'body', 'more', 'caption', 'columns', 'rows', 'sourceRef'];
function savedMatchesResult(saved, row) {
  let authorized; try { authorized = JSON.parse(row.body_json || '{}'); } catch { return false; }
  if (row.primitive && authorized.type && saved.type !== row.primitive) return false;
  return CONTENT_KEYS.every(key => !(key in authorized) || COVERS(saved[key], authorized[key]));
}

// Delivery acknowledgement: the client inserted the minted card and the board save succeeded. cardIds must equal the minted slot (never accepts others).
export async function acknowledgeDelivery(db, access, { roadmapId, resultId, expectedRevision, actionKey, cardIds, boardVersion = null, now = nowSeconds() }) {
  const row = await readResult(db, access, resultId);
  if (!row || row.roadmap_id !== roadmapId) throw new StateError('not_found', 'Not available', 404);
  const roadmap = await readRoadmap(db, access, roadmapId);
  const ok = canDeliver({ generation: row.generation, validation: row.validation, stale: !!row.stale, decision: row.decision, billing: row.billing, delivery: 'not_delivered', access: true, reconciliation: row.reconciliation });
  if (!ok.ok && row.delivery === 'not_delivered') throw Object.assign(new StateError(ok.code === 'not_checked' ? 'held_for_checking' : ok.code, 'Not available yet', 409), { reply: conflictReply({ code: ok.code, currentRevision: roadmap.revision }) });
  if (!Array.isArray(cardIds) || cardIds.length !== 1 || cardIds[0] !== row.card_id) throw new StateError('invalid_request', 'cardIds must equal the minted slots', 400);
  // Delivered means the card is in a SAVED board: the client names the saved revision, the server reads the board itself. An already
  // delivered result skips this so a replayed acknowledgement still answers the recorded outcome.
  if (row.delivery === 'not_delivered') {
    if (!Number.isInteger(boardVersion) || boardVersion < 1) throw new StateError('invalid_request', 'boardRevision', 400);
    const board = await db.prepare('SELECT state_json, version FROM learn_boards WHERE id = ? AND org = ? AND owner_email = ?').bind(access.boardId, access.org, access.actorEmail).first();
    let saved = null;
    try { saved = (JSON.parse(board?.state_json || '{}').blocks || []).find(block => block?.id === row.card_id) || null; } catch { /* an unreadable board is not proof */ }
    // 422, not 409: the roadmap is not stale; the client keeps the card, saves again and retries the same acknowledgement.
    if (!saved || board.version < boardVersion) throw new StateError('card_not_saved', 'The board with this card is not saved yet', 422);
    // Card presence alone is not delivery: the saved block must carry the authorized result's type, content and source reference.
    if (!savedMatchesResult(saved, row)) throw new StateError('card_content_mismatch', 'The saved card does not match the authorized result', 422);
  }
  return applyRoadmapAction(db, access, {
    operation: 'ack_delivery', actionKey, roadmapId, expectedRevision, parts: [resultId, row.card_id], now,
    guard: { sql: "(SELECT delivery FROM learn_step_results WHERE id = ?) = 'not_delivered' AND (SELECT billing FROM learn_step_results WHERE id = ?) IN ('settled', 'zero_priced') AND (SELECT validation FROM learn_step_results WHERE id = ?) = 'passed'", binds: [resultId, resultId, resultId] },
    outcome: { status: 200, body: { resultId, cardId: row.card_id, delivery: 'delivered' } },
    statements: r => [
      db.prepare(`UPDATE learn_step_results SET delivery = 'delivered', delivered_at = ?, ack_board_revision = ?, updated_at = ? WHERE id = ? AND ${r.and}`).bind(now, boardVersion, now, resultId, ...r.binds),
      db.prepare(`UPDATE learn_roadmap_steps SET state = 'delivered', updated_at = ? WHERE id = ? AND ${r.and}`).bind(now, row.step_id, ...r.binds),
      db.prepare(`UPDATE learn_roadmaps SET delivered_count = delivered_count + 1 WHERE id = ? AND ${r.and}`).bind(roadmapId, ...r.binds),
      eventStatement(db, access, { roadmapId, kind: 'card_delivered', factId: resultId, factRevision: 1, payload: { resultId }, now }, r),
    ],
  });
}

// --- R4.11: failures ------------------------------------------------------------------------------------------------------------------
// Settles a card's failure from the job. Replay-safe by a system receipt keyed on result + retry number (the same failure reported twice changes
// nothing). An eligible transient failure with its one automatic retry unused refunds the card's learner charges and puts the result back to
// pending (the caller then dispatches the retry with retry_no + 1 and a fresh operation identity). Anything else is terminal: refund the card's
// learner charges, mark generation failed and close the step (skipped: there is no Retry, Replace or Omit, owner 2026-11-06), release the card's allocation.
// Provider expense rows are never touched.
// allowAutomaticRetry (trusted, CORE.04): the ordinary roadmap author passes false, so a failed slot is terminal here too and a reload cannot turn it into a new purchase.
export async function failCard(db, access, { roadmapId, resultId, failureClass, retryNo = null, now = nowSeconds(), allowAutomaticRetry = true }) {
  const row = await readResult(db, access, resultId);
  if (!row || row.roadmap_id !== roadmapId) throw new StateError('not_found', 'Not available', 404);
  const used = await db.prepare('SELECT COALESCE(MAX(retry_no), 0) AS n FROM learn_roadmap_calls WHERE result_id = ?').bind(resultId).first();
  const failedAt = retryNo ?? used.n; // the attempt that failed: the job names it so a late duplicate report is the same failure
  const retry = allowAutomaticRetry && failureWillRetry(failureClass, failedAt);
  const refunds = r => refundCardStatements(db, resultId, `roadmap_card_${retry ? 'retry' : 'failed'}`, now, r);
  const key = `sys_fail_${resultId}_${failedAt}`;
  const outcome = { status: 200, body: { resultId, failureClass, retry, retryNo: retry ? failedAt + 1 : null } };
  const out = await applyRoadmapAction(db, access, {
    operation: 'card_failed', actionKey: key, parts: [resultId, failedAt, failureClass], bump: false, now, // a system receipt: no revision guard, the result's own state is the guard
    guard: { sql: "EXISTS (SELECT 1 FROM learn_step_results WHERE id = ? AND delivery = 'not_delivered' AND (generation IN ('pending', 'generating') OR (generation = 'generated' AND validation IN ('held', 'blocked'))))", binds: [resultId] },
    outcome,
    statements: r => [
      ...refunds(r),
      db.prepare(`UPDATE learn_step_results SET generation = CASE WHEN generation = 'generated' THEN generation ELSE ? END, billing = CASE WHEN ? = 1 THEN 'pending'
        WHEN EXISTS (SELECT 1 FROM usage_attempt_detail d WHERE d.refund_reason = 'roadmap_card_failed' AND d.refunded_micros > 0 AND d.attempt_id IN (SELECT op_id FROM learn_roadmap_calls WHERE result_id = learn_step_results.id)) THEN 'refunded' ELSE 'failed' END,
        failure_class = ?, updated_at = ? WHERE id = ? AND ${r.and}`).bind(retry ? 'pending' : 'failed', retry ? 1 : 0, retry ? null : failureClass, now, resultId, ...r.binds),
      ...(retry ? [] : [
        db.prepare(`UPDATE learn_roadmap_steps SET state = 'skipped', updated_at = ? WHERE id = ? AND ${r.and}`).bind(now, row.step_id, ...r.binds),
        eventStatement(db, access, { roadmapId, kind: 'card_failed', factId: resultId, factRevision: failedAt + 1, payload: { resultId, failureClass }, now }, r),
      ]),
    ],
  });
  if (!retry && !out.replayed) await releaseStepAllocation(db, { resultId, now });
  return out;
}

export { isUnfinishedRoadmap, canTransition, readResult, readProposal, currentConflict };
