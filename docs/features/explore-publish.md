# Explore publishing: private, unlisted, published

Owner rules, 2026-10-06. Sharing and publishing are different actions.

| State | How it comes about | Who can open it | In Explore |
|---|---|---|---|
| Private | The default for every new canvas. | The owner only. | Never. |
| Unlisted | The existing explicit Share, under the existing link rules (`learn_boards.shared`, `view_token`, `edit_token`, `public_view`). | Whoever the link rules allow. | Never. |
| Public | The owner's explicit "Publish to Explore". | Anyone, signed in or not, at `/e/<token>`, read-only, in the existing shared view: Start Rabbit Hole and `[GitFork Fork N]`. | Yes. |

## Rules

- **Link access is not discoverability.** `public_view` means signed-out viewing through a link and is never read as Explore visibility. `apps.visibility`, which governs deployed-app teams, is not used either.
- **No backfill:** every share that existed before this feature stays unlisted.
- **Only the owner publishes, explicitly.** A share link, `public_view`, opening, forking or Start Rabbit Hole never publishes. A fork of a published canvas starts private.
- **What can be published:** the owner's own live, top-level canvas, under the owner's `@handle`. Every canvas has its board from creation, so one never opened publishes empty; a canvas made before that gets its empty board when published, never the old "open this canvas so it saves" refusal (owner, 2026-10-08; canvas-persistence.md, Saved at creation).
  - A nested Rabbit Hole cannot be published on its own.
  - An archived canvas is restored first. Archiving removes the publication, and restoring never republishes.
  - With no handle, the server answers `409 needsHandle`. The Share panel then asks the person to choose one (docs/features/user-handles.md), and the same Publish carries on.
- **Live:** a publication shows the canvas as it is now. The owner's later edits keep its server copy current, as they do for a shared board. There is no snapshot or republish in V1; to stop showing new work, the owner removes the canvas from Explore.
- **Remove from Explore:**
  - It deletes the publication and kills `/e/<token>`. Publishing again mints a new token.
  - It removes the canvas from Explore.
  - It leaves share links and their settings alone, keeps the canvas and existing forks (whose "original" link becomes unavailable to them), and leaves private holes untouched.
- **Never exposed by a publication:**
  - the owner's Tutor chats or learner evidence;
  - private Rabbit Holes, private forks or unpublished canvases;
  - auth, session or viewer identities, or who forked;
  - emails.
- **Repository boundary:** a publication shows a repository's name, commit and code only when the repository is confirmed public. Private code is never shown, whatever a share link of the same board allows. An explicit publication permission for private code is not part of V1, so it defaults to off.
- **Attribution:** always `@handle`, with the display name first when set ("Ana Lima · @ana"). It never falls back to an email.
- **Fork count:** the canonical direct-fork count (`FORK_COUNT`, canvas-forking.md), with the cards' fork icon and count.

## Persistence

- **Migration `learn-migrations/0007-canvas-publications.sql`** adds `canvas_publications (org, canvas, token UNIQUE, published_at)`, primary key `(org, canvas)`.
  - A canvas with no row is not discoverable.
  - `token` is the publication's own read capability: 24 random bytes in base64url, never derived from a share, edit or session token.
  - The table holds discoverability only.
  - It is additive and re-runnable, and applies to LEARN_DB only. It runs on local test databases only until a deploy GO.
  - Deploy order: 0004, 0005, 0006, 0007, 0008. `0008-user-handles` is separate, and the two migrations do not overlap.
- **Owner routes:** `POST /api/apps/<canvas>/publish` and `POST /api/apps/<canvas>/unpublish` are owner-only, through `ownedCanvas`.
  - Another workspace gets 404, a colleague gets 403, signed-out gets 401, and a GET gets 405.
  - Publish keeps the same token on a repeat.
  - The owner's canvas rows carry `published` and `publication_token`. The board's `sharing` carries `published` and `publication` when published.

## The public route

`/e/<token>` serves the same page as `/b/<token>` (`SharedBoardPage`) and calls the same shared routes: open, assets, fork, Start Rabbit Hole and ask. The server resolves a publication token to its canvas's main board (`sharedRow` returns `publication: true`):

- **Access:** viewing needs no sign-in. The page is always read-only: PUT returns 403.
- **Repository:** `linkSource` applies the publication's public-only repository boundary.
- **Ask:** limited per publication, keyed by `publicationKey(token)` (a SHA-256 under its own prefix), so the raw token never keys a limit.
- **Fork and Start Rabbit Hole:** they need sign-in and resume through the existing flows: `/login?next=/e/<token>?fork=1` and `?rabbit=`. Sign-in for Ask likewise returns to `/e/`.
- **Credit:** a fork credits `/e/<token>` while the canvas stays published. The hole's source names it too.
- **Header:** "Published by @handle".

## Explore

- `GET /api/learn/boards/published` is public and readable signed out.
- It lists published, live, top-level canvases whose owner has a handle, newest first (`published_at DESC`, then publication order). There is no ranking, engagement weighting or personalization. The limit is 100.
- Each card is `{ title, creator: { handle, name }, project, fork_count, url: /e/<token>, published_at }`. The Explore page renders the title, `@handle` and the cards' fork component, and a card opens `/e/<token>`.
- The page has two tabs (owner, 2026-10-08): **Explainers**, the default, with these cards and the Sort control, and
  **Creators**, the profiles (creator-profile.md). The search field applies to the active tab only ("Search explainers",
  "Search creators"), and the tab is in the URL: `/explore`, `/explore?tab=creators`, so a reload keeps it
  (`home/card-sort.js` `exploreTab`). Each tab fetches only its own list.
- **One card per published canvas** (owner, 2026-10-08), also when several canvases belong to one project. Each card shows:
  - its own fork count: `FORK_COUNT` counts direct forks of that canvas only, never a project total;
  - its own Fork, on that canvas's publication token.
- **`project`:** the parent project's label, when the canvas is a project canvas (project-canvases.md). The card shows it under the `@handle` as "From owner/repo".
  - The label is the repository (`owner/repo`); projects have no title of their own. It adds `@branch` only when public projects of that repository sit on more than one branch.
  - It is `null` unless the repository is confirmed public (`repository_visibility`, the publication boundary above) and the project is not in Trash. A private or unknown repository is never named.
- **`?project=owner/repo`** (or `owner/repo@branch`) returns only published canvases from public projects of that repository, from every creator. It never returns a private or unlisted canvas or a project's Main canvas, which cannot be published.
  - A private or unknown repository matches nothing. A malformed value is a 400. It combines with `sort` and `q`.
- **The label is a link** to `/explore?project=<label>`. Explore shows a "From owner/repo" chip whose × drops only that filter, and says so when the project has no published canvas.
- **Import finding:** repository import accepts public GitHub repositories only (`parseRepository`, an anonymous `git ls-remote`; learn-repositories.md). A repository can still turn private, vanish, or predate `repository_visibility`, so the label follows the confirmed-public row and not the import.

## Owner controls

The canvas Share panel has a separate "Publish to Explore" section, outside the share switch:
- Private: "Publish to Explore", with what it means: public, live, until removed.
- Published: "Published to Explore", with its own `/e/` link to copy, and "Remove from Explore".

## Tests

- Server: `packages/control-plane/test/canvas-publications.test.js` covers the visibility matrix, the publish rules, signed-out `/e`, Fork and Start Rabbit Hole, unpublish and archive, the private repository boundary, and the listing order and isolation.
- Server, project labels and the filter: `packages/control-plane/test/project-canvases.test.js` (one card and one count per canvas, private repositories never named, unlisted and private canvases excluded, branches, Trash).
- Web: `packages/web/src/explore-publish.test.mjs` (the card order: title, creator, project label; nothing adds counts up by project).
- Browser, project label and filter: `packages/web/e2e/project-canvases-check.mjs` (local stack, not run yet).
- Browser: `packages/web/e2e/explore-check.mjs` covers private, unlisted and public from the Share panel, the Explore card, Explore to the canvas, signed-out `/e`, Fork and Start Rabbit Hole signing in and resuming, and Remove from Explore.
