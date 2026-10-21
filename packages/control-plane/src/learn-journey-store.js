// packages/control-plane/src/learn-journey-store.js
// Learning journeys on LEARN_DB (learn-migrations/0006, docs/features/adaptive-learning-path-v1-architecture.md §5,
// §9.1-§9.2, §10). A journey row maps to the §9.1 LearningJourney; JSON columns are parsed back on every load. Every
// journey write is conditional on its revision (two tabs: one wins, the other gets JourneyConflict 'revision'), an
// archived journey is never written again ('archived'), and the partial unique index allows one live journey per
// (org, owner_user_id, app, board), owner_user_id being users.id (§10.2), never an email: it stays on the server (toClient
// drops it). The learner's exact words are stored once, in raw_request (request.raw_user_message);
// request_json holds the rest of the request. Since learn-migrations/0025 each journey is also a Tutor goal and the board's
// current journey follows the learner's active-goal pointer (loadJourney).
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
    id: r.id, scope: { org: r.org, owner_user_id: r.owner_user_id, app: r.app, board: r.board },
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

// Tutor goals (learn-migrations/0025, owner decision 5a): every journey is one learner goal, 'lg_' + its id, and the
// learner's coaching row (learn_coaching_state) points at the active goal. One journey per board stays live
// (learning_journeys_live is unchanged); a paused journey-backed goal's journey is PARKED under board 'parked:<id>', which
// no request can name (BOARD refuses ':'), so it leaves the board's live index without being archived and stays
// resumable. Older code that reads a board's live journey never sees a parked one.
export const goalIdOf = journeyId => `lg_${journeyId}`;
// The goal row of every journey matching `where` (its binds follow board, now, now); DO NOTHING keeps an existing one.
// No criterion or evidence is made: a legacy journey's goal has scope_version 0 until the learner accepts criteria.
export const goalForJourneySql = where => `INSERT INTO learn_goals (id, org, owner_user_id, app, board, label, outcome, origin, scope_version, lifecycle, journey_id, activity_id, revision, created_at, updated_at)
  SELECT 'lg_' || j.id, j.org, j.owner_user_id, j.app, ?, j.topic, '', 'journey', 0, 'open', j.id, NULL, 0, ?, ? FROM learning_journeys j WHERE ${where} ON CONFLICT DO NOTHING`;
// Point the learner's coaching row at a journey's goal (made if missing), only when that journey is live on the board.
const pointAtJourney = (env, scope, id, now) => env.LEARN_DB.prepare(`INSERT INTO learn_coaching_state (org, owner_user_id, app, board, active_goal_id, active_activity_id, revision, created_at, updated_at)
  SELECT ?, ?, ?, ?, 'lg_' || j.id, NULL, 0, ?, ? FROM learning_journeys j WHERE j.id = ? AND j.board = ? AND j.archived_at IS NULL
  ON CONFLICT (org, owner_user_id, app, board) DO UPDATE SET active_goal_id = excluded.active_goal_id, active_activity_id = NULL, revision = revision + 1, updated_at = excluded.updated_at`)
  .bind(scope.org, scope.owner_user_id, scope.app, scope.board, now, now, id, scope.board);
// A journey made or swapped onto the board becomes the learner's active goal in the same batch.
const registerGoal = (env, scope, id, now) => [
  env.LEARN_DB.prepare(goalForJourneySql('j.id = ? AND j.board = ? AND j.archived_at IS NULL')).bind(scope.board, now, now, id, scope.board),
  pointAtJourney(env, scope, id, now),
];
// Park every journey live on the board except keepId (null: all), and unpark one, as the coaching store's goal switch
// does. guard is an SQL condition with its binds, so the whole switch applies only at the expected coaching revision.
export const parkJourneySql = guard => `UPDATE learning_journeys SET board = 'parked:' || id, updated_at = ?, revision = revision + 1
  WHERE org = ? AND owner_user_id = ? AND app = ? AND board = ? AND archived_at IS NULL AND id IS NOT ? AND ${guard}`;
export const unparkJourneySql = guard => `UPDATE learning_journeys SET board = ?, updated_at = ?, revision = revision + 1
  WHERE id = ? AND org = ? AND owner_user_id = ? AND app = ? AND board = 'parked:' || id AND archived_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM learning_journeys WHERE org = ? AND owner_user_id = ? AND app = ? AND board = ? AND archived_at IS NULL) AND ${guard}`;

// A new journey starts in intake. DO NOTHING covers the live index: no row made means this scope already has one.
// replace (continue-or-start, owner 2026-10-07): the id of the live journey the learner chose to replace. It is archived in
// the same batch (one transaction) as the insert, so a start that fails leaves it live; an id that is not this scope's live
// journey archives nothing, and the insert then meets whatever journey is live (live_journey). The new journey becomes the
// learner's active goal in that batch too; a staged row (stagedScope) does so only when activateStaged swaps it in.
export async function createJourney(env, scope, { request, grounding, intake }, replace = null) {
  const now = new Date().toISOString(), id = `lj_${crypto.randomUUID()}`;
  const cols = columns({
    request, grounding, intake, state: 'intake', constraints: [], pending_edits: [],
    registry: { concepts: {}, claims: {} }, diagnostic: { probes: [], asked: [], skipped: false }, evidence: { seq: 0, events: [] },
    path_version: 0,
  });
  const keys = ['id', 'org', 'owner_user_id', 'app', 'board', ...Object.keys(cols), 'revision', 'created_at', 'updated_at'];
  const insert = env.LEARN_DB
    .prepare(`INSERT INTO learning_journeys (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')}) ON CONFLICT DO NOTHING`)
    .bind(id, scope.org, scope.owner_user_id, scope.app, scope.board, ...Object.values(cols), 0, now, now);
  const archive = replace && env.LEARN_DB.prepare('UPDATE learning_journeys SET archived_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND org = ? AND owner_user_id = ? AND app = ? AND board = ? AND archived_at IS NULL')
    .bind(now, now, replace, scope.org, scope.owner_user_id, scope.app, scope.board);
  const results = await env.LEARN_DB.batch([...(archive ? [archive] : []), insert, ...(scope.board.startsWith('staged:') ? [] : registerGoal(env, scope, id, now))]);
  const row = results[archive ? 1 : 0].meta.changes ? await env.LEARN_DB.prepare('SELECT * FROM learning_journeys WHERE id = ?').bind(id).first() : null;
  if (!row) throw new JourneyConflict('live_journey');
  return fromRow(row);
}

// Owner 2026-10-07 (D2): a fast start that replaces the live journey is planned before the swap. Its row is made under the
// board's staged name, which no request can name (the route's BOARD refuses ':'), so it sits outside the board's live index
// and the old journey stays the board's live one, its progress untouched, while the planners run. Every write keys on the
// row id (OWNED), so the effect chain runs on a staged row unchanged.
export const stagedScope = scope => ({ ...scope, board: `staged:${scope.board}` });

// The board's staged rows and their path versions: a failed plan's, or one a cancelled worker left, so a Retry never meets
// a leftover.
export async function dropStaged(env, scope) {
  const where = 'org = ? AND owner_user_id = ? AND app = ? AND board = ?', at = [scope.org, scope.owner_user_id, scope.app, stagedScope(scope).board];
  await env.LEARN_DB.batch([
    env.LEARN_DB.prepare(`DELETE FROM learning_path_versions WHERE journey_id IN (SELECT id FROM learning_journeys WHERE ${where})`).bind(...at),
    env.LEARN_DB.prepare(`DELETE FROM learning_journeys WHERE ${where}`).bind(...at),
  ]);
}

// The swap, one batch: the replaced journey archived, then the planned staged row moved onto the board while no journey is
// live there. null: another journey went live on the board meanwhile (another tab), so nothing changed.
export async function activateStaged(env, staged, replace, scope) {
  const now = new Date().toISOString(), board = [scope.org, scope.owner_user_id, scope.app, scope.board];
  const [, moved] = await env.LEARN_DB.batch([
    env.LEARN_DB.prepare('UPDATE learning_journeys SET archived_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND org = ? AND owner_user_id = ? AND app = ? AND board = ? AND archived_at IS NULL')
      .bind(now, now, replace, ...board),
    env.LEARN_DB.prepare(`UPDATE learning_journeys SET board = ?, updated_at = ? WHERE ${OWNED} AND archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM learning_journeys WHERE org = ? AND owner_user_id = ? AND app = ? AND board = ? AND archived_at IS NULL)`)
      .bind(scope.board, now, ...owned(staged), ...board),
    ...registerGoal(env, scope, staged.id, now),
  ]);
  if (!moved.meta.changes) return null;
  return fromRow(await env.LEARN_DB.prepare('SELECT * FROM learning_journeys WHERE id = ?').bind(staged.id).first());
}

// The board's current journey follows the learner's active-goal pointer (Task 02): the active goal's journey, parked or
// not, while that goal is open; otherwise the one journey live on the board (a learner with no coaching row yet, or one
// made by older code). A parked journey of a paused goal is never returned by the board.
export async function loadJourney(env, scope) {
  const pointer = `(SELECT g.journey_id FROM learn_coaching_state s JOIN learn_goals g ON g.id = s.active_goal_id
    WHERE s.org = ?1 AND s.owner_user_id = ?2 AND s.app = ?3 AND s.board = ?4 AND g.lifecycle = 'open')`;
  const row = await env.LEARN_DB
    .prepare(`SELECT j.* FROM learning_journeys j WHERE j.org = ?1 AND j.owner_user_id = ?2 AND j.archived_at IS NULL
      AND (j.id IS ${pointer} OR (j.app = ?3 AND j.board = ?4)) ORDER BY j.id IS ${pointer} DESC LIMIT 1`)
    .bind(scope.org, scope.owner_user_id, scope.app, scope.board)
    .first();
  return row && fromRow(row);
}

// Only the owner's live journey: another user id, or an archived journey, gets null.
export async function loadJourneyById(env, id, scope) {
  const row = await env.LEARN_DB
    .prepare('SELECT * FROM learning_journeys WHERE id = ? AND org = ? AND owner_user_id = ? AND archived_at IS NULL')
    .bind(id, scope.org, scope.owner_user_id)
    .first();
  return row && fromRow(row);
}

// Every journey write: all columns, revision + 1, only while the row is live, still at the expected revision, and still
// the journey's own scope (OWNED: defence in depth, §10.2 - a journey object scoped to another account writes nothing).
const OWNED = 'id = ? AND org = ? AND owner_user_id = ?';
const owned = j => [j.id, j.scope?.org ?? null, j.scope?.owner_user_id ?? null];
const updateSql = (cols, where = '') => `UPDATE learning_journeys SET ${Object.keys(cols).map(k => `${k} = ?`).join(', ')}, revision = revision + 1, updated_at = ? WHERE ${OWNED} AND revision = ? AND archived_at IS NULL${where}`;
// Why a conditional write missed, read from the stored row: it is not this journey's scope ('not_owner', checked first so
// nothing about another account's journey shows), the journey was archived, its stored path_version is not the one the
// new path follows (the revision matched), or its revision moved.
async function conflict(env, journey, revision) {
  const row = await env.LEARN_DB.prepare('SELECT org, owner_user_id, revision, archived_at FROM learning_journeys WHERE id = ?').bind(journey.id).first();
  const [, org, owner] = owned(journey);
  if (row && (row.org !== org || row.owner_user_id !== owner)) return new JourneyConflict('not_owner');
  return new JourneyConflict(row?.archived_at ? 'archived' : row?.revision === revision ? 'path_version' : 'revision');
}

export async function saveJourney(env, journey, expectedRevision) {
  const cols = columns(journey);
  const row = await env.LEARN_DB
    .prepare(`${updateSql(cols)} RETURNING *`)
    .bind(...Object.values(cols), new Date().toISOString(), ...owned(journey), expectedRevision)
    .first();
  if (!row) throw await conflict(env, journey, expectedRevision);
  return fromRow(row);
}

// Bumps the revision too, so a tab still holding the live journey gets a conflict, never a silent write. With
// expectedRevision the archive is conditional like every other write: a journey that moved throws JourneyConflict.
export async function archiveJourney(env, journey, expectedRevision = null) {
  const now = new Date().toISOString(), guarded = expectedRevision != null;
  const row = await env.LEARN_DB.prepare(`UPDATE learning_journeys SET archived_at = ?, updated_at = ?, revision = revision + 1 WHERE ${OWNED} AND archived_at IS NULL${guarded ? ' AND revision = ?' : ''} RETURNING id`)
    .bind(now, now, ...owned(journey), ...(guarded ? [expectedRevision] : [])).first();
  if (!row && guarded) throw await conflict(env, journey, expectedRevision);
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
  const live = [...owned(journey), expectedRevision, path.version - 1];
  const [, updated] = await env.LEARN_DB.batch([
    env.LEARN_DB
      .prepare(`INSERT INTO learning_path_versions (journey_id, version, path_json, source, reason, evidence_refs, changes_json, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM learning_journeys WHERE ${OWNED} AND revision = ? AND path_version = ? AND archived_at IS NULL)`)
      .bind(journey.id, path.version, JSON.stringify(stored), change.source, change.reason ?? '', JSON.stringify(change.evidence_refs || []), JSON.stringify(change.sections_changed || []), now, ...live),
    env.LEARN_DB.prepare(updateSql(cols, ' AND path_version = ?')).bind(...Object.values(cols), now, ...live),
  ]);
  if (!updated.meta.changes) throw await conflict(env, journey, expectedRevision);
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

// The ONLY journey evidence writer (§5). reconcile() runs over the journey's own registry, so states (every registry
// claim, the locked derivation) and transitions are the journey's. An evaluation that adds nothing (an evaluator error)
// saves nothing. ref is stored verbatim on every event: callers must never put learner text (the message) in it.
// ponytail: at the 500-event cap, states are derived before the oldest events drop; derive again if that ever matters.
export async function appendJourneyEvidence(env, journey, evaluation, ref) {
  const { store, states, transitions, added } = reconcile({ ...emptyStore(), ...journey.evidence }, evaluation, ref, journey.registry.claims);
  if (!added) return { journey, events: journey.evidence.events, seq: journey.evidence.seq, states, transitions };
  const evidence = { seq: store.seq, events: capped(store.events) };
  const saved = await saveJourney(env, { ...journey, evidence }, journey.revision);
  return { journey: saved, events: evidence.events, seq: evidence.seq, states, transitions };
}

// The browser copy: no answer key on any probe (§9.4: the probe-level `key { correct, misconceptions }`; option-level
// correct / misconception_id are stripped too), in the diagnostic or the section plan's checks, no raw_request
// duplicate (request.raw_user_message stays), and no owner_user_id (users.id never leaves the server, §10.2).
const scrub = probes => probes?.map(({ key, ...probe }) => (probe.options ? { ...probe, options: probe.options.map(({ correct, misconception_id, ...option }) => option) } : probe));
export function toClient({ raw_request, scope: { owner_user_id, ...scope }, ...journey }) {
  return {
    ...journey, scope,
    diagnostic: { ...journey.diagnostic, probes: scrub(journey.diagnostic?.probes) },
    section_plan: journey.section_plan && { ...journey.section_plan, checks: scrub(journey.section_plan.checks) },
  };
}
