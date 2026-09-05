-- Ask phase 2: every tool call is a proposal; nothing executes until the user
-- approves it. The row doubles as the approval log (who, what, when, thread).
CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  thread_id INTEGER NOT NULL,
  org TEXT NOT NULL,
  user TEXT NOT NULL,
  tool TEXT NOT NULL,
  args TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',   -- proposed | approved
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_by TEXT,
  approved_at TEXT
);
