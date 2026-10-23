# Start a rabbit hole: combined sources

Owner brief, 2026-10-23 (two messages; the second corrects the first). Rabbit Hole builds only (`StartHost` mounts in
preview builds, `main.jsx`); this change does not widen that. Contract code: `packages/web/src/start-draft.js` (pure, tested
by `start-draft.test.mjs`). Reuse audit with file:line evidence: `C:/s/spec/start-dialog/audit.md`.

## What the dialog is

Title **Start a rabbit hole**. Subtitle "Add files, links or a repository. You can combine them." Three secondary buttons
(Add files, Add link, Connect repository), then a file-drop area. Every add goes into ONE draft and never replaces what is
there. Add link and Connect repository open one compact URL input inside the dialog; checking or cancelling it keeps the list.

The list has one row per source: a type icon; the file name, the resolved page title or the repository name; details and a
status line; Remove; and two checkboxes under the name, each with its own label.

| Row | Use as context | Add to canvas |
|---|---|---|
| file, link | on | on |
| repository | on | off, labelled **Add overview to canvas** |

Above the list, once: "Context lets Chat and Tutor use a source." "Canvas shows it as a card in your workspace."
Above the footer: a compact summary ("2 context sources, 3 canvas cards"). Footer: **Start with a blank canvas** (left, a
text action) and **Start rabbit hole** (right, primary). A row with both options off shows "Choose context, canvas, or
both." and Start is disabled. One source record serves both destinations: unchecking one never removes the other.

Blank creates an empty canvas and imports nothing from the list; with no sources it is simply available. After a failed
start has already created a destination, Blank opens that destination instead of creating a second one.

Nothing here generates a course, explanation or path. Later generation uses the existing generation Edit/Confirm flow.

## Owner decisions this build assumes

Recommended defaults from the lane brief; the owner has not objected. Change one by editing this list and the named code.

1. **Repository plus files.** Files are added to the project's Main board as cards. Their **Use as context** is shown
   disabled (name kept, greyed, no explanation) because context documents are canvas-only today and repository chat does
   not read them (`learn-context-docs.js` `CANVAS`, `repository-chat.js`). Extending context documents to repository
   projects is a separate later server change. Without a repository both checkboxes work as specified. The stored choice
   is kept, so removing the repository gives the file its context back (`capabilities`, `effective`).
2. **Repository overview** is the existing `repo-graph` card with scope `whole` (`graph-card.js graphCardBlock`), added
   only after the index is ready; the row says "Waiting for the index" until then. One card, never a card per file.
3. **Context keeps today's meaning.** A context document (PDF, `.txt`, `.md`) rides a turn in full when switched on; long
   PDFs are read by relevant pages. The dialog never claims retrieval. Copy stays as the owner wrote it.
4. **Idempotency is client side.** A start job holds an in-flight lock and the created destination id in the draft, so a
   retry attaches to the same destination. No migration, no new route.
5. **Link preview is by pattern.** arXiv, YouTube and Wikipedia links show their type and identifier at once. Other
   articles show "Will be resolved when you start" and take their title after creation. If a page cannot be read the row
   says why and offers upload or paste. A webpage card gives the Tutor the name and URL only until the learner selects
   text; the dialog implies nothing more.

## The draft (`start-draft.js`)

```
draft = { rows[], seq, phase, destination, notices[], attempt, error }
phase: editing | starting | partial | done
destination: null | { kind: 'canvas' | 'repository', slug, existing }
row = { id, kind: file|link|repository, key, label, detail, context, canvas,
        status, reason, waiting, done: { context, canvas }, needsFile, meta }
```

- `context` and `canvas` are the person's choices. `effective(row, draft)` is what runs: a choice an option cannot honour
  counts as off. File context needs a PDF, `.txt`, `.md` or `.markdown` and no repository in the draft. A link's context
  follows its card (the card is what the Tutor attaches), so it is unavailable while the link's canvas option is off.
- `done` records each destination separately. Retries do only what is missing, so nothing is stored or placed twice.
  A repository's `done.context` is "project connected"; its `done.canvas` is "overview card placed".
- One repository per draft (a second says "A rabbit hole can have one repository. Remove it to connect another."),
  multiple files and links. A repository already connected is opened (`meta.existing`), and the other sources attach to
  its Main board. A repository cannot join a start whose destination is already a canvas.
- Duplicates (same file name, size and modified time; same normalised link) are named in a notice and not added.
  Files the canvas cannot take whole (3D model parts and packages, unsupported types, empty, over the family limit) are
  refused by name with the reason; 3D models are added from the canvas where their companions can be dropped together.
- At most 10 files with effective context (the server's `ATTACHED_LIMIT`).
- Reducer actions: `add-files`, `add-link`, `add-repository`, `remove`, `set-option`, `dismiss-notices`, `begin`,
  `destination`, `row`, `finish`. While `phase` is `starting` the list is locked (add, remove, toggle are ignored) and a
  second `begin` is refused: that is the duplicate-submission guard. A ready row is locked too; it is done.

## Row states

```
idle -> checking -> uploading -> importing -> ready
  any of idle..importing -> failed (with a reason)      failed -> idle (only by Start again)      ready: terminal
```

| State | Status line | Used by |
|---|---|---|
| idle | blank; "Will be resolved when you start" for an article link | all |
| checking | Checking | link resolve, repository branch and public check, file structure check |
| uploading | Uploading | file bytes (context document or file source) |
| importing | Adding; "Waiting for the index" while `waiting === 'index'` | cards placed on the canvas, repository connect |
| ready | Ready | every chosen destination is `done` (the reducer refuses `ready` otherwise) |
| failed | the reason, in words | any step |

Failure reasons are the server's or helper's own words (file checks, `webpage-capture` statuses, repository errors); a link
that cannot be read says why and offers "Upload the file" or "Paste the text".

## Start, partial failure and retry

`planStart(draft)` is the only planner, used for the first run and every retry: it lists the rows that are not ready, each
with exactly the destinations still missing, repository first (it creates the destination), then files, then links.

1. `begin` (refused unless `canStart`) sets `phase: starting`, bumps `attempt`, sets failed rows back to idle.
2. The orchestrator creates the destination once: `create_canvas` or `connect_repository` (or opens the existing one), and
   reports it with `destination`. A second report is ignored, which is what makes a retry land on the same destination.
3. Each step runs its destinations and reports `row` updates (`status`, `done`, `reason`, `waiting`, a resolved `label`).
4. `finish` sets `done` when every row is ready, `partial` when any failed, else `editing`.
5. Successes are never undone. Retry (Start again) runs only the failed rows and only their missing destinations.
   Unchecking the destination that failed completes the row with no work (`planStart().complete`).
6. The draft is not cleared until navigation to the destination has succeeded, and a failed attempt never clears it.

## Handoff to the destination

Cards are inserted by the browser on the mounted canvas (`canvasApi` in `LearnPage`); the server never writes cards. So the
card half of a start runs on the destination page:

- API-only work runs in the dialog before navigation: creating the destination, connecting the repository, uploading
  context documents (`uploadContextDoc`).
- The dialog navigates as soon as the destination exists, and stays open over the destination (it is hosted at Root and
  survives the Shell remount) showing each row's status. Closing it never cancels; the card work continues on the page.
- The destination page reads the pending card items for its own slug from the saved job (below), places each card once
  (`file-to-canvas.js`, `small:pdf-to-canvas` for a PDF with the stored context document id, `pickResult`/`insertWebpage`
  for links, `graphCardBlock` with `sameGraphCard` for the overview) and reports each as a `small:start-result` event
  `{ id, status, reason }` and into the saved job. A reported id is not acted on twice.
- A PDF is stored once: the context document, then the pdf-to-canvas recipe naming that stored document. A `.txt` or
  `.md` for both destinations is NOT done with the LearnPage "Both" path, which stores the bytes twice.
- A `.ipynb` or `.py` goes through `FileImportDialog` (Notebook, Code card or File attachment; inert, never executed).
- File bytes are held by the orchestrator in memory for the life of the tab (a File cannot go to storage).

## Reload recovery

`saveDraft` writes the draft to `sessionStorage` (`small.start.draft`) after every change; `loadDraft` restores it when the
dialog opens. `restore` fails work that was running (reason "Interrupted by a reload. Retry to continue.") and marks any
file with work left as needing to be added again ("Add this file again."); choosing the same file restores its row, no
duplicate. Done parts stay done. Storage can be missing, full or blocked: every call reports `{ ok }` and never throws; the
dialog keeps working and says nothing misleading. The record is cleared when navigation succeeds.

## Limitations and deferred

- Repository chat does not read context documents, so files on a repository project are cards only (decision 1).
- A link's context follows its card; a context-only link has no road today (no listing for retained link sources).
- Other file families (Word, Excel, images, code, notebooks) have no context-document road; their context is the card
  attached to a chat turn, so their **Use as context** is unavailable and **Add to canvas** is the only destination.
- A README or overview text card is a new card type and is not built; the overview is the whole-repo graph card.
- No multi-repository support, private repositories, new import formats, automatic generation or code execution.
- Cross-tab or lost-response duplicates are possible until the server takes an idempotency key (needs a migration:
  `canvases.start_key`, `repository_apps.start_key`; not built).
- Extending context documents to repository projects (server) is a later change.
