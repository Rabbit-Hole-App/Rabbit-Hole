// packages/control-plane/src/learn-journey-store.js
// Learning journeys on LEARN_DB (learn-migrations/0006, docs/features/adaptive-learning-path-v1-architecture.md §5,
// §9.1-§9.2, §10). A journey row maps to the §9.1 LearningJourney; JSON columns are parsed back on every load. Every
// journey write is conditional on its revision (two tabs: one wins, the other gets JourneyConflict 'revision'), and
// the partial unique index allows one live journey per (org, owner_email, app, board).
//
// The row has no request or grounding column: raw_request and topic hold request.raw_user_message and request.topic,
// and the rest of the request (intent, channel) and the grounding ride in intake_json beside the intake slots.
import { emptyStore, reconcile } from '../../web/src/learn-tutor-evidence.js';

export class JourneyConflict extends Error {
  constructor(code) { super(`journey conflict: ${code}`); this.name = 'JourneyConflict'; this.code = code; }
}

const json = v => (v == null ? null : JSON.stringify(v));
const parse = text => (text == null ? null : JSON.parse(text));

// The columns a save writes (id and scope never change, revision and timestamps are the store's).
function columns(j) {
  const { raw_user_message, topic, ...request } = j.request;
  return {
    state: j.state, topic, raw_request: raw_user_message,
    intake_json: JSON.stringify({ ...j.intake, request, grounding: j.grounding }),
    constraints_json: JSON.stringify(j.constraints), pending_edits_json: JSON.stringify(j.pending_edits),
    registry_json: JSON.stringify(j.registry), diagnostic_json: JSON.stringify(j.diagnostic), evidence_json: JSON.stringify(j.evidence),
    path_version: j.path_version, active_section_id: j.active_section_id ?? null, section_plan_json: json(j.section_plan),
    pending: j.pending ?? null, error_json: json(j.error), paused_json: json(j.paused_for),
  };
}

function fromRow(r) {
  const { request, grounding, ...intake } = JSON.parse(r.intake_json);
  return {
    id: r.id, scope: { org: r.org, owner_email: r.owner_email, app: r.app, board: r.board },
    state: r.state, pending: r.pending, error: parse(r.error_json),
    request: { raw_user_message: r.raw_request, topic: r.topic, ...request }, grounding, intake,
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

// Only the owner's: another account principal gets null, as if the id did not exist.
export async function loadJourneyById(env, id, scope) {
  const row = await env.LEARN_DB
    .prepare('SELECT * FROM learning_journeys WHERE id = ? AND org = ? AND owner_email = ?')
    .bind(id, scope.org, scope.owner_email)
    .first();
  return row && fromRow(row);
}

export async function saveJourney(env, journey, expectedRevision) {
  const cols = columns(journey);
  const row = await env.LEARN_DB
    .prepare(`UPDATE learning_journeys SET ${Object.keys(cols).map(k => `${k} = ?`).join(', ')}, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? RETURNING *`)
    .bind(...Object.values(cols), new Date().toISOString(), journey.id, expectedRevision)
    .first();
  if (!row) throw new JourneyConflict('revision');
  return fromRow(row);
}

export async function archiveJourney(env, journey) {
  const now = new Date().toISOString();
  await env.LEARN_DB.prepare('UPDATE learning_journeys SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL').bind(now, now, journey.id).run();
}

// The version is the path's own (validatePath checks it is the previous + 1); the primary key refuses a version
// written twice. Sets journey.path_version in memory: the caller's saveJourney persists it with the revision.
export async function appendPathVersion(env, journey, path) {
  const stored = { ...path, journey_id: journey.id, created_at: new Date().toISOString() };
  const change = path.change || {};
  await env.LEARN_DB
    .prepare('INSERT INTO learning_path_versions (journey_id, version, path_json, source, reason, evidence_refs, changes_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(journey.id, path.version, JSON.stringify(stored), change.source, change.reason ?? '', JSON.stringify(change.evidence_refs || []), JSON.stringify(change.sections_changed || []), stored.created_at)
    .run();
  journey.path_version = path.version;
  return stored;
}

export async function loadPath(env, journeyId, version = null) {
  const row = version == null
    ? await env.LEARN_DB.prepare('SELECT path_json FROM learning_path_versions WHERE journey_id = ? ORDER BY version DESC LIMIT 1').bind(journeyId).first()
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
// An evaluation that adds nothing (an evaluator error) saves nothing.
export async function appendJourneyEvidence(env, journey, evaluation, ref) {
  const { store, added } = reconcile({ ...emptyStore(), ...journey.evidence }, evaluation, ref);
  if (!added) return { journey, events: journey.evidence.events, seq: journey.evidence.seq };
  const evidence = { seq: store.seq, events: capped(store.events) };
  const saved = await saveJourney(env, { ...journey, evidence }, journey.revision);
  return { journey: saved, events: evidence.events, seq: evidence.seq };
}

// The browser copy: no answer key on any probe option (§9.4), in the diagnostic or the section plan's checks, and no
// raw_request duplicate (request.raw_user_message stays). Task 4's planners may put the key on the probe as `key`.
const scrub = probes => probes?.map(({ key, ...probe }) => (probe.options ? { ...probe, options: probe.options.map(({ correct, misconception_id, ...option }) => option) } : probe));
export function toClient({ raw_request, ...journey }) {
  return {
    ...journey,
    diagnostic: { ...journey.diagnostic, probes: scrub(journey.diagnostic?.probes) },
    section_plan: journey.section_plan && { ...journey.section_plan, checks: scrub(journey.section_plan.checks) },
  };
}
