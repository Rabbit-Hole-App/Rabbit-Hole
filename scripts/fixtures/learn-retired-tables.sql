-- Test fixture for scripts/learn-retire-tutor-runner.test.mjs: the six tables the P6b window drops (learn_grades, learning_journeys,
-- learning_path_versions, tutor_eval_executions, tutor_eval_artifacts, tutor_eval_artifact_chunks) and their indexes, exactly as
-- repository-schema.sql held them at the P6a release (388888d02). The tests apply it on top of the P6b schema to rebuild what
-- production holds before the window. History only: nothing else reads it.

-- One row per graded attempt: Jev's per-idea judgment beside today's Opus
-- verdict. Experiment data: pruned after 90 days on the next grade or report
-- call, and deleted at the switch decision. Learner identity stays here; the
-- grading service never sees it. docs/features/jev-grading.md
CREATE TABLE IF NOT EXISTS learn_grades (
  id INTEGER PRIMARY KEY,
  org TEXT NOT NULL,
  email TEXT NOT NULL,
  app TEXT NOT NULL,
  board TEXT,
  block_id TEXT,
  mode TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'canvas',
  bench_run TEXT,
  bench_set TEXT,
  grader_protocol_version TEXT NOT NULL,
  prompt TEXT NOT NULL,
  expects TEXT NOT NULL,
  answer TEXT NOT NULL,
  jev TEXT,
  jev_error TEXT,
  jev_ms INTEGER,
  jev_tokens INTEGER,
  jev_cost REAL,
  jev_model TEXT,
  jev_generation_id TEXT,
  baseline_verdict TEXT,
  baseline_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (org, email, app, attempt_id)
);
CREATE INDEX IF NOT EXISTS idx_learn_grades_learner ON learn_grades(org, email, app, created_at);
CREATE INDEX IF NOT EXISTS idx_learn_grades_created ON learn_grades(created_at);

-- learn-migrations/0006-learning-journeys.sql
-- Learning journeys (docs/features/adaptive-learning-path-v1-architecture.md §9-§10): one row per adaptive learning
-- journey - its state, the learner's exact request, intake answers, constraints, the journey's claim registry, the
-- diagnostic with its server-only answer key, the evidence store and the current section's plan - and one immutable
-- row per version of its learning path. Additive and re-runnable; LEARN_DB only. Applied to the production
-- LEARN_DB (verified by the release preflight schema identity, 5 November 2026).
--
-- A journey is scoped to (org, owner_user_id, app, board), where owner_user_id is users.id (migration 0026), the stable
-- internal id the session carries as uid; never an email (§10.2, owner 2026-10-05). Only its owner reads or writes it.
-- revision is the optimistic-write counter: every save is conditional on it, so two tabs
-- never overwrite each other, and an archived journey is never written again. Evidence is written only by
-- appendJourneyEvidence (src/learn-journey-store.js). The learner's exact words live only in raw_request;
-- request_json is the rest of the request (intent, channel), grounding_json what the journey is grounded in.
-- A local database that already applied an earlier draft of 0006 must be reset: CREATE TABLE IF NOT EXISTS adds no columns.

CREATE TABLE IF NOT EXISTS learning_journeys (
  id TEXT PRIMARY KEY, org TEXT NOT NULL, owner_user_id TEXT NOT NULL, app TEXT NOT NULL, board TEXT NOT NULL,
  state TEXT NOT NULL, topic TEXT NOT NULL, raw_request TEXT NOT NULL,
  request_json TEXT NOT NULL, grounding_json TEXT NOT NULL DEFAULT '{"kind":"topic"}',
  intake_json TEXT NOT NULL, constraints_json TEXT NOT NULL DEFAULT '[]', pending_edits_json TEXT NOT NULL DEFAULT '[]',
  registry_json TEXT NOT NULL, diagnostic_json TEXT NOT NULL, evidence_json TEXT NOT NULL,
  path_version INTEGER NOT NULL DEFAULT 0, active_section_id TEXT, section_plan_json TEXT,
  pending TEXT, error_json TEXT, paused_json TEXT,
  revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT
);
-- At most one live (not archived) journey per scope.
CREATE UNIQUE INDEX IF NOT EXISTS learning_journeys_live ON learning_journeys (org, owner_user_id, app, board) WHERE archived_at IS NULL;

-- A path version is written once and never changed, in the same batch as the journey row whose path_version names it.
CREATE TABLE IF NOT EXISTS learning_path_versions (
  journey_id TEXT NOT NULL, version INTEGER NOT NULL, path_json TEXT NOT NULL,
  source TEXT NOT NULL, reason TEXT NOT NULL, evidence_refs TEXT NOT NULL, changes_json TEXT NOT NULL,
  created_at TEXT NOT NULL, PRIMARY KEY (journey_id, version)
);


-- learn-migrations/0017-tutor-eval-archive.sql
-- Tutor evaluation archive (r34 audit follow-up, owner 2026-10-09; storage contract reviewed by Tutor eval and
-- Parallel 2026-10-09): the offline session simulator's originals (tests/evals/tutor-session: run.json manifest,
-- aggregate.json, one session bundle per profile, and the run's logs) kept in the Learn D1, apart from customer
-- learning evidence (learning_journeys, 0006) and Next Steps telemetry (0012). Additive, re-runnable, LEARN_DB only.
-- Nothing here is read or written by a learner's request: an owner-only private import behind /api/learn/tutor-eval.
--
-- One execution = one run that happened once; its id is minted at run start (or backfilled from started time + tested
-- sha). A recomputed aggregate is a new ARTIFACT on the same execution under its own analysis_version, never a new
-- execution and never a replacement: an artifact's bytes, once stored, are immutable. Every artifact carries the sha256
-- of its whole payload; a payload too large for one D1 row (2,000,000 bytes, developers.cloudflare.com/d1/platform/limits)
-- is split into bounded, ordered, individually hashed chunks that reassemble to those exact bytes. An import is
-- complete only when every declared artifact is whole and verified and their number equals artifact_count: an
-- interrupted import stays visibly incomplete (completed_at NULL) and can be resumed, never silently finished.

CREATE TABLE IF NOT EXISTS tutor_eval_executions (
  execution_id TEXT PRIMARY KEY,              -- the run's own unique id (paid-20261008T180918Z-01a7a508), never the date label
  run_id TEXT NOT NULL,                       -- the harness's display label (paid-YYYY-MM-DD)
  run_date TEXT NOT NULL,                     -- YYYY-MM-DD of run_started_at
  run_started_at TEXT NOT NULL,               -- ISO 8601, from the manifest (or started.txt / run.log on a backfill)
  run_finished_at TEXT,                       -- ISO 8601; NULL when the run never finished
  topic TEXT NOT NULL,                        -- the simulator topic id
  mode TEXT NOT NULL CHECK (mode IN ('real', 'scripted', 'unknown')), -- unknown when a backfill cannot prove it; never guessed
  -- The run's own outcome as the harness (or, on a backfill, the importer with a note) reported it. partial = the
  -- harness did not finish; a session's own error is in its bundle, not here. The row never changes after import.
  status TEXT NOT NULL CHECK (status IN ('running', 'checkpointed', 'completed', 'stopped', 'failed', 'partial')),
  status_note TEXT,
  source_sha TEXT NOT NULL,                   -- the repository commit the run tested
  tested_tree TEXT NOT NULL,                  -- that commit's tree: what the evaluated code was
  harness_version TEXT NOT NULL,              -- the evaluator commit
  config_version TEXT,                        -- sha256(limits + models)[:12] from the manifest; NULL with no manifest
  anthropic_usd REAL,                         -- NULL = unmetered or unknown, never 0
  anthropic_calls INTEGER,
  jev_cost_usd REAL,                          -- NULL = the provider reports no cost, never 0
  jev_cost_note TEXT,
  imported_by TEXT NOT NULL,                  -- users.id of the importer (owner-only)
  artifact_count INTEGER NOT NULL,            -- declared up front, logs included: completion is checked against it
  imported_at TEXT NOT NULL,                  -- ISO 8601: when the import was declared
  completed_at TEXT                           -- ISO 8601: the IMPORT's completion; NULL until every artifact verifies
);

-- One row per artifact of an execution: the manifest, each aggregate version, each session bundle, each log.
CREATE TABLE IF NOT EXISTS tutor_eval_artifacts (
  execution_id TEXT NOT NULL REFERENCES tutor_eval_executions(execution_id),
  artifact_key TEXT NOT NULL,                 -- the original file name; a recomputed aggregate is aggregate@<analysis_version>.json
  kind TEXT NOT NULL CHECK (kind IN ('manifest', 'aggregate', 'session', 'log')),
  analysis_version TEXT,                      -- the aggregation code's commit; NULL for manifest, session and log rows
  content_type TEXT NOT NULL,                 -- application/json, text/plain or text/csv
  byte_length INTEGER NOT NULL,
  sha256 TEXT NOT NULL,                       -- of the whole payload; the import re-hashes the reassembled bytes
  chunk_count INTEGER NOT NULL,
  verified_at TEXT,                           -- ISO 8601; NULL until every chunk is present and the hash matches
  PRIMARY KEY (execution_id, artifact_key)
);

-- Ordered chunks of an artifact's bytes. Each chunk is bounded (the store's CHUNK_BYTES, 524,288 bytes, about a quarter of a D1 row) and
-- hashed on its own, so a conflicting re-upload of one chunk is caught before the whole is re-hashed.
CREATE TABLE IF NOT EXISTS tutor_eval_artifact_chunks (
  execution_id TEXT NOT NULL,
  artifact_key TEXT NOT NULL,
  seq INTEGER NOT NULL,                       -- 0-based, dense: chunk_count rows reassemble the artifact
  bytes BLOB NOT NULL,
  sha256 TEXT NOT NULL,
  PRIMARY KEY (execution_id, artifact_key, seq),
  FOREIGN KEY (execution_id, artifact_key) REFERENCES tutor_eval_artifacts(execution_id, artifact_key)
);

CREATE INDEX IF NOT EXISTS tutor_eval_executions_topic ON tutor_eval_executions (topic, mode, status);
CREATE INDEX IF NOT EXISTS tutor_eval_executions_sha ON tutor_eval_executions (source_sha);
CREATE INDEX IF NOT EXISTS tutor_eval_executions_date ON tutor_eval_executions (run_date);
CREATE INDEX IF NOT EXISTS tutor_eval_artifacts_kind ON tutor_eval_artifacts (execution_id, kind);

