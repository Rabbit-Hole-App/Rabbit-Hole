-- When each batch of log lines arrived - the run page shows "+12.3s" offsets.
ALTER TABLE run_logs ADD COLUMN ts TEXT;
