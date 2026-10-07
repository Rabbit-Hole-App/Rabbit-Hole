-- Canvas metadata (docs/features/canvas-metadata.md, owner 2026-10-06): what canvases does not hold cleanly - an
-- optional description (at most 500 characters, written by its owner, never generated) and the time of the canvas's
-- last meaningful change (a rename, a description edit, a change to its saved content; never a view, a selection, a
-- fork or Rabbit Hole by someone else, a share link copied, a publication opened or a handle change). One row per
-- canvas, made at its first meaningful change: no row reads as description NULL and updated_at = canvases.created_at.
-- Never a copy of the title, owner, publication, fork state or content. Additive and re-runnable; LEARN_DB only.
-- Applied locally only until an explicit deploy GO (order 0004..0009).
CREATE TABLE IF NOT EXISTS canvas_metadata (
  org TEXT NOT NULL,
  canvas TEXT NOT NULL,
  description TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org, canvas)
);
