-- /dive (docs/features/dive-v1.md): a nested Rabbit Hole is a child canvas. The child keeps its own
-- canvases row (title, owner); this link row adds only where it came from. One parent per child,
-- one child per originating card on a board. Additive and re-runnable; LEARN_DB only.
CREATE TABLE IF NOT EXISTS canvas_dives (
  org TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  child TEXT NOT NULL,
  parent_app TEXT NOT NULL,
  parent_board TEXT NOT NULL DEFAULT 'main',
  origin_block_id TEXT NOT NULL,
  dive_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org, child),
  UNIQUE (org, owner_email, parent_app, parent_board, origin_block_id)
);
