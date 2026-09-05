-- Ask (phase 1, read-only): threads + messages per scope and user; one-shot
-- failure diagnosis on the run row; AGENT.md uploaded at deploy.
CREATE TABLE IF NOT EXISTS threads (
  id INTEGER PRIMARY KEY,
  org TEXT NOT NULL,
  user TEXT NOT NULL,
  scope TEXT NOT NULL,            -- 'org' | 'app' | 'run'
  scope_ref TEXT,                 -- app name or run id; NULL for org
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  thread_id INTEGER NOT NULL,
  role TEXT NOT NULL,             -- 'user' | 'assistant'
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
ALTER TABLE runs ADD COLUMN diagnosis TEXT;
ALTER TABLE apps ADD COLUMN agent_md TEXT;
