-- Stop button: remember each run's Fly machine so the dashboard can kill it.
--   npx wrangler d1 execute small --remote --file migrations/0004-stop.sql
ALTER TABLE runs ADD COLUMN machine_id TEXT;
