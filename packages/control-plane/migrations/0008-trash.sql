-- Soft delete: apps go to the dashboard Trash, restorable for 30 days, then the
-- daily 3am cron destroys the Fly app and purges the rows.
--   npx wrangler d1 execute small --remote --file migrations/0007-trash.sql
ALTER TABLE apps ADD COLUMN deleted_at TEXT;
