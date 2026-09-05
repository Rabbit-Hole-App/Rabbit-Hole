-- Dashboard folders (org-wide sidebar structure) + teams (#finance shares like a group).
--   npx wrangler d1 execute small --remote --file migrations/0005-folders-teams.sql
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY,
  org TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE(org, name)
);
ALTER TABLE apps ADD COLUMN folder_id INTEGER;

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY,
  org TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE(org, name)
);
CREATE TABLE IF NOT EXISTS team_members (
  team_id INTEGER NOT NULL REFERENCES teams(id),
  email TEXT NOT NULL,
  UNIQUE(team_id, email)
);
-- team shares are references, not copies: add someone to #finance later and they
-- gain access to everything shared with #finance
CREATE TABLE IF NOT EXISTS app_teams (
  app_id INTEGER NOT NULL REFERENCES apps(id),
  team_id INTEGER NOT NULL REFERENCES teams(id),
  role TEXT NOT NULL DEFAULT 'view',
  UNIQUE(app_id, team_id)
);
