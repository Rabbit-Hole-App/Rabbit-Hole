-- Library folders (docs/features/library-folders.md, owner 2026-10-09): flat folders a person makes in their own Library
-- to group their canvases and projects. Private to their owner, always: never on Explore, a share or a profile. A folder
-- is keyed to the owner as canvases are (org, owner_email); its colour is one of the canvas's six swatches. An item (the
-- Library's org + name, a canvas-* or repo-*) is in at most one folder; no row means it sits loose in the Library. A
-- trashed or archived item keeps its row and comes back into its folder on Restore; deleting a folder deletes its rows,
-- never an item. Additive and re-runnable; LEARN_DB only. Applied locally only until an explicit deploy GO (after 0014).
CREATE TABLE IF NOT EXISTS library_folders (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  color TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS library_folders_owner ON library_folders (org, owner_email);
CREATE TABLE IF NOT EXISTS library_folder_items (
  org TEXT NOT NULL,
  name TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  PRIMARY KEY (org, name)
);
CREATE INDEX IF NOT EXISTS library_folder_items_folder ON library_folder_items (folder_id);
