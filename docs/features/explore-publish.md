# Explore publishing: private, unlisted, published

Owner rule, 2026-10-06. Sharing and publishing are different actions.

| State | How it comes about | Who can open it | In Explore |
|---|---|---|---|
| Private | The default for every new canvas. | The owner only. | Never. |
| Unlisted | The existing explicit Share, under the existing link rules (`learn_boards.shared`, `view_token`, `edit_token`, `public_view`). | Whoever the link rules allow. | Never. |
| Published | The owner's explicit "Publish to Explore". | Opens read-only in the existing shared view, with Start Rabbit Hole and `[GitFork Fork N]`. | Yes. |

## Rules

- `public_view` means signed-out viewing through a link. It is link access, never discoverability, and is never read as Explore visibility. `apps.visibility`, which governs deployed-app teams, is not used either.
- No backfill: every share that existed before this feature stays unlisted.
- Only the owner's explicit action publishes. A share link, `public_view`, opening, forking or Start Rabbit Hole never publishes. A fork of a published canvas starts private.
- Remove from Explore ends discoverability only. Share links and their settings stay as they were.
- Publishing never exposes:
  - the owner's Tutor chats or learner evidence;
  - private Rabbit Holes, private forks or private notes;
  - who forked;
  - repository code the viewer may not see. The per-share private-repository rule still holds.
- The fork count is the canonical direct-fork count (`FORK_COUNT`, canvas-forking.md), with the cards' fork icon and count.

## Persistence (built)

- Migration `learn-migrations/0007-canvas-publications.sql` adds `canvas_publications (org, canvas, published_at)`, primary key `(org, canvas)`.
  - A canvas with no row is not discoverable.
  - The table holds discoverability only: no content, Tutor state, evidence, share or repository permission.
  - It is additive and re-runnable, and applies to LEARN_DB only. It runs on local test databases only until a deploy GO.
  - Deploy order: 0004, 0005, 0006, 0007.
- `POST /api/apps/<canvas>/publish` and `POST /api/apps/<canvas>/unpublish` are owner-only, through the same `ownedCanvas` check as archive and rename.
  - Another workspace gets 404, a colleague gets 403, signed-out gets 401, and a GET gets 405.
  - Publish is idempotent. Unpublishing something unpublished is a no-op.
- The owner's canvas rows carry `published`. Deleting a canvas removes its publication.
- Tests are in `packages/control-plane/test/canvas-publications.test.js`.

## Waiting on owner decisions (not built)

The following waits for three owner decisions, made together: the public open route, the creator attribution, and the initial listing order.
- Explore listing
- Owner controls (Share / Publish to Explore / Remove from Explore)
- Public open route and its token
- Attribution
- Browser checks and Figma evidence
