-- PDF highlights and excerpts (C:/s/spec/pdf-excerpts/contract.md, owner decisions 2026-10-19). pdf_source_hashes caches the
-- sha256 of a learner's own stored PDF bytes (a context document or an uploaded paper), computed once by the server, so an
-- anchor names the exact document version. pdf_highlights are reader highlights, private to their author and tied to that
-- version. Region crops are ordinary file_sources rows (0023). Times are Unix milliseconds.
-- Additive and re-runnable; LEARN_DB only; mirrored into repository-schema.sql. Local first; learn-dev by Parallel after
-- review; production needs owner GO.
CREATE TABLE IF NOT EXISTS pdf_source_hashes (org TEXT NOT NULL, owner_email TEXT NOT NULL, source_key TEXT NOT NULL,
  sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, computed_at INTEGER NOT NULL, PRIMARY KEY (org, owner_email, source_key));
CREATE TABLE IF NOT EXISTS pdf_highlights (id TEXT PRIMARY KEY, org TEXT NOT NULL, owner_email TEXT NOT NULL,
  source_key TEXT NOT NULL, source_sha256 TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('text','region')),
  page_index INTEGER NOT NULL, anchor_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS pdf_highlights_owner_source ON pdf_highlights (org, owner_email, source_key, source_sha256);
