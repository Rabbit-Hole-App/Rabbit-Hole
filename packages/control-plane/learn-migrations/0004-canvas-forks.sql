-- Canvas forks (docs/features/canvas-forking.md): a fork is a canvas. It keeps its own canvases row (title,
-- owner); this link row adds only where it came from, like canvas_dives. A canvas id is its name inside its
-- org (UNIQUE(org,name)), so every reference carries both. fork_key is the client's idempotency key: one
-- action, one fork. The parent's count is its direct forks only. Additive and re-runnable; LEARN_DB only.
CREATE TABLE IF NOT EXISTS canvas_forks (
  org TEXT NOT NULL,
  canvas TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  fork_key TEXT NOT NULL,
  forked_from_org TEXT,
  forked_from_canvas_id TEXT,
  root_org TEXT,
  root_canvas_id TEXT,
  forked_from_owner_id TEXT NOT NULL,
  forked_from_title TEXT NOT NULL,
  forked_from_share TEXT,
  forked_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org, canvas),
  UNIQUE (owner_email, fork_key)
);
CREATE INDEX IF NOT EXISTS canvas_forks_parent ON canvas_forks(forked_from_org, forked_from_canvas_id);
