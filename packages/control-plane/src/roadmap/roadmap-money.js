// R4 State/Money (checklist R4.06, R4.07, R4.11): the stable provider-operation identity, the whole-step learner authorization, the
// per-card allocation release, and failure refunds. Pure statements and small reads over the tables in learn-migrations/0039-roadmap-core.sql:
// nothing here calls a model. The hold is one usage_attempts row (kind 'tool', cost_state 'reserved') in the learner's usage action, so the
// existing balance (learn-usage.js BALANCE_SCOPE / USED_SUM / heldSum) counts it without any change to that file. A per-call transfer
// (learn-spend-ledger.js consumeStepAllocation) moves an equal part of it into the call's own reservation.
import { admissionPayer, noteUsageIdentity, releaseStaleHolds, withUsage, periodOf, BALANCE_SCOPE, USED_SUM, heldSum } from '../learn-usage.js';
import { spendEnforced, withOperation } from '../learn-spend-ledger.js';
import { operationKey, StateError, mayRetryCall, AUTOMATIC_RETRY_CLASSES } from './roadmap-contract.js';
import { ROADMAP_LIMITS } from './roadmap-policy.js';

export const sha256 = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
export const newId = prefix => `${prefix}${[...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('')}`;

// --- R4.06: the trusted provider identity ----------------------------------------------------------------------------------------
// The ledger op id is derived from the contract's canonical operation key (proposal, version, card, stage, call, retry, authorization), so the
// same call has the same id after a restart and a different call never shares one. Only server code that imports this can set it: it
// travels in a Symbol on the env copy (learn-spend-ledger.js withOperation), never in a body, header or query. -> { env, opId, key }.
export async function withRoadmapProviderCall(env, fields, { kind, platform = false } = {}) {
  const key = operationKey(fields);
  const opId = `rm-${fields.stage.replace(/_/g, '-')}-${(await sha256(key)).slice(0, 32)}`;
  // Learner-paid generation draws on the step hold (R4.07). Platform-paid work (checks, planning) has no allocation.
  const allocation = platform ? null : { authorizationId: fields.authorizationId, cardId: fields.cardId };
  return { env: withOperation(env, { opId, key, kind, allocation }), opId, key };
}

// Persists the call's checkpoint (planned -> admitted -> dispatched -> response_recorded -> settled, or unknown). A call at admitted, dispatched,
// unknown or reconciling may not be re-sent blindly: callMayBeSent says so from the stored row, never from the caller's memory.
export async function planCall(db, access, { opId, key, roadmapId, resultId = null, authorizationId = null, stage, call, retry, payer, task, provider = null, model = null, requestFingerprint = null, now }) {
  await db.prepare(`INSERT OR IGNORE INTO learn_roadmap_calls (op_id, operation_key, roadmap_id, result_id, authorization_id, org, owner_user_id, board_id, stage, call_no, retry_no, payer, task, provider, model, request_fingerprint, checkpoint, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?)`)
    .bind(opId, key, roadmapId, resultId, authorizationId, access.org, access.actorUserId, access.boardId, stage, call, retry, payer, task, provider, model, requestFingerprint, now).run();
  return callState(db, opId);
}
export const callState = async (db, opId) => (await db.prepare('SELECT checkpoint, output_ref, cost_micros FROM learn_roadmap_calls WHERE op_id = ?').bind(opId).first()) || null;
export async function callMayBeSent(db, opId) {
  const row = await callState(db, opId);
  return !row || mayRetryCall(row.checkpoint);
}
// -> true when the move was applied. Backwards or sideways moves change nothing.
const ORDER = ['planned', 'admitted', 'dispatched', 'response_recorded', 'settled'];
export async function advanceCall(db, opId, to, { outputRef = null, costMicros = null, now }) {
  const from = ORDER.includes(to) ? ORDER.slice(0, ORDER.indexOf(to)) : null;
  const allowed = from ? from.map(() => '?').join(',') : null;
  const sql = from
    ? `UPDATE learn_roadmap_calls SET checkpoint = ?, output_ref = COALESCE(?, output_ref), cost_micros = COALESCE(?, cost_micros), settled_at = CASE WHEN ? = 'settled' THEN ? ELSE settled_at END WHERE op_id = ? AND checkpoint IN (${allowed})`
    : "UPDATE learn_roadmap_calls SET checkpoint = ?, settled_at = ? WHERE op_id = ? AND checkpoint IN ('admitted', 'dispatched', 'response_recorded', 'unknown', 'reconciling')";
  const bind = from ? [to, outputRef, costMicros, to, now, opId, ...from] : [to, now, opId];
  return (await db.prepare(sql).bind(...bind).run()).meta?.changes === 1;
}
// An unknown outcome is never rewritten as zero cost: the call stays 'unknown' until reconciliation settles, fails or releases it.
export const markCallUnknown = (db, opId, now) => advanceCall(db, opId, 'unknown', { now });

// --- R4.07: the whole-step authorization -------------------------------------------------------------------------------------------
// Provisional per-call worst case: the artifact task's bound (4000 output tokens on the registry's current model plus the 8000-character context)
// is about 0.12 USD. A card may make generationPerCard calls and one automatic retry, so its allocation is the envelope below.
// ponytail: provisional, the Tools adapter passes its own quote (requestSpendBound of the real body) once it exists.
export const DEFAULT_CALL_BOUND_MICROS = 125000;
export const cardEnvelopeMicros = (callMicros = DEFAULT_CALL_BOUND_MICROS, limits = ROADMAP_LIMITS) =>
  callMicros * limits.calls.generationPerCard * (1 + limits.calls.automaticRetriesPerCard);
export const usageKeyFor = (proposalId, version) => `rmact_${proposalId}_${version}`;

// The learner's usage context for an accepted proposal version: feature 'artifact' (existing label and hold window), the server-derived action
// key, the payer from the authenticated access object. The payer is never read from a body.
export function learnerUsageEnv(env, access, proposalId, proposalVersion) {
  const scoped = withUsage(env, { feature: 'artifact', req: new Request('https://roadmap/accept', { headers: { 'x-rh-action-key': usageKeyFor(proposalId, proposalVersion) } }) });
  noteUsageIdentity(scoped, { userId: access.payerUserId, email: access.actorEmail });
  return scoped;
}

// admitStepAuthorization(env, access, {...}) -> { refusal } | { guard, statements(r), authorizationId, holdAttemptId, aggregateMicros, allocations }.
// It does not write. The caller (acceptRoadmapStep) puts `guard` in the winning acceptance receipt and `statements(r)` in the same batch, so
// the full-step allowance test, the hold, the authorization, the allocations and the acceptance are one transaction: when the allowance
// does not cover the whole step the receipt is not inserted and nothing else is.
// cardBoundMicros / contentFingerprint (CORE.05, trusted, from the acceptance quote): the exact one-call bound of the actual request and its binding.
export async function admitStepAuthorization(env, access, { roadmapId, proposalId, proposalVersion, slots, callMicros, cardBoundMicros = null, contentFingerprint = null, now, deadlineSeconds = 900, ids = {} }) {
  const perCard = Number.isSafeInteger(cardBoundMicros) && cardBoundMicros > 0 ? cardBoundMicros : cardEnvelopeMicros(callMicros);
  const aggregateMicros = slots.length * perCard;
  const authorizationId = ids.authorization || newId('az_');
  const base = { authorizationId, aggregateMicros, contentFingerprint, usageClientKey: usageKeyFor(proposalId, proposalVersion) };
  const own = [access.org, access.actorUserId, access.boardId];
  const allocations = slots.map(slot => ({ id: newId('al_'), resultId: slot.resultId, cardId: slot.cardId, bound: perCard }));
  if (!spendEnforced(env)) {
    // Spend is not enforced (SMALL_ENV test): the authorization is still recorded so the state machine is identical, with no hold row.
    return { ...base, holdAttemptId: '', allocations, guard: { sql: '1 = 1', binds: [] }, statements: () => authorizationStatements(env, own, { ...base, roadmapId, proposalId, proposalVersion, actionId: '', holdAttemptId: '', payerUserId: access.payerUserId, period: periodOf(now), now, deadline: now + deadlineSeconds, allocations, hold: false }) };
  }
  const scoped = learnerUsageEnv(env, access, proposalId, proposalVersion);
  const payer = await admissionPayer(scoped, env.LEARN_DB);
  if (payer.refused) return { refusal: { reason: payer.reason, period: payer.period || periodOf(now) } };
  if (!payer.chargeable) return { refusal: { reason: 'payer_unavailable', period: payer.period } };
  await releaseStaleHolds(env.LEARN_DB, { userId: payer.userId, now }); // lapsed holds stop counting before the full-step test reads the balance
  const holdAttemptId = ids.hold || newId('hold_');
  return {
    ...base, holdAttemptId, allocations, period: payer.period, allowance: payer.allowance, payerUserId: payer.userId,
    guard: { sql: `(SELECT ${USED_SUM} + ${heldSum(now)} ${BALANCE_SCOPE}) + ? <= ?`, binds: [payer.userId, payer.period, aggregateMicros, payer.allowance] },
    statements: () => authorizationStatements(env, own, { ...base, roadmapId, proposalId, proposalVersion, actionId: payer.actionId, holdAttemptId, payerUserId: payer.userId, period: payer.period, now, deadline: now + deadlineSeconds, allocations, hold: true }),
  };
}

// The statements rely on the caller's receipt guard `r` (see roadmap-store.js applyRoadmapAction): each one writes only when this batch's receipt exists.
function authorizationStatements(env, [org, owner, board], a) {
  const db = env.LEARN_DB;
  return r => [
    ...(a.hold ? [db.prepare(`INSERT INTO usage_attempts (attempt_id, action_id, kind, provider, model, reserved_micros, cost_state, status, started_at)
      SELECT ?, ?, 'tool', NULL, NULL, ?, 'reserved', 'running', ? WHERE ${r.and}`).bind(a.holdAttemptId, a.actionId, a.aggregateMicros, a.now, ...r.binds)] : []),
    db.prepare(`INSERT INTO learn_step_authorizations (id, org, owner_user_id, board_id, roadmap_id, proposal_id, proposal_version, payer_user_id, period, usage_client_key, action_id, hold_attempt_id,
      aggregate_micros, per_card_bound_micros, remaining_micros, content_fingerprint, state, deadline_at, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, (SELECT content_hash FROM learn_step_proposals WHERE id = ? AND version = ?)), 'admitted', ?, ? WHERE ${r.and}`)
      .bind(a.authorizationId, org, owner, board, a.roadmapId, a.proposalId, a.proposalVersion, a.payerUserId, a.period, a.usageClientKey, a.actionId, a.holdAttemptId, a.aggregateMicros,
        a.allocations[0]?.bound ?? 0, a.aggregateMicros, a.contentFingerprint ?? null, a.proposalId, a.proposalVersion, a.deadline, a.now, ...r.binds),
    ...a.allocations.map(al => db.prepare(`INSERT INTO learn_step_allocations (id, authorization_id, result_id, card_id, bound_micros, remaining_micros, version, state, created_at)
      SELECT ?, ?, ?, ?, ?, ?, 1, 'held', ? WHERE ${r.and}`).bind(al.id, a.authorizationId, al.resultId, al.cardId, al.bound, al.bound, a.now, ...r.binds)),
  ];
}

// Release a card's untransferred allocation back to the learner (card completed or failed for good). One batch, replay-safe: every statement is
// guarded by the allocation not yet being released, the hold is sealed (settled, zero) once its last allocation is released.
export async function releaseStepAllocation(db, { resultId, now }) {
  const open = "EXISTS (SELECT 1 FROM learn_step_allocations WHERE result_id = ? AND state <> 'released')";
  const cardRemaining = '(SELECT remaining_micros FROM learn_step_allocations WHERE result_id = ?)';
  const authOf = '(SELECT authorization_id FROM learn_step_allocations WHERE result_id = ?)';
  const results = await db.batch([
    db.prepare(`UPDATE usage_attempts SET reserved_micros = MAX(0, reserved_micros - ${cardRemaining}) WHERE status = 'running' AND attempt_id = (SELECT hold_attempt_id FROM learn_step_authorizations WHERE id = ${authOf}) AND ${open}`).bind(resultId, resultId, resultId),
    db.prepare(`UPDATE learn_step_authorizations SET remaining_micros = MAX(0, remaining_micros - ${cardRemaining}) WHERE id = ${authOf} AND ${open}`).bind(resultId, resultId, resultId),
    db.prepare(`UPDATE learn_step_allocations SET remaining_micros = 0, state = 'released', released_at = ?, version = version + 1 WHERE result_id = ? AND state <> 'released'`).bind(now, resultId),
    // The last allocation released: the hold row stops existing as a reservation and the authorization closes.
    db.prepare(`UPDATE usage_attempts SET status = 'settled', cost_state = 'settled', cost_micros = 0, reserved_micros = 0, settled_at = ?
      WHERE status = 'running' AND attempt_id = (SELECT hold_attempt_id FROM learn_step_authorizations WHERE id = ${authOf}) AND NOT EXISTS (SELECT 1 FROM learn_step_allocations WHERE authorization_id = ${authOf} AND state <> 'released')`).bind(now, resultId, resultId),
    db.prepare(`UPDATE learn_step_authorizations SET state = 'released', released_at = ? WHERE id = ${authOf} AND state = 'admitted' AND NOT EXISTS (SELECT 1 FROM learn_step_allocations WHERE authorization_id = ${authOf} AND state <> 'released')`).bind(now, resultId, resultId),
  ]);
  return results[2].meta?.changes === 1;
}

// --- R4.11: failure classes and refunds ---------------------------------------------------------------------------------------------
export const failureWillRetry = (failureClass, retriesUsed, limits = ROADMAP_LIMITS) =>
  AUTOMATIC_RETRY_CLASSES.includes(failureClass) && retriesUsed < limits.calls.automaticRetriesPerCard;

// Refunds every settled learner charge of one card, once each, in the caller's batch. The attempt keeps its recorded provider cost: only
// usage_attempt_detail.refunded_micros changes (what the balance reads), plus a deterministic adjustment row so a replay inserts nothing.
// `r` is the caller's receipt guard; nothing is written without it. Unknown-cost attempts hold nothing and charge zero, so nothing is refunded for them.
export function refundCardStatements(db, resultId, reason, now, r) {
  const mine = `attempt_id IN (SELECT c.op_id FROM learn_roadmap_calls c WHERE c.result_id = ? AND c.payer = 'learner')`;
  return [
    db.prepare(`INSERT OR IGNORE INTO usage_attempt_detail (attempt_id) SELECT t.attempt_id FROM usage_attempts t WHERE t.${mine} AND t.cost_state = 'settled' AND t.cost_micros > 0 AND ${r.and}`).bind(resultId, ...r.binds),
    db.prepare(`UPDATE usage_attempt_detail SET refunded_micros = (SELECT cost_micros FROM usage_attempts t WHERE t.attempt_id = usage_attempt_detail.attempt_id), refunded_at = ?, refund_reason = ?
      WHERE ${mine} AND refunded_micros = 0 AND COALESCE((SELECT cost_micros FROM usage_attempts t WHERE t.attempt_id = usage_attempt_detail.attempt_id AND t.cost_state = 'settled'), 0) > 0 AND ${r.and}`).bind(now, reason, resultId, ...r.binds),
    db.prepare(`INSERT OR IGNORE INTO usage_adjustments (adjustment_id, action_id, user_id, micros, reason, created_at)
      SELECT 'adj-rf-' || d.attempt_id, a.action_id, a.user_id, -d.refunded_micros, d.refund_reason, ? FROM usage_attempt_detail d JOIN usage_attempts t ON t.attempt_id = d.attempt_id JOIN usage_actions a ON a.action_id = t.action_id
      WHERE d.refund_reason = ? AND d.refunded_micros > 0 AND d.${mine} AND ${r.and}`).bind(now, reason, resultId, ...r.binds),
  ];
}

export { StateError };
