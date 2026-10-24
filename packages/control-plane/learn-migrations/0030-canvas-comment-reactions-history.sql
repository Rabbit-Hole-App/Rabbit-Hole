-- Comments v2 Stage 3 (docs/features/canvas-comments.md section 15): reactions, edit history and the touch row that lets a
-- thread's since-read find a change that leaves no timestamp on canvas_comments (a reaction added or removed). A reaction is
-- one emoji from the server's fixed set by one account; an edit keeps the text it replaced (the newest 20 per comment) for the
-- author and the canvas owner. All three are deleted with their comment, thread or canvas. Additive and re-runnable; LEARN_DB
-- only. Production: an owner command; never applied by a lane.
CREATE TABLE IF NOT EXISTS canvas_comment_reactions (
  comment_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (comment_id, user_id, emoji)
);
CREATE TABLE IF NOT EXISTS canvas_comment_edits (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL,
  body TEXT NOT NULL,
  mentions_json TEXT NOT NULL DEFAULT '[]',
  replaced_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS canvas_comment_edits_comment ON canvas_comment_edits (comment_id, replaced_at);
CREATE TABLE IF NOT EXISTS canvas_comment_touches (
  comment_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  touched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS canvas_comment_touches_thread ON canvas_comment_touches (thread_id, touched_at);
