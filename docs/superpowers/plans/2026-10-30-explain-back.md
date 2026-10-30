# Explain-back card and Tutor assessment: implementation plan

Version 1.6 · 30 October 2026 UTC · Implementation handoff for Parallel

> **For Parallel:** implement this plan in small parallel slices, using `superpowers:subagent-driven-development` or the repository's current execution workflow. Keep one owner per shared file. Push each coherent working slice; do not wait for all modalities or cosmetic polish.

**Goal:** let a learner submit text, retained voice, Sketch, recordings and resources as one durable answer, receive a criterion-based review and blue rating out of 10, then revise with the prior answer and feedback available to Tutor.

**Architecture:** extend the existing card, Sketch host, durable Tutor attempt store and admitted assessment routes. Freeze authorized evidence and the selected parent review; calculate each rating from the current attempt's validated criteria. Reuse existing media/resource primitives with private attempt access.

**Tech stack:** existing React/Vite frontend, JavaScript Workers/control plane, D1 and existing media storage, Node unit tests and registered browser CI. No new service, canvas engine or UI library is required by this plan.

**Spec:** sections 3–9 below plus the approved `explain-back-ui.html` visual reference. Section 2 supplies current files; section 11 supplies owners, tasks, milestones, checks and push rules. All checkboxes below are requirements, not completion claims.

**Start here:** use **six agents total: Parallel as integrator plus five workers**. Deliver the card preview first, then the durable text/revision loop, then voice/static Sketch, resources and recordings. Voice and resource work can proceed concurrently. Give the owner a working preview and a short try-it path at every usable milestone.

**Global constraints:** recording never edits typed text; one owned Sketch host; private immutable attempts; attempt 2 receives its selected parent's answer and exact review; each reviewed attempt has its own blue `N/10` badge; assessment remains free to the learner; no fabricated evidence or rating; preserve ordinary Challenge and Notebook behavior.

**Review focus:** panel moves must not break capture or lose drafts (EB-03/06); board shares/forks must not expose private media/history (EB-02/05); uncertain evidence must not become a zero or fabricated review (EB-07/08); late results and retries must target the original attempt without duplicate calls (EB-02/04); a mistaken prior review must not distort the new score (EB-07/08).

Canonical tasks: **TUT-16** (Explain-back update) and **UI-29** (generation-prompt visibility).

**Approved UI revision:** the Explain-back question/answer card stays visible on the left. **Open sketch** opens one independently resizable right-side panel with a pin icon and an owner-question row. Closing preserves its content; a dot on Open sketch indicates content. The panel has no permanent connector to the question and does not move as a coupled pair. The actual **Input connector is green**, at the upper-left header edge. Existing card ports, **Notebook top/bottom ports and Group top/bottom ports** connect to it. A learner can also record and submit **voice alone**, without writing or opening Sketch. **Replace speech-to-text insertion into the answer field with a retained, replayable voice note. Recording must never populate or modify the typed answer.**

**Assessment revision:** section 7 now specifies complete multimodal evidence ingestion, one coordinated review, and attempt 2 using attempt 1's answer and feedback. Voice transcription stays separate from typed text. Each fully assessed attempt also receives its own **rating out of 10, displayed in a blue badge**. These are implementation requirements, not claims that the new assessment is live.

**Scope:** this is the implementation brief for Parallel, updated to the owner's latest UI and assessment decisions. It supersedes the older visible Sketch wire, coupled dragging, Sketch included badge, mobile question-hiding behavior and Sketch-only recorder entry. The accompanying HTML demonstrates UI with simulated actions; this document update is not a claim that production implementation, recording or assessment has shipped. No message has been sent to Parallel by this update.

## 1. What to build

Extend the existing Explain-back card into a place where a learner can explain an idea using typed words, voice alone, drawings, resources or a combination, receive focused feedback, and improve their explanation without losing earlier attempts.

The learning loop is:

**Read the task → explain in your own way → submit one combined answer → inspect feedback and evidence → revise → try a related challenge when ready.**

This must work across subjects and levels. Pendulums, physics and `/practice` examples below illustrate the behavior; they are not hardcoded content or routing rules.

This document is a prepared implementation handoff. It does not assert that the update is built, deployed or accepted, and it has not been sent to another agent. It supersedes older Explain-back UI descriptions where they conflict with the decisions below. Keep unrelated Challenge cards working.

## 2. Current source and files Parallel needs

This handoff was reviewed against GitHub **`main` at `3591c49b2507c97e037ca7d45ebac90093a7c643` on 30 October 2026 UTC** ([commit](https://github.com/Rabbit-Hole-App/Rabbit-Hole/commit/3591c49b2507c97e037ca7d45ebac90093a7c643)). This is a source and test inspection, not a claim about a feature branch, passing new-feature tests or deployed behavior. Re-fetch main once at kickoff, record the actual base SHA and reconcile intervening changes. Do not restart the whole investigation when only a few relevant files changed.

### Read first

1. Repository `AGENTS.md` and `CLAUDE.md`: current worktree, browser, spend, migration and release rules take precedence over historical operational notes.
2. This complete document, especially sections 3–9 for behavior and section 11 for execution. The accompanying **`explain-back-ui.html`** is the approved interactive visual reference. Its actions and example scores are simulated; do not copy mock assessment into the product.
3. `docs/superpowers/plans/2026-10-28-explain-sandbox.md`, `docs/superpowers/plans/2026-10-29-explain-tasks-8-11.md` and `docs/features/explain-sandbox-checklist.md`: reuse the small-release/checklist/receipt discipline from `/explain`, not its stale completion claims, release SHA, budget or unrelated scope.
4. `docs/features/parallel-dev-deploys.md`, `docs/features/prod-release.md`, the package scripts and current release scripts before deploying. `docs/features/explain-back-sketch.md` is historical background; the approved behavior here supersedes its inline-Sketch UI.

### Existing files: reuse, gap and owner

Paths below are repository-relative and verified at the pinned commit. **P/U/D/A/R/M** are the six agents defined in section 11. New proposed files appear separately below.

| Owner | Existing files / seam | What to reuse and change |
| --- | --- | --- |
| U | `packages/web/src/LearningBlocks.jsx` — `ChallengeBody`, `SketchHost`, `Kicker`; `packages/web/src/index.css` | Current card uses a single-line answer, inline Sketch, and `SpeakAnswer onText` appending into `setDraft`. Replace Explain-back layout/readiness with the approved card and retained voice note; preserve ordinary Challenge. Keep the exercise `block.prompt` distinct from generation metadata. Reuse Inter Variable, existing tokens and lucide icons. |
| U | `packages/web/src/ResizableSidePanel.jsx`; `packages/web/src/CardPrompt.jsx` — `PromptControl`, `CardPromptControl`, `PromptSlot`, `placePrompt` | Reuse resize/accessibility/prompt disclosure behavior. Desktop collapse retains children, but narrow collapsed panels unmount them: draft, recorder and notebook lifetime must not depend on that branch. Avoid changing this shared component when composition suffices. |
| R | `packages/web/src/AdaptiveCanvas.jsx` — `CanvasNode`, `NotebookCard`, `renderSketch`, `captureSketch`, `sketchHost` | Notebook already has generic top/bottom ports. Preserve iframe/editor identity and notebook writeback. **Capture currently queries the first matching Sketch under `surface.current`; moving it to a sibling panel requires an explicit single-host capture ref keyed to question/attempt.** Do not silently submit null visuals. R is the sole editor of this entire shared file. |
| R | Same file — `portPosition`, `snapPort`, `connectorTarget`, `connect`, `repoint`, `linkRoute`, Group rendering; `packages/web/src/learn-connectors.js` | Add semantic upper-left Input and Group ports; preserve ordinary four-side edges. Deduplicate by source/scope, not only physical endpoint tuple. Fresh main's Group frame includes a Rabbit Hole footer measured by `groupRoom`; bottom port must follow the actual frame, including footer. Groups with fewer than two members need explicit unavailable/collapsed behavior. |
| P | `packages/web/src/LearnPage.jsx::gradeCanvasAnswer`; `packages/web/src/learn-grade.js::gradeAnswer` | Current path calls `/api/learn/assess`, with separate shadow grading in some cases. Wire Explain-back to durable attempts without duplicate assessment/Progress calls; retain unrelated legacy Challenge paths. |
| P | `packages/web/dev-worker.js` | Shared worker route wiring, feature activation and the inline `/api/learn/transcribe` route. That route returns text without saving audio or timestamped transcript; it uses a chargeable transcription feature. P integrates focused patches from D/A/M here. |
| D | `packages/web/src/learn-coaching-contract.js` — `SHAPES`, `RESPONSE_KINDS`, `validateCoachingRecord` | Existing response kinds are text/choice/numeric/drawing/code. Define the combined-answer discriminator and readiness once; empty typed text must be valid with other ready evidence. Keep legacy records readable. |
| D | `packages/control-plane/src/learn-attempt-routes.js::attemptRoute`; `packages/control-plane/src/learn-attempt-store.js` — `acceptAttempt`, `readAttempt`, `requestReassessment`, `claimAssessment`, `commitAssessment` | Reuse POST/GET `/api/learn/tutor/attempts` and reassessment, save-before-dispatch, immutable content hashes, submission-key conflicts, authorization and unknown-no-auto-retry. Add owner-scoped list/history, draft persistence, exact parent/baseline references and legacy-card activity binding. Reassessment is not a new learner revision. |
| D | `packages/control-plane/src/learn-coaching-store.js`; `packages/control-plane/learn-migrations/0025-tutor-coaching-state.sql`, `0026-tutor-attempts.sql`; `packages/control-plane/repository-schema.sql` | Existing private goals/criteria/activities and attempts are the base. Decide what existing JSON can carry before adding tables. One owner maintains additive migrations, schema mirror and `purgeTutorRows`. Allocate the next migration number at integration; do not assume it is still 0033. |
| D | `packages/control-plane/src/file-access.js`, `learn-files.js`, `learn-media.js`, `learn-storage.js`, `upload-body.js`, `file-sniff.js`; `packages/control-plane/learn-migrations/0023-file-imports.sql` | Reuse upload verification, immutable bytes, dedup, range reads and image storage primitives. **Generic board file access allows authorized viewers and inherited fork references. Private answer audio/snapshots/history must use attempt-owner authorization, not ordinary shared `fileRef` registration.** |
| A | `packages/control-plane/src/learn-assessment.js`, `learn-rubric-assessment.js`, `learn-visual-assessment.js` | Reuse admitted evaluator calls, criterion validation, perception uncertainty, operation settlement and deduplicated Progress. Current rubric/visual requests lack prior attempt + feedback; current `rubricSources` reads mutable board content and does not implement frozen Notebook/Group/file evidence. |
| A / reference | `packages/control-plane/src/agents/learn-grade.js`; `packages/control-plane/src/learn-grade-routes.js` | Legacy endpoint supports text + optional static Sketch and fresh single-answer feedback. Do not mistake it for the new multimodal durable/history flow; avoid extending two parallel assessment systems. |
| R | `packages/control-plane/src/file-context.js` — `fileContext`, `unitsOf`, `inRange`, `locLabel`; `learn-file-text.js`, `pdf-excerpts.js`, `pdf-pages.js` | Reuse authorized extraction/image adapters and page/cell/time coverage. Current resolver selects the latest ready derivative of a source revision: freeze derivative ID/hash/converter version too. Build one shared frozen-evidence resolver, not another generic ingestion system. |
| M | `packages/web/src/SpeakAnswer.jsx`; `media-storage.js`, `media-import.js`, `file-source-client.js`; reference `voice-stt.js` | Reuse capture and upload primitives where compatible, preserve other dictation consumers. New retained note/player needs private storage, pause/replay/remove and track cleanup. Audit codec/MIME support rather than assuming MediaRecorder WebM is accepted. Realtime `voice-stt.js` is a separate nonpersistent path. No synchronized Sketch recorder was verified in current source. |
| P | `scripts/ci/check-map.json`, `affected.mjs`, `run-part.sh`, `stack.sh`; `.github/workflows/verify.yml`, `fast-e2e.yml`, `deploy-dev.yml`, `deploy-prod.yml`; `scripts/dev-deploy-gate.mjs`, `scripts/prod-release.mjs`; `packages/web/scripts/gate-evidence.mjs` | Reuse actual registered checks, exact-SHA CI and release evidence. The pinned repository has **no `release-gate.yml`**. Resolve the current authorized full-gate launcher from current operational instructions; its external path was not verified by this audit. |

### Proposed additions and ownership

These names are proposals, not claims that files already exist. D/P lock the final paths in EB-01; prefer an existing adequate helper over a duplicate abstraction.

| Owner | Proposed new path | Responsibility |
| --- | --- | --- |
| D | `packages/web/src/explain-back-contract.js` + `.test.mjs` | Pure shared content/evidence/review validation and fixtures; extend the existing coaching contract to use it. |
| D | `packages/control-plane/src/learn-attempt-assets.js` + corresponding `test/learn-attempt-assets.test.js` | Private attempt asset authorization/lifecycle using existing storage primitives. Add only if current private media helpers cannot cover this responsibility cleanly. |
| U | `packages/web/src/ExplainBackPanel.jsx` | Focused answer/history/feedback presentation as needed; keep existing card dispatch and shared Sketch host. No general canvas rewrite. |
| M | `packages/web/src/explain-back-media.js` + `.test.mjs`; `packages/web/src/VoiceNote.jsx` | Recorder lifecycle independent of panel mounting, playback and retained-note controls. |
| R | `packages/control-plane/src/learn-explain-evidence.js` + corresponding `test/learn-explain-evidence.test.js` | Frozen resource expansion/coverage used by A; reads D's authorized manifests and M's immutable derivatives. |
| A | `packages/control-plane/src/learn-explain-rating.js` + corresponding `test/learn-explain-rating.test.js` | Small pure server-side criterion-to-rating calculation; do not add a service or model call. |
| P | `packages/control-plane/test/learn-explain-integration.test.js`; `packages/web/e2e/explain-back-attempts-check.mjs` | Real route/store integration with injected evaluators, plus registered browser checks for retained media and immutable attempts. |
| P | `docs/superpowers/plans/2026-10-30-explain-back.md`; `docs/features/explain-back-checklist.md` | Repo copy of this full specification/plan and one live task/milestone/receipt checklist. Keep the approved HTML reference reachable from the checklist. |

Existing test files and exact commands are in section 11F. Do not scatter checklist status into several competing documents.


## 3. The answer card and one optional Sketch panel

### Approved layout and ownership

Keep the **Explain-back question/answer card visible on the left**. **Open sketch** opens exactly **one independently resizable panel on the right**. It does not replace the question, create another answer card, open two Sketch panels, or insert a drawing area inside the text field. Text, voice and Sketch belong to the same answer; each modality is optional.

The Sketch is an owner-bound panel, not a second canvas card that must be wired to the question. Its header identifies **Sketch** and the selected attempt. A compact owner row directly below shows the originating question; clicking it focuses that existing question. Use a subtle selection outline on the owning question while the panel is open. **Do not draw a persistent question-to-Sketch connector, show a Linked badge, or move the two surfaces as a coupled pair.** Resource-to-Input connector lines remain real canvas edges.

| Element | Required content and behavior |
| --- | --- |
| Question-card header | **Explain back**, existing prompt disclosure and drag affordance. Moving this card moves only this card; resource edges follow its Input anchor. |
| Green Input connector | At the card's **upper-left edge beside the Explain back header**. The connector itself is green; do not add a separate green status dot beside the label. Keep the concise label **Input**, a clear hit target and accessible connection-picker alternative. |
| Task | Keep the actual question and **Details & hint** visible. The generation prompt is separate metadata. |
| Answer field | Multiline **Explain in your words**. Placeholder: **Write an answer, or record a voice note below. You can also add a sketch.** Enter inserts a newline. The field may remain completely empty for voice-only or sketch-only answers. |
| Connected inputs | Compact resource pills immediately below the text field. Each has a type icon, source name, scope where applicable, and **×**. Use a single Group pill for a Group connection, with member count and accessible member details. |
| Voice entry on the answer card | **Record voice** is available while Sketch is closed. Recording and the saved voice note appear in this card. No drawing or written text is required. See section 5. |
| Answer footer | **Open sketch** plus the primary **Submit answer**; after assessment, **Revise answer**. Keep the Open sketch label when a sketch already exists. |
| Sketch content indicator | A small dot **on Open sketch** only when that attempt contains meaningful Sketch content, including a retained Sketch recording. Empty/open/pinned alone must not produce the dot. Accessible label: **Open sketch — contains content**. Remove the old **Sketch included** or **Included in your answer** badge. The dot indicates content, not an unread message or success state. |
| Sketch header | **Sketch**, attempt/status, **Pin**, optional explicit expand action, and **Close**. The pin uses a real pin icon and `aria-pressed`. |
| Sketch owner row | Show the question title, truncate visibly when necessary, expose the full title on focus/hover/touch, and provide a focus-return action. This identifies the relationship without a wire. |
| Sketch body | Dotted drawing surface using the existing shared canvas toolbar. No duplicate drawing toolbar in the panel. |
| Sketch media controls | Sketch recording, Audio on/off, Pause/Resume, Stop, elapsed time and playback stay in the same Sketch panel below its drawing surface. They do not create a second panel. |

### Pin, resize, close and reopen

- Pin keeps the open panel bound to its originating question while the learner works elsewhere. Clicking another question does not silently retarget a pinned panel or put marks into the wrong answer. Explicit Close always closes it; pinning is not a lock on editing or closing.
- An unpinned panel may close on outside interaction; closing is presentation only. Do not auto-close during an active recording or discard a recoverable take. Keep the owner association stable until an explicit open/retarget action.
- Drag the panel's left resize edge to change its width; a corner handle may also change height. Resizing must not resize/move the answer card, pan the board, restart notebook sessions, clear drawings or duplicate the panel. Keep the question readable; constrain the panel when available width is exhausted.
- Close preserves content, draft association, saved dimensions and the content dot. Open sketch reopens the same panel/content for that question and selected attempt. Repeated clicks must never mount a second panel or recorder.
- Moving the question does not drag the docked panel. The panel owner row and the question highlight update from stable question/attempt IDs, not screen position.
- Preserve the existing safe media lifecycle on navigation. If Close occurs during recording, stop cleanly, release capture resources and retain the recoverable take; never silently throw it away. Older submitted attempts remain immutable.
- An explicit expand control may temporarily focus Sketch, with an explicit restore action. **Open sketch itself must never enter that focus mode.** Restore must return both areas and the same content.

### Responsive and visual implementation specification

These geometry values describe the approved preview, not a replacement design system. Reuse current product components and tokens; do not copy the preview's demo shell, fake data, demo-mode switches or simulated recording code into production.

| Property | Implementation requirement |
| --- | --- |
| Wide layout | Question card approximately **390 px** wide; Sketch panel initially **460 px**, docked about **16 px** from the workspace's right edge. Keep at least **20 px** clear between them. At medium widths, use approximately **380 px / 420 px** where space permits. |
| Embedded/compact desktop | At **736, 800 and 1024 px** usable workspace widths, both areas must remain visible side by side, without overlap or horizontal clipping. At 736 px the preview uses roughly **326 px per area**, about **20 px** between them, and space on the left for Input. Size from the actual workspace/container, not just the browser viewport. |
| Small screens | When two readable areas cannot fit (preview breakpoint **720 px**), stack the separate Sketch panel **below the entire answer card**. Both remain in the page; opening Sketch must not hide the question. This is not a drawing area inserted into the answer editor. Preserve content and focus through resizing/orientation changes. |
| Panel resize | Initial drawing/header region about **495 px** high, adaptable to available space. Width floor approximately **296–320 px** where feasible; maximum **700 px** and always constrained by the question's remaining space. On a smaller phone use the available card width. Use an approximately **10 px** left-edge hit strip with a quiet **3 × 38 px** grip and a **25 px** corner control; enlarge touch hit areas without enlarging the visual mark. Keyboard arrows resize in predictable steps. |
| Spacing | Header about **53–55 px** high, **16–20 px** horizontal padding; answer content around **20 px**, gaps **8–12 px**. Owner row about **40 px** high. Drawing inset **12 px**. Footer padding about **12–14 px**. Resource pills wrap; no horizontal pill strip. |
| Typography | Reuse `--font-sans` (**Inter Variable** in current source). Body/control text around **14 px / 1.5**; question **20–21 px / 1.35**, medium weight; header **13–14 px**, medium weight; supporting labels **11–12 px**. Editable fields at least **16 px** on touch devices. |
| Surfaces | Reuse `bg-surface`, `border-line`, `text-ink`, `text-ink-2`, `bg-hover`, `border-select` and current primary-button styles from `index.css`. Approximately **12 px** outer radii, **7–8 px** inner controls, **1 px** neutral borders and the existing modest floating-panel shadow. Keep main and Sketch dot grids; no decorative background image. |
| Green Input | Use existing **`--color-success`** (light theme currently **#448361**, with the product's dark-theme mapping). An approximately **11–12 px** filled green connector, positioned at the upper-left header edge with a sufficiently large invisible hit area. Colour the actual connector, not an adjacent status ornament. |
| Other ports | Notebook/Group top and bottom ports use the existing shared port appearance: current `CanvasNode` uses a **16 px** circular mark, **2 px** accent border, centered on top/bottom edges. Preserve hover/focus/connected visibility and make them reachable on touch. Do not recolour every generic source port green merely because Explain-back Input is green. |
| Icons | Reuse `lucide-react`: `PanelRightOpen`, `Pin`, `X`, `Mic`, `Play`, `Pause`, `Square`, `Trash2`, `RotateCcw`, `AudioLines`, `NotebookPen` and `Group` as applicable. Approximately **16–17 px**, normal product stroke weight; no emoji or new icon library. Icon-only actions need names and tooltips. |
| Buttons and focus | Use the existing primary-button fill/token, approximately **35–36 px** control height for desktop, and effective touch targets around **44 px**. Preserve visible keyboard focus. Use `aria-expanded` on Open sketch and `aria-pressed` on Pin; name recording/resize controls and announce meaningful state changes. |

The UI reference is [explain-back-ui.html](https://chatgpt.com/library?file_id=libfile_bc2afeacb9bc81918340eca8641aefaa&account_id=personal), corrected layout version 3. It demonstrates panel layout and voice-only interaction with simulated data. The **Notebook/Group connector requirements in section 4 are additional implementation requirements**; that HTML version is not evidence they were implemented in the app or added to its preview.

### Prompt metadata and conditional navigation

Keep **Details & hint** separate from the generation **Prompt** disclosure. The exercise question remains visible even though current `ChallengeBody` calls its field `block.prompt`. Use distinct generation-request metadata; do not expose internal system instructions or invent a historical prompt. Keep the existing hover disclosure, keyboard-focus and touch access. UI-29 applies this behavior to other supported card types.

| State | Navigation and available actions |
| --- | --- |
| First draft | Question, Details & hint, optional text, Record voice, Input, Open sketch and Submit. No empty feedback tab or attempt dropdown. |
| Voice-only draft | Saved/replayable voice note on the answer card; text may be blank, Sketch may never have been opened. Submit becomes available once the recording and required upload are ready. |
| Sketch opened/closed | One owned panel. Closing preserves its content and the Open sketch content dot. Opening an empty panel alone does not make the answer submittable. |
| Inputs connected | Existing sources stay on the main canvas; their pills and resource edges reflect the same connection state. |
| Submitted, review pending | Immutable answer plus **Reviewing your answer**. No empty feedback tab. |
| Feedback available | **Your answer / Tutor feedback**, with the question retained in either view. |
| Revise answer | A new editable draft copied from the selected attempt. Show a compact attempt selector once there are at least two attempts/drafts. Keep old feedback attached to the old attempt. |
| Failure/unavailable | Preserve work; state the recording/upload/assessment problem accurately and offer the relevant retry/removal. No fabricated feedback or mastery. |

## 4. Notebook, Group and other resource connections

### Use the same top and bottom connectors

**Notebook and Group must offer the same top and bottom connection affordances as other canvas cards. Either source port can connect to the green Explain-back Input.** This supplies input/reference evidence to the answer, not a link to the Sketch panel.

1. **Notebook:** reuse its existing `CanvasNode` ports and `onConnect` plumbing. Current main already renders Notebook through that shared chrome; do not add a second set of ports. Verify reachability with notebook iframe/editor focus, resizing and comment pins. Preserve existing top-port/comment-pin coordination; provide a reachable top connection without overlapping or disabling the pin.
2. **Group:** add top-center and bottom-center ports to the actual Group boundary. Bind them to the stable Group ID, not the first child, the label chip or a copied screenshot. Compute anchors from the rendered Group frame, including its footer, and live member bounds; update when the Group moves, a member moves/resizes, membership changes, or the view zooms. The ports must not obstruct label editing or drag the Group when the user begins a connection.
3. **Explain-back destination:** add a distinct semantic Input endpoint at the upper-left header location. Reuse the shared drag, click-click, hit-testing, snapping and route system. The current generic left-side anchor is at the midpoint, so merely using `toSide: 'left'` is not sufficient for the required header anchor. Resolve this port's actual geometry explicitly while keeping the shared side-routing contract compatible.
4. **Semantic edge:** distinguish an Explain-back resource-input relationship from an ordinary decorative canvas edge. Persist stable source/target IDs, destination input identity, source port and chosen revision/scope. The edge and pill derive from one state transition and one relationship; do not persist independent lists that can drift. Reconnecting the same source/scope through its other port must not create duplicate input evidence.
5. **Accessible path:** retain the Input picker for pointer, keyboard and touch. Drag-to-connect and click-port-then-click-Input use the same operation. Include Notebook and Group in the picker; connected state, failure and removal must match the visual connector path.

### Group evidence and safe membership

- A Group connection supplies the Group's supported, authorized members as one named input. Show **Group name · N items** and inspectable membership/scope, not a duplicate pill for every member by default. Preserve individual source IDs, types, revisions and locators within its evidence manifest.
- Resolve membership from the existing Group model. Do not flatten it into an image, move members into Explain-back, create a synthetic notebook, automatically execute code or invoke a model merely to connect it.
- A draft follows current membership and visibly reflects the count/changed or unavailable items. Submission freezes the exact members, revisions and scopes used. Later Group edits, deletion or ungrouping cannot rewrite an earlier attempt.
- Deduplicate an item referenced directly and through a Group when building the evidence packet. Preserve provenance for both connections without assessing or charging for identical evidence twice.
- Prevent self-reference and input cycles, including a Group that contains the target Explain-back card. Reject or explain an invalid connection rather than silently including that card's answer as its own reference. Validate membership/access on the server; a client-side port is not authorization.
- Empty, deleted, ungrouped, inaccessible or unsupported members produce a specific unavailable/coverage state. Never silently substitute unrelated content or claim every member was assessed. Preserve the draft and let the learner repair the connection or explicitly remove unavailable evidence before submission.
- Ordinary card, notebook and Group connectors remain usable for existing non-Explain-back canvas connections. The new semantic Input path must not change unrelated connector direction, colour, routing, copy/paste or undo behavior.

### Removable pills, source continuity and ownership

- Supported sources include documents, PDFs, images, data, code, notebooks and Groups; reuse existing viewer/extraction support. A connected reference is not proof of understanding. Distinguish what the learner explains from imported material and known assistance.
- Put resource pills inside the answer card below the text field. Names truncate only with full-name access; pills wrap and leave **×** reachable. Clicking a name opens/focuses the existing authorized source, not a duplicate upload, model request or code execution.
- Pill **×**, selected-edge **Delete**, and the existing edge menu all call the same disconnect operation. Remove only that draft's relationship/pill/edge. Preserve source content, location, notebook session and old attempts. Undo restores the same connection without duplication.
- Delete while editing text/notebook cells must edit content normally. Escape clears edge selection; selecting an edge is not a drawing or Group-drag gesture.
- Preserve selected notebook cells, saved/unsaved revisions, output freshness, PDF page/region, code ranges and dataset ranges when supported. Identify coverage accurately; never describe a selected excerpt as the whole resource.
- Notebook edits and execution/session state must survive linking, focus changes, Sketch resize, feedback tabs, history and navigation. Do not use a view change to recreate its kernel/session or save an unchanged notebook.
- Sketch ownership is separate from this resource graph. There is no user-visible question-to-Sketch wire to delete. **Close** only hides the panel; an explicit Clear/remove action changes that draft's Sketch evidence. Preserve older submitted attempts.
- Persist draft content, voice references, question geometry, panel size/open/pin state and owner, resource relationships/scopes and Group membership revisions consistently. Show save conflicts/errors without discarding local edits. Do not expose private answer/media state through shares or forks by default.

### One shared drawing toolbar

Reuse `SketchHost`, `renderSketch` and the main canvas tools. Clicking the Sketch targets that question/attempt's drawing; clicking the main canvas or Escape releases that target. Closing/retargeting the panel or entering a read-only attempt must also release it. Drawing, selection, Delete, paste, undo/redo, wheel/pinch and embedded editor gestures must affect only their intended surface. Load heavy viewers on demand and release inactive rendering resources without losing content or mounting every historical attempt.

## 5. Voice-only answers and optional Sketch recording

### Voice alone is a complete answer

**Owner correction: replace dictation with a voice note.** In Explain-back, remove the current Speak answer behavior that writes the transcript into the answer field. The new **Record voice** control creates a retained audio note with playback. Recording, stopping, transcription completion, replay, removal and re-recording must leave learner-entered text unchanged, including when the field is empty. A transcript is separate assessment/accessibility data, never an automatic insertion, replacement or append in **Explain in your words**. Preserve existing saved answers; do not try to remove historical text that may have originated from speech.

The learner can submit **only a recorded voice note**, with **no written answer, no Sketch and no connected resource required**. Record voice must be available directly on the question/answer card while Sketch is closed. Do not require opening a blank Sketch, inserting filler text, accepting an auto-filled transcript or drawing a token mark to enable Submit.

Required flow: **Record voice → Pause/Resume if needed → Stop → replay, remove or re-record → Submit answer**. Put the stopped note in a compact answer-card row with play/pause, waveform or neutral progress display, elapsed/duration, scrub control and remove/re-record actions. Do not invent a waveform if audio samples are unavailable; use a neutral progress track instead.

- Request microphone access only when the learner explicitly starts/enables audio. Show **Recording**, elapsed time, **Pause/Resume** and **Stop**. Stop/cancel releases all microphone tracks. Prevent simultaneous independent voice and Sketch captures from competing for the microphone.
- While recording or paused, disable Submit with **Stop recording to submit**. After a valid take stops, save/upload it and enable submission when required evidence is ready. A stopped recording is valid with empty text and no Sketch. Removing the only voice note returns an otherwise empty answer to its disabled state.
- Preserve the audio as a replayable, authorized asset associated with the draft/attempt. Current `SpeakAnswer` records audio and appends a transcript to the text input. Reuse its capture/transcription internals, but **replace that field-insertion behavior in Explain-back** with a retained voice asset/player. Refactor shared pieces without breaking other SpeakAnswer consumers.
- Keep generated transcript separate from learner-entered text, with timestamps/revision and uncertainty where available. A transcript may help evaluation and accessibility; it is not a requirement that the learner type or fill the answer editor. A transcription failure must preserve the audio and offer recovery, not convert the submission into an empty/incorrect answer.
- Playback, seeking, deletion, history and re-record preparation are local UI actions. Starting transcription/assessment uses the existing authorized route and spend rules, with explicit operation state; toggling a panel or replaying audio must not call a model.
- Permission denial, unavailable recorder, interruptions, upload failures and revoked access show a specific recoverable state. Keep other text/drawing intact. Only offer voice when the actual storage/evidence/assessment path is ready; never label the preview's simulated audio as production support.

### Sketch recording remains in the Sketch panel

Keep static drawing, silent Sketch recording, and Sketch recording with narration. Its media controls stay **inside the single right-hand Sketch panel, below the drawing**. They capture that Sketch surface and its timeline only, not the answer card, surrounding board, unrelated windows or full screen. Connected resources remain separately versioned evidence.

Use Record, Audio on/off, Pause/Resume, Stop, elapsed time, replay/scrub and remove/re-record controls. Silent recording must not request microphone permission. Pause/resume keeps visual and audio timelines synchronized; Stop releases capture resources. Preserve a starting snapshot and sufficient timing/visual evidence—one final screenshot cannot stand in for demonstrated steps.

Text, voice note, static Sketch, Sketch recording and connected references can be combined into **one immutable answer and one coordinated assessment**. Avoid duplicate audio/transcript evidence when narration is already part of a Sketch recording. Neither recorder opens another panel.

**Proposed initial duration limit: two minutes per recording; not finalized.** Keep duration/file limits configurable and visible; warn and stop cleanly, without silent truncation. Preserve existing retention, asset authorization and budget boundaries. Inspect existing recording/storage infrastructure before introducing a service. On reload/navigation recover what was actually persisted and say what was not; never claim an unsaved take is safe.


## 6. Submit one durable answer

Submission is a snapshot, not a pointer to whatever happens to be on the canvas when a background model finishes.

1. Flush active editor state and prepare the selected text, objects, material revisions and media.
2. Confirm included uploads are complete. If a file cannot be included, show the problem and allow repair or explicit removal; never silently omit it and grade a different answer.
3. Save an immutable attempt with its card, canvas, learner, activity revision and criterion versions before assessment starts.
4. Start or resume one assessment operation for that attempt using a durable idempotency key.
5. Show progress on that attempt. Reloading or reopening resumes reading the existing operation; it must not automatically make another provider call.
6. Attach the resulting feedback to that exact attempt. A late result must not modify another attempt, canvas or user's card.

Reuse the existing attempt/assessment records and permission checks. An attempt manifest should cover:

- Text and structured workspace snapshot or immutable snapshot reference.
- Included asset IDs, hashes/revisions and source locators; media timeline and transcript versions when applicable.
- The stable question/attempt-to-Sketch ownership, retained voice assets and connected-input identities/scopes that were included at submission, including frozen Group member IDs/revisions. Removed evidence is excluded from the new attempt; later edits or disconnects cannot rewrite older snapshots. Pills and edges are views of the same connection state, not independent sources of truth.
- Activity/question/hint and rubric versions, plus known assistance references. For a revision, include its parent attempt reference and freeze the authorized previous assessment/evidence context used for comparison under section 7F.
- Submission key, timestamps and operation state.
- Assessment provenance: what was read, omitted/unreadable portions, evaluator versions, requested/served models, latency and recorded cost.
- Feedback, evidence anchors and any supporting teaching-material IDs.

Store large media using the existing authorized asset storage, not base64 blobs in every board save. Evaluate actual schema needs before proposing a migration. Keep a backwards-compatible adapter for legacy text/sketch cards; do not invent missing history.

## 7. How Tutor assesses every answer format and revision

**One submitted answer receives one coordinated assessment against the question's criteria.** The learner may use text, a voice note, a static Sketch, a silent or narrated Sketch recording, attachments, Notebook/Group inputs, or a combination. Optional formats must not become hidden prerequisites. Do not issue unrelated modality scores and average them. This section defines required behavior to implement, not behavior already shipped.

### A. Freeze and resolve the complete evidence packet

1. Save the immutable attempt under section 6 before evaluation. Its manifest identifies the exact question/activity revision, criterion versions, typed text, retained voice assets, Sketch snapshot and recording, selected attachment scopes, frozen Notebook/Group members and revisions, and known assistance. Record the parent attempt when this is a revision.
2. Resolve asset bytes and source content on the server under the learner's current access. An ID, URL, filename, visible pill or canvas edge alone does not mean the model received its contents. Load authorized selected pages, cells, regions and media segments through existing adapters. Never substitute the source's latest revision for the submitted one.
3. Prepare a coverage manifest with an entry for every included input: read/processed, sampled/partial, unavailable, unsupported, or still processing. Preserve source locators and pin derivative IDs/hashes and preprocessing versions, rather than selecting a newer derivative later. Do not silently drop a file, audio track, diagram or Group member and present a complete review.
4. Deduplicate identical material connected directly and through a Group, and narration already contained in a Sketch recording. Preserve the provenance of each relationship. Reuse authorized preprocessing results by content hash/revision; do not transcribe the same retained clip again on every revision or panel open.
5. Construct one assessment request/context containing the task, versioned criteria, current evidence and coverage, and the separately labelled revision context defined below. The full workflow may need transcription/extraction/vision calls; **one coordinated assessment does not mean every medium must fit into one provider call**. Keep one durable operation/result for the learner, with child calls tracked under existing spend admission.

### B. Required behavior for each answer combination

| Answer supplied | Evidence to assess together | Requirement |
| --- | --- | --- |
| Text only | Typed claims, equations, reasoning, examples and assumptions | No Sketch or recording required. |
| Voice note only | Retained audio plus a separately stored, time-linked transcript when available | Text field stays empty. Submit and feedback belong to the audio attempt; no transcript insertion or acceptance in the editor. |
| Static Sketch only | Rendered image plus structured labels, objects, arrows and relationships | Judge demonstrated meaning; text is optional and marks alone earn no credit. |
| Text and/or voice + static Sketch | Written/spoken explanation and the image/objects | An idea demonstrated in either medium can satisfy a criterion; resolve contradictions explicitly. |
| Silent Sketch recording | Starting state and visual changes in time order, including relevant intermediate steps and final state | No microphone or written explanation required. A final screenshot cannot substitute for the process. |
| Narrated Sketch recording | The same visual sequence synchronized with narration/transcript | Relate words such as "this arrow" or "now" to the corresponding visual state. Do not grade only the transcript. |
| Recording + text, separate voice note or static Sketch | All retained current-attempt inputs, preserving their identities and timing | Do not discard the recording because text is present, or count the same narrated content twice. |
| Attachments, Notebook or Group, alone or with the above | Supported selected content, learner annotations/work, cell code and saved outputs, member revisions, plus the learner's explanation in any medium | A submitted solution diagram or notebook may demonstrate understanding without prose. An imported reference by itself does not establish that the learner understands it. |
| All supported formats combined | The complete deduplicated packet | One criterion-level review; explicitly report any evidence that could not be assessed. |

Do not reject a completed learner artifact solely because the answer editor is empty. If an attachment only supplies reference information and no observable learner reasoning, say understanding is **not yet established** and ask a targeted question; do not label the learner wrong merely for providing a reference. Distinguish known learner-authored content, imported references and supplied AI help without guessing authorship or cheating from writing style.

### C. Process each medium honestly

- **Voice:** keep the original note replayable and the transcript separate from typed text. Preserve timestamps/revision and transcription uncertainty where available; do not invent word-level timing. Assess conceptual reasoning, not accent, speaking speed or fluency unless speech itself is the task. If transcription is uncertain, use the relevant audio only through a validated audio-capable route, or request clarification. If transcription fails, preserve the note and recovery path; do not treat it as an empty or incorrect answer. If only a transcript was inspected, say so in coverage rather than claiming direct audio assessment.
- **Static Sketch:** use image and structured information together. Textual mark counts cannot replace the image when relationships depend on geometry. An unavailable capture or unreadable drawing produces explicit incomplete/unassessed coverage; never claim to have seen a picture that was not passed to the evaluator. Ask for the ambiguous part rather than guessing.
- **Recording:** retain an initial state, timeline and sufficient intermediate visual evidence. Use a validated video-capable route or a timestamped frame/event adapter that preserves the steps needed for the criterion. Disclose sampling and inspected intervals. Preserve audio/video synchronization across Pause/Resume. When missing intervals might change the conclusion, inspect the relevant segment within authorized limits or leave the affected criterion unassessed. A learner's clear later self-correction in the same recording supersedes their earlier mistaken claim for the final judgment.
- **Attachments:** inspect the selected PDF pages/regions, images, document excerpts, webpage captures or dataset ranges with enough surrounding context to interpret them. Do not reread an entire long file by default or introduce a blanket page-count rejection. Report coverage; never claim uninspected pages were reviewed.
- **Notebook/code:** inspect selected cell IDs, code, explanations and saved outputs at the frozen revision. Identify whether outputs are stale and whether execution actually occurred. Reading code is not running it. Connecting/submitting does not authorize arbitrary code execution; use an existing authorized sandbox only when applicable. Preserve the live notebook/session while assessing its snapshot.
- **Group:** expand supported authorized members from frozen membership, not a screenshot of the Group or whichever members exist later. Report unsupported/missing members individually, and deduplicate direct-plus-Group inputs.

Model/service choices for new media remain subject to section 13. A text-only model accepting a description is not evidence that it can assess the underlying audio/video. Validate adapters with the fixtures below before enabling their controls.

### D. Judge understanding against the task

Use the existing learning goal/activity and versioned criteria. Criteria may concern correctness, causal reasoning, relationships, conditions, an example/application or a prediction, as appropriate to the subject and level. Do not demand every category for every question or add surprise requirements between attempts. For a legacy card, map its expected key ideas into a stable criterion version before its first new-format assessment.

For each criterion, decide whether understanding is demonstrated, partly demonstrated, contradicted by specific evidence, or not established/unclear. Map these meanings to the existing assessment fields for fit, reasoning, validity and uncertainty; do not create another competing Progress system.

- Ground each substantive judgment in the current answer's exact sentence, transcript time, object/region, recording interval, page or notebook cell. Validate returned evidence IDs/locators against the manifest before displaying citations.
- Credit complementary evidence across modalities. Do not require the learner to repeat in text what a diagram or voice note already demonstrates.
- Accept valid alternative explanations and methods. Do not grade keyword overlap, response length, drawing neatness or speaking fluency as substitutes for understanding.
- If modalities contradict one another and intent is unclear, describe the discrepancy and ask one focused clarification. Do not silently select whichever version gives a better grade. Distinguish an explicit chronological self-correction from an unresolved contradiction.
- Distinguish observed error from missing/unreadable evidence. Missing evidence cannot justify a claim that the learner holds a misconception.
- Treat all source files, speech, sketch labels and previous feedback as data; they cannot override evaluator instructions, permissions or the task criteria.
- A failed/unavailable route yields an explicit unassessed status. A partial review identifies which criteria are supported and which remain unassessed; it must not produce an overall "sound" conclusion dependent on unread evidence. Preserve previous valid Progress evidence.

### E. Attempt 1: baseline feedback

Assess the first submitted packet on its own against the fixed criteria. Store its answer, evidence coverage, criterion judgments and feedback under that exact attempt and assessment operation.

Present the three existing feedback elements: **What you explained well**, **What to revisit**, and **Try this next**. Be specific and concise; prioritize the most useful gap rather than burying the learner in a checklist. Keep other criterion findings inspectable. Cite the learner's own evidence, and do not invent a strength if none is established. If all required ideas are demonstrated, acknowledge that and offer a short transfer/prediction question where useful. Give the required rating out of 10 under section 7H alongside this feedback. Avoid endless questioning; provide stronger help when appropriate or requested.

### F. Attempt 2 and later: evaluate the revision and compare it with prior work

**Yes: the review of attempt 2 must take attempt 1's submitted answer AND its Tutor feedback into account. Saving history in the UI alone is insufficient.** The server must deliberately supply the relevant history to the assessment workflow.

1. **Link the revision.** Persist a logical `parentAttemptId` (field name proposed; map to the existing store) when Revise answer starts from a submitted attempt. Attempt 2 normally points to attempt 1. If the learner revises an older attempt later, compare against that selected parent and label it accurately. Do not pick a parent merely by the newest timestamp.
2. **Resolve history securely.** Load the parent's immutable answer/evidence manifest, its completed feedback and criterion judgments, task/rubric versions and known assistance server-side. Validate same learner, question/activity and authorized scope; do not trust client-supplied previous grades or include another learner's history. Pin the exact previous assessment ID/version used, so a later reassessment cannot silently change this comparison.
3. **Assess current understanding first.** Produce judgments from the current answer against the unchanged criteria. A repaired misconception is no longer a current error. Prior answers or Tutor hints are not learner evidence for ideas missing from the current submission. Content deliberately carried into the new draft and submitted again is current evidence; removed resources/recordings are not. Do not count typing more words or switching modality as improvement by itself.
4. **Compare and coach.** Using the previous evidence and feedback, identify which gaps were resolved, which persist, any regression/new misconception and anything that cannot be compared. Cite current evidence for the change and reference the relevant previous criterion/feedback. Feedback should acknowledge improvement and focus the next step on the remaining need rather than repeat a resolved nudge.
5. **Keep old feedback fallible.** Recheck the relevant old evidence when needed. Do not treat a prior Tutor claim as ground truth; if it was mistaken, say so and correct the comparison without rewriting the historical record. Distinguish a corrected prior assessment from actual learner improvement.
6. **Handle missing or changed baselines.** If the parent has no completed assessment or its evidence is unavailable, still assess the current answer but report that comparison is unavailable; do not silently assess the old attempt again or invent its review. If the question or criterion version changed, identify that change and avoid a direct before/after mastery claim for non-equivalent criteria.
7. **Bound history without losing the baseline.** Always retain the direct parent's answer/evidence references and feedback. Relevant excerpts/segments may be loaded instead of every previous recording in full, with coverage disclosed. For longer histories, add a compact criterion-level summary of earlier attempts with provenance; never replace the direct parent with an unverifiable summary. Freeze the comparison context used by this assessment.

These are two logical stages of one coordinated assessment, not a requirement for two paid model calls. Reuse the existing admitted evaluators/adapters where sufficient. Keep the previous judgments clearly separated from the current-evidence judgment to reduce anchoring; check that behavior with an intentionally wrong-prior-feedback fixture. Do not average old and new scores or penalize a corrected mistake forever. Retain known assistance when updating Progress; improvement after feedback is not automatically proof of unaided transfer or retention.

Example only, not hardcoded output: attempt 1 confuses inward force with the direction of motion. Attempt 2 fixes the force explanation but still draws velocity inward. Useful feedback is: **"You now explain why the force points inward, which was missing in attempt 1. Your diagram still shows velocity pointing inward too. How would you change that arrow?"** A complete correction should instead be acknowledged, with no repeated claim that the old error remains.

### G. Store and validate a review that can be inspected later

Extend existing attempt/assessment records; the following are logical requirements, not a mandate for another store or duplicate schema:

- Attempt/assessment IDs; task, criterion and evaluator versions; submitted evidence hashes/revisions; immutable parent/baseline references where applicable.
- Coverage for every included input, including omitted/unavailable portions, inspected/sampled intervals and any preprocessing uncertainty.
- Criterion judgments, current evidence anchors and unresolved questions, mapped to existing fit/reasoning/uncertainty fields.
- Learner-facing strengths, priority gap and next step. For revisions, a comparison describing resolved, persisting, new/regressed or non-comparable findings with baseline/current evidence references.
- Provider provenance, requested/served models, actual recorded cost, child operation IDs and known assistance; existing idempotency and recovery rules apply.

Reject or repair malformed evaluator output using the established bounded recovery policy; never fabricate citations, timestamps or an overall grade. Late results remain attached to their originating attempt. Assessment is free to the learner under the existing policy, with platform spend admitted/logged; it does not authorize new paid tests or free Motion generation. Progress changes only from validated, versioned evidence, once per operation.


### H. Rating out of 10 for each attempt

**Owner decision: show a blue badge such as `7/10` for each assessed attempt.** It rates that submitted answer, not the learner as a person. Keep the detailed feedback and evidence; the number is a compact summary of the same assessment.

- Use whole numbers from **0 to 10**. Calculate the rating from the validated criterion judgments on the server, not from an unrelated model impression or separate modality scores. Implementation default: met = 1, partial = 0.5, not met = 0; use equal criterion weights unless the versioned task rubric already defines weights. Calculate `round(10 × sum(weight × credit) / sum(weight))`. When any required criterion is only partial/not met, cap the rounded value at 9; **10/10 requires every required criterion to be met**, including required reasoning. Map these meanings to the actual assessment schema and version the calculation. The weight/formula choice is an implementation default, not a claim that existing code already calculates it.
- Keep the rubric, weights and calculation version stable across comparable attempts. Do not raise a score merely because this is attempt 2 or because the learner added an attachment. Attempt 2's rating uses only its current evidence; prior feedback informs the comparison and coaching, not a cumulative average or automatic bonus. Scores may rise, stay the same or fall.
- If an input is unreadable/unavailable and a scored criterion cannot be judged, use **Not rated** with the reason instead of a fabricated number or zero. Processing shows **Assessing…**. A fully assessed incorrect answer may receive 0/10; unavailable evidence is different. Preserve the completed review's rating when a later reassessment is pending, labelled with its actual assessment version.
- Store the rating, denominator 10, criterion credits/weights, rubric/calculation versions and supporting assessment ID with the immutable review. Preserve every old attempt's rating. Existing legacy attempts without sufficient assessment data show **Not rated**; do not invent historical numbers or trigger paid reassessment merely to fill badges.
- The current attempt's rating and explanation must agree. Validate finite integer range, criterion mapping, weights and evidence before committing it. Show numeric change only for genuinely comparable rubric versions, and explain the actual criterion improvement/regression in feedback rather than making the number the whole review.

**Badge UI:** use a compact solid blue pill beside the selected reviewed attempt's label, directly above the Your answer / Tutor feedback tabs, so it remains visible in either view. Example: **Attempt 2 · Reviewed   8/10**. Keep a previous attempt's own badge when it is selected in history. With a native attempt selector, include the number in each option's plain text and render the actual blue badge beside/below the selected attempt; do not attempt to put styled HTML inside native options.

- Reuse Inter Variable and the repository's existing `--color-primary-fill` blue (`#1b6fc2` in the inspected tokens) with white text in light and dark themes; use the shared light-on-primary token/class behavior, not a globally inverted white. Do not change the badge to red/amber/green based on its number.
- Proposed compact geometry: 24 px high, at least 52 px wide, 8 px horizontal padding, pill radius 999 px, 12 px semibold tabular numerals at 16 px line height, no icon/shadow. Keep an 8 px gap from the attempt label. A display-only badge has no pointer interaction or tab stop.
- Accessible text: **Tutor rating: 7 out of 10 for attempt 1**. Announce completed feedback once through the existing polite status region; do not repeatedly announce a score during rerenders. Wrap the attempt label/selector at narrow widths while keeping `10/10` intact. Use the existing neutral state styling for Assessing/Not rated, not a fake blue numeric badge.
- First draft and unsubmitted revision have no rating yet. Never carry the parent's badge into the new draft as if it were already assessed. The preview uses explicitly simulated example ratings; production must use stored assessment results.

## 8. Tutor feedback lives in this card

Use **Tutor feedback**, not “Tutor answer”: the purpose is to help the learner understand and revise their own response.

Show the selected attempt’s blue rating badge under section 7H. The feedback then starts with three concise elements:

1. **What you explained well** — specific, supported by their answer.
2. **What to revisit** — one important gap or misconception, linked to the relevant evidence.
3. **Try this next** — a focused question, revision or small experiment.

For attempt 2 and later, incorporate the section 7F comparison in these same elements: acknowledge what improved, identify what persists or is new, and choose the next step accordingly. Keep the baseline attempt accessible through existing history and evidence links. Do not create another feedback panel or repeat an obsolete criticism. If comparison is unavailable, state that without blocking the current assessment.

Feedback is not limited to text. Choose the format because it clarifies the identified gap:

| Format | Presentation |
| --- | --- |
| Text, equations and small annotated images | Display directly in Tutor feedback. |
| Annotations on the learner's work | A separate overlay linked to the submitted snapshot; never alter the original answer. |
| `/explain` explanation | A compact preview inside feedback with the relevant observation/question. Open the usable interactive explanation on the main canvas when more room is needed. |
| `/motion` demonstration | A playable preview inside feedback when available; open the full card on the canvas. Use motion only when time/change is essential to the explanation. |
| Code example or notebook | Show the relevant snippet/result in feedback and open the full editable teaching material beside the Explain-back card. |
| PDF/source evidence | Show a source-linked excerpt/thumbnail that opens the exact authorized page or region. |

**Open on canvas** reveals or places the already-created linked teaching card beside the Explain-back card. Repeated opens reuse it; they do not generate duplicates or incur new model calls. Keep the learner's revision accessible alongside it. Each attempt retains its own material references.

Do not automatically generate several rich cards for every assessment. Reuse an existing relevant explanation where possible; otherwise offer the suitable teaching aid through its established generation/allowance flow. The free assessment policy does not make Motion generation free or authorize new spending.

Clicking an evidence citation opens the matching version of **Your answer**, selects the indicated sentence/object/cell/page or seeks to the recording time. Return focus predictably. A missing source must show unavailable, not a misleading substitute.

**Ask Tutor** opens the existing right-side Chat with the exercise, selected attempt and relevant feedback context attached. It fills the composer without sending. Keep conversation in Chat and durable feedback in the card. Do not add another chat composer to the feedback view.

## 9. Revise without losing history

- **Revise answer** creates a new draft initialized from the selected submitted answer. Preserve text, retained voice notes, the owned Sketch and authorized input connections/scopes including Group references; the learner can disconnect resources or remove/replace a recording in the new draft without altering the old submission.
- Submitted attempts and their feedback remain immutable and inspectable. Editing the new draft cannot rewrite the old answer. Persist the selected parent attempt and supply its authorized answer and exact feedback/assessment version to the next review under section 7F; a history selector alone does not implement this.
- Preserve the same Explain-back card ID, position and links throughout revisions.
- Selecting an older attempt shows its answer, feedback and materials together. It does not replace or discard the active draft.
- Retry a failed assessment using the existing attempt/operation recovery rules. A new learner submission and a retry of an existing assessment are different actions.
- Show progress between attempts with specific criterion changes, not a fabricated improvement score. If a rubric changed, make that difference explicit.
- Do not expose a learner's private drafts, recordings, attempts or feedback through a shared canvas or fork by default. Audit existing share serialization and asset authorization; historical sketch behavior is not authorization to publish the new private history. A public exercise can be reusable while each learner's response stays separate.

## 10. Feynman connection

Call this **Feynman-inspired explain-back learning**, not a claim that Richard Feynman designed this product or prescribed this exact interface.

In his 1966 talk *What Is Science?*, Feynman distinguishes knowing a label from understanding a mechanism and suggests asking a learner to rephrase an idea in their own language without relying on the newly learned term. That directly supports asking the learner to explain how/why, revealing gaps, then revising. His 1973 interview also stresses distinguishing what one knows from what one does not know.

Our product applies those ideas as a loop: explain clearly, inspect the reasoning, locate a gap, consult or test something relevant, and explain again. Multimodal evidence, AI feedback, stored attempts and transfer checks are our design choices. The sources do not establish them as an exact historical “Feynman method” or prove this product's learning effectiveness.

Do not make “use simpler words” the whole test. A simple but wrong explanation is still wrong, and a correct advanced explanation should retain the detail its audience needs. Drawings, examples and equations can clarify reasoning just as words can.

Primary sources:

- Richard Feynman, [What Is Science?](https://feynman.com/science/what-is-science/) — 1966 address, reprinted in *The Physics Teacher* in 1969.
- Richard Feynman, [Take the World from Another Point of View](https://calteches.library.caltech.edu/35/2/PointofView.htm) — 1973 interview transcript preserved by Caltech.

## 11. Parallel execution, tasks and release milestones

### A. Six agents, explicit ownership

Use **six concurrent agents total**, including Parallel. Five workers cover the independent UI, persistence, assessment, resource/canvas and media work; Parallel integrates and verifies. More agents would contend for the same files. Reuse existing available agents rather than starting another team. There is no separate permanent planning or QA agent: each worker owns focused tests, and Parallel owns cross-lane integration and release evidence.

| Agent | Owns | First work / subsequent work |
| --- | --- | --- |
| **P — Parallel / integrator** | `LearnPage.jsx`, `learn-grade.js`, `dev-worker.js`, integration tests, browser registration, checklist and release receipts | EB-01 kickoff; wire M1 immediately; integrate ready slices continuously; EB-09/10 throughout. |
| **U — Card and feedback UI** | `LearningBlocks.jsx`, focused new presentation components, scoped `index.css`, necessary `CardPrompt.jsx` changes | EB-03 card preview; EB-04 history presentation and EB-08 feedback/badges; incorporate owner feedback. |
| **D — Durable attempts and privacy** | `learn-coaching-contract.js`, proposed shared contract, `learn-attempt-*`, activity binding, private asset authorization, migrations/schema/purge | EB-01 contract with P; EB-02 persistence; EB-04 lineage/history; private media API needed by M. |
| **A — Tutor assessment** | `learn-assessment.js`, rubric/visual extensions, rating helper and assessment tests | EB-07/08 text and revision first, then consume each ready modality adapter. |
| **R — Canvas and resources** | **All of `AdaptiveCanvas.jsx`**, `learn-connectors.js`, frozen resource resolver and extraction changes | Single-host panel/capture adapter for U first; EB-05 Notebook/Group/files; supply frozen evidence to A. |
| **M — Media** | Recorder/controller/player, compatible `SpeakAnswer.jsx` refactor, media derivatives and tests | EB-06 retained voice first; static capture integration with R; silent/narrated Sketch recording afterward. |

Shared-file changes go through the owner. In particular U and M provide interfaces/patch requests to R instead of concurrently editing `AdaptiveCanvas.jsx`; D/A/M give route-wiring patches to P. Allocate one migration sequence through D/P. Keep each worker in an isolated worktree/branch based on the same integration contract commit. Do not overwrite another worker's work or create six independent schemas.

P merges small tested commits into one integration branch. Workers continue independent work while CI or owner feedback is pending. If an interface must change, P records the change and informs its consumers before they build against it. A blocked worker should take an independent subtask or review a finished lane, not duplicate the blocked owner's implementation.

### B. Milestones: make it usable early

| Milestone | Deliverable and owner try-it path | Dependencies / push point |
| --- | --- | --- |
| **M0 — Contract and first card preview** | Shared contract fixtures committed. In-app card/panel preview: multiline answer, question visible, green Input position, Open sketch, pin/resize/close/reopen, content preserved. Any fixture feedback is explicitly labelled simulated. | EB-01 plus EB-03/R capture seam. Push the contract first and preview as soon as usable. Backend work continues concurrently. |
| **M1 — Real saved text/revision loop** | Submit typed attempt 1 → stored review and blue rating → reload → revise → attempt 2 review uses the pinned first answer/review → switch history without altering either. | EB-02, core EB-04/07/08 and P wiring. First complete vertical slice. Do not wait for video or all resource types. Distinguish injected evaluator tests from an authorized provider-backed preview. |
| **M2 — Retained voice and static Sketch** | With text empty and Sketch closed, record → replay/remove → submit → reload/play original → see review. Typed text stays unchanged. Also submit Sketch-only and text + static Sketch through the same durable path. | M1 plus EB-06 voice, R's capture seam and A's adapters. Ship voice and static Sketch as separate sub-slices if one finishes first. |
| **M3 — Notebook, Group and attachments** | Connect either Notebook/Group port, choose scope, submit, then edit the live source: old review still opens the submitted version. Direct + Group duplicate is assessed once. Disconnect/undo remains consistent. | M1 plus EB-05 and resource assessment. Can ship before M2 if ready; neither waits on the other. |
| **M4 — Silent and narrated Sketch recording** | Record without microphone, then with narration; replay and submit; Tutor uses steps/timestamps rather than only the final image. Test an explicit self-correction and “this arrow” reference. | M2 recording foundation, EB-06 recording and EB-07 temporal adapter. Does not need to wait for unrelated resource polish. |
| **M5 — Complete mixed answer and release** | Text + voice + Sketch + recording + resources, attempt 1/2 comparison, privacy and recovery checks pass. Owner receives exact served SHA, limitations and release receipt. | All required slices, EB-09/10. Finish applicable release gates; production follows existing owner authority. |

Each milestone is an integration/review boundary, not a demand to stop all workers for approval. Let the owner try each usable preview while other lanes continue. Fix feedback in small follow-up commits. Do not call M0 a completed assessment feature or call M5 complete with required modalities hidden.

### C. Shared contract: freeze once, extend compatibly

EB-01 defines the exact field names/types in the shared contract before consumers diverge. The following is the required logical contract; map it into existing envelopes instead of inventing a second API:

| Contract | Required contents / consumer |
| --- | --- |
| Combined answer | Version/discriminator; typed text independently optional; ready retained voice references; owned static Sketch snapshot; optional recording; scoped resource manifest; assistance provenance. D validates; U/M/R produce; A consumes. |
| Evidence reference | Stable evidence ID, owner-authorized immutable asset/source revision, hash, media kind, selected scope, derivative ID/hash/converter version, available page/cell/time locators and processing/coverage state. No raw audio/video or huge Notebook payload inside attempt JSON. |
| Revision baseline | Parent attempt ID plus exact prior assessment ID/version, same learner/activity validation, frozen comparison context. The server loads prior evidence and review; the client cannot supply authoritative grades. |
| Review | Attempt/operation identity, criterion judgments, coverage, validated citations, three feedback sections, revision comparison, rating or explicit unrated reason, rubric/calculation versions and provider provenance. |
| UI boundaries | Selected attempt ID is distinct from active draft ID. Recorder lifecycle lives above panel mounting. R exposes one capture target keyed by question/draft; missing capture is an explicit error, never a silent text-only fallback. |

Current constraints to resolve in EB-01/02: content is capped at **16 KiB**, text at **4,000 UTF-16 units**, and references at **20**. Use bounded immutable references and explicit limit errors. Existing attempt validation only accepts activity source references: separate authoritative task sources from authorized learner evidence rather than disabling validation. Existing claim lifetime is **60 seconds** and evaluator timeout **45 seconds**; media preparation needs an explicit durable preparation/operation lifecycle before evaluator dispatch, with no duplicate calls after a timeout.

### D. Tasks and subtasks

Each task consumes the committed shared contract. Write the meaningful regression/integration fixture before its behavior change, run the focused check, implement the smallest passing slice, then commit and push it. Cosmetic edits do not need artificial tests. File ownership is in section 2/A; proposed new filenames are explicitly marked there.

#### EB-01 — Pin baseline and publish interfaces (P + D; M0)

- [ ] **01.1** Fetch current main; record full base SHA, relevant newer changes, working branches and current instructions in the checklist.
- [ ] **01.2** Commit the combined answer, evidence, parent/review and rating contracts. Choose one combined response kind compatibly with existing validation; include legacy, text-only, empty-text voice, Sketch and resource fixtures.
- [ ] **01.3** Agree the UI-to-capture, private media upload/read and resolver-to-evaluator boundaries with U/R/M/A. Record readiness, errors and operation states, not just happy-path fields.
- [ ] **01.4** Resolve existing activity binding, limits, migration need and media preparation lifecycle. Record any genuinely unresolved provider/retention/release prerequisite with an owner and concrete next action; independent work continues.
- [ ] **01.5** Push the contract/fixtures commit. Give all workers its SHA and exclusive file ownership. P starts integration immediately.

**Check:** shared contract tests accept all supported empty-text cases and reject malformed/cross-scope references without breaking legacy fixtures. Output is one agreed interface commit, not another broad design document.

#### EB-02 — Durable submissions, private assets and drafts (D; M1/M2)

- [ ] **02.1** Bind each legacy Explain-back card to a stable server-owned activity and criterion version before its first new submission.
- [ ] **02.2** Extend `acceptAttempt` validation and save-before-dispatch for the combined envelope; preserve submission-key replay/conflict, content hashes, exact attempt identity and unknown-no-auto-retry.
- [ ] **02.3** Persist drafts with conflict protection and immutable submitted manifests. Add owner-scoped history/list access and authorized private media reads/uploads using existing storage primitives. Read/history/playback must not invoke a model.
- [ ] **02.4** Prevent private draft/media/review leakage via shared board serialization, generic file access or forks. Separate learner evidence from activity references; do not broadly relax authorization.
- [ ] **02.5** If needed, add one coordinated additive migration, schema mirror and purge/retention handling. Obtain only the migration authority actually required by current instructions; do not delay code/fixtures awaiting a deployment decision.
- [ ] **02.6** Push text persistence first, private media support next. Hand P route integration patches and M the private asset contract.

**Check:** route/store fixtures cover duplicate submission, conflict, reload, lost response, unauthorized parent/asset, shared viewer/fork denial, oversize content and preserved saved work after evaluator failure. Never use real learner recordings in committed fixtures.

#### EB-03 — Card, single Sketch panel and prompt disclosure (U + R; M0)

- [ ] **03.1** Build section 3's multiline card and conditional views using existing tokens/components. Preserve ordinary Challenge and generation Prompt disclosure; implement UI-29 for its supported card types without exposing system instructions.
- [ ] **03.2** R supplies the single live Sketch host/capture ref; U composes the right panel with owner row, pin, close and independent resize. Keep the question visible and preserve marks on close/reopen.
- [ ] **03.3** Add green upper-left Input, content dot and specified empty/loading/error/focus states. R owns endpoint geometry; U owns presentation.
- [ ] **03.4** Verify 320/390/736/800/1024 px, light/dark, keyboard and touch; narrow collapse must not destroy draft/recorder/editor state. Update intentional replacements in existing Sketch browser assertions.
- [ ] **03.5** Push the usable in-app preview immediately. Hide unsupported feature controls until their real slice lands; label any fixture review clearly.

**Check:** one host only; capture matches question/draft; panel move/close/resize does not lose data or retarget another drawing; Notebook kernel/editor continuity and ordinary Challenge survive.

#### EB-04 — Immutable history and revision wiring (D + U; P integrates; M1)

- [ ] **04.1** Persist and validate selected parent and exact baseline review; revising an older attempt must use that parent, not the newest timestamp.
- [ ] **04.2** Revise into a separate draft carrying selected authorized evidence, with no inherited numeric badge. History selection preserves that draft.
- [ ] **04.3** P replaces Explain-back's legacy grading transport with durable submission/operation reads. Avoid a duplicate shadow assessment or Progress update.
- [ ] **04.4** Attach progress/results to their attempt IDs; distinguish retrying an assessment from submitting a new answer. Preserve old evidence/reviews after resource removal or new edits.
- [ ] **04.5** Push the working text attempt 1 → reload → attempt 2 loop with history and captured evaluator-request evidence.

**Check:** stale responses, double submission, switching cards/history mid-flight, changed source after submission, wrong learner/question parent, missing previous review and reload all retain the correct immutable records.

#### EB-05 — Resource Input, Notebook and Group (R; D supports authorization; M3)

- [ ] **05.1** Extend existing endpoint functions for semantic Input and Group top/bottom ports; retain Notebook's existing ports and four-side ordinary connectors. Anchor Group ports to the rendered frame including footer.
- [ ] **05.2** Make picker/drag/click-click produce the same atomic relationship/pill operation. Deduplicate by source/scope across ports and Group membership. Implement disconnect/undo/reload consistently.
- [ ] **05.3** Freeze selected file pages, Notebook cells/output freshness and Group membership/revisions. Resolve authorized bytes/excerpts with existing extraction adapters and pin derivative versions, not the latest derivative.
- [ ] **05.4** Handle moved/deleted members, empty or collapsed Group frames, unsupported members, revoked access and unavailable source revisions explicitly. Preserve live Notebook identity, running kernel and unsaved edits; never auto-run it.
- [ ] **05.5** Push connectors and frozen resolver as separate coherent slices; give A real evidence fixtures and P the owner try-it path.

**Check:** Notebook/Group top and bottom → Input; direct + Group dedup; permission loss; source edits after submission; unavailable member coverage; unchanged ordinary connector and notebook behavior.

#### EB-06 — Retained voice, then Sketch recording (M; D/R/P integrate; M2/M4)

- [ ] **06.1** Replace Explain-back dictation with retained recording/player state. Keep other `SpeakAnswer` consumers compatible. Test typed text stays byte-for-byte unchanged through record, stop, transcription, remove and re-record.
- [ ] **06.2** Implement permission/error, pause/resume/stop, playback/removal and microphone cleanup; persist private audio with upload recovery. Empty-text, Sketch-closed submission must work.
- [ ] **06.3** Store a separate immutable transcript derivative and honest coverage; coordinate assessment-funded preprocessing with A/P. Do not make all unrelated transcription free or start paid work on panel open/playback.
- [ ] **06.4** Push complete voice-only first; integrate static Sketch-only/combined capture through R's explicit host contract.
- [ ] **06.5** Add silent Sketch recording, then optional synchronized narration with one-microphone ownership. Persist timeline/frames/transcript and bounded preparation status. Do not mistake a final screenshot for a recording assessment.
- [ ] **06.6** Push recording separately when replay, interrupted upload/reload and temporal evidence work. Resolve codec support and provisional limits before enabling the route.

**Check:** no microphone request in silent mode; permission denial and cancel; panel close/navigation; empty text; failed upload/transcription preserves work; narration is not counted twice; two recordings with identical final images but different reasoning yield distinguishable evidence.

#### EB-07 — Coordinated assessment and revision comparison (A; M1–M4)

- [ ] **07.1** Extend existing admitted durable evaluation for text first. Resolve frozen current evidence and coverage server-side; capture actual evaluator inputs in fixtures rather than asserting only IDs exist.
- [ ] **07.2** Load parent answer and pinned previous review separately, assess current criteria first, then compare resolved/persistent/new gaps. Test intentionally wrong prior feedback and changed/missing baselines.
- [ ] **07.3** Consume M/R adapters incrementally: static image, voice transcript/audio, files/Notebook/Group, then temporal recording evidence. Preserve locators, dedup and prompt-injection boundaries.
- [ ] **07.4** Validate citations against submitted evidence; return partial/unassessed status for unreadable evidence. Prevent unsupported modalities from silently disappearing or receiving fabricated mastery.
- [ ] **07.5** Preserve assessment funding, platform admission, operation recovery and deduplicated Progress; version evaluator/preprocessing provenance. Keep activation specific to Explain-back rather than globally enabling experimental routes.
- [ ] **07.6** Push a passing assessment slice for each ready modality; do not hold text/revision review for video.

**Check:** every section 7B combination plus omitted-input variants; contradictions versus explicit self-correction; reference-only evidence; failed extraction; prior review anchoring; no duplicated calls after timeout/reload. Unknown evidence is not a misconception.

#### EB-08 — Blue rating, feedback and teaching links (A + U; M1 onward)

- [ ] **08.1** Implement section 7H's deterministic server rating and store criterion credits, weights, rubric/calculation version and review ID. Required reasoning limits effective credit: met=1, partial=.5, not met=0; unknown required evidence makes the attempt unrated. Define scored criteria explicitly; optional unscored criteria do not inflate the denominator.
- [ ] **08.2** Render the selected attempt's blue `N/10` badge, three feedback sections and revision comparison. Pending/unrated states and drafts never show an invented or inherited number.
- [ ] **08.3** Preserve history scores, native selector text labels and accessible rating announcements. Validate 0/10, 10/10, partial scores, required-reasoning cap, invalid weights and non-comparable rubric versions.
- [ ] **08.4** Connect evidence citations to the submitted version/locator. Reuse existing authorized rich teaching aids and Open on canvas without regeneration/duplicates; Ask Tutor fills the existing composer without sending.
- [ ] **08.5** Push core feedback/badge with M1. Add richer links as their evidence adapters land; do not auto-generate expensive teaching media or build another chat UI.

**Check:** attempt 2 may rise, stay or fall; prior score never averages into current score; fully assessed wrong differs from unreadable; history restores each stored rating; failed citation opens unavailable rather than a newer source.

#### EB-09 — Integration and targeted regression (P, each worker supplies fixtures; every milestone)

- [ ] **09.1** Add the real route/store text → review → revision integration fixture with injected evaluators, proving attempt 2 contains the exact first answer/review while attempt 1 stays unchanged.
- [ ] **09.2** Extend/register browser checks for the new card, retained voice, history and resources. Inspect CI selection and executed counts; a registered but skipped test is not evidence.
- [ ] **09.3** Run affected package checks and the applicable release gate. Preserve ordinary Challenge, connector geometry, notebook session, prompt disclosure and shared-view regressions.
- [ ] **09.4** At M5 run the mixed-modality, privacy, timing/recovery and rating matrix; distinguish stubbed integration from authorized provider evaluation. Record actual coverage and failures, not blanket “all tested.”
- [ ] **09.5** Have an available finished worker review the integrated boundary for correctness; P resolves findings and pushes fixes. No separate polish pass is required.

#### EB-10 — Push, review receipt, deploy and closeout (P; continuous)

- [ ] **10.1** Push every coherent tested worker slice and integrated milestone. Open/update a reviewable PR with concrete behavior, checks and remaining gaps; do not wait for the whole feature.
- [ ] **10.2** Publish a working isolated dev preview through the existing procedure when its gates pass. Give the owner the URL, exact served SHA and 3–5 steps to try; continue unrelated ready work while feedback arrives.
- [ ] **10.3** Record owner feedback as blocking correctness/accessibility versus small follow-up polish, then integrate corrections in small commits. Never defer privacy, lost work, missing required inputs or incorrect assessment as cosmetic.
- [ ] **10.4** Promote only under current release/migration authority with exact-SHA evidence. Production GO includes activation and real-flow verification; do not request the same routine permission twice.
- [ ] **10.5** Refresh served-build and rollback evidence for the actual promoted commit. Prefer additive/compatible recovery that preserves saved attempts; do not destructively roll back stored history. Close the checklist only when the relevant deployed/enabled/verified states are evidenced.

### E. Push policy and avoiding overpolish

**Push is not deployment.** Feature-branch pushes start `verify` and `fast-e2e`; they do not create a live preview by themselves. Use the documented isolated dev clone procedure, never bare `wrangler deploy`. Shared `dev` pushes deploy through `deploy-dev.yml`; `fast-e2e` does not start on `dev`, so that exact commit needs its preceding integration-branch result. Every deployment needs the newest completed successful `verify` and `fast-e2e` results for the **exact SHA** plus applicable release evidence.

UI-only full-gate reuse is allowed only when current eligibility/`notReusableBetween` checks permit it. Mixed backend, schema, media-contract and privacy changes require the applicable full gate. Resolve the current authorized gate launcher; do not invent a workflow. Do not change CI workflow files merely to accelerate this feature or bypass existing owner authority. Main push is production and requires current explicit production authorization; a request to push working branches is not automatically production GO.

Stop polishing when the slice is readable, usable, accessible, responsive and passes its correctness checks. Minor spacing, shadows, animation refinement and additional decorative examples go into the follow-up list. No new design system, generic media platform, second assessment store or broad refactor. A blocked provider/authorization decision should not stop fixture-backed implementation or another ready milestone. Report the specific blocker and next action instead of starting another investigation loop.

### F. Exact verification entry points

Commands below were verified from current scripts/paths; this planning review did **not** execute the new feature tests. Run from the stated directory with repository dependencies and its supported Node version (store fixtures use `node:sqlite`). New test files must be added to the relevant invocation after creation.

From `packages/web`, focused existing coverage:

```bash
node --test src/explain-sketch.test.mjs src/learn-challenge.test.mjs src/learn-coaching-contract.test.mjs src/learn-connectors.test.mjs src/media-storage.test.mjs src/file-source-client.test.mjs
npm run build
```

From `packages/control-plane`, persistence/assessment coverage:

```bash
npm test -- test/learn-attempt-store.test.js test/learn-assessment.test.js test/learn-rubric-assessment.test.js test/learn-visual-assessment.test.js test/learn-assessment-charging.test.js
```

From `packages/control-plane`, media/resource/privacy coverage:

```bash
npm test -- test/learn-files.test.js test/learn-media.test.js test/file-access.test.js test/file-access-acceptance.test.js test/file-context.test.js test/pdf-excerpts.test.js
```

For schema changes, from repository root:

```bash
node --test scripts/schema-check.test.mjs
```

Broader checks are web `npm run test:unit`, control-plane `npm test`, and root `make test-unit`. Web `npm test` is **Playwright**, not the unit suite. Follow current repository policy for browser execution through approved CI/designated runners; these commands do not authorize ad hoc browser automation or paid provider calls. Use current build flags from `CLAUDE.md`.

Browser files to extend/preserve under `packages/web/e2e/`: `explain-back-sketch-check.mjs`, `canvas-editing-check.mjs`, `card-prompt-check.mjs`, `pinned-study-check.mjs`, `pinned-study-attach-check.mjs`, `focus-chrome-check.mjs`, `study-resize-persist-check.mjs`, `notebook-run-all-check.mjs` and `pinned-study-kernel-check.mjs`. The existing Sketch check stubs legacy assessment and expects inline UI: update intentionally replaced assertions and retain ordinary Challenge coverage. `voice-check.mjs` and several Tutor/file checks are **windows-only**; green Linux CI does not prove retained voice. Register the new check with the actual runner and report selection, executed count and `notCovered`. Kernel continuity coverage is not automatically included by the full release gate.

### G. What to send back so the owner and reviewing assistant can check

Maintain one repo checklist at the proposed `docs/features/explain-back-checklist.md`, linked to the full plan. Use task/subtask IDs and separate states: **planned → implementing → pushed → tested → preview deployed → owner feedback addressed → production verified**, with blocked states naming the blocker. Never substitute “done” for these distinctions.

At each milestone paste this short receipt into the PR/checklist:

```text
Milestone / completed subtasks:
Base SHA / full pushed SHA / PR link:
Changed files and owners:
Preview URL / exact served SHA / environment:
Try it: 3–5 steps and expected visible behavior:
Checks: exact commands + results; CI links for this SHA; selected/executed browser checks:
Assessment evidence: fixture/stub or real provider; covered input combinations; attempt 1→2 baseline proof:
State: implemented / tested / deployed / enabled / production verified:
Flags, migration status and applicable spend ledger:
Known limitations and specific blockers:
Owner feedback addressed / small deferred polish:
Next ready slice, owner and expected next checkpoint:
```

Keep screenshots, short replay evidence and sanitized evaluator-request fixtures accessible through the PR/CI artifacts rather than only an agent's local machine. Do not commit private learner media, secrets or personal data. The reviewer should be able to confirm the exact build, reproduce the learner flow, inspect the real evidence packet and locate the relevant test without asking for another investigation. No claim of provider quality from mocked tests, deployment from compilation, or production verification from a health check.

## 12. Required validation

Register browser checks with a runner CI actually executes for the affected paths. Follow the repository's current browser/release policy; the earlier standing lane rule was to use CI browser coverage and user acceptance rather than lane-run production browser checks. Do not treat an unregistered local script as CI coverage. Backend/schema/config changes use the repository's applicable full gate.

- [ ] Legacy text-only and Sketch-only answers still work; the exercise question and hint remain visible.
- [ ] Open sketch opens exactly one panel and keeps the question/answer card visible to its left at 736, 800, 1024 and wide desktop widths. No overlap, clipped controls or accidental full-screen mode. On 320/390 px phones the two separate surfaces stack and remain reachable.
- [ ] Open/Close/reopen preserves the same owner, draft and Sketch content. The dot appears only for content, disappears after clearing all Sketch content, and has an accessible content label. No Sketch included badge or permanent question-to-Sketch wire remains.
- [ ] Pin preserves ownership during outside interaction; explicit Close works. Resizing the panel does not resize/move the question, pan the board, erase content or restart a notebook. Moving the question does not move the panel. Explicit expand/restore retains state and is distinct from Open sketch.
- [ ] The actual Input connector is green and sits at the upper-left header edge beside Explain back. It is not a green label/status dot in another location; its visible/hit/route anchors agree at different zoom levels.
- [ ] Notebook reuses one top/bottom port pair. Both source ports can connect to Input by drag and click-click; keyboard/touch picker produces the same relationship. Comment pins and notebook editors do not hide the only reachable connection route or intercept it incorrectly.
- [ ] Group has one top/bottom port pair on its boundary, bound to its stable Group ID. Both ports connect to Input and remain correct after Group move, member resize/move, membership change, zoom and reload. Connecting does not move/ungroup/rename its members.
- [ ] One semantic resource connection creates one edge and one pill. Repeating through another physical port does not duplicate evidence. Existing ordinary canvas connectors keep their old behavior.
- [ ] Group pill shows name/member count and inspectable scope. Submission freezes the exact authorized membership and revisions; later changes do not alter old answers. Direct-plus-Group duplicate references are evaluated once with provenance retained.
- [ ] Empty/deleted/ungrouped/inaccessible sources, unsupported members, self-reference and cycles are rejected or reported precisely. No silent omission or substitution; server authorization covers actual members and assets.
- [ ] Pill ×, selected-edge Delete and edge menu share disconnect/undo logic and preserve sources. Reconnect/undo restores identity without duplicate edges, uploads or model calls. Deleting a resource edge never deletes the Sketch panel.
- [ ] Delete during typing/notebook editing edits content normally; edge selection, drawing and drag targets do not conflict. Escape releases the intended selection/target.
- [ ] Prompt disclosure reveals generation metadata only, with pointer/keyboard/touch access. It does not hide `block.prompt`, the actual exercise question.
- [ ] First draft has no empty feedback or attempt controls. Revise makes a new draft; history retains unsent changes and exact old feedback.
- [ ] **Voice-only:** leave text empty, never open Sketch, record a note, stop, replay, submit and obtain feedback attached to that audio attempt. The text field stays empty even after transcription completes. No filler text, drawing or transcript-editor step is required.
- [ ] **No dictation into the answer field:** with an existing typed draft, record/stop, complete transcription, replay, remove and re-record; the draft remains byte-for-byte unchanged. Repeat with an empty field and after reload. The attempt carries the retained audio and any separate transcript, not a fabricated typed answer. Existing saved text answers remain intact.
- [ ] **Voice removal:** removing the only note returns an otherwise empty answer to non-submittable. Re-record preserves/replaces evidence deliberately and never mutates a submitted attempt.
- [ ] Recording/paused/uploading states disable premature submit; Stop releases microphone tracks. Denial, silence/no captured audio, unsupported format, cancellation, limits and failed uploads preserve recoverable work and display accurate states.
- [ ] Transcript failure preserves the audio and recovery path. Transcript/citations are separately versioned; unclear speech is not automatically graded as a misconception.
- [ ] Voice recorder on the answer card works with Sketch closed. Sketch recording controls remain in the single Sketch panel; silent mode does not request a microphone. Concurrent captures cannot compete for the same microphone.
- [ ] Sketch capture is limited to its surface; Pause/Resume preserves audio/video timing. Stop/replay/removal and closing during capture retain recoverable evidence without capturing the full board.
- [ ] One combined submission freezes the actual text, voice, Sketch, source revisions and Group membership; no pending-upload omission or later-source substitution.
- [ ] Notebook cell IDs, unsaved edits, output freshness and sessions survive connections, resize, tabs and history. Connecting a Notebook or Group never runs code by itself.
- [ ] Panel controls, typing, resizing, playback, history and opening existing teaching cards make no model calls. Submission/transcription routes obey authorized operation and spend rules.
- [ ] Double-click/reload/retry/concurrent-device submission do not duplicate attempts, provider calls or cost. Conflicting payloads remain visible; late feedback targets only its originating attempt.
- [ ] Evidence citations open the exact text/object/cell/page/time and submitted revision. Missing evidence is labelled unavailable; assessment failure cannot fabricate observations or mastery.
- [ ] Private drafts, voice assets, recordings, feedback and historical Group members remain protected from strangers, other learners, shared views and forks under the intended policy.
- [ ] Assessment stays free to the learner with platform admission/cost logging preserved. Unknown-cost/time-out recovery does not blindly repeat a paid call.
- [ ] Quality fixtures include correct/partial/mistaken answers, voice alone, complementary and contradictory modalities, self-correction, unclear speech, unreadable diagrams, stale notebook output and imported references with no learner explanation.
- [ ] **Evidence combinations:** exercise every row of section 7B, including empty typed text with a voice note, a static Sketch, a silent recording, a narrated recording, and a submitted solution attachment/notebook. Add an all-formats case and one-omitted-input variants; all selected ready evidence reaches the assessment or appears explicitly unavailable.
- [ ] **Actual ingestion:** stub/capture the evaluator request and verify authorized content bytes/excerpts/frames/transcripts, source revision and locators, not merely asset IDs or filenames. No accidental live source substitution or audio omission. Direct-plus-Group and embedded narration are deduplicated.
- [ ] **Recording evidence:** distinguish two recordings with the same final screenshot but different reasoning steps. Include an explicit later self-correction and a voice-to-visual reference such as "this arrow". Silent mode has no microphone dependency; sampled coverage is truthful.
- [ ] **Unreadable/failed input:** failed transcription, null Sketch capture, unreadable diagram, unavailable attachment and missing recording interval preserve work and produce partial/unassessed coverage, never a fabricated complete judgment or automatic misconception.
- [ ] **Attempt 1 → 2:** a revision request contains the same question/criterion versions, current evidence, authorized parent answer and exact previous feedback/assessment reference. A corrected misconception is acknowledged; persistent and new gaps are grounded in current evidence. Resolved feedback is not repeated.
- [ ] **History integrity:** old answers/feedback remain unchanged after revision, resource edits, removal, reload and late responses. Revising an older attempt uses that selected parent; an assessment retry does not create a new learner attempt. Cross-learner/cross-question parent references are rejected server-side.
- [ ] **Comparison honesty:** test a missing previous review, unavailable old evidence, changed rubric, no improvement, regression and intentionally wrong prior feedback. Current work is still assessed where possible; no invented history, forced agreement with prior feedback, unfair carryover penalty or fabricated improvement score.
- [ ] **Evidence validation:** model citations point to actual submitted sentence/object/cell/page/time ranges. Invalid IDs or times cannot render as credible citations. References alone do not establish mastery, and unchanged copied material does not count as improvement.
- [ ] **Per-attempt rating:** validate 0/10, partial values and 10/10 against the fixed rubric/formula. Unknown criteria produce Not rated, not zero. No automatic increase on attempt 2; same evidence/criteria gives the same number. Changed rubric/calculation versions are labelled non-comparable.
- [ ] **Blue badge:** each selected reviewed attempt displays its own stored `N/10` in the solid blue pill, including on Your answer and Tutor feedback. History selection restores the correct old rating. Drafts do not inherit one; pending/failed/unrated states never show invented numbers. Native option labels include scores as text. Check 320/390/736 px, light/dark contrast, no clipping of `10/10`, and the accessible rating label.
- [ ] Existing Progress events remain deduplicated and retain assistance provenance. Heavy viewers/history respect current performance budgets and do not mount every past notebook/media surface.

These are acceptance requirements, not completed checkboxes. The HTML is a UI reference; its simulated controls and local preview checks do not satisfy production recording, permission, storage, assessment or release acceptance.


## 13. Decisions and spending boundaries

The UI/workflow above is the handoff direction. Resolve engineering choices from current source where possible rather than asking the user to choose internal implementation details.

Still provisional: the two-minute recording limit, exact media size/retention defaults, and the model/service combination for newly supported audio/video evidence. Preserve the existing free-to-learner assessment rule. Determine whether new storage/schema work is truly needed before proposing it, and apply the user's current migration/release authority rather than outdated notes.

No new paid-test budget is granted by this document. Check the current applicable Learn/Explain-back authorization and ledger; do not borrow from unrelated feature budgets or assume older amounts remain available. Continue local/stubbed implementation and CI within existing authority while preparing a concrete evaluation corpus and cost estimate. New paid calls, new vendors or expanded infrastructure need applicable explicit authorization. Maintain one ledger for any subsequently approved Explain-back testing.

The first implementation receipt should identify the existing code reused, actual gaps, shared-file owners, milestones and any specific unresolved prerequisite. Keep all scope and acceptance gaps visible until evidenced, rather than treating branch completion as a shipped feature.
