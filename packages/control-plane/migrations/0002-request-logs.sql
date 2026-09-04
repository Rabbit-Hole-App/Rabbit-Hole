-- request logs: one row per proxied request, 7-day retention (cron purges by ts)
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
