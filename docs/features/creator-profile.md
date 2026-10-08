# Creator profile: /@handle and Explore creator discovery

Owner briefs, 2026-10-06 (#63: the creator profile, and the rule that any user becomes a creator). The profile is for discovery and reputation. It is not a social network.

## Who is a creator

- Any Rabbit Hole user, automatically, from their first successful Publish to Explore (explore-publish.md). There is no creator account, application, approval or verification.
- No creator record is written on publish. The profile is read from the canonical identity: `user_handles.handle`, `user_profiles.name` and `avatar`, and `user_profile_descriptions.description`, by reference. Nothing is copied onto canvases or publications.
- A handle with no live publication still resolves at `/@handle`, with no explainers. Its user profile is never deleted. It drops out of Explore's Creators tab and creator search, which list only people with at least one live publication.

## The page: /@handle

```
[avatar]  Display Name                                  [Edit profile] [Analytics]   (your own profile only)
          @handle  [✓ Your profile]                     (the check: your own profile only)
          The profile description, as text              (only when they wrote one)
          N public explainers · M forks

Public explainers                    [Search projects and canvases]  Sort: Newest | Most forked
[the canonical card] [the canonical card]
```

- **Route:** `/@<handle>`, any case. The lookup is case-insensitive (`user_handles` is `COLLATE NOCASE`), and the address is rewritten to the canonical lowercase handle. Never an email, a display name or an internal id in the URL. An unknown handle shows "No creator @x. The handle may have changed." (the API answers 404).
- **Who sees it:** everyone, signed in or out. Signed in, it sits in the app's Shell, and the sidebar lights Explore. Signed out, it stands alone with the product mark, as `/e/<token>` does.
- **Identity:**
  - **Avatar:** the profile picture, served by its own URL (`/api/learn/creators/<handle>/avatar`), never inlined in a list. With none, the initials treatment every avatar uses, from the display name, else the handle.
  - **Name:** the display name, with `@handle` under it. With no display name, `@handle` is the heading and is not repeated.
  - **Description** (owner, 2026-10-08: "in profile add a discription"): the line the person wrote in Settings > Profile, under the name and @handle, as plain text. No description, no line. Your own follows Settings at once (no reload). See "Profile description" below.
  - **Category:** not shown, not stored.
- **Counters:** the public explainer count and the aggregate canonical forks: Σ `FORK_COUNT` over the public explainers only, so forks of private canvases never count. Learners are not shown. They are not collected (creator-analytics-contract.md), and the brief rules out estimates.
- **Explainers:** exactly the creator's part of Explore's published set. That is live, top-level canvases that are published, not archived and not in Trash. Never private, unlisted, private forks, nested Rabbit Holes, archived or unpublished drafts. They show on Explore's own card list (`home/PublicCards.jsx`, the canonical `LearningCard`; there is no creator-specific card), with the same actions: Start Rabbit Hole and Fork on others' cards, the Owned-by-you badge on your own, and Copy link.
- **Sorting:** Newest (the default, `published_at`) and Most forked (`FORK_COUNT`). Each ends on the publication's own order and is sorted on the server. There is no "Most learned": no learner metric exists.
- **Search** (owner, 2026-10-08: "in creators profile put a search bar so they can search projects or canvas by name for that specific creator"): one field beside Sort (full width under it on a phone), Explore's own field markup, for every viewer, signed out included, whenever the creator has a public explainer.
  - **What it matches:** this creator's published canvases by title, and their public projects by name (the repository a card names), case-insensitive and anywhere in the name. It runs on the server (`GET /api/learn/creators/<handle>?q=`, after a 250 ms pause in typing), because the list is capped at `EXPLORE_LIMIT` (100). The query is the creator's part of `PUBLISHED` plus `c.title LIKE` or `r.repo LIKE`, with wildcards escaped, so a private, unlisted, archived, nested or trashed canvas, or a private or unknown repository, is never found. The counters stay the creator's totals.
  - **Results, labelled:** **Projects** - each matching project as a chip with its canvas count (`provenance.js` `matchingProjects`, from the cards returned), opening Explore filtered to it, as a card's project label does - then **Canvases**, the matching canvases (by title, or because their project matched) on the same cards, in the chosen sort.
  - **Nothing matches:** "No canvases or projects match "term"." **Esc** clears the field and the full list returns.
  - Not matched: a project's branch (a search for `main` finds nothing by branch) and the description.

## The blue check

- Another creator's profile and cards: no blue check anywhere. Nothing implies verification.
- Your own profile: "Your profile" beside your @handle, with the existing `OwnerCheck` drawing (`owned`, tooltip "Owned by you · This is yours. It does not verify identity."). Your own cards carry it as they do in Explore.
- Real creator verification is a separate future feature.

## Your own profile

- It shows the same public page and content everyone sees. It adds two subtle buttons:
  - **Edit profile** opens Settings > Profile (name, picture, handle, description) through the existing `small:settings` event.
  - **Analytics** opens your private creator analytics as a side panel. The panel is beside the page and never mixed into it (creator-analytics-contract.md "Analytics UI").
- If you change your handle while on your profile, the page follows to the new `/@handle`.

## Links to the profile

Every `@handle` links to `/@handle` (owner, 2026-10-08: "make sure i am always able to click on @handles to go to the
creator and see their cards"; it replaces "public content only"). The profile shows only what that creator published,
so a link from a private view reveals nothing the handle did not already name. Handles are unique (user-handles.md).

| Where | Link |
|---|---|
| Explore card | the @handle (neutral; blue stays the title's), via `LearningCard creatorHref` |
| Creator profile card | the same |
| `/e/<token>` header | "Published by Name · @handle" |
| `/b/<token>` share-link header | "Shared by Name · @handle" |
| Fork provenance ("Forked from … · @alice", Library cards and the canvas top bar) | the original creator's @handle, whatever the original's state (`provenance.js` `creatorUrl`) |
| Library and Home cards | the @handle, through `cardModel`'s `creator.url` (yours opens your own profile) |

## Copy profile link

Owner, 2026-10-08: "Cretors card and in Creator profile should have a copy profile url button".

- **Where:** on every creator card (Explore's Creators tab, its Recommended creators and creator search: one `CreatorChip`), as an icon button at the square card's top right, beside the card's link and outside it; and on `/@handle`, in the name and handle row, labelled "Copy profile link". The profile's button is there for every viewer, signed out included.
- **What it copies:** the absolute profile URL, `${location.origin}/@handle` (`provenance.js` `profileUrl`) - the handle only, never an email or an internal id.
- **Feedback:** in place, never a corner toast, and it reverts after 1.6 seconds.
  - **On the profile** (the full button) it says "Profile link copied" (or "Couldn't copy the link") on the button itself.
  - **On the creator card** (`compact`) the button stays icon-sized so nothing spreads over the name: the link icon becomes a check, and the words go to a screen-reader live region (`sr-only`, `aria-live="polite"`), the button's accessible name and its tooltip.
- **It never navigates:** the click stops before the card's link (`preventDefault`, `stopPropagation`), and the button is not inside it.
- `CopyProfileLink` (`home/PublicCards.jsx`) is the one button for both places.

## Explore: creator discovery and search

- **Two tabs** (owner, 2026-10-08; it replaces the "Creators to explore" row above the feed): **Explainers** (the default, the card feed, with Sort) and **Creators** (`/explore?tab=creators`), which lists creator cards that open `/@handle`. Without a search it lists up to 8 creators, ordered by latest publication. There is no ranking, follower count or reputation.
- **The creator card** (owner, 2026-10-08: "The creators card should be square shape. They should list the number of Projects and Canvas and maybe it should also display their description"), one `CreatorChip` in `CreatorCards` (`home/PublicCards.jsx`) for the Creators tab, its Recommended creators and creator search:
  - **Square** at every width (`aspect-square`, clipped so content never stretches it): two to a row on a phone, then as many ~200px squares as fit.
  - Picture or initials, name, @handle (the name is the @handle when there is no display name), the profile description (at most 3 lines, as text; no description, no line), and **"N projects · M canvases"** at the foot.
  - **The counts are of what any viewer can see** (`creators.js` `COUNTS`, over `learn-boards.js` `PUBLISHED`): M is their published canvases (the explainer count); N is the distinct projects those cards name - a parent repository confirmed public and not in Trash (`PUBLISHED`'s `r`). Never a private, unlisted, archived, nested or trashed canvas, a private or unknown repository, or a project with nothing published.
  - The top right is kept free for one small icon button beside the link, outside it (Copy profile link, `ui/r29-copy-profile`).
- **Search** (one field, for the active tab only: "Search explainers" or "Search creators"), answered by the server:
  - **Creators:** by @handle or display name. An exact @handle comes first, then @handle prefixes, then latest publication. A leading `@` is accepted.
  - **Explainers:** by title, description, @handle or display name, on the canonical cards, in the chosen Explore sort.
  - **Never by email:** no query reads an email column.
  - **Safe input:** LIKE wildcards are escaped, so `_` and `%` are plain characters. The term is capped at 60 characters.
  - Each tab searches its own list; switching tabs keeps the typed text and applies it to the new tab.

## Click paths

- Explore card title or card → `/e/<token>`. Its @handle → `/@handle`.
- `/e/<token>` header @handle → `/@handle`.
- Profile card title or card → the canonical `/e/<token>`.
- Creator card (the Creators tab) → `/@handle`.

## API (public, read-only, signed out included)

| Route | Answers |
|---|---|
| `GET /api/learn/creators/<handle>?sort=newest\|forks[&q=]` | `{ handle, name, avatar, description, explainer_count, fork_count, explainers: [Explore card] }`; `q` narrows the explainers to a title or public project name containing it (the counters stay the totals); 404 for an unknown or malformed handle; 400 for another sort |
| `GET /api/learn/creators/<handle>/avatar` | the PNG bytes, or 404 |
| `GET /api/learn/creators[?q=]` | `{ creators: [{ handle, name, avatar, description, explainer_count, project_count, url }] }`, at most 8; Explore's AI find answers the same card (`creatorsByHandle`) |
| `GET /api/learn/boards/published?sort=&q=` | Explore's listing, filtered by `q` |

- The server code is `packages/control-plane/src/creators.js`. It shares the published set with Explore: `learn-boards.js` `PUBLISHED` and `exploreCard`.
- Every write method returns 405. No route returns an email or an internal id.

## Profile description: learn migration 0013

Owner, 2026-10-08: "in profile add a discription". It replaces the earlier bio-and-category proposal (0011, never created): a description only, no category.

```sql
-- learn-migrations/0013-user-profile-descriptions.sql (LEARN_DB; mirrored at the end of repository-schema.sql)
CREATE TABLE IF NOT EXISTS user_profile_descriptions (
  email TEXT PRIMARY KEY REFERENCES user_profiles(email) ON DELETE CASCADE,
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 160)
);
```

- **Why a table, not a `user_profiles` column:** SQLite has no `ADD COLUMN IF NOT EXISTS`, so an `ALTER TABLE` migration fails on its second run. That breaks the learn-migrations rule that every migration is additive and re-runnable; 0008-0010 each added a table for the same reason.
- **One row per person, written only when they write one.** No row means no description and no line anywhere. It is not a creator record: any user may write one, publishing or not, and nothing is written on publish.
- **Settings > Profile > Description**, under Name and Handle: up to 160 characters, Save. `GET` and `PUT /api/profile` carry `description` (`profile.js`): text only, trimmed, line breaks, tabs and control characters become single spaces, at most `DESCRIPTION_MAX` (160) characters; an empty one deletes the row. The database checks the cap too.
- **Plain text everywhere:** stored and answered as typed (markup included) and rendered by React as a text child on `/@handle` and the creator card - never HTML, never a link.
- **Status:** created and tested locally only (node:sqlite, applied twice). Not applied to any remote D1: Home applies dev, production waits for the owner. Deploy order: after 0012.

## Not built, and why

- **Category:** not built (the owner asked for a description only).
- **Learners, and Rabbit Hole starts on the profile:** waiting on #62 storage. No number is estimated.
- **The Agent Bar and ⌘K search** are not on the profile page. It renders from `main.jsx` Root, as `/e` does, so it works signed out. The bar is mounted only by `AppRoot`.
- **`creator_profile_opened`** (creator-analytics-contract.md) is not emitted: no event is collected yet.

## Tests

- **Server:** `packages/control-plane/test/creator-profile.test.js` covers:
  - the right creator, by reference;
  - the creator card's counts (published canvases, the public projects their cards name; never private, unlisted or a private repository) and the description by reference, the same card from `creatorsByHandle`;
  - case-insensitive lookup, 404s and a changed handle;
  - only public publications;
  - the Σ `FORK_COUNT` aggregate and the two sorts;
  - the profile search (`?q=`): by title or public project, any case, this creator only; never private, unlisted, a private repository or an email; wildcards escaped; the counters unchanged;
  - search by handle, name, title and description, never by email, with wildcards escaped;
  - discovery order;
  - the avatar route;
  - read-only methods.

  Every JSON answer is checked for emails.
- **Server, the description:** `test/profile.test.js` covers `PUT /api/profile`'s description (one line, the 160 cap in code and in the database, markup kept as text, an empty one deletes the row, owner only) and 0013 (additive, applied twice, mirrored in `repository-schema.sql`, the foreign key).
- **Web unit:** `src/creator-profile.test.mjs` covers the route, the owner-only parts, the public-only links, the analytics typed states, the square creator card (description, counts, the grid on the Creators tab and Recommended), the description in Settings and on `/@handle` (the cap matches the server's; no `dangerouslySetInnerHTML`), Copy profile link (`profileUrl`, the card and profile wiring, the compact icon swap that never widens, no toast, no navigation), and the profile search (`matchingProjects`, the field for every viewer, the server filter, Esc, the empty line). `src/explore-publish.test.mjs` follows the card list into `home/PublicCards.jsx`, and `src/routes.test.mjs` checks that a profile lights Explore.
- **Browser:** `e2e/creator-profile-check.mjs` (17 checks, local stack only) covers:
  - the Explore tabs (Explainers default, Creators, the tab in the URL); the creator cards are square, with the description and "0 projects · 3 canvases" (private, unlisted and archived never count);
  - Copy profile link on a creator card (the check icon and the live text, the button no wider), on the profile and signed out (the button's own words): the clipboard holds origin + `/@handle`, it reverts, nothing navigates (`e2e/explore-check.mjs` checks the card too);
  - the description under the name on `/@handle`, none for the minimal creator;
  - Edit profile → Settings → a new description (with markup) saved shows at once under the name and on the creator card, as text;
  - the card's @handle link;
  - Explore → @handle → profile → explainer → `/e` → back;
  - another creator with no check;
  - the sorts;
  - the profile search: typing filters, the empty line (never private, unlisted or archived), Esc clears; the field signed out too;
  - the minimal creator;
  - case and 404;
  - search, never by email;
  - your own profile with Edit profile;
  - signed out;
  - a changed handle;
  - no page errors.
- **Browser, Explore:** `e2e/explore-check.mjs` checks a creator card too: square, the description as text, "0 projects · 1 canvas" beside a private canvas, and two squares to a row at 390px with no sideways scroll.
