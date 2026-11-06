-- Tutor R7a: versioned, access-scoped source indices (docs/features/explain-on-canvas/receipts/r7a-receipt.md).
-- One row per (owner, source, revision, extractor/chunker version): the outline and chunk descriptors (offsets only, never source text) and the coverage
-- manifest. Summary batches are checkpointed per prompt version. `kind` already admits 'pdf' so R7b needs no further migration.
-- Additive and re-runnable, LEARN_DB only. Reserved number 0042 (Lead-allocated). Production and dev application: an owner command, never applied by a lane.

CREATE TABLE IF NOT EXISTS learn_source_indices (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'markdown' CHECK (kind IN ('markdown', 'pdf')),
  source_key TEXT NOT NULL,
  source_rev TEXT NOT NULL,
  source_name TEXT NOT NULL DEFAULT '',
  extractor_version TEXT NOT NULL,
  index_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready', 'unreadable', 'stale')),
  stop_reason TEXT,
  total_chars INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  index_json TEXT NOT NULL,
  coverage_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS learn_source_indices_version ON learn_source_indices (org, owner_email, kind, source_key, source_rev, extractor_version, index_version);
CREATE INDEX IF NOT EXISTS learn_source_indices_source ON learn_source_indices (org, owner_email, source_key, status);

CREATE TABLE IF NOT EXISTS learn_source_index_batches (
  index_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  batch_no INTEGER NOT NULL,
  org TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  first_chunk INTEGER NOT NULL,
  last_chunk INTEGER NOT NULL,
  input_hash TEXT NOT NULL,
  chars_in INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'done', 'failed', 'unknown', 'skipped')),
  reason TEXT,
  summary_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (index_id, prompt_version, batch_no)
);
