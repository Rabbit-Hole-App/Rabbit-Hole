-- A dropped document starts the Tutor (docs/features/learn-sections/roadmap-unplug-spec.md section B, owner 2026-11-19): the one Markdown or PDF file that began a canvas's
-- Tutor, found again after a reload. sha is the hash of the file's text (the text is in R2 at learn-repositories-dev/shared/files/<sha>/text.json and its index layers beside it);
-- one document per canvas (primary key org, app): a later file is only a card. Additive and re-runnable. Applied locally only until the owner's go.
CREATE TABLE IF NOT EXISTS canvas_document (
  org TEXT NOT NULL,
  app TEXT NOT NULL,
  sha TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  block_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org, app)
);
