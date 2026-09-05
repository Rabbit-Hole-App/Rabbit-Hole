-- Watch: nightly baselines + fixed checks + observations. SQL plus a few model
-- calls, not an agent loop.
CREATE TABLE IF NOT EXISTS baselines (
  id INTEGER PRIMARY KEY,
  app_id INTEGER NOT NULL,
  day TEXT NOT NULL,                       -- YYYY-MM-DD (UTC)
  median_run_secs REAL,
  daily_req_count REAL,
  last_request_at TEXT,
  last_run_at TEXT,
  last_deploy_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  UNIQUE(app_id, day)
);

-- ponytail: enabled is global for now — add an org column when per-org config ships
CREATE TABLE IF NOT EXISTS checks (
  key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO checks (key) VALUES
  ('schedule_missed'), ('run_slow'), ('run_failing'), ('server_silent'),
  ('never_opened'), ('secret_drift'), ('stale_deploy'), ('access_unused');

CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY,
  org TEXT NOT NULL,
  slug TEXT NOT NULL,
  "check" TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  resolved_at TEXT,
  dismissed_until TEXT,
  evidence TEXT NOT NULL,
  text TEXT
);
CREATE INDEX IF NOT EXISTS idx_observations_open ON observations(org, slug) WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS org_settings (
  org TEXT PRIMARY KEY,
  notify_weekly INTEGER NOT NULL DEFAULT 1
);
