# Canvas persistence: the server is the source of truth

Status: proposal for #60, 2026-10-06 (owner rules "Persistence option C" and "Overnight execution rule").

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

## Retiring the warnings (step 8, only after the proof)

"Content in this browser", "On another device", "Continue — on this device" and "Its content is stored only in the browser that created it." live in continue.js, Home.jsx, LibraryViews.jsx and App.jsx.
- They change only after step 7 passes, and only after rebasing onto main with the #54 card redesign.
- Only boards that are actually on the server lose them. An over-cap board, or a not-yet-migrated canvas from another browser, keeps its truthful state.
