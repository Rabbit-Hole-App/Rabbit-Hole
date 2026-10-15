-- Canvas references (C:/s/spec/canvas-references-mvp.md; owner decisions 2026-10-14 Q1/Q2: local and the feature's dev preview;
-- production needs its own GO). The saved source board is authoritative: a CanvasNode block holds refs [{ id, target }]. This
-- table is a derived index for backlinks, rewritten in the same LEARN_DB.batch as the board write and guarded on the row that
-- write produced (canvas-refs.js), so a rejected or stale save never changes it. One row per indexed reference: source_board
-- and target_board are learn_boards.id, source_object the card's block id, object_title its title (at most 120 characters).
-- A target the saver cannot read is not indexed. Additive and re-runnable; LEARN_DB only. Independent of the held 0020.
CREATE TABLE IF NOT EXISTS learn_canvas_refs (
  source_board TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  source_object TEXT NOT NULL,
  object_title TEXT,
  target_board TEXT NOT NULL,
  PRIMARY KEY (source_board, ref_id)
);
CREATE INDEX IF NOT EXISTS learn_canvas_refs_target ON learn_canvas_refs (target_board);
