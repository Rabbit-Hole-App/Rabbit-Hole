-- Canvas context documents (docs/features/canvas-context-docs.md): PDFs and text files a learner
-- uploads for the agent to read, never placed on the canvas. The bytes live in LEARN_MEDIA
-- (learn-context/...); this row is the list and the on/off toggle. Additive and re-runnable; LEARN_DB only.
CREATE TABLE IF NOT EXISTS canvas_context_documents (
  org TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  app TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  size INTEGER NOT NULL,
  attached INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org, owner_email, app, id)
);
