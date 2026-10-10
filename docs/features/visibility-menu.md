# Owned-card menu: Visibility, Rename, Edit description, Trash

Owner rules, 2026-10-06. This is the Library card ⋮ on your own top-level canvas, and since 2026-10-09 on your project too.

```
                      canvas                     project
Open                  ·                          ·
Learn / Map / Pin                                ·
Rename                ·                          ·
Edit description      ·
Duplicate             ·
New canvas in project                            ·
─────────────
Visibility ›          ·  Private · Unlisted · Public   (the current one checked; a project reads Mixed when its parts differ)
Share / Manage link   ·                          ·
Copy link             ·                          ·
Change thumbnail      ·                          ·      (Use canvas snapshot while a picture of yours is up)
Analytics             ·  (public only)
─────────────
Archive               ·
Move to Trash         ·                          ·
```

**One menu** (owner, 2026-10-08): `home/CardMenu.jsx` `useCardMenu`, the same ⋮ on the Library's cards and on Home's
Recent cards. It opens in place and stays inside the window (`menuAt`).
- A card shows a ⋮ only where the menu has items (`hasCardMenu`): your own canvas, or a project.
- On Home the menu asks its own Archive confirm, in the Library's words.

**One list** (owner, 2026-10-09: "make sure the ⋮ for Projects and Canvas are consistent"): `home/card-menu-items.js`
`CARD_MENU` is the one definition both types render, filtered by type (`menuRows`). A shared row has one label, one icon
and one place; a row for one type keeps its slot and is hidden on the other (Duplicate, Edit description, Analytics and
Archive are a canvas's; Learn, Map, Pin and New canvas in project are a project's). The open project's header shows the
same ⋮ beside the project's name (`RepositoryPage.jsx`). `card-menu-items.test.mjs` diffs the two lists;
`e2e/project-menu-check.mjs` opens both menus and compares their labels.

**Copy link** (owner, 2026-10-08) copies the link that matches what the card is (`canvas-visibility.js` `copyLinkFor`):
- **Public:** `/e/<token>`.
- **Unlisted:** its share link `/b/<view token>`, read from the board as it copies.
- **Private, or a private project:** `/apps/<name>`, which opens only for you.
- **An unlisted, public or mixed project:** its project link `/b/<view token>` ("Project link copied"; see Projects).

The row itself says which link it copied ("Public link copied", "Share link copied", "Private link copied, opens only for
you"), then the menu closes, with no corner toast. A project's ⋮ has Copy link too. Others' cards keep their own Copy link
(`PublicCards`).

"Archive", without an ellipsis (owner, 2026-10-08); its confirmation still asks first.

A project's ⋮ keeps Pin, Learn and Map, and adds Move to Trash. Other people's cards never show this menu; their Fork / Start Rabbit Hole / Copy link actions come with the card redesign.

## Projects

Owner, 2026-10-09: "Can we rename a Project in the ⋮ in the cards or when we open a project", and "the ⋮ for a Project
should it not also have the Visibility and Share/Manage link similar to canvas". Nothing new is stored on the project: no
table, no column (0015 is folders, 0016 is Home's).

- **Rename** changes the project's display name only: `PATCH /api/repositories/<name>` `{ title }` writes the project's
  Main canvas board's title (`learn_boards`, app `repo-*`, board `main`; the board is made first when a project predates
  boards). The repository (`owner/name`) stays its provenance: the subtitle on the card (`github.com/owner/name`) and
  beside the name in the open project's header. Empty goes back to the repository's name. `titleOf` shows the display
  name wherever it is used. Up to 120 characters; the owner only.
- **Visibility** applies to the whole project: every live canvas in it is set through its own routes
  (`canvas-visibility.js setProjectAccess` → `setAccess` each), and the project's Main canvas board's link is set with them
  (off for Private, on for Unlisted, on and open signed out for Public). A project itself is never in Explore; its canvases
  are. The confirm names the count, the Main canvas included: "Make 3 canvases public?" / "Make 3 canvases unlisted?";
  Make private keeps the canvas confirm's words.
  - The state is **read back** from the parts (`repositories.js PROJECT_FIELDS`, `projectAccess`): published canvases are
    public, link-shared ones unlisted, the rest private, and the Main canvas link counts as one part. All the same → that
    state; otherwise **Mixed**, shown on the card and in the menu with no state checked.
  - A canvas **added later** takes the project's visibility at creation (`canvases.js`): unlisted gets its own view
    link, public its Explore publication (an owner with no @handle gets it private). A private or mixed project adds it
    private. Per-canvas changes stay allowed; they make the project Mixed.
  - A project whose repository is not confirmed public (`repository_visibility`) **can't go Public**: the row is disabled
    with "Private repository: can't be public" (Explore's rule), and `setProjectAccess` refuses it before touching anything.
- **Share / Manage link** opens the same Share panel on the project's Main canvas board, without Publish to Explore.
  The **project link** is that board's `/b/<view token>` (there is no project share page): beside the board it lists the
  project's canvases this viewer may open right now (`learn-boards.js projectCanvasLinks`): published ones for anyone,
  link-shared ones for a signed-in viewer, as the Rabbit Holes Map lists holes; a private canvas is never listed, and no
  canvas id or email travels. The header's switcher-style button says "N canvases in this project".
- **New canvas in project** is the switcher's New canvas from the card: a canvas row in this project with its own board,
  opened in the project's Learn tab once made.
- **Move to Trash** from the header too; the Trash list still names the project by its repository.
- The Sidebar and the top bar keep their own project labels; the renamed title reaches them only where they use `titleOf`.

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
- Projects (2026-10-09): `packages/web/src/home/card-menu-items.test.mjs` (the one list, both types' rows),
  `visibility-menu.test.mjs` (bulk steps, the private-repository refusal, the confirm's count, Mixed, the project's Copy
  link), `packages/control-plane/test/project-menu.test.js` (rename, derived visibility and Mixed, inheritance, the project
  link never listing a private canvas), and `packages/web/e2e/project-menu-check.mjs` (12 checks: one menu on the card and
  in Map, Main Learn and nested Learn headers, Rename from card and header with the repository kept, "Make 3 canvases public?", Mixed, inheritance, a private
  repository blocked, the project link signed out, New canvas in project, and the cards' picture insets and footer).
