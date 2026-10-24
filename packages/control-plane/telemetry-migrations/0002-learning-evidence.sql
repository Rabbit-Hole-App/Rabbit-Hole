-- Learning evidence projections (docs/features/telemetry.md "Tutor evidence"; brief Task 12; owner decisions A to F, 2026-10-23).
-- Read-only copies, by id, of the Tutor's own records in LEARN_DB (learn 0025 and 0026), rebuildable from scratch at any time
-- (telemetry-learning-projection.js). Only ids, enums, counts, versions and times are copied: never content_json (the learner's
-- answer), source or assistance references, goal or criterion text, an activity's objective or prompt, an assessment's free reason,
-- or the raw provenance. Nothing here decides or changes a Tutor outcome; the product's records stay the authority. Additive and
-- re-runnable. The *_s columns are unix seconds of the product's ISO timestamps, for window queries.
-- AI assessed is not verified: route says how an outcome was produced (keyed = a deterministic rubric match; jev and larger = AI
-- evaluators) and evaluator_version which build. Human-reviewed grading quality is deliberately UNAVAILABLE here (decision E): no
-- reviewer, sampling rule or permitted evidence is defined, so no review table exists and none of this is collected.

CREATE TABLE IF NOT EXISTS learning_attempts (
  id TEXT PRIMARY KEY,
  user_ref TEXT NOT NULL,
  canvas_ref TEXT, board TEXT,                 -- the learner's own canvas (a shared or forked canvas carries none of this state)
  goal_id TEXT, activity_id TEXT, activity_revision INTEGER,
  response_kind TEXT,
  assistance TEXT,                             -- none | assisted | unknown: the help the server resolved at submission (USED help)
  assistance_ref_count INTEGER, source_ref_count INTEGER,
  submitted_at TEXT, submitted_s INTEGER,
  projected_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS learning_attempts_goal ON learning_attempts (user_ref, goal_id, submitted_s);

CREATE TABLE IF NOT EXISTS learning_assessments (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  user_ref TEXT NOT NULL,
  status TEXT,                                 -- pending | completed | unavailable | failed | unknown
  route TEXT,                                  -- keyed | jev | larger, or NULL when none ran
  reason TEXT,                                 -- a code token only; free text is dropped
  rubric_version TEXT, evaluator_version TEXT,
  supersedes_assessment_id TEXT,
  escalated INTEGER,                           -- 1 when the larger evaluator was called
  call_count INTEGER, call_ms INTEGER,         -- the evaluator calls recorded in provenance, and their summed latency
  served_models TEXT,                          -- comma-joined model tokens
  created_at TEXT, updated_at TEXT, updated_s INTEGER,
  projected_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS learning_assessments_attempt ON learning_assessments (attempt_id);
CREATE INDEX IF NOT EXISTS learning_assessments_user ON learning_assessments (user_ref, updated_s);

CREATE TABLE IF NOT EXISTS learning_observations (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL, attempt_id TEXT NOT NULL,
  user_ref TEXT NOT NULL, goal_id TEXT NOT NULL,
  criterion_id TEXT NOT NULL, criterion_version INTEGER NOT NULL,
  fit TEXT, reasoning TEXT, assistance TEXT, validity TEXT,
  conflict INTEGER, application TEXT, retention_of TEXT,
  observed_at TEXT, observed_s INTEGER,
  projected_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS learning_observations_goal ON learning_observations (user_ref, goal_id, criterion_id, observed_s);

CREATE TABLE IF NOT EXISTS learning_criteria (
  goal_id TEXT NOT NULL, scope_version INTEGER NOT NULL, criterion_id TEXT NOT NULL,
  version INTEGER NOT NULL, user_ref TEXT NOT NULL,
  requires_reasoning INTEGER, requires_transfer INTEGER, rubric_version TEXT,
  created_s INTEGER,
  projected_at INTEGER NOT NULL,
  PRIMARY KEY (goal_id, scope_version, criterion_id)
);
