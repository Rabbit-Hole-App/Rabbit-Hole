-- Email preferences (docs/features/signup-email-preferences.md, owner 2026-11-03): "Rabbit Hole Updates" and "Newsletter",
-- one row per account and category, written only by the person's own choice (onboarding Continue, Settings, an unsubscribe
-- link). No row means no preference recorded: such a person is NOT subscribed and is never treated as opted in.
-- user_id is users.id (0026): the account, resolved server-side from the session, never from a request body. The mailing
-- address is not copied here: it is resolved at send time from user_identities.provider_email (email-preferences-store.js).
-- method says how the value was obtained and affirmative whether it counts as an active opt-in: a box shown checked and
-- submitted unchanged (signup_preselected) is stored as submitted but is not affirmative. disclosure_version is the wording
-- shown with the choice (NULL for an unsubscribe link, which shows none). changed_at is epoch seconds, as users.created_at.
-- Additive and re-runnable. Main DB (binding DB) only; apply BEFORE the code that writes it ships.
CREATE TABLE IF NOT EXISTS user_email_preferences (
  user_id TEXT NOT NULL REFERENCES users(id),
  category TEXT NOT NULL CHECK (category IN ('updates', 'newsletter')),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  source TEXT NOT NULL CHECK (source IN ('onboarding', 'settings', 'unsubscribe')),
  method TEXT NOT NULL CHECK (method IN ('signup_preselected', 'signup_user_checked', 'signup_user_unchecked', 'settings_user_set', 'unsubscribe_link')),
  affirmative INTEGER NOT NULL CHECK (affirmative IN (0, 1)),
  disclosure_version TEXT,
  changed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, category)
);
-- Addresses that must never be mailed (a bounce or a complaint). Nothing writes it yet: no email is sent by this change.
-- The sender helper (marketingRecipient) refuses a suppressed address whatever the preference says.
CREATE TABLE IF NOT EXISTS email_suppressions (
  address TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
