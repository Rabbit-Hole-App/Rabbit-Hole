-- Library trash (docs/features/library-trash.md, owner 2026-10-06): an owned top-level canvas or project moved to Trash -
-- a stronger removal than Archive, with an explicit Restore. A row hides the item from Home, Library, Explore and search,
-- suspends its share links (their configuration is kept, so Restore brings them back) and went with its publication
-- (Restore never republishes). Nothing is deleted: the canvas, its content, title, description, forks and nested holes
-- stay as they are. No row = not in Trash. Nested Rabbit Holes are never trashed on their own. Additive and re-runnable;
-- LEARN_DB only. Applied locally only until an explicit deploy GO (order 0004..0010).
CREATE TABLE IF NOT EXISTS library_trash (
  org TEXT NOT NULL,
  name TEXT NOT NULL,
  trashed_at TEXT NOT NULL,
  PRIMARY KEY (org, name)
);
