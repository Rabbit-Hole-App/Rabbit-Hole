-- Comments v2 Stage 4 (docs/features/canvas-comments.md section 15, owner decision D4: in-app notifications first, no email now):
-- a person's explicit choice about one thread - follow it (news appears in their inbox even if they have not posted or been
-- mentioned) or mute it (no inbox entry, whatever happens). No row is the default: news reaches the inbox when they own the
-- canvas, posted in the thread, or were mentioned in it. The inbox itself is computed from threads, mentions and read marks, not
-- stored. Deleted with its thread. Additive and re-runnable; LEARN_DB only. Production: an owner command; never applied by a lane.
CREATE TABLE IF NOT EXISTS canvas_comment_follows (
  thread_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('follow', 'mute')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (thread_id, user_id)
);
CREATE INDEX IF NOT EXISTS canvas_comment_follows_user ON canvas_comment_follows (user_id, state);
