-- Professor Next Steps telemetry (docs/features/professor-next-steps.md §2.3, owner 2026-10-08): one row per planned hook
-- set, owned or shared - the planner telemetry the route returns (tier, escalation reason, the validator rule names, calls,
-- ms, versions, model role and id, usage, cost; shared adds the one-way share key, a structural input summary and the trim
-- counts). Never a hook, the planner input, a card, an answer, an email or a share token. A cache hit plans nothing and
-- writes no row; a planner failure writes none. user_id is users.id (the owner's, or a signed-in shared viewer's; null
-- for an anonymous one); board is the owned app id, or the one-way share key on a shared canvas. Additive and re-runnable;
-- LEARN_DB only. Production waits for an explicit release GO.
CREATE TABLE IF NOT EXISTS next_steps_telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  scope TEXT NOT NULL,
  user_id TEXT,
  board TEXT NOT NULL,
  telemetry_json TEXT NOT NULL
);
