// R4 integration glue: the bounded delivery deadline of the flag-off recovery contract (v1.4 4.1, integration.md 7). An accepted card whose checks passed but
// that was never placed on the learner's canvas within ROADMAP_LIMITS.retention.deliveryDeadlineHours of acceptance is either
//   - already on the saved board (the placement acknowledgement was lost): acknowledge it as delivered, no refund, no new purchase (v1.4 4.4), or
//   - not on the board: refund the card and mark it failed, so a learner is never left charged for a card they cannot get.
// Replay-safe (a system receipt per result), access is the stored identity, nothing here calls a model. Run from the scheduler hook (roadmap-wire.js).
import { acknowledgeDelivery, applyRoadmapAction, eventStatement, readRoadmap } from './roadmap-store.js';
import { refundCardStatements, releaseStepAllocation } from './roadmap-money.js';
import { accessForRoadmap } from './roadmap-access.js';
import { ROADMAP_LIMITS } from './roadmap-policy.js';

const nowSeconds = () => Math.floor(Date.now() / 1000);

// Refunds one undelivered, passed card. Only a result that is still passed, generated and not delivered changes; a repeat answers the recorded outcome.
export async function expireUndelivered(db, access, { resultId, stepId, roadmapId, now = nowSeconds() }) {
  const out = await applyRoadmapAction(db, access, {
    operation: 'delivery_expired', actionKey: `sys_expire_${resultId}`, parts: [resultId], bump: false, now, outcome: { status: 200, body: { resultId, billing: 'refunded' } },
    guard: { sql: "EXISTS (SELECT 1 FROM learn_step_results WHERE id = ? AND delivery = 'not_delivered' AND generation = 'generated' AND validation = 'passed')", binds: [resultId] },
    statements: r => [
      ...refundCardStatements(db, resultId, 'roadmap_delivery_deadline', now, r),
      db.prepare(`UPDATE learn_step_results SET generation = 'failed', failure_class = NULL, updated_at = ?,
        billing = CASE WHEN EXISTS (SELECT 1 FROM usage_attempt_detail d WHERE d.refund_reason = 'roadmap_delivery_deadline' AND d.refunded_micros > 0 AND d.attempt_id IN (SELECT op_id FROM learn_roadmap_calls WHERE result_id = learn_step_results.id)) THEN 'refunded' ELSE 'failed' END
        WHERE id = ? AND ${r.and}`).bind(now, resultId, ...r.binds),
      db.prepare(`UPDATE learn_roadmap_steps SET state = 'incomplete', updated_at = ? WHERE id = ? AND ${r.and}`).bind(now, stepId, ...r.binds),
      eventStatement(db, access, { roadmapId, kind: 'card_failed', factId: resultId, factRevision: 1, payload: { resultId, failureClass: 'delivery_deadline' }, now }, r),
    ],
  });
  if (!out.replayed) await releaseStepAllocation(db, { resultId, now });
  return out;
}

// -> { acknowledged, refunded } counts for this pass.
export async function sweepUndelivered(env, { now = nowSeconds(), hours = ROADMAP_LIMITS.retention.deliveryDeadlineHours, limit = 20 } = {}) {
  const db = env.LEARN_DB, counts = { acknowledged: 0, refunded: 0 };
  const { results } = await db.prepare(`SELECT * FROM learn_step_results WHERE decision = 'accepted' AND generation = 'generated' AND validation = 'passed' AND delivery = 'not_delivered' AND created_at <= ? ORDER BY created_at LIMIT ?`)
    .bind(now - hours * 3600, limit).all();
  for (const result of results || []) {
    const access = await accessForRoadmap(db, { org: result.org, owner_user_id: result.owner_user_id, board_id: result.board_id, roadmap_id: result.roadmap_id }, { checkBoard: false });
    if (!access) continue;
    // The saved board settles an unacknowledged delivery from a terminal failure before any refund (v1.4 4.4).
    const board = await db.prepare('SELECT state_json, version FROM learn_boards WHERE id = ? AND org = ? AND owner_email = ?').bind(access.boardId, access.org, access.actorEmail).first();
    let placed = false;
    try { placed = (JSON.parse(board?.state_json || '{}').blocks || []).some(block => block?.id === result.card_id); } catch { /* an unreadable board is not proof of placement */ }
    if (placed) {
      const roadmap = await readRoadmap(db, access, result.roadmap_id);
      await acknowledgeDelivery(db, access, { roadmapId: result.roadmap_id, resultId: result.id, expectedRevision: roadmap.revision, actionKey: `sys_ack_${result.id}`, cardIds: [result.card_id], boardVersion: board?.version ?? null, now }).then(() => { counts.acknowledged += 1; }, () => {});
    } else {
      await expireUndelivered(db, access, { resultId: result.id, stepId: result.step_id, roadmapId: result.roadmap_id, now }).then(() => { counts.refunded += 1; }, () => {});
    }
  }
  return counts;
}
