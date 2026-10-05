// packages/control-plane/src/learn-journey-store.js
// Learning journeys on LEARN_DB (learn-migrations/0006, docs/features/adaptive-learning-path-v1-architecture.md §5,
// §9.1-§9.2, §10). A journey row maps to the §9.1 LearningJourney; JSON columns are parsed back on every load. Every
// journey write is conditional on its revision (two tabs: one wins, the other gets JourneyConflict 'revision'), an
// archived journey is never written again ('archived'), and the partial unique index allows one live journey per
// (org, owner_email, app, board). The learner's exact words are stored once, in raw_request (request.raw_user_message);
// request_json holds the rest of the request.
import { emptyStore, reconcile } from '../../web/src/learn-tutor-evidence.js';

export class JourneyConflict extends Error {
  constructor(code) { super(`journey conflict: ${code}`); this.name = 'JourneyConflict'; this.code = code; }
}

const json = v => (v == null ? null : JSON.stringify(v));
const parse = text => (text == null ? null : JSON.parse(text));
const text = v => typeof v === 'string' && v.length > 0;

// The columns a save writes (id and scope never change, revision and timestamps are the store's).
function columns(j) {
  const { raw_user_message, topic, ...request } = j.request || {};
  if (!text(raw_user_message) || !text(topic)) throw new TypeError('learning journey: request.raw_user_message and request.topic must be non-empty strings');
  return {
    state: j.state, topic, raw_request: raw_user_message,
    request_json: JSON.stringify(request), grounding_json: JSON.stringify(j.grounding ?? { kind: 'topic' }), intake_json: JSON.stringify(j.intake),
    constraints_json: JSON.stringify(j.constraints), pending_edits_json: JSON.stringify(j.pending_edits),
    registry_json: JSON.stringify(j.registry), diagnostic_json: JSON.stringify(j.diagnostic), evidence_json: JSON.stringify(j.evidence),
    path_version: j.path_version, active_section_id: j.active_section_id ?? null, section_plan_json: json(j.section_plan),
    pending: j.pending ?? null, error_json: json(j.error), paused_json: json(j.paused_for),
  };
}

function fromRow(r) {
  return {
    id: r.id, scope: { org: r.org, owner_email: r.owner_email, app: r.app, board: r.board },
    state: r.state, pending: r.pending, error: parse(r.error_json),
    request: { raw_user_message: r.raw_request, topic: r.topic, ...JSON.parse(r.request_json) },
    grounding: JSON.parse(r.grounding_json), intake: JSON.parse(r.intake_json),
    constraints: JSON.parse(r.constraints_json), pending_edits: JSON.parse(r.pending_edits_json),
    registry: JSON.parse(r.registry_json), diagnostic: JSON.parse(r.diagnostic_json), evidence: JSON.parse(r.evidence_json),
    path_version: r.path_version, active_section_id: r.active_section_id, section_plan: parse(r.section_plan_json),
    paused_for: parse(r.paused_json),
    revision: r.revision, created_at: r.created_at, updated_at: r.updated_at, archived_at: r.archived_at,
  };
}

// A new journey starts in intake. DO NOTHING covers the live index: no row back means this scope already has one.
export async function createJourney(env, scope, { request, grounding, intake }) {
  const now = new Date().toISOString();
  const cols = columns({
    request, grounding, intake, state: 'intake', constraints: [], pending_edits: [],
    registry: { concepts: {}, claims: {} }, diagnostic: { probes: [], asked: [], skipped: false }, evidence: { seq: 0, events: [] },
    path_version: 0,
  });
  const keys = ['id', 'org', 'owner_email', 'app', 'board', ...Object.keys(cols), 'revision', 'created_at', 'updated_at'];
  const row = await env.LEARN_DB
    .prepare(`INSERT INTO learning_journeys (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')}) ON CONFLICT DO NOTHING RETURNING *`)
    .bind(`lj_${crypto.randomUUID()}`, scope.org, scope.owner_email, scope.app, scope.board, ...Object.values(cols), 0, now, now)
    .first();
  if (!row) throw new JourneyConflict('live_journey');
  return fromRow(row);
}

export async function loadJourney(env, scope) {
  const row = await env.LEARN_DB
    .prepare('SELECT * FROM learning_journeys WHERE org = ? AND owner_email = ? AND app = ? AND board = ? AND archived_at IS NULL')
    .bind(scope.org, scope.owner_email, scope.app, scope.board)
    .first();
  return row && fromRow(row);
}

// Only the owner's live journey: another account principal, or an archived journey, gets null.
export async function loadJourneyById(env, id, scope) {
  const row = await env.LEARN_DB
    .prepare('SELECT * FROM learning_journeys WHERE id = ? AND org = ? AND owner_email = ? AND archived_at IS NULL')
    .bind(id, scope.org, scope.owner_email)
    .first();
  return row && fromRow(row);
}

// Every journey write: all columns, revision + 1, only while the row is live and still at the expected revision.
const updateSql = (cols, where = '') => `UPDATE learning_journeys SET ${Object.keys(cols).map(k => `${k} = ?`).join(', ')}, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? AND archived_at IS NULL${where}`;
// Why a conditional write missed, read from the stored row: the journey was archived, its stored path_version is not
// the one the new path follows (the revision matched), or its revision moved.
async function conflict(env, id, revision) {
  const row = await env.LEARN_DB.prepare('SELECT revision, archived_at FROM learning_journeys WHERE id = ?').bind(id).first();
  return new JourneyConflict(row?.archived_at ? 'archived' : row?.revision === revision ? 'path_version' : 'revision');
}

export async function saveJourney(env, journey, expectedRevision) {
  const cols = columns(journey);
  const row = await env.LEARN_DB
    .prepare(`${updateSql(cols)} RETURNING *`)
    .bind(...Object.values(cols), new Date().toISOString(), journey.id, expectedRevision)
    .first();
  if (!row) throw await conflict(env, journey.id, expectedRevision);
  return fromRow(row);
}

// Bumps the revision too, so a tab still holding the live journey gets a conflict, never a silent write. With
// expectedRevision the archive is conditional like every other write: a journey that moved throws JourneyConflict.
export async function archiveJourney(env, journey, expectedRevision = null) {
  const now = new Date().toISOString(), guarded = expectedRevision != null;
  const row = await env.LEARN_DB.prepare(`UPDATE learning_journeys SET archived_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND archived_at IS NULL${guarded ? ' AND revision = ?' : ''} RETURNING id`)
    .bind(now, now, journey.id, ...(guarded ? [expectedRevision] : [])).first();
  if (!row && guarded) throw await conflict(env, journey.id, expectedRevision);
}

// One atomic batch: the immutable path row and the whole journey row (every other change the caller made, with
// path_version = path.version). Both are conditional on the STORED journey being live, at expectedRevision and at
// path_version = path.version - 1, so a stale call writes neither - no orphan path row - and a retry with the fresh
// revision inserts cleanly. The passed journey may be before or after journeyStep(path_drafted), which already sets
// path_version to the new version; any other path_version is a caller bug.
export async function appendPathVersion(env, journey, path, expectedRevision) {
  if (!path?.change || !text(path.change.source)) throw new TypeError('learning path: path.change with a source is required');
  if (!Number.isInteger(path.version) || ![path.version - 1, path.version].includes(journey.path_version)) throw new JourneyConflict('path_version');
  const now = new Date().toISOString();
  const stored = { ...path, journey_id: journey.id, created_at: now };
  const { change } = path;
  const cols = columns({ ...journey, path_version: path.version });
  const live = [journey.id, expectedRevision, path.version - 1];
  const [, updated] = await env.LEARN_DB.batch([
    env.LEARN_DB
      .prepare('INSERT INTO learning_path_versions (journey_id, version, path_json, source, reason, evidence_refs, changes_json, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM learning_journeys WHERE id = ? AND revision = ? AND path_version = ? AND archived_at IS NULL)')
      .bind(journey.id, path.version, JSON.stringify(stored), change.source, change.reason ?? '', JSON.stringify(change.evidence_refs || []), JSON.stringify(change.sections_changed || []), now, ...live),
    env.LEARN_DB.prepare(updateSql(cols, ' AND path_version = ?')).bind(...Object.values(cols), now, ...live),
  ]);
  if (!updated.meta.changes) throw await conflict(env, journey.id, expectedRevision);
  const row = await env.LEARN_DB.prepare('SELECT * FROM learning_journeys WHERE id = ?').bind(journey.id).first();
  return { journey: fromRow(row), path: stored };
}

// The latest is the version the journey names (path_version), not the highest row.
export async function loadPath(env, journeyId, version = null) {
  const row = version == null
    ? await env.LEARN_DB.prepare('SELECT p.path_json FROM learning_path_versions p JOIN learning_journeys j ON j.id = p.journey_id AND j.path_version = p.version WHERE p.journey_id = ?').bind(journeyId).first()
    : await env.LEARN_DB.prepare('SELECT path_json FROM learning_path_versions WHERE journey_id = ? AND version = ?').bind(journeyId, version).first();
  return row && JSON.parse(row.path_json);
}

// ponytail: 500 events per journey; past that the oldest unsettled events go first, then the oldest settled ones.
// Move evidence to its own table if real journeys reach the cap.
const MAX_EVENTS = 500;
function capped(events) {
  const over = events.length - MAX_EVENTS;
  if (over <= 0) return events;
  const unsettled = events.filter(e => !e.settled).slice(0, over);
  const drop = new Set([...unsettled, ...events.filter(e => e.settled).slice(0, over - unsettled.length)]);
  return events.filter(e => !drop.has(e));
}

// The ONLY journey evidence writer (§5). reconcile() is used as it is (R6): its event writes do not depend on the
// registry, and its nanoGPT-scoped states and transitions are ignored here until Task 7 passes the journey's claims.
// An evaluation that adds nothing (an evaluator error) saves nothing. ref is stored verbatim on every event: callers
// must never put learner text (the message) in it.
export async function appendJourneyEvidence(env, journey, evaluation, ref) {
  const { store, added } = reconcile({ ...emptyStore(), ...journey.evidence }, evaluation, ref);
  if (!added) return { journey, events: journey.evidence.events, seq: journey.evidence.seq };
  const evidence = { seq: store.seq, events: capped(store.events) };
  const saved = await saveJourney(env, { ...journey, evidence }, journey.revision);
  return { journey: saved, events: evidence.events, seq: evidence.seq };
}

// The browser copy: no answer key on any probe (§9.4: the probe-level `key { correct, misconceptions }`; option-level
// correct / misconception_id are stripped too), in the diagnostic or the section plan's checks, and no raw_request
// duplicate (request.raw_user_message stays).
const scrub = probes => probes?.map(({ key, ...probe }) => (probe.options ? { ...probe, options: probe.options.map(({ correct, misconception_id, ...option }) => option) } : probe));
export function toClient({ raw_request, ...journey }) {
  return {
    ...journey,
    diagnostic: { ...journey.diagnostic, probes: scrub(journey.diagnostic?.probes) },
    section_plan: journey.section_plan && { ...journey.section_plan, checks: scrub(journey.section_plan.checks) },
  };
}
