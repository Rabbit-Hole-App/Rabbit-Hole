# Sharing a Learn board

A learner shares a canvas board by link. Dev only, like the rest of Learn.

## Behaviour

- **Share** (menubar) opens a panel:
  - **Share this board**: on or off. Off means every link stops working.
  - **View link**: on or off, with its URL and Copy. People who sign in can
    view. **Public** makes the view link work without signing in.
  - Turning a link off revokes it; turning it on again makes a new one, pinned again to the
    repository's current commit (a link keeps its pin through the owner's refreshes).
  - **Allow questions to use private repository code** (only for a private repository of yours, off
    for every new link): signed-in viewers' questions may use its code at the commit pinned for this
    link. Off, a link shows nothing of the repository and questions use only the canvas's cards, notes
    and sources. See [shared-canvas-ask.md](shared-canvas-ask.md).
- Anyone with an account can open a link after the usual email sign-in (any
  email). Links look like `/b/<token>`.
- Shared boards are always view-only: pan and zoom, no toolbar, no edits.
  There are no edit links; tokens from before are no longer accepted.
- **Fork** (top right of a shared board), after its "Fork this canvas" confirm-and-rename dialog, makes the viewer
  their own editable copy: a Canvas in smart-home's `canvases` catalog (`canvas-<8 hex>`, owned by
  the forker, no project), opening in Learn at `/apps/canvas-<8 hex>?tab=learn`.
  The copy (board, files, notebook workspaces - notebooks get new ids) is made
  on the server under that canvas; the forker's Learn page loads it on first
  open, then it works like any canvas. A signed-out public viewer is sent to
  sign in and comes back to the dialog (`?fork=1`). The original is untouched.
  Fork is only on someone else's canvas (this page, their Explore cards), never your own (2026-10-08):
  see [canvas-forking.md](canvas-forking.md).
- Provenance, lineage and fork counts are `canvas_forks` rows
  ([canvas-forking.md](canvas-forking.md)). The copy's `learn_boards` row
  still carries `forked_from` JSON (`resource_id`, `board`, `board_id`,
  `title`, `creator`, `share_url`) for Learn's "Your fork of …" notice.
- While a board is shared, the owner's browser saves it to the server 1.5 s
  after each change. Opening the board on another browser takes the newer
  server copy, with a notice.
- The owner's saves are version-checked: a save based on an older version is
  refused with a notice rather than overwriting.
- Board files travel too. While shared, every file the board's cards use
  (dropped images, GIFs and clips, PDFs, generated illustrations) is uploaded
  to R2; a card reads this browser's cache first, then the board's copy. Over
  25 MB, a file stays in the owner's browser, with a notice.
- Each notebook card's whole workspace travels as one snapshot (text, base64
  for binary, notebooks as JSON; up to 10 MB), uploaded a few seconds after
  its files change. A shared link opens it fresh, in a workspace of its own
  (`<notebook_id>-shared`), so imports and `open()` work for recipients. The owner's own board only fills an
  empty workspace from it (another browser), never overwrites local files.
- **A link covers one board.** It covers that board's files and notebooks, never the Rabbit Holes nested under it or the canvas above it.
  - A shared board's Rabbit Holes Map lists a hole only when the viewer could open that hole's own link.
  - That means the hole is shared, not in Trash, and public or the viewer signed in. The rule is in [dive-v1.md](dive-v1.md), "Shared map".
- Later: sharing with members, emails or groups from the Members tab.

## Storage

Cloudflare D1 `small-learn-dev` (`LEARN_DB`), table `learn_boards`
(`packages/control-plane/repository-schema.sql`): one row per owner board with
the board JSON (cards, chat cards, shapes, notes, links, ink), a version, who
saved last, and the share settings (`shared`, `view_token`, `edit_token`,
`public_view`). Tokens are 24 random bytes. A board over 1.9 MB is refused
with a message rather than truncated.
Files are R2 objects in `small-runs` at `learn-boards/<row id>/<sha256 of the
asset key>`, readable only through the owner's routes or a live link; they
are served as downloads with `nosniff` and a sandbox CSP, never as pages.
A link, a publication or a member reads only the files the board uses now
(`boardAssetKeys` in `learn-boards.js`: its cards' asset keys plus `notebook:<id>`
for each notebook card); a file removed from the board, or the workspace of a
removed notebook, stays in R2 (nothing is deleted) but answers 404 to anyone but
the owner. A fork copies that same list, never the board's whole R2 prefix.

## API (dev worker)

| Route | Who | Does |
|---|---|---|
| `GET/PUT /api/learn/boards/:app/:board` | someone with access to the app | read / save the owner's board |
| `POST /api/learn/boards/:app/:board/share` | same | set `shared`, `view`, `public_view`; a new view link pins the repository commit it answers from ([shared-canvas-ask.md](shared-canvas-ask.md)) |
| `POST /api/learn/boards/:app/:board/share/repository` | same | `{ allow }`: the owner lets this link's answers read their private repository's code; 409 for a public one or no link |
| `GET /api/learn/boards/shared/:token` | signed in, or anyone for a public view link | open a shared board; also `viewer` and the composer's `context` ([shared-canvas-ask.md](shared-canvas-ask.md)) |
| `POST /api/learn/boards/shared/:token/ask` | signed in (any link they can open, public too) | ask about the shared canvas; streams the answer, writes nothing of the owner's (one usage event), rate limited ([shared-canvas-ask.md](shared-canvas-ask.md)) |
| `GET/PUT /api/learn/boards/:app/:board/assets/:key`, `GET .../assets` | owner | board files, list |
| `GET /api/learn/boards/shared/:token/assets/:key` | as the link | board files through a link |
| `GET /api/learn/boards/shared/:token/holes` | as the link | the read-only Rabbit Holes Map: only the levels this viewer could open by their own link ([dive-v1.md](dive-v1.md), "Shared map") |
| `POST /api/learn/boards/shared/:token/fork` | signed in (any link they can open) | make the viewer's Canvas copy; returns `{ name, url, files, forked_from }`. Same handler as `POST /api/learn/boards/fork` ([canvas-forking.md](canvas-forking.md)) |

Owner routes for a `canvas-*` board check the `canvases` row: its owner only.

`/b/<token>` is served to anyone; the page asks the API what the visitor may
see and sends signed-out visitors of a non-public link to sign in.

## Verification

`packages/control-plane/test/learn-boards.test.js` (routes on node:sqlite) and
`packages/web/e2e/canvas-sharing.mjs` on the deployed clone (owner, a second
signed-in person, and a signed-out visitor). Files: `canvas-sharing-files.mjs`; notebook
workspaces: `canvas-sharing-notebook.mjs`.
