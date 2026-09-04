-- source provenance: one deploys row per deploy, latest mirrored on the app row (matches schema.sql)
CREATE TABLE IF NOT EXISTS deploys (
  id INTEGER PRIMARY KEY,
  app_id INTEGER NOT NULL REFERENCES apps(id),
  repo_url TEXT,
  branch TEXT,
  commit_sha TEXT,
  dirty INTEGER,
  deployed_by TEXT NOT NULL,
  deployed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
ALTER TABLE apps ADD COLUMN repo_url TEXT;
ALTER TABLE apps ADD COLUMN repo_branch TEXT;
ALTER TABLE apps ADD COLUMN repo_commit TEXT;
ALTER TABLE apps ADD COLUMN repo_dirty INTEGER;
ALTER TABLE apps ADD COLUMN repo_public INTEGER;
-- no deployed_at ALTER: the production DB already has it (added manually by an early
-- runbook experiment, alongside a dead `runbook` column) — schema.sql carries it for fresh DBs
