# Owned-card menu: Visibility, Rename, Edit description, Trash

Owner rules, 2026-10-06. This is the Library card ⋮ on your own top-level canvas.

```
Rename
Edit description
Duplicate
─────────────
Visibility ›    Private · Unlisted · Public   (the current one checked)
Share / Manage link
─────────────
Archive
Move to Trash
```

"Archive", without an ellipsis (owner, 2026-10-08); its confirmation still asks first.

A project's ⋮ keeps Pin, Learn and Map, and adds Move to Trash. Other people's cards never show this menu; their Fork / Start Rabbit Hole / Copy link actions come with the card redesign.

## Visibility

There are three states, read from the canvas row's `access`. Each is done through the route that already owns it (`canvas-visibility.js` `setAccess`):

| State | Means | Done by |
|---|---|---|
| Private | Only you | No share link and no publication |
| Unlisted | Anyone with the link | The share link (`learn_boards.shared`, `view_token`) |
| Public | In Explore, under your @handle | The publication (`canvas_publications`, explore-publish.md) |

| From → To | Steps |
|---|---|
| Private → Unlisted | Share on, with this browser's copy when the server has nothing saved yet; a canvas this browser holds none of sends no state and is shared empty (owner, 2026-10-08) |
| Private / Unlisted → Public | Saves the board's first server copy if nothing is saved yet - no board, or a new canvas's empty version 0 board (a sync: no `updated_at` bump) - then publishes. Unlisted keeps its link. |
| Public → Unlisted | Unpublish (`/e` dies, Explore drops it); the share link is kept, or made if there is none |
| Any → Private | Unpublish and share off. Forks are untouched. |

**Make private asks first,** only when there is access to take away:
- Title: "Make this canvas private?"
- Body: "It will be visible only to you. Existing public and shared links will stop working. Existing forks will not be deleted."
- Actions: Cancel / Make private.

**Public is refused by the server for:** a nested Rabbit Hole, an archived canvas, a canvas in Trash, and an owner with no @handle (needsHandle). The server's message is shown.

## Rename and Edit description

- **Rename:** the typed title is kept exactly (canvas-naming.md). A title you already use only earns a quiet note: "You already have another canvas with this name."
- **Edit description:** plain text up to 500 characters, with a counter (canvas-metadata.md).
- **Route:** both use `PATCH /api/apps/<canvas>`. Either one that changes something is a meaningful change.

## Share / Manage link

Opens the canvas page's own Share panel (`SharePanel.jsx`) as a popup over the Library (owner, 2026-10-08: "should not
open the canvas but have a pop up window for user there itself"). It is the same panel on the same routes - share
on/off and the view link, public view, the private-repository switch, Publish to Explore - with this browser's copy of
the canvas sent on a first share or publish, as Visibility sends it. Each change reloads the Library so the card's
visibility follows; closing it (Escape, a click outside) leaves the Library as it was. No Fork in this menu: your own
canvas is copied with Duplicate.

`/apps/<canvas>?share=1` still opens the panel on the canvas page; nothing in the Library links to it now.
`ponytail:` a Publish refused for a missing @handle shows the server's message in the popup; the canvas page asks for a
handle in place.

## Move to Trash

Owned top-level canvases and projects only (library-trash.md). The confirmation:
- Title: "Move this canvas to Trash?" (or "project")
- Body: "It will disappear from your Library and public/shared access will stop. Existing forks will not be deleted. You can restore it from Trash."
- Actions: Cancel / Move to Trash.

Nothing is hard-deleted from the menu. Trash (the sidebar) lists your trashed canvases and projects, each with a Restore button.

## Tests

- `packages/web/src/visibility-menu.test.mjs` covers the transitions, the confirmation, the menu order and wiring, Trash, `?share=1` on the canvas page, and the Library's Share popup (the existing panel, its routes, no navigation).
- `packages/web/e2e/visibility-check.mjs` (13 checks) covers:
  - the menu order and the checked state;
  - Private → Unlisted → Public → Unlisted;
  - the private confirmation and Cancel, links stopping, forks surviving;
  - Rename with the same-title note, Edit description;
  - Share / Manage link;
  - Move to Trash with its confirmation, the Trash list, Restore without republishing;
  - an unlisted link suspended and reactivated;
  - no page errors.
