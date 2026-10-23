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

The Start dialog opens neutral from Home and Library (`small:start` path `start`); the composer's Repository item and a connect
link open it with the repository input shown (path `repository`), Blank canvas from the menu opens it neutral. Cancel on a checked
repository goes back to the URL field with the URL kept; on an empty input it hides the input. Either way the list stays. Esc
closes the dialog (the draft stays, in this tab). Above the list, once: "Context lets Chat and Tutor use a source." "Canvas shows it as a card in your workspace."
Above the footer: a compact summary ("2 context sources, 3 canvas cards"). Footer: **Start with a blank canvas** (left, a
text action) and **Start rabbit hole** (right, primary). A row with both options off shows "Choose context, canvas, or
both. This source will not be added." and is left out of Start (owner decisions 2026-10-23: excluded with clear feedback);
Start is disabled only when nothing else is left to add. One source record serves both destinations: unchecking one never
removes the other, and a source on both is imported once and reused.

Blank creates an empty canvas and imports nothing from the list; with no sources it is simply available. After a failed
start has already created a destination, Blank opens that destination instead of creating a second one.

Nothing here generates a course, explanation or path. Later generation uses the existing generation Edit/Confirm flow.

## Owner decisions

Binding decisions of 2026-10-23 (the integrator's message), on top of the layout brief.

1. **Files, links and one repository together.** Use as context and Add to canvas are independent for every supported source:
   context only is available to Chat with no visible card; canvas only is a card that is not added to Chat's context; both
   reuse one imported source; neither leaves the source out with feedback.
2. **Context-only links need no card.** The server resolves the link into a small note and stores it as an ordinary context
   document (`POST /api/learn/context/link`, `learn-context-link.js`): the title, authors and abstract for arXiv, the
   introduction for Wikipedia, and only the name and address for a YouTube link or any other page, said in the note and beside
   the control ("Chat gets the name and address only."). A webpage card gives the Tutor the name and URL until the learner
   selects text.
3. **A .txt or .md is sent once.** It is stored as a file source (`/api/learn/files`, which the card reads); the server copies it
   into the context list inside itself (`POST /api/learn/context` with `source_id`/`source_rev`). Never a second upload. A PDF
   is stored once as a context document and its card is placed from that document (the pdf-to-canvas recipe). The same name and
   size already in the context answers as itself, so a retry never adds a second copy.
4. **One repository per rabbit hole.** Its context control reads **Connect repository as context**; the overview card is the
   separate **Add overview to canvas** choice: the existing `repo-graph` card with scope `whole`, added only after the index is
   ready (the row says "Waiting for the index"). One card, never a card per file.
5. **Supported files keep their context beside a repository.** Context documents are accepted on a repository project's Main
   canvas and ride its chat (`learn-context-docs.js`, `repositories.js` `repositoryAsk`). Files the context road cannot take
   (anything but PDF, text and Markdown) stay greyed with the name kept, and "Context takes PDF, text and Markdown files only."
   beside the control; they are added to the canvas only.
6. **The canvas is titled "Untitled canvas"** (renamed with the existing rename action). After the destination exists the
   dialog steps aside and a chip shows ongoing work (with **Stop**), failures with their reasons, **Retry** and **Review**.
   Successful imports are kept when another source fails.
7. **Context keeps today's meaning.** A context document rides a turn in full when switched on; long PDFs are read by relevant
   pages. The dialog never claims retrieval.
8. **Idempotency is client side.** A start job holds an in-flight lock and the created destination id in the draft, so a retry
   attaches to the same destination. No migration.

## The draft (`start-draft.js`)

```
draft = { rows[], seq, phase, destination, notices[], attempt, error }
phase: editing | starting | partial | done
destination: null | { kind: 'canvas' | 'repository', slug, existing }
row = { id, kind: file|link|repository, key, label, detail, context, canvas,
        status, reason, waiting, done: { context, canvas }, needsFile, meta }
```

- `context` and `canvas` are the person's choices. `effective(row, draft)` is what runs: a choice an option cannot honour
  counts as off. File context needs a PDF, `.txt`, `.md` or `.markdown`; a repository in the draft changes nothing. A link's
  context is independent of its card. A row with neither option is `excluded`: shown with feedback and dropped when Start begins.
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

- The job (`start-job.js`, wired by `start-run.js`) lives outside React: the draft store, the orchestrator and a per-destination
  card queue. Closing the dialog never cancels a start. `createJob(deps)` takes every outside effect as a dependency, so
  `start-job.test.mjs` runs the whole job against fakes.
- API-only work runs from the job before the page needs to exist: creating the destination (`create_canvas` or
  `connect_repository`, or opening an already connected project), uploading context documents (`uploadContextDoc`).
  The destination is reported once (`destination` action); a retry reuses it and navigates back to it if the person is elsewhere.
- Right after the destination exists the dialog steps aside (`StartHost`), so the canvas and its own choice windows are usable.
  A chip bottom right says "Adding sources, N to go"; when the job ends with failures it says how many sources need another
  try and offers Review, which reopens the list with Start rabbit hole as the retry. A clean finish clears the draft and
  toasts "Sources added."
- The destination page (`LearnPage`, preview builds) calls `startJob.attach(app.name, place)`. The job feeds it one item at a
  time (`file`, `link`, `overview`); a resolved `place` means the card is on the canvas, a thrown Error is the reason the
  row shows. If the page detaches, unplaced items fail ("The canvas was closed before this was added"); if no page attaches
  in 30 seconds they fail ("The canvas did not open"). Both retry with Start again.
- Placement reuses the existing roads: a PDF stored as a context document is placed from that stored copy
  (`placePdf` mode `pdf`, the pdf-to-canvas recipe), nothing uploaded again; every other file goes through `takeDrop`, so
  `.ipynb`/`.py`/text/Markdown open `FileImportDialog` (nothing executed), workbooks and decks their own choice, a canvas-only
  PDF its page choice. Such a row is Ready when a card appeared, and fails with "No card was added" when the window was
  cancelled. Links resolve through the Search lookup (`/api/learn/search`) and `pickResult`, or a webpage card
  (`canvasApi.insertWebpage(url)`); the row takes the resolved title. A repository overview is the whole-repository graph card
  (`graphCardBlock`, `sameGraphCard`), added once `GET /api/repositories/<project>` reports a commit.
- A `.txt` or `.md` with both options on is sent once as a file source; the card is made from that source (`fileCardFromSource`,
  revealed rather than duplicated by `sameFileCard`) and the server copies it into the context list. See Owner decisions 3.
- File bytes are held by the job in memory for the life of the tab (a File cannot go to storage).

## Reload recovery

`saveDraft` writes the draft to `sessionStorage` (`small.start.draft`) after every change; `loadDraft` restores it when the
dialog opens. `restore` fails work that was running (reason "Interrupted by a reload. Retry to continue.") and marks any
file with work left as needing to be added again ("Add this file again."); choosing the same file restores its row, no
duplicate. Done parts stay done. Storage can be missing, full or blocked: every call reports `{ ok }` and never throws; the
dialog keeps working and says nothing misleading. The record is cleared when navigation succeeds.

## Limitations and deferred

- A `.txt` or `.md` wanted as both is kept by the server under two records (the file source the card reads, and its copy in the
  context list); the browser sends it once. Dropping the second record needs a context document that can point at a file source.
- The Text and Markdown cards made for a file on both are placed without the Text card / File attachment choice window.
  A canvas-only file still opens the existing choice window (Cancel adds nothing and fails that row, Retry asks again).
- A link's context note is as good as what the server can read without a page fetch: arXiv metadata and the Wikipedia
  introduction are fetched on the server; a YouTube link and any other page keep only the name and address.
- Other file families (Word, Excel, images, code, notebooks) have no context-document road; their **Use as context** is
  unavailable and says so, and **Add to canvas** is the only destination.
- A README or overview text card is a new card type and is not built; the overview is the whole-repo graph card.
- No multi-repository support, private repositories, new import formats, automatic generation or code execution.
- Cross-tab or lost-response duplicates are possible until the server takes an idempotency key (needs a migration:
  `canvases.start_key`, `repository_apps.start_key`; not built).

## Checks

- `start-draft.test.mjs`: copy, link and file classification, defaults, the repository rule, the option capabilities, the state
  machine, the retry plan, reload recovery and storage handling.
- `start-job.test.mjs`: the job against fakes (blank, one destination, context stored once, cards through the page, partial
  failure and retry, page detach and timeout, repository connect and the index wait, an existing project, reload mid start).
- `start-wiring.test.mjs`, `start-connect-card.test.mjs`: the hand-off and dialog wiring that only a browser could otherwise reach.
- Control plane: `learn-context-docs.test.js` (link note, source copy, repository project names), `repositories.test.js` (a context
  document on the project's Main canvas rides its chat as a Chat turn names it).
- Browser (fork CI): `start-sources-check.mjs` drives the real dialog against the real context, file and board routes with the
  nanoGPT project seeded: a blank canvas, files + a stored PDF + links with a cancelled choice window and a retry, a partial
  failure with a reload and a retry that repeats nothing, an existing repository with the overview card, and the list rules.
  It reads the Chat context from the captured question's `context_refs` and the context chips.
- Browser: `card-size-check.mjs` (fork runner) opens the dialog, lists files and links, checks the defaults, the blank shortcut and
  the "Choose context, canvas, or both." block, and asserts nothing is written; `rabbit-hole-check.mjs` (Windows only) keeps the
  repository flows (lookup in flight, Branch select, connected project, stale list).
