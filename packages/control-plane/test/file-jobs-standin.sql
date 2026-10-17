-- ponytail: stand-in for Lane 1's learn migration 0023-file-imports.sql (contract docs/features/canvas-file-imports.md
-- section 4 plus the JOBS-lane additions the lead approved 2026-10-16: file_derivatives.name in the UNIQUE key;
-- file_jobs.converter_version, limitations_json, created_at, updated_at, finished_at). Tests only; delete this file and
-- load repository-schema.sql alone once 0023 lands there. Times are integer milliseconds.
CREATE TABLE IF NOT EXISTS file_sources (
  id TEXT PRIMARY KEY, org TEXT NOT NULL, owner_email TEXT NOT NULL, app TEXT NOT NULL, board_id TEXT,
  family TEXT NOT NULL, name TEXT NOT NULL, media_type TEXT, declared_type TEXT, bytes INTEGER NOT NULL, sha256 TEXT NOT NULL,
  r2_key TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER, stored_at INTEGER, deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS file_derivatives (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL, source_sha256 TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL,
  converter TEXT NOT NULL, converter_version TEXT NOT NULL, options_hash TEXT NOT NULL, status TEXT NOT NULL,
  media_type TEXT, bytes INTEGER, sha256 TEXT, r2_key TEXT, coverage_json TEXT, error TEXT, created_at INTEGER, updated_at INTEGER,
  UNIQUE (source_id, source_sha256, kind, name, converter_version, options_hash)
);
CREATE TABLE IF NOT EXISTS file_jobs (
  id TEXT PRIMARY KEY, org TEXT NOT NULL, owner_email TEXT NOT NULL, app TEXT NOT NULL, board_id TEXT, card_id TEXT,
  source_id TEXT NOT NULL, source_sha256 TEXT NOT NULL, converter TEXT NOT NULL, converter_version TEXT, options_json TEXT,
  idempotency_key TEXT NOT NULL, state TEXT NOT NULL, stage TEXT, attempt INTEGER NOT NULL DEFAULT 1,
  max_attempts INTEGER NOT NULL DEFAULT 3, lease_until INTEGER, cancel_requested INTEGER NOT NULL DEFAULT 0,
  derivative_ids_json TEXT, limitations_json TEXT, error TEXT, created_at INTEGER, updated_at INTEGER, finished_at INTEGER,
  UNIQUE (org, owner_email, idempotency_key)
);
