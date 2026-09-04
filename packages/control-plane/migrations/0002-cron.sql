-- cron: schedule fields on apps + skip reason on runs (matches schema.sql)
ALTER TABLE apps ADD COLUMN schedule TEXT;
ALTER TABLE apps ADD COLUMN schedule_paused INTEGER NOT NULL DEFAULT 0;
ALTER TABLE apps ADD COLUMN last_scheduled_at INTEGER;
ALTER TABLE runs ADD COLUMN reason TEXT;
