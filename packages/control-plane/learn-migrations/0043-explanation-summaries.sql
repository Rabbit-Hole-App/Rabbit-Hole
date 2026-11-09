-- Minimize-to-tile: the collapsed Explanation card's summary, one row per (org, canvas, card id), so a second request for a card returns the stored text with no model call
-- (control-plane/src/explanation-summary.js). Interim: the summary is written from the browser until pictures-async lands, then it is written into the saved card server-side and
-- this table goes. Additive and re-runnable, LEARN_DB only. Not applied anywhere: dev and production application is an owner command, never applied by a lane; until it is
-- applied the route keeps the same record in the worker isolate (best effort).

CREATE TABLE IF NOT EXISTS explanation_summaries (
  org TEXT NOT NULL,
  app TEXT NOT NULL,
  card_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (org, app, card_id)
);
