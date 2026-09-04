-- jobs: kind/image on apps + runs/run_logs tables (matches schema.sql)
ALTER TABLE apps ADD COLUMN kind TEXT NOT NULL DEFAULT 'server';
ALTER TABLE apps ADD COLUMN image TEXT;

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  app_id INTEGER NOT NULL REFERENCES apps(id),
  started_by TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  exit_code INTEGER
);

CREATE TABLE IF NOT EXISTS run_logs (
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  line TEXT NOT NULL,
  PRIMARY KEY (run_id, seq)
);
