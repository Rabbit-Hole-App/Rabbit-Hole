# Library folders

Owner item, 2026-10-09: "In library only, allow users to create folders. then when user does ... on a card in library we
have a Move to Folder dropdown to which folder. make good UI folders. users can rename or delete folders, remove cards out
of folders, different folders colors, and other such functions."

Flat folders a person makes in their own Library to group their canvases and projects. **Library only:** Home, Explore,
Search, shares and profiles never read them.

## Rules

- Flat: no nesting. Each card (a canvas or a project) is in at most one folder; a move replaces.
- Owner-private, always. Another account gets 404 on every folder route, never 403, so an id says nothing.
- A folder deleted releases its items into the Library. Nothing is ever deleted through a folder.
- A trashed or archived item **keeps its membership** and comes back into its folder on Restore (chosen over dropping the
  row: Restore puts things back where they were). It is not counted meanwhile, since the Library does not list it.
- Live apps (jobs, servers) are never filed; the server refuses them (404).

## UI

**Library header:** "New folder" beside Filters and Sort, the secondary style. It opens a dialog (name, the six swatches,
Create); the name is trimmed to one space and 1-60 characters, the server's rule too. Inside a folder the spot holds the
folder's ⋮ instead: flat folders are not made inside one.

**Tiles** above the cards in the Library's main view: one compact height, the colour on the icon and a left edge, the
name, "N items", a ⋮ on hover (always on touch). A tile is a link (`libraryHref({ d })`) and a drop target.

**Open folder:** `?d=<folder id>` through `libraryHref` / `chipHref`, so links and Back work. The breadcrumb
"Library › Folder name" sits above the title, which is the folder's name with its coloured icon. Only its cards show;
Filters, Sort and Search still work inside it (Clear filters stays in the folder). "Library" in the crumb is a link back
and takes a dragged card out of the folder. An empty folder says so; a `?d=` that is not one of yours says
"No such folder in your Library".

**Card ⋮** (the shared `home/CardMenu.jsx`, only when the Library passes its `folders`): "Move to folder ›" lists the
folders with a colour dot, the current one checked; "New folder…" at the bottom makes the folder and moves the card in one
step ("The card moves into it."); "Remove from folder" while it is in one. A project's ⋮ has the same rows. Home's Recent
cards open the same menu without them.

**Folder ⋮** (tile and header): Rename (a dialog like the card rename), Colour (the canvas's and comment pins' six
swatches, inside the menu), Delete with the confirm "Delete folder 'X'? Its N items go back to Library; nothing is
deleted." (an empty one: "It is empty; nothing is deleted.").

**Drag:** a card you own drags (`application/x-rabbit-hole-library-item`) onto a tile to move, or onto the Library crumb
to remove. The ⋮ is the keyboard path to the same moves; tiles, menu rows and swatches are buttons or links.

**Feedback** is the list itself (the tile count, the card leaving the view). The only toast is a server refusal.

A top-level search looks everywhere, so a filed card is never lost to it; without a search the filed cards sit in their
tiles. A new folder takes the next swatch, starting at blue, so side-by-side folders differ until someone picks.

## Storage

`learn-migrations/0015-library-folders.sql` (reserved by Home, confirmed), additive and re-runnable, mirrored exactly in
`repository-schema.sql`; LEARN_DB only. Local test databases only until a deploy GO. Deploy order: … 0014, 0015.

```sql
CREATE TABLE IF NOT EXISTS library_folders (
  id TEXT PRIMARY KEY,
  org TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  color TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS library_folders_owner ON library_folders (org, owner_email);
CREATE TABLE IF NOT EXISTS library_folder_items (
  org TEXT NOT NULL,
  name TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  PRIMARY KEY (org, name)
);
CREATE INDEX IF NOT EXISTS library_folder_items_folder ON library_folder_items (folder_id);
```

The owner key is the canvases' (`org`, `owner_email`); the item key is the Library's (`org`, `name`: a `canvas-*` or
`repo-*`), so one row per item is the one-folder rule. `color` is one of `PIN_COLORS`.

## Routes

Served by the dev worker (`dev-worker.js`) on LEARN_DB, `repositoryIdentity` auth, `control-plane/src/library-folders.js`.
The preview write barrier (`routes.js previewWriteAllowed`) allows `/api/library/folders`.

| Route | Does |
|---|---|
| `GET /api/library/folders` | `{ folders: [{ id, name, color, created_at, updated_at }] by name, items: { <name>: <folder id> } }` |
| `POST /api/library/folders` `{ name, color?, item? }` | Creates (201); `item` files that card in the same step; blue without a colour |
| `PATCH /api/library/folders/<id>` `{ name?, color? }` | Rename and/or recolour |
| `DELETE /api/library/folders/<id>` | Deletes the folder, releases its items: `{ deleted, released }` |
| `PUT /api/library/folders/<id>/items/<name>` | Files your own canvas or project (replaces its folder) |
| `DELETE /api/library/folders/<id>/items/<name>` | Removes it from that folder (404 if it is not in it) |

Refusals: 400 for a bad name, a colour off the palette or a non-object body; 404 for another account's folder, an item
that is not your own canvas or project, or a live app; 401 signed out.

## Tests

- `packages/control-plane/test/library-folders.test.js` (7): migration applied twice and mirrored (object set and SQL);
  CRUD; validation; owner isolation (404 everywhere, a refused create makes nothing); one folder per item, New folder…
  in one step, remove only from its own folder; delete releases; Trash keeps the membership through Restore.
- `packages/web/src/library-folders.test.mjs` (8): the view rules, counts, copy, names; Library-only wiring, icons on
  every row, drag targets; `library-filter.test.mjs` and `routes.test.mjs` cover `?d=` and the write barrier.
- Browser: `packages/web/e2e/library-folders-check.mjs` (18) on the local stack: create, rename, recolour, move via ⋮,
  New folder… from a card, move via drag, search finds filed cards, open folder, filters inside, remove via ⋮ and via the
  crumb, Back, delete returns items, reload, another account, keyboard, phone/1024/dark shots, tripwire 0.
