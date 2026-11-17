-- Compute usage (usage-limits-spec.md, owner 2026-11-15): one entry per machine lifetime, a rehearsal a person started or a Run card session they pressed Start on.
-- The controller reports the machine's size and times; the control plane writes the entry (learn-compute.js), never the sandbox. micros is integer micro-USD,
-- settled when the machine ends; a running entry has no micros yet, its accrued cost and its reservation (the remaining hard time at its rate) are computed on read.
-- period is the UTC month of started_at ('YYYY-MM'), the month the time counts against. deadline_at is the machine's hard end (epoch seconds): an entry still running past it is settled at it.
CREATE TABLE IF NOT EXISTS compute_entries (
  entry_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  period TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('rehearsal', 'session')),
  app_id TEXT,
  repo TEXT,
  commit_sha TEXT,
  route_id TEXT,
  route_title TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  deadline_at INTEGER,
  cpu REAL NOT NULL,
  memory_gib REAL NOT NULL,
  seconds REAL,
  micros INTEGER,
  status TEXT NOT NULL CHECK (status IN ('running', 'settled'))
);
CREATE INDEX IF NOT EXISTS compute_entries_user_period ON compute_entries (user_id, period, started_at);
