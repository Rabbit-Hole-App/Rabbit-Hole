-- One owner-authored course per app; edits invalidate approval and generated pages.
CREATE TABLE IF NOT EXISTS learn_courses (
  app_id INTEGER PRIMARY KEY REFERENCES apps(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  brief TEXT NOT NULL,
  curriculum TEXT,
  approved_revision INTEGER,
  lesson TEXT,
  source_version TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
