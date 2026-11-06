// packages/control-plane/test/learn-journey-rows.js
// Legacy journey rows for the coaching, attempt and goal-management tests. learn-journey-store.js is deleted (Tutor
// cleanup P4) but the coaching and attempt stores still join learning_journeys until P6a, so these tests seed those rows by
// SQL. ponytail: P6a deletes this file with the joins; the row helpers below are the minimum the tests call.
import { goalForJourneySql } from '../src/learn-coaching-store.js';

export const goalIdOf = journeyId => `lg_${journeyId}`;

const fromRow = r => r && ({ id: r.id, scope: { org: r.org, owner_user_id: r.owner_user_id, app: r.app, board: r.board }, state: r.state, revision: r.revision, archived_at: r.archived_at });

const pointAtJourney = (env, scope, id, now) => env.LEARN_DB.prepare(`INSERT INTO learn_coaching_state (org, owner_user_id, app, board, active_goal_id, active_activity_id, revision, created_at, updated_at)
  SELECT ?, ?, ?, ?, 'lg_' || j.id, NULL, 0, ?, ? FROM learning_journeys j WHERE j.id = ? AND j.board = ? AND j.archived_at IS NULL
  ON CONFLICT (org, owner_user_id, app, board) DO UPDATE SET active_goal_id = excluded.active_goal_id, active_activity_id = NULL, revision = revision + 1, updated_at = excluded.updated_at`)
  .bind(scope.org, scope.owner_user_id, scope.app, scope.board, now, now, id, scope.board);

// The journey the learner replaces becomes a paused goal: its goal row is made if missing, then it is parked.
const parkReplaced = (env, scope, replace, now) => [
  env.LEARN_DB.prepare(goalForJourneySql('j.id = ? AND j.org = ? AND j.owner_user_id = ? AND j.app = ? AND j.board = ? AND j.archived_at IS NULL'))
    .bind(scope.board, now, now, replace, scope.org, scope.owner_user_id, scope.app, scope.board),
  env.LEARN_DB.prepare("UPDATE learning_journeys SET board = 'parked:' || id, updated_at = ?, revision = revision + 1 WHERE id = ? AND org = ? AND owner_user_id = ? AND app = ? AND board = ? AND archived_at IS NULL")
    .bind(now, replace, scope.org, scope.owner_user_id, scope.app, scope.board),
];

// A new journey row (state intake, empty JSON columns), its goal and the coaching pointer, in one batch.
export async function createJourney(env, scope, { request, grounding, intake }, replace = null) {
  const now = new Date().toISOString(), id = `lj_${crypto.randomUUID()}`;
  const { raw_user_message, topic, ...rest } = request;
  const park = replace ? parkReplaced(env, scope, replace, now) : [];
  const insert = env.LEARN_DB.prepare(`INSERT INTO learning_journeys (id, org, owner_user_id, app, board, state, topic, raw_request, request_json, grounding_json, intake_json, constraints_json, pending_edits_json,
    registry_json, diagnostic_json, evidence_json, path_version, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'intake', ?, ?, ?, ?, ?, '[]', '[]', '{"concepts":{},"claims":{}}', '{"probes":[],"asked":[],"skipped":false}', '{"seq":0,"events":[]}', 0, 0, ?, ?) ON CONFLICT DO NOTHING`)
    .bind(id, scope.org, scope.owner_user_id, scope.app, scope.board, topic, raw_user_message, JSON.stringify(rest), JSON.stringify(grounding ?? { kind: 'topic' }), JSON.stringify(intake), now, now);
  const results = await env.LEARN_DB.batch([...park, insert,
    env.LEARN_DB.prepare(goalForJourneySql('j.id = ? AND j.board = ? AND j.archived_at IS NULL')).bind(scope.board, now, now, id, scope.board),
    pointAtJourney(env, scope, id, now)]);
  if (!results[park.length].meta.changes) throw new Error('live_journey');
  return fromRow(await env.LEARN_DB.prepare('SELECT * FROM learning_journeys WHERE id = ?').bind(id).first());
}

// The board's current journey follows the learner's active-goal pointer: the active goal's journey, parked or not, while
// that goal is open; otherwise the one journey live on the board.
export async function loadJourney(env, scope) {
  const pointer = `(SELECT g.journey_id FROM learn_coaching_state s JOIN learn_goals g ON g.id = s.active_goal_id
    WHERE s.org = ?1 AND s.owner_user_id = ?2 AND s.app = ?3 AND s.board = ?4 AND g.lifecycle = 'open')`;
  return fromRow(await env.LEARN_DB
    .prepare(`SELECT j.* FROM learning_journeys j WHERE j.org = ?1 AND j.owner_user_id = ?2 AND j.archived_at IS NULL
      AND (j.id IS ${pointer} OR (j.app = ?3 AND j.board = ?4)) ORDER BY j.id IS ${pointer} DESC LIMIT 1`)
    .bind(scope.org, scope.owner_user_id, scope.app, scope.board).first());
}

export async function loadJourneyById(env, id, scope) {
  return fromRow(await env.LEARN_DB.prepare('SELECT * FROM learning_journeys WHERE id = ? AND org = ? AND owner_user_id = ? AND archived_at IS NULL')
    .bind(id, scope.org, scope.owner_user_id).first());
}

export async function archiveJourney(env, journey, expectedRevision = null) {
  const now = new Date().toISOString(), guarded = expectedRevision != null;
  const row = await env.LEARN_DB.prepare(`UPDATE learning_journeys SET archived_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND org = ? AND owner_user_id = ? AND archived_at IS NULL${guarded ? ' AND revision = ?' : ''} RETURNING id`)
    .bind(now, now, journey.id, journey.scope.org, journey.scope.owner_user_id, ...(guarded ? [expectedRevision] : [])).first();
  if (!row && guarded) throw new Error('journey conflict');
}
