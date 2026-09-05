-- Share a whole folder with a person or a #team — a live grant over every app
-- currently (or later) filed in it.
--   npx wrangler d1 execute small --remote --file migrations/0008-folder-shares.sql
CREATE TABLE IF NOT EXISTS folder_shares (
  folder_id INTEGER NOT NULL REFERENCES folders(id),
  email TEXT,
  team_id INTEGER REFERENCES teams(id),
  role TEXT NOT NULL DEFAULT 'view',
  UNIQUE(folder_id, email, team_id)
);
