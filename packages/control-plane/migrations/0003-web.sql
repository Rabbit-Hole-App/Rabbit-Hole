-- Web dashboard columns. Run BEFORE deploying the worker that selects them:
--   npx wrangler d1 execute small --remote --file migrations/0003-web.sql
-- Fresh DBs get these from schema.sql; re-running this file errors on duplicate columns.
ALTER TABLE apps ADD COLUMN deployed_at TEXT;
ALTER TABLE apps ADD COLUMN runbook TEXT;
