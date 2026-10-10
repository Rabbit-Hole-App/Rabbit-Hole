# Library trash

Owner rules, 2026-10-06. Trash is a stronger removal than Archive, with an explicit Restore.
- **Archive** is organizational cleanup: the canvas stays itself and leaves the active Library.
- **Trash** removes the item from everywhere it is found, until it is restored. The two are never aliases.

## Schema

`learn-migrations/0010-library-trash.sql` creates `library_trash (org, name, trashed_at)`, primary key `(org, name)`.
- One table for both kinds V1 trashes: owned top-level canvases (`canvas-*`) and projects (`repo-*`). Hence "library", not "canvas".
- No row means not in Trash, and no content is copied into it.
- It is additive and re-runnable, LEARN_DB only. It runs on local test databases only until a deploy GO. Deploy order: 0004 … 0009, 0010.

## Move to Trash

`POST /api/apps/<canvas|project>/trash`, owner only.

| | In Trash |
|---|---|
| Home, Library (archived view too), Explore, search | Absent (`NOT_TRASHED` on every list) |
| Public | The publication is removed: `/e/<token>` dies and Explore drops it |
| Unlisted | Share links are suspended (`sharedRow` refuses them); the share configuration and tokens are kept |
| Private | Leaves the active views |
| Existing forks | Untouched; the canonical fork count keeps counting them |
| Content, title, description, ids, nested holes | Kept; nothing is deleted |
| Copying | Duplicate, Fork, Publish and share links are refused until restored |

- A nested Rabbit Hole is never trashed on its own (409). It goes with its canvas and comes back with it.
  - Its own share links sleep with the canvas too, however deep the hole sits, under a trashed project as well: `sharedRow`
    walks the hole's ancestors over `canvas_dives` (never `canvas_forks`, so a fork keeps its links) and Restore wakes the same tokens.
- A hole started from someone's shared canvas is a top-level canvas of yours, so it can be trashed.

## Restore

`POST /api/apps/<name>/untrash` removes the row, and the item is back in the Library:
- Share links work again with the same tokens.
- The publication is **not** restored. Publishing again is the owner's explicit act.
- Neither Trash nor Restore bumps `updated_at`, so a restored canvas does not jump to the top.

## Trash list

`GET /api/library/trash` returns your trashed canvases and projects, newest first: `{ kind, name, title, trashed_at }`. The sidebar's Trash (Rabbit Hole build) lists them with Restore and says "Items stay in Trash until you restore them. Nothing here is deleted."

## Not built (separate decision)

Permanent delete. It must first define what happens to child holes, boards and content, shares, publications, files and notebooks, provenance, analytics retention, and the restore window.

## Tests

- `packages/control-plane/test/library-trash.test.js` (8 cases):
  - migration rerun;
  - Move to Trash hiding everywhere, unpublishing, deleting nothing;
  - Restore keeping everything without republishing or bumping;
  - share links suspended then reactivated, forks surviving;
  - publish refused, holes refused, owners only;
  - projects;
  - the Trash list;
  - stale Duplicate and Fork refused.
- Browser: `packages/web/e2e/visibility-check.mjs` checks 11–12.
