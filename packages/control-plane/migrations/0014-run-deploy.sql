-- Ask code context: each run remembers which deploy it ran (for source + diffs).
ALTER TABLE runs ADD COLUMN deploy_id INTEGER;
