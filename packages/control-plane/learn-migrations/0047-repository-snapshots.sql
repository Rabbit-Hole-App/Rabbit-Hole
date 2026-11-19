-- Shared snapshots (docs/features/learn-sections/codebase-index-spec.md section 1, owner 2026-11-19): one indexed snapshot per public repository,
-- commit and indexer version, whoever imported it first. An import that finds a row here points its app's repository_versions row at the same
-- storage key and asks the indexer nothing. Only public repositories are imported, so one snapshot serves every learner.
-- Additive and re-runnable; repository_versions and its older per-app keys keep working unchanged.
-- Applied locally (8878) only until the owner's go.
CREATE TABLE IF NOT EXISTS repository_snapshots (
  repo TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  version TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (repo, commit_sha, version)
);
