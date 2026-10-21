-- learn 0026-tutor-attempts. Covers Tutor workflow Tasks 05 and 06 (C:/s/spec/tutor-workflow/draft.md, "Progress data
-- schema"; owner decision 5a and integrator ruling Q6, 2026-10-20): submitted attempts, their assessment operations and
-- what each assessment observed.
-- Rules:
--   * Additive and re-runnable, CREATE only (scripts/schema-check.test.mjs). LEARN_DB only. Mirrored in repository-schema.sql.
--   * Applied locally until its learn-dev GO; production waits for its own GO. 0020 stays reserved by fix/chat-save-unique.
--   * Goals, criteria and activities belong to learn 0025 (Task 02). These rows name them by id.
--   * Every row is scoped to owner_user_id (users.id, never an email), and only that learner reads it. A shared or forked
--     canvas carries none of it.
--   * No backfill: no attempt or assessment is made from an old conversation or from journey evidence.

-- A submitted attempt. It is immutable: no statement updates it after the insert.
--   * One row per learner-scoped submission key. A retry with the same content replays it; changed content conflicts.
--   * content_hash is the server's SHA-256 of the canonical submission.
--   * criterion_refs_json freezes the criterion versions the activity named at submission.
--   * assistance is the known help the server resolved.
CREATE TABLE IF NOT EXISTS learn_attempts (
  id TEXT PRIMARY KEY, org TEXT NOT NULL, owner_user_id TEXT NOT NULL, app TEXT NOT NULL, board TEXT NOT NULL,
  goal_id TEXT NOT NULL, activity_id TEXT NOT NULL, activity_revision INTEGER NOT NULL,
  submission_key TEXT NOT NULL, response_kind TEXT NOT NULL,
  content_json TEXT NOT NULL, content_hash TEXT NOT NULL,
  criterion_refs_json TEXT NOT NULL, source_refs_json TEXT NOT NULL,
  assistance TEXT NOT NULL CHECK (assistance IN ('none', 'assisted', 'unknown')), assistance_refs_json TEXT NOT NULL,
  submitted_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS learn_attempts_key ON learn_attempts (org, owner_user_id, submission_key);
CREATE INDEX IF NOT EXISTS learn_attempts_goal ON learn_attempts (org, owner_user_id, goal_id);

-- One assessment operation on an attempt. status is processing, never a grade.
--   * The first operation is written with the attempt, under request_key 'submit'.
--   * A deliberate reassessment is a new row under the learner's own key. It names the operation it supersedes. A retried
--     request finds its existing row.
--   * claim_token is set once, by the one dispatch allowed to call an evaluator.
--   * A claim that never finishes is reconciled to 'unknown' and never retried automatically.
--   * route: which evaluator produced the result.
--   * provenance_json: the evaluator calls (role, requested and served model, reason, latency, usage, cost). Unknown usage
--     is stored as null, never 0.
CREATE TABLE IF NOT EXISTS learn_assessments (
  id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, org TEXT NOT NULL, owner_user_id TEXT NOT NULL,
  request_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'unavailable', 'failed', 'unknown')),
  route TEXT CHECK (route IN ('keyed', 'jev', 'larger')),
  reason TEXT, rubric_version TEXT, evaluator_version TEXT, provenance_json TEXT NOT NULL DEFAULT '{}',
  supersedes_assessment_id TEXT, claim_token TEXT, claimed_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS learn_assessments_request ON learn_assessments (attempt_id, request_key);

-- What one assessment observed about one criterion version: the link from evidence to a criterion.
--   * Rows are written only in the batch that completes their assessment.
--   * A dispute or a supersession is a later, explicit write to validity.
--   * conflict = 1 is an unresolved contradiction, which Progress shows as Needs review.
CREATE TABLE IF NOT EXISTS learn_observations (
  id TEXT PRIMARY KEY, assessment_id TEXT NOT NULL, attempt_id TEXT NOT NULL,
  org TEXT NOT NULL, owner_user_id TEXT NOT NULL, goal_id TEXT NOT NULL,
  criterion_id TEXT NOT NULL, criterion_version INTEGER NOT NULL,
  fit TEXT NOT NULL CHECK (fit IN ('met', 'partial', 'not_met', 'unclear')),
  reasoning TEXT NOT NULL CHECK (reasoning IN ('supported', 'partial', 'missing', 'unclear', 'not_required')),
  assistance TEXT NOT NULL CHECK (assistance IN ('none', 'assisted', 'unknown')),
  validity TEXT NOT NULL DEFAULT 'valid' CHECK (validity IN ('valid', 'disputed', 'superseded')),
  conflict INTEGER NOT NULL DEFAULT 0 CHECK (conflict IN (0, 1)),
  application TEXT NOT NULL DEFAULT 'not_assessed' CHECK (application IN ('not_assessed', 'applied')),
  retention_of TEXT, reason TEXT, observed_at TEXT NOT NULL,
  UNIQUE (assessment_id, criterion_id, criterion_version)
);
CREATE INDEX IF NOT EXISTS learn_observations_goal ON learn_observations (org, owner_user_id, goal_id);
