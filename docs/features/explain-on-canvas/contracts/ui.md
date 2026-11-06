# R4 contract: the UI engineer's brief

Status: DRAFT CONTRACT. Build against `fixtures/*.json` (api.md) with a fake server; no backend is needed. All component and function names below were found on main (`4102f8ea0`) unless marked NEW. Cleanup phases change several of them: section 2 lists what moves under you.

## 1. Files

| File | Status | Role |
|---|---|---|
| `packages/web/src/use-roadmap.js` | NEW | The one client hook/store: polls `GET /api/learn/roadmap`, owns `actionKey` generation (one per gesture, reused by retries), optimistic nothing (state is always the server's), `revision`, 409 recovery (replace state with `current`), the idempotent card insertion and the ack. Pure parts (reducer, key rules, Tab-ownership predicate) in `roadmap-client.js` NEW so they are unit-testable with `node --test "src/**/*.test.mjs"`. |
| `packages/web/src/NextStepPill.jsx` | NEW | The compact square pill and the "Next step ready" indicator (R4.10). Pill: zero corner radius, green Accept with its Tab key label, red Cancel separated from it by a left border, attached to the proposal; no price, estimate or maximum. |
| `packages/web/src/StepProposal.jsx` | NEW (checklist R4.10) | The private selectable proposal overlay: title, description, source relationship, the pill. A `held` or `blocked` version is never drawn as accept-ready. |
| `packages/web/src/roadmap-placement.js` | NEW (checklist R4.10) | Pure placement and idempotent insertion helpers over `inline-placement.js` / `inline-ai-apply.js`. |
| `packages/web/src/RoadmapInvitation.jsx` | NEW | The two-choice invitation as a Chat message card. Precedent for a card inside the transcript: `GenerationProposalCard` rendered at `ChatMessages.jsx:208` from `meta.proposal` (`generation-proposal-chat.js`). The invitation is NOT a signed generation proposal; do not reuse its id/expiry machinery. |
| `packages/web/src/RoadmapView.jsx` | NEW (checklist R4.04; the first draft called it `RoadmapView.jsx`) | Plan, assumptions, steps, stopping point, Accept plan, Edit plan, Propose next step, End roadmap, step statuses and navigation, Retry/Replace/Omit. Rendered inside the existing ToC next to the plain headings. |
| `packages/web/src/roadmap-client.test.mjs`, `roadmap-invitation.test.mjs`, `roadmap-view.test.mjs`, `roadmap-placement.test.mjs`, `roadmap-keyboard.test.mjs`, `roadmap-contract.test.mjs` | NEW | Unit tests (checklist R4.01, R4.04, R4.10, R4.12): the pure reducer, the invitation ordering, the view, placement, the Tab truth table, and the web import/compatibility test that re-exports the control-plane contract module without redeclaring a state string. |
| `packages/web/e2e/roadmap-command-check.mjs`, `roadmap-mvp-check.mjs` | NEW (manifest rule) | Keyless browser checks (fork tier, fake job server). The checklist names five more scripts (`roadmap-reload-check`, `roadmap-cross-device-check`, `roadmap-step-check`, `roadmap-flag-recovery-check`, `roadmap-fork-check`); recommended: they are named scenarios inside these two so the manifest's two-check rule and the check-map rows stay small (`checklist-map.md` Q2). Claude writes them; Claude does not run them (CLAUDE.md "Browser verification"); CI/owner do. |

Edits to existing files (minimal, mechanical hunks; the Lead sends the exact patch or the lane makes it under the manifest): `AdaptiveCanvas.jsx` (overlay mount + Tab handling + card insertion hook; R1 writes `AdaptiveCanvas.jsx` first, R4 rebases onto it), `LearnPage.jsx` (mount `useRoadmap`, pass props; Lead-only file), `ChatMessages.jsx` (render the invitation message kind), `TableOfContents.jsx`/`TocConversation.jsx` (roadmap section and "Edit plan" routed into the ToC conversation), `usage-analytics.js` EVENTS (D21 event `rh_roadmap_step`, see 7). Do not edit `learn-next-steps.js`/`LearnNextSteps.jsx` except the D1 suppression hook below.

## 2. Real integration points and the cleanup phases that change them

| Real component / function (main) | R4 use | Cleanup change (cleanup-v0.4 sections 3, 9) |
|---|---|---|
| `LearnPage.jsx` (`useTutor` wiring, `TocWorkspace` mount at `:2614`, `startExplain` `:1120`, `canvasApi`) | mount `useRoadmap`; pass `canvasApi`, `boardId` (`commentBoard`), mode, depth | P2 removes `useTutor`/`LearnTutor.jsx`; P4 removes `useJourney`, `tocPlan`/`planRevision` props (lines 79, 1384-1390, 2604), nanoGPT course branches; P5 removes visible/shadow grade. Rebase after each. R4 must not depend on any of those symbols. |
| `ChatMessages.jsx` (renders `GenerationProposalCard`, `:16,208`), `ChatPane.jsx`, `chat-workspace.jsx`, `chat-threads.js` | invitation card as a message kind; Retry/Replace/Omit actions in the failure message | `chat-threads.js`/`ModeSelector.jsx` default mode stays Auto; copy lines rewritten (P4) |
| `ask.jsx` (`AskPanel`, `sendStep` `:1008-1045`, `VoiceToggle`) | none directly (Chat turns are ordinary); the composer is the "typing" signal for idle detection | P2 rewires `sendStep` (a Next Steps hook click becomes an ordinary Chat turn); P4 removes `TutorPromptTray`, journey code |
| `TableOfContents.jsx`, `TocConversation.jsx` (`mt-auto` section, `data-toc-conversation`, `data-toc-composer`, `TocConversation.jsx:11-50`), `learn-outline-model.js` | roadmap section above the plain headings; "Edit plan" focuses/open the ToC composer (`setComposing(true)`) and sends the revision through `POST /revise`, not an outline op | P4 removes `outlinePlan`, `planRevisionOf`, `plan`/`planRevision`/`evidence`/`onResume` props and the per-heading evidence badges; keeps `outlineTree`, `linkedHeadings`, `proposalProblem`, outline ops, Apply/Discard. Do not reuse the `plan` prop name for the roadmap. |
| `LearnNextSteps.jsx` / `learn-next-steps.js` (`useNextSteps`, `LearnPage.jsx:108,1336`) | D1: suppress while a roadmap is active (unfinished state `proposed|active|paused|questioning`); restore when none | P1 decouples it from the old Tutor state; P2 rewires its click to plain Chat. D34: verify the click forwards the exact hook text as an ordinary turn (cleanup receipt). |
| `use-learn-coaching.jsx` (`TutorSwitch`) | The suggestions switch becomes Auto-suggest (P2 relabel); R2 owns the per-learner setting. R4 reads it only from the server (invitation suppression) | P2 |
| `ModeSelector.jsx`, `chat-route.js` | R4 reads the current mode (`auto|ask|tutor`) and reports changes via `POST /mode`; Ask never starts a roadmap (D23) | P4 / P2 |
| `AdaptiveCanvas.jsx` (`insertBlock` `:2286`, `placeExplain` `:2307`, key handler `:3728-3742` `busy`/`plain`) | proposal overlay, card insertion, Tab | R1 (feedback slot) and R3 (source chips) also edit it; one writer at a time per the manifest |
| `shortcut-owner.js` (`pageKeyAllowed`, `fieldKind`, `modalOpen`, `claimChord`) | the predicate for Tab (below) | unchanged |
| `inline-placement.js`, `inline-ai-apply.js` (`freeSpot`, `placeNote`) | placement helpers (D19) | unchanged |
| `usage-analytics.js` EVENTS table (`:35-46`) | add `rh_roadmap_step` | unchanged |

## 3. Keyboard ownership of Tab (D18)

Plain Tab accepts the pending proposal only when ALL hold, evaluated in the canvas key handler at the point where it already computes `busy`/`plain` (`AdaptiveCanvas.jsx:3735-3739`):

1. A pending proposal exists in `RoadmapView` with `acceptable: true`, it is the selected overlay, and no accept is already in flight for it (client latch by `proposal.id + version`).
2. `event.key === 'Tab'`, no Ctrl/Meta/Alt, **no Shift** (Shift+Tab keeps normal focus order), not `event.repeat`, not `event.isComposing`, `keyCode !== 229`.
3. The focus is on the page, the canvas surface, a canvas card, or the pill itself: `!busy` where `busy` is exactly the existing predicate (text fields, contenteditable, IFRAME/code editors, `typingIn`, focus inside a card widget, `[data-chat-composer],[data-toc-composer],[data-comments-panel],[data-study-pane],[data-study-work],[role="dialog"],[role="menu"]`), and `pageKeyAllowed(event)` is true (`shortcut-owner.js`: no modal open, no field).
4. No inline editor is open (`InlineAiEditor` Quick Edit is R5; in R4 the predicate still checks the shared "editor open" flag so R5 inherits it), the canvas is not `presenting`, and the board is not read-only.
5. Then: `preventDefault()`, `stopPropagation()`, send `POST /proposals/:id/accept` once. Otherwise do nothing: Tab keeps normal focus behavior, including inside the composer.

Tab in Chat or the composer, in the ToC composer, in a dialog, or while a text field has focus must move focus as usual (test each). The pill's own buttons are real `<button>`s reachable by Tab in document order when the overlay is not selected.

## 4. Proposal overlay (D8), pill, and the "Next step ready" indicator

- The pending proposal is a **private selectable overlay**, not a saved board block: never written to board `blocks`, never in `state_json`, excluded from undo, shares and forks (records.md 5). Render it from `RoadmapView.proposal` in a non-board layer anchored near the step's source passage (`sourceRelation.anchor` -> the source card, R3 helpers) or, if absent, the viewport center.
- One pending proposal at a time (server invariant; the client renders `proposal` or nothing).
- Content: title, description, format, source relationship (a plain "From <source title>" label). **No price, estimate, maximum, credits or cost text** (D24). The compact square pill reads **Accept [Tab] \| Cancel**, green/red as agreed. No ellipsis, no dead Edit placeholder (R5 adds editing); disabled controls keep their name, greyed.
- Accept/Cancel buttons use the same actions as Tab. A 409 replaces local state with the response's `current` and shows the plain sentence (`stale_revision`). A 429 `allowance_limited` shows the existing credits sentence from the response `error` field and leaves the proposal pending.
- After accept the overlay turns into the skeleton: reserve the minted slots from `results[].slot.cardId` (existing skeleton conventions: `GenerationProposalCard`/`withJob` pending cards are the precedent for a pending card placed at once; the roadmap's pending card is a skeleton block with the minted id and `status: pending`). Insert authorized blocks only from the `deliver` response (api.md 4 #13), idempotently: if a block with that id already exists on the canvas (`canvasApi.current.blocks?.()`), do not insert again; then wait for the board save, then `ack`. Reload and a second device re-run `deliver` (same blocks).
- "Next step ready" indicator: shown only when `nextStepReady` is true **and** the pending proposal is offscreen (viewport vs the overlay anchor). It is a compact control that navigates (pan/zoom to the overlay) and does nothing else: it never accepts, never calls `steps/propose`, never moves the camera on its own (D19). Propose next step lives in the ToC (`RoadmapPlan`).
- Pause/Cancel: after `status-cancelled-paused` render the roadmap as paused with the ToC offering Propose next step and End roadmap; no automatic re-proposal.
- Ask mode: when mode is Ask, hide new invitations/proposals; accepted work still shows its progress and card.

## 5. Placement rules (D19)

Place around the source/step anchor where space is free, not on a mandatory side; use the existing collision-aware helpers (`freeSpot`, `placeNote` from `inline-ai-apply.js`, used by `inline-placement.js placeResult`), existing card bounds, preserve user-moved cards. Multi-card steps (R4 ships one card per step; R12 more) use independent card ids; the learner may group them; no automatic group. No automatic camera jump. No arrows except where R3's connection helper says one clarifies the relationship. Hover-only step label derived from the actor's roadmap index (D37), never stored on the card.

## 6. Chat, ToC and states to render (from `RoadmapView`)

| State | Chat | ToC |
|---|---|---|
| invitation `offered` | two buttons: Explain on canvas / Just keep it here + free typing; dismissal affects only that invitation | none |
| `draft` | a short working status (no spinner text with "...") | roadmap section "Planning" |
| `questioning` | the single `question` with options; answering = `POST /answer`; an unrelated chat turn stays an ordinary clarification (bind to the question only when the context makes the intent clear, 2.1) | question shown |
| `limitation` | plain sentence + offers (select a passage / pick a section) | |
| `proposed` | "plan ready" message | plan, assumptions, steps, stopping point, Accept plan, Edit plan |
| `active` | step progress | steps with state; entries navigate to the proposal or delivered cards; an entry with neither is not a link |
| `paused` | | Propose next step, End roadmap |
| failed card | message with Retry, Replace, Omit (same actions as ToC; D36) | same three |
| `completed` | stopping-point message | summary; continuing needs a new request/revised scope |
| flag off (`404 roadmap_disabled`) | hide everything; R1-R3 unaffected | |

Learner strings: the list and their approval status are in `decision-records.md` section 4. Never invent text outside that list; mark unapproved copy `ponytail:` until approved.

## 7. Analytics (D21)

Add `rh_roadmap_step: ['action', 'step_state']` to the `EVENTS` allowlist in `usage-analytics.js` (`:35`), values are tokens only (`/^[a-z0-9_]{1,40}$/`, `TOKEN` at `:31`); actions `invited`, `invitation_dismissed`, `plan_accepted`, `proposal_shown`, `proposal_accepted`, `proposal_cancelled`, `card_delivered`, `card_failed`, `roadmap_ended`. No source or learner text; ids hashed by the existing `hash16`. Test that `sanitize` drops any other property.

## 8. Keyless browser fixture list

A fake roadmap server serving `fixtures/*.json` (state machine in the check, not a mock of internals). Each case is one scenario in `roadmap-command-check.mjs` (fast, fork tier) or `roadmap-mvp-check.mjs` (the R4 smoke):

1. `invitation-offered` renders two choices; dismiss -> `invitation-dismiss`; a second source later offers again.
2. `invitation-suppressed` (Auto-suggest off): nothing appears; explicit request still creates a roadmap.
3. Create from invitation -> `create-response-draft` -> `status-proposed-plan`: plan, assumptions, stopping point visible; Edit plan opens the ToC composer.
4. `status-questioning`: one question; answer; `status-limitation`: no plan, two offers.
5. Accept plan -> active; `status-active-proposal-pending`: pill shows **Accept [Tab] \| Cancel**, no price text anywhere; the page text contains none of `$`, `credits`, `cost`, `price`, model names.
6. Tab accepts only when the overlay owns the keyboard; Tab in Chat composer, ToC composer, a dialog, a text field, with Shift, with Ctrl, held repeat, while presenting: no accept request is sent (assert request count 0).
7. Accept click vs Tab racing: exactly one request; second device simulated with `error-stale-409` shows the latest state; `accept-proposal-replay` shows no duplicate card.
8. `error-insufficient-allowance`: pill stays pending, sentence from the response shown, no skeleton.
9. `accept-proposal-response-generating` -> skeleton slot with the minted card id; `result-deliver-response` -> exactly one card; reload mid-way (re-run deliver) -> still one card; `result-ack-request` sent after the board save.
10. `status-delivered-next-ready` with the overlay offscreen: indicator visible; click navigates; no accept request, no propose request, camera does not move before the click.
11. Cancel -> `status-cancelled-paused`; no auto re-proposal; Propose next step -> a new proposal.
12. `status-failed-card`: Chat message and ToC show the same Retry/Replace/Omit; each sends its own action.
13. `status-held-for-checking`: no card text, no charge text.
14. `status-completed`: stopping point; no further proposal.
15. `flag-off`: roadmap UI absent; Chat, ToC, R1-R3 features still work.
16. Shared/read-only view: no roadmap UI, no overlay, no feedback of the owner.
17. Ask mode: no new invitation or proposal; an in-flight accepted card still lands.
18. Keyboard accessibility: pill buttons focusable, visible focus ring, labels; hover-only affordances reachable by keyboard (no ring-2 in focus styles, memory "card-selection-checkpoint").

Keep the unit side in `roadmap-client.test.mjs` and the five suites above: reducer transitions from fixtures, Tab predicate truth table (the matrix in section 3), `actionKey` stability across retries, 409 recovery, idempotent insertion, no-price assertion on rendered strings.
