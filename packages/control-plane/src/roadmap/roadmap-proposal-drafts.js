// R5.01 proposal edit drafts (learn-migrations/0041). A draft is a PREVIEW of a replacement for one PENDING proposal version. Saving one composes the
// replacement (platform-funded, an injected composeEdit; never a card, never a learner charge) and stores it beside the untouched original. Only
// Apply makes anything real: one guarded batch that requires the original to still be pending and current, consumes the draft once, supersedes the
// original and inserts the next immutable proposal version (pending, or held when its checks did not pass). Accept and Apply race on the same guard,
// so exactly one wins and the loser gets a 409 with the current state. Esc/discard is housekeeping, never the correctness boundary.
import { StateError } from './roadmap-contract.js';
import { applyRoadmapAction, currentConflict, eventStatement, readProposal, readRoadmap, recordedReplay } from './roadmap-store.js';
import { newId, sha256 } from './roadmap-money.js';
import { EDIT_LIMITS, validateEdit } from './roadmap-edit.js';

const nowSeconds = () => Math.floor(Date.now() / 1000);
export const DRAFT_TTL_SECONDS = 3600;
export const roadmapEditEnabled = env => env?.ROADMAP_ENABLED === 'true' && env?.ROADMAP_EDIT_ENABLED === 'true';
const SCOPE = 'org = ? AND owner_user_id = ? AND board_id = ?';
const scope = access => [access.org, access.actorUserId, access.boardId];
export const readDraft = (db, access, draftId) => db.prepare(`SELECT * FROM learn_proposal_drafts WHERE id = ? AND ${SCOPE}`).bind(draftId, ...scope(access)).first();
const view = d => ({ draftId: d.id, revision: d.revision, proposalId: d.proposal_id, proposalVersion: d.proposal_version, title: d.title, description: d.description, format: d.format, checkStatus: d.check_status });

// composeEdit({ access, roadmap, step, proposal, instruction }) -> { title, description, format } (roadmap-edit.js makeComposeEdit). screen(text) -> true when the
// words pass the safety screen; absent, every validated edit passes (ponytail: the R4 classifier is not yet wired to proposal text).
export async function saveProposalDraft(db, access, { roadmapId, proposalId, proposalVersion, instruction, actionKey, composeEdit, screen = null, now = nowSeconds() }) {
  const text = typeof instruction === 'string' ? instruction.trim() : '';
  if (!text || text.length > EDIT_LIMITS.instruction) throw new StateError('invalid_request', 'instruction is required', 400);
  const roadmap = await readRoadmap(db, access, roadmapId), proposal = await readProposal(db, access, proposalId);
  if (!roadmap || !proposal || proposal.roadmap_id !== roadmapId) throw new StateError('not_found', 'Not available', 404);
  const parts = [proposalId, proposalVersion, await sha256(text)];
  // A repeated action key returns the same draft BEFORE any platform work is reserved.
  const replay = await recordedReplay(db, access, { operation: 'save_proposal_draft', actionKey, parts });
  if (replay) return replay;
  if (proposal.version !== proposalVersion || proposal.state !== 'pending' || proposal.stale || roadmap.state !== 'active') throw await currentConflict(db, access, roadmapId, 'proposal_not_pending');
  const step = await db.prepare('SELECT * FROM learn_roadmap_steps WHERE id = ?').bind(proposal.step_id).first();
  let edit;
  try { edit = await composeEdit({ access, roadmap, step, proposal, instruction: text }); } catch (error) {
    if (error?.code === 'edit_rejected') throw new StateError('edit_rejected', 'That change could not be made.', 422);
    throw new StateError('edit_unavailable', 'Editing is not available right now.', 503);
  }
  const checked = validateEdit(edit);
  if (!checked.ok) throw new StateError('edit_rejected', 'That change could not be made.', 422);
  const passed = screen ? !!(await screen(`${checked.edit.title}\n${checked.edit.description}`)) : true;
  const draft = { id: newId('pd_'), revision: 1, proposal_id: proposalId, proposal_version: proposalVersion, ...checked.edit, check_status: passed ? 'passed' : 'held' };
  return applyRoadmapAction(db, access, {
    operation: 'save_proposal_draft', actionKey, parts, bump: false, now, // a preview: the roadmap row does not change
    guard: { sql: "EXISTS (SELECT 1 FROM learn_step_proposals WHERE id = ? AND version = ? AND state = 'pending' AND stale = 0 AND content_hash = ?)", binds: [proposalId, proposalVersion, proposal.content_hash] },
    outcome: { status: 200, body: view(draft) },
    statements: r => [
      db.prepare(`UPDATE learn_proposal_drafts SET state = 'discarded' WHERE proposal_id = ? AND proposal_version = ? AND state = 'draft' AND ${r.and}`).bind(proposalId, proposalVersion, ...r.binds),
      db.prepare(`INSERT INTO learn_proposal_drafts (id, roadmap_id, step_id, proposal_id, proposal_version, org, owner_user_id, board_id, input_fingerprint, instruction, revision, format, title, description, check_status, state, expires_at, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'draft', ?, ? WHERE ${r.and}`)
        .bind(draft.id, roadmapId, proposal.step_id, proposalId, proposalVersion, ...scope(access), proposal.content_hash, text, draft.format, draft.title, draft.description, draft.check_status, now + DRAFT_TTL_SECONDS, now, ...r.binds),
    ],
  });
}

// Apply: the draft becomes the next proposal version. -> { status, body: { proposalId, version, state } }.
export async function applyProposalDraft(db, access, { roadmapId, draftId, draftRevision, proposalVersion, actionKey, now = nowSeconds() }) {
  const draft = await readDraft(db, access, draftId);
  if (!draft || draft.roadmap_id !== roadmapId) throw new StateError('not_found', 'Not available', 404);
  const parts = [draftId, draftRevision, proposalVersion];
  const replay = await recordedReplay(db, access, { operation: 'apply_proposal_draft', actionKey, roadmapId, parts });
  if (replay) return replay;
  const roadmap = await readRoadmap(db, access, roadmapId), proposal = await readProposal(db, access, draft.proposal_id);
  if (draft.state !== 'draft' || draft.revision !== draftRevision || draft.expires_at <= now || !proposal || proposal.version !== draft.proposal_version || proposalVersion !== draft.proposal_version
    || proposal.state !== 'pending' || proposal.stale || proposal.content_hash !== draft.input_fingerprint || roadmap?.state !== 'active') throw await currentConflict(db, access, roadmapId, 'proposal_not_pending');
  const last = await db.prepare('SELECT MAX(version) AS v FROM learn_step_proposals WHERE step_id = ?').bind(proposal.step_id).first();
  const version = (last?.v || 0) + 1, id = newId('pr_'), state = draft.check_status === 'passed' ? 'pending' : 'held';
  const contentHash = await sha256(JSON.stringify([proposal.step_id, draft.title, draft.description, draft.format, roadmap.scope_fingerprint, roadmap.depth, draft.id]));
  return applyRoadmapAction(db, access, {
    operation: 'apply_proposal_draft', actionKey, roadmapId, expectedRevision: roadmap.revision, parts, uniqueCode: 'proposal_not_pending', now,
    guard: { sql: `EXISTS (SELECT 1 FROM learn_step_proposals WHERE id = ? AND version = ? AND state = 'pending' AND stale = 0 AND content_hash = ?) AND (SELECT state FROM learn_roadmaps WHERE id = ?) = 'active'
      AND EXISTS (SELECT 1 FROM learn_proposal_drafts WHERE id = ? AND state = 'draft' AND revision = ? AND expires_at > ?)`, binds: [proposal.id, proposal.version, proposal.content_hash, roadmapId, draftId, draftRevision, now] },
    outcome: { status: 200, body: { roadmapId, proposalId: id, version, state } },
    statements: r => [
      db.prepare(`UPDATE learn_step_proposals SET state = 'superseded', decided_at = ? WHERE id = ? AND version = ? AND state = 'pending' AND ${r.and}`).bind(now, proposal.id, proposal.version, ...r.binds),
      db.prepare(`INSERT INTO learn_step_proposals (id, roadmap_id, step_id, org, owner_user_id, board_id, version, state, format, title, description, source_ref_id, content_hash, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${r.and}`).bind(id, roadmapId, proposal.step_id, ...scope(access), version, state, draft.format, draft.title, draft.description, proposal.source_ref_id ?? null, contentHash, now, ...r.binds),
      db.prepare(`UPDATE learn_proposal_drafts SET state = 'applied', applied_at = ? WHERE id = ? AND state = 'draft' AND ${r.and}`).bind(now, draftId, ...r.binds),
      eventStatement(db, access, { roadmapId, kind: 'proposal_edited', factId: id, factRevision: version, payload: { proposalId: id, version }, now }, r),
    ],
  });
}

// Esc: housekeeping. Idempotent; an unknown or already-applied draft changes nothing.
export async function discardProposalDraft(db, access, { roadmapId, draftId }) {
  const draft = await readDraft(db, access, draftId);
  if (!draft || draft.roadmap_id !== roadmapId) throw new StateError('not_found', 'Not available', 404);
  await db.prepare("UPDATE learn_proposal_drafts SET state = 'discarded' WHERE id = ? AND state = 'draft'").bind(draftId).run();
  return { status: 200, body: { draftId, state: draft.state === 'draft' ? 'discarded' : draft.state } };
}

// Drafts past their time, or whose proposal version is no longer pending (accepted, cancelled, superseded), stop being live. Bounded, scheduler-run.
export async function sweepProposalDrafts(db, { now = nowSeconds() } = {}) {
  const expired = await db.prepare("UPDATE learn_proposal_drafts SET state = 'expired' WHERE state = 'draft' AND expires_at <= ?").bind(now).run();
  const stale = await db.prepare(`UPDATE learn_proposal_drafts SET state = 'discarded' WHERE state = 'draft'
    AND NOT EXISTS (SELECT 1 FROM learn_step_proposals p WHERE p.id = learn_proposal_drafts.proposal_id AND p.version = learn_proposal_drafts.proposal_version AND p.state = 'pending')`).run();
  return { expired: expired.meta?.changes ?? 0, discarded: stale.meta?.changes ?? 0 };
}
