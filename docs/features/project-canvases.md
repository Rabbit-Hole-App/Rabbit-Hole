# Project canvases

Owner decision, 2026-10-08 (verbatim): "B — canvas switcher in the Learn header. A project contains multiple canvases,
each with its own content and journey. Include 'New canvas' in the switcher and show 'N canvases' on the project's
Library card. Keep the existing project navigation."

## Data model: no migration

A project canvas is an ordinary canvas row whose `project` column names the project.
- It is a `canvases` row: `canvas-<8 hex>`, kind `canvas`, with `project = repo-*`.
- The column already exists (`repository-schema.sql`, `canvases.project`).
- `POST /api/canvases` already writes it, and Duplicate keeps it (`learn-boards.js`).
- The project's Learn tab already listed these canvases in a plain `<select>` at `?tab=learn&canvas=<name>` (WP6).
- The project's own board stays where it is (`learn_boards`, app `repo-*`, board `main`). The switcher calls it **Main canvas**.

Each project canvas has its own:
- board: `learn_boards (org, owner, canvas-*, 'main')`, written empty at creation, in the same batch as its row;
- chat: `threads.scope_ref = canvas-*`, and this browser's `small.adaptive-canvas:<org>:<email>:canvas-*:*` keys;
- journey: `learning_journeys (org, owner_user_id, canvas-*, 'main')`;
- title, description, sharing, publication, Archive and Trash. These are the canvas's own; the Library ⋮ manages them.

### Asks read the project's repository

Decided by Parallel, 2026-10-08 (open question 1, B). A project canvas's Learn asks get the project's repository, as Main canvas's asks do.
- They get the repository's context (repo and commit), `REPOSITORY_SYSTEM` and `REPOSITORY_TOOLS` on the project's current snapshot (`canvases.js projectRepository`).
- They keep every canvas Learn tool: Wikipedia, video moments, the outline proposal and context documents.
- It runs inside `apiAsk` through the canvas seam (`seam.repository()`) and is read again on **every ask**, never stored at creation.
- **Only the caller's own project counts.** The `repository_apps` row must match the workspace, the project name and the caller's email, and must not be in Trash.
- **A quiet fallback.** Another person's project, a project in Trash or gone, one not indexed yet, or a snapshot that will not load: the ask runs as a general canvas, with no error.
- What a canvas ask does not take from Main canvas (`repositoryAsk`): a selected node, range or file from the Map; @-mentioned repositories; the Show-on-graph view; and repository context on a lesson-snapshot ask, which keeps its snapshot as the context and gets the tools only.
- Journey and Tutor v2 turns on a project canvas (`learn-tutor-routes.js`) are not repository-grounded; they stay LP-T.

### Why not named boards on the project app

We considered extra `learn_boards` rows under `repo-*`, the title in `state_json`. They fail the decision:
- **No journey.** Journeys refuse repository apps (`learn-journey.js:261`: LP1 journeys live on canvases only; repository journeys are LP-T).
- **Shared chat.** Threads are scoped by app, so every board of a project would share one chat history.
- **Lost titles.** Every board `PUT` replaces `state_json` with the browser's snapshot.
- **Review-board baggage.** A board other than `main` is review tooling in `LearnPage.jsx`: dev build only, saved only while shared, no sources, no publish.

### Kept apart

- **Review boards** (`?board=<name>`, dev build only) are `learn_boards` rows with a board other than `main`. They are never `canvases` rows, so they are never listed or counted. `?board=` is unchanged.
- **Rabbit Holes** (`/dive`) are `canvases` rows with a `canvas_dives` row and `project` NULL (`dives.js`). They are never listed or counted as project canvases.
- Holes started from a project's Main canvas keep their parent `repo-*`, as before.

## API

No new endpoint. What already exists:

| Need | Route | Notes |
|---|---|---|
| List | `GET /api/apps` | The catalog already carries every live, top-level canvas with its `project`; the switcher filters it. |
| Create | `POST /api/canvases` `{ title, project, device_id }` | Owner's own project only (404 otherwise). The empty main board is written in the same batch. The slug is `canvas-<8 hex>`, so it never meets `main` or a review board (different app). |
| Rename | `PATCH /api/apps/<canvas>` `{ title }` | Through the Learn header's title field (via the Dive navigator) and the Library ⋮ Rename. |
| Count | `GET /api/apps`: `canvas_count` on each project row | New. `ownerRepositories` counts 1 (Main) plus the owner's live canvases in the project. Live means not archived and not in Trash: the same set the catalog lists. |

**Authorization** follows the Main board's owner-only rule:
- Every canvas route checks `owner_email` (`ownedCanvas`).
- Create checks that the project is the caller's, in the requested workspace.
- The count reads only the owner's rows.

## UI

**The switcher** is in the Learn header strip, right after the title field.
- **Trigger.** A `Shapes` icon and a chevron (`data-canvas-switcher`, aria-label "Switch canvas").
  - The title field beside it already names the open canvas, so the trigger does not repeat the name.
  - Its tooltip gives the count: "N canvases in this project".
- **Menu.** A "Canvases" heading, then:
  1. Main canvas, always first.
  2. The project's other canvases, in catalog order (most recently updated first).
  3. A divider, then **New canvas**.
- The open canvas is checked. Opening the menu reloads the catalog, so a rename made elsewhere shows.
- **Switching** navigates:
  - Main: `/apps/<repo>?tab=learn`.
  - Another: `/apps/<repo>?tab=learn&canvas=<canvas>`.
  - A reload or a shared link opens the same canvas.
  - An unknown, archived or trashed `?canvas=` falls back to Main canvas, as before.
- **New canvas.** A dialog (`ConfirmDialog` with `Input`):
  - The name is prefilled "Canvas N", where N is the count plus one. It is editable.
  - Create is disabled while blank or while the request runs. Cancel and Escape close the dialog.
  - Create posts the canvas, reloads the catalog and opens the new canvas.
  - A refusal shows as an error toast, and the dialog keeps the name.
- **Replaced.** The plain `<select>` above Learn (shown only when a project had canvases) is gone; the switcher is always there in a project.
- **Library card.** A project's card footer reads "N canvases", with the `Shapes` icon (`data-canvas-count`).
  - It is the one LearningCard, so Home's Recent shows the same line.
- **Navigation is unchanged.** The Files / Graph / Learn tabs, the Map icon and Back in the Learn header, the crumbs, and `?tab=` stay as they are.
- **Press feedback** comes from the global rule (`index.css`): the trigger and the menu items are buttons.

### States

- **Catalog not loaded.** The menu lists Main canvas only.
- **Creating.** Create is disabled. After success, the new canvas opens.
- **Refused.** The error toast shows the server's sentence, for example "Project not found in this workspace".
- **Not in this browser.** The existing `CanvasLearn` gate stays: "not in this browser" for a canvas whose content is neither on the server nor here. Only canvases made before boards came with their rows can reach it. The gate has no switcher; its Open project button leads back.

## Count rule

"N canvases" is shown on every project card, N ≥ 1 ("1 canvas"):
- it is the owner's literal ask;
- it tells the reader that a project holds canvases.

## Out of scope (deliberately)

- **A journey on Main canvas,** and repository-grounded journeys or Tutor v2 turns on project canvases. They stay LP-T.
- **Moving a canvas** into or out of a project.
- **Delete, reorder or archive from the switcher.** The Library ⋮ keeps Archive and Trash.
- **Hiding project canvases** from the Library's Canvases section. They stay listed, as today.
- **A per-project canvas cap.** The global no-cap note in `canvases.js` stands.

## Decided

Parallel decided these on 2026-10-08, under the owner's standing grant.

1. **Added canvases and the repository: B.** They ask with the project's repository, like Main canvas, re-checked on every ask (see "Asks read the project's repository" above).
2. **Project canvases in the Library: A.** Each stays its own card in Canvases, as today.
3. **Count rule: A.** Always "N canvases", including "1 canvas".
4. **New canvas default name: A.** "Canvas N".

## Tests

- `packages/control-plane/test/project-canvases.test.js`:
  - create in a project, with its board and owner checks;
  - the count: live only, owner only, review boards and holes excluded;
  - a separate board per canvas, the Main canvas untouched;
  - rename.
  - Chat and journeys are keyed by the canvas's own name, as for every canvas; their existing tests cover them.
- `packages/control-plane/test/learn-chat.test.js`, "a project canvas asks with its own project's repository":
  - the project's context, system note and code tools ride, and the Learn tools stay;
  - the same seam re-checks on the next ask, after Trash and after a missing snapshot;
  - another person's project in the same workspace, or none, gives a general canvas;
  - `askStream` is the recording stub and the live DB throws, so no model call is made.
- `packages/web/src/project-canvases.test.mjs`: the switcher's list, labels, hrefs and the "Canvas N" default (pure).
- `packages/web/src/home/provenance.test.mjs`: the card's "N canvases" label.
- `packages/web/e2e/project-canvases-check.mjs` runs against the local stack only and is not run yet:
  - it seeds a ready project row in local D1;
  - it checks the switcher, New canvas, the URL, a reload, the Library count and that each canvas has its own board.
- `packages/web/e2e/rabbit-hole-check.mjs` `wp6-learn` drives the switcher instead of the old `<select>`.
  - Its not-in-this-browser step is gone. A canvas is now made with its board, so that gate opens only for canvases older than that, which no API can make.
