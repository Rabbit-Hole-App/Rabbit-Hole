-- Learn sections (docs/features/learn-sections, spec A section 8; owner overnight build 2026-11-16): one row per section of a learner's accepted plan on one board,
-- keyed like the coaching rows (org, owner_user_id, app, board). brief_json is the section's beats (learn_section_brief), composition_json its items
-- (learn_section_compose), made_json the items made so far (learn_section_make / learn_section_made). checkpoint.learn keeps only currentSectionId and the
-- section ids with status; these documents are too large for the checkpoint. revision guards each write (read, change, write where revision is unchanged).
-- Applied locally (8878) only until the owner's go (DECISIONS L).
CREATE TABLE IF NOT EXISTS learn_sections (
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  app TEXT NOT NULL,
  board TEXT NOT NULL,
  section_id TEXT NOT NULL,
  brief_json TEXT,
  composition_json TEXT,
  made_json TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org, owner_user_id, app, board, section_id)
);
