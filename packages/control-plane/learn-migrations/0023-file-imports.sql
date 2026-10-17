-- Canvas file imports (docs/features/canvas-file-imports.md section 4; owner spec and decisions in C:/s/spec/file-imports.md).
-- Sources are immutable originals, derivatives are converter outputs tied to one source revision, jobs are durable
-- conversion work driven by the FileJobs Durable Object, documents hold edited text/code/notebook content apart from the
-- board, and file_source_refs is a derived index of which boards reference a source (rewritten with each board save,
-- like learn_canvas_refs), so removing one reference never deletes bytes another board still uses.
-- Access is decided here, never by knowing an id or an R2 key (section 4.1). Times are Unix milliseconds.
-- Additive and re-runnable; LEARN_DB only; mirrored into repository-schema.sql. Local first; shared learn-dev after review
-- (owner decision B, 2026-10-16); production needs its own approval.
CREATE TABLE IF NOT EXISTS file_sources (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  app TEXT NOT NULL,
  board_id TEXT,
  family TEXT NOT NULL,
  name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  declared_type TEXT,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('uploading', 'stored', 'failed', 'deleted')),
  created_at INTEGER NOT NULL,
  stored_at INTEGER,
  deleted_at INTEGER
);
-- Reuse within one owner only: never cross-account deduplication.
CREATE INDEX IF NOT EXISTS file_sources_owner_sha ON file_sources (org, owner_email, sha256);
CREATE INDEX IF NOT EXISTS file_sources_board ON file_sources (board_id);

CREATE TABLE IF NOT EXISTS file_derivatives (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  converter TEXT NOT NULL,
  converter_version TEXT NOT NULL,
  options_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
  media_type TEXT,
  bytes INTEGER,
  sha256 TEXT,
  r2_key TEXT,
  coverage_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (source_id, source_sha256, kind, converter_version, options_hash, name)
);

CREATE TABLE IF NOT EXISTS file_jobs (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  app TEXT NOT NULL,
  board_id TEXT,
  card_id TEXT,
  source_id TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  converter TEXT NOT NULL,
  converter_version TEXT,
  options_json TEXT NOT NULL DEFAULT '{}',
  idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued', 'validating', 'converting', 'preparing_preview', 'ready', 'ready_with_limitations', 'failed', 'cancelled')),
  stage TEXT,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  lease_until INTEGER,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  derivative_ids_json TEXT,
  limitations_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  UNIQUE (org, owner_email, idempotency_key)
);
CREATE INDEX IF NOT EXISTS file_jobs_state ON file_jobs (state, lease_until);
CREATE INDEX IF NOT EXISTS file_jobs_source ON file_jobs (source_id);

CREATE TABLE IF NOT EXISTS file_documents (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  app TEXT NOT NULL,
  board_id TEXT,
  source_id TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  head_rev INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS file_document_revisions (
  doc_id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  parent_rev INTEGER,
  r2_key TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (doc_id, rev)
);

CREATE TABLE IF NOT EXISTS file_source_refs (
  source_id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  PRIMARY KEY (source_id, board_id)
);
CREATE INDEX IF NOT EXISTS file_source_refs_board ON file_source_refs (board_id);
