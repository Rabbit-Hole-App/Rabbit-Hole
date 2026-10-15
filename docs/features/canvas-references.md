# Canvas references: storage, endpoints and migration

The owner's brief and decisions are in C:/s/spec/canvas-references-mvp.md, and the data contract every track codes to is in
C:/s/spec/references-plan.md. This note covers the server side: where a reference lives, how backlinks stay consistent,
who sees what, and what the migration needs.

## Storage

- **The board is authoritative.** A reference lives in the saved source board, on the card it belongs to:
  `refs: [{ id, target }]` on a CanvasNode block in `blocks`. A standalone reference card is a `canvas-ref` block with exactly
  one ref. `target` is the destination's `learn_boards.id`, so renaming either canvas never breaks a reference. The board
  stores only ids, never a title, path or URL.
- **The index is derived.** `learn_canvas_refs` (learn-migrations/0021) holds one row per indexed reference:
  `source_board` and `target_board` (both `learn_boards.id`), `ref_id`, `source_object` (the card's block id) and
  `object_title` (the card title, at most 120 characters). The primary key is `(source_board, ref_id)`, and
  `target_board` is indexed. Backlinks read only this table; no board content is downloaded to compute them.
- **One transaction.** saveOwn (`control-plane/src/learn-boards.js`) sends one `LEARN_DB.batch`, which D1 runs as a
  single transaction:
  1. the board write, which is the versioned UPDATE, or the first-save INSERT;
  2. `DELETE` of the board's index rows;
  3. one `INSERT … SELECT` over `json_each` of the board's refs.

  Statements 2 and 3 are guarded by
  `EXISTS (SELECT 1 FROM learn_boards WHERE id = ? AND state_json = ? AND version = ?)`: the exact row the write just
  produced. A rejected, stale or same-base losing save therefore cannot touch the index. If two saves wrote identical
  text, they also wrote identical refs. An unversioned save (older pages, API tests) guards on id and text only.
- **Revalidated on every save.** A ref is indexed only when its target is a canvas's main board that the saver can read
  (see Access). Otherwise the board still saves, the ref stays in it, and the ref resolves as Unavailable with no backlink.
  Every save rewrites the board's whole row set, so a target whose access was revoked drops out at the source's next save.
- **Skipped when there is nothing to do.** A versioned save of a board that neither has nor had refs sends no index
  statements. "Had" is a conservative `"refs"` text check of the stored state.
- **Bounds.** A card holds up to 20 refs and a board up to 500. Beyond that the save is refused with `413` and
  `{ code: 'too_many_refs' }`, and nothing is written. A malformed ref (bad id or target, a duplicate id) stays in the board
  and is never indexed.
- **Copies.** Fork and Duplicate give every copied ref a new id (`reidRefs`) and insert the copy's index rows in the same
  batch as the copy, for the forker's own access. A copy never adds a backlink attributed to the original, and copying
  never grants access. Re-identifying refs on Paste and Duplicate inside a canvas is the client's job, in pasteIds.
- **Deletes.** The canvas DELETE batch (`canvases.js`) and the hole-delete batch (`dives.js`) drop the source's rows before
  its board row. Trash and Restore write nothing: every read filters `NOT_TRASHED`. Removing a reference, deleting a card
  and Undo are ordinary board saves, so the index follows the saved revision.

## Access

"Viewer can read canvas X" has two parts. First, the viewer owns X (`canvases.owner_email` and org), or has an active
`canvas_members` row for X (by `users.id`). Second, X is not in Trash. Members exist only on top-level canvases, so they
never reach a nested hole; an owner reads their own holes. Link tokens, public links and Explore do not count for this MVP.

## Endpoints

Both are GET-only, need a signed-in user, and are wired in `web/dev-worker.js`. The code is in `control-plane/src/canvas-refs.js`.

1. **`GET /api/learn/canvas-picker?q=&exclude=&limit=`** returns `{ canvases: [{ id, title, path, href }], more }`.
   - It lists own and member canvases, newest first, with `limit` 1-50 (default 20).
   - It searches with a title LIKE, where wildcards in `q` are literal.
   - It excludes holes, Trash, archived canvases and `exclude`.
   - `path` is the project's title for one's own canvas and the owner's name for a shared one.
2. **`GET /api/learn/links/<boardId>`** returns 404 unless the viewer can read the board. Otherwise it returns `{ board, from, to }`:
   - `from` comes from the board's saved refs, grouped by target. Each target is resolved for this viewer. An unreadable,
     trashed or deleted target is `{ target, unavailable: true, refs }`, with no title or path.
   - `to` comes from the index, grouped by source. It holds only sources the viewer can read, and counts are what is
     returned. Each `refs[].href` ends in `card=<source object>`.
   - A canvas's href is per viewer: the owner gets `/apps/<name>`, or `/apps/<project>?tab=learn&canvas=<name>` for a
     project canvas; a member gets `/c/<boardId>`.

The web module `web/src/canvas-refs.js` exports `pickCanvases`, `loadLinks` and `refHref`.

## Migration

- `control-plane/learn-migrations/0021-canvas-refs.sql` is additive and re-runnable: CREATE TABLE and CREATE INDEX IF NOT EXISTS.
  It is mirrored verbatim at the end of `repository-schema.sql`.
- It has no dependency on the held learn 0020: neither reads the other's tables.
- LEARN_DB has no migration runner. Apply the one file only, never the whole schema, for example
  `wrangler d1 execute rabbit-hole-learn-dev --remote --file packages/control-plane/learn-migrations/0021-canvas-refs.sql`.
- Approvals:
  - local application is approved;
  - dev application for this feature's preview is approved once the checks are ready;
  - production needs its own GO.
- **Order.** Apply 0021 before the code that writes it ships. Saves of a board with refs fail while the table is missing.
  Saves of boards without refs are unaffected.

## Limitations

- Only a canvas's main board is indexed as a source. A project's Main board (`repo-*` apps) and non-main boards keep their
  refs in the board, but they produce no backlinks.
- A backlink whose source owner later lost access to the target stays listed until the source is saved again. It is shown
  only to viewers who can read the source.
- A hole under a trashed canvas is not itself in Trash, so its owner still sees its backlinks.
- Backlinks list at most 1000 references per canvas (`MAX_BACKLINKS`), with no pagination yet.
- `path` is null for one's own canvas outside a project, so two such canvases with the same title look alike in the picker.
