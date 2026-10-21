-- Tutor coaching state (C:/s/spec/tutor-workflow/draft.md Task 02 and "Progress data schema"; owner decision 5a,
-- 2026-10-20): personal Tutor controls, several resumable goals per learner and canvas with one active pointer, versioned
-- milestone criteria and activities. Attempts, assessments and evidence links are learn 0026 (Tasks 05/06, their own lane
-- and GOs; C:/s/spec/tutor-workflow/migrations.md section 6). Additive and re-runnable, CREATE only
-- (scripts/schema-check.test.mjs: schema identity is a learn migration's identity); LEARN_DB only.
-- Applied locally only until its learn-dev GO; production waits for its own GO. 0020 stays reserved by fix/chat-save-unique.
--
-- Every row is scoped to owner_user_id (users.id, never an email) and only its owner reads or writes it: a shared or forked
-- canvas carries no one's personal state. There is no SQL backfill (a migration is DDL only): the store seeds a learner's
-- row on first use, pointing at the board's live journey as that learner's active goal, before any second goal can exist
-- (learn-coaching-store.js ensureState). No criterion, attempt or evidence is ever made from an old conversation.
-- One journey per board stays live (learning_journeys_live is unchanged); a paused journey-backed goal parks its journey
-- off the board's live index, never archives it (learn-journey-store.js parkJourneySql).

-- One row per learner and canvas: the controls and the active pointer. revision guards every coaching write; last_action_id
-- replays a retried action.
CREATE TABLE IF NOT EXISTS learn_coaching_state (
  org TEXT NOT NULL, owner_user_id TEXT NOT NULL, app TEXT NOT NULL, board TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto', 'ask', 'tutor')),
  tutor_enabled INTEGER NOT NULL DEFAULT 1 CHECK (tutor_enabled IN (0, 1)),
  suggestions_paused INTEGER NOT NULL DEFAULT 0 CHECK (suggestions_paused IN (0, 1)),
  active_goal_id TEXT, active_activity_id TEXT, last_action_id TEXT,
  revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (org, owner_user_id, app, board)
);

-- A goal the learner accepted. Paused is not stored: an open goal the pointer does not name is paused. journey_id links a
-- goal to its adaptive learning journey (one goal per journey); activity_id is the activity a return resumes.
CREATE TABLE IF NOT EXISTS learn_goals (
  id TEXT PRIMARY KEY, org TEXT NOT NULL, owner_user_id TEXT NOT NULL, app TEXT NOT NULL, board TEXT NOT NULL,
  label TEXT NOT NULL, outcome TEXT NOT NULL DEFAULT '', origin TEXT NOT NULL CHECK (origin IN ('coaching', 'journey')),
  scope_version INTEGER NOT NULL DEFAULT 0,
  lifecycle TEXT NOT NULL DEFAULT 'open' CHECK (lifecycle IN ('open', 'completed', 'archived')),
  journey_id TEXT UNIQUE, activity_id TEXT,
  revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS learn_goals_scope ON learn_goals (org, owner_user_id, app, board);

-- A goal's milestone criteria, one set per scope version, never rewritten: a scope change adds the next version's rows.
-- requires_transfer: demonstrated only with a transfer observation (integrator ruling Q1, 2026-10-20).
CREATE TABLE IF NOT EXISTS learn_goal_criteria (
  goal_id TEXT NOT NULL, scope_version INTEGER NOT NULL, criterion_id TEXT NOT NULL, version INTEGER NOT NULL,
  position INTEGER NOT NULL, label TEXT NOT NULL, requirement TEXT NOT NULL,
  requires_reasoning INTEGER NOT NULL CHECK (requires_reasoning IN (0, 1)),
  requires_transfer INTEGER NOT NULL DEFAULT 0 CHECK (requires_transfer IN (0, 1)), rubric_version TEXT NOT NULL, skill_key TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (goal_id, scope_version, criterion_id)
);

-- An activity: the exact task (revision is its prompt version; attempts bind to it) and the step it reached.
CREATE TABLE IF NOT EXISTS learn_activities (
  id TEXT PRIMARY KEY, goal_id TEXT NOT NULL, org TEXT NOT NULL, owner_user_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'awaiting_feedback', 'feedback_ready', 'completed', 'paused', 'skipped')),
  objective TEXT NOT NULL, prompt TEXT NOT NULL, response_kind TEXT NOT NULL,
  criterion_refs_json TEXT NOT NULL DEFAULT '[]', source_refs_json TEXT NOT NULL DEFAULT '[]', checkpoint_json TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS learn_activities_goal ON learn_activities (goal_id);
