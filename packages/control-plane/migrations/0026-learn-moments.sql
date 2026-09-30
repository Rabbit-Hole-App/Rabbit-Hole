-- learn_moments was only in schema.sql, so databases built from the migrations lacked it.
-- IF NOT EXISTS: a no-op where the table was created by hand.
-- Moments the tutor put in front of a learner (youtube-moment-recommendation.md).
-- Written from day one; the hot path starts reading it in phase 4. Keyed per
-- workspace: this is learner behaviour, never shared across orgs.
CREATE TABLE IF NOT EXISTS learn_moments (
  id INTEGER PRIMARY KEY,
  org TEXT NOT NULL,
  question TEXT NOT NULL,
  video_id TEXT NOT NULL,
  start INTEGER NOT NULL,
  end INTEGER,
  confidence REAL,
  -- set when a learner keeps or dismisses the moment; null until phase 4 asks
  accepted INTEGER,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_learn_moments_org ON learn_moments(org, created_at);
