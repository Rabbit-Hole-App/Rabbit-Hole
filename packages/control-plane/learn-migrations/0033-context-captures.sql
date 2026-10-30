-- Add context: a public webpage as a Context document (docs/features/canvas-context-docs.md "Web pages"; owner brief
-- 2026-10-29). One row per Context document that is a captured page: the approved capture version it reads (webpage-capture.js
-- file_sources ids: the manifest, and every file of that version in files_json), its URL, revision (the manifest's sha256),
-- capture lineage (the Refresh and highlights namespace), status and capture time. The document's own text lives beside it as
-- an ordinary context document (canvas_context_documents, LEARN_MEDIA). This row, not a board, keeps a Context-only capture
-- from cleanup (sweepWebpageSources) while the document is in Context; it grants no board, share link or fork any access.
-- Additive and re-runnable; LEARN_DB only. Production: an owner command; never applied by a lane.
CREATE TABLE IF NOT EXISTS canvas_context_captures (
  org TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  app TEXT NOT NULL,
  id TEXT NOT NULL,
  url TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_rev TEXT NOT NULL,
  lineage TEXT NOT NULL,
  files_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready')),
  captured_at INTEGER NOT NULL,
  PRIMARY KEY (org, owner_email, app, id)
);
CREATE INDEX IF NOT EXISTS canvas_context_captures_source ON canvas_context_captures (source_id);
