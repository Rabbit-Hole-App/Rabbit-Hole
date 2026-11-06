-- Card feedback (docs/features/explain-on-canvas, roadmap R1): one private up/down self-report per learner, canvas and generated
-- card, kept beside the board and never in the shared card JSON. Absent row = no rating; clearing a rating deletes its row. A row
-- grants only its learner on that canvas (card-feedback-routes.js), never a board viewer, share link or fork: it is keyed by the
-- canvas, so a duplicate or fork starts with none. A deleted card's row is kept (an undo restores the rating) and not read.
-- Additive and re-runnable; LEARN_DB only. Production migrations are an owner command, never applied by a lane.
CREATE TABLE IF NOT EXISTS learn_card_feedback (
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  app TEXT NOT NULL,
  board TEXT NOT NULL,
  card_id TEXT NOT NULL,
  value TEXT NOT NULL CHECK (value IN ('up', 'down')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org, owner_user_id, app, board, card_id)
);
