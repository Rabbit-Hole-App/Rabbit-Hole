// R5.01 proposal edit drafts (learn-migrations/0041). A draft is a PREVIEW of a replacement for one PENDING proposal version. Saving one composes the
// replacement (platform-funded, an injected composeEdit; never a card, never a learner charge) and stores it beside the untouched original. Only
// Apply makes anything real: one guarded batch that requires the original to still be pending and current, consumes the draft once, supersedes the
// original and inserts the next immutable proposal version (pending, or held when its checks did not pass). Accept and Apply race on the same guard,
// so exactly one wins and the loser gets a 409 with the current state. Esc/discard is housekeeping, never the correctness boundary.
import { StateError } from './roadmap-contract.js';
import { applyRoadmapAction, currentConflict, eventStatement, readProposal, readRoadmap, recordedReplay } from './roadmap-store.js';
import { newId, sha256 } from './roadmap-money.js';
import { EDIT_LIMITS, validateEdit } from './roadmap-edit.js';
import { ROADMAP_LIMITS } from './roadmap-policy.js';
import { STRINGS } from '../../../web/src/roadmap-strings.js';

const nowSeconds = () => Math.floor(Date.now() / 1000);
export const DRAFT_TTL_SECONDS = 3600;
export const roadmapEditEnabled = env => env?.ROADMAP_ENABLED === 'true' && env?.ROADMAP_EDIT_ENABLED === 'true';
const SCOPE = 'org = ? AND owner_user_id = ? AND board_id = ?';
const scope = access => [access.org, access.actorUserId, access.boardId];
export const readDraft = (db, access, draftId) => db.prepare(`SELECT * FROM learn_proposal_drafts WHERE id = ? AND ${SCOPE}`).bind(draftId, ...scope(access)).first();
// Words that did not pass the safety screen are never shown back: a held draft carries only its identity and status.
// M1 (owner 2026-11-06): the platform-paid previews are capped, checked BEFORE any screen or model call, so a refused preview costs nothing and writes
// nothing. Counted from the composer's own call rows (stage 'proposal', platformCallModel in roadmap-wire.js): every preview that reached the model,
// whatever it answered; never Apply, Discard, a replayed action key or a call that was never dispatched (planned or released). Per proposal (the
// composer's operation keys name the proposal and its version) and per learner per quota day (ROADMAP_LIMITS.quotas.windowSeconds.day: the UTC day).
const REACHED = "checkpoint NOT IN ('planned', 'released')";
async function refuseOverEditLimit(db, access, { roadmapId, proposal, now }) {
  const prefix = `rm.${roadmapId}.${proposal.version}.${proposal.id}.proposal.`; // ids are [A-Za-z0-9_.-], so ~ sorts after every key under the prefix (no LIKE: D1 limits its pattern)
  const mine = await db.prepare(`SELECT COUNT(*) AS n FROM learn_roadmap_calls WHERE operation_key >= ? AND operation_key < ? AND ${REACHED}`).bind(prefix, `${prefix}~`).first();
  if (mine.n >= EDIT_LIMITS.previewsPerProposal) throw new StateError('edit_limit', STRINGS.editLimitStep, 429);
  const size = ROADMAP_LIMITS.quotas.windowSeconds.day, day = Math.floor(now / size) * size;
  const today = await db.prepare(`SELECT COUNT(*) AS n FROM learn_roadmap_calls WHERE org = ? AND owner_user_id = ? AND stage = 'proposal' AND created_at >= ? AND ${REACHED}`).bind(access.org, access.actorUserId, day).first();
  if (today.n >= EDIT_LIMITS.previewsPerDay) throw new StateError('edit_limit', STRINGS.editLimitDay, 429);
}
const view = d => ({ draftId: d.id, revision: d.revision, proposalId: d.proposal_id, proposalVersion: d.proposal_version, checkStatus: d.check_status,
  ...(d.check_status === 'passed' ? { title: d.title, description: d.description, format: d.format } : {}) });

// composeEdit({ access, roadmap, step, proposal, instruction }) -> { title, description, format } (roadmap-edit.js makeComposeEdit). screen(text, { role, access,
// roadmap, proposal, actionKey }) -> true when the words pass the safety screen (roadmap-edit.js makeProposalScreen: the R4 classifier path). It is required: without
// it nothing is composed (503). The learner's instruction is screened BEFORE composeEdit, so refused words cost no model call; the composed words are screened after.
export async function saveProposalDraft(db, access, { roadmapId, proposalId, proposalVersion, instruction, actionKey, composeEdit, screen, now = nowSeconds() }) {
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
  if (typeof screen !== 'function') throw new StateError('edit_unavailable', 'Editing is not available right now.', 503);
  await refuseOverEditLimit(db, access, { roadmapId, proposal, now });
  const ctx = { access, roadmap, proposal, actionKey };
  if (!(await screen(text, { ...ctx, role: 'learner' }))) throw new StateError('edit_rejected', 'That change could not be made.', 422);
  let edit;
  try { edit = await composeEdit({ access, roadmap, step, proposal, instruction: text }); } catch (error) {
    if (error?.code === 'edit_rejected') throw new StateError('edit_rejected', 'That change could not be made.', 422);
    throw new StateError('edit_unavailable', 'Editing is not available right now.', 503);
  }
  const checked = validateEdit(edit);
  if (!checked.ok) throw new StateError('edit_rejected', 'That change could not be made.', 422);
  const passed = !!(await screen(`${checked.edit.title}\n${checked.edit.description}`, { ...ctx, role: 'output' }));
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
