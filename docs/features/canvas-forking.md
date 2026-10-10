# Canvas forking

A learner forks a whole canvas: a new canvas of their own, a copy of the source as it is persisted,
fully editable and independent, that remembers where it came from. Sharing itself is
[canvas-sharing.md](canvas-sharing.md); this extends its old shared-board Fork into one canvas-level
Fork used everywhere.

## Spec (owner)

- Fork is canvas-level, and only on someone else's canvas (owner decision, 2026-10-08: "i should not be
  having a fork button/icon on my own canvas", "i cannot fork my own cards"). It sits on a shared or
  published canvas (`/b/<token>`, `/e/<token>`, top right) and on other people's Explore and profile
  cards. Your own canvas has no Fork anywhere - not its top bar, not its Library or Home card, not the
  ⋮ menu; Duplicate in the Library's ⋮ copies it (canvas-naming.md). No content card has a fork control.
- Fork asks first (owner, 2026-10-08): a press opens a small dialog, "Fork this canvas", with a Name field
  prefilled with the source's title and the buttons Cancel and Fork (primary). Cancel or Escape forks
  nothing; Fork (or Enter) forks with the name as typed, trimmed and capped at 120 characters; an empty
  name falls back to the source's title. Signed out, Fork goes through sign-in and the dialog opens again
  on return (`?fork=1`) - never a silent fork.
- A fork is a new canvas owned by the signed-in user, in their Library at once, holding a copy of
  the source's persisted content. It can be renamed, edited, shared, forked again and can make its
  own Rabbit Holes. Nothing syncs between source and fork; deleting either never deletes the other.
- Provenance: `forked_from_canvas_id` (immediate parent), `root_canvas_id` (first canvas of the
  lineage), `forked_from_owner_id`, `forked_from_title` (snapshot at fork time) and `forked_at`.
  For A → B → C, C stores parent B and root A.
- Title (canvas-naming.md): the fork takes the name typed in the dialog, else the source's title, stepping to the next
  free ` (n)` only when the forker's own Library already has it ("Transformer Playground (2)"); `forked_from_title`
  keeps the source's own title whatever the fork is named.
- Attribution: a fork shows `Forked from "<source title>" ↗`, and keeps it after a rename. ↗ opens
  the source while this person may still open it; otherwise the attribution stays and says the
  original is unavailable, revealing nothing else about it.
- Counts: canvas cards show the direct fork count only ("1 fork", "24 forks"). A with forks B and
  C, and D forked from B: A = 2, B = 1.
  - One number everywhere: `FORK_COUNT` in `canvases.js`. It counts the `canvas_forks` rows whose
    fork canvas still exists, so a deleted fork stops counting.
  - Only a successful fork moves it. A sign-in redirect, a refused or failed request, a replay of the
    same action (`fork_key`) and Start Rabbit Hole add nothing.
  - Your own cards (Library, Home, your own Explore or profile card) show at most one read-only "N forks"
    in the footer, only once someone forked it (nothing at 0), never as a button (owner, 2026-10-08).
  - Wherever Fork is offered - the shared header and other people's Explore and profile cards - it is one
    GitHub-style control with the count inside (owners, 2026-10-06 and 2026-10-08): `[GitFork  Fork | N]`,
    0 included. The accessible name is "Fork, N forks", and there is no separate "N forks" label beside
    it. On a card it uses the soft accent fill, more visible than a white button and still below the
    primary Start Rabbit Hole (owner, 2026-10-08: "make the fork button more visible on the cards").
  - The number comes from the server: `fork_count` on the shared board. After a fork, the button shows
    the fork reply's `source_fork_count` (also on a replay), never a local +1, so a failed fork leaves the
    number alone.
  - A link to a board that is not a canvas (a project's board) has no canvas to count. Its `fork_count`
    is null, and its Fork button shows no number.
- Permissions: the existing rules. Your own canvas, or a canvas whose share link you can open.
  Never a private canvas of someone else.
- Never copied: another user's session, chat transcripts, voice transcripts, pending Rabbit Holes,
  selection or other UI state, analytics or history - nor a viewer's private chat on a shared page
  (shared canvas v1, decision A in [shared-canvas-ask.md](shared-canvas-ask.md)): a fork through a
  link sends only `{ source: { token }, key }`, and the server copies the stored board, ignoring any
  `state`, `history` or chat in the request.
- Repository revision (decision B there): a fork inherits the revision of the repository the source
  was read at, never the current HEAD. Through a link, the share's pinned commit; your own canvas (the
  API still takes `{ canvas }`; no surface offers it since 2026-10-08), the commit its project is at
  now (or what it inherited, if it is a fork).
  The fork's own share answers from that revision. A private repository's code never opens up through
  a fork: only the repository's owner can allow it, on their own share.
- One user action makes one fork, whatever the retries or double clicks.

## Where the content is (and the one decision this forced)

Canvas content lives in the owner's browser (`small.adaptive-canvas:<org>:<email>:<canvas>:ink`
and `:chat`, T02 §8.3). The server holds a board (`learn_boards`) only while it is or was shared.
So "copy the persisted content" means:

| Source | What is copied |
|---|---|
| A shared canvas, through its link | the server board (the owner's browser saves it 1.5 s after each change while shared) and the R2 files and notebook workspaces its board uses now (`boardAssetKeys`, [canvas-sharing.md](canvas-sharing.md)) |
| Your own canvas (`{ canvas }`: API only since 2026-10-08; Duplicate is the UI copy) | this browser's saved board if sent (`state`; `null` means none); otherwise the server board; a canvas without one gets its empty board first and forks as empty (owner, 2026-10-08; canvas-persistence.md) |

Browser-only parts of your own canvas: files it uses (images, PDFs, clips) are not uploaded by a
fork; the fork reads them from this browser's asset cache by key, so they show here and not on
another browser, exactly as the source does. A notebook card's workspace files travel only if the
board was shared (its R2 snapshot); otherwise the forked notebook opens with the card's own copy of
its active notebook in a new, empty workspace. A fork never creates or changes the source's server
board.

## Data (LEARN_DB only)

Migration `packages/control-plane/learn-migrations/0004-canvas-forks.sql`, also appended to
`repository-schema.sql`. Additive and re-runnable; applied to local D1 only - **not applied to any
remote D1**. When a deploy is approved, from `packages/control-plane`, before the code that reads it:
`npx wrangler d1 execute rabbit-hole-learn-dev --remote -c wrangler.rabbit-hole-dev.jsonc --file learn-migrations/0004-canvas-forks.sql`
(production: `rabbit-hole-learn-prod` with `-c wrangler.rabbit-hole-prod.jsonc`; names from those configs'
`LEARN_DB`). Until then `GET /api/canvases` on a deployed worker would fail on the missing table.

```sql
canvas_forks(org, canvas, owner_email, fork_key,
             forked_from_org, forked_from_canvas_id, root_org, root_canvas_id,
             forked_from_owner_id, forked_from_title, forked_from_share, forked_at,
             PRIMARY KEY (org, canvas), UNIQUE (owner_email, fork_key))
INDEX canvas_forks_parent (forked_from_org, forked_from_canvas_id)
```

- A link row beside the fork's own `canvases` row, like `canvas_dives`. A canvas id is its name
  inside its org (`UNIQUE(org,name)`), so every reference carries both; names are random, never
  reused, unlike `canvases.id`.
- `forked_from_owner_id` is the account principal (email) of the parent's owner.
- `forked_from_share` is the view token the fork was made through, if any. It decides whether ↗
  still opens; it is never sent to the client except as the link the forker already had.
- `fork_key` is the client's idempotency key. The fork's canvas, board and link are one D1 batch,
  so a concurrent duplicate fails the UNIQUE key, rolls back, and answers with the fork that won.
- A source that is not a canvas (a project board shared by link) has null parent and root; a fork
  of that fork starts its lineage at the first canvas.
- The fork's `learn_boards` row keeps `forked_from` JSON (title for Learn's "Your fork of … is
  ready" notice) as before. Through a link to a project board whose repository the share may not
  show, the title is `Shared canvas` and `resource_id` is null, so nothing names that repository.
- The inherited revision is a `board_repository_pins` row for the fork's board (`view_token` NULL),
  in the same batch. Table and migration `learn-migrations/0005-shared-canvas-v1.sql`, applied after
  0004: see [shared-canvas-ask.md](shared-canvas-ask.md).

## API

| Call | Who | Does |
|---|---|---|
| `POST /api/learn/boards/fork` `{ source: { canvas } \| { token }, key, state?, title? }` | signed in; `canvas`: its owner; `token`: anyone the link admits | Makes the fork, named `title` (the dialog's name: trimmed, capped at 120; blank or not a string: the source's title). Duplicate ignores `title`. `201 { name, title, url, files, forked_from }`; a replayed key `200 { name, title, url, replayed: true }`. 401 `{ signIn }` signed out, 403/404 private or missing, 404 dead link, 409 nothing to fork, 413 over 1.9 MB. |
| `POST /api/learn/boards/shared/:token/fork` | as above | The shared board's old path, same handler (`source.token` from the path). |
| `GET /api/canvases`, `GET /api/apps/canvas-*` | owner | Every canvas now carries `forked_from_title`, `forked_from_url` (`/apps/<source>` for your own source, `/b/<token>` while the link you forked through is live and its canvas exists, else null) and `fork_count` (direct forks that still exist). |
| `GET /api/learn/boards/shared/:token` | as the link | Adds `fork_count`, and a canvas's own title instead of its id. |

`learn-boards.js` `forkState` copies only the board keys (`strokes, shapes, items, links, blocks,
groups, areas, exchanges`) and settles chat cards to `done`; anything else a browser saved beside
them is dropped. Chat sheet threads, canvas context documents, Rabbit Holes (`canvas_dives`),
grades and share settings are never read. The fork starts private.

## Client

- `src/canvas-fork.js`: `postFork` (the one call) and `forkAction` (one key per action: a press
  during a request joins it, a retry after a failure resends the key, only success clears it).
- `src/ForkButton.jsx`: the one Fork control, `[Fork | N]`; a press opens the "Fork this canvas" dialog
  (`ConfirmDialog` + `Input`, portaled so a hovered card's lift never traps it), and only its Fork forks;
  result on the button itself (Forking… / Forked). `title` prefills the dialog; `resume` is the page a
  signed-out fork comes back to.
- Explore and profile cards (`home/PublicCards.jsx`): other people's cards render
  `<ForkButton size="sm" variant="soft" source={{ token }} title=… resume={card.url} count=… />` and open
  the new fork; your own card has none.
- Library (`LibraryViews.jsx`) and the canvas top bar (`LearnPage.jsx`): no Fork (owner, 2026-10-08). A
  fork's card and top bar keep `Forked from "…" ↗`.
- Shared board (`SharedBoardPage.jsx`): Fork and the count; `?fork=1` after sign-in opens the dialog
  once and is dropped from the address, so Back never asks again.
- Learn now treats empty local keys as no copy when a newer server board exists, so a fork opened
  on a slow connection still loads its content (`hasLocalContent`).

## Verification

- `packages/control-plane/test/canvas-forking.test.js` (14): own and shared forks, Library listing,
  clone equals the persisted board, no private or transient state, independence, lineage A → B → C,
  title snapshot, ↗ available/unavailable without leaks, direct counts, permissions, double click
  and retry, and the dialog's name (used; trimmed and capped; blank falls back; provenance keeps the
  source title; a repeat gets (2); Duplicate ignores it). `learn-boards.test.js` keeps the original shared-board fork test. The 3d regression (beta hardening): a fork, its files and its notebook workspace survive the source's asset removal, hole delete and parent trash + restore, read from the fork's own board; nothing is deleted from R2.
- `test/shared-canvas-v1.test.js`: "A chat" (a fork stores none of the viewer's chat, whatever the
  request carries), "B pin: a fork records the revision...", "C permission: a fork never opens up..." and
  "Lineage" (a fork of a fork: owned and editable by its forker, source title, parent, root and pinned revision).
- `packages/web/src/canvas-fork.test.mjs`, `home/canvas-local.test.mjs`, `home/provenance.test.mjs`.
- `packages/web/e2e/canvas-forking-check.mjs` (local stack only): no Fork on your own top bar or
  Library card; through a link, the dialog (one per double click, prefilled), Cancel and Escape fork
  nothing, a rename forks once under the typed name, a cleared name falls back to the source title,
  ↗, counts in the header and the Library (none at 0), and the unavailable state after sharing stops.
  `explore-check.mjs` covers the signed-out dialog, sign-in and the dialog again; `card-redesign-check.mjs`
  the Explore card's `[Fork | N]` and its Cancel.

## Known limits

- Files a forked canvas uses that were never uploaded stay in the forker's browser cache
  (see above). `ponytail:` in `learn-boards.js`: R2 files copy after the rows commit, and a replay
  does not re-copy.
- A deleted fork's link row stays (it no longer counts; names are never reused).

## r35 copy publication

Referenced uploaded files are copied before the new canvas, board and lineage
publish in one database batch. Failed reads/writes return a structured error;
unpublished copies are cleaned up and a retry cannot replay a partial board.
Concurrent same-key requests keep only the winning board's copies. An ambiguous
database response never deletes potentially published assets. Browser-only or
missing workspace snapshots keep the existing zero-copy behavior above.
