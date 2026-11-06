// R4 integration glue: the request-less side of the access object (contracts/api.md 2 and 12). The roadmap job (an outbox event run by the
// RoadmapJobs object) has no signed-in Request, so it rebuilds the access object from the identity stored on the roadmap row and re-verifies the
// board in D1 before every stage. Before R14 the actor owns the board and pays. Source revalidation is the owner branch of authorizeFileSource
// (file-access.js) evaluated against that stored identity; R14 must replace it with a membership check.
import { accessStillValid, readRoadmap } from './roadmap-store.js';

// -> access | null (the roadmap is unknown, or the board no longer belongs to its owner: stop, spend nothing).
// checkBoard: false rebuilds the stored identity without the board test (a refund path must still run after access was revoked).
export async function accessForRoadmap(db, { org, owner_user_id: ownerUserId, board_id: boardId, roadmap_id: roadmapId }, { checkBoard = true } = {}) {
  if (!org || !ownerUserId || !boardId || !roadmapId) return null;
  const row = await db.prepare('SELECT * FROM learn_roadmaps WHERE id = ? AND org = ? AND owner_user_id = ? AND board_id = ?').bind(roadmapId, org, ownerUserId, boardId).first();
  if (!row) return null;
  const access = { org, actorUserId: ownerUserId, actorEmail: row.owner_email, boardId, boardOwnerEmail: row.owner_email, role: 'owner', payerUserId: ownerUserId, app: row.app };
  return !checkBoard || (await accessStillValid(db, access)) ? access : null;
}

// The source file behind a roadmap, as the owner can still read it now: { ok, name } or { ok: false, code }. No Request, no body: only D1.
export async function revalidateSourceAsJob(db, access, roadmap) {
  const m = /^file:([A-Za-z0-9_-]{1,64})$/.exec(String(roadmap?.source_key));
  if (!m) return { ok: false, code: 'source_unavailable' };
  const source = await db.prepare("SELECT name, family, sha256 FROM file_sources WHERE id = ? AND status = 'stored' AND org = ? AND owner_email = ?").bind(m[1], access.org, access.actorEmail).first();
  if (!source || source.family !== 'markdown') return { ok: false, code: 'source_unavailable' };
  if (source.sha256 !== roadmap.source_rev) return { ok: false, code: 'source_changed' };
  return { ok: true, name: source.name };
}

export { readRoadmap };
