-- Settings > Profile (user, 2026-09-30): the name and picture a person chose for themselves. One row
-- per account principal; only its owner reads or writes it (profile.js). The picture is a small PNG
-- data URL, resized in the browser before it is sent. Additive and re-runnable; LEARN_DB only.
CREATE TABLE IF NOT EXISTS user_profiles (
  email TEXT PRIMARY KEY,
  name TEXT,
  avatar TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
