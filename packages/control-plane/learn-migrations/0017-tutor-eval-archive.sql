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
