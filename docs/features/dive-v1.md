# /dive v1: nested Rabbit Holes

Product decisions: [tutor-v1-locked-decisions.md](tutor-v1-locked-decisions.md) §6 (R-1 to R-10).
This file records what is built and how to run it. Out of scope: the Learner Intent Resolver, JEV,
Socrates/Feynman routing, the Tutor planner, evidence evaluation, generated explanations and /motion.

## Model

- A Rabbit Hole is a learning canvas. A nested hole is a child canvas, and the card it was entered
  from is its portal.
- It is a tree:
  - one parent per hole
  - one child per originating card
  - no depth limit
  - no DAG, no cross-links; a share covers one board, and a hole shows on a shared map only through its own link ("Shared map" below)
- The parent of a hole is a board: `{app, board}`. The app is a canvas (`canvas-*`) or a repository
  project (`repo-*`), and a named board (`?board=`) is its own level.

## Data (LEARN_DB only)

Migration: `packages/control-plane/learn-migrations/0001-canvas-dives.sql`, also appended to
`repository-schema.sql`. It is additive and re-runnable, and applied to local D1 only.

```sql
canvas_dives(org, owner_email, child, parent_app, parent_board, origin_block_id, dive_json, created_at,
             PRIMARY KEY(org, child), UNIQUE(org, owner_email, parent_app, parent_board, origin_block_id))
```

- The child keeps its own `canvases` row, for title and owner, so rename is the existing canvas PATCH
  and the child opens like any canvas. The link row adds only where the hole came from.
- The UNIQUE key is R-3: one child per originating card.
- `dive_json` is the Dive record: `dive_id`, `concept`, `title`, `created_by`, the `origin` and the
  `return_point`.
- The origin keeps five identities apart (resolved by `packages/web/src/learn-target.js`
  `resolveTarget`, from the existing card modules; no Tutor code):
  - `origin_block_id`: the canvas block's own id.
  - `origin_scene_id`: the runtime `scene.id`, e.g. `nanogpt-c11-causal-mask`.
  - `origin_card_id`: the authored `evidence.card`, e.g. `c11-causal-mask`.
  - `origin_part_id`: `partIds[pager value]` on a paged card, never the selected object.
  - `origin_concept_ids`: the selected object's `conceptId`, else the shown part's, else the
    card's objects'.
  - Also `selected_object`, `depth` (the card's `evidence.depth`), the tree `level`, and `anchor_request` for an anchor
    card, whose scene, card and part are null.
- The return point holds block_id, part_id, selected_object, inputs, input_revision, practice_open,
  pending_question and viewport.

## API (control-plane `src/dives.js`, routed through `canvasesFetch`; owner-only)

| Call | Does |
| --- | --- |
| `GET /api/canvases/dives?app=&board=` | `{path, dive, children}`. `path` runs from the root to this level. `children` are the immediate children only. `dive` is this level's own record. |
| `POST /api/canvases/dives` | Persists a hole: its canvas row and link in one batch. Body: `{name, title, parent, origin_block_id, dive, device_id}`. Returns 409 `{existing}` if the card already has a child. |
| `DELETE /api/canvases/dives/<canvas>` | Deletes a leaf. A hole with holes inside returns 409 `{descendants}`; only `?subtree=1` removes them all. |
| `PATCH /api/apps/<canvas>` | Rename (the existing canvas title API). |

## Client

`src/dive.js` holds the pure rules (tested in `dive.test.mjs`). `src/Dive.jsx` holds the hook and UI.

- **Every hole has exactly one originating card** (owner correction, 2026-09-30). That card is the
  selected card, or a topic anchor card made from the request.
- **Selected card.** Ctrl+K or `/dive [topic]` dives from it (`diveFromCard`). The hole's title is
  taken from the request ("explain softmax" gives Softmax), or else from the card's title.
- **No card selected, with a topic.** `/dive explain softmax` adds a topic anchor card to the current
  canvas and opens its pending child (`diveFromTopic`). The anchor is an ordinary `explanation`
  block: its title is Softmax, its body is the learner's words, and it carries
  `anchor.request` = "explain softmax". Nothing is generated.
- **No card selected, bare `/dive`.** It uses the conversation's last question as the request. With
  none, it asks "What do you want to go deeper into?" and never makes an empty "Dive" card.
- **The anchor lives on the parent.** It does not persist the child: an abandoned child leaves the
  anchor with no outline, and the child's first object gives the anchor the green hole outline.
- **Ctrl+K without a card**, and Ctrl+K outside Learn, is the global Search, unchanged
  (`Search.jsx`).
- **Stabilization (2026-09-30):**
  - **Pending lifetime.** An empty hole lives in this tab only while the learner is inside it.
    Leaving it while it is still empty, back up to its parent included, discards it, so an empty
    hole never shows on the map or as a portal on its card (owner 2026-10-01; this replaces the
    2026-09-30 rule that kept it while the learner was on the parent board).
  - **Chat in a pending hole.** Chat and / commands work there: the ask carries `scope.pending`
    (parent and title), and the server answers it as a virtual canvas under a parent board the
    learner owns (`dives.js` `pendingHoleApp`). Chat alone still never persists the hole.
  - **Nested holes are hidden** from Home, Library and Search (`ownerCanvases` leaves out every
    `canvas_dives` child). They open through the navigator, their portal, or their URL.
  - **Double-click** a card with a hole, saved or pending, to go down it. A single click selects;
    Ctrl+K on a selected portal card enters too.
  - **Navigator:**
    - No ↑ at the root, and no ↓ when there is nothing below.
    - The current level is a green square and a green label with white text (dark text on the lighter dark-mode green).
  - **Anchor cards** show no "Explanation" kicker, and a body only when it adds to the title
    (`/dive softmax` is just "Softmax").
- **Pending hole.**
  - The hole's URL is its parent's plus `?hole=<canvas-name>`, and its record lives in
    sessionStorage.
  - The name is a real canvas slug, so the hole's local keys never move.
  - Leaving its part of the tree (the hole and its parent board) while it is empty discards the record and every local key, and its temporary outline.
- **Persisting.** The first canvas object persists the hole, and the same rule hides the empty-hole
  hint (owner r29: one predicate, `dive.js` `meaningful` over the canvas's `content`, which is
  `canvasObjects`). Any object counts: a card (images, equations and code are cards), a chat card added
  to the canvas, a pen stroke, a shape, text, a sticky note or an asked-about area. Chat that stays in
  the dock's sheet does not, since it is not on the canvas. Comment pins are off in a pending hole.
  Before r29 the count left chat cards out, so a hole whose only object was a chat card added from the
  sheet kept its hint over the card and was discarded, card and all, on leaving; shapes, text and
  strokes always counted. The URL then moves in place without a remount.
- **Portal.** The green outline and the "↓ title" tab on the originating card are derived from the
  parent's `children`, through the `DivePortals` context read by `CanvasNode`. No card data changes.
  Every hole mark (portal tab and outline, minimap holes, the map's level and markers) reads two theme
  tokens in `index.css`, never a hex (owner r29, green not red): `--color-hole` for a kept hole and
  `--color-hole-pending`, lighter and dashed, for one not kept yet; both flip in `.dark`.
- **Navigator.**
  - It sits at the top of the tools' gutter and never covers content.
  - It reads top to bottom: the parent above, the deeper level below. Levels are joined by straight
    connectors with a ▾ head, and the arrows are square-capped (geometric, not rounded or chevrons).
    The current level has a small green square, dashed while the hole is pending. Paths deeper than five levels fold their middle into "⋯ n".
  - ↑ goes to the parent. ↓ goes to the only child, or opens a compact picker when there are several.
  - Click a level to go there. Double-click a name to rename it (Enter saves, Esc cancels).
- **Return point.** Climbing up restores the parent's viewport, selects the originating card, and puts
  back the pending question. Card inputs and practice state already persist in the parent's block
  data.
- **Delete.**
  - A leaf is deleted after a confirmation.
  - A hole with descendants gets a subtree warning that names them.
  - Deleted holes' local keys are cleared, and the outline goes with the link.
- **Suggestion (structure only).**
  - `DiveSuggestion` shows [Go down a Rabbit Hole] / [Keep it on this canvas].
  - With a blockId the card is the origin; without one, confirming makes a topic anchor card.
  - The Tutor will raise it with
    `window.dispatchEvent(new CustomEvent('small:dive-suggest', { detail: { blockId, topic } }))`.
  - No model is wired to it.

## Shared map (owner, 2026-10-08)

A shared (`/b/<token>`) or published (`/e/<token>`) canvas shows its Rabbit Holes Map read-only: the navigator in the gutter, and the green outline and "↓ title" tab on each hole's origin card.

**What a token covers.** A share link or publication covers exactly one board: its `learn_boards` row, its files and its notebooks. It never covers the holes below it or the canvas above it. Each hole is its own canvas with its own main board and its own Share settings; a hole cannot be published on its own.

**The rule.** A level appears on a shared map only when the viewer could open that level's own link right now:
- its main board has a view link on (`shared = 1` with a `view_token`);
- it is not in Trash;
- the link is public, or the viewer is signed in.

Everything else is left out whole: a private hole's title, its existence, its count and its origin card never reach the page.

**Behaviour.**
- A level is a title and its `/b/<token>` link; the current level is the link being viewed, at `/e/` for a publication. Never a canvas id or an email.
- **Path:** it climbs to ancestors while each one passes the rule, and stops at the first that does not.
- **Holes below:** the current board's direct children that pass the rule.
- A click on a level, ↑, ↓, the picker or a portal opens that level's link.
- There is no rename, no delete, and no new hole from the map.
- With nothing above or below, there is no map, as on a canvas without holes.

**API:** `GET /api/learn/boards/shared/<token>/holes`, under the same access as opening the link (`sharedAccess`). It returns `{ path: [{ title, href }], children: [{ title, href, origin_block_id }] }`.
- ponytail: the path climbs canvas levels only. A project board, or a hole started from someone else's share (`share:`), ends it.

**Code:** `learn-boards.js` `sharedHoles`; `shared-holes.js` `sharedTree`; `SharedBoardPage.jsx` (`DivePortals` and a read-only `DiveNavigator`, which shows no delete without `askDelete`).

**Checks:** `packages/control-plane/test/shared-hole-map.test.js`, `packages/web/src/shared-holes.test.mjs`, and `packages/web/e2e/explore-holes-check.mjs` part A (local stack, not run yet).

## Run it locally (no remote resources)

```bash
# once: packages/control-plane/.dev.vars (gitignored): SMALL_ENV=test, MASTER_KEY, TEST_BYPASS_SECRET, OAUTH_MOCK=true
# main D1 as docs/features/rabbit-hole-dev.md builds it: bootstrap.sql, then every migration (run in packages/control-plane)
npx wrangler d1 execute rabbit-hole-dev --local -c wrangler.rabbit-hole-dev.jsonc --persist-to ../../.small/fi-local --file bootstrap.sql
npx wrangler d1 migrations apply rabbit-hole-dev --local -c wrangler.rabbit-hole-dev.jsonc --persist-to ../../.small/fi-local
npx wrangler d1 execute rabbit-hole-learn-dev --local -c packages/control-plane/wrangler.rabbit-hole-dev.jsonc --persist-to .small/fi-local --file packages/control-plane/repository-schema.sql
cd packages/web && npx vite build && VITE_COACHING_DEV=true VITE_BYOC_DEV=true npx vite build --outDir dist-dev && cd ../..
# the app (dev worker + dev control plane), and the control plane on its own origin, where sessions and sign-in live
npx wrangler dev -c packages/web/wrangler.dev.jsonc -c packages/control-plane/wrangler.rabbit-hole-dev.jsonc --local --persist-to .small/fi-local --port 8788
npx wrangler dev -c packages/control-plane/wrangler.rabbit-hole-dev.jsonc --local --persist-to .small/fi-local --port 8790
```

- The app's P0-B barrier refuses `/auth/*` and `/test/session` on 8788, so the check scripts mint sessions on 8790
  (`SMALL_CP`); a session from there works on 8788.

- `wrangler dev` bundles `dist-dev/index.html` into the worker, so restart it after every rebuild.
- `node packages/web/e2e/dive-local.mjs` opens a signed-in browser window on a stable review canvas
  ("Attention (local review)", NanoGPT deep-dive board) for hands-on testing.
- `node packages/web/e2e/dive-check.mjs <outDir>` walks flows A to I against the local stack, with
  screenshots. It refuses any other host.

## Known limits (v1)

- The conversational referent for a bare /dive is the last chat question as typed, not a resolved
  concept: resolving "why do these add to 1?" to Softmax is the Learner Intent Resolver's job.
- The navigator is hidden below 640px of canvas (desktop is the review target).
- `practice_open` is recorded but not reopened: practice state comes back from the parent's saved
  block data.
- The Learn chat threads of deleted holes stay unreachable in LEARN_DB (`ponytail:` in `dives.js`).
