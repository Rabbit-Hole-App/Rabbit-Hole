// R6.01: the Auto-suggest preference's fact and its learner-scoped outbox event, as statements for the preference writer's own batch
// (learn-user-settings.js saveAutoSuggest). The event commits with the preference or not at all. Identity = org, learner, kind, fact id and a monotonic
// revision that only a CHANGE of the value advances, so a repeated write of the same value adds nothing and Auto-suggest off -> on -> off is three events.
// Learn migration 0040 owns the table. Nothing here runs unless the caller found both roadmap flags on.
import { runDueRoadmapEvents } from './roadmap-events.js';

export const AUTO_FACT = 'auto_suggest';
export const roadmapAutoEnabled = env => env?.ROADMAP_ENABLED === 'true' && env?.ROADMAP_AUTO_ENABLED === 'true';
const newEventId = () => `ev_${[...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('')}`;

// -> [factUpsert, event]. actor: { org, userId }.
export function autoSuggestFactStatements(db, actor, autoSuggest, now = Math.floor(Date.now() / 1000)) {
  const value = autoSuggest ? 1 : 0;
  return [
    db.prepare(`INSERT INTO learn_roadmap_settings_facts (org, owner_user_id, revision, auto_suggest, updated_at) VALUES (?, ?, 1, ?, ?)
      ON CONFLICT (org, owner_user_id) DO UPDATE SET revision = revision + 1, auto_suggest = excluded.auto_suggest, updated_at = excluded.updated_at WHERE auto_suggest != excluded.auto_suggest`)
      .bind(actor.org, actor.userId, value, now),
    // INSERT OR IGNORE on the unique identity: an unchanged value leaves the revision, so the same event key, so nothing new.
    db.prepare(`INSERT OR IGNORE INTO learn_roadmap_outbox (event_id, org, owner_user_id, scope, board_id, roadmap_id, kind, fact_id, fact_revision, payload_json, next_at, attempts, deadline_at, created_at)
      SELECT ?, f.org, f.owner_user_id, 'learner', '', '', 'settings_changed', ?, f.revision, ?, ?, 0, ?, ? FROM learn_roadmap_settings_facts f WHERE f.org = ? AND f.owner_user_id = ?`)
      .bind(newEventId(), AUTO_FACT, JSON.stringify({ autoSuggest: !!autoSuggest }), now, now + 300, now, actor.org, actor.userId),
  ];
}

// After the preference committed: run this learner's due learner-scope events now (the fan-out into per-roadmap events). The learner scope has no
// board, so no RoadmapJobs object is named for it; the scheduled scan (roadmap-wire.js scheduledRoadmapKick) recovers a failed run. Never throws.
export const runLearnerEvents = (env, actor) => runDueRoadmapEvents(env, { scope: { org: actor.org, ownerUserId: actor.userId, boardId: '' } }).catch(() => 0);
