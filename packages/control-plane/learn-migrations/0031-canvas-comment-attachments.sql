-- Comments v2 Stage 3 (docs/features/canvas-comments.md section 15, owner decision D3): the files attached to comments. One row
-- per file in the LEARN_MEDIA bucket (object_key); thread_id and comment_id are NULL while an upload waits to be attached.
-- The per-file, per-comment and per-canvas caps are enforced by the reserving INSERT, not by this schema. purged_at marks a row
-- whose access is gone and whose object is still to leave the bucket. Additive and re-runnable; LEARN_DB only. Production: an
-- owner command; never applied by a lane.
CREATE TABLE IF NOT EXISTS canvas_comment_attachments (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  canvas TEXT NOT NULL,
  thread_id TEXT,
  comment_id TEXT,
  uploader_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  purged_at TEXT
);
CREATE INDEX IF NOT EXISTS canvas_comment_attachments_comment ON canvas_comment_attachments (comment_id);
CREATE INDEX IF NOT EXISTS canvas_comment_attachments_canvas ON canvas_comment_attachments (org, canvas, purged_at);
CREATE INDEX IF NOT EXISTS canvas_comment_attachments_uploader ON canvas_comment_attachments (uploader_id, created_at);
CREATE INDEX IF NOT EXISTS canvas_comment_attachments_object ON canvas_comment_attachments (object_key);
