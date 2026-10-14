-- Chat workspace answers (agent-coordination/tasks/chat-workspace-CONTRACT.md B7; owner decision 2026-10-13 11:45 PM PT: local
-- and shared dev; production needs its own GO). Side tables beside the canvas chat's threads and messages
-- (repository-schema.sql), which stay untouched: a message with no meta row is an old message and renders as plain text.
-- chat_message_meta: one row per message. User rows hold {mode, command, contextRefs}; assistant rows hold
-- {version, mode, kind, contextRefs, actions, followUps, syllabus} or {status: 'stopped'}. alternative_of: a regenerated
-- answer points at the turn's first answer. chat_message_feedback: one rating per message and user; clearing deletes it.
-- chat_thread_state: per thread mode, draft, attached refs, the versioned summary, and last_activity_at (written only on a
-- message insert). Additive and re-runnable; LEARN_DB only.
CREATE TABLE IF NOT EXISTS chat_message_meta (
  message_id INTEGER PRIMARY KEY,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  alternative_of INTEGER,
  meta_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS chat_message_meta_thread ON chat_message_meta (thread_id);
CREATE TABLE IF NOT EXISTS chat_message_feedback (
  message_id INTEGER NOT NULL,
  user TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
  reason TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user)
);
CREATE TABLE IF NOT EXISTS chat_thread_state (
  thread_id TEXT PRIMARY KEY,
  mode TEXT,
  draft_json TEXT,
  summary_json TEXT,
  context_json TEXT,
  last_activity_at TEXT,
  updated_at TEXT NOT NULL
);
