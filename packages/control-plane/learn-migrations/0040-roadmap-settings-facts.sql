-- Tutor ladder R6 (automatic next proposals): a monotonic revision for the learner-global Auto-suggest preference, so each CHANGE of it commits one
-- learner-scoped outbox event (kind settings_changed) in the same batch as the preference (learn_user_settings.auto_suggest). Ask -> Tutor -> Ask style
-- repeats stay distinct because the revision, not the value, is part of the event identity. Additive and re-runnable, LEARN_DB only.
-- Not applied by a lane: dev needs the owner's GO (announced first), production is an owner command. The writer only touches this table when
-- ROADMAP_ENABLED and ROADMAP_AUTO_ENABLED are both 'true', and falls back to the plain preference write if the table is absent.
CREATE TABLE IF NOT EXISTS learn_roadmap_settings_facts (
  org TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  auto_suggest INTEGER NOT NULL CHECK (auto_suggest IN (0, 1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (org, owner_user_id)
);
