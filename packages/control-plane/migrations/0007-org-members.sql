-- People added on /members without any share yet — the pool groups draw from.
--   npx wrangler d1 execute small --remote --file migrations/0006-org-members.sql
CREATE TABLE IF NOT EXISTS org_members (
  org TEXT NOT NULL,
  email TEXT NOT NULL,
  UNIQUE(org, email)
);
