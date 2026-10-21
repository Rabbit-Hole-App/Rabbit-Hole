-- Tutor coaching state (C:/s/spec/tutor-workflow/draft.md Task 02 and "Progress data schema"; owner decision 5a,
-- 2026-10-20): personal Tutor controls, several resumable goals per learner and canvas with one active pointer, versioned
-- milestone criteria, activities, and the tables the attempt store (Task 05) and assessments (Task 06) fill. Additive and
-- re-runnable, CREATE only (scripts/schema-check.test.mjs: schema identity is a learn migration's identity); LEARN_DB only.
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
CREATE TABLE IF NOT EXISTS learn_goal_criteria (
  goal_id TEXT NOT NULL, scope_version INTEGER NOT NULL, criterion_id TEXT NOT NULL, version INTEGER NOT NULL,
  position INTEGER NOT NULL, label TEXT NOT NULL, requirement TEXT NOT NULL,
  requires_reasoning INTEGER NOT NULL CHECK (requires_reasoning IN (0, 1)), rubric_version TEXT NOT NULL, skill_key TEXT,
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

-- A submitted attempt, immutable once written (Task 05): one per learner-scoped submission key; content_hash is the
-- server's canonical hash of content_json. assistance is the known help the server resolved: none, assisted or unknown.
CREATE TABLE IF NOT EXISTS learn_attempts (
  id TEXT PRIMARY KEY, org TEXT NOT NULL, owner_user_id TEXT NOT NULL,
  goal_id TEXT NOT NULL, activity_id TEXT NOT NULL, activity_revision INTEGER NOT NULL,
  submission_key TEXT NOT NULL, content_json TEXT NOT NULL, content_hash TEXT NOT NULL,
  assistance TEXT NOT NULL DEFAULT 'unknown' CHECK (assistance IN ('none', 'assisted', 'unknown')),
  assistance_refs_json TEXT NOT NULL DEFAULT '[]', source_refs_json TEXT NOT NULL DEFAULT '[]',
  submitted_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS learn_attempts_key ON learn_attempts (org, owner_user_id, submission_key);
CREATE INDEX IF NOT EXISTS learn_attempts_activity ON learn_attempts (activity_id);

-- An assessment operation and its result (Task 06). status is processing, never a grade. claim_token is set once, by
-- the one dispatch allowed to run; a deliberate reassessment is a new row naming the one it supersedes.
CREATE TABLE IF NOT EXISTS learn_assessments (
  id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, org TEXT NOT NULL, owner_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'unavailable', 'failed', 'unknown')),
  rubric_version TEXT, evaluator_version TEXT, provenance_json TEXT NOT NULL DEFAULT '{}',
  observations_json TEXT NOT NULL DEFAULT '[]', uncertainty_json TEXT, error_json TEXT,
  supersedes_assessment_id TEXT, claim_token TEXT, claimed_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS learn_assessments_attempt ON learn_assessments (attempt_id);

-- Which criterion version an observation supports (Task 06 writes, Task 08 reads). One observation can support several
-- criteria; it stays one observation of one attempt.
CREATE TABLE IF NOT EXISTS learn_evidence_links (
  observation_id TEXT NOT NULL, assessment_id TEXT NOT NULL, attempt_id TEXT NOT NULL,
  org TEXT NOT NULL, owner_user_id TEXT NOT NULL, goal_id TEXT NOT NULL, criterion_id TEXT NOT NULL, criterion_version INTEGER NOT NULL,
  applicability TEXT NOT NULL DEFAULT '', validity TEXT NOT NULL DEFAULT 'valid' CHECK (validity IN ('valid', 'disputed', 'superseded')),
  revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (observation_id, goal_id, criterion_id, criterion_version)
);
CREATE INDEX IF NOT EXISTS learn_evidence_links_goal ON learn_evidence_links (org, owner_user_id, goal_id);
