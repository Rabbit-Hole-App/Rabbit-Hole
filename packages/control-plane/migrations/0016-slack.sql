-- Slack adapter for Ask: per-org install, channel↔app links, thread mapping.
CREATE TABLE IF NOT EXISTS slack_installs (
  org TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  bot_token TEXT NOT NULL,
  signing_secret TEXT NOT NULL,
  installed_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- app IS NULL + digest=1 → the weekly digest channel for the org
CREATE TABLE IF NOT EXISTS slack_channels (
  org TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  app TEXT,
  digest INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (org, channel_id)
);

-- Slack thread_ts ↔ Ask thread_id, so follow-ups keep context
CREATE TABLE IF NOT EXISTS slack_threads (
  org TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  thread_ts TEXT NOT NULL,
  ask_thread_id INTEGER NOT NULL,
  PRIMARY KEY (org, channel_id, thread_ts)
);
