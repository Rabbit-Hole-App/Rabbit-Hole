-- Profile description (docs/features/creator-profile.md, owner 2026-10-08: "in profile add a discription"): the short
-- plain-text line a person writes about themselves in Settings > Profile, shown under their name on /@handle and on
-- their creator card. At most 160 characters, never a link or HTML (rendered as text). One row per account principal,
-- written only when they fill one in; clearing it deletes the row, so no row means no description and nothing renders.
-- A narrow one-to-one extension of user_profiles, as user_handles is: not a creator record, never copied onto canvases
-- or publications. A table, not a user_profiles column: SQLite has no ADD COLUMN IF NOT EXISTS, so an ALTER would fail
-- on its second run. Additive and re-runnable; LEARN_DB only. Applied locally only until an explicit deploy GO (after 0012).
CREATE TABLE IF NOT EXISTS user_profile_descriptions (
  email TEXT PRIMARY KEY REFERENCES user_profiles(email) ON DELETE CASCADE,
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 160)
);
