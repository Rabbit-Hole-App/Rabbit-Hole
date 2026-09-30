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
  - no DAG, no cross-links, no sharing
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
- `dive_json` is the Dive record: `dive_id`, `concept`, `title`, `created_by`, the `origin` (parent,
  card, scene_id, block_id, part_id, depth) and the `return_point` (block_id, part_id, inputs,
  input_revision, practice_open, pending_question, viewport).

## API (control-plane `src/dives.js`, routed through `canvasesFetch`; owner-only)

| Call | Does |
| --- | --- |
| `GET /api/canvases/dives?app=&board=` | `{path, dive, children}`. `path` runs from the root to this level. `children` are the immediate children only. `dive` is this level's own record. |
| `POST /api/canvases/dives` | Persists a hole: its canvas row and link in one batch. Body: `{name, title, parent, origin_block_id, dive, device_id}`. Returns 409 `{existing}` if the card already has a child. |
| `DELETE /api/canvases/dives/<canvas>` | Deletes a leaf. A hole with holes inside returns 409 `{descendants}`; only `?subtree=1` removes them all. |
| `PATCH /api/apps/<canvas>` | Rename (the existing canvas title API). |

## Client

`src/dive.js` holds the pure rules (tested in `dive.test.mjs`). `src/Dive.jsx` holds the hook and UI.

- **Selected card is mandatory.** Ctrl+K on Learn with a card selected dives, and so does `/dive
  [topic]`. A topic is taken from the argument, or else from the card title.
- **No card selected.** `/dive x` creates nothing. It answers "Select the card you want to go deeper
  from.", keeps the intent, and completes on the next card selection. Esc, a new /dive, or leaving
  clears it.
- **Ctrl+K without a card**, and Ctrl+K outside Learn, is the global Search, unchanged
  (`Search.jsx`).
- **Pending hole.**
  - The hole's URL is its parent's plus `?hole=<canvas-name>`, and its record lives in
    sessionStorage.
  - The name is a real canvas slug, so the hole's local keys never move.
  - Leaving it while it is empty discards the record and every local key. There is no outline.
- **Persisting.** The first canvas object persists the hole: any card, drawing, shape, note or text.
  Chat alone does not (the canvas `content` count excludes chat). The URL then moves in place
  without a remount.
- **Portal.** The red outline and the "↓ title" tab on the originating card are derived from the
  parent's `children`, through the `DivePortals` context read by `CanvasNode`. No card data changes.
- **Navigator.**
  - It sits at the top of the tools' gutter and never covers content.
  - Levels are joined by short organic root segments. The current level has a red dot, dashed while
    the hole is pending. Paths deeper than five levels fold their middle into "⋯ n".
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
  - The Tutor will raise it with
    `window.dispatchEvent(new CustomEvent('small:dive-suggest', { detail: { blockId, topic } }))`.
  - No model is wired to it.

## Run it locally (no remote resources)

```bash
# once: packages/control-plane/.dev.vars with a local MASTER_KEY and TEST_BYPASS_SECRET (gitignored)
npx wrangler d1 execute small-learn-dev --local -c packages/web/wrangler.dev.jsonc --persist-to .small/dive-local --file packages/control-plane/repository-schema.sql
cd packages/web && VITE_COACHING_DEV=true VITE_BYOC_DEV=true npx vite build --outDir dist-dev && cd ../..
npx wrangler dev -c packages/web/wrangler.dev.jsonc -c packages/control-plane/wrangler.jsonc --local --persist-to .small/dive-local --port 8788
```

- `wrangler dev` bundles `dist-dev/index.html` into the worker, so restart it after every rebuild.
- `node packages/web/e2e/dive-check.mjs <outDir>` walks flows A to I against the local stack, with
  screenshots. It refuses any other host.

## Known limits (v1)

- Asking in chat inside a pending hole fails, because the hole has no canvas row yet. Chat alone
  never persists a hole (R-4).
- Persisted holes are canvases, so they also appear in Home, Library and Search as standalone
  canvases.
- On a phone (the gutter is a strip under the canvas below 640px) the navigator is hidden.
- `practice_open` is recorded but not reopened: practice state comes back from the parent's saved
  block data.
- The Learn chat threads of deleted holes stay unreachable in LEARN_DB (`ponytail:` in `dives.js`).
