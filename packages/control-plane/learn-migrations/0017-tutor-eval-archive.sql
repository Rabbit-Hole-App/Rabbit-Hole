-- Tutor evaluation archive (r34 audit follow-up, owner 2026-10-09): the offline session simulator's artifacts
-- (tests/evals/tutor-session: run.json manifest, aggregate.json, one session bundle per topic x profile) kept in the
-- Learn D1, apart from customer learning evidence (learning_journeys, 0006) and Next Steps telemetry (0012). Additive,
-- re-runnable, LEARN_DB only. Nothing here is read or written by a learner's request: an owner-only private import.
--
-- One execution = one archived run. Its artifacts are byte-exact: every artifact carries the sha256 of its whole
-- payload, and a payload too large for one D1 row (about 1 MB a row) is split into ordered chunks that reassemble to
-- those bytes. An import is complete only when every artifact's chunks are present and the execution row says so:
-- an interrupted import stays visibly incomplete (completed_at NULL), and never pretends.

-- One row per execution of the evaluation: the identity every artifact hangs from.
CREATE TABLE IF NOT EXISTS tutor_eval_executions (
  execution_id TEXT PRIMARY KEY,              -- unique per execution; two runs on one date are two rows
  run_id TEXT NOT NULL,                       -- the harness's own run_id (bundle.simulator.run_id)
  run_date TEXT NOT NULL,                     -- YYYY-MM-DD, from the manifest
  analysis_version TEXT NOT NULL,             -- the analysis that produced the aggregates (re-analysis = new execution)
  harness_version TEXT NOT NULL,
  eval_schema_version INTEGER NOT NULL,
  source_sha TEXT NOT NULL,                   -- the repository commit the run was made at
  tested_tree TEXT NOT NULL,                  -- that commit's tree: what the evaluated code was
  topic TEXT NOT NULL,                        -- the simulator topic (bundle.simulator.topic), indexed
  mode TEXT NOT NULL CHECK (mode IN ('real', 'scripted')), -- real model calls, or the scripted provider stub
  config_version TEXT NOT NULL,               -- the simulator config hash (bundle.simulator.config_hash)
  jev_cost_usd REAL,                          -- NULL = unknown, never 0: a scripted run has no cost to report
  jev_cost_note TEXT,                         -- why the cost is what it is (or why unknown)
  imported_by TEXT NOT NULL,                  -- users.id of the importer (owner-only)
  artifact_count INTEGER NOT NULL,            -- declared up front: completion is checked against it
  -- The run's own outcome, as the harness reported it, apart from the import's completeness: a stopped or failed run
  -- is archived as such. partial = the harness itself did not finish every session. The row never changes after import.
  status TEXT NOT NULL CHECK (status IN ('running', 'checkpointed', 'completed', 'stopped', 'failed', 'partial')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,                          -- the IMPORT's completion: NULL until every artifact is whole and verified
  UNIQUE (run_id, analysis_version)
);

-- One row per artifact of an execution: the manifest, the aggregate and each session bundle.
CREATE TABLE IF NOT EXISTS tutor_eval_artifacts (
  execution_id TEXT NOT NULL REFERENCES tutor_eval_executions(execution_id),
  artifact_key TEXT NOT NULL,                 -- 'run.json', 'aggregate.json', or the session file name
  kind TEXT NOT NULL,                         -- manifest | aggregate | session
  byte_length INTEGER NOT NULL,
  sha256 TEXT NOT NULL,                       -- of the whole payload; the import re-hashes the reassembled bytes
  chunk_count INTEGER NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/json',
  verified_at TEXT,                           -- NULL until every chunk is present and the hash matches
  PRIMARY KEY (execution_id, artifact_key)
);

-- Ordered chunks of an artifact's bytes. Each chunk is bounded (the importer's CHUNK_BYTES, well under a D1 row) and
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

CREATE INDEX IF NOT EXISTS tutor_eval_executions_date ON tutor_eval_executions (run_date, started_at);
CREATE INDEX IF NOT EXISTS tutor_eval_executions_topic ON tutor_eval_executions (topic, mode, run_date);
CREATE INDEX IF NOT EXISTS tutor_eval_executions_config ON tutor_eval_executions (config_version, analysis_version);
CREATE INDEX IF NOT EXISTS tutor_eval_artifacts_kind ON tutor_eval_artifacts (execution_id, kind);
