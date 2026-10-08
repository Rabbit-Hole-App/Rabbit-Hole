-- A comment pin's colour (docs/features/canvas-comments.md section 8, owner 2026-10-08): one row per recoloured thread,
-- from the canvas's six-swatch palette, set by whoever may resolve the thread. No row is the default orange. Stored apart
-- from the board (a colour never writes learn_boards) and deleted with its thread. A table rather than a column so the
-- file stays additive and re-runnable. LEARN_DB only. Applied locally only until an explicit deploy GO (order 0004..0014).
CREATE TABLE IF NOT EXISTS canvas_comment_colors (
  thread_id TEXT PRIMARY KEY,
  color TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
