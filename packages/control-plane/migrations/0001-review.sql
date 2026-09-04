-- Deploy review columns. Run once on existing DBs:
--   npx wrangler d1 execute small --remote --file migrations/0001-review.sql
-- Fresh DBs get these from schema.sql; re-running this file errors on duplicate columns.
ALTER TABLE apps ADD COLUMN review TEXT;
ALTER TABLE apps ADD COLUMN review_prev TEXT;
ALTER TABLE apps ADD COLUMN reviewed_at TEXT;
ALTER TABLE apps ADD COLUMN review_model TEXT;
