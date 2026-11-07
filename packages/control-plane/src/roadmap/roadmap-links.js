// R5.04 link an existing card as the next step (learn-migrations/0041 learn_proposal_links). A link proposal goes through the SAME offer position, version
// rules and Accept gesture as any proposal, but its acceptance is a zero-priced delivery of a card already on the learner's board: no authorization, no
// hold, no generation, no model, no copy of the card. The card is read from the saved board at offer AND again at acceptance; an id or an inventory read
// earlier is never ongoing access. A card that was deleted or materially edited between the two makes the link stale: it is superseded, its step goes back
// to planned for a fresh, checked proposal, and nothing is accepted (a zero-priced acceptance never silently becomes a chargeable generation).
// Reusing a card is delivery, not assessed understanding. It counts toward the delivered count and the ceiling like any delivered card.
import { StateError } from './roadmap-contract.js';
import { accessStillValid, applyRoadmapAction, currentConflict, eventStatement, readProposal, readRoadmap } from './roadmap-store.js';
import { newId, sha256 } from './roadmap-money.js';

const nowSeconds = () => Math.floor(Date.now() / 1000);
const scope = access => [access.org, access.actorUserId, access.boardId];
// shortcut: the block types that can cover a step as written. Geometry keys are not content; an unlisted layout key would count as an edit and force a fresh proposal (the safe side).
export const LINKABLE_TYPES = Object.freeze(['explanation', 'table', 'note', 'text']);
const LAYOUT = new Set(['x', 'y', 'w', 'h', 'width', 'height', 'rotation', 'zIndex', 'selected', 'locked', 'stepId']);

// -> { block, fingerprint } | null, from the saved board of THIS actor's board only.
export async function readBoardCard(db, access, cardId) {
  if (typeof cardId !== 'string' || !cardId || cardId.length > 120) return null;
  if (!(await accessStillValid(db, access))) return null;
  const board = await db.prepare('SELECT state_json FROM learn_boards WHERE id = ? AND org = ? AND owner_email = ?').bind(access.boardId, access.org, access.boardOwnerEmail).first();
  let blocks = [];
  try { blocks = JSON.parse(board?.state_json || '{}').blocks || []; } catch { return null; }
  const block = blocks.find(b => b?.id === cardId);
  if (!block || !LINKABLE_TYPES.includes(block.type)) return null;
  const content = Object.fromEntries(Object.entries(block).filter(([key]) => !LAYOUT.has(key)).sort(([a], [b]) => (a < b ? -1 : 1)));
  return { block, fingerprint: await sha256(JSON.stringify(content)) };
}

export const readLink = (db, proposalId, version) => db.prepare('SELECT * FROM learn_proposal_links WHERE proposal_id = ? AND proposal_version = ?').bind(proposalId, version).first();

// Offer "use this existing card" for the next planned step. origin: 'learner' (their explicit choice) or 'tutor' (bounded proposer-selected reuse).
export async function offerLinkProposal(db, access, { roadmapId, expectedRevision, actionKey, cardId, reason, origin = 'learner', now = nowSeconds() }) {
  const why = typeof reason === 'string' ? reason.trim() : '';
  if (!why || why.length > 300 || !['learner', 'tutor'].includes(origin)) throw new StateError('invalid_request', 'reason is required', 400);
  const roadmap = await readRoadmap(db, access, roadmapId);
  if (!roadmap) throw new StateError('not_found', 'Not available', 404);
  if (!['active', 'paused'].includes(roadmap.state)) throw new StateError('roadmap_not_active', 'Not available', 409);
  const busy = await db.prepare("SELECT 1 AS n FROM learn_roadmap_steps WHERE roadmap_id = ? AND plan_version = ? AND state IN ('proposed', 'generating') LIMIT 1").bind(roadmapId, roadmap.plan_version).first();
  if (busy) throw new StateError('proposal_not_pending', 'Finish or resolve the current step first.', 409);
  const step = await db.prepare("SELECT * FROM learn_roadmap_steps WHERE roadmap_id = ? AND plan_version = ? AND state = 'planned' ORDER BY position LIMIT 1").bind(roadmapId, roadmap.plan_version).first();
  if (!step || roadmap.delivered_count >= roadmap.ceiling) throw new StateError('ceiling_reached', 'Revise the plan to add another step.', 409);
  const card = await readBoardCard(db, access, cardId);
  if (!card) throw new StateError('card_unavailable', 'Not available', 404);
  const last = await db.prepare('SELECT MAX(version) AS v FROM learn_step_proposals WHERE step_id = ?').bind(step.id).first();
  const version = (last?.v || 0) + 1, proposalId = newId('pr_');
  const title = String(card.block.title || step.title).slice(0, 120), format = card.block.type === 'table' ? 'table' : 'explanation';
  const contentHash = await sha256(JSON.stringify([step.id, 'link', cardId, card.fingerprint]));
  return applyRoadmapAction(db, access, {
    operation: 'offer_link', actionKey, roadmapId, expectedRevision, parts: [step.id, cardId, card.fingerprint], uniqueCode: 'proposal_not_pending', now,
    guard: { sql: "(SELECT state FROM learn_roadmaps WHERE id = ?) IN ('active', 'paused') AND (SELECT state FROM learn_roadmap_steps WHERE id = ?) = 'planned'", binds: [roadmapId, step.id] },
    outcome: { status: 200, body: { proposalId, version } },
    statements: r => [
      db.prepare(`INSERT INTO learn_step_proposals (id, roadmap_id, step_id, org, owner_user_id, board_id, version, state, format, title, description, content_hash, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ? WHERE ${r.and}`).bind(proposalId, roadmapId, step.id, ...scope(access), version, format, title, why, contentHash, now, ...r.binds),
      db.prepare(`INSERT INTO learn_proposal_links (proposal_id, proposal_version, org, owner_user_id, board_id, card_id, card_fingerprint, reason, origin, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${r.and}`).bind(proposalId, version, ...scope(access), cardId, card.fingerprint, why, origin, now, ...r.binds),
      db.prepare(`UPDATE learn_roadmap_steps SET state = 'proposed', updated_at = ? WHERE id = ? AND ${r.and}`).bind(now, step.id, ...r.binds),
      db.prepare(`UPDATE learn_roadmaps SET state = 'active' WHERE id = ? AND state = 'paused' AND ${r.and}`).bind(roadmapId, ...r.binds),
    ],
  });
}

// Accept a link proposal: re-read the card, then one guarded batch writes the zero-priced delivered result. Never reads a balance or touches money.
export async function acceptLinkProposal(db, access, { roadmapId, revision, proposalId, proposalVersion, actionKey, now = nowSeconds() }) {
  const roadmap = await readRoadmap(db, access, roadmapId), proposal = await readProposal(db, access, proposalId);
  if (!roadmap || !proposal || proposal.roadmap_id !== roadmapId) throw new StateError('not_found', 'Not available', 404);
  const link = await readLink(db, proposalId, proposalVersion);
  if (!link) throw new StateError('not_found', 'Not available', 404);
  const earlier = await db.prepare('SELECT 1 AS n FROM learn_roadmap_actions WHERE org = ? AND owner_user_id = ? AND action_key = ?').bind(access.org, access.actorUserId, actionKey).first();
  if (!earlier) {
    if (proposal.version !== proposalVersion || proposal.state !== 'pending' || proposal.stale || roadmap.state !== 'active') throw await currentConflict(db, access, roadmapId);
    const card = await readBoardCard(db, access, link.card_id);
    if (!card || card.fingerprint !== link.card_fingerprint) {
      await applyRoadmapAction(db, access, {
        operation: 'link_stale', actionKey: `sys_linkstale_${proposalId}_${proposalVersion}`, roadmapId, expectedRevision: roadmap.revision, parts: [proposalId, proposalVersion], now, outcome: { status: 409, body: { code: 'link_stale' } },
        guard: { sql: "EXISTS (SELECT 1 FROM learn_step_proposals WHERE id = ? AND version = ? AND state = 'pending')", binds: [proposalId, proposalVersion] },
        statements: r => [
          db.prepare(`UPDATE learn_step_proposals SET state = 'superseded', decided_at = ? WHERE id = ? AND version = ? AND state = 'pending' AND ${r.and}`).bind(now, proposalId, proposalVersion, ...r.binds),
          db.prepare(`UPDATE learn_roadmap_steps SET state = 'planned', updated_at = ? WHERE id = ? AND state = 'proposed' AND ${r.and}`).bind(now, proposal.step_id, ...r.binds),
        ],
      }).catch(() => null);
      throw await currentConflict(db, access, roadmapId, 'link_stale');
    }
  }
  const resultId = newId('rs_');
  return applyRoadmapAction(db, access, {
    operation: 'accept_link', actionKey, roadmapId, expectedRevision: revision, parts: [proposalId, proposalVersion, link.card_fingerprint], now,
    guard: { sql: `EXISTS (SELECT 1 FROM learn_step_proposals WHERE id = ? AND version = ? AND roadmap_id = ? AND state = 'pending' AND stale = 0) AND (SELECT state FROM learn_roadmaps WHERE id = ?) = 'active'
      AND (SELECT delivered_count FROM learn_roadmaps WHERE id = ?) < (SELECT ceiling FROM learn_roadmaps WHERE id = ?)`, binds: [proposalId, proposalVersion, roadmapId, roadmapId, roadmapId, roadmapId] },
    outcome: { status: 200, body: { roadmapId, proposalId, proposalVersion, resultId, cardId: link.card_id, billing: 'zero_priced' } },
    statements: r => [
      db.prepare(`INSERT INTO learn_step_results (id, roadmap_id, step_id, proposal_id, proposal_version, org, owner_user_id, board_id, slot_index, card_id, result_version, generation, validation, decision, delivery, billing, delivered_at, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, COALESCE((SELECT MAX(result_version) FROM learn_step_results WHERE org = ? AND owner_user_id = ? AND board_id = ? AND card_id = ?), 0) + 1,
          'generated', 'passed', 'accepted', 'delivered', 'zero_priced', ?, ?, ? WHERE ${r.and}`)
        .bind(resultId, roadmapId, proposal.step_id, proposalId, proposalVersion, ...scope(access), link.card_id, ...scope(access), link.card_id, now, now, now, ...r.binds),
      db.prepare(`UPDATE learn_step_proposals SET state = 'accepted', accepted_at = ?, decided_at = ? WHERE id = ? AND version = ? AND state = 'pending' AND ${r.and}`).bind(now, now, proposalId, proposalVersion, ...r.binds),
      db.prepare(`UPDATE learn_roadmap_steps SET state = 'delivered', updated_at = ? WHERE id = ? AND ${r.and}`).bind(now, proposal.step_id, ...r.binds),
      db.prepare(`UPDATE learn_roadmaps SET delivered_count = delivered_count + 1 WHERE id = ? AND ${r.and}`).bind(roadmapId, ...r.binds),
      eventStatement(db, access, { roadmapId, kind: 'card_delivered', factId: resultId, factRevision: 1, payload: { resultId }, now }, r), // R6's trigger, like any delivery
    ],
  });
}
