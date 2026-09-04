CREATE TABLE IF NOT EXISTS apps (
  id INTEGER PRIMARY KEY,
  org TEXT NOT NULL,
  name TEXT NOT NULL,
  fly_app TEXT NOT NULL,
  proxy_secret TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'domain',
  owner_email TEXT NOT NULL,
  aws_role_arn TEXT,
  deploy_token TEXT,
  kind TEXT NOT NULL DEFAULT 'server',
  image TEXT,
  schedule TEXT,
  schedule_paused INTEGER NOT NULL DEFAULT 0,
  last_scheduled_at INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  review TEXT,
  review_prev TEXT,
  reviewed_at TEXT,
  review_model TEXT,
  repo_url TEXT,
  repo_branch TEXT,
  repo_commit TEXT,
  repo_dirty INTEGER,
  repo_public INTEGER,
  deployed_at TEXT,
  runbook TEXT,
  UNIQUE(org, name)
);
-- migrating an existing DB:
--   ALTER TABLE apps ADD COLUMN kind TEXT NOT NULL DEFAULT 'server';
--   ALTER TABLE apps ADD COLUMN image TEXT;
--   (web dashboard columns: migrations/0003-web.sql, 0004-stop.sql)

CREATE TABLE IF NOT EXISTS members (
  app_id INTEGER NOT NULL REFERENCES apps(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'view',
  UNIQUE(app_id, email)
);

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

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  app_id INTEGER NOT NULL REFERENCES apps(id),
  started_by TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  exit_code INTEGER,
  reason TEXT,
  machine_id TEXT
);

CREATE TABLE IF NOT EXISTS run_logs (
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  line TEXT NOT NULL,
  PRIMARY KEY (run_id, seq)
);

CREATE TABLE IF NOT EXISTS request_logs (
  id INTEGER PRIMARY KEY,
  org TEXT NOT NULL,
  slug TEXT NOT NULL,
  ts TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  user TEXT
);
CREATE INDEX IF NOT EXISTS request_logs_app ON request_logs (org, slug, id);
CREATE INDEX IF NOT EXISTS request_logs_ts ON request_logs (ts);
