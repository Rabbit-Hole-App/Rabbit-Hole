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
  A **Fork** button (top right) will make the viewer's own editable copy -
  a Canvas in the smart-home catalog (in design with smart-home). There are no
  edit links; tokens from before are no longer accepted.
- While a board is shared, the owner's browser saves it to the server 1.5 s
  after each change. When the owner opens a board someone changed through its
  edit link, the newer copy replaces the local one, with a notice.
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
| `POST /api/learn/boards/:app/:board/share` | same | set `shared`, `view`, `edit`, `public_view` |
| `GET /api/learn/boards/shared/:token` | signed in, or anyone for a public view link | open a shared board |
| `GET/PUT /api/learn/boards/:app/:board/assets/:key`, `GET .../assets` | owner | board files, list |
| `GET /api/learn/boards/shared/:token/assets/:key` | as the link | board files through a link |

`/b/<token>` is served to anyone; the page asks the API what the visitor may
see and sends signed-out visitors of a non-public link to sign in.

## Verification

`packages/control-plane/test/learn-boards.test.js` (routes on node:sqlite) and
`packages/web/e2e/canvas-sharing.mjs` on the deployed clone (owner, a second
signed-in person, and a signed-out visitor). Files: `canvas-sharing-files.mjs`; notebook
workspaces: `canvas-sharing-notebook.mjs`.
