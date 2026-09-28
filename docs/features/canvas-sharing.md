# Sharing a Learn board

A learner shares a canvas board by link. Dev only, like the rest of Learn.

## Behaviour

- **Share** (menubar) opens a panel:
  - **Share this board**: on or off. Off means every link stops working.
  - **View link**: on or off, with its URL and Copy. People who sign in can
    view. **Public** makes the view link work without signing in.
  - **Edit link**: on or off, with its URL and Copy. People who sign in can
    edit. There is no public edit.
  - Turning a link off revokes it; turning it on again makes a new one.
- Anyone with an account can open a link after the usual email sign-in (any
  email). Links look like `/b/<token>`.
- A view link opens the board read-only: pan and zoom, no toolbar, no edits.
  An edit link opens it editable; edits save back to the server.
- While a board is shared, the owner's browser saves it to the server 1.5 s
  after each change. When the owner opens a board someone changed through its
  edit link, the newer copy replaces the local one, with a notice.
- Saves are last-writer-safe, not live: a save based on an older version is
  refused (the editor sees "Someone else saved this board since you opened it"
  with Reload; the owner gets a notice). There is no live co-editing yet.
- Not shared yet: uploaded images and PDFs (cached in the owner's browser) and
  notebook workspace files other than the open notebook's saved copy. They
  show as "not in this browser" to others until assets move to R2.
- Later: sharing with members, emails or groups from the Members tab.

## Storage

Cloudflare D1 `small-learn-dev` (`LEARN_DB`), table `learn_boards`
(`packages/control-plane/repository-schema.sql`): one row per owner board with
the board JSON (cards, chat cards, shapes, notes, links, ink), a version, who
saved last, and the share settings (`shared`, `view_token`, `edit_token`,
`public_view`). Tokens are 24 random bytes. A board over 1.9 MB is refused
with a message rather than truncated.

## API (dev worker)

| Route | Who | Does |
|---|---|---|
| `GET/PUT /api/learn/boards/:app/:board` | someone with access to the app | read / save the owner's board |
| `POST /api/learn/boards/:app/:board/share` | same | set `shared`, `view`, `edit`, `public_view` |
| `GET /api/learn/boards/shared/:token` | signed in, or anyone for a public view link | open a shared board |
| `PUT /api/learn/boards/shared/:token` | signed in, edit link only | save through the edit link |

`/b/<token>` is served to anyone; the page asks the API what the visitor may
see and sends signed-out visitors of a non-public link to sign in.

## Verification

`packages/control-plane/test/learn-boards.test.js` (routes on node:sqlite) and
`packages/web/e2e/canvas-sharing.mjs` on the deployed clone (owner, a second
signed-in person, and a signed-out visitor).
