// UI.06: the Tutor slot's chosen canvas place, private to the actor+board+roadmap, so a pending, generating or failed slot comes back where it stood after a
// reload or a thread change (roadmap 7.4). Stored on the roadmap row (scope_json.slots, the same private seam as tutorThreadId: no migration), never in the
// board, a share, a fork or a thumbnail. Persisted ONCE per offer: a repeat or a later measurement never moves it; a new proposal for the step (after a
// Cancel) is placed afresh. Delivered cards keep their geometry in the ordinary board (dx/dy), which is authoritative from then on.
// Routes (mounted by the lead in roadmap-routes.js): GET /api/learn/roadmap/:rm/slots?boardId= and POST /api/learn/roadmap/:rm/slots { boardId, stepId, proposalId?, x, y, w }.
import { StateError } from './roadmap-contract.js';
import { readRoadmap } from './roadmap-store.js';

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const LIMIT = 1_000_000; // world units: far past any real canvas, small enough that a forged value cannot bloat the row
const coordinate = value => Number.isFinite(value) && Math.abs(value) <= LIMIT;
const slotsOf = roadmap => { try { const slots = JSON.parse(roadmap?.scope_json || '{}')?.slots; return slots && typeof slots === 'object' ? slots : {}; } catch { return {}; } };

export async function readSlots(db, access, roadmapId) {
  const roadmap = await readRoadmap(db, access, roadmapId);
  if (!roadmap) throw new StateError('not_found', 'Not available', 404);
  return { status: 200, body: { roadmapId, slots: slotsOf(roadmap) } };
}

export async function saveSlot(db, access, { roadmapId, stepId, proposalId = null, x, y, w }) {
  if (typeof stepId !== 'string' || !ID.test(stepId) || (proposalId != null && (typeof proposalId !== 'string' || !ID.test(proposalId)))
    || !coordinate(x) || !coordinate(y) || !Number.isFinite(w) || w < 120 || w > 2000) throw new StateError('invalid_request', 'slot', 400);
  const roadmap = await readRoadmap(db, access, roadmapId);
  if (!roadmap) throw new StateError('not_found', 'Not available', 404);
  if (!await db.prepare('SELECT 1 FROM learn_roadmap_steps WHERE id = ? AND roadmap_id = ?').bind(stepId, roadmapId).first()) throw new StateError('not_found', 'Not available', 404);
  const slot = { x: Math.round(x), y: Math.round(y), w: Math.round(w), proposalId };
  // One guarded write: only when the step has no place yet, or its place belongs to another (cancelled) offer. json_set leaves every other key (tutorThreadId) alone.
  const path = `$.slots.${JSON.stringify(stepId)}`;
  await db.prepare(`UPDATE learn_roadmaps SET scope_json = json_set(scope_json, '$.slots', json(coalesce(json_extract(scope_json, '$.slots'), '{}')), ?, json(?))
    WHERE id = ? AND org = ? AND owner_user_id = ? AND board_id = ?
      AND (json_extract(scope_json, ?) IS NULL OR (? IS NOT NULL AND coalesce(json_extract(scope_json, ?), '') != ?))`)
    .bind(path, JSON.stringify(slot), roadmapId, access.org, access.actorUserId, access.boardId, path, proposalId, `${path}.proposalId`, proposalId ?? '').run();
  return { status: 200, body: { roadmapId, stepId, slot: slotsOf(await readRoadmap(db, access, roadmapId))[stepId] ?? null } };
}
