# Canvas persistence: the server is the source of truth

Status: proposal for #60, 2026-10-06 (owner rules "Persistence option C" and "Overnight execution rule"). Steps 1-7 built on `feature/canvas-persistence` (see "Built" below); the cross-device proof passes, `e2e/cross-device-check.mjs` 10/10. Step 8 (the warnings retired, below) is built on `feature/persistence-warnings`, on top of the #54 card redesign; the check is now 13/13.

The canvas becomes canonical on the server. The browser keeps only transient state plus a cache and a recovery copy. There is no second canvas model: the existing `learn_boards` row (`state_json`, `version`, `updated_by`, `updated_at`), its R2 board assets and its notebook workspace assets become canonical for every owned board. Today they are canonical only while a board is shared, published or forked.

## The owner's conditions

| Condition | How this proposal meets it |
|---|---|
| Reuses the existing server board model | `learn_boards` and its asset routes (`/api/learn/boards/<canvas>/<board>`, `/assets/<key>`) as they are; no new table |
| Server is the source of truth | Every owned board is PUT; on open the server copy wins when it is newer |
| Browser is cache/draft/recovery only | localStorage and IndexedDB stay as the instant write, the offline queue and the cache |
| Ids stay stable | Canvas names (`canvas-*`), board names and `learn_boards.id` are unchanged; content moves, ids do not |
| Safe migration/hydration of browser-local content | First open after release pushes the local copy as version 1 (a sync, not a meaningful change) |
| Explicit version/conflict handling | The existing optimistic `version` check: a stale PUT gets 409 and is never written |
| Additive, re-runnable migration | None needed: no schema change. If one turns up, it follows the learn-migrations rerun convention and runs on local DBs only |
| No shared/prod migration | Local test databases only, as always |
| Cross-device proof before the warnings go | Step 7 below is a browser check; the warnings change only after it passes |
| No permission regression | Owner reads stay keyed by owner (`ownerRow`: org + owner_email + app + board); share and Explore paths are unchanged; a check proves another account cannot read a private board |

## What is persisted, and where

| Thing | Where today | Canonical home |
|---|---|---|
| Cards, links, groups, areas, strokes, shapes, whiteboard snapshot, Explain Back sketch, layout positions (`:ink`) | localStorage | `learn_boards.state_json`, already this shape (`boardSnapshot()`) |
| Canvas chat cards (`exchanges`) | localStorage `:chat`; the board snapshot carries them | `state_json.exchanges`, as for shared boards today |
| Sources list (`:sources`) | localStorage | `state_json.sources` (a new key in the same object) |
| Generated and dropped images, GIFs, PDFs, slides | IndexedDB | R2 board assets (`syncAssets`, already built), 25 MB per file |
| Notebook files | browser workspace | R2 `notebook:<id>` board asset (already built for shared boards) |
| Nested Rabbit Holes | link on the server, content in the browser | each hole's own board row, same path |
| Title, description, `updated_at`, visibility, trash | server | unchanged (canvases, 0009, 0007, 0010) |
| Selection, viewport, composer draft, open panels, pending objects | browser | stays in the browser (transient) |

## Save contract

1. **Every owned board is pushed.** `pushBoard` (LearnPage) stops skipping private boards: the debounced PUT (1500 ms), the asset sync and the notebook workspace save run for every board its owner edits.
   - `saveOwn` already accepts private boards: the first PUT inserts version 1, and each later one sends the version it was based on.
   - `persist()` (journey sections) then returns 'ok' or 'failed', never 'skipped'. A section is recorded only once the server has its board.
2. **Version.** Every PUT carries the version it was based on, through the existing serial `pushQueue`. On success the new version is stored in localStorage (`versionKey`), as today.
3. **Size.** `MAX_STATE` (1.9 MB) stays. An over-cap board is refused with a visible error saying it was not saved to your account and lives only in this browser. That board keeps its local copy and its truthful per-canvas warning.
4. **updated_at.** The 0009 rule as built: a changed `state_json` is a meaningful change. A board's first server copy, and a save of the same content, are not.

## Load (hydration)

On open, the canvas renders the local cache at once (when present) and GETs the server copy:

| Server | Local | Result |
|---|---|---|
| none | content | First open after release: PUT the local copy (version 1, no `updated_at` bump); it is now canonical |
| version N | none (new browser, cleared storage) | Server copy is written to the cache and rendered |
| version N | based on N, no unsynced edits | Nothing to do |
| version N | based on N, unsynced edits (offline) | Push them (based on N) |
| version > local base | any | Server wins: replace the cache and render. Unsynced local edits made on a stale base meet the conflict rule below |
| none | none | A canvas created on another browser before this release whose content never reached the server: the truthful "isn't available in this browser" state stays for it |

The `device_id` gate (`opensHere`, canvas-local.js) becomes: a canvas opens when the server has its board **or** this browser has local content. `NOT_HERE` is shown only when neither exists.

## Conflicts (explicit, V1)

This is the existing optimistic check, unchanged. A PUT based on a stale version gets **409** with the current version, and nothing is overwritten.
- The learner sees the existing message: "This board changed in another tab or on another device. Reload to see those changes; your newer edits here are not saved."
- Pushing stops until reload.
- Reload loads the server copy.

There is no automatic merge, no silent last-write-wins and no "keep mine" override in V1. Those would be new product choices; ask before adding one.

## Offline and recovery

- Edits write to localStorage first (instant) and queue the PUT.
- On reconnect, the queue flushes in order through `pushQueue`.
- A refused PUT (409, over-cap, auth) keeps the local copy and tells the learner.
- Once a PUT has succeeded, the browser copy is a cache, never the only copy.

## Permissions

These do not change:
- An owner reads and writes their own board rows only (`ownerRow`).
- Shared links are read through `sharedRow`: share on, not in Trash.
- Explore reads through the publication.
- A private board saved to the server is not readable by anyone else.

Tests prove three things:
- another account's GET of the same canvas/board path returns no state from the owner's row;
- a private board's server copy is not reachable by any share or `/e` token;
- Trash still suspends links.

## Not changed by this work (separate decisions)

- **Large boards:** the 1.9 MB cap stays. R2-chunked state is later work.
- **Storage quota:** none beyond the existing 25 MB per file.
- **Deletion:** none. Trash never hard-deletes (library-trash.md), and permanent delete is its own decision.
- **The temporary `/ask` payload** (`{id, kind, title, text}`) stays until a later step resolves card ids on the server (canvas-card-selection.md).

## Proof (step 7, before any warning changes)

Two fresh browser profiles, one account, on the local stack:
1. On A, create and edit: cards, an image, a PDF, a notebook, a hole and a chat card. Open on B: everything is there.
2. Edit on B, then reopen A: B's edits are there.
3. Concurrent edit on A and B: the 409 message appears and nothing is overwritten.
4. Edit on A while offline, then reconnect: the edit lands.
5. A browser-only canvas from before this release is migrated on its first open, and `updated_at` does not move.
6. A board over 1.9 MB is refused visibly; its local copy is kept.
7. A second account cannot read the private board; Trash still suspends links.

## Built (steps 1-7)

- **Save** (LearnPage `pushBoard`, `saveBoard`). Every owned board is PUT through the serial queue, 1500 ms after the last change or at once for `persist()`, which now answers `ok` or `failed`. A review board (`?board=`, dev tooling) still saves only while shared.
  - Each PUT carries the version it is based on, or `0` when this browser saw no server copy, so a row made meanwhile elsewhere is a 409, never overwritten.
  - No PUT at all when the server already holds this content. `boardText` (canvas-persist.js) compares the content keys, with a missing key read as empty, so opening a board never re-saves it or moves `updated_at`.
  - The sources list rides as `state_json.sources` on the main board.
- **Files** (`syncAssets`) go up after every PUT. Notebook workspaces are saved once the board has its server row, and the first server copy asks loaded notebooks for theirs.
- **Over 1.9 MB.** `stateText` now says "This board is over 1.9 MB, so it was not saved to your account and stays only in this browser." It is shown once per open (the next edit retries quietly). The 25 MB file notice says the same.
- **Load** is the table above, in the board GET.
  - A pending Rabbit Hole asks again once its first object keeps it.
  - When the server copy replaces local content that differs from it, the replaced copy is kept under `<ink key>:replaced`, with no UI, so content that never reached the server is recoverable by hand. A restore action would be a product choice.
- **Conflicts.** A 409 shows the message above, then stops board PUTs and notebook workspace saves until reload.
- **Offline.** A failed PUT with no HTTP status waits; the `online` event pushes the latest copy. Two limits:
  - A board whose GET failed offline waits for its next open.
  - A lazy chunk that fails offline reloads the page (main.jsx). The edit is already in localStorage and goes up on the next online open (Load: same version, local differs).
- **The gate** (CanvasPage) asks the server only when `opensHere` says no, and NOT_HERE shows only when neither copy exists. `opensHere` itself is unchanged: its device clause still opens an empty canvas made in this browser. Since step 8, Home and the Library read the row's `board_saved` first.
- **Server.** `saveOwn` already made the first copy version 1 without an `updated_at` bump; only the over-cap message changed. It still accepts a PUT without a version (older pages and API tests); every page PUT now sends one.
- **Tests.**
  - `control-plane/test/canvas-persistence.test.js`: the first copy is version 1 without a bump; a write on a stale or unseen version (0) is a 409; the over-cap refusal. Permissions: same-workspace 403, another workspace 404, signed-out 401, no state in any answer; no share or `/e` token reaches a private board; Trash suspends and Restore returns links.
  - `web/src/canvas-persist.test.mjs`: `boardText`.
  - The source-pinning tests in explore-publish and learn-journey-materialize follow the new push contract.
- **Proof.** `e2e/cross-device-check.mjs` (local stack only, two fresh profiles, one account) passes 10/10:
  - 0: NOT_HERE when neither copy exists.
  - 1a-1c: items 1, including the real notebook's workspace and a double-clicked Rabbit Hole kept by a stroke.
  - 2-7: items 2-7 as listed above.

## Retiring the warnings (step 8, built)

Built after step 7 passed, on top of the #54 card redesign (owner §5 D, §19). Only canvases whose content is actually on the server lose the warnings.

- **Server.** Every canvas row the Library and Home read (`CANVAS_ROW` and `canvasApp`, canvases.js) carries `board_saved`: whether the owner's main board has its `learn_boards` row. It is an `EXISTS` subquery; there is no migration.
- **The rule** (`browserOnly`, continue.js) makes a canvas browser-only when either holds:
  - its main board is not on the server;
  - this browser holds a copy the server refused as over 1.9 MB. LearnPage sets `<ink key>:unsaved` on a 413, and the next save that lands clears it (`unsavedHere`, canvas-local.js).
- **Only a browser-only canvas carries a note,** with the existing copy:
  - "Content in this browser" where its content is;
  - "On another device" with "Its content is stored only in the browser that created it." elsewhere. `onAnotherDevice` is now `browserOnly` and not `opensHere`. Such a card does not open from Home, and the canvas route shows NOT_HERE.
- **Every other canvas shows no browser note.** That is every canvas saved since steps 1-7, in the Library, Home's Continue and Recent, and App.jsx's "On another device" pill, which reads `onAnotherDevice`.
- **Home's heading** is "Continue learning" (§19). Its list is still `small.recent`, and `updated_at` is unchanged (see the audit below).
- **Kept truthful:**
  - a canvas made in another browser before this release and never opened since;
  - a board over 1.9 MB, where it was refused, whether or not an older copy is on the server.
- **Limits:**
  - Another browser cannot know about a refused over-cap copy, because the server keeps no record of a refusal. There the card shows no note and opens the last saved copy. The refusing browser said so when it happened.
  - An empty canvas has no board row until its first content, so another browser still shows "On another device" and NOT_HERE for it, as before.
  - A project's Learn on Home's Continue keeps "Content in this browser". Repository rows (repositories.js) carry no `board_saved`; that is outside this step.
  - A file over 25 MB keeps its own notice and stays in its browser; the card does not say so.
- **Tests:**
  - `control-plane/test/canvas-persistence.test.js`: `board_saved` is false for a new canvas, after an over-cap refusal and for a board other than main, and true after the first save, in the list and the single row.
  - `web/src/home/continue.test.mjs`: `browserOnly`, `onAnotherDevice` and `recentCard` with a saved board and with the unsaved marker.
  - `e2e/cross-device-check.mjs` 13/13. Check 8: on a fresh profile and on B, A's canvases show no warning in the Library or Home, and they open. Check 9: a never-synced canvas keeps "Content in this browser" on A and "On another device" on B, where it shows NOT_HERE. Check 10: a refused first copy and a board grown past the cap keep "Content in this browser" until a save lands.
  - `e2e/card-redesign-check.mjs`: "Continue learning", and no note on a published canvas or on a canvas once opened.

### Continue ordering (audit only, not changed)

Home's Continue and Recent come from `small.recent`, in this browser. SharePage.jsx and Search.jsx write it on every app page open. That makes three things true:
- Any open counts, including a passive view.
- A new browser shows no Continue until something is opened there.
- The order is not the learner's last meaningful learning activity (§7).

There is no canonical learner-activity timestamp (canvas-metadata.md). The nearest server fact is `learn_boards.updated_at`, the owner's last saved content change on a board. A board's first sync also sets it. Choosing a source is a separate decision.
