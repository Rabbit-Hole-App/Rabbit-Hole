# Creator profile: /@handle and Explore creator discovery

Owner briefs, 2026-10-06 (#63: the creator profile, and the rule that any user becomes a creator). The profile is for discovery and reputation. It is not a social network.

## Who is a creator

- Any Rabbit Hole user, automatically, from their first successful Publish to Explore (explore-publish.md). There is no creator account, application, approval or verification.
- No creator record is written on publish. The profile is read from the canonical identity: `user_handles.handle`, `user_profiles.name` and `avatar`, by reference. Nothing is copied onto canvases or publications.
- A handle with no live publication still resolves at `/@handle`, with no explainers. Its user profile is never deleted. It drops out of Explore's creator row and creator search, which list only people with at least one live publication.

## The page: /@handle

```
[avatar]  Display Name                                  [Edit profile] [Analytics]   (your own profile only)
          @handle  [✓ Your profile]                     (the check: your own profile only)
          N public explainers · M forks

Public explainers                                        Sort: Newest | Most forked
[the canonical card] [the canonical card]
```

- **Route:** `/@<handle>`, any case. The lookup is case-insensitive (`user_handles` is `COLLATE NOCASE`), and the address is rewritten to the canonical lowercase handle. Never an email, a display name or an internal id in the URL. An unknown handle shows "No creator @x. The handle may have changed." (the API answers 404).
- **Who sees it:** everyone, signed in or out. Signed in, it sits in the app's Shell, and the sidebar lights Explore. Signed out, it stands alone with the product mark, as `/e/<token>` does.
- **Identity:**
  - **Avatar:** the profile picture, served by its own URL (`/api/learn/creators/<handle>/avatar`), never inlined in a list. With none, the initials treatment every avatar uses, from the display name, else the handle.
  - **Name:** the display name, with `@handle` under it. With no display name, `@handle` is the heading and is not repeated.
  - **Bio and category:** not shown. Their storage needs migration 0011 (below), and no row means no line, so nothing renders an empty row.
- **Counters:** the public explainer count and the aggregate canonical forks: Σ `FORK_COUNT` over the public explainers only, so forks of private canvases never count. Learners are not shown. They are not collected (creator-analytics-contract.md), and the brief rules out estimates.
- **Explainers:** exactly the creator's part of Explore's published set. That is live, top-level canvases that are published, not archived and not in Trash. Never private, unlisted, private forks, nested Rabbit Holes, archived or unpublished drafts. They show on Explore's own card list (`home/PublicCards.jsx`, the canonical `LearningCard`; there is no creator-specific card), with the same actions: Start Rabbit Hole and Fork on others' cards, the Owned-by-you badge on your own, and Copy link.
- **Sorting:** Newest (the default, `published_at`) and Most forked (`FORK_COUNT`). Each ends on the publication's own order and is sorted on the server. There is no "Most learned": no learner metric exists.

## The blue check

- Another creator's profile and cards: no blue check anywhere. Nothing implies verification.
- Your own profile: "Your profile" beside your @handle, with the existing `OwnerCheck` drawing (`owned`, tooltip "Owned by you · This is yours. It does not verify identity."). Your own cards carry it as they do in Explore.
- Real creator verification is a separate future feature.

## Your own profile

- It shows the same public page and content everyone sees. It adds two subtle buttons:
  - **Edit profile** opens Settings > Profile (name, picture, handle) through the existing `small:settings` event.
  - **Analytics** opens your private creator analytics as a side panel. The panel is beside the page and never mixed into it (creator-analytics-contract.md "Analytics UI").
- If you change your handle while on your profile, the page follows to the new `/@handle`.

## Links to the profile

`@handle` links to `/@handle` on public content only. Private views keep it as text.

| Where | Link |
|---|---|
| Explore card | the @handle (neutral; blue stays the title's), via `LearningCard creatorHref` |
| Creator profile card | the same |
| `/e/<token>` header | "Published by Name · @handle" |
| `/b/<token>` share-link header | text only: a share link is not public content |
| Library and Home cards | text only (private views) |

## Explore: creator discovery and search

- **Card-first.** The feed is unchanged. Above it, a small "Creators to explore" row of chips shows each creator's picture or initials, name, @handle and explainer count, and opens `/@handle`. It lists up to 8 creators, ordered by latest publication. There is no ranking, follower count or reputation.
- **Search** (one field, "Search creators and explainers"), answered by the server:
  - **Creators:** by @handle or display name. An exact @handle comes first, then @handle prefixes, then latest publication. A leading `@` is accepted.
  - **Explainers:** by title, description, @handle or display name, on the canonical cards, in the chosen Explore sort.
  - **Never by email:** no query reads an email column.
  - **Safe input:** LIKE wildcards are escaped, so `_` and `%` are plain characters. The term is capped at 60 characters.
  - While searching, the creator row gives way to "Creators" and "Explainers" results.

## Click paths

- Explore card title or card → `/e/<token>`. Its @handle → `/@handle`.
- `/e/<token>` header @handle → `/@handle`.
- Profile card title or card → the canonical `/e/<token>`.
- Creator chip (row or search) → `/@handle`.

## API (public, read-only, signed out included)

| Route | Answers |
|---|---|
| `GET /api/learn/creators/<handle>?sort=newest\|forks` | `{ handle, name, avatar, explainer_count, fork_count, explainers: [Explore card] }`; 404 for an unknown or malformed handle; 400 for another sort |
| `GET /api/learn/creators/<handle>/avatar` | the PNG bytes, or 404 |
| `GET /api/learn/creators[?q=]` | `{ creators: [{ handle, name, avatar, explainer_count, url }] }`, at most 8 |
| `GET /api/learn/boards/published?sort=&q=` | Explore's listing, filtered by `q` |

- The server code is `packages/control-plane/src/creators.js`. It shares the published set with Explore: `learn-boards.js` `PUBLISHED` and `exploreCard`.
- Every write method returns 405. No route returns an email or an internal id.

## Bio and category: migration 0011 (proposal, NOT created)

The brief asks for the schema first, so no migration file exists. The proposal:

```sql
-- 0011-user-profile-bios.sql (PROPOSAL; needs the owner's GO)
-- Optional public profile text (creator profile brief §5-6): a short bio and a free-text category line a person writes
-- for their /@handle. One row per account principal, written only when they fill one in. No row means no bio and no
-- category, and the profile omits both lines. Never copied onto canvases or publications. Additive and re-runnable;
-- LEARN_DB only. Deploy order: after 0010.
CREATE TABLE IF NOT EXISTS user_profile_bios (
  email TEXT PRIMARY KEY REFERENCES user_profiles(email) ON DELETE CASCADE,
  bio TEXT CHECK (bio IS NULL OR length(bio) <= 160),
  category TEXT CHECK (category IS NULL OR length(category) <= 40),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- **Why a table, not columns on `user_profiles`:** SQLite has no `ADD COLUMN IF NOT EXISTS`, so an `ALTER TABLE` migration fails on its second run. That breaks the learn-migrations rule that every migration is additive and re-runnable; 0008-0010 each added a table for the same reason. It also stays apart from the identity tables: `user_handles` holds handle identity only.
- **It is not a creator record.** Any user may write one, publishing or not, and nothing is written on publish.
- **Category:** free text, with no taxonomy (brief §6), such as "AI Systems".
- **Reads and writes after GO:**
  - `GET` and `PUT /api/profile` carry `bio` and `category`. Text is trimmed, the category is one line, and an empty value clears it by deleting the row.
  - The profile route joins them by reference. Settings > Profile gets two fields.
  - Search may then match the category.

## Not built, and why

- **Bio and category:** waiting on 0011.
- **Learners, and Rabbit Hole starts on the profile:** waiting on #62 storage. No number is estimated.
- **The fork-provenance link** ("Forked from … · @alice" linking to `/@alice` when the original is public): `ForkedFrom` lives in `home/Provenance.jsx`, a card-lane file outside this lane. Public content shows no fork provenance today, since Explore and `/e` carry none, so only private Library cards are affected.
- **The Agent Bar and ⌘K search** are not on the profile page. It renders from `main.jsx` Root, as `/e` does, so it works signed out. The bar is mounted only by `AppRoot`.
- **`creator_profile_opened`** (creator-analytics-contract.md) is not emitted: no event is collected yet.

## Tests

- **Server:** `packages/control-plane/test/creator-profile.test.js` covers:
  - the right creator, by reference;
  - case-insensitive lookup, 404s and a changed handle;
  - only public publications;
  - the Σ `FORK_COUNT` aggregate and the two sorts;
  - search by handle, name, title and description, never by email, with wildcards escaped;
  - discovery order;
  - the avatar route;
  - read-only methods.

  Every JSON answer is checked for emails.
- **Web unit:** `src/creator-profile.test.mjs` covers the route, the owner-only parts, the public-only links and the analytics typed states. `src/explore-publish.test.mjs` follows the card list into `home/PublicCards.jsx`, and `src/routes.test.mjs` checks that a profile lights Explore.
- **Browser:** `e2e/creator-profile-check.mjs` (14 checks, local stack only) covers:
  - the creator row;
  - the card's @handle link;
  - Explore → @handle → profile → explainer → `/e` → back;
  - another creator with no check;
  - the sorts;
  - the minimal creator;
  - case and 404;
  - search, never by email;
  - your own profile with Edit profile;
  - signed out;
  - a changed handle;
  - no page errors.
