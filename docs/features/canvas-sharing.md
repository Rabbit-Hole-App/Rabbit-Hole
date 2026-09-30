# Sharing a Learn board

A learner shares a canvas board by link. Dev only, like the rest of Learn.

## Behaviour

- **Share** (menubar) opens a panel:
  - **Share this board**: on or off. Off means every link stops working.
  - **View link**: on or off, with its URL and Copy. People who sign in can
    view. **Public** makes the view link work without signing in.
  - Turning a link off revokes it; turning it on again makes a new one.
- Anyone with an account can open a link after the usual email sign-in (any
  email). Links look like `/b/<token>`.
- Shared boards are always view-only: pan and zoom, no toolbar, no edits.
  There are no edit links; tokens from before are no longer accepted.
- **Fork** (top right of a shared board) makes the viewer their own editable
  copy: a Canvas in smart-home's `canvases` catalog (`canvas-<8 hex>`, owned by
  the forker, no project), opening in Learn at `/apps/canvas-<8 hex>?tab=learn`.
  The copy (board, files, notebook workspaces - notebooks get new ids) is made
  on the server under that canvas; the forker's Learn page loads it on first
  open, then it works like any canvas. A signed-out public viewer is sent to
  sign in and comes back to finish (`?fork=1`). The original is untouched.
- Provenance for Library and Home cards is on the copy's `learn_boards` row,
  `forked_from` JSON: `resource_id` (the source app or canvas), `board`,
  `board_id`, `title`, `creator: { name, source_owner_verified: false }`
  (never inferred), `share_url` (the view link, for a forker without access to
  the source). A source's fork count is the number of rows whose
  `forked_from.board_id` is its id.
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

## API (dev worker)

| Route | Who | Does |
|---|---|---|
| `GET/PUT /api/learn/boards/:app/:board` | someone with access to the app | read / save the owner's board |
| `POST /api/learn/boards/:app/:board/share` | same | set `shared`, `view`, `public_view` |
| `GET /api/learn/boards/shared/:token` | signed in, or anyone for a public view link | open a shared board |
| `GET/PUT /api/learn/boards/:app/:board/assets/:key`, `GET .../assets` | owner | board files, list |
| `GET /api/learn/boards/shared/:token/assets/:key` | as the link | board files through a link |
| `POST /api/learn/boards/shared/:token/fork` | signed in (any link they can open) | make the viewer's Canvas copy; returns `{ name, url, files, forked_from }` |

Owner routes for a `canvas-*` board check the `canvases` row: its owner only.

`/b/<token>` is served to anyone; the page asks the API what the visitor may
see and sends signed-out visitors of a non-public link to sign in.

## Verification

`packages/control-plane/test/learn-boards.test.js` (routes on node:sqlite) and
`packages/web/e2e/canvas-sharing.mjs` on the deployed clone (owner, a second
signed-in person, and a signed-out visitor). Files: `canvas-sharing-files.mjs`; notebook
workspaces: `canvas-sharing-notebook.mjs`.
