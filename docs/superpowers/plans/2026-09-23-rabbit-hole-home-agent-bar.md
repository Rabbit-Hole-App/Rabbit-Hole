# Rabbit Hole Home, Library, Project and Agent Bar — Implementation Plan (T04)

> **Approved for implementation.** Gate B closed on 2026-09-24 after the user inspected the remaining Figma frames and two stale states were fixed (see *Gate-B visual findings*). Gate C (this plan) is active. Execution starts with WP1.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans, run by **one orchestrating agent** through the seven work packages in *Execution strategy*. After each package a fresh reviewer (superpowers:requesting-code-review) checks it before the next package starts. The checkboxes are the implementation ledger, not separate engineering sessions.

**Goal:** Ship the approved Direction C in the dev build: a learning-first Home, Library, Project hub and Map, one persistent Agent Bar driving the same typed commands as the UI, and a dev-only canvas identity. The live build stays exactly as it is.

**Architecture:** A route-derived *surface* store (`agent/surface.js`) tells a single Agent Bar, mounted once in `main.jsx` Root, where the user is. The bar routes text through deterministic rules to a command registry (`agent/commands.js`) with a registry-owned risk policy and the D7 preview guard, and falls back to the existing Ask endpoints. UI buttons call the same registry. Canvases get a record in `LEARN_DB` served by the dev worker; their content stays browser-local. Learn is reached only through its existing entry and the agreed Learn handoff, behind `learnHandoff`.

**Tech Stack:** React 19, Vite, Tailwind v4 (CSS tokens in `index.css`), lucide-react, hand-rolled `ui.jsx` primitives, `node:test` (web `src/**/*.test.mjs`, control plane `test/*.test.js`), Playwright scripts in `packages/web/e2e/`, Cloudflare Workers + D1 (`LEARN_DB` = `small-learn-dev`).

**Spec:** [docs/features/rabbit-hole-t02-spec.md](../../features/rabbit-hole-t02-spec.md) (Gate A approved), with [Direction C](../../features/rabbit-hole-direction-c.md) and the [T00 audit](../../features/rabbit-hole-home-audit.md). Figma: [Rabbit Hole — Home & Projects](https://www.figma.com/design/ef9SfiemEsPQF2bd8B1os3).

**Assembly:** generated from the `v6` area plans (seven read-only planners grounded in the checkout at `feature/smart-home`, plus consistency checks).

## Global Constraints

- Everything new ships behind `learnPreview` (dev build). The live build (plain `vite build` on `small-cp`) must behave exactly as today.
- Never edit `packages/web/src/LearnPage.jsx`, `AdaptiveCanvas.jsx` or `ask.jsx` (owned by `feat/canvas-block-conversations` and `feature/parallel-work`). Importing their exports is allowed.
- No migration on the live D1 `small`. New tables go only in `packages/control-plane/repository-schema.sql` (`LEARN_DB`, `small-learn-dev`), applied only after announcing it to peer sessions.
- D7: the review environment must not mutate production-visible user or application state. Confirm-class commands that touch live data render **Blocked** on dev builds. `connect_repository` is allowed only under the six T02 §16 conditions.
- `askLiveOnPreview = false` (Gate C G1, decided): on dev builds, asks in workspace or app scope are unavailable, so the preview never writes live chat history. Project and canvas asks (`LEARN_DB`) stay available.
- `aiReadsOnPreview = false` (Gate C G5, decided): on dev builds `/api/apps/find` and `/api/runs/find` are never called, from the bar or from the existing Search, Library and runs AI find. Read-only is not isolated. Local title search stays available.
- Proposal fixes (Gate C G3, decided): implemented and tested, but not deployed to live `small-cp`; server-backed `/do` stays Blocked until a separate promotion approval.
- Risk comes from the command registry, never from model or Jev confidence. Jev: no calls, keys or spend.
- Learn handoff only through the T02 §9 contract and only when `learnHandoff === true`; the constant stays `false` until the handoff code reaches `main`.
- Scope chips appear only when context changes what the agent does; scope is frozen at Send; drafts are kept per scope key.
- Every behaviour change starts with a failing test (`node:test` for pure modules; the shared e2e harness for browser behaviour).
- One e2e harness: `packages/web/e2e/rabbit-hole-check.mjs`. Blocks go above the marker line, wrapped in `{ }`; no top-level declarations; one `browser.close()`.
- Commit messages single-quoted, no double quotes, no `Co-Authored-By` trailer. `git add` named paths only and use `git commit --only` in this shared tree.
- The shared dev worker `small-lesson-renderer-dev` is redeployed only after its unit tests are green, the change is confirmed additive (`defaultBranchKnown` only, no rendering change), every peer session is notified, and the exact deploy command and target are shown to the user immediately before running it. The old Import flow keeps using `defaultBranch` unchanged.
- Deploy only to `small-cp-dev-smart-home` (never bare `wrangler deploy`). Never print `VITE_TLDRAW_LICENSE_KEY`. Never copy `.env` files without asking.
- Every UI task ends with the change deployed to the clone and the rendered pixels inspected before hand-off.
- `make test-unit` before every commit; `make test-integration` before merge (user go-ahead first: it touches live small-cp).

## Review Focus

- A message typed on one project and sent after navigating elsewhere must go to the scope it was typed in (frozen at Send), never the page the user is now on.
- On the review clone, any Confirm command that would change a live app, share, run or schedule must render Blocked with its reason and never call the API.
- A canvas record opened on a device without its local content must show the not-on-this-device state, never an empty editable canvas; Undo must never delete a canvas that has local content or threads.
- A slow or absent Learn handoff must never be reported as success; a timeout reads "Still working, check the canvas" and a missing hook shows the fallback.
- The live build (no `VITE_COACHING_DEV`) must render the old Apps table, sidebar and Settings unchanged.

Each line is pinned by tests in the owning tasks (surface/scope and the bar helpers for frozen scope; the commands policy tests for D7; canvas-local and the canvas route for the device gate and Undo; learn-hook for timeouts and the missing hook; the live-build case in routes.test plus the plain `vite build` check in the Start dialog task for the live build).

## Gate-B visual findings (closed 2026-09-24)

The user inspected F2a, F4a, F4b, F4d, F5a, F5b, F6, F7, F9, F10, S2, S3, S11, S12, dark Home, dark Map and narrow Home in Figma. Two stale states were fixed and re-inspected: **F4b** showed an empty `⋯` in the Project header (removed from the Project Header component, so every project header matches T02 §17 row 10; Share stays disabled), and **S11** showed the Agent Bar on the canvas gate (removed; canvas routes hide the bar). Every other frame passed. Nothing in the plan changed as a result: both fixes bring Figma in line with the plan. The items below record the known Figma-versus-plan differences and the visual details the implementation must follow.

1. **Home primary CTA (user change, 2026-09-23).** Home shows one primary **Start a rabbit hole** button that opens the four-path Start dialog (T02 §3.3). The Figma frames still show four equal Start buttons (F1, F2a, F3, F4a, F6, F7, F8, F10, S5, S6, S7, S12, dark Home, narrow Home). Figma was not updated because the Starter-plan MCP quota is exhausted; this plan implements T02 §3.3, and the frames are to be updated when the quota allows.
2. **Inspected and passed:** F2a, F4a, F4b (after fix), F4d, F5a, F5b, F6, F7, F9, F10, S2, S3, S11 (after fix), S12, dark Home, dark Map, narrow Home.
3. **Start dialog not mocked.** The four-path Start dialog (T02 §5) has no Figma frame; its layout follows T02 §5 and the existing ConfirmDialog style.
4. Shell, Home, Library, Sidebar: Home composition: Continue card layout (title row, Last explored and Next lines, button pair), the Recent grid (card size, meta order and wording), where the single primary Start a rabbit hole sits (planned after Recent; first on first visit), and the loading skeletons
5. Shell, Home, Library, Sidebar: Sidebar: nav icons (House, Library, Compass), the 'preview' tag on Explore, the Pinned heading style, Pin and Unpin in the row ⋯ menu with no menu on Pinned rows, Apps, Shared and Private collapsed for new users, and the disabled Share tooltip on canvases
6. Shell, Home, Library, Sidebar: Library: chip style and the two-row layout, the Archived chip inside the type row when Canvases is selected, the canvas row ⋯ menu and the archived list row, the 'On another device' pill in the name cell, and the 'Nothing here yet' + Start empty state
7. Shell, Home, Library, Sidebar: Explore: demo cards and their content, the Save/Saved toggle, and the sticky banner style
8. Shell, Home, Library, Sidebar: Kind labels: 'project' in the Library Type column; Project, Canvas, Job and Server chips on Home; the PenLine icon for canvases
9. Shell, Home, Library, Sidebar: Copy strings: 'Continue — on this device', 'Its content is stored only in the browser that created it.', 'Nothing here yet', 'No archived canvases.', the Archive confirmation body, the 'Archived <title>' and 'Restored <title>' toasts
10. Shell, Home, Library, Sidebar: Rule: if the user's Gate-B review of the remaining frames changes any component or flow above, update these tasks before asking for Gate C approval. No frame is treated as approved evidence here.
11. Agent Bar logic (pure modules): Copy owned here, to re-check against the Gate-B frames: choose-pill labels '<title> · <Kind>' (visible text, CONTRACT v3, Figma F6) and 'Search everything for "<text>"'; the kind labels Project, Canvas, App · job and App · server; card titles, targets and effects for the seven Ask tools and connect_repository; the private-repository error; D7_REASON (exact spec text).
12. Agent Bar logic (pure modules): Result lines: 'Canvas created · <title>' (exact contract text), 'Theme set to <theme>', 'Pinned · <title>', 'Unpinned · <title>', 'Already pinned · <title>', 'Not pinned · <title>', the run-result detail 'Run of <app>', and the Undo refusal 'This canvas has content now. Archive it from Library instead.'
13. Agent Bar logic (pure modules): Learn-hook copy: 'Adding to canvas…' (spec), 'Added to canvas.' (new; the only success line, since callers show outcome.message per CONTRACT v3), 'Still working, check the canvas' (exact spec text), the §6.4 teach fallback, the §5 Start Question fallback, and the research fallback 'Add sources from the Sources menu on the canvas.' (reused from project-map's drafted hint).
14. Agent Bar UI: Bar chrome: a full-width border-t bg-white strip (z-20) or a floating dock card; content width max-w-[780px]; full width below md. Check against 'Home with the bar' and the Home→Project→Map→Learn frames.
15. Agent Bar UI: Per-scope placeholder copy: 'Start, open, ask, or paste a link…', 'Ask about <title>…', and 'Code answers are available once the map is ready', and whether workspace and app placeholders should stop inviting asks while askLiveOnPreview is false.
16. Agent Bar UI: Scope chip style (rounded-full bg-hover h-6, × button) and the selection chip.
17. Agent Bar UI: Result sheet: default 320 px, 160 px minimum, 70 vh maximum, rounded top, header with the scope label and collapse. Where History and New chat sit (top-right inside the list), with their labels 'History', 'Back to results' and 'New chat'. Check against 'Result sheet above the bar'.
18. Agent Bar UI: The collapsed one-line result format '<label> · <first line>', and the 'N matches' and 'No matches' wording.
19. Agent Bar UI: The scope-change offer: layout and copy of "you're now viewing X · [Ask about X instead] [Keep Y]" and "Use selection: <node>?". Check against 'Scope-change warning with an unsent draft'.
20. Agent Bar UI: Streaming status 'Answering in X…' with [Stop], and its position above the input. The error block ('✗ … Your message is kept.' plus [Retry]) and "Couldn't reach the server.". Check against 'Streaming while navigating' and 'Routing/provider failure with the text preserved'.
21. Agent Bar UI: The ask-guard refusal: 'Asking about the workspace or apps is off on this preview: it would write to live chat history.' as a text-danger line in the sheet, and the same reason dimmed on /ask in the mode picker.
22. Agent Bar UI: Confirm card: the grid layout, the Blocked note in text-warn, and the copy for 'Cancelled.', 'Expired: older than 15 minutes. Ask again to redo it.', 'No longer allowed: your permission in this workspace changed.', 'Already approved.', 'This thread was deleted.' and 'Done.' with [Open]. Check against 'Confirm blocked on the preview' and 'Cancelled/expired proposal'.
23. Agent Bar UI: Results views: the empty state 'No matches.' with [Ask instead], the pill and list-row styles, and the clarification heading 'Which one do you mean?'. The pill text '<title> · <Kind>' is fixed by Figma F6 (CONTRACT v3); only its styling is pending.
24. Agent Bar UI: Mode picker: a 26 rem popover above the input, the row layout, the dimmed reason, [New canvas for this project] in the research row, the 'Auto' button, and the '/teach ×' pill. Check against 'mode picker'.
25. Agent Bar UI: 'Canvas created · <title>' with [Open] and [Undo], and the '· Undone' suffix. Check against 'Create, then Undo while untouched'.
26. Agent Bar UI: The toast stack: bottom-right, errors above notes, sitting above the bar.
27. Agent Bar UI: [Add to canvas] beside a source pill when learnHandoff flips. Its copy ('Adding to canvas…', 'Added to canvas.') now comes from learn-hook.js, not the bar.
28. Agent Bar UI: Mobile: the bar is full width below md, and the SlidePanel peek (z-30) sits above the bar (z-20). Check against 'Mobile bar and drawer'.
29. Project page, Map, Context panel, canvas route: Project header: Share (secondary, aria-disabled) with the n/a tooltip at the top right. The [⋯] menu is omitted (ponytail) because §12 gives it no items.
30. Project page, Map, Context panel, canvas route: Project Overview block order and styling: the description, the Continue card ('Continue · on this device', Last explored, Next, [Continue learning]), the Canvases list (a 'Project canvas' row, an 'On another device' Pill, [New canvas]), Start here (the top 5 files with link counts) and the Map status panel.
31. Project page, Map, Context panel, canvas route: Sources tab: the source row layout and the inline Add source form (type select arXiv/Wikipedia/YouTube, a 'Link, id or title' input, [Add]). Its status line shows learnAction's message verbatim.
32. Project page, Map, Context panel, canvas route: Map: the 'Loading the map…' line while the snapshot loads. The Graph/Files toggle is kept as today.
33. Project page, Map, Context panel, canvas route: Context panel: the header (pill tabs Results/Selected/Source versus underline tabs), the empty Results copy 'Ask in the bar below. Answers about this page appear here.', and the Selected layout (solid and dashed swatches, the confidence label on the right).
34. Project page, Map, Context panel, canvas route: Mobile drawer (T03 extra state 3): a 'Context' reopen pill at the bottom right above the bar, 55vh height, a ChevronDown close.
35. Project page, Map, Context panel, canvas route: Canvas gate (T03 extra state 11): the HardDrive icon, button order [Open project] [New canvas here], 'About local-only storage' as a <details> disclosure with its copy, and the bar hidden on the gate (ratified in CONTRACT v3).
36. Project page, Map, Context panel, canvas route: The dark --graph-* values (new design choices; the light values equal today's).
37. Project page, Map, Context panel, canvas route: The exact canvas 403 string 'This canvas is private to its owner' (no trailing period, as in §13).
38. Project page, Map, Context panel, canvas route: The dev app Graph tab: the Coaching 'Chat' tab keeps its label, and its tooltip becomes 'Results from the Agent Bar about this app appear here.' in the Rabbit Hole dev build (CoachingPanel.jsx:60).
39. Canvas record (LEARN_DB) and dev worker: Frame 7 (Create, then Undo while untouched) drives DELETE /api/apps/canvas-*: 200 only while no LEARN_DB thread exists (Task 6.1), plus the e2e Undo check (order 12.9).
40. Canvas record (LEARN_DB) and dev worker: Frame 8 (Create after editing: Archive, not Undo) drives the 405 copy 'This canvas has been used. Archive it instead.' and the archive/restore endpoints (Task 6.1).
41. Canvas record (LEARN_DB) and dev worker: Frame 11 (Canvas content not on this device, plus its Home/Library chip) drives device_id storage and validation, and canvasApp exposing device_id, which opensHere reads (Task 6.1).
42. Canvas record (LEARN_DB) and dev worker: Server copy the frames may revise: 'Untitled canvas', 'This canvas is private to its owner', 'Attachments are not available on canvases yet. Upload a PDF from the canvas menu.', 'Canvas not found in this workspace'. If Gate B changes any of these, revise Tasks 6.1-6.2 and the section 8.2 docs rows before Gate C.
43. Proposal lifecycle blockers: None for this area: it has no UI frames, and no Gate-B visual finding can change it.
44. Proposal lifecycle blockers: For the consolidated copy section only: the Slack-visible 409 texts ('already approved', 'cancelled', 'expired after 15 minutes - ask again', 'its chat was deleted') are server strings, not Figma-bound. The web card copy for these states ('Already approved.', 'This thread was deleted.') belongs to agent-ui's ConfirmCard.
45. Settings, Connections, Start dialog, e2e, deploy: Settings → Connections row design: the availability pill colours (Available green, Dev preview yellow, Planned grey), the 'Providers' heading, and the highlighted-row style for the focused provider (bg-hover plus a ring).
46. Settings, Connections, Start dialog, e2e, deploy: Settings at phone width: the nav stacked above the content at max-h-40, a 16 px inset, and SettingsRow wrapping of long descriptions.
47. Settings, Connections, Start dialog, e2e, deploy: The Planned badge (grey Pill) and the dimmed disabled controls (opacity-50) for no-op preferences and placeholder panes.
48. Settings, Connections, Start dialog, e2e, deploy: Start dialog: 520 px width at 12vh from the top, pill tabs that scroll at 390 px, radio chips for Method and Depth, the Planned tile grid (3 columns, 1 on phone), and where the ConfirmCard sits under the Repository form.
49. Settings, Connections, Start dialog, e2e, deploy: The copy and placement of the Question fallback toast, bottom-right once agent-ui moves info toasts.
50. Settings, Connections, Start dialog, e2e, deploy: The GitHub row action label '[Start from a repository]' and its soft button style next to 'Connect Slack'.

## Gate C decisions (recorded 2026-09-24)

**Gate C is approved and active** (user, 2026-09-24; conditional on Gate B, which closed the same day).

- **G1 — preview asks that would write live chat history: (b) OFF.** Workspace and app asks stay unavailable on the review clone (`askLiveOnPreview = false`). Project and canvas asks through `LEARN_DB` remain.
- **G2 — phase-1 deviations: approved selectively.** Approved: `[+]` attachment may defer; Authored-path Continue may defer; canvas rename UI may defer; canvas routes yield to Learn's composer; no empty `[⋯]` menu; `/research` unavailable until the agreed Learn hook lands. **Question → clipboard is fallback-only** while `learnHandoff === false`; once the hook lands, Question creates the canvas and prefills the Learn composer, unsent. **Shift+Enter is not deferred:** the Agent Bar gets a multiline input (Enter sends, Shift+Enter adds a line) through an opt-in `ChatComposer` prop (Task: *Multiline Agent Bar input*). Also approved (2026-09-24): Undo is required only for canvases created from the Agent Bar (Start-created canvases open Learn; removal is Archive/Restore); no branch select while GitHub names a real default, and when it names none the bar and Start dialog stop and ask for a branch link, never assuming main, master or the first branch (the worker now reports defaultBranchKnown; Task: *Gate C G2 branch rule*); source line ranges do not join the bar scope, the selected graph node stays the code-context scope.
- **G3 — no live `small-cp` promotion yet.** The four proposal lifecycle fixes are implemented and covered by control-plane unit tests; `make test-integration` runs as the pre-merge regression gate. Integration coverage of the fixes themselves needs a control-plane deploy target, which waits for the separate promotion approval. Server-backed `/do` stays Blocked.
- **G4 — coordinated; resolved upstream.** The stale "Connect Google under Settings → Connections" toast (`LearnPage.jsx:689` on `main`) is already gone on `feature/parallel-work`: its Sources menu is split into Search and Files, and Google Slides stays hidden until a connector exists (confirmed by the owner of that branch, 2026-09-24). It disappears from `main` when that branch merges. smart-home edits nothing in Learn.
- **G5 — model-backed live reads on the preview: OFF.** `find_apps_ai` and `find_runs_ai` are unavailable on the review clone, and the existing Search, Library and runs AI find skip their endpoints on dev builds (Task: *G5*). Deterministic local title and resource search stays available. This is a cost and privacy boundary even though the endpoints are read-only.

## Execution strategy

One orchestrating agent executes the tasks in order, grouped into seven work packages. After each package, a fresh reviewer inspects the package diff and its evidence (tests, deployed clone, screenshots) before the next package begins. A package that fails review is fixed before moving on.

| Package | Tasks (by number) | Scope |
|---|---|---|
| WP1 Foundation and routing | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 | flags, routes, surface and scope, catalog, connections, canvas-local, pinned, continue, and the pure command, router, ask-stream and learn-hook modules the Start dialog needs, plus G5 and the branch rule. |
| WP2 Canvas backend | 17, 18, 19, 20, 21, 22 | the announced LEARN_DB schema apply, the canvas record API, Learn resolving canvas-* with LEARN_DB chat, the apiAsk seam, dev-worker wiring, and the §16 regression pin. |
| WP3 Proposal safety | 23, 24, 25, 26, 27 | the four approval lifecycle fixes and their documented response bodies (not promoted to live, G3). |
| WP4 Home, Library, Settings and Start | 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38 | the Confirm card and bar helpers the Start dialog reuses, the Start dialog and its single host, Home, Explore, Library, Sidebar, Archived, Settings, and the first deployed pixel check. |
| WP5 Agent Bar | 39, 40, 41 | the bar frame, multiline input, and routing every send through the registry with results, confirmations and streaming. |
| WP6 Project and Map | 42, 43, 44, 45, 46, 47, 48 | graph tokens, the Context and Source inspector, the Project hub, the canvas route gate, app pages, and the bar checks on project and app pages. |
| WP7 Integration and deployed verification | 49, 50, 51, 52, 53 | the canvas API checks, the full browser journeys on the clone, pixel inspection in both themes and at 390 px, the T02 §17 record, the pre-merge integration gate, and the promotion note. |

The package order differs slightly from a pure layer split: the pure router, command, ask-stream and learn-hook modules sit in WP1 because the Start dialog in WP4 depends on them, and the Confirm card and bar helpers (task order 7.8) open WP4 for the same reason. The Agent Bar package keeps the bar UI and send routing.

## Consistency findings

The final consistency check (after three planning rounds) reported four problems. All four were fixed in the plan data before assembly:

- ResultList prop name: ContextPanel now renders `<ResultList scopeKey={key} />` (a results key), matching agent-ui; the panel therefore shows this scope's History and New chat.
- Start Question with the handoff off: the question is copied to the clipboard during the submit gesture and the line says so; if the copy fails the line says it was not transferred (T02 §17 row 8).
- T02 §17 lists the phase-1 deviations, including /research unreachable in phase 1, the Start Question clipboard fallback, no branch select, no [⋯] menu, and source ranges not joining the scope.
- Home, Sidebar and Library tasks (9.1, 9.4, 9.5) now run their new e2e labels red against the clone before implementing.
- Gate C decisions of 2026-09-24 applied: a G5 task (order 4.2) keeps model-backed live reads off on the preview; a multiline Agent Bar task (order 10.25) restores Enter sends / Shift+Enter newline; the T02 §17 table gains a Gate C column (Shift+Enter is no longer a deviation; G5 is row 12).
- Remaining G2 decisions recorded (2026-09-24): Undo only for bar-created canvases; no branch select, but never assume a branch (new task at order 4.3 makes the worker report defaultBranchKnown, because repository_jobs.py:40 substituted the first branch); source line ranges stay out of the bar scope.

## File map

| File | Action | Area | Responsibility |
|---|---|---|---|
| `docs/features/app-tabs.md` | modify | Project page, Map, Context panel, canvas route | Record D3 (dev lands on Runbook), the Context panel, and which check verifies them |
| `docs/features/coaching.md` | modify | Project page, Map, Context panel, canvas route | CLAUDE.md Coaching rule: record that the dev Chat tab shows the Context panel's Results, give its new tooltip, and say what the preview check covers now |
| `docs/features/rabbit-hole-t02-spec.md` | modify | Canvas record (LEARN_DB) and dev worker | record the implemented POST fields, the untouched-only DELETE, GET /api/canvases?archived=1, and the canvas chat history paths |
| `docs/features/web.md` | modify | Proposal lifecycle blockers | Records the new lifecycle and the exact 200/403/404/409/400 bodies with the section 7.3 card state each maps to, for the UI |
| `packages/control-plane/repository-schema.sql` | modify | Canvas record (LEARN_DB) and dev worker | canvases table (T02 section 8.1 with device_id); LEARN_DB only; applied to small-learn-dev in T12 prep |
| `packages/control-plane/src/canvases.js` | create | Canvas record (LEARN_DB) and dev worker | canvasApp, canvasAccess, ownerCanvases, canvasesFetch (create, get, rename, archive, restore, untouched delete, GET /api/canvases[?archived=1], learn-course stub, canvas chat history), canvasRoute, refuseCanvasAttachment |
| `packages/control-plane/src/index.js` | modify | Canvas record (LEARN_DB) and dev worker | apiAsk seam parameter: injected app, context and LEARN_DB thread store; askStream receives the seam db |
| `packages/control-plane/src/learn-board.js` | modify | Canvas record (LEARN_DB) and dev worker | authorizedBoardApp canvas-* branch that resolves from LEARN_DB |
| `packages/control-plane/src/repositories.js` | modify | Canvas record (LEARN_DB) and dev worker | export repositoryThreads so canvas history reuses it |
| `packages/control-plane/src/slack.js` | modify | Proposal lifecycle blockers | Slack Cancel calls the injected rejectHandler and shows any 409 reason as an ephemeral message |
| `packages/control-plane/test/ask-proposals.test.js` | create | Proposal lifecycle blockers | Runs the real appRow, askThreadForUser, apiAskThreadDelete, claimProposal, apiAskApprove and apiAskReject from index.js against node:sqlite. Covers cross-org, the 403 recheck, concurrency, expiry, reopen after a refusal, |
| `packages/control-plane/test/canvases.test.js` | create | Canvas record (LEARN_DB) and dev worker | schema re-apply test; CRUD, archive, archived list (owner only), untouched delete; history; routing; attachment refusal; authorizedBoardApp canvas branch; dev-worker wiring source test. Uses SQLite LEARN_DB and a live DB |
| `packages/control-plane/test/learn-chat.test.js` | modify | Canvas record (LEARN_DB) and dev worker | no-env.DB-write test for canvas Learn asks; deps.askStream records env.DB |
| `packages/control-plane/test/repositories.test.js` | modify | Canvas record (LEARN_DB) and dev worker | T02 section 16 regression pin (a pin, not TDD) |
| `packages/control-plane/test/slack.test.js` | modify | Proposal lifecycle blockers | Cancel calls rejectHandler as the resolved actor; a stale Cancel shows an ephemeral '✗ already approved' |
| `packages/lesson-renderer/repository_jobs.py` | modify | Agent Bar logic (pure modules) | parse_refs and listing extracted; the branches response adds defaultBranchKnown (Gate C G2). |
| `packages/lesson-renderer/test_repository.py` | modify | Agent Bar logic (pure modules) | unittest for a known and an absent default branch. |
| `packages/web/dev-worker.js` | modify | Shell, Home, Library, Sidebar | Serves the SPA shell for /library and /explore |
| `packages/web/e2e/app-tabs-check.mjs` | modify | Project page, Map, Context panel, canvas route | Removed with git rm in 11.5. All 10 of its checks assert the pre-Rabbit-Hole dev page; pm/context and pm/apptabs cover the same ground in the one harness. |
| `packages/web/e2e/coaching.preview.js` | modify | Project page, Map, Context panel, canvas route | The Capture test asserts the Context region instead of the removed AskPanel History and New chat |
| `packages/web/e2e/rabbit-hole-check.mjs` | modify | Shell, Home, Library, Sidebar | The shell-home checks: sh-title, sh-routes, sh-home, sh-explore, sh-library (x2), sh-sidebar and sh-shots, all in one { } block. Nothing is declared at the harness top level, browser.close() is never added, and no second |
| `packages/web/src/App.jsx` | modify | Shell, Home, Library, Sidebar | Library changes: type and scope chips, ops columns hidden for Projects and Canvases, a 'Nothing here yet' empty state whose Start sends small:start, titleOf, the On another device pill, an Archived chip with Restore, and |
| `packages/web/src/CanvasPage.jsx` | create | Project page, Map, Context panel, canvas route | /apps/canvas-<id>: opens LearnPage when opensHere allows (storage that cannot be read counts as content, as CONTRACT v3 hasLocalContent does), otherwise shows the §8.3 gate. [New canvas here] runs executeCommand create_c |
| `packages/web/src/ChatComposer.jsx` | modify | Agent Bar UI | Opt-in multiline prop (textarea) for the Agent Bar; every other caller renders the same single-line input. |
| `packages/web/src/ContextPanel.jsx` | create | Project page, Map, Context panel, canvas route | ContextBody (Results = <ResultList resultsKey={resultsKey(scopeOf(surface))}/>, with the count from getTurns(resultsKey); Selected with extracted and inferred relationships; Source) and the default ContextPanel (the Map' |
| `packages/web/src/Home.jsx` | create | Shell, Home, Library, Sidebar | Home: Continue, Recent and one primary Start that sends small:start, plus the first-visit, loading and error states. Also the named export ExplorePreview. |
| `packages/web/src/RepositoryGraph.jsx` | modify | Project page, Map, Context panel, canvas route | Every hardcoded colour becomes a --graph-* CSS variable, set through the style prop |
| `packages/web/src/RepositoryPage.jsx` | modify | Project page, Map, Context panel, canvas route | Overview, Learn, Map and Sources tabs with ?tab aliases. Overview holds the description, Continue (readContinue with the catalog ARRAY), Canvases with an 'On another device' chip and [New canvas] (executeCommand create_c |
| `packages/web/src/Search.jsx` | modify | Agent Bar logic (pure modules) | G5: skip /api/apps/find on dev builds (aiFindAllowed); name and runbook matching unchanged. |
| `packages/web/src/SharePage.jsx` | modify | Shell, Home, Library, Sidebar | Imports learnPreview from flags.js. The only SharePage flags edit in the whole plan (contract v3 single owner, order 1); project-map does not repeat it. |
| `packages/web/src/Shell.jsx` | modify | Agent Bar UI | Patch { org, email, orgName, catalog: data.apps } once per load, and publish the sidebar edge --sidebar-w, both behind learnPreview |
| `packages/web/src/Sidebar.jsx` | modify | Shell, Home, Library, Sidebar | Home, Library and Explore nav; a flat Pinned section; Pin and Unpin; Recent hidden in the preview; the Apps label goes to /library; sections collapsed for new users; titleOf; canvas rows get no live-app actions |
| `packages/web/src/StartDialog.jsx` | create | Settings, Connections, Start dialog, e2e, deploy | The UI-only, portaled Start dialog with four tabs and props { ctx, initial, onClose }. It uses prepareCommand/executeCommand and the shared ConfirmCard for connect_repository, executeCommand('create_canvas', {title, open |
| `packages/web/src/agent/AgentBar.jsx` | create | Agent Bar UI | The one bar. 10.2: visibility (surface.barHidden), position, per-scope drafts, retarget offer, chip ×, placeholder, askBody ask refused in workspace and app scope while askLiveOnPreview is false, Stop, Retry, choose pill |
| `packages/web/src/agent/ConfirmCard.jsx` | create | Agent Bar UI | The §7.3 card: workspace, target, operation, params, effect. States Pending, Executing, Done, Done elsewhere, Failed, Cancelled, Expired, No longer allowed and Blocked, from cardView. |
| `packages/web/src/agent/ResultSheet.jsx` | create | Agent Bar UI | The resizable sheet above the bar. Exports ResultList({ scopeKey }) - the prop takes a results key - with History and New chat, and re-exports subscribeTurns for the Context panel. 10.3 adds the card and results branches |
| `packages/web/src/agent/StartHost.jsx` | create | Agent Bar UI | The only 'small:start' host. Renders StartDialog with ctx = ctxOf(surface) and initial = the event path. |
| `packages/web/src/agent/ask-stream.js` | create | Agent Bar logic (pure modules) | askBody and streamAsk (the ask.jsx wire protocol, the paper event, an optional multipart file). |
| `packages/web/src/agent/ask-stream.test.mjs` | create | Agent Bar logic (pure modules) | 6 tests: byte-split SSE including paper, choose, errors, multipart, the two askBody shapes. |
| `packages/web/src/agent/bar.js` | create | Agent Bar UI | Pure helpers and the in-memory result store keyed by resultsKey (org\|kind:slug): subscribeTurns({key, pushed}), applyEvent, lineOf, follow/carry/offerFor/widen (drafts per scopeKey), labelOf, placeholderFor(scope, surfa |
| `packages/web/src/agent/bar.test.mjs` | create | Agent Bar UI | 18 node:test tests, one per behaviour; the ask-guard test passes askLive explicitly, so it holds for either user decision |
| `packages/web/src/agent/catalog.js` | create | Agent Bar logic (pure modules) | titleOf (sole owner), kindLabel, lookup. |
| `packages/web/src/agent/catalog.test.mjs` | create | Agent Bar logic (pure modules) | 4 tests: titles per kind, match by repo/title/slug, exact beats substring, blank input. |
| `packages/web/src/agent/commands.js` | create | Agent Bar logic (pure modules) | ctxOf(surface, { scope }?) (the only ctx builder), COMMANDS, policy, prepareCommand, executeCommand, D7_REASON; pin and unpin in the follow-up task. |
| `packages/web/src/agent/commands.test.mjs` | create | Agent Bar logic (pure modules) | 17 tests (18 after the pin task): ctx and the frozen-scope override, risk table, D7, prepare and execute, cards, share n/a, Result shapes, canvas create and Undo, theme. |
| `packages/web/src/agent/learn-hook.js` | create | Agent Bar logic (pure modules) | sendLearnRequest, learnAction (learnHandoff branch, 12 s / 30 s), readLearnResult, ADDING. |
| `packages/web/src/agent/learn-hook.test.mjs` | create | Agent Bar logic (pure modules) | 5 tests: flag false sends nothing, write before navigate, dispatch on the Learn view, reason verbatim, timeouts on mock timers. |
| `packages/web/src/agent/router.js` | create | Agent Bar logic (pure modules) | route(): T02 §6.6 rules 1-10 and the 1 / 2-5 / 0-or-more-than-5 thresholds; rule 5 via findConnection. |
| `packages/web/src/agent/router.test.mjs` | create | Agent Bar logic (pure modules) | 11 tests: precedence, pills, GitHub detection, thresholds, rules 4-10, share on projects and canvases. |
| `packages/web/src/agent/scope.js` | create | Agent Bar logic (pure modules) | scopeOf (returns title), scopeKey, chipsFor (empty for workspace), endpointFor. |
| `packages/web/src/agent/scope.test.mjs` | create | Agent Bar logic (pure modules) | 4 tests: no chip on Home/Library/Explore, project and app chips, draft key stability, endpoint per scope. |
| `packages/web/src/agent/surface.js` | create | Agent Bar logic (pure modules) | getSurface, setSurface (page fields reset, identity kept), patchSurface, useSurface. |
| `packages/web/src/agent/surface.test.mjs` | create | Agent Bar logic (pure modules) | 2 tests: a new page starts clean and keeps identity; a patch changes only what it names. |
| `packages/web/src/coaching/CoachingPanel.jsx` | modify | Project page, Map, Context panel, canvas route | The Chat tab's tooltip names the Agent Bar in the Rabbit Hole dev build (learnPreview). It keeps today's copy everywhere else, including private BYOC coaching dev builds, where the tab still holds AskPanel. |
| `packages/web/src/composer-keys.js` | create | Agent Bar UI | composerKey(): Enter sends, Shift+Enter adds a line, nothing fires while an IME composes. |
| `packages/web/src/composer-keys.test.mjs` | create | Agent Bar UI | node:test for composerKey. |
| `packages/web/src/connections.js` | create | Settings, Connections, Start dialog, e2e, deploy | The agent-free provider catalog: CONNECTIONS, AVAILABILITY, connectionsFor({aws}), findConnection(text) for the router's rule 5, and openedNotice(tab, focus) for open_settings. Settings and the Start dialog read it too. |
| `packages/web/src/connections.test.mjs` | create | Settings, Connections, Start dialog, e2e, deploy | Tests the catalog order, AWS gating, that Planned providers claim no account, that availability is separate from account status, provider lookup and the opened notice. |
| `packages/web/src/flags.js` | create | Shell, Home, Library, Sidebar | learnPreview (the same gate as SharePage.jsx:63, written with ?.), PRODUCT, learnHandoff=false (T02 §9) and askLiveOnPreview=false (contract v3 live-D1 guard, default safe). Only this area creates it. |
| `packages/web/src/flags.test.mjs` | create | Shell, Home, Library, Sidebar | The only flags test (contract v3): learnPreview and PRODUCT under node, learnHandoff === false and askLiveOnPreview === false |
| `packages/web/src/graph-tokens.test.mjs` | create | Project page, Map, Context panel, canvas route | Source-level check: RepositoryGraph has no hex colours and no 'white', and every --graph-* token it uses exists in both :root and .dark |
| `packages/web/src/home/canvas-local.js` | create | Agent Bar logic (pure modules) | canvasKeys, hasLocalContent, deviceId, opensHere: the one reader of the canvas data stored in this browser. |
| `packages/web/src/home/canvas-local.test.mjs` | create | Agent Bar logic (pure modules) | 5 tests: Learn key names, opened vs touched, unreadable counts as content, device id, open or gate. |
| `packages/web/src/home/continue.js` | create | Shell, Home, Library, Sidebar | readRecent, recentItems, readContinue (catalog as an array), openHref, onAnotherDevice and recentCard, built on canvas-local.js and catalog.js titleOf |
| `packages/web/src/home/continue.test.mjs` | create | Shell, Home, Library, Sidebar | Checks the real Learn keys, Continue selection, Last explored and Next, corrupt blobs, the another-device flag, and the per-kind Recent cards |
| `packages/web/src/home/explore.js` | create | Shell, Home, Library, Sidebar | Explore fixtures and the saved-state store under small.preview: (it has no imports) |
| `packages/web/src/home/explore.test.mjs` | create | Shell, Home, Library, Sidebar | Checks the namespace, banner copy, toggle, junk and blocked storage, and that the module has no imports |
| `packages/web/src/home/pinned.js` | create | Shell, Home, Library, Sidebar | readPinned, togglePin (fires small:pinned), pinnedApps and secClosedInit |
| `packages/web/src/home/pinned.test.mjs` | create | Shell, Home, Library, Sidebar | Checks order and scope, the unpin toggle, junk and blocked storage, the event, pinned rows, and the new-user defaults |
| `packages/web/src/index.css` | modify | Agent Bar UI | '[data-shell-sidebar] ~ main { padding-bottom: var(--agent-bar-h, 0px) }' |
| `packages/web/src/library-filter.js` | create | Shell, Home, Library, Sidebar | TYPES, SCOPES, libraryQuery, ofType, opsView, hiddenFor, chipHref and isLearnResource |
| `packages/web/src/library-filter.test.mjs` | create | Shell, Home, Library, Sidebar | Checks the chip rules, that live never reads ?type, the ops-column defaults, chip hrefs and isLearnResource |
| `packages/web/src/main.jsx` | modify | Shell, Home, Library, Sidebar | Line 1 becomes the contract v3 import (lazy, Suspense, useEffect, useLayoutEffect, useState); later tasks only add names. The guard and dispatch go through routes.js. A useLayoutEffect sets the baseline surface on every  |
| `packages/web/src/private-auth.js` | modify | Shell, Home, Library, Sidebar | returnPath keeps /library and /explore |
| `packages/web/src/resource-pages.js` | create | Project page, Map, Context panel, canvas route | Pure helpers tested with node:test: relationshipsOf and resultsArrived (11.2, keys are bar.js resultsKey values); projectTab, topFiles, projectSurface (resource carries the polled map status) and projectCanvases (11.3);  |
| `packages/web/src/resource-pages.test.mjs` | create | Project page, Map, Context panel, canvas route | 9 node:test tests, including the resultsKey scope rule, the status in the project surface, live-build equivalence for app tabs, and the 'On another device' decision through canvas-local |
| `packages/web/src/routes.js` | create | Shell, Home, Library, Sidebar | Pure functions: canonicalPath, pageFor, sectionHref, sectionActive and baseSurfaceFor(pathname, search, from?) |
| `packages/web/src/routes.test.mjs` | create | Shell, Home, Library, Sidebar | Checks that live routing is today's, the preview routes, the sidebar label rules, the baseline places, bar visibility (every canvas route hidden) and identity carry; from order 2.5 also Root's exact inputs (a split path  |
| `packages/web/src/run.jsx` | modify | Agent Bar logic (pure modules) | G5: skip /api/runs/find on dev builds (aiFindAllowed); substring matching unchanged. |
| `packages/web/src/start.js` | create | Settings, Connections, Start dialog, e2e, deploy | Pure Start-dialog decisions: PATHS, UNTITLED, pathOr, repositoryArgs (through the bar's router rule 2), titleFromQuestion, teachPrompt, canSubmit, slugOf. |
| `packages/web/src/start.test.mjs` | create | Settings, Connections, Start dialog, e2e, deploy | Five node:test cases for start.js. |
| `packages/web/src/ui.jsx` | modify | Shell, Home, Library, Sidebar | Adds the canvas case (PenLine) to KindIcon. The toast region belongs to agent-ui. |
| `packages/web/test/private-auth.test.mjs` | modify | Shell, Home, Library, Sidebar | Adds /library, /explore and a filtered /library URL to the preserved return paths |

## Task order

| # | Order | Brief ref | Area | Task |
|---|---|---|---|---|
| 1 | 0.5 | T12 | Settings, Connections, Start dialog, e2e, deploy | Create the single e2e harness, deploy the baseline clone, and prove the loaded build, with an exact rollback (no product change) |
| 2 | 1 | T05 | Shell, Home, Library, Sidebar | Flags and route table: flags.js with learnHandoff and askLiveOnPreview; routes.js with baseSurfaceFor and the sidebar label rules; the served-path lists |
| 3 | 2 | T05 | Agent Bar logic (pure modules) | Surface store and frozen scope (agent/surface.js, agent/scope.js) |
| 4 | 2.4 | T05 | Settings, Connections, Start dialog, e2e, deploy | connections.js: the provider catalog with findConnection and openedNotice(tab, focus) |
| 5 | 2.5 | T05 | Shell, Home, Library, Sidebar | main.jsx: guard and dispatch through routes.js, the baseline surface on every path change, and the preview title - checks first |
| 6 | 3.1 | T06 | Agent Bar logic (pure modules) | Canvas local data: one pure module for keys, content, device id and the open-or-gate decision (home/canvas-local.js) |
| 7 | 3.2 | T07 | Agent Bar logic (pure modules) | Catalog: the only titleOf, kind labels and title lookup (agent/catalog.js) |
| 8 | 3.3 | T05 | Shell, Home, Library, Sidebar | The Sidebar's device-local state: home/pinned.js (pins, pinned rows, new-user section defaults) |
| 9 | 3.35 | T07 | Agent Bar logic (pure modules) | Rules router (T02 §6.6) on findConnection, with share routed for every catalog kind (agent/router.js) |
| 10 | 3.4 | T05 | Agent Bar logic (pure modules) | Ask streaming for the bar: askBody, the paper event, optional multipart file (agent/ask-stream.js) |
| 11 | 3.5 | T06 | Agent Bar logic (pure modules) | Learn hook, caller side: sendLearnRequest and learnAction behind learnHandoff (agent/learn-hook.js) |
| 12 | 3.6 | T06 | Shell, Home, Library, Sidebar | Home data model: home/continue.js, built on canvas-local.js and catalog.js titleOf |
| 13 | 4 | T05 | Agent Bar logic (pure modules) | Command registry: ctxOf, prepareCommand, executeCommand, the Result shape and the D7 guard (agent/commands.js) |
| 14 | 4.1 | T05 | Agent Bar logic (pure modules) | Pin and unpin on the device-local list (after home/pinned.js lands) |
| 15 | 4.2 | T05 | Agent Bar logic (pure modules) | G5: model-backed live reads stay off on the preview (flags.aiReadsOnPreview, the find commands, and the three existing AI find calls) |
| 16 | 4.3 | T06 | Agent Bar logic (pure modules) | Gate C G2 branch rule: the worker reports whether the default branch is real, and connect_repository stops and asks instead of assuming one |
| 17 | 5 | T12 | Canvas record (LEARN_DB) and dev worker | T12 prep: canvases table in repository-schema.sql, announce it to peers, apply it to the shared small-learn-dev with a verified command, and verify it with a sqlite_master SELECT |
| 18 | 6.1 | T06 | Canvas record (LEARN_DB) and dev worker | Owner-only canvas record API in LEARN_DB: create, get, rename, archive, restore, GET /api/canvases[?archived=1], untouched-only DELETE, learn-course stub |
| 19 | 6.2 | T06 | Canvas record (LEARN_DB) and dev worker | Learn resolves canvas-*: authorizedBoardApp branch, canvas chat history in LEARN_DB on the /api/ask/threads paths, dev routing predicate, attachment guard |
| 20 | 6.3 | T06 | Canvas record (LEARN_DB) and dev worker | apiAsk seam: canvas Learn asks are answered by the general tutor, with threads in LEARN_DB and zero env.DB access (keeps the no-env.DB-write test) |
| 21 | 6.4 | T06 | Canvas record (LEARN_DB) and dev worker | Dev worker wiring (route canvas traffic, merge owner canvases into GET /api/apps, refuse canvas attachments, pass the Learn seam), plus recording the API additions in T02 section 8.2 |
| 22 | 6.5 | T11 | Canvas record (LEARN_DB) and dev worker | REGRESSION PIN (not TDD): the T02 section 16 conditions hold for connect_repository (LEARN_DB rows only, learn-repositories-dev keys, no live mutation API) |
| 23 | 7.1 | T10 | Proposal lifecycle blockers | A5.1 Cross-org: the recheck acts only in the proposal's frozen workspace, and a failed recheck is 403 |
| 24 | 7.2 | T10 | Proposal lifecycle blockers | A5.2 One transition, once: a conditional claim with a 15-minute expiry, reopened if the tool refuses |
| 25 | 7.3 | T10 | Proposal lifecycle blockers | A5.3 Cancel is final: POST /api/ask/reject, and Slack Cancel calls it |
| 26 | 7.4 | T10 | Proposal lifecycle blockers | A5.4 Deleting a thread invalidates its open proposals |
| 27 | 7.5 | T10 | Proposal lifecycle blockers | Document the lifecycle and the exact response bodies for the UI (docs/features/web.md) |
| 28 | 7.8 | T05 | Agent Bar UI | Agent Bar pure helpers (bar.js) and ConfirmCard: results keyed by resultsKey, SSE fold, per-scope drafts, card states with the 409 statuses, modes with the askLiveOnPreview guard, Learn outcomes, History paths; the §7.3 card the Start dialog reuses |
| 29 | 8 | T06 | Settings, Connections, Start dialog, e2e, deploy | Start a rabbit hole: pure start.js, then the UI-only StartDialog on the shared registry, ConfirmCard and learnAction |
| 30 | 8.5 | T06 | Agent Bar UI | One Start dialog host in Root, and Shell publishes the workspace identity that every command ctx reads |
| 31 | 8.6 | T06 | Settings, Connections, Start dialog, e2e, deploy | Prove the Start dialog on the clone after agent-ui's StartHost lands |
| 32 | 9.1 | T06 | Shell, Home, Library, Sidebar | Home at /apps (preview): Continue, Recent, and one primary Start that sends small:start; the canvas case in KindIcon; e2e checks |
| 33 | 9.2 | T05 | Shell, Home, Library, Sidebar | Explore preview: a tested fixture store (home/explore.js) and the /explore page |
| 34 | 9.3 | T07 | Shell, Home, Library, Sidebar | Library chips: library-filter.js (tested), type and scope chips, ops columns hidden for Projects and Canvases, an empty state that sends small:start, canvas rows with the On another device pill |
| 35 | 9.4 | T05 | Shell, Home, Library, Sidebar | Sidebar: Home, Library and Explore nav; a flat Pinned section with Pin and Unpin; Recent moves to Home; collapsed defaults; titleOf rows; canvas rows get no live-app actions |
| 36 | 9.5 | T06 | Shell, Home, Library, Sidebar | Library Archived chip with Restore, and Archive with confirmation from a canvas row menu (T02 §8.4) |
| 37 | 9.8 | T05 | Settings, Connections, Start dialog, e2e, deploy | Settings reused (dev only): portal, Escape, the small:settings {tab, focus} event, Planned badges and disabled no-ops, PRODUCT copy, and Connections as a catalog |
| 38 | 9.9 | T07 | Shell, Home, Library, Sidebar | Deploy the smart-home clone, run the shell-home checks, inspect the pixels, and return the link |
| 39 | 10.2 | T05 | Agent Bar UI | Agent Bar frame: one bar in Root that follows the sidebar and pads pages; per-scope drafts with the retarget offer and chip ×; per-scope placeholder; frozen-scope ask via askBody with Stop and Retry, refused in workspace and app scope while askLiveOnPreview is false; ResultList with History and New chat; toasts bottom-right |
| 40 | 10.25 | T05 | Agent Bar UI | Multiline Agent Bar input: Enter sends, Shift+Enter adds a line (T02 §6.2, Gate C G2); the Learn dock and chats keep the single-line input |
| 41 | 10.3 | T05 | Agent Bar UI | Route every send: rules, then prepareCommand/executeCommand with ctxOf(surface, { scope }). Render Result message, notice, results as <title> · <Kind>, Undo and new thread. Confirm cards with D7 Blocked, 409 mapping and Cancel to reject. Ask proposals as cards. Mode picker and pill. /teach and research through learnAction, which navigates and words the outcome. |
| 42 | 11.1 | T09 | Project page, Map, Context panel, canvas route | Graph colours move to --graph-* tokens so the Map works in dark mode |
| 43 | 11.2 | T09 | Project page, Map, Context panel, canvas route | Context panel (Results, Selected, Source) replaces the Graph Agent input on Map and on the dev app Graph tab; the Coaching Chat tooltip follows |
| 44 | 11.3 | T08 | Project page, Map, Context panel, canvas route | Project hub: Overview, Learn, Map and Sources tabs; Learn enabled at once; Share not available; surface (with map status) published |
| 45 | 11.4 | T08 | Project page, Map, Context panel, canvas route | Canvas route: /apps/canvas-<id> opens Learn or the content-not-on-this-device gate (T02 §8.3); canvas 403 copy |
| 46 | 11.5 | T09 | Project page, Map, Context panel, canvas route | App pages: working ?tab=runbook, run and logs; dev lands on Runbook while there is no graph (D3); app surface published |
| 47 | 11.6 | T05 | Agent Bar UI | Agent Bar checks on project and app pages |
| 48 | 12.5 | T12 | Project page, Map, Context panel, canvas route | Deploy this worktree's clone, run the project-map browser checks, inspect the pixels, and return the review link |
| 49 | 12.9 | T12 | Canvas record (LEARN_DB) and dev worker | Insert canvas API checks above the shared e2e harness marker and run them against the deployed smart-home clone |
| 50 | 13 | T11 | Settings, Connections, Start dialog, e2e, deploy | Complete the e2e (J01, J02, J06, J11, J15 with a bar draft, J17 via the bar), check the harness structure and askLiveOnPreview, run everything on the clone, inspect the pixels, record web.md, and hand off the review link |
| 51 | 13.5 | T11 | Settings, Connections, Start dialog, e2e, deploy | Record the phase-1 spec deviations in T02 §17 for Gate C, with the LearnPage.jsx:689 copy as a coordination item for the Learn owners (docs only) |
| 52 | 13.8 | T12 | Settings, Connections, Start dialog, e2e, deploy | Pre-merge gate: make test-integration, run once, only after the user says go and has provided the root .env (no task copies an .env) |
| 53 | 13.9 | T10 | Proposal lifecycle blockers | Promotion note: the A5 fixes stay unpromoted until the user approves; make test-integration is settings-deploy's 13.8 gate, not run here |

---

### Task 1: Create the single e2e harness, deploy the baseline clone, and prove the loaded build, with an exact rollback (no product change)

*Area:* Settings, Connections, Start dialog, e2e, deploy · *Brief:* T12 · *Order:* 0.5

**Files:**
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: HEAD of feature/smart-home, with no dev-worker change yet, so no LEARN_DB schema is needed. C:/Users/cyudhist/Desktop/workspace/small-deploy/.env for TLDRAW_LICENSE_KEY and SMALL_TEST_BYPASS; values are never printed.
- Produces: https://small-cp-dev-smart-home.zeroshothq.workers.dev serving this branch. The harness base that every area appends to: the helpers base, email, data, apps, repo, plain, wsLabel, wsName, check, must, open, loaded, spa, settings, startDialog, openStart, barOf and barInput, the insert marker (exactly '// ── journey checks: each area inserts its block above this line, wrapped in { } ──'), the single closing 'await browser.close();' below it, and the build check. Every run command sets SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env (no root .env is created or copied). The exact rollback command.

- [ ] **Step 1: Write the harness base with real login, fixtures, shared locators and the loaded-build check**

```js
// packages/web/e2e/rabbit-hole-check.mjs
// Rabbit Hole checks against this worktree's dev clone (T02 spec; brief §21 journeys).
// ONE harness for every area: each area inserts its block above the marker line near the end,
// wrapped in { } so helper names never collide. Blocks declare nothing at top level and never
// call browser.close(): the harness closes once, below the marker. D7: nothing here shares,
// renames, trashes or runs an app; a check that creates a canvas deletes it again. From packages/web:
//   SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env node e2e/rabbit-hole-check.mjs
// ONLY=build,J15 runs only labels that start with those prefixes. SHOTS=1 also saves screenshots.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const base = process.env.SMALL_BASE || '';
// A per-session clone only, never the shared small-cp-dev (docs/features/parallel-dev-deploys.md).
if (!/^https:[/][/]small-cp-dev-[a-z0-9-]+[.]zeroshothq[.]workers[.]dev$/.test(base)) throw new Error('SMALL_BASE must be your clone, e.g. https://small-cp-dev-smart-home.zeroshothq.workers.dev');
const env = parseEnv(readFileSync(process.env.SMALL_ENV_FILE || new URL('../../../.env', import.meta.url), 'utf8'));
if (!env.SMALL_TEST_BYPASS) throw new Error('SMALL_TEST_BYPASS missing from the env file');
const UA = { 'User-Agent': 'small-rabbit-hole-check' }; // Cloudflare 1010 refuses default script agents
const email = 'yudhisteer.chin@gmail.com';
const login = await fetch(`${base}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...UA }, body: JSON.stringify({ email, secret: env.SMALL_TEST_BYPASS }) });
if (!login.ok) throw new Error(`test session: HTTP ${login.status}`);
const { session } = await login.json();
const catalogResponse = await fetch(`${base}/api/apps`, { headers: { ...UA, Cookie: `small_session=${session}` } });
if (!catalogResponse.ok) throw new Error(`/api/apps: HTTP ${catalogResponse.status}`);
const data = await catalogResponse.json(); // { org, orgName, email, apps }
const apps = data.apps || [];
const repo = apps.find((a) => a.kind === 'repository');
const plain = apps.find((a) => a.kind === 'job' || a.kind === 'server');
// api.js:4, copied: api.js is not imported because it pulls the OIDC client in through private-auth.js.
const wsName = (org) => ((org || '').split('-')[0] || org || '').replace(/^./, (c) => c.toUpperCase());
const wsLabel = data.orgName || wsName(data.org);
console.log(`${base} · ${wsLabel} · ${apps.length} resources · project ${repo?.name || 'none'} · app ${plain?.name || 'none'}`);

const only = (process.env.ONLY || '').split(',').filter(Boolean);
const failures = [];
const check = async (label, fn) => {
  if (only.length && !only.some((p) => label.startsWith(p))) return;
  try { await fn(); console.log(`ok: ${label}`); } catch (e) { failures.push(label); console.log(`FAIL: ${label} - ${e.message.split('\n')[0]}`); }
};
const must = (cond, message) => { if (!cond) throw new Error(message); };

const browser = await chromium.launch();
// A fresh context per check: clean storage, nothing leaks between checks.
const open = async (viewport = { width: 1500, height: 950 }) => {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: 'small_session', value: session, domain: new URL(base).hostname, path: '/' }]);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  return page;
};
// Loaded = the sidebar names this workspace (Sidebar.jsx:779), so Shell has the catalog.
// 'attached' because the sidebar is display:none below md (Sidebar.jsx:733).
const loaded = async (page, path = '/apps') => {
  await page.goto(`${base}${path}`);
  await page.locator('aside').getByText(wsLabel, { exact: true }).first().waitFor({ state: 'attached', timeout: 20000 });
};
// In-app navigation exactly as navigate() does it (api.js:31-34).
const spa = (page, to) => page.evaluate((url) => { history.pushState(null, '', url); dispatchEvent(new PopStateEvent('popstate')); }, to);
// Shared locators, so every appended block means the same element by them.
const settings = (page) => page.getByRole('dialog', { name: 'Settings', exact: true });
const startDialog = (page) => page.getByRole('dialog', { name: 'Start a rabbit hole', exact: true });
const openStart = async (page, path, at = '/apps') => {
  await loaded(page, at);
  await page.evaluate((p) => window.dispatchEvent(new CustomEvent('small:start', { detail: { path: p } })), path);
  await startDialog(page).waitFor({ timeout: 10000 });
};
const barOf = (page) => page.locator('[data-agent-bar]');
const barInput = (page) => barOf(page).locator('[data-chat-composer] input');

// T12: the browser must run the bundle just built. A new version serves 15-20 s after
// wrangler returns, so poll for a minute before calling it stale.
await check('build: the browser runs the dist-dev entry script', async () => {
  const built = readFileSync(new URL('../dist-dev/index.html', import.meta.url), 'utf8').match(/[/]static[/]index-[A-Za-z0-9_-]+[.]js/)?.[0];
  must(built, 'no entry script in dist-dev/index.html; build first');
  const page = await open();
  let served;
  for (let i = 0; i < 12 && served !== built; i++) {
    if (i) await page.waitForTimeout(5000);
    await page.goto(`${base}/apps`);
    served = await page.evaluate(() => [...document.scripts].map((s) => s.src && new URL(s.src).pathname).find((p) => p?.startsWith('/static/index-')));
  }
  must(served === built, `built ${built}, the browser loaded ${served}`);
  await page.context().close();
});

// ── journey checks: each area inserts its block above this line, wrapped in { } ──

await browser.close();
if (failures.length) { console.log(`\n${failures.length} FAILURES`); process.exit(1); }
console.log('\nall checks passed');
```

- [ ] **Step 2: Run it before the clone exists. It must fail.**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=build node e2e/rabbit-hole-check.mjs
```

Expected: Exits non-zero with 'Error: test session: HTTP' and a non-2xx status, because small-cp-dev-smart-home does not exist yet (wrangler returned code 10007 on 2026-09-23).

- [ ] **Step 3: Build the dev bundle and deploy only to this session's clone. Env vars are set on the build process, the key is never printed, and bare wrangler deploy is never used.**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && key=$(node --input-type=module -e "import {readFileSync} from 'node:fs'; import {parseEnv} from 'node:util'; const key = parseEnv(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8')).TLDRAW_LICENSE_KEY; if (!key) throw new Error('Missing TLDRAW_LICENSE_KEY'); process.stdout.write(key);") && VITE_COACHING_DEV=true VITE_BYOC_DEV=true VITE_TLDRAW_LICENSE_KEY="$key" npm run build -- --outDir dist-dev && npx wrangler deploy --config wrangler.dev.jsonc --name small-cp-dev-smart-home
```

Expected: Vite prints 'built in'. Wrangler prints 'Uploaded small-cp-dev-smart-home', the URL https://small-cp-dev-smart-home.zeroshothq.workers.dev and a 'Current Version ID'. If the key lookup or the build fails, the && chain stops before any deploy. Live small-cp and the shared small-cp-dev are untouched.

- [ ] **Step 4: Verify the loaded build: a quick string compare, then the browser check**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && grep -o '/static/index-[A-Za-z0-9_-]*[.]js' dist-dev/index.html && curl -s -A small-rabbit-hole-check https://small-cp-dev-smart-home.zeroshothq.workers.dev/apps | grep -o '/static/index-[A-Za-z0-9_-]*[.]js' && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=build node e2e/rabbit-hole-check.mjs
```

Expected: The two grep lines are identical (if they differ, rollout lag: rerun after about 20 s). The script prints the fixture line, then 'ok: build: the browser runs the dist-dev entry script' and 'all checks passed'.

- [ ] **Step 5: Rollback, used only if a clone deploy breaks review. It reads the previous version id from wrangler and restores it.**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && prev=$(npx wrangler deployments list --name small-cp-dev-smart-home --config wrangler.dev.jsonc --json | node -e "let s='';process.stdin.on('data',(d)=>s+=d).on('end',()=>{const a=JSON.parse(s).sort((x,y)=>x.created_on.localeCompare(y.created_on));if(a.length<2)throw new Error('no earlier deployment to roll back to');process.stdout.write(a.at(-2).versions[0].version_id);});") && npx wrangler rollback "$prev" --name small-cp-dev-smart-home --config wrangler.dev.jsonc -m 'restore the previous smart-home clone build' -y
```

Expected: Wrangler reports the rollback to the second-newest deployment's version. After that, dist-dev on disk no longer matches the served build, so the build check FAILs by design. Fix forward and rerun the deploy step to get a verified build again.

- [ ] **Step 6: Commit the harness alone**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git add packages/web/e2e/rabbit-hole-check.mjs && git commit --only -m 'test(web): rabbit-hole-check proves the smart-home clone serves the dist-dev build' -- packages/web/e2e/rabbit-hole-check.mjs
```

Expected: make test-unit is green (web: 418 passed at the 2026-09-23 baseline). The commit contains exactly this one path.

---

### Task 2: Flags and route table: flags.js with learnHandoff and askLiveOnPreview; routes.js with baseSurfaceFor and the sidebar label rules; the served-path lists

*Area:* Shell, Home, Library, Sidebar · *Brief:* T05 · *Order:* 1

**Files:**
- `packages/web/src/flags.js`
- `packages/web/src/flags.test.mjs`
- `packages/web/src/routes.js`
- `packages/web/src/routes.test.mjs`
- `packages/web/src/SharePage.jsx`
- `packages/web/src/private-auth.js`
- `packages/web/test/private-auth.test.mjs`
- `packages/web/dev-worker.js`

**Interfaces:**
- Consumes: nothing new
- Produces: flags.js {learnPreview, PRODUCT, learnHandoff=false, askLiveOnPreview=false} and flags.test.mjs (this area is the only owner of both; settings-deploy tests connections in connections.test.mjs only); routes.js {canonicalPath(pathname, preview), pageFor(pathname, search, preview), sectionHref(s, preview), sectionActive(pathname, search, s, preview), baseSurfaceFor(pathname, search, from?)}; the dev worker serves /library and /explore; returnPath keeps them; SharePage.jsx imports learnPreview from flags.js (the only SharePage flags edit: project-map does not repeat it)

- [ ] **Step 1: Write the failing tests**

```jsx
// ===== packages/web/src/flags.test.mjs =====
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askLiveOnPreview, learnHandoff, learnPreview, PRODUCT } from './flags.js';

// Node has no Vite env, which is the live build's view: no preview, today's name.
test('outside the dev build the preview is off and the product is small', () => {
  assert.equal(learnPreview, false);
  assert.equal(PRODUCT, 'small');
});

test('the Learn handoff stays off until the PR that merges it flips it (T02 §9)', () => {
  assert.equal(learnHandoff, false);
});

test('preview asks never write live chat history until the user chooses otherwise', () => {
  assert.equal(askLiveOnPreview, false);
});

// ===== packages/web/src/routes.test.mjs =====
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseSurfaceFor, canonicalPath, pageFor, sectionActive, sectionHref } from './routes.js';

test('the live build routes exactly as today (main.jsx:57-70)', () => {
  for (const p of ['/apps', '/dash', '/members', '/chat', '/apps/counter', '/apps/counter/runs/r-1']) assert.equal(canonicalPath(p, false), null);
  for (const p of ['/', '/library', '/explore', '/home', '/apps/Bad_Slug', '/apps/a/b']) assert.equal(canonicalPath(p, false), '/apps');
  for (const [p, s] of [['/apps', ''], ['/apps', '?s=shared'], ['/apps', '?f=Team'], ['/dash', '']]) assert.deepEqual(pageFor(p, s, false), { page: 'library' });
  assert.deepEqual(pageFor('/apps/counter', '', false), { page: 'app', slug: 'counter', runId: undefined });
  assert.deepEqual(pageFor('/apps/counter/runs/r-1', '', false), { page: 'app', slug: 'counter', runId: 'r-1' });
  assert.deepEqual(pageFor('/members', '', false), { page: 'members' });
  assert.deepEqual(pageFor('/chat', '?app=counter', false), { page: 'chat' });
});

test('the preview serves Home at bare /apps and keeps filtered links on the Library (T02 §1)', () => {
  for (const p of ['/library', '/explore']) assert.equal(canonicalPath(p, true), null);
  assert.equal(canonicalPath('/home', true), '/apps');
  for (const p of ['/apps', '/dash']) assert.deepEqual(pageFor(p, '', true), { page: 'home' });
  for (const s of ['?s=shared', '?f=Team']) assert.deepEqual(pageFor('/apps', s, true), { page: 'library' });
  assert.deepEqual(pageFor('/library', '?type=projects', true), { page: 'library' });
  assert.deepEqual(pageFor('/explore', '', true), { page: 'explore' });
  assert.deepEqual(pageFor('/apps/canvas-1a2b3c4d', '', true), { page: 'app', slug: 'canvas-1a2b3c4d', runId: undefined });
});

test('sidebar section labels: live unchanged (Sidebar.jsx:714,717); the preview opens and lights the Library', () => {
  assert.equal(sectionHref(null, false), '/apps');
  assert.equal(sectionHref('shared', false), '/apps?s=shared');
  assert.equal(sectionHref(null, true), '/library');
  assert.equal(sectionHref('private', true), '/apps?s=private');
  assert.equal(sectionActive('/apps', '', null, false), true);
  assert.equal(sectionActive('/apps', '?s=shared', 'shared', false), true);
  assert.equal(sectionActive('/apps', '?s=shared', null, false), false);
  assert.equal(sectionActive('/apps', '', null, true), false);
  assert.equal(sectionActive('/library', '', null, true), true);
  assert.equal(sectionActive('/library', '?s=shared&type=projects', 'shared', true), true);
  assert.equal(sectionActive('/apps', '?s=shared', null, true), false);
});

const at = (url) => { const [p, s = ''] = url.split('?'); const b = baseSurfaceFor(p, s); return [b.place, b.barHidden]; };

test('the baseline surface names the place and hides the bar where another input owns the bottom (T02 §6.1; every canvas route, contract v3)', () => {
  assert.deepEqual(at('/apps'), ['home', false]);
  assert.deepEqual(at('/dash'), ['home', false]);
  assert.deepEqual(at('/library?type=canvases'), ['library', false]);
  assert.deepEqual(at('/apps?s=shared'), ['library', false]);
  assert.deepEqual(at('/explore'), ['explore', false]);
  assert.deepEqual(at('/apps/repo-1a2b3c4d-nanogpt'), ['project', false]);
  assert.deepEqual(at('/apps/repo-1a2b3c4d-nanogpt?tab=map'), ['project', false]);
  assert.deepEqual(at('/apps/repo-1a2b3c4d-nanogpt?tab=learn'), ['learn', true]);
  assert.deepEqual(at('/apps/counter'), ['app', false]);
  assert.deepEqual(at('/apps/counter?tab=learn'), ['learn', true]);
  assert.deepEqual(at('/apps/canvas-1a2b3c4d'), ['canvas', true]);
  assert.deepEqual(at('/apps/counter/runs/r-1'), ['run', true]);
  assert.deepEqual(at('/chat?app=counter'), ['chat', true]);
  assert.deepEqual(at('/members'), ['members', false]);
});

test('the baseline clears page state, keeps the workspace identity it is given, and invents none', () => {
  const identity = { org: 'gmail-com', email: 'a@gmail.com', orgName: 'Gmail', catalog: [{ name: 'counter' }] };
  const previous = { ...identity, place: 'project', resource: { kind: 'project', slug: 'repo-x', title: 'x' }, selected: { id: 'n1' }, barHidden: true, resultsHost: 'panel', handlers: { onGraph() {} } };
  assert.deepEqual(baseSurfaceFor('/apps/counter', '', previous),
    { ...identity, place: 'app', resource: null, selected: null, barHidden: false, resultsHost: 'sheet', handlers: {} });
  assert.deepEqual(Object.keys(baseSurfaceFor('/apps', '')).sort(), ['barHidden', 'handlers', 'place', 'resource', 'resultsHost', 'selected']);
});

// ===== packages/web/test/private-auth.test.mjs, line 18 becomes =====
  for (const path of ['/apps', '/apps/test-job?tab=logs', '/apps/test-job/runs/r_123', '/members', '/chat?app=test-job', '/library', '/explore', '/library?s=shared&type=projects']) {
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/flags.test.mjs src/routes.test.mjs test/private-auth.test.mjs
```

Expected: FAIL. flags.test.mjs and routes.test.mjs fail with ERR_MODULE_NOT_FOUND for ./flags.js and ./routes.js. In private-auth.test.mjs, 'return paths preserve Small deep links...' fails with actual '/apps', expected '/library'.

- [ ] **Step 2: Implement flags.js and routes.js; returnPath and the dev worker gain the new paths; SharePage imports learnPreview (the only SharePage flags edit in the plan)**

```jsx
// ===== packages/web/src/flags.js =====
// Rabbit Hole ships behind the dev build only (T02 D2); private BYOC never gets it.
// `?.` keeps this importable by node tests, as private-auth.js:3 already does.
export const learnPreview = import.meta.env?.VITE_COACHING_DEV === 'true' && import.meta.env?.VITE_PRIVATE_BYOC !== 'true';

// First-party product name: document title and first-party copy. Workspace names never change (T02 §2).
export const PRODUCT = learnPreview ? 'Rabbit Hole' : 'small';

// T02 §9: false until the Learn handoff (feature/parallel-work cc0cbf8) reaches main. The PR
// that merges it flips this; it is never detected at runtime, because a missing hook and a
// slow hook look the same.
export const learnHandoff = false;

// The dev clone binds the live D1 'small' (wrangler.dev.jsonc:69-72), and /api/ask writes live
// chat history. While false, the preview's workspace and app asks are unavailable; project and
// canvas asks use LEARN_DB and stay on. The user's (a)/(b) decision is pending: true only on (a).
export const askLiveOnPreview = false;

// ===== packages/web/src/routes.js =====
// Which page a URL shows, and the Agent Bar's starting surface for it (T02 §1, §6).
// No router dependency: main.jsx calls these on every render. With preview false every
// answer is today's main.jsx:57-70 and Sidebar.jsx:714,717.
const KNOWN = /^\/(apps(\/[a-z0-9-]+(\/runs\/[\w-]+)?)?|dash|members|chat)$/;
const PREVIEW_ONLY = /^\/(library|explore)$/;

// The path an unknown URL is replaced with, or null when the URL is served.
export const canonicalPath = (pathname, preview) =>
  (KNOWN.test(pathname) || (preview && PREVIEW_ONLY.test(pathname)) ? null : '/apps');

export function pageFor(pathname, search, preview) {
  const app = pathname.match(/^\/apps\/([a-z0-9-]+)(?:\/runs\/([\w-]+))?$/);
  if (app) return { page: 'app', slug: app[1], runId: app[2] };
  if (pathname === '/members' || pathname === '/chat') return { page: pathname.slice(1) };
  if (!preview) return { page: 'library' };
  if (PREVIEW_ONLY.test(pathname)) return { page: pathname.slice(1) };
  // Bare /apps (and /dash) is Home; the sidebar's ?s= and ?f= links keep the Library.
  const params = new URLSearchParams(search);
  return { page: params.has('s') || params.has('f') ? 'library' : 'home' };
}

// The sidebar's section labels. In the preview bare /apps is Home, so the Apps label
// opens the Library, and a label lights up on any Library URL with its ?s=.
export const sectionHref = (s, preview) => (s ? `/apps?s=${s}` : preview ? '/library' : '/apps');
export function sectionActive(pathname, search, s, preview) {
  const onList = preview ? pageFor(pathname, search, true).page === 'library' : pathname === '/apps';
  return onList && (new URLSearchParams(search).get('s') || null) === (s || null);
}

// Where the bar starts on each URL, before the page refines it. The resource stays null
// until a page has loaded one, so error and denied states never keep a stale scope.
// Learn, every canvas route (its content-not-on-this-device gate included), chat and run
// pages own the bottom input (T02 §6.1).
// `from` (contract v3) carries the workspace identity Shell published, so the baseline is a
// complete surface by itself; agent-core's setSurface keeps identity as well.
const IDENTITY = ['org', 'email', 'orgName', 'catalog'];
export function baseSurfaceFor(pathname, search, from = {}) {
  const at = pageFor(pathname, search, true);
  const place = at.page !== 'app' ? at.page
    : at.runId ? 'run'
    : at.slug.startsWith('canvas-') ? 'canvas'
    : new URLSearchParams(search).get('tab') === 'learn' ? 'learn'
    : at.slug.startsWith('repo-') ? 'project' : 'app';
  const identity = Object.fromEntries(IDENTITY.filter((k) => from[k] !== undefined).map((k) => [k, from[k]]));
  return { ...identity, place, resource: null, selected: null, barHidden: ['learn', 'canvas', 'chat', 'run'].includes(place), resultsHost: 'sheet', handlers: {} };
}

// ===== packages/web/src/private-auth.js, line 8 becomes =====
  return /^\/(apps(?:\/[a-z0-9-]+(?:\/runs\/[\w-]+)?)?|members|chat|library|explore)$/.test(url.pathname)

// ===== packages/web/dev-worker.js, line 137 becomes =====
    if (path === '/apps' || path === '/dash' || path === '/chat' || path === '/members' || path === '/library' || path === '/explore' || path.startsWith('/apps/')) {

// ===== packages/web/src/SharePage.jsx =====
// directly after the line `import { loadApp } from './app-data.js';` add:
import { learnPreview } from './flags.js';
// and delete this line (SharePage.jsx:63):
const learnPreview = import.meta.env.VITE_COACHING_DEV === 'true' && import.meta.env.VITE_PRIVATE_BYOC !== 'true';
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/flags.test.mjs src/routes.test.mjs test/private-auth.test.mjs && grep -c 'const learnPreview' src/SharePage.jsx
```

Expected: PASS: 16 tests (flags 3, routes 5, private-auth 8), 0 fail. The grep prints 0. (flags and routes verified in a scratch mirror on 2026-09-23: tests 8, pass 8.)

- [ ] **Step 3: Full unit suite and both builds**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && cd packages/web && npm run build && VITE_COACHING_DEV=true VITE_BYOC_DEV=true npm run build -- --outDir dist-dev
```

Expected: make test-unit exits 0, and the web suite reports fail 0 with 8 new tests (flags 3, routes 5). Vite reports 'built in' for both dist/ and dist-dev/.

- [ ] **Step 4: Commit only this task's paths**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && git add packages/web/src/flags.js packages/web/src/flags.test.mjs packages/web/src/routes.js packages/web/src/routes.test.mjs && git commit --only packages/web/src/flags.js packages/web/src/flags.test.mjs packages/web/src/routes.js packages/web/src/routes.test.mjs packages/web/src/SharePage.jsx packages/web/src/private-auth.js packages/web/test/private-auth.test.mjs packages/web/dev-worker.js -m 'feat(web): flags.js with learnHandoff and a pure route table with the Agent Bar baseline surface'
```

Expected: One commit containing exactly these 8 paths

---

### Task 3: Surface store and frozen scope (agent/surface.js, agent/scope.js)

*Area:* Agent Bar logic (pure modules) · *Brief:* T05 · *Order:* 2

**Files:**
- `packages/web/src/agent/surface.js`
- `packages/web/src/agent/surface.test.mjs`
- `packages/web/src/agent/scope.js`
- `packages/web/src/agent/scope.test.mjs`

**Interfaces:**
- Consumes: React's useSyncExternalStore (react resolves from the root node_modules). Nothing from other areas.
- Produces: getSurface, setSurface(page), patchSurface(partial), useSurface(). Surface = {place, org, email, orgName, catalog, resource, selected, barHidden, resultsHost, handlers}. setSurface resets the page fields (place, resource, selected, barHidden, resultsHost, handlers) and KEEPS identity (org, email, orgName, catalog), so main.jsx Root's baseSurfaceFor baseline never blanks the identity Shell published with patchSurface. scopeOf(surface) -> {org, kind, slug, title, selected}; scopeKey(scope) = 'org|kind:slug|selectedId'; chipsFor(scope) is [] for workspace scope; endpointFor(scope) -> {path, scope}. Lands before shell-home's main.jsx (order 2.5). CONTRACT v3: Root calls setSurface(baseSurfaceFor(pathname, search, getSurface())); the ratified third argument carries identity forward, and setSurface also keeps identity when a page omits it, so both paths give the same values. RepositoryPage (project-map) calls patchSurface({ resource: { ...resource, status } }) on every poll; scopeOf reads only kind, slug and title from resource, so a status change never changes the scope, the draft key or resultsKey. scopeKey (selection included) keys drafts only; Results and their count key on agent-ui's bar.js resultsKey(scope) = org|kind:slug (selection excluded).

- [ ] **Step 1: Write the failing tests**

```js
// ===== packages/web/src/agent/surface.test.mjs =====
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSurface, patchSurface, setSurface } from './surface.js';

const IDENTITY = { org: 'gmail-com', email: 'a@gmail.com', orgName: 'Gmail', catalog: [{ name: 'repo-1a2b3c4d-nanogpt', kind: 'repository', repo: 'karpathy/nanoGPT' }] };
const NANOGPT = { place: 'project', resource: { kind: 'project', slug: 'repo-1a2b3c4d-nanogpt', title: 'karpathy/nanoGPT' } };
const SELECTED = { id: 'model_causalselfattention', label: 'CausalSelfAttention', commit: '3f2a1c9' };

// Leaving a project must not carry its selected node or Map handlers onto Home,
// and must not forget who is signed in while the next page loads.
test('a new page starts clean and keeps who is looking', () => {
  patchSurface(IDENTITY);
  setSurface({ ...NANOGPT, selected: SELECTED, barHidden: true, resultsHost: 'panel', handlers: { onGraph() {} } });
  setSurface({ place: 'home' });
  assert.deepEqual(getSurface(), { ...IDENTITY, place: 'home', resource: null, selected: null, barHidden: false, resultsHost: 'sheet', handlers: {} });
});

test('a patch changes only what it names', () => {
  patchSurface(IDENTITY);
  setSurface(NANOGPT);
  patchSurface({ selected: SELECTED });
  patchSurface({ resultsHost: 'panel' });
  assert.deepEqual(getSurface(), { ...IDENTITY, ...NANOGPT, selected: SELECTED, barHidden: false, resultsHost: 'panel', handlers: {} });
});

// ===== packages/web/src/agent/scope.test.mjs =====
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipsFor, endpointFor, scopeKey, scopeOf } from './scope.js';

const SELECTED = { id: 'model_causalselfattention', label: 'CausalSelfAttention', commit: '3f2a1c9' };
const NANOGPT = { org: 'gmail-com', resource: { kind: 'project', slug: 'repo-1a2b3c4d-nanogpt', title: 'karpathy/nanoGPT' }, selected: SELECTED };

test('Home, Library and Explore show no chip, even with a selection left over', () => {
  for (const place of ['home', 'library', 'explore']) {
    const scope = scopeOf({ place, org: 'gmail-com', resource: null, selected: SELECTED });
    assert.deepEqual(scope, { org: 'gmail-com', kind: 'workspace', slug: null, title: null, selected: null });
    assert.deepEqual(chipsFor(scope), []);
  }
});

test('a project shows its title, and a selected node as a second chip', () => {
  assert.deepEqual(scopeOf(NANOGPT), { org: 'gmail-com', kind: 'project', slug: 'repo-1a2b3c4d-nanogpt', title: 'karpathy/nanoGPT', selected: SELECTED });
  assert.deepEqual(chipsFor(scopeOf(NANOGPT)), [{ key: 'resource', label: 'karpathy/nanoGPT' }, { key: 'selected', label: 'CausalSelfAttention' }]);
  assert.deepEqual(chipsFor(scopeOf({ org: 'gmail-com', resource: { kind: 'app', slug: 'counter', title: 'counter' } })), [{ key: 'resource', label: 'counter' }]);
});

test('the draft key survives renames and new commits, and changes with the selection', () => {
  const scope = scopeOf(NANOGPT);
  assert.equal(scopeKey(scope), 'gmail-com|project:repo-1a2b3c4d-nanogpt|model_causalselfattention');
  assert.equal(scopeKey({ ...scope, title: 'nanoGPT (fork)', selected: { ...SELECTED, label: 'Attention', commit: '9e8d7c6' } }), scopeKey(scope));
  assert.notEqual(scopeKey({ ...scope, selected: null }), scopeKey(scope));
  assert.notEqual(scopeKey({ ...scope, org: 'w-reading-group' }), scopeKey(scope));
  assert.equal(scopeKey(scopeOf({ org: 'gmail-com', resource: null })), 'gmail-com|workspace:|');
});

test('workspace and app threads use /api/ask; projects and canvases use Learn', () => {
  const at = (resource) => endpointFor(scopeOf({ org: 'gmail-com', resource }));
  assert.deepEqual(at(null), { path: '/api/ask', scope: {} });
  assert.deepEqual(at({ kind: 'app', slug: 'counter', title: 'counter' }), { path: '/api/ask', scope: { app: 'counter' } });
  assert.deepEqual(at({ kind: 'project', slug: 'repo-1a2b3c4d-nanogpt', title: 'karpathy/nanoGPT' }), { path: '/api/learn/ask', scope: { app: 'repo-1a2b3c4d-nanogpt' } });
  assert.deepEqual(at({ kind: 'canvas', slug: 'canvas-0f9e8d7c', title: 'Attention deep dive' }), { path: '/api/learn/ask', scope: { app: 'canvas-0f9e8d7c' } });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/agent/surface.test.mjs src/agent/scope.test.mjs
```

Expected: ERR_MODULE_NOT_FOUND for the module under test. Output shows tests 2, pass 0, fail 2 (verified in the scratch mirror).

- [ ] **Step 3: Implement surface.js and scope.js**

```js
// ===== packages/web/src/agent/surface.js =====
import { useSyncExternalStore } from 'react';

// Where the user is (T02 §6). main.jsx Root sets the route baseline, the page refines it,
// and Shell publishes who is looking. Every command ctx is built from it (commands.js ctxOf).
const PAGE = { place: 'home', resource: null, selected: null, barHidden: false, resultsHost: 'sheet', handlers: {} };
let surface = { org: '', email: '', orgName: '', catalog: [], ...PAGE };
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());

export const getSurface = () => surface;

// A new page starts clean, so one page's selection and handlers never reach the next.
// Identity belongs to the session, not the page: it stays until Shell patches it again.
export function setSurface(page) {
  const { org, email, orgName, catalog } = surface;
  surface = { org, email, orgName, catalog, ...PAGE, ...page };
  emit();
}

export function patchSurface(partial) {
  surface = { ...surface, ...partial };
  emit();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const useSurface = () => useSyncExternalStore(subscribe, getSurface);

// ===== packages/web/src/agent/scope.js =====
// Where a message goes and which thread it joins. The bar freezes this at Send
// (T02 §6.3); nothing here reads the live page.
export function scopeOf(surface) {
  const resource = surface.resource;
  if (!resource) return { org: surface.org, kind: 'workspace', slug: null, title: null, selected: null };
  return { org: surface.org, kind: resource.kind, slug: resource.slug, title: resource.title || null, selected: surface.selected || null };
}

// Drafts are kept per org|kind:slug|selected. A rename or a new commit keeps the draft.
export const scopeKey = (scope) => `${scope.org}|${scope.kind}:${scope.slug || ''}|${scope.selected?.id || ''}`;

// Home, Library and Explore are places, not scope: they show no chip (T02 §6.2).
export function chipsFor(scope) {
  if (scope.kind === 'workspace') return [];
  return [{ key: 'resource', label: scope.title || scope.slug }, ...(scope.selected ? [{ key: 'selected', label: scope.selected.label }] : [])];
}

// Workspace and app threads stay on /api/ask; projects and canvases use Learn's LEARN_DB threads (T02 §6.3).
export function endpointFor(scope) {
  if (scope.kind === 'workspace') return { path: '/api/ask', scope: {} };
  return { path: scope.kind === 'app' ? '/api/ask' : '/api/learn/ask', scope: { app: scope.slug } };
}
```

- [ ] **Step 4: Run the new tests, then the full web suite**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/agent/surface.test.mjs src/agent/scope.test.mjs && npm run test:unit
```

Expected: First run: tests 6, pass 6, fail 0. Full suite: fail 0, and 6 more passes than immediately before this task (the baseline before any T04 task is 418/418, run 2026-09-23).

- [ ] **Step 5: Commit (repo rule: make test-unit first)**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git add packages/web/src/agent/surface.js packages/web/src/agent/surface.test.mjs packages/web/src/agent/scope.js packages/web/src/agent/scope.test.mjs && git commit --only -m 'feat(agent): surface store and frozen scope for the Agent Bar' -- packages/web/src/agent/surface.js packages/web/src/agent/surface.test.mjs packages/web/src/agent/scope.js packages/web/src/agent/scope.test.mjs
```

Expected: make test-unit (run.sh:99-106) passes every suite: pytest tests/unit_tests (31 at baseline), web npm run test:unit, control-plane npm test (326/326 at baseline, run 2026-09-23) and the two viz-benchmarks checks. git show --stat HEAD lists exactly these 4 files. The message has no double quotes and no Co-Authored-By line.

---

### Task 4: connections.js: the provider catalog with findConnection and openedNotice(tab, focus)

*Area:* Settings, Connections, Start dialog, e2e, deploy · *Brief:* T05 · *Order:* 2.4

**Files:**
- `packages/web/src/connections.js`
- `packages/web/src/connections.test.mjs`

**Interfaces:**
- Consumes: Nothing: connections.js is plain data with no imports. flags.test.mjs belongs to shell-home (order 1) alone, which asserts learnPreview, PRODUCT, learnHandoff and askLiveOnPreview; this area neither creates nor edits it.
- Produces: The connections.js exports CONNECTIONS, AVAILABILITY, connectionsFor({aws}), findConnection(text) and openedNotice(tab, focus). agent-core's router rule 5 and open_settings ({ notice: openedNotice(tab, focus) }) use them, as do Settings and the Start dialog. This task must land before agent-core's router task (order 3.35).

- [ ] **Step 1: Failing test**

```js
// packages/web/src/connections.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AVAILABILITY, CONNECTIONS, connectionsFor, findConnection, openedNotice } from './connections.js';

test('the catalog lists the six T02 §11 providers in order', () => {
  assert.deepEqual(CONNECTIONS.map((c) => c.id), ['github', 'slack', 'aws', 'google-slides', 'google-drive', 'notion']);
});

test('AWS appears only in builds that enable it', () => {
  assert.equal(connectionsFor({ aws: false }).some((c) => c.id === 'aws'), false);
  assert.equal(connectionsFor({ aws: true }).some((c) => c.id === 'aws'), true);
  assert.equal(connectionsFor().length, 5);
});

test('future providers are Planned and claim no account status', () => {
  for (const id of ['google-slides', 'google-drive', 'notion']) {
    assert.equal(findConnection(id).availability, 'planned');
    assert.equal(findConnection(id).account, undefined);
  }
  assert.equal(AVAILABILITY.planned, 'Planned');
});

test('availability is separate from account status, shown only where code can read it', () => {
  assert.equal(findConnection('github').availability, 'available');
  assert.match(findConnection('github').account, /No account needed for public repositories/);
  assert.equal(findConnection('slack').account, undefined); // no status read exists (Sidebar.jsx:137-142)
});

test('provider names typed in the bar resolve to rows', () => {
  assert.equal(findConnection('Google Slides').id, 'google-slides');
  assert.equal(findConnection('google-slides').id, 'google-slides');
  assert.equal(findConnection('Google Drive').id, 'google-drive');
  assert.equal(findConnection('google docs').id, 'google-drive');
  assert.equal(findConnection('Notion').id, 'notion');
  assert.equal(findConnection('  GitHub ').id, 'github');
  assert.equal(findConnection('dropbox'), null);
  assert.equal(findConnection(''), null);
});

test('the notice says where Settings opened, and that a planned provider was not connected', () => {
  assert.equal(openedNotice('connections', 'google-slides'), 'Opened Settings → Connections. Google Slides is planned; nothing was connected.');
  assert.equal(openedNotice('connections', 'slack'), 'Opened Settings → Connections.');
  assert.equal(openedNotice('connections'), 'Opened Settings → Connections.');
  assert.equal(openedNotice('preferences'), 'Opened Settings → Preferences.');
  assert.equal(openedNotice(), 'Opened Settings.');
});
```

- [ ] **Step 2: Run it**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/connections.test.mjs
```

Expected: Fails with ERR_MODULE_NOT_FOUND for ./connections.js. Exit code 1.

- [ ] **Step 3: Minimal implementation**

```js
// packages/web/src/connections.js
// Settings → Connections catalog (T02 §11). Availability is product state and stays apart
// from account status, which appears only where code can read it. Plain data, no agent
// imports: Settings, the Start dialog and the bar's router all read it.
export const CONNECTIONS = [
  { id: 'github', name: 'GitHub', availability: 'available', adds: 'Understand a repository through its code, map, and Learn canvases.', account: 'No account needed for public repositories. Private repositories: Planned.' },
  { id: 'slack', name: 'Slack', availability: 'available', adds: '@small in channels, /small commands, proposals as buttons.' },
  { id: 'aws', name: 'AWS', availability: 'preview', adds: 'Run CPU jobs in your own AWS account.' },
  { id: 'google-slides', name: 'Google Slides', availability: 'planned', adds: 'Bring presentation material into a Learn canvas.' },
  { id: 'google-drive', name: 'Google Drive / Docs', availability: 'planned', adds: 'Use selected documents as learning sources.', aliases: ['google docs', 'drive', 'docs'] },
  { id: 'notion', name: 'Notion', availability: 'planned', adds: 'Use selected pages as sources for your learning project.' },
];
export const AVAILABILITY = { available: 'Available', preview: 'Dev preview', planned: 'Planned' };

// AWS exists only in builds that enable it (Sidebar.jsx:133).
export const connectionsFor = ({ aws = false } = {}) => CONNECTIONS.filter((c) => c.id !== 'aws' || aws);

// 'Google Slides', 'google-slides' or 'notion' -> its row: the bar's rule 5, connect <provider>.
export function findConnection(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  return CONNECTIONS.find((c) => c.id === t.replace(/ +/g, '-') || c.name.toLowerCase() === t || c.aliases?.includes(t)) || null;
}

// The line the bar shows after open_settings (T02 §11): where Settings opened, and never a
// connection that did not happen.
const TABS = { preferences: 'Preferences', connections: 'Connections' };
export function openedNotice(tab, focus) {
  const where = TABS[tab] ? `Opened Settings → ${TABS[tab]}.` : 'Opened Settings.';
  const c = findConnection(focus);
  return c?.availability === 'planned' ? `${where} ${c.name} is planned; nothing was connected.` : where;
}
```

- [ ] **Step 4: Green**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/connections.test.mjs
```

Expected: tests 6, pass 6, fail 0.

- [ ] **Step 5: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git add packages/web/src/connections.js packages/web/src/connections.test.mjs && git commit --only -m 'feat(web): connections.js is the provider catalog for Settings, Start and the bar' -- packages/web/src/connections.js packages/web/src/connections.test.mjs
```

Expected: make test-unit is green, with the web suite 6 higher than before this task. The commit contains exactly these 2 paths.

---

### Task 5: main.jsx: guard and dispatch through routes.js, the baseline surface on every path change, and the preview title - checks first

*Area:* Shell, Home, Library, Sidebar · *Brief:* T05 · *Order:* 2.5

**Files:**
- `packages/web/src/main.jsx`
- `packages/web/src/routes.test.mjs`
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: routes.js and flags.js (order 1); agent/surface.js getSurface, setSurface and patchSurface (agent-core, order 2); e2e/rabbit-hole-check.mjs, its marker line and the clone it deployed (settings-deploy, order 0.5)
- Produces: Root replaces the URL through canonicalPath and dispatches through pageFor. In the preview, /library and /explore render the Library until orders 9.1 and 9.2 add Home and Explore. A useLayoutEffect calls setSurface(baseSurfaceFor(pathname, search, getSurface())) on every path change, before any page's useEffect refines it. document.title is PRODUCT in the preview. main.jsx line 1 is the contract v3 line, which already names lazy and Suspense for agent-ui's StartHost (order 8.5): later tasks add names to it and never replace it, and they reuse this flags import line. The harness gains the shell-home block (wrapped in { }, above the harness marker) with sh-title and the inner line '// ── shell-home checks end: later shell-home tasks insert above this line ──'. The smart-home clone serves this wiring.

- [ ] **Step 1: Check that surface.js and the harness marker exist, and record the preview e2e baseline before editing**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && grep -nE 'export (const|function) (getSurface|setSurface|patchSurface)' src/agent/surface.js && grep -cF 'journey checks: each area inserts its block above this line, wrapped in { }' e2e/rabbit-hole-check.mjs && VITE_COACHING_DEV=true VITE_BYOC_DEV=true npm run build -- --outDir dist-dev && npx playwright test -c playwright.learn-preview.config.js --reporter=line; npx playwright test -c playwright.coaching.config.js --reporter=line
```

Expected: The first grep prints three export lines and the second prints 1. If either is short, stop: agent-core order 2 or settings-deploy order 0.5 has not landed. Record the pass and fail list of both local mocked runs as the baseline.

- [ ] **Step 2: Write the checks first: Root's inputs in routes.test.mjs, and sh-title in the harness (red against the clone)**

```jsx
// ===== packages/web/src/routes.test.mjs =====
// directly after `import assert from 'node:assert/strict';` add:
import { getSurface, patchSurface, setSurface } from './agent/surface.js';
// append at the end of the file:
// main.jsx Root keeps pathname + search in one string (main.jsx:61) and splits it on '?', so
// search arrives WITHOUT its '?'; `from` is agent-core's live surface after Shell's patch.
const rootInputs = (path) => { const [pathname, search = ''] = path.split('?'); return [pathname, search, getSurface()]; };

test('Root inputs: a split path and getSurface(); a chip click keeps who is looking and drops the old page', () => {
  const identity = { org: 'gmail-com', email: 'a@gmail.com', orgName: 'Gmail', catalog: [{ name: 'counter' }] };
  patchSurface(identity);
  setSurface({ place: 'project', resource: { kind: 'project', slug: 'repo-x', title: 'x' }, selected: { id: 'n1' }, resultsHost: 'panel', handlers: { onGraph() {} } });
  setSurface(baseSurfaceFor(...rootInputs('/library?type=canvases&s=private')));
  assert.deepEqual(getSurface(), { ...identity, place: 'library', resource: null, selected: null, barHidden: false, resultsHost: 'sheet', handlers: {} });
  for (const [path, place, hidden] of [['/apps?s=shared', 'library', false], ['/apps/counter?tab=learn', 'learn', true], ['/apps/canvas-1a2b3c4d', 'canvas', true], ['/apps/repo-1a2b3c4d-nanogpt?tab=map', 'project', false]]) {
    setSurface(baseSurfaceFor(...rootInputs(path)));
    assert.deepEqual([getSurface().place, getSurface().barHidden, getSurface().org], [place, hidden, 'gmail-com'], path);
  }
});

// ===== packages/web/e2e/rabbit-hole-check.mjs - insert directly ABOVE the harness marker line from settings-deploy order 0.5 (step 1 greps it). Instruction lines like this one are not file content, so the marker texts appear in the file exactly once. The block declares nothing at top level and never closes the browser. =====
// ── shell-home (T02 §1-4, §8.3-8.4, §11): routes, Home, Explore, Library, Sidebar ──
{
  await check('sh-title: the preview is titled Rabbit Hole and serves /library without a redirect (T02 §1)', async () => {
    const page = await open();
    await loaded(page, '/apps');
    must(await page.title() === 'Rabbit Hole', `title is ${await page.title()}`);
    await loaded(page, '/library');
    must(new URL(page.url()).pathname === '/library', `/library became ${new URL(page.url()).pathname}`);
    await page.context().close();
  });

  // ── shell-home checks end: later shell-home tasks insert above this line ──
}
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/routes.test.mjs && node --check e2e/rabbit-hole-check.mjs && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=sh-title node e2e/rabbit-hole-check.mjs
```

Expected: routes.test.mjs: tests 6, pass 6. The new case passes at once, because routes.js (order 1) and surface.js (order 2) already exist: it pins the exact inputs Root will pass, a split path whose search has no '?' plus getSurface() (verified in a scratch mirror on 2026-09-23 with agent-core's surface.js). The syntax check is silent. The harness prints 'FAIL: sh-title: ... - title is small deploy', then '1 FAILURES', and exits 1: the clone still serves the order 0.5 build, whose title comes from index.html:9. That is the red check for this task. If sh-title prints ok, stop: this wiring is already deployed and the baseline is unknown.

- [ ] **Step 3: Wire Root**

```jsx
// packages/web/src/main.jsx
// line 1 (today `import React, { useEffect, useState } from 'react';`) becomes the contract v3 line.
// lazy and Suspense are for agent-ui's StartHost (order 8.5); later tasks add names, never replace the line:
import React, { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react';
// directly after `import PrivateAuthGate from './PrivateAuthGate.jsx';` add:
import { getSurface, setSurface } from './agent/surface.js';
import { learnPreview, PRODUCT } from './flags.js';
import { baseSurfaceFor, canonicalPath, pageFor } from './routes.js';
// directly after `applyTheme(getTheme()); // before first paint - no light flash for dark users` add:
if (learnPreview) document.title = PRODUCT; // the live build keeps index.html's title

// In Root(), replace these five lines:
  // PrivateAuthGate consumes Cognito callbacks before normalizing app routes.
  // /dash aliases /apps (see the control-plane cache note). No router dep.
  if (!/^\/(apps(\/[a-z0-9-]+(\/runs\/[\w-]+)?)?|dash|members|chat)$/.test(window.location.pathname)) {
    window.history.replaceState(null, '', '/apps');
  }
// with:
  // PrivateAuthGate consumes Cognito callbacks before normalizing app routes.
  // /dash aliases /apps (see the control-plane cache note). No router dep: routes.js.
  const fixed = canonicalPath(window.location.pathname, learnPreview);
  if (fixed) window.history.replaceState(null, '', fixed);

// replace the line
  const m = path.split('?')[0].match(/^\/apps\/([a-z0-9-]+)(?:\/runs\/([\w-]+))?$/);
// with:
  const [pathname, search = ''] = path.split('?');
  const at = pageFor(pathname, search, learnPreview);
  // The Agent Bar's starting surface for this URL (T02 §6). Layout effects run before every
  // child's useEffect, so a page's own refinement always lands on top of this baseline.
  useLayoutEffect(() => {
    if (learnPreview) setSurface(baseSurfaceFor(pathname, search, getSurface()));
  }, [path]);

// replace the dispatch line
      {m ? <SharePage slug={m[1]} runId={m[2]} /> : path.split('?')[0] === '/members' ? <MembersPage /> : path.split('?')[0] === '/chat' ? <ChatPage /> : <App />}
// with:
      {at.page === 'app' ? <SharePage slug={at.slug} runId={at.runId} /> : at.page === 'members' ? <MembersPage /> : at.page === 'chat' ? <ChatPage /> : <App />}
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && cd packages/web && npm run build && VITE_COACHING_DEV=true VITE_BYOC_DEV=true npm run build -- --outDir dist-dev && npx playwright test -c playwright.learn-preview.config.js --reporter=line; npx playwright test -c playwright.coaching.config.js --reporter=line
```

Expected: make test-unit exits 0, and both builds succeed. The two mocked preview runs show the same pass and fail set as the baseline from step 1, with no new failures. Those specs open /apps/shared-counter?tab=learn|agent, which pageFor sends to SharePage exactly as before. routes.test.mjs still reports 6 of 6.

- [ ] **Step 4: Deploy to this worktree's clone only (settings-deploy order 0.5's verified command; the key is never printed and a bare wrangler deploy is never run), then turn sh-title green**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && key=$(node --input-type=module -e "import {readFileSync} from 'node:fs'; import {parseEnv} from 'node:util'; const key = parseEnv(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8')).TLDRAW_LICENSE_KEY; if (!key) throw new Error('Missing TLDRAW_LICENSE_KEY'); process.stdout.write(key);") && VITE_COACHING_DEV=true VITE_BYOC_DEV=true VITE_TLDRAW_LICENSE_KEY="$key" npm run build -- --outDir dist-dev && npx wrangler deploy --config wrangler.dev.jsonc --name small-cp-dev-smart-home && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=build,sh-title node e2e/rabbit-hole-check.mjs
```

Expected: Vite prints 'built in'. Wrangler uploads small-cp-dev-smart-home and prints a Current Version ID; record it for rollback (settings-deploy order 0.5 has the rollback command). The harness prints 'ok: build: the browser runs the dist-dev entry script', 'ok: sh-title: ...' and 'all checks passed'. The build check polls for a minute, which covers the 15-20 s rollout lag. Live small-cp and the shared small-cp-dev are untouched.

- [ ] **Step 5: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git commit --only packages/web/src/main.jsx packages/web/src/routes.test.mjs packages/web/e2e/rabbit-hole-check.mjs -m 'feat(web): main.jsx routes through routes.js, sets the baseline surface on every path change, and titles the preview'
```

Expected: make test-unit exits 0. One commit with 3 files.

---

### Task 6: Canvas local data: one pure module for keys, content, device id and the open-or-gate decision (home/canvas-local.js)

*Area:* Agent Bar logic (pure modules) · *Brief:* T06 · *Order:* 3.1

**Files:**
- `packages/web/src/home/canvas-local.js`
- `packages/web/src/home/canvas-local.test.mjs`

**Interfaces:**
- Consumes: Nothing. The storage object is passed in, so every caller (and node) can use it.
- Produces: canvasKeys({org, email, slug}) -> {base, ink, chat, sources}; hasLocalContent(storage, keys); deviceId(storage); opensHere({storage, keys, record}). Consumers: shell-home home/continue.js (must land after this task and drop its own canvasKey/onAnotherDevice; 'On another device' = !opensHere), Library rows, project-map's Project canvases list and canvas route gate, and commands.create_canvas undo (task 'Command registry'). Callers pass the ROW's org (LearnPage.jsx:143 uses app.org) and the viewer's email. CONTRACT v3 ratifies the safe reading: unreadable JSON or blocked storage counts as content, so Undo never deletes and the gate never hides what it cannot read.

- [ ] **Step 1: Write the failing tests against the real key and blob formats**

```js
// ===== packages/web/src/home/canvas-local.test.mjs =====
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canvasKeys, deviceId, hasLocalContent, opensHere } from './canvas-local.js';

const memory = (entries = {}) => { const items = new Map(Object.entries(entries)); return { getItem: (key) => (items.has(key) ? items.get(key) : null), setItem: (key, value) => items.set(key, String(value)) }; };
const KEYS = canvasKeys({ org: 'gmail-com', email: 'a@gmail.com', slug: 'canvas-0f9e8d7c' });
// What Learn writes 400 ms after a canvas opens, before anything is drawn or asked
// (AdaptiveCanvas.jsx:774, LearnPage.jsx:163).
const OPENED = { [KEYS.ink]: JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [] }), [KEYS.chat]: '[]' };

test('the keys are the ones Learn writes (LearnPage.jsx:143, :158, :169, :794)', () => {
  assert.deepEqual(KEYS, {
    base: 'small.adaptive-canvas:gmail-com:a@gmail.com:canvas-0f9e8d7c',
    ink: 'small.adaptive-canvas:gmail-com:a@gmail.com:canvas-0f9e8d7c:ink',
    chat: 'small.adaptive-canvas:gmail-com:a@gmail.com:canvas-0f9e8d7c:chat',
    sources: 'small.adaptive-canvas:gmail-com:a@gmail.com:canvas-0f9e8d7c:sources',
  });
});

test('opened but untouched is not content; one stroke, shape, item, link, block or question is', () => {
  assert.equal(hasLocalContent(memory(), KEYS), false);
  assert.equal(hasLocalContent(memory(OPENED), KEYS), false);
  for (const field of ['strokes', 'shapes', 'items', 'links', 'blocks']) {
    const ink = JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [], [field]: [{ id: 'x' }] });
    assert.equal(hasLocalContent(memory({ ...OPENED, [KEYS.ink]: ink }), KEYS), true, field);
  }
  assert.equal(hasLocalContent(memory({ ...OPENED, [KEYS.chat]: JSON.stringify([{ id: '1', question: 'why sqrt(dk)?' }]) }), KEYS), true);
});

// Undo deletes on "no content", so anything that cannot be read as empty counts as content.
test('unreadable storage, broken JSON or a changed blob shape counts as content', () => {
  assert.equal(hasLocalContent(memory({ [KEYS.ink]: 'not json' }), KEYS), true);
  assert.equal(hasLocalContent(memory({ [KEYS.ink]: '{"blocks":{"b1":{}}}' }), KEYS), true);
  assert.equal(hasLocalContent(memory({ [KEYS.chat]: '{"not":"a list"}' }), KEYS), true);
  assert.equal(hasLocalContent({ getItem() { throw new Error('SecurityError'); } }, KEYS), true);
});

test('this browser gets one device id, made on first use', () => {
  const storage = memory();
  const id = deviceId(storage);
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(storage.getItem('small.device'), id);
  assert.equal(deviceId(storage), id);
});

test('a canvas opens with local content, on the device that made it, or with no device recorded; otherwise it is gated', () => {
  const record = { name: 'canvas-0f9e8d7c', device_id: 'dev-a' };
  const on = (entries, rec = record) => opensHere({ storage: memory(entries), keys: KEYS, record: rec });
  assert.equal(on({ 'small.device': 'dev-a' }), true);
  assert.equal(on({ 'small.device': 'dev-b' }), false);
  assert.equal(on({ 'small.device': 'dev-b', ...OPENED }), false);
  assert.equal(on({ 'small.device': 'dev-b', [KEYS.chat]: '[{"question":"q"}]' }), true);
  assert.equal(on({ 'small.device': 'dev-b' }, { ...record, device_id: null }), true);
  assert.equal(on({}), false);
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/home/canvas-local.test.mjs
```

Expected: ERR_MODULE_NOT_FOUND for the module under test. Output shows tests 1, pass 0, fail 1 (verified in the scratch mirror).

- [ ] **Step 3: Implement canvas-local.js**

```js
// ===== packages/web/src/home/canvas-local.js =====
// This browser's canvas content (T02 §8.3, §8.4), read the way Learn writes it. Pure: the
// storage is passed in. Home, Library, the Project canvases list, the canvas route gate and
// create_canvas Undo all decide from here, so they cannot disagree.

// LearnPage.jsx:143 builds the base from the app's org, the viewer's email and the slug.
// Content is under :ink (the AdaptiveCanvas storageKey, :794), questions under :chat (:158),
// sources under :sources (:169).
export function canvasKeys({ org, email, slug }) {
  const base = `small.adaptive-canvas:${org}:${email}:${slug}`;
  return { base, ink: `${base}:ink`, chat: `${base}:chat`, sources: `${base}:sources` };
}

const empty = (value) => Array.isArray(value) && value.length === 0;

// Absent, or present and holding nothing. Anything unreadable counts as content, so Undo
// never deletes it and the gate never hides it.
function blank(storage, key, isBlank) {
  try {
    const raw = storage.getItem(key);
    return raw === null || isBlank(JSON.parse(raw));
  } catch {
    return false;
  }
}

// Learn writes empty arrays as soon as a canvas opens (AdaptiveCanvas.jsx:774, LearnPage.jsx:163),
// so opened is not touched: content is any stroke, shape, item, link, block or question.
export const hasLocalContent = (storage, keys) =>
  !blank(storage, keys.ink, (blob) => Object.values(blob).every(empty)) || !blank(storage, keys.chat, empty);

// An opaque id for this browser, stored with each new canvas (T02 §8.3). Not personal data.
export function deviceId(storage) {
  let id = null;
  try { id = storage.getItem('small.device'); } catch { /* blocked storage: a fresh id each call */ }
  if (!id) {
    id = crypto.randomUUID();
    try { storage.setItem('small.device', id); } catch { /* not kept */ }
  }
  return id;
}

// Learn, or "This canvas's content isn't in this browser" (T02 §8.3). A record with no
// device id predates device ids and opens as before.
export const opensHere = ({ storage, keys, record }) =>
  hasLocalContent(storage, keys) || record.device_id == null || record.device_id === deviceId(storage);
```

- [ ] **Step 4: Run the new tests, then the full web suite**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/home/canvas-local.test.mjs && npm run test:unit
```

Expected: First run: tests 5, pass 5, fail 0. Full suite: fail 0, and 5 more passes than immediately before this task (the baseline before any T04 task is 418/418, run 2026-09-23).

- [ ] **Step 5: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git add packages/web/src/home/canvas-local.js packages/web/src/home/canvas-local.test.mjs && git commit --only -m 'feat(home): canvas-local keys, content check, device id and gate decision' -- packages/web/src/home/canvas-local.js packages/web/src/home/canvas-local.test.mjs
```

Expected: make test-unit (run.sh:99-106) passes every suite: pytest tests/unit_tests (31 at baseline), web npm run test:unit, control-plane npm test (326/326 at baseline, run 2026-09-23) and the two viz-benchmarks checks. git show --stat HEAD lists exactly these 2 files. The message has no double quotes and no Co-Authored-By line.

---

### Task 7: Catalog: the only titleOf, kind labels and title lookup (agent/catalog.js)

*Area:* Agent Bar logic (pure modules) · *Brief:* T07 · *Order:* 3.2

**Files:**
- `packages/web/src/agent/catalog.js`
- `packages/web/src/agent/catalog.test.mjs`

**Interfaces:**
- Consumes: The catalog array (Shell data.apps; dev rows include kind repository and, once the canvases backend lands, kind canvas with title).
- Produces: titleOf(row) (sole owner: home/continue.js, Sidebar.jsx and App.jsx import it from here), kindLabel(kind), lookup(catalog, text) -> [{slug, title, kind}]. Must land before shell-home home/continue.js. kindLabel supplies the Kind in choose pills ('<title> · <Kind>', CONTRACT v3, Figma F6) and the detail of every search result.

- [ ] **Step 1: Write the failing test**

```js
// ===== packages/web/src/agent/catalog.test.mjs =====
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindLabel, lookup, titleOf } from './catalog.js';

const CATALOG = [
  { name: 'repo-1a2b3c4d-nanogpt', kind: 'repository', repo: 'karpathy/nanoGPT' },
  { name: 'canvas-0f9e8d7c', kind: 'canvas', title: 'Attention deep dive' },
  { name: 'counter', kind: 'server' },
  { name: 'counter-2', kind: 'server' },
  { name: 's3-log', kind: 'job' },
];

test('a project shows its repository, a canvas its title, an app its name (App.jsx:386)', () => {
  assert.deepEqual(CATALOG.map(titleOf), ['karpathy/nanoGPT', 'Attention deep dive', 'counter', 'counter-2', 's3-log']);
  assert.equal(titleOf({ name: 'canvas-1a2b3c4d', kind: 'canvas', title: '' }), 'canvas-1a2b3c4d');
  assert.deepEqual(['repository', 'canvas', 'job', 'server', undefined].map(kindLabel), ['Project', 'Canvas', 'App · job', 'App · server', 'App']);
});

test('projects match by owner/repository, canvases by title, apps by name, all by slug', () => {
  assert.deepEqual(lookup(CATALOG, 'karpathy/nanogpt'), [{ slug: 'repo-1a2b3c4d-nanogpt', title: 'karpathy/nanoGPT', kind: 'repository' }]);
  assert.deepEqual(lookup(CATALOG, 'deep dive'), [{ slug: 'canvas-0f9e8d7c', title: 'Attention deep dive', kind: 'canvas' }]);
  assert.deepEqual(lookup(CATALOG, 'canvas-0f9e'), [{ slug: 'canvas-0f9e8d7c', title: 'Attention deep dive', kind: 'canvas' }]);
});

test('an exact name wins over longer names that contain it', () => {
  assert.deepEqual(lookup(CATALOG, 'Counter').map((item) => item.slug), ['counter']);
  assert.deepEqual(lookup(CATALOG, 'count').map((item) => item.slug), ['counter', 'counter-2']);
});

test('blank text finds nothing, and so does a missing catalog', () => {
  assert.deepEqual(lookup(CATALOG, '   '), []);
  assert.deepEqual(lookup(undefined, 'counter'), []);
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/agent/catalog.test.mjs
```

Expected: ERR_MODULE_NOT_FOUND for the module under test. Output shows tests 1, pass 0, fail 1 (verified in the scratch mirror).

- [ ] **Step 3: Implement catalog.js**

```js
// ===== packages/web/src/agent/catalog.js =====
// The name the user sees: a project by owner/repository (App.jsx:386, Sidebar.jsx:616), a canvas
// by its title, an app by its name. The only titleOf: Home, Sidebar and Library import it from here.
export const titleOf = (row) => (row.kind === 'repository' ? row.repo : row.title || row.name);

// The type shown beside a title in choose pills and result lists.
const KIND = { repository: 'Project', canvas: 'Canvas', job: 'App · job', server: 'App · server' };
export const kindLabel = (kind) => KIND[kind] || 'App';

// Title and slug lookup over the loaded catalog (T02 §6.6). Canvas text stays in the
// browser and is never searched. Exact names win over names that merely contain the text.
// ponytail: substring only, so "open my attention notes" finds nothing; token matching when real phrasing needs it.
export function lookup(catalog, text) {
  const q = String(text || '').trim().toLowerCase();
  if (!q) return [];
  const items = (catalog || []).map((row) => ({ slug: row.name, title: titleOf(row), kind: row.kind }));
  const exact = items.filter((item) => item.slug.toLowerCase() === q || item.title.toLowerCase() === q);
  return exact.length ? exact : items.filter((item) => item.slug.toLowerCase().includes(q) || item.title.toLowerCase().includes(q));
}
```

- [ ] **Step 4: Run the new tests, then the full web suite**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/agent/catalog.test.mjs && npm run test:unit
```

Expected: First run: tests 4, pass 4, fail 0. Full suite: fail 0, and 4 more passes than immediately before this task (the baseline before any T04 task is 418/418, run 2026-09-23).

- [ ] **Step 5: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git add packages/web/src/agent/catalog.js packages/web/src/agent/catalog.test.mjs && git commit --only -m 'feat(agent): catalog titles, kind labels and lookup' -- packages/web/src/agent/catalog.js packages/web/src/agent/catalog.test.mjs
```

Expected: make test-unit (run.sh:99-106) passes every suite: pytest tests/unit_tests (31 at baseline), web npm run test:unit, control-plane npm test (326/326 at baseline, run 2026-09-23) and the two viz-benchmarks checks. git show --stat HEAD lists exactly these 2 files. The message has no double quotes and no Co-Authored-By line.

---

### Task 8: The Sidebar's device-local state: home/pinned.js (pins, pinned rows, new-user section defaults)

*Area:* Shell, Home, Library, Sidebar · *Brief:* T05 · *Order:* 3.3

**Files:**
- `packages/web/src/home/pinned.js`
- `packages/web/src/home/pinned.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces: readPinned(storage, org, email) -> string[]; togglePin(storage, org, email, slug) -> string[] and dispatches window event 'small:pinned'; pinnedApps(slugs, catalog) -> rows; secClosedInit(stored, preview) -> object. agent-core's pin and unpin commands (order 4.1) call togglePin; they do not reimplement it.

- [ ] **Step 1: Write the failing tests**

```js
// packages/web/src/home/pinned.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinnedApps, readPinned, secClosedInit, togglePin } from './pinned.js';

const store = (entries = {}) => { const m = new Map(Object.entries(entries)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('pins are an ordered, flat list per workspace and person (T02 §2)', () => {
  const s = store();
  assert.deepEqual(readPinned(s, 'gmail-com', 'a@gmail.com'), []);
  togglePin(s, 'gmail-com', 'a@gmail.com', 'repo-1');
  assert.deepEqual(togglePin(s, 'gmail-com', 'a@gmail.com', 'canvas-1a2b3c4d'), ['repo-1', 'canvas-1a2b3c4d']);
  assert.equal(s.getItem('small.pinned:gmail-com:a@gmail.com'), '["repo-1","canvas-1a2b3c4d"]');
  assert.deepEqual(readPinned(s, 'w-team', 'a@gmail.com'), []);
  assert.deepEqual(readPinned(s, 'gmail-com', 'b@gmail.com'), []);
});

test('pinning again unpins and keeps the rest in order', () => {
  const s = store({ 'small.pinned:gmail-com:a@gmail.com': '["a","b","c"]' });
  assert.deepEqual(togglePin(s, 'gmail-com', 'a@gmail.com', 'b'), ['a', 'c']);
  assert.deepEqual(readPinned(s, 'gmail-com', 'a@gmail.com'), ['a', 'c']);
});

test('junk or blocked storage reads as no pins and never throws', () => {
  assert.deepEqual(readPinned(store({ 'small.pinned:o:e': '{' }), 'o', 'e'), []);
  assert.deepEqual(readPinned(store({ 'small.pinned:o:e': '{"a":1}' }), 'o', 'e'), []);
  assert.deepEqual(readPinned(store({ 'small.pinned:o:e': '["a",3,null]' }), 'o', 'e'), ['a']);
  const blocked = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } };
  assert.deepEqual(readPinned(blocked, 'o', 'e'), []);
  assert.deepEqual(togglePin(blocked, 'o', 'e', 'a'), ['a']);
});

test('every change is announced once, so the sidebar re-reads whoever pinned', () => {
  const seen = [];
  globalThis.window = new EventTarget();
  try {
    window.addEventListener('small:pinned', () => seen.push('pinned'));
    togglePin(store(), 'o', 'e', 'a');
  } finally { delete globalThis.window; }
  assert.deepEqual(seen, ['pinned']);
});

test('pinned rows follow pin order; slugs missing from the catalog drop out at render', () => {
  const catalog = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];
  assert.deepEqual(pinnedApps(['c', 'gone', 'a'], catalog).map((x) => x.name), ['c', 'a']);
  assert.deepEqual(pinnedApps([], catalog), []);
});

test('new preview users start with the APPS sections collapsed; a stored choice wins; live keeps today', () => {
  assert.deepEqual(secClosedInit(null, false), {});
  assert.deepEqual(secClosedInit(null, true), { apps: true, shared: true, private: true });
  assert.deepEqual(secClosedInit('{"apps":false}', true), { apps: false });
  assert.deepEqual(secClosedInit('{"shared":true}', false), { shared: true });
});
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/home/pinned.test.mjs
```

Expected: FAIL: ERR_MODULE_NOT_FOUND for ./pinned.js

- [ ] **Step 2: Implement pinned.js**

```js
// packages/web/src/home/pinned.js
// The Sidebar's device-local lists (T02 §2). Pinned is an ordered, flat list of slugs per
// workspace and person: a canvas is never nested under its project.
const keyOf = (org, email) => `small.pinned:${org}:${email}`;

export function readPinned(storage, org, email) {
  try {
    const list = JSON.parse(storage.getItem(keyOf(org, email)) || '[]');
    return Array.isArray(list) ? list.filter((slug) => typeof slug === 'string') : [];
  } catch { return []; }
}

export function togglePin(storage, org, email, slug) {
  const list = readPinned(storage, org, email);
  const next = list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug];
  try { storage.setItem(keyOf(org, email), JSON.stringify(next)); } catch { /* blocked storage: the pin is not kept */ }
  // One event, so the sidebar re-reads whoever pinned (row menu or the Agent Bar's pin command).
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('small:pinned'));
  return next;
}

// Rows in pin order. A slug missing from the catalog drops out here but stays stored,
// so a catalog that is still loading never loses a pin.
export const pinnedApps = (slugs, catalog) => slugs.map((slug) => catalog.find((a) => a.name === slug)).filter(Boolean);

// small.secClosed: new preview users start with Apps, Shared and Private collapsed (T02 §2);
// a stored choice always wins; the live build keeps today's open default.
export const secClosedInit = (stored, preview) => JSON.parse(stored || (preview ? '{"apps":true,"shared":true,"private":true}' : '{}'));
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/home/pinned.test.mjs
```

Expected: PASS: 6 tests, 0 fail

- [ ] **Step 3: Full suite and commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git add packages/web/src/home/pinned.js packages/web/src/home/pinned.test.mjs && git commit --only packages/web/src/home/pinned.js packages/web/src/home/pinned.test.mjs -m 'feat(web): device-local flat Pinned and new-user section defaults for the sidebar'
```

Expected: make test-unit exits 0. One commit with 2 files.

---

### Task 9: Rules router (T02 §6.6) on findConnection, with share routed for every catalog kind (agent/router.js)

*Area:* Agent Bar logic (pure modules) · *Brief:* T07 · *Order:* 3.35

**Files:**
- `packages/web/src/agent/router.js`
- `packages/web/src/agent/router.test.mjs`

**Interfaces:**
- Consumes: lookup and kindLabel (catalog.js, previous task). findConnection(text) -> row with id | null from packages/web/src/connections.js (owner settings-deploy). connections.js lands at order 2.4, before this task (3.35). The test relies on its aliases: 'Google Slides' -> google-slides, 'google docs' -> google-drive, 'notion' -> notion, unknown -> null.
- Produces: route(text, {mode, catalog, scope}) -> {type:'mode', mode, text} | {type:'command', name, args} | {type:'choose', options:[{label, name, args}]} | {type:'ask', mode, text}. create_canvas args carry open:false (the bar stays put). share is routed for projects and canvases too; the share command answers with the n/a line (next tasks). CONTRACT v3: each choose option's label is its visible pill text, '<title> · <Kind>' with Kind from kindLabel (Figma F6); agent-ui renders option.label verbatim, so every pill names Project, Canvas or App (settings-deploy J06).

- [ ] **Step 1: Write the failing test**

```js
// ===== packages/web/src/agent/router.test.mjs =====
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route } from './router.js';

const CATALOG = [
  { name: 'repo-1a2b3c4d-nanogpt', kind: 'repository', repo: 'karpathy/nanoGPT' },
  { name: 'canvas-0f9e8d7c', kind: 'canvas', title: 'Attention deep dive' },
  { name: 'attention-viz', kind: 'server' },
  { name: 'counter', kind: 'server' },
  { name: 'counter-2', kind: 'server' },
  { name: 's3-log', kind: 'job' },
];
const HOME = { org: 'gmail-com', kind: 'workspace', slug: null, title: null, selected: null };
const NANOGPT = { org: 'gmail-com', kind: 'project', slug: 'repo-1a2b3c4d-nanogpt', title: 'karpathy/nanoGPT', selected: null };
const at = (text, options = {}) => route(text, { catalog: CATALOG, scope: HOME, ...options });
const connect = (repo) => ({ type: 'command', name: 'connect_repository', args: { url: `https://github.com/${repo}`, repo } });

test('rule 1: a slash mode at position 0 comes before every other rule', () => {
  assert.deepEqual(at('/teach https://github.com/karpathy/nanoGPT'), { type: 'mode', mode: 'teach', text: 'https://github.com/karpathy/nanoGPT' });
  assert.deepEqual(at('/do'), { type: 'mode', mode: 'do', text: '' });
  assert.deepEqual(at('/asking about masks'), { type: 'ask', mode: 'ask', text: '/asking about masks' });
});

test('a mode pill wins over the rules; Auto is no pill; /do still runs the rules', () => {
  assert.deepEqual(at('https://github.com/karpathy/nanoGPT', { mode: 'ask' }), { type: 'ask', mode: 'ask', text: 'https://github.com/karpathy/nanoGPT' });
  assert.deepEqual(at('open counter', { mode: 'teach' }), { type: 'ask', mode: 'teach', text: 'open counter' });
  assert.deepEqual(at('open counter', { mode: 'research' }), { type: 'ask', mode: 'research', text: 'open counter' });
  assert.deepEqual(at('https://github.com/karpathy/nanoGPT', { mode: 'auto' }), connect('karpathy/nanoGPT'));
  assert.equal(at('share counter with y@example.com', { mode: 'do' }).name, 'share');
  assert.deepEqual(at('explain the training loop', { mode: 'do' }), { type: 'ask', mode: 'ask', text: 'explain the training loop' });
});

test('rule 2: a GitHub repository URL connects it, wherever it sits in the sentence', () => {
  assert.deepEqual(at('https://github.com/karpathy/nanoGPT'), connect('karpathy/nanoGPT'));
  assert.deepEqual(at('Start a rabbit hole with https://github.com/karpathy/nanoGPT.git'), connect('karpathy/nanoGPT'));
  assert.deepEqual(at('look at http://www.github.com/karpathy/nanoGPT/tree/master/model.py.'), connect('karpathy/nanoGPT'));
  assert.deepEqual(at('what is https://github.com/karpathy/nanoGPT.'), connect('karpathy/nanoGPT'));
});

// Privacy is decided by the server's public-refs lookup, never guessed from the URL.
test('rule 2: private-looking URLs still go to connect, and credentials never leave the draft', () => {
  assert.deepEqual(at('connect github.com/acme/private-tools'), connect('acme/private-tools'));
  const tokenUrl = at('https://x-access-token:ghp_abc123@github.com/acme/secret-tools');
  assert.deepEqual(tokenUrl, connect('acme/secret-tools'));
  assert.doesNotMatch(JSON.stringify(tokenUrl), /ghp_abc123|x-access-token/);
});

test('rule 2: any other URL, a gist or a profile goes to Ask', () => {
  for (const text of ['open https://arxiv.org/abs/1706.03762', 'https://gist.github.com/karpathy/abc123', 'https://github.com/karpathy', 'see notgithub.com/a/b']) {
    assert.deepEqual(at(text), { type: 'ask', mode: 'ask', text });
  }
});

test('catalog lookup: one match acts, 2-5 ask which one, 0 or more than 5 search', () => {
  assert.deepEqual(at('open nanogpt'), { type: 'command', name: 'open_resource', args: { slug: 'repo-1a2b3c4d-nanogpt', kind: 'repository', title: 'karpathy/nanoGPT' } });
  assert.equal(at('go to counter').args.slug, 'counter');
  const which = at('show attention');
  assert.equal(which.type, 'choose');
  assert.deepEqual(which.options, [
    { label: 'Attention deep dive · Canvas', name: 'open_resource', args: { slug: 'canvas-0f9e8d7c', kind: 'canvas', title: 'Attention deep dive' } },
    { label: 'attention-viz · App · server', name: 'open_resource', args: { slug: 'attention-viz', kind: 'server', title: 'attention-viz' } },
    { label: 'Search everything for "attention"', name: 'search_resources', args: { text: 'attention' } },
  ]);
  assert.deepEqual(at('open quantum'), { type: 'command', name: 'search_resources', args: { text: 'quantum' } });
  const jobs = Array.from({ length: 6 }, (_, i) => ({ name: `job-${i}`, kind: 'job' }));
  assert.equal(route('open job', { catalog: jobs.slice(0, 5), scope: HOME }).options.length, 6);
  assert.deepEqual(route('open job', { catalog: jobs, scope: HOME }), { type: 'command', name: 'search_resources', args: { text: 'job' } });
});

test('rules 4-6 in order: find beats a settings word; connect needs a provider Connections knows', () => {
  assert.deepEqual(at('find settings'), { type: 'command', name: 'search_resources', args: { text: 'settings' } });
  assert.deepEqual(at('search for masks'), { type: 'command', name: 'search_resources', args: { text: 'masks' } });
  assert.deepEqual(at('connect Google Slides'), { type: 'command', name: 'open_settings', args: { tab: 'connections', focus: 'google-slides' } });
  assert.deepEqual(at('connect to notion'), { type: 'command', name: 'open_settings', args: { tab: 'connections', focus: 'notion' } });
  assert.deepEqual(at('connect google docs'), { type: 'command', name: 'open_settings', args: { tab: 'connections', focus: 'google-drive' } });
  assert.deepEqual(at('connect the dots in attention'), { type: 'ask', mode: 'ask', text: 'connect the dots in attention' });
  assert.deepEqual(at('Settings'), { type: 'command', name: 'open_settings', args: {} });
  assert.deepEqual(at('theme'), { type: 'command', name: 'open_settings', args: { tab: 'preferences' } });
  assert.deepEqual(at('connections'), { type: 'command', name: 'open_settings', args: { tab: 'connections' } });
  assert.deepEqual(at('open settings'), { type: 'command', name: 'open_settings', args: {} });
});

test('rule 7: pin this pins the current resource; with nothing to pin it is a question', () => {
  assert.deepEqual(at('pin this', { scope: NANOGPT }), { type: 'command', name: 'pin', args: { slug: 'repo-1a2b3c4d-nanogpt' } });
  assert.deepEqual(at('unpin s3-log'), { type: 'command', name: 'unpin', args: { slug: 's3-log' } });
  assert.deepEqual(at('pin this'), { type: 'ask', mode: 'ask', text: 'pin this' });
});

test('rule 8: a new canvas takes its title, and its project when asked from one; the bar stays put', () => {
  assert.deepEqual(at('blank canvas'), { type: 'command', name: 'create_canvas', args: { title: 'Untitled canvas', open: false } });
  assert.deepEqual(at('new canvas called Causal masks', { scope: NANOGPT }), { type: 'command', name: 'create_canvas', args: { title: 'Causal masks', project: 'repo-1a2b3c4d-nanogpt', open: false } });
});

// Projects and canvases route to share as well: the command answers that they can't be shared yet (T02 §11).
test('rules 9-10: share names anything in the catalog, run names jobs', () => {
  assert.deepEqual(at('share counter with y@example.com as editor'), { type: 'command', name: 'share', args: { app: 'counter', email: 'y@example.com', role: 'edit' } });
  assert.deepEqual(at('share counter with y@example.com'), { type: 'command', name: 'share', args: { app: 'counter', email: 'y@example.com', role: 'view' } });
  assert.deepEqual(at('share nanoGPT with y@example.com'), { type: 'command', name: 'share', args: { app: 'repo-1a2b3c4d-nanogpt', email: 'y@example.com', role: 'view' } });
  assert.deepEqual(at('share deep dive with y@example.com'), { type: 'command', name: 'share', args: { app: 'canvas-0f9e8d7c', email: 'y@example.com', role: 'view' } });
  assert.deepEqual(at('run s3-log'), { type: 'command', name: 'run', args: { app: 's3-log' } });
  assert.deepEqual(at('run counter'), { type: 'command', name: 'search_resources', args: { text: 'counter' } });
});

test('anything else is a question for Ask in the frozen scope', () => {
  assert.deepEqual(at('  explain the training loop '), { type: 'ask', mode: 'ask', text: 'explain the training loop' });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/agent/router.test.mjs
```

Expected: ERR_MODULE_NOT_FOUND for the module under test. Output shows tests 1, pass 0, fail 1 (verified in the scratch mirror).

- [ ] **Step 3: Implement router.js (no provider map: rule 5 asks connections.js)**

```js
// ===== packages/web/src/agent/router.js =====
import { findConnection } from '../connections.js';
import { kindLabel, lookup } from './catalog.js';

// RulesRouter (T02 §6.6): deterministic, first match wins, no model call. Anything
// unmatched goes to Ask in the frozen scope, whose tools come back as Confirm cards.
const SETTINGS = { settings: {}, preferences: { tab: 'preferences' }, connections: { tab: 'connections' }, theme: { tab: 'preferences' } };
// owner/repository from a GitHub URL anywhere in the text. Only those two parts are kept, so a
// pasted token or branch path never leaves the draft (parseRepository wants the bare URL, repositories.js:11-17).
const GITHUB = /(?:^|[\s(<"'])(?:https?:\/\/)?(?:[^\s/@]+@)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i;

const ask = (text, mode = 'ask') => ({ type: 'ask', mode, text });
const command = (name, args) => ({ type: 'command', name, args });

// One match acts; 2-5 ask which one; none or more than 5 open the title search.
function byName(catalog, text, make) {
  const hits = lookup(catalog, text);
  if (hits.length === 1) return { type: 'command', ...make(hits[0]) };
  if (hits.length < 2 || hits.length > 5) return command('search_resources', { text });
  return {
    type: 'choose',
    options: [
      ...hits.map((hit) => ({ label: `${hit.title} · ${kindLabel(hit.kind)}`, ...make(hit) })),
      { label: `Search everything for "${text}"`, name: 'search_resources', args: { text } },
    ],
  };
}

export function route(text, { mode = null, catalog = [], scope = null } = {}) {
  const message = String(text || '').trim();
  const pill = mode === 'auto' ? null : mode;
  if (pill && pill !== 'do') return ask(message, pill);
  // 1. A slash mode at position 0.
  const slash = !pill && message.match(/^\/(ask|teach|research|do)(?:\s+|$)/i);
  if (slash) return { type: 'mode', mode: slash[1].toLowerCase(), text: message.slice(slash[0].length) };
  // 2. A GitHub repository connects; any other URL is a question.
  const github = message.match(GITHUB);
  if (github) {
    const repo = `${github[1]}/${github[2].replace(/\.+$/, '').replace(/\.git$/i, '')}`;
    return command('connect_repository', { url: `https://github.com/${repo}`, repo });
  }
  if (/https?:\/\/\S/i.test(message)) return ask(message);
  // 3. open|go to|show <name>. A Settings word is never looked up: "open settings" opens Settings.
  let m = message.match(/^(?:open|go to|show)\s+(.+)$/i);
  if (m) {
    const name = m[1].trim();
    if (SETTINGS[name.toLowerCase()]) return command('open_settings', SETTINGS[name.toLowerCase()]);
    return byName(catalog, name, (hit) => ({ name: 'open_resource', args: { slug: hit.slug, kind: hit.kind, title: hit.title } }));
  }
  // 4. find|search <text>
  if ((m = message.match(/^(?:find|search)\s+(?:for\s+)?(.+)$/i))) return command('search_resources', { text: m[1].trim() });
  // 5. connect <provider>: only a row of the Connections catalog (connections.js); anything else is a question.
  m = message.match(/^connect\s+(?:to\s+)?(.+)$/i);
  const provider = m && findConnection(m[1]);
  if (provider) return command('open_settings', { tab: 'connections', focus: provider.id });
  // 6. settings|preferences|connections|theme
  if (SETTINGS[message.toLowerCase()]) return command('open_settings', SETTINGS[message.toLowerCase()]);
  // 7. pin|unpin this, or a name
  if ((m = message.match(/^(pin|unpin)(?:\s+(.+))?$/i))) {
    const name = m[1].toLowerCase(), target = m[2]?.trim();
    if (target && !/^(this|it)$/i.test(target)) return byName(catalog, target, (hit) => ({ name, args: { slug: hit.slug } }));
    if (scope?.slug) return command(name, { slug: scope.slug });
  }
  // 8. new canvas|blank canvas [called <title>]. From the bar it stays put (open: false);
  // asked from a project, the canvas joins it.
  if ((m = message.match(/^(?:new|blank) canvas(?:\s+called\s+(.+))?$/i))) {
    return command('create_canvas', { title: m[1]?.trim() || 'Untitled canvas', ...(scope?.kind === 'project' ? { project: scope.slug } : {}), open: false });
  }
  // 9. share <name> with <email> [as view|edit]. Projects and canvases route here too; the
  // share command answers that they can't be shared yet (T02 §11).
  if ((m = message.match(/^share\s+(.+?)\s+with\s+(\S+@\S+?)(?:\s+as\s+(view|viewer|edit|editor))?$/i))) {
    const [, name, email, as = 'view'] = m;
    const role = as.toLowerCase().startsWith('edit') ? 'edit' : 'view';
    return byName(catalog, name, (hit) => ({ name: 'share', args: { app: hit.slug, email, role } }));
  }
  // 10. run <job>
  if ((m = message.match(/^run\s+(.+)$/i))) {
    return byName(catalog.filter((row) => row.kind === 'job'), m[1].trim(), (hit) => ({ name: 'run', args: { app: hit.slug } }));
  }
  return ask(message);
}
```

- [ ] **Step 4: Run the new tests, then the full web suite**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/agent/router.test.mjs && npm run test:unit
```

Expected: First run: tests 11, pass 11, fail 0. Full suite: fail 0, and 11 more passes than immediately before this task (the baseline before any T04 task is 418/418, run 2026-09-23).

- [ ] **Step 5: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git add packages/web/src/agent/router.js packages/web/src/agent/router.test.mjs && git commit --only -m 'feat(agent): rules router for the Agent Bar' -- packages/web/src/agent/router.js packages/web/src/agent/router.test.mjs
```

Expected: make test-unit (run.sh:99-106) passes every suite: pytest tests/unit_tests (31 at baseline), web npm run test:unit, control-plane npm test (326/326 at baseline, run 2026-09-23) and the two viz-benchmarks checks. git show --stat HEAD lists exactly these 2 files. The message has no double quotes and no Co-Authored-By line.

---

### Task 10: Ask streaming for the bar: askBody, the paper event, optional multipart file (agent/ask-stream.js)

*Area:* Agent Bar logic (pure modules) · *Brief:* T05 · *Order:* 3.4

**Files:**
- `packages/web/src/agent/ask-stream.js`
- `packages/web/src/agent/ask-stream.test.mjs`

**Interfaces:**
- Consumes: endpointFor (scope.js, task order 2). wsHeaders (api.js:43).
- Produces: askBody({scope, message, threadId, model}) (the bar's ask() must build its body with this, so a Map selection sends repository_context) and streamAsk({path, body, file?, signal, onEvent}). onEvent(type, data) gets chunk, progress, graph, proposal, papers, paper, wiki, video, outline, done, error, and choose for a JSON {choose}. Unknown events are logged with console.info and dropped. signal goes to fetch, so Stop rejects with AbortError. file is optional; the bar's [+] is deferred in phase 1 (agent-ui carries that ponytail marker). No live-D1 guard here: CONTRACT v3's askLiveOnPreview guard belongs to the bar (agent-ui), which refuses a workspace or app ask on dev builds before it calls streamAsk.

- [ ] **Step 1: Write the failing test**

```js
// ===== packages/web/src/agent/ask-stream.test.mjs =====
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askBody, streamAsk } from './ask-stream.js';

globalThis.localStorage = { getItem: (key) => (key === 'small.ws' ? 'w-reading-group' : null) };
let request;
const serve = (response) => { globalThis.fetch = async (path, init) => { request = { path, init }; return response; }; };
// Every byte in its own chunk: frame boundaries and the arrow's three UTF-8 bytes split everywhere.
const byteStream = (text) => new ReadableStream({ start(controller) { for (const byte of new TextEncoder().encode(text)) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
const stream = (text) => new Response(byteStream(text), { headers: { 'Content-Type': 'text/event-stream' } });
const collect = async (options) => { const events = []; await streamAsk({ onEvent: (type, data) => events.push([type, data]), ...options }); return events; };
const NANOGPT = { org: 'gmail-com', kind: 'project', slug: 'repo-1a2b3c4d-nanogpt', title: 'karpathy/nanoGPT', selected: null };

test('frames split anywhere, even inside a character, arrive whole and in order; paper is an event', async () => {
  serve(stream([
    'event: progress\ndata: {"stage":"Reading the graph"}\n\n',
    'event: chunk\ndata: {"text":"Attention → "}\n\n',
    'event: mystery\ndata: {"x":1}\n\n',
    'event: paper\ndata: {"id":"1706.03762","title":"Attention Is All You Need"}\n\n',
    'event: chunk\ndata: {"text":"weights"}\n\n',
    'event: done\ndata: {"ok":true,"threadId":"repochat-1","commit":"3f2a1c9"}\n\n',
  ].join('')));
  const ignored = [], info = console.info;
  console.info = (_label, type) => ignored.push(type);
  const signal = new AbortController().signal;
  try {
    const events = await collect({ path: '/api/learn/ask', body: { message: 'why?' }, signal });
    assert.deepEqual(events.map(([type]) => type), ['progress', 'chunk', 'paper', 'chunk', 'done']);
    assert.equal(events.filter(([type]) => type === 'chunk').map(([, data]) => data.text).join(''), 'Attention → weights');
    assert.deepEqual(events.at(-1)[1], { ok: true, threadId: 'repochat-1', commit: '3f2a1c9' });
  } finally { console.info = info; }
  assert.deepEqual(ignored, ['mystery']);
  assert.equal(request.path, '/api/learn/ask');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.signal, signal);
  assert.deepEqual(request.init.headers, { 'Content-Type': 'application/json', 'X-Small-Workspace': 'w-reading-group' });
  assert.equal(request.init.body, '{"message":"why?"}');
});

test('an ambiguous workspace question comes back as one choose event', async () => {
  const choose = [{ app: 'yolo', hint: 'job, owner a@gmail.com' }, { app: 'yolo-v2', hint: 'job, owner a@gmail.com' }];
  serve(Response.json({ choose }));
  assert.deepEqual(await collect({ path: '/api/ask', body: {} }), [['choose', { choose }]]);
});

test('a JSON error, or a failure that is not a stream, is an error event and never silence', async () => {
  serve(Response.json({ error: 'Repository not found in this workspace' }, { status: 404 }));
  assert.deepEqual(await collect({ path: '/api/learn/ask', body: {} }), [['error', { error: 'Repository not found in this workspace' }]]);
  serve(new Response('<html>Bad gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }));
  assert.deepEqual(await collect({ path: '/api/ask', body: {} }), [['error', { error: 'HTTP 502' }]]);
});

test('an attachment rides as multipart beside the JSON body, as ask.jsx:494-498 sends it', async () => {
  serve(stream('event: done\ndata: {"ok":true,"threadId":"t-1"}\n\n'));
  const events = await collect({ path: '/api/ask', body: { message: 'sum this', scope: {} }, file: new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' }) });
  assert.deepEqual(events, [['done', { ok: true, threadId: 't-1' }]]);
  assert.deepEqual(request.init.headers, { 'X-Small-Workspace': 'w-reading-group' });
  assert.deepEqual(JSON.parse(request.init.body.get('body')), { message: 'sum this', scope: {} });
  assert.equal(request.init.body.get('file').name, 'data.csv');
});

test('a project question carries the selected node and the commit it was selected on', () => {
  const selected = { id: 'model_causalselfattention', label: 'CausalSelfAttention', commit: '3f2a1c9' };
  assert.deepEqual(askBody({ scope: { ...NANOGPT, selected }, message: 'Why the mask?', threadId: 'repochat-1' }), {
    scope: { app: 'repo-1a2b3c4d-nanogpt' },
    repository_context: { commit: '3f2a1c9', nodeId: 'model_causalselfattention', label: 'CausalSelfAttention' },
    message: 'Why the mask?', thread_id: 'repochat-1',
  });
  assert.deepEqual(askBody({ scope: NANOGPT, message: 'What is this?' }), { scope: { app: 'repo-1a2b3c4d-nanogpt' }, message: 'What is this?', thread_id: null });
});

test('workspace and app questions carry no repository context, and Auto sends no model', () => {
  assert.deepEqual(askBody({ scope: { org: 'gmail-com', kind: 'workspace', slug: null, title: null, selected: null }, message: 'What failed today?', model: 'opus-5' }),
    { scope: {}, message: 'What failed today?', thread_id: null, model: 'opus-5' });
  assert.deepEqual(askBody({ scope: { org: 'gmail-com', kind: 'app', slug: 'counter', title: 'counter', selected: null }, message: 'Is it up?' }),
    { scope: { app: 'counter' }, message: 'Is it up?', thread_id: null });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/agent/ask-stream.test.mjs
```

Expected: ERR_MODULE_NOT_FOUND for the module under test. Output shows tests 1, pass 0, fail 1 (verified in the scratch mirror).

- [ ] **Step 3: Implement ask-stream.js**

```js
// ===== packages/web/src/agent/ask-stream.js =====
import { wsHeaders } from '../api.js';
import { endpointFor } from './scope.js';

// What /api/ask and /api/learn/ask send (control-plane ask.js:362-454; ask.jsx:530-545 handles
// the same set, 'paper' at :534).
const EVENTS = new Set(['chunk', 'progress', 'graph', 'proposal', 'papers', 'paper', 'wiki', 'video', 'outline', 'done', 'error']);

// The body ask.jsx:466-485 builds for these scopes. A project question carries the selected
// node and the commit it was selected on; the server 409s a mismatched thread (repositories.js:177).
export function askBody({ scope, message, threadId = null, model = 'auto' }) {
  return {
    scope: endpointFor(scope).scope,
    ...(scope.kind === 'project' && scope.selected ? { repository_context: { commit: scope.selected.commit, nodeId: scope.selected.id, label: scope.selected.label } } : {}),
    message,
    thread_id: threadId,
    ...(model !== 'auto' ? { model } : {}),
  };
}

// One frame per blank line, one event: and one data: line each (ask.js:362).
function frames(buffer) {
  const parts = buffer.split('\n\n');
  const rest = parts.pop();
  const events = [];
  for (const part of parts) {
    const type = (part.match(/^event: (.+)$/m) || [])[1];
    const data = (part.match(/^data: (.+)$/m) || [])[1];
    if (type && data) events.push({ type, data: JSON.parse(data) });
  }
  return { events, rest };
}

// POST and stream, as ask.jsx:494-547 does. A JSON reply is {choose} or {error}; any other
// failure that is not a stream is an error, never silence. An attachment goes to /api/ask only:
// the dev worker handles /api/learn/ask as JSON (dev-worker.js:72). Abort rejects with AbortError.
export async function streamAsk({ path, body, file = null, signal, onEvent }) {
  let request;
  if (file) {
    const form = new FormData();
    form.append('body', JSON.stringify(body));
    form.append('file', file);
    request = { headers: wsHeaders(), body: form };
  } else {
    request = { headers: { 'Content-Type': 'application/json', ...wsHeaders() }, body: JSON.stringify(body) };
  }
  const response = await fetch(path, { method: 'POST', signal, ...request });
  if ((response.headers.get('Content-Type') || '').includes('json')) {
    const data = await response.json();
    return data.choose ? onEvent('choose', data) : onEvent('error', { error: data.error || `HTTP ${response.status}` });
  }
  if (!response.ok) return onEvent('error', { error: `HTTP ${response.status}` });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    const { events, rest } = frames(buffer + decoder.decode(value, { stream: true }));
    buffer = rest;
    for (const { type, data } of events) {
      if (EVENTS.has(type)) onEvent(type, data);
      else console.info('Agent Bar ignored event', type);
    }
  }
}
```

- [ ] **Step 4: Run the new tests, then the full web suite**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/agent/ask-stream.test.mjs && npm run test:unit
```

Expected: First run: tests 6, pass 6, fail 0. Full suite: fail 0, and 6 more passes than immediately before this task (the baseline before any T04 task is 418/418, run 2026-09-23).

- [ ] **Step 5: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git add packages/web/src/agent/ask-stream.js packages/web/src/agent/ask-stream.test.mjs && git commit --only -m 'feat(agent): stream Ask answers for the Agent Bar' -- packages/web/src/agent/ask-stream.js packages/web/src/agent/ask-stream.test.mjs
```

Expected: make test-unit (run.sh:99-106) passes every suite: pytest tests/unit_tests (31 at baseline), web npm run test:unit, control-plane npm test (326/326 at baseline, run 2026-09-23) and the two viz-benchmarks checks. git show --stat HEAD lists exactly these 2 files. The message has no double quotes and no Co-Authored-By line.

---

### Task 11: Learn hook, caller side: sendLearnRequest and learnAction behind learnHandoff (agent/learn-hook.js)

*Area:* Agent Bar logic (pure modules) · *Brief:* T06 · *Order:* 3.5

**Files:**
- `packages/web/src/agent/learn-hook.js`
- `packages/web/src/agent/learn-hook.test.mjs`

**Interfaces:**
- Consumes: learnHandoff from packages/web/src/flags.js (shell-home, order 1; false until the handoff merges). navigate (api.js:31-34). The receiver contract of feature/parallel-work cc0cbf8 (LearnPage.jsx take()).
- Produces: sendLearnRequest(request, {timeoutMs, win=window, storage=sessionStorage}) -> Promise<{id, kind, status:'prefilled'|'added'|'rejected'|'failed'|'timeout', reason?, resourceId?}>. learnAction(kind:'teach'|'research', payload:{app?, prompt?|source?, from?:'start'}, ctx) -> {status:'fallback', message} while learnHandoff is false (nothing sent; teach still opens Learn), else Learn's result plus message ('Still working, check the canvas' on timeout, the reason verbatim on rejected/failed, 'Added to canvas.' on added, null on prefilled). readLearnResult(id) for reconciling when the sheet reopens. ADDING = 'Adding to canvas…' for the wait. learnAction opens Learn itself whenever the request needs it (teach in both flag states; research when a request is sent) and skips it when already on that Learn view. CONTRACT v3: callers NEVER navigate after learnAction (no open_tab, no go('learn')) and never show their own success copy; they show outcome.message, which is null only for prefilled (Learn's filled composer is the feedback). Callers: the bar's /teach and research Add-to-canvas (agent-ui), Start Question with from:'start' after create_canvas {open:true} (settings-deploy), Project Sources [Add source] (project-map). None hardcodes fallback copy.

- [ ] **Step 1: Write the failing test (node:test mock timers prove the 12 s and 30 s bounds without waiting)**

```js
// ===== packages/web/src/agent/learn-hook.test.mjs =====
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnHandoff } from '../flags.js';
import { learnAction, readLearnResult } from './learn-hook.js';

const memory = () => { const items = new Map(); return { getItem: (key) => (items.has(key) ? items.get(key) : null), setItem: (key, value) => items.set(key, String(value)), removeItem: (key) => items.delete(key) }; };
// A tab at `url`. navigate() (api.js:31-34) pushes history; each push records what
// small.learn.request held at that moment, so a test can see the write came first.
function tab(url) {
  const [pathname, search = ''] = url.split('?');
  const win = Object.assign(new EventTarget(), { location: { pathname, search: search && `?${search}` }, opened: [], requests: [] });
  win.history = { pushState: (_state, _title, to) => win.opened.push({ to, request: globalThis.sessionStorage.getItem('small.learn.request') }) };
  win.addEventListener('small:learn-request', (event) => win.requests.push(event.detail));
  globalThis.window = win;
  globalThis.sessionStorage = memory();
  return win;
}
globalThis.PopStateEvent = class extends Event {};
const CTX = { scope: { org: 'gmail-com', kind: 'project', slug: 'repo-1a2b3c4d-nanogpt', title: 'karpathy/nanoGPT', selected: null } };
const answer = (win, detail) => win.dispatchEvent(new CustomEvent('small:learn-result', { detail }));

// T02 §9: false until the handoff (feature/parallel-work cc0cbf8) merges to main.
test('with learnHandoff false nothing is sent: /teach opens Learn, every path shows its fallback line', async () => {
  assert.equal(learnHandoff, false);
  const win = tab('/apps/repo-1a2b3c4d-nanogpt?tab=overview');
  assert.deepEqual(await learnAction('teach', { prompt: 'Why sqrt(dk)?' }, CTX), { status: 'fallback', message: "Opened Learn. Your prompt wasn't transferred; it's kept here." });
  assert.deepEqual(await learnAction('teach', { app: 'canvas-0f9e8d7c', prompt: 'Why sqrt(dk)?', from: 'start' }, CTX), { status: 'fallback', message: "Opened your canvas. Your question is on your clipboard: paste it into the Learn composer." });
  assert.deepEqual(await learnAction('research', { source: { kind: 'arxiv', ref: '1706.03762' } }, CTX), { status: 'fallback', message: 'Add sources from the Sources menu on the canvas.' });
  assert.deepEqual(win.opened, [{ to: '/apps/repo-1a2b3c4d-nanogpt?tab=learn', request: null }, { to: '/apps/canvas-0f9e8d7c?tab=learn', request: null }]);
  assert.equal(sessionStorage.getItem('small.learn.request'), null);
  assert.deepEqual(win.requests, []);
});

test('with the handoff on, the request is written before Learn opens, and only its own result counts', async () => {
  const win = tab('/apps/repo-1a2b3c4d-nanogpt?tab=overview');
  const pending = learnAction('teach', { prompt: 'Why sqrt(dk)?' }, CTX, { handoff: true });
  const [{ to, request }] = win.opened;
  const sent = JSON.parse(request);
  assert.equal(to, '/apps/repo-1a2b3c4d-nanogpt?tab=learn');
  assert.deepEqual(sent, { id: sent.id, kind: 'teach', app: 'repo-1a2b3c4d-nanogpt', prompt: 'Why sqrt(dk)?' });
  assert.deepEqual(win.requests, []);
  answer(win, { id: 'another-request', kind: 'teach', status: 'rejected', reason: 'not this one' });
  answer(win, { id: sent.id, kind: 'teach', status: 'prefilled' });
  assert.deepEqual(await pending, { id: sent.id, kind: 'teach', status: 'prefilled', message: null });
});

test('already on that Learn view, the request is dispatched too and nothing navigates', async () => {
  const win = tab('/apps/canvas-0f9e8d7c?tab=learn');
  const pending = learnAction('research', { app: 'canvas-0f9e8d7c', source: { kind: 'arxiv', ref: '1706.03762' } }, CTX, { handoff: true });
  const [sent] = win.requests;
  assert.deepEqual(sent, { id: sent.id, kind: 'research', app: 'canvas-0f9e8d7c', source: { kind: 'arxiv', ref: '1706.03762' } });
  assert.deepEqual(JSON.parse(sessionStorage.getItem('small.learn.request')), sent);
  assert.deepEqual(win.opened, []);
  answer(win, { id: sent.id, kind: 'research', status: 'added', resourceId: 'paper-1706.03762' });
  assert.deepEqual(await pending, { id: sent.id, kind: 'research', status: 'added', resourceId: 'paper-1706.03762', message: 'Added to canvas.' });
});

test('rejected and failed show the reason Learn gave, word for word', async () => {
  for (const [status, reason] of [['rejected', 'The Learn chat already has a draft. Send or clear it, then try again.'], ['failed', 'Search failed. Try again.']]) {
    const win = tab('/apps/repo-1a2b3c4d-nanogpt?tab=learn');
    const pending = learnAction('teach', { prompt: 'Why?' }, CTX, { handoff: true });
    answer(win, { id: win.requests[0].id, kind: 'teach', status, reason });
    assert.deepEqual([(await pending).status, (await pending).message], [status, reason]);
  }
});

test('no answer is not a failure: teach waits 12 s, research 30 s, then Still working, check the canvas', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  tab('/apps/repo-1a2b3c4d-nanogpt?tab=overview');
  let settled = false;
  const teach = learnAction('teach', { prompt: 'Why?' }, CTX, { handoff: true }).finally(() => { settled = true; });
  t.mock.timers.tick(11999);
  await new Promise(setImmediate);
  assert.equal(settled, false);
  t.mock.timers.tick(1);
  const late = await teach;
  assert.deepEqual([late.status, late.message], ['timeout', 'Still working, check the canvas']);
  // The card can still land; the bar reconciles from the stored result when the sheet reopens.
  sessionStorage.setItem(`small.learn.result:${late.id}`, JSON.stringify({ id: late.id, kind: 'teach', status: 'prefilled' }));
  assert.deepEqual(readLearnResult(late.id), { id: late.id, kind: 'teach', status: 'prefilled' });

  const research = learnAction('research', { source: { kind: 'wiki', ref: 'Attention' } }, CTX, { handoff: true });
  const { id } = JSON.parse(sessionStorage.getItem('small.learn.request'));
  t.mock.timers.tick(29999);
  sessionStorage.setItem(`small.learn.result:${id}`, JSON.stringify({ id, kind: 'research', status: 'added', resourceId: 'wiki-Attention' }));
  t.mock.timers.tick(1);
  assert.deepEqual(await research, { id, kind: 'research', status: 'added', resourceId: 'wiki-Attention', message: 'Added to canvas.' });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/agent/learn-hook.test.mjs
```

Expected: ERR_MODULE_NOT_FOUND for the module under test. Output shows tests 1, pass 0, fail 1 (verified in the scratch mirror).

- [ ] **Step 3: Implement learn-hook.js**

```js
// ===== packages/web/src/agent/learn-hook.js =====
import { navigate } from '../api.js';
import { learnHandoff } from '../flags.js';

// Learn hook, caller side (T02 §9). The receiver is LearnPage take() from feature/parallel-work
// cc0cbf8: it reads small.learn.request once on mount, listens for small:learn-request while open,
// answers each id once with small:learn-result (also kept at small.learn.result:<id>), and only
// replays a repeated id.
export const ADDING = 'Adding to canvas…';
const WAIT_MS = { teach: 12000, research: 30000 };
const FALLBACK = {
  teach: "Opened Learn. Your prompt wasn't transferred; it's kept here.",
  start: "Opened your canvas. Your question is on your clipboard: paste it into the Learn composer.",
  research: 'Add sources from the Sources menu on the canvas.',
};
const DONE = { prefilled: null, added: 'Added to canvas.', timeout: 'Still working, check the canvas' };

// A canvas always opens as Learn (routes.js); a project shows Learn on ?tab=learn.
const onLearn = (win, app) =>
  win.location.pathname === `/apps/${app}` && (app.startsWith('canvas-') || new URLSearchParams(win.location.search).get('tab') === 'learn');

export function readLearnResult(id, storage = sessionStorage) {
  try { return JSON.parse(storage.getItem(`small.learn.result:${id}`)); } catch { return null; }
}

// Resolves with Learn's result for this id, or status 'timeout'. A timeout cancels nothing:
// the card may still land, and readLearnResult(id) finds it later.
export function sendLearnRequest(request, { timeoutMs, win = window, storage = sessionStorage }) {
  return new Promise((resolve) => {
    const finish = (result) => {
      clearTimeout(timer);
      win.removeEventListener('small:learn-result', onResult);
      resolve(result);
    };
    const onResult = (event) => { if (event.detail?.id === request.id) finish(event.detail); };
    const timer = setTimeout(() => finish(readLearnResult(request.id, storage) || { id: request.id, kind: request.kind, status: 'timeout' }), timeoutMs);
    win.addEventListener('small:learn-result', onResult);
    // Stored for a Learn that mounts next, and dispatched when Learn may already be open on this
    // app. Both are safe: a repeated id only replays its result.
    try { storage.setItem('small.learn.request', JSON.stringify(request)); } catch { /* blocked storage: the event only */ }
    if (onLearn(win, request.app)) win.dispatchEvent(new CustomEvent('small:learn-request', { detail: request }));
  });
}

// The one way /teach, /research and [Add source] reach Learn. Until the handoff merges
// (flags.js learnHandoff) nothing is sent and the caller shows the fallback line.
export async function learnAction(kind, payload, ctx, { handoff = learnHandoff, win = window, storage = sessionStorage } = {}) {
  const app = payload.app || ctx.scope.slug;
  const open = () => { if (!onLearn(win, app)) navigate(`/apps/${app}?tab=learn`); };
  if (!handoff) {
    if (kind === 'teach') open();
    return { status: 'fallback', message: kind === 'teach' && payload.from === 'start' ? FALLBACK.start : FALLBACK[kind] };
  }
  const request = { id: crypto.randomUUID(), kind, app, ...(kind === 'teach' ? { prompt: payload.prompt } : { source: payload.source }) };
  const pending = sendLearnRequest(request, { timeoutMs: WAIT_MS[kind], win, storage });
  open();
  const result = await pending;
  return { ...result, message: result.status in DONE ? DONE[result.status] : result.reason };
}
```

- [ ] **Step 4: Run the new tests, then the full web suite**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/agent/learn-hook.test.mjs && npm run test:unit
```

Expected: First run: tests 5, pass 5, fail 0. Full suite: fail 0, and 5 more passes than immediately before this task (the baseline before any T04 task is 418/418, run 2026-09-23).

- [ ] **Step 5: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git add packages/web/src/agent/learn-hook.js packages/web/src/agent/learn-hook.test.mjs && git commit --only -m 'feat(agent): Learn hook caller behind the learnHandoff flag' -- packages/web/src/agent/learn-hook.js packages/web/src/agent/learn-hook.test.mjs
```

Expected: make test-unit (run.sh:99-106) passes every suite: pytest tests/unit_tests (31 at baseline), web npm run test:unit, control-plane npm test (326/326 at baseline, run 2026-09-23) and the two viz-benchmarks checks. git show --stat HEAD lists exactly these 2 files. The message has no double quotes and no Co-Authored-By line.

---

### Task 12: Home data model: home/continue.js, built on canvas-local.js and catalog.js titleOf

*Area:* Shell, Home, Library, Sidebar · *Brief:* T06 · *Order:* 3.6

**Files:**
- `packages/web/src/home/continue.js`
- `packages/web/src/home/continue.test.mjs`

**Interfaces:**
- Consumes: home/canvas-local.js canvasKeys, hasLocalContent and opensHere (agent-core, order 3.1; hasLocalContent counts unreadable JSON or blocked storage as content, ratified in contract v3); agent/catalog.js titleOf (agent-core, order 3.2); api.js ago, cronHuman and cronList (api.js:70,73,97); learn-outline-model.js outlineFrom (:11)
- Produces: readRecent(storage); recentItems(recent, catalog); readContinue({org,email,recent,catalog,storage}) -> {slug,title,kind,canvas,lastExplored,next}|null, with catalog as an ARRAY; openHref(item); onAnotherDevice(row, email, storage); recentCard(row, {catalog,email,storage}) -> {meta:string[], action:{label,to}|{label,href}|null}. Used by Home, the Library rows and project-map's Project Overview.

- [ ] **Step 1: Check that the agent-core modules this builds on exist**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && grep -nE 'export (const|function) (canvasKeys|hasLocalContent|deviceId|opensHere)' src/home/canvas-local.js && grep -nE 'export (const|function) titleOf' src/agent/catalog.js
```

Expected: Five export lines. If any is missing, stop, because agent-core order 3.1 or 3.2 has not landed.

- [ ] **Step 2: Write the failing tests against the real key and blob formats**

```js
// packages/web/src/home/continue.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onAnotherDevice, openHref, readContinue, readRecent, recentCard, recentItems } from './continue.js';

const store = (entries = {}) => { const m = new Map(Object.entries(entries)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const EMAIL = 'a@gmail.com';
const repo = { name: 'repo-1', kind: 'repository', repo: 'karpathy/nanoGPT', org: 'gmail-com', email: EMAIL, status: 'ready', commit_sha: '3f2a1c9aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', visibility: 'domain' };
const job = { name: 's3-log', kind: 'job', org: 'gmail-com', visibility: 'domain', schedule: '0 9 * * *', lastRun: { runId: 'r-1', status: 'finished', startedAt: '2026-09-23 08:00:00' } };
const server = { name: 'counter', kind: 'server', org: 'acme-com', visibility: 'private', deployed_at: '2026-09-22 10:00:00', url: 'https://x.example/a/acme-com/counter/' };
const canvas = { name: 'canvas-1a2b3c4d', kind: 'canvas', title: 'Attention deep dive', org: 'gmail-com', email: EMAIL, project: 'repo-1', device_id: 'dev-a' };
const catalog = [repo, job, server, canvas];
// The keys LearnPage writes (LearnPage.jsx:143,158,794): the row's own org, the viewer's email.
const key = (a) => `small.adaptive-canvas:${a.org}:${EMAIL}:${a.name}`;
const ink = (blocks) => JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks });
const h = (id, text, done = false) => ({ id, type: 'heading', level: 1, text, done });
const base = { org: 'gmail-com', email: EMAIL, catalog };

test('recent reads small.recent, survives junk, and keeps five catalog items in order', () => {
  assert.deepEqual(readRecent(store({ 'small.recent': '["a","b",3]' })), ['a', 'b']);
  assert.deepEqual(readRecent(store({ 'small.recent': '{' })), []);
  assert.deepEqual(readRecent(store()), []);
  const many = Array.from({ length: 7 }, (_, i) => ({ name: `app-${i}` }));
  assert.deepEqual(recentItems(['gone', 'app-6', 'app-0', 'app-1', 'app-2', 'app-3', 'app-4'], many).map((a) => a.name), ['app-6', 'app-0', 'app-1', 'app-2', 'app-3']);
});

test('nothing recent in this catalog means no Continue block (T02 §3.1.5)', () => {
  assert.equal(readContinue({ ...base, recent: [], storage: store() }), null);
  assert.equal(readContinue({ ...base, recent: ['other-workspace-app'], storage: store() }), null);
});

test('Continue picks the first recent item with local content: last question, first unticked heading', () => {
  const storage = store({
    [`${key(repo)}:ink`]: ink([h('a', 'Tokens', true), { id: 'x', type: 'explanation' }, h('b', 'Masked self-attention'), h('c', 'Training loop')]),
    [`${key(repo)}:chat`]: JSON.stringify([{ id: '1', question: 'what is a token?' }, { id: '2', question: '  why sqrt(dk)?  ' }]),
  });
  assert.deepEqual(readContinue({ ...base, recent: ['s3-log', 'repo-1'], storage }),
    { slug: 'repo-1', title: 'karpathy/nanoGPT', kind: 'repository', canvas: true, lastExplored: 'why sqrt(dk)?', next: 'Masked self-attention' });
});

test('a shared app is read under its own org, not the workspace org', () => {
  const storage = store({ [`${key(server)}:chat`]: JSON.stringify([{ id: '1', question: 'how does it count?' }]) });
  assert.equal(readContinue({ ...base, recent: ['counter'], storage }).lastExplored, 'how does it count?');
});

test('an opened but empty canvas has nothing to continue; Next and Last explored drop out on their own', () => {
  assert.equal(readContinue({ ...base, recent: ['repo-1'], storage: store({ [`${key(repo)}:ink`]: ink([]) }) }).canvas, false);
  const ticked = readContinue({ ...base, recent: ['repo-1'], storage: store({ [`${key(repo)}:ink`]: ink([h('a', 'Tokens', true)]) }) });
  assert.deepEqual([ticked.canvas, ticked.lastExplored, ticked.next], [true, null, null]);
});

test('changed or corrupt blobs drop their lines and never throw (T02 §3.1)', () => {
  const chat = JSON.stringify([{ id: '1', question: 'kept' }]);
  for (const bad of ['not json', '{"blocks":{"not":"a list"}}', '{"blocks":[null]}']) {
    const c = readContinue({ ...base, recent: ['repo-1'], storage: store({ [`${key(repo)}:ink`]: bad, [`${key(repo)}:chat`]: chat }) });
    assert.deepEqual([c.canvas, c.lastExplored, c.next], [true, 'kept', null]);
  }
  const c = readContinue({ ...base, recent: ['repo-1'], storage: store({ [`${key(repo)}:ink`]: ink([h('b', 'Next one')]), [`${key(repo)}:chat`]: '[{"nope":1},"x"]' }) });
  assert.deepEqual([c.canvas, c.lastExplored, c.next], [true, null, 'Next one']);
});

test('with no local content, Continue offers the first recent item to open (T02 §3.1.4)', () => {
  assert.deepEqual(readContinue({ ...base, recent: ['gone', 's3-log', 'repo-1'], storage: store() }),
    { slug: 's3-log', title: 's3-log', kind: 'job', canvas: false, lastExplored: null, next: null });
});

test('Continue opens Learn: a canvas route itself, any other kind its Learn tab', () => {
  assert.equal(openHref({ slug: 'repo-1', kind: 'repository', canvas: true }), '/apps/repo-1?tab=learn');
  assert.equal(openHref({ slug: 'canvas-1a2b3c4d', kind: 'canvas', canvas: true }), '/apps/canvas-1a2b3c4d');
  assert.equal(openHref({ slug: 's3-log', kind: 'job', canvas: false }), '/apps/s3-log');
});

test('a canvas made in another browser is flagged, never opened as empty (T02 §8.3)', () => {
  assert.equal(onAnotherDevice(canvas, EMAIL, store({ 'small.device': 'dev-b' })), true);
  assert.equal(onAnotherDevice(canvas, EMAIL, store({ 'small.device': 'dev-a' })), false);
  assert.equal(onAnotherDevice(canvas, EMAIL, store({ 'small.device': 'dev-b', [`${key(canvas)}:chat`]: '[{"id":"1","question":"q"}]' })), false);
  assert.equal(onAnotherDevice({ ...canvas, device_id: null }, EMAIL, store({ 'small.device': 'dev-b' })), false);
  assert.equal(onAnotherDevice(repo, EMAIL, store({ 'small.device': 'dev-b' })), false);
});

test('recent cards carry per-kind metadata and a next action (T02 §3.2)', () => {
  const ctx = { catalog, email: EMAIL, storage: store({ 'small.device': 'dev-a' }) };
  assert.deepEqual(recentCard(repo, ctx), { meta: ['3f2a1c9', 'Map ready', '1 canvas', 'Workspace'], action: { label: 'Open project', to: '/apps/repo-1' } });
  assert.deepEqual(recentCard(canvas, ctx), { meta: ['In karpathy/nanoGPT', 'Content in this browser'], action: { label: 'Continue learning', to: '/apps/canvas-1a2b3c4d' } });
  assert.deepEqual(recentCard(canvas, { ...ctx, storage: store({ 'small.device': 'dev-b' }) }), { meta: ['On another device'], action: null });
  const jobCard = recentCard(job, ctx);
  assert.match(jobCard.meta[0], /^✓ /);
  assert.deepEqual(jobCard.meta.slice(1), ['daily 09:00', 'Runs: anyone @gmail.com']);
  assert.deepEqual(jobCard.action, { label: 'View last run', to: '/apps/s3-log/runs/r-1' });
  const serverCard = recentCard(server, ctx);
  assert.match(serverCard.meta[0], /^Deployed /);
  assert.equal(serverCard.meta[1], 'only shared');
  assert.deepEqual(serverCard.action, { label: 'Open app', href: server.url });
});
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/home/continue.test.mjs
```

Expected: FAIL: ERR_MODULE_NOT_FOUND for ./continue.js

- [ ] **Step 3: Implement continue.js**

```js
// packages/web/src/home/continue.js
// Home's read of this browser (T02 §3.1-3.2). Read-only and forgiving: if the Learn blob
// changes shape on the Learn branches, a line drops out; nothing throws.
import { titleOf } from '../agent/catalog.js';
import { ago, cronHuman, cronList } from '../api.js';
import { outlineFrom } from '../learn-outline-model.js';
import { canvasKeys, hasLocalContent, opensHere } from './canvas-local.js';

const json = (storage, key) => { try { return JSON.parse(storage.getItem(key)); } catch { return null; } };

export function readRecent(storage) {
  const list = json(storage, 'small.recent');
  return Array.isArray(list) ? list.filter((slug) => typeof slug === 'string') : [];
}

// small.recent ∩ catalog, in recent order, at most five (T02 §3.2).
export const recentItems = (recent, catalog) => recent.map((slug) => (catalog || []).find((a) => a.name === slug)).filter(Boolean).slice(0, 5);

// LearnPage.jsx:143: the row's own org (a shared app's differs from the workspace's) and the
// viewer's email (live rows carry none; repository and canvas rows carry the viewer's).
const keysOf = (a, email, org) => canvasKeys({ org: a.org || org, email: a.email || email, slug: a.name });

// T02 §8.3: the record exists, but its content was made in another browser.
export const onAnotherDevice = (a, email, storage) =>
  a.kind === 'canvas' && !opensHere({ storage, keys: keysOf(a, email), record: a });

const lastQuestion = (chat) => {
  if (!Array.isArray(chat)) return null;
  // ponytail: top-level turns only; in-block replies carry no timestamps to order by.
  const turn = [...chat].reverse().find((e) => typeof e?.question === 'string' && e.question.trim());
  return turn ? turn.question.trim() : null;
};

// The learner's own outline and ticks (AdaptiveCanvas.jsx:901), never an inference.
const nextHeading = (blob) => { try { return outlineFrom(blob?.blocks).find((h) => !h.done)?.label || null; } catch { return null; } };

export function readContinue({ org, email, recent, catalog, storage }) {
  const items = recentItems(recent || [], catalog);
  const card = (a, canvas, lastExplored = null, next = null) => ({ slug: a.name, title: titleOf(a), kind: a.kind, canvas, lastExplored, next });
  for (const a of items) {
    const keys = keysOf(a, email, org);
    if (hasLocalContent(storage, keys)) return card(a, true, lastQuestion(json(storage, keys.chat)), nextHeading(json(storage, keys.ink)));
  }
  return items.length ? card(items[0], false) : null;
}

// A canvas route opens Learn itself (CanvasPage); other kinds open their Learn tab.
export const openHref = (item) => (item.canvas && item.kind !== 'canvas' ? `/apps/${item.slug}?tab=learn` : `/apps/${item.slug}`);

// App.jsx:409's access wording; for a job it is also who can run it (index.js:2008 canView).
const access = (a) => (a.visibility === 'private' ? 'only shared' : `anyone @${a.org.replace(/-/g, '.')}`);

// T02 §3.2: kinds differ by metadata and next action, not only the chip.
export function recentCard(a, { catalog = [], email, storage }) {
  if (a.kind === 'repository') {
    const canvases = catalog.filter((c) => c.kind === 'canvas' && c.project === a.name).length;
    return {
      meta: [a.commit_sha && a.commit_sha.slice(0, 7), `Map ${a.status}`, canvases && `${canvases} canvas${canvases > 1 ? 'es' : ''}`, a.visibility === 'private' ? 'Private' : 'Workspace'].filter(Boolean),
      action: { label: 'Open project', to: `/apps/${a.name}` },
    };
  }
  if (a.kind === 'canvas') {
    if (onAnotherDevice(a, email, storage)) return { meta: ['On another device'], action: null };
    const project = catalog.find((p) => p.name === a.project);
    const last = lastQuestion(json(storage, keysOf(a, email).chat));
    return {
      meta: [project ? `In ${titleOf(project)}` : 'Standalone', last && `Last explored: ${last}`, 'Content in this browser'].filter(Boolean),
      action: { label: 'Continue learning', to: `/apps/${a.name}` },
    };
  }
  if (a.kind === 'job') {
    const run = a.lastRun;
    return {
      meta: [
        run && (run.status === 'running' ? 'Running' : `${run.status === 'finished' ? '✓' : '✗'} ${ago(run.startedAt)}`),
        a.schedule && `${cronList(a.schedule).map(cronHuman).join(' · ')}${a.schedule_paused ? ' · paused' : ''}`,
        `Runs: ${access(a)}`,
      ].filter(Boolean),
      action: run?.runId ? { label: 'View last run', to: `/apps/${a.name}/runs/${run.runId}` } : { label: 'Open', to: `/apps/${a.name}` },
    };
  }
  return { meta: [`Deployed ${ago(a.deployed_at || a.created_at)}`, access(a)], action: { label: 'Open app', href: a.url } };
}
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/home/continue.test.mjs
```

Expected: PASS: 10 tests, 0 fail. The corrupt-blob test relies on the ratified contract v3 rule that unreadable JSON counts as content (canvas: true). If it fails inside hasLocalContent, the bug is in canvas-local.js (a JSON.parse without a guard). Report it to agent-core; do not work around it here.

- [ ] **Step 4: Full suite and commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git add packages/web/src/home/continue.js packages/web/src/home/continue.test.mjs && git commit --only packages/web/src/home/continue.js packages/web/src/home/continue.test.mjs -m 'feat(web): Home reads Continue and Recent from this browser through canvas-local'
```

Expected: make test-unit exits 0. One commit with 2 files.

---

### Task 13: Command registry: ctxOf, prepareCommand, executeCommand, the Result shape and the D7 guard (agent/commands.js)

*Area:* Agent Bar logic (pure modules) · *Brief:* T05 · *Order:* 4

**Files:**
- `packages/web/src/agent/commands.js`
- `packages/web/src/agent/commands.test.mjs`

**Interfaces:**
- Consumes: scopeOf (order 2), canvas-local (3.1), catalog (3.2), flags.js learnPreview (1), connections.js openedNotice(tab, focus) (settings-deploy, order 2.4; the test pins only the §11 Connections string and compares other tabs to the function's own output). api, navigate, getTheme, setTheme, wsName (api.js). At runtime: POST /api/canvases {title, project?, device_id} -> 201 canvas row and DELETE /api/apps/canvas-* -> 200 or 405 from the canvases backend (orders 6.1-6.4); nothing here calls them at import time.
- Produces: ctxOf(surface, overrides?) -> {org, email, orgName, devBuild: learnPreview, storage: window.localStorage, catalog, scope, surface}, the only ctx builder (CONTRACT v3; no ctxFor). overrides may set only scope: the bar passes the scope frozen at Send, ctxOf(getSurface(), { scope }); every other key comes from the surface and any other override is ignored. prepareCommand(name, args, ctx) -> {args, card, policy} (resolve, then preview, then policy; a share of a project or canvas returns card null and policy immediate). executeCommand(name, args, ctx) -> Result, rechecking policy so D7 holds even without a card. COMMANDS[name].undo(result, ctx) takes the Result run returned. policy(name, ctx) and D7_REASON unchanged. Result = {message?, href?, notice?, results?, undoable?, resetThread?, data?}. Navigation happens only inside run(). Ask-tool errors are api() Errors carrying .status and .data (api.js:63) for the card state mapping. The bar passes an Ask proposal as prepareCommand(p.tool, {...p.args, proposal_id: p.id}, ctx) (SSE proposal = {id, tool, args}, index.js:1189-1197). open_settings dispatches 'small:settings' and returns openedNotice(tab, focus); the listener lands with settings-deploy 'Settings reused' (order 9.8), before the bar (10.2, 10.3) can report 'Opened Settings'.

- [ ] **Step 1: Write the failing test**

```js
// ===== packages/web/src/agent/commands.test.mjs =====
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openedNotice } from '../connections.js';
import { learnPreview } from '../flags.js';
import { canvasKeys } from '../home/canvas-local.js';
import { COMMANDS, D7_REASON, ctxOf, executeCommand, policy, prepareCommand } from './commands.js';

// Just enough browser for api.js, navigate() and setTheme(): fetch, history, storage, theme.
const memory = () => { const items = new Map(); return { getItem: (key) => (items.has(key) ? items.get(key) : null), setItem: (key, value) => items.set(key, String(value)), removeItem: (key) => items.delete(key) }; };
const calls = [], opened = [];
let reply = () => ({});
globalThis.localStorage = memory();
globalThis.window = Object.assign(new EventTarget(), { localStorage: globalThis.localStorage, history: { pushState: (_state, _title, to) => opened.push(to) }, location: { pathname: '/apps' }, matchMedia: () => ({ matches: false }) });
globalThis.document = { documentElement: { classList: { toggle() {} } } };
globalThis.PopStateEvent = class extends Event {};
globalThis.fetch = async (path, init = {}) => {
  calls.push({ path, method: init.method || 'GET', body: init.body && JSON.parse(init.body) });
  const { status = 200, body = {} } = reply(path, init) || {};
  return Response.json(body, { status });
};

const CATALOG = [
  { name: 'repo-1a2b3c4d-nanogpt', kind: 'repository', repo: 'karpathy/nanoGPT' },
  { name: 'canvas-0f9e8d7c', kind: 'canvas', title: 'Attention deep dive' },
  { name: 'counter', kind: 'server' },
  { name: 's3-log', kind: 'job' },
];
const SURFACE = { place: 'app', org: 'gmail-com', email: 'a@gmail.com', orgName: 'Gmail', catalog: CATALOG, resource: { kind: 'app', slug: 's3-log', title: 's3-log' }, selected: null, barHidden: false, resultsHost: 'sheet', handlers: {} };
const CTX = { ...ctxOf(SURFACE), devBuild: true, storage: memory() };
const LIVE = { ...CTX, devBuild: false };
const ASK = ['run', 'run_again', 'set_schedule', 'pause_schedule', 'resume_schedule', 'share', 'unshare'];
const CANVAS = { name: 'canvas-0f9e8d7c', org: 'gmail-com', title: 'Causal masks', kind: 'canvas', project: null, device_id: null };

test('every caller builds the one ctx from the surface; only the frozen scope overrides it', () => {
  assert.equal(learnPreview, false);
  const s3log = { org: 'gmail-com', kind: 'app', slug: 's3-log', title: 's3-log', selected: null };
  assert.deepEqual(ctxOf(SURFACE), {
    org: 'gmail-com', email: 'a@gmail.com', orgName: 'Gmail', devBuild: learnPreview, storage: window.localStorage, catalog: CATALOG,
    scope: s3log, surface: SURFACE,
  });
  // The bar freezes the scope at Send (T02 §6.3); the page may move on before the command runs.
  const later = ctxOf({ ...SURFACE, place: 'home', resource: null }, { scope: s3log, devBuild: true });
  assert.deepEqual(later.scope, s3log);
  assert.equal(later.devBuild, learnPreview);
});

test('risk comes from the registry and matches T02 §7.2', () => {
  const byRisk = {};
  for (const [name, command] of Object.entries(COMMANDS)) (byRisk[command.risk] ||= []).push(name);
  for (const names of Object.values(byRisk)) names.sort();
  assert.deepEqual(byRisk, {
    immediate: ['filter_library', 'find_apps_ai', 'find_runs_ai', 'new_thread', 'open_resource', 'open_settings', 'open_tab', 'search_resources'],
    undo: ['create_canvas', 'set_theme'],
    confirm: ['connect_repository', 'pause_schedule', 'resume_schedule', 'run', 'run_again', 'set_schedule', 'share', 'unshare'],
  });
});

test('D7: on the preview every live-touching Confirm card is blocked, and nothing else is', () => {
  for (const name of ASK) assert.equal(COMMANDS[name].touchesLive, true, name);
  for (const [name, command] of Object.entries(COMMANDS)) {
    const expected = command.risk === 'confirm' && command.touchesLive ? { risk: 'confirm', blocked: true, reason: D7_REASON } : { risk: command.risk, blocked: false };
    assert.deepEqual(policy(name, CTX), expected, name);
  }
  assert.equal(D7_REASON, 'Blocked on this preview: it would change live apps.');
  assert.deepEqual(policy('share', LIVE), { risk: 'confirm', blocked: false });
});

// T02 §16, verified in code: LEARN_DB rows (repositories.js:124) and learn-repositories-dev/ keys (:90) only.
test('connect_repository runs on the preview: its writes stay in LEARN_DB and learn-repositories-dev', () => {
  assert.deepEqual(policy('connect_repository', CTX), { risk: 'confirm', blocked: false });
});

test('an unknown command, or one the scope cannot serve, is blocked with its reason, and execute refuses it too', async () => {
  const home = { ...CTX, scope: { org: 'gmail-com', kind: 'workspace', slug: null, title: null, selected: null } };
  assert.deepEqual(policy('rename', CTX), { risk: null, blocked: true, reason: 'Unknown command: rename' });
  assert.deepEqual(policy('find_runs_ai', home), { risk: 'immediate', blocked: true, reason: 'Open an app to search its runs.' });
  await assert.rejects(executeCommand('find_runs_ai', { q: 'failed yesterday' }, home), { message: 'Open an app to search its runs.' });
});

test('prepare resolves the default branch before the card, so the card shows the exact branch', async () => {
  reply = () => ({ body: { repo: 'karpathy/nanoGPT', defaultBranch: 'master', branches: ['master'], hasMore: false, page: 1 } });
  const prepared = await prepareCommand('connect_repository', { url: 'https://github.com/karpathy/nanoGPT', repo: 'karpathy/nanoGPT' }, CTX);
  assert.equal(calls.at(-1).path, '/api/repositories/branches?url=https%3A%2F%2Fgithub.com%2Fkarpathy%2FnanoGPT');
  assert.deepEqual(prepared, {
    args: { url: 'https://github.com/karpathy/nanoGPT', repo: 'karpathy/nanoGPT', branch: 'master' },
    card: {
      workspace: 'Gmail', title: 'Connect karpathy/nanoGPT', target: 'karpathy/nanoGPT · public GitHub · https://github.com/karpathy/nanoGPT',
      operation: 'connect_repository', params: { branch: 'master' }, effect: "Visible to everyone in Gmail. Connected repositories can't be deleted yet.",
    },
    policy: { risk: 'confirm', blocked: false },
  });
});

test('a repository that is not public says so before any card', async () => {
  reply = () => ({ status: 400, body: { error: 'Public repository was not found or GitHub is unavailable' } });
  await assert.rejects(prepareCommand('connect_repository', { url: 'https://github.com/acme/private-tools', repo: 'acme/private-tools' }, CTX),
    { message: "Can't connect acme/private-tools: no public repository found there. Private repositories aren't supported yet; public GitHub works." });
});

test('Connect posts the repository and run opens its project; the caller never navigates', async () => {
  reply = () => ({ status: 202, body: { name: 'repo-1a2b3c4d-nanogpt' } });
  const done = await executeCommand('connect_repository', { url: 'https://github.com/karpathy/nanoGPT', repo: 'karpathy/nanoGPT', branch: 'master' }, CTX);
  assert.deepEqual(done, { href: '/apps/repo-1a2b3c4d-nanogpt', data: { name: 'repo-1a2b3c4d-nanogpt' } });
  assert.deepEqual(calls.at(-1), { path: '/api/repositories', method: 'POST', body: { url: 'https://github.com/karpathy/nanoGPT', branch: 'master' } });
  assert.equal(opened.at(-1), '/apps/repo-1a2b3c4d-nanogpt');
});

test('an Ask proposal becomes a card naming workspace, target, operation, parameters and effect; D7 blocks it', async () => {
  assert.deepEqual(await prepareCommand('share', { proposal_id: 'p-1a2b3c', app: 'counter', email: 'y@example.com', role: 'view' }, CTX), {
    args: { proposal_id: 'p-1a2b3c', app: 'counter', email: 'y@example.com', role: 'view' },
    card: { workspace: 'Gmail', title: 'Share counter', target: 'counter (server) · /apps/counter', operation: 'share', params: { app: 'counter', email: 'y@example.com', role: 'view' }, effect: 'y@example.com gets view access to counter now.' },
    policy: { risk: 'confirm', blocked: true, reason: D7_REASON },
  });
  const before = calls.length;
  await assert.rejects(executeCommand('share', { proposal_id: 'p-1a2b3c', app: 'counter' }, CTX), { message: D7_REASON });
  assert.equal(calls.length, before);
});

test('off the preview an Ask tool executes only by approving the proposal Ask made', async () => {
  await assert.rejects(executeCommand('share', { app: 'counter', email: 'y@example.com' }, LIVE), { message: 'Share needs a proposal from Ask first.' });
  reply = () => ({ body: { ok: true, runId: 'r-abc' } });
  assert.deepEqual(await executeCommand('run', { proposal_id: 'p-4d5e6f', app: 's3-log' }, LIVE), { href: '/apps/s3-log/runs/r-abc', data: { ok: true, runId: 'r-abc' } });
  assert.deepEqual(calls.at(-1), { path: '/api/ask/approve', method: 'POST', body: { proposal_id: 'p-4d5e6f' } });
});

test('sharing a project or canvas says it is not available yet: no card, no API call (T02 §11)', async () => {
  const before = calls.length;
  for (const app of ['repo-1a2b3c4d-nanogpt', 'canvas-0f9e8d7c']) {
    const args = { app, email: 'y@example.com', role: 'view' };
    assert.deepEqual(await prepareCommand('share', args, CTX), { args, card: null, policy: { risk: 'immediate', blocked: false } });
    assert.deepEqual(await executeCommand('share', args, CTX), { message: "Sharing projects and canvases isn't available yet." });
  }
  assert.equal(calls.length, before);
});

test('opens and Library filters navigate inside run; Settings opens by event with the Connections notice', async () => {
  for (const [name, args] of [['open_resource', { slug: 'canvas-0f9e8d7c' }], ['open_tab', { slug: 'repo-1a2b3c4d-nanogpt', tab: 'map' }], ['filter_library', { type: 'canvases' }],
    ['filter_library', { section: 'shared' }], ['filter_library', { folder: 'Data team' }], ['filter_library', {}]]) {
    assert.deepEqual(await executeCommand(name, args, CTX), {});
  }
  assert.deepEqual(opened.slice(-6), ['/apps/canvas-0f9e8d7c', '/apps/repo-1a2b3c4d-nanogpt?tab=map', '/library?type=canvases', '/library?s=shared', '/library?f=Data+team', '/library']);
  let detail;
  window.addEventListener('small:settings', (event) => { detail = event.detail; }, { once: true });
  assert.deepEqual(await executeCommand('open_settings', { tab: 'connections', focus: 'google-slides' }, CTX), { notice: 'Opened Settings → Connections. Google Slides is planned; nothing was connected.' });
  assert.deepEqual(detail, { tab: 'connections', focus: 'google-slides' });
  assert.deepEqual(await executeCommand('open_settings', {}, CTX), { notice: openedNotice(undefined, undefined) });
});

test('search lists catalog titles; the AI finds list what their endpoints return', async () => {
  assert.deepEqual(await executeCommand('search_resources', { text: 'attention' }, CTX), { results: [{ slug: 'canvas-0f9e8d7c', title: 'Attention deep dive', kind: 'canvas', detail: 'Canvas' }] });
  reply = () => ({ body: { apps: ['s3-log'], note: '' } });
  assert.deepEqual(await executeCommand('find_apps_ai', { q: 'the job that copies logs to s3' }, CTX), { results: [{ slug: 's3-log', title: 's3-log', kind: 'job', detail: 'App · job' }] });
  assert.deepEqual(calls.at(-1), { path: '/api/apps/find', method: 'POST', body: { q: 'the job that copies logs to s3' } });
  reply = () => ({ body: { apps: [], note: 'Nothing here copies logs yet.' } });
  assert.deepEqual(await executeCommand('find_apps_ai', { q: 'log copier' }, CTX), { results: [], message: 'Nothing here copies logs yet.' });
  reply = () => ({ body: { runs: ['r-abc'], note: '' } });
  assert.deepEqual(await executeCommand('find_runs_ai', { q: 'the failed run yesterday' }, CTX), { results: [{ slug: 's3-log/runs/r-abc', title: 'r-abc', kind: 'run', detail: 'Run of s3-log' }] });
  assert.deepEqual(calls.at(-1), { path: '/api/runs/find', method: 'POST', body: { app: 's3-log', q: 'the failed run yesterday' } });
});

test('new_thread tells the bar to start a new thread in the frozen scope', async () => {
  assert.deepEqual(await executeCommand('new_thread', {}, CTX), { resetThread: true });
});

test('create_canvas records this device; from the bar it stays put with Undo, from a button it opens the canvas', async () => {
  const ctx = { ...CTX, storage: memory() };
  reply = () => ({ status: 201, body: CANVAS });
  const before = opened.length;
  assert.deepEqual(await executeCommand('create_canvas', { title: 'Causal masks', project: 'repo-1a2b3c4d-nanogpt', open: false }, ctx),
    { message: 'Canvas created · Causal masks', href: '/apps/canvas-0f9e8d7c', undoable: true, data: CANVAS });
  assert.equal(opened.length, before);
  const device = ctx.storage.getItem('small.device');
  assert.match(device, /^[0-9a-f-]{36}$/);
  assert.deepEqual(calls.at(-1), { path: '/api/canvases', method: 'POST', body: { title: 'Causal masks', project: 'repo-1a2b3c4d-nanogpt', device_id: device } });
  assert.deepEqual(await executeCommand('create_canvas', { open: true }, ctx), { href: '/apps/canvas-0f9e8d7c', data: CANVAS });
  assert.deepEqual(calls.at(-1).body, { title: 'Untitled canvas', device_id: device });
  assert.equal(opened.at(-1), '/apps/canvas-0f9e8d7c');
});

test('Undo deletes a canvas only while it is untouched here, and the server has the last word on threads', async () => {
  const ctx = { ...CTX, storage: memory() }, keys = canvasKeys({ org: 'gmail-com', email: 'a@gmail.com', slug: 'canvas-0f9e8d7c' });
  const created = { message: 'Canvas created · Causal masks', href: '/apps/canvas-0f9e8d7c', undoable: true, data: CANVAS };
  ctx.storage.setItem(keys.ink, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [{ id: 'b1' }] }));
  const before = calls.length;
  await assert.rejects(COMMANDS.create_canvas.undo(created, ctx), { message: 'This canvas has content now. Archive it from Library instead.' });
  assert.equal(calls.length, before);
  ctx.storage.setItem(keys.ink, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [] }));
  ctx.storage.setItem(keys.chat, '[]');
  reply = () => ({ body: { ok: true } });
  await COMMANDS.create_canvas.undo(created, ctx);
  assert.deepEqual(calls.at(-1), { path: '/api/apps/canvas-0f9e8d7c', method: 'DELETE', body: undefined });
  reply = () => ({ status: 405, body: { error: 'This canvas has been used. Archive it instead.' } });
  await assert.rejects(COMMANDS.create_canvas.undo(created, ctx), { message: 'This canvas has been used. Archive it instead.' });
});

test('set_theme is undone by restoring the previous theme', async () => {
  localStorage.setItem('small.theme', 'light');
  const done = await executeCommand('set_theme', { theme: 'dark' }, CTX);
  assert.deepEqual(done, { message: 'Theme set to dark', undoable: true, data: { previous: 'light' } });
  assert.equal(localStorage.getItem('small.theme'), 'dark');
  await COMMANDS.set_theme.undo(done, CTX);
  assert.equal(localStorage.getItem('small.theme'), 'light');
  await assert.rejects(executeCommand('set_theme', { theme: 'purple' }, CTX), { message: 'Theme is system, light or dark.' });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/agent/commands.test.mjs
```

Expected: ERR_MODULE_NOT_FOUND for the module under test. Output shows tests 1, pass 0, fail 1 (verified in the scratch mirror).

- [ ] **Step 3: Implement commands.js**

```js
// ===== packages/web/src/agent/commands.js =====
import { api, getTheme, navigate, setTheme, wsName } from '../api.js';
import { openedNotice } from '../connections.js';
import { learnPreview } from '../flags.js';
import { canvasKeys, deviceId, hasLocalContent } from '../home/canvas-local.js';
import { kindLabel, lookup, titleOf } from './catalog.js';
import { scopeOf } from './scope.js';

// One registry for the Agent Bar and the buttons that do the same things (T02 §7).
// Risk comes from here, never from a model's confidence. run() resolves a Result:
// { message?, href?, notice?, results?: [{slug, title, kind, detail}], undoable?, resetThread?, data? }.
// A command that navigates does so inside run(); callers never navigate after it.
// ponytail: §7.1 requires(ctx) is left out; the server rechecks edit rights at approve (index.js:1425-1430).
export const D7_REASON = 'Blocked on this preview: it would change live apps.';

// The one ctx. The Start dialog, the Project hub and the canvas gate pass ctxOf(getSurface()); the bar
// passes the scope it froze at Send (T02 §6.3), ctxOf(getSurface(), { scope }). scope is the only override.
export const ctxOf = (surface, { scope = scopeOf(surface) } = {}) => ({
  org: surface.org, email: surface.email, orgName: surface.orgName, devBuild: learnPreview,
  storage: window.localStorage, catalog: surface.catalog || [], scope, surface,
});

const ok = () => ({ ok: true });
const workspace = (ctx) => ctx.orgName || wsName(ctx.org);
const card = (ctx, model) => ({ workspace: workspace(ctx), ...model });
const rowOf = (ctx, slug) => (ctx.catalog || []).find((row) => row.name === slug);
const titleFor = (ctx, slug) => (rowOf(ctx, slug) ? titleOf(rowOf(ctx, slug)) : slug);
const go = (to) => {
  navigate(to);
  return {};
};
function targetOf(ctx, slug) {
  const row = rowOf(ctx, slug);
  return row ? `${titleOf(row)} (${row.kind}) · /apps/${slug}` : `${slug} · /apps/${slug}`;
}

// The seven Ask tools (control-plane ask.js:103-159) execute only by approving the
// proposal the Ask agent made, through /api/ask/approve (index.js:1415).
// ponytail: a rule-routed share or run has no proposal yet; D7 blocks all seven on the preview
// until the §7.4 fixes are promoted, and that promotion adds a route that creates one.
const ASK_TOOLS = {
  run: ['Run', (a) => `Starts a run of ${a.app} now.`],
  run_again: ['Run again', (a) => `Starts a new run with the inputs of ${a.run_id}.`],
  set_schedule: ['Set schedule', (a) => (a.schedule ? `${a.app} runs on ${a.schedule} (UTC) from now on.` : `${a.app} stops running on a schedule.`)],
  pause_schedule: ['Pause schedule', (a) => `${a.app} stops running on its schedule. Runs missed while paused are not made up.`],
  resume_schedule: ['Resume schedule', (a) => `${a.app} runs on its schedule again.`],
  share: ['Share', (a) => `${a.email} gets ${a.role === 'edit' ? 'edit' : 'view'} access to ${a.app} now.`],
  unshare: ['Unshare', (a) => `${a.email} loses access to ${a.app} now.`],
};

function proposal(name) {
  const [label, effect] = ASK_TOOLS[name];
  return {
    risk: 'confirm',
    touchesLive: true,
    available: ok,
    preview: ({ proposal_id, ...args }, ctx) => card(ctx, {
      title: `${label} ${args.app ? titleFor(ctx, args.app) : args.run_id}`,
      target: args.app ? targetOf(ctx, args.app) : `run ${args.run_id}`,
      operation: name,
      params: args,
      effect: effect(args),
    }),
    run: async ({ proposal_id, ...args }) => {
      if (!proposal_id) throw Error(`${label} needs a proposal from Ask first.`);
      const data = await api('/api/ask/approve', { method: 'POST', body: JSON.stringify({ proposal_id }) });
      return { ...(data.runId && args.app ? { href: `/apps/${args.app}/runs/${data.runId}` } : {}), data };
    },
  };
}

// ponytail: the 'opens a screen only' actions of §7.2 have no entry; no rule or Ask tool reaches them in phase 1.
export const COMMANDS = {
  open_resource: { risk: 'immediate', touchesLive: false, available: ok, run: async ({ slug }) => go(`/apps/${slug}`) },
  open_tab: { risk: 'immediate', touchesLive: false, available: ok, run: async ({ slug, tab }) => go(`/apps/${slug}?tab=${encodeURIComponent(tab)}`) },
  open_settings: {
    risk: 'immediate', touchesLive: false, available: ok,
    run: async ({ tab, focus } = {}) => {
      window.dispatchEvent(new CustomEvent('small:settings', { detail: { tab, focus } }));
      return { notice: openedNotice(tab, focus) };
    },
  },
  // The Library's type, scope and folder parameters (App.jsx:116-117; ?type= from the Library chips).
  filter_library: {
    risk: 'immediate', touchesLive: false, available: ok,
    run: async ({ type, section, folder } = {}) => {
      const query = String(new URLSearchParams({ ...(type ? { type } : {}), ...(section ? { s: section } : {}), ...(folder ? { f: folder } : {}) }));
      return go(query ? `/library?${query}` : '/library');
    },
  },
  search_resources: {
    risk: 'immediate', touchesLive: false, available: ok,
    run: async ({ text }, ctx) => ({ results: lookup(ctx.catalog, text).map((hit) => ({ ...hit, detail: kindLabel(hit.kind) })) }),
  },
  // Reads on the live control plane, each one model call (index.js:595-638). Immediate, so D7 never blocks a read.
  find_apps_ai: {
    risk: 'immediate', touchesLive: true, available: ok,
    run: async ({ q }, ctx) => {
      const { apps = [], note } = await api('/api/apps/find', { method: 'POST', body: JSON.stringify({ q }) });
      const results = apps.map((slug) => ({ slug, title: titleFor(ctx, slug), kind: rowOf(ctx, slug)?.kind || 'app', detail: kindLabel(rowOf(ctx, slug)?.kind) }));
      return { results, ...(note ? { message: note } : {}) };
    },
  },
  find_runs_ai: {
    risk: 'immediate', touchesLive: true,
    available: (ctx) => (ctx.scope?.kind === 'app' ? { ok: true } : { ok: false, reason: 'Open an app to search its runs.' }),
    run: async ({ q }, ctx) => {
      const app = ctx.scope.slug;
      const { runs = [], note } = await api('/api/runs/find', { method: 'POST', body: JSON.stringify({ app, q }) });
      // The slug is the path under /apps, so opening a result opens the run page.
      const results = runs.map((id) => ({ slug: `${app}/runs/${id}`, title: id, kind: 'run', detail: `Run of ${titleFor(ctx, app)}` }));
      return { results, ...(note ? { message: note } : {}) };
    },
  },
  new_thread: { risk: 'immediate', touchesLive: false, available: ok, run: async () => ({ resetThread: true }) },
  set_theme: {
    risk: 'undo', touchesLive: false, available: ok,
    run: async ({ theme }) => {
      if (!['system', 'light', 'dark'].includes(theme)) throw Error('Theme is system, light or dark.');
      const previous = getTheme();
      setTheme(theme);
      return { message: `Theme set to ${theme}`, undoable: true, data: { previous } };
    },
    undo: async ({ data }) => setTheme(data.previous),
  },
  // open: true for Start, the Project hub and the canvas gate (lands on the canvas);
  // open: false for the bar, which stays put and offers Undo (T02 §8.4).
  create_canvas: {
    risk: 'undo', touchesLive: false, available: ok,
    run: async ({ title = 'Untitled canvas', project, open = false } = {}, ctx) => {
      const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title, ...(project ? { project } : {}), device_id: deviceId(ctx.storage) }) });
      const href = `/apps/${canvas.name}`;
      if (open) {
        navigate(href);
        return { href, data: canvas };
      }
      return { message: `Canvas created · ${canvas.title}`, href, undoable: true, data: canvas };
    },
    // Untouched = no content in this browser (canvas-local.js) and no threads, which the
    // server checks in the same DELETE and refuses with 405 otherwise.
    undo: async ({ data: canvas }, ctx) => {
      if (hasLocalContent(ctx.storage, canvasKeys({ org: canvas.org, email: ctx.email, slug: canvas.name }))) {
        throw Error('This canvas has content now. Archive it from Library instead.');
      }
      await api(`/api/apps/${canvas.name}`, { method: 'DELETE' });
    },
  },
  // Confirm class, but allowed on the preview (T02 §16): the row goes only to LEARN_DB
  // (small-learn-dev) and the snapshot only under learn-repositories-dev/ (repositories.js:90,124).
  connect_repository: {
    risk: 'confirm', touchesLive: false, available: ok,
    // prepareCommand runs this before the card, so the card shows the exact branch and a
    // repository that is not public fails before any card.
    resolve: async ({ url, repo }) => {
      try {
        return { url, repo, branch: (await api(`/api/repositories/branches?url=${encodeURIComponent(url)}`)).defaultBranch };
      } catch (error) {
        throw Error(/not found/i.test(error.message) ? `Can't connect ${repo}: no public repository found there. Private repositories aren't supported yet; public GitHub works.` : error.message);
      }
    },
    preview: (args, ctx) => card(ctx, {
      title: `Connect ${args.repo}`,
      target: `${args.repo} · public GitHub · ${args.url}`,
      operation: 'connect_repository',
      params: { branch: args.branch },
      effect: `Visible to everyone in ${workspace(ctx)}. Connected repositories can't be deleted yet.`,
    }),
    run: async ({ url, branch }) => {
      const { name } = await api('/api/repositories', { method: 'POST', body: JSON.stringify({ url, branch }) });
      navigate(`/apps/${name}`);
      return { href: `/apps/${name}`, data: { name } };
    },
  },
  ...Object.fromEntries(Object.keys(ASK_TOOLS).map((name) => [name, proposal(name)])),
  // Projects and canvases can't be shared yet (T02 §11). That answer touches nothing, so it
  // is never a card and never Blocked (prepareCommand, executeCommand).
  share: {
    ...proposal('share'),
    unsupported: (args, ctx) => (['repository', 'canvas'].includes(rowOf(ctx, args.app)?.kind) ? "Sharing projects and canvases isn't available yet." : null),
  },
};

// D7 (T02 §7.5) is checked first and is absolute on every dev build.
export function policy(name, ctx) {
  const command = COMMANDS[name];
  if (!command) return { risk: null, blocked: true, reason: `Unknown command: ${name}` };
  if (ctx.devBuild && command.touchesLive && command.risk === 'confirm') return { risk: command.risk, blocked: true, reason: D7_REASON };
  const { ok: allowed, reason } = command.available(ctx);
  return allowed ? { risk: command.risk, blocked: false } : { risk: command.risk, blocked: true, reason };
}

// Before a card: resolve (connect_repository's default branch), the card model, the policy.
export async function prepareCommand(name, args, ctx) {
  const command = COMMANDS[name];
  if (command?.unsupported?.(args, ctx)) return { args, card: null, policy: { risk: 'immediate', blocked: false } };
  const resolved = (await command?.resolve?.(args, ctx)) ?? args;
  return { args: resolved, card: command?.preview?.(resolved, ctx) ?? null, policy: policy(name, ctx) };
}

// The only way a command runs. The policy is checked again here, so a caller that skipped
// the card still cannot pass D7.
export async function executeCommand(name, args, ctx) {
  const command = COMMANDS[name];
  const unsupported = command?.unsupported?.(args, ctx);
  if (unsupported) return { message: unsupported };
  const { blocked, reason } = policy(name, ctx);
  if (blocked) throw Error(reason);
  return command.run(args, ctx);
}
```

- [ ] **Step 4: Run the new tests, then the full web suite**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/agent/commands.test.mjs && npm run test:unit
```

Expected: First run: tests 17, pass 17, fail 0. Full suite: fail 0, and 17 more passes than immediately before this task (the baseline before any T04 task is 418/418, run 2026-09-23).

- [ ] **Step 5: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git add packages/web/src/agent/commands.js packages/web/src/agent/commands.test.mjs && git commit --only -m 'feat(agent): command registry with prepare, execute and the D7 preview guard' -- packages/web/src/agent/commands.js packages/web/src/agent/commands.test.mjs
```

Expected: make test-unit (run.sh:99-106) passes every suite: pytest tests/unit_tests (31 at baseline), web npm run test:unit, control-plane npm test (326/326 at baseline, run 2026-09-23) and the two viz-benchmarks checks. git show --stat HEAD lists exactly these 2 files. The message has no double quotes and no Co-Authored-By line.

---

### Task 14: Pin and unpin on the device-local list (after home/pinned.js lands)

*Area:* Agent Bar logic (pure modules) · *Brief:* T05 · *Order:* 4.1

**Files:**
- `packages/web/src/agent/commands.js`
- `packages/web/src/agent/commands.test.mjs`

**Interfaces:**
- Consumes: readPinned(storage, org, email) and togglePin(storage, org, email, slug) from packages/web/src/home/pinned.js (shell-home, order 3.3). togglePin adds or removes, returns the list and dispatches window 'small:pinned'.
- Produces: COMMANDS.pin and COMMANDS.unpin (risk 'undo', touchesLive false). Result {message: 'Pinned · <title>' | 'Unpinned · <title>' | 'Already pinned · <title>' | 'Not pinned · <title>', undoable: changed, data: {slug, changed}}. A repeat is a no-op, and undo reverses only a real change.

- [ ] **Step 1: Extend the test first: import, the risk table, and one new test**

```js
// commands.test.mjs: below the line  import { canvasKeys } from '../home/canvas-local.js';  add
import { readPinned } from '../home/pinned.js';

// commands.test.mjs: in 'risk comes from the registry and matches T02 §7.2', replace the line
//     undo: ['create_canvas', 'set_theme'],
// with
    undo: ['create_canvas', 'pin', 'set_theme', 'unpin'],

// commands.test.mjs: append at the end of the file
test('pin and unpin change the device list once, name what changed, and Undo reverses only a real change', async () => {
  const ctx = { ...CTX, storage: memory() };
  let heard = 0;
  window.addEventListener('small:pinned', () => { heard += 1; });
  assert.deepEqual(await executeCommand('pin', { slug: 'repo-1a2b3c4d-nanogpt' }, ctx), { message: 'Pinned · karpathy/nanoGPT', undoable: true, data: { slug: 'repo-1a2b3c4d-nanogpt', changed: true } });
  assert.deepEqual(await executeCommand('pin', { slug: 'repo-1a2b3c4d-nanogpt' }, ctx), { message: 'Already pinned · karpathy/nanoGPT', undoable: false, data: { slug: 'repo-1a2b3c4d-nanogpt', changed: false } });
  const unpinned = await executeCommand('unpin', { slug: 'repo-1a2b3c4d-nanogpt' }, ctx);
  assert.deepEqual(unpinned, { message: 'Unpinned · karpathy/nanoGPT', undoable: true, data: { slug: 'repo-1a2b3c4d-nanogpt', changed: true } });
  await COMMANDS.unpin.undo(unpinned, ctx);
  assert.deepEqual(readPinned(ctx.storage, 'gmail-com', 'a@gmail.com'), ['repo-1a2b3c4d-nanogpt']);
  const noop = await executeCommand('unpin', { slug: 'counter' }, ctx);
  assert.deepEqual(noop, { message: 'Not pinned · counter', undoable: false, data: { slug: 'counter', changed: false } });
  await COMMANDS.unpin.undo(noop, ctx);
  assert.deepEqual(readPinned(ctx.storage, 'gmail-com', 'a@gmail.com'), ['repo-1a2b3c4d-nanogpt']);
  assert.equal(heard, 3);
});
```

- [ ] **Step 2: Run and see the two new expectations fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/agent/commands.test.mjs
```

Expected: tests 18, pass 16, fail 2: 'risk comes from the registry and matches T02 §7.2' (pin and unpin missing) and the new pin test (COMMANDS has no pin). Verified in the scratch mirror.

- [ ] **Step 3: Add pin and unpin to the registry**

```js
// commands.js: below the line  import { canvasKeys, deviceId, hasLocalContent } from '../home/canvas-local.js';  add
import { readPinned, togglePin } from '../home/pinned.js';

// commands.js: directly above the line  // ponytail: the 'opens a screen only' actions of §7.2 have no entry; ...  add
// Pinned is device-local (T02 §2); togglePin announces small:pinned so the sidebar re-reads.
// Never toggle blindly: a repeat changes nothing, and Undo reverses only a real change.
function pinCommand(on) {
  return {
    risk: 'undo',
    touchesLive: false,
    available: ok,
    run: async ({ slug }, ctx) => {
      const changed = readPinned(ctx.storage, ctx.org, ctx.email).includes(slug) !== on;
      if (changed) togglePin(ctx.storage, ctx.org, ctx.email, slug);
      const verb = changed ? (on ? 'Pinned' : 'Unpinned') : on ? 'Already pinned' : 'Not pinned';
      return { message: `${verb} · ${titleFor(ctx, slug)}`, undoable: changed, data: { slug, changed } };
    },
    undo: async ({ data }, ctx) => {
      if (data.changed) togglePin(ctx.storage, ctx.org, ctx.email, data.slug);
    },
  };
}

// commands.js: inside COMMANDS, directly below the line
//   new_thread: { risk: 'immediate', touchesLive: false, available: ok, run: async () => ({ resetThread: true }) },
// add
  pin: pinCommand(true),
  unpin: pinCommand(false),
```

- [ ] **Step 4: Run the test file, then the full web suite**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/agent/commands.test.mjs && npm run test:unit
```

Expected: First run: tests 18, pass 18, fail 0. Full suite: fail 0, one more pass than before this task.

- [ ] **Step 5: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git add packages/web/src/agent/commands.js packages/web/src/agent/commands.test.mjs && git commit --only -m 'feat(agent): pin and unpin commands on the device list' -- packages/web/src/agent/commands.js packages/web/src/agent/commands.test.mjs
```

Expected: make test-unit (run.sh:99-106) passes every suite: pytest tests/unit_tests (31 at baseline), web npm run test:unit, control-plane npm test (326/326 at baseline, run 2026-09-23) and the two viz-benchmarks checks. git show --stat HEAD lists exactly these 2 files. The message has no double quotes and no Co-Authored-By line.

---

### Task 15: G5: model-backed live reads stay off on the preview (flags.aiReadsOnPreview, the find commands, and the three existing AI find calls)

*Area:* Agent Bar logic (pure modules) · *Brief:* T05 · *Order:* 4.2

**Files:**
- `packages/web/src/flags.js`
- `packages/web/src/flags.test.mjs`
- `packages/web/src/agent/commands.js`
- `packages/web/src/agent/commands.test.mjs`
- `packages/web/src/Search.jsx`
- `packages/web/src/App.jsx`
- `packages/web/src/run.jsx`
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: flags.js and flags.test.mjs (order 1); commands.js with COMMANDS, executeCommand and D7_REASON (order 4); the harness base with check, must, open and loaded (order 0.5).
- Produces: flags.js exports aiReadsOnPreview = false and aiFindAllowed(preview = learnPreview). commands.js exports AI_READS_REASON. On dev builds find_apps_ai and find_runs_ai are unavailable and never call the API; Search.jsx, App.jsx and run.jsx skip /api/apps/find and /api/runs/find. The live build is unchanged. Local title search (search_resources) stays available.

- [ ] **Step 1: Write the failing unit tests**

```jsx
// ===== packages/web/src/flags.test.mjs: add aiFindAllowed and aiReadsOnPreview to the existing
// import from './flags.js', then append =====
test('model-backed live reads stay off on the preview until the user approves them (G5)', () => {
  assert.equal(aiReadsOnPreview, false);
  assert.equal(aiFindAllowed(false), true); // the live build keeps today's AI find
  assert.equal(aiFindAllowed(true), false); // the preview never calls the live model
});

// ===== packages/web/src/agent/commands.test.mjs: add AI_READS_REASON to the existing import from
// './commands.js', then append =====
test('G5: on the preview, model-backed find is unavailable and never reaches the network', async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...args) => { calls.push(args); throw new Error('no network in this test'); };
  try {
    const ctx = { devBuild: true, scope: { kind: 'app', slug: 'counter' }, catalog: [] };
    for (const name of ['find_apps_ai', 'find_runs_ai']) {
      assert.deepEqual(COMMANDS[name].available(ctx), { ok: false, reason: AI_READS_REASON }, name);
      assert.deepEqual(await executeCommand(name, { q: 'failed runs from yesterday morning' }, ctx), { message: AI_READS_REASON }, name);
    }
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});
```

- [ ] **Step 2: Run them and see them fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && npm run test:unit
```

Expected: FAIL: aiReadsOnPreview, aiFindAllowed and AI_READS_REASON are not exported yet.

- [ ] **Step 3: Implement the flag and the command guard**

```jsx
// ===== append to packages/web/src/flags.js =====
// G5 (Gate C, 2026-09-24): /api/apps/find and /api/runs/find each run a model on the live control
// plane (control-plane/src/index.js:595-638). Read-only is not isolated, so the preview never calls
// them until the user approves live model-backed reads. The live build is unchanged.
export const aiReadsOnPreview = false;
export const aiFindAllowed = (preview = learnPreview) => !preview || aiReadsOnPreview;

// ===== packages/web/src/agent/commands.js =====
// a) add aiReadsOnPreview to the existing import from '../flags.js'.
// b) directly below D7_REASON:
export const AI_READS_REASON = 'Model-backed search is off on this preview: it would call the live control plane.';
const AI_READS = new Set(['find_apps_ai', 'find_runs_ai']);
const aiReadsOff = (ctx) => ctx.devBuild && !aiReadsOnPreview;
// c) in find_apps_ai, replace `available: ok,` with:
    available: (ctx) => (aiReadsOff(ctx) ? { ok: false, reason: AI_READS_REASON } : { ok: true }),
// d) in find_runs_ai, replace its available line with:
    available: (ctx) => (aiReadsOff(ctx) ? { ok: false, reason: AI_READS_REASON }
      : ctx.scope?.kind === 'app' ? { ok: true } : { ok: false, reason: 'Open an app to search its runs.' }),
// e) in executeCommand, directly after `if (unsupported) return { message: unsupported };`:
  if (AI_READS.has(name) && aiReadsOff(ctx)) return { message: AI_READS_REASON };
```

- [ ] **Step 4: Run the unit tests again**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && npm run test:unit
```

Expected: PASS, including the two G5 tests; every earlier test still passes.

- [ ] **Step 5: Write the failing e2e check (insert above the harness marker line)**

```jsx
{
  await check('G5: preview sentence searches never call the live model (/api/apps/find)', async () => {
    const page = await open();
    const hits = [];
    page.on('request', (r) => { if (/[/]api[/](apps|runs)[/]find$/.test(new URL(r.url()).pathname)) hits.push(r.url()); });
    await loaded(page);
    await page.keyboard.press('Control+k'); // Search.jsx:21
    await page.keyboard.type('apps that write logs to s3 every day');
    await page.waitForTimeout(1500); // Search.jsx debounces 600 ms before it calls the model
    must(hits.length === 0, `called ${hits.join(', ')}`);
    await page.context().close();
  });
}
```

- [ ] **Step 6: Run it against the clone, which still runs the previous build, and see it fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=G5 node e2e/rabbit-hole-check.mjs
```

Expected: FAIL on G5: the previous build still calls /api/apps/find for a four-word query.

- [ ] **Step 7: Gate the three existing AI find calls on dev builds**

```jsx
// ===== packages/web/src/Search.jsx: add the import, then change line 41 =====
import { aiFindAllowed } from './flags.js';
//     if (!open || q.trim().split(/\s+/).length < 4) { setAi(null); return; }
// becomes
    if (!open || !aiFindAllowed() || q.trim().split(/\s+/).length < 4) { setAi(null); return; }

// ===== packages/web/src/App.jsx: add the import, then change line 127 (anchor on the text) =====
import { aiFindAllowed } from './flags.js';
//     if (!search || search.trim().split(/\s+/).length < 4) { setAiFind(null); return; }
// becomes
    if (!search || !aiFindAllowed() || search.trim().split(/\s+/).length < 4) { setAiFind(null); return; }

// ===== packages/web/src/run.jsx: add the import, then change line 812 =====
import { aiFindAllowed } from './flags.js';
//     if (app.hosting === 'aws' || !q || q.trim().split(/\s+/).length < 4) { setAiRuns(null); return; }
// becomes
    if (app.hosting === 'aws' || !aiFindAllowed() || !q || q.trim().split(/\s+/).length < 4) { setAiRuns(null); return; }
```

- [ ] **Step 8: Deploy the clone and run the check green**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && key=$(node --input-type=module -e "import {readFileSync} from 'node:fs'; import {parseEnv} from 'node:util'; const key = parseEnv(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8')).TLDRAW_LICENSE_KEY; if (!key) throw new Error('Missing TLDRAW_LICENSE_KEY'); process.stdout.write(key);") && VITE_COACHING_DEV=true VITE_BYOC_DEV=true VITE_TLDRAW_LICENSE_KEY="$key" npm run build -- --outDir dist-dev && npx wrangler deploy --config wrangler.dev.jsonc --name small-cp-dev-smart-home && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=build,G5 node e2e/rabbit-hole-check.mjs
```

Expected: ok: build and ok: G5. Short queries still filter by name; sentence queries fall back to the same name filter.

- [ ] **Step 9: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && P='packages/web/src/flags.js packages/web/src/flags.test.mjs packages/web/src/agent/commands.js packages/web/src/agent/commands.test.mjs packages/web/src/Search.jsx packages/web/src/App.jsx packages/web/src/run.jsx packages/web/e2e/rabbit-hole-check.mjs' && git add $P && git commit --only $P -m 'feat(web): G5 keeps model-backed live reads off on the preview; local title search stays'
```

Expected: make test-unit is green; the commit contains exactly these eight paths.

---

### Task 16: Gate C G2 branch rule: the worker reports whether the default branch is real, and connect_repository stops and asks instead of assuming one

*Area:* Agent Bar logic (pure modules) · *Brief:* T06 · *Order:* 4.3

**Files:**
- `packages/lesson-renderer/repository_jobs.py`
- `packages/lesson-renderer/test_repository.py`
- `packages/web/src/agent/router.js`
- `packages/web/src/agent/router.test.mjs`
- `packages/web/src/agent/commands.js`
- `packages/web/src/agent/commands.test.mjs`
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: router.js rule 2 and GITHUB (order 3.35); commands.js connect_repository.resolve and the test fixture (reply, calls, CTX) (order 4); the harness base with base, session, UA, check and must (order 0.5).
- Produces: repository_jobs.py parse_refs(stdout) and listing(repo, default, branches, page); the branches response gains defaultBranchKnown (defaultBranch unchanged for RepositoryImport.jsx). router.js keeps an explicit /tree/<branch> as args.branch. commands.js exports noDefaultBranch(repo, branches); resolve() throws it when defaultBranchKnown === false and uses an explicit branch as given. The Start dialog inherits this because repositoryArgs() uses the router.

- [ ] **Step 1: Write the failing worker tests**

```js
# ===== append to packages/lesson-renderer/test_repository.py (above `if __name__`) and add
# `from repository_jobs import parse_refs, listing` next to the existing import =====
SHA = 'a' * 40

class BranchTests(unittest.TestCase):
    def test_a_default_github_names_is_known(self):
        default, branches = parse_refs(f'ref: refs/heads/dev\tHEAD\n{SHA}\tHEAD\n{SHA}\trefs/heads/dev\n{SHA}\trefs/heads/alpha\n')
        out = listing('o/r', default, branches, 1)
        self.assertEqual(out['defaultBranch'], 'dev')
        self.assertTrue(out['defaultBranchKnown'])

    def test_no_default_is_reported_not_invented(self):
        default, branches = parse_refs(f'{SHA}\trefs/heads/zeta\n{SHA}\trefs/heads/alpha\n')
        out = listing('o/r', default, branches, 1)
        self.assertFalse(out['defaultBranchKnown'])
        self.assertEqual(out['defaultBranch'], 'alpha')  # kept for RepositoryImport.jsx:14
        self.assertEqual(out['branches'], ['alpha', 'zeta'])
```

- [ ] **Step 2: Run them and see them fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/lesson-renderer && python -m unittest test_repository -v
```

Expected: ERROR: cannot import name parse_refs from repository_jobs.

- [ ] **Step 3: Extract parse_refs and listing, and report defaultBranchKnown**

```js
# ===== packages/lesson-renderer/repository_jobs.py =====
# a) add below the JOBS/LOCK/SLOT line:
def parse_refs(stdout):
    '''Branches from `git ls-remote --symref`, and the default GitHub names (None when HEAD has no symref).'''
    branches = {}; default = None
    for line in stdout.splitlines():
        if line.startswith('ref: refs/heads/') and line.endswith('\tHEAD'): default = line.split('\t')[0][len('ref: refs/heads/'):]
        else:
            parts = line.split('\t')
            if len(parts) == 2 and parts[1].startswith('refs/heads/') and re.fullmatch('[a-f0-9]{40}', parts[0]): branches[parts[1][11:]] = parts[0]
    return default, branches

def listing(repo, default, branches, page):
    names = sorted(branches)
    # defaultBranch keeps its old fallback, because RepositoryImport.jsx:14 preselects it.
    # defaultBranchKnown says whether GitHub named one, so the Agent Bar stops and asks
    # instead of assuming a branch (Gate C G2).
    return {'repo': repo, 'defaultBranch': default or names[0], 'defaultBranchKnown': default is not None,
            'branches': names[(page - 1) * 100:page * 100], 'hasMore': len(names) > page * 100, 'page': page}

# b) in metadata(), replace the inline parse (from `branches={};default=None` through the
#    `for line in result.stdout.splitlines():` loop) with:
        default,branches=parse_refs(result.stdout)
# c) and replace the final send line
#        page=max(1,min(100,int(body.get('page',1))));names=sorted(branches)
#        handler.send_json({'repo':repo,'defaultBranch':default or names[0],...})
#    with:
        page=max(1,min(100,int(body.get('page',1))))
        handler.send_json(listing(repo,default,branches,page))
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/lesson-renderer && python -m unittest test_repository -v
```

Expected: OK: the three existing tests and the two new ones pass.

- [ ] **Step 4: Write the failing client tests**

```js
// ===== append to packages/web/src/agent/commands.test.mjs, and add noDefaultBranch to its import =====
test('Gate C G2: a repository without a known default branch stops and asks; nothing is assumed', async () => {
  reply = () => ({ body: { repo: 'o/r', defaultBranch: 'alpha', defaultBranchKnown: false, branches: ['alpha', 'zeta'], hasMore: false, page: 1 } });
  await assert.rejects(prepareCommand('connect_repository', { url: 'https://github.com/o/r', repo: 'o/r' }, CTX), { message: noDefaultBranch('o/r', ['alpha', 'zeta']) });
  assert.equal(calls.some((c) => c.path === '/api/repositories' && c.method === 'POST'), false);
});

test('Gate C G2: an explicit branch link is used as given', async () => {
  reply = () => ({ body: { repo: 'o/r', defaultBranch: 'alpha', defaultBranchKnown: false, branches: ['alpha', 'zeta'], hasMore: false, page: 1 } });
  const prepared = await prepareCommand('connect_repository', { url: 'https://github.com/o/r', repo: 'o/r', branch: 'zeta' }, CTX);
  assert.equal(prepared.args.branch, 'zeta');
});

// ===== append to packages/web/src/agent/router.test.mjs =====
test('rule 2: a GitHub branch link carries its branch; credentials never do (Gate C G2)', () => {
  assert.deepEqual(at('connect https://github.com/o/r/tree/feature/x'), { type: 'command', name: 'connect_repository', args: { url: 'https://github.com/o/r', repo: 'o/r', branch: 'feature/x' } });
  assert.deepEqual(at('https://user:token@github.com/o/r'), connect('o/r'));
});
```

- [ ] **Step 5: Run them and see them fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && npm run test:unit
```

Expected: FAIL: noDefaultBranch is not exported, and the router drops /tree/feature/x.

- [ ] **Step 6: Keep an explicit branch in the router, and stop instead of assuming in resolve()**

```js
// ===== packages/web/src/agent/router.js =====
// a) append the optional branch group to GITHUB (the owner/repo groups are unchanged):
const GITHUB = /(?:^|[\s(<"'])(?:https?:\/\/)?(?:[^\s/@]+@)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/tree\/([^\s?#<>"')]+))?/i;
// b) in rule 2, replace
//     return command('connect_repository', { url: `https://github.com/${repo}`, repo });
// with
    return command('connect_repository', { url: `https://github.com/${repo}`, repo, ...(github[3] ? { branch: decodeURIComponent(github[3]) } : {}) });
// and update the GITHUB comment: owner/repository, plus an explicit /tree/<branch>, are kept;
// credentials before '@' never are.

// ===== packages/web/src/agent/commands.js =====
// a) next to D7_REASON:
export const noDefaultBranch = (repo, branches) => `${repo} has no default branch, so none was assumed. Paste the link to the branch you want, for example https://github.com/${repo}/tree/${branches[0]}. Branches: ${branches.slice(0, 8).join(', ')}${branches.length > 8 ? ', …' : ''}.`;
// b) replace connect_repository.resolve with:
    resolve: async ({ url, repo, branch }) => {
      let meta;
      try {
        meta = await api(`/api/repositories/branches?url=${encodeURIComponent(url)}`);
      } catch (error) {
        throw Error(/not found/i.test(error.message) ? `Can't connect ${repo}: no public repository found there. Private repositories aren't supported yet; public GitHub works.` : error.message);
      }
      // An explicit /tree/<branch> link is used as given; the import validates it (repository_jobs.py 'Branch not found').
      if (branch) return { url, repo, branch };
      // Gate C G2: never assume a branch. Before the worker is redeployed the field is absent,
      // which keeps today's behaviour; once deployed, a repository GitHub names no default for stops here.
      if (meta.defaultBranchKnown === false) throw Error(noDefaultBranch(repo, meta.branches));
      return { url, repo, branch: meta.defaultBranch };
    },
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && npm run test:unit
```

Expected: PASS, including every earlier router and commands test (connect() still matches bare repository links).

- [ ] **Step 7: Redeploy gate 1 and 2: unit tests green, and the change is additive only**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/lesson-renderer && python -m unittest test_repository test_validation -v && cd ../.. && git diff --stat main -- packages/lesson-renderer && git diff main -- packages/lesson-renderer/repository_jobs.py
```

Expected: All lesson-renderer tests pass. The diff touches only repository_jobs.py and test_repository.py; in repository_jobs.py it only extracts parse_refs and listing and adds defaultBranchKnown. server.py, compile_scene.py, validation.py and index_repository.py (rendering and indexing) are unchanged. If anything else changed, stop.

- [ ] **Step 8: Redeploy gate 3: notify every peer session that uses the shared worker**

Run:
```bash
ListAgents, then SendMessage to every listed peer session: 'small-lesson-renderer-dev (Fly) will be redeployed from feature/smart-home. Additive only: /repository-metadata gains defaultBranchKnown; defaultBranch, scene rendering and indexing are unchanged. Reply here if you are mid-run on that worker.'
```

Expected: Every peer session is notified; a held or refused delivery is reported to the user rather than treated as consent.

- [ ] **Step 9: Redeploy gate 4: show the user the exact command and target, and wait for their go-ahead**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/lesson-renderer && fly deploy --config fly.dev.toml --app small-lesson-renderer-dev
```

Expected: Show this exact command and the target (Fly app small-lesson-renderer-dev, from fly.dev.toml:1; form from docs/features/learn-math-animation.md:58) to the user immediately before running it, and run it only on their explicit yes. Fly then reports the new release.

- [ ] **Step 10: Add the e2e check above the harness marker and run it**

```js
{
  await check('G2-branch: the repository worker says whether the default branch is real', async () => {
    const r = await fetch(`${base}/api/repositories/branches?url=${encodeURIComponent('https://github.com/karpathy/nanoGPT')}`, { headers: { ...UA, Cookie: `small_session=${session}` } });
    must(r.ok, `HTTP ${r.status}`);
    const meta = await r.json();
    must(meta.defaultBranchKnown === true && typeof meta.defaultBranch === 'string', `got ${JSON.stringify({ defaultBranch: meta.defaultBranch, defaultBranchKnown: meta.defaultBranchKnown })}`);
  });
}
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=G2-branch node e2e/rabbit-hole-check.mjs
```

Expected: ok: G2-branch (karpathy/nanoGPT reports defaultBranchKnown true). Before the worker deploy the same check fails because the field is absent.

- [ ] **Step 11: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && P='packages/lesson-renderer/repository_jobs.py packages/lesson-renderer/test_repository.py packages/web/src/agent/router.js packages/web/src/agent/router.test.mjs packages/web/src/agent/commands.js packages/web/src/agent/commands.test.mjs packages/web/e2e/rabbit-hole-check.mjs' && git add $P && git commit --only $P -m 'feat(repositories): report whether the default branch is real; connect stops and asks instead of assuming one'
```

Expected: make test-unit is green; the commit contains exactly these seven paths.

---

### Task 17: T12 prep: canvases table in repository-schema.sql, announce it to peers, apply it to the shared small-learn-dev with a verified command, and verify it with a sqlite_master SELECT

*Area:* Canvas record (LEARN_DB) and dev worker · *Brief:* T12 · *Order:* 5

**Files:**
- `packages/control-plane/test/canvases.test.js`
- `packages/control-plane/repository-schema.sql`

**Interfaces:**
- Consumes: packages/web/wrangler.dev.jsonc:80-84 (binding, name, id); wrangler 4.129.0 help output
- Produces: The canvases table exists in small-learn-dev (LEARN_DB). A recorded verification SELECT result is the gate for any clone deploy that contains Task 6.4 wiring. No live D1 change.

- [ ] **Step 1: Write the failing schema test (new file)**

```js
// packages/control-plane/test/canvases.test.js (new file)
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');

// small-learn-dev already holds the older tables and the whole file is applied to it
// again (T12 prep), so the file must stay additive and re-runnable.
test('repository-schema.sql adds the canvases table (T02 section 8.1) and re-applies cleanly', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  sqlite.exec(schema); sqlite.exec(schema);
  assert.deepEqual(sqlite.prepare('PRAGMA table_info(canvases)').all().map(c => c.name), ['id', 'org', 'name', 'owner_email', 'title', 'project', 'created_at', 'archived_at', 'device_id']);
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','owner@test','A')");
  assert.throws(() => sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('team','canvas-0a1b2c3d','other@test','B')"), /UNIQUE/);
  assert.ok(sqlite.prepare('SELECT created_at FROM canvases').get().created_at);
});
```

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home/packages/control-plane && node --test test/canvases.test.js
```

Expected: FAIL, 0 pass 1 fail: AssertionError 'Expected values to be strictly deep-equal', actual [] (no canvases table yet)

- [ ] **Step 2: Append the canvases table to the LEARN_DB schema (after line 26; keep CRLF)**

```sql
-- packages/control-plane/repository-schema.sql (append after line 26)
CREATE TABLE IF NOT EXISTS canvases (
 id INTEGER PRIMARY KEY, org TEXT NOT NULL, name TEXT NOT NULL,
 owner_email TEXT NOT NULL, title TEXT NOT NULL, project TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), archived_at TEXT,
 device_id TEXT, UNIQUE(org,name)
);
```

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home/packages/control-plane && node --test test/canvases.test.js test/repositories.test.js && npm test
```

Expected: canvases 1 pass; repositories 13 pass (the shared schema still loads); npm test 327 pass (326 baseline + 1), 0 fail

- [ ] **Step 3: Commit the schema first, so the applied file equals a committed file**

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git status --short && git add packages/control-plane/repository-schema.sql packages/control-plane/test/canvases.test.js && git commit --only packages/control-plane/repository-schema.sql packages/control-plane/test/canvases.test.js -m 'feat(canvases): canvases table in the LEARN_DB schema, additive and re-runnable'
```

Expected: make test-unit green; one commit containing exactly these two paths (any path another agent staged stays staged and uncommitted)

- [ ] **Step 4: Announce the schema change to every peer session before applying it (parallel-dev-deploys.md Rules). Run the command: it prints the announcement with the commit computed from git (the last commit that touched repository-schema.sql, i.e. the file being applied). Call ListAgents; load SendMessage with ToolSearch 'select:SendMessage'; send the printed text unchanged to each listed session; and show the same text to the user.**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && sha=$(git log -1 --format=%h -- packages/control-plane/repository-schema.sql) && cat <<EOF
Schema change on the SHARED dev D1 small-learn-dev (binding LEARN_DB, id 433385b6-dba7-49c1-98ce-d4599feef5c0), from the smart-home worktree (branch feature/smart-home).
What: re-apply packages/control-plane/repository-schema.sql at commit $sha. The only new statement is CREATE TABLE IF NOT EXISTS canvases (id, org, name, owner_email, title, project, created_at, archived_at, device_id, UNIQUE(org,name)).
Effect: additive only. Every statement in the file is IF NOT EXISTS; no existing table, column or row changes. The live D1 small is not touched.
Timing: applying next. small-learn-dev may be unavailable for a few seconds while the file imports.
Action for you: none, unless you are also changing repository-schema.sql or LEARN_DB tables. If so, reply now.
EOF
```

Expected: Five printed lines; the 'What:' line names the short sha of the commit made in the previous step (git log -1 -- repository-schema.sql resolves to it). Every session that ListAgents returns has received exactly that text, and the user has seen it. An empty listing means the user's copy is the announcement.

- [ ] **Step 5: Pre-check, read-only. The user runs this via '!' to prove the command targets small-learn-dev and not live 'small'.**

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home/packages/web; npx wrangler d1 execute small-learn-dev --remote --config wrangler.dev.jsonc --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

Expected: The table list includes repository_apps and repository_versions (repository-schema.sql:1-9) and does NOT include canvases. STOP if apps, runs or proposals appear: those are live-only tables (schema.sql:1, 104, 140), so the command is pointed at the live database.

- [ ] **Step 6: Apply. The user runs this via '!'. -y answers wrangler's remote-import prompt, because the '!' shell is non-interactive.**

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home/packages/web; npx wrangler d1 execute small-learn-dev --remote --config wrangler.dev.jsonc --file ../control-plane/repository-schema.sql -y
```

Expected: wrangler reports that the file executed against small-learn-dev (database_id 433385b6-dba7-49c1-98ce-d4599feef5c0). A trailing 'Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)' line is harmless Windows exit noise.

- [ ] **Step 7: Verify. The user runs this via '!'. This result is the deploy gate for Task 6.4.**

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home/packages/web; npx wrangler d1 execute small-learn-dev --remote --config wrangler.dev.jsonc --command "SELECT name, sql FROM sqlite_master WHERE type='table' AND name='canvases'"
```

Expected: Exactly one row: name canvases, with sql containing device_id TEXT and UNIQUE(org,name). Record it in the session and send peers a one-line follow-up that the table is applied. Until this row is seen, no clone may deploy a dev-worker.js that contains Task 6.4.

---

### Task 18: Owner-only canvas record API in LEARN_DB: create, get, rename, archive, restore, GET /api/canvases[?archived=1], untouched-only DELETE, learn-course stub

*Area:* Canvas record (LEARN_DB) and dev worker · *Brief:* T06 · *Order:* 6.1

**Files:**
- `packages/control-plane/test/canvases.test.js`
- `packages/control-plane/src/canvases.js`

**Interfaces:**
- Consumes: repositoryIdentity (repositories.js:23-32); canvases table from order 5
- Produces: canvases.js exports canvasApp(row,user), canvasAccess(req,env,name), ownerCanvases(env,user,archived) and canvasesFetch(req,env). Endpoints: POST /api/canvases {title?, project?, device_id?} -> 201 canvas object (kind 'canvas', device_id; title max 120 characters, default 'Untitled canvas'; device_id must match /^[A-Za-z0-9-]{8,64}$/, so crypto.randomUUID works). GET /api/canvases -> {canvases} non-archived, and ?archived=1 -> archived; both list the caller's own canvases only. GET/PATCH {title} /api/apps/canvas-<8hex>. POST /api/apps/canvas-*/archive and /restore. DELETE /api/apps/canvas-* -> 200 {ok:true} only while no LEARN_DB thread has scope_ref = name, otherwise 405 {error:'This canvas has been used. Archive it instead.'}. Non-owner -> 403 {error:'This canvas is private to its owner'}. GET /api/apps/canvas-*/learn-course -> {course:null,revision:0,canAuthor:false}.

- [ ] **Step 1: Add the failing CRUD tests: one import line, then a fixture plus two tests appended to the file**

```js
// packages/control-plane/test/canvases.test.js
// (1) insert after the line: import { readFileSync } from 'node:fs';
import { canvasesFetch } from '../src/canvases.js';

// (2) append at the end of the file:

// ---- canvas record API (Task 6.1) ----
// LEARN_DB is real SQLite from repository-schema.sql. The live DB throws on any use,
// so a passing test proves canvas routes never touch live D1.
function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close()); sqlite.exec(schema);
  sqlite.exec("INSERT INTO repository_apps(org,name,owner_email,repo,branch) VALUES('team','repo-example','owner@test','example/project','main')");
  const db = { prepare: sql => { let args = []; const stmt = sqlite.prepare(sql); return { bind(...v) { args = v; return this; }, first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: async () => ({ meta: stmt.run(...args) }) }; }, batch: async statements => Promise.all(statements.map(s => s.run())) };
  const seen = [];
  const env = { LEARN_DB: db, DB: { prepare() { throw Error('live D1 touched'); }, batch() { throw Error('live D1 touched'); } },
    CONTROL_PLANE: { fetch: async req => { seen.push(`${req.method} ${new URL(req.url).pathname}`); return req.headers.get('cookie') === 'denied' ? new Response('', { status: 401 }) : Response.json({ org: req.headers.get('x-small-workspace') || 'team', email: req.headers.get('x-email') || 'owner@test', orgName: 'Team', apps: [] }); } } };
  const send = (method, path, body, headers = {}) => canvasesFetch(new Request(`https://dev.test${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
  return { sqlite, env, seen, send };
}
const colleague = { 'x-email': 'colleague@test' };

test('canvas records live in LEARN_DB, open for their owner only, and never touch live D1', async t => {
  const f = fixture(t);
  const created = await f.send('POST', '/api/canvases', { title: '  Attention  ', device_id: '3f0c9a2e-7b1d-4c55-9e0a-2d4f6b8c1e3a' });
  assert.equal(created.status, 201);
  const canvas = await created.json();
  assert.match(canvas.name, /^canvas-[a-f0-9]{8}$/);
  assert.deepEqual([canvas.title, canvas.kind, canvas.url, canvas.project, canvas.owner_email, canvas.archived_at], ['Attention', 'canvas', `/apps/${canvas.name}`, null, 'owner@test', null]);
  assert.equal(canvas.device_id, '3f0c9a2e-7b1d-4c55-9e0a-2d4f6b8c1e3a');
  assert.equal((await (await f.send('POST', '/api/canvases', {})).json()).title, 'Untitled canvas');
  assert.equal((await (await f.send('POST', '/api/canvases', { title: 'Graphs', project: 'repo-example' })).json()).project, 'repo-example');
  assert.equal((await f.send('POST', '/api/canvases', { title: 'x'.repeat(121) })).status, 400);
  assert.equal((await f.send('POST', '/api/canvases', { title: 'A', project: 'repo-missing' })).status, 404);
  assert.equal((await f.send('POST', '/api/canvases', { title: 'A', device_id: '../../x' })).status, 400);
  assert.equal((await f.send('GET', `/api/apps/${canvas.name}`)).status, 200);
  const other = await f.send('GET', `/api/apps/${canvas.name}`, null, colleague);
  assert.equal(other.status, 403); assert.equal((await other.json()).error, 'This canvas is private to its owner');
  assert.equal((await f.send('GET', `/api/apps/${canvas.name}`, null, { 'x-small-workspace': 'other' })).status, 404);
  assert.equal((await f.send('GET', `/api/apps/${canvas.name}`, null, { cookie: 'denied' })).status, 401);
  assert.ok(f.seen.every(call => call === 'GET /api/apps'), f.seen.join());
});

test('rename keeps the slug, archive hides, the archived list is owner-only, restore returns, and DELETE removes only an untouched canvas', async t => {
  const f = fixture(t);
  const { name } = await (await f.send('POST', '/api/canvases', { title: 'Draft' })).json();
  const list = async (archived, headers) => (await (await f.send('GET', `/api/canvases${archived ? '?archived=1' : ''}`, null, headers)).json()).canvases.map(c => c.name);
  const renamed = await (await f.send('PATCH', `/api/apps/${name}`, { title: 'Transformers' })).json();
  assert.deepEqual([renamed.title, renamed.name], ['Transformers', name]);
  assert.equal((await f.send('PATCH', `/api/apps/${name}`, { title: '  ' })).status, 400);
  assert.equal((await f.send('PATCH', `/api/apps/${name}`, { title: 'Mine now' }, colleague)).status, 403);
  assert.deepEqual(await list(false), [name]);
  assert.ok((await (await f.send('POST', `/api/apps/${name}/archive`)).json()).archived_at);
  assert.deepEqual(await list(false), []); assert.deepEqual(await list(true), [name]);
  assert.deepEqual(await list(true, colleague), []);
  assert.equal((await f.send('POST', `/api/apps/${name}/restore`, null, colleague)).status, 403);
  assert.equal((await (await f.send('POST', `/api/apps/${name}/restore`)).json()).archived_at, null);
  assert.deepEqual(await list(false), [name]);
  f.sqlite.prepare("INSERT INTO threads(id,org,user,scope_ref,commit_sha) VALUES('canvaschat-1','team','owner@test',?,'')").run(name);
  const used = await f.send('DELETE', `/api/apps/${name}`);
  assert.equal(used.status, 405); assert.equal((await used.json()).error, 'This canvas has been used. Archive it instead.');
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvases').get().n, 1);
  const untouched = (await (await f.send('POST', '/api/canvases', { title: 'Undo me' })).json()).name;
  assert.equal((await f.send('DELETE', `/api/apps/${untouched}`, null, colleague)).status, 403);
  assert.equal((await f.send('DELETE', `/api/apps/${untouched}`)).status, 200);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvases WHERE name=?').get(untouched).n, 0);
  assert.deepEqual(await (await f.send('GET', `/api/apps/${name}/learn-course`)).json(), { course: null, revision: 0, canAuthor: false });
  assert.equal((await f.send('POST', `/api/apps/${name}/learn-course`, { action: 'draft' })).status, 405);
});
```

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home/packages/control-plane && node --test test/canvases.test.js
```

Expected: FAIL: ERR_MODULE_NOT_FOUND, Cannot find module ...src/canvases.js

- [ ] **Step 2: Create canvases.js with the record API**

```js
// packages/control-plane/src/canvases.js (new file)
import { repositoryIdentity } from './repositories.js';

// Dev-only canvas records (T02 section 8). A row is identity and title only; the
// canvas content stays in the learner's browser under small.adaptive-canvas:*.
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const TITLE = 120;

// Shape mirrors repositoryApp (repositories.js:33-36) so Learn and the catalog read it unchanged.
export function canvasApp(row, user) {
  return { ...row, kind: 'canvas', hosting: 'canvas', email: user.email, orgName: user.orgName, visibility: 'private', members: [],
    canView: true, canEdit: row.owner_email === user.email, url: `/apps/${row.name}`, inputs: {}, outputs: {} };
}
function canvasTitle(value) {
  if (typeof value !== 'string' || value.trim().length > TITLE) throw Error(`Use a title of up to ${TITLE} characters`);
  return value.trim();
}
async function ownedCanvas(env, user, name) {
  const row = await env.LEARN_DB.prepare('SELECT * FROM canvases WHERE org=? AND name=?').bind(user.org, name).first();
  if (!row) return json({ error: 'Canvas not found in this workspace' }, 404);
  if (row.owner_email !== user.email) return json({ error: 'This canvas is private to its owner' }, 403);
  return canvasApp(row, user);
}
export async function canvasAccess(req, env, name) {
  const user = await repositoryIdentity(req, env);
  return user instanceof Response ? user : ownedCanvas(env, user, name);
}
// The caller's own canvases only (owner-only in phase 1, section 8.2).
export async function ownerCanvases(env, user, archived = false) {
  const { results } = await env.LEARN_DB.prepare(`SELECT * FROM canvases WHERE org=? AND owner_email=? AND archived_at IS ${archived ? 'NOT ' : ''}NULL ORDER BY created_at DESC, id DESC`).bind(user.org, user.email).all();
  return results.map(row => canvasApp(row, user));
}

export async function canvasesFetch(req, env) {
  const url = new URL(req.url), path = url.pathname, db = env.LEARN_DB;
  const user = await repositoryIdentity(req, env); if (user instanceof Response) return user;
  try {
    if (path === '/api/canvases') {
      if (req.method === 'GET') return json({ canvases: await ownerCanvases(env, user, url.searchParams.get('archived') === '1') });
      if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      const body = await req.json();
      const title = canvasTitle(body.title ?? '') || 'Untitled canvas', project = body.project ?? null, device = body.device_id ?? null;
      if (device !== null && !(typeof device === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(device))) throw Error('Invalid device id');
      if (project !== null && !(typeof project === 'string' && await db.prepare('SELECT 1 FROM repository_apps WHERE org=? AND name=?').bind(user.org, project).first())) return json({ error: 'Project not found in this workspace' }, 404);
      // ponytail: no per-owner canvas cap (repositories cap 25 per workspace); add one if dev rows grow unbounded.
      const row = await db.prepare('INSERT INTO canvases(org,name,owner_email,title,project,device_id) VALUES(?,?,?,?,?,?) RETURNING *')
        .bind(user.org, `canvas-${crypto.randomUUID().slice(0, 8)}`, user.email, title, project, device).first();
      return json(canvasApp(row, user), 201);
    }
    const match = path.match(/^\/api\/apps\/(canvas-[a-f0-9]{8})(?:\/(archive|restore|learn-course))?$/);
    if (!match) return json({ error: 'Not found' }, 404);
    const [, name, action] = match;
    const app = await ownedCanvas(env, user, name); if (app instanceof Response) return app;
    // Learn loads a course on mount (LearnCourse.jsx:22-27); canvases have none. Shape of learn-course.js:67.
    if (action === 'learn-course') return req.method === 'GET' ? json({ course: null, revision: 0, canAuthor: false }) : json({ error: 'Courses are not available on canvases' }, 405);
    if (action) {
      if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
      await db.prepare(`UPDATE canvases SET archived_at=${action === 'archive' ? "datetime('now')" : 'NULL'} WHERE id=?`).bind(app.id).run();
      return json(await ownedCanvas(env, user, name));
    }
    if (req.method === 'GET') return json(app);
    if (req.method === 'PATCH') {
      const title = canvasTitle((await req.json()).title);
      if (!title) throw Error('Title required');
      await db.prepare('UPDATE canvases SET title=? WHERE id=?').bind(title, app.id).run();
      return json({ ...app, title });
    }
    if (req.method === 'DELETE') {
      // Undo only while untouched (section 8.4). One statement, so a thread started meanwhile keeps the canvas.
      const { meta } = await db.prepare('DELETE FROM canvases WHERE id=? AND NOT EXISTS (SELECT 1 FROM threads WHERE org=? AND scope_ref=?)').bind(app.id, user.org, name).run();
      return meta.changes ? json({ ok: true }) : json({ error: 'This canvas has been used. Archive it instead.' }, 405);
    }
    return json({ error: 'Method not allowed' }, 405);
  } catch (error) { return json({ error: error.message }, 400); }
}
```

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home/packages/control-plane && node --test test/canvases.test.js && npm test
```

Expected: canvases.test.js 3 pass, 0 fail; npm test 329 pass (326 + 3), 0 fail

- [ ] **Step 3: Commit**

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git status --short && git add packages/control-plane/src/canvases.js packages/control-plane/test/canvases.test.js && git commit --only packages/control-plane/src/canvases.js packages/control-plane/test/canvases.test.js -m 'feat(canvases): owner-only canvas records in LEARN_DB with archive, archived list and untouched delete'
```

Expected: make test-unit green; one commit, two paths

---

### Task 19: Learn resolves canvas-*: authorizedBoardApp branch, canvas chat history in LEARN_DB on the /api/ask/threads paths, dev routing predicate, attachment guard

*Area:* Canvas record (LEARN_DB) and dev worker · *Brief:* T06 · *Order:* 6.2

**Files:**
- `packages/control-plane/test/canvases.test.js`
- `packages/control-plane/src/repositories.js`
- `packages/control-plane/src/learn-board.js`
- `packages/control-plane/src/canvases.js`

**Interfaces:**
- Consumes: Task 6.1 canvases.js; repositoryThreads (repositories.js:161-167)
- Produces: authorizedBoardApp returns canvasApp to the owner (403 otherwise), so every Learn side endpoint works for canvases. canvases.js exports canvasRoute(url) and refuseCanvasAttachment(req). canvasesFetch serves canvas chat history, which is the path the bar's History uses for canvas scope: GET /api/ask/threads?scope=learn&ref=canvas-<8hex> -> {threads:[{id,title,created_at,commit_sha}]}; GET /api/ask/threads/canvaschat-<uuid> -> {id,messages:[{role,content}],commit:''}; POST /api/ask/threads/canvaschat-<uuid>/rename {title} -> {ok:true}; POST /api/ask/threads/canvaschat-<uuid>/delete -> {ok:true}. All are owner-only, and a non-owner list returns 403 'This canvas is private to its owner'. BAR HISTORY CONTRACT (v3, verbatim; agent-ui's bar.js threadsPath uses exactly this for scope.kind === 'canvas', replacing its v2 `return null`): list `/api/ask/threads?scope=learn&ref=${encodeURIComponent(scope.slug)}`; open `/api/ask/threads/${id}` (id is 'canvaschat-<uuid>'); rename POST `/api/ask/threads/${id}/rename` {title}; delete POST `/api/ask/threads/${id}/delete`. As one line: `if (scope.kind === 'canvas') return id ? `/api/ask/threads/${id}` : `/api/ask/threads?scope=learn&ref=${encodeURIComponent(scope.slug)}`;`. canvasRoute accepts both paths (the Task 6.2 routing test lists '/api/ask/threads?scope=learn&ref=canvas-0a1b2c3d' and '/api/ask/threads/canvaschat-1'); a slug of the form canvas-<8hex> is unchanged by encodeURIComponent.

- [ ] **Step 1: Add the failing tests (history, routing, attachments, board access)**

```js
// packages/control-plane/test/canvases.test.js
// (1) replace the line: import { canvasesFetch } from '../src/canvases.js';
// with:
import { canvasesFetch, canvasRoute, refuseCanvasAttachment } from '../src/canvases.js';
import { authorizedBoardApp } from '../src/learn-board.js';

// (2) append at the end of the file:

// ---- Learn resolves canvas-* (Task 6.2) ----
test('canvas chat history lists, reads, renames and deletes only the owner canvas threads in LEARN_DB', async t => {
  const f = fixture(t);
  const { name } = await (await f.send('POST', '/api/canvases', { title: 'Chat' })).json();
  f.sqlite.exec(`INSERT INTO threads(id,org,user,scope_ref,commit_sha,title) VALUES('canvaschat-a','team','owner@test','${name}','','First'),('canvaschat-b','team','owner@test','repo-example','','Repo'); INSERT INTO messages(thread_id,role,content) VALUES('canvaschat-a','user','Hi'),('canvaschat-a','assistant','Hello');`);
  assert.deepEqual((await (await f.send('GET', `/api/ask/threads?scope=learn&ref=${name}`)).json()).threads.map(x => x.id), ['canvaschat-a']);
  assert.deepEqual((await (await f.send('GET', '/api/ask/threads/canvaschat-a')).json()).messages.map(m => m.content), ['Hi', 'Hello']);
  assert.equal((await f.send('GET', `/api/ask/threads?scope=learn&ref=${name}`, null, colleague)).status, 403);
  assert.equal((await f.send('GET', '/api/ask/threads/canvaschat-a', null, colleague)).status, 404);
  assert.equal((await f.send('GET', '/api/ask/threads/canvaschat-b')).status, 404);
  assert.equal((await f.send('POST', '/api/ask/threads/canvaschat-a/rename', { title: 'Renamed' })).status, 200);
  assert.equal(f.sqlite.prepare("SELECT title FROM threads WHERE id='canvaschat-a'").get().title, 'Renamed');
  assert.equal((await f.send('POST', '/api/ask/threads/canvaschat-a/delete')).status, 200);
  assert.equal(f.sqlite.prepare("SELECT count(*) AS n FROM messages WHERE thread_id='canvaschat-a'").get().n, 0);
});

test('canvas traffic routes to LEARN_DB, canvas attachments are refused, and Learn endpoints resolve canvases', async t => {
  const f = fixture(t);
  for (const [url, expected] of [['/api/canvases', true], ['/api/canvases?archived=1', true], ['/api/apps/canvas-0a1b2c3d', true], ['/api/apps/canvas-0a1b2c3d/archive', true], ['/api/ask/threads/canvaschat-1', true], ['/api/ask/threads?scope=learn&ref=canvas-0a1b2c3d', true], ['/api/ask/threads?scope=learn&ref=counter', false], ['/api/ask/threads/42', false], ['/api/apps/counter', false], ['/api/apps', false], ['/api/apps/repo-x', false]])
    assert.equal(canvasRoute(new URL(url, 'https://dev.test')), expected, url);
  const form = app => { const body = new FormData(); body.set('body', JSON.stringify({ scope: { app }, message: 'Hi' })); body.set('file', new Blob(['x']), 'x.txt'); return new Request('https://dev.test/api/learn/ask', { method: 'POST', body }); };
  const refused = await refuseCanvasAttachment(form('canvas-0a1b2c3d'));
  assert.equal(refused.status, 400); assert.match((await refused.json()).error, /Attachments are not available on canvases yet/);
  assert.equal(await refuseCanvasAttachment(form('counter')), null);
  assert.equal(await refuseCanvasAttachment(new Request('https://dev.test/api/learn/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })), null);
  const { name } = await (await f.send('POST', '/api/canvases', { title: 'Board' })).json();
  const board = (headers = {}) => authorizedBoardApp(new Request('https://dev.test/api/learn/board', { headers }), f.env, name);
  const app = await board();
  assert.deepEqual([app.kind, app.org, app.name, app.email], ['canvas', 'team', name, 'owner@test']);
  assert.equal((await board(colleague)).status, 403);
  assert.ok(f.seen.every(call => call === 'GET /api/apps'), f.seen.join());
});
```

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home/packages/control-plane && node --test test/canvases.test.js
```

Expected: FAIL: SyntaxError, The requested module '../src/canvases.js' does not provide an export named 'canvasRoute'

- [ ] **Step 2: Export repositoryThreads, and add the authorizedBoardApp canvas-* branch after the repo- branch (content-anchored, CRLF)**

```js
// packages/control-plane/src/repositories.js:161, replace
async function repositoryThreads(req,db,user,app,id){
// with
export async function repositoryThreads(req,db,user,app,id){

// packages/control-plane/src/learn-board.js, immediately after these lines (361-364):
//   if (env.LEARN_DB && name.startsWith('repo-')) {
//     const { repositoryAccess } = await import('./repositories.js');
//     return repositoryAccess(req, env, name);
//   }
// insert:
  if (env.LEARN_DB && name.startsWith('canvas-')) {
    const { canvasAccess } = await import('./canvases.js');
    return canvasAccess(req, env, name);
  }
```

- [ ] **Step 3: Add routing, the attachment guard and the history block to canvases.js**

```js
// packages/control-plane/src/canvases.js
// (1) replace line 1 with:
import { repositoryIdentity, repositoryThreads } from './repositories.js';

// (2) insert immediately before: export async function canvasesFetch(req, env) {
// Which dev requests are canvas traffic. dev-worker.js cannot be imported under node, so the rule lives here, tested.
export function canvasRoute(url) {
  const path = url.pathname;
  return path === '/api/canvases' || /^\/api\/apps\/canvas-/.test(path) || /^\/api\/ask\/threads\/canvaschat-/.test(path)
    || (path === '/api/ask/threads' && /^canvas-/.test(url.searchParams.get('ref') || ''));
}
// Multipart asks skip the dev Learn router (dev-worker.js:72) and reach live small-cp, which stores the
// attachment in live R2 (index.js:954) before it finds no such app. Canvases refuse them here.
export async function refuseCanvasAttachment(req) {
  const path = new URL(req.url).pathname;
  if (req.method !== 'POST' || !['/api/ask', '/api/learn/ask', '/api/learn/selection'].includes(path) || !req.headers.get('content-type')?.includes('multipart/form-data')) return null;
  let app = null;
  try { app = JSON.parse((await req.clone().formData()).get('body') || '{}').scope?.app; } catch { /* live small-cp answers malformed bodies as today */ }
  return typeof app === 'string' && app.startsWith('canvas-') ? json({ error: 'Attachments are not available on canvases yet. Upload a PDF from the canvas menu.' }, 400) : null;
}

// (3) inside canvasesFetch, insert immediately before: const match = path.match(/^\/api\/apps\/(canvas-[a-f0-9]{8})
    // Learn's chat keeps its /api/ask/threads calls (ask.jsx:388,401,601,622); canvas history lives in LEARN_DB.
    const thread = path.match(/^\/api\/ask\/threads(?:\/(canvaschat-[a-f0-9-]+)(?:\/(delete|rename))?)?$/);
    if (thread) {
      const [, id, action] = thread;
      const ref = id ? (await db.prepare('SELECT scope_ref FROM threads WHERE id=? AND org=? AND user=?').bind(id, user.org, user.email).first())?.scope_ref : url.searchParams.get('ref');
      if (!ref) return json({ error: 'Chat not found' }, 404);
      const app = await ownedCanvas(env, user, ref); if (app instanceof Response) return app;
      return repositoryThreads(new Request(req, { method: action === 'delete' ? 'DELETE' : action === 'rename' ? 'PATCH' : req.method }), db, user, app, id);
    }
```

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home/packages/control-plane && node --test test/canvases.test.js test/repositories.test.js test/learn-board.test.js && npm test
```

Expected: canvases 5 pass; repositories 13 pass; learn-board all pass, unchanged; npm test 331 pass (326 + 5), 0 fail

- [ ] **Step 4: Commit**

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git status --short && git add packages/control-plane/src/canvases.js packages/control-plane/src/learn-board.js packages/control-plane/src/repositories.js packages/control-plane/test/canvases.test.js && git commit --only packages/control-plane/src/canvases.js packages/control-plane/src/learn-board.js packages/control-plane/src/repositories.js packages/control-plane/test/canvases.test.js -m 'feat(canvases): Learn resolves canvas-* from LEARN_DB, canvas chat history and attachment guard'
```

Expected: make test-unit green; one commit, four paths

---

### Task 20: apiAsk seam: canvas Learn asks are answered by the general tutor, with threads in LEARN_DB and zero env.DB access (keeps the no-env.DB-write test)

*Area:* Canvas record (LEARN_DB) and dev worker · *Brief:* T06 · *Order:* 6.3

**Files:**
- `packages/control-plane/test/learn-chat.test.js`
- `packages/control-plane/src/canvases.js`
- `packages/control-plane/src/index.js`

**Interfaces:**
- Consumes: Task 6.1 canvasApp and the canvases table; LEARN_DB threads/messages (repository-schema.sql:10-16)
- Produces: apiAsk(req, env, ctx, user, conversation = 'agent', seam = null) with seam = {app, context, db, findThread(id), newThread(title)}. canvases.js export canvasAskSeam(env, app). Canvas thread ids are 'canvaschat-<uuid>' in LEARN_DB threads (commit_sha '', scope_ref = canvas name).

- [ ] **Step 1: Write the failing test: the live DB throws on any use (content-anchored, CRLF)**

```js
// packages/control-plane/test/learn-chat.test.js
// (1) after the line: import { LEARN_SYSTEM, validateLessonSnapshot, validateOutline, renderOutline } from '../src/learn-context.js';
import { canvasApp, canvasAskSeam } from '../src/canvases.js';
// (2) in deps.askStream (line 29) replace
    env.answers.push({ history: [...history], question, context, toolOpts, system, org, blocks, research });
// with
    env.answers.push({ history: [...history], question, context, toolOpts, system, org, blocks, research, db: env.DB });
// (3) append at the end of the file:
test('canvas Learn asks keep their threads in LEARN_DB and never touch the live DB', async t => {
  const env = fixture(t);
  env.DB = { prepare: sql => { throw new Error(`live D1 touched: ${sql}`); }, batch: async () => { throw new Error('live D1 touched: batch'); } };
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  env.LEARN_DB = { batch: async statements => Promise.all(statements.map(statement => statement.run())), prepare: sql => ({ bind: (...params) => ({
    first: async () => sqlite.prepare(sql).get(...params) || null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    run: async () => ({ meta: sqlite.prepare(sql).run(...params) }),
  }) }) };
  sqlite.exec("INSERT INTO canvases(org,name,owner_email,title) VALUES('workspace-a','canvas-0a1b2c3d','owner@example.test','Attention'),('workspace-a','canvas-99999999','owner@example.test','Other')");
  const ask = (name, body, user = owner) => handlers.apiAsk(request({ scope: { app: name }, ...body }), env, {}, user, 'learn',
    canvasAskSeam(env, canvasApp(sqlite.prepare('SELECT * FROM canvases WHERE name=?').get(name), user)));
  const first = await (await ask('canvas-0a1b2c3d', { message: 'What is attention?' })).json();
  assert.match(String(first.threadId), /^canvaschat-/);
  assert.match(env.answers[0].context, /canvas "Attention"/);
  assert.equal(env.answers[0].system, LEARN_SYSTEM);
  assert.equal(env.answers[0].db, env.LEARN_DB, 'askStream gets LEARN_DB, so its moment log cannot reach live D1');
  assert.equal((await ask('canvas-0a1b2c3d', { message: 'And softmax?', thread_id: first.threadId })).status, 200);
  assert.deepEqual(env.answers[1].history.map(m => m.content), ['What is attention?', 'Answer: What is attention?']);
  await ask('canvas-0a1b2c3d', { message: 'Explain further', canvas_seed: { question: 'Q', answer: 'A' } });
  assert.deepEqual(env.answers[2].history.map(m => m.content), ['Q', 'A']);
  assert.equal((await ask('canvas-99999999', { message: 'Wrong canvas', thread_id: first.threadId })).status, 409);
  assert.equal((await ask('canvas-0a1b2c3d', { message: 'Not mine', thread_id: first.threadId }, { ...owner, email: 'colleague@example.test' })).status, 404);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM threads WHERE scope_ref='canvas-0a1b2c3d'").get().n, 2);
  assert.equal(env.answers.length, 3);
});
```

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home/packages/control-plane && node --test test/learn-chat.test.js
```

Expected: FAIL: SyntaxError, The requested module '../src/canvases.js' does not provide an export named 'canvasAskSeam'

- [ ] **Step 2: Add canvasAskSeam to canvases.js**

```js
// packages/control-plane/src/canvases.js (append at the end)

// apiAsk's seam (index.js): the app, its context and the thread store all come from LEARN_DB,
// so a canvas turn never reads or writes live D1. Threads reuse repository-schema.sql threads/messages.
export function canvasAskSeam(env, app) {
  const db = env.LEARN_DB;
  return {
    app, db,
    context: `SCOPE: canvas ${JSON.stringify(app.title)} - a standalone learning canvas whose content lives in the learner's browser. Teach as a general tutor.`,
    findThread: id => db.prepare("SELECT id, 'learn' AS scope, scope_ref FROM threads WHERE id=? AND org=? AND user=?").bind(id, app.org, app.email).first(),
    newThread: async title => {
      const id = `canvaschat-${crypto.randomUUID()}`;
      await db.prepare("INSERT INTO threads(id,org,user,scope_ref,commit_sha,title) VALUES(?,?,?,?,'',?)").bind(id, app.org, app.email, app.name, title.slice(0, 120)).run();
      return id;
    },
  };
}
```

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home/packages/control-plane && node --test test/learn-chat.test.js
```

Expected: FAIL, 43 pass 1 fail: 'The input did not match the regular expression /^canvaschat-/'. apiAsk ignores the seam, so the canvas lookup misses.

- [ ] **Step 3: Add the seam to apiAsk. These are five content-anchored edits in CRLF that add 8 lines, with no column-0 '}'. Every non-seam path is unchanged.**

```js
// packages/control-plane/src/index.js
// (a) replace the line (928)
export async function apiAsk(req, env, ctx, user, conversation = 'agent') {
// with
// seam: dev canvases only (canvases.js canvasAskSeam). It supplies the app, its context and a
// LEARN_DB thread store, so that turn never touches env.DB.
export async function apiAsk(req, env, ctx, user, conversation = 'agent', seam = null) {

// (b) replace (1082)
    const app = await appForUser(env, user, scope.app);
// with
    const app = seam ? seam.app : await appForUser(env, user, scope.app);

// (c) replace (1086)
    context = lessonSnapshot ? JSON.stringify(lessonSnapshot) : await appContext(env, app, useSet);
// with
    // appContext reads live runs/members by app.id, and LEARN_DB canvas ids overlap live ids.
    context = lessonSnapshot ? JSON.stringify(lessonSnapshot) : seam ? seam.context : await appContext(env, app, useSet);

// (d) replace the block from '  // thread per scope and user; follow-ups ride the same thread'
//     through "  await env.DB.prepare('INSERT INTO messages (thread_id, role, content) VALUES (?, ?, ?)')" (1166-1184) with
  // thread per scope and user; follow-ups ride the same thread
  const db = seam ? seam.db : env.DB;
  let threadId = thread_id || null;
  if (threadId) {
    const t = seam ? await seam.findThread(threadId) : await askThreadForUser(env, user, threadId);
    if (!t) return json({ error: 'no such thread' }, 404);
    if ((scopeKind === 'learn' || t.scope === 'learn') && (t.scope !== scopeKind || t.scope_ref !== scopeRef)) {
      return json({ error: 'thread does not belong to this conversation' }, 409);
    }
  } else if (seam) {
    threadId = await seam.newThread(message);
  } else {
    const r = await env.DB.prepare('INSERT INTO threads (org, user, scope, scope_ref) VALUES (?, ?, ?, ?)')
      .bind(user.org, user.email, scopeKind, scopeRef).run();
    threadId = r.meta.last_row_id;
  }
  if (seed.length) await db.batch(seed.map(turn => db.prepare('INSERT INTO messages (thread_id, role, content) VALUES (?, ?, ?)').bind(threadId, turn.role, turn.content)));
  const { results: history } = await db.prepare(
    'SELECT role, content FROM messages WHERE thread_id = ? ORDER BY id DESC LIMIT 10'
  ).bind(threadId).all();
  history.reverse();
  await db.prepare('INSERT INTO messages (thread_id, role, content) VALUES (?, ?, ?)')

// (e) replace (1200-1201)
  return askStream(env, context, history, q, async (full) => {
    await env.DB.prepare('INSERT INTO messages (thread_id, role, content) VALUES (?, ?, ?)').bind(threadId, 'assistant', full).run();
// with
  // A canvas turn hands askStream LEARN_DB as DB, so its learn_moments insert (ask.js:403) cannot reach live D1.
  // ponytail: LEARN_DB has no learn_moments table, so canvas answers skip the moment log (ask.js:399-405 swallows it); add the table to repository-schema.sql when the log needs canvases.
  return askStream(seam ? { ...env, DB: db } : env, context, history, q, async (full) => {
    await db.prepare('INSERT INTO messages (thread_id, role, content) VALUES (?, ?, ?)').bind(threadId, 'assistant', full).run();
```

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home/packages/control-plane && node --check src/index.js && node --test test/learn-chat.test.js && npm test
```

Expected: node --check exit 0; learn-chat 44 pass, 0 fail; npm test 332 pass (326 + 6), 0 fail

- [ ] **Step 4: Commit. index.js is live code, so it is covered by settings-deploy's pre-merge integration gate (order 13.8, the single owner of make test-integration: Makefile:46-47 -> run.sh:108-111). This task does not run it and copies no .env.**

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git status --short && git add packages/control-plane/src/index.js packages/control-plane/src/canvases.js packages/control-plane/test/learn-chat.test.js && git commit --only packages/control-plane/src/index.js packages/control-plane/src/canvases.js packages/control-plane/test/learn-chat.test.js -m 'feat(ask): apiAsk seam answers canvas Learn asks from LEARN_DB with no live D1 access'
```

Expected: make test-unit green; one commit, three paths. Live small-cp is unaffected until promotion, because no live caller passes a seam (index.js:1208, 2359, 2360, 2364).

---

### Task 21: Dev worker wiring (route canvas traffic, merge owner canvases into GET /api/apps, refuse canvas attachments, pass the Learn seam), plus recording the API additions in T02 section 8.2

*Area:* Canvas record (LEARN_DB) and dev worker · *Brief:* T06 · *Order:* 6.4

**Files:**
- `packages/control-plane/test/canvases.test.js`
- `packages/web/dev-worker.js`
- `docs/features/rabbit-hole-t02-spec.md`

**Interfaces:**
- Consumes: Tasks 6.1-6.3 exports: canvasesFetch, canvasRoute, ownerCanvases, refuseCanvasAttachment, canvasAskSeam; area shell-home's dev-worker.js:137 path-list edit (order 1) is already in
- Produces: Dev-only canvas endpoints on any clone built from this commit. GET /api/apps appends the caller's non-archived canvases (kind 'canvas', title, project, device_id), so Shell data.apps, surface.catalog, readContinue, opensHere and Project canvases lists see them. Live build untouched: dev-worker.js is used only by wrangler.dev.jsonc:6. DEPLOY GATE: no clone deploy of this commit before T12 prep's verify SELECT returned the canvases row.

- [ ] **Step 1: Write the failing wiring test. It reads dev-worker.js source, following the learn-research.test.js:48-53 precedent.**

```js
// packages/control-plane/test/canvases.test.js (append at the end)

// ---- dev worker wiring (Task 6.4) ----
// dev-worker.js imports .html and .py, so node cannot import it; like learn-research.test.js:48-53, read its source.
test('the dev worker routes canvas traffic early, merges owner canvases, refuses canvas attachments and passes the Learn seam', () => {
  const source = readFileSync(new URL('../../web/dev-worker.js', import.meta.url), 'utf8');
  const at = text => { const i = source.indexOf(text); assert.ok(i >= 0, `dev-worker.js is missing: ${text}`); return i; };
  assert.ok(at('if (canvasRoute(new URL(req.url))) return canvasesFetch(req, env);') < at('const repositoryRoute ='));
  assert.match(source.slice(at("if (path === '/api/apps' && req.method === 'GET')"), at('const repositoryRoute =')), /\.\.\.\(await ownerCanvases\(env, catalog\)\)/);
  assert.ok(at('const refused = await refuseCanvasAttachment(req);') < at("if (['/api/learn/selection', '/api/learn/ask'].includes(path)"));
  at("'learn', access.kind === 'canvas' ? canvasAskSeam(env, access) : undefined);");
});
```

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home/packages/control-plane && node --test test/canvases.test.js
```

Expected: FAIL, 5 pass 1 fail: 'dev-worker.js is missing: if (canvasRoute(new URL(req.url))) return canvasesFetch(req, env);'

- [ ] **Step 2: Edit dev-worker.js: five content-anchored changes in CRLF**

```js
// packages/web/dev-worker.js
// (a) after: import { repositoriesFetch, repositoryIdentity, repositoryApp } from '../control-plane/src/repositories.js';
import { canvasesFetch, canvasRoute, ownerCanvases, refuseCanvasAttachment, canvasAskSeam } from '../control-plane/src/canvases.js';

// (b) after:     if (path.startsWith('/api/repositories')) return repositoriesFetch(req, env, ctx);
    if (canvasRoute(new URL(req.url))) return canvasesFetch(req, env);

// (c) replace the catalog return inside if (path === '/api/apps' && req.method === 'GET'):
//      return Response.json({ ...catalog, apps: [...catalog.apps, ...results.map(row => repositoryApp(row, catalog))] }, { headers: { 'Cache-Control': 'no-store' } });
// with
      return Response.json({ ...catalog, apps: [...catalog.apps, ...results.map(row => repositoryApp(row, catalog)), ...(await ownerCanvases(env, catalog))] }, { headers: { 'Cache-Control': 'no-store' } });

// (d) insert before:     if (env.SUBSCRIPTION_ONLY === 'true' && req.method === 'POST' && (path === '/api/ask' || /\/learn-course$/.test(path))) {
    // A multipart canvas ask would fall through to live small-cp, which writes ask-uploads/ to R2 first (index.js:954).
    const refused = await refuseCanvasAttachment(req);
    if (refused) return refused;

// (e) replace:        return apiAsk(req, env, ctx, { email: access.email, org: access.org, orgName: access.orgName }, 'learn');
// with
        return apiAsk(req, env, ctx, { email: access.email, org: access.org, orgName: access.orgName }, 'learn', access.kind === 'canvas' ? canvasAskSeam(env, access) : undefined);
```

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --check dev-worker.js && cd ../control-plane && node --test test/canvases.test.js test/learn-research.test.js && npm test
```

Expected: node --check exit 0; canvases 6 pass; learn-research all pass (its dev-worker block assertions still hold); npm test 333 pass (326 + 7), 0 fail

- [ ] **Step 3: Record the implemented API in the approved spec's section 8.2 table (content-anchored; replaces the POST and DELETE rows and adds two rows)**

```markdown
docs/features/rabbit-hole-t02-spec.md
(1) replace the row
| `POST /api/canvases {title, project?}` | Any workspace member | Creates the record and returns the canvas object |
with
| `POST /api/canvases {title?, project?, device_id?}` | Any workspace member | Creates the record and returns the canvas object. `title` defaults to "Untitled canvas" and is at most 120 characters; `device_id` is the §8.3 `small.device` id. |
(2) replace the row
| `DELETE /api/apps/canvas-*` | — | Returns 405 in phase 1 (touched canvases: see §8.4) |
with
| `DELETE /api/apps/canvas-*` | Owner | Undo only (§8.4): deletes the record while no `LEARN_DB` thread exists for it; a touched canvas returns 405 "This canvas has been used. Archive it instead." |
| `GET /api/canvases?archived=1` | Owner | The caller's archived canvases, for the Library Archived chip (§4). Without the parameter it lists the non-archived ones. |
| `GET /api/ask/threads?scope=learn&ref=canvas-*`, `GET /api/ask/threads/canvaschat-*`, `POST …/canvaschat-*/rename {title}` and `/delete` | Owner | Canvas chat history from `LEARN_DB`, on the paths Learn's chat already calls (`ask.jsx:388,401,601,622`). The Agent Bar's History for canvas scope uses the same paths: it lists `/api/ask/threads?scope=learn&ref=<canvas slug>` and opens `/api/ask/threads/<canvaschat id>`. |
```

- [ ] **Step 4: Commit code and docs separately**

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git status --short && git add packages/web/dev-worker.js packages/control-plane/test/canvases.test.js && git commit --only packages/web/dev-worker.js packages/control-plane/test/canvases.test.js -m 'feat(dev-worker): route canvas records and history to LEARN_DB, merge owner canvases, pass the Learn seam' && git add docs/features/rabbit-hole-t02-spec.md && git commit --only docs/features/rabbit-hole-t02-spec.md -m 'docs: T02 8.2 records canvas device_id, untouched-only delete, archived list and history paths'
```

Expected: make test-unit green; two commits, the first with two paths and the second with one

- [ ] **Step 5: Deploy gate. This task does not deploy. The first clone deploy that contains this commit is agent-ui's 'One Start dialog host in Root...' (order 8.5); every later clone deploy (settings-deploy 8.6 and 9.8, shell-home 9.9, agent-ui 10.2/10.3, settings-deploy 13) also contains it. T12 prep (order 5) already ran; before the 8.5 deploy, re-run T12 prep's verify command via '!'.**

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home/packages/web; npx wrangler d1 execute small-learn-dev --remote --config wrangler.dev.jsonc --command "SELECT name, sql FROM sqlite_master WHERE type='table' AND name='canvases'"
```

Expected: One canvases row. If there is none, do not deploy: that clone's GET /api/apps would return 500 (dev-worker.js:23-28 has no try/catch).

---

### Task 22: REGRESSION PIN (not TDD): the T02 section 16 conditions hold for connect_repository (LEARN_DB rows only, learn-repositories-dev keys, no live mutation API)

*Area:* Canvas record (LEARN_DB) and dev worker · *Brief:* T11 · *Order:* 6.5

**Files:**
- `packages/control-plane/test/repositories.test.js`

**Interfaces:**
- Consumes: existing fixture (repositories.test.js:11-19), constants sha/newer/snapshot (:9-10)
- Produces: A pin that passes on its first run because it pins current behaviour. If it ever fails, a section 16 condition is false, D7 wins, and connect_repository must render Blocked.

- [ ] **Step 1: Append the pin. It passes on first run by design, so it is labelled a pin in its comment and test name.**

```js
// packages/control-plane/test/repositories.test.js (append after line 138; CRLF)

// Regression pin, not TDD: it passes on first run because it pins current behaviour. If it ever
// fails, a T02 section 16 condition is false, D7 wins, and connect_repository must render Blocked.
test('T02 section 16 pin: connect_repository writes only LEARN_DB rows and learn-repositories-dev keys, and calls no live mutation API',async t=>{
  const f=fixture(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  const hosts=new Set(),seen=[],identity=f.env.CONTROL_PLANE.fetch;
  globalThis.fetch=async url=>{url=new URL(url);hosts.add(url.host);return Response.json(url.pathname==='/repository-metadata'?{commit:newer}:url.pathname.endsWith('/asset')?{...snapshot,commit:newer}:{status:'ready'});};
  f.env.CONTROL_PLANE.fetch=async req=>{seen.push(`${req.method} ${new URL(req.url).pathname}`);return identity(req);};
  f.env.DB={prepare(){throw Error('live D1 touched');},batch(){throw Error('live D1 touched');}};
  f.env.REPOSITORY_IMPORTS={idFromName:String,get:()=>({fetch:(url,init)=>f.actor.fetch(new Request(url,init))})};
  const response=await repositoriesFetch(new Request('https://dev.test/api/repositories',{method:'POST',body:JSON.stringify({url:'https://github.com/example/project',branch:'main'})}),f.env,{});
  assert.equal(response.status,202);
  const row=f.sqlite.prepare('SELECT * FROM repository_apps WHERE name=?').get((await response.json()).name);
  assert.equal(row.org,'team');assert.equal(row.owner_email,'owner@test');assert.ok(row.created_at); // 16.1, 16.5: a LEARN_DB row, found by org, owner_email, created_at
  await f.actor.alarm();await f.actor.alarm();
  const key=`learn-repositories-dev/${row.id}/${newer}/graphify-0.9.63.json`;
  assert.deepEqual([...f.assets.keys()].filter(k=>k!=='snapshot'),[key]); // 16.2, 16.3: prefix plus LEARN_DB id plus commit
  assert.equal(f.sqlite.prepare('SELECT storage_key FROM repository_versions WHERE app_id=?').get(row.id).storage_key,key); // 16.5: R2 found through repository_versions
  assert.deepEqual([...new Set(seen)],['GET /api/apps']); // 16.4: identity read only
  assert.deepEqual([...hosts],['worker.test']);
  assert.equal(f.sqlite.prepare('SELECT status FROM repository_apps WHERE id=?').get(row.id).status,'ready');
});
```

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home/packages/control-plane && node --test test/repositories.test.js
```

Expected: 14 pass, 0 fail on first run (a pin). Verified in the scratch export on 2026-09-23.

- [ ] **Step 2: Full suite and commit**

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home/packages/control-plane && npm test && cd ../.. && make test-unit && git status --short && git add packages/control-plane/test/repositories.test.js && git commit --only packages/control-plane/test/repositories.test.js -m 'test(repositories): pin the T02 section 16 isolation conditions for connect_repository'
```

Expected: npm test 334 pass (326 + 8), 0 fail; one commit, one path

---

### Task 23: A5.1 Cross-org: the recheck acts only in the proposal's frozen workspace, and a failed recheck is 403

*Area:* Proposal lifecycle blockers · *Brief:* T10 · *Order:* 7.1

**Files:**
- `packages/control-plane/test/ask-proposals.test.js`
- `packages/control-plane/src/index.js`

**Interfaces:**
- Consumes: proposals row (org, tool, args) written by apiAsk (index.js:1194-1195)
- Produces: apiAskApprove resolves apps and runs only inside proposals.org. A permission-recheck failure returns 403 {error:'no edit access'} (section 7.3 'No longer allowed'). Also the ask-proposals.test.js harness that A5.2 to A5.4 extend.

- [ ] **Step 1: Write the failing test file: harness, the cross-org test and the 403 test**

```js
// packages/control-plane/test/ask-proposals.test.js (new file)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// The real proposal handlers from index.js against SQLite, the way
// learn-chat.test.js runs apiAsk, without importing the bundled HTML.
const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const names = ['appRow', 'askThreadForUser', 'apiAskThreadDelete', 'apiAskApprove'];
const functions = names.map(name => source.match(new RegExp(`async function ${name}[(][^]*?^[}]`, 'm'))[0]).join(' ');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const deps = {
  json,
  canEdit: async (env, app, email) => app.owner_email === email,
  appForUser: async () => null,
  startRun: async (env, app, startedBy) => { env.started.push({ org: app.org, app: app.name, by: startedBy }); return `r-new${env.started.length}`; },
};
const handlers = new Function(...Object.keys(deps), `${functions}; return { ${names.join(',')} };`)(...Object.values(deps));

const A = { email: 'owner@a.test', org: 'workspace-a' };
const B = { email: 'owner@b.test', org: 'workspace-b' };
const VIEWER = { email: 'viewer@a.test', org: 'workspace-a' };

// Each workspace has a job named report, owned by that workspace's user.
function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
  for (const table of ['apps', 'members', 'runs', 'threads', 'messages', 'proposals']) db.exec(schema.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} [(][^]*?^[)];`, 'm'))[0]);
  for (const u of [A, B]) db.prepare("INSERT INTO apps (org, name, fly_app, proxy_secret, owner_email, kind, image) VALUES (?, 'report', 'fly-x', 'secret', ?, 'job', 'img')").run(u.org, u.email);
  return {
    db, started: [],
    DB: { prepare: sql => ({ bind: (...params) => ({
      first: async () => db.prepare(sql).get(...params) || null,
      all: async () => ({ results: db.prepare(sql).all(...params) }),
      run: async () => { const result = db.prepare(sql).run(...params); return { meta: { last_row_id: Number(result.lastInsertRowid), changes: Number(result.changes) } }; },
    }) }) },
  };
}

function propose(env, user, tool, args, minutesOld = 0) {
  const thread = Number(env.db.prepare("INSERT INTO threads (org, user, scope) VALUES (?, ?, 'org')").run(user.org, user.email).lastInsertRowid);
  const id = `p-${tool}-${thread}`;
  env.db.prepare("INSERT INTO proposals (id, thread_id, org, user, tool, args, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?))")
    .run(id, thread, user.org, user.email, tool, JSON.stringify(args), `-${minutesOld} minutes`);
  return { id, thread };
}
const post = (path, body) => new Request('https://small.example' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const approve = (env, user, id) => handlers.apiAskApprove(post('/api/ask/approve', { proposal_id: id }), env, {}, user, 'https://small.example');
const statusOf = (env, id) => env.db.prepare('SELECT status FROM proposals WHERE id = ?').get(id).status;

test('a proposal acts only in its own workspace, never on a same-named app elsewhere', async t => {
  const env = fixture(t);
  const bApp = env.db.prepare("SELECT id FROM apps WHERE org = 'workspace-b'").get().id;
  env.db.prepare("INSERT INTO runs (run_id, app_id, started_by, status) VALUES ('r-b1', ?, ?, 'finished')").run(bApp, B.email);
  // run_again names B's run; approving it in A must not start A's report
  const again = propose(env, A, 'run_again', { run_id: 'r-b1' });
  const res = await approve(env, A, again.id);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'no run r-b1' });
  // B's proposal is invisible from A, although A owns an app with the same name
  const share = propose(env, B, 'share', { app: 'report', email: 'x@a.test' });
  assert.equal((await approve(env, A, share.id)).status, 404);
  assert.deepEqual(env.started, []);
  assert.equal(env.db.prepare('SELECT COUNT(*) AS n FROM members').get().n, 0);
});

test('the permission recheck fails with 403, the No longer allowed card state', async t => {
  const env = fixture(t);
  const { id } = propose(env, A, 'run', { app: 'report' });
  const res = await approve(env, VIEWER, id);
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'no edit access' });
  assert.deepEqual(env.started, []);
});
```

- [ ] **Step 2: Run it and watch both fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/control-plane && node --test test/ask-proposals.test.js
```

Expected: tests 2, pass 0, fail 2. The cross-org test fails with actual 200, expected 400: today A's report starts from B's run. The 403 test fails with actual 400, expected 403. (Observed on HEAD.)

- [ ] **Step 3: Minimal fix in apiAskApprove: resolve in p.org, scope the run_again lookup, and return 403 for the recheck**

```js
// index.js, apiAskApprove. Replace these four lines (HEAD 1425-1428):
  const editableApp = async (name) => {
    const app = await appRow(env, user.org, name);
    if (!app) throw new Error(`no app named ${name}`);
    if (!(await canEdit(env, app, user.email))) throw new Error('no edit access');
// with:
  // the recheck runs in the proposal's frozen workspace, never a lookup that can
  // land in another org; failing it is 403, the card's No longer allowed
  const editableApp = async (name) => {
    const app = await appRow(env, p.org, name);
    if (!app) throw new Error(`no app named ${name}`);
    if (!(await canEdit(env, app, user.email))) throw Object.assign(new Error('no edit access'), { status: 403 });

// index.js run_again branch (HEAD 1459). The text "WHERE runs.run_id = ?').bind(args.run_id).first();" is unique; it becomes:
      const old = await env.DB.prepare('SELECT runs.*, apps.name AS app_name FROM runs JOIN apps ON apps.id = runs.app_id WHERE runs.run_id = ? AND apps.org = ?').bind(args.run_id, p.org).first();

// index.js apiAskApprove catch (HEAD 1504-1506; 'return json({ error: e.message }, 400);' occurs once in the file):
  } catch (e) {
    return json({ error: e.message }, e.status || 400);
  }
```

- [ ] **Step 4: Re-run the file, then the whole package**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/control-plane && node --test test/ask-proposals.test.js && npm test
```

Expected: ask-proposals: tests 2, pass 2, fail 0 (observed). npm test: fail 0 with the count 2 higher than before this task (328 on HEAD alone).

- [ ] **Step 5: Commit (make test-unit first, per CLAUDE.md; about 12 minutes here; Git Bash)**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git add packages/control-plane/test/ask-proposals.test.js && git commit --only packages/control-plane/test/ask-proposals.test.js packages/control-plane/src/index.js -m 'fix(ask): approvals act only in the proposal workspace, a failed recheck is 403'
```

Expected: make test-unit exit 0; one commit containing exactly those two paths

---

### Task 24: A5.2 One transition, once: a conditional claim with a 15-minute expiry, reopened if the tool refuses

*Area:* Proposal lifecycle blockers · *Brief:* T10 · *Order:* 7.2

**Files:**
- `packages/control-plane/test/ask-proposals.test.js`
- `packages/control-plane/src/index.js`

**Interfaces:**
- Consumes: The A5.1 harness and editableApp's 403
- Produces: claimProposal(env, user, id, status) returns null when this caller made the transition. Otherwise it returns a Response: 404 {error:'no such proposal'}, or 409 {error, status} where status is EXACTLY one of approved | rejected | expired | invalidated and error is the sentence Slack shows ('already approved' | 'cancelled' | 'expired after 15 minutes - ask again' | 'its chat was deleted'). The mapping for the ConfirmCard (agent-ui) is documented in web.md v16 (task 7.5): approved -> Done-elsewhere 'Already approved.'; rejected -> Cancelled; expired -> Expired; invalidated -> Cancelled 'This thread was deleted.'; 403 -> NoLongerAllowed.

- [ ] **Step 1: Append three tests (names list unchanged for now)**

```js
// append to packages/control-plane/test/ask-proposals.test.js

test('two concurrent approves execute once; the loser gets 409 with the status', async t => {
  const env = fixture(t);
  const { id } = propose(env, A, 'run', { app: 'report' });
  const results = await Promise.all([approve(env, A, id), approve(env, A, id)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.deepEqual(await results.find(r => r.status === 409).json(), { error: 'already approved', status: 'approved' });
  assert.equal(env.started.length, 1);
  assert.equal(statusOf(env, id), 'approved');
});

test('a proposal older than 15 minutes has expired and cannot run', async t => {
  const env = fixture(t);
  const { id } = propose(env, A, 'run', { app: 'report' }, 16);
  const res = await approve(env, A, id);
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: 'expired after 15 minutes - ask again', status: 'expired' });
  assert.deepEqual(env.started, []);
});

test('a refused approve reopens the proposal, so a viewer click cannot burn it', async t => {
  const env = fixture(t);
  const { id } = propose(env, A, 'run', { app: 'report' });
  assert.equal((await approve(env, VIEWER, id)).status, 403);
  assert.deepEqual({ ...env.db.prepare('SELECT status, approved_by, approved_at FROM proposals WHERE id = ?').get(id) }, { status: 'proposed', approved_by: null, approved_at: null });
  assert.equal((await approve(env, A, id)).status, 200);
  assert.equal(env.started.length, 1);
});
```

- [ ] **Step 2: Run and watch the concurrency and expiry tests fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/control-plane && node --test test/ask-proposals.test.js
```

Expected: tests 5, pass 3, fail 2. Concurrent: actual [ 200, 200 ], expected [ 200, 409 ]. Expiry: actual 200, expected 409. The reopen test passes for now because HEAD writes nothing before executing; the claim in the next step turns it red. (Observed.)

- [ ] **Step 3: Add claimProposal and make apiAskApprove claim first (no reopen yet)**

```js
// index.js: insert directly above the line '// Phase 2 approval: the proposal executes here, with edit re-checked NOW - the' (HEAD 1413)
// T02 7.4: proposed -> approved|rejected happens once, inside 15 minutes; web and
// Slack share it. null = this caller made the transition, else the 404/409 to send.
async function claimProposal(env, user, id, status) {
  const r = await env.DB.prepare(
    "UPDATE proposals SET status = ?, approved_by = ?, approved_at = datetime('now') WHERE id = ? AND org = ? AND status = 'proposed' AND created_at > datetime('now', '-15 minutes')"
  ).bind(status, user.email, id, user.org).run();
  if (r.meta.changes === 1) return null;
  const p = await env.DB.prepare('SELECT status FROM proposals WHERE id = ? AND org = ?').bind(id, user.org).first();
  if (!p) return json({ error: 'no such proposal' }, 404);
  // status is the card state (approved | rejected | invalidated | expired); error is what Slack shows
  const current = p.status === 'proposed' ? 'expired' : p.status;
  const why = { approved: 'already approved', rejected: 'cancelled', invalidated: 'its chat was deleted', expired: 'expired after 15 minutes - ask again' };
  return json({ error: why[current], status: current }, 409);
}

// apiAskApprove: replace the line (HEAD 1422)
  if (p.status !== 'proposed') return json({ error: `already ${p.status}` }, 409);
// with
  // claim before executing: a second click, a Cancel or a deleted chat gets the 409
  // ponytail: a Worker that dies mid-tool leaves the row approved with no log line; add a running status if that shows up
  const taken = await claimProposal(env, user, p.id, 'approved');
  if (taken) return taken;

// apiAskApprove: delete these two lines after the try/catch (HEAD 1508-1509); the messages INSERT below them stays
  await env.DB.prepare("UPDATE proposals SET status = 'approved', approved_by = ?, approved_at = datetime('now') WHERE id = ?")
    .bind(user.email, p.id).run();

// test/ask-proposals.test.js: the extractor needs the helper
const names = ['appRow', 'askThreadForUser', 'apiAskThreadDelete', 'claimProposal', 'apiAskApprove'];
```

- [ ] **Step 4: Run: the claim now burns a proposal the tool refuses**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/control-plane && node --test test/ask-proposals.test.js
```

Expected: tests 5, pass 4, fail 1. The reopen test fails with actual { status: 'approved', approved_by: 'viewer@a.test', approved_at: '<now>' }, expected { status: 'proposed', approved_by: null, approved_at: null }. (Observed.)

- [ ] **Step 5: Reopen when the tool refuses**

```js
// index.js apiAskApprove catch (the block edited in A5.1) becomes
  } catch (e) {
    // the tool refused: reopen, so a viewer's Slack click can't burn the proposal
    await env.DB.prepare("UPDATE proposals SET status = 'proposed', approved_by = NULL, approved_at = NULL WHERE id = ? AND status = 'approved'")
      .bind(p.id).run();
    return json({ error: e.message }, e.status || 400);
  }
```

- [ ] **Step 6: Re-run the file and the package**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/control-plane && node --test test/ask-proposals.test.js && npm test
```

Expected: ask-proposals: tests 5, pass 5, fail 0 (observed). npm test: fail 0, with the count 3 higher than after A5.1.

- [ ] **Step 7: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git commit --only packages/control-plane/test/ask-proposals.test.js packages/control-plane/src/index.js -m 'fix(ask): a proposal is approved once, within 15 minutes, and reopens if the tool refuses'
```

Expected: make test-unit exit 0; one commit, two paths

---

### Task 25: A5.3 Cancel is final: POST /api/ask/reject, and Slack Cancel calls it

*Area:* Proposal lifecycle blockers · *Brief:* T10 · *Order:* 7.3

**Files:**
- `packages/control-plane/test/ask-proposals.test.js`
- `packages/control-plane/test/slack.test.js`
- `packages/control-plane/src/index.js`
- `packages/control-plane/src/slack.js`

**Interfaces:**
- Consumes: claimProposal from A5.2
- Produces: POST /api/ask/reject {proposal_id} returns 200 {ok:true, status:'rejected'}, 404 {error:'no such proposal'}, or the A5.2 409 {error, status}, and records the rejecter in approved_by/approved_at. Also SLACK_DEPS.rejectHandler(req, env, ctx, user). The agent-ui ConfirmCard Cancel POSTs here. Until small-cp is promoted, live has no such endpoint and D7 blocks every proposal on dev builds, so Cancel on a Blocked card stays local only (contract v2, recorded in web.md v16).

- [ ] **Step 1: Failing tests: server reject and Slack Cancel**

```js
// test/ask-proposals.test.js: insert directly below the line starting 'const statusOf = (env, id) =>'
const reject = (env, user, id) => handlers.apiAskReject(post('/api/ask/reject', { proposal_id: id }), env, user);

// test/ask-proposals.test.js: append

test('cancel is final: approve after reject is 409 and nothing runs', async t => {
  const env = fixture(t);
  const { id } = propose(env, A, 'run', { app: 'report' });
  assert.equal((await reject(env, B, id)).status, 404);
  const res = await reject(env, A, id);
  assert.deepEqual([res.status, await res.json()], [200, { ok: true, status: 'rejected' }]);
  assert.deepEqual({ ...env.db.prepare('SELECT status, approved_by FROM proposals WHERE id = ?').get(id) }, { status: 'rejected', approved_by: A.email });
  const again = await approve(env, A, id);
  assert.deepEqual([again.status, await again.json()], [409, { error: 'cancelled', status: 'rejected' }]);
  assert.equal((await reject(env, A, id)).status, 409);
  assert.deepEqual(env.started, []);
});

// test/slack.test.js: insert directly above "test('block builders stay within Slack limits', () => {" (HEAD 102)
test('Cancel rejects the proposal server-side; a stale Cancel says why', async () => {
  const { api } = fakeSlack({ UE: 'yudhisteer.chin@gmail.com' });
  const responded = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://respond.example') { responded.push(JSON.parse(init.body)); return new Response('ok'); }
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    const rejected = [];
    const rejectHandler = async (req, _env, _ctx, user) => {
      rejected.push({ ...(await req.json()), by: user.email });
      return rejected.length === 1
        ? new Response(JSON.stringify({ ok: true, status: 'rejected' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        : new Response(JSON.stringify({ error: 'already approved', status: 'approved' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    };
    const click = { user: { id: 'UE' }, channel: { id: 'C1' }, response_url: 'https://respond.example', message: { ts: '9.9', blocks: [] }, actions: [{ action_id: 'ask_cancel', value: 'p-1' }] };
    await handleSlackInteract(env, ctx, install, click, { api, rejectHandler }, 'https://small.example');
    assert.deepEqual(rejected[0], { proposal_id: 'p-1', by: 'yudhisteer.chin@gmail.com' });
    assert.equal(responded[0].replace_original, true);
    assert.match(responded[0].text, /cancelled/);
    await handleSlackInteract(env, ctx, install, click, { api, rejectHandler }, 'https://small.example');
    assert.equal(responded[1].response_type, 'ephemeral');
    assert.equal(responded[1].replace_original, false);
    assert.match(responded[1].text, /already approved/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
```

- [ ] **Step 2: Run and watch both fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/control-plane && node --test test/ask-proposals.test.js test/slack.test.js
```

Expected: tests 12, pass 10, fail 2. 'cancel is final' fails with TypeError: handlers.apiAskReject is not a function. The Slack test fails with actual undefined, expected { proposal_id: 'p-1', by: 'yudhisteer.chin@gmail.com' }, because Cancel never calls the server. (Observed.)

- [ ] **Step 3: Implement apiAskReject, its route and the Slack dep**

```js
// index.js: insert directly above the line '// s3:// autocomplete for the Run form: list one level under the typed uri using' (HEAD 1515)
// Cancel is final (T02 7.4 #3): the same one-time transition as approve, so a
// cancelled proposal can never run. Slack Cancel lands here too.
async function apiAskReject(req, env, user) {
  const { proposal_id } = await req.json();
  return (await claimProposal(env, user, proposal_id, 'rejected')) || json({ ok: true, status: 'rejected' });
}

// index.js SLACK_DEPS: add below the line '  approveHandler: (req, env, ctx, user, baseUrl) => apiAskApprove(req, env, ctx, user, baseUrl),' (HEAD 1209)
  rejectHandler: (req, env, ctx, user) => apiAskReject(req, env, user),

// index.js router: add below the line "        if (path === '/api/ask/approve' && req.method === 'POST') return await apiAskApprove(req, env, ctx, user, baseUrl);" (HEAD 2366, inside the block that 401s without a user at 2351)
        if (path === '/api/ask/reject' && req.method === 'POST') return await apiAskReject(req, env, user);

// test/ask-proposals.test.js
const names = ['appRow', 'askThreadForUser', 'apiAskThreadDelete', 'claimProposal', 'apiAskApprove', 'apiAskReject'];
```

- [ ] **Step 4: Slack Cancel calls rejectHandler**

```js
// slack.js:2 (header comment); line 1 and line 3 are unchanged
// /api/ask call; every proposal becomes Run/Cancel buttons that hit /api/ask/approve
// and /api/ask/reject.

// slack.js:226
  const { api, askHandler, approveHandler, rejectHandler } = deps;

// slack.js:249-252 becomes
  if (action.action_id === 'ask_cancel') {
    // final server-side: a later Run on this card gets a 409
    const req = new Request('http://internal/api/ask/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal_id: action.value }),
    });
    const resp = await rejectHandler(req, env, ctx, actor);
    const d = await resp.json();
    if (!resp.ok || d.error) {
      await respond({ response_type: 'ephemeral', replace_original: false, text: `✗ ${d.error}` });
      return;
    }
    await respond({ replace_original: true, text: '✗ proposal cancelled' });
    return;
  }
```

- [ ] **Step 5: Re-run the two files, then the package**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/control-plane && node --test test/ask-proposals.test.js test/slack.test.js && npm test
```

Expected: tests 12, pass 12, fail 0 (6 ask-proposals and 6 slack; observed). npm test: fail 0, with the count 2 higher than after A5.2.

- [ ] **Step 6: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git commit --only packages/control-plane/test/ask-proposals.test.js packages/control-plane/test/slack.test.js packages/control-plane/src/index.js packages/control-plane/src/slack.js -m 'fix(ask): cancel rejects the proposal server-side, Slack Cancel included'
```

Expected: make test-unit exit 0; one commit, four paths

---

### Task 26: A5.4 Deleting a thread invalidates its open proposals

*Area:* Proposal lifecycle blockers · *Brief:* T10 · *Order:* 7.4

**Files:**
- `packages/control-plane/test/ask-proposals.test.js`
- `packages/control-plane/test/learn-chat.test.js`
- `packages/control-plane/src/index.js`

**Interfaces:**
- Consumes: The A5.1 harness, which already extracts askThreadForUser and apiAskThreadDelete, and the 409 from claimProposal
- Produces: POST /api/ask/threads/:id/delete sets that thread's 'proposed' rows to 'invalidated' and records the deleter in approved_by/approved_at. Approved rows are untouched. A later approve or reject gets 409 {error:'its chat was deleted', status:'invalidated'}.

- [ ] **Step 1: Failing test**

```js
// append to packages/control-plane/test/ask-proposals.test.js

test('deleting a thread invalidates its open proposals; approved ones stay as the log', async t => {
  const env = fixture(t);
  const { id, thread } = propose(env, A, 'run', { app: 'report' });
  env.db.prepare("INSERT INTO proposals (id, thread_id, org, user, tool, args, status) VALUES ('p-done', ?, ?, ?, 'share', '{}', 'approved')").run(thread, A.org, A.email);
  assert.equal((await handlers.apiAskThreadDelete(env, A, thread)).status, 200);
  assert.deepEqual({ ...env.db.prepare('SELECT status, approved_by FROM proposals WHERE id = ?').get(id) }, { status: 'invalidated', approved_by: A.email });
  assert.equal(statusOf(env, 'p-done'), 'approved');
  const res = await approve(env, A, id);
  assert.deepEqual([res.status, await res.json()], [409, { error: 'its chat was deleted', status: 'invalidated' }]);
  assert.deepEqual(env.started, []);
});
```

- [ ] **Step 2: Run and watch it fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/control-plane && node --test test/ask-proposals.test.js
```

Expected: tests 7, pass 6, fail 1: actual { status: 'proposed', approved_by: null }, expected { status: 'invalidated', approved_by: 'owner@a.test' } (observed)

- [ ] **Step 3: Implement in apiAskThreadDelete and give the learn-chat fixture the table**

```js
// index.js, the comment above apiAskThreadDelete (HEAD 1395-1396) becomes
// Deleting a chat removes the thread + messages; approved proposals stay - they
// are the action log, not conversation. Open ones are invalidated (T02 7.4 #4),
// so a stale Slack Run button can't execute them.

// index.js: add below the line "  await env.DB.prepare('DELETE FROM messages WHERE thread_id = ?').bind(threadId).run();" (HEAD 1402; unique)
  await env.DB.prepare("UPDATE proposals SET status = 'invalidated', approved_by = ?, approved_at = datetime('now') WHERE thread_id = ? AND status = 'proposed'")
    .bind(user.email, threadId).run();

// test/learn-chat.test.js fixture (HEAD 96; 97 once the seam has added its import). Replace only the text
//   for (const table of ['threads', 'messages']) db.exec(
// with
//   for (const table of ['threads', 'messages', 'proposals']) db.exec(
// and leave the rest of that line (the schema regex) untouched. Without this, 'New chat, rename, and delete
// affect only the selected Learn conversation' fails with 'Error: no such table: proposals' (observed).
```

- [ ] **Step 4: Re-run the affected files, then the package**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/control-plane && node --test test/ask-proposals.test.js test/learn-chat.test.js test/slack.test.js test/cli-workspace.test.js && npm test
```

Expected: Four files: tests 59, pass 59, fail 0 on HEAD plus this area (observed; more if the seam's learn-chat test has landed). npm test: fail 0, with the count 1 higher than after A5.3 (334 on HEAD plus this area alone).

- [ ] **Step 5: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git commit --only packages/control-plane/test/ask-proposals.test.js packages/control-plane/test/learn-chat.test.js packages/control-plane/src/index.js -m 'fix(ask): deleting a chat invalidates its open proposals'
```

Expected: make test-unit exit 0; one commit, three paths

---

### Task 27: Document the lifecycle and the exact response bodies for the UI (docs/features/web.md)

*Area:* Proposal lifecycle blockers · *Brief:* T10 · *Order:* 7.5

**Files:**
- `docs/features/web.md`

**Interfaces:**
- Consumes: The behaviour and bodies from A5.1 to A5.4
- Produces: web.md v16: the one table agent-ui's ConfirmCard/cardState maps from. The stale v13 and v15 statements are corrected.

- [ ] **Step 1: Correct the two statements that are now incomplete**

```markdown
docs/features/web.md (CRLF). v13, HEAD 359: replace the text
  the action log), + New chat.
with
  the action log; open ones become invalidated, v16), + New chat.

v15, HEAD 422: replace the line
  proposal becomes Block Kit Run/Cancel buttons hitting /api/ask/approve.
with the two lines
  proposal becomes Block Kit Run/Cancel buttons hitting /api/ask/approve and
  /api/ask/reject (v16).
```

- [ ] **Step 2: Add the v16 section directly above '## Serving (hard-won)' (HEAD 453)**

```markdown
## v16: Proposal lifecycle (T02 spec 7.4, amendment 5)
- One transition, once: approve and reject run the same conditional UPDATE
  (claimProposal: status 'proposed', same org, created under 15 minutes ago)
  and must change exactly one row before anything executes. Web and Slack
  share it. The claim comes before the tool runs; if the tool refuses, the row
  goes back to 'proposed', so a viewer's Slack click can't burn it.
- The permission recheck runs in the proposal's frozen org: apps resolve in
  proposals.org, and run_again's run lookup is scoped to that org (it used to
  match another org's run id and start a same-named app here).
- POST /api/ask/reject {proposal_id}: Cancel is final. Slack Cancel calls it.
  Deleting a chat marks its open proposals 'invalidated'; approved ones stay
  as the action log. rejected and invalidated record the resolver in
  approved_by/approved_at (0012 columns, no migration).
- Responses, and the Agent Bar card state (T02 spec 7.3) each one maps to:

| Response | Body | Card |
|---|---|---|
| approve 200 | {ok: true, ...tool result} | Done |
| reject 200 | {ok: true, status: 'rejected'} | Cancelled |
| 409 | {error: 'already approved', status: 'approved'} | Done elsewhere, 'Already approved.' |
| 409 | {error: 'cancelled', status: 'rejected'} | Cancelled |
| 409 | {error: 'expired after 15 minutes - ask again', status: 'expired'} | Expired |
| 409 | {error: 'its chat was deleted', status: 'invalidated'} | Cancelled, 'This thread was deleted.' |
| 403 | {error: 'no edit access'} | No longer allowed |
| 400 | {error: the tool's reason} | Failed (the proposal is open again) |
| 404 | {error: 'no such proposal'} | Failed |

- A 409 status is always one of approved, rejected, expired, invalidated.
  Expiry is computed, not stored: an old row stays 'proposed' and answers
  'expired'. Slack shows the error text.
- Takes effect when small-cp is deployed, a live promotion that needs explicit
  approval. Until then the dev review copy blocks every server proposal
  (T02 spec 7.5), and a Blocked card's Cancel is local only.
- Tests: control-plane unit suite +8. ask-proposals.test.js runs the real
  handlers on node:sqlite (cross-org, 403 recheck, concurrent approve, expiry,
  reopen, reject, thread delete); slack.test.js covers Cancel.
```

- [ ] **Step 3: Check the edits landed once each**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && grep -c '^## v16: Proposal lifecycle' docs/features/web.md && grep -c 'api/ask/reject' docs/features/web.md
```

Expected: 1, then 2 (the v15 line and the v16 bullet)

- [ ] **Step 4: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git commit --only docs/features/web.md -m 'docs(ask): proposal lifecycle and the 409 bodies the card maps'
```

Expected: make test-unit exit 0; one commit, one path

---

### Task 28: Agent Bar pure helpers (bar.js) and ConfirmCard: results keyed by resultsKey, SSE fold, per-scope drafts, card states with the 409 statuses, modes with the askLiveOnPreview guard, Learn outcomes, History paths; the §7.3 card the Start dialog reuses

*Area:* Agent Bar UI · *Brief:* T05 · *Order:* 7.8

**Files:**
- `packages/web/src/agent/bar.js`
- `packages/web/src/agent/bar.test.mjs`
- `packages/web/src/agent/ConfirmCard.jsx`

**Interfaces:**
- Consumes: agent/scope.js scopeKey and chipsFor (agent-core, order 2; scopeKey = 'org|kind:slug|selectedId'). flags.js askLiveOnPreview = false (shell-home, order 1; CONTRACT v3). api.js navigate, ui.jsx Button, lucide-react Loader2 (all on HEAD).
- Produces: bar.js: resultsKey(scope) = 'org|kind:slug' (selection excluded; CONTRACT v3), getTurns, getLatest, subscribeTurns (listener({ key, pushed }), key a results key), pushTurn, updateTurn, setTurns, threadIds, resetThread, applyEvent, lineOf, follow, carry, labelOf, offerFor, widen, placeholderFor(scope, surface), resultsView, MODES, modeQuery, modeAvailability(mode, kind, askLive = askLiveOnPreview), EXPIRY_MS, cardView, rejectBody, learnOutcome, threadsPath. ConfirmCard({ card, onConfirm, onChange, onCancel }) rendering [data-confirm-card=<state>], landed before settings-deploy's StartDialog (order 8) imports it.

- [ ] **Step 1: Precondition: the modules bar.js imports exist on HEAD**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && grep -nE "export (const|function) (scopeKey|chipsFor)" src/agent/scope.js && grep -n "export const askLiveOnPreview = false;" src/flags.js
```

Expected: Three lines: the scopeKey and chipsFor exports (agent-core order 2) and 'export const askLiveOnPreview = false;' (shell-home order 1). If any is missing, stop: bar.js would fail to import.

- [ ] **Step 2: Write the failing tests**

```jsx
// packages/web/src/agent/bar.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyEvent, cardView, carry, EXPIRY_MS, follow, getLatest, getTurns, labelOf, learnOutcome, lineOf, MODES, modeAvailability, modeQuery,
  offerFor, placeholderFor, pushTurn, rejectBody, resetThread, resultsKey, resultsView, subscribeTurns, threadIds, threadsPath, updateTurn, widen,
} from './bar.js';
import { scopeKey } from './scope.js';

const home = { org: 'gmail-com', kind: 'workspace', slug: null, title: null, selected: null };
const nano = { org: 'gmail-com', kind: 'project', slug: 'repo-1a2b', title: 'karpathy/nanoGPT', selected: null };
const attn = { ...nano, selected: { id: 'n7', label: 'CausalSelfAttention', commit: '3f2a1c9' } };
const counter = { org: 'gmail-com', kind: 'app', slug: 'counter', title: 'counter', selected: null };
const OFF = 'Asking about the workspace or apps is off on this preview: it would write to live chat history.';

test('results and threads are per resource (org|kind:slug); drafts stay per selection', () => {
  assert.equal(resultsKey(nano), 'gmail-com|project:repo-1a2b');
  assert.equal(resultsKey(attn), resultsKey(nano)); // what the Context panel reads while a node is selected
  assert.equal(resultsKey(home), 'gmail-com|workspace:');
  assert.notEqual(resultsKey(nano), resultsKey(counter));
  assert.notEqual(scopeKey(attn), scopeKey(nano));
});

test('the store keeps one list per key, tracks the latest entry, and tells listeners new from updated', () => {
  const events = [];
  const stop = subscribeTurns((e) => events.push(e));
  assert.equal(getTurns('t1|a'), getTurns('t1|b')); // one stable empty list keeps useSyncExternalStore quiet
  pushTurn('t1|a', { id: 'a1', kind: 'note', text: 'one', label: 'A' });
  pushTurn('t1|b', { id: 'b1', kind: 'note', text: 'two', label: 'B' });
  assert.deepEqual(getTurns('t1|a').map((t) => t.id), ['a1']);
  assert.equal(getLatest().id, 'b1');
  const untouched = getTurns('t1|a');
  updateTurn('t1|b', 'b1', (t) => ({ ...t, text: 'two!' }));
  assert.equal(getTurns('t1|a'), untouched);
  assert.equal(getLatest().text, 'two!');
  assert.deepEqual(events, [{ key: 't1|a', pushed: true }, { key: 't1|b', pushed: true }, { key: 't1|b', pushed: false }]);
  stop();
});

test('a new thread forgets the thread id and the results of that key only', () => {
  threadIds.set('t2|a', 7);
  threadIds.set('t2|b', 8);
  pushTurn('t2|a', { id: 'x1', kind: 'note', text: 'x', label: 'A' });
  resetThread('t2|a');
  assert.equal(threadIds.has('t2|a'), false);
  assert.equal(threadIds.get('t2|b'), 8);
  assert.equal(getTurns('t2|a').length, 0);
});

test('SSE events fold into one answer; canvas-only and unknown events change nothing', () => {
  let a = { kind: 'answer', text: '', label: 'nanoGPT' };
  a = applyEvent(a, 'progress', { stage: 'Reading the graph' });
  a = applyEvent(a, 'chunk', { text: 'Start at ' });
  a = applyEvent(a, 'chunk', { text: 'model.py' });
  a = applyEvent(a, 'graph', { title: 'Attention', nodes: [] });
  a = applyEvent(a, 'papers', { papers: [{ id: '1706.03762', title: 'Attention Is All You Need', pdfUrl: 'https://arxiv.org/pdf/1706.03762' }] });
  a = applyEvent(a, 'wiki', { title: 'Transformer', url: 'https://en.wikipedia.org/wiki/Transformer' });
  a = applyEvent(a, 'video', { videoId: 'kCc8FmEb1nY', title: 'GPT from scratch', start: 0, end: null });
  assert.equal(a.text, 'Start at model.py');
  assert.equal(a.stage, 'Reading the graph');
  assert.equal(a.graph.title, 'Attention');
  assert.deepEqual(a.sources.map((s) => s.label), ['Attention Is All You Need', 'Transformer', 'GPT from scratch']);
  assert.equal(a.sources[2].href, 'https://www.youtube.com/watch?v=kCc8FmEb1nY');
  // T02 §9 research request sources: an id or a link resolves exactly
  assert.deepEqual(a.sources.map((s) => s.ref), [
    { kind: 'arxiv', ref: '1706.03762' }, { kind: 'wiki', ref: 'https://en.wikipedia.org/wiki/Transformer' }, { kind: 'youtube', ref: 'kCc8FmEb1nY' },
  ]);
  for (const type of ['outline', 'paper', 'proposal', 'mystery']) assert.equal(applyEvent(a, type, {}), a, type);
  assert.equal(applyEvent(a, 'done', { ok: true, threadId: 3 }).done, true);
  assert.deepEqual(applyEvent(a, 'error', { error: 'anthropic 529' }), { ...a, error: 'anthropic 529', done: true });
});

test('the collapsed line names the scope and shows one line', () => {
  assert.equal(lineOf({ kind: 'answer', label: 'nanoGPT', text: 'Start at model.py\nThen train.py' }), 'nanoGPT · Start at model.py');
  assert.equal(lineOf({ kind: 'answer', label: 'Gmail', text: '', error: "Couldn't reach the server." }), "Gmail · ✗ Couldn't reach the server.");
  assert.equal(lineOf({ kind: 'card', label: 'Gmail', card: { model: { title: 'Share counter' } } }), 'Gmail · Share counter');
  assert.equal(lineOf({ kind: 'results', label: 'Gmail', results: [{}, {}] }), 'Gmail · 2 matches');
  assert.equal(lineOf({ kind: 'results', label: 'Gmail', results: [] }), 'Gmail · No matches');
  assert.equal(lineOf({ kind: 'note', label: 'Gmail', text: 'Canvas created · Attention', undo: () => {} }), 'Gmail · Canvas created · Attention');
  assert.equal(lineOf({ kind: 'note', label: 'Gmail', text: 'Open an app to search its runs.', error: true }), 'Gmail · Open an app to search its runs.');
});

test('an empty draft follows the page; a waiting one keeps its scope (T02 §6.3)', () => {
  assert.equal(follow(null, nano, new Map()), nano);
  assert.equal(follow(nano, counter, new Map([[scopeKey(nano), '   ']])), counter);
  assert.equal(follow(nano, counter, new Map([[scopeKey(nano), 'Explain the merge loop']])), nano);
  assert.equal(follow(nano, counter, new Map([[scopeKey(counter), 'kept for counter']])), counter); // restored on return
});

test('switching a waiting draft moves or copies it, and never overwrites or drops one', () => {
  const d = new Map([[scopeKey(nano), 'why sqrt(dk)?']]);
  assert.deepEqual([...carry(d, nano, attn, false)], [[scopeKey(attn), 'why sqrt(dk)?']]);
  assert.deepEqual([...carry(d, nano, counter, true)], [[scopeKey(nano), 'why sqrt(dk)?'], [scopeKey(counter), 'why sqrt(dk)?']]);
  const both = new Map([...d, [scopeKey(counter), 'about counter']]);
  assert.equal(carry(both, nano, counter, false), both);
  assert.equal(carry(d, nano, nano, false), d);
});

test('a scope is named by its chips, the workspace by its name', () => {
  assert.equal(labelOf(home, 'Gmail'), 'Gmail');
  assert.equal(labelOf(nano, 'Gmail'), 'karpathy/nanoGPT');
  assert.equal(labelOf(attn, 'Gmail'), 'karpathy/nanoGPT · CausalSelfAttention');
});

test('the offer names what changed: another page, or a node on the same project', () => {
  assert.equal(offerFor(nano, nano), null);
  assert.equal(offerFor(nano, counter), 'resource');
  assert.equal(offerFor(nano, attn), 'selection');
  assert.equal(offerFor(attn, nano), 'resource'); // deselecting is a change too
});

test('× widens: dropping the resource drops its selection', () => {
  const surface = { org: 'gmail-com', place: 'project', resource: { kind: 'project', slug: 'repo-1a2b', title: 'nanoGPT' }, selected: { id: 'n7', label: 'CausalSelfAttention' } };
  assert.deepEqual(widen(surface, ['selected']), { ...surface, selected: null });
  assert.deepEqual(widen(surface, ['resource']), { ...surface, resource: null, selected: null });
  assert.equal(widen(surface, []), surface);
});

test('the placeholder follows the scope; the map status comes from the page first (T02 §12, §13)', () => {
  const catalog = [{ name: 'repo-1a2b', kind: 'repository', status: 'indexing' }, { name: 'repo-9f9f', kind: 'repository', status: 'ready' }];
  const surface = { resource: null, catalog };
  assert.equal(placeholderFor(home, surface), 'Start, open, ask, or paste a link…');
  assert.equal(placeholderFor(nano, surface), 'Code answers are available once the map is ready');
  // RepositoryPage's poll saw the map finish; the catalog Shell loaded has not.
  assert.equal(placeholderFor(nano, { catalog, resource: { kind: 'project', slug: 'repo-1a2b', title: 'karpathy/nanoGPT', status: 'ready' } }), 'Ask about karpathy/nanoGPT…');
  // A draft held for another project reads that project's catalog row, not this page's status.
  assert.equal(placeholderFor(nano, { catalog, resource: { kind: 'project', slug: 'repo-9f9f', status: 'ready' } }), 'Code answers are available once the map is ready');
  assert.equal(placeholderFor({ ...nano, slug: 'repo-9f9f', title: 'karpathy/minbpe' }, surface), 'Ask about karpathy/minbpe…');
  assert.equal(placeholderFor({ ...attn, slug: 'repo-9f9f' }, surface), 'Ask about CausalSelfAttention…');
  assert.equal(placeholderFor(counter, surface), 'Ask about counter…');
});

test('catalog matches show as an empty state, pills, or a list (T02 §6.6)', () => {
  const r = (n) => Array.from({ length: n }, (_, i) => ({ slug: `a${i}`, title: `A${i}`, kind: 'job' }));
  assert.equal(resultsView(r(0)), 'empty');
  assert.equal(resultsView(r(1)), 'pills');
  assert.equal(resultsView(r(5)), 'pills');
  assert.equal(resultsView(r(6)), 'list');
});

test('"/" at position 0 opens the picker with exactly four modes', () => {
  assert.deepEqual(MODES.map(([m]) => m), ['ask', 'teach', 'research', 'do']);
  assert.equal(modeQuery('/'), '');
  assert.equal(modeQuery('/te'), 'te');
  assert.equal(modeQuery('/teach why'), null);
  assert.equal(modeQuery('why /teach'), null);
  assert.equal(modeQuery(''), null);
});

test('modes a scope cannot serve carry their reason: T02 §6.4, and live chat history stays off on the preview', () => {
  assert.deepEqual(modeAvailability('auto', 'workspace'), { ok: true });
  // The third argument is flags.js askLiveOnPreview; passed here so this test holds whichever way the user decides.
  for (const kind of ['workspace', 'app']) assert.deepEqual(modeAvailability('ask', kind, false), { ok: false, reason: OFF }, kind);
  for (const kind of ['project', 'canvas']) assert.deepEqual(modeAvailability('ask', kind, false), { ok: true }, kind); // LEARN_DB
  for (const kind of ['workspace', 'app']) assert.deepEqual(modeAvailability('ask', kind, true), { ok: true }, kind);
  assert.deepEqual(modeAvailability('research', 'workspace'), { ok: false, reason: 'Research works inside a canvas.' });
  assert.deepEqual(modeAvailability('research', 'app'), { ok: false, reason: 'Research works inside a canvas.' });
  assert.deepEqual(modeAvailability('research', 'project'), { ok: false, reason: 'Research runs in a canvas' });
  assert.deepEqual(modeAvailability('research', 'canvas'), { ok: true });
  assert.deepEqual(modeAvailability('teach', 'workspace'), { ok: true, reason: 'creates a canvas first' });
  assert.deepEqual(modeAvailability('teach', 'project'), { ok: true });
  assert.deepEqual(modeAvailability('do', 'app'), { ok: true });
});

test('card states follow T02 §7.3 and the server 409 statuses of §7.4', () => {
  const t0 = Date.parse('2026-09-23T10:00:00Z');
  const card = { blocked: false, createdAt: t0 };
  const failed = (status, data) => ({ ...card, phase: 'failed', error: { status, data } });
  assert.deepEqual(cardView(card, t0 + 60_000), { state: 'pending' });
  assert.equal(cardView(card, t0 + EXPIRY_MS + 1).state, 'expired');
  assert.deepEqual(cardView({ ...card, phase: 'executing' }, t0), { state: 'executing' });
  assert.deepEqual(cardView({ ...card, phase: 'done' }, t0), { state: 'done' });
  assert.deepEqual(cardView(failed(500, { error: 'boom' }), t0), { state: 'failed' });
  assert.deepEqual(cardView(failed(409, { error: 'already approved', status: 'approved' }), t0), { state: 'done-elsewhere', note: 'Already approved.' });
  assert.deepEqual(cardView(failed(409, { error: 'already rejected', status: 'rejected' }), t0), { state: 'cancelled', note: 'Cancelled.' });
  assert.deepEqual(cardView(failed(409, { error: 'already invalidated', status: 'invalidated' }), t0), { state: 'cancelled', note: 'This thread was deleted.' });
  assert.equal(cardView(failed(409, { error: 'already expired', status: 'expired' }), t0).state, 'expired');
  assert.equal(cardView(failed(409, { error: 'already approved' }), t0).state, 'done-elsewhere'); // live today: no status field (index.js:1422)
  assert.equal(cardView(failed(403, { error: 'no access' }), t0).state, 'no-longer-allowed');
  assert.equal(cardView(failed(400, { error: 'no edit access' }), t0).state, 'no-longer-allowed'); // index.js:1428,1505
});

test('D7: a blocked card stays blocked however old; Cancel on it stays local', () => {
  assert.deepEqual(cardView({ blocked: true, createdAt: 0 }, EXPIRY_MS * 2), { state: 'blocked' });
  assert.deepEqual(cardView({ blocked: true, createdAt: 0, phase: 'cancelled' }, 0), { state: 'cancelled', note: 'Cancelled.' });
  assert.equal(rejectBody({ blocked: true, proposalId: 12 }), null);
  assert.equal(rejectBody({ blocked: false }), null); // a rule-routed card has no proposal to reject
  assert.deepEqual(rejectBody({ blocked: false, proposalId: 12 }), { proposal_id: 12 });
});

test('a Learn result: the bar shows the message learnAction wrote; only prefilled or added is done', () => {
  assert.deepEqual(learnOutcome({ status: 'prefilled', message: null }), { done: true, text: null, tone: null });
  assert.deepEqual(learnOutcome({ status: 'added', resourceId: 'r1', message: 'Added to canvas.' }), { done: true, text: 'Added to canvas.', tone: null });
  assert.deepEqual(learnOutcome({ status: 'fallback', message: "Opened Learn. Your prompt wasn't transferred; it's kept here." }), { done: false, text: "Opened Learn. Your prompt wasn't transferred; it's kept here.", tone: null });
  assert.deepEqual(learnOutcome({ status: 'timeout', message: 'Still working, check the canvas' }), { done: false, text: 'Still working, check the canvas', tone: null });
  assert.deepEqual(learnOutcome({ status: 'rejected', message: 'The composer already holds other text.' }), { done: false, text: 'The composer already holds other text.', tone: 'error' });
  assert.deepEqual(learnOutcome({ status: 'failed', message: 'Search failed. Try again.' }), { done: false, text: 'Search failed. Try again.', tone: 'error' });
});

test('History reads the existing thread endpoints for the scope', () => {
  assert.equal(threadsPath(home), '/api/ask/threads?scope=org');
  assert.equal(threadsPath(counter), '/api/ask/threads?scope=app&ref=counter');
  assert.equal(threadsPath(counter, 12), '/api/ask/threads/12');
  assert.equal(threadsPath(nano), '/api/repositories/repo-1a2b/threads');
  assert.equal(threadsPath(attn, 'th-9'), '/api/repositories/repo-1a2b/threads/th-9');
  // backend-canvas 'Learn resolves canvas-*': canvas chat history in LEARN_DB
  const canvas = { ...nano, kind: 'canvas', slug: 'canvas-0f3c9a1e', title: 'Attention deep dive' };
  assert.equal(threadsPath(canvas), '/api/ask/threads?scope=learn&ref=canvas-0f3c9a1e');
  assert.equal(threadsPath(canvas, 'canvaschat-9b1d'), '/api/ask/threads/canvaschat-9b1d');
});
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/agent/bar.test.mjs
```

Expected: Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../src/agent/bar.js'; ℹ fail 1

- [ ] **Step 3: Implement bar.js**

```jsx
// packages/web/src/agent/bar.js
// Agent Bar logic that needs no React (T02 §6, §7.3, §9): the result lists the
// sheet and the Context panel share, SSE folding, the draft and scope rules,
// card states and copy. Pure apart from the in-memory store; node:test loads it.
import { askLiveOnPreview } from '../flags.js';
import { chipsFor, scopeKey } from './scope.js';

// Results and threads are per resource: org|kind:slug. A selection is context for
// one question (repository_context), not a thread of its own (§6.3 thread table).
// Drafts stay per scopeKey, selection included.
export const resultsKey = (scope) => `${scope.org}|${scope.kind}:${scope.slug || ''}`;

// One result list per results key. Entries carry their own actions (retry, undo,
// confirm), so the sheet and the Context panel render the same thing.
const EMPTY = [];
const lists = new Map();
const listeners = new Set();
let last = null;
const emit = (event) => listeners.forEach((fn) => fn(event));
export const getTurns = (key) => lists.get(key) || EMPTY;
export const getLatest = () => (last && getTurns(last.key).find((t) => t.id === last.id)) || null;
// listener({ key, pushed }): key is a results key; pushed is true for a new entry, false for an update.
export function subscribeTurns(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function pushTurn(key, entry) { lists.set(key, [...getTurns(key), entry]); last = { key, id: entry.id }; emit({ key, pushed: true }); }
export function updateTurn(key, id, fn) { lists.set(key, getTurns(key).map((t) => (t.id === id ? fn(t) : t))); emit({ key, pushed: false }); }
export function setTurns(key, entries) { lists.set(key, entries); emit({ key, pushed: false }); }

// Threads stay per scope: one agent visually, separate conversations.
export const threadIds = new Map();
export function resetThread(key) { threadIds.delete(key); setTurns(key, EMPTY); }

const withSources = (answer, more) => ({ ...answer, sources: [...(answer.sources || []), ...more] });

// One SSE event folded into an answer. `ref` is the §9 research source for
// [Add to canvas]. outline and paper only act on a mounted canvas, and the bar
// handles proposals itself, so those and unknown events change nothing.
export function applyEvent(answer, type, data) {
  switch (type) {
    case 'chunk': return { ...answer, text: answer.text + data.text };
    case 'progress': return { ...answer, stage: data.stage };
    case 'graph': return { ...answer, graph: data };
    case 'papers': return withSources(answer, data.papers.map((p) => ({ label: p.title, href: p.pdfUrl, ref: { kind: 'arxiv', ref: p.id } })));
    case 'wiki': return withSources(answer, [{ label: data.title, href: data.url, ref: { kind: 'wiki', ref: data.url } }]);
    case 'video': return withSources(answer, [{ label: data.title || data.videoId, href: `https://www.youtube.com/watch?v=${encodeURIComponent(data.videoId)}`, ref: { kind: 'youtube', ref: data.videoId } }]);
    case 'error': return { ...answer, error: data.error, done: true };
    case 'done': return { ...answer, done: true };
    default: return answer;
  }
}

// The collapsed sheet: the latest result as one line (§6.5).
export function lineOf(t) {
  const n = t.results?.length;
  const text = t.kind === 'card' ? t.card.model.title
    : t.kind === 'choose' ? 'Which one do you mean?'
    : t.kind === 'results' ? (n ? `${n} ${n === 1 ? 'match' : 'matches'}` : 'No matches')
    : t.kind === 'note' ? t.text
    : t.error ? `✗ ${t.error}` : t.text || t.stage || '';
  return `${t.label} · ${text.split('\n')[0]}`;
}

// §6.3 no silent retargeting. The input types into `held`. While held has a
// waiting draft it keeps its scope; otherwise the bar follows the page and shows
// that scope's own draft (drafts are kept per scope key).
export const follow = (held, live, drafts) => (held && drafts.get(scopeKey(held))?.trim() ? held : live);

// Switching a waiting draft to another scope. × and [Use selection] refine the
// same question, so the text moves; [Ask about X instead] copies it, so the old
// scope still has its draft on return. A scope's own draft is never overwritten,
// and then the source keeps its text too: no draft is ever dropped.
export function carry(drafts, from, to, keep) {
  const [a, b] = [scopeKey(from), scopeKey(to)];
  if (a === b || drafts.get(b)?.trim()) return drafts;
  const next = new Map(drafts).set(b, drafts.get(a) || '');
  if (!keep) next.delete(a);
  return next;
}

// The bar names a scope by its chips, and the workspace (no chip) by its name.
export const labelOf = (scope, workspace) => chipsFor(scope).map((chip) => chip.label).join(' · ') || workspace;

// What to offer once the page moved away from a waiting draft.
export function offerFor(target, live) {
  if (scopeKey(target) === scopeKey(live)) return null;
  return target.org === live.org && target.slug === live.slug && live.selected ? 'selection' : 'resource';
}

// × on a chip widens the page's scope for this visit (§6.2); dropping the
// resource drops its selection too.
export function widen(surface, removed) {
  if (removed.includes('resource')) return { ...surface, resource: null, selected: null };
  if (removed.includes('selected')) return { ...surface, selected: null };
  return surface;
}

// §13 "Placeholder per scope". The map status is the page's own first
// (RepositoryPage publishes resource.status on every poll), else the catalog row
// Shell loaded (repository_apps.status, merged into /api/apps by dev-worker.js:23-28).
export function placeholderFor(scope, { resource = null, catalog = [] } = {}) {
  if (scope.kind === 'workspace') return 'Start, open, ask, or paste a link…';
  const status = resource?.slug === scope.slug && resource.status ? resource.status : (catalog || []).find((a) => a.name === scope.slug)?.status;
  if (scope.kind === 'project' && status !== 'ready') return 'Code answers are available once the map is ready';
  return `Ask about ${scope.selected?.label || scope.title || scope.slug}…`;
}

// §6.6 catalog lookup: none -> [Ask instead], up to 5 -> pills, more -> a list.
export const resultsView = (results) => (!results.length ? 'empty' : results.length <= 5 ? 'pills' : 'list');

// §6.2: exactly four modes. Copy from Direction C flow 5.
export const MODES = [
  ['ask', 'Answer from this context. Changes nothing.'],
  ['teach', 'Explain or extend a Learn canvas'],
  ['research', 'Find sources and evidence'],
  ['do', 'Do something. Asks before anything lasting.'],
];

// '/' at position 0 opens the picker and '/te' filters it; null means no picker.
export const modeQuery = (text) => text.match(/^\/([a-z]*)$/)?.[1] ?? null;

// §6.4: which modes a scope can serve; the reason shows dimmed in the picker, and
// ask() refuses with it. Workspace and app asks go to /api/ask, which writes live
// chat history (control-plane index.js:1194-1201), so the preview keeps them off
// until the user turns askLiveOnPreview on (flags.js). Project and canvas asks use LEARN_DB.
const ASK_OFF = 'Asking about the workspace or apps is off on this preview: it would write to live chat history.';
export function modeAvailability(mode, kind, askLive = askLiveOnPreview) {
  if (mode === 'ask' && !askLive && (kind === 'workspace' || kind === 'app')) return { ok: false, reason: ASK_OFF };
  if (mode === 'research' && kind !== 'canvas') return { ok: false, reason: kind === 'project' ? 'Research runs in a canvas' : 'Research works inside a canvas.' };
  if (mode === 'teach' && kind === 'workspace') return { ok: true, reason: 'creates a canvas first' };
  return { ok: true };
}

// §7.4: a proposal older than 15 minutes can no longer be approved.
export const EXPIRY_MS = 15 * 60 * 1000;
const EXPIRED = { state: 'expired', note: 'Expired: older than 15 minutes. Ask again to redo it.' };
const CANCELLED = { state: 'cancelled', note: 'Cancelled.' };

// §7.3 card state from what the user did (phase) and the approve or reject error.
// 409 carries the proposal's status ({status} once the §7.4 fixes ship; live
// today only says 'already <status>', index.js:1422). A failed permission
// recheck is 403, or 400 'no edit access' on live today (index.js:1428,1505).
export function cardView({ blocked, createdAt, phase, error }, now) {
  if (phase === 'cancelled') return CANCELLED;
  if (blocked) return { state: 'blocked' };
  if (phase === 'failed') {
    const status = error?.status === 409 && (error.data?.status || /^already (\w+)/.exec(error.data?.error || '')?.[1]);
    if (status === 'approved') return { state: 'done-elsewhere', note: 'Already approved.' };
    if (status === 'rejected') return CANCELLED;
    if (status === 'invalidated') return { state: 'cancelled', note: 'This thread was deleted.' };
    if (status === 'expired') return EXPIRED;
    if (error?.status === 403 || error?.data?.error === 'no edit access') return { state: 'no-longer-allowed', note: 'No longer allowed: your permission in this workspace changed.' };
    return { state: 'failed' };
  }
  if (phase) return { state: phase }; // executing | done
  return now - createdAt > EXPIRY_MS ? EXPIRED : { state: 'pending' };
}

// §7.4 #3: Cancel is recorded server-side as rejected.
// ponytail: live small-cp has no /api/ask/reject until the §7.4 fixes are
// promoted, and D7 blocks every proposal on dev builds, so a Blocked card (and a
// rule-routed card, which has no proposal) cancels locally only.
export const rejectBody = (card) => (card.proposalId && !card.blocked ? { proposal_id: card.proposalId } : null);

// §9: learnAction words every outcome in result.message (agent/learn-hook.js); the
// bar only decides whether the draft is done and whether the line is an error.
export function learnOutcome(r) {
  return { done: r.status === 'prefilled' || r.status === 'added', text: r.message || null, tone: r.status === 'rejected' || r.status === 'failed' ? 'error' : null };
}

// §6.3 History: the existing thread endpoints per scope, as AskPanel uses them
// (index.js:1358-1372, repositories.js:162-166). Canvas threads live in LEARN_DB
// on the same /api/ask/threads paths (backend-canvas 'Learn resolves canvas-*').
export function threadsPath(scope, id) {
  if (scope.kind === 'project') return `/api/repositories/${scope.slug}/threads${id ? `/${id}` : ''}`;
  if (id) return `/api/ask/threads/${id}`;
  if (scope.kind === 'canvas') return `/api/ask/threads?scope=learn&ref=${encodeURIComponent(scope.slug)}`;
  return scope.kind === 'app' ? `/api/ask/threads?scope=app&ref=${encodeURIComponent(scope.slug)}` : '/api/ask/threads?scope=org';
}
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/agent/bar.test.mjs && npm run test:unit
```

Expected: bar.test.mjs: ℹ tests 18, ℹ pass 18, ℹ fail 0 (reproduced in scratchpad/agentui3 against agent-core's planned scope.js, with flags.js askLiveOnPreview set to false and to true). Full web suite: ℹ fail 0.

- [ ] **Step 4: Create ConfirmCard.jsx (its states come from cardView, tested above) and prove its imports resolve**

```jsx
// packages/web/src/agent/ConfirmCard.jsx
import { Loader2 } from 'lucide-react';
import { navigate } from '../api.js';
import { Button } from '../ui.jsx';
import { cardView } from './bar.js';

// T02 §7.3: the card always names the exact workspace, target, operation,
// parameters and effect. Nothing runs until Confirm; a D7-blocked card can't be
// confirmed. The Start dialog's connect_repository renders the same card.
export default function ConfirmCard({ card, onConfirm, onChange, onCancel }) {
  const { model } = card;
  const { state, note } = cardView(card, Date.now());
  const params = Object.entries(model.params || {}).map(([k, v]) => `${k} ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' · ');
  return (
    <div data-confirm-card={state} className="max-w-[520px] rounded-md border border-line p-3 text-sm">
      <div className="flex items-baseline gap-2 pb-2">
        <span className="min-w-0 flex-1 truncate font-medium">{model.title}</span>
        <span className="shrink-0 text-xs text-ink-2">{model.workspace}</span>
      </div>
      <dl className="grid grid-cols-[84px_1fr] gap-x-3 gap-y-1 text-[13px]">
        <dt className="text-ink-2">Target</dt><dd className="min-w-0 break-words">{model.target}</dd>
        <dt className="text-ink-2">Operation</dt><dd className="min-w-0 break-words">{model.operation}{params && ` · ${params}`}</dd>
        <dt className="text-ink-2">Effect</dt><dd className="min-w-0 break-words">{model.effect}</dd>
      </dl>
      {state === 'blocked' && <p role="note" className="pt-2 text-xs text-warn">{card.reason}</p>}
      {state === 'failed' && <p role="alert" className="pt-2 text-xs text-danger">✗ {card.error?.message}</p>}
      {state === 'executing' && <p className="flex items-center gap-2 pt-2 text-xs text-ink-2"><Loader2 size={13} className="animate-spin" />Working…</p>}
      {state === 'done' && <p className="pt-2 text-xs text-ink-2">Done.{card.href && <Button size="sm" variant="accent" className="ml-1" onClick={() => navigate(card.href)}>Open</Button>}</p>}
      {note && <p className="pt-2 text-xs text-ink-2">{note}</p>}
      {['pending', 'failed', 'blocked'].includes(state) && (
        <div className="flex gap-2 pt-2">
          <Button size="sm" variant="primary" disabled={state === 'blocked' || !onConfirm} onClick={onConfirm}>Confirm</Button>
          <Button size="sm" onClick={onChange}>Change</Button>
          <Button size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      )}
    </div>
  );
}
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node -e "require('esbuild').buildSync({ entryPoints: ['src/agent/ConfirmCard.jsx'], bundle: true, write: false, jsx: 'automatic', format: 'esm', packages: 'external', logLevel: 'silent' }); console.log('ConfirmCard resolves')"
```

Expected: ConfirmCard resolves. esbuild (root node_modules, 0.28.1) fails on a missing file or a missing named export (negative control run in scratchpad/agentui3), so this proves cardView, navigate and Button resolve. The rendered states are checked in the browser by settings-deploy's 'start:' labels (order 8.6) and the 'bar-cmd:' labels (order 10.3).

- [ ] **Step 5: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && P='packages/web/src/agent/bar.js packages/web/src/agent/bar.test.mjs packages/web/src/agent/ConfirmCard.jsx' && git add $P && git commit --only $P -m 'feat(agent): Agent Bar helpers keyed per resource, the preview ask guard, and the Confirm card'
```

Expected: make test-unit is green. One commit containing only these 3 paths, before settings-deploy order 8 imports ConfirmCard.

---

### Task 29: Start a rabbit hole: pure start.js, then the UI-only StartDialog on the shared registry, ConfirmCard and learnAction

*Area:* Settings, Connections, Start dialog, e2e, deploy · *Brief:* T06 · *Order:* 8

**Files:**
- `packages/web/src/start.js`
- `packages/web/src/start.test.mjs`
- `packages/web/src/StartDialog.jsx`
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: From agent-core: agent/commands.js prepareCommand(name, args, ctx) -> {args, card, policy:{blocked, reason}} and executeCommand(name, args, ctx) -> Result. connect_repository resolve reads the default branch and throws a readable error for a private or missing repository. create_canvas {title, open:true} navigates inside run() and resolves href '/apps/canvas-<8hex>'; this area needs href for open:true too. open_settings {tab} dispatches 'small:settings'. From agent-core: agent/router.js route(text), where rule 2 returns {type:'command', name:'connect_repository', args:{url, repo}}. From agent-core: agent/learn-hook.js learnAction('teach', {app, prompt, from:'start'}, ctx) -> {status, message?, reason?}, which with learnHandoff false returns {status:'fallback', message} with the T02 §5 Question copy. From agent-ui's bar.js + ConfirmCard.jsx task (order 7.8): agent/ConfirmCard.jsx default export ({card:{model, blocked, reason, createdAt, phase, error}, onConfirm, onChange, onCancel}), rendering [data-confirm-card], which imports cardView from agent/bar.js. connections.js (order 2.4). ctx is ctxOf(getSurface()) from agent-core (order 4), passed in by agent-ui's StartHost (order 8.5); StartDialog builds no ctx of its own. learnAction opens Learn itself when needed; after create_canvas {open:true} the canvas route is already the Learn view, so it does not navigate again, and the dialog never navigates after it.
- Produces: The StartDialog default export ({ ctx, initial, onClose }) that agent-ui's StartHost renders with ctxOf(getSurface()), and the start.js helpers. The Start block in the harness (labels: start ×3, J17, J18), shown failing on the clone here and green at order 8.6, after StartHost (8.5).

- [ ] **Step 1: Precondition: the shared modules this dialog imports exist on HEAD**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && ls src/agent/commands.js src/agent/router.js src/agent/learn-hook.js src/agent/bar.js src/agent/ConfirmCard.jsx src/connections.js && grep -n 'export async function prepareCommand\|export async function executeCommand\|export const ctxOf' src/agent/commands.js && grep -n 'export async function learnAction\|export function learnAction' src/agent/learn-hook.js && grep -n 'export const cardView\|export function cardView' src/agent/bar.js
```

Expected: All six paths are listed; prepareCommand, executeCommand, ctxOf, learnAction and cardView are found. If bar.js or ConfirmCard.jsx is missing, stop: agent-ui's order-7.8 task must land first, otherwise the build fails with "Could not resolve './agent/ConfirmCard.jsx'" (or './bar.js').

- [ ] **Step 2: Failing unit test**

```jsx
// packages/web/src/start.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSubmit, pathOr, repositoryArgs, slugOf, teachPrompt, titleFromQuestion } from './start.js';

test('the dialog opens on the path it was asked for, Repository otherwise', () => {
  for (const path of ['repository', 'sources', 'question', 'blank']) assert.equal(pathOr(path), path);
  assert.equal(pathOr(undefined), 'repository');
  assert.equal(pathOr('share'), 'repository');
});

test('a GitHub URL becomes connect_repository args through the bar router, anything else does not', () => {
  assert.deepEqual(repositoryArgs('https://github.com/karpathy/nanoGPT'), { url: 'https://github.com/karpathy/nanoGPT', repo: 'karpathy/nanoGPT' });
  assert.equal(repositoryArgs('https://gitlab.com/karpathy/nanoGPT'), null);
  assert.equal(repositoryArgs('nanoGPT'), null);
  assert.equal(repositoryArgs(''), null);
});

test('Question: the canvas is named after the question, and depth rides the prompt', () => {
  assert.equal(titleFromQuestion('  why   does attention\n scale by sqrt(dk)? '), 'why does attention scale by sqrt(dk)?');
  assert.equal(titleFromQuestion('x'.repeat(200)).length, 80);
  assert.equal(teachPrompt(' why? ', null), 'why?');
  assert.equal(teachPrompt('why?', 'Deep dive'), 'why?\n\nDepth: Deep dive');
});

test('submit is possible only when the path has what it needs', () => {
  const f = { url: '', sources: '', method: 'upload', question: '', blank: '' };
  assert.equal(canSubmit('repository', f), false);
  assert.equal(canSubmit('repository', { ...f, url: 'https://github.com/a/b' }), true);
  assert.equal(canSubmit('question', { ...f, question: '   ' }), false);
  assert.equal(canSubmit('question', { ...f, question: 'why?' }), true);
  assert.equal(canSubmit('sources', f), true);
  assert.equal(canSubmit('sources', { ...f, method: 'connection' }), false); // every connection source is Planned (T02 §5)
  assert.equal(canSubmit('blank', f), true); // the title is optional: Untitled canvas
});

test('the new canvas slug is read from the command result', () => {
  assert.equal(slugOf('/apps/canvas-1a2b3c4d'), 'canvas-1a2b3c4d');
  assert.equal(slugOf('/apps/canvas-1a2b3c4d?tab=learn'), 'canvas-1a2b3c4d');
  assert.equal(slugOf(undefined), null);
});
```

- [ ] **Step 3: Watch it fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/start.test.mjs
```

Expected: Fails with ERR_MODULE_NOT_FOUND for ./start.js. Exit code 1.

- [ ] **Step 4: Implement start.js**

```jsx
// packages/web/src/start.js
// Start a rabbit hole (T02 §5): the dialog's decisions, pure so node can test them.
import { route } from './agent/router.js';

export const PATHS = [['repository', 'Repository'], ['sources', 'Sources'], ['question', 'Question'], ['blank', 'Blank canvas']];
export const UNTITLED = 'Untitled canvas';

// 'small:start' carries a path; anything else opens on the first tab.
export const pathOr = (path) => (PATHS.some(([id]) => id === path) ? path : 'repository');

// The bar's rule 2 (T02 §6.6) decides what a GitHub URL is, so the dialog and the bar agree.
export function repositoryArgs(text) {
  const decision = route(text);
  return decision.type === 'command' && decision.name === 'connect_repository' ? decision.args : null;
}

export const titleFromQuestion = (question) => question.replace(/\s+/g, ' ').trim().slice(0, 80);

// ponytail: the Learn hook request has no depth field (T02 §9), so depth rides the prompt; add a field if Learn wants one.
export const teachPrompt = (question, depth) => (depth ? `${question.trim()}\n\nDepth: ${depth}` : question.trim());

// Sources from a connection are all Planned, so that method cannot submit (T02 §5).
export function canSubmit(path, f) {
  if (path === 'repository') return !!f.url.trim();
  if (path === 'question') return !!f.question.trim();
  if (path === 'sources') return f.method === 'upload';
  return true;
}

export const slugOf = (href) => href?.match(/^[/]apps[/]([a-z0-9-]+)/)?.[1] || null;
```

- [ ] **Step 5: Green**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/start.test.mjs
```

Expected: tests 5, pass 5, fail 0.

- [ ] **Step 6: Insert the Start block into the harness above the marker line. It fails until StartHost (agent-ui, order 8.5) and this dialog are on the clone; 8.6 proves them.**

```jsx
{
  // ── Start a rabbit hole (T02 §5; brief §21 J17, J18). Never creates a repository. ──
  const URL_FIELD = 'https://github.com/owner/repository';

  await check('start: one lookup in flight; an error keeps every field; the copy says what is true', async () => {
    const page = await open();
    let lookups = 0;
    // Hold the lookup, then fail it the way repository_jobs.py:27 does for a private or missing repository.
    await page.route('**/api/repositories/branches**', async (route) => {
      lookups++;
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Public repository was not found or GitHub is unavailable' }) });
    });
    await openStart(page, 'repository');
    const dialog = startDialog(page);
    const url = dialog.getByPlaceholder(URL_FIELD);
    const typed = 'https://github.com/rabbit-hole-e2e/private-or-missing';
    await url.fill(typed);
    await url.press('Enter');
    await url.press('Enter');
    must(await dialog.getByRole('button', { name: 'Check repository' }).isDisabled(), 'submit enabled while a lookup is in flight');
    await dialog.getByRole('alert').waitFor({ timeout: 5000 });
    must(lookups === 1, `${lookups} lookups for one submit`);
    must(await url.inputValue() === typed, 'the error cleared the URL');
    const text = await dialog.innerText();
    for (const fact of [`Visible to everyone in ${wsLabel}`, "can't be deleted yet", "private repositories aren't supported yet"]) must(text.includes(fact), `missing: ${fact}`);
    await dialog.getByRole('tab', { name: 'Blank canvas', exact: true }).click();
    await dialog.getByPlaceholder('Untitled canvas').fill('kept');
    await dialog.getByRole('tab', { name: 'Repository', exact: true }).click();
    must(await url.inputValue() === typed, 'switching tabs lost the URL');
    await dialog.getByRole('tab', { name: 'Blank canvas', exact: true }).click();
    must(await dialog.getByPlaceholder('Untitled canvas').inputValue() === 'kept', 'switching tabs lost the title');
    await page.context().close();
  });

  await check('start: a GitHub URL shows the connect card with workspace, target and branch; Change keeps the URL', async () => {
    const page = await open();
    const writes = [];
    page.on('request', (r) => { if (r.method() !== 'GET') writes.push(`${r.method()} ${new URL(r.url()).pathname}`); });
    // A canned lookup: the check never reaches GitHub and never clicks Confirm, so no project is created.
    await page.route('**/api/repositories/branches**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ repo: 'rabbit-hole-e2e/demo', defaultBranch: 'main', branches: ['main'], hasMore: false, page: 1 }) }));
    await openStart(page, 'repository');
    const dialog = startDialog(page);
    const url = dialog.getByPlaceholder(URL_FIELD);
    await url.fill('https://github.com/rabbit-hole-e2e/demo');
    await dialog.getByRole('button', { name: 'Check repository' }).click();
    const card = dialog.locator('[data-confirm-card]');
    await card.waitFor({ timeout: 10000 });
    const text = await card.innerText();
    for (const fact of [wsLabel, 'rabbit-hole-e2e/demo', 'main']) must(text.includes(fact), `card lacks ${fact}: ${text}`);
    must(await card.getByRole('button', { name: 'Confirm' }).isEnabled(), 'connect_repository is Blocked, but T02 §16 allows it on the review copy');
    await card.getByRole('button', { name: 'Change' }).click();
    await card.waitFor({ state: 'detached', timeout: 3000 });
    must(await url.inputValue() === 'https://github.com/rabbit-hole-e2e/demo', 'Change lost the URL');
    must(!writes.some((w) => w.endsWith('/api/repositories')), `a repository create was sent: ${writes}`);
    await page.context().close();
  });

  await check('start: the dialog opens on the path it was asked for', async () => {
    const page = await open();
    await openStart(page, 'question');
    must(await startDialog(page).getByRole('tab', { name: 'Question', exact: true }).getAttribute('data-state') === 'active', 'the Question tab is not active');
    await page.context().close();
  });

  await check('J17: Start Sources → From a connection lists Planned tiles and cannot submit', async () => {
    const page = await open();
    await openStart(page, 'sources');
    const dialog = startDialog(page);
    await dialog.getByRole('radio', { name: 'From a connection' }).click();
    for (const name of ['Google Slides', 'Google Drive / Docs', 'Notion']) {
      const tile = dialog.locator('[aria-disabled="true"]', { hasText: name });
      must(await tile.count() === 1 && (await tile.innerText()).includes('Planned'), `${name} tile is not Planned`);
    }
    must(await dialog.getByRole('button', { name: 'Create canvas' }).isDisabled(), 'Create canvas is enabled for a planned method');
    await page.context().close();
  });

  await check('J18: choosing a planned deck does nothing and claims nothing', async () => {
    const page = await open();
    await openStart(page, 'sources');
    const dialog = startDialog(page);
    await dialog.getByRole('radio', { name: 'From a connection' }).click();
    const writes = [];
    page.on('request', (r) => { if (r.method() !== 'GET') writes.push(r.url()); });
    const before = page.url();
    await dialog.locator('[aria-disabled="true"]', { hasText: 'Google Slides' }).click({ force: true }); // force: aria-disabled blocks the actionability wait
    must(page.url() === before && writes.length === 0, 'a planned tile navigated or wrote');
    must(!/connected|imported|syncing/i.test(await dialog.innerText()), 'the dialog claims a connection or import');
    await page.context().close();
  });
}
```

- [ ] **Step 7: Run the Start labels against the clone as it stands. They must fail.**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=start,J17,J18 node e2e/rabbit-hole-check.mjs
```

Expected: All 5 labels print FAIL: openStart times out because nothing on the clone hosts 'small:start' until agent-ui's StartHost (order 8.5). The run ends '5 FAILURES', exit 1.

- [ ] **Step 8: Implement StartDialog.jsx (UI only)**

```jsx
// packages/web/src/StartDialog.jsx
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { wsName } from './api.js';
import { executeCommand, prepareCommand } from './agent/commands.js';
import ConfirmCard from './agent/ConfirmCard.jsx';
import { learnAction } from './agent/learn-hook.js';
import { learnHandoff } from './flags.js';
import { connectionsFor } from './connections.js';
import { canSubmit, PATHS, pathOr, repositoryArgs, slugOf, teachPrompt, titleFromQuestion, UNTITLED } from './start.js';
import { Button, cn, IconBtn, Input, Pill, Tabs, TabsContent, TabsList, TabsTrigger, toast } from './ui.jsx';

const PLANNED = connectionsFor().filter((c) => c.availability === 'planned');
const LOCAL = 'Only you can see this canvas. Its content stays in this browser.';

// T02 §5: one portaled dialog with four paths, hosted once by StartHost (main.jsx) on
// 'small:start'. Radix mounts only the active tab, so Enter submits the one form on screen.
// Fields live here, so a tab switch, Settings on top, or a failed request never clears them.
// Every action is a registry entry the Agent Bar also uses; run() navigates, this never does.
// ponytail: Start lands on Learn, where the bar yields, so 'Canvas created · Undo' (T02 §8.4)
// has no surface from here; Archive in the Library row menu covers removal. Recorded in T02 §17.
export default function StartDialog({ ctx, initial, onClose }) {
  const self = useRef(null);
  const inFlight = useRef(false); // one request at a time: no duplicate projects or canvases
  const [path, setPath] = useState(() => pathOr(initial));
  useEffect(() => { setPath(pathOr(initial)); }, [initial]);
  const [f, setF] = useState({ url: '', sources: '', method: 'upload', question: '', depth: null, blank: '' });
  const [card, setCard] = useState(null); // connect_repository: { prepared, createdAt, phase, error }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const workspace = ctx.orgName || wsName(ctx.org);
  const set = (key, value) => { setF((s) => ({ ...s, [key]: value })); setError(''); if (key === 'url') setCard(null); };
  const field = (key) => ({ value: f[key], onChange: (e) => set(key, e.target.value) });
  const close = () => { if (!inFlight.current) onClose(); };
  useEffect(() => {
    // Only the top dialog takes Esc: Settings, or a confirm opened over this one, closes first.
    const esc = (e) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (e.key === 'Escape' && dialogs[dialogs.length - 1] === self.current) close();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const run = (work) => async (e) => {
    e?.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try { await work(); } catch (er) { setError(er.message); } finally { inFlight.current = false; setBusy(false); }
  };
  // open: true makes create_canvas.run navigate to the new canvas (contract: callers never navigate after run).
  const canvas = async (title) => {
    const result = await executeCommand('create_canvas', { title, open: true }, ctx);
    onClose();
    return result;
  };
  const onRepository = run(async () => {
    const args = repositoryArgs(f.url);
    if (!args) throw Error('Enter a public GitHub repository URL, like https://github.com/owner/repository.');
    // resolve() reads the default branch, so a private or missing repository fails here, before any card.
    setCard({ prepared: await prepareCommand('connect_repository', args, ctx), createdAt: Date.now() });
  });
  const onConfirm = run(async () => {
    setCard((c) => ({ ...c, phase: 'executing', error: null }));
    try {
      await executeCommand('connect_repository', card.prepared.args, ctx); // run() opens the new project
      onClose();
    } catch (er) {
      setCard((c) => ({ ...c, phase: 'failed', error: er }));
    }
  });
  const onSources = run(() => canvas(f.sources.trim() || UNTITLED));
  const onBlank = run(() => canvas(f.blank.trim() || UNTITLED));
  const onQuestion = run(async () => {
    const prompt = teachPrompt(f.question, f.depth);
    // Handoff off: copy the question while the submit gesture is still active, so the fallback line is true.
    const copied = !learnHandoff && (await navigator.clipboard?.writeText(prompt).then(() => true, () => false));
    const { href } = await canvas(titleFromQuestion(f.question));
    // T02 §9 through the one hook: with learnHandoff off nothing is sent and the fallback copy comes back.
    const r = await learnAction('teach', { app: slugOf(href), prompt, from: 'start' }, ctx);
    // learnAction owns navigation and every outcome line (contract v3): it sees the canvas already open,
    // so it does not navigate again, and this shows only its message (null on prefilled).
    if (r.status === 'fallback' && !copied) toast("Opened your canvas. Your question wasn't transferred.");
    else if (r.message) toast(r.message);
  });
  const foot = (label, disabled) => (
    <div className="flex items-center justify-end gap-2 pt-4">
      <Button type="button" variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
      {label && <Button type="submit" variant="primary" disabled={busy || disabled}>{busy && <Loader2 size={14} className="animate-spin" />}{label}</Button>}
    </div>
  );
  const choice = (key, value, label) => (
    <button key={value} type="button" role="radio" aria-checked={f[key] === value}
      onClick={() => set(key, key === 'depth' && f.depth === value ? null : value)}
      className={cn('h-8 rounded-lg border px-3 text-sm', f[key] === value ? 'border-ink bg-hover font-medium text-ink' : 'border-line text-ink-2 hover:bg-hover hover:text-ink')}>{label}</button>
  );
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 animate-[fade-in_100ms_ease-out]" onMouseDown={close}>
      <div ref={self} role="dialog" aria-modal="true" aria-labelledby="start-title" className="mt-[12vh] w-[520px] max-w-full rounded-2xl bg-white p-4 text-ink shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 id="start-title" className="text-sm font-semibold">Start a rabbit hole</h2>
          <IconBtn aria-label="Close" onClick={close} disabled={busy}><X size={14} /></IconBtn>
        </div>
        <p className="pb-3 text-xs text-ink-2">Start from a repository, sources, a question, or a blank canvas.</p>
        <Tabs value={path} onValueChange={(p) => { setPath(p); setError(''); }}>
          <TabsList pill className="max-w-full overflow-x-auto">
            {PATHS.map(([id, label]) => <TabsTrigger key={id} pill value={id}>{label}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="repository">
            <form onSubmit={onRepository} className="pt-4">
              <label className="block text-sm">GitHub URL
                <Input autoFocus inputMode="url" placeholder="https://github.com/owner/repository" className="mt-1" {...field('url')} />
              </label>
              <p className="mt-3 text-xs text-ink-2">Visible to everyone in {workspace}. Connected repositories can't be deleted yet. Public GitHub only; private repositories aren't supported yet.</p>
              {/* ponytail: no branch select - the metadata worker always returns a default branch (repository_jobs.py:40); add one when it can return none */}
              {!card && foot('Check repository', !canSubmit('repository', f))}
            </form>
            {/* Outside the form: the card's buttons are plain <button>s and would submit it (ui.jsx:23-41). */}
            {card && (
              <div className="pt-3">
                <ConfirmCard
                  card={{ model: card.prepared.card, blocked: card.prepared.policy.blocked, reason: card.prepared.policy.reason, createdAt: card.createdAt, phase: card.phase, error: card.error }}
                  onConfirm={onConfirm}
                  onChange={() => setCard(null)}
                  onCancel={() => setCard(null)}
                />
                {foot(null)}
              </div>
            )}
          </TabsContent>
          <TabsContent value="sources">
            <form onSubmit={onSources} className="pt-4">
              <label className="block text-sm">Canvas title
                <Input autoFocus placeholder={UNTITLED} className="mt-1" {...field('sources')} />
              </label>
              <div role="radiogroup" aria-label="Add sources by" className="flex flex-wrap gap-2 pt-3">
                {choice('method', 'upload', 'Upload (PDF)')}
                {choice('method', 'connection', 'From a connection')}
              </div>
              {f.method === 'upload'
                ? <p className="mt-3 text-xs text-ink-2">After the canvas opens, add the PDF from the canvas menu: Sources → PDF… {LOCAL}</p>
                : (
                  <div className="mt-3 grid grid-cols-3 gap-2 max-sm:grid-cols-1">
                    {PLANNED.map((c) => (
                      <div key={c.id} aria-disabled="true" className="rounded-lg border border-line p-2 text-sm text-ink-2">
                        <div className="flex items-center justify-between gap-1 text-ink">{c.name}<Pill>Planned</Pill></div>
                        <div className="pt-1 text-xs">{c.adds}</div>
                      </div>
                    ))}
                    <Button type="button" size="sm" className="col-span-full justify-self-start" onClick={() => executeCommand('open_settings', { tab: 'connections' }, ctx)}>Manage connections</Button>
                  </div>
                )}
              {foot('Create canvas', !canSubmit('sources', f))}
            </form>
          </TabsContent>
          <TabsContent value="question">
            <form onSubmit={onQuestion} className="pt-4">
              <label className="block text-sm">Question
                <Input autoFocus placeholder="What do you want to understand?" className="mt-1" {...field('question')} />
              </label>
              <div role="radiogroup" aria-label="Depth (optional)" className="flex flex-wrap gap-2 pt-3">
                {['Overview', 'Guided', 'Deep dive'].map((d) => choice('depth', d, d))}
              </div>
              <p className="mt-3 text-xs text-ink-2">Opens a new canvas named after your question. {LOCAL}</p>
              {foot('Create canvas', !canSubmit('question', f))}
            </form>
          </TabsContent>
          <TabsContent value="blank">
            <form onSubmit={onBlank} className="pt-4">
              <label className="block text-sm">Title
                <Input autoFocus placeholder={UNTITLED} className="mt-1" {...field('blank')} />
              </label>
              <p className="mt-3 text-xs text-ink-2">{LOCAL}</p>
              {foot('Create canvas', !canSubmit('blank', f))}
            </form>
          </TabsContent>
        </Tabs>
        {error && <p role="alert" className="pt-3 text-sm text-danger">{error}</p>}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 9: Unit tests plus a live build: StartDialog is only reachable through the dev-only StartHost**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/start.test.mjs src/connections.test.mjs && npm run build
```

Expected: tests 11, pass 11. vite build (live flags off) prints 'built in', with no unresolved import. dist/ is gitignored and not deployed.

- [ ] **Step 10: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git add packages/web/src/start.js packages/web/src/start.test.mjs packages/web/src/StartDialog.jsx packages/web/e2e/rabbit-hole-check.mjs && git commit --only -m 'feat(web): Start a rabbit hole dialog on the shared command registry, ConfirmCard and learnAction' -- packages/web/src/start.js packages/web/src/start.test.mjs packages/web/src/StartDialog.jsx packages/web/e2e/rabbit-hole-check.mjs
```

Expected: make test-unit is green, with the web suite 5 higher than before this task. The commit contains exactly these 4 paths.

---

### Task 30: One Start dialog host in Root, and Shell publishes the workspace identity that every command ctx reads

*Area:* Agent Bar UI · *Brief:* T06 · *Order:* 8.5

**Files:**
- `packages/web/src/agent/StartHost.jsx`
- `packages/web/src/main.jsx`
- `packages/web/src/Shell.jsx`
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: agent/surface.js useSurface and patchSurface (agent-core, order 2; setSurface keeps identity). agent/commands.js ctxOf(surface, overrides?) (agent-core, order 4). flags.js learnPreview (shell-home, order 1). StartDialog.jsx default export ({ ctx, initial, onClose }) (settings-deploy, order 8). main.jsx as shell-home order 2.5 leaves it: line 1 is import React, { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react'; and learnPreview is imported from './flags.js'. The harness and its helpers (settings-deploy order 0.5).
- Produces: The only 'small:start' host: agent/StartHost.jsx, lazy-mounted in Root after <SearchModal />, rendering StartDialog with ctx = ctxOf(surface). The identity { org, email, orgName, catalog: data.apps } is on the surface once Shell loads, and survives every Root baseline and page setSurface. The 'start-host:' check.

- [ ] **Step 1: Precondition: shell-home's main.jsx line 1 and flags import, and settings-deploy's StartDialog, are on HEAD**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && grep -n "^import React, { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react';" src/main.jsx && grep -n "learnPreview.*from './flags.js'" src/main.jsx && grep -n "export default function StartDialog({ ctx, initial, onClose })" src/StartDialog.jsx
```

Expected: Three lines. main.jsx line 1 already names lazy and Suspense (CONTRACT v3: later tasks add names to that import, never replace the line), so this task neither touches line 1 nor adds a flags import. If a grep prints nothing, stop: shell-home 2.5 or settings-deploy 8 has not landed.

- [ ] **Step 2: Failing e2e first: insert the Start host block above the harness marker, then run it against the clone**

```jsx
// packages/web/e2e/rabbit-hole-check.mjs: insert this block directly ABOVE the marker line
//   // ── journey checks: each area inserts its block above this line, wrapped in { } ──
// (the one harness, settings-deploy order 0.5). It reuses the harness's top-level base, UA, session, apps,
// repo, plain, wsLabel, check, must, open, loaded, spa, settings, startDialog, barOf and barInput; it declares
// nothing at top level and never closes the browser.
{
  // ── agent-ui (T02 §3.3, §5): the one Start host, with the workspace identity in its ctx ──
  await check('start-host: small:start opens one Start dialog on the asked tab, naming the workspace after a navigation', async () => {
    const page = await open();
    await loaded(page, '/apps');
    await spa(page, '/members'); // a new page and a new Root baseline: the identity must survive both
    await page.evaluate(() => dispatchEvent(new CustomEvent('small:start', { detail: { path: 'question' } })));
    const dialog = startDialog(page);
    await dialog.waitFor({ timeout: 10000 });
    must(await page.getByRole('dialog', { name: 'Start a rabbit hole' }).count() === 1, 'more than one Start dialog');
    must(await dialog.getByRole('tab', { name: 'Question', exact: true }).getAttribute('aria-selected') === 'true', 'the Question tab is not selected');
    await dialog.getByRole('tab', { name: 'Repository', exact: true }).click();
    await dialog.getByText(`Visible to everyone in ${wsLabel}.`).waitFor({ timeout: 10000 });
    await page.context().close();
  });
}
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=start-host node e2e/rabbit-hole-check.mjs
```

Expected: FAIL: start-host: ... Timeout waiting for the 'Start a rabbit hole' dialog, then '1 FAILURES', exit 1. Nothing hosts 'small:start' yet, and the check sends nothing.

- [ ] **Step 3: Create agent/StartHost.jsx**

```jsx
// packages/web/src/agent/StartHost.jsx
import { useEffect, useState } from 'react';
import StartDialog from '../StartDialog.jsx';
import { ctxOf } from './commands.js';
import { useSurface } from './surface.js';

// T02 §3.3, §5: the one Start dialog host. Home's [Start a rabbit hole], Library
// and Settings dispatch 'small:start' {path}. Mounted once in Root (dev), so the
// dialog survives Shell remounts and Settings opening on top of it.
export default function StartHost() {
  const surface = useSurface(); // a fresh ctx once Shell publishes the workspace identity
  const [path, setPath] = useState(null);
  useEffect(() => {
    const open = (e) => setPath(e.detail?.path || 'repository');
    window.addEventListener('small:start', open);
    return () => window.removeEventListener('small:start', open);
  }, []);
  return path && <StartDialog ctx={ctxOf(surface)} initial={path} onClose={() => setPath(null)} />;
}
```

- [ ] **Step 4: Shell publishes the identity (dev only), once per load**

```jsx
// packages/web/src/Shell.jsx (CRLF in the working tree; keep it) - edit 1: directly after the line  import Sidebar from './Sidebar.jsx';  (Shell.jsx:5)
import { patchSurface } from './agent/surface.js';
import { learnPreview } from './flags.js';

// packages/web/src/Shell.jsx - edit 2: directly after the line  useEffect(() => { load(); }, []);  (Shell.jsx:25)
  // Rabbit Hole dev: the workspace identity every command ctx reads (agent/commands.js
  // ctxOf). setSurface keeps identity across pages (agent/surface.js), so one patch per load.
  useEffect(() => {
    if (learnPreview && data?.apps) patchSurface({ org: data.org, email: data.email, orgName: data.orgName || null, catalog: data.apps });
  }, [data]);
```

- [ ] **Step 5: Mount StartHost in Root (anchored on content; shell-home edited main.jsx first)**

```jsx
// packages/web/src/main.jsx (CRLF; keep it) - 1. directly above the line  function Root() {
// Rabbit Hole dev only (T02 §3.3, §5): the one Start dialog host, mounted in Root so
// Shell remounts never drop it. The live build never loads the chunk.
const StartHost = learnPreview ? lazy(() => import('./agent/StartHost.jsx')) : null;

// 2. In Root's return, directly after the line  <SearchModal />  (main.jsx:71 today):
      {StartHost && <Suspense fallback={null}><StartHost /></Suspense>}
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && grep -c "^import React, { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react';" src/main.jsx && npm run build
```

Expected: 1 (line 1 unchanged), then vite 'built in' for the live build: no unresolved import, and StartHost is a lazy chunk the live build never requests (learnPreview false). The same edits on a copy of main.jsx and Shell.jsx after shell-home's 2.5 edits bundle cleanly with esbuild (scratchpad/agentui3/sim.mjs).

- [ ] **Step 6: Build, deploy to this worktree's clone, and rerun the check with the loaded-build check**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && export VITE_COACHING_DEV=true VITE_BYOC_DEV=true && VITE_TLDRAW_LICENSE_KEY=$(node --input-type=module -e "import {readFileSync} from 'node:fs'; import {parseEnv} from 'node:util'; const key = parseEnv(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8')).TLDRAW_LICENSE_KEY; if (!key) throw new Error('Missing TLDRAW_LICENSE_KEY'); process.stdout.write(key);") && export VITE_TLDRAW_LICENSE_KEY && npm run build -- --outDir dist-dev; built=$?; unset VITE_COACHING_DEV VITE_BYOC_DEV VITE_TLDRAW_LICENSE_KEY; [ $built -eq 0 ] && npx wrangler deploy --config wrangler.dev.jsonc --name small-cp-dev-smart-home
# then (the build check polls through the ~20 s rollout lag):
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=build,start-host node e2e/rabbit-hole-check.mjs
```

Expected: Wrangler prints https://small-cp-dev-smart-home.zeroshothq.workers.dev. Then 'ok: build: the browser runs the dist-dev entry script', 'ok: start-host: small:start opens one Start dialog on the asked tab, naming the workspace after a navigation', 'all checks passed'.

- [ ] **Step 7: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && P='packages/web/src/agent/StartHost.jsx packages/web/src/main.jsx packages/web/src/Shell.jsx packages/web/e2e/rabbit-hole-check.mjs' && git add $P && git commit --only $P -m 'feat(web): one Start dialog host in Root and Shell publishes the workspace identity for command ctx - dev only'
```

Expected: make test-unit is green. One commit containing only these 4 paths.

---

### Task 31: Prove the Start dialog on the clone after agent-ui's StartHost lands

*Area:* Settings, Connections, Start dialog, e2e, deploy · *Brief:* T06 · *Order:* 8.6

**Files:**
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: agent-ui's StartHost in main.jsx Root (order 8.5), which listens for 'small:start' {path} on dev builds and renders the lazy StartDialog with ctx = ctxOf(getSurface()). Its task already deployed the clone and added the 'start-host' label. The LEARN_DB canvases table must be applied (T12 prep, order 5) before any clone deploy that carries the canvases dev-worker wiring (order 6.4).
- Produces: The clone serves HEAD, and the harness labels start-host (agent-ui), start ×3, J17 (Start) and J18 print ok.

- [ ] **Step 1: Build and deploy HEAD to the clone, so the build check compares against this exact commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && key=$(node --input-type=module -e "import {readFileSync} from 'node:fs'; import {parseEnv} from 'node:util'; const key = parseEnv(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8')).TLDRAW_LICENSE_KEY; if (!key) throw new Error('Missing TLDRAW_LICENSE_KEY'); process.stdout.write(key);") && VITE_COACHING_DEV=true VITE_BYOC_DEV=true VITE_TLDRAW_LICENSE_KEY="$key" npm run build -- --outDir dist-dev && npx wrangler deploy --config wrangler.dev.jsonc --name small-cp-dev-smart-home
```

Expected: Vite prints 'built in'. Wrangler prints 'Uploaded small-cp-dev-smart-home' and a Current Version ID.

- [ ] **Step 2: Run the build check and the Start labels**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=build,start,J17,J18 node e2e/rabbit-hole-check.mjs
```

Expected: ok for build, start-host (agent-ui's label also matches the 'start' prefix), the three start labels, J17 (Start Sources) and J18, then 'all checks passed'. The red run for these labels is order 8's step 'Run the Start labels against the clone as it stands'. If this deploy broke review, run the rollback command from the harness task (it reads the previous version id with wrangler deployments list --json).

---

### Task 32: Home at /apps (preview): Continue, Recent, and one primary Start that sends small:start; the canvas case in KindIcon; e2e checks

*Area:* Shell, Home, Library, Sidebar · *Brief:* T06 · *Order:* 9.1

**Files:**
- `packages/web/src/Home.jsx`
- `packages/web/src/main.jsx`
- `packages/web/src/ui.jsx`
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: routes.js pageFor (order 1); main.jsx wiring and the shell-home harness block with its inner end line (order 2.5); home/continue.js (order 3.6); agent/catalog.js titleOf (agent-core, order 3.2); StartHost in main.jsx Root listening for 'small:start' (agent-ui, order 8.5); e2e/rabbit-hole-check.mjs helpers open, check, must and base (settings-deploy, order 0.5); canvas endpoints on the clone (backend-canvas, orders 6.1-6.4)
- Produces: In the dev build /apps and /dash render Home. It shows Continue — on this device, Recent (at most 5 kinds with their metadata) and exactly one primary [Start a rabbit hole], which sends small:start {path:'repository'}. It does not mount StartDialog, has no BAR_ROOM and sets no surface (the Root baseline covers it). KindIcon renders PenLine for canvases. sh-routes and sh-home go inside the shell-home block from order 2.5, above its inner end line; nothing is declared at the harness top level.

- [ ] **Step 1: Check that the shell-home harness block and the Start host exist**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && grep -nF 'shell-home checks end: later shell-home tasks insert above this line' e2e/rabbit-hole-check.mjs && grep -rn "addEventListener('small:start'" src
```

Expected: Exactly one inner end line and at least one small:start listener are found. If either is missing, stop: order 2.5 of this area or agent-ui order 8.5 (StartHost) has not landed.

- [ ] **Step 2: Add sh-routes and sh-home inside the shell-home block, directly above its inner end line**

```jsx
// ===== packages/web/e2e/rabbit-hole-check.mjs - insert directly ABOVE the shell-home inner end line from order 2.5 (step 1 greps it), inside its { } block, so these helpers never reach the harness top level. Instruction lines like this one are not file content, so the marker texts appear in the file exactly once. =====
  // Test canvases go to LEARN_DB (small-learn-dev) only, and each check deletes its own (D7).
  const shApi = (page, path, method = 'GET', body) => page.evaluate(async ([path, method, body]) => {
    const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json().catch(() => null) };
  }, [path, method, body]);
  const shCanvas = async (page, title, device_id) => {
    const r = await shApi(page, '/api/canvases', 'POST', { title, ...(device_id ? { device_id } : {}) });
    must(r.status === 201, `create canvas: HTTP ${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  };
  const shDrop = async (page, name) => {
    const r = await shApi(page, `/api/apps/${name}`, 'DELETE');
    must(r.status < 300, `delete ${name}: HTTP ${r.status}; remove it from small-learn-dev by hand`);
  };
  const shStart = (page) => page.getByRole('button', { name: 'Start a rabbit hole', exact: true });
  const shH1 = (page, name) => page.getByRole('heading', { level: 1, name, exact: true });

  await check('sh-routes: /apps and /dash are Home, /library and ?s= are the Library, the title is Rabbit Hole', async () => {
    const page = await open();
    for (const path of ['/apps', '/dash']) {
      await page.goto(`${base}${path}`);
      await shStart(page).waitFor({ timeout: 20000 });
    }
    must(await page.title() === 'Rabbit Hole', `title is ${await page.title()}`);
    for (const [path, name] of [['/library', 'Library'], ['/apps?s=shared', 'Shared']]) {
      await page.goto(`${base}${path}`);
      await shH1(page, name).waitFor({ timeout: 20000 });
    }
    await page.context().close();
  });

  await check('sh-home: one primary Start opens the Start dialog; Continue and Recent read this browser', async () => {
    const page = await open();
    await page.goto(`${base}/apps`);
    await shStart(page).waitFor({ timeout: 20000 });
    const c = await shCanvas(page, 'rabbit-hole-check home');
    try {
      const key = `small.adaptive-canvas:${c.org}:${c.email}:${c.name}`;
      await page.evaluate(([key, name]) => {
        localStorage.setItem('small.recent', JSON.stringify([name]));
        localStorage.setItem(`${key}:chat`, JSON.stringify([{ id: '1', question: 'why sqrt(dk)?' }]));
        localStorage.setItem(`${key}:ink`, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [
          { id: 'a', type: 'heading', level: 1, text: 'Tokens', done: true }, { id: 'b', type: 'heading', level: 1, text: 'Masked self-attention' }] }));
      }, [key, c.name]);
      await page.reload();
      const cont = page.getByRole('region', { name: 'Continue' });
      await cont.waitFor({ timeout: 20000 });
      const text = await cont.innerText();
      for (const want of ['rabbit-hole-check home', 'Last explored: why sqrt(dk)?', 'Next: Masked self-attention']) must(text.includes(want), `Continue lacks ${want}: ${text}`);
      await cont.getByRole('button', { name: 'Continue learning' }).waitFor();
      must((await page.getByRole('region', { name: 'Recent' }).innerText()).includes('Content in this browser'), 'Recent canvas card lacks Content in this browser');
      await shStart(page).click(); // strict locator: exactly one primary Start on Home (T02 §3.3)
      await page.getByRole('dialog', { name: 'Start a rabbit hole' }).waitFor({ timeout: 10000 });
    } finally {
      await shDrop(page, c.name);
      await page.context().close();
    }
  });
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --check e2e/rabbit-hole-check.mjs
```

Expected: No output, exit 0. This only checks syntax: sh-routes and sh-home fail against the clone until the deploy task (order 9.9) ships this code.

- [ ] **Step 3: Run the new labels against the clone, which still runs the previous build, and watch them fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=sh-routes,sh-home node e2e/rabbit-hole-check.mjs
```

Expected: FAIL on sh-routes,sh-home: the clone still serves the previous build, where /apps is the Apps table and there is no Start a rabbit hole button. This is the failing test that the implementation step must turn green.

- [ ] **Step 4: Create Home.jsx, add the canvas case to KindIcon, and dispatch Home from main.jsx**

```jsx
// ===== packages/web/src/Home.jsx =====
import { ArrowUpRight } from 'lucide-react';
import { titleOf } from './agent/catalog.js';
import { navigate } from './api.js';
import { openHref, readContinue, readRecent, recentCard, recentItems } from './home/continue.js';
import Shell from './Shell.jsx';
import { Button, KindIcon, Pill, SkeletonRows } from './ui.jsx';

// Home (T02 §3, preview build only): Continue, Recent, Start - three blocks, no others.
// ponytail: the Authored path card (§3.1.3) is left out - learn_courses keeps no learner
// step pointer, so 'Step 3 of 7' has no source yet; add it once that source is decided.
const KIND = { repository: 'Project', canvas: 'Canvas', job: 'Job', server: 'Server' };
const HEADING = 'pb-2 text-xs text-ink-2';
const CARD = 'rounded-lg border border-line bg-white';
// The Start dialog lives once in main.jsx Root (StartHost); pages only ask for it.
const start = () => window.dispatchEvent(new CustomEvent('small:start', { detail: { path: 'repository' } }));

export default function Home() {
  return <Shell>{(data, load) => <HomeContent data={data} load={load} />}</Shell>;
}

function HomeContent({ data, load }) {
  const ready = data && !data.error;
  const apps = ready ? data.apps : [];
  const recent = readRecent(localStorage);
  const cont = ready ? readContinue({ org: data.org, email: data.email, recent, catalog: apps, storage: localStorage }) : null;
  const items = recentItems(recent, apps);
  const cardCtx = { catalog: apps, email: data?.email, storage: localStorage };
  const startButton = <Button variant="primary" onClick={start}>Start a rabbit hole</Button>;
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[900px] space-y-8 px-24 py-12 max-lg:px-8 max-md:px-4 max-md:py-6">
        {!data && [2, 3, 1].map((rows, i) => <SkeletonRows key={i} rows={rows} />)}
        {data?.error && (
          <div className="flex items-center gap-3 text-ink-2">✗ {data.error} <Button variant="secondary" size="sm" onClick={load}>Retry</Button></div>
        )}
        {ready && !apps.length && (
          <section>
            {startButton}
            <p className="pt-3 text-sm text-ink-2">Start from a repository, sources, a question, or a blank canvas.</p>
          </section>
        )}
        {ready && apps.length > 0 && (
          <>
            {cont && <Continue item={cont} />}
            {items.length > 0 && (
              <section aria-label="Recent">
                <h2 className={HEADING}>Recent</h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                  {items.map((a) => <RecentCard key={`${a.org}/${a.name}`} app={a} card={recentCard(a, cardCtx)} />)}
                </div>
              </section>
            )}
            <section>{startButton}</section>
          </>
        )}
      </div>
    </main>
  );
}

function Continue({ item }) {
  return (
    <section aria-label="Continue">
      <h2 className={HEADING}>Continue — on this device</h2>
      <div className={`${CARD} p-4`}>
        <div className="flex items-center gap-2">
          <KindIcon kind={item.kind} />
          <span className="min-w-0 truncate font-medium">{item.title}</span>
          <Pill>{KIND[item.kind] || item.kind}</Pill>
        </div>
        {item.lastExplored && <p className="truncate pt-2 text-sm text-ink-2">Last explored: <span className="text-ink">{item.lastExplored}</span></p>}
        {item.next && <p className="truncate pt-1 text-sm text-ink-2">Next: <span className="text-ink">{item.next}</span></p>}
        <div className="flex gap-2 pt-3">
          <Button variant="secondary" onClick={() => navigate(openHref(item))}>{item.canvas ? 'Continue learning' : 'Open'}</Button>
          {item.canvas && item.kind === 'repository' && <Button variant="secondary" onClick={() => navigate(`/apps/${item.slug}`)}>Open project</Button>}
        </div>
      </div>
    </section>
  );
}

function RecentCard({ app, card }) {
  const { action } = card;
  return (
    <div className={`${CARD} flex flex-col gap-1 p-3`}>
      <div className="flex items-center gap-2">
        <KindIcon kind={app.kind} schedule={app.schedule} size={14} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{titleOf(app)}</span>
        <Pill>{KIND[app.kind] || app.kind}</Pill>
      </div>
      {card.meta.map((line, i) => <span key={i} className="truncate text-xs text-ink-2">{line}</span>)}
      {action?.to && <Button size="sm" variant="secondary" className="mt-1 self-start" onClick={() => navigate(action.to)}>{action.label}</Button>}
      {action?.href && (
        <a href={action.href} target="_blank" rel="noreferrer" className="mt-1 inline-flex h-7 items-center gap-1 self-start rounded-lg px-2 text-[13px] font-medium text-ink-2 hover:bg-hover hover:text-ink">
          {action.label} <ArrowUpRight size={12} />
        </a>
      )}
      {!action && <span className="text-xs text-ink-3">Its content is stored only in the browser that created it.</span>}
    </div>
  );
}

// ===== packages/web/src/ui.jsx =====
// line 5: add PenLine to the lucide-react import, right after `Network,`
// lines 16-18 become:
// Kind icon per app: Globe server, Play job, Clock scheduled job, Network project, PenLine canvas. 16px, stroke 1.5.
export const KindIcon = ({ kind, schedule, size = 16 }) => {
  const I = kind === 'canvas' ? PenLine : kind === 'repository' ? Network : kind === 'job' ? (schedule ? Clock : Play) : Globe;

// ===== packages/web/src/main.jsx =====
// directly after `import SharePage from './SharePage.jsx';` add:
import Home from './Home.jsx';
// the dispatch line becomes:
      {at.page === 'app' ? <SharePage slug={at.slug} runId={at.runId} /> : at.page === 'members' ? <MembersPage /> : at.page === 'chat' ? <ChatPage /> : at.page === 'home' ? <Home /> : <App />}
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && cd packages/web && npm run build && VITE_COACHING_DEV=true VITE_BYOC_DEV=true npm run build -- --outDir dist-dev && npx playwright test -c playwright.learn-preview.config.js --reporter=line
```

Expected: make test-unit exits 0, and both builds succeed. The mocked learn-preview run shows the same result as the order 2.5 baseline. With preview=false, pageFor never returns 'home' (routes.test.mjs), so the live build never renders Home.

- [ ] **Step 5: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git add packages/web/src/Home.jsx && git commit --only packages/web/src/Home.jsx packages/web/src/main.jsx packages/web/src/ui.jsx packages/web/e2e/rabbit-hole-check.mjs -m 'feat(web): Home at /apps in the preview - Continue, Recent, one Start a rabbit hole button'
```

Expected: One commit with 4 files

---

### Task 33: Explore preview: a tested fixture store (home/explore.js) and the /explore page

*Area:* Shell, Home, Library, Sidebar · *Brief:* T05 · *Order:* 9.2

**Files:**
- `packages/web/src/home/explore.js`
- `packages/web/src/home/explore.test.mjs`
- `packages/web/src/Home.jsx`
- `packages/web/src/main.jsx`
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: Home.jsx and the main.jsx dispatch (order 9.1); dev-worker.js serves /explore (order 1)
- Produces: /explore in the dev build shows the persistent banner 'Demo data — changes stay in this preview' and demo cards with Save. State lives only under small.preview:explore-saved, and the page makes no API call of its own.

- [ ] **Step 1: Write the failing store tests**

```jsx
// packages/web/src/home/explore.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BANNER, DEMO, readSaved, SAVED_KEY, toggleSaved } from './explore.js';

const store = (entries = {}) => { const m = new Map(Object.entries(entries)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('fixture state lives only under small.preview: and the banner says so (T02 §11)', () => {
  assert.ok(SAVED_KEY.startsWith('small.preview:'));
  assert.equal(BANNER, 'Demo data — changes stay in this preview');
  // No imports at all, so no API client: the preview cannot reach a mutating endpoint.
  assert.doesNotMatch(readFileSync(new URL('./explore.js', import.meta.url), 'utf8'), /^import /m);
});

test('Save toggles a demo item and survives a reload', () => {
  const s = store();
  assert.deepEqual(toggleSaved(s, DEMO[0].id), [DEMO[0].id]);
  assert.deepEqual(readSaved(s), [DEMO[0].id]);
  assert.deepEqual(toggleSaved(s, DEMO[0].id), []);
});

test('junk, unknown ids or blocked storage read as nothing saved', () => {
  assert.deepEqual(readSaved(store({ [SAVED_KEY]: '{' })), []);
  assert.deepEqual(readSaved(store({ [SAVED_KEY]: '["gone","attention"]' })), ['attention']);
  const blocked = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } };
  assert.deepEqual(toggleSaved(blocked, 'btree'), ['btree']);
});
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/home/explore.test.mjs
```

Expected: FAIL: ERR_MODULE_NOT_FOUND for ./explore.js

- [ ] **Step 2: Implement explore.js**

```jsx
// packages/web/src/home/explore.js
// Explore preview (T02 §11): demo data only, and never a mutating API. What the viewer
// changes stays in this browser under the small.preview: namespace.
export const BANNER = 'Demo data — changes stay in this preview';
export const SAVED_KEY = 'small.preview:explore-saved';
export const DEMO = [
  { id: 'attention', title: 'Attention from scratch', kind: 'Project', blurb: 'From tokens to logits in a small transformer.' },
  { id: 'btree', title: 'Why B-trees stay shallow', kind: 'Canvas', blurb: 'Fan-out, splits, and the height of a tree.' },
  { id: 'fourier', title: 'Reading a Fourier transform', kind: 'Canvas', blurb: 'What each frequency bin is telling you.' },
];

export function readSaved(storage) {
  try {
    const list = JSON.parse(storage.getItem(SAVED_KEY) || '[]');
    return Array.isArray(list) ? list.filter((id) => DEMO.some((d) => d.id === id)) : [];
  } catch { return []; }
}

export function toggleSaved(storage, id) {
  const list = readSaved(storage);
  const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  try { storage.setItem(SAVED_KEY, JSON.stringify(next)); } catch { /* the preview forgets on reload */ }
  return next;
}
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/home/explore.test.mjs
```

Expected: PASS: 3 tests, 0 fail

- [ ] **Step 3: The /explore page, its dispatch, and its e2e check**

```jsx
// ===== packages/web/src/Home.jsx =====
// add at the top:
import { useState } from 'react';
import { BANNER, DEMO, readSaved, toggleSaved } from './home/explore.js';
// append at the end of the file:
export function ExplorePreview() {
  return <Shell>{() => <Explore />}</Shell>;
}

function Explore() {
  const [saved, setSaved] = useState(() => readSaved(localStorage));
  return (
    <main className="flex-1 overflow-y-auto">
      <div role="note" className="sticky top-0 z-10 border-b border-line bg-code px-4 py-2 text-center text-sm text-ink-2">{BANNER}</div>
      <div className="mx-auto max-w-[900px] px-24 py-12 max-lg:px-8 max-md:px-4 max-md:py-6">
        <h1 className="pb-5 text-[40px] leading-[1.2] font-bold tracking-[-0.01em]">Explore</h1>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {DEMO.map((d) => {
            const on = saved.includes(d.id);
            return (
              <div key={d.id} className={`${CARD} flex flex-col gap-1 p-3`}>
                <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm font-medium">{d.title}</span><Pill>{d.kind}</Pill></div>
                <p className="text-xs text-ink-2">{d.blurb}</p>
                <Button size="sm" variant="secondary" className="mt-1 self-start" aria-pressed={on} onClick={() => setSaved(toggleSaved(localStorage, d.id))}>{on ? 'Saved' : 'Save'}</Button>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

// ===== packages/web/src/main.jsx =====
// `import Home from './Home.jsx';` becomes:
import Home, { ExplorePreview } from './Home.jsx';
// in the dispatch line, `: at.page === 'home' ? <Home /> : <App />}` becomes:
: at.page === 'home' ? <Home /> : at.page === 'explore' ? <ExplorePreview /> : <App />}

// ===== packages/web/e2e/rabbit-hole-check.mjs - insert directly above the shell-home inner end line (order 2.5). Instruction lines like this one are not file content, so the marker texts appear in the file exactly once. =====
  await check('sh-explore: demo data behind a banner; Save stays in small.preview storage; no mutating API', async () => {
    const page = await open();
    const writes = [];
    page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/') && r.method() !== 'GET') writes.push(`${r.method()} ${u.pathname}`); });
    await page.goto(`${base}/explore`);
    await page.getByRole('note').filter({ hasText: 'Demo data — changes stay in this preview' }).waitFor({ timeout: 20000 });
    await shH1(page, 'Explore').waitFor();
    await page.getByRole('button', { name: 'Save', exact: true }).first().click();
    await page.getByRole('button', { name: 'Saved', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: 'Saved', exact: true }).waitFor({ timeout: 20000 });
    const stored = await page.evaluate(() => localStorage.getItem('small.preview:explore-saved'));
    must(JSON.parse(stored || '[]').length === 1, `small.preview:explore-saved is ${stored}`);
    must(!writes.length, `mutating calls: ${writes.join(', ')}`);
    await page.context().close();
  });
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && cd packages/web && node --check e2e/rabbit-hole-check.mjs && npm run build && VITE_COACHING_DEV=true VITE_BYOC_DEV=true npm run build -- --outDir dist-dev
```

Expected: make test-unit exits 0, the syntax check passes, and both builds succeed

- [ ] **Step 4: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && git add packages/web/src/home/explore.js packages/web/src/home/explore.test.mjs && git commit --only packages/web/src/home/explore.js packages/web/src/home/explore.test.mjs packages/web/src/Home.jsx packages/web/src/main.jsx packages/web/e2e/rabbit-hole-check.mjs -m 'feat(web): Explore preview at /explore - demo data, changes stay in small.preview storage'
```

Expected: One commit with 5 files

---

### Task 34: Library chips: library-filter.js (tested), type and scope chips, ops columns hidden for Projects and Canvases, an empty state that sends small:start, canvas rows with the On another device pill

*Area:* Shell, Home, Library, Sidebar · *Brief:* T07 · *Order:* 9.3

**Files:**
- `packages/web/src/library-filter.js`
- `packages/web/src/library-filter.test.mjs`
- `packages/web/src/App.jsx`
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: flags.js (order 1); home/continue.js onAnotherDevice (order 3.6); agent/catalog.js titleOf; StartHost (agent-ui, order 8.5); KindIcon canvas case (order 9.1)
- Produces: In the dev Library (/library, /apps?s=, /apps?f=) the chips drive ?type=projects|canvases|apps and ?s=private|shared|apps (Mine, Shared with me, Workspace) through sectionOf. Watch, Deployed and Last run are hidden by default for Projects and Canvases; toggles there stay in memory. 'Nothing here yet' with Start sends small:start. Canvas rows use titleOf, show the On another device pill, open in place and never open the runbook peek. The live Apps table is unchanged, and there is no inline paddingBottom. isLearnResource is exported for the Sidebar.

- [ ] **Step 1: Write the failing filter tests**

```jsx
// packages/web/src/library-filter.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipHref, hiddenFor, isLearnResource, libraryQuery, ofType, opsView, SCOPES } from './library-filter.js';

const apps = [{ name: 'repo-1', kind: 'repository' }, { name: 'canvas-1', kind: 'canvas' }, { name: 's3-log', kind: 'job' }, { name: 'counter', kind: 'server' }];
const names = (list) => list.map((a) => a.name);

test('the live build never reads ?type; the preview accepts only the three types', () => {
  assert.deepEqual(libraryQuery('?type=projects', false), { type: null, archived: false });
  assert.deepEqual(libraryQuery('?type=projects', true), { type: 'projects', archived: false });
  for (const bad of ['?type=bogus', '?type=constructor', '']) assert.deepEqual(libraryQuery(bad, true), { type: null, archived: false });
  assert.deepEqual(libraryQuery('?type=canvases&archived=1', true), { type: 'canvases', archived: true });
  assert.deepEqual(libraryQuery('?type=projects&archived=1', true), { type: 'projects', archived: false });
});

test('type chips filter on kind (T02 §4); no type returns the same array', () => {
  assert.equal(ofType(apps, null), apps);
  assert.deepEqual(names(ofType(apps, 'projects')), ['repo-1']);
  assert.deepEqual(names(ofType(apps, 'canvases')), ['canvas-1']);
  assert.deepEqual(names(ofType(apps, 'apps')), ['s3-log', 'counter']);
  assert.deepEqual(SCOPES, { private: 'Mine', shared: 'Shared with me', apps: 'Workspace' });
});

test('Projects and Canvases hide the ops columns by default; the Apps view keeps small.tblCols', () => {
  const stored = { kind: true };
  assert.equal(hiddenFor(null, stored), stored);
  assert.equal(hiddenFor('apps', stored), stored);
  assert.deepEqual(hiddenFor('projects', stored), { watch: true, deployed: true, lastrun: true });
  assert.deepEqual(hiddenFor('canvases', stored, { deployed: false, people: true }), { watch: true, deployed: false, lastrun: true, people: true });
  assert.deepEqual([null, 'apps', 'projects', 'canvases'].map(opsView), [false, false, true, true]);
});

test('a chip sets or clears one parameter and keeps the rest; changing type leaves Archived', () => {
  assert.equal(chipHref('', 'type', 'projects'), '/library?type=projects');
  assert.equal(chipHref('?type=projects&s=shared', 'type', null), '/library?s=shared');
  assert.equal(chipHref('?type=canvases&archived=1', 'type', 'projects'), '/library?type=projects');
  assert.equal(chipHref('?type=canvases', 'archived', '1'), '/library?type=canvases&archived=1');
  assert.equal(chipHref('?f=Team', 's', 'private'), '/library?f=Team&s=private');
  assert.equal(chipHref('?s=private', 's', null), '/library');
});

test('projects and canvases carry no live-app actions', () => {
  assert.deepEqual(apps.map(isLearnResource), [true, true, false, false]);
});
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/library-filter.test.mjs
```

Expected: FAIL: ERR_MODULE_NOT_FOUND for ./library-filter.js

- [ ] **Step 2: Implement library-filter.js**

```jsx
// packages/web/src/library-filter.js
// The Library's chip rows (T02 §4, preview only). Pure, so the rules are tested without a
// browser; App.jsx reads the URL and renders. The Apps view stays today's table.
export const TYPES = {
  projects: { label: 'Projects', kinds: ['repository'] },
  canvases: { label: 'Canvases', kinds: ['canvas'] },
  apps: { label: 'Apps', kinds: ['job', 'server'] },
};
// Scope chips are the sidebar sections under their T02 §4 names (sectionOf, api.js:9-14).
export const SCOPES = { private: 'Mine', shared: 'Shared with me', apps: 'Workspace' };
const OPS = ['watch', 'deployed', 'lastrun'];

// The live build never reads ?type, so its Library is exactly today's.
export function libraryQuery(search, preview) {
  const q = new URLSearchParams(search);
  const type = preview && Object.hasOwn(TYPES, q.get('type')) ? q.get('type') : null;
  return { type, archived: type === 'canvases' && q.get('archived') === '1' };
}

export const ofType = (apps, type) => (type ? apps.filter((a) => TYPES[type].kinds.includes(a.kind)) : apps);

// Projects and Canvases hide the ops columns by default (§4); users can still toggle any
// column, and those toggles (`mine`) stay in memory so small.tblCols is never written here.
export const opsView = (type) => type === 'projects' || type === 'canvases';
export const hiddenFor = (type, stored, mine = {}) => (opsView(type) ? { ...Object.fromEntries(OPS.map((k) => [k, true])), ...mine } : stored);

// A chip sets or clears one parameter and keeps the rest; changing type leaves Archived.
export function chipHref(search, key, value) {
  const q = new URLSearchParams(search);
  if (key === 'type') q.delete('archived');
  if (value) q.set(key, value); else q.delete(key);
  const s = q.toString();
  return s ? `/library?${s}` : '/library';
}

// Projects and canvases live in LEARN_DB: the live app actions (share, rename, duplicate,
// trash, drag to a folder, the runbook peek) never apply to them.
export const isLearnResource = (a) => a.kind === 'repository' || a.kind === 'canvas';
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/library-filter.test.mjs
```

Expected: PASS: 5 tests, 0 fail

- [ ] **Step 3: Wire the chips into App.jsx (anchor every edit on the quoted content)**

```jsx
// App.jsx:8 ui import: add Button (after Avatar).
// directly after `import { isPrivateByoc } from './private-auth.js';` add:
import { titleOf } from './agent/catalog.js';
import { learnPreview } from './flags.js';
import { onAnotherDevice } from './home/continue.js';
import { chipHref, hiddenFor, libraryQuery, ofType, opsView, SCOPES, TYPES } from './library-filter.js';

// directly before `export default function App() {` add:
// Library chips (T02 §4, preview only): a pressed chip is the current filter.
const Chip = ({ on, ...props }) => (
  <button aria-pressed={on} className={cn('h-7 rounded-full border px-3 text-[13px]', on ? 'border-line-strong bg-active font-medium text-ink' : 'border-line text-ink-2 hover:bg-hover hover:text-ink')} {...props} />
);
// The Start dialog lives once in main.jsx Root; the Library only asks for it.
const startRabbitHole = () => window.dispatchEvent(new CustomEvent('small:start', { detail: { path: 'repository' } }));

// replace `  const visibleCols = order.filter((k) => !cols.hidden[k]);` with:
  const { type } = libraryQuery(window.location.search, learnPreview);
  // ponytail: toggles made in Projects/Canvases stay in memory, so small.tblCols (the Apps
  // view's) is written exactly as today; persist them per type if people ask.
  const [typeHidden, setTypeHidden] = useState({});
  const hidden = hiddenFor(type, cols.hidden, typeHidden);
  const setHidden = (k, v) => (opsView(type) ? setTypeHidden({ ...typeHidden, [k]: v }) : saveCols({ ...cols, hidden: { ...cols.hidden, [k]: v } }));
  const visibleCols = order.filter((k) => !hidden[k]);

// Property visibility (App.jsx:253-254) becomes:
                        <MenuItem key={k} icon={COL_ICON[k]} onClick={() => k !== 'name' && setHidden(k, !hidden[k])} className={k === 'name' ? 'opacity-50' : ''}>
                          <span className="flex w-full items-center gap-2"><Chk on={!hidden[k]} /> {COLS[k]}</span>
// Hide column (App.jsx:342) becomes:
                            <MenuItem icon={EyeOff} onClick={(e) => { e.stopPropagation(); setHidden(k, true); setColMenu(null); }}>Hide column</MenuItem>

// title and sectionApps (App.jsx:119-122) become:
  const title = folder ? folder.name : section === 'shared' ? 'Shared' : section === 'private' ? 'Private' : learnPreview ? 'Library' : 'Apps';
  const sectionApps = ofType(folder
    ? apps.filter((a) => a.folder_id === folder.id)
    : section ? apps.filter((a) => sectionOf(a, org, data?.email) === section) : apps, type);

// directly after `{importOpen && <RepositoryImport onClose={() => setImportOpen(false)} onImported={load} />}` add:
          {learnPreview && (
            <div className="space-y-2 pb-4">
              <div className="flex flex-wrap gap-1.5">
                <Chip on={!type} onClick={() => navigate(chipHref(window.location.search, 'type', null))}>All</Chip>
                {Object.entries(TYPES).map(([k, t]) => <Chip key={k} on={type === k} onClick={() => navigate(chipHref(window.location.search, 'type', type === k ? null : k))}>{t.label}</Chip>)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(SCOPES).map(([k, label]) => <Chip key={k} on={section === k} onClick={() => navigate(chipHref(window.location.search, 's', section === k ? null : k))}>{label}</Chip>)}
              </div>
            </div>
          )}

// replace `          {data && !data.error && apps.length === 0 && (` with:
          {data && !data.error && learnPreview && sectionApps.length === 0 && (
            <EmptyState icon={Mark} action={<Button variant="primary" onClick={startRabbitHole}>Start a rabbit hole</Button>}>Nothing here yet</EmptyState>
          )}
          {data && !data.error && !learnPreview && apps.length === 0 && (
// replace `          {apps.length > 0 && (` with:
          {(learnPreview ? sectionApps.length > 0 : apps.length > 0) && (

// name cell: replace
                              {a.kind === 'repository' ? a.repo : a.name}
                            </button>
// with
                              {titleOf(a)}
                            </button>
                            {a.kind === 'canvas' && onAnotherDevice(a, data?.email, localStorage) && <Pill>On another device</Pill>}
// kind cell: replace `<Pill color={a.kind === 'job' ? 'blue' : 'grey'}>{a.kind}</Pill>` with:
                            <Pill color={a.kind === 'job' ? 'blue' : 'grey'}>{learnPreview && a.kind === 'repository' ? 'project' : a.kind}</Pill>
// Open pill: replace
                              onClick={(e) => { e.stopPropagation(); a.kind === 'repository' ? navigate(`/apps/${a.name}?tab=code`) : setPanel({ name: a.name, tab: 'runbook' }); }}
// with
                              onClick={(e) => { e.stopPropagation(); a.kind === 'repository' ? navigate(`/apps/${a.name}?tab=code`) : a.kind === 'canvas' ? navigate(`/apps/${a.name}`) : setPanel({ name: a.name, tab: 'runbook' }); }}
```

- [ ] **Step 4: Add the Library e2e check above the shell-home end marker**

```jsx
// ===== packages/web/e2e/rabbit-hole-check.mjs - insert directly above the shell-home inner end line (order 2.5). Instruction lines like this one are not file content, so the marker texts appear in the file exactly once. =====
  await check('sh-library: type and scope chips filter; Canvases hide ops columns; a canvas on another device is flagged; an empty view offers Start', async () => {
    const page = await open();
    await page.goto(`${base}/library`);
    await shH1(page, 'Library').waitFor({ timeout: 20000 });
    const c = await shCanvas(page, 'rabbit-hole-check library', 'rabbit-hole-check-device');
    try {
      await page.reload();
      const chip = (name) => page.locator('button[aria-pressed]').filter({ hasText: new RegExp(`^${name}$`) });
      for (const name of ['All', 'Projects', 'Canvases', 'Apps', 'Mine', 'Shared with me', 'Workspace']) must(await chip(name).count() === 1, `chip ${name} missing`);
      await chip('Canvases').click();
      await page.waitForURL(/[?&]type=canvases/);
      const row = page.locator('tbody tr').filter({ hasText: 'rabbit-hole-check library' });
      await row.waitFor({ timeout: 20000 });
      must(await chip('Canvases').getAttribute('aria-pressed') === 'true', 'Canvases chip is not pressed');
      const heads = await page.locator('thead th').allInnerTexts();
      for (const ops of ['Watch', 'Deployed', 'Last run']) must(!heads.some((t) => t.includes(ops)), `${ops} column shown for Canvases`);
      must((await row.innerText()).includes('On another device'), 'canvas row lacks On another device');
      must(await row.locator('svg.lucide-pen-line').count() === 1, 'canvas row lacks the canvas icon');
      await chip('Mine').click();
      await page.waitForURL(/[?&]s=private/);
      await row.waitFor();
      await page.goto(`${base}/library?type=canvases&s=shared`); // canvases are owner-only, so this view is always empty
      await page.getByText('Nothing here yet', { exact: true }).waitFor({ timeout: 20000 });
      await shStart(page).click();
      await page.getByRole('dialog', { name: 'Start a rabbit hole' }).waitFor({ timeout: 10000 });
    } finally {
      await shDrop(page, c.name);
      await page.context().close();
    }
  });
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && cd packages/web && node --check e2e/rabbit-hole-check.mjs && npm run build && VITE_COACHING_DEV=true VITE_BYOC_DEV=true npm run build -- --outDir dist-dev
```

Expected: make test-unit exits 0, the syntax check passes, and both builds succeed. In the live build type is null, so hidden === cols.hidden and setHidden writes the same saveCols payload as App.jsx:253 and :342 did. ofType(x, null) returns x, and titleOf of a live row is a.name (index.js:447 FIELDS has no title), so the live table is unchanged.

- [ ] **Step 5: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && git add packages/web/src/library-filter.js packages/web/src/library-filter.test.mjs && git commit --only packages/web/src/library-filter.js packages/web/src/library-filter.test.mjs packages/web/src/App.jsx packages/web/e2e/rabbit-hole-check.mjs -m 'feat(web): Library type and scope chips, ops columns hidden for projects and canvases (preview only)'
```

Expected: One commit with 4 files

---

### Task 35: Sidebar: Home, Library and Explore nav; a flat Pinned section with Pin and Unpin; Recent moves to Home; collapsed defaults; titleOf rows; canvas rows get no live-app actions

*Area:* Shell, Home, Library, Sidebar · *Brief:* T05 · *Order:* 9.4

**Files:**
- `packages/web/src/Sidebar.jsx`
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: routes.js pageFor, sectionHref and sectionActive (order 1); home/pinned.js (order 3.3); library-filter.js isLearnResource (order 9.3); agent/catalog.js titleOf
- Produces: Dev build only: a nav with aria-current and a 'preview' tag on Explore. The Pinned section (<section aria-label=Pinned>) uses appRow(a,false) and re-reads on small:pinned. Pin and Unpin sit in the row ⋯ menu. The Recent section is hidden. The Apps label opens /library and lights up on any Library URL. Apps, Shared and Private start collapsed for new users. Canvas rows: Share is disabled with the §11 copy, and there is no Rename, Duplicate, Trash or drag. The live Sidebar is unchanged: every new branch is gated, and the shared helpers return today's values when preview=false (routes and pinned tests).

- [ ] **Step 1: Add the Sidebar e2e check above the shell-home end marker**

```jsx
// ===== packages/web/e2e/rabbit-hole-check.mjs - insert directly above the shell-home inner end line (order 2.5). Instruction lines like this one are not file content, so the marker texts appear in the file exactly once. =====
  await check('sh-sidebar: Home, Library and Explore nav; flat Pinned with Pin and Unpin; no Recent; canvas rows offer no live-app actions', async () => {
    const page = await open();
    await page.goto(`${base}/apps`);
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.waitFor({ timeout: 20000 });
    must(await nav.getByRole('button', { name: 'Home', exact: true }).getAttribute('aria-current') === 'page', 'Home is not current on /apps');
    const aside = page.locator('aside');
    const c = await shCanvas(page, 'rabbit-hole-check pin');
    try {
      await page.reload();
      await nav.waitFor({ timeout: 20000 });
      must(await aside.getByText('Recent', { exact: true }).count() === 0, 'the sidebar still shows Recent');
      await nav.getByRole('button', { name: 'Library', exact: true }).click();
      await page.waitForURL(/\/library$/);
      must(await nav.getByRole('button', { name: 'Library', exact: true }).getAttribute('aria-current') === 'page', 'Library is not current on /library');
      await aside.getByRole('button', { name: 'Expand Private' }).click(); // new users start collapsed
      const row = aside.locator('.group\\/r').filter({ hasText: 'rabbit-hole-check pin' }).last();
      await row.hover();
      await row.getByTitle('More').click();
      must(await row.getByRole('button', { name: 'Share' }).isDisabled(), 'Share is enabled on a canvas');
      for (const name of ['Rename', 'Duplicate', 'Move to Trash']) must(await row.getByRole('button', { name }).count() === 0, `${name} is offered on a canvas`);
      await row.getByRole('button', { name: 'Pin', exact: true }).click();
      const pinned = aside.getByRole('region', { name: 'Pinned' });
      await pinned.getByText('rabbit-hole-check pin').waitFor({ timeout: 10000 });
      must(await pinned.locator('svg.lucide-pen-line').count() === 1, 'the pinned canvas lacks its icon');
      await page.reload();
      await pinned.getByText('rabbit-hole-check pin').waitFor({ timeout: 20000 });
      await row.hover();
      await row.getByTitle('More').click();
      await row.getByRole('button', { name: 'Unpin', exact: true }).click();
      await pinned.waitFor({ state: 'detached', timeout: 10000 });
    } finally {
      await shDrop(page, c.name);
      await page.context().close();
    }
  });
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --check e2e/rabbit-hole-check.mjs
```

Expected: Syntax OK, exit 0. The check fails against the clone until order 9.9 deploys this code.

- [ ] **Step 2: Run the new labels against the clone, which still runs the previous build, and watch them fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=sh-sidebar node e2e/rabbit-hole-check.mjs
```

Expected: FAIL on sh-sidebar: the clone still serves the previous sidebar, with Recent and no Home, Library, Explore or Pinned. This is the failing test that the implementation step must turn green.

- [ ] **Step 3: Wire the Sidebar (anchor every edit on the quoted content; the file uses CRLF)**

```jsx
// Sidebar.jsx:2 - add Compass, House, Library, Pin, PinOff to the lucide-react import list.
// directly after `import { isPrivateByoc } from './private-auth.js';` add:
import { titleOf } from './agent/catalog.js';
import { learnPreview } from './flags.js';
import { pinnedApps, readPinned, secClosedInit, togglePin } from './home/pinned.js';
import { isLearnResource } from './library-filter.js';
import { pageFor, sectionActive, sectionHref } from './routes.js';

// directly after `  const section = new URLSearchParams(window.location.search).get('s');` add:
  const query = window.location.search;
  const here = learnPreview ? pageFor(path, query, true).page : null; // which nav item you are on
  // Pinned (T02 §2): device-local and flat. togglePin announces every change, whoever made
  // it (this menu or the Agent Bar's pin command), so re-read on that event.
  const [, setPinTick] = useState(0);
  useEffect(() => {
    if (!learnPreview) return;
    const on = () => setPinTick((n) => n + 1);
    window.addEventListener('small:pinned', on);
    return () => window.removeEventListener('small:pinned', on);
  }, []);
  const pins = learnPreview && email ? readPinned(localStorage, org, email) : [];
  // ponytail: Pinned rows carry no ⋯ menu; unpin from the row in its section or with the bar's unpin command.
  const pinned = pinnedApps(pins, apps);

// appRow, the draggable and onDragStart lines become:
        draggable={menu && a.hosting !== 'aws' && !isLearnResource(a)}
        onDragStart={menu && a.hosting !== 'aws' && !isLearnResource(a) ? (e) => { setDragging(a.name); e.dataTransfer.setData('text/plain', a.name); e.dataTransfer.effectAllowed = 'move'; } : undefined}
// the title span becomes:
        <span className="min-w-0 flex-1 truncate">{titleOf(a)}</span>
// directly after `<MenuItem icon={ExternalLink} onClick={() => { setMenuFor(null); navigate(`/apps/${a.name}`); }}>Open</MenuItem>` add:
          {learnPreview && email && (
            <MenuItem icon={pins.includes(a.name) ? PinOff : Pin} onClick={() => { setMenuFor(null); togglePin(localStorage, org, email, a.name); }}>
              {pins.includes(a.name) ? 'Unpin' : 'Pin'}
            </MenuItem>
          )}
// the Share MenuItem becomes (T02 §11 copy for canvases):
          <MenuItem disabled={isLearnResource(a)} title={a.kind === 'repository' ? 'Available to everyone in this workspace' : a.kind === 'canvas' ? "Sharing projects and canvases isn't available yet." : undefined} icon={Share2} onClick={() => { setMenuFor(null); navigate(`/apps/${a.name}?share=1`); }}>Share</MenuItem>
// the three guards become:
          {a.canEdit && !isLearnResource(a) && (
          {a.hosting !== 'aws' && !isLearnResource(a) && <MenuItem
          {a.hosting !== 'aws' && !isLearnResource(a) && a.owner_email === email && (

// Sidebar.jsx:695 becomes:
  const [secClosed, setSecClosed] = useState(() => secClosedInit(localStorage.getItem('small.secClosed'), learnPreview));
// sectionLabel, Sidebar.jsx:714 and :717 become:
            onClick={() => navigate(sectionHref(s, learnPreview))}
              sectionActive(path, query, s, learnPreview) && 'bg-active font-medium text-ink',

// directly before `      {sectionLabel('Apps', null, (` add:
      {learnPreview && (
        <nav aria-label="Main" className="pt-2">
          {[['Home', '/apps', 'home', House], ['Library', '/library', 'library', Library], ['Explore', '/explore', 'explore', Compass]].map(([label, to, page, Icon]) => (
            <button
              key={page}
              aria-current={here === page ? 'page' : undefined}
              onClick={() => navigate(to)}
              className={cn('flex h-7 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-hover', here === page && 'bg-active font-medium')}
            >
              <Icon size={16} strokeWidth={1.5} className="shrink-0 text-ink-2" />
              {label}
              {page === 'explore' && <span className="ml-auto text-[10px] text-ink-3">preview</span>}
            </button>
          ))}
        </nav>
      )}
      {pinned.length > 0 && (
        <section aria-label="Pinned">
          <div className="px-2 pt-3 pb-1 text-xs text-ink-2">Pinned</div>
          {pinned.map((a) => appRow(a, false))}
        </section>
      )}

// Recent (Sidebar.jsx:1093), `      {recent.length > 0 && (` becomes:
      {!learnPreview && recent.length > 0 && (
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && cd packages/web && npm run build && VITE_COACHING_DEV=true VITE_BYOC_DEV=true npm run build -- --outDir dist-dev && npx playwright test -c playwright.learn-preview.config.js --reporter=line
```

Expected: make test-unit exits 0, and both builds succeed. The mocked learn-preview run matches the baseline. For the live build: sectionHref, sectionActive and secClosedInit with preview=false are today's expressions (tested); isLearnResource(a) equals a.kind==='repository' for every live row (canvases never occur there); titleOf of a live row is a.name.

- [ ] **Step 4: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git commit --only packages/web/src/Sidebar.jsx packages/web/e2e/rabbit-hole-check.mjs -m 'feat(web): sidebar Home, Library, Explore nav and flat Pinned; Recent moves to Home (preview only)'
```

Expected: One commit with 2 files

---

### Task 36: Library Archived chip with Restore, and Archive with confirmation from a canvas row menu (T02 §8.4)

*Area:* Shell, Home, Library, Sidebar · *Brief:* T06 · *Order:* 9.5

**Files:**
- `packages/web/src/App.jsx`
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: order 9.3 (chips, Chip, libraryQuery, chipHref). From backend-canvas (orders 6.1-6.4): GET /api/canvases?archived=1 -> {canvases}, and POST /api/apps/canvas-*/archive and /restore. All of these write to LEARN_DB only, so they are D7-safe.
- Produces: ?type=canvases&archived=1 lists archived canvases (<ul aria-label='Archived canvases'>) with Restore. A canvas row's last cell is a ⋯ button that opens a portaled Menu with Archive…, confirmed by a ConfirmDialog. Nothing changes in the live build, where the canvas kind and ?archived never apply.

- [ ] **Step 1: Check that backend-canvas serves the three endpoints and the dev worker routes them**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && grep -nE "archived'\) === '1'|canvases: await ownerCanvases|'archive'|restore" packages/control-plane/src/canvases.js && grep -n 'canvases' packages/web/dev-worker.js
```

Expected: canvases.js shows the GET list that reads ?archived=1 and returns json({ canvases: ... }), plus the archive and restore branch. dev-worker.js imports and routes canvasesFetch. If the list path or its response key differs, stop and correct this task and the contract before writing code.

- [ ] **Step 2: Add the archive round-trip e2e check above the shell-home end marker**

```jsx
// ===== packages/web/e2e/rabbit-hole-check.mjs - insert directly above the shell-home inner end line (order 2.5). Instruction lines like this one are not file content, so the marker texts appear in the file exactly once. =====
  await check('sh-library: Archive from a canvas row menu with confirmation; Archived lists it; Restore brings it back (T02 §8.4)', async () => {
    const page = await open();
    await page.goto(`${base}/library?type=canvases`);
    await shH1(page, 'Library').waitFor({ timeout: 20000 });
    const c = await shCanvas(page, 'rabbit-hole-check archive', 'rabbit-hole-check-device');
    try {
      await page.reload();
      const row = page.locator('tbody tr').filter({ hasText: 'rabbit-hole-check archive' });
      await row.getByTitle('More').click();
      await page.getByRole('button', { name: 'Archive…' }).click();
      await page.getByRole('dialog', { name: 'Archive rabbit-hole-check archive?' }).getByRole('button', { name: 'Archive', exact: true }).click();
      await row.waitFor({ state: 'detached', timeout: 20000 });
      const archivedChip = page.locator('button[aria-pressed]').filter({ hasText: /^Archived$/ });
      await archivedChip.click();
      const item = page.getByRole('list', { name: 'Archived canvases' }).getByRole('listitem').filter({ hasText: 'rabbit-hole-check archive' });
      await item.getByRole('button', { name: 'Restore' }).click();
      await item.waitFor({ state: 'detached', timeout: 20000 });
      await archivedChip.click();
      await row.waitFor({ timeout: 20000 });
    } finally {
      await shDrop(page, c.name);
      await page.context().close();
    }
  });
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --check e2e/rabbit-hole-check.mjs
```

Expected: Syntax OK, exit 0

- [ ] **Step 3: Run the new labels against the clone, which still runs the previous build, and watch them fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=sh-library node e2e/rabbit-hole-check.mjs
```

Expected: FAIL on sh-library: the clone still serves the previous Library, with no Archived chip or canvas row menu. This is the failing test that the implementation step must turn green.

- [ ] **Step 4: Archived view, the canvas row menu and the confirmation in App.jsx**

```jsx
// App.jsx:2 lucide import: add Archive, ArchiveRestore, MoreHorizontal. App.jsx:8 ui import: add ConfirmDialog.
// directly after `  const [search, setSearch] = useState(null); // null = collapsed, string = open` add:
  const [rowMenu, setRowMenu] = useState(null); // { name, top, left }: a canvas row's ⋯ menu, portaled out of the scrolling table (App.jsx:306)
  const [confirmArchive, setConfirmArchive] = useState(null); // the canvas row awaiting confirmation
  const [archivedList, setArchivedList] = useState(null); // null loading | rows | { error }
// `  const { type } = libraryQuery(window.location.search, learnPreview);` becomes:
  const { type, archived } = libraryQuery(window.location.search, learnPreview);
// directly after the `const sectionApps = ofType(...)` statement add:
  // T02 §4, §8.4: archived canvases come from LEARN_DB (GET /api/canvases?archived=1), never /api/apps.
  useEffect(() => {
    if (!archived) return;
    setArchivedList(null);
    api('/api/canvases?archived=1').then((d) => setArchivedList(d.canvases)).catch((e) => setArchivedList({ error: e.message }));
  }, [archived]);
  // Archive never deletes local content; Restore brings the canvas back.
  const archive = async () => {
    const c = confirmArchive;
    setConfirmArchive(null);
    try { await api(`/api/apps/${c.name}/archive`, { method: 'POST' }); toast(`Archived ${titleOf(c)}`); load(); } catch (e) { toast(`✗ ${e.message}`); }
  };
  const restore = async (c) => {
    try { await api(`/api/apps/${c.name}/restore`, { method: 'POST' }); toast(`Restored ${titleOf(c)}`); setArchivedList((l) => l.filter((x) => x.name !== c.name)); load(); } catch (e) { toast(`✗ ${e.message}`); }
  };

// in the type chip row, directly after the `{Object.entries(TYPES).map(...)}` line add:
                {type === 'canvases' && <Chip on={archived} onClick={() => navigate(chipHref(window.location.search, 'archived', archived ? null : '1'))}>Archived</Chip>}
// directly after the closing `)}` of the `{learnPreview && (` chip block add:
          {archived && (!archivedList ? <SkeletonRows rows={3} />
            : archivedList.error ? <div className="text-ink-2">✗ {archivedList.error}</div>
            : !archivedList.length ? <EmptyState icon={Archive}>No archived canvases.</EmptyState>
            : (
              <ul aria-label="Archived canvases">
                {archivedList.map((c) => (
                  <li key={c.name} className="flex h-8 items-center gap-2 border-b border-line px-2 text-sm">
                    <KindIcon kind="canvas" />
                    <span className="min-w-0 flex-1 truncate">{titleOf(c)}</span>
                    <span className="text-xs text-ink-3">archived {ago(c.archived_at)}</span>
                    <PillButton onClick={() => restore(c)}><ArchiveRestore size={11} /> Restore</PillButton>
                  </li>
                ))}
              </ul>
            ))}
// the two preview conditions gain `!archived &&`:
          {data && !data.error && learnPreview && !archived && sectionApps.length === 0 && (
          {!archived && (learnPreview ? sectionApps.length > 0 : apps.length > 0) && (

// row actions: replace
                            ) : (
                              <a
                                href={a.url}
// with
                            ) : a.kind === 'canvas' ? (
                              <IconBtn title="More" onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setRowMenu({ name: a.name, top: r.bottom + 4, left: r.right - 176 }); }}>
                                <MoreHorizontal size={14} />
                              </IconBtn>
                            ) : (
                              <a
                                href={a.url}

// directly after the `{panelApp && ( <Panel ... /> )}` block, before the closing `</>`, add:
      <Menu portal open={!!rowMenu} onClose={() => setRowMenu(null)} style={{ top: rowMenu?.top, left: rowMenu?.left }} className="w-44">
        <MenuItem icon={Archive} onClick={() => { setConfirmArchive(apps.find((x) => x.name === rowMenu.name)); setRowMenu(null); }}>Archive…</MenuItem>
      </Menu>
      {confirmArchive && (
        <ConfirmDialog title={`Archive ${titleOf(confirmArchive)}?`} body="It leaves the Library. Its content stays in this browser, and Restore brings it back." confirmLabel="Archive" confirmVariant="primary" onConfirm={archive} onCancel={() => setConfirmArchive(null)} />
      )}
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && cd packages/web && npm run build && VITE_COACHING_DEV=true VITE_BYOC_DEV=true npm run build -- --outDir dist-dev
```

Expected: make test-unit exits 0, and both builds succeed. In the live build archived is always false and rowMenu is always null, so Menu renders nothing (ui.jsx:472).

- [ ] **Step 5: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git commit --only packages/web/src/App.jsx packages/web/e2e/rabbit-hole-check.mjs -m 'feat(web): Library Archived chip with Restore and Archive from a canvas row menu (preview only)'
```

Expected: One commit with 2 files

---

### Task 37: Settings reused (dev only): portal, Escape, the small:settings {tab, focus} event, Planned badges and disabled no-ops, PRODUCT copy, and Connections as a catalog

*Area:* Settings, Connections, Start dialog, e2e, deploy · *Brief:* T05 · *Order:* 9.8

**Files:**
- `packages/web/src/Sidebar.jsx`
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: flags.js (learnPreview, PRODUCT) from shell-home (order 1); connections.js (order 2.4); agent-core's open_settings (order 4), which dispatches 'small:settings' {tab, focus}; agent-ui's StartHost (order 8.5) for the GitHub row and J19. shell-home's Sidebar task (order 9.4) must already be applied: re-read Sidebar.jsx and anchor every edit on the quoted content, not on line numbers. This task lands before agent-ui's Agent Bar (10.2), so the bar's 'Opened Settings → …' line is true from the bar's first deploy.
- Produces: On dev builds Settings opens anywhere, including collapsed and below md, closes on Esc, highlights the requested row with aria-current, marks Planned items, and lists Connections as a catalog. Live DOM is unchanged. The harness gains green labels J15 ×2, J16, J17 (Settings), J19, J20, J21 and J22.

- [ ] **Step 1: Confirm that every anchor still exists after shell-home's Sidebar task**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && grep -n "function SettingsDialog({ email, org, apps, onReload, onMarkRead, onClose, initialTab, pendingGrant, onAccessChanged })\|onClick={() => setTab(id)}\|max-w-\[1150px\]\|mx-auto max-w-\[920px\] px-12 py-10\|tab === 'preferences' && (\|tab === 'connections' && (\|Nothing here yet\|// Settings > Account > AI model\|const \[showSettings, setShowSettings\] = useState(false);\|initialTab={typeof showSettings === 'string' ? showSettings : undefined}" src/Sidebar.jsx
```

Expected: Ten matches, one for each anchor. If any is missing, stop and reconcile with shell-home's edit before applying the edits below.

- [ ] **Step 2: Insert the Settings block into the harness above the marker line**

```jsx
{
  // ── Settings and Connections (T02 §11; brief §21 J15-J17, J19-J22) ──
  const row = (page, id) => settings(page).locator(`[data-settings-focus="${id}"]`);
  const settingsAt = async (detail, path = '/apps', viewport) => {
    const page = await open(viewport);
    await loaded(page, path);
    await page.evaluate((d) => window.dispatchEvent(new CustomEvent('small:settings', { detail: d })), detail);
    await settings(page).waitFor({ timeout: 5000 });
    return page;
  };

  await check('J15: Settings opens from the workspace menu; Esc returns to the same route', async () => {
    const page = await open();
    await loaded(page, '/apps?s=shared');
    await page.locator('aside').getByText(wsLabel, { exact: true }).first().click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await settings(page).waitFor({ timeout: 10000 });
    await page.keyboard.press('Escape');
    await settings(page).waitFor({ state: 'detached', timeout: 5000 });
    must(page.url() === `${base}/apps?s=shared`, `route changed to ${page.url()}`);
    await page.context().close();
  });

  await check('J15: Settings opens with the sidebar collapsed and below md, inside the viewport', async () => {
    for (const width of [1500, 390]) {
      const page = await open({ width, height: 900 });
      await loaded(page);
      if (width >= 768) await page.keyboard.press('Control+Backslash'); // collapse (Shell.jsx:44-50)
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('small:settings', { detail: { tab: 'preferences' } })));
      await settings(page).waitFor({ timeout: 5000 });
      const box = await settings(page).boundingBox();
      must(box && box.x >= 0 && box.x + box.width <= width, `Settings off-screen at ${width}px`);
      await page.keyboard.press('Escape');
      await settings(page).waitFor({ state: 'detached', timeout: 5000 });
      await page.context().close();
    }
  });

  await check('J16: theme survives reload and revisit; no-op preferences are Planned and disabled; copy names the product', async () => {
    const page = await settingsAt({ tab: 'preferences' });
    const dialog = settings(page);
    must((await dialog.innerText()).includes('Choose how you want Rabbit Hole to look and behave'), 'Preferences copy does not use PRODUCT');
    for (const name of ['High contrast', 'Use Enter to add a new line', 'Language', 'Number format', 'Always show text direction controls', 'Mail & Calendar', 'Import', 'Small MCP', 'Public pages', 'Emoji']) {
      must(await dialog.getByText(new RegExp(`^${name} ?Planned$`)).count() === 1, `${name} has no Planned badge`);
    }
    for (const name of ['Use system setting', 'English (US)', 'Default']) must(await dialog.getByRole('button', { name, exact: true }).isDisabled(), `${name} select is enabled`);
    must(await dialog.getByRole('switch').evaluateAll((all) => all.length === 2 && all.every((s) => s.disabled)), 'the Enter-newline or text-direction toggle is enabled');
    await dialog.getByRole('button', { name: 'System', exact: true }).click();
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await page.keyboard.press('Escape');
    await loaded(page);
    must(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'dark theme did not survive reload');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('small:settings', { detail: { tab: 'preferences' } })));
    await dialog.getByRole('button', { name: 'Dark', exact: true }).waitFor({ timeout: 5000 }); // the revisit shows the saved choice
    await dialog.getByText('Mail & Calendar').click();
    await dialog.getByText('Planned — not available yet.').waitFor({ timeout: 3000 });
    await page.context().close(); // the theme lives in this throwaway context only
  });

  await check('J17: a planned provider opens highlighted in Settings, says Planned, and offers no action', async () => {
    const page = await settingsAt({ tab: 'connections', focus: 'google-slides' });
    must(await row(page, 'google-slides').getAttribute('aria-current') === 'true', 'the Google Slides row is not highlighted');
    for (const id of ['google-slides', 'google-drive', 'notion']) {
      must((await row(page, id).innerText()).includes('Planned'), `${id} is not Planned`);
      must(await row(page, id).getByRole('button').count() === 0, `${id} offers an action`);
    }
    await page.context().close();
  });

  await check('J19: Manage connections from Start on a project returns to the same draft and route, with nothing created', async () => {
    must(repo, 'no repository project in the catalog');
    const page = await open();
    await openStart(page, 'sources', `/apps/${repo.name}`);
    const writes = [];
    page.on('request', (r) => { const p = new URL(r.url()).pathname; if (r.method() !== 'GET' && /^[/]api[/](canvases|repositories|apps)/.test(p)) writes.push(`${r.method()} ${p}`); });
    const dialog = startDialog(page);
    await dialog.getByPlaceholder('Untitled canvas').fill('e2e J19 draft');
    await dialog.getByRole('radio', { name: 'From a connection' }).click();
    await dialog.getByRole('button', { name: 'Manage connections' }).click();
    await settings(page).waitFor({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await settings(page).waitFor({ state: 'detached', timeout: 5000 });
    must(await dialog.isVisible(), 'Start closed together with Settings');
    must(await dialog.getByPlaceholder('Untitled canvas').inputValue() === 'e2e J19 draft', 'the draft title was lost');
    must(new URL(page.url()).pathname === `/apps/${repo.name}`, `route changed to ${page.url()}`);
    must(!writes.length, `a cancelled source choice wrote: ${writes}`);
    await page.context().close();
  });

  await check('J20: AWS management stays with its installer; a workspace switch re-scopes the catalog', async () => {
    const page = await settingsAt({ tab: 'connections' });
    if (await row(page, 'aws').count()) {
      const { connection } = await page.evaluate(() => fetch('/api/byoc/connection').then((r) => r.json()));
      if (connection && !connection.can_deploy && connection.state !== 'connected') must((await row(page, 'aws').innerText()).includes('manages this connection'), 'a non-installer sees no manager line (AwsConnection.jsx:91)');
      if (connection?.state === 'connected' && !connection.can_deploy) must(await row(page, 'aws').getByRole('button', { name: 'Connected' }).isDisabled(), 'a non-installer can disconnect');
    }
    const { workspaces = [], active } = await page.evaluate(() => fetch('/api/workspaces').then((r) => r.json()));
    const other = workspaces.find((w) => w.slug !== active);
    if (!other) { console.log('note: J20 switch not exercised; the test user has one workspace'); return page.context().close(); }
    await page.keyboard.press('Escape');
    await page.locator('aside').getByText(wsLabel, { exact: true }).first().click();
    await Promise.all([page.waitForEvent('load'), page.getByText(other.name || wsName(other.slug), { exact: true }).click()]); // Sidebar.jsx:797-805 reloads /apps
    const now = await page.evaluate(() => fetch('/api/apps', { headers: { 'X-Small-Workspace': localStorage.getItem('small.ws') || '' } }).then((r) => r.json()));
    must(now.org === other.slug, `catalog still scoped to ${now.org}`);
    await page.context().close();
  });

  await check('J21: availability is shown apart from account status', async () => {
    const page = await settingsAt({ tab: 'connections' });
    const github = await row(page, 'github').innerText();
    must(github.includes('Available') && github.includes('No account needed for public repositories'), 'GitHub mixes or drops availability and account status');
    for (const id of ['slack', 'google-slides', 'google-drive', 'notion']) must(!/account|connected|synced|imported/i.test(await row(page, id).innerText()), `${id} implies an account or sync state`);
    await page.context().close();
  });

  await check('J22: only AWS offers disconnect, behind a confirmation that states consequences', async () => {
    const page = await settingsAt({ tab: 'connections' });
    for (const id of ['github', 'slack', 'google-slides', 'google-drive', 'notion']) must(!(await row(page, id).getByText(/disconnect|remove/i).count()), `${id} offers a removal it can't perform`);
    const connected = row(page, 'aws').getByRole('button', { name: 'Connected' });
    if (await connected.count() && await connected.isEnabled()) {
      const confirm = page.getByRole('dialog', { name: 'Disconnect AWS?', exact: true });
      await connected.click();
      await confirm.waitFor({ timeout: 5000 });
      must((await confirm.innerText()).includes('Your AWS resources and data stay intact'), 'disconnect consequences missing');
      await page.keyboard.press('Escape'); // the confirm is the top layer: Esc closes it, not Settings
      await confirm.waitFor({ state: 'detached', timeout: 3000 });
      must(await settings(page).isVisible(), 'Esc on the confirm also closed Settings');
      await connected.click();
      await confirm.getByRole('button', { name: 'Cancel' }).click(); // D7: never Disconnect
      await confirm.waitFor({ state: 'detached', timeout: 3000 });
    } else console.log('note: J22 confirm not exercised; this user has no AWS connection it can disconnect');
    await page.context().close();
  });
}
```

- [ ] **Step 3: Run the Settings labels against the clone as it stands. They must fail.**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=J15,J16,J17,J19,J20,J21,J22 node e2e/rabbit-hole-check.mjs
```

Expected: All 8 Settings labels print FAIL: two for J15, then J16, J17 (Settings), J19, J20, J21 and J22. The served Settings has no role=dialog named 'Settings', no small:settings listener and no catalog rows. The Start J17 label from the previous block prints ok. The run ends '8 FAILURES', exit 1.

- [ ] **Step 4: Apply the Sidebar.jsx edits in order. Every delta is behind learnPreview; with it off, every helper returns today's markup.**

```jsx
// 1) The react import line gains useRef, and createPortal follows it:
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
// 2) After `import ByocDevBadge from './ByocDevBadge.jsx';` add:
import { AVAILABILITY, connectionsFor } from './connections.js';
// 3) The flags import. If shell-home added `import { learnPreview } from './flags.js';`, extend it;
//    otherwise add it after `import { isPrivateByoc } from './private-auth.js';`:
import { learnPreview, PRODUCT } from './flags.js';
// 4) In the './ui.jsx' import list, add Pill after MenuItem (skip if shell-home already added it):
//    ... Menu, MenuItem, Pill, Select, SettingsRow, ...

// 5) After `const THEMES = { System: 'system', Light: 'light', Dark: 'dark' };` add:
// T02 §11, dev build only (D2): no-op controls and placeholder panes say Planned. Each helper
// returns its input unchanged when learnPreview is off, so the live markup stays exactly as today.
const planned = (className = 'ml-2') => learnPreview && <Pill className={className}>Planned</Pill>;
const soonTitle = (text) => (learnPreview ? <span>{text}{planned()}</span> : text);
const dim = (control) => (learnPreview ? <span className="opacity-50">{control}</span> : control);
const AVAILABILITY_COLOR = { available: 'green', preview: 'yellow', planned: 'grey' };

// 6) Replace the SettingsDialog signature and its first line
//    `function SettingsDialog({ email, org, apps, onReload, onMarkRead, onClose, initialTab, pendingGrant, onAccessChanged }) {`
//    `  const [tab, setTab] = useState(initialTab || 'preferences');` with:
function SettingsDialog({ email, org, apps, onReload, onMarkRead, onClose, initialTab, focus: initialFocus, pendingGrant, onAccessChanged }) {
  const [tab, setTab] = useState(initialTab || 'preferences');
  const [focus, setFocus] = useState(initialFocus || null); // the row open_settings asked for, e.g. google-slides
  const box = useRef(null);
  useEffect(() => {
    if (!learnPreview) return;
    // Capture phase: while Settings is the top layer, Esc closes it and nothing under it (Start
    // dialog, bar sheet). A dialog opened inside Settings (Disconnect AWS?) takes Esc first.
    const esc = (e) => {
      if (e.key !== 'Escape' || box.current?.querySelector('[role="dialog"]')) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, []);
  useEffect(() => {
    if (focus) box.current?.querySelector(`[data-settings-focus="${CSS.escape(focus)}"]`)?.scrollIntoView({ block: 'center' });
  }, [focus, tab]);

// 7) In NavBtn, replace `      onClick={() => setTab(id)}` with:
      onClick={() => { setTab(id); setFocus(null); }}

// 8) Replace the opening `  return (` and the next three lines (the backdrop div, the
//    `max-w-[1150px]` panel div, and the `w-[260px] shrink-0 overflow-y-auto` nav div) with:
  const node = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 animate-[fade-in_100ms_ease-out]" onMouseDown={onClose}>
      <div ref={box} {...(learnPreview && { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Settings' })} className={cn('flex h-[calc(100vh-100px)] max-h-[720px] w-[calc(100vw-100px)] max-w-[1150px] overflow-hidden rounded-2xl bg-white text-ink shadow-pop', learnPreview && 'max-md:h-[calc(100dvh-32px)] max-md:w-[calc(100vw-32px)] max-md:flex-col')} onMouseDown={(e) => e.stopPropagation()}>
        <div className={cn('w-[260px] shrink-0 overflow-y-auto border-r border-line bg-side py-4 px-3', learnPreview && 'max-md:max-h-40 max-md:w-full max-md:border-r-0 max-md:border-b')}>

// 9) Replace `<div className="mx-auto max-w-[920px] px-12 py-10">` with:
          <div className={cn('mx-auto max-w-[920px] px-12 py-10', learnPreview && 'max-md:px-4 max-md:py-6')}>

// 10) Placeholder nav entries, each gains a badge:
          <NavBtn id="mail" icon={Mail}>Mail & Calendar{planned('ml-auto')}</NavBtn>
          <NavBtn id="import" icon={Download}>Import{planned('ml-auto')}</NavBtn>
          <NavBtn id="mcp" icon={Share2}>Small MCP{planned('ml-auto')}</NavBtn>
          <NavBtn id="pages" icon={Globe}>Public pages{planned('ml-auto')}</NavBtn>
          <NavBtn id="emoji" icon={Smile}>Emoji{planned('ml-auto')}</NavBtn>

// 11) Replace the whole `{tab === 'preferences' && (` block with:
          {tab === 'preferences' && (
            <>
              <div className="text-2xl font-semibold">Preferences</div>
              <div className="pt-2 text-base text-ink-2">{`Choose how you want ${PRODUCT} to look and behave`}</div>
              <Heading>Appearance</Heading>
              <SettingsRow title="Theme" desc={`Choose a theme for ${PRODUCT} on this device`}>
                <Select
                  value={label}
                  options={Object.keys(THEMES)}
                  onChange={(k) => { setThemeState(THEMES[k]); setTheme(THEMES[k]); }}
                />
              </SettingsRow>
              <SettingsRow
                title={learnPreview ? soonTitle('High contrast') : <span>High contrast <span className="ml-1 rounded-sm bg-hover px-1.5 py-0.5 text-[11px] text-ink-2">Beta</span></span>}
                desc="Increase contrast for improved visibility"
              >
                {dim(<Select disabled={learnPreview} value="Use system setting" options={['Use system setting', 'On', 'Off']} onChange={() => {}} />)}
              </SettingsRow>
              <Heading>Input options</Heading>
              <SettingsRow title={soonTitle('Use Enter to add a new line')} desc="Applies to chat, comments, and other input fields. Press Cmd/Ctrl + Enter to send.">
                {dim(<Toggle disabled={learnPreview} on={enterNewline} onChange={setEnterNewline} />)}
              </SettingsRow>
              <Heading>Language & time</Heading>
              <SettingsRow title={soonTitle('Language')} desc={`Choose the language you want to use ${PRODUCT} in`}>
                {dim(<Select disabled={learnPreview} value="English (US)" options={['English (US)']} onChange={() => {}} />)}
              </SettingsRow>
              <SettingsRow title={soonTitle('Number format')} desc="Choose how numbers and currencies are formatted. Default uses your language setting.">
                {dim(<Select disabled={learnPreview} value="Default" options={['Default']} onChange={() => {}} />)}
              </SettingsRow>
              <SettingsRow title={soonTitle('Always show text direction controls')} desc="Show the option to change text direction (left to right or right to left) in the editor, regardless of what language you're using">
                {dim(<Toggle disabled={learnPreview} on={textDir} onChange={setTextDir} />)}
              </SettingsRow>
            </>
          )}

// 12) Replace `{tab === 'connections' && (` with `{tab === 'connections' && !learnPreview && (` (its body
//     is unchanged), and insert this block directly before `{tab === 'general' && (`:
          {tab === 'connections' && learnPreview && (
            <>
              <div className="text-2xl font-semibold">Connections</div>
              <div className="pt-2 text-base text-ink-2">{`What each connection adds to learning in ${PRODUCT}, and whether it is available yet`}</div>
              <Heading>Providers</Heading>
              {connectionsFor({ aws: isPrivateByoc || import.meta.env.VITE_BYOC_DEV === 'true' }).map((c) => (
                <div key={c.id} data-settings-focus={c.id} aria-current={focus === c.id || undefined} className={cn('-mx-2 rounded-md px-2', focus === c.id && 'bg-hover ring-2 ring-accent/35')}>
                  <SettingsRow
                    title={<span className="flex items-center gap-2">{c.name}<Pill color={AVAILABILITY_COLOR[c.availability]}>{AVAILABILITY[c.availability]}</Pill></span>}
                    desc={[c.adds, c.account].filter(Boolean).join(' ')}
                  >
                    {c.id === 'github' && <Button variant="soft" size="sm" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('small:start', { detail: { path: 'repository' } })); }}>Start from a repository</Button>}
                    {c.id === 'slack' && <Button variant="soft" size="sm" onClick={() => window.open('/slack/install', '_blank', 'noopener')}>Connect Slack</Button>}
                  </SettingsRow>
                  {c.id === 'aws' && <AwsConnection workspace={org} apps={apps} onChanged={onReload} onAccessChanged={onAccessChanged} />}
                </div>
              ))}
            </>
          )}

// 13) Replace `<div className="pt-2 text-base text-ink-2">Nothing here yet</div>` with:
              <div className="pt-2 text-base text-ink-2">{learnPreview ? 'Planned — not available yet.' : 'Nothing here yet'}</div>

// 14) The end of SettingsDialog, `    </div>\n  );\n}\n\n// Settings > Account > AI model`, becomes:
    </div>
  );
  // Portaled in dev: inside the aside it can't show while the sidebar is collapsed
  // (Shell.jsx:75 transform) or below md (Shell.jsx:72 max-md:hidden).
  return learnPreview ? createPortal(node, document.body) : node;
}

// Settings > Account > AI model

// 15) In Sidebar(), directly after `const [showSettings, setShowSettings] = useState(false);` add:
  useEffect(() => {
    if (!learnPreview) return;
    // T02 §11: the Agent Bar and the Start dialog open Settings on a tab, optionally on one row.
    const on = (e) => setShowSettings({ tab: e.detail?.tab, focus: e.detail?.focus });
    window.addEventListener('small:settings', on);
    return () => window.removeEventListener('small:settings', on);
  }, []);

// 16) In the SettingsDialog render line, replace
//     `initialTab={typeof showSettings === 'string' ? showSettings : undefined}` with:
      initialTab={typeof showSettings === 'string' ? showSettings : showSettings?.tab} focus={showSettings?.focus}
```

- [ ] **Step 5: Unit tests and the live build still compile**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --test src/connections.test.mjs src/start.test.mjs && npm run build
```

Expected: tests 11, pass 11. vite build (live flags off) prints 'built in'.

- [ ] **Step 6: Deploy to the clone and rerun the Settings labels**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && key=$(node --input-type=module -e "import {readFileSync} from 'node:fs'; import {parseEnv} from 'node:util'; const key = parseEnv(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8')).TLDRAW_LICENSE_KEY; if (!key) throw new Error('Missing TLDRAW_LICENSE_KEY'); process.stdout.write(key);") && VITE_COACHING_DEV=true VITE_BYOC_DEV=true VITE_TLDRAW_LICENSE_KEY="$key" npm run build -- --outDir dist-dev && npx wrangler deploy --config wrangler.dev.jsonc --name small-cp-dev-smart-home && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=build,J15,J16,J17,J19,J20,J21,J22 node e2e/rabbit-hole-check.mjs
```

Expected: The deploy succeeds. The script prints ok for build, both J15 labels, J16, both J17 labels, J19, J20, J21 and J22, then 'all checks passed'. J20 or J22 may print a 'note:' line when the test user has one workspace or no disconnectable AWS connection. If review breaks, use the harness task's rollback command.

- [ ] **Step 7: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git add packages/web/src/Sidebar.jsx packages/web/e2e/rabbit-hole-check.mjs && git commit --only -m 'feat(web): dev Settings opens anywhere, closes on Esc, marks Planned, and lists Connections as a catalog' -- packages/web/src/Sidebar.jsx packages/web/e2e/rabbit-hole-check.mjs
```

Expected: make test-unit is green. The commit contains exactly these 2 paths.

---

### Task 38: Deploy the smart-home clone, run the shell-home checks, inspect the pixels, and return the link

*Area:* Shell, Home, Library, Sidebar · *Brief:* T07 · *Order:* 9.9

**Files:**
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: orders 2.5 and 9.1-9.5; the applied LEARN_DB schema (backend-canvas order 5) and backend-canvas dev routes (orders 6.1-6.4), without which GET /api/apps returns 500 on the clone; StartHost (agent-ui, order 8.5); settings-deploy's verified deploy command and harness (order 0.5)
- Produces: https://small-cp-dev-smart-home.zeroshothq.workers.dev serving this tree, with ONLY=build,sh- all green (sh-title included) and screenshots of Home, Library and Explore in light, dark and 390px in e2e/shots (gitignored)

- [ ] **Step 1: Add the screenshot and no-sideways-scroll check above the shell-home end marker**

```js
// ===== packages/web/e2e/rabbit-hole-check.mjs - insert directly above the shell-home inner end line (order 2.5). Instruction lines like this one are not file content, so the marker texts appear in the file exactly once. =====
  await check('sh-shots: Home, Library and Explore in light, dark and at 390px, with no sideways scroll', async () => {
    const ready = { '/apps': (p) => shStart(p), '/library': (p) => shH1(p, 'Library'), '/explore': (p) => shH1(p, 'Explore') };
    for (const [look, viewport, colorScheme] of [['light', undefined, 'light'], ['dark', undefined, 'dark'], ['narrow', { width: 390, height: 844 }, 'light']]) {
      const page = await open(viewport);
      await page.emulateMedia({ colorScheme });
      for (const [path, wait] of Object.entries(ready)) {
        await page.goto(`${base}${path}`);
        await wait(page).waitFor({ timeout: 20000 });
        await page.screenshot({ path: `e2e/shots/sh-${path.slice(1)}-${look}.png`, fullPage: true });
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        must(wide <= 0, `${path} (${look}) scrolls sideways by ${wide}px`);
      }
      await page.context().close();
    }
  });
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --check e2e/rabbit-hole-check.mjs
```

Expected: Syntax OK, exit 0

- [ ] **Step 2: Build dist-dev and deploy only to this worktree's clone (settings-deploy's verified command). Env vars are set before the build, the key is never printed, and a bare wrangler deploy is never run.**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && export VITE_COACHING_DEV=true VITE_BYOC_DEV=true && VITE_TLDRAW_LICENSE_KEY=$(node --input-type=module -e "import {readFileSync} from 'node:fs'; import {parseEnv} from 'node:util'; const key = parseEnv(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8')).TLDRAW_LICENSE_KEY; if (!key) throw new Error('Missing TLDRAW_LICENSE_KEY'); process.stdout.write(key);") && export VITE_TLDRAW_LICENSE_KEY && npm run build -- --outDir dist-dev; built=$?; unset VITE_COACHING_DEV VITE_BYOC_DEV VITE_TLDRAW_LICENSE_KEY; [ $built -eq 0 ] && npx wrangler deploy --config wrangler.dev.jsonc --name small-cp-dev-smart-home
```

Expected: Vite reports 'built in'. Wrangler uploads small-cp-dev-smart-home, then prints its URL and a Current Version ID; record the ID for rollback. Live small-cp and the shared small-cp-dev are untouched.

- [ ] **Step 3: Verify the loaded build, then run the build check and every shell-home check**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && grep -o '/static/index-[A-Za-z0-9_-]*[.]js' dist-dev/index.html && curl -s -A small-rabbit-hole-check https://small-cp-dev-smart-home.zeroshothq.workers.dev/library | grep -o '/static/index-[A-Za-z0-9_-]*[.]js' && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=build,sh- node e2e/rabbit-hole-check.mjs
```

Expected: The two grep lines are identical. A mismatch means rollout lag: wait about 20 s and rerun. The /library curl also proves the dev worker serves the new path. The harness prints 'ok:' for build, sh-title, sh-routes, sh-home, sh-explore, sh-library (x2), sh-sidebar and sh-shots, then 'all checks passed'. A FAIL from shDrop names a rabbit-hole-check canvas to delete by hand with DELETE /api/apps/<name>.

- [ ] **Step 4: Inspect the pixels and return the link**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && ls e2e/shots/sh-*.png
```

Expected: Nine PNGs: apps, library and explore in light, dark and narrow. Open each with the Read tool and confirm the following. Home has exactly one primary Start and no marketing copy. Continue reads Last explored and Next. Recent cards differ by kind. The Library chips wrap at 390px. The Explore banner is visible. Dark mode has no white slabs; if bg-white cards show as white in dark mode, fix them before handing off. Then open https://small-cp-dev-smart-home.zeroshothq.workers.dev/apps from a clean browser state. Return that link, together with /library and /explore, for review. Do not click Run, Stop or Share on real apps, because the clone binds the live D1 (wrangler.dev.jsonc:69-72).

- [ ] **Step 5: Commit the screenshot check**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git commit --only packages/web/e2e/rabbit-hole-check.mjs -m 'test(web): shell-home screenshots in light, dark and 390px with a no-sideways-scroll check'
```

Expected: One commit with 1 file

---

### Task 39: Agent Bar frame: one bar in Root that follows the sidebar and pads pages; per-scope drafts with the retarget offer and chip ×; per-scope placeholder; frozen-scope ask via askBody with Stop and Retry, refused in workspace and app scope while askLiveOnPreview is false; ResultList with History and New chat; toasts bottom-right

*Area:* Agent Bar UI · *Brief:* T05 · *Order:* 10.2

**Files:**
- `packages/web/src/agent/ResultSheet.jsx`
- `packages/web/src/agent/AgentBar.jsx`
- `packages/web/src/main.jsx`
- `packages/web/src/Shell.jsx`
- `packages/web/src/index.css`
- `packages/web/src/ui.jsx`
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: Orders 7.8 (bar.js) and 8.5 (StartHost const and mount, Shell imports). agent/ask-stream.js askBody and streamAsk: onEvent(type, data) gets chunk, progress, graph, proposal, papers, paper, wiki, video, outline, done and error, plus choose for a JSON {choose} reply; an abort rejects with AbortError; a network failure rejects with TypeError (agent-core 3.4). agent/catalog.js titleOf and kindLabel (agent-core 3.2). agent/surface.js fields barHidden, resultsHost, handlers.onGraph, catalog, orgName and resource.status. Root's baseline from routes.js baseSurfaceFor on every path change, with barHidden true for learn, every canvas route, chat and run (shell-home 1; ratified in CONTRACT v3). Home and Library render a <main> as a direct child of Shell (shell-home 9.x). The harness helpers (settings-deploy 0.5).
- Produces: default AgentBar() mounted once in Root (dev). ResultSheet.jsx default export plus ResultList({ scopeKey }) - the prop takes a results key, resultsKey(scopeOf(surface)) - and a re-export of subscribeTurns, for project-map's Context panel (order 11.2). CSS variables --agent-bar-h and --sidebar-w. The 'bar:' checks.

- [ ] **Step 1: Failing e2e first: insert the bar block above the harness marker and run it against the clone from order 8.5**

```jsx
// packages/web/e2e/rabbit-hole-check.mjs: insert this block directly ABOVE the marker line
//   // ── journey checks: each area inserts its block above this line, wrapped in { } ──
// (the one harness, settings-deploy order 0.5). It reuses the harness's top-level base, UA, session, apps,
// repo, plain, wsLabel, check, must, open, loaded, spa, settings, startDialog, barOf and barInput; it declares
// nothing at top level and never closes the browser.
{
  // ── agent-ui (T02 §6): the Agent Bar frame. Nothing here reaches /api/ask: a workspace
  // or app ask would write live chat history. Project asks are the 'bar-page:' checks. ──
  const { askLiveOnPreview } = await import('../src/flags.js');
  const barOpen = async (path = '/apps', viewport) => {
    const page = await open(viewport);
    await page.goto(`${base}${path}`);
    await barOf(page).waitFor({ timeout: 20000 });
    return page;
  };
  const barH = (page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--agent-bar-h').trim());

  await check('bar: one bar on Home, no chip, workspace placeholder, its height padding the page, following the sidebar', async () => {
    const page = await barOpen();
    const bar = barOf(page);
    must(await page.locator('[data-agent-bar]').count() === 1, 'more than one bar');
    must(await page.locator('[data-scope-chip]').count() === 0, 'a chip on Home');
    must(await barInput(page).getAttribute('placeholder') === 'Start, open, ask, or paste a link…', 'not the workspace placeholder');
    const { x, height } = await bar.boundingBox();
    const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-shell-sidebar] ~ main')).paddingBottom));
    must(Math.abs(parseFloat(await barH(page)) - height) < 1 && Math.abs(pad - height) < 1, `bar ${height}, --agent-bar-h ${await barH(page)}, main padding ${pad}`);
    must(Math.abs(x - (await page.locator('[data-shell-sidebar]').boundingBox()).width) < 2, 'not aligned with the sidebar');
    await page.keyboard.press('Control+Backslash');
    await page.waitForTimeout(400);
    must((await bar.boundingBox()).x < 2, 'did not follow the sidebar collapse');
    await page.keyboard.press('Control+Backslash');
    await page.context().close();
  });

  await check('bar: Ctrl+J focuses the bar', async () => {
    const page = await barOpen('/library');
    await page.keyboard.press('Control+j');
    must(await barInput(page).evaluate((el) => el === document.activeElement), 'the input is not focused');
    await page.context().close();
  });

  await check('bar: info and error toasts sit bottom-right, above the bar', async () => {
    const page = await barOpen();
    const top = (await barOf(page).boundingBox()).y;
    const width = page.viewportSize().width;
    await page.evaluate(() => {
      dispatchEvent(new CustomEvent('small:toast', { detail: { message: 'agent-ui info toast' } }));
      dispatchEvent(new CustomEvent('small:toast', { detail: { message: 'agent-ui error toast', tone: 'error' } }));
    });
    for (const [label, locator] of [['info', page.getByText('agent-ui info toast')], ['error', page.locator('[data-toast-error]')]]) {
      const box = await locator.boundingBox();
      must(box.y + box.height <= top, `${label} toast overlaps the bar`);
      must(width - (box.x + box.width) < 40, `${label} toast is not bottom-right`);
    }
    await page.context().close();
  });

  await check('bar: hidden on /chat, Learn, a canvas and a run subpage (T02 §6.1); back on /members', async () => {
    const page = await barOpen();
    const hides = [['/chat', '/chat'], ['a canvas', '/apps/canvas-00000000'], ...(repo ? [['project Learn', `/apps/${repo.name}?tab=learn`]] : []), ...(plain ? [['a run subpage', `/apps/${plain.name}/runs/r-check`]] : [])];
    for (const [label, to] of hides) {
      await spa(page, to);
      await barOf(page).waitFor({ state: 'detached', timeout: 10000 });
      must(await barH(page) === '0px', `--agent-bar-h is ${await barH(page)} on ${label}`);
    }
    await spa(page, '/members');
    await barOf(page).waitFor({ timeout: 10000 });
    await page.context().close();
  });

  if (!askLiveOnPreview) await check('bar: a workspace ask is off on this preview: the reason shows, the draft stays, nothing reaches /api/ask', async () => {
    const page = await barOpen('/library');
    let asks = 0;
    page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/ask') asks++; });
    await barInput(page).fill('what does this workspace run?');
    await barInput(page).press('Enter');
    await page.locator('[data-result-sheet]').getByText('Asking about the workspace or apps is off on this preview: it would write to live chat history.').waitFor({ timeout: 10000 });
    must(await barInput(page).inputValue() === 'what does this workspace run?', 'the draft was cleared');
    must(asks === 0, `${asks} requests to /api/ask`);
    await page.context().close();
  });

  await check('bar: a workspace switch warns while a draft waits', async () => {
    const page = await barOpen();
    await barInput(page).click();
    await barInput(page).fill('unsent question');
    const dialog = page.waitForEvent('dialog', { timeout: 5000 });
    page.evaluate(() => location.assign('/apps')).catch(() => {});
    const d = await dialog;
    must(d.type() === 'beforeunload', `dialog ${d.type()}`);
    await d.dismiss();
    await page.context().close();
  });

  await check('bar: screenshots for pixel review (light, dark, narrow)', async () => {
    for (const [name, viewport, scheme] of [['light', undefined, 'light'], ['dark', undefined, 'dark'], ['narrow', { width: 390, height: 844 }, 'light']]) {
      const page = await open(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`${base}/apps`);
      await barOf(page).waitFor({ timeout: 20000 });
      await page.screenshot({ path: `e2e/shots/agent-bar-${name}.png` });
      await page.context().close();
    }
  });
}
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=bar node e2e/rabbit-hole-check.mjs
```

Expected: Every 'bar:' check prints FAIL with a timeout waiting for locator('[data-agent-bar]'), then 'N FAILURES' and exit 1. No bar exists yet, so nothing is sent.

- [ ] **Step 2: ResultSheet.jsx: the sheet, and ResultList with History and New chat, keyed by resultsKey**

```jsx
// packages/web/src/agent/ResultSheet.jsx
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { History, Loader2, Minus, Network, Plus } from 'lucide-react';
import { ago, api, wsName } from '../api.js';
import { Md } from '../ask.jsx';
import { Button, cn, IconBtn, Pill } from '../ui.jsx';
import { getTurns, labelOf, resetThread, resultsKey, setTurns, subscribeTurns, threadIds, threadsPath } from './bar.js';
import { scopeOf } from './scope.js';
import { useSurface } from './surface.js';

// The Context panel (Map, app Graph tab) brings Results forward on a new turn:
// subscribeTurns(({ key, pushed }) => ...), key being a results key.
export { subscribeTurns } from './bar.js';

const useTurns = (key) => useSyncExternalStore(subscribeTurns, () => getTurns(key));
// Same header controls as AskPanel (ask.jsx:566-576).
const tool = 'flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink disabled:cursor-default disabled:opacity-50';
const pill = 'max-w-full cursor-pointer truncate rounded-full border border-line px-2.5 py-1 text-left text-sm hover:bg-hover';

function Turn({ t }) {
  if (t.kind === 'user') return <div className="flex justify-end"><div className="max-w-[85%] rounded-lg bg-hover px-3 py-1.5 text-sm">{t.text}</div></div>;
  if (t.kind === 'note') return (
    <p role={t.error ? 'alert' : 'status'} className={cn('text-sm', t.error ? 'text-danger' : 'text-ink-2')}>
      {t.text}
      {t.open && <Button size="sm" variant="accent" className="ml-2" onClick={t.open}>Open</Button>}
      {t.undo && <Button size="sm" variant="accent" className="ml-1" onClick={t.undo}>Undo</Button>}
    </p>
  );
  if (t.kind === 'choose') return (
    <div>
      <div className="pb-1.5 text-sm text-ink-2">Which one do you mean?</div>
      <div className="flex flex-wrap gap-1.5">
        {t.options.map((o) => <button key={o.label} type="button" title={o.hint} onClick={o.run} className={pill}>{o.label}</button>)}
      </div>
    </div>
  );
  return (
    <div className="min-w-0">
      {t.text ? <Md text={t.text} /> : !t.done && <span className="flex items-center gap-2 text-xs text-ink-2"><Loader2 size={14} className="animate-spin text-ink-3" />{t.stage || 'Thinking…'}</span>}
      {t.sources?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-2">
          {t.sources.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              <a href={s.href} target="_blank" rel="noreferrer" className="no-underline"><Pill>{s.label}</Pill></a>
            </span>
          ))}
        </div>
      )}
      {t.showGraph && <Button size="sm" className="mt-2" onClick={t.showGraph}><Network size={13} />Show on graph</Button>}
      {t.stopped && <p className="pt-1 text-xs text-ink-3">Stopped.</p>}
      {t.error && (
        <div role="alert" className="mt-1 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
          <span className="min-w-0 flex-1 break-words">✗ {t.error}{t.retry && ' Your message is kept.'}</span>
          {t.retry && <Button size="sm" onClick={t.retry}>Retry</Button>}
        </div>
      )}
    </div>
  );
}

// One resource's results with History and New chat. They take over from AskPanel
// on Map and the app Graph tab (coaching.md: keep History and New Chat). The
// sheet renders it; those pages mount it in their Context panel instead
// (surface.resultsHost === 'panel'). The scopeKey prop takes a results key:
// resultsKey(scopeOf(surface)), selection excluded.
export function ResultList({ scopeKey: key }) {
  const turns = useTurns(key);
  const surface = useSurface();
  const live = scopeOf(surface);
  const scope = turns[0]?.scope || (resultsKey(live) === key ? live : null);
  const path = scope && threadsPath(scope);
  const busy = turns.some((t) => t.kind === 'answer' && !t.done);
  const [threads, setThreads] = useState(null);
  const [error, setError] = useState(null);
  const toggleHistory = () => {
    setError(null);
    if (threads) return setThreads(null);
    api(path).then((d) => setThreads(d.threads || [])).catch((e) => setError(e.message));
  };
  const openThread = async (id) => {
    try {
      const d = await api(threadsPath(scope, id));
      threadIds.set(key, d.id);
      const label = labelOf(scope, surface.orgName || wsName(scope.org));
      setTurns(key, d.messages.map((m, i) => ({ id: `${d.id}:${i}`, scope, label, done: true, kind: m.role === 'user' ? 'user' : 'answer', text: m.content })));
      setThreads(null);
    } catch (e) { setError(e.message); }
  };
  return (
    <div className="flex flex-col gap-2">
      {path && (
        <div className="flex items-center justify-end gap-1">
          <button type="button" disabled={busy} onClick={toggleHistory} className={cn(tool, threads && 'bg-active text-ink')}><History size={12} strokeWidth={1.5} />{threads ? 'Back to results' : 'History'}</button>
          <button type="button" disabled={busy} onClick={() => { resetThread(key); setThreads(null); }} className={tool}><Plus size={12} strokeWidth={1.5} />New chat</button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">✗ {error}</p>}
      {threads ? (threads.length ? threads.map((t) => (
        <button key={t.id} type="button" onClick={() => openThread(t.id)} className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-hover">
          <span className="min-w-0 flex-1 truncate">{t.title}</span>
          <span className="shrink-0 text-xs text-ink-3">{ago(t.created_at)}</span>
        </button>
      )) : <p className="text-sm text-ink-3">No past chats.</p>) : turns.map((t) => <Turn key={t.id} t={t} />)}
    </div>
  );
}

// §6.5: grows upward from the bar and resizes; collapsing leaves the latest
// result as one line in the bar.
export default function ResultSheet({ scope, label, onClose }) {
  const key = resultsKey(scope);
  const turns = useTurns(key);
  const [height, setHeight] = useState(320);
  const drag = useRef(null), box = useRef(null);
  const resize = (h) => setHeight(Math.max(160, Math.min(h, window.innerHeight * 0.7)));
  useEffect(() => { box.current.scrollTop = box.current.scrollHeight; }, [turns]);
  return (
    <div data-result-sheet style={{ height }} className="absolute right-0 bottom-full left-0 px-4">
      <div className="mx-auto flex h-full max-w-[780px] flex-col rounded-t-xl border border-b-0 border-line bg-white shadow-pop">
        <div role="separator" aria-label="Resize results" aria-orientation="horizontal" tabIndex={0} title="Drag to resize"
          className="h-1.5 shrink-0 cursor-row-resize touch-none rounded-t-xl hover:bg-line-strong/70 focus-visible:bg-line"
          onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { y: e.clientY, height }; }}
          onPointerMove={(e) => { if (drag.current) resize(drag.current.height + drag.current.y - e.clientY); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
          onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); resize(height + (e.key === 'ArrowUp' ? 24 : -24)); } }} />
        <div className="flex shrink-0 items-center gap-1 px-3 pb-1">
          <span className="mr-auto min-w-0 truncate text-xs text-ink-2">{label}</span>
          <IconBtn aria-label="Collapse results" title="Collapse (Esc)" onClick={onClose}><Minus size={14} /></IconBtn>
        </div>
        <div ref={box} className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-3"><ResultList scopeKey={key} /></div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: AgentBar.jsx: the frame; ask() refuses workspace and app scope while askLiveOnPreview is false**

```jsx
// packages/web/src/agent/AgentBar.jsx
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Loader2, X } from 'lucide-react';
import ChatComposer from '../ChatComposer.jsx';
import { wsName } from '../api.js';
import { Button } from '../ui.jsx';
import { askBody, streamAsk } from './ask-stream.js';
import { applyEvent, carry, follow, getLatest, getTurns, labelOf, lineOf, modeAvailability, offerFor, placeholderFor, pushTurn, resultsKey, subscribeTurns, threadIds, updateTurn, widen } from './bar.js';
import { kindLabel, titleOf } from './catalog.js';
import ResultSheet from './ResultSheet.jsx';
import { chipsFor, endpointFor, scopeKey, scopeOf } from './scope.js';
import { getSurface, useSurface } from './surface.js';

const nameOf = (scope) => labelOf(scope, getSurface().orgName || wsName(scope.org));
const add = (scope, entry) => {
  const id = crypto.randomUUID();
  pushTurn(resultsKey(scope), { id, scope, label: nameOf(scope), ...entry });
  return id;
};
// A choose pill reads '<title> · <Kind>' (Figma F6), as the router's options do.
const chooseLabel = (slug) => {
  const row = (getSurface().catalog || []).find((a) => a.name === slug);
  return `${row ? titleOf(row) : slug} · ${kindLabel(row?.kind)}`;
};

// T02 §6: one Agent Bar over every page, mounted once in Root (dev only), so a
// draft and an in-flight answer survive Shell remounts and navigation. Where it
// shows comes from surface.barHidden (routes.js baseSurfaceFor, then the page).
export default function AgentBar() {
  const surface = useSurface();
  const hidden = surface.barHidden;
  const root = useRef(null), inputRef = useRef(null), abort = useRef(null);

  // §6.2-6.3: × widens the page's scope for this visit. Drafts are kept per
  // scope key; a waiting draft keeps its scope until the user picks (follow).
  const [removed, setRemoved] = useState([]);
  useEffect(() => setRemoved([]), [surface.resource?.slug, surface.selected?.id]);
  const live = scopeOf(widen(surface, removed));
  const [drafts, setDrafts] = useState(() => new Map());
  const [held, setHeld] = useState(null);
  const target = follow(held, live, drafts);
  const targetKey = scopeKey(target);
  useEffect(() => setHeld(target), [targetKey]);
  const draft = drafts.get(targetKey) || '';
  const [kept, setKept] = useState(null); // the page scope the user chose not to switch to
  useEffect(() => setKept(null), [scopeKey(live)]);
  const offer = kept === scopeKey(live) ? null : offerFor(target, live);
  const switchTo = (scope, keep) => { setDrafts((d) => carry(d, target, scope, keep)); setHeld(scope); inputRef.current?.focus(); };
  const clearDraft = (scope, sent) => setDrafts((d) => (d.get(scopeKey(scope)) === sent ? new Map(d).set(scopeKey(scope), '') : d));
  const keepDraft = (scope, text) => setDrafts((d) => (d.get(scopeKey(scope))?.trim() ? d : new Map(d).set(scopeKey(scope), text)));
  const waiting = [...drafts.values()].some((text) => text.trim());

  const [streaming, setStreaming] = useState(null); // name of the one in-flight answer's scope
  const [sheet, setSheet] = useState(null); // the scope whose results are open
  const latest = useSyncExternalStore(subscribeTurns, getLatest);
  const here = useSyncExternalStore(subscribeTurns, () => getTurns(resultsKey(target)));
  const line = here[here.length - 1] || latest;

  // Pages pad their <main> by the bar's height (index.css); 0 while hidden.
  useEffect(() => {
    const set = (h) => document.documentElement.style.setProperty('--agent-bar-h', `${h}px`);
    if (hidden) { set(0); return; }
    const observer = new ResizeObserver(([entry]) => set(entry.borderBoxSize[0].blockSize));
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [hidden]);
  // Ctrl/Cmd+J (Shell.jsx:39-42). While hidden the ref is empty, so it does nothing.
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener('small:ask-focus', focus);
    return () => window.removeEventListener('small:ask-focus', focus);
  }, []);
  // Switching workspace reloads the page (Sidebar.jsx:805), which drops every draft.
  useEffect(() => {
    if (!waiting) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [waiting]);

  // Map and the app Graph tab show results in their Context panel (§6.5).
  const showResults = (scope) => {
    const page = getSurface();
    if (page.resultsHost !== 'panel' || resultsKey(scopeOf(page)) !== resultsKey(scope)) setSheet(scope);
  };

  // Scope is frozen at Send: the answer lands in that scope's list and thread
  // wherever the user goes meanwhile (§6.3, §6.5).
  async function ask(text, raw, scope, only = null) {
    // Workspace and app asks would write live chat history (bar.js modeAvailability): refuse, keep the draft.
    const can = modeAvailability('ask', scope.kind);
    if (!can.ok) { add(scope, { kind: 'note', text: can.reason, error: true }); return showResults(scope); }
    const key = resultsKey(scope);
    add(scope, { kind: 'user', text });
    const id = add(scope, { kind: 'answer', text: '' });
    clearDraft(scope, raw);
    showResults(scope);
    const controller = new AbortController();
    abort.current = controller;
    setStreaming(nameOf(scope));
    // a {choose} pick asks about one app: a fresh thread, never the workspace one
    const body = only ? { ...askBody({ scope, message: text }), scope: only } : askBody({ scope, message: text, threadId: threadIds.get(key) || null });
    let graph = null, failed = null;
    try {
      await streamAsk({
        path: endpointFor(scope).path,
        body,
        signal: controller.signal,
        onEvent: (type, data) => {
          if (type === 'done' && data.threadId && !only) threadIds.set(key, data.threadId);
          if (type === 'graph') graph = data;
          if (type === 'error') failed = data.error;
          if (type === 'choose') return updateTurn(key, id, (t) => ({ ...t, kind: 'choose', options: data.choose.map((c) => ({ label: chooseLabel(c.app), hint: c.hint, run: () => ask(text, raw, scope, { app: c.app }) })) }));
          updateTurn(key, id, (t) => applyEvent(t, type, data));
        },
      });
    } catch (e) {
      if (e.name === 'AbortError') updateTurn(key, id, (t) => ({ ...t, done: true, stopped: true }));
      else failed = e.name === 'TypeError' ? "Couldn't reach the server." : e.message;
    } finally {
      abort.current = null;
      setStreaming(null);
    }
    if (failed) {
      updateTurn(key, id, (t) => ({ ...t, done: true, error: failed, retry: () => ask(text, raw, scope, only) }));
      keepDraft(scope, raw); // Your message is kept (§13)
    }
    if (graph) {
      const show = () => { const page = getSurface(); if (resultsKey(scopeOf(page)) === key) page.handlers?.onGraph?.(graph); };
      updateTurn(key, id, (t) => ({ ...t, showGraph: show }));
      show();
    }
  }

  // Esc closes the sheet (§6.2). Stopped here, so Esc in the bar never also
  // closes a SlidePanel or the search modal (window listeners).
  const onKeyDown = (e) => {
    if (e.key === 'Escape' && sheet) { e.stopPropagation(); setSheet(null); }
  };

  if (hidden) return null;
  const chips = chipsFor(target);
  const own = scopeKey(target) === scopeKey(live); // × only while the draft is not held elsewhere
  const widenTo = (chip) => {
    const next = chip === 'resource' ? ['resource'] : [...removed, chip];
    switchTo(scopeOf(widen(surface, next)), false);
    setRemoved(next);
  };
  return (
    <div ref={root} data-agent-bar onKeyDown={onKeyDown}
      className="fixed right-0 bottom-0 left-0 z-20 border-t border-line bg-white px-4 pt-2 pb-3 transition-[left] duration-200 md:left-[var(--sidebar-w,0px)]">
      {sheet && <ResultSheet key={resultsKey(sheet)} scope={sheet} label={nameOf(sheet)} onClose={() => setSheet(null)} />}
      <div className="relative mx-auto max-w-[780px]">
        {streaming && (
          <div role="status" className="flex items-center gap-2 pb-1.5 text-xs text-ink-2">
            <Loader2 size={13} className="shrink-0 animate-spin" />
            <span className="min-w-0 flex-1 truncate">Answering in {streaming}…</span>
            <Button size="sm" onClick={() => abort.current?.abort()}>Stop</Button>
          </div>
        )}
        {!sheet && !streaming && line && (
          <button type="button" data-result-line onClick={() => setSheet(line.scope)} className="block w-full cursor-pointer truncate pb-1.5 text-left text-xs text-ink-2 hover:text-ink">{lineOf(line)}</button>
        )}
        {offer && (
          <div role="status" className="flex flex-wrap items-center gap-2 pb-1.5 text-xs text-ink-2">
            {offer === 'resource' && <span>you're now viewing {nameOf(live)}</span>}
            <Button size="sm" variant="soft" onClick={() => switchTo(live, offer === 'resource')}>
              {offer === 'selection' ? `Use selection: ${live.selected.label}?` : `Ask about ${nameOf(live)} instead`}
            </Button>
            <Button size="sm" onClick={() => setKept(scopeKey(live))}>Keep {nameOf(target)}</Button>
          </div>
        )}
        {/* ponytail: no [+] attachment in phase 1 (T02 §6.2; recorded in T02 by settings-deploy order 13.5). streamAsk takes a
            file (multipart, /api/ask only); add the button with the ask.jsx:822-834 rules when the bar owns attachments. */}
        {/* ponytail: Shift+Enter adds no new line - ChatComposer is a single-line <input> shared with the Learn dock
            (ChatComposer.jsx:8). Recorded T02 §6.2 deviation (settings-deploy order 13.5); needs a textarea ChatComposer. */}
        <ChatComposer value={draft}
          onChange={(value) => { setDrafts((d) => new Map(d).set(targetKey, value)); setHeld(target); }}
          onSubmit={(raw) => ask(raw, raw, target)} inputRef={inputRef} busy={!!streaming} maxLength={4000} placeholder={placeholderFor(target, surface)} />
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1.5">
            {chips.map((chip) => (
              <span key={chip.key} data-scope-chip={chip.key} className="inline-flex h-6 max-w-full items-center gap-1 rounded-full bg-hover pr-1 pl-2 text-xs text-ink">
                <span className="truncate">{chip.label}</span>
                {own && <button type="button" aria-label={`Remove ${chip.label}`} onClick={() => widenTo(chip.key)} className="shrink-0 cursor-pointer rounded-full p-0.5 text-ink-2 hover:bg-active hover:text-ink"><X size={11} /></button>}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire it in: Root mount, the Shell edge variable, page padding and toasts. Prove the live entry holds no bar code.**

```jsx
// packages/web/src/main.jsx - directly after the StartHost const (order 8.5):
// T02 §6.1: one Agent Bar over every page, for the same reason.
const AgentBar = learnPreview ? lazy(() => import('./agent/AgentBar.jsx')) : null;
// and in Root's return, directly after the StartHost mount line:
      {AgentBar && <Suspense fallback={null}><AgentBar /></Suspense>}

// packages/web/src/Shell.jsx - directly after the small:sidebar effect, i.e. after
//     return () => window.removeEventListener('small:sidebar', onSidebar);
//   }, []);
// (Shell.jsx:35-36 before this plan; the 8.5 identity effect sits above it) insert:
  // Rabbit Hole dev: the Agent Bar (Root) sits over the content column; publish its left edge.
  useEffect(() => {
    if (learnPreview) document.documentElement.style.setProperty('--sidebar-w', `${collapsed ? 0 : width}px`);
  }, [collapsed, width]);

/* packages/web/src/index.css - append after the last line (480 today; the working tree is CRLF, keep it) */
/* Agent Bar (dev, agent/AgentBar.jsx): every page's <main> ends above the fixed
   bar. The bar publishes --agent-bar-h (0 while hidden); the live build never
   sets it, and no page <main> has a bottom padding class, so this is 0 there. */
[data-shell-sidebar] ~ main {
  padding-bottom: var(--agent-bar-h, 0px);
}

// packages/web/src/ui.jsx - the toast region only.
// (a) The comment above toast() (today ui.jsx:208-210) becomes:
// ─── Toasts - bottom-right, dark, 3s. `toast('Copied')` from anywhere. ───
// A failure stays until dismissed, with a copy button: an error worth showing
// is an error worth pasting somewhere.
// (b) In Toasts(), replace from  return (  through its closing  );  (today ui.jsx:231-255) with:
  return (
    // Bottom-right, never bottom-left (user preference; feature/parallel-work b7cddc5
    // moves notes the same way). One stack, so a note never covers an error. In dev it
    // sits above the Agent Bar; --agent-bar-h is unset live, so this is bottom-4 there.
    <div className="fixed right-4 bottom-[calc(var(--agent-bar-h,0px)+1rem)] z-50 flex max-w-96 flex-col items-end gap-2">
        {errors.map((t) => (
          <div key={t.id} data-toast-error className="flex items-start gap-2 rounded-lg border border-red-600/30 bg-ink px-3 py-2.5 text-sm text-white shadow-pop animate-[toast-in_150ms_ease-out]">
            <TriangleAlert size={15} className="mt-0.5 shrink-0 text-red-400" />
            <span className="min-w-0 flex-1 break-words">{t.msg}</span>
            <button type="button" data-toast-copy title="Copy this message" aria-label="Copy this message"
              onClick={() => { navigator.clipboard.writeText(t.msg); toast('Copied'); }}
              className="shrink-0 rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"><CopyIcon size={14} /></button>
            <button type="button" data-toast-close title="Dismiss" aria-label="Dismiss"
              onClick={() => drop(t.id)}
              className="shrink-0 rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"><X size={14} /></button>
          </div>
        ))}
        {notes.map((t) => (
          <div key={t.id} className="rounded-md bg-ink px-3 py-2.5 text-sm text-white shadow-pop animate-[toast-in_150ms_ease-out]">
            {t.msg}
          </div>
        ))}
    </div>
  );
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && OUT="$(mktemp -d)" && env -u VITE_COACHING_DEV -u VITE_PRIVATE_BYOC -u VITE_BYOC_DEV npx vite build --outDir "$OUT" --emptyOutDir >/dev/null && ! grep -q 'data-agent-bar' "$OUT"/static/index-*.js && echo live-entry-clean
```

Expected: live-entry-clean. The live entry chunk contains no Agent Bar code, and the lazy chunk is never requested because learnPreview is false.

- [ ] **Step 5: STOP: confirm the user's (a)/(b) decision on live chat history before this first bar deploy**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && grep -n "export const askLiveOnPreview" src/flags.js
```

Expected: Prints 'export const askLiveOnPreview = false;' (shell-home order 1). Then ask the user and wait; do not run the next step without an answer. Ask: 'Before I deploy the Agent Bar to small-cp-dev-smart-home: workspace and app asks from the bar go to live small-cp /api/ask, which writes threads, messages and proposals to the live D1 (packages/control-plane/src/index.js:1194-1201). (a) Keep them off on the preview (askLiveOnPreview = false, the default): the bar shows "Asking about the workspace or apps is off on this preview: it would write to live chat history." and keeps the text; project and canvas asks (LEARN_DB) still work. (b) Turn them on, accepting live chat history writes from the preview.' On (a): continue. On (b): stop this task; shell-home, the single owner of flags.js and flags.test.mjs, flips askLiveOnPreview to true in its own commit; rerun this grep, then continue. The e2e never sends a workspace or app ask either way.

- [ ] **Step 6: Build, deploy to the clone, run the checks, inspect pixels, hand over the link**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && export VITE_COACHING_DEV=true VITE_BYOC_DEV=true && VITE_TLDRAW_LICENSE_KEY=$(node --input-type=module -e "import {readFileSync} from 'node:fs'; import {parseEnv} from 'node:util'; const key = parseEnv(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8')).TLDRAW_LICENSE_KEY; if (!key) throw new Error('Missing TLDRAW_LICENSE_KEY'); process.stdout.write(key);") && export VITE_TLDRAW_LICENSE_KEY && npm run build -- --outDir dist-dev; built=$?; unset VITE_COACHING_DEV VITE_BYOC_DEV VITE_TLDRAW_LICENSE_KEY; [ $built -eq 0 ] && npx wrangler deploy --config wrangler.dev.jsonc --name small-cp-dev-smart-home
# then:
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=build,start-host,bar node e2e/rabbit-hole-check.mjs
```

Expected: All 'ok: bar: ...' lines, then 'all checks passed'. With askLiveOnPreview false the guard check proves 0 requests to /api/ask; with (b) it is skipped. Nothing in this block reaches /api/ask, and no LLM call is made. Open e2e/shots/agent-bar-light.png, agent-bar-dark.png and agent-bar-narrow.png (gitignored, .gitignore:170) and check the pixels. Then open https://small-cp-dev-smart-home.zeroshothq.workers.dev/apps in a clean browser profile in both themes before handing the link over.

- [ ] **Step 7: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && P='packages/web/src/agent/ResultSheet.jsx packages/web/src/agent/AgentBar.jsx packages/web/src/main.jsx packages/web/src/Shell.jsx packages/web/src/index.css packages/web/src/ui.jsx packages/web/e2e/rabbit-hole-check.mjs' && git add $P && git commit --only $P -m 'feat(web): Agent Bar frame behind learnPreview - one bar in Root, per-scope drafts, frozen-scope asks with Stop, History, preview ask guard, toasts bottom-right'
```

Expected: make test-unit is green. One commit containing only these 7 paths.

---

### Task 40: Multiline Agent Bar input: Enter sends, Shift+Enter adds a line (T02 §6.2, Gate C G2); the Learn dock and chats keep the single-line input

*Area:* Agent Bar UI · *Brief:* T05 · *Order:* 10.25

**Files:**
- `packages/web/src/composer-keys.js`
- `packages/web/src/composer-keys.test.mjs`
- `packages/web/src/ChatComposer.jsx`
- `packages/web/src/agent/AgentBar.jsx`
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: AgentBar.jsx from order 10.2 (its ChatComposer element); the harness base (order 0.5) with open, loaded, must, barOf and barInput.
- Produces: ChatComposer accepts an opt-in multiline prop (a textarea, Enter sends, Shift+Enter adds a line); callers that omit it render the exact single-line input they had. composerKey({ key, shiftKey, isComposing, keyCode }) returns send, newline or none. The harness barInput matches the input or the textarea.

- [ ] **Step 1: Write the failing unit test: packages/web/src/composer-keys.test.mjs**

```jsx
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composerKey } from './composer-keys.js';

test('Enter sends and Shift+Enter adds a line (T02 §6.2)', () => {
  assert.equal(composerKey({ key: 'Enter', shiftKey: false }), 'send');
  assert.equal(composerKey({ key: 'Enter', shiftKey: true }), 'newline');
});

test('nothing fires while an input method is composing, or for other keys', () => {
  assert.equal(composerKey({ key: 'Enter', shiftKey: false, isComposing: true }), 'none');
  assert.equal(composerKey({ key: 'Enter', shiftKey: false, keyCode: 229 }), 'none'); // Safari IME
  assert.equal(composerKey({ key: 'a', shiftKey: false }), 'none');
});
```

- [ ] **Step 2: Run it and see it fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && npm run test:unit
```

Expected: FAIL: Cannot find module composer-keys.js.

- [ ] **Step 3: Create packages/web/src/composer-keys.js and run the tests**

```jsx
// The Agent Bar's multiline keys (T02 §6.2): Enter sends, Shift+Enter adds a line, and nothing
// fires while an IME is composing (keyCode 229 covers Safari, which reports isComposing late).
export function composerKey({ key, shiftKey, isComposing, keyCode }) {
  if (key !== 'Enter' || isComposing || keyCode === 229) return 'none';
  return shiftKey ? 'newline' : 'send';
}
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && npm run test:unit
```

Expected: PASS.

- [ ] **Step 4: Widen the harness locator and add the failing e2e check (insert above the marker line)**

```jsx
// a) harness base, replace
const barInput = (page) => barOf(page).locator('[data-chat-composer] input');
// with
const barInput = (page) => barOf(page).locator('[data-chat-composer] :is(input, textarea)');

// b) insert above the marker line
{
  await check('bar-multiline: Shift+Enter adds a line and Enter sends the whole message (T02 §6.2)', async () => {
    const page = await open();
    await loaded(page);
    const input = barInput(page);
    await input.click();
    await page.keyboard.type('first line');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('second line');
    const value = await input.inputValue();
    must(value === 'first line\nsecond line', `value was ${JSON.stringify(value)}`);
    await page.keyboard.press('Enter');
    // On Home the preview refuses workspace asks (G1), which proves the send happened.
    await page.getByText('Asking about the workspace or apps is off on this preview', { exact: false }).first().waitFor({ timeout: 10000 });
    await page.context().close();
  });
}
```

- [ ] **Step 5: Run it against the clone and see it fail**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=bar-multiline node e2e/rabbit-hole-check.mjs
```

Expected: FAIL on bar-multiline: the single-line input submits on Shift+Enter, so the value is not two lines.

- [ ] **Step 6: Give ChatComposer the opt-in multiline textarea, and pass it from the Agent Bar**

```jsx
// ===== packages/web/src/ChatComposer.jsx (whole file) =====
import { ArrowUp, Loader2 } from 'lucide-react';
import { composerKey } from './composer-keys.js';

// Every agent uses the same input, focus treatment, send control and sizing.
// Optional controls belong in slots; they must not replace the composer itself.
// multiline (the Agent Bar only) swaps the input for a textarea: Enter sends, Shift+Enter adds a
// line. Every other caller omits it and renders exactly the single-line input it had before.
export default function ChatComposer({ value, onChange, onSubmit, inputRef, autoFocus, placeholder, busy, disabled, maxLength, leading, trailing, multiline }) {
  const submit = () => { if (!busy && !disabled && value.trim()) onSubmit(value); };
  // ponytail: [field-sizing:content] grows the textarea in Chromium; other engines keep one row and scroll. Add a JS auto-grow if reviewers on Safari or Firefox need it.
  const field = multiline
    ? <textarea ref={inputRef} autoFocus={autoFocus} rows={1} value={value} onChange={event => onChange(event.target.value)} onKeyDown={event => { if (composerKey(event.nativeEvent) === 'send') { event.preventDefault(); submit(); } }} placeholder={placeholder} maxLength={maxLength} disabled={disabled} className="max-h-36 min-h-7 min-w-0 flex-1 resize-none bg-transparent py-1 text-sm leading-5 outline-none [field-sizing:content] placeholder:text-ink-3" />
    : <input ref={inputRef} autoFocus={autoFocus} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} disabled={disabled} className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3" />;
  return <form data-chat-composer className={`flex ${multiline ? 'items-end' : 'items-center'} gap-2 rounded-lg border border-line px-2.5 py-1.5 focus-within:border-line-strong focus-within:shadow-[0_0_0_2px_rgba(35,131,226,0.2)]`} onSubmit={event => { event.preventDefault(); submit(); }}>
    {leading}
    {field}
    {trailing}
    <button type="submit" aria-label="Send" disabled={busy || disabled || !value.trim()} className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent text-white disabled:opacity-30">
      {busy ? <Loader2 size={13} className="animate-spin" /> : <ArrowUp size={13} strokeWidth={2} />}
    </button>
  </form>;
}

// ===== packages/web/src/agent/AgentBar.jsx: replace =====
        {/* ponytail: Shift+Enter adds no new line - ChatComposer is a single-line <input> shared with the Learn dock
            (ChatComposer.jsx:8). Recorded T02 §6.2 deviation (settings-deploy order 13.5); needs a textarea ChatComposer. */}
        <ChatComposer value={draft}
// with
        <ChatComposer multiline value={draft}
```

- [ ] **Step 7: Unit tests, deploy, and run every bar label green**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && key=$(node --input-type=module -e "import {readFileSync} from 'node:fs'; import {parseEnv} from 'node:util'; const key = parseEnv(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8')).TLDRAW_LICENSE_KEY; if (!key) throw new Error('Missing TLDRAW_LICENSE_KEY'); process.stdout.write(key);") && VITE_COACHING_DEV=true VITE_BYOC_DEV=true VITE_TLDRAW_LICENSE_KEY="$key" npm run build -- --outDir dist-dev && npx wrangler deploy --config wrangler.dev.jsonc --name small-cp-dev-smart-home && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=build,bar node e2e/rabbit-hole-check.mjs
```

Expected: ok for build, bar-multiline and every earlier bar label (the widened locator keeps them working). The Learn dock and the chat panel still render the single-line input.

- [ ] **Step 8: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && P='packages/web/src/composer-keys.js packages/web/src/composer-keys.test.mjs packages/web/src/ChatComposer.jsx packages/web/src/agent/AgentBar.jsx packages/web/e2e/rabbit-hole-check.mjs' && git add $P && git commit --only $P -m 'feat(web): the Agent Bar takes multiline input - Enter sends, Shift+Enter adds a line'
```

Expected: The commit contains exactly these five paths.

---

### Task 41: Route every send: rules, then prepareCommand/executeCommand with ctxOf(surface, { scope }). Render Result message, notice, results as <title> · <Kind>, Undo and new thread. Confirm cards with D7 Blocked, 409 mapping and Cancel to reject. Ask proposals as cards. Mode picker and pill. /teach and research through learnAction, which navigates and words the outcome.

*Area:* Agent Bar UI · *Brief:* T05 · *Order:* 10.3

**Files:**
- `packages/web/src/agent/ResultSheet.jsx`
- `packages/web/src/agent/AgentBar.jsx`
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: Order 10.2 and ConfirmCard (7.8). agent/router.js route(text, { mode, catalog, scope }) -> mode | command | choose ({ options: [{ label: '<title> · <Kind>', name, args }] }) | ask (agent-core 3.3). agent/commands.js COMMANDS (undo?(result, ctx)), ctxOf(surface, overrides?), prepareCommand(name, args, ctx) -> { args, card, policy: { risk, blocked, reason } }, executeCommand(name, args, ctx) -> Result; search_resources results carry detail = kindLabel(kind); create_canvas { open:false } returns { message: 'Canvas created · <title>', href: '/apps/<slug>', undoable: true, data } (agent-core 4). agent/learn-hook.js learnAction(kind, payload, ctx), which opens Learn itself and returns { status, message } with every line worded, and ADDING (agent-core 3.5). flags.js learnHandoff. connections.js openedNotice (settings-deploy 2.4, via open_settings). Settings listening for 'small:settings' (settings-deploy 9.8, before this task). The canvases backend on the dev worker (backend-canvas 6.x) for the create/Undo check.
- Produces: The complete Agent Bar of T02 §6-§7.3 on the dev build. The 'bar-cmd:' checks.

- [ ] **Step 1: Tests first. The logic this task wires is pinned by order 7.8 (cardView, rejectBody, resultsView, MODES, modeQuery, modeAvailability, learnOutcome, lineOf) and agent-core's router and commands tests; run them. Then insert the command checks and run them against the 10.2 build.**

```jsx
// packages/web/e2e/rabbit-hole-check.mjs: insert this block directly ABOVE the marker line
//   // ── journey checks: each area inserts its block above this line, wrapped in { } ──
// (the one harness, settings-deploy order 0.5). It reuses the harness's top-level base, UA, session, apps,
// repo, plain, wsLabel, check, must, open, loaded, spa, settings, startDialog, barOf and barInput; it declares
// nothing at top level and never closes the browser.
{
  // ── agent-ui (T02 §6.4-§7.3): commands, cards and modes from the bar, all on /library.
  // Every send is a command or a refused workspace ask; none reaches /api/ask. ──
  const { askLiveOnPreview } = await import('../src/flags.js');
  const { openedNotice } = await import('../src/connections.js');
  const editable = apps.find((a) => ['server', 'job'].includes(a.kind) && a.canEdit);
  const barOpen = async (path = '/library') => {
    const page = await open();
    await page.goto(`${base}${path}`);
    await barOf(page).waitFor({ timeout: 20000 });
    return page;
  };

  await check('bar-cmd: find with no match shows the empty state with Ask instead, and clears the draft', async () => {
    const page = await barOpen();
    await barInput(page).fill('find zz-no-such-thing-agent-ui');
    await barInput(page).press('Enter');
    await page.locator('[data-result-sheet]').getByRole('button', { name: 'Ask instead' }).waitFor({ timeout: 10000 });
    must(await barInput(page).inputValue() === '', 'the draft stayed after a finished command');
    await page.context().close();
  });

  if (repo) await check('bar-cmd: open <project> navigates through open_resource', async () => {
    const page = await barOpen();
    await barInput(page).fill(`open ${repo.name}`);
    await barInput(page).press('Enter');
    await page.waitForURL(`**/apps/${repo.name}`, { timeout: 10000 });
    await page.context().close();
  });

  await check('bar-cmd: connect Google Slides opens Settings, says it is planned and connects nothing (T02 §11)', async () => {
    const page = await barOpen();
    await barInput(page).fill('connect google slides');
    await barInput(page).press('Enter');
    await settings(page).waitFor({ timeout: 10000 });
    await barOf(page).getByText(openedNotice('connections', 'google-slides')).waitFor({ timeout: 10000 });
    await page.context().close();
  });

  if (editable) await check('bar-cmd: share is a Blocked card on this preview (D7) that names the workspace, and Cancel stays local', async () => {
    const page = await barOpen();
    let calls = 0;
    page.on('request', (r) => { if (/\/api\/ask\/(approve|reject)/.test(r.url())) calls++; });
    await barInput(page).fill(`share ${editable.name} with bar-check@example.com as view`);
    await barInput(page).press('Enter');
    const card = page.locator('[data-confirm-card="blocked"]');
    await card.waitFor({ timeout: 10000 });
    await card.getByText('Blocked on this preview: it would change live apps.').waitFor();
    await card.getByText(wsLabel, { exact: true }).waitFor();
    for (const row of ['Target', 'Operation', 'Effect']) await card.getByText(row, { exact: true }).waitFor();
    must(await card.getByRole('button', { name: 'Confirm' }).isDisabled(), 'Confirm is enabled');
    await page.screenshot({ path: 'e2e/shots/agent-bar-blocked-card.png' });
    await card.getByRole('button', { name: 'Cancel' }).click();
    await page.locator('[data-confirm-card="cancelled"]').waitFor({ timeout: 3000 });
    must(calls === 0, `${calls} approve or reject calls from a Blocked card`);
    await page.context().close();
  });

  await check('bar-cmd: a GitHub URL resolves its branch into a Confirm card that is not Blocked (T02 §16); Cancel sends nothing', async () => {
    const page = await barOpen();
    let posts = 0;
    page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/(repositories|ask\/reject)(\?|$)/.test(new URL(r.url()).pathname)) posts++; });
    await barInput(page).fill('https://github.com/karpathy/nanoGPT');
    await barInput(page).press('Enter');
    const card = page.locator('[data-confirm-card="pending"]');
    await card.waitFor({ timeout: 20000 });
    must(!(await card.getByRole('button', { name: 'Confirm' }).isDisabled()), 'connect_repository is blocked');
    await card.getByText('branch', { exact: false }).first().waitFor();
    await card.getByRole('button', { name: 'Cancel' }).click();
    await page.locator('[data-confirm-card="cancelled"]').waitFor({ timeout: 3000 });
    must(posts === 0, `${posts} POSTs from a cancelled connect card`);
    await page.context().close();
  });

  await check('bar-cmd: new canvas stays on the page with Canvas created · Undo, and Undo removes it (T02 §8.4)', async () => {
    const page = await barOpen();
    const title = `agent-ui check ${Date.now()}`;
    const sheet = page.locator('[data-result-sheet]');
    await barInput(page).fill(`new canvas called ${title}`);
    await barInput(page).press('Enter');
    await sheet.getByText(`Canvas created · ${title}`).waitFor({ timeout: 15000 });
    must(new URL(page.url()).pathname === '/library', 'the bar navigated away');
    await sheet.getByRole('button', { name: 'Undo' }).click();
    await sheet.getByText(`Canvas created · ${title} · Undone`).waitFor({ timeout: 15000 });
    const { apps: after } = await (await fetch(`${base}/api/apps`, { headers: { ...UA, Cookie: `small_session=${session}` } })).json();
    must(!after.some((a) => a.kind === 'canvas' && a.title === title), 'the canvas is still in the catalog');
    await page.context().close();
  });

  await check('bar-cmd: "/" opens exactly four modes, unavailable ones dimmed with their reason, Esc closes only the picker; /teach pill; Backspace returns to Auto', async () => {
    const page = await barOpen();
    const bar = barOf(page);
    await barInput(page).fill('/');
    const options = bar.getByRole('option');
    await options.first().waitFor({ timeout: 5000 });
    must(JSON.stringify(await options.locator('span:first-child').allTextContents()) === JSON.stringify(['/ask', '/teach', '/research', '/do']), 'not the four modes');
    const research = bar.getByRole('option', { name: /research/ });
    must(await research.getAttribute('aria-disabled') === 'true', 'research is not dimmed');
    await research.getByText('Research works inside a canvas.').waitFor();
    if (!askLiveOnPreview) await bar.getByRole('option', { name: /^\/ask/ }).getByText('Asking about the workspace or apps is off on this preview: it would write to live chat history.').waitFor();
    await barInput(page).press('Escape');
    must(await options.count() === 0, 'the picker is still open');
    must(await barInput(page).inputValue() === '/', 'Esc changed the draft');
    await barInput(page).fill('/te');
    await barInput(page).press('Enter');
    await bar.getByRole('button', { name: 'Back to Auto' }).waitFor({ timeout: 3000 });
    must(await barInput(page).inputValue() === '', 'the slash text stayed');
    await barInput(page).press('Backspace');
    await bar.getByRole('button', { name: 'Auto' }).waitFor({ timeout: 3000 });
    await page.context().close();
  });
}
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && npm run test:unit && grep -n "export const askLiveOnPreview = false;" src/flags.js && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=bar-cmd node e2e/rabbit-hole-check.mjs
```

Expected: ℹ fail 0, the askLiveOnPreview line, then every 'bar-cmd:' label FAILs (no card, no results, no picker: the 10.2 build sends everything to ask(), which refuses workspace scope locally with 'Asking about the workspace or apps is off on this preview: it would write to live chat history.'), 'N FAILURES', exit 1. Nothing reaches /api/ask. If the grep prints nothing (the user chose (b) at 10.2), skip this pre-run: on the 10.2 build these sends would be live workspace asks.

- [ ] **Step 2: ResultSheet.jsx: cards, results as <title> · <Kind> pills (Figma F6), and [Add to canvas] on sources**

```jsx
// ===== packages/web/src/agent/ResultSheet.jsx - edit 1 of 3. Replace exactly:
import { getTurns, labelOf, resetThread, resultsKey, setTurns, subscribeTurns, threadIds, threadsPath } from './bar.js';
// ----- with:
import { getTurns, labelOf, resetThread, resultsKey, resultsView, setTurns, subscribeTurns, threadIds, threadsPath } from './bar.js';
import ConfirmCard from './ConfirmCard.jsx';
// ===== packages/web/src/agent/ResultSheet.jsx - edit 2 of 3. Replace exactly:
function Turn({ t }) {
// ----- with:
// §6.6: none -> [Ask instead]; up to five -> pills; more -> a list. Each match reads
// '<title> · <Kind>' (Figma F6): detail is kindLabel(kind) for catalog results (commands.js).
function Results({ t }) {
  const view = resultsView(t.results);
  if (view === 'empty') return <p className="text-sm text-ink-2">No matches.<Button size="sm" variant="accent" className="ml-2" onClick={t.askInstead}>Ask instead</Button></p>;
  if (view === 'pills') return <div className="flex flex-wrap gap-1.5">{t.results.map((r) => <button key={r.slug} type="button" onClick={() => t.pick(r)} className={pill}>{r.title} · {r.detail}</button>)}</div>;
  return (
    <div className="flex flex-col">
      {t.results.map((r) => (
        <button key={r.slug} type="button" onClick={() => t.pick(r)} className="flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-hover">
          <span className="min-w-0 flex-1 truncate">{r.title}</span>
          <span className="shrink-0 text-xs text-ink-3">{r.detail}</span>
        </button>
      ))}
    </div>
  );
}

function Turn({ t }) {
  if (t.kind === 'card') return <ConfirmCard card={t.card} onConfirm={t.confirm} onChange={t.change} onCancel={t.cancel} />;
  if (t.kind === 'results') return <Results t={t} />;
// ===== packages/web/src/agent/ResultSheet.jsx - edit 3 of 3. Replace exactly:
              <a href={s.href} target="_blank" rel="noreferrer" className="no-underline"><Pill>{s.label}</Pill></a>
            </span>
// ----- with:
              <a href={s.href} target="_blank" rel="noreferrer" className="no-underline"><Pill>{s.label}</Pill></a>
              {t.addSource && <Button size="sm" variant="accent" onClick={() => t.addSource(s.ref)}>Add to canvas</Button>}
            </span>
```

- [ ] **Step 3: AgentBar.jsx: submit through route(), commands with the one ctx, Results, cards, proposals, the mode picker, /teach and research**

```jsx
// ===== packages/web/src/agent/AgentBar.jsx - edit 1 of 9. Replace exactly:
import { wsName } from '../api.js';
import { Button } from '../ui.jsx';
// ----- with:
import { api, navigate, wsName } from '../api.js';
import { learnHandoff } from '../flags.js';
import { Button, cn, toast } from '../ui.jsx';
// ===== packages/web/src/agent/AgentBar.jsx - edit 2 of 9. Replace exactly:
import { applyEvent, carry, follow, getLatest, getTurns, labelOf, lineOf, modeAvailability, offerFor, placeholderFor, pushTurn, resultsKey, subscribeTurns, threadIds, updateTurn, widen } from './bar.js';
import { kindLabel, titleOf } from './catalog.js';
import ResultSheet from './ResultSheet.jsx';
// ----- with:
import {
  applyEvent, carry, EXPIRY_MS, follow, getLatest, getTurns, labelOf, learnOutcome, lineOf, MODES, modeAvailability, modeQuery,
  offerFor, placeholderFor, pushTurn, rejectBody, resetThread, resultsKey, subscribeTurns, threadIds, updateTurn, widen,
} from './bar.js';
import { kindLabel, titleOf } from './catalog.js';
import { COMMANDS, ctxOf, executeCommand, prepareCommand } from './commands.js';
import { ADDING, learnAction } from './learn-hook.js';
import ResultSheet from './ResultSheet.jsx';
import { route } from './router.js';
// ===== packages/web/src/agent/AgentBar.jsx - edit 3 of 9. Replace exactly:
  // Pages pad their <main> by the bar's height (index.css); 0 while hidden.
// ----- with:
  // §6.2 mode: Auto unless picked; '/' at position 0 opens the picker.
  const [mode, setMode] = useState('auto');
  const [picker, setPicker] = useState(false);
  const [hi, setHi] = useState(0);
  const entries = MODES.filter(([m]) => m.startsWith(modeQuery(draft) || ''));
  const pickerOpen = picker && entries.length > 0;
  const hiIndex = Math.min(hi, entries.length - 1);
  const pick = (m) => {
    if (!modeAvailability(m, target.kind).ok) return;
    setMode(m); setPicker(false); setHi(0);
    if (modeQuery(draft) !== null) setDrafts((d) => new Map(d).set(targetKey, ''));
    inputRef.current?.focus();
  };

  // Pages pad their <main> by the bar's height (index.css); 0 while hidden.
// ===== packages/web/src/agent/AgentBar.jsx - edit 4 of 9. Replace exactly:
  // Scope is frozen at Send: the answer lands in that scope's list and thread
// ----- with:
  // §6.6: mode pill, then rules, then /ask. Scope is frozen here, before any await,
  // and every command gets the one ctx with that scope: ctxOf(surface, { scope }).
  async function submit(raw, pill = mode, text = raw) {
    const scope = target;
    const can = modeAvailability(pill, scope.kind);
    if (!can.ok) { add(scope, { kind: 'note', text: can.reason, error: true }); return showResults(scope); }
    const r = route(text, { mode: pill, catalog: getSurface().catalog || [], scope });
    if (r.type === 'mode') return submit(raw, r.mode, r.text);
    if (r.type === 'command') return runCommand(r.name, r.args, raw, scope);
    if (r.type === 'choose') {
      clearDraft(scope, raw);
      add(scope, { kind: 'choose', options: r.options.map((o) => ({ label: o.label, run: () => runCommand(o.name, o.args, raw, scope) })) });
      return showResults(scope);
    }
    return r.mode === 'teach' ? teach(r.text, raw, scope) : ask(r.text, raw, scope);
  }

  // §7: prepare (resolve, preview, policy), then a card for Confirm class, the
  // reason for a blocked command, or run it now and report its Result. The
  // command navigates itself; the bar never navigates after run().
  async function runCommand(name, args, raw, scope, keep = false) {
    const ctx = ctxOf(getSurface(), { scope });
    try {
      const ready = await prepareCommand(name, name === 'create_canvas' ? { ...args, open: false } : args, ctx);
      if (ready.card) {
        card(scope, { name, args: ready.args, model: ready.card, policy: ready.policy, change: raw });
        if (!keep) clearDraft(scope, raw);
        return null;
      }
      if (ready.policy.blocked) { add(scope, { kind: 'note', text: ready.policy.reason, error: true }); showResults(scope); return null; }
      const result = (await executeCommand(name, ready.args, ctx)) || {};
      if (!keep) clearDraft(scope, raw);
      report(scope, name, result, ctx, raw);
      return result;
    } catch (e) {
      add(scope, { kind: 'note', text: `✗ ${e.message}`, error: true }); // the draft stays (§13)
      showResults(scope);
      return null;
    }
  }

  // Result (commands.js): message or notice, a results list, Undo, a new thread.
  function report(scope, name, result, ctx, raw) {
    const key = resultsKey(scope);
    if (result.resetThread) resetThread(key);
    const text = result.message || result.notice;
    if (text) {
      const undo = COMMANDS[name]?.undo && result.undoable ? async () => {
        updateTurn(key, id, (n) => ({ ...n, undo: null }));
        try { await COMMANDS[name].undo(result, ctx); updateTurn(key, id, (n) => ({ ...n, text: `${n.text} · Undone`, open: null })); }
        catch (e) { updateTurn(key, id, (n) => ({ ...n, text: `✗ ${e.message}`, error: true })); }
      } : null;
      const id = add(scope, { kind: 'note', text, undo, open: result.href ? () => navigate(result.href) : null });
    }
    if (result.results) {
      add(scope, {
        kind: 'results',
        results: result.results,
        pick: (item) => runCommand('open_resource', { slug: item.slug, kind: item.kind, title: item.title }, '', scope, true),
        askInstead: () => ask(raw, raw, scope),
      });
    }
    if (text || result.results) showResults(scope);
  }

  // §7.3 card. Nothing runs until Confirm; D7 (policy.blocked) disables it.
  function card(scope, { name, args, model, policy, change, proposalId = null }) {
    const key = resultsKey(scope);
    const current = () => getTurns(key).find((t) => t.id === id).card;
    const set = (patch) => updateTurn(key, id, (t) => ({ ...t, card: { ...t.card, ...patch } }));
    const id = add(scope, {
      kind: 'card',
      card: { model, blocked: policy.blocked, reason: policy.reason, proposalId, createdAt: Date.now() },
      confirm: async () => {
        if (Date.now() - current().createdAt > EXPIRY_MS) return set({}); // re-renders as Expired
        set({ phase: 'executing', error: undefined });
        try { const result = await executeCommand(name, args, ctxOf(getSurface(), { scope })); set({ phase: 'done', href: result?.href }); }
        catch (error) { set({ phase: 'failed', error }); }
      },
      change: () => { setDrafts((d) => new Map(d).set(scopeKey(scope), change)); setHeld(scope); inputRef.current?.focus(); },
      cancel: async () => {
        const body = rejectBody(current());
        if (!body) return set({ phase: 'cancelled' });
        try { await api('/api/ask/reject', { method: 'POST', body: JSON.stringify(body) }); set({ phase: 'cancelled' }); }
        catch (error) { set({ phase: 'failed', error }); }
      },
    });
    showResults(scope);
  }

  // Ask tools come back as proposals (§6.4 /ask). Server data: an unknown tool is refused.
  async function proposal(scope, p, raw) {
    if (!COMMANDS[p.tool]) { add(scope, { kind: 'note', text: `✗ Unknown action proposed: ${p.tool}. Nothing ran.`, error: true }); return; }
    try {
      const ready = await prepareCommand(p.tool, { ...p.args, proposal_id: p.id }, ctxOf(getSurface(), { scope }));
      card(scope, { name: p.tool, args: ready.args, model: ready.card, policy: ready.policy, change: raw, proposalId: p.id });
    } catch (e) { add(scope, { kind: 'note', text: `✗ ${e.message}`, error: true }); }
  }

  // §9 research: a source goes onto the canvas only through the hook, which words
  // every outcome (the bar shows result.message, never its own success copy).
  const addSource = (scope, source) => {
    toast(ADDING);
    learnAction('research', { app: scope.slug, source }, ctxOf(getSurface(), { scope })).then((r) => {
      const outcome = learnOutcome(r);
      if (outcome.text) toast(outcome.text, outcome.tone ? { tone: outcome.tone } : {});
    });
  };

  // §6.4 /teach through the Learn hook (§9). From the workspace a canvas comes
  // first. learnAction opens Learn itself, so the bar never navigates after it;
  // the bar is hidden on Learn, so its message is a toast.
  async function teach(text, raw, scope) {
    try {
      let app = scope.slug;
      if (scope.kind === 'workspace') {
        const made = await runCommand('create_canvas', { title: text.replace(/\s+/g, ' ').slice(0, 80) }, raw, scope, true);
        if (!made?.href) return;
        app = made.href.slice('/apps/'.length);
      }
      const outcome = learnOutcome(await learnAction('teach', { app, prompt: text }, ctxOf(getSurface(), { scope })));
      if (outcome.done) clearDraft(scope, raw); // otherwise the prompt stays in this scope's draft
      if (outcome.text) toast(outcome.text, outcome.tone ? { tone: outcome.tone } : {});
    } catch (e) {
      toast(`✗ ${e.message}`, { tone: 'error' });
    }
  }

  // Scope is frozen at Send: the answer lands in that scope's list and thread
// ===== packages/web/src/agent/AgentBar.jsx - edit 5 of 9. Replace exactly:
    const id = add(scope, { kind: 'answer', text: '' });
// ----- with:
    const id = add(scope, { kind: 'answer', text: '', addSource: learnHandoff && scope.kind === 'canvas' ? (source) => addSource(scope, source) : null });
// ===== packages/web/src/agent/AgentBar.jsx - edit 6 of 9. Replace exactly:
          if (type === 'choose') return updateTurn(key, id, (t) => ({ ...t, kind: 'choose', options: data.choose.map((c) => ({ label: chooseLabel(c.app), hint: c.hint, run: () => ask(text, raw, scope, { app: c.app }) })) }));
// ----- with:
          if (type === 'proposal') return proposal(scope, data, raw);
          if (type === 'choose') return updateTurn(key, id, (t) => ({ ...t, kind: 'choose', options: data.choose.map((c) => ({ label: chooseLabel(c.app), hint: c.hint, run: () => ask(text, raw, scope, { app: c.app }) })) }));
// ===== packages/web/src/agent/AgentBar.jsx - edit 7 of 9. Replace exactly:
  // Esc closes the sheet (§6.2). Stopped here, so Esc in the bar never also
  // closes a SlidePanel or the search modal (window listeners).
  const onKeyDown = (e) => {
    if (e.key === 'Escape' && sheet) { e.stopPropagation(); setSheet(null); }
  };
// ----- with:
  // Esc closes the picker, then the sheet (§6.2). Stopped here, so Esc in the bar
  // never also closes a SlidePanel or the search modal (window listeners).
  const onKeyDown = (e) => {
    if (pickerOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setHi((hiIndex + (e.key === 'ArrowDown' ? 1 : entries.length - 1)) % entries.length); return; }
    if (pickerOpen && e.key === 'Enter') { e.preventDefault(); pick(entries[hiIndex][0]); return; }
    if (e.key === 'Escape' && (pickerOpen || sheet)) { e.stopPropagation(); if (pickerOpen) setPicker(false); else setSheet(null); return; }
    if (e.key === 'Backspace' && e.target === inputRef.current && !draft && mode !== 'auto') setMode('auto');
  };
// ===== packages/web/src/agent/AgentBar.jsx - edit 8 of 9. Replace exactly:
        {streaming && (
// ----- with:
        {pickerOpen && (
          <div role="listbox" aria-label="Modes" className="absolute bottom-full left-0 z-10 mb-1 w-[26rem] max-w-full rounded-md bg-white p-1 shadow-pop">
            {entries.map(([m, desc], i) => {
              const can = modeAvailability(m, target.kind);
              return (
                <div key={m} role="option" aria-selected={i === hiIndex} aria-disabled={!can.ok} onMouseDown={(e) => { e.preventDefault(); pick(m); }}
                  className={cn('flex items-center gap-3 rounded-sm px-2 py-1.5 text-sm', can.ok ? 'cursor-pointer' : 'cursor-default', i === hiIndex && 'bg-hover')}>
                  <span className={cn('w-20 shrink-0 font-medium', !can.ok && 'text-ink-3')}>/{m}</span>
                  <span className={cn('min-w-0 flex-1', can.ok ? 'text-ink-2' : 'text-ink-3')}>{can.ok ? desc : can.reason}{can.ok && can.reason ? ` · ${can.reason}` : ''}</span>
                  {m === 'research' && target.kind === 'project' && (
                    <Button size="sm" variant="soft" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setPicker(false); runCommand('create_canvas', { title: 'Untitled canvas', project: target.slug }, '', target, true); }}>New canvas for this project</Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {streaming && (
// ===== packages/web/src/agent/AgentBar.jsx - edit 9 of 9. Replace exactly:
        <ChatComposer value={draft}
          onChange={(value) => { setDrafts((d) => new Map(d).set(targetKey, value)); setHeld(target); }}
          onSubmit={(raw) => ask(raw, raw, target)} inputRef={inputRef} busy={!!streaming} maxLength={4000} placeholder={placeholderFor(target, surface)} />
// ----- with:
        <ChatComposer value={draft}
          onChange={(value) => { setDrafts((d) => new Map(d).set(targetKey, value)); setHeld(target); setPicker(mode === 'auto' && modeQuery(value) !== null); }}
          onSubmit={(raw) => submit(raw)} inputRef={inputRef} busy={!!streaming} maxLength={4000} placeholder={placeholderFor(target, surface)}
          leading={mode === 'auto'
            ? <button type="button" aria-haspopup="listbox" aria-expanded={pickerOpen} onMouseDown={(e) => { e.preventDefault(); setPicker(!picker); }} className="h-6 shrink-0 cursor-pointer rounded-full px-1.5 text-xs text-ink-2 hover:bg-hover hover:text-ink">Auto</button>
            : <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-hover pr-1 pl-2 text-xs text-ink">/{mode}<button type="button" aria-label="Back to Auto" onClick={() => setMode('auto')} className="cursor-pointer rounded-full p-0.5 text-ink-2 hover:bg-active hover:text-ink"><X size={11} /></button></span>} />
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && OUT="$(mktemp -d)" && env -u VITE_COACHING_DEV -u VITE_PRIVATE_BYOC -u VITE_BYOC_DEV npx vite build --outDir "$OUT" --emptyOutDir >/dev/null && ! grep -q 'data-agent-bar' "$OUT"/static/index-*.js && echo live-entry-clean
```

Expected: live-entry-clean. The 3 ResultSheet and 9 AgentBar edits each match exactly once and reproduce the final files (scratchpad/agentui3/apply.mjs); esbuild resolves every import of both versions against contract-named stubs.

- [ ] **Step 4: Deploy; run every bar check; inspect**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && export VITE_COACHING_DEV=true VITE_BYOC_DEV=true && VITE_TLDRAW_LICENSE_KEY=$(node --input-type=module -e "import {readFileSync} from 'node:fs'; import {parseEnv} from 'node:util'; const key = parseEnv(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8')).TLDRAW_LICENSE_KEY; if (!key) throw new Error('Missing TLDRAW_LICENSE_KEY'); process.stdout.write(key);") && export VITE_TLDRAW_LICENSE_KEY && npm run build -- --outDir dist-dev; built=$?; unset VITE_COACHING_DEV VITE_BYOC_DEV VITE_TLDRAW_LICENSE_KEY; [ $built -eq 0 ] && npx wrangler deploy --config wrangler.dev.jsonc --name small-cp-dev-smart-home
# then:
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=build,start-host,bar node e2e/rabbit-hole-check.mjs
```

Expected: 'all checks passed'. Settings opens on 'connect google slides' and the bar shows openedNotice('connections', 'google-slides'). The share card is data-confirm-card=blocked, with Confirm disabled, and makes 0 approve/reject calls. The GitHub card is pending (not Blocked) and makes 0 POSTs after Cancel. The canvas check creates one LEARN_DB canvas and removes it with Undo. No check reaches /api/ask. Inspect e2e/shots/agent-bar-blocked-card.png, and the clone link in a clean profile in both themes.

- [ ] **Step 5: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && P='packages/web/src/agent/ResultSheet.jsx packages/web/src/agent/AgentBar.jsx packages/web/e2e/rabbit-hole-check.mjs' && git add $P && git commit --only $P -m 'feat(web): Agent Bar routes sends through the command registry - results, Undo, Confirm cards with D7 Blocked and 409 mapping, proposals, modes, teach via learnAction'
```

Expected: make test-unit is green. One commit containing only these 3 paths.

---

### Task 42: Graph colours move to --graph-* tokens so the Map works in dark mode

*Area:* Project page, Map, Context panel, canvas route · *Brief:* T09 · *Order:* 11.1

**Files:**
- `packages/web/src/graph-tokens.test.mjs`
- `packages/web/src/index.css`
- `packages/web/src/RepositoryGraph.jsx`
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: Nothing new in src. e2e/rabbit-hole-check.mjs from settings-deploy order 0.5: the helpers apps, base, check, must and open, and the single marker line '// ── journey checks: each area inserts its block above this line, wrapped in { } ──'.
- Produces: The :root and .dark tokens --graph-bg, -grid, -edge, -edge-lit, -arrow, -label, -ring, -external and -1 to -6. The light values equal today's literals, so light pixels do not change. Also the pm/map block in the shared harness.

- [ ] **Step 1: Failing source-level test: create packages/web/src/graph-tokens.test.mjs**

```jsx
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Dark mode for the code graph (T02 §12): every colour comes from a --graph-* token that
// index.css defines for both themes. Source-level, like katex-css.test.mjs: no render, no flake.
const read = name => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');

test('the code graph paints only with --graph-* tokens', () => {
  const graph = read('RepositoryGraph.jsx');
  assert.doesNotMatch(graph, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(graph, /["']white["']/);
});

test('every --graph-* token the graph uses is defined for light and dark', () => {
  const graph = read('RepositoryGraph.jsx'), css = read('index.css');
  const used = new Set([...graph.matchAll(/var\((--graph-[a-z-]+)\)/g)].map(m => m[1]));
  for (let i = 1; i <= 6; i++) used.add(`--graph-${i}`); // the palette is built as var(--graph-${i})
  const light = css.match(/:root\s*\{[^}]*--graph-bg:[^}]*\}/)?.[0] || '', dark = css.match(/\.dark\s*\{[^}]*\}/)?.[0] || '';
  assert.ok(used.size >= 14, [...used].join(' '));
  for (const name of used) {
    assert.match(light, new RegExp(`${name}:`), `${name} missing in :root`);
    assert.match(dark, new RegExp(`${name}:`), `${name} missing in .dark`);
  }
});
```

Run:
```bash
cd packages/web && node --test src/graph-tokens.test.mjs
```

Expected: ℹ pass 0, ℹ fail 2 (run on scratch copies of today's RepositoryGraph.jsx and index.css)

- [ ] **Step 2: index.css: add the tokens to the :root --tok block (index.css:38-43) and to the .dark block (index.css:148-152). Anchor on content and apply with the Edit tool, because the working tree is CRLF.**

```jsx
// index.css:42-43 (:root)
// old
  --tok-n: #d9730d;
}
// new
  --tok-n: #d9730d;
  /* Code graph (RepositoryGraph.jsx); dark variants in .dark below. */
  --graph-bg: #fafbfc;
  --graph-grid: #d8dee5;
  --graph-edge: #aebcc9;
  --graph-edge-lit: #2383e2;
  --graph-arrow: #9ca3af;
  --graph-label: #334155;
  --graph-ring: #ffffff;
  --graph-external: #a1a7ae;
  --graph-1: #2383e2;
  --graph-2: #8b6bb1;
  --graph-3: #439b88;
  --graph-4: #c28a42;
  --graph-5: #bc718d;
  --graph-6: #638baf;
}

// index.css:152 (.dark)
// old
  --tok-n: #e8a15c;
// new
  --tok-n: #e8a15c;
  --graph-bg: #1f1f1f;
  --graph-grid: #333333;
  --graph-edge: #4f5b66;
  --graph-edge-lit: #5ba3f5;
  --graph-arrow: #7d8590;
  --graph-label: #d4d4d4;
  --graph-ring: #1f1f1f;
  --graph-external: #6f6f6f;
  --graph-1: #5ba3f5;
  --graph-2: #b79ae3;
  --graph-3: #5fc0a8;
  --graph-4: #e0a95e;
  --graph-5: #e08fb0;
  --graph-6: #8fb1d4;
```

- [ ] **Step 3: RepositoryGraph.jsx: replace each literal. SVG colours go through the style prop, which accepts var() just as code.jsx:5,13 passes var(--tok-*). Each old text matches exactly once (checked by script, and re-checked on 2026-09-23 HEAD 6a0f878).**

```css
// RepositoryGraph.jsx:13
// old
const palette=['#2383e2','#8b6bb1','#439b88','#c28a42','#bc718d','#638baf'];
// new
const palette=[1,2,3,4,5,6].map(i=>`var(--graph-${i})`); // index.css, light and dark

// RepositoryGraph.jsx:15
// old
colors.get(n.path)||'#a1a7ae'
// new
colors.get(n.path)||'var(--graph-external)'

// RepositoryGraph.jsx:84
// old
bg-[#fafbfc]
// new
bg-[var(--graph-bg)]

// RepositoryGraph.jsx:99
// old
radial-gradient(#d8dee5 0.65px, transparent 0.65px)
// new
radial-gradient(var(--graph-grid) 0.65px, transparent 0.65px)

// RepositoryGraph.jsx:126
// old
<path d="M0,0 L6,3 L0,6" fill="#9ca3af"/>
// new
<path d="M0,0 L6,3 L0,6" style={{fill:'var(--graph-arrow)'}}/>

// RepositoryGraph.jsx:131
// old
stroke={lit?'#2383e2':'#aebcc9'}
// new
style={{stroke:lit?'var(--graph-edge-lit)':'var(--graph-edge)'}}

// RepositoryGraph.jsx:138
// old
<circle data-node-dot r={radius} fill={color(n)} stroke="white" strokeWidth="2.5"/>
// new
<circle data-node-dot r={radius} style={{fill:color(n),stroke:'var(--graph-ring)'}} strokeWidth="2.5"/>

// RepositoryGraph.jsx:139
// old
<circle r={radius+5} fill="none" stroke={color(n)} strokeOpacity=".3"
// new
<circle r={radius+5} fill="none" style={{stroke:color(n)}} strokeOpacity=".3"

// RepositoryGraph.jsx:140
// old
fill="#334155" stroke="#fafbfc"
// new
style={{fill:'var(--graph-label)',stroke:'var(--graph-bg)'}}
```

Run:
```bash
cd packages/web && node --test src/graph-tokens.test.mjs
```

Expected: ℹ pass 2, ℹ fail 0 (verified on scratch copies; the edited RepositoryGraph.jsx compiles with esbuild)

- [ ] **Step 4: Add the pm/map block to the shared harness. It runs in the order 12.5 task. Insert it directly ABOVE the marker line; anchor on that line with the Edit tool, and it must match exactly once. The block declares nothing at top level and never closes the browser (the harness closes it once at the end).**

```css
// packages/web/e2e/rabbit-hole-check.mjs: insert directly above
// `// ── journey checks: each area inserts its block above this line, wrapped in { } ──`
// ── project-map (T04 area): the Map in dark mode (T02 §12) ──
{
  await check('pm/map: the code graph paints with the dark --graph-* tokens', async () => {
    const project = apps.find((a) => a.kind === 'repository' && a.commit_sha);
    must(project, 'needs a repository with a ready map in this workspace');
    const page = await open();
    await page.addInitScript(() => localStorage.setItem('small.theme', 'dark'));
    await page.goto(`${base}/apps/${project.name}?tab=map`);
    const graph = page.getByRole('img', { name: 'Repository dependency graph' });
    await graph.waitFor({ timeout: 30000 });
    const bg = await graph.evaluate((svg) => getComputedStyle(svg.parentElement).backgroundColor);
    must(bg === 'rgb(31, 31, 31)', `graph background ${bg}; want the dark --graph-bg #1f1f1f`);
    await page.screenshot({ path: 'e2e/shots/pm-map-dark.png' });
    await page.context().close();
  });
}
```

Run:
```bash
cd packages/web && node --check e2e/rabbit-hole-check.mjs && grep -c 'await browser.close();' e2e/rabbit-hole-check.mjs
```

Expected: node --check prints nothing. The grep prints 1: the harness still has exactly one close.

- [ ] **Step 5: Gate: dev build, live build and make test-unit**

Run:
```bash
cd packages/web && VITE_COACHING_DEV=true VITE_BYOC_DEV=true npm run build -- --outDir dist-dev && npm run build && cd ../.. && make test-unit
```

Expected: Both vite builds print 'built in …'. make test-unit exits 0 with web ℹ fail 0 (+2 tests). The live build never renders RepositoryGraph: it is reached only through SharePage.jsx:608, behind learnPreview. So live pixels do not change.

- [ ] **Step 6: Commit named paths only (single quotes, no co-author)**

Run:
```bash
git add packages/web/src/graph-tokens.test.mjs && git commit --only -m 'feat(web): code graph colours use --graph tokens with dark values' -- packages/web/src/graph-tokens.test.mjs packages/web/src/index.css packages/web/src/RepositoryGraph.jsx packages/web/e2e/rabbit-hole-check.mjs
```

Expected: 1 commit, 4 files; git status shows nothing else staged by this task

---

### Task 43: Context panel (Results, Selected, Source) replaces the Graph Agent input on Map and on the dev app Graph tab; the Coaching Chat tooltip follows

*Area:* Project page, Map, Context panel, canvas route · *Brief:* T09 · *Order:* 11.2

**Files:**
- `packages/web/src/resource-pages.js`
- `packages/web/src/resource-pages.test.mjs`
- `packages/web/src/ContextPanel.jsx`
- `packages/web/src/RepositoryPage.jsx`
- `packages/web/src/SharePage.jsx`
- `packages/web/src/coaching/CoachingPanel.jsx`
- `docs/features/coaching.md`
- `packages/web/e2e/coaching.preview.js`
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: agent-ui order 7.8: agent/bar.js resultsKey(scope) = 'org|kind:slug' (selection excluded; the bar stores turns under it), getTurns(key) and subscribeTurns(listener). agent-ui order 10.2: ResultList({ scopeKey }) from agent/ResultSheet.jsx; the prop takes a results key, resultsKey(scopeOf(surface)), and brings this scope's History and New chat; --agent-bar-h on :root. agent-core order 2: useSurface (agent/surface.js) and scopeOf (agent/scope.js). shell-home order 1: learnPreview from flags.js, already imported by SharePage.jsx (shell-home is the only owner of that import and of the removal of the local learnPreview).
- Produces: resource-pages.js (relationshipsOf, resultsArrived). ContextPanel.jsx: ContextBody (bare, for the app Graph column) and the default ContextPanel (the Map's right panel; a bottom drawer below md). Results and their count are keyed by resultsKey(scopeOf(surface)), so answers about a selected node show in the panel. Also the Coaching Chat tooltip for the dev build, and the pm/context block.

- [ ] **Step 1: Precondition: the pieces this task builds on have landed. If any count is wrong, stop: do not add or remove SharePage's flags lines here (shell-home order 1 owns them), and do not guess agent-ui's names.**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web/src && grep -c "import { learnPreview } from './flags.js';" SharePage.jsx; grep -c 'const learnPreview' SharePage.jsx; grep -cE 'export (const|function) resultsKey' agent/bar.js; grep -n 'export function ResultList' agent/ResultSheet.jsx
```

Expected: The output is 1, 0 and 1, then one ResultList line whose props are `{ scopeKey: key }` (it takes a results key). If it still slices a scopeKey (the v2 listKeyOf), stop and ask agent-ui.

- [ ] **Step 2: Failing test: create packages/web/src/resource-pages.test.mjs**

```jsx
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relationshipsOf, resultsArrived } from './resource-pages.js';

// Snapshot edges keep source, target, relation, confidence and context (index_repository.py:85).
const graph = {
  nodes: [
    { id: 'model', label: 'Model', path: 'model.py', line: 1 },
    { id: 'forward', label: 'forward()', path: 'model.py', line: 2 },
    { id: 'train', label: 'train()', path: 'train.py', line: 4 },
    { id: 'torch', label: 'torch', path: null, line: 1, kind: 'external' },
    { id: 'readme', label: 'README', path: 'README.md', line: 1 },
  ],
  edges: [
    { source: 'model', target: 'forward', relation: 'contains', confidence: 'EXTRACTED' },
    { source: 'train', target: 'model', relation: 'calls', confidence: 'INFERRED' },
    { source: 'model', target: 'torch', relation: 'imports', confidence: 'EXTRACTED' },
    { source: 'train', target: 'forward', relation: 'references', confidence: 'AMBIGUOUS' },
  ],
};

test('selected relationships split extracted from inferred, with direction and confidence', () => {
  const { extracted, inferred } = relationshipsOf(graph, 'model');
  assert.deepEqual(extracted, [
    { relation: 'contains', outgoing: true, other: 'forward()', confidence: 'EXTRACTED' },
    { relation: 'imports', outgoing: true, other: 'torch', confidence: 'EXTRACTED' },
  ]);
  assert.deepEqual(inferred, [{ relation: 'calls', outgoing: false, other: 'train()', confidence: 'INFERRED' }]);
  assert.equal(relationshipsOf(graph, 'forward').inferred[0].confidence, 'AMBIGUOUS');
  const missing = relationshipsOf({ nodes: [], edges: [{ source: 'a', target: 'b', relation: 'uses' }] }, 'a');
  assert.deepEqual(missing.inferred, [{ relation: 'uses', outgoing: true, other: 'b', confidence: 'unknown' }]);
});

// Keys are bar.js resultsKey values: org|kind:slug, selection excluded (CONTRACT v3).
test('Results come forward only for a new answer in the same results list', () => {
  const seen = { key: 'gmail-com|project:repo-1a2b3c4d-nanogpt', count: 2 };
  assert.equal(resultsArrived(seen, seen.key, 3), true);
  assert.equal(resultsArrived(seen, seen.key, 2), false); // a streamed chunk updates a turn, it adds none
  assert.equal(resultsArrived(seen, 'gmail-com|app:counter', 5), false); // another resource is not a new answer
});
```

Run:
```bash
cd packages/web && node --test src/resource-pages.test.mjs
```

Expected: Error [ERR_MODULE_NOT_FOUND] for src/resource-pages.js; ℹ fail 1 (verified in scratch)

- [ ] **Step 3: Create packages/web/src/resource-pages.js (pure; no imports yet)**

```jsx
// Pure helpers for the Project, canvas and app pages (T02 §1, §6.5, §8.3, §12).
// Imports only pure modules, so node:test loads this file directly.

// A selected node's relationships, split the way RepositoryGraph draws them
// (RepositoryGraph.jsx:131): EXTRACTED solid, anything else dashed with its confidence.
export function relationshipsOf(graph, id) {
  const label = new Map(graph.nodes.map(n => [n.id, n.label]));
  const extracted = [], inferred = [];
  for (const e of graph.edges) {
    if (e.source !== id && e.target !== id) continue;
    const other = e.source === id ? e.target : e.source;
    (e.confidence === 'EXTRACTED' ? extracted : inferred).push({ relation: e.relation, outgoing: e.source === id, other: label.get(other) || other, confidence: e.confidence || 'unknown' });
  }
  return { extracted, inferred };
}

// Context panel: a new answer in the same results list brings Results forward (T02 §6.5).
// The key is bar.js resultsKey (org|kind:slug, no selection), so selecting a node keeps it;
// moving to another resource is a scope change, not a new answer.
export const resultsArrived = (seen, key, count) => seen.key === key && count > seen.count;
```

Run:
```bash
cd packages/web && node --test src/resource-pages.test.mjs
```

Expected: ℹ pass 2, ℹ fail 0 (verified in scratch)

- [ ] **Step 4: Create packages/web/src/ContextPanel.jsx**

```jsx
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronDown, PanelBottomOpen } from 'lucide-react';
import RepositorySource from './RepositorySource.jsx';
import ResizableSidePanel from './ResizableSidePanel.jsx';
import { getTurns, resultsKey, subscribeTurns } from './agent/bar.js';
import { ResultList } from './agent/ResultSheet.jsx';
import { scopeOf } from './agent/scope.js';
import { useSurface } from './agent/surface.js';
import { resultsArrived } from './resource-pages.js';
import { Tabs, TabsList, TabsTrigger, cn } from './ui.jsx';

const LABELS = { results: 'Results', selected: 'Selected', source: 'Source' };

// Context inspector (T02 §6.5): Results · Selected · Source. The Agent Bar is the only
// input; its answers for this resource render here through the sheet's own ResultList.
// resultsKey drops the selection (CONTRACT v3), so answers about a selected node land in this list too.
// ponytail: RepositorySource line-range selection fed only AskPanel (ask.jsx:663); the bar sends the selected node. Add ranges when askBody takes them.
// ResultList brings this scope's History and New chat into the panel.
export function ContextBody({ views = ['results'], selected = null, source = null, onShow = () => {}, onClose = null }) {
  const [view, setView] = useState('results');
  const key = resultsKey(scopeOf(useSurface()));
  const count = useSyncExternalStore(subscribeTurns, () => getTurns(key).length);
  const seen = useRef({ key, count });
  const show = next => { setView(next); onShow(); };
  // Declared before the selected effect: a node click sets both, and Selected wins.
  useEffect(() => { if (source) show('source'); }, [source?.path, source?.line]);
  useEffect(() => { if (selected) show('selected'); }, [selected?.id]);
  // A new answer in this list brings Results forward, so no result is ever hidden.
  useEffect(() => {
    if (resultsArrived(seen.current, key, count)) show('results');
    seen.current = { key, count };
  }, [key, count]);
  return <section aria-label="Context" className="flex min-h-0 flex-1 flex-col">
    <div className="mb-3 flex shrink-0 items-center gap-2">
      <h2 className="text-sm font-semibold">Context</h2>
      {views.length > 1 && <Tabs value={view} onValueChange={setView} className="ml-auto"><TabsList pill>{views.map(v => <TabsTrigger key={v} pill value={v}>{LABELS[v]}</TabsTrigger>)}</TabsList></Tabs>}
      {onClose && <button type="button" aria-label="Close context" onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink md:hidden"><ChevronDown size={14} /></button>}
    </div>
    {view === 'results' && (count ? <div className="min-h-0 flex-1 overflow-auto"><ResultList scopeKey={key} /></div> : <p className="text-sm text-ink-3">Ask in the bar below. Answers about this page appear here.</p>)}
    {view === 'selected' && <Selected node={selected} />}
    {view === 'source' && (source ? <RepositorySource {...source} /> : <p className="text-sm text-ink-3">Pick a file or a node to read its source.</p>)}
  </section>;
}

// Selected (T02 §6.5): extracted relationships solid, inferred dashed with the
// extractor's confidence, matching the edges RepositoryGraph draws.
function Selected({ node }) {
  if (!node) return <p className="text-sm text-ink-3">Click a node on the map to inspect it.</p>;
  const list = (items, dashed) => <ul className="mt-1">{items.map((e, i) => <li key={i} className="flex items-center gap-2 py-1 text-xs">
    <span aria-hidden="true" className={cn('w-4 shrink-0 border-t border-ink-2', dashed && 'border-dashed')} />
    <span className="text-ink-2">{e.relation} {e.outgoing ? '→' : '←'}</span><span className="min-w-0 truncate">{e.other}</span>
    {dashed && <span className="ml-auto shrink-0 text-ink-3">{e.confidence}</span>}
  </li>)}</ul>;
  return <div className="min-h-0 flex-1 overflow-auto text-sm">
    <strong className="break-words">{node.label}</strong>
    <p className="mt-1 font-mono text-xs text-ink-2">{node.path ? `${node.path}:${node.line}` : 'External dependency'}</p>
    <p className="mt-1 text-xs text-ink-2">{node.kind || 'symbol'} · rev {node.commit?.slice(0, 7)}</p>
    <h3 className="mt-4 text-xs font-medium text-ink-2">Extracted from code · {node.extracted.length}</h3>{list(node.extracted, false)}
    <h3 className="mt-3 text-xs font-medium text-ink-2">Inferred · {node.inferred.length}</h3>{list(node.inferred, true)}
  </div>;
}

// Map's right panel. Below lg it stacks, as ResizableSidePanel does; below md it is a
// bottom drawer above the Agent Bar that opens on any new result or selection.
export default function ContextPanel(props) {
  const [open, setOpen] = useState(false);
  return <>
    {!open && <button type="button" onClick={() => setOpen(true)} className="fixed right-4 bottom-[calc(var(--agent-bar-h,0px)+0.5rem)] z-20 flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm text-ink-2 shadow-pop hover:text-ink md:hidden"><PanelBottomOpen size={14} /> Context</button>}
    <ResizableSidePanel aria-label="Context panel" resizeLabel="Resize context panel" defaultWidth={420} className={cn('p-5 max-md:fixed max-md:inset-x-0 max-md:bottom-[var(--agent-bar-h,0px)] max-md:z-20 max-md:h-[55vh] max-md:rounded-t-xl max-md:shadow-pop', !open && 'max-md:hidden')}>
      <ContextBody {...props} onShow={() => setOpen(true)} onClose={() => setOpen(false)} />
    </ResizableSidePanel>
  </>;
}
```

Run:
```bash
node -e "require('esbuild').transformSync(require('fs').readFileSync('packages/web/src/ContextPanel.jsx','utf8'),{loader:'jsx',jsx:'automatic'});console.log('ok')"
```

Expected: ok (compiled in scratch: scratchpad/pm3/src/ContextPanel.jsx)

- [ ] **Step 5: RepositoryPage.jsx: the Map's right panel becomes the Context panel. These are exact old/new edits on today's file (anchors re-checked at HEAD 6a0f878); the order 11.3 task then rewrites the whole file.**

```jsx
// RepositoryPage.jsx:5-9 imports
// old
import { AskPanel } from './ask.jsx';
import LearnPage from './LearnPage.jsx';
import RepositoryGraph from './RepositoryGraph.jsx';
import RepositorySource from './RepositorySource.jsx';
import ResizableSidePanel from './ResizableSidePanel.jsx';
// new
import ContextPanel from './ContextPanel.jsx';
import LearnPage from './LearnPage.jsx';
import RepositoryGraph from './RepositoryGraph.jsx';
import { relationshipsOf } from './resource-pages.js';

// RepositoryPage.jsx:25 (delete the whole line)
// old
  const relationships=selected&&snapshot?snapshot.graph.edges.filter(e=>e.source===selected.id||e.target===selected.id):[];
// new
(nothing)

// RepositoryPage.jsx:41 (delete the whole line; Selected moves into the panel)
// old
      {selected&&<div className="mt-3 rounded-lg border border-line p-3"><strong className="text-sm">{selected.label}</strong><details className="mt-2 text-xs"><summary className="cursor-pointer">{relationships.length} relationships</summary><div className="max-h-32 overflow-auto">{relationships.map((e,i)=><p className="py-1" key={i}>{e.relation} → {snapshot.graph.nodes.find(n=>n.id===(e.source===selected.id?e.target:e.source))?.label||e.target} <span className="text-ink-3">({e.confidence||'unknown'})</span></p>)}</div></details></div>}
// new
(nothing)

// RepositoryPage.jsx:46-49
// old
    <ResizableSidePanel aria-label="Repository Graph Agent" resizeLabel="Resize repository panel" defaultWidth={420} className="p-5">

      <AskPanel onGraph={showGraph} scope={{app:app.name}} appName={app.name} conversation="learn" repositoryContext={{commit:asking?.commit||snapshot?.commit,nodeId:asking?.id,label:asking?.label}} onClearRepository={()=>setAsking(null)} headerTitle="Graph Agent" placeholder={`Ask about ${app.repo}…`} contentPanel={source?<RepositorySource appName={app.name} {...source} commit={source.commit||snapshot?.commit} onClose={()=>setSource(null)}/>:null} onCloseContentPanel={()=>setSource(null)}/>
    </ResizableSidePanel>
// new
    <ContextPanel views={['results','selected','source']}
      selected={selected&&snapshot?{...selected,commit:selected.commit||snapshot.commit,...relationshipsOf(snapshot.graph,selected.id)}:null}
      source={source&&{appName:app.name,...source,commit:source.commit||snapshot?.commit,onClose:()=>setSource(null)}}/>
```

- [ ] **Step 6: SharePage.jsx: put ContextBody in the dev app Graph column. Anchor on content with the Edit tool (CRLF). Each old text matches exactly once on top of shell-home order 1, verified in scratch (pm3/src/apply-share.cjs). The flags.js import and the removal of SharePage.jsx:63 are NOT edited here: shell-home order 1 owns them.**

```jsx
// SharePage.jsx:14 today, :15 after shell-home order 1 (anchor: the CoachingPanel import)
// old
import CoachingPanel from './coaching/CoachingPanel.jsx';
// new
import CoachingPanel from './coaching/CoachingPanel.jsx';
import { ContextBody } from './ContextPanel.jsx';

// SharePage.jsx:829-831 (app Graph tab)
// old
                <div className="flex min-h-0 flex-1 flex-col">
                  <AskPanel
                    key={app.app_chat ? app.name : undefined}
// new
                <div className="flex min-h-0 flex-1 flex-col">
                  {learnPreview ? <ContextBody /> : <AskPanel
                    key={app.app_chat ? app.name : undefined}

// SharePage.jsx:849-851
// old
                  />
                </div>}
                </CoachingPanel>
// new
                  />}
                </div>}
                </CoachingPanel>
```

- [ ] **Step 7: CoachingPanel.jsx: the Chat tab's tooltip, now that the tab shows the Context panel in the Rabbit Hole dev build (CoachingPanel.jsx:60; the panel is gated on VITE_COACHING_DEV at :48, so private BYOC coaching builds keep AskPanel and the old copy). Apply with the Edit tool (CRLF: 74 of 75 lines).**

```jsx
// CoachingPanel.jsx:3 (anchor: the ui.jsx import)
// old
import { Button, Input, Tabs, TabsContent, TabsList, TabsTrigger, Tip, cn } from '../ui.jsx';
// new
import { Button, Input, Tabs, TabsContent, TabsList, TabsTrigger, Tip, cn } from '../ui.jsx';
import { learnPreview } from '../flags.js';

// CoachingPanel.jsx:60
// old
        <TabsTrigger value="chat" aria-label="Chat"><Tip label="Chat" info="Chat with the agent about this app. Your existing conversation and controls are here."><span>Chat</span></Tip></TabsTrigger>
// new
        <TabsTrigger value="chat" aria-label="Chat"><Tip label="Chat" info={learnPreview ? 'Results from the Agent Bar about this app appear here.' : 'Chat with the agent about this app. Your existing conversation and controls are here.'}><span>Chat</span></Tip></TabsTrigger>
```

Run:
```bash
node -e "require('esbuild').transformSync(require('fs').readFileSync('packages/web/src/coaching/CoachingPanel.jsx','utf8'),{loader:'jsx',jsx:'automatic'});console.log('ok')"
```

Expected: ok (compiled in scratch)

- [ ] **Step 8: Coaching rule (CLAUDE.md): update coaching.md and the coaching preview check. The check asserts AskPanel controls that this task removes from the dev Chat tab.**

```markdown
// docs/features/coaching.md:1018
// old
| Chat | Original AskPanel: real chat, History, New Chat, attachments, model/source controls, and Open as page. Opens by default and stays mounted while switching preview tabs. |
// new
| Chat | Original AskPanel: real chat, History, New Chat, attachments, model/source controls, and Open as page. Opens by default and stays mounted while switching preview tabs. In the Rabbit Hole dev build (`learnPreview`), this tab shows the Context panel's Results instead, and its tooltip reads "Results from the Agent Bar about this app appear here.": the Agent Bar at the bottom of the page is the only input, and History lives in its result sheet (T02 §6.5, §12). |

// docs/features/coaching.md:1199-1201
// old
It covers the five readable steps, Original/Metadata, evidence navigation,
existing Chat controls, and inspector resizing/enlarge/minimize at 320, 768,
1024, and 1440px. This is an isolated UI check, not a capture/extraction benchmark.
// new
It covers the five readable steps, Original/Metadata, evidence navigation,
the Chat tab (the Context panel in the Rabbit Hole dev build), and inspector
resizing/enlarge/minimize at 320, 768, 1024, and 1440px. This is an isolated
UI check, not a capture/extraction benchmark.

// packages/web/e2e/coaching.preview.js:545-546
// old
  await expect(page.getByRole('button', { name: 'History', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New chat', exact: true }).first()).toBeVisible();
// new
  await expect(page.getByRole('region', { name: 'Context', exact: true })).toBeVisible(); // Rabbit Hole dev: the Context panel replaces AskPanel (T02 §6.5)

// packages/web/e2e/coaching.preview.js:596-597
// old
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  await expect(page.getByRole('button', { name: 'History', exact: true })).toBeVisible();
// new
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Context', exact: true })).toBeVisible();
```

- [ ] **Step 9: Add the pm/context block to the shared harness, directly ABOVE the marker line (it must match exactly once). The block is wrapped in { }, declares nothing at top level and never closes the browser.**

```jsx
// packages/web/e2e/rabbit-hole-check.mjs: insert directly above
// `// ── journey checks: each area inserts its block above this line, wrapped in { } ──`
// ── project-map: the Context panel replaces the Graph Agent input (T02 §6.5) ──
{
  const project = apps.find((a) => a.kind === 'repository' && a.commit_sha);
  const hosted = apps.find((a) => (a.kind === 'server' || a.kind === 'job') && a.hosting !== 'aws');
  await check('pm/context: Map and the app Graph tab show the Context panel, with no second text input', async () => {
    must(project && hosted, 'needs a repository with a ready map and a hosted app in this workspace');
    const page = await open();
    for (const path of [`/apps/${project.name}?tab=map`, `/apps/${hosted.name}?tab=graph`]) {
      await page.goto(`${base}${path}`);
      const panel = page.getByRole('region', { name: 'Context', exact: true });
      await panel.waitFor({ timeout: 20000 });
      must(await panel.getByRole('textbox').count() === 0, `${path}: the Context panel has a text input`);
      must(await page.getByRole('heading', { name: 'Graph Agent' }).count() === 0, `${path}: the Graph Agent is still shown`);
    }
    // Still on the app Graph tab: the Coaching Chat tab's tooltip names the Agent Bar (CoachingPanel.jsx:60).
    await page.getByRole('tab', { name: 'Chat', exact: true }).hover();
    must(await page.getByRole('tooltip').filter({ hasText: 'Results from the Agent Bar about this app appear here.' }).isVisible(), 'the Chat tooltip still describes the old chat');
    await page.context().close();
  });

  await check('pm/context: below md the Map panel is a drawer above the bar (375px shots, both themes)', async () => {
    must(project, 'needs a repository with a ready map in this workspace');
    for (const theme of ['light', 'dark']) {
      const page = await open({ width: 375, height: 812 });
      await page.addInitScript((t) => localStorage.setItem('small.theme', t), theme);
      await page.goto(`${base}/apps/${project.name}?tab=map`);
      const toggle = page.getByRole('button', { name: 'Context', exact: true });
      await toggle.waitFor({ timeout: 30000 });
      await toggle.click();
      await page.getByRole('region', { name: 'Context', exact: true }).waitFor({ timeout: 5000 });
      await page.screenshot({ path: `e2e/shots/pm-map-drawer-375-${theme}.png` });
      await page.context().close();
    }
  });
}
```

Run:
```bash
cd packages/web && node --check e2e/rabbit-hole-check.mjs && grep -c 'await browser.close();' e2e/rabbit-hole-check.mjs
```

Expected: node --check prints nothing, then 1

- [ ] **Step 10: Gate: unit tests, both builds, no second composer, and the new tooltip**

Run:
```bash
cd packages/web && VITE_COACHING_DEV=true VITE_BYOC_DEV=true npm run build -- --outDir dist-dev && npm run build && cd ../.. && make test-unit && grep -c AskPanel packages/web/src/RepositoryPage.jsx; grep -c 'learnPreview ? <ContextBody' packages/web/src/SharePage.jsx; grep -c 'Results from the Agent Bar about this app appear here.' packages/web/src/coaching/CoachingPanel.jsx
```

Expected: The builds pass and make test-unit exits 0 (web +2 tests). The greps print 0, 1 and 1. The run-page AskPanel (SharePage.jsx:688) stays, because the bar is hidden on runs (T02 §6.1).

- [ ] **Step 11: Local coaching check on the dev build (mocked APIs, no network)**

Run:
```bash
cd packages/web && npx playwright test --config playwright.coaching.config.js -g 'readable Capture'
```

Expected: 1 passed. Only this test runs, because the suite's Learn test already expects a removed Agent tab (coaching.preview.js:311).

- [ ] **Step 12: Commit named paths only**

Run:
```bash
git add packages/web/src/resource-pages.js packages/web/src/resource-pages.test.mjs packages/web/src/ContextPanel.jsx && git commit --only -m 'feat(web): Context panel replaces the Graph Agent input on Map and the dev app Graph tab' -- packages/web/src/resource-pages.js packages/web/src/resource-pages.test.mjs packages/web/src/ContextPanel.jsx packages/web/src/RepositoryPage.jsx packages/web/src/SharePage.jsx packages/web/src/coaching/CoachingPanel.jsx docs/features/coaching.md packages/web/e2e/coaching.preview.js packages/web/e2e/rabbit-hole-check.mjs
```

Expected: 1 commit, 9 files

---

### Task 44: Project hub: Overview, Learn, Map and Sources tabs; Learn enabled at once; Share not available; surface (with map status) published

*Area:* Project page, Map, Context panel, canvas route · *Brief:* T08 · *Order:* 11.3

**Files:**
- `packages/web/src/resource-pages.js`
- `packages/web/src/resource-pages.test.mjs`
- `packages/web/src/RepositoryPage.jsx`
- `packages/web/src/SharePage.jsx`
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: agent-core: titleOf (agent/catalog.js); canvasKeys and opensHere (home/canvas-local.js); ctxOf(surface) and executeCommand (agent/commands.js; create_canvas {title, project, open:true} navigates inside run; open_settings {tab}); learnAction (agent/learn-hook.js), which opens Learn itself when it sends and returns { status, message } (CONTRACT v3: callers never navigate after it and show only outcome.message); getSurface and patchSurface (agent/surface.js). shell-home: readContinue (home/continue.js, catalog as an ARRAY). settings-deploy 9.8: the Settings listener, so [Manage connections] opens something. The Shell catalog array (data.apps), passed from SharePage.
- Produces: projectTab, topFiles, projectSurface and projectCanvases. RepositoryPage patches {place, resource:{kind, slug, title, status}, selected, barHidden, resultsHost, handlers:{onGraph}}, never org, email or catalog, which belong to Shell. It patches again on every URL change and whenever a poll changes app.status, so the bar's map-not-ready placeholder (which reads surface.resource.status first) never goes stale. agent-ui 11.6 consumes this project surface.

- [ ] **Step 1: Failing test: widen the import line of resource-pages.test.mjs and append the project tests**

```jsx
// import line becomes:
import { projectCanvases, projectSurface, projectTab, relationshipsOf, resultsArrived, topFiles } from './resource-pages.js';

// append at the end of the file:
// Just enough localStorage for canvas-local.js: deviceId() writes small.device on first use.
const memory = (entries = {}) => {
  const items = new Map(Object.entries(entries));
  return { getItem: key => (items.has(key) ? items.get(key) : null), setItem: (key, value) => items.set(key, String(value)), removeItem: key => items.delete(key) };
};
const REPO = { org: 'gmail-com', email: 'a@gmail.com', name: 'repo-1a2b3c4d-nanogpt', kind: 'repository', repo: 'karpathy/nanoGPT', status: 'indexing' };

test('project tabs: Overview by default, legacy code/graph/agent open Map', () => {
  assert.equal(projectTab(''), 'overview');
  assert.equal(projectTab('?tab=overview'), 'overview');
  assert.equal(projectTab('?tab=learn&board=x'), 'learn');
  assert.equal(projectTab('?tab=sources'), 'sources');
  for (const tab of ['map', 'code', 'graph', 'agent']) assert.equal(projectTab(`?tab=${tab}`), 'map');
  assert.equal(projectTab('?tab=build'), 'overview');
});

test('Start here ranks files by the degree of their symbols; external and unlinked nodes drop out', () => {
  assert.deepEqual(topFiles(graph), [{ path: 'model.py', links: 5 }, { path: 'train.py', links: 2 }]);
  assert.deepEqual(topFiles(graph, 1), [{ path: 'model.py', links: 5 }]);
  assert.deepEqual(topFiles({ nodes: [], edges: [] }), []);
});

test('project surface: the resource carries the polled map status; selection and panel results only on Map; bar hidden in Learn', () => {
  const onGraph = () => {}, asking = { id: 'forward', label: 'forward()' };
  const map = projectSurface({ app: REPO, tab: 'map', asking, commit: 'abc', onGraph });
  assert.deepEqual(map.resource, { kind: 'project', slug: REPO.name, title: 'karpathy/nanoGPT', status: 'indexing' });
  assert.equal(projectSurface({ app: { ...REPO, status: 'ready' }, tab: 'overview', asking, commit: 'abc', onGraph }).resource.status, 'ready');
  assert.deepEqual(map.selected, { id: 'forward', label: 'forward()', commit: 'abc' });
  assert.equal(map.resultsHost, 'panel');
  assert.equal(map.handlers.onGraph, onGraph);
  assert.equal('org' in map || 'email' in map || 'catalog' in map, false); // Shell owns identity; a page patch never overwrites it
  const overview = projectSurface({ app: REPO, tab: 'overview', asking, commit: 'abc', onGraph });
  assert.deepEqual([overview.place, overview.selected, overview.resultsHost, overview.barHidden], ['project', null, 'sheet', false]);
  const learn = projectSurface({ app: REPO, tab: 'learn', asking: null, commit: null, onGraph });
  assert.deepEqual([learn.place, learn.barHidden], ['learn', true]);
});

test('project canvases: only this project, flagged when the content is on another device', () => {
  const canvas = (name, title, project, device_id) => ({ org: 'gmail-com', email: 'a@gmail.com', name, kind: 'canvas', title, project, device_id });
  const catalog = [REPO, canvas('canvas-0a1b2c3d', 'Attention', REPO.name, 'dev-1'), canvas('canvas-0e0f0a0b', 'Elsewhere', REPO.name, 'dev-2'),
    canvas('canvas-0c0d0e0f', 'Legacy', REPO.name, null), canvas('canvas-09080706', 'Standalone', null, 'dev-1')];
  assert.deepEqual(projectCanvases(catalog, REPO.name, memory({ 'small.device': 'dev-1' })), [
    { slug: 'canvas-0a1b2c3d', title: 'Attention', here: true },
    { slug: 'canvas-0e0f0a0b', title: 'Elsewhere', here: false },
    { slug: 'canvas-0c0d0e0f', title: 'Legacy', here: true },
  ]);
  const chat = 'small.adaptive-canvas:gmail-com:a@gmail.com:canvas-0e0f0a0b:chat';
  assert.equal(projectCanvases(catalog, REPO.name, memory({ 'small.device': 'dev-1', [chat]: '[{"question":"why?"}]' }))[1].here, true);
  assert.deepEqual(projectCanvases(undefined, REPO.name, memory()), []);
});
```

Run:
```bash
cd packages/web && node --test src/resource-pages.test.mjs
```

Expected: SyntaxError: The requested module './resource-pages.js' does not provide an export named 'projectCanvases'; ℹ fail 1 (verified in scratch)

- [ ] **Step 2: resource-pages.js: add two imports after the two header comment lines, then append the project helpers**

```jsx
// after line 2 ("// Imports only pure modules, ...") insert:
import { titleOf } from './agent/catalog.js';
import { canvasKeys, opensHere } from './home/canvas-local.js';

// append at the end of the file:
// Project tab from ?tab (T02 §1). Overview is the default; code, graph and agent are legacy Map links.
export function projectTab(search) {
  const tab = new URLSearchParams(search).get('tab');
  if (['map', 'code', 'graph', 'agent'].includes(tab)) return 'map';
  return tab === 'learn' || tab === 'sources' ? tab : 'overview';
}

// Start here (T02 §12): files ranked by the summed degree of their symbols in the loaded snapshot.
export function topFiles(graph, limit = 5) {
  const degree = new Map(), score = new Map();
  for (const e of graph.edges) for (const id of [e.source, e.target]) degree.set(id, (degree.get(id) || 0) + 1);
  for (const n of graph.nodes) if (n.path) score.set(n.path, (score.get(n.path) || 0) + (degree.get(n.id) || 0));
  return [...score].filter(([, links]) => links > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit).map(([path, links]) => ({ path, links }));
}

// The page-owned part of the surface on a Project page. Shell owns org, email and catalog.
// resource.status is the polled map state: the bar's map-not-ready placeholder reads it first (CONTRACT v3).
export function projectSurface({ app, tab, asking, commit, onGraph }) {
  return {
    place: tab === 'learn' ? 'learn' : 'project',
    resource: { kind: 'project', slug: app.name, title: titleOf(app), status: app.status },
    selected: tab === 'map' && asking ? { id: asking.id, label: asking.label, commit: asking.commit || commit } : null,
    barHidden: tab === 'learn', resultsHost: tab === 'map' ? 'panel' : 'sheet', handlers: { onGraph },
  };
}

// Canvases linked to this project; here is false when the content lives in another browser (T02 §8.3).
export function projectCanvases(catalog, project, storage) {
  return (catalog || []).filter(c => c.kind === 'canvas' && c.project === project).map(c => ({
    slug: c.name, title: titleOf(c),
    here: opensHere({ storage, keys: canvasKeys({ org: c.org, email: c.email || c.owner_email, slug: c.name }), record: c }),
  }));
}
```

Run:
```bash
cd packages/web && node --test src/resource-pages.test.mjs
```

Expected: ℹ pass 6, ℹ fail 0 (verified in scratch against agent-core's canvas-local.js code from its 'Canvas local data' task, copied verbatim)

- [ ] **Step 3: Rewrite packages/web/src/RepositoryPage.jsx (whole file). [Add source] awaits learnAction and shows only outcome.message; it never navigates after it (learnAction opens Learn itself when it sends). The surface is patched again whenever a poll changes app.status.**

```jsx
import { useEffect, useState } from 'react';
import { FileCode, GitBranch, Network, Plus, RefreshCw, Share2 } from 'lucide-react';
import { api, navigate } from './api.js';
import { Button, ExpandedPageFrame, Input, Pill, Tabs, TabsList, TabsTrigger, Tip } from './ui.jsx';
import ContextPanel from './ContextPanel.jsx';
import LearnPage from './LearnPage.jsx';
import RepositoryGraph from './RepositoryGraph.jsx';
import { ctxOf, executeCommand } from './agent/commands.js';
import { learnAction } from './agent/learn-hook.js';
import { getSurface, patchSurface } from './agent/surface.js';
import { readContinue } from './home/continue.js';
import { projectCanvases, projectSurface, projectTab, relationshipsOf, topFiles } from './resource-pages.js';

// The only four import states (repositories.js:66,70,93,98).
const MAP = { queued: 'Map queued', indexing: 'Map indexing', ready: 'Map ready', failed: 'Map failed' };
// Learn research sources (T02 §9). PDFs are uploaded from the canvas's Sources menu.
const SOURCE_KINDS = [['arxiv', 'arXiv'], ['wiki', 'Wikipedia'], ['youtube', 'YouTube']];
const TABS = [['overview', 'Overview', 'Where to start, canvases, and map status'], ['learn', 'Learn', 'Guided lessons built from this repository'], ['map', 'Map', 'Code graph and files of this repository'], ['sources', 'Sources', 'What this project is built from']];
const row = 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-hover';

export default function RepositoryPage({ app: initial, catalog }) {
  const [app,setApp]=useState(initial),[snapshot,setSnapshot]=useState(null),[error,setError]=useState(''),[mode,setMode]=useState('graph'),[query,setQuery]=useState(''),[selected,setSelected]=useState(null),[source,setSource]=useState(null),[asking,setAsking]=useState(null);
  const [graphView,setGraphView]=useState(null),[busy,setBusy]=useState(false),[adding,setAdding]=useState(null),[sourceNote,setSourceNote]=useState('');
  const path=window.location.pathname+window.location.search,tab=projectTab(window.location.search);
  const go=next=>navigate(`/apps/${app.name}${next==='overview'?'':`?tab=${next}`}`);
  const showGraph=value=>{setGraphView({...value,requestId:crypto.randomUUID()});setMode('graph');if(tab!=='map')go('map');};
  const root=`/api/repositories/${app.name}`;
  useEffect(()=>{
    let active=true,timer;
    const load=async()=>{try{const next=await api(root);if(!active)return;setApp(next);if(['queued','indexing'].includes(next.status))timer=setTimeout(load,2500);}catch(e){if(active)setError(e.message);}};
    load();return()=>{active=false;clearTimeout(timer);};
  },[root,app.status]);
  useEffect(()=>{if(!app.commit_sha)return;let active=true;api(`${root}/snapshot`).then(d=>{if(active){setSnapshot(d);setSelected(null);setSource(null);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[root,app.commit_sha]);
  // The bar's view of this page (T02 §6). Re-run on every URL change (Root resets the surface first) and
  // whenever a poll changes app.status, so the bar's map-not-ready placeholder never goes stale (CONTRACT v3).
  useEffect(()=>{patchSurface(projectSurface({app,tab,asking,commit:snapshot?.commit,onGraph:showGraph}));},[path,app.name,app.repo,app.status,asking,snapshot?.commit]);
  if(tab==='learn')return <LearnPage app={app} onGraph={showGraph} repositoryContext={asking?{nodeId:asking.id,label:asking.label,commit:snapshot?.commit}:{commit:app.commit_sha}} onBack={()=>go('overview')}/>;
  const choose=node=>{setSelected(node);setAsking(node);if(!node)return;if(node.path)setSource({path:node.path,line:node.line,commit:node.commit});else setSource(null);};
  const openFile=file=>{setSource({path:file,line:1});setSelected(null);setAsking(null);if(tab!=='map')go('map');};
  const refresh=async()=>{try{setError('');await api(`${root}/refresh`,{method:'POST',body:'{}'});setApp(await api(root));}catch(e){setError(e.message);}};
  // create_canvas navigates to the new canvas itself (open: true).
  const newCanvas=async()=>{setBusy(true);setError('');try{await executeCommand('create_canvas',{title:'Untitled canvas',project:app.name,open:true},ctxOf(getSurface()));}catch(e){setError(e.message);}setBusy(false);};
  const addSource=async event=>{
    event.preventDefault();setBusy(true);setSourceNote('');
    // learnAction opens Learn itself when it sends; this page never navigates after it and shows only its message (T02 §9).
    const outcome=await learnAction('research',{app:app.name,source:{kind:adding.kind,ref:adding.ref.trim()}},ctxOf(getSurface()));
    setBusy(false);setSourceNote(outcome.message||'');
  };
  const resume=tab==='overview'?readContinue({org:app.org,email:app.email,recent:[app.name],catalog,storage:localStorage}):null;
  const canvases=tab==='overview'?projectCanvases(catalog,app.name,localStorage):[];
  const start=tab==='overview'&&snapshot?topFiles(snapshot.graph):[];
  const commit=app.commit_sha?.slice(0,7)||'awaiting snapshot';
  return <main className="flex min-w-0 flex-1 overflow-hidden max-lg:flex-col">
    <section className="min-w-0 flex-1 overflow-auto"><ExpandedPageFrame wide>
      <div className="flex items-center gap-2 pb-2">
        <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold">{app.repo}</h1>
        <Tip label="Share" info="Sharing projects and canvases isn't available yet."><Button variant="secondary" size="sm" aria-disabled="true" className="aria-disabled:cursor-default aria-disabled:opacity-50"><Share2 size={13}/> Share</Button></Tip>
        {/* ponytail: the T02 §12 [⋯] menu has no specified items; add it with them. */}
      </div>
      <Tabs value={tab} onValueChange={go}>
        <TabsList pill className="mb-2">{TABS.map(([value,label,info])=><TabsTrigger key={value} pill value={value}><Tip label={label} info={info}><span>{label}</span></Tip></TabsTrigger>)}</TabsList>
      </Tabs>
      <div className="mb-4 flex flex-wrap items-center gap-x-2 text-xs text-ink-2"><span>{app.repo_url.replace(/^https:\/\//,'')}</span><span>· {app.branch} @ {commit}</span><span>· {MAP[app.status]||app.status}</span></div>
      {(error||app.error)&&<p role="alert" className="mb-4 text-sm text-danger">{error||app.error}</p>}
      {tab==='overview'&&<div className="flex flex-col gap-6">
        <p className="max-w-[720px] text-sm leading-relaxed text-ink-2">{app.description}</p>
        {resume?.canvas&&<section aria-label="Continue learning" className="rounded-lg border border-line p-4 text-sm">
          <h2 className="mb-2 text-xs font-medium text-ink-2">Continue · on this device</h2>
          {resume.lastExplored&&<p><span className="text-ink-2">Last explored:</span> {resume.lastExplored}</p>}
          {resume.next&&<p className="mt-1"><span className="text-ink-2">Next:</span> {resume.next}</p>}
          <Button variant="primary" size="sm" className="mt-3" onClick={()=>go('learn')}>Continue learning</Button>
        </section>}
        <section aria-label="Canvases"><h2 className="mb-2 text-sm font-semibold">Canvases</h2>
          <div className="divide-y divide-line rounded-lg border border-line">
            <button className={row} onClick={()=>go('learn')}>Project canvas</button>
            {canvases.map(c=><button key={c.slug} className={row} onClick={()=>navigate(`/apps/${c.slug}`)}><span className="min-w-0 flex-1 truncate">{c.title}</span>{!c.here&&<Pill>On another device</Pill>}</button>)}
          </div>
          <Button size="sm" className="mt-2" disabled={busy} onClick={newCanvas}><Plus size={13}/> New canvas</Button>
        </section>
        {!!start.length&&<section aria-label="Start here"><h2 className="mb-2 text-sm font-semibold">Start here</h2>
          <div className="divide-y divide-line rounded-lg border border-line">{start.map(f=><button key={f.path} className={row} onClick={()=>openFile(f.path)}><FileCode size={14}/><span className="flex-1 font-mono text-xs">{f.path}</span><span className="text-xs text-ink-3">{f.links} links</span></button>)}</div>
        </section>}
        <MapStatus app={app} snapshot={snapshot} onRefresh={refresh}/>
      </div>}
      {tab==='sources'&&<section aria-label="Sources" className="text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line p-3">
          <span className="font-medium">GitHub</span>
          <a href={app.repo_url} target="_blank" rel="noreferrer" className="text-ink-2 hover:text-ink">{app.repo_url.replace(/^https:\/\//,'')}</a>
          <span className="flex items-center gap-1 text-xs text-ink-2"><GitBranch size={13}/>{app.branch}</span>
          <span className="font-mono text-xs text-ink-2">{commit}</span>
          <span className="ml-auto text-xs text-ink-2">{MAP[app.status]||app.status}</span>
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" size="sm" onClick={()=>setAdding(adding?null:{kind:'arxiv',ref:''})}><Plus size={13}/> Add source</Button>
          <Button size="sm" onClick={()=>executeCommand('open_settings',{tab:'connections'},ctxOf(getSurface()))}>Manage connections</Button>
        </div>
        {adding&&<form onSubmit={addSource} className="mt-3 flex flex-wrap items-center gap-2">
          <select aria-label="Source type" value={adding.kind} onChange={e=>setAdding({...adding,kind:e.target.value})} className="h-8 rounded-lg border border-line bg-white px-2 text-sm">{SOURCE_KINDS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
          <Input aria-label="Source link, id or title" placeholder="Link, id or title" value={adding.ref} onChange={e=>setAdding({...adding,ref:e.target.value})} className="w-72"/>
          <Button type="submit" variant="primary" size="sm" disabled={busy||!adding.ref.trim()}>Add</Button>
        </form>}
        {sourceNote&&<p role="status" className="mt-2 text-xs text-ink-2">{sourceNote}</p>}
      </section>}
      {tab==='map'&&(snapshot?<>
        <div className="mb-3 flex items-center gap-2">{[['files',FileCode,'Files'],['graph',Network,'Graph']].map(([value,Icon,label])=><Button key={value} aria-pressed={mode===value} variant={mode===value?'primary':'secondary'} onClick={()=>setMode(value)}><Icon size={15}/>{label}</Button>)}<Input aria-label="Search repository" placeholder={mode==='graph'?'Find a symbol or file…':'Find a file…'} value={query} onChange={e=>setQuery(e.target.value)} className="ml-auto w-64"/></div>
        <div className="flex h-[540px] min-h-0 flex-col">{mode==='graph'?<RepositoryGraph graph={snapshot.graph} selected={selected} onSelect={choose} query={query} answerView={graphView}/>:<div className="overflow-auto rounded-lg border border-line">{snapshot.files.filter(f=>f.path.toLowerCase().includes(query.toLowerCase())).map(f=><button key={f.path} className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left text-sm hover:bg-hover" onClick={()=>openFile(f.path)}><FileCode size={14}/><span className="flex-1 font-mono text-xs">{f.path}</span><span className="text-xs text-ink-3">{f.lines} lines</span></button>)}</div>}</div>
        <p className="mt-3 text-xs text-ink-2">{snapshot.files.length} files · {snapshot.graph.nodes.length} nodes · {snapshot.graph.edges.length} relationships</p>
      </>:app.commit_sha&&!error?<p role="status" className="text-sm text-ink-2">Loading the map…</p>:<MapStatus app={app} snapshot={null} onRefresh={refresh}/>)}
    </ExpandedPageFrame></section>
    {tab==='map'&&<ContextPanel views={['results','selected','source']}
      selected={selected&&snapshot?{...selected,commit:selected.commit||snapshot.commit,...relationshipsOf(snapshot.graph,selected.id)}:null}
      source={source&&{appName:app.name,...source,commit:source.commit||snapshot?.commit,onClose:()=>setSource(null)}}/>}
  </main>;
}

// Map status (T02 §12): state, commit, skipped files with reasons, and Refresh for the importer (repositories.js:136).
function MapStatus({ app, snapshot, onRefresh }) {
  const busy=['queued','indexing'].includes(app.status);
  return <section aria-label="Map status" className="rounded-lg border border-line p-4 text-sm">
    <div className="flex items-center gap-2"><Network size={14} className="text-ink-2"/><strong className="font-medium">{MAP[app.status]||app.status}</strong><span className="text-xs text-ink-2">· {app.commit_sha?.slice(0,7)||'awaiting snapshot'}</span>
      {app.canEdit&&<Button size="sm" className="ml-auto" disabled={busy} onClick={onRefresh}><RefreshCw size={13}/> {app.status==='failed'?'Retry import':'Refresh branch'}</Button>}</div>
    {busy&&<div role="status" className="mt-3"><div className="mb-2 h-1 overflow-hidden rounded bg-hover"><div className="h-full w-1/2 animate-pulse bg-accent"/></div><p className="text-ink-2">{app.status==='queued'?'Waiting for the indexer…':'Downloading source and building the code graph…'}{app.commit_sha&&' The previous snapshot remains available.'}</p></div>}
    {!!snapshot?.skipped.length&&<details className="mt-2 text-xs text-ink-2"><summary className="cursor-pointer">{snapshot.skipped.length} skipped files</summary><div className="max-h-40 overflow-auto">{snapshot.skipped.map(f=><p key={f.path}>{f.path}: {f.reason}</p>)}</div></details>}
  </section>;
}
```

Run:
```bash
node -e "require('esbuild').transformSync(require('fs').readFileSync('packages/web/src/RepositoryPage.jsx','utf8'),{loader:'jsx',jsx:'automatic'});console.log('ok')"
```

Expected: ok (compiled in scratch: scratchpad/pm3/src/RepositoryPage.jsx)

- [ ] **Step 4: SharePage.jsx:608: pass the Shell catalog as an ARRAY (AppPage's catalog prop is the Shell data object, SharePage.jsx:491)**

```jsx
// SharePage.jsx:608 (anchor on content)
// old
  if (learnPreview && app?.kind === 'repository' && !error) return <RepositoryPage key={app.name} app={app} />;
// new
  if (learnPreview && app?.kind === 'repository' && !error) return <RepositoryPage key={app.name} app={app} catalog={catalog?.apps} />;
```

- [ ] **Step 5: Add the pm/project block to the shared harness, directly ABOVE the marker line (it must match exactly once). The block is wrapped in { }, declares nothing at top level and never closes the browser.**

```jsx
// packages/web/e2e/rabbit-hole-check.mjs: insert directly above
// `// ── journey checks: each area inserts its block above this line, wrapped in { } ──`
// ── project-map: the Project hub (T02 §12) ──
{
  const project = apps.find((a) => a.kind === 'repository');
  await check('pm/project: Overview first, Learn enabled, Share not available, ?tab=code opens Map', async () => {
    must(project, 'needs a repository in this workspace');
    const page = await open();
    const tab = (name) => page.getByRole('tab', { name, exact: true });
    await page.goto(`${base}/apps/${project.name}`);
    await page.getByRole('heading', { name: project.repo, exact: true }).waitFor({ timeout: 20000 });
    must(await tab('Overview').getAttribute('data-state') === 'active', 'Overview is not the default tab');
    must(!(await tab('Learn').isDisabled()), 'Learn is disabled');
    for (const name of ['Canvases', 'Map status']) must(await page.getByRole('region', { name, exact: true }).count() === 1, `no ${name} block`);
    const share = page.getByRole('button', { name: 'Share', exact: true });
    must(await share.getAttribute('aria-disabled') === 'true', 'Share is not marked unavailable');
    await share.hover();
    must(await page.getByRole('tooltip').filter({ hasText: "Sharing projects and canvases isn't available yet." }).isVisible(), 'no Share tooltip');
    await page.screenshot({ path: 'e2e/shots/pm-project-overview.png' });
    await page.goto(`${base}/apps/${project.name}?tab=code`);
    await tab('Map').waitFor({ timeout: 20000 });
    must(await tab('Map').getAttribute('data-state') === 'active', '?tab=code did not open Map');
    await page.context().close();
  });

  await check('pm/project: Add source shows the learnAction line and stays put while learnHandoff is false', async () => {
    const { learnHandoff } = await import('../src/flags.js');
    must(!learnHandoff, 'learnHandoff is true: replace this check with the handoff journey (T02 §9)');
    must(project, 'needs a repository in this workspace');
    const page = await open();
    await page.goto(`${base}/apps/${project.name}?tab=sources`);
    const sources = page.getByRole('region', { name: 'Sources', exact: true });
    await sources.getByRole('button', { name: 'Add source', exact: true }).click();
    await sources.getByLabel('Source link, id or title').fill('1706.03762');
    await sources.getByRole('button', { name: 'Add', exact: true }).click();
    const note = sources.getByRole('status');
    await note.waitFor({ timeout: 5000 });
    // learn-hook.js FALLBACK.research (agent-core 'Learn hook, caller side'); the page adds no copy of its own.
    must(await note.innerText() === 'Add sources from the Sources menu on the canvas.', `status line: ${await note.innerText()}`);
    must(new URL(page.url()).search === '?tab=sources', `left Sources: ${page.url()}`);
    must(await page.evaluate(() => sessionStorage.getItem('small.learn.request')) === null, 'a Learn request was written');
    await page.context().close();
  });
}
```

Run:
```bash
cd packages/web && node --check e2e/rabbit-hole-check.mjs && grep -c 'await browser.close();' e2e/rabbit-hole-check.mjs
```

Expected: node --check prints nothing, then 1

- [ ] **Step 6: Gate: unit tests and both builds**

Run:
```bash
cd packages/web && VITE_COACHING_DEV=true VITE_BYOC_DEV=true npm run build -- --outDir dist-dev && npm run build && cd ../.. && make test-unit
```

Expected: The builds pass; make test-unit exits 0 (web +4 tests)

- [ ] **Step 7: Commit named paths only**

Run:
```bash
git commit --only -m 'feat(web): Rabbit Hole project hub with Overview, Learn, Map and Sources behind learnPreview' -- packages/web/src/resource-pages.js packages/web/src/resource-pages.test.mjs packages/web/src/RepositoryPage.jsx packages/web/src/SharePage.jsx packages/web/e2e/rabbit-hole-check.mjs
```

Expected: 1 commit, 5 files

---

### Task 45: Canvas route: /apps/canvas-<id> opens Learn or the content-not-on-this-device gate (T02 §8.3); canvas 403 copy

*Area:* Project page, Map, Context panel, canvas route · *Brief:* T08 · *Order:* 11.4

**Files:**
- `packages/web/src/resource-pages.js`
- `packages/web/src/resource-pages.test.mjs`
- `packages/web/src/CanvasPage.jsx`
- `packages/web/src/SharePage.jsx`
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: backend-canvas (orders 6.1-6.4): GET /api/apps/canvas-* returns canvasApp (the row spread: org, name, owner_email, title, project, device_id; plus kind canvas and email); a non-owner gets 403 {error:'This canvas is private to its owner'}; POST /api/canvases {title?, project?, device_id?}; DELETE of an untouched canvas; all routed to LEARN_DB by canvasRoute in dev-worker.js. agent-core: canvasKeys and opensHere (hasLocalContent treats unreadable JSON or blocked storage as content, ratified in CONTRACT v3); ctxOf and executeCommand (create_canvas {title, project?, open:true}); patchSurface and getSurface. The small-learn-dev canvases table, applied at order 5.
- Produces: isCanvasSlug, canvasBack (ONE Back target: the linked project, else /library) and canvasSurface (barHidden true on every canvas route, the gate included; ratified in CONTRACT v3, T02 §6.1 'all canvases'). CanvasPage.jsx decides the gate once, before Learn mounts. Storage that cannot be read counts as content, the same rule opensHere applies, so Learn opens.

- [ ] **Step 1: Failing test: widen the import line and append the canvas test**

```jsx
// import line becomes:
import { canvasBack, canvasSurface, isCanvasSlug, projectCanvases, projectSurface, projectTab, relationshipsOf, resultsArrived, topFiles } from './resource-pages.js';

// append at the end of the file:
test('canvas routes: only canvas-<8 hex> is a canvas, Back goes to its project or the Library, and the bar yields', () => {
  assert.equal(isCanvasSlug('canvas-0a1b2c3d'), true);
  for (const slug of ['canvas-notes', 'canvas-0a1b2c3d9', 'repo-1a2b3c4d-nanogpt', 'counter']) assert.equal(isCanvasSlug(slug), false);
  assert.equal(canvasBack({ project: REPO.name }), `/apps/${REPO.name}`);
  assert.equal(canvasBack({ project: null }), '/library');
  assert.deepEqual(canvasSurface({ name: 'canvas-0a1b2c3d', kind: 'canvas', title: 'Attention' }),
    { place: 'canvas', resource: { kind: 'canvas', slug: 'canvas-0a1b2c3d', title: 'Attention' }, selected: null, barHidden: true, resultsHost: 'sheet', handlers: {} });
});
```

Run:
```bash
cd packages/web && node --test src/resource-pages.test.mjs
```

Expected: SyntaxError: ... does not provide an export named 'canvasBack'; ℹ fail 1 (verified in scratch)

- [ ] **Step 2: Append the canvas helpers to resource-pages.js**

```jsx
// append at the end of the file:
// A D1b canvas record is canvas-<8 hex> (T02 §8.1); any other slug is an app.
export const isCanvasSlug = slug => /^canvas-[0-9a-f]{8}$/.test(slug);

// One Back target for a canvas: its project, else the Library.
export const canvasBack = app => (app.project ? `/apps/${app.project}` : '/library');

// The bar yields on every canvas (T02 §6.1), on the gate screen too.
export const canvasSurface = app => ({ place: 'canvas', resource: { kind: 'canvas', slug: app.name, title: titleOf(app) }, selected: null, barHidden: true, resultsHost: 'sheet', handlers: {} });
```

Run:
```bash
cd packages/web && node --test src/resource-pages.test.mjs
```

Expected: ℹ pass 7, ℹ fail 0 (verified in scratch)

- [ ] **Step 3: Create packages/web/src/CanvasPage.jsx**

```jsx
import { useEffect, useState } from 'react';
import { HardDrive } from 'lucide-react';
import { navigate } from './api.js';
import { Button } from './ui.jsx';
import LearnPage from './LearnPage.jsx';
import { ctxOf, executeCommand } from './agent/commands.js';
import { getSurface, patchSurface } from './agent/surface.js';
import { canvasKeys, opensHere } from './home/canvas-local.js';
import { canvasBack, canvasSurface } from './resource-pages.js';

// /apps/canvas-<id> (T02 §8.3). The record is on the server, the content in one
// browser: never open it as an empty, editable canvas on a device without it.
export default function CanvasPage({ app }) {
  // Decided once, before Learn mounts and writes its keys. Storage that cannot be read counts as content, the rule
  // opensHere already applies (CONTRACT v3 hasLocalContent), so an unreadable browser opens Learn as before.
  const [here] = useState(() => {
    try { return opensHere({ storage: localStorage, keys: canvasKeys({ org: app.org, email: app.email || app.owner_email, slug: app.name }), record: app }); }
    catch { return true; }
  });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const path = window.location.pathname + window.location.search;
  useEffect(() => { patchSurface(canvasSurface(app)); }, [app.name, app.title, path]);
  // LearnPage ignores onBack today (LearnPage.jsx:39); this is the canvas's one Back target when it reads it.
  if (here) return <LearnPage app={app} onBack={() => navigate(canvasBack(app))} />;
  const newCanvas = async () => {
    setBusy(true); setError('');
    // create_canvas opens the new canvas itself (open: true); nothing navigates after it.
    try { await executeCommand('create_canvas', { title: 'Untitled canvas', ...(app.project ? { project: app.project } : {}), open: true }, ctxOf(getSurface())); }
    catch (e) { setError(e.message); setBusy(false); }
  };
  return <main className="flex min-w-0 flex-1 justify-center overflow-auto px-6 pt-[18vh]">
    <section aria-label="Canvas content not in this browser" className="max-w-md text-sm">
      <HardDrive size={20} strokeWidth={1.5} className="mb-3 text-ink-2" />
      <h1 className="text-base font-semibold">This canvas's content isn't in this browser.</h1>
      <p className="mt-2 leading-relaxed text-ink-2">It was created on another device, and its learning content is stored only there. It may also have been cleared from this browser's storage.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {app.project && <Button variant="secondary" onClick={() => navigate(`/apps/${app.project}`)}>Open project</Button>}
        <Button variant="primary" disabled={busy} onClick={newCanvas}>New canvas here</Button>
      </div>
      <details className="mt-4 text-ink-2"><summary className="cursor-pointer">About local-only storage</summary><p className="mt-2 leading-relaxed">Canvas content is saved only in the browser you work in. Cross-device sync isn't available yet.</p></details>
      {error && <p role="alert" className="mt-3 text-danger">{error}</p>}
    </section>
  </main>;
}
```

Run:
```bash
node -e "require('esbuild').transformSync(require('fs').readFileSync('packages/web/src/CanvasPage.jsx','utf8'),{loader:'jsx',jsx:'automatic'});console.log('ok')"
```

Expected: ok (compiled in scratch: scratchpad/pm3/src/CanvasPage.jsx)

- [ ] **Step 4: SharePage.jsx: imports, the Denied canvas copy, the loading skeleton and the CanvasPage branch. Anchor on content. At this point each old text matches exactly once (checked by script on the staged file, on top of shell-home order 1). The branch comes before the ?tab=learn branch, so /apps/canvas-<id>?tab=learn (where learnAction and create_canvas land) also goes through the gate.**

```jsx
// SharePage.jsx (anchor: the CoachingPanel import)
// old
import CoachingPanel from './coaching/CoachingPanel.jsx';
// new
import CanvasPage from './CanvasPage.jsx';
import CoachingPanel from './coaching/CoachingPanel.jsx';

// SharePage.jsx (anchor: the RepositoryPage import)
// old
import RepositoryPage from './RepositoryPage.jsx';
// new
import RepositoryPage from './RepositoryPage.jsx';
import { isCanvasSlug } from './resource-pages.js';

// SharePage.jsx:391, Denied (T02 §13 canvas 403; dev only)
// old
      <div className="pb-3">You don’t have access.{owner ? ` Ask ${owner}` : ''}</div>
// new
      <div className="pb-3">{learnPreview && isCanvasSlug(slug) ? 'This canvas is private to its owner' : <>You don’t have access.{owner ? ` Ask ${owner}` : ''}</>}</div>

// SharePage.jsx:607, the Learn skeleton while a canvas loads
// old
  if (learnPreview && tab === 'learn' && !app && !error) return <LearnLoading />;
// new
  if (learnPreview && (tab === 'learn' || isCanvasSlug(slug)) && !app && !error) return <LearnLoading />;

// SharePage.jsx:608, as left by order 11.3
// old
  if (learnPreview && app?.kind === 'repository' && !error) return <RepositoryPage key={app.name} app={app} catalog={catalog?.apps} />;
// new
  if (learnPreview && app?.kind === 'repository' && !error) return <RepositoryPage key={app.name} app={app} catalog={catalog?.apps} />;
  if (learnPreview && app?.kind === 'canvas' && !error) return <CanvasPage key={app.name} app={app} />;
```

- [ ] **Step 5: Add the pm/canvas block to the shared harness, directly ABOVE the marker line (it must match exactly once). The block is wrapped in { }, declares nothing at top level and never closes the browser. It creates one untouched canvas in small-learn-dev and deletes it.**

```jsx
// packages/web/e2e/rabbit-hole-check.mjs: insert directly above
// `// ── journey checks: each area inserts its block above this line, wrapped in { } ──`
// ── project-map: the canvas route gate (T02 §8.3) ──
{
  await check('pm/canvas: content from another device shows the gate, never an empty canvas', async () => {
    const page = await open();
    const made = await page.request.post(`${base}/api/canvases`, { data: { title: `e2e gate ${Date.now()}`, device_id: 'e2e-another-device' } });
    must(made.ok(), `create canvas: HTTP ${made.status()}`);
    const { name } = await made.json();
    try {
      await page.goto(`${base}/apps/${name}`);
      await page.getByRole('heading', { name: "This canvas's content isn't in this browser." }).waitFor({ timeout: 20000 });
      must(await page.getByLabel('Lesson canvas').count() === 0, 'Learn mounted behind the gate');
      must(await page.getByRole('button', { name: 'New canvas here', exact: true }).isEnabled(), 'New canvas here is missing or disabled');
      must(await page.getByRole('button', { name: 'Open project', exact: true }).count() === 0, 'Open project shown for a standalone canvas');
      await page.screenshot({ path: 'e2e/shots/pm-canvas-gate.png' });
    } finally {
      const del = await page.request.delete(`${base}/api/apps/${name}`); // untouched, so the Undo delete is allowed (T02 §8.4)
      if (!del.ok()) await page.request.post(`${base}/api/apps/${name}/archive`);
    }
    await page.context().close();
  });
}
```

Run:
```bash
cd packages/web && node --check e2e/rabbit-hole-check.mjs && grep -c 'await browser.close();' e2e/rabbit-hole-check.mjs
```

Expected: node --check prints nothing, then 1

- [ ] **Step 6: Gate: unit tests and both builds**

Run:
```bash
cd packages/web && VITE_COACHING_DEV=true VITE_BYOC_DEV=true npm run build -- --outDir dist-dev && npm run build && cd ../.. && make test-unit
```

Expected: The builds pass; make test-unit exits 0 (web +1 test)

- [ ] **Step 7: Commit named paths only**

Run:
```bash
git add packages/web/src/CanvasPage.jsx && git commit --only -m 'feat(web): canvas route opens Learn or the content-not-on-this-device state' -- packages/web/src/resource-pages.js packages/web/src/resource-pages.test.mjs packages/web/src/CanvasPage.jsx packages/web/src/SharePage.jsx packages/web/e2e/rabbit-hole-check.mjs
```

Expected: 1 commit, 5 files

---

### Task 46: App pages: working ?tab=runbook, run and logs; dev lands on Runbook while there is no graph (D3); app surface published

*Area:* Project page, Map, Context panel, canvas route · *Brief:* T09 · *Order:* 11.5

**Files:**
- `packages/web/src/resource-pages.js`
- `packages/web/src/resource-pages.test.mjs`
- `packages/web/src/SharePage.jsx`
- `packages/web/e2e/rabbit-hole-check.mjs`
- `packages/web/e2e/app-tabs-check.mjs`
- `docs/features/app-tabs.md`

**Interfaces:**
- Consumes: patchSurface (agent-core). Root's route baseline (shell-home 2.5, set in useLayoutEffect) for the error states.
- Produces: appTab, shownAppTab and appSurface. The live build renders app tabs exactly as today (asserted with dev=false). The dev app surface (resource kind app; resultsHost panel on the Graph tab) is what agent-ui 11.6 'Agent Bar checks on project and app pages' consumes. e2e/app-tabs-check.mjs is removed: all 10 of its checks assert the pre-Rabbit-Hole dev page, and pm/context plus pm/apptabs cover the same ground in the one harness.

- [ ] **Step 1: Failing test: final import line and two appended tests**

```jsx
// import line becomes:
import { appSurface, appTab, canvasBack, canvasSurface, isCanvasSlug, projectCanvases, projectSurface, projectTab, relationshipsOf, resultsArrived, shownAppTab, topFiles } from './resource-pages.js';

// append at the end of the file:
test('app tabs: live build unchanged, dev adds runbook/run/logs links and lands on Runbook', () => {
  for (const tab of ['runbook', 'run', 'logs', 'learn']) assert.equal(appTab(`?tab=${tab}`, false), null);
  for (const tab of ['agent', 'graph', 'code']) assert.equal(appTab(`?tab=${tab}`, false), 'graph');
  assert.equal(appTab('', false), null);
  assert.equal(shownAppTab(null, 'server', false), 'graph');
  for (const tab of ['runbook', 'run', 'logs', 'learn']) assert.equal(appTab(`?tab=${tab}`, true), tab);
  assert.equal(shownAppTab(null, 'job', true), 'runbook');
  assert.equal(shownAppTab('run', 'server', true), 'runbook');
  assert.equal(shownAppTab('run', 'job', true), 'run');
  assert.equal(shownAppTab('logs', 'server', true), 'logs');
});

test('app surface: panel results on Graph, bar hidden on Learn and runs', () => {
  const app = { org: 'gmail-com', name: 'counter', kind: 'server' };
  const graphTab = appSurface({ app, tab: 'graph' });
  assert.deepEqual(graphTab.resource, { kind: 'app', slug: 'counter', title: 'counter' });
  assert.equal(graphTab.resultsHost, 'panel');
  assert.equal(appSurface({ app, tab: 'runbook' }).resultsHost, 'sheet');
  assert.equal(appSurface({ app: { ...app, hosting: 'aws' }, tab: 'graph' }).resultsHost, 'sheet');
  assert.equal(appSurface({ app, tab: 'learn' }).barHidden, true);
  const run = appSurface({ app, runId: 'r-1', tab: 'graph' });
  assert.deepEqual([run.place, run.barHidden], ['run', true]);
});
```

Run:
```bash
cd packages/web && node --test src/resource-pages.test.mjs
```

Expected: SyntaxError: ... does not provide an export named 'appSurface'; ℹ fail 1 (verified in scratch)

- [ ] **Step 2: Append the app helpers to resource-pages.js**

```jsx
// append at the end of the file:
// App page tab from ?tab. null means the page default (shownAppTab). The dev build adds
// working runbook, run and logs links (app-tabs.md:26); the live build is unchanged.
export function appTab(search, dev) {
  const tab = new URLSearchParams(search).get('tab');
  if (tab === 'agent' || tab === 'code') return 'graph'; // legacy links from before the Agent tab became Graph
  if (tab === 'graph') return tab;
  return dev && ['learn', 'runbook', 'run', 'logs'].includes(tab) ? tab : null;
}

// D3: in dev, server and job apps land on Runbook while they have no graph.
// ponytail: no app has a graph yet (SharePage.jsx:822-823 is an empty div); land on Graph again once graph data exists.
export function shownAppTab(tab, kind, dev) {
  if (tab === 'run' && kind !== 'job') return 'runbook'; // servers have no Run tab
  return tab ?? (dev ? 'runbook' : 'graph');
}

// The page-owned surface on an app page. The Graph tab sends answers to its Context column,
// except AWS jobs without chat, which show a notice there instead (SharePage.jsx:828).
export function appSurface({ app, runId, tab }) {
  const place = runId ? 'run' : tab === 'learn' ? 'learn' : 'app';
  const panel = place === 'app' && tab === 'graph' && !(app.hosting === 'aws' && !app.app_chat);
  return { place, resource: { kind: 'app', slug: app.name, title: titleOf(app) }, selected: null,
    barHidden: place !== 'app', resultsHost: panel ? 'panel' : 'sheet', handlers: {} };
}
```

Run:
```bash
cd packages/web && node --test src/resource-pages.test.mjs
```

Expected: ℹ pass 9, ℹ fail 0 (verified in scratch)

- [ ] **Step 3: SharePage.jsx edits. Anchor on content. At this point each old text matches exactly once (checked by script on the staged file; the new effect sits after the last hook and before the first early return at :607).**

```jsx
// SharePage.jsx: the resource-pages import added in 11.4
// old
import { isCanvasSlug } from './resource-pages.js';
// new
import { appSurface, appTab, isCanvasSlug, shownAppTab } from './resource-pages.js';

// SharePage.jsx (anchor: the Shell import)
// old
import Shell from './Shell.jsx';
// new
import Shell from './Shell.jsx';
import { patchSurface } from './agent/surface.js';

// SharePage.jsx:66-68, the initialAppTab body
// old
  const tab = new URLSearchParams(window.location.search).get('tab');
  if (tab === 'agent') return 'graph'; // legacy links from before the Agent tab became Graph
  return tab === 'graph' || (learnPreview && tab === 'learn') ? tab : null;
// new
  return appTab(window.location.search, learnPreview);

// SharePage.jsx:550-551, the end of the slug-reset effect
// old
    return () => { loadId.current++; };
  }, [slug, !!catalog, catalog?.org, catalogApp?.aws_connection?.id]);
// new
    return () => { loadId.current++; };
  }, [slug, !!catalog, catalog?.org, catalogApp?.aws_connection?.id]);

  // Rabbit Hole dev: tell the Agent Bar where it is (T02 §6). Repository and canvas pages publish their own;
  // error states publish nothing, so the route baseline (resource null) stands.
  const shown = shownAppTab(tab, app?.kind, learnPreview), path = window.location.pathname + window.location.search;
  useEffect(() => {
    if (learnPreview && app && !error && app.kind !== 'repository' && app.kind !== 'canvas') patchSurface(appSurface({ app, runId, tab: shown }));
  }, [app, error, runId, shown, path]);

// SharePage.jsx:562
// old
  const graphFull = !runId && (tab ?? 'graph') === 'graph';
// new
  const graphFull = !runId && shown === 'graph';

// SharePage.jsx:727
// old
            <Tabs value={tab ?? 'graph'} onValueChange=
// new
            <Tabs value={shown} onValueChange=

// SharePage.jsx:858
// old
            {app.lastOpened && (tab ?? 'graph') !== 'graph' && (
// new
            {app.lastOpened && shown !== 'graph' && (
```

Run:
```bash
node -e "require('esbuild').transformSync(require('fs').readFileSync('packages/web/src/SharePage.jsx','utf8'),{loader:'jsx',jsx:'automatic'});console.log('ok')"
```

Expected: ok (all four staged SharePage versions compile in scratch: pm3/src/SharePage.s11_2..s11_5.jsx)

- [ ] **Step 4: Remove the superseded dev check and record D3 in app-tabs.md**

```markdown
// docs/features/app-tabs.md:3-4
// old
Status: built and deployed to small-cp-dev (worker version `81c350d0`,
2026-09-17); verified by `packages/web/e2e/app-tabs-check.mjs` (10 checks).
// new
Status: built and deployed to small-cp-dev (worker version `81c350d0`,
2026-09-17); verified then by `packages/web/e2e/app-tabs-check.mjs` (10 checks).
The Rabbit Hole dev build (`learnPreview`, T02 §12, D3) lands server and job apps
on Runbook while they have no graph, and its Graph tab shows the Context panel
instead of the Graph Agent. `packages/web/e2e/rabbit-hole-check.mjs`
(`ONLY=pm/`) verifies that; the old check was removed.
```

Run:
```bash
git rm packages/web/e2e/app-tabs-check.mjs
```

Expected: rm 'packages/web/e2e/app-tabs-check.mjs'

- [ ] **Step 5: Add the pm/apptabs block to the shared harness, directly ABOVE the marker line (it must match exactly once). The block is wrapped in { }, declares nothing at top level and never closes the browser.**

```jsx
// packages/web/e2e/rabbit-hole-check.mjs: insert directly above
// `// ── journey checks: each area inserts its block above this line, wrapped in { } ──`
// ── project-map: app page tabs (T02 §12, D3) ──
{
  await check('pm/apptabs: hosted apps land on Runbook in dev; runbook, logs and run links and legacy agent/code work', async () => {
    const hosted = apps.find((a) => (a.kind === 'server' || a.kind === 'job') && a.hosting !== 'aws');
    must(hosted, 'needs a hosted app in this workspace');
    const page = await open();
    const cases = [['', 'Runbook'], ['?tab=runbook', 'Runbook'], ['?tab=logs', 'Logs'], ['?tab=agent', 'Graph'], ['?tab=code', 'Graph'], ['?tab=run', hosted.kind === 'job' ? 'Run' : 'Runbook']];
    for (const [query, want] of cases) {
      await page.goto(`${base}/apps/${hosted.name}${query}`);
      const tab = page.getByRole('tab', { name: want, exact: true });
      await tab.waitFor({ timeout: 20000 });
      must(await tab.getAttribute('data-state') === 'active', `${query || 'no ?tab'}: ${want} is not active`);
    }
    await page.goto(`${base}/apps/${hosted.name}?tab=graph`);
    await page.locator('[aria-label="App graph"]').waitFor({ timeout: 20000 }); // the blank graph canvas stays (SharePage.jsx:823)
    await page.screenshot({ path: 'e2e/shots/pm-app-graph.png' });
    await page.context().close();
  });
}
```

Run:
```bash
cd packages/web && node --check e2e/rabbit-hole-check.mjs && grep -c 'await browser.close();' e2e/rabbit-hole-check.mjs
```

Expected: node --check prints nothing, then 1. With all five pm blocks in place the harness adds no top-level names (verified in scratch: pm3/harness.final.mjs).

- [ ] **Step 6: Gate: unit tests and both builds**

Run:
```bash
cd packages/web && VITE_COACHING_DEV=true VITE_BYOC_DEV=true npm run build -- --outDir dist-dev && npm run build && cd ../.. && make test-unit
```

Expected: The builds pass; make test-unit exits 0 (web +2 tests)

- [ ] **Step 7: Commit named paths only**

Run:
```bash
git commit --only -m 'feat(web): dev app pages honour runbook, run and logs links and land on Runbook' -- packages/web/src/resource-pages.js packages/web/src/resource-pages.test.mjs packages/web/src/SharePage.jsx packages/web/e2e/rabbit-hole-check.mjs packages/web/e2e/app-tabs-check.mjs docs/features/app-tabs.md
```

Expected: 1 commit, 6 files (one deletion)

---

### Task 47: Agent Bar checks on project and app pages

*Area:* Agent Bar UI · *Brief:* T05 · *Order:* 11.6

**Files:**
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: Orders 10.2 and 10.3. project-map 11.2 (ContextBody: a section with aria-label 'Context' rendering <ResultList scopeKey={resultsKey(scopeOf(surface))} />), 11.3 (the Project hub publishes { kind: 'project', slug, title: titleOf(app) }, RepositoryPage patches resource.status on every poll, and ?tab=map has resultsHost 'panel') and 11.5 (app pages publish { kind: 'app', slug, title }). A repository whose map is ready (status 'ready' and commit_sha) and any app in the workspace; checks that need one are skipped when the catalog has none, and the log line says which.
- Produces: The 'bar-page:' checks: the project chip and placeholder, a Map ask in the Context panel, History and New chat, the retarget offer between a project and an app, chip ×, and /teach opening Learn exactly once.

- [ ] **Step 1: Precondition: the project and app pages publish their surface**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && grep -c "patchSurface" src/RepositoryPage.jsx src/SharePage.jsx && grep -c 'aria-label="Context"' src/ContextPanel.jsx
```

Expected: Every count is 1 or more. If one is 0, stop: project-map 11.2, 11.3 or 11.5 has not landed, and every chip check would time out.

- [ ] **Step 2: Insert the page checks above the harness marker and run them against the clone as it stands**

```js
// packages/web/e2e/rabbit-hole-check.mjs: insert this block directly ABOVE the marker line
//   // ── journey checks: each area inserts its block above this line, wrapped in { } ──
// (the one harness, settings-deploy order 0.5). It reuses the harness's top-level base, UA, session, apps,
// repo, plain, wsLabel, check, must, open, loaded, spa, settings, startDialog, barOf and barInput; it declares
// nothing at top level and never closes the browser.
{
  // ── agent-ui (T02 §6.2-§6.5) on project and app pages, which publish their surface
  // (project-map 11.3, 11.5). Sends only in project scope (LEARN_DB): 2 LLM calls. ──
  const ready = apps.find((a) => a.kind === 'repository' && a.status === 'ready' && a.commit_sha);
  const barOpen = async (path) => {
    const page = await open();
    await page.goto(`${base}${path}`);
    await barOf(page).waitFor({ timeout: 20000 });
    return page;
  };
  const chip = (page) => barOf(page).locator('[data-scope-chip="resource"]');
  console.log(`agent-ui bar-page: project ${ready?.repo || 'none, project checks skipped'} · app ${plain?.name || 'none, app checks skipped'}`);

  if (ready) await check('bar-page: a project names itself in the chip and the placeholder, and the chip does not stick on /members', async () => {
    const page = await barOpen(`/apps/${ready.name}`);
    await chip(page).getByText(ready.repo, { exact: true }).waitFor({ timeout: 15000 });
    must(await barInput(page).getAttribute('placeholder') === `Ask about ${ready.repo}…`, 'the placeholder does not name the ready project');
    await spa(page, '/members');
    await barOf(page).waitFor({ timeout: 10000 });
    must(await barOf(page).locator('[data-scope-chip]').count() === 0, 'a stale chip on /members');
    await page.context().close();
  });

  if (ready) await check('bar-page: a Map ask lands in the Context panel, names its scope while streaming across navigation, and Stop ends it', async () => {
    const page = await barOpen(`/apps/${ready.name}?tab=map`);
    await chip(page).waitFor({ timeout: 15000 }); // project scope (LEARN_DB) is proven before anything is sent
    const question = 'Where should I start reading?';
    await barInput(page).fill(question);
    await barInput(page).press('Enter');
    await page.getByRole('region', { name: 'Context', exact: true }).getByText(question).waitFor({ timeout: 10000 });
    must(await page.locator('[data-result-sheet]').count() === 0, 'the sheet opened over the Context panel');
    const status = barOf(page).getByText(/^Answering in /);
    await status.waitFor({ timeout: 10000 });
    await spa(page, '/library');
    if (await status.count()) {
      await barOf(page).getByRole('button', { name: 'Stop' }).click();
      await status.waitFor({ state: 'detached', timeout: 5000 });
    }
    const line = await page.locator('[data-result-line]').textContent();
    must(line.startsWith(`${ready.repo} · `), `the collapsed line ${line} does not name the project`);
    await page.context().close();
  });

  if (ready) await check('bar-page: History lists this project threads and reopens one; New chat clears the results', async () => {
    const page = await barOpen(`/apps/${ready.name}`);
    await chip(page).waitFor({ timeout: 15000 });
    await barInput(page).fill('Which file defines the model?');
    await barInput(page).press('Enter');
    const sheet = page.locator('[data-result-sheet]');
    await sheet.waitFor({ timeout: 10000 });
    await barOf(page).getByText(/^Answering in /).waitFor({ state: 'detached', timeout: 120000 });
    await page.screenshot({ path: 'e2e/shots/agent-bar-sheet.png' });
    await sheet.getByRole('button', { name: 'New chat' }).click();
    must(await sheet.getByText('Which file defines the model?').count() === 0, 'New chat kept the results');
    await sheet.getByRole('button', { name: 'History' }).click();
    const row = sheet.getByRole('button', { name: /Which file defines the model\?/ }).first();
    await row.waitFor({ timeout: 10000 });
    await row.click();
    await sheet.getByText('Which file defines the model?').first().waitFor({ timeout: 10000 });
    await page.context().close();
  });

  if (ready && plain) await check('bar-page: a waiting draft keeps its scope; Keep; Ask about X instead takes the text and the project keeps its draft', async () => {
    const page = await barOpen(`/apps/${ready.name}`);
    const bar = barOf(page);
    const offer = bar.getByText("you're now viewing");
    await chip(page).waitFor({ timeout: 15000 });
    await barInput(page).fill('Explain the tokenizer merge loop');
    await spa(page, `/apps/${plain.name}`);
    await offer.waitFor({ timeout: 15000 });
    must(await barInput(page).inputValue() === 'Explain the tokenizer merge loop', 'the draft was lost on navigation');
    await bar.getByRole('button', { name: /^Keep / }).click();
    must(await offer.count() === 0, 'Keep did not dismiss the offer');
    await spa(page, `/apps/${ready.name}`);
    await chip(page).waitFor({ timeout: 15000 });
    must(await offer.count() === 0, 'an offer on the draft own scope');
    await spa(page, `/apps/${plain.name}`);
    await bar.getByRole('button', { name: /^Ask about .* instead$/ }).click();
    must(await offer.count() === 0, 'the offer stayed after switching');
    must(await barInput(page).inputValue() === 'Explain the tokenizer merge loop', 'the text did not come along');
    await barInput(page).fill('');
    await spa(page, `/apps/${ready.name}`);
    await chip(page).waitFor({ timeout: 15000 });
    must(await barInput(page).inputValue() === 'Explain the tokenizer merge loop', 'the project draft was not restored');
    await page.context().close();
  });

  if (ready) await check('bar-page: × on the project chip widens to the workspace and takes the draft along', async () => {
    const page = await barOpen(`/apps/${ready.name}`);
    await chip(page).waitFor({ timeout: 15000 });
    await barInput(page).fill('carry me');
    await chip(page).getByRole('button').click();
    must(await barOf(page).locator('[data-scope-chip]').count() === 0, 'the chip is still shown');
    must(await barInput(page).inputValue() === 'carry me', 'the draft did not move with ×');
    must(await barInput(page).getAttribute('placeholder') === 'Start, open, ask, or paste a link…', 'not the workspace scope');
    await page.context().close();
  });

  if (ready) await check('bar-page: /teach on a project opens Learn once, sends nothing while learnHandoff is false, and keeps the prompt', async () => {
    const page = await barOpen(`/apps/${ready.name}`);
    await chip(page).waitFor({ timeout: 15000 });
    const before = await page.evaluate(() => history.length);
    await barInput(page).fill('/teach why does attention scale by sqrt(dk)?');
    await barInput(page).press('Enter');
    await page.getByText("Opened Learn. Your prompt wasn't transferred; it's kept here.").waitFor({ timeout: 10000 });
    must(new URL(page.url()).searchParams.get('tab') === 'learn', 'not on Learn');
    must(await page.evaluate(() => history.length) === before + 1, 'Learn was opened more than once'); // learnAction navigates; the bar never does
    must(await page.evaluate(() => sessionStorage.getItem('small.learn.request')) === null, 'a Learn request was written');
    await spa(page, `/apps/${ready.name}`);
    await barOf(page).waitFor({ timeout: 10000 });
    must(await barInput(page).inputValue() === '/teach why does attention scale by sqrt(dk)?', 'the prompt was not kept');
    await page.context().close();
  });
}
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=bar-page node e2e/rabbit-hole-check.mjs
```

Expected: This task adds no product code: these are acceptance checks over 10.2, 10.3 and project-map 11.2-11.5, so they can pass on the first run if the clone already serves 11.5. A FAIL names what is missing; fix it in the owning task and rerun. Only project-scope asks are sent (LEARN_DB).

- [ ] **Step 3: Deploy HEAD; run every bar check; inspect the sheet; hand over the link**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && export VITE_COACHING_DEV=true VITE_BYOC_DEV=true && VITE_TLDRAW_LICENSE_KEY=$(node --input-type=module -e "import {readFileSync} from 'node:fs'; import {parseEnv} from 'node:util'; const key = parseEnv(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8')).TLDRAW_LICENSE_KEY; if (!key) throw new Error('Missing TLDRAW_LICENSE_KEY'); process.stdout.write(key);") && export VITE_TLDRAW_LICENSE_KEY && npm run build -- --outDir dist-dev; built=$?; unset VITE_COACHING_DEV VITE_BYOC_DEV VITE_TLDRAW_LICENSE_KEY; [ $built -eq 0 ] && npx wrangler deploy --config wrangler.dev.jsonc --name small-cp-dev-smart-home
# then:
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=build,start-host,bar node e2e/rabbit-hole-check.mjs
```

Expected: 'all checks passed', with the 'agent-ui bar-page:' line naming the project and app used. Cost per run: 2 LLM calls on the dev key (the Map ask, stopped early, and the History ask) and 2 LEARN_DB project threads; nothing reaches /api/ask. /teach leaves history.length exactly one higher (learnAction navigated once; the bar did not). Inspect e2e/shots/agent-bar-sheet.png, then open https://small-cp-dev-smart-home.zeroshothq.workers.dev/apps in a clean profile in both themes and hand over the link.

- [ ] **Step 4: Commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git add packages/web/e2e/rabbit-hole-check.mjs && git commit --only -m 'test(web): Agent Bar checks on project and app pages - chip, Context panel results, History, retarget offer, teach' -- packages/web/e2e/rabbit-hole-check.mjs
```

Expected: make test-unit is green. One commit containing only the harness.

---

### Task 48: Deploy this worktree's clone, run the project-map browser checks, inspect the pixels, and return the review link

*Area:* Project page, Map, Context panel, canvas route · *Brief:* T12 · *Order:* 12.5

**Files:**

**Interfaces:**
- Consumes: Every project-map commit (11.1-11.5) plus everything ordered before them. The harness from settings-deploy 0.5: the SMALL_BASE clone guard, SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env, the build check and the verified deploy command, which reads TLDRAW_LICENSE_KEY in-process and never copies or prints the file. agent-ui 10.2's STOP decision on askLiveOnPreview. backend-canvas 6.4's deploy gate (the canvases table verify SELECT). The test workspace must hold a repository with a ready map and a hosted, non-AWS app.
- Produces: https://small-cp-dev-smart-home.zeroshothq.workers.dev serving this branch, with pass evidence for pm/map, pm/context (2), pm/project (2), pm/canvas and pm/apptabs, six screenshots under packages/web/e2e/shots (gitignored, .gitignore:170) and the review links. Never the bare shared small-cp-dev.

- [ ] **Step 1: Precondition: the Live-D1 guard keeps the value the user chose at agent-ui's Agent Bar deploy STOP step. This task never changes it.**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && grep -n 'askLiveOnPreview' packages/web/src/flags.js
```

Expected: One export line whose value matches the recorded (a)/(b) decision (default false). If no decision was recorded, or the value differs, stop and ask the user before deploying.

- [ ] **Step 2: Precondition: backend-canvas 6.4's deploy gate. This is a read-only verify SELECT on small-learn-dev (command verbatim from backend-canvas 'Dev worker wiring', step 4). The user runs it via '!'.**

Run:
```bash
cd C:/Users/cyudhist/Desktop/workspace/smart-home/packages/web; npx wrangler d1 execute small-learn-dev --remote --config wrangler.dev.jsonc --command "SELECT name, sql FROM sqlite_master WHERE type='table' AND name='canvases'"
```

Expected: One row named canvases. If there is no row, stop: T12 prep (backend-canvas order 5) is not applied, and a deploy would break every canvas route.

- [ ] **Step 3: Build dist-dev and deploy only to this worktree's clone (settings-deploy 0.5's verified command, verbatim). The key is never printed, no .env is copied, and wrangler deploy is never run without --name.**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && key=$(node --input-type=module -e "import {readFileSync} from 'node:fs'; import {parseEnv} from 'node:util'; const key = parseEnv(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8')).TLDRAW_LICENSE_KEY; if (!key) throw new Error('Missing TLDRAW_LICENSE_KEY'); process.stdout.write(key);") && VITE_COACHING_DEV=true VITE_BYOC_DEV=true VITE_TLDRAW_LICENSE_KEY="$key" npm run build -- --outDir dist-dev && npx wrangler deploy --config wrangler.dev.jsonc --name small-cp-dev-smart-home
```

Expected: Vite prints 'built in'. Wrangler prints 'Uploaded small-cp-dev-smart-home', the clone URL and a Current Version ID; record the ID. Live small-cp and the shared small-cp-dev are untouched. If the review breaks, use settings-deploy 0.5's exact rollback command.

- [ ] **Step 4: Verify the loaded build, then run the build check and this area's checks. SMALL_ENV_FILE is set exactly as the harness requires.**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && grep -o '/static/index-[A-Za-z0-9_-]*[.]js' dist-dev/index.html && curl -s -A small-rabbit-hole-check https://small-cp-dev-smart-home.zeroshothq.workers.dev/apps | grep -o '/static/index-[A-Za-z0-9_-]*[.]js' && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=build,pm/ node e2e/rabbit-hole-check.mjs
```

Expected: The two grep lines are identical. A mismatch means rollout lag: wait about 20 s and rerun. The harness prints its fixture line, then 8 'ok:' lines (build, pm/map, pm/context x2, pm/project x2, pm/canvas, pm/apptabs), then 'all checks passed'. The canvas check creates and deletes one untouched canvas row in small-learn-dev (LEARN_DB). The other checks only read: the clone binds the live D1 'small' as DB (wrangler.dev.jsonc:71-72), and no pm check runs, stops, shares or renames an app.

- [ ] **Step 5: Inspect the pixels, then return the review links**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && ls e2e/shots/pm-*.png
```

Expected: Six files: pm-map-dark.png, pm-map-drawer-375-light.png, pm-map-drawer-375-dark.png, pm-project-overview.png, pm-canvas-gate.png and pm-app-graph.png. Open each with the Read tool. Check that the dark graph is legible, the drawer sits above the bar at 375px in both themes, there is no second composer, and the gate copy and buttons are right. Then open the clone from a clean browser state: /apps/<repository>, /apps/<repository>?tab=map and /apps/<hosted app>?tab=graph. Fix any finding in a follow-up task before handing off. Return https://small-cp-dev-smart-home.zeroshothq.workers.dev with those paths for review. Do not click Run, Stop or Share on real apps.

---

### Task 49: Insert canvas API checks above the shared e2e harness marker and run them against the deployed smart-home clone

*Area:* Canvas record (LEARN_DB) and dev worker · *Brief:* T12 · *Order:* 12.9

**Files:**
- `packages/web/e2e/rabbit-hole-check.mjs`

**Interfaces:**
- Consumes: packages/web/e2e/rabbit-hole-check.mjs from settings-deploy order 0.5 (top-level base, UA, session, check, must; the marker line); the clone small-cp-dev-smart-home as last deployed (every deploy from order 8.5 on contains Task 6.4)
- Produces: Five 'ok: canvas API: ...' lines prove the T12 schema apply and the Task 6.4 wiring against the real identity and the real small-learn-dev. The block is wrapped in { }, declares nothing at top level, adds no browser.close(), and creates at most one untouched canvas that it always deletes (also when ONLY skips the Undo check). Runs before settings-deploy order 13, whose final 'Deploy HEAD and run every label' needs this block already in.

- [ ] **Step 1: Confirm the harness exposes the marker exactly once and the top-level names this block uses. Do not invent names; if any is missing, stop and ask the settings-deploy owner.**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && grep -cF '// ── journey checks: each area inserts its block above this line, wrapped in { } ──' e2e/rabbit-hole-check.mjs && grep -nF -e "const base = process.env.SMALL_BASE || '';" -e "const UA = { 'User-Agent': 'small-rabbit-hole-check' };" -e 'const { session } = await login.json();' -e 'const check = async (label, fn) => {' -e 'const must = (cond, message) => {' e2e/rabbit-hole-check.mjs && { grep -c 'canvas API:' e2e/rabbit-hole-check.mjs || true; }
```

Expected: 1 (the marker, once), then five matching lines (base, UA, session, check, must), then 0 (no canvas API block yet); exit 0

- [ ] **Step 2: Insert the block immediately above the marker line (block-scoped, nothing at top level, no browser.close())**

```js
// packages/web/e2e/rabbit-hole-check.mjs: insert immediately ABOVE the marker line (Edit: old_string = the marker line, new_string = this block, a blank line, then the marker line unchanged)
// ---- canvas API on this clone (backend-canvas) ----
// Real identity and real small-learn-dev: proves the T12 schema apply and the dev-worker wiring.
// The canvas stays untouched, so DELETE removes it. The create happens inside a check, and the
// last line deletes it if ONLY skipped the Undo check, so no filtered run leaves a row behind.
{
  const canvasApi = (path, init = {}) => fetch(`${base}${path}`, { ...init, headers: { ...UA, Cookie: `small_session=${session}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  let canvas = null;
  await check('canvas API: POST /api/canvases creates a LEARN_DB record', async () => {
    const r = await canvasApi('/api/canvases', { method: 'POST', body: JSON.stringify({ title: 'rabbit-hole-check canvas' }) });
    if (r.ok) canvas = await r.json();
    must(r.status === 201 && /^canvas-[a-f0-9]{8}$/.test(canvas?.name || ''), `HTTP ${r.status}`);
  });
  await check('canvas API: GET /api/apps merges the new canvas', async () => {
    must(canvas, 'no canvas created');
    const d = await (await canvasApi('/api/apps')).json();
    must(d.apps.some((a) => a.name === canvas.name && a.kind === 'canvas'), 'not in catalog');
  });
  await check('canvas API: archive hides it and ?archived=1 lists it', async () => {
    must(canvas, 'no canvas created');
    must((await canvasApi(`/api/apps/${canvas.name}/archive`, { method: 'POST' })).ok, 'archive failed');
    const d = await (await canvasApi('/api/canvases?archived=1')).json();
    must(d.canvases.some((c) => c.name === canvas.name), 'missing from archived list');
    must((await canvasApi(`/api/apps/${canvas.name}/restore`, { method: 'POST' })).ok, 'restore failed');
  });
  await check('canvas API: history for a new canvas is empty', async () => {
    must(canvas, 'no canvas created');
    // The exact list path the bar and Learn use for canvas History (Task 6.2).
    const d = await (await canvasApi(`/api/ask/threads?scope=learn&ref=${encodeURIComponent(canvas.name)}`)).json();
    must(Array.isArray(d.threads) && !d.threads.length, JSON.stringify(d));
  });
  await check('canvas API: Undo deletes the untouched canvas', async () => {
    must(canvas, 'no canvas created');
    const r = await canvasApi(`/api/apps/${canvas.name}`, { method: 'DELETE' });
    must(r.status === 200, `HTTP ${r.status}`);
    canvas = null;
  });
  if (canvas) await canvasApi(`/api/apps/${canvas.name}`, { method: 'DELETE' }); // ONLY skipped Undo: never leave a small-learn-dev row
}

// ── journey checks: each area inserts its block above this line, wrapped in { } ──
```

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && node --check e2e/rabbit-hole-check.mjs && grep -cF '// ── journey checks: each area inserts its block above this line, wrapped in { } ──' e2e/rabbit-hole-check.mjs && grep -c 'await browser.close();' e2e/rabbit-hole-check.mjs
```

Expected: node --check exit 0; marker count 1; browser.close count 1 (the base's own, unchanged)

- [ ] **Step 3: Run only this block's labels against the clone as it stands (it contains Task 6.4: every clone deploy from order 8.5 on does). If a deploy returned less than about 20 s ago, wait first (rollout lag). SMALL_ENV_FILE is set exactly as the harness requires; nothing is copied.**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY='canvas API' node e2e/rabbit-hole-check.mjs
```

Expected: The fixture line, then 'ok: canvas API: POST /api/canvases creates a LEARN_DB record', 'ok: canvas API: GET /api/apps merges the new canvas', 'ok: canvas API: archive hides it and ?archived=1 lists it', 'ok: canvas API: history for a new canvas is empty', 'ok: canvas API: Undo deletes the untouched canvas', then 'all checks passed'. A 404 on the POST means the clone predates Task 6.4 or T12 prep: re-run T12 prep's verify SELECT, then ask the owner of the next deploy (settings-deploy 13) rather than deploying from here.

- [ ] **Step 4: Commit (before settings-deploy order 13 deploys HEAD and runs every label)**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git status --short && git commit --only packages/web/e2e/rabbit-hole-check.mjs -m 'test(e2e): canvas API checks against the dev clone and small-learn-dev'
```

Expected: make test-unit green; one commit, one path

---

### Task 50: Complete the e2e (J01, J02, J06, J11, J15 with a bar draft, J17 via the bar), check the harness structure and askLiveOnPreview, run everything on the clone, inspect the pixels, record web.md, and hand off the review link

*Area:* Settings, Connections, Start dialog, e2e, deploy · *Brief:* T11 · *Order:* 13

**Files:**
- `packages/web/e2e/rabbit-hole-check.mjs`
- `docs/features/web.md`

**Interfaces:**
- Consumes: Everything on HEAD, including every other area's harness block above the marker, each wrapped in { }: shell-home (2.5, 9.1-9.5, 9.9), agent-ui (8.5, 10.2, 10.3, 11.6), project-map (11.1-11.5, 12.5) and backend-canvas (12.9, which comes before this task). From shell-home, Home in the dev build at /apps: blocks are <section> elements; the Continue block is headed 'Continue — on this device' with 'Last explored' and 'Next' lines and the buttons [Continue learning], [Open project] and [Open] (T02 §3.1); there is one primary [Start a rabbit hole] in <main> (§3.3); the Library shows its 'Shared with me' chip on /apps?s=shared (§4). From shell-home flags.js (order 1): askLiveOnPreview, false unless the user chose otherwise at agent-ui's Agent Bar deploy STOP step (10.2). From agent-ui: [data-agent-bar], [data-chat-composer] input, [data-scope-chip="resource"] and [data-result-sheet]; the retarget offer "you're now viewing" with 'Keep <Y>' (§6.3); choose pills whose visible text is '<title> · <Kind>' and list rows that carry the kind (catalog kindLabel: Project, Canvas, App · job, App · server; Figma F6); the open_settings notice rendered in the bar. From agent-core: the router rules 'find', 'settings' and 'connect <provider>', and home/canvas-local.js canvasKeys({org, email, slug}). From backend-canvas and project-map: POST /api/canvases, the canvas route opening Learn with the bar hidden, and DELETE of an untouched canvas (§8.4).
- Produces: One command that proves J01, J02, J06, J11 and J15-J22 on https://small-cp-dev-smart-home.zeroshothq.workers.dev, 28 inspected screenshots (both themes at 1500 and 390 px), the web.md record, and the review link. make test-integration is not run here; it is the single pre-merge gate at order 13.8.

- [ ] **Step 1: Insert the cross-area block into the harness above the marker line**

```js
{
  // ── Cross-area journeys (brief §21 J01, J02, J06, J11, J15, J17) and review screenshots ──
  const { canvasKeys } = await import('../src/home/canvas-local.js');
  const { openedNotice } = await import('../src/connections.js');
  const continueBlock = (page) => page.locator('section', { has: page.getByText('Continue — on this device', { exact: true }) });
  // The shapes Learn itself writes: ink blob (AdaptiveCanvas.jsx:774), heading (AdaptiveCanvas.jsx:1468), chat turn (LearnPage.jsx:287).
  const heading = (id, text, done) => ({ id, type: 'heading', dx: 0, dy: 0, level: 1, text, done });
  const inkBlob = (blocks) => JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks });

  await check('J01: with no local canvas, Continue offers Open and opens the project', async () => {
    must(repo, 'no repository project in the catalog to continue');
    const page = await open();
    await loaded(page);
    await page.evaluate((slug) => localStorage.setItem('small.recent', JSON.stringify([slug])), repo.name);
    await loaded(page);
    const block = continueBlock(page);
    await block.waitFor({ timeout: 15000 });
    must(await block.getByRole('button', { name: 'Continue learning' }).count() === 0, 'Continue learning offered with no local canvas (T02 §3.1 rule 4)');
    await block.getByRole('button', { name: 'Open', exact: true }).click();
    await page.waitForURL(`${base}/apps/${repo.name}`, { timeout: 10000 });
    await page.context().close();
  });

  await check('J01: with a local canvas, Continue shows Last explored and Next and resumes Learn with the work intact', async () => {
    must(repo, 'no repository project in the catalog to continue');
    const page = await open();
    const keys = canvasKeys({ org: repo.org, email: repo.email || email, slug: repo.name });
    const question = 'e2e J01 why divide by sqrt(dk)?';
    const ink = inkBlob([heading('e2e-j01-a', 'e2e J01 tokens', true), heading('e2e-j01-b', 'e2e J01 masked self-attention', false)]);
    const chat = JSON.stringify([{ id: 'e2e-j01-q', question, linkFrom: null, answer: 'e2e seeded answer', status: 'done', dx: 0, dy: 0 }]);
    await loaded(page);
    await page.evaluate(([k, i, c, r]) => { localStorage.setItem(k.ink, i); localStorage.setItem(k.chat, c); localStorage.setItem('small.recent', r); }, [keys, ink, chat, JSON.stringify([repo.name])]);
    await loaded(page);
    const block = continueBlock(page);
    await block.getByText(question).waitFor({ timeout: 15000 });
    must(await block.getByText('Last explored').count() === 1, 'no Last explored line');
    must(await block.getByText('e2e J01 masked self-attention').count() === 1, 'Next is not the first unticked heading');
    must(await block.getByText('e2e J01 tokens').count() === 0, 'a ticked heading was offered as Next');
    await block.getByRole('button', { name: 'Continue learning' }).click();
    await page.waitForURL((u) => u.pathname === `/apps/${repo.name}` && u.searchParams.get('tab') === 'learn', { timeout: 10000 });
    await page.getByLabel('Lesson canvas', { exact: true }).waitFor({ timeout: 30000 }); // LearnPage.jsx:794
    await page.waitForTimeout(1000); // past the canvas's 400 ms save (AdaptiveCanvas.jsx:774)
    const after = await page.evaluate((k) => ({ ink: JSON.parse(localStorage.getItem(k.ink) || '{}'), chat: JSON.parse(localStorage.getItem(k.chat) || '[]') }), keys);
    must(after.ink.blocks?.some((b) => b.id === 'e2e-j01-b') && after.chat.some((e) => e.id === 'e2e-j01-q'), 'opening Learn lost the seeded work');
    await page.context().close();
  });

  await check('J02: Home → Start a rabbit hole → Blank canvas opens a saveable standalone canvas with no repository step', async () => {
    const page = await open();
    await loaded(page);
    const cta = page.locator('main').getByRole('button', { name: 'Start a rabbit hole', exact: true });
    must(await cta.count() === 1, `Home shows ${await cta.count()} Start buttons; T02 §3.3 wants one primary`);
    await cta.click();
    const dialog = startDialog(page);
    await dialog.waitFor({ timeout: 10000 });
    await dialog.getByRole('tab', { name: 'Blank canvas', exact: true }).click();
    const title = dialog.getByPlaceholder('Untitled canvas');
    await title.fill(`e2e J02 ${Date.now()}`);
    await title.press('Enter');
    await page.waitForURL(/[/]apps[/]canvas-[0-9a-f]{8}([?]|$)/, { timeout: 20000 });
    const slug = new URL(page.url()).pathname.split('/')[2];
    try {
      await page.getByLabel('Lesson canvas', { exact: true }).waitFor({ timeout: 30000 }); // LearnPage.jsx:794
      must(!(await page.getByText(/Repository URL|Map ready|indexing/i).count()), 'a standalone canvas shows repository or index requirements');
      const { ink } = canvasKeys({ org: data.org, email, slug });
      await page.waitForFunction((k) => localStorage.getItem(k) !== null, ink, { timeout: 5000 }); // saved in this browser (AdaptiveCanvas.jsx:774)
    } finally {
      // Untouched on the server (no threads), so Undo's DELETE applies (T02 §8.4); Archive if it refuses.
      const status = await page.evaluate((s) => fetch(`/api/apps/${s}`, { method: 'DELETE' }).then((r) => r.status), slug);
      if (status >= 300) await page.evaluate((s) => fetch(`/api/apps/${s}/archive`, { method: 'POST' }), slug);
      await page.context().close();
    }
  });

  await check('J06: find <project> lists results by kind and opens the one chosen', async () => {
    must(repo, 'no repository project in the catalog to find');
    const page = await open();
    await loaded(page);
    const word = repo.repo.split('/').pop();
    await barInput(page).fill(`find ${word}`);
    await barInput(page).press('Enter');
    const rows = barOf(page).locator('[data-result-sheet]').getByRole('button').filter({ hasText: word });
    await rows.first().waitFor({ timeout: 10000 });
    // Choose pills read '<title> · <Kind>' and list rows carry kindLabel as detail (contract v3, Figma F6).
    for (const text of await rows.allInnerTexts()) must(/Project|Canvas|App/.test(text), `a result has no kind label: ${text}`);
    console.log('note: J06 depth and creator are not in the phase-1 catalog; rows show title and kind (T02 §6.6)');
    const projects = apps.filter((a) => a.kind === 'repository' && a.repo === repo.repo).map((a) => a.name);
    await rows.filter({ hasText: 'Project' }).first().click();
    await page.waitForURL((u) => projects.includes(u.pathname.split('/')[2]), { timeout: 10000 });
    await page.context().close();
  });

  await check('J11: a draft keeps its project across a detour; Back restores the Library filter; the canvas is untouched', async () => {
    const other = apps.find((a) => a.name !== repo?.name && ['repository', 'job', 'server'].includes(a.kind));
    must(repo && other, 'needs a repository project and a second resource in the catalog');
    const page = await open();
    const keys = canvasKeys({ org: repo.org, email: repo.email || email, slug: repo.name });
    const ink = inkBlob([heading('e2e-j11', 'e2e J11 kept', false)]);
    await loaded(page, '/apps?s=shared');
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [keys.ink, ink]);
    await spa(page, `/apps/${repo.name}`);
    await barOf(page).locator('[data-scope-chip="resource"]').waitFor({ timeout: 20000 });
    await barInput(page).fill('e2e J11 draft');
    await spa(page, `/apps/${other.name}`);
    await barOf(page).getByText("you're now viewing").waitFor({ timeout: 15000 });
    await barOf(page).getByRole('button', { name: /^Keep / }).click();
    await page.evaluate(() => history.back());
    await page.waitForURL(`${base}/apps/${repo.name}`, { timeout: 10000 });
    await barOf(page).locator('[data-scope-chip="resource"]').waitFor({ timeout: 10000 });
    must(await barInput(page).inputValue() === 'e2e J11 draft', 'the draft was not restored on return');
    must((await barOf(page).locator('[data-scope-chip="resource"]').innerText()).includes(repo.repo.split('/').pop()), 'the scope is not the project');
    await barInput(page).fill('');
    await page.evaluate(() => history.back());
    await page.waitForURL(`${base}/apps?s=shared`, { timeout: 10000 });
    await page.getByText('Shared with me', { exact: true }).first().waitFor({ timeout: 10000 }); // Library scope chip (T02 §4)
    must(await page.evaluate((k) => localStorage.getItem(k), keys.ink) === ink, 'navigation changed the canvas content');
    await page.context().close();
  });

  await check('J15: a waiting bar draft and the route survive Settings from the workspace menu', async () => {
    const page = await open();
    await loaded(page, '/apps?s=shared');
    await barInput(page).fill('e2e J15 draft');
    await page.locator('aside').getByText(wsLabel, { exact: true }).first().click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await settings(page).waitFor({ timeout: 10000 });
    await page.keyboard.press('Escape');
    await settings(page).waitFor({ state: 'detached', timeout: 5000 });
    must(await barInput(page).inputValue() === 'e2e J15 draft', 'the bar draft was lost');
    must(page.url() === `${base}/apps?s=shared`, `route changed to ${page.url()}`);
    await page.context().close();
  });

  await check('J15: below md the bar opens Settings inside the viewport', async () => {
    const page = await open({ width: 390, height: 844 });
    await loaded(page);
    await barInput(page).fill('settings');
    await barInput(page).press('Enter');
    await settings(page).waitFor({ timeout: 10000 });
    const box = await settings(page).boundingBox();
    must(box.x >= 0 && box.x + box.width <= 390, 'Settings off-screen at 390px');
    await page.context().close();
  });

  await check('J17: connect google slides in the bar highlights the Planned row and says nothing was connected', async () => {
    const page = await open();
    await loaded(page);
    await barInput(page).fill('connect google slides');
    await barInput(page).press('Enter');
    await settings(page).waitFor({ timeout: 10000 });
    must(await settings(page).locator('[data-settings-focus="google-slides"]').getAttribute('aria-current') === 'true', 'the row is not highlighted');
    await page.keyboard.press('Escape');
    await barOf(page).getByText(openedNotice('connections', 'google-slides')).waitFor({ timeout: 5000 });
    await page.context().close();
  });

  if (process.env.SHOTS) await check('shots: Home, Settings and Start in both themes at 1500 and 390', async () => {
    for (const colorScheme of ['light', 'dark']) for (const width of [1500, 390]) {
      const page = await open({ width, height: width > 500 ? 950 : 844 });
      await page.emulateMedia({ colorScheme });
      const shot = (name) => page.screenshot({ path: `e2e/shots/rh-${name}-${colorScheme}-${width}.png` });
      await loaded(page);
      await page.waitForTimeout(1500); // Home reads storage and the catalog; let skeletons settle
      await shot('home');
      for (const [name, detail] of [['settings-preferences', { tab: 'preferences' }], ['settings-connections', { tab: 'connections', focus: 'google-slides' }]]) {
        await page.evaluate((d) => window.dispatchEvent(new CustomEvent('small:settings', { detail: d })), detail);
        await settings(page).waitFor({ timeout: 5000 });
        await shot(name);
        await page.keyboard.press('Escape');
        await settings(page).waitFor({ state: 'detached', timeout: 5000 });
      }
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('small:start', { detail: { path: 'repository' } })));
      await startDialog(page).waitFor({ timeout: 10000 });
      for (const tab of ['Repository', 'Sources', 'Question', 'Blank canvas']) {
        await startDialog(page).getByRole('tab', { name: tab, exact: true }).click();
        await shot(`start-${tab.split(' ')[0].toLowerCase()}`);
      }
      await page.context().close();
    }
  });
}
```

- [ ] **Step 2: Check the harness structure before any run: one marker, one close, and a module that parses**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && grep -cxF '// ── journey checks: each area inserts its block above this line, wrapped in { } ──' e2e/rabbit-hole-check.mjs && grep -cxF 'await browser.close();' e2e/rabbit-hole-check.mjs && node --check e2e/rabbit-hole-check.mjs && echo parses
```

Expected: 1, then 1, then 'parses'. A second marker or a second 'await browser.close();' means a block broke the harness rule; a top-level duplicate (for example a second 'const barInput') fails node --check with SyntaxError 'Identifier ... has already been declared'. Fix it in the owning area's block (wrap it in { }, drop its close) before running anything.

- [ ] **Step 3: Run the new labels against the clone as the previous tasks left it**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=J01,J02,J06,J11,J15,J17 node e2e/rabbit-hole-check.mjs
```

Expected: ok for both J01 labels, J02, J06, J11, all four J15 labels and all three J17 labels. These are acceptance checks over behaviour other areas built, so they can pass on the first run. A FAIL names its journey; fix it in the owning area's task and rerun. Owners: Home/Continue/Library to shell-home; bar, sheet, chips, pills and retarget to agent-ui (including 11.6 for project and app pages); the canvas route and canvases API to project-map and backend-canvas.

- [ ] **Step 4: Record the preview behaviour in docs/features/web.md, inserted directly before the line '## Serving (hard-won)'**

```markdown
## Rabbit Hole preview: Settings and Start (dev build only)
Everything here is behind `learnPreview` (`flags.js`). The live build renders
today's Settings and has no Start dialog (T02 §5, §11).
- Settings renders through a portal (it lived inside the hidden or collapsed
  sidebar), closes on Esc, and opens on `small:settings {tab, focus}` from the
  Agent Bar's `open_settings` and Start's Manage connections. No-op preferences
  and placeholder panes say Planned.
- Connections is a catalog read from `connections.js`: availability (Available,
  Dev preview, Planned) sits apart from account status, which shows only where
  the code can read it (GitHub public, AWS). Planned rows have no action.
- Start a rabbit hole (`StartDialog.jsx`) opens on `small:start {path}`:
  Repository, Sources, Question, Blank canvas, through the bar's registry
  (`prepareCommand`/`executeCommand`, the shared ConfirmCard, `learnAction`).
- Checks: `e2e/rabbit-hole-check.mjs` against this worktree's clone,
  `SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev`.
```

- [ ] **Step 5: Commit the checks and the docs**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git add packages/web/e2e/rabbit-hole-check.mjs docs/features/web.md && git commit --only -m 'test(web): rabbit-hole-check covers J01 J02 J06 J11 and the bar journeys; web.md records the preview' -- packages/web/e2e/rabbit-hole-check.mjs docs/features/web.md
```

Expected: make test-unit is green. The commit contains exactly these 2 paths.

- [ ] **Step 6: STOP before deploying: confirm askLiveOnPreview matches the user's decision**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && grep -n 'export const askLiveOnPreview' src/flags.js
```

Expected: One line reading 'export const askLiveOnPreview = false;' (the v3 default: on this preview, /ask in workspace or app scope is unavailable with 'Asking about the workspace or apps is off on this preview: it would write to live chat history.'; project and canvas asks use LEARN_DB). If it reads true, deploy only if the user chose that at agent-ui's Agent Bar deploy STOP step (10.2) and said so in this session; otherwise stop and ask. If the line is missing, stop: shell-home's order-1 flags.js is not on HEAD.

- [ ] **Step 7: Deploy HEAD and run every label, so the review link serves this exact commit**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && key=$(node --input-type=module -e "import {readFileSync} from 'node:fs'; import {parseEnv} from 'node:util'; const key = parseEnv(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8')).TLDRAW_LICENSE_KEY; if (!key) throw new Error('Missing TLDRAW_LICENSE_KEY'); process.stdout.write(key);") && VITE_COACHING_DEV=true VITE_BYOC_DEV=true VITE_TLDRAW_LICENSE_KEY="$key" npm run build -- --outDir dist-dev && npx wrangler deploy --config wrangler.dev.jsonc --name small-cp-dev-smart-home && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env node e2e/rabbit-hole-check.mjs
```

Expected: Every label from every area prints ok and the run ends 'all checks passed'. The only other lines allowed are 'note:' lines for J06 (depth and creator not represented), J20 and J22. Any FAIL blocks hand-off.

- [ ] **Step 8: Take the review screenshots from clean contexts**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && SMALL_BASE=https://small-cp-dev-smart-home.zeroshothq.workers.dev SMALL_ENV_FILE=C:/Users/cyudhist/Desktop/workspace/small-deploy/.env ONLY=shots SHOTS=1 node e2e/rabbit-hole-check.mjs && ls e2e/shots/rh-*.png | wc -l
```

Expected: 'ok: shots: ...' and a count of 28. That is 7 surfaces (home, settings-preferences, settings-connections, start-repository, start-sources, start-question, start-blank), each in light and dark at 1500 and 390 px. e2e/shots is gitignored.

- [ ] **Step 9: Inspect every PNG with the Read tool before any hand-off**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && ls e2e/shots/rh-*.png
```

Expected: Open all 28 files and check each one. Dark mode must have no white-on-white or unreadable text. At 390 px, Settings and Start must sit inside the viewport with no horizontal overflow. The Planned badges must be visible, and the Google Slides row highlighted. Start tabs must scroll rather than clip, and the Planned tiles must be legible. Home shows one primary Start button. Anything wrong goes back to its task. The link is sent only after this pass.

- [ ] **Step 10: Hand off the review link**

Run:
```bash
echo https://small-cp-dev-smart-home.zeroshothq.workers.dev/apps
```

Expected: Report to the user that https://small-cp-dev-smart-home.zeroshothq.workers.dev/apps serves HEAD. The clone binds the live D1 'small' and live small-cp. State the askLiveOnPreview value from the STOP step; with false, /ask in workspace or app scope is off on this preview. This area's checks wrote one LEARN_DB canvas (J02) and then deleted or archived it. Live promotion needs explicit approval. The pre-merge integration run is a separate gate (13.8) that waits for the user's go-ahead.

- [ ] **Step 11: Rollback and end-of-session cleanup**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && prev=$(npx wrangler deployments list --name small-cp-dev-smart-home --config wrangler.dev.jsonc --json | node -e "let s='';process.stdin.on('data',(d)=>s+=d).on('end',()=>{const a=JSON.parse(s).sort((x,y)=>x.created_on.localeCompare(y.created_on));if(a.length<2)throw new Error('no earlier deployment to roll back to');process.stdout.write(a.at(-2).versions[0].version_id);});") && npx wrangler rollback "$prev" --name small-cp-dev-smart-home --config wrangler.dev.jsonc -m 'restore the previous smart-home clone build' -y
```

Expected: Use only if the final deploy breaks review. It restores the second-newest version, and the build check then fails by design until a fix-forward deploy. When the user has finished reviewing and says so, delete the clone with: cd /c/Users/cyudhist/Desktop/workspace/smart-home/packages/web && npx wrangler delete --name small-cp-dev-smart-home --config wrangler.dev.jsonc

---

### Task 51: Record the phase-1 spec deviations in T02 §17 for Gate C, with the LearnPage.jsx:689 copy as a coordination item for the Learn owners (docs only)

*Area:* Settings, Connections, Start dialog, e2e, deploy · *Brief:* T11 · *Order:* 13.5

**Files:**
- `docs/features/rabbit-hole-t02-spec.md`

**Interfaces:**
- Consumes: The built behaviour each row describes: agent-ui's bar (10.2, 10.3: no Shift+Enter, no [+], Undo only for bar-created canvases), shell-home's Home (9.1: no Authored path card), backend-canvas's PATCH rename API (6.1) with no rename UI, shell-home/project-map canvas routes with barHidden (1, 11.4), and shell-home's flags.js askLiveOnPreview (1). backend-canvas 6.4's §8.2 edit is the only other change to this file.
- Produces: T02 §17: seven deviation rows (Shift+Enter, [+] attachment, no Undo line for Start-created canvases, no Authored path card, no canvas rename UI, the bar hidden on every canvas route, askLiveOnPreview off by default) and the LearnPage.jsx:689 coordination item. Gate C reviews this section.

- [ ] **Step 1: Check first: no §17 yet, and every cited line still says what the row claims**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && grep -c '^## 17\.' docs/features/rabbit-hole-t02-spec.md; tail -n 2 docs/features/rabbit-hole-t02-spec.md; sed -n 8p packages/web/src/ChatComposer.jsx | grep -c '<input'; sed -n 22,26p packages/control-plane/repository-schema.sql; sed -n 689p packages/web/src/LearnPage.jsx; grep -n 'export const askLiveOnPreview' packages/web/src/flags.js; grep -n '"database_name": "small"\|"service": "small-cp"' packages/web/wrangler.dev.jsonc
```

Expected: 0 (no §17 yet: this is the failing check). The last two lines are '**If implementation finds any of these false, D7 wins and the action is' and 'blocked.**'. 1 (ChatComposer.jsx:8 is the <input>). The learn_courses table with app_id and no per-learner column. The 'Google Slides…' toast line. 'export const askLiveOnPreview = false;'. Lines 72 and 99 of wrangler.dev.jsonc. If a cited line moved, update its number in the text below; if a row is no longer true (for example the bar gained Shift+Enter), drop that row.

- [ ] **Step 2: Append §17 after the file's last line ('blocked.**'), with one blank line between them**

```js

## 17. Phase-1 deviations (T04, for Gate C)

T04 builds phase 1 with these differences from the sections above. Each one
is deliberate and visible; none claims a feature that isn't there. The last column records the Gate C
decisions of 2026-09-24.

| # | Spec | Phase 1 | Why | To close it | Gate C (2026-09-24) |
|---|---|---|---|---|---|
| 1 | §6.2: `[+]` attaches one file to `/ask`. | The bar has no `[+]`. | The bar does not own attachments yet; the existing chat keeps its own (`ask.jsx:822-834`). | Add `[+]` with the same hidden-scope rules. | Approved: may defer. |
| 2 | §8.4: after `create_canvas`, the result line shows `Canvas created · Undo`. | Only a canvas created from the Agent Bar shows it. A canvas created from the Start dialog opens in Learn, where the bar is hidden (§6.1). | Nothing on the canvas route can host the line. | Removal stays Archive/Restore from the Library row menu (§8.4). | Approved: Undo only for bar-created canvases; Start-created canvases use Archive/Restore. |
| 3 | §3.1 rule 3: an "Authored path" card with `Step 3 of 7`. | Not built. | `learn_courses` keeps one course per app and no per-learner step, so a step count would be invented. | Store per-learner progress, then build the card. | Approved: may defer. |
| 4 | §8.2: `PATCH /api/apps/canvas-* {title}` renames a canvas. | The API exists; no screen offers Rename. | Not in the phase-1 UI. | A Rename item in the canvas row menu. | Approved: may defer. |
| 5 | §6.1: the bar is hidden on Learn and on all canvases. | Every `/apps/canvas-*` route hides the bar, including the §8.3 not-on-this-device state. | Learn owns the bottom composer. | — | Approved: expected. |
| 6 | §6.4: `/ask` is available in all scopes. | On dev builds `askLiveOnPreview` is `false`: `/ask` in workspace or app scope is unavailable; project and canvas asks (`LEARN_DB`) work. | Workspace and app threads live in the live D1, which the review copy binds (D7). | — | Decided G1 (b): stays off. |
| 7 | §6.4: `/research` gathers sources, and results offer Add to canvas. | Not reachable until the Learn handoff lands. | Research runs in canvas scope, every canvas route hides the bar, and `learnHandoff` is `false`. | Merge the Learn handoff (`feature/parallel-work` `cc0cbf8`). | Approved: unavailable until the hook lands. |
| 8 | §5 and §9: a Start Question hands the question to Learn. | With `learnHandoff === false` only, the question is copied to the clipboard during the submit and the line says so (or says it wasn't transferred). With the hook, Question creates the canvas and prefills the Learn composer, unsent. | The hook is not on `main` yet. | Flip `learnHandoff` when the hook merges. | Approved as fallback only; not the product UX. |
| 9 | §5: a branch select appears when the repository has no default branch. | No select. When GitHub names no default, the bar and the Start dialog stop and ask for a branch link; no branch is assumed. | The worker used to substitute the first branch (`repository_jobs.py:40`); it now reports `defaultBranchKnown`. The command stays branch-aware (`/tree/<branch>`). | — | Approved: omit the select; never assume main, master or the first branch. |
| 10 | §12: the Project header has a `[⋯]` menu. | Omitted. | §12 names no items for it. | Add it with its first real item. | Approved. |
| 11 | §6.5: Source selections join the bar's scope. | Only the selected graph node joins the scope; source line ranges do not. | `askBody` carries the node, not a range. | Add ranges to `askBody`. | Approved: the selected graph node is the code-context scope; source line ranges stay inspector and evidence state. |
| 12 | §6.6 and §7.2: `find_apps_ai` and `find_runs_ai` are immediate reads. | On dev builds `aiReadsOnPreview` is `false`: both are unavailable, and the existing Search, Library and runs AI find skip `/api/apps/find` and `/api/runs/find`. Local title search stays. | Both run a model on the live control plane: read-only is not isolated. | Your explicit approval of live model-backed reads. | Decided G5: off. |

**Coordination with the Learn owners (no edit on this branch).** The canvas
Sources menu on `main` toasts "Connect Google under Settings → Connections to
import a deck." (`LearnPage.jsx:689`), but Settings lists Google Slides as Planned
(§11). `feature/parallel-work` already removes that item (its Sources menu is split
into Search and Files, and Google Slides stays hidden until a connector exists), so
the copy disappears when that branch merges.
```

- [ ] **Step 3: Verify: one §17, twelve rows, nothing else changed**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && grep -c '^## 17\.' docs/features/rabbit-hole-t02-spec.md && grep -c '^| [0-9]\+ | §' docs/features/rabbit-hole-t02-spec.md && git diff --numstat -- docs/features/rabbit-hole-t02-spec.md
```

Expected: 1, then 12, then one numstat line with only additions (about 32 added, 0 deleted). Line endings normalise on commit (index LF, core.autocrlf true).

- [ ] **Step 4: Commit the doc alone**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-unit && git add docs/features/rabbit-hole-t02-spec.md && git commit --only -m 'docs: T02 section 17 records the phase-1 deviations for Gate C' -- docs/features/rabbit-hole-t02-spec.md
```

Expected: make test-unit is green. The commit contains exactly this one path.

---

### Task 52: Pre-merge gate: make test-integration, run once, only after the user says go and has provided the root .env (no task copies an .env)

*Area:* Settings, Connections, Start dialog, e2e, deploy · *Brief:* T12 · *Order:* 13.8

**Files:**

**Interfaces:**
- Consumes: Every area's work committed, the review link handed off (13), and T02 §17 recorded (13.5). backend-proposals' promotion note (13.9) points here and runs nothing itself.
- Produces: The CLAUDE.md pre-merge integration run, or a recorded stop if the user declines. No file in the repository changes.

- [ ] **Step 1: STOP: ask the user before anything runs**

```js
Ask the user, in these words or close:
'make test-integration runs tests/integration_tests against LIVE small-cp (run.sh:108-111). It deploys the example apps to Fly through the published CLI, and test_ask.py starts a real failed run of yolo-s3-job and approves a real proposal (test_ask.py:108-124). It reads a repo-root .env at import (tests/consts.py:8, test_ask.py:29-39), which this worktree does not have (.gitignore:69 ignores it). I will not copy one. Do you want the run, and will you create smart-home/.env yourself with SMALL_API, SMALL_TEST_BYPASS and S3_BUCKET?'
If the answer is no, stop here and record 'integration gate not run: user declined' in the merge notes. Do not create, copy or edit any .env.
```

- [ ] **Step 2: Preconditions, after the user says go and has created the file. Values are never printed.**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && git check-ignore -q .env && test -f .env && grep -q '^SMALL_API=https://small-cp.zeroshothq.workers.dev' .env && grep -q '^SMALL_TEST_BYPASS=.' .env && grep -q '^S3_BUCKET=.' .env && test -f ~/.small/config.json && command -v small uv make && echo ready
```

Expected: Three tool paths, then 'ready'. Any missing piece stops the && chain before tests run; report which one to the user rather than fixing it with a copy.

- [ ] **Step 3: Run the integration suite**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && make test-integration
```

Expected: pytest exits 0. This is a no-regression gate for the live side: it does not exercise this branch's unpromoted control plane. If a test fails, rerun the same command in the main checkout (C:/Users/cyudhist/Desktop/workspace/small-deploy) before deciding; a failure there too comes from live state, not this branch.

- [ ] **Step 4: Afterwards: the .env stays the user's**

```js
Tell the user the result. The root .env is theirs: ask whether to keep or delete it; never commit it (gitignored at .gitignore:69). Live promotion of any control-plane change still needs the user's explicit approval (backend-proposals 13.9).
```

---

### Task 53: Promotion note: the A5 fixes stay unpromoted until the user approves; make test-integration is settings-deploy's 13.8 gate, not run here

*Area:* Proposal lifecycle blockers · *Brief:* T10 · *Order:* 13.9

**Files:**

**Interfaces:**
- Consumes: A5.1 to A5.4 and 7.5 committed; settings-deploy's order 13.8 pre-merge integration gate (the single owner of make test-integration, which asks the user before creating a root .env)
- Produces: A stop point with no file, secret or live change: this area's control-plane changes stay unpromoted until the user approves, and its integration evidence comes from the 13.8 gate.

- [ ] **Step 1: Read-only check: the five commits are on the branch and the new tests are green**

Run:
```bash
cd /c/Users/cyudhist/Desktop/workspace/smart-home && git log --format=%s main..HEAD | grep -cxF -e 'fix(ask): approvals act only in the proposal workspace, a failed recheck is 403' -e 'fix(ask): a proposal is approved once, within 15 minutes, and reopens if the tool refuses' -e 'fix(ask): cancel rejects the proposal server-side, Slack Cancel included' -e 'fix(ask): deleting a chat invalidates its open proposals' -e 'docs(ask): proposal lifecycle and the 409 bodies the card maps' && cd packages/control-plane && node --test test/ask-proposals.test.js test/slack.test.js
```

Expected: 5 (the exact subjects of tasks 7.1 to 7.5; main resolves locally, verified with git rev-parse --verify main -> 94dad46), then tests 13, pass 13, fail 0 (7 ask-proposals and 6 slack; slack.test.js has 5 tests on HEAD). Anything less means a 7.x task is missing: go back to it.

- [ ] **Step 2: Integration evidence comes from settings-deploy's 13.8 gate; this task copies no .env and runs no suite**

```bash
make test-integration (Makefile:46 -> run.sh:108-111) has one owner: settings-deploy's order 13.8 pre-merge integration gate. That task asks the user before creating the worktree's root .env (this worktree has none) and runs only after the user's go-ahead. Do NOT copy small-deploy/.env or run the suite from here. What that gate proves for this area: no regression on the live side only. It runs against live small-cp (test_ask.py:39 API = ENV["SMALL_API"]), which does not carry this branch's control plane until promotion. test_ask.py:129-131 already expects 409 on the second approve, and claimProposal keeps that ({error:'already approved', status:'approved'}).
```

- [ ] **Step 3: Stop: promotion needs explicit approval**

```js
Do NOT run 'make cp-deploy' (Makefile:49 -> run.sh:113-117: builds packages/web and runs npx wrangler deploy in packages/control-plane) or any wrangler deploy of small-cp (wrangler.jsonc:2). T02 spec 7.4 (lines 451-454) and CLAUDE.md make this a live promotion that needs the user's explicit approval. Until then these fixes are inert, and the dev review copy renders every server /do card as Blocked; with askLiveOnPreview = false it also asks nothing in workspace or app scope, so it creates no live proposals. When the user approves: the build must carry every worktree's live code, because all worktrees share one live small-cp and one D1. After the approved deploy, the rerun of make test-integration goes through settings-deploy's 13.8 gate again (same ask-first .env rule). test_ask.py:129-131 then gets its 409 on the double approve from claimProposal ({error:'already approved', status:'approved'}).
```

---

## Risks recorded by the planners

**Shell, Home, Library, Sidebar**
- A page that refines its surface in useLayoutEffect, or whose effect deps do not cover its URL, is overwritten by the Root baseline, which runs on every path change. agent-core's setSurface keeps identity, so pages may refine with setSurface or patchSurface. RepositoryPage's status patch on every poll (project-map, contract v3) changes no path, so the baseline never overwrites it.
- main.jsx line 1 is set once, at order 2.5, to the contract v3 line; agent-ui (StartHost at 8.5, AgentBar at 10.2) adds names to it and never replaces it, and reuses the flags import added at 2.5. The Sidebar flags import added at 9.4 is extended by settings-deploy (Settings and PRODUCT copy at order 9.8), not duplicated.
- App.jsx, Sidebar.jsx, main.jsx, ui.jsx, dev-worker.js and private-auth.js use CRLF line endings. Every edit is anchored on quoted content, not line numbers. Numbers shift after each task, so re-read before editing.
- Home and ExplorePreview are imported statically, so the live bundle carries them as dead code. Live behaviour is unchanged, because pageFor never returns home or explore with preview=false (routes.test.mjs).
- Continue treats a slug as having a local canvas only when hasLocalContent is true. An opened but empty canvas, whose :ink blob is written on mount (AdaptiveCanvas.jsx:769-776), falls through to [Open] instead of a Continue card with nothing to continue.
- small.recent keeps at most 5 slugs and has no workspace scope. After intersecting with the catalog, Recent can show fewer than 5 items, and none right after a workspace switch.
- Last explored reads top-level exchanges only (ponytail). In-block replies carry no timestamps.
- Column toggles made in the Projects and Canvases views live in memory only (ponytail), so small.tblCols and the Apps view stay exactly as today.
- Pinned rows have no ⋯ menu (ponytail). You unpin from the row in its APPS section, which starts collapsed for new users, or with the bar's unpin command.
- The e2e checks create LEARN_DB canvases on the shared small-learn-dev and delete them in finally. A crash between create and delete leaves a 'rabbit-hole-check *' row, which the shDrop failure names.
- The clone binds the live D1 'small'. The sh- checks only read it; they write only LEARN_DB canvases and browser storage. Reviewers must not click Run, Stop or Share on real apps.
- The sh- checks from order 9.1 on depend on StartHost (agent-ui order 8.5), the canvas routes (backend-canvas orders 6.1-6.4) and the applied LEARN_DB schema (order 5). Without the schema, GET /api/apps returns 500 on the clone (dev-worker.js:23-28 has no try/catch). The deploy task runs after all three. sh-title (order 2.5) needs only the order 0.5 clone.
- The deploy reads TLDRAW_LICENSE_KEY from small-deploy/.env, because this worktree has no root .env. If that file moves, whiteboard blocks show tldraw's unlicensed state on the clone.
- test/private-auth.test.mjs is outside the npm test:unit glob, so it is run explicitly in order 1. This area touches no integration path and does not run make test-integration: settings-deploy owns it at order 13.8 and asks the user before creating a root .env. No task here copies any .env; the deploy and harness only read small-deploy/.env.
- Order 2.5 redeploys the smart-home clone early, to turn sh-title green. It ships only orders 1-2.5 (no dev-worker LEARN_DB change yet), so GET /api/apps still works. The clone binds the live D1; sh-title only reads.
- askLiveOnPreview ships false (contract v3 default). Until the user picks (a), the preview's workspace and app asks are unavailable (agent-core and agent-ui read the flag; the Agent Bar deploy task stops for the decision). If (a) is chosen, flags.js and flags.test.mjs flip together in one commit.

**Agent Bar logic (pure modules)**
- Contract additions this area introduces, to record in the shared contract: (1) COMMANDS.share.unsupported(args, ctx), which prepareCommand and executeCommand honour. A project or canvas share gets the §11 line, with no card and no API call; a Blocked card would be wrong because the share touches nothing. (2) kindLabel is exported from catalog.js. (3) learn-hook also exports readLearnResult and ADDING. learnAction takes an optional 4th argument {handoff, win, storage}, used by tests only, and payload.from 'start' selects the §5 copy. (4) undo(result, ctx) receives the whole Result that run returned. (5) filter_library takes {type, section, folder} and opens /library?type=&s=&f=. Already in CONTRACT v3: ctxOf(surface, { scope }?) and learnAction's navigation rule.
- hasLocalContent: CONTRACT v3 ratifies that unreadable JSON and blocked storage count as content. This module also counts any :ink field that is not an empty array (a changed blob shape), which errs the same safe way. Undo therefore never deletes a canvas it cannot read, and the gate never hides one. If Learn changes the blob shape, the worst case is that Undo disappears; work is never lost.
- Ordering dependencies outside this area (v3 order numbers). surface/scope (2) lands before shell-home's main.jsx (2.5). connections.js (settings-deploy, 2.4) lands before the router (3.35) and the command registry (4). shell-home's home/pinned.js (3.3) lands before the pin task (4.1). shell-home's home/continue.js (3.6) lands after canvas-local (3.1) and catalog (3.2), imports titleOf, canvasKeys and opensHere, and deletes its own titleOf, canvasKey and onAnotherDevice. If any of these slips, the importing test fails with ERR_MODULE_NOT_FOUND, so the break is loud, never silent.
- sendLearnRequest always writes small.learn.request, and also dispatches small:learn-request when the URL is already that app's Learn view. It needs both: the Start Question path reaches the canvas URL before Learn mounts. This relies on cc0cbf8's idempotency (the busy set and stored-result replay). If the receiver drops it, a request could run twice.
- Learn-view detection is by URL. On a canvas from another device, the §8.3 gate shows instead of Learn, so a request sent there would wait in sessionStorage and end with 'Still working, check the canvas'. No caller sends to such a canvas: Start creates the canvas on this device, and the bar is hidden on every canvas route, the gate included (barHidden, ratified in CONTRACT v3).
- find_runs_ai puts the run path in slug ('<app>/runs/<id>'), so open_resource opens /apps/<app>/runs/<id>. The bar must open every result through open_resource(slug) and never build its own URL.
- Ask-tool failures are api() Errors carrying .status and .data (api.js:63), for example a 409 'already approved'. The ConfirmCard state mapping (agent-ui) reads them. Share and run commands that come from the router carry no proposal_id, so run() rejects with '<Label> needs a proposal from Ask first.'. D7 blocks them first on every dev build. After live promotion (§7.4), a route that creates the proposal is needed.
- create_canvas and its Undo depend on the backend-canvas contract quoted in the facts: POST body {title, project?, device_id}; a 201 row with name, title and org; DELETE returning 200 or 405. If backend-canvas renames a field, commands.test.mjs still passes against its fake fetch. The settings-deploy e2e (order 13) must therefore cover a real create and Undo on the clone.
- find_apps_ai and find_runs_ai are Immediate reads on live small-cp, and each spends one model call (index.js:602,626). D7 does not block reads, so the bar must fire them only on an explicit action, never on every keystroke.
- streamAsk is only the transport and carries no guard. CONTRACT v3's live-D1 guard is the bar's (agent-ui): with learnPreview true and flags.js askLiveOnPreview === false, an ask in workspace or app scope is unavailable with 'Asking about the workspace or apps is off on this preview: it would write to live chat history.' Those are exactly the kinds endpointFor maps to /api/ask; project and canvas asks go to /api/learn/ask (LEARN_DB) and stay available. The Agent Bar deploy's STOP step asks the user for the (a)/(b) decision.
- Live build: of this area's code, only titleOf reaches live code paths, through the Sidebar and App.jsx imports (shell-home). It renders exactly today's titles (see the Titles fact). Everything else is imported only by code behind learnPreview.
- commands.test.mjs and learn-hook.test.mjs replace the globals window, fetch, localStorage, sessionStorage and document. node --test runs each file in its own process, so the stubs cannot leak into other files.
- learnAction callers (CONTRACT v3). The v2 drafts navigated again after it (agent-ui teach's open_tab, project-map addSource's go('learn')) and hardcoded 'Added to the canvas.'. CONTRACT v3 has those areas remove both; this module's tests pin the single navigation (the win.opened lists) and the message text, so a caller that shows outcome.message stays in step with the copy here.
- open_settings has three mounted callers: StartDialog's [Manage connections] (settings-deploy, 8, mounted by StartHost at 8.5), the bar (10.3) and the Project hub (11.3). The small:settings listener arrives at 9.8. Between 8.5 and 9.8 [Manage connections] opens nothing. The Start proof (8.6) deploys the clone inside that window but does not exercise [Manage connections], and StartDialog ignores the returned notice, so nothing claims Settings opened; the first review deploy with the bar is after 9.8.

**Agent Bar UI**
- Hard dependencies on other areas' exact names: surface.js (getSurface, patchSurface, useSurface), scope.js (scopeOf, scopeKey 'org|kind:slug|selectedId', chipsFor, endpointFor), catalog.js (titleOf, kindLabel), ask-stream.js (askBody, streamAsk), commands.js (COMMANDS, ctxOf(surface, overrides?), prepareCommand, executeCommand), router.js (route), learn-hook.js (learnAction, ADDING), connections.js (openedNotice, e2e only), flags.js (learnPreview, learnHandoff, askLiveOnPreview) and StartDialog.jsx ({ctx, initial, onClose}). The scratch bundle used stubs with these names; a rename in any area breaks the build.
- ResultList keeps its v2 prop name, scopeKey, so project-map's call site stays; since CONTRACT v3 its value must be resultsKey(scopeOf(surface)). A caller that passes a scopeKey with a selection gets an empty list: the exact bug the v2 verdict found. project-map's ContextBody must use resultsKey for both the list and its count.
- Live D1: with askLiveOnPreview false (default), no bar path reaches /api/ask. If the user picks (b) at the 10.2 STOP, workspace and app asks from the clone write threads, messages and proposals to live D1 that live AskPanel history can see (index.js:1194-1201). The e2e never sends those asks either way, and the 10.3 pre-run is skipped under (b).
- The workspace and app placeholders ('Start, open, ask, or paste a link…', 'Ask about counter…') still invite an ask that the preview refuses while askLiveOnPreview is false. The refusal says why and keeps the text; the copy is a Gate B item.
- Live-build changes. (1) Info toasts move from bottom-left to one bottom-right stack: ungated, deliberate (the user's never-bottom-left rule), same intent as feature/parallel-work b7cddc5. (2) Shell.jsx statically imports agent/surface.js and flags.js; the identity and --sidebar-w effects are gated on learnPreview. (3) The index.css padding rule computes to 0 live. Everything else stays in lazy chunks the live build never requests; the live-entry check greps for 'data-agent-bar'.
- Merge conflict with feature/parallel-work: ui.jsx:233 is the same line b7cddc5 changes. Resolve to the single bottom-right stack at calc(var(--agent-bar-h,0px)+1rem).
- main.jsx and Shell.jsx are edited by shell-home first (routes, baseline, Home). The edits here anchor on content ('function Root() {', '<SearchModal />', the Sidebar import, 'useEffect(() => { load(); }, []);', the small:sidebar effect). Re-read before applying; all four edited files are CRLF.
- Between 10.2 and project-map 11.3/11.5, project and app pages publish no resource, so the bar there is in workspace scope and its asks are refused by the guard; every chip check waits for 11.6. Until project-map 11.2, RepositoryPage and the app Graph tab also show AskPanel, a second input that listens for small:ask-focus.
- Stop only aborts the client read. The server may still finish and save the answer to the scope's thread, and History will show it.
- Proposal Cancel on a Blocked card, and on a rule-routed card with no proposal, is local only. The proposal stays approvable through Slack or AskPanel until the §7.4 fixes are promoted; that exposure exists today.
- Undo on 'Canvas created' stays visible until clicked. If the canvas was touched meanwhile, the click shows the command's error ('Archive it instead').
- placeholderFor uses surface.resource.status only for the page's own resource. A draft held for another project reads that project's Shell catalog row, which stays stale until the catalog reloads.
- beforeunload also fires on refresh and tab close while any draft waits, and Chrome shows it only after a user gesture (the e2e clicks first).
- The bar's 200 ms left transition trails the sidebar during drag-resize, because Shell turns off only its own transition (Shell.jsx:16-22,71,75).
- Research and [Add to canvas] can't be reached end to end in phase 1: every canvas route hides the bar (ratified in CONTRACT v3), and learnHandoff is false. They are covered only by applyEvent's ref test and learnOutcome.
- The /teach check asserts history.length rises by exactly one. If the Project hub pushes its own entry when ?tab changes (rather than replacing), that assertion fails without the bar being at fault; fix the hub or relax to 'the bar pushed nothing'.
- The e2e cost per full run: 2 LLM calls on the dev key and 2 LEARN_DB project threads ('bar-page:'), one LEARN_DB canvas created and removed by Undo, and one GitHub branch lookup through /api/repositories/branches. Checks that need a ready project, an editable app or any app are skipped, not failed, when the catalog has none.
- History-restored turns keep text only; the graph a repository message can carry (repositories.js:166) is dropped. ResultList learns its scope from its first turn or from the live page. An empty list for another scope shows no History header.
- make test-integration (tests/integration_tests) is required before merge by CLAUDE.md; its single owner is settings-deploy's pre-merge gate (order 13.8), which asks before creating a root .env. It is not part of these per-task commits.
- The deploy recipe reads TLDRAW_LICENSE_KEY from the small-deploy .env without copying or printing it, because this worktree has no .env. Only the key name was verified.

**Project page, Map, Context panel, canvas route**
- The consumed names come from the v2 plans of other areas plus the CONTRACT v3 deltas: ctxOf(surface, overrides?) (called with one argument here), executeCommand, learnAction, canvasKeys and opensHere, readContinue, titleOf, useSurface, getSurface and patchSurface, scopeOf, resultsKey, getTurns and subscribeTurns (agent/bar.js), and ResultList (agent/ResultSheet.jsx). Scratch runs used agent-core's canvas-local.js code verbatim and a copy of titleOf. The other modules were compiled but not run.
- ResultList's prop name is assumed to be resultsKey. If agent-ui's v3 ResultList takes a different prop, the Map Results render empty with no build error. The 11.2 precondition step reads the real signature before any edit, and agent-ui 11.6's project ask check is what proves that answers appear in the panel.
- Root's baseline must land before a page refines the surface. shell-home 2.5 sets it in useLayoutEffect, which React runs before any page's useEffect, so the page's patch wins. If Root ever moves the baseline to useEffect, it overwrites the page's patch. Every page re-patches on each pathname+search change and patches only page-owned fields.
- The live bundle now imports ContextPanel, CanvasPage and RepositoryPage's agent modules (commands.js, learn-hook.js, bar.js, ResultSheet.jsx, scope.js, surface.js, canvas-local.js). Every use is behind learnPreview, but none of those modules may have import-time side effects such as window listeners. agent-core and agent-ui should confirm.
- [Add source] relies on learnAction to open Learn when it sends (agent-core 3.5). The page never navigates after it and shows only outcome.message. The pm/project check pins the learnHandoff=false fallback line ('Add sources from the Sources menu on the canvas.') and fails on purpose once the flag flips, so the merge PR must replace it.
- Removing AskPanel from Map also removes RepositorySource line-range asks (ask.jsx:663 provides the selection context). The bar sends only the selected node. This is marked with a ponytail comment in ContextPanel.jsx.
- Learn is enabled before the first snapshot. A repository Learn ask then fails with 'This repository version is not indexed yet' (repositories.js:47). The message is honest, but no pm check covers Learn's handling of it. Look at it during the 12.5 review.
- coaching.preview.js fails on any unmocked request (afterEach expects unexpected == []). If agent-ui's bar, mounted in Root in dev, makes requests the suite does not mock, the 11.2 'readable Capture' run fails for that reason and not because of this area.
- Deleting e2e/app-tabs-check.mjs removes a check that could run against the shared small-cp-dev. Its 10 assertions are all obsolete in the dev build, and pm/context plus pm/apptabs replace them.
- SharePage.jsx: shell-home order 1 is the only owner of the flags.js import and of deleting the local learnPreview (SharePage.jsx:63). This area owns every other SharePage edit. Other branches still change SharePage near :63-69, :607-611 and :829-851, so expect merge conflicts there. Every edit is anchored on content.
- Working-tree files are CRLF (SharePage.jsx 870/871 lines, CoachingPanel.jsx 74/75). The plan's old/new texts use LF and must be applied with the Edit tool. If an anchor does not match, re-read the file and do not guess.
- The browser checks need data: the test workspace needs a repository with commit_sha and a hosted, non-AWS app. Without them each check fails with a one-line reason instead of passing vacuously.
- The canvas 403 copy keys on isCanvasSlug (canvas-<8 hex>) in the dev build only. A live app with such a name would see the canvas copy on a 403 in dev, never in live (learnPreview is false there).
- The bar is hidden on every canvas route, the gate screen included (ratified in CONTRACT v3; T02 §6.1 'all canvases'). The user can still use the sidebar and the gate's buttons.
- CanvasPage treats storage that cannot be read as content, as opensHere does (CONTRACT v3 hasLocalContent). A browser with storage fully disabled therefore gets Learn, which cannot save, instead of the gate. No content can be lost either way.
- While askLiveOnPreview is false (the default), app-scope asks are off in dev. The app Graph tab's Results then fill only with command results, yet its empty line still says 'Ask in the bar below…'. See the open questions.
- The 12.5 clone binds the live D1 'small' as DB (wrangler.dev.jsonc:71-72). The pm checks only read it. Their one write is a canvas row in small-learn-dev, which the check deletes again.

**Canvas record (LEARN_DB) and dev worker**
- This area is backend only and uses no Figma frame as evidence. Its Undo-only-while-untouched, Archive-not-Undo and device_id contracts come from the approved T02 sections 8.3 and 8.4.
- Wrong-database hazard in T12 prep. Running repository-schema.sql against live 'small' would create repository_apps, repository_versions and canvases on live D1. The command names small-learn-dev explicitly and uses --config wrangler.dev.jsonc (:80-84). The read-only pre-check must STOP if apps, runs or proposals are listed.
- Ordering gate. T12 prep (order 5) must complete, confirmed by the verify SELECT row, before any clone serves Task 6.4. Otherwise ownerCanvases throws inside GET /api/apps (dev-worker.js:23-28 has no try/catch) and that clone's Apps list returns 500. The table is created before the code that reads it, and the create is additive IF NOT EXISTS, so other clones are unaffected.
- Shared index.js. Contract v2 orders canvases backend (6) before proposals fixes (7). The seam adds 8 lines inside apiAsk, from 928 on, so apiAskApprove, apiAskReject and apiAskThreadDelete shift by +8. The proposals area must anchor on content. No edit may add a column-0 '}' inside apiAsk (learn-chat.test.js:16-18).
- Shared learn-chat.test.js (the proposals A5.4 fixture comes later). Shared dev-worker.js (shell-home's :137 path-list edit lands first). Shared T02 spec (other areas may record deviations). Every edit here is anchored on quoted content, not line numbers.
- LEARN_DB canvas ids overlap live apps.id values. If any future change lets a canvas turn reach appContext, sourceSection or editorsLine by id, another app's runs and members would enter the prompt. The learn-chat seam test pins the context.
- Canvas answers are not written to learn_moments. The insert goes to LEARN_DB, which has no such table, and ask.js:399-405 swallows the error. This carries a ponytail comment, and it may matter to the YouTube moment flywheel work on another branch.
- The server rejects titles over 120 characters with 400. agent-core's create_canvas must slice(0, 120) for the Start dialog's Question path. deviceId(storage) must produce ids that match /^[A-Za-z0-9-]{8,64}$/; crypto.randomUUID() does.
- The canvas 403 body is {error:'This canvas is private to its owner'} (T02 section 13). The web canvas route gate must show it verbatim instead of SharePage's generic 'You don't have access.' (critic coverage gap). Owner: the canvas route gate's area.
- JSON /api/ask with a canvas scope still falls through to live small-cp, which only reads and then returns 404 'no app named'. The bar must send canvas scope to /api/learn/ask (T02 section 6.3). Owner: agent-core/agent-ui. Separately, workspace and app asks would write threads, messages and proposals to live D1 per section 6.3; contract v3 defaults askLiveOnPreview = false (flags.js), so on dev builds those asks are unavailable until the user's (a)/(b) decision. This seam covers canvas scope only.
- Merge gate. index.js is live code, so make test-integration (Makefile:46-47 -> run.sh:108-111; real Fly deploy through the published CLI) must pass before merge, not merely before commit. Its single owner is settings-deploy's pre-merge gate (order 13.8), which asks the user before creating a root .env; this area neither runs it nor copies any .env. Promoting small-cp stays behind explicit approval.
- Until Home, Library and Sidebar (order 9) import titleOf, a canvas merged into /api/apps shows in today's Apps table under its row fields. This stays inert until something calls POST /api/canvases: the Start dialog at order 8, or the order-12.9 check and project-map's canvas route check (11.4), which delete what they create.
- hosting:'canvas' and visibility:'private' are new values in the catalog. UI that switches on them was audited only in App.jsx and SharePage.jsx.
- repositories.js:91 is an unconditional R2 put. If small-learn-dev were recreated and ids restarted, an old dev snapshot under the same id and commit could be overwritten. That is dev data only, so section 16.3 still holds.
- CRLF worktree (core.autocrlf=true). Multi-line exact-match edits to existing files must keep CRLF. The two new files are created fresh.
- Canvas History path drift. The bar (agent-ui bar.js threadsPath) and Learn (ask.jsx:401) must keep calling `/api/ask/threads?scope=learn&ref=<slug>` and `/api/ask/threads/<canvaschat id>`; canvasRoute only diverts those shapes to LEARN_DB. Any other shape for a canvas (for example scope=canvas without a canvas- ref) falls through to live small-cp, which reads live D1 and answers with an empty list or 404.

**Proposal lifecycle blockers**
- These fixes live only in the live control plane. They can't sit behind learnPreview (it is a web build flag), and they stay inert until small-cp is deployed, which is a live promotion that needs the user's explicit approval (spec 7.4 lines 451-454). Dev clones forward /api to live small-cp (dev-worker.js:146 -> wrangler.dev.jsonc:96-99), and make test-integration also hits live. With askLiveOnPreview = false (contract v3 default, pending the user's decision), preview builds do not ask in workspace or app scope at all, so the review copy creates no live proposals either. Before promotion, the unit tests are therefore the only evidence for A5.
- Behaviour changes on live once promoted: (1) a Run clicked more than 15 minutes after the proposal (web or an old Slack message) now gets 409 'expired after 15 minutes - ask again', where today it would run; (2) the permission recheck returns 403 instead of 400. ask.jsx still shows '✗ no edit access' (api.js:63), and Slack still says 'only editors can run this' (slack.js:267).
- Expiry is computed, not stored. After 15 minutes the row stays 'proposed', and approve and reject answer 409 status 'expired'. A thread delete can still mark such a row 'invalidated'.
- The claim happens before execution. If the Worker dies mid-tool, the row stays 'approved' with no log message. That is the safe direction (no double run). A ponytail comment in apiAskApprove records the upgrade path (a 'running' status).
- When a tool throws, the proposal is reopened, which keeps today's retry semantics. As before, a tool that partly ran can be retried; for example, the run tool deletes the R2 attachment (index.js:1453) before startRun.
- There is a narrow race. If approve B loses to approve A's claim, and A's tool then refuses and reopens the row before B reads it, B is told 'expired' although the row is open. B's retry works. It is too rare to add code for.
- The legacy web ProposalCard Cancel (ask.jsx:233) stays client-only, because ask.jsx is off-limits. A proposal dismissed there stays approvable, from Slack or another tab, until it expires 15 minutes after creation (today: forever).
- Per contract v2, the new ConfirmCard's Cancel on a Blocked card is local only until live has /api/ask/reject. web.md v16 records this.
- make test-unit takes about 12 minutes per commit in this worktree (observed 12m08s on HEAD, exit 0). There are five commits in this area.
- make test-integration mutates live state as it always has: it deploys the example apps to Fly and creates and approves a proposal and a run on yolo-s3-job (test_ask.py:108-131). Its single owner is settings-deploy's order 13.8 pre-merge gate, which asks the user before creating the root .env (contract v3). This area never copies a .env and never runs the suite.
- The global order puts the canvases-backend seam (order 6.3) before these tasks (7.1 to 7.5), overriding the critic's suggested order. The seam's regions don't overlap this area's, and every anchor here is quoted text. HEAD line numbers are only guides.
- Working-tree files are CRLF (core.autocrlf=true). The Edit tool's old_string must match the file as read.

**Settings, Connections, Start dialog, e2e, deploy**
- The web unit suite takes about 6 minutes (354 s for 418 tests on 2026-09-23). Red/green steps therefore run single files with node --test, and make test-unit runs once before each commit.
- StartDialog imports agent/ConfirmCard.jsx, which imports cardView from agent/bar.js. agent-ui lands both at order 7.8, before Start (8). The Start task's step 0 still stops if either file is missing, because the build would fail on the import.
- The harness depends on markup other areas own. From agent-ui: [data-agent-bar], [data-chat-composer] input, [data-scope-chip="resource"], [data-result-sheet] and [data-confirm-card], plus result rows as buttons that carry a kind label (choose pills read '<title> · <Kind>', list rows show kindLabel as detail; J06 depends on it). From shell-home: Home <section> blocks with the T02 §3.1 copy, and the Library 'Shared with me' chip. From the spec: the retarget text "you're now viewing". An area that changes any of these must update the harness in its own task.
- Appended harness blocks share one module scope. Each block must be wrapped in { }, or a duplicate const (e.g. two areas both defining 'bar') is a SyntaxError that kills every check. The base already provides settings, startDialog, openStart, barOf and barInput for shared use. Order 13's step 1 checks the structure (one marker, one 'await browser.close();', node --check) before the final run, so a broken block fails fast with its cause.
- Live build: every Settings delta is gated, so the live DOM is unchanged. The live bundle still carries the dead dev branches, and the CSS gains the unused max-md utilities that Tailwind scans from the gated class strings.
- Settings Esc uses a capture-phase listener with stopPropagation while it is the top layer. The Start dialog and the bar sheet never see that Esc. When a dialog is open inside Settings (Disconnect AWS?), the event passes through: the confirm closes, Start ignores it (it is not the top dialog), but the bar's own Esc handler may also close its sheet underneath.
- The Question path runs create_canvas with open:true, and run() navigates, before learnAction writes the request. learnAction does not navigate a second time there (learn-hook.js onLearn treats /apps/canvas-* as the Learn view), and the dialog shows only outcome.message. Once learnHandoff flips to true, correctness relies on Learn mounting only after Shell's /api/apps load and the lazy Learn chunk, and on sendLearnRequest also dispatching small:learn-request when Learn is already mounted. Re-verify with learn-handoff-check.mjs when the merge PR flips the flag.
- repositoryArgs pins the router's connect_repository args {url, repo} (agent-core). start.test.mjs fails if agent-core changes that shape, which is intended.
- The clone binds live D1 'small', the shared small-runs bucket and live small-cp (wrangler.dev.jsonc:66, :72, :99). This area's checks write the following. J02 creates one LEARN_DB canvas and deletes it (archives it if DELETE is refused). J01, J11 and the shots seed localStorage only in throwaway contexts. J20 switches workspace in a throwaway context. /test/session writes a live session row, as every existing clone check does. J06, J15 and J17 use rule-routed commands (find, settings, connect), so none of them sends /api/ask or writes a live-D1 thread. With askLiveOnPreview false (the v3 default), the bar refuses /ask in workspace and app scope on the clone, so no area's bar check writes live chat history either. Order 13 re-checks the constant before its deploy.
- Deploy order: any clone deploy that carries backend-canvas's dev-worker wiring must come after the announced LEARN_DB schema apply (T12 prep, order 5), otherwise GET /api/apps returns 500 and the harness stops at '/api/apps: HTTP 500'. The baseline deploy at order 0.5 is plain HEAD and is safe.
- After a wrangler rollback, dist-dev on disk no longer matches the served build, so the build check fails by design. The way back to a verified state is to fix forward and redeploy.
- This worktree has no root .env (.gitignore:69 ignores it). Build and harness commands read small-deploy/.env by absolute path and never print or copy it. make test-integration reads the repo-root .env at import (tests/consts.py:8, test_ask.py:29-39), so the single gate at 13.8 asks the user to create it; no task copies it.
- J06: the phase-1 catalog carries no depth or creator metadata, so the check prints a note instead of asserting those.
- J21: partial, stale, revoked or unavailable per-source states have no phase-1 surface beyond repository map status (project-map's Sources tab and J12). This area's J21 covers availability versus account status on Connections only.
- LearnPage.jsx:689 still toasts 'Connect Google under Settings → Connections to import a deck.' from the canvas Sources menu, while Settings says Planned. LearnPage.jsx is off-limits here: T02 §17 (order 13.5) records it as a coordination item for the Learn owners, with no edit on this branch.
- Info toasts render bottom-left until agent-ui's ui.jsx toast change lands (ui.jsx:233). The Question fallback toast inherits whatever position is current.
- The branch select for 'no default branch' is omitted with a ponytail marker, because repository_jobs.py:40 always returns a default. This is unreachable today but deviates from the letter of T02 §5.
- 'Canvas created · Undo' (T02 §8.4) is not shown for canvases created from Start, because the destination is Learn and the bar is hidden there. It is marked with a ponytail comment and recorded in T02 §17 (order 13.5) for Gate C. Removal goes through Archive in the Library.
- T02 §17 (13.5) describes other areas' phase-1 choices. If an area changes one before 13.5 (for example, adds Shift+Enter), its row must go; step 0 of 13.5 re-reads every cited line first.
- make test-integration mutates live, production-visible state (example deploys to Fly; test_ask.py approves a real proposal). It runs once, at 13.8, only after the user's go-ahead and only with a root .env the user created.

## Open questions recorded by the planners

**Shell, Home, Library, Sidebar**
- §3.1.3 Authored path card: deferred with a ponytail comment in Home.jsx, because learn_courses keeps no per-learner step pointer. settings-deploy's order 13.5 docs task records it in T02 as a phase-1 deviation; Gate C accepts the deferral or names a data source.
- Sidebar canvas rows: Share is disabled with the §11 copy, and there is no Rename, Duplicate, Move to Trash or drag, because those call live-app endpoints for a LEARN_DB record. The canvas rename UI is deferred (the PATCH {title} API from backend-canvas exists) and recorded by settings-deploy order 13.5 for Gate C.
- The Library's new URL params are available to agent-core's filter_library: ?type=projects|canvases|apps and ?archived=1, alongside the existing ?s= and ?f=.
- The response shape of GET /api/canvases?archived=1 is taken from the backend-canvas plan ({canvases:[canvasApp rows]}). Order 9.5 step 1 verifies it in canvases.js before any code is written.
- askLiveOnPreview: the user's (a)/(b) decision is pending. This area ships false; flipping it is a two-line change in flags.js and flags.test.mjs.

**Agent Bar logic (pure modules)**
- T02 §5's Start Question fallback says the question is 'kept in the Agent Bar'. The bar is hidden on canvases (§6.1, ratified in CONTRACT v3), so that is true only if StartDialog seeds the bar draft for the new canvas scope. Should Start keep the §5 wording (learnAction with from 'start') or reuse the §6.4 teach line?
- Approve the share.unsupported hook? A project or canvas share would answer at once with "Sharing projects and canvases isn't available yet." and no Blocked card, because it touches nothing.
- Which fallback line should [Add source] show while learnHandoff is false: 'Add sources from the Sources menu on the canvas.' (project-map's draft, used here) or §5's 'Use Upload in the canvas menu'?
- Sign off the rule-3 exception: 'open', 'go to' or 'show' followed by settings, preferences, connections or theme opens Settings, instead of a catalog lookup that would come back empty.
- Confirm that the §7.2 'opens a screen only' commands and §7.1 requires(ctx) stay out of the registry, each marked with a ponytail comment, until a rule or a button needs them.

**Agent Bar UI**
- 1. Live chat history (blocking for the first bar deploy, 10.2 STOP step): (a) keep askLiveOnPreview = false, the default, so workspace and app asks from the preview are refused with the reason; or (b) set it true and accept live D1 writes (index.js:1194-1201). On (b), shell-home flips flags.js and flags.test.mjs; nothing in this plan changes.
- 2. [Ask about X instead] copies the waiting text into X and leaves the old scope's draft in place, so returning restores it. × and [Use selection] move the text instead. Confirm copy vs move for the resource offer.
- 3. New chat in ResultList was not in the spec. It resets the list and the thread for that resource (the same path as new_thread's resetThread), so AskPanel's New chat survives on Map and the app Graph tab (coaching.md:1062-1063). Confirm.
- 4. One answer stream at a time: Send is disabled while any answer streams, Stop is always shown, and a picked mode pill stays until × or Backspace. Confirm.
- 5. /teach in App scope is allowed (app pages have a dev Learn tab, SharePage.jsx:733) even though §6.4 lists only Project and Canvas. Confirm.
- 6. ResultList's prop stays named scopeKey (it now takes a results key) so project-map's call site is unchanged. Rename both sides to resultsKey if project-map prefers; it is a one-line change in each file.

**Project page, Map, Context panel, canvas route**
- §12 says Refresh 'opens the screen that does it'. This plan keeps today's inline, importer-only Refresh/Retry (RepositoryPage.jsx:35) in the Map status panel. Confirm.
- agent-ui: does ResultList take { resultsKey } and render getTurns(resultsKey) as given, with no v2 listKeyOf slicing? And do getTurns and subscribeTurns stay exported from agent/bar.js? ContextPanel.jsx imports them from there.
- §6.5 says Results includes '(+ History)'. The panel omits History (ponytail). Does the bar keep its sheet header, with History, visible when resultsHost is 'panel'?
- The default title for [New canvas] and [New canvas here] is 'Untitled canvas' (the §5 Blank default, and the POST /api/canvases default in backend-canvas 6.4). Confirm.
- Should e2e/app-tabs-check.mjs be removed (this plan), or should its 10 assertions be rewritten for the Rabbit Hole dev page?
- With askLiveOnPreview false, app-scope asks are unavailable. Should the app Graph tab's empty Results line stay the T02 copy 'Ask in the bar below. Answers about this page appear here.', or become a scope-neutral line until the user decides (a)/(b)?
- Coordination item for the Learn owners (no edit here; LearnPage.jsx is off-limits): the toast at LearnPage.jsx:689, 'Connect Google under Settings → Connections to import a deck.', contradicts the Planned Google Slides state, where open_settings says 'Google Slides is planned; nothing was connected.' (agent-core commands test). The Learn owners should change that copy on their branch.

**Canvas record (LEARN_DB) and dev worker**
- Canvas chat attachments are refused with 400 in phase 1, because a multipart canvas ask would otherwise reach live small-cp's ask-uploads/ R2 write. The alternative is to route multipart canvas asks through the seam and skip that write. Is refusing acceptable for phase 1?
- Canvas answers skip the learn_moments log (ponytail). Is that acceptable to the YouTube moment flywheel owner, or should repository-schema.sql gain a learn_moments table in a later T12 apply?
- Task 6.4 edits the approved T02 section 8.2 table to record the POST device_id, the untouched-only DELETE, GET /api/canvases?archived=1 and the canvas history paths. Keep that docs commit, or record these only in T04?
- T12 prep announces and then applies right away, because the change is additive and IF NOT EXISTS. Do you want a waiting period after the announcement before the '!' apply?

**Proposal lifecycle blockers**
- When the tool fails at approve time, should the proposal reopen (as planned, and needed so that a Slack viewer's click, slack.js:262-268, doesn't consume it), or end in a terminal 'failed' status, which the spec does not list?
- Who may reject? The plan allows any user in the proposal's workspace, which matches who can press Slack Cancel today. Should it be limited to the proposer or an editor?
- Should an expired proposal also persist status='expired'? The plan computes it instead: no extra write, no migration.
- Confirm the one small addition beyond the four bugs: the permission recheck returns 403 instead of 400, so the section 7.3 'No longer allowed' state is distinguishable. agent-ui's cardView (bar.js, v3 order 7.8) already maps 403 that way.

**Settings, Connections, Start dialog, e2e, deploy**
- T02 §5 has the Question fallback say the question is 'kept in the Agent Bar'. But the bar is hidden on canvas and Learn routes (§6.1), and nothing seeds a canvas-scope draft, so the claim is not true where the user lands. Should the §5 copy become "Opened your canvas. Your question wasn't transferred."? The text is owned by learn-hook (learnAction), not by StartDialog.
- learnAction needs a way to return the §5 Start copy instead of the §9 bar /teach copy. This plan passes { from: 'start' } in the payload. agent-core should confirm that field name, or name another.
- create_canvas with open:true must resolve href ('/apps/canvas-<id>') so Start can address the Learn request (slugOf(href)). The contract names href only for open:false. Can agent-core confirm that href is returned in both modes?
- Question depth (Overview, Guided, Deep dive): the §9 request has no depth field, so this plan appends 'Depth: <x>' to the prompt, marked with a ponytail comment. Is that acceptable, or should Learn add a field?
- Gate C: approve or reject the phase-1 deviations recorded in T02 §17 (order 13.5): no Shift+Enter, no [+] attachment, no Undo line for Start-created canvases (Undo only for bar-created ones), no Authored path card, no canvas rename UI (the PATCH API exists), the bar hidden on every canvas route, and askLiveOnPreview off by default.
- When 'small:start' arrives without a path (Home's primary CTA may send none), the dialog opens on Repository, in spec order. Would Question or Blank read less GitHub-first for teachers and students?
- Is reading C:/Users/cyudhist/Desktop/workspace/small-deploy/.env by absolute path acceptable for this worktree's builds and harness runs? It is never copied and no value is printed. The root .env that make test-integration needs is asked for at 13.8, not created by any task.
- Is 'Dev preview' the right availability label for the AWS row in the dev catalog? T02 §11 says 'Dev/private builds only', and private builds keep today's pane unchanged.
- 13.8 stops for your go-ahead: make test-integration runs against live small-cp, deploys the examples to Fly and approves a real proposal (test_ask.py). If you say go, will you create smart-home/.env yourself (SMALL_API, SMALL_TEST_BYPASS, S3_BUCKET)?
- For the Learn owners (recorded in T02 §17; this branch does not edit LearnPage.jsx): change the canvas menu's 'Google Slides…' toast (LearnPage.jsx:689), which points to Settings for an import that is Planned?
- askLiveOnPreview: the default false keeps /ask in workspace and app scope off on the clone. Order 13 deploys only with the value you chose at agent-ui's Agent Bar deploy STOP step (10.2). Which do you choose?

