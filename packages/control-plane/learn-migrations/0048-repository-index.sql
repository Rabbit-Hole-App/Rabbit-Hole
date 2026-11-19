-- The codebase index (docs/features/learn-sections/codebase-index-spec.md section 2, owner 2026-11-19): one row per layer of what a public repository offers, per repository and commit
-- (scope: '' for the overview; a topic's id or slug for a topic layer). The layer's JSON is in R2 at storage_key. status: building (younger than two minutes it is being built now; older,
-- the next caller builds it again), ready, or failed (waits for the next build call). usd is what building it cost. Whoever builds first pays; everyone after reads it free.
-- Additive and re-runnable. Applied locally (8878) only until the owner's go.
CREATE TABLE IF NOT EXISTS repository_index (
  repo TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  layer TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  storage_key TEXT NOT NULL,
  status TEXT NOT NULL,
  usd REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (repo, commit_sha, layer, scope)
);
