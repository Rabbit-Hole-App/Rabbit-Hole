# Start Rabbit Hole from a shared canvas

The owner asked for this on 2026-10-06, and it is built on `feature/shared-canvas-rabbit-hole`. A shared canvas's
header has two primary actions:

`[ Start Rabbit Hole ] [ Fork ]`

They do different things:

- **Fork** is unchanged ([canvas-forking.md](canvas-forking.md)). It copies the whole canvas into the viewer's
  workspace, the viewer owns the copy, and the provenance stays attached.
- **Start Rabbit Hole** gives the viewer a new private Rabbit Hole of their own, started from the shared canvas. It is
  not a fork. It never copies the canvas and never changes it.

## Behaviour

- **A card is selected:** the hole starts from that card. A click that does not pan selects a lesson card on the
  view-only canvas, and one plain ring marks it. A view-only canvas offers none of the editing chrome: no pills,
  handles, ports or keys.
- **No card is selected:** the hole starts from the shared canvas itself.
- **Every hole opens with one small anchor card saying where it began.** Nothing of the shared board is copied.
  - Root start: "Exploring from <title>", with the body `Started from the shared canvas "<title>".`
  - Card start: the card's name, with the body `Started from "<card>" on the shared canvas "<title>".`
- **Owner, privacy and independence:** the hole belongs to the viewer and is private by default. The viewer can edit
  it, and it does not depend on the shared canvas. It is a canvas in the viewer's own workspace and opens at
  `/apps/<hole>`.
- **Starting again from the same origin** (the same card, or the root) enters the viewer's existing hole for it.
- **The shared canvas stays read-only.** Starting a hole writes nothing to it: no block, no Tutor message, no learner
  evidence and no change to its saved state.
- **Tutor, chat and evidence inside the hole belong to the viewer and stay private.** The hole is an ordinary canvas
  of theirs, so nothing in it ever writes into the sharer's board or learning state.
- **Back to the source:** the hole's Rabbit Holes Map shows the shared canvas as the level above it. That level is
  view-only and cannot be renamed or deleted. ↑, or a click on it, opens the share link, so returning never makes the
  viewer an editor.
- **Library:** a hole started from a shared canvas is a root of the viewer's own, so it is listed in their Library,
  Home and Search. Ordinary nested holes stay out, as before.

## Auth

The existing shared-canvas rules apply:

- A public link can be viewed signed out, but owning a hole needs an account.
- Signed out, Start Rabbit Hole goes through the existing sign-in (`/login?next=/b/<token>?rabbit=<card id|root>`). On
  return the page reads `?rabbit=` once, drops it from the address and finishes the start from the same origin.
- A non-public link already requires sign-in to open, so the start works the same way there.

No second sign-in flow was added.

## Provenance: reused, and what was added

The hole is built from the existing `/dive` model ([dive-v1.md](dive-v1.md)). There is no new table, column or
migration.

| Store | Field | Value |
|---|---|---|
| `canvases` | the viewer's row | owner = the viewer, title, `project NULL` |
| `canvas_dives` (existing) | `parent_app` | `share:<share key>`: the share link's one-way key (`shareKey(token)`, as Shared Canvas V1 uses), so a level never holds the raw token. |
| | `parent_board` | the shared board's name |
| | `origin_block_id` | the selected card's block id, or `:root` for the canvas itself. `:root` is reserved and is never a block id. |
| | `dive_json` | the Dive record, below |
| `learn_boards` | the hole's own board | `{ blocks: [anchor] }`, version 1, no `forked_from` (this is not a fork) |

The Dive record has the same shape `/dive` writes (`dive.js` `diveRecord`):

- `dive_id`, `title`, and `created_by: 'shared_start'`.
- **`origin`:** `parent`, `origin_block_id`, `origin_scene_id`, `origin_card_id`, `origin_part_id`,
  `origin_concept_ids`, `selected_object`, `depth` and `level`. These are resolved by `learn-target.js`
  `resolveTarget`, exactly as for any dive, and the server checks the block id against the shared board.
- **`return_point`:** as usual.
- **`source` (added):** the one new key in the record. It reuses the fork's `forked_from` field names, so "which shared
  canvas, card and version?" has a single shape:
  - `resource_id`, `board`, `board_id`, `title`, `creator {name, source_owner_verified}` and `share_url`, exactly as a
    fork records them;
  - plus `share_key`, `version` and `updated_at` (the shared board's version when the hole began);
  - plus `commit`: the share's pinned repository commit, only when the viewer may see that repository; otherwise
    `null`, and the repository's name is withheld as everywhere else.

`source` is required because the parent level is a share link, and the hole must be able to name it and link back to it
without reading the sharer's rows. The raw token appears only in `share_url`. That matches the fork, which keeps
`/b/<token>` in `forked_from.share_url`, and the URL is the viewer's own link.

## API

`POST /api/learn/boards/shared/<token>/rabbit-hole` with body `{ origin: null | { block_id, scene_id, card_id,
part_id, concept_ids, selected_object, depth, title? } }`.

| Response | When |
|---|---|
| 201 `{name, title, url, source}` | a new hole |
| 200 `{name, title, url, existing: true}` | the viewer already has a hole from this origin |
| 401 `{signIn: true}` | signed out (sign in, then resume) |
| 404 | a dead link, or a card that is not on the shared board |
| 400 | a malformed origin |

All writes happen in one batch, in the viewer's workspace only. The shared row is only read.

## Anti-hardcoding

This is generic Shared Canvas behaviour, and nothing in it names a board, lesson, topic, card type or share.
`packages/web/src/shared-rabbit-hole.test.mjs` fails if the route, the client helper or the button ever do.

The same code is proven on unrelated sources:

- **Server tests** (`packages/control-plane/test/shared-rabbit-hole.test.js`): a project board (root and chat card)
  and a plain canvas with a quiz card.
- **Browser check:** a root start on one shared canvas, and a selected-card start on a different canvas with a
  different card type.

## Checks

- `packages/control-plane/test/shared-rabbit-hole.test.js` covers:
  - the routes, rows, provenance and re-entry;
  - auth and origin validation;
  - privacy, the Library listing and the map's shared level;
  - that the sharer's rows are unchanged, compared byte for byte.
- `packages/web/src/shared-rabbit-hole.test.mjs` covers the origin, the sign-in round trip, the call and the
  anti-hardcoding gate.
- `packages/web/e2e/shared-rabbit-hole-check.mjs` runs the owner's 14 cases against a local stack, with screenshots.
