-- Source passage references (Tutor release R3, docs/features/source-refs.md): the server-minted record behind a card's
-- sourceRef. One row per selected passage of one source at one immutable revision (source_rev, the sha256 of the stored
-- bytes), kept apart from the canvas mention index learn_canvas_refs (0021), which links canvas to canvas and holds no
-- source, revision or location. A row grants only its owner: a job or a card may carry a sourceRef only when this table says
-- the same learner selected it, and every read re-checks the source itself (source-refs.js). The card holds the anchor too, so a
-- saved board renders without this table; status is the last resolution (current, changed, missing, unavailable), never a guess.
-- anchor_hash makes a repeated selection of the same passage the same row. Additive and re-runnable; LEARN_DB only.
-- Production: an owner command, applied immediately before the release that reads it.
CREATE TABLE IF NOT EXISTS learn_source_refs (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('markdown', 'pdf')),
  source_key TEXT NOT NULL,
  source_home TEXT,
  source_name TEXT NOT NULL,
  source_rev TEXT NOT NULL,
  anchor_json TEXT NOT NULL,
  anchor_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'current' CHECK (status IN ('current', 'changed', 'missing', 'unavailable')),
  checked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS learn_source_refs_passage ON learn_source_refs (org, owner_email, source_key, source_rev, anchor_hash);
CREATE INDEX IF NOT EXISTS learn_source_refs_source ON learn_source_refs (org, owner_email, source_key);
