-- Slack-approved runs get their outcome pushed back to the thread; one row per pending run.
CREATE TABLE IF NOT EXISTS slack_runs (
  org TEXT NOT NULL,
  run_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  thread_ts TEXT,
  PRIMARY KEY (org, run_id)
);
