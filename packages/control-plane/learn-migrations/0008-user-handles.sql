-- Public handles (docs/features/user-handles.md, owner 2026-10-06): every Rabbit Hole user's unique public identity,
-- rendered @handle and resolved by reference wherever a creator is shown - never copied into canvases, shares, forks
-- or publications. A narrow one-to-one extension of user_profiles, holding handle identity only: no name, avatar,
-- email-derived label, canvas ownership or publication state. No row = the user has not chosen a handle yet; nothing
-- is ever derived from an email. The handle is stored in its canonical lowercase form; UNIQUE with NOCASE makes the
-- database the authority (one winner per handle, whatever the case). Additive and re-runnable; LEARN_DB only.
-- Applied locally only until an explicit deploy GO (order 0004..0008).
CREATE TABLE IF NOT EXISTS user_handles (
  email TEXT PRIMARY KEY REFERENCES user_profiles(email) ON DELETE CASCADE,
  handle TEXT NOT NULL UNIQUE COLLATE NOCASE
);
