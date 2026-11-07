// R4.12 backend: Cancel, manual next step, End roadmap, the mode fact, and card removal. Each is an applyRoadmapAction batch (receipt-guarded,
// replay-safe) and commits its outbox event with the fact. No model call happens here: composing a proposal is an injected dependency (Tools).
import { StateError } from './roadmap-contract.js';
import { applyRoadmapAction, eventStatement, offerProposal, readRoadmap, readProposal, readResult } from './roadmap-store.js';

const nowSeconds = () => Math.floor(Date.now() / 1000);

// Cancel pauses automatic progression for that proposal: proposal and step cancelled, roadmap paused. Nothing re-offers the cancelled position by itself.
export async function cancelProposal(db, access, { roadmapId, expectedRevision, proposalId, proposalVersion, actionKey, now = nowSeconds() }) {
  const proposal = await readProposal(db, access, proposalId);
  if (!proposal || proposal.roadmap_id !== roadmapId) throw new StateError('not_found', 'Not available', 404);
  return applyRoadmapAction(db, access, {
    operation: 'cancel_proposal', actionKey, roadmapId, expectedRevision, parts: [proposalId, proposalVersion], now,
    guard: { sql: "EXISTS (SELECT 1 FROM learn_step_proposals WHERE id = ? AND version = ? AND state = 'pending') AND (SELECT state FROM learn_roadmaps WHERE id = ?) = 'active'", binds: [proposalId, proposalVersion, roadmapId] },
    outcome: { status: 200, body: { roadmapId, proposalId, state: 'cancelled' } },
    statements: r => [
      db.prepare(`UPDATE learn_step_proposals SET state = 'cancelled', decided_at = ? WHERE id = ? AND version = ? AND ${r.and}`).bind(now, proposalId, proposalVersion, ...r.binds),
      db.prepare(`UPDATE learn_roadmap_steps SET state = 'cancelled', updated_at = ? WHERE id = ? AND ${r.and}`).bind(now, proposal.step_id, ...r.binds),
      db.prepare(`UPDATE learn_roadmaps SET state = 'paused', paused_reason = 'proposal_cancelled' WHERE id = ? AND ${r.and}`).bind(roadmapId, ...r.binds),
      eventStatement(db, access, { roadmapId, kind: 'proposal_cancelled', factId: proposalId, factRevision: proposalVersion, payload: { proposalId }, now }, r),
    ],
  });
}

// Manual Propose next step: the next planned step by position (a cancelled position is never silently re-offered), only when nothing is offered,
// or generating (a failed card closed its step: owner 2026-11-06, no recovery). With no planned step left, or the ceiling reached, the roadmap completes at its stopping point.
// compose(roadmap, step) -> { format, title, description, contentHash, state? } is the Tools lane's checked proposal.
export async function proposeNextStep(db, access, { roadmapId, expectedRevision, actionKey, compose, now = nowSeconds() }) {
  const roadmap = await readRoadmap(db, access, roadmapId);
  if (!roadmap) throw new StateError('not_found', 'Not available', 404);
  if (!['active', 'paused'].includes(roadmap.state)) throw new StateError('roadmap_not_active', 'Not available', 409);
  const busy = await db.prepare("SELECT 1 AS n FROM learn_roadmap_steps WHERE roadmap_id = ? AND plan_version = ? AND state IN ('proposed', 'generating') LIMIT 1").bind(roadmapId, roadmap.plan_version).first();
  if (busy) throw new StateError('proposal_not_pending', 'Finish or resolve the current step first.', 409);
  const next = await db.prepare("SELECT * FROM learn_roadmap_steps WHERE roadmap_id = ? AND plan_version = ? AND state = 'planned' ORDER BY position LIMIT 1").bind(roadmapId, roadmap.plan_version).first();
  if (!next || roadmap.delivered_count >= roadmap.ceiling) {
    return applyRoadmapAction(db, access, {
      operation: 'complete_roadmap', actionKey, roadmapId, expectedRevision, now, outcome: { status: 200, body: { roadmapId, state: 'completed' } },
      guard: { sql: "(SELECT state FROM learn_roadmaps WHERE id = ?) IN ('active', 'paused')", binds: [roadmapId] },
      statements: r => [
        db.prepare(`UPDATE learn_roadmaps SET state = 'completed', paused_reason = NULL WHERE id = ? AND ${r.and}`).bind(roadmapId, ...r.binds),
        eventStatement(db, access, { roadmapId, kind: 'roadmap_completed', factId: roadmapId, factRevision: expectedRevision + 1, payload: {}, now }, r),
      ],
    });
  }
  const proposal = await compose(roadmap, next);
  return offerProposal(db, access, { roadmapId, expectedRevision, actionKey, stepId: next.id, ...proposal, now });
}

// End roadmap: delivered cards, decisions and evidence stay. Refused while accepted work is still being made (it finishes or fails first), so
// ending never strands a charge. An offered proposal is superseded.
export async function endRoadmap(db, access, { roadmapId, expectedRevision, actionKey, now = nowSeconds() }) {
  return applyRoadmapAction(db, access, {
    operation: 'end_roadmap', actionKey, roadmapId, expectedRevision, now, outcome: { status: 200, body: { roadmapId, state: 'ended' } },
    guard: { sql: "(SELECT state FROM learn_roadmaps WHERE id = ?) IN ('draft', 'questioning', 'proposed', 'active', 'paused', 'completed') AND NOT EXISTS (SELECT 1 FROM learn_roadmap_steps WHERE roadmap_id = ? AND state = 'generating')", binds: [roadmapId, roadmapId] },
    statements: r => [
      db.prepare(`UPDATE learn_step_proposals SET state = 'superseded', decided_at = ? WHERE roadmap_id = ? AND state IN ('checking', 'held', 'pending') AND ${r.and}`).bind(now, roadmapId, ...r.binds),
      db.prepare(`UPDATE learn_roadmap_steps SET state = 'cancelled', updated_at = ? WHERE roadmap_id = ? AND state = 'proposed' AND ${r.and}`).bind(now, roadmapId, ...r.binds),
      db.prepare(`UPDATE learn_roadmaps SET state = 'ended', ended_at = ? WHERE id = ? AND ${r.and}`).bind(now, roadmapId, ...r.binds),
      eventStatement(db, access, { roadmapId, kind: 'roadmap_ended', factId: roadmapId, factRevision: expectedRevision + 1, payload: {}, now }, r),
    ],
  });
}

// A deleted card changes delivery metadata only (D7): the result keeps its charge and history. Duplicate notifications record one removal.
export async function markResultRemoved(db, access, { roadmapId, resultId, expectedRevision, actionKey, now = nowSeconds() }) {
  const row = await readResult(db, access, resultId);
  if (!row || row.roadmap_id !== roadmapId) throw new StateError('not_found', 'Not available', 404);
  return applyRoadmapAction(db, access, {
    operation: 'result_removed', actionKey, roadmapId, expectedRevision, parts: [resultId], now, outcome: { status: 200, body: { resultId, delivery: 'removed' } },
    guard: { sql: "(SELECT delivery FROM learn_step_results WHERE id = ?) = 'delivered'", binds: [resultId] },
    statements: r => [
      db.prepare(`UPDATE learn_step_results SET delivery = 'removed', updated_at = ? WHERE id = ? AND ${r.and}`).bind(now, resultId, ...r.binds),
      db.prepare(`UPDATE learn_roadmap_steps SET card_removed = 1, removed_at = ?, updated_at = ? WHERE id = ? AND ${r.and}`).bind(now, now, row.step_id, ...r.binds),
      eventStatement(db, access, { roadmapId, kind: 'card_removed', factId: resultId, factRevision: 1, payload: { resultId }, now }, r),
    ],
  });
}

// The mode fact (api.md 17). modeRevision counts distinct changes, so Ask -> Tutor -> Ask is three events. Same value: nothing is written.
export async function setMode(db, access, { roadmapId, mode, actionKey, now = nowSeconds() }) {
  if (!['auto', 'ask', 'tutor'].includes(mode)) throw new StateError('invalid_request', 'mode', 400);
  const roadmap = await readRoadmap(db, access, roadmapId);
  if (!roadmap) throw new StateError('not_found', 'Not available', 404);
  if (roadmap.mode === mode) return { status: 200, body: { roadmapId, mode, modeRevision: roadmap.mode_revision }, replayed: false };
  const next = roadmap.mode_revision + 1;
  return applyRoadmapAction(db, access, {
    operation: 'set_mode', actionKey, roadmapId, expectedRevision: roadmap.revision, parts: [mode, next], now, outcome: { status: 200, body: { roadmapId, mode, modeRevision: next } },
    guard: { sql: "(SELECT state FROM learn_roadmaps WHERE id = ?) IN ('draft', 'questioning', 'proposed', 'active', 'paused', 'completed')", binds: [roadmapId] },
    statements: r => [
      db.prepare(`UPDATE learn_roadmaps SET mode = ?, mode_revision = ? WHERE id = ? AND ${r.and}`).bind(mode, next, roadmapId, ...r.binds),
      eventStatement(db, access, { roadmapId, kind: 'mode_changed', factId: roadmapId, factRevision: next, payload: { mode }, now }, r),
    ],
  });
}

// The roadmap's one Tutor Chat thread, so every device shows the roadmap in the same thread (owner 2026-11-06). No migration: it is kept as
// scope_json.tutorThreadId (scope_json is written once at create and read by key only; the fingerprint is its own column). The thread must be a
// saved Chat thread of this owner on this canvas (canvases.js threads). First writer wins and a repeat changes nothing; a bound thread that no
// longer exists (deleted) may be replaced, so the roadmap's lines are never left without a thread. -> { status: 200, body: { roadmapId, threadId } }
// with the thread now bound (another device's, if it won).
const THREAD_ID = /^canvaschat-[0-9a-f-]{36}$/;
const THREAD_ROW = 'SELECT 1 AS n FROM threads WHERE id = ? AND org = ? AND user = ? AND scope_ref = ?';
export async function bindTutorThread(db, access, { roadmapId, threadId }) {
  if (typeof threadId !== 'string' || !THREAD_ID.test(threadId)) throw new StateError('invalid_request', 'threadId', 400);
  const roadmap = await readRoadmap(db, access, roadmapId);
  if (!roadmap) throw new StateError('not_found', 'Not available', 404);
  if (!await db.prepare(THREAD_ROW).bind(threadId, roadmap.org, roadmap.owner_email, roadmap.app).first()) throw new StateError('not_found', 'Save the thread first', 404);
  await db.prepare(`UPDATE learn_roadmaps SET scope_json = json_set(scope_json, '$.tutorThreadId', ?) WHERE id = ? AND org = ? AND owner_user_id = ? AND board_id = ?
    AND (json_extract(scope_json, '$.tutorThreadId') IS NULL OR NOT EXISTS (SELECT 1 FROM threads t WHERE t.id = json_extract(learn_roadmaps.scope_json, '$.tutorThreadId')
      AND t.org = learn_roadmaps.org AND t.user = learn_roadmaps.owner_email AND t.scope_ref = learn_roadmaps.app))`)
    .bind(threadId, roadmapId, access.org, access.actorUserId, access.boardId).run();
  return { status: 200, body: { roadmapId, threadId: await tutorThreadOf(db, await readRoadmap(db, access, roadmapId)) } };
}
// The bound Tutor thread while it still exists, else null (never bound, or deleted: the client then makes a fresh one and binds it).
export async function tutorThreadOf(db, roadmap) {
  let id = null;
  try { id = JSON.parse(roadmap?.scope_json || '{}')?.tutorThreadId ?? null; } catch { return null; }
  if (typeof id !== 'string') return null;
  return (await db.prepare(THREAD_ROW).bind(id, roadmap.org, roadmap.owner_email, roadmap.app).first()) ? id : null;
}
