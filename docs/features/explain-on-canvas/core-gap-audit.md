# Core Tutor MVP: gap audit against the updated handoff

**Docs revision:** `rabbit-hole/chatgpt/tutor` `6b3fff7e1585f6814271f0290d9d91f3bf8e5445`. **Tree audited:** `sprint2/core` at `31915184f` (the sprint-1 core flow plus the synced docs). **Method:** every bullet of CORE.02 to CORE.09 and UI.01 to UI.08 in `tutor-implementation-checklist.md` (101 unchecked, 27 already checked by the reviewer) was read against the tree and the section 8.0 tests. Checklist boxes are NOT ticked here; that is the review loop's job (section 1.7).

**What "met" means:** the exact requirement is covered by source and a passing local Node test (test double, no browser, no paid call). Nothing here was checked in a browser. Owner manual acceptance on production is still pending.

## 1. Did the 6b3fff7e revision change the core requirements?

Compared with `e062beedc` (the revision sprint 1 built from), over the CORE/UI text (404 lines to 411):

- **No requirement was added, removed or reworded in substance.** The revision split compound bullets into a checked "preserve what exists" half (with evidence at audited main `e447525`) and an open "new behavior" half. That is why unchecked bullets are now 101 rather than a smaller number of larger ones.
- **Newly checked foundations (27):** source/reader/version checks and the small step locator (CORE.02), durable operation identity (CORE.04), whole-step hold and settlement (CORE.04), `grounding:false` record (CORE.01), save-before-ack (CORE.07), Explanation primitive shape (CORE.09), private projections kept out of the board (UI.04), Tab/Edit/navigation guards (UI.05), collision checks (UI.06), source relationship store and normal source actions (UI.07), card feedback and Progress (UI.08).
- **CORE.04 gained one explicit bullet:** "Prevent handler replay from creating a new author operation after a terminal settled ordinary attempt." Sprint 1 covers it (see CORE.04 below).
- **CORE.07 split out** final-geometry save/reconciliation as its own open bullet.
- **CORE.08 now records the 2B decision** (keep the clone deploy; the no-clone mode is struck through). It is a docs task.
- **UI.03 reference text** says the 03 HTML covers the roadmap message only; later card lifecycle UI follows the current Tutor Chat step on main, and R12 command review reuses the same lifecycle. R12 is on hold.
- **Section 4.5 (CHAT.01/CHAT.02), roadmap 4.7 and 9.4 are new.** They are outside the core flow and are other lanes' work.

## 2. Summary

| Group | Open bullets | Met | Partial | Missing |
| --- | ---: | ---: | ---: | ---: |
| CORE.02 to CORE.08 | 22 | 21 | 1 | 0 |
| CORE.09 | 19 | 13 | 6 | 0 |
| UI.01 to UI.08 | 60 | 55 | 5 | 0 |
| **Total** | **101** | **89** | **12** | **0** |

The 12 partial items are all "needs owner manual acceptance" or a documented deferral, not a defect found by this audit. No bullet is wholly missing. No correctness, accounting, lifecycle or data-loss defect was found in the core flow; nothing was changed in this lane's code for that reason (section 5).

## 3. Per task

Evidence names are test titles in `packages/control-plane/test/roadmap-workflow.test.js` (BE.xx), or files. Line numbers are in this tree.

| Task | Bullets | Status | Evidence |
| --- | ---: | --- | --- |
| CORE.02 whole bounded document for selected scope | 2 | Met | BE.02 (planner request carries the whole document, a teaching range, the original instruction); `roadmap-planning.js:79`; `roadmap-source*.test.js` |
| CORE.03 writer bound to its own accepted step | 5 | Met | BE.05, BE.06: own step's plan version/position, accepted instruction history, frozen Depth; `roadmap-run.js:78` |
| CORE.04 one author call across failures and replay | 5 | Met | BE.07, BE.12; `roadmap-policy.js:24` (`generationPerCard`), `roadmap-store.js:350` (`allowAutomaticRetry`); stale three-call test updated; replay after a settled attempt creates no operation |
| CORE.05 quote the actual full author request | 4 | Met | BE.05 to BE.07; `roadmap-generate.js:23` (`requestFingerprint`), `:52` (`quoteRoadmapCard`); `test/roadmap-loop-fixture.js` provider honors the requested model |
| CORE.06 safety/publication boundary | 2 | Met | BE.07, BE.12, `roadmap-safety.test.js`, `roadmap-withheld.test.js`. Whole-document safety screening is explicitly a labelled follow-up in OWNER-INBOX (the doc says so), not a gap |
| CORE.07 integrated first and second card | 3 | 2 met, 1 partial | BE.06 (table and prose), BE.08, BE.10 (auto offer is metadata only); check-map rows added. **Partial:** final-geometry save and same-slot "Saving" status are proved in Node (BE.08, `LearnPage.jsx:250` `settled`), not in a browser |
| CORE.08 contradictory HOW text | 1 | Met (docs task) | Replaced by the synced 6b3fff7e revision; no code item |
| CORE.09 Explanation card | 19 | 13 met, 6 partial | Caps 600/1,000/1,500: `chat-depth.js:33`, `learn-artifact.js:17`, `learn-primitives.js:297` (`mermaidProblem`); BE.06a; renderer `LearningBlocks.jsx:2025`, `SourceRefChip.jsx:76`; web `explanation-card.test.mjs`, `explanation-presentation.test.mjs`. **Partial (6):** the last six bullets require comparison with deployed main and verification "in the real implementation" before UI.02 to UI.08 are checked off: owner manual acceptance |
| UI.01 drop, acknowledge, choose conversation | 9 | 7 met, 2 partial | BE.01, BE.09, `roadmap-transcript.test.mjs`, `RoadmapTranscript.jsx`. **Partial:** (a) a second quick drop replaces the first invitation's live buttons (older invitations are not queued; no source is merged or started silently); (b) the Start-new-chat / Stay-here choice is stored per browser, so a second device could show the chooser again. Both are in OWNER-INBOX with a next action; (b) needs a migration |
| UI.02 accepted-only ToC | 7 | Met | BE.04; `learn-outline-model.js:38` (`withRoadmap`); `learn-outline-model.test.mjs`; the Tutor panel, conversation and composer are removed. The old ToC conversation remains reachable: `ChatHistory.jsx` has no filter that hides its thread, and its draft key `<canvas>.toc` is untouched (source check only, no browser) |
| UI.03 parameters and roadmap edits in Chat | 11 | 10 met, 1 partial | `RoadmapPlan.jsx:12`, `DepthMenu.jsx:67` (`DepthSlider`), `roadmap-transcript.js:70` (`entriesOf`), BE.03; practice shown disabled with its reason. **Partial:** Scope is displayed but not changeable after the first draft (changing scope needs a backend `revise` field; documented deferral) |
| UI.04 one proposal and its lifecycle in Chat and canvas | 11 | Met | BE.05, BE.08, BE.09; `SlotCard.jsx:16`; `roadmap-canvas.js:90` (`createSlotStore`, private slot geometry via `/slots`); `roadmap-view.js:95,108` (`revisionPending`, `planDraft`). Edit card uses the canvas editor, which the bullet allows ("or the existing explicit canvas Quick Edit entry") |
| UI.05 keyboard, Chat and canvas are one action | 3 | Met | `roadmap-workflow-web.test.mjs` (BE.05 controller-level acceptance: one request from Chat, canvas and Tab); navigation controls use the navigation-only seams |
| UI.06 placement beside the passage, saved geometry | 9 | 8 met, 1 partial | `roadmap-placement.js` (`proposalAnchor` passage slab, `deliveredSpot` rings outward, never moves existing material), `canvas-slots.js`, BE.13, `canvas-slots.test.mjs`. **Partial:** interaction of internal Markdown scrolling with a saved slot is covered by pure placement tests only |
| UI.07 persistent source highlight and View card | 5 | 4 met, 1 partial | `FileDocMarkdown.jsx:10,92` (prose tint, code lines, diagram outline, whole-section rail), `markdown-anchor.test.mjs`, BE.13. **Partial:** an image block cannot be outlined, because planner anchors are text spans and there is no rendered-block mapping for images (OWNER-INBOX "image anchors") |
| UI.08 Chat aware of every card, next action in both places | 5 | Met | BE.10, BE.11; `NextStepPill.jsx:70` (`NextCardPill`, fixed canvas-bottom pill, `AdaptiveCanvas.jsx:6501`); Propose next step, End roadmap, finite completion |

## 4. Things that make the page crash (cross-check)

The Accept roadmap crash found after release 93 was a merge slip, not a checklist item. It is fixed, covered by `roadmap-flow-render.test.mjs` (the real hook output rendered into the canvas, the ToC and the slot card for every recorded view), and every Tutor surface is now inside a `SurfaceBoundary`. These are on the integration branch, not in this lane's diff.

## 5. What this lane built, and what it recommends

**Built:** this audit only. No code was changed, because no bullet was found wrong, unsafe or crash-prone, and every remaining partial item is either owner acceptance, a documented deferral, or needs a decision.

**Recommended, not built (each was large or ambiguous):**

1. **Queue older invitations** (UI.01 a): the status endpoint returns one invitation per board and source set, so a queue needs a server change plus a controller list. Small once the endpoint returns a list.
2. **Server-persist the conversation choice** (UI.01 b): needs a migration adding the destination thread and choice to `learn_roadmap_invitations`. Owner GO needed for a production migration.
3. **Selectable Scope in Roadmap parameters** (UI.03): add `scope` to `revise` and enable the select when a source selection exists. Backend first.
4. **Image block anchors** (UI.07): needs planner-side anchoring of image tokens and a rendered-block mapping. Do with R7 source work, not before.
5. **Distinct reconciling stage for an unknown provider outcome**: the learner is told "You were not charged", which is true (the hold is refunded); the platform-side unknown cost stays unknown in the money state. A separate stage name is a product decision.

## 6. Verification run in this lane

All local, test doubles, no browser, no paid call (counts from the 31915184f tree):

| Command (checklist 8.0.3) | Tests | Pass | Fail |
| --- | ---: | ---: | ---: |
| Source, reader, version, plan, planning, drafts | 69 | 69 | 0 |
| Routes, loop, glue, document context, generate, artifact, prompts | 88 | 88 | 0 |
| Money, store, policy, safety, withheld, sweep, events, auto | 89 | 89 | 0 |
| Chat persistence, threads, boards, canvas persistence, source refs, privacy | 68 | 68 | 0 |
| `roadmap-workflow.test.js` (BE.00 to BE.14) | 60 | 60 | 0 |
| Web roadmap, controller, auto, view, canvas, wiring, chat, outline, source-refs, settings | 198 | 198 | 0 |
| learn-artifact, learn-prompts, roadmap-plan | 52 | 52 | 0 |
| card-layout, source-refs-render | 24 | 24 | 0 |
| Web workflow, flow-render, wiring, slot-card, canvas, transcript, markdown-anchor, explanation | 88 | 88 | 0 |
| `check-map` + `schema-check` | 29 | 29 | 0 |

`npm --prefix packages/web run build`: exit 0.
